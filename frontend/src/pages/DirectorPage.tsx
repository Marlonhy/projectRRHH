import { useState, useEffect, useRef } from 'react'
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
  dias_disponibles: number
  dias_libres: number
  dias_sabados: number
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

export default function DirectorPage({ user, onLogout }: Props) {
    const [pendientes, setPendientes] = useState<any[]>([])
    const [historial, setHistorial] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [tab, setTab] = useState<'pendientes' | 'historial' | 'mis-solicitudes'>('pendientes')
    const [misPermisos, setMisPermisos] = useState<any[]>([])
    const [dias, setDias] = useState<Balance>(EMPTY_BALANCE)
    const [showRequestModal, setShowRequestModal] = useState(false)
    const [soporteFile, setSoporteFile] = useState<File | null>(null)
    const fileRef = useRef<HTMLInputElement>(null)
    const [permissionForm, setPermissionForm] = useState({
        fecha_salida: '',
        fecha_regreso: '',
        tipo_permiso: 'vacaciones',
        observacion: '',
        soporte: '',
    })
    const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768)
    const [rejectModal, setRejectModal] = useState<{ show: boolean; id: number | null }>({ show: false, id: null })
    const [razon, setRazon] = useState('')
    const [processing, setProcessing] = useState(false)
    const [toast, setToast] = useState('')
    const [showProfileModal, setShowProfileModal] = useState(false)

    const showToast = (msg: string) => {
        setToast(msg)
        setTimeout(() => setToast(''), 3000)
    }

    const loadData = async () => {
        try {
            const [pendRes, histRes, myPermsRes, diasRes] = await Promise.all([
                permissionService.getPendingPermissions(),
                permissionService.getTeamPermissions(),
                permissionService.getMyPermissions(),
                permissionService.getMisDias(),
            ])
            setPendientes(pendRes.data)
            setHistorial(histRes.data)
            setMisPermisos(myPermsRes.data)
            setDias({ ...EMPTY_BALANCE, ...diasRes.data })
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { loadData() }, [])

    const handleApprove = async (id: number) => {
        setProcessing(true)
        try {
            await permissionService.approvePermission(id)
            showToast('✅ Permiso aprobado. El colaborador recibirá un email.')
            await loadData()
        } catch (err: any) {
            showToast('❌ Error: ' + (err.response?.data?.error || 'Error al aprobar'))
        } finally {
            setProcessing(false)
        }
    }

    const handleReject = async () => {
        if (!razon.trim()) return
        setProcessing(true)
        try {
            await permissionService.rejectPermission(rejectModal.id!, razon)
            showToast('✅ Permiso rechazado. El colaborador recibirá un email.')
            setRejectModal({ show: false, id: null })
            setRazon('')
            await loadData()
        } catch (err: any) {
            showToast('❌ Error: ' + (err.response?.data?.error || 'Error al rechazar'))
        } finally {
            setProcessing(false)
        }
    }

    const calcDias = () => {
        if (!permissionForm.fecha_salida || !permissionForm.fecha_regreso) return 0
        const start = new Date(permissionForm.fecha_salida + 'T12:00:00')
        const end = new Date(permissionForm.fecha_regreso + 'T12:00:00')
        if (start > end) return 0
        let count = 0
        let curr = new Date(start)
        while (curr <= end) {
            // Excluir solo Domingos (0) y Festivos
            // Los Sábados (6) se cuentan como laborables a menos que sean festivos
            if (curr.getDay() !== 0 && !isHoliday(curr)) count++
            curr.setDate(curr.getDate() + 1)
        }
        return count
    }

    const getFechaRetorno = () => {
        if (!permissionForm.fecha_regreso) return ''
        let fecha = new Date(permissionForm.fecha_regreso + 'T12:00:00')
        // Siguiente día hábil (saltando domingos y festivos)
        do {
            fecha.setDate(fecha.getDate() + 1)
        } while (fecha.getDay() === 0 || isHoliday(fecha))
        return fecha.toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    }

    const handleRequestPermission = async (e: React.FormEvent) => {
        e.preventDefault()
        setProcessing(true)
        try {
            const requestedDays = calcDias()
            if (permissionForm.tipo_permiso === 'vacaciones' && requestedDays > dias.dias_disponibles) {
                showToast(`❌ Días insuficientes (${dias.dias_disponibles} disponibles)`)
                setProcessing(false)
                return
            }

            let soporteFileName: string | null = null
            if (soporteFile) {
                try {
                    const uploadRes = await permissionService.uploadSoporte(soporteFile)
                    soporteFileName = uploadRes.data.fileName
                } catch (uploadErr: any) {
                    showToast('❌ Error subiendo adjunto')
                    setProcessing(false)
                    return
                }
            }

            const res = await permissionService.requestPermission({ ...permissionForm, soporte: soporteFileName })
            const { fechaRetorno } = res.data
            const formattedReturn = new Date(fechaRetorno + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
            showToast(user.rol === 'gerente' 
                ? `✅ Permiso auto-aprobado. Regresas el ${formattedReturn}` 
                : `✅ Solicitud enviada a RRHH. Regresas el ${formattedReturn}`)
            setShowRequestModal(false)
            setPermissionForm({ fecha_salida: '', fecha_regreso: '', tipo_permiso: 'vacaciones', observacion: '', soporte: '' })
            setSoporteFile(null)
            if (fileRef.current) fileRef.current.value = ''
            await loadData()
        } catch (err: any) {
            showToast('❌ Error: ' + (err.response?.data?.error || 'Error al solicitar'))
        } finally {
            setProcessing(false)
        }
    }

    const getTipoBadge = (tipo: string) => {
        const labels: any = { 
            vacaciones: '🌴 Vacaciones', 
            dia_libre: '☀️ Día Libre', 
            sabado: '📅 Sábado',
            calamidad: '⚠️ Calamidad',
            licencia_no_remunerada: '📄 Lic. no Remunerada',
            incapacidad: '🏥 Incapacidad',
            cita_medica: '🩺 Cita Médica'
        }
        return <span className={`badge badge-${tipo}`}>{labels[tipo] || tipo}</span>
    }

    const getStatusBadge = (estado: string) => {
        const map: any = {
            pendiente: <span className="badge badge-pending">⏳ Pendiente</span>,
            aprobado: <span className="badge badge-approved">✅ Aprobado</span>,
            rechazado: <span className="badge badge-rejected">❌ Rechazado</span>,
        }
        return map[estado] || estado
    }

    const initials = `${user.nombre[0]}${user.apellido[0]}`.toUpperCase()

    return (
        <div className="app-layout">
            <nav className={`sidebar ${!isSidebarOpen ? 'collapsed' : ''}`}>
                <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: isSidebarOpen ? 'space-between' : 'center', padding: isSidebarOpen ? '0 24px 24px' : '0 12px 24px' }}>
                    {isSidebarOpen && (
                        <div>
                            <h2>🏢 RRHH</h2>
                            <span>Panel de Control</span>
                        </div>
                    )}
                    <button className="menu-toggle" onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ padding: 6 }}>
                        ☰
                    </button>
                </div>
                <div className="sidebar-nav">
                    <button
                        className={`nav-item ${tab === 'pendientes' ? 'active' : ''}`}
                        onClick={() => { setTab('pendientes'); if (window.innerWidth <= 768) setIsSidebarOpen(false) }}
                        style={{ justifyContent: isSidebarOpen ? 'flex-start' : 'center', padding: isSidebarOpen ? '12px 16px' : '12px' }}
                    >
                        <span className="icon" style={{ margin: 0 }}>⏳</span> {isSidebarOpen && <span className="nav-label">Pendientes</span>}
                        {isSidebarOpen && pendientes.length > 0 && (
                            <span style={{ marginLeft: 'auto', background: 'var(--warning)', color: 'var(--bg)', borderRadius: '100px', padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                                {pendientes.length}
                            </span>
                        )}
                    </button>
                    <button
                        className={`nav-item ${tab === 'historial' ? 'active' : ''}`}
                        onClick={() => { setTab('historial'); if (window.innerWidth <= 768) setIsSidebarOpen(false) }}
                        style={{ justifyContent: isSidebarOpen ? 'flex-start' : 'center', padding: isSidebarOpen ? '12px 16px' : '12px' }}
                    >
                        <span className="icon" style={{ margin: 0 }}>📋</span> {isSidebarOpen && <span className="nav-label">Historial Equipo</span>}
                    </button>
                    <button
                        className={`nav-item ${tab === 'mis-solicitudes' ? 'active' : ''}`}
                        onClick={() => { setTab('mis-solicitudes'); if (window.innerWidth <= 768) setIsSidebarOpen(false) }}
                        style={{ justifyContent: isSidebarOpen ? 'flex-start' : 'center', padding: isSidebarOpen ? '12px 16px' : '12px' }}
                    >
                        <span className="icon" style={{ margin: 0 }}>👤</span> {isSidebarOpen && <span className="nav-label">Mis Solicitudes</span>}
                    </button>
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
                                <div className="user-role">
                                    {user.rol === 'gerente' ? 'Gerente General' : 'Director de equipo'}
                                </div>
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
                        <h1>Panel de {user.rol === 'gerente' ? 'Gerencia' : 'Dirección'}</h1>
                        <p>Gestión de aprobaciones y seguimiento de equipo</p>
                    </div>
                </header>
                {/* Toast */}
                {toast && (
                    <div style={{
                        position: 'fixed', top: 24, right: 24, zIndex: 9999,
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)', padding: '14px 20px',
                        boxShadow: 'var(--shadow-lg)', color: 'var(--text)', fontSize: 14,
                        animation: 'modalIn 0.2s ease',
                    }}>
                        {toast}
                    </div>
                )}

                {tab === 'pendientes' ? (
                    <>
                        <div className="page-header">
                             <h1>⏳ Solicitudes Pendientes</h1>
                             <p>
                                 {user.rol === 'gerente' 
                                     ? 'Revisa las solicitudes directas y escaladas de la empresa' 
                                     : 'Revisa y aprueba/rechaza las solicitudes de tu equipo'}
                             </p>
                        </div>

                        {loading ? (
                            <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
                        ) : pendientes.length === 0 ? (
                            <div className="card">
                                <div className="empty-state">
                                    <div className="empty-icon">🎉</div>
                                    <h3>Sin solicitudes pendientes</h3>
                                    <p>No tienes solicitudes por revisar en este momento</p>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {pendientes.map((p: any) => (
                                    <div key={p.id} className="card">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                                            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                                                <div className="user-avatar" style={{ width: 48, height: 48, fontSize: 18 }}>
                                                    {p.nombre[0]}{p.apellido[0]}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>
                                                        {p.nombre} {p.apellido}
                                                    </div>
                                                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{p.email}</div>
                                                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                                                        {getTipoBadge(p.tipo_permiso)}
                                                        <span className="badge" style={{ background: 'rgba(79,70,229,0.15)', color: 'var(--primary-light)' }}>
                                                            📅 {p.dias_solicitados} días
                                                        </span>
                                                        {p.dias_disponibles !== null && (
                                                            <span className="badge" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--success)' }}>
                                                                ✅ {p.dias_disponibles} disponibles
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
                                                    📅 {new Date(p.fecha_salida + 'T12:00:00').toLocaleDateString('es-CO')} → {new Date(p.fecha_regreso + 'T12:00:00').toLocaleDateString('es-CO')}
                                                </div>
                                                {p.observacion && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>"{p.observacion}"</div>}
                                                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
                                                    Solicitado: {new Date(p.fecha_solicitud).toLocaleDateString('es-CO')}
                                                </div>
                                                {p.soporte && (
                                                    <div style={{ marginBottom: 12 }}>
                                                        <a href={p.soporte} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: 'var(--primary-light)', textDecoration: 'underline' }}>
                                                            📎 Ver Soporte Adjunto
                                                        </a>
                                                    </div>
                                                )}
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <button
                                                        className="btn btn-success btn-sm"
                                                        disabled={processing}
                                                        onClick={() => handleApprove(p.id)}
                                                    >
                                                        ✅ Aprobar
                                                    </button>
                                                    <button
                                                        className="btn btn-danger btn-sm"
                                                        disabled={processing}
                                                        onClick={() => { setRejectModal({ show: true, id: p.id }); setRazon('') }}
                                                    >
                                                        ❌ Rechazar
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : tab === 'historial' ? (
                    <>
                        <div className="page-header">
                            <h1>📋 Historial Equipo</h1>
                            <p>Registro de todas las solicitudes gestionadas por ti</p>
                        </div>
                        <div className="card">
                            {loading ? (
                                <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
                            ) : historial.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-icon">📭</div>
                                    <h3>Sin historial</h3>
                                    <p>Aún no hay solicitudes de tu equipo</p>
                                </div>
                            ) : (
                                <div className="table-wrapper">
                                    <table className="table">
                                        <thead>
                                            <tr>
                                                <th>Colaborador</th>
                                                <th>Tipo</th>
                                                <th>Salida</th>
                                                <th>Regreso</th>
                                                <th>Días</th>
                                                <th>Estado</th>
                                                <th>Observación</th>
                                                <th>Fecha</th>
                                                <th>Soporte</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {historial.map((p: any) => (
                                                <tr key={p.id}>
                                                    <td>
                                                        <div style={{ fontWeight: 500 }}>{p.nombre} {p.apellido}</div>
                                                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.email}</div>
                                                    </td>
                                                    <td>{getTipoBadge(p.tipo_permiso)}</td>
                                                    <td>{new Date(p.fecha_salida + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                                                    <td>{new Date(p.fecha_regreso + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                                                    <td>{p.dias_solicitados}</td>
                                                    <td>{getStatusBadge(p.estado)}</td>
                                                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.razon_rechazo || p.observacion || '—'}</td>
                                                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{new Date(p.fecha_solicitud).toLocaleDateString('es-CO')}</td>
                                                    <td>
                                                        {p.soporte ? (
                                                            <a href={permissionService.getSoporteUrl(p.soporte)} target="_blank" rel="noreferrer" download className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', padding: '4px 8px' }}>
                                                                <span>⬇️</span> Descargar
                                                            </a>
                                                        ) : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h1>👤 Mis Solicitudes Personales</h1>
                                <p>Gestiona tus propios días de {user.rol === 'gerente' ? 'descanso (para aprobación de RRHH)' : 'vacaciones'}</p>
                            </div>
                            <button className="btn btn-primary" onClick={() => setShowRequestModal(true)}>
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
                                    <div className="stat-value" style={{ color: dias.dias_disponibles > 0 ? 'var(--success)' : 'var(--danger)' }}>{dias.dias_disponibles}</div>
                                    <div className="stat-label">Vacaciones Disponibles</div>
                                </div>
                            </div>
                            <div className="stat-card" style={{ padding: '16px 20px' }}>
                                <div className="stat-icon" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--success)' }}>☀️</div>
                                <div>
                                    <div className="stat-value">{dias.dias_libres}</div>
                                    <div className="stat-label">Días Libres Disponibles</div>
                                </div>
                            </div>
                            <div className="stat-card" style={{ padding: '16px 20px' }}>
                                <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>📅</div>
                                <div>
                                    <div className="stat-value">{dias.dias_sabados}</div>
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
                                    <div className="stat-value" style={{ fontSize: 22 }}>{dias.dias_calamidad}</div>
                                    <div className="stat-label">Días Calamidad ({dias.calamidades_count} sol.)</div>
                                </div>
                            </div>
                            <div className="stat-card" style={{ padding: '14px 18px' }}>
                                <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', width: 36, height: 36, fontSize: 18 }}>🏥</div>
                                <div>
                                    <div className="stat-value" style={{ fontSize: 22 }}>{dias.dias_incapacidad}</div>
                                    <div className="stat-label">Días Incapacidad ({dias.incapacidades_count} sol.)</div>
                                </div>
                            </div>
                            <div className="stat-card" style={{ padding: '14px 18px' }}>
                                <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', width: 36, height: 36, fontSize: 18 }}>🩺</div>
                                <div>
                                    <div className="stat-value" style={{ fontSize: 22 }}>{dias.dias_cita_medica}</div>
                                    <div className="stat-label">Días Citas Médicas ({dias.citas_medicas_count} sol.)</div>
                                </div>
                            </div>
                            <div className="stat-card" style={{ padding: '14px 18px' }}>
                                <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warning)', width: 36, height: 36, fontSize: 18 }}>📄</div>
                                <div>
                                    <div className="stat-value" style={{ fontSize: 22 }}>{dias.dias_licencia}</div>
                                    <div className="stat-label">Días Lic. No Rem. ({dias.licencias_count} sol.)</div>
                                </div>
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-title">Historial Personal</div>
                            {loading ? (
                                <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
                            ) : misPermisos.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-icon">🏖️</div>
                                    <h3>Sin solicitudes personales</h3>
                                    <p>No has registrado solicitudes para ti todavía</p>
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
                                                <th>Estado</th>
                                                <th>Fecha Solicitud</th>
                                                <th>Soporte</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {misPermisos.map((p: any) => (
                                                <tr key={p.id}>
                                                    <td>{getTipoBadge(p.tipo_permiso)}</td>
                                                    <td>{new Date(p.fecha_salida + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                                                    <td>{new Date(p.fecha_regreso + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                                                    <td><strong>{p.dias_solicitados}</strong></td>
                                                    <td>{getStatusBadge(p.estado)}</td>
                                                    <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                                                        {new Date(p.fecha_solicitud).toLocaleDateString('es-CO')}
                                                    </td>
                                                    <td>
                                                        {p.soporte ? (
                                                            <a href={permissionService.getSoporteUrl(p.soporte)} target="_blank" rel="noreferrer" download className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', padding: '4px 8px' }}>
                                                                <span>⬇️</span> Descargar
                                                            </a>
                                                        ) : '—'}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </main>

            {/* Modal de nueva solicitud personal */}
            {showRequestModal && (
                <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowRequestModal(false)}>
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">➕ Nueva Solicitud de Vacaciones</h2>
                            <button className="modal-close" onClick={() => setShowRequestModal(false)}>✕</button>
                        </div>
                        <form onSubmit={handleRequestPermission}>
                            <div className="form-group">
                                <label className="form-label">Tipo de permiso</label>
                                <select
                                    className="form-control"
                                    value={permissionForm.tipo_permiso}
                                    onChange={e => setPermissionForm({ ...permissionForm, tipo_permiso: e.target.value })}
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
                                        value={permissionForm.fecha_salida}
                                        min={new Date().toISOString().split('T')[0]}
                                        onChange={e => setPermissionForm({ ...permissionForm, fecha_salida: e.target.value })}
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Fecha de regreso</label>
                                    <input
                                        type="date"
                                        className="form-control"
                                        value={permissionForm.fecha_regreso}
                                        min={permissionForm.fecha_salida || new Date().toISOString().split('T')[0]}
                                        onChange={e => setPermissionForm({ ...permissionForm, fecha_regreso: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            {calcDias() > 0 && (
                                <div className={`alert ${permissionForm.tipo_permiso === 'vacaciones' && calcDias() > dias.dias_disponibles ? 'alert-warning' : 'alert-info'}`}>
                                    📅 Total de días hábiles: <strong>{calcDias()}</strong>
                                    {permissionForm.tipo_permiso === 'vacaciones' && (
                                        <span> · Disponibles de vacaciones: <strong style={{ color: dias.dias_disponibles > 0 ? 'var(--success)' : 'var(--danger)' }}>{dias.dias_disponibles}</strong></span>
                                    )}
                                    {permissionForm.tipo_permiso === 'dia_libre' && (
                                        <span> · Días libres disponibles: <strong style={{ color: dias.dias_libres > 0 ? 'var(--success)' : 'var(--danger)' }}>{dias.dias_libres}</strong></span>
                                    )}
                                    {permissionForm.tipo_permiso === 'sabado' && (
                                        <span> · Sábados disponibles: <strong style={{ color: dias.dias_sabados > 0 ? 'var(--success)' : 'var(--danger)' }}>{dias.dias_sabados}</strong></span>
                                    )}
                                    <div style={{ fontSize: 13, marginTop: 4 }}>Siguiente día hábil (Entrada): <strong style={{ textTransform: 'capitalize' }}>{getFechaRetorno()}</strong></div>
                                    {user.rol === 'gerente' && <div style={{ fontSize: 12, marginTop: 4 }}>* Sujeto a aprobación de RRHH</div>}
                                </div>
                            )}

                            <div className="form-group">
                                <label className="form-label">Observación (opcional)</label>
                                <textarea
                                    className="form-control"
                                    rows={2}
                                    placeholder="Agrega una nota si es necesario..."
                                    value={permissionForm.observacion}
                                    onChange={e => setPermissionForm({ ...permissionForm, observacion: e.target.value })}
                                    style={{ resize: 'none' }}
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">📎 Adjuntar soporte (opcional — PDF, imagen, Word, Excel — máx. 10MB)</label>
                                <input 
                                    type="file" 
                                    className="form-control" 
                                    ref={fileRef}
                                    accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xls,.xlsx"
                                    onChange={e => setSoporteFile(e.target.files?.[0] || null)}
                                />
                                {soporteFile && <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Archivo seleccionado: {soporteFile.name}</p>}
                            </div>

                            <div className="modal-footer">
                                <button type="button" className="btn btn-ghost" onClick={() => setShowRequestModal(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={processing}>
                                    {processing ? '⏳ Enviando...' : '📤 Enviar Solicitud'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal de rechazo */}
            {rejectModal.show && (
                <div className="modal-overlay">
                    <div className="modal">
                        <div className="modal-header">
                            <h2 className="modal-title">❌ Rechazar Permiso</h2>
                            <button className="modal-close" onClick={() => setRejectModal({ show: false, id: null })}>✕</button>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Razón del rechazo *</label>
                            <textarea
                                className="form-control"
                                rows={4}
                                placeholder="Explica por qué se rechaza el permiso..."
                                value={razon}
                                onChange={e => setRazon(e.target.value)}
                                style={{ resize: 'none' }}
                            />
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setRejectModal({ show: false, id: null })}>Cancelar</button>
                            <button className="btn btn-danger" onClick={handleReject} disabled={processing || !razon.trim()}>
                                {processing ? '⏳ Rechazando...' : '❌ Confirmar Rechazo'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Perfil */}
            <ProfileModal 
                user={user} 
                isOpen={showProfileModal} 
                onClose={() => setShowProfileModal(false)} 
            />
        </div>
    )
}
