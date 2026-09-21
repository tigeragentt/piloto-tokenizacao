#!/usr/bin/env node
// Local mock for the Observer API.
// Serves routes used by the CRE workflow and frontend.
// No external dependencies — uses Node built-in http only.
//
// Usage:
//   node test/mock-server.js          (port 3001)
//   PORT=4000 node test/mock-server.js
//
// Then set API_BASE_URL=http://localhost:3001/v1/external/observer
// in .env and use config.test.json for cre workflow simulate.

const http = require('http')
const fs   = require('fs')
const path = require('path')

const PORT    = Number(process.env.PORT) || 3001
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'))
const FUND_ID  = fixtures._fund_id

function send(res, statusCode, body) {
  const payload = JSON.stringify(body)
  res.writeHead(statusCode, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'X-Observer-Id, X-Observer-Key, Accept',
  })
  res.end(payload)
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { send(res, 200, {}); return }

  const base = `/v1/external/observer/funds/${FUND_ID}/debenture-orders`
  const url  = req.url.split('?')[0]

  console.log(`→ ${req.method} ${url}`)

  // GET /funds/{fundId}/debenture-orders
  if (url === base) {
    send(res, 200, fixtures.orders)
    return
  }

  // GET /funds/{fundId}/debenture-orders/{orderId}/settlement
  const settlementMatch = url.match(new RegExp(`^${base}/(.+)/settlement$`))
  if (settlementMatch) {
    const orderId = settlementMatch[1]
    const data = fixtures.settlements[orderId]
    if (!data) { send(res, 404, { error: 'not found' }); return }
    send(res, 200, data)
    return
  }

  // GET /funds/{fundId}/debenture-orders/{orderId}/proof
  const proofMatch = url.match(new RegExp(`^${base}/(.+)/proof$`))
  if (proofMatch) {
    const orderId = proofMatch[1]
    const data = fixtures.proofs[orderId]
    if (!data) { send(res, 404, { error: 'not found' }); return }
    send(res, 200, data)
    return
  }

  send(res, 404, { error: `no mock for ${url}` })
})

server.listen(PORT, () => {
  console.log(`Observer API mock server running on http://localhost:${PORT}`)
  console.log(`  Orders:     GET http://localhost:${PORT}/v1/external/observer/funds/${FUND_ID}/debenture-orders`)
  console.log(`  Settlement: GET http://localhost:${PORT}/v1/external/observer/funds/${FUND_ID}/debenture-orders/{orderId}/settlement`)
  console.log(`  Proof:      GET http://localhost:${PORT}/v1/external/observer/funds/${FUND_ID}/debenture-orders/{orderId}/proof`)
  console.log(``)
  console.log(`For CRE simulate: cre workflow simulate workflow-observer --target test-settings --non-interactive --trigger-index 0`)
  console.log(`For frontend:     VITE_API_MOCK=true npm run dev  (or set API_BASE in .env.local)`)
})
