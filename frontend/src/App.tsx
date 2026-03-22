/**
 * @file App.tsx
 * @description Archivo principal de React. Actúa como el enrutador global de la aplicación.
 * Gestiona el estado de autenticación leyendo el token JWT de `localStorage`.
 * Redirige automáticamente a los usuarios a sus respectivos paneles según su `rol` (Admin, Director, o Colaborador)
 * y protege las rutas privadas para que no se pueda acceder sin iniciar sesión previamente.
 */
import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PermisosPage from './pages/PermisosPage'
import AdminPage from './pages/AdminPage'
import DirectorPage from './pages/DirectorPage'
import './App.css'

export type UserRole = 'colaborador' | 'director' | 'gerente' | 'rrhh' | 'admin'

export interface UserData {
  id: number
  email: string
  nombre: string
  apellido: string
  rol: UserRole
  director_id?: number
  cargo?: string
  fecha_ingreso?: string
  documento?: string
}

/**
 * App Component
 * Orquestador principal del Frontend. Gestiona el enrutamiento protegido
 * y la persistencia de la sesión del usuario mediante tokens y estado global.
 */
function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<UserData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const storedUser = localStorage.getItem('user')
    if (token && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser)
        setIsAuthenticated(true)
        setUser(parsedUser)
      } catch {
        localStorage.clear()
      }
    }
    setLoading(false)
  }, [])

  const handleLogin = (userData: UserData) => {
    setIsAuthenticated(true)
    setUser(userData)
  }

  const handleLogout = () => {
    localStorage.clear()
    setIsAuthenticated(false)
    setUser(null)
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Cargando...</p>
      </div>
    )
  }

  const getDefaultRoute = () => {
    if (!user) return '/login'
    if (user.rol === 'rrhh' || user.rol === 'admin') return '/admin'
    if (user.rol === 'director' || user.rol === 'gerente') return '/director'
    return '/dashboard'
  }

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={
            !isAuthenticated
              ? <LoginPage onLogin={handleLogin} />
              : <Navigate to={getDefaultRoute()} />
          }
        />
        <Route
          path="/dashboard"
          element={
            isAuthenticated && user?.rol === 'colaborador'
              ? <DashboardPage user={user} onLogout={handleLogout} />
              : <Navigate to={isAuthenticated ? getDefaultRoute() : '/login'} />
          }
        />
        <Route
          path="/permisos"
          element={
            isAuthenticated && user?.rol === 'colaborador'
              ? <PermisosPage user={user} onLogout={handleLogout} />
              : <Navigate to={isAuthenticated ? getDefaultRoute() : '/login'} />
          }
        />
        <Route
          path="/director"
          element={
            isAuthenticated && (user?.rol === 'director' || user?.rol === 'gerente')
              ? <DirectorPage user={user} onLogout={handleLogout} />
              : <Navigate to={isAuthenticated ? getDefaultRoute() : '/login'} />
          }
        />
        <Route
          path="/admin"
          element={
            isAuthenticated && (user?.rol === 'rrhh' || user?.rol === 'admin')
              ? <AdminPage user={user} onLogout={handleLogout} />
              : <Navigate to={isAuthenticated ? getDefaultRoute() : '/login'} />
          }
        />
        <Route path="/" element={<Navigate to={isAuthenticated ? getDefaultRoute() : '/login'} />} />
        <Route path="*" element={<Navigate to={isAuthenticated ? getDefaultRoute() : '/login'} />} />
      </Routes>
    </Router>
  )
}

export default App
