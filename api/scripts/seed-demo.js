import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

function buildPoolConfig() {
  if (process.env.DATABASE_URL) {
    const useSsl = process.env.DB_SSL !== 'false'
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
    }
  }
  return {
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: false,
  }
}

const pool = new Pool(buildPoolConfig())

const USUARIOS_DEMO = [
  {
    correo: 'admin@fresas.co',
    contrasenia: 'Admin123*',
    nombre: 'Laura',
    apellido: 'Gómez',
    rol: 'Super Administrador',
  },
  {
    correo: 'ventas@fresas.co',
    contrasenia: 'Ventas123*',
    nombre: 'Carlos',
    apellido: 'Ruiz',
    rol: 'Vendedor',
  },
  {
    correo: 'operario@fresas.co',
    contrasenia: 'Operario123*',
    nombre: 'Ana',
    apellido: 'Martínez',
    rol: 'Operario',
  },
]

async function seed() {
  const client = await pool.connect()
  try {
    for (const u of USUARIOS_DEMO) {
      const exists = await client.query('SELECT 1 FROM public.usuarios WHERE correo = $1', [u.correo])
      if (exists.rowCount > 0) {
        console.log(`Usuario ${u.correo} ya existe, se omite.`)
        continue
      }

      const rolResult = await client.query('SELECT id_rol FROM public.roles WHERE nombre_rol = $1', [u.rol])
      if (rolResult.rowCount === 0) {
        console.error(`Rol "${u.rol}" no encontrado para ${u.correo}`)
        continue
      }

      await client.query(
        `INSERT INTO public.usuarios (id_rol, nombre, apellido, correo, contrasenia, estado)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [rolResult.rows[0].id_rol, u.nombre, u.apellido, u.correo, u.contrasenia]
      )
      console.log(`Usuario ${u.correo} creado con rol ${u.rol}.`)
    }
    console.log('Seed completado.')
  } catch (error) {
    console.error('Error en seed:', error)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

seed()