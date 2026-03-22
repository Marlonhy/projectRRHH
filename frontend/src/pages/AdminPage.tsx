/**
 * @file AdminPage.tsx
 * @description Panel Integral de Recursos Humanos (Admin).
 * Se divide por pestañas (`tabs`) y concentra todo el poder operativo de la aplicación:
 * - Stats globales de uso.
 * - Creación y Eliminación profunda de Usuarios.
 * - Adición libre de Ausencias a cualquier trabajador.
 * - Modificación forzada de saldo de vacaciones.
 */
import { useState, useEffect, useRef } from 'react'
import { rrhhService, authService, permissionService } from '../services/api'
import ProfileModal from '../components/ProfileModal'
import { UserData } from '../App'
import { isHoliday } from '../utils/holidays'
import '../App.css'

interface Props {
  user: UserData
  onLogout: () => void
}

type TabType = 'dashboard' | 'permisos' | 'trabajadores' | 'ausencias' | 'usuarios' | 'mis_permisos' | 'gestion_solicitudes'

/**
 * AdminPage Component (Panel RRHH)
 * Vista central para la gestión de trabajadores, revisión de solicitudes de toda la empresa
 * y visualización de métricas de ausentismo.
 */
export default function AdminPage({ user, onLogout }: Props) {
  const [tab, setTab] = useState<TabType>('dashboard')
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 768)
  const [stats, setStats] = useState<any>(null)
  const [workers, setWorkers] = useState<any[]>([])
  const [permisos, setPermisos] = useState<any[]>([])
  const [ausencias, setAusencias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filterPermisoEstado, setFilterPermisoEstado] = useState('')
  const [filterPermisoTipo, setFilterPermisoTipo] = useState('')
  const [filterEstado, setFilterEstado] = useState('') // Para trabajadores (Activo/Inactivo)
  const [toast, setToast] = useState('')
  const [filterNombre, setFilterNombre] = useState('')
  const [filterEmail, setFilterEmail] = useState('')
  const [filterRolBase, setFilterRolBase] = useState('')
  const [filterCargo, setFilterCargo] = useState('')
  const [filterDocumento, setFilterDocumento] = useState('')

  const formatRole = (rol: string) => {
    const map: any = {
      rrhh: 'RRHH',
      gerente: 'Gerente',
      director: 'Director',
      colaborador: 'Colaborador',
      admin: 'Súper Admin'
    }
    return map[rol] || rol
  }

  // Modals
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [diasModal, setDiasModal] = useState<{ show: boolean; worker: any | null }>({ show: false, worker: null })
  const [diasForm, setDiasForm] = useState({ dias_disponibles: 15, dias_libres: 0, dias_sabados: 0, dias_calamidad: 0, dias_incapacidad: 0, dias_cita_medica: 0, dias_licencia: 0 })

  const [editModal, setEditModal] = useState<{ show: boolean; worker: any | null }>({ show: false, worker: null })
  const [editForm, setEditForm] = useState({
    nombre: '', apellido: '', email: '', password: '',
    rol: 'colaborador', cargo: '', fecha_ingreso: '', director_id: '',
    documento: ''
  })

  const [ausenciaModal, setAusenciaModal] = useState(false)
  const [ausenciaForm, setAusenciaForm] = useState({
    workerId: '',
    tipo: 'ausencia',
    fecha_inicio: '',
    fecha_fin: '',
    razon: '',
    dias_utilizados: 1,
  })

  const [usuarioForm, setUsuarioForm] = useState({
    nombre: '', apellido: '', email: '', password: '',
    rol: 'colaborador', cargo: '', fecha_ingreso: '', documento: '',
  })

  const [directores, setDirectores] = useState<any[]>([])
  const [usuarioDirectorId, setUsuarioDirectorId] = useState('')
  const [processing, setProcessing] = useState(false)

  // -- MIS PERMISOS (RRHH/ADMIN PROPIO) --
  const [myPermisos, setMyPermisos] = useState<any[]>([])
  const [myBalance, setMyBalance] = useState<any>(null)
  const [showMyModal, setShowMyModal] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [mySoporteFile, setMySoporteFile] = useState<File | null>(null)
  const [myForm, setMyForm] = useState({
    fecha_salida: '',
    fecha_regreso: '',
    tipo_permiso: 'vacaciones',
    observacion: '',
  })
  const [mySuccess, setMySuccess] = useState('')
  const [myError, setMyError] = useState('')

  // Autocalcular días excluyendo domingos
  useEffect(() => {
    if (ausenciaForm.fecha_inicio && ausenciaForm.fecha_fin) {
      const start = new Date(ausenciaForm.fecha_inicio + 'T12:00:00')
      const end = new Date(ausenciaForm.fecha_fin + 'T12:00:00')
      if (start <= end) {
        let count = 0
        let curr = new Date(start)
        while (curr <= end) {
          if (curr.getDay() !== 0) count++ // 0 = Domingo
          curr.setDate(curr.getDate() + 1)
        }
        setAusenciaForm(prev => ({ ...prev, dias_utilizados: count }))
      }
    }
  }, [ausenciaForm.fecha_inicio, ausenciaForm.fecha_fin])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  const loadData = async () => {
    setLoading(true)
    try {
      const [statsRes, workersRes, permisosRes, ausenciasRes, directoresRes] = await Promise.all([
        rrhhService.getStatistics(),
        rrhhService.getAllWorkers(),
        rrhhService.getAllPermissions({ estado: filterPermisoEstado || undefined, tipo: filterPermisoTipo || undefined }),
        rrhhService.getAllAbsences(),
        authService.getDirectores(),
      ])
      setStats(statsRes.data)
      setWorkers(workersRes.data)
      setPermisos(permisosRes.data)
      setAusencias(ausenciasRes.data)
      setDirectores(directoresRes.data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const loadMyData = async () => {
    try {
      const [permisosRes, diasRes] = await Promise.all([
        permissionService.getMyPermissions(),
        permissionService.getMisDias(),
      ])
      setMyPermisos(permisosRes.data)
      setMyBalance(diasRes.data)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    loadData()
    if (user.rol === 'rrhh' || user.rol === 'admin') loadMyData()
  }, [filterPermisoEstado, filterPermisoTipo])

  const handleAssignDays = async () => {
    setProcessing(true)
    try {
      await rrhhService.assignDays({ workerId: diasModal.worker.id, ...diasForm })
      showToast(`✅ Días actualizados a ${diasModal.worker.nombre}`)
      setDiasModal({ show: false, worker: null })
      await loadData()
    } catch (err: any) {
      showToast('❌ ' + (err.response?.data?.error || 'Error al asignar días'))
    } finally {
      setProcessing(false)
    }
  }

  const handleRegisterAbsence = async (e: React.FormEvent) => {
    e.preventDefault()
    setProcessing(true)
    try {
      await rrhhService.registerAbsence(ausenciaForm)
      showToast('✅ Ausencia registrada correctamente')
      setAusenciaModal(false)
      setAusenciaForm({ workerId: '', tipo: 'ausencia', fecha_inicio: '', fecha_fin: '', razon: '', dias_utilizados: 1 })
      await loadData()
    } catch (err: any) {
      showToast('❌ ' + (err.response?.data?.error || 'Error al registrar ausencia'))
    } finally {
      setProcessing(false)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setProcessing(true)
    try {
      await rrhhService.createUser({ ...usuarioForm, director_id: usuarioDirectorId || undefined })
      showToast(`✅ Usuario ${usuarioForm.nombre} creado correctamente`)
      setUsuarioForm({ nombre: '', apellido: '', email: '', password: '', rol: 'colaborador', cargo: '', fecha_ingreso: '', documento: '' })
      setUsuarioDirectorId('')
      await loadData()
    } catch (err: any) {
      showToast('❌ ' + (err.response?.data?.error || 'Error al crear usuario'))
    } finally {
      setProcessing(false)
    }
  }

  const handleVoidPermiso = async (id: number) => {
    if (!window.confirm('¿Estás seguro de que quieres ANULAR este permiso? Esto restaurará el saldo del trabajador.')) return
    setProcessing(true)
    try {
      await rrhhService.voidPermission(id)
      showToast('🚫 Permiso anulado correctamente')
      await loadData()
    } catch (err: any) {
      showToast('❌ ' + (err.response?.data?.error || 'Error al anular permiso'))
    } finally {
      setProcessing(false)
    }
  }

  const handleApprovePermiso = async (id: number) => {
    setProcessing(true)
    try {
      await permissionService.approvePermission(id)
      showToast('✅ Solicitud aprobada correctamente')
      await loadData()
    } catch (err: any) {
      showToast('❌ ' + (err.response?.data?.error || 'Error al aprobar solicitud'))
    } finally {
      setProcessing(false)
    }
  }

  const handleRejectPermiso = async (id: number) => {
    const reason = window.prompt('Por favor, ingresa el motivo del rechazo:')
    if (reason === null) return 
    if (!reason.trim()) return showToast('⚠️ Debes ingresar un motivo')

    setProcessing(true)
    try {
      await permissionService.rejectPermission(id, reason)
      showToast('❌ Solicitud rechazada')
      await loadData()
    } catch (err: any) {
      showToast('❌ ' + (err.response?.data?.error || 'Error al rechazar solicitud'))
    } finally {
      setProcessing(false)
    }
  }

  const handleDeleteWorker = async (id: number, nombre: string, apellido: string) => {
    if (window.confirm(`¿Estás completamente seguro de que deseas eliminar permanentemente a ${nombre} ${apellido}? Esta acción borrará todo su historial, ausencias y permisos, y NO se puede deshacer.`)) {
      setProcessing(true)
      try {
        await rrhhService.deleteWorker(id)
        showToast('✅ Usuario eliminado correctamente')
        await loadData()
      } catch (err: any) {
        showToast('❌ ' + (err.response?.data?.error || 'Error al eliminar usuario'))
      } finally {
        setProcessing(false)
      }
    }
  }

  const handleToggleStatus = async (id: number) => {
    setProcessing(true)
    try {
      await rrhhService.toggleUserStatus(id)
      showToast('✅ Estado del usuario actualizado')
      await loadData()
    } catch (err) {
      showToast('❌ Error al cambiar estado')
    } finally {
      setProcessing(false)
    }
  }

  const filteredWorkers = workers.filter(w => {
    const matchAdmin = user.rol === 'admin' || w.rol !== 'admin'
    const matchNombre = (w.nombre + ' ' + w.apellido).toLowerCase().includes(filterNombre.toLowerCase())
    const matchEmail = w.email.toLowerCase().includes(filterEmail.toLowerCase())
    const matchRol = filterRolBase === '' || w.rol === filterRolBase
    const matchCargo = filterCargo === '' || (w.cargo || '').toLowerCase().includes(filterCargo.toLowerCase())
    const matchDocumento = filterDocumento === '' || (w.documento || '').toLowerCase().includes(filterDocumento.toLowerCase())
    const matchStatus = filterEstado === '' || (filterEstado === '1' ? w.activo === 1 : w.activo === 0)
    return matchAdmin && matchNombre && matchEmail && matchRol && matchCargo && matchStatus && matchDocumento
  })

  const handleUpdateWorker = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editModal.worker) return
    setProcessing(true)
    try {
      await rrhhService.updateWorker(editModal.worker.id, {
        ...editForm,
        director_id: editForm.director_id || null
      })
      showToast('✅ Perfil actualizado correctamente')
      setEditModal({ show: false, worker: null })
      await loadData()
    } catch (err: any) {
      showToast('❌ ' + (err.response?.data?.error || 'Error al actualizar perfil'))
    } finally {
      setProcessing(false)
    }
  }

  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) {
      showToast('⚠️ No hay datos para exportar')
      return
    }

    // Preparar cabeceras
    const headers = Object.keys(data[0]).join(';')

    // Preparar filas (limpiando comas y asegurando formato CSV punto y coma para Excel ES)
    const rows = data.map(obj =>
      Object.values(obj).map(val => {
        const str = String(val ?? '').replace(/;/g, ' ')
        return `"${str}"`
      }).join(';')
    ).join('\n')

    const csvContent = "\uFEFF" + headers + '\n' + rows // BOM para UTF-8 en Excel
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    showToast('📊 Reporte generado con éxito')
  }


  const getTipoBadge = (tipo: string) => {
    const labels: any = {
      vacaciones: '🌴 Vacaciones',
      dia_libre: '☀️ Día Libre',
      calamidad: '⚠️ Calamidad',
      ausencia: '🚨 Ausencia',
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
    return map[estado] || <span className="badge">{estado}</span>
  }

  const calcMyDias = () => {
    if (!myForm.fecha_salida || !myForm.fecha_regreso) return 0
    const start = new Date(myForm.fecha_salida + 'T12:00:00')
    const end = new Date(myForm.fecha_regreso + 'T12:00:00')
    if (start > end) return 0
    let count = 0
    let curr = new Date(start)
    while (curr <= end) {
      if (curr.getDay() !== 0 && !isHoliday(curr)) count++
      curr.setDate(curr.getDate() + 1)
    }
    return count
  }

  const handleMySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMyError('')
    setProcessing(true)
    try {
      const calcDiasVal = calcMyDias()
      if (calcDiasVal <= 0) {
        setMyError('La fecha de regreso debe ser posterior a la fecha de salida')
        return
      }

      // Validaciones de vacaciones (mínimo 6 días no aplica a Admin/RRHH)
      if (myForm.tipo_permiso === 'vacaciones' && calcDiasVal > (myBalance?.dias_disponibles || 0)) {
        setMyError(`❌ No tienes suficientes días de vacaciones. Disponibles: ${myBalance?.dias_disponibles}, Solicitados: ${calcDiasVal}`)
        return
      }

      let soporteFileName: string | null = null
      if (mySoporteFile) {
        const uploadRes = await permissionService.uploadSoporte(mySoporteFile)
        soporteFileName = uploadRes.data.fileName
      }

      const res = await permissionService.requestPermission({ ...myForm, soporte: soporteFileName })
      const { fechaRetorno } = res.data
      const formattedReturn = new Date(fechaRetorno + 'T12:00:00').toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

      setMySuccess(`✅ Solicitud enviada. Debes reintegrarte el ${formattedReturn}.`)
      setShowMyModal(false)
      setMyForm({ fecha_salida: '', fecha_regreso: '', tipo_permiso: 'vacaciones', observacion: '' })
      setMySoporteFile(null)
      if (fileRef.current) fileRef.current.value = ''
      await loadMyData()
    } catch (err: any) {
      setMyError(err.response?.data?.error || 'Error al enviar solicitud')
    } finally {
      setProcessing(false)
    }
  }

  const balColor = (val: number) => val > 0 ? 'var(--success)' : val === 0 ? 'var(--text-muted)' : 'var(--danger)'

  const initials = `${user.nombre[0]}${user.apellido[0]}`.toUpperCase()

  const navItems: { key: TabType; label: string; icon: string }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: '📊' },
    { key: 'gestion_solicitudes', label: 'Gestión de Solicitudes', icon: '⚖️' },
    { key: 'permisos', label: 'Todos los Permisos', icon: '📋' },
    { key: 'mis_permisos', label: 'Mis Permisos', icon: '👤' },
    { key: 'trabajadores', label: 'Usuarios del Sistema', icon: '👥' },
    { key: 'ausencias', label: 'Ausencias', icon: '📅' },
    { key: 'usuarios', label: 'Crear Usuario', icon: '➕' },
  ]

  return (
    <div className="app-layout">
      <nav className={`sidebar ${!isSidebarOpen ? 'collapsed' : ''}`}>
        <div className="sidebar-logo" style={{ display: 'flex', alignItems: 'center', justifyContent: isSidebarOpen ? 'space-between' : 'center', padding: isSidebarOpen ? '0 24px 24px' : '0 12px 24px' }}>
          {isSidebarOpen && (
            <div>
              <h2>🏢 RRHH</h2>
              <span>Recursos Humanos</span>
            </div>
          )}
          <button className="menu-toggle" onClick={() => setIsSidebarOpen(!isSidebarOpen)} style={{ padding: 6 }}>
            ☰
          </button>
        </div>
        <div className="sidebar-nav">
          {navItems.map(item => (
            <button
              key={item.key}
              className={`nav-item ${tab === item.key ? 'active' : ''}`}
              onClick={() => {
                setTab(item.key)
                if (window.innerWidth <= 768) setIsSidebarOpen(false)
              }}
              style={{ justifyContent: isSidebarOpen ? 'flex-start' : 'center', padding: isSidebarOpen ? '12px 16px' : '12px' }}
              title={item.label}
            >
              <span className="icon" style={{ margin: 0 }}>{item.icon}</span>
              {isSidebarOpen && <span className="nav-label">{item.label}</span>}
            </button>
          ))}
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
                <div className="user-role">Recursos Humanos</div>
              </div>
            )}
          </div>
          {isSidebarOpen ? (
            <button className="logout-btn" onClick={onLogout}>🚪 Cerrar Sesión</button>
          ) : (
            <button className="logout-btn" onClick={onLogout} title="Cerrar Sesión">🚪</button>
          )}
        </div>
      </nav>

      <main className={`main-content ${!isSidebarOpen ? 'expanded' : ''}`}>
        <div style={{ maxWidth: 1200, width: '100%', margin: '0 auto' }}>

          {/* Toggle & Toast */}
          {!isSidebarOpen && (
            <div className="mobile-menu-btn" style={{ marginBottom: 16 }}>
              <button className="menu-toggle" onClick={() => setIsSidebarOpen(true)}>☰</button>
            </div>
          )}
          {toast && (
            <div style={{
              position: 'fixed', top: 24, right: 24, zIndex: 9999,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '14px 20px',
              boxShadow: 'var(--shadow-lg)', color: 'var(--text)', fontSize: 14,
              animation: 'modalIn 0.2s ease', maxWidth: 360,
            }}>
              {toast}
            </div>
          )}

          {/* ===== DASHBOARD ===== */}
          {tab === 'dashboard' && (
            <>
              <div className="page-header">
                <h1>📊 Panel de Control RRHH</h1>
                <p>Resumen general del sistema — {new Date().toLocaleDateString('es-CO', { year: 'numeric', month: 'long' })}</p>
              </div>

              {stats && (
                <div className="grid-4" style={{ marginBottom: 28 }}>
                  <div className="stat-card">
                    <div className="stat-icon blue">👥</div>
                    <div>
                      <div className="stat-value">{stats.total_trabajadores}</div>
                      <div className="stat-label">Total Empleados</div>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon yellow">⏳</div>
                    <div>
                      <div className="stat-value">{stats.permisos_pendientes}</div>
                      <div className="stat-label">Pendientes</div>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon green">✅</div>
                    <div>
                      <div className="stat-value">{stats.permisos_aprobados_ano}</div>
                      <div className="stat-label">Aprobados {stats.ano_actual}</div>
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-icon red">❌</div>
                    <div>
                      <div className="stat-value">{stats.permisos_rechazados_ano}</div>
                      <div className="stat-label">Rechazados {stats.ano_actual}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid-2">
                <div className="card">
                  <div className="card-title">📋 Últimas Solicitudes</div>
                  {permisos.slice(0, 5).length === 0 ? (
                    <div className="empty-state" style={{ padding: '20px 0' }}>
                      <p>Sin solicitudes aún</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {permisos.slice(0, 5).map((p: any) => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 14 }}>{p.colaborador_nombre} {p.colaborador_apellido}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(p.fecha_salida + 'T12:00:00').toLocaleDateString('es-CO')} → {new Date(p.fecha_regreso + 'T12:00:00').toLocaleDateString('es-CO')}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {getTipoBadge(p.tipo_permiso)}
                            {getStatusBadge(p.estado)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="card">
                  <div className="card-title">👥 Usuarios con más días disponibles</div>
                  {workers.filter(w => w.rol !== 'admin').length === 0 ? (
                    <div className="empty-state" style={{ padding: '20px 0' }}><p>Sin datos</p></div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {[...workers].filter(w => w.rol !== 'admin').sort((a, b) => (b.dias_disponibles || 0) - (a.dias_disponibles || 0)).slice(0, 5).map((w: any) => (
                        <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div className="user-avatar" style={{ width: 36, height: 36, fontSize: 13 }}>
                              {w.nombre[0]}{w.apellido[0]}
                            </div>
                            <div>
                              <div style={{ fontWeight: 500, fontSize: 14 }}>{w.nombre} {w.apellido}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{w.cargo || 'Sin cargo'}</div>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 700, color: 'var(--primary-light)', fontSize: 18 }}>{w.dias_disponibles ?? '—'}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>días disponibles</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* ===== PERMISOS ===== */}

          {/* ===== GESTION DE SOLICITUDES (PARA RRHH) ===== */}
          {tab === 'gestion_solicitudes' && (
            <>
              <div className="page-header">
                <h1>⚖️ Gestión de Solicitudes</h1>
                <p>Solicitudes de Gerencia que requieren tu aprobación</p>
              </div>
              
              <div className="card">
                {loading ? (
                  <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
                ) : permisos.filter((p: any) => p.director_id === user.id && p.estado === 'pendiente').length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">✅</div>
                    <h3>Todo al día</h3>
                    <p>No tienes solicitudes de Gerencia pendientes por aprobar.</p>
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Colaborador</th>
                          <th>Tipo</th>
                          <th>Días</th>
                          <th>Salida</th>
                          <th>Regreso</th>
                          <th>Observación</th>
                          <th>Soporte</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {permisos
                          .filter((p: any) => p.director_id === user.id && p.estado === 'pendiente')
                          .map((p: any) => (
                            <tr key={p.id}>
                              <td style={{ fontWeight: 600 }}>{p.colaborador_nombre} {p.colaborador_apellido}</td>
                              <td>{getTipoBadge(p.tipo_permiso)}</td>
                              <td><strong>{p.dias_solicitados}</strong></td>
                              <td>{new Date(p.fecha_salida + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                              <td>{new Date(p.fecha_regreso + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                              <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{p.observacion || '—'}</td>
                              <td>
                                {p.soporte ? (
                                  <a
                                    href={permissionService.getSoporteUrl(p.soporte)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn btn-ghost btn-xs"
                                    style={{ fontSize: 10 }}
                                  >
                                    📄 Ver Soporte
                                  </a>
                                ) : '—'}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => handleApprovePermiso(p.id)}
                                    disabled={processing}
                                  >
                                    ✅ Aprobar
                                  </button>
                                  <button
                                    className="btn btn-danger btn-sm"
                                    onClick={() => handleRejectPermiso(p.id)}
                                    disabled={processing}
                                  >
                                    ❌ Rechazar
                                  </button>
                                </div>
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

          {/* ===== PERMISOS ===== */}
          {tab === 'permisos' && (
            <>
              <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h1>📋 Todos los Permisos</h1>
                  <p>Registro completo de solicitudes de todos los empleados</p>
                </div>
                <button
                  className="btn btn-ghost"
                  style={{ color: 'var(--success)', borderColor: 'var(--success)' }}
                  onClick={() => exportToCSV(permisos, 'Reporte_Permisos_General')}
                >
                  📊 Exportar a Excel
                </button>
              </div>

              <div className="filter-bar" style={{ marginBottom: 20 }}>
                <select className="form-control" style={{ width: 'auto' }} value={filterPermisoEstado} onChange={e => setFilterPermisoEstado(e.target.value)}>
                  <option value="">Todos los estados</option>
                  <option value="pendiente">⏳ Pendiente</option>
                  <option value="aprobado">✅ Aprobado</option>
                  <option value="rechazado">❌ Rechazado</option>
                </select>
                <select className="form-control" style={{ width: 'auto' }} value={filterPermisoTipo} onChange={e => setFilterPermisoTipo(e.target.value)}>
                  <option value="">Todos los tipos</option>
                  <option value="vacaciones">🌴 Vacaciones</option>
                  <option value="dia_libre">☀️ Día Libre</option>
                  <option value="sabado">📅 Sábado Computado</option>
                  <option value="calamidad">⚠️ Calamidad</option>
                  <option value="incapacidad">🏥 Incapacidad</option>
                  <option value="cita_medica">🩺 Cita Médica</option>
                  <option value="licencia_no_remunerada">📄 Licencia No Remunerada</option>
                </select>
              </div>

              <div className="card">
                {loading ? (
                  <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
                ) : permisos.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">📭</div>
                    <h3>Sin registros</h3>
                    <p>No hay solicitudes que coincidan con los filtros</p>
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Colaborador</th>
                          <th>Correo</th>
                          <th>Tipo</th>
                          <th>Salida</th>
                          <th>Regreso</th>
                          <th>Días</th>
                          <th>Director</th>
                          <th>Estado</th>
                          <th>Observación</th>
                          <th>Soporte</th>
                          <th>Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {permisos.map((p: any) => (
                          <tr key={p.id}>
                            <td style={{ fontWeight: 500 }}>{p.colaborador_nombre} {p.colaborador_apellido}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.colaborador_email}</td>
                            <td>{getTipoBadge(p.tipo_permiso)}</td>
                            <td>{new Date(p.fecha_salida + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                            <td>{new Date(p.fecha_regreso + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                            <td><strong>{p.dias_solicitados}</strong></td>
                            <td style={{ fontSize: 13 }}>{p.director_nombre} {p.director_apellido}</td>
                            <td>{getStatusBadge(p.estado)}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 160 }}>{p.razon_rechazo || p.observacion || '—'}</td>
                            <td>
                              {p.soporte ? (
                                <a
                                  href={permissionService.getSoporteUrl(p.soporte)}
                                  target="_blank"
                                  rel="noreferrer"
                                  download
                                  title="Descargar soporte"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', padding: '4px 8px' }}
                                  className="btn btn-secondary btn-sm"
                                >
                                  <span>⬇️</span> Descargar
                                </a>
                              ) : '—'}
                            </td>
                            <td>
                              {p.estado === 'pendiente' && (
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() => handleRejectPermiso(p.id)}
                                  disabled={processing}
                                >
                                  ❌ Rechazar
                                </button>
                              )}
                              {p.estado === 'aprobado' && (
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ color: 'var(--danger)', borderColor: 'var(--danger)', fontSize: 11 }}
                                  onClick={() => handleVoidPermiso(p.id)}
                                  disabled={processing}
                                >
                                  🚫 Anular
                                </button>
                              )}
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

          {/* ===== TRABAJADORES ===== */}
          {tab === 'trabajadores' && (
            <>
              <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h1>👥 Usuarios del Sistema</h1>
                  <p>Gestión de roles, días disponibles y datos de los empleados</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="btn btn-ghost"
                    style={{ color: 'var(--success)', borderColor: 'var(--success)' }}
                    onClick={() => exportToCSV(filteredWorkers, 'Listado_Trabajadores')}
                  >
                    📊 Exportar a Excel
                  </button>
                  <button className="btn btn-primary" onClick={() => setTab('usuarios')}>
                    ➕ Crear Nuevo Usuario
                  </button>
                </div>
              </div>

              {/* Fila de Filtros */}
              <div className="card" style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 12, padding: '16px 20px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Nombre</label>
                  <input
                    type="text"
                    className="input"
                    style={{ padding: '8px 12px', fontSize: 13 }}
                    placeholder="Escribir..."
                    value={filterNombre}
                    onChange={e => setFilterNombre(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Documento</label>
                  <input
                    type="text"
                    className="input"
                    style={{ padding: '8px 12px', fontSize: 13 }}
                    placeholder="Documento..."
                    value={filterDocumento}
                    onChange={e => setFilterDocumento(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Correo</label>
                  <input
                    type="text"
                    className="input"
                    style={{ padding: '8px 12px', fontSize: 13 }}
                    placeholder="Correo..."
                    value={filterEmail}
                    onChange={e => setFilterEmail(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Rol</label>
                  <select className="input" style={{ padding: '8px 12px', fontSize: 13 }} value={filterRolBase} onChange={e => setFilterRolBase(e.target.value)}>
                    <option value="">Todos</option>
                    <option value="colaborador">Colaborador</option>
                    <option value="director">Director</option>
                    <option value="gerente">Gerente</option>
                    <option value="rrhh">RRHH</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Cargo</label>
                  <input
                    type="text"
                    className="input"
                    style={{ padding: '8px 12px', fontSize: 13 }}
                    placeholder="Escribir o elegir..."
                    list="list-cargos"
                    value={filterCargo}
                    onChange={e => setFilterCargo(e.target.value)}
                  />
                  <datalist id="list-cargos">
                    {[...new Set(workers.map(w => w.cargo).filter(Boolean))].map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Estado</label>
                  <select className="input" style={{ padding: '8px 12px', fontSize: 13 }} value={filterEstado} onChange={e => setFilterEstado(e.target.value)}>
                    <option value="">Todos</option>
                    <option value="1">Activos</option>
                    <option value="0">Inactivos</option>
                  </select>
                </div>
              </div>

              <div className="card">
                {loading ? (
                  <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
                ) : filteredWorkers.length === 0 ? (
                  <div className="empty-state" style={{ padding: 60 }}>
                    <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
                    <h3>No se encontraron usuarios</h3>
                    <p>Intenta ajustar los filtros de búsqueda.</p>
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Nombre</th>
                          <th>Documento</th>
                          <th>Correo</th>
                          <th>Rol</th>
                          <th>Cargo</th>
                          <th>Ingreso</th>
                          <th>Estado</th>
                          <th>Balance Activo</th>
                          <th>Días Usados (Acum.)</th>
                          <th>Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredWorkers.map((w: any) => (
                          <tr key={w.id} style={{ opacity: w.activo === 0 ? 0.6 : 1 }}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div className="user-avatar" style={{ width: 32, height: 32, fontSize: 12, background: w.activo === 0 ? '#94a3b8' : 'var(--primary-light)' }}>
                                  {w.nombre[0]}{w.apellido[0]}
                                </div>
                                <span style={{ fontWeight: 500 }}>{w.nombre} {w.apellido}</span>
                              </div>
                            </td>
                            <td style={{ fontSize: 13 }}>{w.documento || '—'}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{w.email}</td>
                            <td><span className="badge" style={{ background: 'rgba(79,70,229,0.15)', color: 'var(--primary-light)' }}>{formatRole(w.rol)}</span></td>
                            <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{w.cargo || '—'}</td>
                            <td style={{ fontSize: 13 }}>{w.fecha_ingreso ? new Date(w.fecha_ingreso + 'T12:00:00').toLocaleDateString('es-CO') : '—'}</td>
                            <td>
                              {w.activo === 1
                                ? <span className="badge badge-approved" style={{ fontSize: 10 }}>Activo</span>
                                : <span className="badge badge-rejected" style={{ fontSize: 10, background: '#f1f5f9', color: '#64748b' }}>Inactivo</span>
                              }
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <span style={{ fontSize: 12 }}>🌴 <strong style={{ color: (w.dias_disponibles ?? 0) > 0 ? 'var(--success)' : 'var(--danger)' }}>{w.dias_disponibles ?? 0}</strong> vac.</span>
                                <span style={{ fontSize: 12 }}>☀️ <strong style={{ color: 'var(--primary-light)' }}>{w.dias_libres ?? 0}</strong> libres</span>
                                <span style={{ fontSize: 12 }}>📅 <strong style={{ color: '#10b981' }}>{w.dias_sabados ?? 0}</strong> sáb.</span>
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <span style={{ fontSize: 12 }}>⚠️ <strong style={{ color: 'var(--danger)' }}>{w.dias_calamidad ?? 0}</strong> cal. ({w.calamidades_count ?? 0} sol.)</span>
                                <span style={{ fontSize: 12 }}>🏥 <strong style={{ color: '#ef4444' }}>{w.dias_incapacidad ?? 0}</strong> inc. ({w.incapacidades_count ?? 0} sol.)</span>
                                <span style={{ fontSize: 12 }}>🩺 <strong style={{ color: '#10b981' }}>{w.dias_cita_medica ?? 0}</strong> med. ({w.citas_medicas_count ?? 0} sol.)</span>
                                <span style={{ fontSize: 12 }}>📄 <strong style={{ color: 'var(--warning)' }}>{w.dias_licencia ?? 0}</strong> lic. ({w.licencias_count ?? 0} sol.)</span>
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  title="Editar Perfil Completo"
                                  onClick={() => {
                                    setEditModal({ show: true, worker: w });
                                    setEditForm({
                                      nombre: w.nombre,
                                      apellido: w.apellido,
                                      email: w.email,
                                      password: '',
                                      rol: w.rol,
                                      cargo: w.cargo || '',
                                      fecha_ingreso: w.fecha_ingreso,
                                      director_id: w.director_id || '',
                                      documento: w.documento || ''
                                    });
                                  }}
                                >
                                  👤 ✏️
                                </button>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  title="Editar Saldo (Días)"
                                  onClick={() => { setDiasModal({ show: true, worker: w }); setDiasForm({ dias_disponibles: w.dias_disponibles ?? 15, dias_libres: w.dias_libres ?? 0, dias_sabados: w.dias_sabados ?? 0, dias_calamidad: w.dias_calamidad ?? 0, dias_incapacidad: w.dias_incapacidad ?? 0, dias_cita_medica: w.dias_cita_medica ?? 0, dias_licencia: w.dias_licencia ?? 0 }) }}
                                >
                                  🌴
                                </button>
                                <button
                                  className={`btn btn-sm ${w.activo === 1 ? 'btn-ghost' : 'btn-primary'}`}
                                  title={w.activo === 1 ? "Inactivar usuario" : "Activar usuario"}
                                  style={{ fontSize: 11, padding: '4px 8px' }}
                                  onClick={() => handleToggleStatus(w.id)}
                                  disabled={processing || user.id === w.id}
                                >
                                  {w.activo === 1 ? '⏸️' : '▶️'}
                                </button>
                                <button
                                  className="btn btn-ghost btn-sm"
                                  style={{ color: 'var(--danger)' }}
                                  onClick={() => handleDeleteWorker(w.id, w.nombre, w.apellido)}
                                  disabled={processing || user.id === w.id}
                                  title="Eliminar permanentemente"
                                >
                                  🗑️
                                </button>
                              </div>
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

          {/* ===== AUSENCIAS ===== */}
          {tab === 'ausencias' && (
            <>
              <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h1>📅 Historial de Ausencias</h1>
                  <p>Registro manual de ausencias, calamidades y días especiales</p>
                </div>
                <button className="btn btn-primary" onClick={() => setAusenciaModal(true)}>
                  ➕ Registrar Ausencia
                </button>
              </div>
              <div className="card">
                {loading ? (
                  <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner" style={{ margin: '0 auto' }}></div></div>
                ) : ausencias.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">📭</div>
                    <h3>Sin ausencias registradas</h3>
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Trabajador</th>
                          <th>Tipo</th>
                          <th>Inicio</th>
                          <th>Fin</th>
                          <th>Días</th>
                          <th>Razón</th>
                          <th>Registrado por</th>
                          <th>Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ausencias.map((a: any) => (
                          <tr key={a.id}>
                            <td style={{ fontWeight: 500 }}>{a.nombre} {a.apellido}</td>
                            <td>{getTipoBadge(a.tipo)}</td>
                            <td>{new Date(a.fecha_inicio + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                            <td>{new Date(a.fecha_fin + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                            <td>{a.dias_utilizados}</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: 13 }}>{a.razon || '—'}</td>
                            <td style={{ fontSize: 13, color: 'var(--text-muted)' }}>{a.registrado_nombre} {a.registrado_apellido} (RRHH)</td>
                            <td style={{ fontSize: 12, color: 'var(--text-dim)' }}>{new Date(a.fecha_creacion).toLocaleDateString('es-CO')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* ===== CREAR USUARIO ===== */}
          {tab === 'usuarios' && (
            <>
              <div className="page-header">
                <h1>➕ Crear Usuario</h1>
                <p>Registra nuevos colaboradores, directores o personal de RRHH</p>
              </div>
              <div className="card" style={{ maxWidth: 640 }}>
                <form onSubmit={handleCreateUser}>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Nombre *</label>
                      <input type="text" className="form-control" value={usuarioForm.nombre} onChange={e => setUsuarioForm({ ...usuarioForm, nombre: e.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Apellido *</label>
                      <input type="text" className="form-control" value={usuarioForm.apellido} onChange={e => setUsuarioForm({ ...usuarioForm, apellido: e.target.value })} required />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Correo electrónico *</label>
                    <input type="email" className="form-control" value={usuarioForm.email} onChange={e => setUsuarioForm({ ...usuarioForm, email: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Documento de Identidad *</label>
                    <input type="text" className="form-control" value={usuarioForm.documento} onChange={e => setUsuarioForm({ ...usuarioForm, documento: e.target.value })} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Contraseña *</label>
                    <input type="password" className="form-control" value={usuarioForm.password} onChange={e => setUsuarioForm({ ...usuarioForm, password: e.target.value })} required minLength={6} />
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Rol *</label>
                      <select className="form-control" value={usuarioForm.rol} onChange={e => setUsuarioForm({ ...usuarioForm, rol: e.target.value })}>
                        <option value="colaborador">Colaborador</option>
                        <option value="director">Director de Área</option>
                        <option value="gerente">Gerente</option>
                        {user.rol === 'admin' && (
                          <>
                            <option value="rrhh">Recursos Humanos</option>
                            <option value="admin">Súper Admin</option>
                          </>
                        )}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Cargo</label>
                      <input type="text" className="form-control" placeholder="Ej: Contabilidad" value={usuarioForm.cargo} onChange={e => setUsuarioForm({ ...usuarioForm, cargo: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Fecha de ingreso *</label>
                      <input type="date" className="form-control" value={usuarioForm.fecha_ingreso} onChange={e => setUsuarioForm({ ...usuarioForm, fecha_ingreso: e.target.value })} required />
                      <span style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                        ⚡ Las vacaciones y días libres serán computados en tiempo real por el servidor Node.
                      </span>
                    </div>
                  </div>
                  {['colaborador', 'director'].includes(usuarioForm.rol) && (
                    <div className="form-group">
                      <label className="form-label">Director asignado</label>
                      {usuarioForm.rol === 'director' ? (
                        <div className="form-control" style={{ background: 'var(--bg-card2)', color: 'var(--text-muted)' }}>
                          🔒 Se auto-asignará al Gerente activo (si existe).
                        </div>
                      ) : (
                        <select className="form-control" value={usuarioDirectorId} onChange={e => setUsuarioDirectorId(e.target.value)}>
                          <option value="">Seleccionar director (opcional)...</option>
                          {directores.filter(j => user.rol === 'admin' || j.rol !== 'admin').map((j: any) => (
                            <option key={j.id} value={j.id}>{j.nombre} {j.apellido} {j.cargo ? `(${j.cargo})` : ''} - {j.rol}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 12 }}>
                    <button type="submit" className="btn btn-primary" disabled={processing}>
                      {processing ? '⏳ Creando...' : '✅ Crear Usuario'}
                    </button>
                    <button type="reset" className="btn btn-ghost" onClick={() => setUsuarioForm({ nombre: '', apellido: '', email: '', password: '', rol: 'colaborador', cargo: '', fecha_ingreso: '', documento: '' })}>
                      🔄 Limpiar
                    </button>
                  </div>
                </form>
              </div>
            </>
          )}

          {/* ===== MIS PERMISOS ===== */}
          {tab === 'mis_permisos' && (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h1>👤 Mis Permisos</h1>
                  <p>Solicita y revisa el estado de tus permisos como RRHH</p>
                </div>
                <button className="btn btn-primary" onClick={() => { setShowMyModal(true); setMyError(''); setMySuccess('') }}>
                  ➕ Nueva Solicitud
                </button>
              </div>

              {myBalance && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                      📥 Saldo disponible
                    </p>
                  </div>
                  <div className="grid-3" style={{ marginBottom: 24 }}>
                    <div className="stat-card" style={{ padding: '16px 20px' }}>
                      <div className="stat-icon" style={{ background: 'rgba(79,70,229,0.15)', color: 'var(--primary-light)' }}>🌴</div>
                      <div>
                        <div className="stat-value" style={{ color: balColor(myBalance.dias_disponibles) }}>{myBalance.dias_disponibles}</div>
                        <div className="stat-label">Vacaciones</div>
                      </div>
                    </div>
                    <div className="stat-card" style={{ padding: '16px 20px' }}>
                      <div className="stat-icon" style={{ background: 'rgba(34,197,94,0.15)', color: 'var(--success)' }}>☀️</div>
                      <div>
                        <div className="stat-value" style={{ color: balColor(myBalance.dias_libres) }}>{myBalance.dias_libres}</div>
                        <div className="stat-label">Días Libres</div>
                      </div>
                    </div>
                    <div className="stat-card" style={{ padding: '16px 20px' }}>
                      <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>📅</div>
                      <div>
                        <div className="stat-value" style={{ color: balColor(myBalance.dias_sabados) }}>{myBalance.dias_sabados}</div>
                        <div className="stat-label">Sábados</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                      📤 Ausencias especiales (acumulativos)
                    </p>
                  </div>
                  <div className="grid-4" style={{ marginBottom: 28 }}>
                    <div className="stat-card" style={{ padding: '14px 18px' }}>
                      <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)', width: 36, height: 36, fontSize: 18 }}>⚠️</div>
                      <div>
                        <div className="stat-value" style={{ fontSize: 22 }}>{myBalance.dias_calamidad}</div>
                        <div className="stat-label">Calamidad</div>
                      </div>
                    </div>
                    <div className="stat-card" style={{ padding: '14px 18px' }}>
                      <div className="stat-icon" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', width: 36, height: 36, fontSize: 18 }}>🏥</div>
                      <div>
                        <div className="stat-value" style={{ fontSize: 22 }}>{myBalance.dias_incapacidad}</div>
                        <div className="stat-label">Incapacidad</div>
                      </div>
                    </div>
                    <div className="stat-card" style={{ padding: '14px 18px' }}>
                      <div className="stat-icon" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', width: 36, height: 36, fontSize: 18 }}>🩺</div>
                      <div>
                        <div className="stat-value" style={{ fontSize: 22 }}>{myBalance.dias_cita_medica}</div>
                        <div className="stat-label">Citas Médicas</div>
                      </div>
                    </div>
                    <div className="stat-card" style={{ padding: '14px 18px' }}>
                      <div className="stat-icon" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--warning)', width: 36, height: 36, fontSize: 18 }}>📄</div>
                      <div>
                        <div className="stat-value" style={{ fontSize: 22 }}>{myBalance.dias_licencia}</div>
                        <div className="stat-label">Lic. No Rem.</div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {mySuccess && <div className="success-msg" style={{ marginBottom: 20 }}>{mySuccess}</div>}

              <div className="card">
                <div className="card-title">📋 Historial de mis solicitudes</div>
                {myPermisos.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">📭</div>
                    <p>Aún no has realizado solicitudes</p>
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
                          <th>Aprobador</th>
                          <th>Estado</th>
                          <th>Soporte</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myPermisos.map((p: any) => (
                          <tr key={p.id}>
                            <td>{getTipoBadge(p.tipo_permiso)}</td>
                            <td>{new Date(p.fecha_salida + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                            <td>{new Date(p.fecha_regreso + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                            <td><strong>{p.dias_solicitados}</strong></td>
                            <td style={{ fontSize: 13 }}>{p.director_nombre} (Gerente)</td>
                            <td>{getStatusBadge(p.estado)}</td>
                            <td>
                              {p.soporte ? (
                                <a href={permissionService.getSoporteUrl(p.soporte)} target="_blank" rel="noreferrer" download className="btn btn-secondary btn-sm">
                                  ⬇️ Descargar
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
            </div>
          )}
        </div>
      </main>

      {/* Modal: Asignar días */}
      {diasModal.show && diasModal.worker && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">✏️ Editar Días — {diasModal.worker.nombre} {diasModal.worker.apellido}</h2>
              <button className="modal-close" onClick={() => setDiasModal({ show: false, worker: null })}>✕</button>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Vacaciones Disponibles</label>
                <input type="number" className="form-control" value={diasForm.dias_disponibles} min={0} onChange={e => setDiasForm({ ...diasForm, dias_disponibles: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="form-group">
                <label className="form-label">Días Libres</label>
                <input type="number" className="form-control" value={diasForm.dias_libres} min={0} onChange={e => setDiasForm({ ...diasForm, dias_libres: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Sábados Libres</label>
                <input type="number" className="form-control" value={diasForm.dias_sabados} min={0} onChange={e => setDiasForm({ ...diasForm, dias_sabados: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="form-group">
                <label className="form-label">Calamidad (Total Acumulado)</label>
                <input type="number" className="form-control" value={diasForm.dias_calamidad} min={0} onChange={e => setDiasForm({ ...diasForm, dias_calamidad: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Incapacidad (Total Acumulado)</label>
                <input type="number" className="form-control" value={diasForm.dias_incapacidad} min={0} onChange={e => setDiasForm({ ...diasForm, dias_incapacidad: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="form-group">
                <label className="form-label">Citas Médicas (Total Acumulado)</label>
                <input type="number" className="form-control" value={diasForm.dias_cita_medica} min={0} onChange={e => setDiasForm({ ...diasForm, dias_cita_medica: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Licencia No Remun. (Total Acumulado)</label>
              <input type="number" className="form-control" value={diasForm.dias_licencia} min={0} onChange={e => setDiasForm({ ...diasForm, dias_licencia: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setDiasModal({ show: false, worker: null })}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleAssignDays} disabled={processing}>
                {processing ? '⏳ Guardando...' : '💾 Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar ausencia */}
      {ausenciaModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">📅 Registrar Ausencia</h2>
              <button className="modal-close" onClick={() => setAusenciaModal(false)}>✕</button>
            </div>
            <form onSubmit={handleRegisterAbsence}>
              <div className="form-group">
                <label className="form-label">Trabajador *</label>
                <select className="form-control" value={ausenciaForm.workerId} onChange={e => setAusenciaForm({ ...ausenciaForm, workerId: e.target.value })} required>
                  <option value="">Seleccionar trabajador...</option>
                  {workers.filter(w => user.rol === 'admin' || w.rol !== 'admin').map((w: any) => (
                    <option key={w.id} value={w.id}>{w.nombre} {w.apellido}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tipo *</label>
                <select className="form-control" value={ausenciaForm.tipo} onChange={e => setAusenciaForm({ ...ausenciaForm, tipo: e.target.value })}>
                  <option value="ausencia">🚨 Ausencia injustificada</option>
                  <option value="calamidad">⚠️ Calamidad</option>
                  <option value="dia_libre">☀️ Día libre</option>
                  <option value="vacacion">🌴 Vacación</option>
                  <option value="sabado">📅 Sábado Compensatorio</option>
                  <option value="incapacidad">🏥 Incapacidad</option>
                  <option value="cita_medica">🩺 Cita Médica</option>
                  <option value="licencia_no_remunerada">📄 Licencia no Remunerada</option>
                </select>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Fecha inicio *</label>
                  <input type="date" className="form-control" value={ausenciaForm.fecha_inicio} onChange={e => setAusenciaForm({ ...ausenciaForm, fecha_inicio: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha fin *</label>
                  <input type="date" className="form-control" value={ausenciaForm.fecha_fin} onChange={e => setAusenciaForm({ ...ausenciaForm, fecha_fin: e.target.value })} required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Días utilizados (Calculado automáticamente)</label>
                <input
                  type="number"
                  className="form-control"
                  style={{ background: 'var(--bg-card2)', cursor: 'not-allowed' }}
                  value={(() => {
                    if (!ausenciaForm.fecha_inicio || !ausenciaForm.fecha_fin) return 0;
                    const start = new Date(ausenciaForm.fecha_inicio + 'T12:00:00');
                    const end = new Date(ausenciaForm.fecha_fin + 'T12:00:00');
                    if (end < start) return 0;
                    let count = 0;
                    let curr = new Date(start);
                    while (curr <= end) {
                      if (curr.getDay() !== 0) count++;
                      curr.setDate(curr.getDate() + 1);
                    }
                    // Sincronizar con el estado para el envío (opcional pero recomendado si el backend lo requiere)
                    if (ausenciaForm.dias_utilizados !== count) {
                      setTimeout(() => setAusenciaForm(prev => ({ ...prev, dias_utilizados: count })), 0);
                    }
                    return count;
                  })()}
                  readOnly
                />
                {ausenciaForm.tipo === 'vacacion' && ausenciaForm.workerId && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--primary-dark)', fontWeight: 500 }}>
                    🌴 Saldo actual: {workers.find(w => w.id === parseInt(ausenciaForm.workerId))?.dias_disponibles ?? 0} días disponibles.
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Razón / Descripción</label>
                <textarea className="form-control" rows={3} value={ausenciaForm.razon} onChange={e => setAusenciaForm({ ...ausenciaForm, razon: e.target.value })} style={{ resize: 'none' }} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setAusenciaModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={processing}>
                  {processing ? '⏳ Guardando...' : '💾 Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Perfil Completo */}
      {editModal.show && editModal.worker && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h2 className="modal-title">👤 Editar Perfil: {editModal.worker.nombre} {editModal.worker.apellido}</h2>
              <button className="modal-close" onClick={() => setEditModal({ show: false, worker: null })}>✕</button>
            </div>
            <form onSubmit={handleUpdateWorker}>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Nombre</label>
                  <input type="text" className="form-control" value={editForm.nombre} onChange={e => setEditForm({ ...editForm, nombre: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Apellido</label>
                  <input type="text" className="form-control" value={editForm.apellido} onChange={e => setEditForm({ ...editForm, apellido: e.target.value })} required />
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Email / Usuario</label>
                  <input type="email" className="form-control" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label className="form-label">Documento</label>
                  <input type="text" className="form-control" value={editForm.documento} onChange={e => setEditForm({ ...editForm, documento: e.target.value })} required />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Nueva Contraseña (Opcional)</label>
                <input type="password" placeholder="Dejar vacío para no cambiar" className="form-control" value={editForm.password} onChange={e => setEditForm({ ...editForm, password: e.target.value })} />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Rol</label>
                  <select className="form-control" value={editForm.rol} onChange={e => setEditForm({ ...editForm, rol: e.target.value })} required>
                    <option value="colaborador">Colaborador</option>
                    <option value="director">Director</option>
                    <option value="gerente">Gerente</option>
                    <option value="rrhh">RRHH</option>
                    {user.rol === 'admin' && <option value="admin">Administrador</option>}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Cargo</label>
                  <input type="text" className="form-control" value={editForm.cargo} onChange={e => setEditForm({ ...editForm, cargo: e.target.value })} />
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Director Directo / Aprobador</label>
                  <select className="form-control" value={editForm.director_id} onChange={e => setEditForm({ ...editForm, director_id: e.target.value })}>
                    <option value="">Ninguno (Independiente)</option>
                    {directores.filter(j => j.id !== editModal.worker.id).map((j: any) => (
                      <option key={j.id} value={j.id}>{j.nombre} {j.apellido} ({j.rol})</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha de Ingreso</label>
                  <input type="date" className="form-control" value={editForm.fecha_ingreso} onChange={e => setEditForm({ ...editForm, fecha_ingreso: e.target.value })} required />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setEditModal({ show: false, worker: null })}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={processing}>
                  {processing ? '⏳ Guardando...' : '💾 Actualizar Perfil'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nueva Solicitud (Propia de RRHH) */}
      {showMyModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowMyModal(false) }}>
          <div className="modal" style={{ animation: 'modalIn 0.3s ease-out' }}>
            <div className="modal-header">
              <h2 className="modal-title">➕ Nueva Solicitud</h2>
              <button className="modal-close" onClick={() => setShowMyModal(false)}>✕</button>
            </div>

            {myError && <div className="error-msg" style={{ marginBottom: 16 }}>⚠️ {myError}</div>}

            <form onSubmit={handleMySubmit}>
              <div className="form-group">
                <label className="form-label">Tipo de permiso</label>
                <select
                  className="form-control"
                  value={myForm.tipo_permiso}
                  onChange={e => setMyForm({ ...myForm, tipo_permiso: e.target.value })}
                >
                  <option value="vacaciones">🌴 Vacaciones (descuenta saldo)</option>
                  <option value="dia_libre">☀️ Día Libre (descuenta saldo)</option>
                  <option value="sabado">📅 Sábado Computado (descuenta saldo)</option>
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
                    value={myForm.fecha_salida}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={e => setMyForm({ ...myForm, fecha_salida: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha de regreso</label>
                  <input
                    type="date"
                    className="form-control"
                    value={myForm.fecha_regreso}
                    min={myForm.fecha_salida || new Date().toISOString().split('T')[0]}
                    onChange={e => setMyForm({ ...myForm, fecha_regreso: e.target.value })}
                    required
                  />
                </div>
              </div>

              {calcMyDias() > 0 && (
                <div className={`alert ${myForm.tipo_permiso === 'vacaciones' && calcMyDias() > (myBalance?.dias_disponibles || 0) ? 'alert-warning' : 'alert-info'}`} style={{ marginBottom: 20 }}>
                  📅 Total de días hábiles: <strong>{calcMyDias()}</strong>
                  {myForm.tipo_permiso === 'vacaciones' && (
                    <span> · Disponibles: <strong style={{ color: balColor(myBalance?.dias_disponibles || 0) }}>{myBalance?.dias_disponibles || 0}</strong></span>
                  )}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Observación (opcional)</label>
                <textarea
                  className="form-control"
                  rows={2}
                  placeholder="Explica el motivo de tu solicitud..."
                  value={myForm.observacion}
                  onChange={e => setMyForm({ ...myForm, observacion: e.target.value })}
                  style={{ resize: 'none' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">📎 Adjuntar soporte (PDF, Imagen, etc.)</label>
                <input
                  type="file"
                  className="form-control"
                  ref={fileRef}
                  onChange={e => setMySoporteFile(e.target.files?.[0] || null)}
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                />
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', paddingTop: 20 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowMyModal(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={processing}>
                  {processing ? '⏳ Enviando...' : '🚀 Enviar Solicitud'}
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
