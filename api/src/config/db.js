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

export const pool = new Pool(buildPoolConfig())

export async function verifyDatabaseConnection() {
  const client = await pool.connect()
  try {
    await client.query('SELECT 1')
  } finally {
    client.release()
  }
}

const numericOid = 1700
const dateOid = 1082
const timestampOid = 1114

const numericParser = (value) => (value === null ? null : Number(value))
const dateParser = (value) => (value === null ? null : value)
const timestampParser = (value) => (value === null ? null : value)

pg.types.setTypeParser(numericOid, numericParser)
pg.types.setTypeParser(dateOid, dateParser)
pg.types.setTypeParser(timestampOid, timestampParser)