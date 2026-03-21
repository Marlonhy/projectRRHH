/**
 * @file authController.ts
 * @description Controlador dedicado a la Autenticación de Usuarios.
 * Encripta contraseñas con bcryptjs, y despacha JsonWebTokens (JWT) para mantener sesiones seguras.
 * Encripta contraseñas con bcryptjs, y despacha JsonWebTokens (JWT) para mantener sesiones seguras.
 * Provee la lista de 'directores' activos para el formulario de registro de colaboradores.
 */
import { Request, Response } from 'express';
import { getDB } from '../config/database';
import { hashPassword, comparePasswords, generateToken } from '../utils/auth';

export class AuthController {
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const { email: rawEmail, password, nombre, apellido, fecha_ingreso, rol, director_id, cargo, documento } = req.body;
      const email = rawEmail?.toLowerCase();

      if (!email || !password || !nombre || !apellido || !fecha_ingreso) {
        res.status(400).json({ error: 'Faltan datos requeridos: email, password, nombre, apellido, fecha_ingreso' });
        return;
      }

      const db = getDB();
      const hashedPassword = await hashPassword(password);
      const userRol = rol || 'colaborador';

      // Verificar si ya existe el email
      const existingUser = db.prepare('SELECT id FROM Usuarios WHERE email = ?').get(email);
      if (existingUser) {
        res.status(400).json({ error: 'El email ya está registrado' });
        return;
      }

      const insertUser = db.prepare(`
        INSERT INTO Usuarios (email, password, nombre, apellido, rol, director_id, cargo, fecha_ingreso, documento)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let finalDirectorId = director_id || null;
      if (userRol === 'director') {
        const gerente = db.prepare('SELECT id FROM Usuarios WHERE rol = ? AND activo = 1 LIMIT 1').get('gerente') as any;
        finalDirectorId = gerente ? gerente.id : null;
      }

      const result = insertUser.run(
        email, hashedPassword, nombre, apellido, userRol,
        finalDirectorId, cargo || null, fecha_ingreso, documento || null
      );

      const userId = result.lastInsertRowid;

      // Asignar días disponibles para el año actual
      const currentYear = new Date().getFullYear();
      db.prepare(`
        INSERT OR IGNORE INTO PermisosDisponibles (usuario_id, dias_disponibles, ano)
        VALUES (?, 15, ?)
      `).run(userId, currentYear);

      res.status(201).json({ message: 'Usuario registrado exitosamente', userId });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: 'Error al registrar usuario' });
    }
  }

  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email: rawEmail, password } = req.body;
      const email = rawEmail?.toLowerCase();

      if (!email || !password) {
        res.status(400).json({ error: 'Email y contraseña requeridos' });
        return;
      }

      const db = getDB();
      const user = db.prepare('SELECT * FROM Usuarios WHERE email = ? AND activo = 1').get(email) as any;

      if (!user) {
        res.status(401).json({ error: 'Credenciales inválidas' });
        return;
      }

      const isValidPassword = await comparePasswords(password, user.password);
      if (!isValidPassword) {
        res.status(401).json({ error: 'Credenciales inválidas' });
        return;
      }

      const token = generateToken(user.id, user.email, user.rol);

      res.status(200).json({
        token,
        user: {
          id: user.id,
          email: user.email,
          nombre: user.nombre,
          apellido: user.apellido,
          rol: user.rol,
          director_id: user.director_id,
          cargo: user.cargo,
          fecha_ingreso: user.fecha_ingreso,
          documento: user.documento,
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al iniciar sesión' });
    }
  }

  static async getProfile(req: Request, res: Response): Promise<void> {
    try {
      const db = getDB();
      const user = db.prepare(`
        SELECT u.id, u.email, u.nombre, u.apellido, u.rol, u.cargo, u.fecha_ingreso, u.documento,
               d.nombre as director_nombre, d.email as director_email
        FROM Usuarios u
        LEFT JOIN Usuarios d ON u.director_id = d.id
        WHERE u.id = ?
      `).get(req.userId) as any;

      if (!user) {
        res.status(404).json({ error: 'Usuario no encontrado' });
        return;
      }

      // Obtener días disponibles del año actual
      const currentYear = new Date().getFullYear();
      const diasDisponibles = db.prepare(`
        SELECT dias_disponibles FROM PermisosDisponibles 
        WHERE usuario_id = ? AND ano = ?
      `).get(req.userId, currentYear) as any;

      res.status(200).json({
        ...user,
        dias_disponibles: diasDisponibles?.dias_disponibles ?? 0,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al obtener perfil' });
    }
  }

  static async changePassword(req: Request, res: Response): Promise<void> {
    try {
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        res.status(400).json({ error: 'Contraseña actual y nueva requeridas' });
        return;
      }

      const db = getDB();
      const user = db.prepare('SELECT password FROM Usuarios WHERE id = ?').get(req.userId) as any;

      const isValid = await comparePasswords(currentPassword, user.password);
      if (!isValid) {
        res.status(401).json({ error: 'Contraseña actual incorrecta' });
        return;
      }

      const hashedPassword = await hashPassword(newPassword);
      db.prepare('UPDATE Usuarios SET password = ? WHERE id = ?').run(hashedPassword, req.userId);

      res.status(200).json({ message: 'Contraseña actualizada exitosamente' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al cambiar contraseña' });
    }
  }

  // Obtener lista de directores (para asignar al registrar colaborador)
  static async getDirectores(req: Request, res: Response): Promise<void> {
    try {
      const db = getDB();
      const directores = db.prepare(`
        SELECT id, nombre, apellido, email, cargo, rol
        FROM Usuarios 
        WHERE rol IN ('director', 'gerente', 'admin', 'rrhh') AND activo = 1
        ORDER BY nombre
      `).all();
      res.status(200).json(directores);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al obtener directores' });
    }
  }
}

export default AuthController;
