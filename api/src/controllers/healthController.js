import { verifyDatabaseConnection } from '../config/db.js'

export async function getHealth(_request, response) {
  try {
    await verifyDatabaseConnection()
    response.status(200).json({ status: 'ok', database: 'connected' })
  } catch (error) {
    response.status(503).json({ status: 'error', database: 'unavailable' })
  }
}
