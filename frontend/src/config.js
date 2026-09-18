// ─── Networks ─────────────────────────────────────────────────────────────────

export const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'
export const XDC_RPC = 'https://rpc.apothem.network'
export const SEPOLIA_CHAIN_ID = 11155111
export const XDC_CHAIN_ID = 51

export const SEPOLIA_NETWORK_PARAMS = {
  chainId: '0xaa36a7',
  chainName: 'Sepolia Testnet',
  rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  blockExplorerUrls: ['https://sepolia.etherscan.io'],
}

export const XDC_NETWORK_PARAMS = {
  chainId: '0x33',
  chainName: 'XDC Apothem Testnet',
  rpcUrls: ['https://rpc.apothem.network'],
  nativeCurrency: { name: 'XDC', symbol: 'TXDC', decimals: 18 },
  blockExplorerUrls: ['https://testnet.xdcscan.com'],
}

// ─── Observer.sol + ObserverFund.sol (Sepolia) ────────────────────────────────

// Set once deployed; empty string disables Observer reads/writes
export const OBSERVER_ADDRESS      = import.meta.env.OBSERVER_ADDRESS      || ''
// ObserverFund is deployed separately — pass its address to Observer at deploy time
export const OBSERVER_FUND_ADDRESS = import.meta.env.OBSERVER_FUND_ADDRESS || ''

// ─── XDC Pilot Contracts (Apothem, chain 51) ───────────────────────────────────

export const XDC_FIDC_MANAGER = '0x6E45fFEB71b4d6beA4CC1ddDf8EE310AA49cB3Fa'
export const XDC_FIDC         = '0x8001BB21f4F061b444F02f50Ab76BAA6a84394A2'
export const XDC_STABLE       = '0x243e98638D619eB6f10eaBbaCfC071f318D5e9d0'  // BRL-CVM
export const XDC_ESCROW_FACTORY = '0x5f6d0B7886858ac75c32b9642090067157651Ff4'

// ─── Capitare API ─────────────────────────────────────────────────────────────

export const CAPITARE_FUND_ID = 'be6f2e8a-5474-43c7-a692-7918c37e3f42'
export const CAPITARE_CLIENT_ID = 'mb-observer-demo'

// Dev API URL — proxied in dev via /capitare-api Vite proxy
const isLocalhost = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
export const CAPITARE_API_BASE = isLocalhost
  ? '/capitare-api'
  : 'https://dev-api-mercado-bitcoin.web3up.mobi/v1/external/observer'

// API key stored in localStorage — never in the build
export function getCapitareKey() {
  return localStorage.getItem('capitare_observer_key') || import.meta.env.VITE_CAPITARE_KEY || ''
}

export async function capitareGet(path) {
  const key = getCapitareKey()
  if (!key) throw new Error('Capitare API key not set. Paste it in the Orders page settings.')
  const resp = await fetch(`${CAPITARE_API_BASE}${path}`, {
    headers: {
      'X-Observer-Id': CAPITARE_CLIENT_ID,
      'X-Observer-Key': key,
    },
  })
  if (resp.status === 401) throw new Error('Unauthorized — check your Capitare Observer API key.')
  if (!resp.ok) throw new Error(`Capitare API ${resp.status}: ${await resp.text().catch(() => '')}`)
  return resp.json()
}

// ─── Explorers ────────────────────────────────────────────────────────────────

export const sepoliaTxUrl = tx => `https://sepolia.etherscan.io/tx/${tx}`
export const sepoliaBlockUrl = n => `https://sepolia.etherscan.io/block/${n}`
export const xdcTxUrl = tx => `https://testnet.xdcscan.com/tx/${tx}`
export const xrplTxUrl = tx => `https://testnet.xrpl.org/transactions/${tx}`

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const shortHash = (h, n = 6) => h
  ? `${h.slice(0, n + 2)}…${h.slice(-(n))}` // preserve 0x prefix
  : '—'

export const isZeroBytes32 = h =>
  !h || h === '0x0000000000000000000000000000000000000000000000000000000000000000'

export function formatTimestamp(ts) {
  if (!ts && ts !== 0) return '—'
  const n = typeof ts === 'bigint' ? Number(ts) : ts
  return new Date(n * 1000).toLocaleString()
}

export function normaliseAddress(addr) {
  if (!addr) return addr
  if (addr.startsWith('xdc') || addr.startsWith('XDC')) return '0x' + addr.slice(3)
  return addr
}
