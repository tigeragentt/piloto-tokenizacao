#!/usr/bin/env node
// Reads OBSERVER_ADDRESS from root .env and patches config/config.staging.json.
// Run before simulate/deploy so the two files never diverge.
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const envPath = resolve(__dirname, '../../.env')
const env = {}
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/)
  if (m) env[m[1]] = m[2].trim()
}

const addr = env['OBSERVER_ADDRESS']
if (!addr) {
  console.error('OBSERVER_ADDRESS not found in root .env')
  process.exit(1)
}

const cfgPath = resolve(__dirname, '../config/config.staging.json')
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'))

if (cfg.observerAddress === addr) {
  console.log(`config.staging.json already up to date (${addr})`)
  process.exit(0)
}

cfg.observerAddress = addr
writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n')
console.log(`Updated config.staging.json: observerAddress = ${addr}`)
