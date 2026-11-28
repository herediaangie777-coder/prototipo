import 'dotenv/config'
import { app } from './app.js'
import { pool, verifyDatabaseConnection } from './config/db.js'

const port = Number(process.env.PORT) || 3003

async function startServer() {
  try {
    const localBypass = process.env.NODE_ENV === 'development' && process.env.AUTH_BYPASS_LOCAL === 'true'
    if (!localBypass && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
      throw new Error('JWT_SECRET debe tener al menos 32 caracteres fuera del bypass local de desarrollo.')
    }
    await verifyDatabaseConnection()
    app.listen(port, '0.0.0.0', () => {
      console.log(`API disponible en http://localhost:${port}`)
    })
  } catch (error) {
    console.error('No fue posible iniciar la API.', error?.code ?? '', error?.message ?? error)
    await pool.end()
    process.exitCode = 1
  }
}

startServer()