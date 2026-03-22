import React, { useState } from 'react'
import { authService } from '../services/api'
import { UserData } from '../App'

interface ProfileModalProps {
  user: UserData
  isOpen: boolean
  onClose: () => void
}

const ProfileModal: React.FC<ProfileModalProps> = ({ user, isOpen, onClose }) => {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas nuevas no coinciden')
      return
    }

    if (newPassword.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres')
      return
    }

    setLoading(true)
    try {
      await authService.changePassword({ currentPassword, newPassword })
      setSuccess('Contraseña actualizada exitosamente')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error al cambiar la contraseña')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('es-CO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h2 className="modal-title">👤 Mi Perfil</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '24px' }}>
            <div className="info-section">
              <h3 style={{ fontSize: '14px', color: 'var(--primary-light)', marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                Información Personal
              </h3>
              <div className="info-item" style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>Nombre Completo</label>
                <div style={{ fontSize: '14px' }}>{user.nombre} {user.apellido}</div>
              </div>
              <div className="info-item" style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>Correo Electrónico</label>
                <div style={{ fontSize: '14px' }}>{user.email}</div>
              </div>
              <div className="info-item" style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>Documento / Cédula</label>
                <div style={{ fontSize: '14px' }}>{user.documento || 'N/A'}</div>
              </div>
            </div>

            <div className="info-section">
              <h3 style={{ fontSize: '14px', color: 'var(--primary-light)', marginBottom: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                Detalles Laborales
              </h3>
              <div className="info-item" style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>Rol en el Sistema</label>
                <div style={{ fontSize: '14px', textTransform: 'capitalize' }}>{user.rol}</div>
              </div>
              <div className="info-item" style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>Cargo</label>
                <div style={{ fontSize: '14px' }}>{user.cargo || 'No asignado'}</div>
              </div>
              <div className="info-item" style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>Fecha de Ingreso</label>
                <div style={{ fontSize: '14px' }}>{formatDate(user.fecha_ingreso)}</div>
              </div>
            </div>
          </div>

          <form onSubmit={handleChangePassword} style={{ marginTop: '20px', padding: '20px', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: '14px', color: 'var(--primary-light)', marginBottom: '16px' }}>
              🔒 Cambiar Contraseña
            </h3>
            
            {error && <div className="error-msg">{error}</div>}
            {success && <div className="success-msg">{success}</div>}

            <div className="form-group">
              <label className="form-label">Contraseña Actual</label>
              <input 
                type="password" 
                className="form-control" 
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
              />
            </div>

            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">Nueva Contraseña</label>
                <input 
                  type="password" 
                  className="form-control" 
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Confirmar Contraseña</label>
                <input 
                  type="password" 
                  className="form-control" 
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-full" disabled={loading} style={{ marginTop: '8px' }}>
              {loading ? <div className="spinner" style={{ width: '16px', height: '16px' }}></div> : 'Actualizar Contraseña'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default ProfileModal
