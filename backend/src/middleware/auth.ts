import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      email?: string;
      role?: string;
    }
  }
}

/**
 * Middleware de Autenticación
 * Extrae el Bearer Token de los headers, lo verifica y decora el objeto Request
 * con la información del usuario (id, email, rol) para uso en controladores.
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const decoded = verifyToken(token);
    req.userId = decoded.userId;
    req.email = decoded.email;
    req.role = decoded.role;

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido' });
  }
};

export const roleMiddleware = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.role || !allowedRoles.includes(req.role)) {
      return res.status(403).json({ error: 'Acceso no autorizado' });
    }
    next();
  };
};
