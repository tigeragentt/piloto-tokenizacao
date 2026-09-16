import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const capitareBase = env.CAPITARE_BASE || 'https://dev-api-mercado-bitcoin.web3up.mobi'

  return {
    plugins: [react()],
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
