import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { authService, permissionService } from '../services/api'
import ProfileModal from '../components/ProfileModal'
import { UserData } from '../App'
import '../App.css'

interface Props {
  user: UserData
  onLogout: () => void
}

export default function DashboardPage({ user, onLogout }: Props) {
  const [profile, setProfile] = useState<any>(null)
  const [permisos, setPermisos] = useState<any[]>([])
  const [dias, setDias] = useState({ dias_disponibles: 0 })
  const [loading, setLoading] = useState(true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768)
  const [showProfileModal, setShowProfileModal] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [profileRes, permisosRes, diasRes] = await Promise.all([
          authService.getProfile(),
          permissionService.getMyPermissions(),
          permissionService.getMisDias(),
        ])
        setProfile(profileRes.data)
        setPermisos(permisosRes.data)
        setDias(diasRes.data)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const getStatusBadge = (estado: string) => {
    const map: any = {
      pendiente: <span className="badge badge-pending">⏳ Pendiente</span>,
      aprobado: <span className="badge badge-approved">✅ Aprobado</span>,
      rechazado: <span className="badge badge-rejected">❌ Rechazado</span>,
    }
    return map[estado] || estado
  }

  const getTipoBadge = (tipo: string) => {
    const map: any = {
      vacaciones: <span className="badge badge-vacaciones">🌴 Vacaciones</span>,
      dia_libre: <span className="badge badge-dia_libre">☀️ Día Libre</span>,
      calamidad: <span className="badge badge-calamidad">⚠️ Calamidad</span>,
      licencia_no_remunerada: <span className="badge badge-vacaciones">📄 Lic. no Remunerada</span>,
      incapacidad: <span className="badge badge-calamidad">🏥 Incapacidad</span>,
      cita_medica: <span className="badge badge-dia_libre">🩺 Cita Médica</span>,
    }
    return map[tipo] || tipo
  }

  const diasDisponibles = dias.dias_disponibles ?? 0
  const pendientes = permisos.filter(p => p.estado === 'pendiente').length
  const aprobados = permisos.filter(p => p.estado === 'aprobado').length
  const rechazados = permisos.filter(p => p.estado === 'rechazado').length

  const initials = `${user.nombre[0]}${user.apellido[0]}`.toUpperCase()

  return (
    <div className="app-layout">
      <nav className={`sidebar ${!isSidebarOpen ? 'collapsed' : ''}`}>
        <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: isSidebarOpen ? 'space-between' : 'center', padding: isSidebarOpen ? '0 24px 24px' : '0 12px 24px' }}>
          {isSidebarOpen && (
            <div>
              <h2>🏢 RRHH</h2>
              <span>Viajar LTDA</span>
            </div>
          )}
          <button className="menu-toggle" onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ padding: 6 }}>
            ☰
          </button>
        </div>
        <div className="sidebar-nav">
          <Link 
            to="/dashboard" 
            className="nav-item active" 
            style={{ justifyContent: isSidebarOpen ? 'flex-start' : 'center', padding: isSidebarOpen ? '12px 16px' : '12px' }}
            onClick={() => { if (window.innerWidth <= 768) setIsSidebarOpen(false) }}
          >
            <span className="icon" style={{ margin: 0 }}>📊</span> {isSidebarOpen && <span className="nav-label">Mi Panel</span>}
          </Link>
          <Link 
            to="/permisos" 
            className="nav-item" 
            style={{ justifyContent: isSidebarOpen ? 'flex-start' : 'center', padding: isSidebarOpen ? '12px 16px' : '12px' }}
            onClick={() => { if (window.innerWidth <= 768) setIsSidebarOpen(false) }}
          >
            <span className="icon" style={{ margin: 0 }}>📋</span> {isSidebarOpen && <span className="nav-label">Mis Permisos</span>}
          </Link>
        </div>
        <div className="sidebar-user" style={{ padding: isSidebarOpen ? '16px 24px' : '16px 12px' }}>
          <div 
            className="user-info" 
            style={{ 
              justifyContent: isSidebarOpen ? 'flex-start' : 'center',
              cursor: 'pointer'
            }}
            onClick={() => setShowProfileModal(true)}
            title="Ver Perfil"
          >
            <div className="user-avatar">{initials}</div>
            {isSidebarOpen && (
              <div>
                <div className="user-name">{user.nombre} {user.apellido}</div>
                <div className="user-role" style={{ textTransform: 'capitalize' }}>{user.rol === 'colaborador' ? 'Colaborador' : user.rol === 'director' ? 'Director' : user.rol}</div>
              </div>
            )}
          </div>
          <button className="logout-btn" onClick={onLogout} style={{ justifyContent: isSidebarOpen ? 'center' : 'center' }}>
            {isSidebarOpen ? '🚪 Cerrar Sesión' : '🚪'}
          </button>
        </div>
      </nav>

      <main className={`main-content ${!isSidebarOpen ? 'expanded' : ''}`}>
        <header className="page-header" style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div>
            <h1>Hola, {user.nombre} 👋</h1>
            <p>Bienvenido al sistema de control de permisos y vacaciones.</p>
          </div>
        </header>
        {/* Días disponibles */}
        <div className="days-indicator" style={{ marginBottom: 24 }}>
          <div className="days-number">{diasDisponibles}</div>
          <div className="days-text">
            <h3>Días de vacaciones disponibles</h3>
            <p>Año {new Date().getFullYear()} · 15 días anuales según fecha de ingreso</p>
            {profile?.fecha_ingreso && (
              <p style={{ marginTop: 4 }}>📅 Fecha de ingreso: {new Date(profile.fecha_ingreso).toLocaleDateString('es-CO')}</p>
            )}
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <Link to="/permisos" className="btn btn-primary">
              ➕ Solicitar Permiso
            </Link>
          </div>
        </div>

        {/* Estadísticas */}
        <div className="grid-3" style={{ marginBottom: 28 }}>
          <div className="stat-card">
            <div className="stat-icon yellow">⏳</div>
            <div>
              <div className="stat-value">{pendientes}</div>
              <div className="stat-label">Solicitudes pendientes</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green">✅</div>
            <div>
              <div className="stat-value">{aprobados}</div>
              <div className="stat-label">Permisos aprobados</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon red">❌</div>
            <div>
              <div className="stat-value">{rechazados}</div>
              <div className="stat-label">Permisos rechazados</div>
            </div>
          </div>
        </div>

        {/* Historial reciente */}
        <div className="card">
          <div className="card-title">📋 Mis solicitudes recientes</div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
              <div className="spinner" style={{ margin: '0 auto 12px' }}></div>
              Cargando...
            </div>
          ) : permisos.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <h3>Sin solicitudes aún</h3>
              <p>Cuando solicites permisos, aparecerán aquí</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Salida</th>
                    <th>Regreso</th>
                    <th>Días</th>
                    <th>Director/Aprobador</th>
                    <th>Estado</th>
                    <th>Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {permisos.slice(0, 3).map((p: any) => (
                    <tr key={p.id}>
                      <td>{getTipoBadge(p.tipo_permiso)}</td>
                      <td>{new Date(p.fecha_salida + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                      <td>{new Date(p.fecha_regreso + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                      <td><strong>{p.dias_solicitados}</strong></td>
                      <td>{p.director_nombre} {p.director_apellido}</td>
                      <td>{getStatusBadge(p.estado)}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                        {p.razon_rechazo || p.observacion || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
      {/* Modal de Mi Perfil */}
      <ProfileModal 
        user={user} 
        isOpen={showProfileModal} 
        onClose={() => setShowProfileModal(false)} 
      />
    </div>
  )
}
