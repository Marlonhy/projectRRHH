import { getDB } from '../config/database';

/**
 * Definición del Esquema de la Base de Datos
 * Automatiza la creación de tablas (Usuarios, Solicitudes, Historial, etc.)
 * y gestiona las relaciones mediante Llaves Foráneas.
 */
export class Database {
  static createTables(): void {
    const db = getDB();

    // Tabla de usuarios
    db.exec(`
      CREATE TABLE IF NOT EXISTS Usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        nombre TEXT NOT NULL,
        apellido TEXT NOT NULL,
        rol TEXT NOT NULL CHECK (rol IN ('colaborador', 'director', 'gerente', 'rrhh', 'admin')),
        director_id INTEGER NULL,
        documento TEXT NULL UNIQUE,
        cargo TEXT,
        activo INTEGER DEFAULT 1,
        fecha_ingreso TEXT NOT NULL,
        fecha_creacion TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (director_id) REFERENCES Usuarios(id) ON DELETE SET NULL
      )
    `);

    // Tabla de permisos disponibles
    db.exec(`
      CREATE TABLE IF NOT EXISTS PermisosDisponibles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        dias_disponibles INTEGER DEFAULT 15,
        dias_libres INTEGER DEFAULT 0,
        ano INTEGER NOT NULL,
        fecha_asignacion TEXT DEFAULT (date('now')),
        fecha_actualizacion TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE CASCADE,
        UNIQUE(usuario_id, ano)
      )
    `);

    // Tabla de solicitudes de permisos
    db.exec(`
      CREATE TABLE IF NOT EXISTS SolicitudesPermisos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        director_id INTEGER NULL,
        fecha_salida TEXT NOT NULL,
        fecha_regreso TEXT NOT NULL,
        tipo_permiso TEXT NOT NULL CHECK (tipo_permiso IN ('vacaciones', 'dia_libre', 'calamidad', 'ausencia', 'licencia_no_remunerada', 'incapacidad', 'cita_medica')),
        observacion TEXT,
        soporte TEXT NULL,
        estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobado', 'rechazado')),
        razon_rechazo TEXT,
        dias_solicitados INTEGER,
        aprobado_gerente INTEGER DEFAULT 0,
        fecha_solicitud TEXT DEFAULT (datetime('now')),
        fecha_aprobacion TEXT NULL,
        aprobado_por INTEGER NULL,
        fecha_creacion TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE CASCADE,
        FOREIGN KEY (director_id) REFERENCES Usuarios(id) ON DELETE SET NULL,
        FOREIGN KEY (aprobado_por) REFERENCES Usuarios(id) ON DELETE SET NULL
      )
    `);

    // Tabla de historial de ausencias
    db.exec(`
      CREATE TABLE IF NOT EXISTS HistorialAusencias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        tipo TEXT NOT NULL CHECK (tipo IN ('ausencia', 'vacacion', 'dia_libre', 'calamidad', 'licencia_no_remunerada', 'incapacidad', 'cita_medica')),
        dias_utilizados INTEGER,
        fecha_inicio TEXT NOT NULL,
        fecha_fin TEXT NOT NULL,
        razon TEXT,
        registrado_por INTEGER NULL,
        fecha_creacion TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (usuario_id) REFERENCES Usuarios(id) ON DELETE CASCADE,
        FOREIGN KEY (registrado_por) REFERENCES Usuarios(id) ON DELETE SET NULL
      )
    `);

    // Migraciones automáticas para bases de datos existentes

    // ── MIGRACIÓN CRÍTICA: Recrear tabla Usuarios si el CHECK constraint está desactualizado ──
    // SQLite no permite modificar CHECK constraints con ALTER TABLE, por eso usamos
    // el patrón rename → create → copy → drop para actualizar el constraint de rol.
    try {
      const tableDef = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='Usuarios'").get() as any)?.sql || '';
      const needsMigration = tableDef.includes("'trabajador'") || tableDef.includes("'jefe'") || !tableDef.includes("'colaborador'");
      if (needsMigration) {
        console.log('🔄 Migrando tabla Usuarios (CHECK constraint desactualizado)...');
        db.exec("PRAGMA foreign_keys = OFF");
        db.exec("ALTER TABLE Usuarios RENAME TO Usuarios_old");
        db.exec(`
          CREATE TABLE Usuarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            nombre TEXT NOT NULL,
            apellido TEXT NOT NULL,
            rol TEXT NOT NULL CHECK (rol IN ('colaborador', 'director', 'gerente', 'rrhh', 'admin')),
            director_id INTEGER NULL,
            documento TEXT NULL,
            cargo TEXT,
            activo INTEGER DEFAULT 1,
            fecha_ingreso TEXT NOT NULL,
            fecha_creacion TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (director_id) REFERENCES Usuarios(id) ON DELETE SET NULL
          )
        `);
        // Copiar datos actualizando roles viejos
        // Detectar qué columna de FK existe en la tabla vieja: jefe_id o director_id
        const cols = (db.prepare("PRAGMA table_info(Usuarios_old)").all() as any[]).map((c: any) => c.name);
        const jefeCol = cols.includes('jefe_id') ? 'jefe_id' : (cols.includes('director_id') ? 'director_id' : 'NULL');
        const docCol = cols.includes('documento') ? 'documento' : 'NULL';
        db.exec(`
          INSERT INTO Usuarios (id, email, password, nombre, apellido, rol, director_id, documento, cargo, activo, fecha_ingreso, fecha_creacion)
          SELECT 
            id, email, password, nombre, apellido,
            CASE 
              WHEN rol = 'trabajador' THEN 'colaborador'
              WHEN rol = 'jefe' THEN 'director'
              ELSE rol
            END,
            ${jefeCol},
            ${docCol}, cargo, activo, fecha_ingreso, fecha_creacion
          FROM Usuarios_old
        `);
        db.exec("DROP TABLE Usuarios_old");
        db.exec("PRAGMA foreign_keys = ON");
        console.log('✅ Tabla Usuarios migrada al nuevo esquema');
      }
    } catch (e: any) {
      console.error('⚠️ Error en migración de Usuarios (no crítico si ya está actualizado):', e?.message);
      try { db.exec("PRAGMA foreign_keys = ON"); } catch (_) { }
    }

    try {
      // Agregar columna documento a Usuarios (si no existe aún)
      db.exec("ALTER TABLE Usuarios ADD COLUMN documento TEXT NULL");
    } catch (e) { }
    try {
      // Renombrar jefe_id a director_id en Usuarios (SQLite 3.25.0+)
      db.exec("ALTER TABLE Usuarios RENAME COLUMN jefe_id TO director_id");
    } catch (e) { }
    try {
      // Agregar soporte a SolicitudesPermisos
      db.exec("ALTER TABLE SolicitudesPermisos ADD COLUMN soporte TEXT NULL");
    } catch (e) { }
    try {
      // Agregar aprobado_gerente a SolicitudesPermisos
      db.exec("ALTER TABLE SolicitudesPermisos ADD COLUMN aprobado_gerente INTEGER DEFAULT 0");
    } catch (e) { }
    try {
      // Renombrar jefe_id a director_id en SolicitudesPermisos
      db.exec("ALTER TABLE SolicitudesPermisos RENAME COLUMN jefe_id TO director_id");
    } catch (e) { }
    try {
      // Agregar columna dias_sabados a PermisosDisponibles
      db.exec("ALTER TABLE PermisosDisponibles ADD COLUMN dias_sabados INTEGER DEFAULT 0");
    } catch (e) { }
    try {
      // Agregar columnas manuales para ajustes de RRHH
      db.exec("ALTER TABLE PermisosDisponibles ADD COLUMN vacaciones_manual INTEGER DEFAULT 0");
      db.exec("ALTER TABLE PermisosDisponibles ADD COLUMN calamidad_manual INTEGER DEFAULT 0");
      db.exec("ALTER TABLE PermisosDisponibles ADD COLUMN incapacidad_manual INTEGER DEFAULT 0");
      db.exec("ALTER TABLE PermisosDisponibles ADD COLUMN cita_medica_manual INTEGER DEFAULT 0");
      db.exec("ALTER TABLE PermisosDisponibles ADD COLUMN licencia_manual INTEGER DEFAULT 0");
    } catch (e) { }


    console.log('✅ Tablas creadas/verificadas exitosamente');

    // Mantenimiento de cuenta RRHH principal (empezar de 0)
    const checkUser = db.prepare("SELECT id FROM Usuarios WHERE email = 'alexandra.hernandez@viajarltda.com'").get();
    if (!checkUser) {
      const bcrypt = require('bcryptjs');
      const password = 'Viajar2026*';
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(password, salt);

      const insert = db.prepare(`
        INSERT INTO Usuarios (email, password, nombre, apellido, rol, cargo, fecha_ingreso)
        VALUES (?, ?, 'Alexandra', 'Hernández', 'rrhh', 'Recursos Humanos', date('now'))
      `).run('alexandra.hernandez@viajarltda.com', hash);

      db.prepare(`
        INSERT INTO PermisosDisponibles (usuario_id, dias_disponibles, dias_libres, ano)
        VALUES (?, 15, 0, ?)
      `).run(insert.lastInsertRowid, new Date().getFullYear());

      console.log('✅ Cuenta primaria RRHH generada por defecto');
    }

    // Mantenimiento de cuenta Admin principal
    const checkAdmin = db.prepare("SELECT id FROM Usuarios WHERE rol = 'admin'").get();
    if (!checkAdmin) {
      const bcrypt = require('bcryptjs');
      const password = 'admin'; // Contraseña por defecto
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(password, salt);

      const insert = db.prepare(`
        INSERT INTO Usuarios (email, password, nombre, apellido, rol, cargo, fecha_ingreso)
        VALUES (?, ?, 'Super', 'Admin', 'admin', 'Administrador del Sistema', date('now'))
      `).run('admin', hash);

      db.prepare(`
        INSERT INTO PermisosDisponibles (usuario_id, dias_disponibles, dias_libres, ano)
        VALUES (?, 15, 0, ?)
      `).run(insert.lastInsertRowid, new Date().getFullYear());

      console.log('✅ Cuenta primaria Admin generada por defecto (admin / admin)');
    }
  }
}

export default Database;
