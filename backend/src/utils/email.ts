/**
 * @file email.ts
 * @description Servicio de notificaciones vía correo electrónico.
 * Utiliza `nodemailer` para conectarse a un servidor SMTP (Outlook Office365 preconfigurado).
 * Despacha correos automáticos usando plantillas HTML inyectando variables dinámicas (fechas, nombres, estado).
 */
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Servicio de Notificaciones por Email
 * Gestiona el envío de alertas automáticas para aprobaciones y rechazos de permisos.
 */
const transporter = nodemailer.createTransport({
  service: 'gmail', // Configuración optimizada de Nodemailer para Gmail
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  // REDIRECCIÓN DE PRUEBAS: Si EMAIL_TEST_MODE = true, todo va al correo de Marlon
  const isTestMode = process.env.EMAIL_TEST_MODE === 'true';
  const testEmail = process.env.EMAIL_USER || 'mehernandez017@gmail.com';
  
  const recipient = isTestMode ? testEmail : options.to;
  const subject = isTestMode ? `[PRUEBA - Para: ${options.to}] ${options.subject}` : options.subject;
  
  if (isTestMode) {
    console.log(`📧 [MODO PRUEBA] Redirigiendo correo de {${options.to}} hacia {${testEmail}}`);
  } else {
    console.log(`📧 Enviando correo real a {${options.to}}`);
  }
  
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || `"RRHH System" <${testEmail}>`,
      to: recipient,
      subject: subject,
      html: isTestMode ? `
        <div style="background: #fff3cd; padding: 10px; border: 1px solid #ffeeba; margin-bottom: 20px; font-family: sans-serif;">
          <strong>Nota de Desarrollo:</strong> Este correo originalmente iba dirigido a: <u>${options.to}</u>. 
          El sistema está en <b>Modo Prueba</b>.
        </div>
        ${options.html}
      ` : options.html,
      text: options.text,
    });
    console.log(`✅ Email enviado exitosamente: ${info.messageId}`);
  } catch (error) {
    console.error('❌ ERROR enviando email:', error);
    throw error;
  }
};

export const sendPermissionRequestEmail = async (
  directorMail: string,
  colaboradorNombre: string,
  fechaSalida: string,
  fechaRegreso: string,
  tipoPermiso: string,
  permissionId: number
): Promise<void> => {
  const approveLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/aprobar/${permissionId}`;
  const rejectLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/rechazar/${permissionId}`;

  const html = `
    <h2>Solicitud de Permiso</h2>
    <p>El colaborador <strong>${colaboradorNombre}</strong> ha solicitado un permiso.</p>
    <ul>
      <li><strong>Tipo:</strong> ${tipoPermiso}</li>
      <li><strong>Fecha de salida:</strong> ${fechaSalida}</li>
      <li><strong>Fecha de regreso:</strong> ${fechaRegreso}</li>
    </ul>
    <p>
      <a href="${approveLink}" style="background-color: #27ae60; color: white; padding: 10px 20px; margin-right: 10px; text-decoration: none;">Aprobar</a>
      <a href="${rejectLink}" style="background-color: #e74c3c; color: white; padding: 10px 20px; text-decoration: none;">Rechazar</a>
    </p>
    <p>O ingresa a la plataforma para revisar en detalle.</p>
  `;

  await sendEmail({
    to: directorMail,
    subject: `[RRHH] Solicitud de Permiso - ${colaboradorNombre}`,
    html,
  });
};

export const sendPermissionApprovedEmail = async (
  colaboradorMail: string,
  colaboradorNombre: string,
  fechaSalida: string,
  fechaRegreso: string
): Promise<void> => {
  const html = `
    <h2>Permiso Aprobado</h2>
    <p>Hola <strong>${colaboradorNombre}</strong>,</p>
    <p>Tu solicitud de permiso ha sido <strong style="color: #27ae60;">APROBADA</strong>.</p>
    <ul>
      <li><strong>Fecha de salida:</strong> ${fechaSalida}</li>
      <li><strong>Fecha de regreso:</strong> ${fechaRegreso}</li>
    </ul>
    <p>Que disfrutes tu tiempo libre.</p>
  `;

  await sendEmail({
    to: colaboradorMail,
    subject: '[RRHH] Permiso Aprobado',
    html,
  });
};

export const sendPermissionRejectedEmail = async (
  colaboradorMail: string,
  colaboradorNombre: string,
  razon: string
): Promise<void> => {
  const html = `
    <h2>Permiso Rechazado</h2>
    <p>Hola <strong>${colaboradorNombre}</strong>,</p>
    <p>Tu solicitud de permiso ha sido <strong style="color: #e74c3c;">RECHAZADA</strong>.</p>
    <p><strong>Razón:</strong> ${razon}</p>
    <p>Por favor, contacta a tu director para más información.</p>
  `;

  await sendEmail({
    to: colaboradorMail,
    subject: '[RRHH] Permiso Rechazado',
    html,
  });
};
