/**
 * @file PermisosPage.tsx
 * @description Vista dedicada al Colaborador.
 * Muestra el balance completo de días por cada tipo, historial de solicitudes
 * y formulario para crear nuevas solicitudes con adjunto real de archivos.
 */
import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { permissionService } from '../services/api'
import ProfileModal from '../components/ProfileModal'
import { UserData } from '../App'
import { isHoliday } from '../utils/holidays'
import '../App.css'

interface Props {
  user: UserData
  onLogout: () => void
}

interface Balance {
  // Saldo disponible (se otorga, se descuenta al usar)
  dias_disponibles: number   // vacaciones
  dias_libres: number        // días libres
  dias_sabados: number       // sábados compensatorios
  // Tipos acumulativos (cuentan por solicitud aprobada)
  calamidades_count: number; dias_calamidad: number
  incapacidades_count: number; dias_incapacidad: number
  citas_medicas_count: number; dias_cita_medica: number
  licencias_count: number; dias_licencia: number
}

const EMPTY_BALANCE: Balance = {
  dias_disponibles: 0, dias_libres: 0, dias_sabados: 0,
  calamidades_count: 0, dias_calamidad: 0,
  incapacidades_count: 0, dias_incapacidad: 0,
  citas_medicas_count: 0, dias_cita_medica: 0,
  licencias_count: 0, dias_licencia: 0,
}

export default function PermisosPage({ user, onLogout }: Props) {
  const [permisos, setPermisos] = useState<any[]>([])
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768)
  const [balance, setBalance] = useState<Balance>(EMPTY_BALANCE)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [soporteFile, setSoporteFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    fecha_salida: '',
    fecha_regreso: '',
    tipo_permiso: 'vacaciones',
    observacion: '',
  })

  const loadData = async () => {
    try {
      const [permisosRes, diasRes] = await Promise.all([
        permissionService.getMyPermissions(),
        permissionService.getMisDias(),
      ])
      setPermisos(permisosRes.data)
      setBalance({ ...EMPTY_BALANCE, ...diasRes.data })
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const calcDias = () => {
    if (!form.fecha_salida || !form.fecha_regreso) return 0
    const start = new Date(form.fecha_salida + 'T12:00:00')
    const end = new Date(form.fecha_regreso + 'T12:00:00')
    if (start > end) return 0
    let count = 0
    let curr = new Date(start)
    while (curr <= end) {
      if (curr.getDay() !== 0 && !isHoliday(curr)) count++
      curr.setDate(curr.getDate() + 1)
    }
    return count
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const calcDiasVal = calcDias()
      if (calcDiasVal <= 0) {
        setError('La fecha de regreso debe ser posterior a la fecha de salida')
        setSubmitting(false)
        return
      }
      const isAdminOrRRHH = user.rol === 'admin' || user.rol === 'rrhh'
      if (!isAdminOrRRHH) {
        if (form.tipo_permiso === 'vacaciones' && calcDiasVal < 6) {
          setError('⚠️ La solicitud mínima de vacaciones debe ser de 6 días hábiles.')
          setSubmitting(false)
          return
        }
        if (form.tipo_permiso === 'vacaciones' && balance.dias_disponibles < 6) {
          setError('⚠️ No puedes solicitar vacaciones si tu saldo disponible es menor a 6 días.')
          setSubmitting(false)
          return
        }
      }
      if (form.tipo_permiso === 'vacaciones' && calcDiasVal > balance.dias_disponibles) {
        setError(`❌ No tienes suficientes días disponibles. Disponibles: ${balance.dias_disponibles}, Solicitados: ${calcDiasVal}`)
        setSubmitting(false)
        return
      }

      // Subir archivo si hay uno seleccionado
      let soporteFileName: string | null = null
      if (soporteFile) {
        try {
          const uploadRes = await permissionService.uploadSoporte(soporteFile)
          soporteFileName = uploadRes.data.fileName
        } catch (uploadErr: any) {
          setError('Error al subir el archivo adjunto: ' + (uploadErr.response?.data?.error || 'intente de nuevo'))
          setSubmitting(false)
          return
        }
      }

      const res = await permissionService.requestPermission({ ...form, soporte: soporteFileName })
      const { fechaRetorno } = res.data
      const formattedReturn = new Date(fechaRetorno + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      setSuccess(`✅ Solicitud enviada. Debes reintegrarte el ${formattedReturn}. Tu director o RRHH recibirá un email para gestionarla.`)
      setShowModal(false)
      setForm({ fecha_salida: '', fecha_regreso: '', tipo_permiso: 'vacaciones', observacion: '' })
      setSoporteFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await loadData()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al enviar solicitud')
    } finally {
      setSubmitting(false)
    }
  }

  const getStatusBadge = (estado: string) => {
    const map: any = {
      pendiente: <span className="badge badge-pending">⏳ Pendiente</span>,
      aprobado: <span className="badge badge-approved">✅ Aprobado</span>,
      rechazado: <span className="badge badge-rejected">❌ Rechazado</span>,
    }
    return map[estado] || estado
  }

  const getTipoBadge = (tipo: string) => {
    const labels: any = {
      vacaciones: '🌴 Vacaciones',
      dia_libre: '☀️ Día Libre',
      sabado: '📅 Sábado',
      calamidad: '⚠️ Calamidad',
      ausencia: '🚨 Ausencia',
      licencia_no_remunerada: '📄 Lic. no Remunerada',
      incapacidad: '🏥 Incapacidad',
      cita_medica: '🩺 Cita Médica'
    }
    return <span className={`badge badge-${tipo}`}>{labels[tipo] || tipo}</span>
  }

  const diasSolicitados = calcDias()
  const initials = `${user.nombre[0]}${user.apellido[0]}`.toUpperCase()

  // Helpers de color por balance
  const balColor = (val: number) => val > 0 ? 'var(--success)' : val === 0 ? 'var(--text-muted)' : 'var(--danger)'

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
          <button className="menu-toggle" onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ padding: 6 }}>☰</button>
        </div>
        <div className="sidebar-nav">
          <Link to="/dashboard" className="nav-item" style={{ justifyContent: isSidebarOpen ? 'flex-start' : 'center', padding: isSidebarOpen ? '12px 16px' : '12px' }}
            onClick={() => { if (window.innerWidth <= 768) setIsSidebarOpen(false) }}>
            <span className="icon" style={{ margin: 0 }}>📊</span> {isSidebarOpen && <span className="nav-label">Mi Panel</span>}
          </Link>
          <Link to="/permisos" className="nav-item active" style={{ justifyContent: isSidebarOpen ? 'flex-start' : 'center', padding: isSidebarOpen ? '12px 16px' : '12px' }}
            onClick={() => { if (window.innerWidth <= 768) setIsSidebarOpen(false) }}>
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
                <div className="user-role" style={{ textTransform: 'capitalize' }}>{user.rol}</div>
              </div>
            )}
          </div>
          <button className="logout-btn" onClick={onLogout}>{isSidebarOpen ? '🚪 Cerrar Sesión' : '🚪'}</button>
        </div>
      </nav>

      <main className={`main-content ${!isSidebarOpen ? 'expanded' : ''}`}>
        <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto' }}>
          {!isSidebarOpen && (
            <div className="mobile-menu-btn" style={{ marginBottom: 16 }}>
              <button className="menu-toggle" onClick={() => setIsSidebarOpen(true)}>☰</button>
            </div>
          )}
          <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1>📋 Mis Permisos</h1>
              <p>Solicita y revisa el estado de tus permisos</p>
            </div>
            <button className="btn btn-primary" onClick={() => { setShowModal(true); setError(''); setSuccess('') }}>
              ➕ Nueva Solicitud
            </button>
          </div>

          {/* ─── BLOQUE 1: Saldos Disponibles (se otorgan y se descuentan) ─── */}
          <div style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
              📥 Saldo disponible (se otorgan, se restan al usarlos)
            </p>
          </div>
          <div className="grid-3" style={{ marginBottom: 24 }}>
            <div className="stat-card" style={{ padding: '16px 20px' }}>
              <div className="stat-icon" style={{ background: 'rgba(79,70,229,0.15)', color: 'var(--primary-light)' }}>🌴</div>
              <div>
                <div className="stat-value" style={{ color: balColor(balance.dias_disponibles) }}>{balance.dias_disponibles}</div>
                <div className="stat-label">Vacaciones Disponibles</div>
              </div>
            </div>
            <div className="stat-card" style={{ padding: '16px 20px' }}>
              <div className="stat-icon" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--success)' }}>☀️</div>
              <div>
                <div className="stat-value" style={{ color: balColor(balance.dias_libres) }}>{balance.dias_libres}</div>
                <div className="stat-label">Días Libres Disponibles</div>
              </div>
            </div>
            <div className="stat-card" style={{ padding: '16px 20px' }}>
              <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>📅</div>
              <div>
                <div className="stat-value" style={{ color: balColor(balance.dias_sabados) }}>{balance.dias_sabados}</div>
                <div className="stat-label">Sábados Compensatorios</div>
              </div>
            </div>
          </div>

          {/* ─── BLOQUE 2: Tipos acumulativos (suman, no tienen saldo) ─── */}
          <div style={{ marginBottom: 8 }}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
              📤 Días usados por ausencias especiales (acumulativos)
            </p>
          </div>
          <div className="grid-4" style={{ marginBottom: 28 }}>
            <div className="stat-card" style={{ padding: '14px 18px' }}>
              <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', width: 36, height: 36, fontSize: 18 }}>⚠️</div>
              <div>
                <div className="stat-value" style={{ fontSize: 22 }}>{balance.dias_calamidad}</div>
                <div className="stat-label">Días Calamidad ({balance.calamidades_count} sol.)</div>
              </div>
            </div>
            <div className="stat-card" style={{ padding: '14px 18px' }}>
              <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', width: 36, height: 36, fontSize: 18 }}>🏥</div>
              <div>
                <div className="stat-value" style={{ fontSize: 22 }}>{balance.dias_incapacidad}</div>
                <div className="stat-label">Días Incapacidad ({balance.incapacidades_count} sol.)</div>
              </div>
            </div>
            <div className="stat-card" style={{ padding: '14px 18px' }}>
              <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', width: 36, height: 36, fontSize: 18 }}>🩺</div>
              <div>
                <div className="stat-value" style={{ fontSize: 22 }}>{balance.dias_cita_medica}</div>
                <div className="stat-label">Días Citas Médicas ({balance.citas_medicas_count} sol.)</div>
              </div>
            </div>
            <div className="stat-card" style={{ padding: '14px 18px' }}>
              <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warning)', width: 36, height: 36, fontSize: 18 }}>📄</div>
              <div>
                <div className="stat-value" style={{ fontSize: 22 }}>{balance.dias_licencia}</div>
                <div className="stat-label">Días Lic. No Rem. ({balance.licencias_count} sol.)</div>
              </div>
            </div>
          </div>

          {success && <div className="success-msg">{success}</div>}
          {error && !showModal && <div className="error-msg">⚠️ {error}</div>}

          {/* ─── Historial de solicitudes ─── */}
          <div className="card">
            <div className="card-title">📋 Historial de mis solicitudes</div>
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
            ) : permisos.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📭</div>
                <h3>Sin solicitudes</h3>
                <p>Haz clic en "Nueva Solicitud" para empezar</p>
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
                      <th>Soporte</th>
                      <th>Solicitado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {permisos.map((p: any) => (
                      <tr key={p.id}>
                        <td>{getTipoBadge(p.tipo_permiso)}</td>
                        <td>{new Date(p.fecha_salida + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                        <td>{new Date(p.fecha_regreso + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                        <td><strong>{p.dias_solicitados}</strong></td>
                        <td style={{ fontSize: 13 }}>{p.director_nombre ? `${p.director_nombre} ${p.director_apellido || ''}` : '—'}</td>
                        <td>{getStatusBadge(p.estado)}</td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 13, maxWidth: 200 }}>
                          {p.razon_rechazo ? <span style={{ color: 'var(--danger)' }}>❌ {p.razon_rechazo}</span> : (p.observacion || '—')}
                        </td>
                        <td>
                          {p.soporte ? (
                            <a
                              href={permissionService.getSoporteUrl(p.soporte)}
                              target="_blank"
                              rel="noreferrer"
                              download
                              className="btn btn-secondary btn-sm"
                              title="Descargar soporte"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', padding: '4px 8px' }}
                            >
                              <span>⬇️</span> Descargar
                            </a>
                          ) : '—'}
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                          {new Date(p.fecha_solicitud).toLocaleDateString('es-CO')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ─── Modal de nueva solicitud ─── */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">➕ Nueva Solicitud</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            {error && <div className="error-msg">⚠️ {error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">Tipo de permiso</label>
                <select
                  className="form-control"
                  value={form.tipo_permiso}
                  onChange={e => setForm({ ...form, tipo_permiso: e.target.value })}
                >
                  <option value="vacaciones">🌴 Vacaciones (descuenta saldo)</option>
                  <option value="dia_libre">☀️ Día Libre (descuenta saldo)</option>
                  <option value="sabado">📅 Sábado Compensatorio (descuenta saldo)</option>
                  <option value="calamidad">⚠️ Calamidad (acumulativo)</option>
                  <option value="licencia_no_remunerada">📄 Licencia no Remunerada (acumulativo)</option>
                  <option value="incapacidad">🏥 Incapacidad (acumulativo)</option>
                  <option value="cita_medica">🩺 Cita Médica (acumulativo)</option>
                  <option value="ausencia">🚨 Ausencia Justificada</option>
                </select>
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Fecha de salida</label>
                  <input
                    type="date"
                    className="form-control"
                    value={form.fecha_salida}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={e => setForm({ ...form, fecha_salida: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha de regreso</label>
                  <input
                    type="date"
                    className="form-control"
                    value={form.fecha_regreso}
                    min={form.fecha_salida || new Date().toISOString().split('T')[0]}
                    onChange={e => setForm({ ...form, fecha_regreso: e.target.value })}
                    required
                  />
                </div>
              </div>

              {diasSolicitados > 0 && (
                <div className={`alert ${form.tipo_permiso === 'vacaciones' && diasSolicitados > balance.dias_disponibles ? 'alert-warning' : 'alert-info'}`}>
                  📅 Total de días hábiles: <strong>{diasSolicitados}</strong>
                  {form.tipo_permiso === 'vacaciones' && (
                    <span> · Disponibles de vacaciones: <strong style={{ color: balColor(balance.dias_disponibles) }}>{balance.dias_disponibles}</strong></span>
                  )}
                  {form.tipo_permiso === 'dia_libre' && (
                    <span> · Días libres disponibles: <strong style={{ color: balColor(balance.dias_libres) }}>{balance.dias_libres}</strong></span>
                  )}
                  {form.tipo_permiso === 'sabado' && (
                    <span> · Sábados disponibles: <strong style={{ color: balColor(balance.dias_sabados) }}>{balance.dias_sabados}</strong></span>
                  )}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Observación (opcional)</label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Agrega una nota si es necesario..."
                  value={form.observacion}
                  onChange={e => setForm({ ...form, observacion: e.target.value })}
                  style={{ resize: 'none' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">📎 Adjuntar soporte (opcional — PDF, imagen, Word, Excel — máx. 10MB)</label>
                <input
                  ref={fileRef}
                  type="file"
                  className="form-control"
                  accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xls,.xlsx"
                  onChange={e => setSoporteFile(e.target.files?.[0] || null)}
                />
                {soporteFile && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Archivo seleccionado: {soporteFile.name}</p>}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? '⏳ Enviando...' : '📤 Enviar Solicitud'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal de Mi Perfil */}
      <ProfileModal 
        user={user} 
        isOpen={showProfileModal} 
        onClose={() => setShowProfileModal(false)} 
      />
    </div>
  )
}
