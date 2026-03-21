/**
 * @file api.ts
 * @description Configuración centralizada de Axios para realizar llamadas HTTP al backend.
 * Incluye interceptores que adjuntan el token JWT automáticamente a cada petición, y
 * cierran la sesión del usuario redirigiéndolo al login si el servidor devuelve un error 401 (No Autorizado).
 * Agrupa end-points lógicos por servicio: Autenticación, Permisos y RRHH.
 */
import axios from 'axios'

const API_URL = 'http://localhost:3000/api'

const api = axios.create({
  baseURL: API_URL,
})

// Agregar token a cada request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Manejar errores de autenticación
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.clear()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const authService = {
  register: (data: any) => api.post('/auth/register', data),
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  getProfile: () => api.get('/auth/profile'),
  changePassword: (data: any) => api.post('/auth/change-password', data),
  getDirectores: () => api.get('/auth/directores'),
}

export const permissionService = {
  getMisDias: () => api.get('/permissions/mis-dias'),
  requestPermission: (data: any) => api.post('/permissions/request', data),
  getMyPermissions: () => api.get('/permissions/my-permissions'),
  getPendingPermissions: () => api.get('/permissions/pending'),
  getTeamPermissions: () => api.get('/permissions/team'),
  approvePermission: (permissionId: number) => api.post(`/permissions/approve/${permissionId}`),
  rejectPermission: (permissionId: number, razon: string) =>
    api.post(`/permissions/reject/${permissionId}`, { razon }),
  uploadSoporte: (file: File) => {
    const formData = new FormData()
    formData.append('soporte', file)
    return api.post('/permissions/upload-soporte', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  getSoporteUrl: (filename: string) => `${API_URL}/permissions/soporte/${filename}`,
}

export const rrhhService = {
  getAllWorkers: (params?: any) => api.get('/rrhh/workers', { params }),
  getWorkerHistory: (workerId: number) => api.get(`/rrhh/workers/${workerId}/history`),
  getAllPermissions: (params?: any) => api.get('/rrhh/permissions', { params }),
  assignDays: (data: any) => api.post('/rrhh/assign-days', data),
  registerAbsence: (data: any) => api.post('/rrhh/register-absence', data),
  getAllAbsences: () => api.get('/rrhh/ausencias'),
  getStatistics: () => api.get('/rrhh/statistics'),
  createUser: (data: any) => api.post('/rrhh/create-user', data),
  deleteWorker: (id: number) => api.delete(`/rrhh/workers/${id}`),
  voidPermission: (id: number) => api.post(`/rrhh/permissions/${id}/void`),
  toggleUserStatus: (id: number) => api.patch(`/rrhh/workers/${id}/status`),
  updateWorker: (id: number, data: any) => api.put(`/rrhh/workers/${id}`, data),
}

export default api
