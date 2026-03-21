import { getDB, connectDB } from './config/database';
import { hashPassword } from './utils/auth';

const seed = async () => {
    try {
        connectDB();
        const db = getDB();

        const email = 'alexandra.hernandez@viajarltda.com';

        // Verificar si ya existe
        const existingUser = db.prepare('SELECT id FROM Usuarios WHERE email = ?').get(email);

        if (existingUser) {
            console.log('El usuario RRHH ya existe.');
            return;
        }

        const hashedPassword = await hashPassword('Viajar2026*');

        const insertUser = db.prepare(`
      INSERT INTO Usuarios (email, password, nombre, apellido, rol, fecha_ingreso, cargo)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

        const result = insertUser.run(
            email,
            hashedPassword,
            'Alexandra',
            'Hernandez',
            'rrhh',
            '2026-03-18',
            'Recursos Humanos'
        );

        const userId = result.lastInsertRowid;

        const currentYear = new Date().getFullYear();
        db.prepare(`
      INSERT OR IGNORE INTO PermisosDisponibles (usuario_id, dias_disponibles, ano)
      VALUES (?, 15, ?)
    `).run(userId, currentYear);

        console.log('✅ Usuario Administrador/RRHH creado exitosamente.');
        console.log(`Email: ${email}`);
        console.log('Contraseña: la proporcionada por usted (Viajar2026*)');

    } catch (error) {
        console.error('Error seeding data:', error);
    }
};

seed();
