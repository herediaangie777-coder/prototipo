import 'dotenv/config'
import { app } from './app.js'
import { pool, verifyDatabaseConnection } from './config/db.js'

const port = Number(process.env.PORT) || 3003

async function startServer() {
  try {
    await verifyDatabaseConnection()
    app.listen(port, '0.0.0.0', () => {
      console.log(`API disponible en http://localhost:${port}`)
    })
  } catch (error) {
    console.error('No fue posible conectar con PostgreSQL al iniciar.', error?.code ?? '', error?.message ?? error)
    await pool.end()
    process.exitCode = 1
  }
}

startServer()