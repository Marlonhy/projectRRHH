import { Router } from 'express';
import RRHHController from '../controllers/rrhhController';
import { authMiddleware, roleMiddleware } from '../middleware/auth';

const router = Router();

/**
 * Rutas Administrativas de RRHH
 * Endpoints restringidos para la gestión de personal, ausencias y estadísticas.
 */
router.use(authMiddleware);
router.use(roleMiddleware(['rrhh', 'admin']));

// Obtener todos los usuarios/trabajadores
router.get('/workers', RRHHController.getAllWorkers);

// Historial de permisos de un trabajador específico
router.get('/workers/:workerId/history', RRHHController.getWorkerHistory);

// Obtener todos los permisos (con filtros opcionales: ?estado=pendiente&tipo=vacaciones)
router.get('/permissions', RRHHController.getAllPermissions);

// Asignar días de vacaciones a un trabajador
router.post('/assign-days', RRHHController.assignDays);

// Registrar ausencia manual
router.post('/register-absence', RRHHController.registerAbsence);

// Obtener historial de ausencias
router.get('/ausencias', RRHHController.getAllAbsences);

// Estadísticas generales
router.get('/statistics', RRHHController.getStatistics);

// Crear usuario desde RRHH
router.post('/create-user', RRHHController.createUser);

// Eliminar usuario
router.delete('/workers/:id', RRHHController.deleteWorker);

// Anular permiso aprobado
router.post('/permissions/:id/void', RRHHController.voidPermission);

// Inactivar/Activar usuario
router.patch('/workers/:id/status', RRHHController.toggleUserStatus);

// Actualizar perfil completo de usuario
router.put('/workers/:id', RRHHController.updateWorker);

export default router;
