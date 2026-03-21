import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDB } from './config/database';
import Database from './models/schema';
import authRoutes from './routes/authRoutes';
import permissionRoutes from './routes/permissionRoutes';
import rrhhRoutes from './routes/rrhhRoutes';

/**
 * Inicialización de variables de entorno (JWT_SECRET, PORT, DB_PATH, etc.)
 */
dotenv.config();

/**
 * Instancia principal de Express
 */
const app: Express = express();
const PORT = process.env.PORT || 3000;

/**
 * Middlewares Globales
 * - CORS: Permite peticiones desde el frontend (Vite/React)
 * - JSON: Parseo automático de cuerpos de petición en formato JSON
 * - Logger: Registro de actividad en consola para seguimiento de tráfico
 */
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

/**
 * Definición de Enrutadores
 * - /api/auth: Registro, Login y Gestión de Perfil
 * - /api/permissions: Solicitudes de permisos, vacaciones y aprobación
 * - /api/rrhh: Gestión administrativa de usuarios, estadísticas y ausencias por RRHH
 */
app.use('/api/auth', authRoutes);
app.use('/api/permissions', permissionRoutes);
app.use('/api/rrhh', rrhhRoutes);

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', message: 'Servidor funcionando correctamente' });
});

// Iniciar servidor
const startServer = async () => {
  try {
    // Conectar a la base de datos
    await connectDB();

    // Crear tablas si no existen
    await Database.createTables();

    app.listen(PORT, () => {
      console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`);
      console.log(`📍 URL: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Error al iniciar servidor:', error);
    process.exit(1);
  }
};

startServer();

export default app;
