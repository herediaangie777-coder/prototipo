import 'dotenv/config'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const nodemonPath = fileURLToPath(new URL('../../node_modules/nodemon/bin/nodemon.js', import.meta.url))
const child = spawn(process.execPath, [nodemonPath, 'api/src/server.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'development',
    AUTH_BYPASS_LOCAL: process.env.AUTH_BYPASS_LOCAL ?? 'true',
  },
  stdio: 'inherit',
})

child.on('error', (error) => {
  console.error('No fue posible iniciar nodemon.', error)
  process.exitCode = 1
})

child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
