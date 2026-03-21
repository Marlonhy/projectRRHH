import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getDB } from '../config/database';

// Crear carpeta de uploads si no existe
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configurar multer para guardar archivos con nombre único
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `soporte-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  // Permitir imágenes, PDF, Word, Excel
  const allowed = /\.(jpg|jpeg|png|gif|pdf|doc|docx|xls|xlsx)$/i;
  if (allowed.test(file.originalname)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de archivo no permitido. Solo se aceptan: imágenes, PDF, Word, Excel'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB máximo
});

/**
 * Subir un archivo de soporte para una solicitud
 * POST /api/permissions/upload-soporte
 */
export const uploadSoporte = (req: Request, res: Response): void => {
  // multer ya procesó el archivo
  if (!req.file) {
    res.status(400).json({ error: 'No se recibió ningún archivo' });
    return;
  }

  res.status(200).json({
    fileName: req.file.filename,
    originalName: req.file.originalname,
    size: req.file.size,
    url: `/api/permissions/soporte/${req.file.filename}`,
  });
};

/**
 * Descargar/ver un archivo de soporte
 * GET /api/permissions/soporte/:filename
 */
export const downloadSoporte = (req: Request, res: Response): void => {
  const { filename } = req.params;
  
  // Sanitize filename to prevent path traversal
  const sanitized = path.basename(filename);
  const filePath = path.join(uploadsDir, sanitized);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Archivo no encontrado' });
    return;
  }

  res.download(filePath, sanitized);
};
