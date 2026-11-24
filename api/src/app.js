import cors from 'cors'
import express from 'express'
import { healthRouter } from './routes/healthRoutes.js'
import { resourceRouter } from './routes/resourceRoutes.js'
import { customRouter } from './routes/customRoutes.js'

function getCorsOrigins() {
  if (process.env.CORS_ORIGIN) {
    return process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  }
  return ['http://localhost:5173', 'http://localhost:3000']
}

export const app = express()

app.use(cors({ origin: getCorsOrigins() }))
app.use(express.json())

app.use('/api', healthRouter)
app.use('/api', resourceRouter)
app.use('/api', customRouter)

app.use((error, _request, response, _next) => {
  if (error.code === '23503') {
    const detail = error.detail ?? error.message ?? ''
    if (detail.includes('is still referenced')) {
      response.status(409).json({ error: 'No se puede eliminar: el registro tiene información asociada.' })
      return
    }
    response.status(400).json({ error: 'El registro relacionado no existe.' })
    return
  }

  const databaseErrors = {
    '23502': 'Falta un campo obligatorio.',
    '23505': 'Ya existe un registro con ese valor único.',
    '22P02': 'El formato de uno de los valores no es válido.',
    '23514': 'Uno de los valores no cumple una restricción de la base de datos.',
  }
  const message = databaseErrors[error.code]

  if (message) {
    response.status(400).json({ error: message, detail: error.detail ?? error.message })
    return
  }

  console.error(error)
  response.status(500).json({ error: 'Error interno del servidor.' })
})