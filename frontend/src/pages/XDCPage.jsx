import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { XDC_FIDC_MANAGER, XDC_STABLE, XDC_ESCROW_FACTORY } from '../config.js'
import HashCell from '../components/HashCell.jsx'

const XDC_RPC = 'https://rpc.apothem.network'
const XDC_CHAIN_ID = 51
const XDC_EXPLORER = 'https://testnet.xdcscan.com'

const provider = new ethers.JsonRpcProvider(XDC_RPC)

function xdcAddrUrl(addr) {
  return addr ? `${XDC_EXPLORER}/address/${addr}` : undefined
}

function AddressLink({ addr }) {
  if (!addr) return <span style={{ color: 'var(--text-dim)' }}>—</span>
  return (
    <a href={xdcAddrUrl(addr)} target="_blank" rel="noopener noreferrer"
      style={{ color: 'var(--accent2)', fontFamily: 'monospace', fontSize: 11 }}>
      {addr}
    </a>
  )
}

const FIDC_MANAGER_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function paused() view returns (bool)',
  'function owner() view returns (address)',
]

const ESCROW_FACTORY_ABI = [
  'function escrowCount() view returns (uint256)',
]

async function fetchXDCState() {
  const [fidc, stable, escrowCount] = await Promise.allSettled([
    (async () => {
      const c = new ethers.Contract(XDC_FIDC_MANAGER, FIDC_MANAGER_ABI, provider)
      const [name, symbol, supply, decimals, paused] = await Promise.all([
        c.name().catch(() => 'FIDC Manager'),
        c.symbol().catch(() => '—'),
        c.totalSupply().catch(() => null),
        c.decimals().catch(() => 18),
        c.paused().catch(() => null),
      ])
      return { name, symbol, supply, decimals: Number(decimals), paused }
    })(),
    (async () => {
      const c = new ethers.Contract(XDC_STABLE, FIDC_MANAGER_ABI, provider)
      const [name, symbol, supply, decimals, paused] = await Promise.all([
        c.name().catch(() => 'BRL-CVM'),
        c.symbol().catch(() => '—'),
        c.totalSupply().catch(() => null),
        c.decimals().catch(() => 18),
        c.paused().catch(() => null),
      ])
      return { name, symbol, supply, decimals: Number(decimals), paused }
    })(),
    (async () => {
      const c = new ethers.Contract(XDC_ESCROW_FACTORY, ESCROW_FACTORY_ABI, provider)
      return c.escrowCount().catch(() => null)
    })(),
  ])

  return {
    fidc:   fidc.status === 'fulfilled'     ? fidc.value         : null,
    stable: stable.status === 'fulfilled'   ? stable.value       : null,
    escrow: escrowCount.status === 'fulfilled' ? escrowCount.value : null,
  }
}

function fmt(supply, decimals) {
  if (supply === null || supply === undefined) return '—'
  const n = Number(ethers.formatUnits(supply, decimals))
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

export default function XDCPage() {
  const [state, setState]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr]       = useState(null)

  async function load() {
    setLoading(true)
    setErr(null)
    try {
      const s = await fetchXDCState()
      setState(s)
    } catch (e) {
      setErr(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const { fidc, stable, escrow } = state || {}

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 className="page-title">XDC Pilot Contracts</h1>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          {loading ? <><span className="spinner" />Loading…</> : 'Refresh'}
        </button>
      </div>
      <p className="page-subtitle">
        XDC Apothem Testnet (Chain 51) — read-only view of the pilot contracts
      </p>

      {err && <div className="alert alert-warn">{err}</div>}

      {/* ── Stat Cards ── */}
      <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-label">{fidc?.name || 'FIDC Manager'}</div>
          <div className="stat-value" style={{ fontSize: 24 }}>
            {loading ? <span className="spinner" /> : fidc ? `${fmt(fidc.supply, fidc.decimals)} ${fidc.symbol}` : '—'}
          </div>
          <div className="stat-sub">Total supply on XDC Apothem</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">{stable?.name || 'BRL-CVM Stable'}</div>
          <div className="stat-value" style={{ fontSize: 24 }}>
            {loading ? <span className="spinner" /> : stable ? `${fmt(stable.supply, stable.decimals)} ${stable.symbol}` : '—'}
          </div>
          <div className="stat-sub">BRL-denominated stablecoin</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Escrow Instances</div>
          <div className="stat-value">
            {loading ? <span className="spinner" /> : escrow !== null ? Number(escrow) : '—'}
          </div>
          <div className="stat-sub">Created by Escrow Factory</div>
        </div>
      </div>

      {/* ── FIDC Manager ── */}
      <div className="section-label">FIDC Manager Token</div>
      <div className="card">
        <div className="card-title">FIDC Manager</div>
        <table className="info-table">
          <tbody>
            <tr><td>Address</td><td><AddressLink addr={XDC_FIDC_MANAGER} /></td></tr>
            {fidc && <>
              <tr><td>Name</td><td>{fidc.name}</td></tr>
              <tr><td>Symbol</td><td><code>{fidc.symbol}</code></td></tr>
              <tr><td>Total Supply</td><td>{fmt(fidc.supply, fidc.decimals)} {fidc.symbol}</td></tr>
              <tr><td>Decimals</td><td>{fidc.decimals}</td></tr>
              {fidc.paused !== null && (
                <tr><td>Paused</td><td style={{ color: fidc.paused ? 'var(--warn)' : 'var(--green)' }}>
                  {fidc.paused ? 'Yes ⚠' : 'No ✓'}
                </td></tr>
              )}
            </>}
          </tbody>
        </table>
      </div>

      {/* ── BRL-CVM Stable ── */}
      <div className="section-label">BRL-CVM Stablecoin</div>
      <div className="card">
        <div className="card-title">BRL-CVM (Regulated Stablecoin)</div>
        <table className="info-table">
          <tbody>
            <tr><td>Address</td><td><AddressLink addr={XDC_STABLE} /></td></tr>
            {stable && <>
              <tr><td>Name</td><td>{stable.name}</td></tr>
              <tr><td>Symbol</td><td><code>{stable.symbol}</code></td></tr>
              <tr><td>Total Supply</td><td>{fmt(stable.supply, stable.decimals)} {stable.symbol}</td></tr>
              <tr><td>Decimals</td><td>{stable.decimals}</td></tr>
              {stable.paused !== null && (
                <tr><td>Paused</td><td style={{ color: stable.paused ? 'var(--warn)' : 'var(--green)' }}>
                  {stable.paused ? 'Yes ⚠' : 'No ✓'}
                </td></tr>
              )}
            </>}
          </tbody>
        </table>
      </div>

      {/* ── Escrow Factory ── */}
      <div className="section-label">Escrow Factory</div>
      <div className="card">
        <div className="card-title">Escrow Factory (COORDINATED_CUSTODIAL_DELIVERY_THEN_PAYMENT)</div>
        <table className="info-table">
          <tbody>
            <tr><td>Address</td><td><AddressLink addr={XDC_ESCROW_FACTORY} /></td></tr>
            <tr><td>Escrow instances created</td><td>{loading ? '…' : escrow !== null ? Number(escrow) : '—'}</td></tr>
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 10 }}>
          Each settlement creates an escrow: BRL-CVM is locked here while CVD IOU is delivered on XRPL.
          The lock is released (or refunded) when the Observer API confirms resolution.
        </p>
      </div>

      {/* ── Settlement Algorithm ── */}
      <div className="section-label">Settlement Algorithm</div>
      <div className="card">
        <div className="card-title">COORDINATED_CUSTODIAL_DELIVERY_THEN_PAYMENT</div>
        <ol style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 2.2, paddingLeft: 20, margin: 0 }}>
          <li><strong style={{ color: 'var(--text)' }}>Lock</strong> — BRL-CVM escrow created on XDC Apothem</li>
          <li><strong style={{ color: 'var(--text)' }}>Deliver</strong> — CVD (debenture IOU) delivered on XRPL testnet by custodian</li>
          <li><strong style={{ color: 'var(--text)' }}>Resolve</strong> — Observer API confirms <code>LockResolved</code> event; BRL-CVM released to issuer</li>
          <li><strong style={{ color: 'var(--text)' }}>Anchor</strong> — CRE workflow reports settlement proof to Observer.sol on Ethereum Sepolia</li>
        </ol>
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-dim)' }}>
          Cross-chain correlation key: <code>intentHash</code> (bytes32) = XRPL <code>InvoiceID</code> field
        </div>
      </div>

      {/* ── XRPL ── */}
      <div className="section-label">XRPL Debentures</div>
      <div className="card">
        <div className="card-title">CVD — Debenture IOU (XRPL Testnet)</div>
        <table className="info-table">
          <tbody>
            <tr><td>Issuer</td><td style={{ fontFamily: 'monospace', fontSize: 11 }}>r9aceEB7Qy5JrHtYt2KGhF4KVMgEGjoY2U</td></tr>
            <tr><td>Currency code</td><td><code>CVD</code></td></tr>
            <tr><td>Network</td><td>XRPL Testnet</td></tr>
            <tr><td>Explorer</td>
              <td>
                <a href="https://testnet.xrpl.org/accounts/r9aceEB7Qy5JrHtYt2KGhF4KVMgEGjoY2U"
                  target="_blank" rel="noopener noreferrer"
                  style={{ color: 'var(--accent2)', fontSize: 11 }}>
                  testnet.xrpl.org/accounts/r9aceEB7…
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
