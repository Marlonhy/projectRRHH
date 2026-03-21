import { Request, Response } from 'express';
import { getDB } from '../config/database';

/**
 * RRHHController
 * Controlador maestro para la gestión de personal, estadísticas globales y auditoría de ausencias.
 * Permite que los usuarios con rol 'rrhh' administradores gestionen la invisibilidad de cargos directivos
 * y realicen ajustes manuales de saldos de vacaciones.
 */
export class RRHHController {
  /**
   * Obtiene el listado completo de colaboradores activos y sus saldos.
   * Aplica un filtro de invisibilidad para el rol 'admin' si el solicitante no es administrador.
   */
  static getAllWorkers(req: Request, res: Response): void {
    try {
      const { documento } = req.query;
      const db = getDB();
      const currentYear = new Date().getFullYear();

      let query = `
        SELECT 
          u.id, u.email, u.nombre, u.apellido, u.cargo, u.rol, u.fecha_ingreso, u.activo, u.documento,
          d.nombre as director_nombre, d.email as director_email
        FROM Usuarios u
        LEFT JOIN Usuarios d ON u.director_id = d.id
        WHERE (u.rol != 'admin' OR ? = 'admin')
      `;
      
      const params: any[] = [req.role];

      if (documento) {
        query += ` AND u.documento LIKE ?`;
        params.push(`%${documento}%`);
      }

      query += ` ORDER BY u.nombre`;

      const workers = db.prepare(query).all(...params) as any[];

      // Inyectar balance dinámico para cada colaborador
      // Nota: Esto asegura que anulaciones y recalculos anuales se vean en el panel RRHH
      const { PermissionController } = require('./permissionController');
      
      const workersWithBalance = workers.map(w => {
        const balance = PermissionController.calculateDynamicBalance(db, w.id);
        return { ...w, ...balance };
      });

      res.status(200).json(workersWithBalance);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al obtener colaboradores' });
    }
  }

  // Obtener historial de permisos de un colaborador
  static getWorkerHistory(req: Request, res: Response): void {
    try {
      const { workerId } = req.params;
      const db = getDB();

      const history = db.prepare(`
        SELECT 
          sp.id,
          sp.fecha_salida,
          sp.fecha_regreso,
          sp.tipo_permiso,
          sp.estado,
          sp.observacion,
          sp.dias_solicitados,
          sp.fecha_solicitud,
          sp.razon_rechazo,
          sp.fecha_aprobacion,
          d.nombre as director_nombre,
          d.email as director_email,
          ap.nombre as aprobado_por_nombre
        FROM SolicitudesPermisos sp
        LEFT JOIN Usuarios d ON sp.director_id = d.id
        LEFT JOIN Usuarios ap ON sp.aprobado_por = ap.id
        WHERE sp.usuario_id = ?
        ORDER BY sp.fecha_solicitud DESC
      `).all(workerId);

      res.status(200).json(history);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al obtener historial' });
    }
  }

  /**
   * Obtiene todos los permisos y ausencias registradas en el sistema.
   * Une 'SolicitudesPermisos' y 'HistorialAusencias' en una vista unificada.
   * Aplica un filtro de seguridad en la consulta para ocultar administradores si quien consulta es RRHH.
   * 
   * @param req Petición HTTP conteniendo filtros de estado y tipo.
   */
  static getAllPermissions(req: Request, res: Response): void {
    try {
      const { estado, tipo } = req.query;
      const db = getDB();

      let query = `
        SELECT * FROM (
          SELECT 
            sp.id, sp.usuario_id, sp.fecha_salida, sp.fecha_regreso, sp.tipo_permiso, 
            sp.observacion, sp.estado, sp.dias_solicitados, sp.fecha_solicitud,
            sp.razon_rechazo, sp.fecha_aprobacion,
            u.nombre as colaborador_nombre, u.apellido as colaborador_apellido, u.email as colaborador_email, u.rol, u.cargo,
            d.nombre as director_nombre, d.apellido as director_apellido
          FROM SolicitudesPermisos sp
          JOIN Usuarios u ON sp.usuario_id = u.id
          LEFT JOIN Usuarios d ON sp.director_id = d.id
          WHERE (u.rol != 'admin' OR ? = 'admin')
        UNION ALL
          SELECT 
            h.id, h.usuario_id, h.fecha_inicio as fecha_salida, h.fecha_fin as fecha_regreso, h.tipo as tipo_permiso,
            h.razon as observacion, 'aprobado' as estado, h.dias_utilizados as dias_solicitados, h.fecha_creacion as fecha_solicitud,
            NULL as razon_rechazo, h.fecha_creacion as fecha_aprobacion,
            u.nombre as colaborador_nombre, u.apellido as colaborador_apellido, u.email as colaborador_email, u.rol, u.cargo,
            'RRHH' as director_nombre, '(Manual)' as director_apellido
          FROM HistorialAusencias h
          JOIN Usuarios u ON h.usuario_id = u.id
          WHERE (u.rol != 'admin' OR ? = 'admin')
        ) as total
        WHERE 1=1
      `;

      const params: any[] = [req.role, req.role];

      if (estado) {
        query += ` AND estado = ?`;
        params.push(estado);
      }
      if (tipo) {
        query += ` AND tipo_permiso = ?`;
        params.push(tipo);
      }

      query += ` ORDER BY fecha_solicitud DESC`;

      const permisos = db.prepare(query).all(...params);
      res.status(200).json(permisos);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al obtener permisos' });
    }
  }

  /**
   * Actualiza el saldo manual de días disponibles o acumulados de un colaborador.
   * Para evitar sobrescribir el historial real de solicitudes del usuario, el sistema calcula
   * matemáticamente la diferencia ("offset") entre el número total que dictó RRHH en pantalla y el 
   * acumulado que lleva el sistema, guardando únicamente este offset manual.
   */
  static assignDays(req: Request, res: Response): void {
    try {
      const { workerId, dias_disponibles, dias_libres, dias_sabados, dias_calamidad, dias_incapacidad, dias_cita_medica, dias_licencia } = req.body;

      if (!workerId) {
        res.status(400).json({ error: 'workerId es requerido' });
        return;
      }

      const ano = new Date().getFullYear();
      const db = getDB();

      const { PermissionController } = require('./permissionController');
      const currentStats = PermissionController.calculateDynamicBalance(db, workerId);
      const saldoManual = (db.prepare(`SELECT * FROM PermisosDisponibles WHERE usuario_id = ? AND ano = ?`).get(workerId, ano) || {}) as any;

      const calcOffset = (desired: number | undefined, current_total: number, current_offset: number) => {
          if (desired === undefined || desired === null) return current_offset || 0;
          const base = current_total - (current_offset || 0);
          return desired - base;
      };

      const vacaciones_manual = calcOffset(dias_disponibles, currentStats.dias_disponibles, saldoManual.vacaciones_manual);
      const calamidad_manual = calcOffset(dias_calamidad, currentStats.dias_calamidad, saldoManual.calamidad_manual);
      const incapacidad_manual = calcOffset(dias_incapacidad, currentStats.dias_incapacidad, saldoManual.incapacidad_manual);
      const cita_medica_manual = calcOffset(dias_cita_medica, currentStats.dias_cita_medica, saldoManual.cita_medica_manual);
      const licencia_manual = calcOffset(dias_licencia, currentStats.dias_licencia, saldoManual.licencia_manual);

      db.prepare(`
        INSERT INTO PermisosDisponibles (
          usuario_id, dias_disponibles, dias_libres, dias_sabados, 
          vacaciones_manual, calamidad_manual, incapacidad_manual, cita_medica_manual, licencia_manual, ano
        )
        VALUES (?, 15, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(usuario_id, ano) DO UPDATE SET 
          dias_libres = excluded.dias_libres,
          dias_sabados = excluded.dias_sabados,
          vacaciones_manual = excluded.vacaciones_manual,
          calamidad_manual = excluded.calamidad_manual,
          incapacidad_manual = excluded.incapacidad_manual,
          cita_medica_manual = excluded.cita_medica_manual,
          licencia_manual = excluded.licencia_manual,
          fecha_actualizacion = datetime('now')
      `).run(
        workerId, 
        dias_libres ?? currentStats.dias_libres, 
        dias_sabados ?? currentStats.dias_sabados, 
        vacaciones_manual, calamidad_manual, incapacidad_manual, cita_medica_manual, licencia_manual, ano
      );

      res.status(200).json({ message: 'Días actualizados exitosamente' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al actualizar días' });
    }
  }

  // Registrar ausencia manual
  static registerAbsence(req: Request, res: Response): void {
    try {
      const { workerId, tipo, fecha_inicio, fecha_fin, razon, dias_utilizados } = req.body;
      const registradoPor = req.userId;

      if (!workerId || !tipo || !fecha_inicio || !fecha_fin) {
        res.status(400).json({ error: 'workerId, tipo, fecha_inicio y fecha_fin son requeridos' });
        return;
      }

      const db = getDB();

      db.prepare(`
        INSERT INTO HistorialAusencias
        (usuario_id, tipo, fecha_inicio, fecha_fin, razon, dias_utilizados, registrado_por)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(workerId, tipo, fecha_inicio, fecha_fin, razon || null, dias_utilizados || 1, registradoPor);

      res.status(201).json({ message: 'Ausencia registrada exitosamente' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al registrar ausencia' });
    }
  }

  // Estadísticas generales
  static getStatistics(req: Request, res: Response): void {
    try {
      const db = getDB();
      const currentYear = new Date().getFullYear();

      const total_trabajadores = (db.prepare(`SELECT COUNT(*) as c FROM Usuarios WHERE activo = 1 AND (rol != 'admin' OR ? = 'admin')`).get(req.role) as any).c;
      const permisos_pendientes = (db.prepare(`
        SELECT COUNT(*) as c FROM SolicitudesPermisos sp 
        JOIN Usuarios u ON sp.usuario_id = u.id 
        WHERE sp.estado = 'pendiente' AND (u.rol != 'admin' OR ? = 'admin')
      `).get(req.role) as any).c;
      const permisos_aprobados_ano = (db.prepare(`
        SELECT COUNT(*) as c FROM SolicitudesPermisos sp 
        JOIN Usuarios u ON sp.usuario_id = u.id 
        WHERE sp.estado = 'aprobado' AND strftime('%Y', sp.fecha_solicitud) = ? AND (u.rol != 'admin' OR ? = 'admin')
      `).get(String(currentYear), req.role) as any).c;
      const permisos_rechazados_ano = (db.prepare(`
        SELECT COUNT(*) as c FROM SolicitudesPermisos sp 
        JOIN Usuarios u ON sp.usuario_id = u.id 
        WHERE sp.estado = 'rechazado' AND strftime('%Y', sp.fecha_solicitud) = ? AND (u.rol != 'admin' OR ? = 'admin')
      `).get(String(currentYear), req.role) as any).c;
      const total_usuarios = (db.prepare(`SELECT COUNT(*) as c FROM Usuarios WHERE (rol != 'admin' OR ? = 'admin')`).get(req.role) as any).c;

      res.status(200).json({
        total_trabajadores,
        permisos_pendientes,
        permisos_aprobados_ano,
        permisos_rechazados_ano,
        total_usuarios,
        ano_actual: currentYear,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
  }

  // Crear usuario desde RRHH (con rol específico)
  static async createUser(req: Request, res: Response): Promise<void> {
    try {
      const { email: rawEmail, password, nombre, apellido, rol, director_id, cargo, fecha_ingreso, documento } = req.body;
      const email = rawEmail?.toLowerCase();

      if (!email || !password || !nombre || !apellido || !rol || !fecha_ingreso) {
        res.status(400).json({ error: 'Faltan datos requeridos' });
        return;
      }

      if (req.role === 'rrhh' && (rol === 'admin' || rol === 'rrhh')) {
        res.status(403).json({ error: 'No tienes permisos para crear o escalar roles de administración máxima' });
        return;
      }

      const { hashPassword } = await import('../utils/auth');
      const db = getDB();

      const existingEmail = db.prepare('SELECT id FROM Usuarios WHERE email = ?').get(email);
      if (existingEmail) {
        res.status(400).json({ error: 'El email ya está registrado' });
        return;
      }

      if (documento) {
        const existingDoc = db.prepare('SELECT id FROM Usuarios WHERE documento = ?').get(documento);
        if (existingDoc) {
          res.status(400).json({ error: 'La cédula/documento ya está registrado' });
          return;
        }
      }

      const hashedPassword = await hashPassword(password);

      let finalDirectorId = director_id || null;
      if (rol === 'director') {
        const gerente = db.prepare('SELECT id FROM Usuarios WHERE rol = ? AND activo = 1 LIMIT 1').get('gerente') as any;
        finalDirectorId = gerente ? gerente.id : null;
      }

      const result = db.prepare(`
        INSERT INTO Usuarios (email, password, nombre, apellido, rol, director_id, cargo, fecha_ingreso, documento)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(email, hashedPassword, nombre, apellido, rol, finalDirectorId, cargo || null, fecha_ingreso, documento || null);

      const userId = result.lastInsertRowid;
      const currentYear = new Date().getFullYear();

      // Cálculo matemático de los días de vacaciones ganados (15 días por cada 360 días laborados)
      const fechaIngresoObj = new Date(fecha_ingreso + 'T12:00:00');
      const timeDiffMs = new Date().getTime() - fechaIngresoObj.getTime();
      let diasTrabajados = Math.floor(timeDiffMs / (1000 * 3600 * 24));
      if (diasTrabajados < 0) diasTrabajados = 0;
      let diasCalculados = Math.floor((diasTrabajados * 15) / 360);

      db.prepare(`
        INSERT OR IGNORE INTO PermisosDisponibles (usuario_id, dias_disponibles, dias_libres, ano)
        VALUES (?, ?, ?, ?)
      `).run(userId, diasCalculados, 0, currentYear);

      res.status(201).json({ message: 'Usuario creado exitosamente', userId });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al crear usuario' });
    }
  }

  // Obtener historial de ausencias (solo las generadas por RRHH actual o admin ve todo)
  static getAllAbsences(req: Request, res: Response): void {
    try {
      const db = getDB();
      const isAdmin = req.role === 'admin';
      
      const ausencias = db.prepare(`
        SELECT 
          h.id, h.usuario_id, h.tipo, h.dias_utilizados, h.fecha_inicio, 
          h.fecha_fin, h.razon, h.fecha_creacion,
          u.nombre, u.apellido, u.rol,
          r.nombre as registrado_nombre, r.apellido as registrado_apellido
        FROM HistorialAusencias h
        JOIN Usuarios u ON h.usuario_id = u.id
        LEFT JOIN Usuarios r ON h.registrado_por = r.id
        WHERE (u.rol != 'admin' OR ? = 'admin')
        AND (h.registrado_por = ? OR ? = 'admin') -- RRHH solo ve las que generó el mismo
        ORDER BY h.fecha_creacion DESC
      `).all(req.role, req.userId, req.role);

      res.status(200).json(ausencias);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al obtener historial de ausencias' });
    }
  }

  // Eliminar un colaborador
  static deleteWorker(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const db = getDB();

      // Verificar si el usuario a eliminar existe
      const user = db.prepare('SELECT id, rol FROM Usuarios WHERE id = ?').get(id) as any;
      if (!user) {
        res.status(404).json({ error: 'Usuario no encontrado' });
        return;
      }

      if (req.role === 'rrhh' && user.rol === 'admin') {
        res.status(403).json({ error: 'El personal de RRHH no tiene permisos jerárquicos para borrar o inhabilitar Sistemas Súper Administrador' });
        return;
      }

      // Evitar que el admin se borre a sí mismo (opcional, pero buena práctica) si es el mismo usuario de la sesión
      if (req.userId === Number(id)) {
        res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
        return;
      }

      // Desvincular como director de otros colaboradores y permisos
      db.prepare('UPDATE Usuarios SET director_id = NULL WHERE director_id = ?').run(id);
      db.prepare('UPDATE SolicitudesPermisos SET director_id = NULL WHERE director_id = ?').run(id);
      db.prepare('UPDATE SolicitudesPermisos SET aprobado_por = NULL WHERE aprobado_por = ?').run(id);
      db.prepare('UPDATE HistorialAusencias SET registrado_por = NULL WHERE registrado_por = ?').run(id);

      // Borrar usuario (Las DB con Foreign Keys ON DELETE CASCADE borrarían lo demás, pero como es SQLite por defecto hay que asegurarse o dejar que haya huérfanos si no afecta)
      db.prepare('DELETE FROM PermisosDisponibles WHERE usuario_id = ?').run(id);
      db.prepare('DELETE FROM SolicitudesPermisos WHERE usuario_id = ?').run(id);
      db.prepare('DELETE FROM HistorialAusencias WHERE usuario_id = ?').run(id);
      db.prepare('DELETE FROM Usuarios WHERE id = ?').run(id);

      res.status(200).json({ message: 'Usuario eliminado exitosamente' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al eliminar usuario' });
    }
  }

  /**
   * Anular un permiso aprobado (Panel RRHH/Admin)
   */
  static voidPermission(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const db = getDB();

      const permiso = db.prepare('SELECT id, estado FROM SolicitudesPermisos WHERE id = ?').get(id) as any;
      if (!permiso) {
        res.status(404).json({ error: 'Permiso no encontrado' });
        return;
      }

      if (permiso.estado !== 'aprobado') {
        res.status(400).json({ error: 'Solo se pueden anular permisos que ya estén aprobados' });
        return;
      }

      db.prepare(`
        UPDATE SolicitudesPermisos 
        SET estado = 'rechazado', razon_rechazo = 'Anulación Administrativa (RRHH)' 
        WHERE id = ?
      `).run(id);

      res.status(200).json({ message: 'Permiso anulado correctamente' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al anular permiso' });
    }
  }

  // Inactivar/Activar un colaborador (Soft Toggle)
  static toggleUserStatus(req: Request, res: Response): void {
    try {
      const { id } = req.params;
      const db = getDB();

      // Verificar si el usuario a modificar existe
      const user = db.prepare('SELECT id, rol, activo FROM Usuarios WHERE id = ?').get(id) as any;
      if (!user) {
        res.status(404).json({ error: 'Usuario no encontrado' });
        return;
      }

      if (req.role === 'rrhh' && user.rol === 'admin') {
        res.status(403).json({ error: 'No tienes permisos para modificar el estado de un administrador' });
        return;
      }

      const nuevoEstado = user.activo === 1 ? 0 : 1;
      db.prepare('UPDATE Usuarios SET activo = ? WHERE id = ?').run(nuevoEstado, id);

      res.status(200).json({ 
        message: `Usuario ${nuevoEstado === 1 ? 'activado' : 'inactivado'} exitosamente`, 
        activo: nuevoEstado 
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al cambiar el estado del usuario' });
    }
  }

  // Actualizar perfil completo de un colaborador (Admin/RRHH)
  static async updateWorker(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { email, password, nombre, apellido, rol, director_id, cargo, fecha_ingreso, documento } = req.body;
      const db = getDB();

      // Verificar si el usuario existe
      const targetUser = db.prepare('SELECT id, rol FROM Usuarios WHERE id = ?').get(id) as any;
      if (!targetUser) {
        res.status(404).json({ error: 'Usuario no encontrado' });
        return;
      }

      // Restricción: RRHH no puede cambiar datos de Admin
      if (req.role === 'rrhh' && targetUser.rol === 'admin') {
        res.status(403).json({ error: 'No tienes permisos para modificar a un Súper Administrador' });
        return;
      }

      // Preparar campos a actualizar
      let query = 'UPDATE Usuarios SET email = ?, nombre = ?, apellido = ?, rol = ?, director_id = ?, cargo = ?, fecha_ingreso = ?, documento = ?';
      const params: any[] = [email, nombre, apellido, rol, director_id || null, cargo || null, fecha_ingreso, documento || null];

      // Si hay nueva contraseña, hashearla y añadirla
      if (password && password.trim() !== '') {
        const bcrypt = require('bcryptjs');
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(password, salt);
        query += ', password = ?';
        params.push(hash);
      }

      query += ' WHERE id = ?';
      params.push(id);

      db.prepare(query).run(...params);

      res.status(200).json({ message: 'Perfil de usuario actualizado correctamente' });
    } catch (error: any) {
      console.error(error);
      if (error.message.includes('UNIQUE constraint failed')) {
        res.status(400).json({ error: 'El email ya está en uso por otro usuario' });
        return;
      }
      res.status(500).json({ error: 'Error al actualizar perfil de usuario' });
    }
  }
}

export default RRHHController;
