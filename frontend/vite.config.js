import { defineConfig, loadEnv } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Merge: root .env (base) + frontend/.env (overrides)
  // This lets OBSERVER_ADDRESS live in the project root .env alongside CRE vars
  const rootEnv = loadEnv(mode, resolve(process.cwd(), '..'), '')
  const localEnv = loadEnv(mode, process.cwd(), '')
  const env = { ...rootEnv, ...localEnv }
  const apiBase = env.API_BASE || 'https://dev-api-mercado-bitcoin.web3up.mobi'

  return {
    plugins: [react()],
    define: {
      'import.meta.env.OBSERVER_ADDRESS':      JSON.stringify(env.OBSERVER_ADDRESS      || ''),
      'import.meta.env.OBSERVER_FUND_ADDRESS': JSON.stringify(env.OBSERVER_FUND_ADDRESS || ''),
    },
    server: {
      port: 5175,
      strictPort: false,
      proxy: {
        // Proxy Capitare Observer API calls to avoid CORS in dev
        '/observer-api': {
          target: apiBase,
          changeOrigin: true,
          rewrite: path => path.replace(/^\/observer-api/, '/v1/external/observer'),
        },
        // Proxy workflow-observer HTTP trigger (local sim)
        '/cre-observer-proxy': {
          target: env.CRE_OBSERVER_PROXY_TARGET || 'http://localhost:2000/trigger',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/cre-observer-proxy/, ''),
        },
      },
    },
  }
})
