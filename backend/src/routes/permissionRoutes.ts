import { Router } from 'express';
import PermissionController from '../controllers/permissionController';
import { upload, uploadSoporte, downloadSoporte } from '../controllers/uploadController';
import { authMiddleware, roleMiddleware } from '../middleware/auth';

const router = Router();

// Todas las rutas de permisos requieren autenticación
router.use(authMiddleware);

// Obtener días disponibles
router.get('/mis-dias', PermissionController.getDiasDisponibles);

// Colaborador: solicitar permiso
router.post('/request', PermissionController.requestPermission);

// Colaborador: ver sus permisos
router.get('/my-permissions', PermissionController.getMyPermissions);

// Director/Gerente: ver permisos pendientes de su equipo
router.get('/pending', roleMiddleware(['director', 'gerente', 'admin', 'rrhh']), PermissionController.getPendingPermissions);

// Director/Gerente: ver todo el historial de su equipo
router.get('/team', roleMiddleware(['director', 'gerente', 'admin', 'rrhh']), PermissionController.getAllMyTeamPermissions);

// Director/Gerente: aprobar permiso
router.post('/approve/:permissionId', roleMiddleware(['director', 'gerente', 'admin', 'rrhh']), PermissionController.approvePermission);

// Director/Gerente: rechazar permiso
router.post('/reject/:permissionId', roleMiddleware(['director', 'gerente', 'admin', 'rrhh']), PermissionController.rejectPermission);

// Subir archivo de soporte (cualquier usuario autenticado)
router.post('/upload-soporte', upload.single('soporte'), uploadSoporte);

// Descargar/ver archivo de soporte
router.get('/soporte/:filename', downloadSoporte);

export default router;
