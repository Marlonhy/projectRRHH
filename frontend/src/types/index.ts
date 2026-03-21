export interface User {
  id: number
  email: string
  nombre: string
  apellido: string
  rol: 'colaborador' | 'director' | 'gerente' | 'rrhh' | 'admin'
  cargo?: string
  fecha_ingreso: string
  documento?: string
  director_id?: number
}

export interface Permission {
  id: number
  usuario_id: number
  director_id: number
  fecha_salida: string
  fecha_regreso: string
  tipo_permiso: 'vacaciones' | 'dia_libre' | 'calamidad' | 'ausencia' | 'licencia_no_remunerada' | 'incapacidad' | 'cita_medica'
  observacion?: string
  soporte?: string
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  razon_rechazo?: string
  dias_solicitados: number
  fecha_solicitud: string
  fecha_aprobacion?: string
  aprobado_por?: number
}

export interface DiasDisponibles {
  id: number
  usuario_id: number
  dias_disponibles: number
  ano: number
  fecha_asignacion: string
  fecha_actualizacion: string
}

export interface LoginResponse {
  token: string
  user: User
}

export interface ApiResponse<T> {
  data: T
  message: string
  error?: string
}
