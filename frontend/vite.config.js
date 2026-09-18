import { defineConfig, loadEnv } from 'vite'
import { resolve } from 'path'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Merge: root .env (base) + frontend/.env (overrides)
  // This lets OBSERVER_ADDRESS live in the project root .env alongside CRE vars
  const rootEnv = loadEnv(mode, resolve(process.cwd(), '..'), '')
  const localEnv = loadEnv(mode, process.cwd(), '')
  const env = { ...rootEnv, ...localEnv }
  const capitareBase = env.CAPITARE_BASE || 'https://dev-api-mercado-bitcoin.web3up.mobi'

  return {
    plugins: [react()],
    define: {
      'import.meta.env.OBSERVER_ADDRESS': JSON.stringify(env.OBSERVER_ADDRESS || ''),
    },
    server: {
      port: 5175,
      strictPort: false,
      proxy: {
        // Proxy Capitare Observer API calls to avoid CORS in dev
        '/capitare-api': {
          target: capitareBase,
          changeOrigin: true,
          rewrite: path => path.replace(/^\/capitare-api/, '/v1/external/observer'),
        },
        // Proxy workflow-capitare HTTP trigger (local sim)
        '/cre-capitare-proxy': {
          target: env.CRE_CAPITARE_PROXY_TARGET || 'http://localhost:2000/trigger',
          changeOrigin: true,
          rewrite: path => path.replace(/^\/cre-capitare-proxy/, ''),
        },
      },
    },
  }
})
