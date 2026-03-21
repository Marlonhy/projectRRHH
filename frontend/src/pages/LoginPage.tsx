import { useState } from 'react'
import { authService } from '../services/api'
import { UserData } from '../App'
import '../App.css'

interface Props {
  onLogin: (user: UserData) => void
}

/**
 * LoginPage Component
 * Permite el acceso seguro al sistema mediante correo electrónico y contraseña.
 * Incluye normalización de inputs para permitir logins insensibles a mayúsculas.
 */
export default function LoginPage({ onLogin }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Login form
  const [loginData, setLoginData] = useState({ email: '', password: '' })

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authService.login(loginData.email, loginData.password)
      const { token, user } = res.data
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
      onLogin(user)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="login-logo">🏢</div>
          <h1>Sistema RRHH</h1>
          <p>Control de Permisos y Ausencias</p>
        </div>

        <div className="login-card">
          <h2 style={{ textAlign: 'center', marginBottom: 20 }}>Iniciar Sesión</h2>

          {error && <div className="error-msg">⚠️ {error}</div>}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Usuario / Correo electrónico</label>
              <input
                type="text"
                className="form-control"
                placeholder="tu@email.com o usuario"
                value={loginData.email}
                onChange={e => setLoginData({ ...loginData, email: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <input
                type="password"
                className="form-control"
                placeholder="••••••••"
                value={loginData.password}
                onChange={e => setLoginData({ ...loginData, password: e.target.value })}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading}>
              {loading ? '⏳ Ingresando...' : '🔐 Ingresar al Sistema'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: '16px', fontSize: '12px', color: 'var(--text-dim)' }}>
          Viajar LTDA © 2024 · Sistema de Gestión de Permisos
        </p>
      </div>
    </div>
  )
}
