/**
 * @file permissionController.ts
 * @description Lógica centralizada para el Flujo de Permisos.
 * Evalúa matemáticamente las fechas ingresadas (excluye fines de semana si se programa), y se asegura 
 * de que un colaborador tenga saldo antes de generar un registro en SolicitudesPermisos.
 * Conecta directamente con email.ts para notificar a los Directores pertinentes, y para contestar
 * a los colaboradores una vez son aprobados o rechazados.
 */
import { Request, Response } from 'express';
import { getDB } from '../config/database';
import {
  sendPermissionRequestEmail,
  sendPermissionApprovedEmail,
  sendPermissionRejectedEmail,
} from '../utils/email';
import { isHoliday } from '../utils/holidays';

export class PermissionController {
  // Solicitar un permiso
  static async requestPermission(req: Request, res: Response): Promise<void> {
    try {
      const { fecha_salida, fecha_regreso, tipo_permiso, observacion, soporte } = req.body;
      const usuario_id = req.userId;

      if (!fecha_salida || !fecha_regreso || !tipo_permiso) {
        res.status(400).json({ error: 'Faltan datos requeridos (fechas o tipo)' });
        return;
      }

      const db = getDB();

      // Obtener el Director directo de este colaborador
      const workerInfo = db.prepare('SELECT director_id, rol FROM Usuarios WHERE id = ?').get(usuario_id) as any;
      
      // Lógica Especial (Punto 5): Gerente pide a RRHH, RRHH pide a Gerente
      let finalDirectorId = workerInfo.director_id;
      
      if (workerInfo.rol === 'gerente') {
        // Buscar un usuario de RRHH
        const rrhh = db.prepare("SELECT id FROM Usuarios WHERE rol = 'rrhh' AND activo = 1 LIMIT 1").get() as any;
        finalDirectorId = rrhh ? rrhh.id : null;
      } else if (workerInfo.rol === 'rrhh') {
        // Buscar un usuario Gerente
        const gerente = db.prepare("SELECT id FROM Usuarios WHERE rol = 'gerente' AND activo = 1 LIMIT 1").get() as any;
        finalDirectorId = gerente ? gerente.id : null;
      }

      if (!finalDirectorId && workerInfo.rol !== 'admin') {
        res.status(400).json({ error: 'No se pudo asignar un responsable para aprobar tu solicitud.' });
        return;
      }

      // Calcular días solicitados excluyendo domingos (y sábados si se requiere separar)
      const startDate = new Date(fecha_salida + 'T12:00:00');
      const endDate = new Date(fecha_regreso + 'T12:00:00');
      let diasSolicitados = 0;
      let curr = new Date(startDate);
      while (curr <= endDate) {
        // Solo excluimos domingos y festivos nacionales/regionales. 
        // Los sábados se cuentan como días laborables por defecto.
        if (curr.getDay() !== 0 && !isHoliday(curr)) { 
          diasSolicitados++;
        }
        curr.setDate(curr.getDate() + 1);
      }

      // Punto 8: Cálculo de la fecha de entrada (siguiente día hábil tras el fin del permiso)
      let fechaEntrada = new Date(endDate);
      do {
        fechaEntrada.setDate(fechaEntrada.getDate() + 1);
      } while (fechaEntrada.getDay() === 0 || isHoliday(fechaEntrada)); // Saltar domingos y festivos para la entrada
      const fecha_entrada_str = fechaEntrada.toISOString().split('T')[0];

      // Si las fechas son inválidas o están invertidas
      if (diasSolicitados === 0) {
        res.status(400).json({ error: 'El rango de fechas no proporciona ningún día laborable válido.' });
        return;
      }

      // 3. Validar saldo si es vacaciones (Mínimo de 6 días según nueva regla)
      if (tipo_permiso === 'vacaciones') {
        // @ts-ignore - calculateDynamicBalance is private but accessible here
        const balanceInfo = PermissionController.calculateDynamicBalance(db, usuario_id);
        
        // Excepción: RRHH y Admin pueden solicitar menos de 6 días
        const isAdminOrRRHH = req.role === 'admin' || req.role === 'rrhh';
        
        if (!isAdminOrRRHH) {
          if (diasSolicitados < 6) {
            res.status(400).json({ error: 'La solicitud mínima de vacaciones debe ser de 6 días hábiles.' });
            return;
          }
          if (balanceInfo.dias_disponibles < 6) {
            res.status(400).json({ error: 'No puedes solicitar vacaciones si tu saldo es menor a 6 días.' });
            return;
          }
        }

        if (diasSolicitados > balanceInfo.dias_disponibles) {
          res.status(400).json({
            error: `No tienes suficientes días disponibles. Días disponibles: ${balanceInfo.dias_disponibles}, Días solicitados: ${diasSolicitados}`,
          });
          return;
        }
      }

      // Si es Gerente, auto-aprobar
      const isGerente = req.role === 'gerente';
      const estadoInicial = isGerente ? 'aprobado' : 'pendiente';

      // Crear solicitud
      const insert = db.prepare(`
        INSERT INTO SolicitudesPermisos
        (usuario_id, director_id, fecha_salida, fecha_regreso, tipo_permiso, observacion, soporte, dias_solicitados, estado, aprobado_por, fecha_aprobacion)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = insert.run(
        usuario_id, 
        finalDirectorId, 
        fecha_salida, 
        fecha_regreso,
        tipo_permiso, 
        observacion || null, 
        soporte || null,
        diasSolicitados,
        estadoInicial,
        isGerente && workerInfo.rol === 'gerente' ? usuario_id : null, // Solo auto-aprueba si no es el caso especial de RRHH
        isGerente && workerInfo.rol === 'gerente' ? new Date().toISOString() : null
      );

      const permissionId = result.lastInsertRowid;

      // Si se auto-aprobó (Gerente) y es vacaciones, descontar de una vez
      if (isGerente && tipo_permiso === 'vacaciones') {
        const currentYear = new Date().getFullYear();
        db.prepare(`
          UPDATE PermisosDisponibles
          SET dias_disponibles = dias_disponibles - ?,
              fecha_actualizacion = datetime('now')
          WHERE usuario_id = ? AND ano = ?
        `).run(diasSolicitados, usuario_id, currentYear);
      }

      // Obtener datos del colaborador y director para enviar email
      const worker = db.prepare('SELECT email, nombre, apellido FROM Usuarios WHERE id = ?').get(usuario_id) as any;
      
      if (isGerente) {
        // Enviar email de "Auto-Aprobado" (o simplemente de aprobado)
        sendPermissionApprovedEmail(
          worker.email,
          `${worker.nombre} ${worker.apellido}`,
          fecha_salida,
          fecha_regreso
        ).catch(err => console.error('Error enviando email de auto-aprobación:', err));
      } else {
        const boss = db.prepare('SELECT email, nombre FROM Usuarios WHERE id = ?').get(finalDirectorId) as any;
        // Enviar email al director (no bloqueante)
        sendPermissionRequestEmail(
          boss.email,
          `${worker.nombre} ${worker.apellido}`,
          fecha_salida,
          fecha_regreso,
          tipo_permiso,
          Number(permissionId)
        ).catch(err => console.error('Error enviando email al director:', err));
      }

      res.status(201).json({
        message: 'Solicitud creada exitosamente',
        permissionId,
        diasSolicitados,
        fechaRetorno: fecha_entrada_str
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al crear solicitud de permiso' });
    }
  }

  // Obtener mis solicitudes (colaborador)
  static getMyPermissions(req: Request, res: Response): void {
    try {
      const db = getDB();
      const permisos = db.prepare(`
        SELECT 
          sp.id,
          sp.fecha_salida,
          sp.fecha_regreso,
          sp.tipo_permiso,
          sp.observacion,
          sp.soporte,
          sp.estado,
          sp.dias_solicitados,
          sp.fecha_solicitud,
          sp.razon_rechazo,
          d.nombre as director_nombre,
          d.apellido as director_apellido
        FROM SolicitudesPermisos sp
        LEFT JOIN Usuarios d ON sp.director_id = d.id
        WHERE sp.usuario_id = ?
        ORDER BY sp.fecha_solicitud DESC
      `).all(req.userId);

      res.status(200).json(permisos);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al obtener solicitudes' });
    }
  }

  // Obtener solicitudes pendientes para aprobar (director o gerente suplente)
  static getPendingPermissions(req: Request, res: Response): void {
    try {
      const db = getDB();
      const currentYear = new Date().getFullYear();
      
      // Consulta mejorada: 
      // 1. Solicitudes directas (donde soy el director)
      // 2. Si soy gerente, solicitudes de colaboradores cuyo director directo esté ausente/de permiso
      // 3. Punto 4: Gerente aprueba un colaborador (no se muestra al gerente si ya aprobó o si es un colaborador directo)
      const solicitudes = db.prepare(`
        SELECT 
          sp.id, sp.usuario_id, sp.fecha_salida, sp.fecha_regreso, sp.tipo_permiso, 
          sp.observacion, sp.soporte, sp.estado, sp.dias_solicitados, sp.fecha_solicitud,
          u.nombre, u.apellido, u.email, pd.dias_disponibles,
          d.nombre as director_nombre, d.apellido as director_apellido
        FROM SolicitudesPermisos sp
        JOIN Usuarios u ON sp.usuario_id = u.id
        JOIN Usuarios d ON sp.director_id = d.id
        LEFT JOIN PermisosDisponibles pd ON u.id = pd.usuario_id AND pd.ano = ?
        WHERE (
          (sp.director_id = ? AND sp.estado = 'pendiente')
          OR 
          (? = 'gerente' AND sp.estado = 'pendiente' AND sp.aprobado_gerente = 0 AND (
            EXISTS (SELECT 1 FROM SolicitudesPermisos a WHERE a.usuario_id = sp.director_id AND a.estado = 'aprobado' AND date('now', 'localtime') BETWEEN date(a.fecha_salida) AND date(a.fecha_regreso))
            OR
            EXISTS (SELECT 1 FROM HistorialAusencias h WHERE h.usuario_id = sp.director_id AND date('now', 'localtime') BETWEEN date(h.fecha_inicio) AND date(h.fecha_fin))
            OR 
            (u.rol = 'colaborador' AND sp.aprobado_gerente = 0) -- Punto 4: Gerente puede ver solicitudes de colaboradores para aprobación final
          ))
        )
        ORDER BY sp.fecha_solicitud DESC
      `).all(currentYear, req.userId, req.role);

      res.status(200).json(solicitudes);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al obtener solicitudes pendientes' });
    }
  }

  // Obtener todas las solicitudes del responsable (historial de equipo + propias)
  static getAllMyTeamPermissions(req: Request, res: Response): void {
    try {
      const db = getDB();
      const isGerente = req.role === 'gerente';
      
      // Consulta filtrada jerárquicamente:
      // - Si es Gerente: Solicitudes de Directores (subordinados directos) + sus Propias solicitudes
      // - Si es Director: Solicitudes de Colaboradores (subordinados directos) + sus Propias solicitudes
      const solicitudes = db.prepare(`
        SELECT 
          sp.id, sp.fecha_salida, sp.fecha_regreso, sp.tipo_permiso, sp.observacion, 
          sp.estado, sp.dias_solicitados, sp.fecha_solicitud, sp.razon_rechazo, 
          sp.fecha_aprobacion, sp.soporte, u.nombre, u.apellido, u.rol
        FROM SolicitudesPermisos sp
        JOIN Usuarios u ON sp.usuario_id = u.id
        WHERE (
          (sp.director_id = ? AND (? = 'gerente' AND u.rol = 'director')) OR -- Gerente ve Directores
          (sp.director_id = ? AND (? = 'director' AND u.rol = 'colaborador')) OR -- Director ve Colaboradores
          (sp.usuario_id = ?) -- Ver solicitudes propias
        )
        ORDER BY sp.fecha_solicitud DESC
      `).all(req.userId, req.role, req.userId, req.role, req.userId);

      res.status(200).json(solicitudes);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al obtener historial del equipo' });
    }
  }

  // Aprobar permiso
  static async approvePermission(req: Request, res: Response): Promise<void> {
    try {
      const { permissionId } = req.params;
      const db = getDB();
      const permission = db.prepare(`
        SELECT sp.*, u.rol, u.director_id as user_director_id
        FROM SolicitudesPermisos sp
        JOIN Usuarios u ON sp.usuario_id = u.id
        WHERE sp.id = ?
      `).get(permissionId) as any;

      if (!permission) {
        res.status(404).json({ error: 'Solicitud no encontrada' });
        return;
      }

      // Punto 4: Gerente aprueba un colaborador
      if (req.role === 'gerente' && permission.rol === 'colaborador' && permission.director_id !== req.userId) {
        db.prepare(`
          UPDATE SolicitudesPermisos 
          SET aprobado_gerente = 1
          WHERE id = ?
        `).run(permissionId);
        
        res.status(200).json({ message: 'Aprobación de gerencia registrada. La solicitud sigue pendiente para el director inmediato.' });
        return;
      }

      if (permission.estado !== 'pendiente') {
        res.status(400).json({ error: 'Esta solicitud ya fue procesada' });
        return;
      }

      // Actualizar estado final
      db.prepare(`
        UPDATE SolicitudesPermisos 
        SET estado = 'aprobado', 
            aprobado_por = ?,
            fecha_aprobacion = datetime('now')
        WHERE id = ?
      `).run(req.userId, permissionId);

      // Descontar días si es vacaciones
      if (permission.tipo_permiso === 'vacaciones') {
        const currentYear = new Date().getFullYear();
        db.prepare(`
          UPDATE PermisosDisponibles
          SET dias_disponibles = dias_disponibles - ?,
              fecha_actualizacion = datetime('now')
          WHERE usuario_id = ? AND ano = ?
        `).run(permission.dias_solicitados, permission.usuario_id, currentYear);
      }

      // Obtener email del colaborador
      const user = db.prepare('SELECT email, nombre, apellido FROM Usuarios WHERE id = ?').get(permission.usuario_id) as any;

      sendPermissionApprovedEmail(
        user.email,
        `${user.nombre} ${user.apellido}`,
        permission.fecha_salida,
        permission.fecha_regreso
      ).catch(err => console.error('Error enviando email de aprobación:', err));

      res.status(200).json({ message: 'Permiso aprobado exitosamente' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al aprobar permiso' });
    }
  }

  // Rechazar permiso
  static async rejectPermission(req: Request, res: Response): Promise<void> {
    try {
      const { permissionId } = req.params;
      const { razon } = req.body;
      const db = getDB();

      if (!razon) {
        res.status(400).json({ error: 'Razón de rechazo requerida' });
        return;
      }

      const permission = db.prepare('SELECT * FROM SolicitudesPermisos WHERE id = ?').get(permissionId) as any;

      if (!permission) {
        res.status(404).json({ error: 'Solicitud no encontrada' });
        return;
      }

      if (permission.estado !== 'pendiente') {
        res.status(400).json({ error: 'Esta solicitud ya fue procesada' });
        return;
      }

      db.prepare(`
        UPDATE SolicitudesPermisos 
        SET estado = 'rechazado', 
            razon_rechazo = ?,
            aprobado_por = ?,
            fecha_aprobacion = datetime('now')
        WHERE id = ?
      `).run(razon, req.userId, permissionId);

      const user = db.prepare('SELECT email, nombre, apellido FROM Usuarios WHERE id = ?').get(permission.usuario_id) as any;

      sendPermissionRejectedEmail(user.email, `${user.nombre} ${user.apellido}`, razon)
        .catch(err => console.error('Error enviando email de rechazo:', err));

      res.status(200).json({ message: 'Permiso rechazado exitosamente' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al rechazar permiso' });
    }
  }

  /**
   * Obtener días disponibles del usuario (Modelo Dinámico Acumulativo)
   * Devuelve balance detallado por cada tipo de permiso.
   */
  static getDiasDisponibles(req: Request, res: Response): void {
    try {
      const db = getDB();
      const balance = PermissionController.calculateDynamicBalance(db, req.userId as number);
      res.status(200).json(balance);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error al obtener días disponibles' });
    }
  }

  /**
   * Lógica interna de cálculo dinámico del balance global de un colaborador.
   * Este método utiliza un modelo híbrido para calcular el balance:
   * 1. **Días Activos (con Saldo)**: Calcula cuánto tiempo lleva el empleado (15 días x año),
   *    le resta las vacaciones que ya ha solicitado/disfrutado, y le suma/resta cualquier "vacaciones_manual"
   *    que haya introducido RRHH de forma arbitraria. Opera de la misma forma para 'dias_libres' y 'sabados'.
   * 2. **Días Acumulados (Histórico)**: Para licencias, incapacidades, citas médicas y calamidad NO HAY límite
   *    ni saldo decreciente. Simplemente suma la cantidad de días registrados a lo largo del tiempo, y suma/resta
   *    el offset_manual inyectado por RRHH.
   * 
   * @param db Conexión a SQLite
   * @param usuarioId ID del colaborador
   * @returns Un objeto estructurado con los conteos de días netos listos para renderizar.
   */
  public static calculateDynamicBalance(db: any, usuarioId: number): any {
    const currentYear = new Date().getFullYear();
    const user = db.prepare('SELECT fecha_ingreso FROM Usuarios WHERE id = ?').get(usuarioId) as any;
    
    if (!user || !user.fecha_ingreso) {
      return { 
        dias_disponibles: 0, dias_libres: 0, dias_sabados: 0,
        calamidades_count: 0, incapacidades_count: 0, citas_medicas_count: 0, licencias_count: 0,
        dias_calamidad: 0, dias_incapacidad: 0, dias_cita_medica: 0, dias_licencia: 0,
        ano: currentYear 
      };
    }

    // 1. Días Ganados Totales de Vacaciones (15 días c/360 días trabajados)
    const fechaIngresoObj = new Date(user.fecha_ingreso + 'T12:00:00');
    const today = new Date();
    const timeDiffMs = today.getTime() - fechaIngresoObj.getTime();
    let diasTotalesTrabajados = Math.floor(timeDiffMs / (1000 * 3600 * 24));
    if (diasTotalesTrabajados < 0) diasTotalesTrabajados = 0;
    const totalGanadoVacaciones = Math.floor((diasTotalesTrabajados * 15) / 360);

    // 2. Días consumidos de Vacaciones
    const consumidoVacSolicitudes = db.prepare(`
      SELECT COALESCE(SUM(dias_solicitados), 0) as total FROM SolicitudesPermisos 
      WHERE usuario_id = ? AND tipo_permiso = 'vacaciones' AND estado = 'aprobado'
    `).get(usuarioId) as any;
    const consumidoVacManual = db.prepare(`
      SELECT COALESCE(SUM(dias_utilizados), 0) as total FROM HistorialAusencias 
      WHERE usuario_id = ? AND tipo = 'vacacion'
    `).get(usuarioId) as any;
    const totalConsumidoVac = (consumidoVacSolicitudes?.total || 0) + (consumidoVacManual?.total || 0);

    // 3. Días Libres (otorgados manualmente por RRHH, deducidos cuando se usan)
    const saldoManual = db.prepare(`
      SELECT dias_disponibles, dias_libres, dias_sabados, vacaciones_manual, calamidad_manual, incapacidad_manual, cita_medica_manual, licencia_manual 
      FROM PermisosDisponibles WHERE usuario_id = ? AND ano = ?
    `).get(usuarioId, currentYear) as any;

    const balanceVacaciones = Math.max(0, totalGanadoVacaciones - totalConsumidoVac + (saldoManual?.vacaciones_manual || 0));



    // Días libres usados en solicitudes aprobadas
    const consumidoDiasLibres = db.prepare(`
      SELECT COALESCE(SUM(dias_solicitados), 0) as total FROM SolicitudesPermisos 
      WHERE usuario_id = ? AND tipo_permiso = 'dia_libre' AND estado = 'aprobado'
    `).get(usuarioId) as any;
    const diasLibresDisponibles = Math.max(0, (saldoManual?.dias_libres || 0) - (consumidoDiasLibres?.total || 0));

    // Días sábados usados en solicitudes aprobadas (tipo dia_libre con fecha en sábado se cuenta aparte en UI)
    const consumidoSabados = db.prepare(`
      SELECT COALESCE(SUM(dias_solicitados), 0) as total FROM SolicitudesPermisos 
      WHERE usuario_id = ? AND tipo_permiso = 'sabado' AND estado = 'aprobado'
    `).get(usuarioId) as any;
    const diasSabadosDisponibles = Math.max(0, (saldoManual?.dias_sabados || 0) - (consumidoSabados?.total || 0));

    // 4. Tipos acumulativos (no tienen saldo previo - se suman por solicitud)
    const calamidades = db.prepare(`
      SELECT 
        (SELECT COALESCE(COUNT(*), 0) FROM SolicitudesPermisos WHERE usuario_id = ? AND tipo_permiso = 'calamidad' AND estado = 'aprobado') +
        (SELECT COALESCE(COUNT(*), 0) FROM HistorialAusencias WHERE usuario_id = ? AND tipo = 'calamidad') as c
    `).get(usuarioId, usuarioId) as any;

    const diasCalamidad = db.prepare(`
      SELECT COALESCE(SUM(dias_solicitados), 0) as total FROM SolicitudesPermisos 
      WHERE usuario_id = ? AND tipo_permiso = 'calamidad' AND estado = 'aprobado'
    `).get(usuarioId) as any;

    const incapacidades = db.prepare(`
      SELECT COALESCE(COUNT(*), 0) as c FROM SolicitudesPermisos 
      WHERE usuario_id = ? AND tipo_permiso = 'incapacidad' AND estado = 'aprobado'
    `).get(usuarioId) as any;

    const diasIncapacidad = db.prepare(`
      SELECT COALESCE(SUM(dias_solicitados), 0) as total FROM SolicitudesPermisos 
      WHERE usuario_id = ? AND tipo_permiso = 'incapacidad' AND estado = 'aprobado'
    `).get(usuarioId) as any;

    const citasMedicas = db.prepare(`
      SELECT COALESCE(COUNT(*), 0) as c FROM SolicitudesPermisos 
      WHERE usuario_id = ? AND tipo_permiso = 'cita_medica' AND estado = 'aprobado'
    `).get(usuarioId) as any;

    const diasCitaMedica = db.prepare(`
      SELECT COALESCE(SUM(dias_solicitados), 0) as total FROM SolicitudesPermisos 
      WHERE usuario_id = ? AND tipo_permiso = 'cita_medica' AND estado = 'aprobado'
    `).get(usuarioId) as any;

    const licencias = db.prepare(`
      SELECT COALESCE(COUNT(*), 0) as c FROM SolicitudesPermisos 
      WHERE usuario_id = ? AND tipo_permiso = 'licencia_no_remunerada' AND estado = 'aprobado'
    `).get(usuarioId) as any;

    const diasLicencia = db.prepare(`
      SELECT COALESCE(SUM(dias_solicitados), 0) as total FROM SolicitudesPermisos 
      WHERE usuario_id = ? AND tipo_permiso = 'licencia_no_remunerada' AND estado = 'aprobado'
    `).get(usuarioId) as any;

    return { 
      // Tipos con saldo disponible
      dias_disponibles: balanceVacaciones,
      dias_libres: diasLibresDisponibles,
      dias_sabados: diasSabadosDisponibles,
      // Tipos acumulativos (suman, no tienen saldo)
      calamidades_count: calamidades?.c ?? 0,
      dias_calamidad: (diasCalamidad?.total ?? 0) + (saldoManual?.calamidad_manual || 0),
      incapacidades_count: incapacidades?.c ?? 0,
      dias_incapacidad: (diasIncapacidad?.total ?? 0) + (saldoManual?.incapacidad_manual || 0),
      citas_medicas_count: citasMedicas?.c ?? 0,
      dias_cita_medica: (diasCitaMedica?.total ?? 0) + (saldoManual?.cita_medica_manual || 0),
      licencias_count: licencias?.c ?? 0,
      dias_licencia: (diasLicencia?.total ?? 0) + (saldoManual?.licencia_manual || 0),
      ano: currentYear 
    };
  }
}

export default PermissionController;
