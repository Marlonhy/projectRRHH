import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/**
 * Configuración y Conexión de la Base de Datos SQLite
 * Utiliza better-sqlite3 para una gestión síncrona y eficiente de la persistencia locales.
 */
const DB_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'rrhh_permisos.db');

// Garantizar que la carpeta de datos exista
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

let db: Database.Database;

/**
 * Establece la conexión inicial con la base de datos y configura pragmas de rendimiento.
 */
export const connectDB = (): Database.Database => {
  if (db) return db;
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  console.log('✅ Conectado a SQLite exitosamente');
  console.log(`📁 Base de datos: ${DB_PATH}`);
  return db;
};

export const getDB = (): Database.Database => {
  if (!db) {
    return connectDB();
  }
  return db;
};

export default { connectDB, getDB };
