import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { OBSERVER_ABI } from '../abi.js'
import {
  SEPOLIA_RPC, OBSERVER_ADDRESS,
  FUND_ID, XDC_FIDC_MANAGER, XDC_STABLE, XDC_ESCROW_FACTORY,
  apiGet, formatTimestamp, shortHash, isZeroBytes32,
  sepoliaBlockUrl,
} from '../config.js'
import StatusBadge, { BoolBadge } from '../components/StatusBadge.jsx'

const sepoliaProvider = OBSERVER_ADDRESS ? new ethers.JsonRpcProvider(SEPOLIA_RPC) : null

async function fetchObserverSummary() {
  if (!OBSERVER_ADDRESS || !sepoliaProvider) return null
  const c = new ethers.Contract(OBSERVER_ADDRESS, OBSERVER_ABI, sepoliaProvider)
  const [count, version] = await Promise.all([
    c.getSettlementCount(),
    c.VERSION().catch(() => '—'),
  ])
  const n = Number(count)
  const records = n > 0
    ? await c.getLatestSettlements(Math.min(n, 5))
    : []
  return { count: n, version, records }
}

async function fetchOrderSummary() {
  const data = await apiGet(`/funds/${FUND_ID}/debenture-orders`)
  const items = data.items || []
  const settled = items.filter(o => o.progress === 'ACQUIRED_WITH_LOCK').length
  return { total: items.length, settled, items: items.slice(0, 3) }
}

export default function Dashboard() {
  const [observer, setObserver] = useState(null)
  const [orders, setOrders]     = useState(null)
  const [loading, setLoading]   = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [errors, setErrors]     = useState([])

  async function load() {
    setLoading(true)
    setErrors([])
    const errs = []

    const [obs, ord] = await Promise.all([
      fetchObserverSummary().catch(e => { errs.push('Observer: ' + (e.message || e)); return null }),
      fetchOrderSummary().catch(e => { errs.push('Capitare API: ' + (e.message || e)); return null }),
    ])
    setObserver(obs)
    setOrders(ord)
    setErrors(errs)
    setLastUpdated(new Date().toLocaleTimeString())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 className="page-title">Dashboard</h1>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          {loading ? <><span className="spinner" />Refreshing…</> : 'Refresh'}
        </button>
      </div>
      <p className="page-subtitle">
        Horizonte Crédito Multirrede FIDC — Piloto XDC &middot; ABToken / CVM Supervisability Layer
        {lastUpdated && <span style={{ marginLeft: 8, color: 'var(--text-dim)' }}>Updated {lastUpdated}</span>}
      </p>

      {errors.map((e, i) => <div key={i} className="alert alert-warn">{e}</div>)}

      {/* ── Stats ── */}
      <div className="dashboard-grid">
        <div className="stat-card">
          <div className="stat-label">Debenture Orders</div>
          <div className="stat-value">{loading ? <span className="spinner" /> : (orders?.total ?? '—')}</div>
          <div className="stat-sub">Total orders in fund</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Settled (Delivery done)</div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {loading ? <span className="spinner" /> : (orders?.settled ?? '—')}
          </div>
          <div className="stat-sub">ACQUIRED_WITH_LOCK</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Anchored on Sepolia</div>
          <div className="stat-value" style={{ color: OBSERVER_ADDRESS ? 'var(--accent)' : 'var(--text-dim)' }}>
            {loading ? <span className="spinner" /> : (observer?.count ?? (OBSERVER_ADDRESS ? '—' : 'not deployed'))}
          </div>
          <div className="stat-sub">Observer.sol settlement records</div>
        </div>
      </div>

      <div className="dash-bottom">
        {/* ── Recent Orders ── */}
        <div className="card">
          <div className="card-title">Recent Orders (Capitare API)</div>
          {orders?.items?.length > 0 ? (
            <table className="info-table" style={{ fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-dim)', fontWeight: 500 }}>Order ID</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-dim)', fontWeight: 500 }}>Progress</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-dim)', fontWeight: 500 }}>Settlement</th>
                </tr>
              </thead>
              <tbody>
                {orders.items.map(o => (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '4px 8px', fontFamily: 'monospace', fontSize: 11 }}>{o.id.slice(0, 8)}…</td>
                    <td style={{ padding: '4px 8px' }}><StatusBadge progress={o.progress} /></td>
                    <td style={{ padding: '4px 8px' }}><BoolBadge value={o.settlementCompleted} trueLabel="done" falseLabel="pending" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
              {loading ? <span className="spinner" /> : 'No orders — check API key in Orders page.'}
            </p>
          )}
        </div>

        {/* ── Fund Info ── */}
        <div className="card">
          <div className="card-title">Fund &amp; Contracts</div>
          <table className="info-table">
            <tbody>
              <tr><td>Fund</td><td>Horizonte Crédito Multirrede FIDC — Piloto XDC</td></tr>
              <tr><td>Fund ID</td><td style={{ fontFamily: 'monospace', fontSize: 11 }}>{FUND_ID.slice(0, 18)}…</td></tr>
              <tr><td>FIDC Manager (XDC)</td><td style={{ fontFamily: 'monospace', fontSize: 11 }}>{XDC_FIDC_MANAGER}</td></tr>
              <tr><td>BRL-CVM Stable (XDC)</td><td style={{ fontFamily: 'monospace', fontSize: 11 }}>{XDC_STABLE}</td></tr>
              <tr><td>Escrow Factory (XDC)</td><td style={{ fontFamily: 'monospace', fontSize: 11 }}>{XDC_ESCROW_FACTORY}</td></tr>
              <tr>
                <td>Observer.sol (Sepolia)</td>
                <td style={{ fontFamily: 'monospace', fontSize: 11, color: OBSERVER_ADDRESS ? 'var(--green)' : 'var(--text-dim)' }}>
                  {OBSERVER_ADDRESS || 'not yet deployed'}
                </td>
              </tr>
              {observer?.version && (
                <tr><td>Observer version</td><td>v{observer.version}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Recent Observer Records ── */}
      {OBSERVER_ADDRESS && (
        <div className="card" style={{ marginTop: 0 }}>
          <div className="card-title">Recent Settlement Records (Observer.sol)</div>
          {observer?.records?.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['OrderId', 'intentHash', 'Progress', 'Technical', 'Accounting', 'Block'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-dim)', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {observer.records.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{r.orderId.slice(0, 8)}…</td>
                      <td style={{ padding: '4px 8px', fontFamily: 'monospace' }}>{shortHash(r.intentHash)}</td>
                      <td style={{ padding: '4px 8px' }}><StatusBadge progress={r.progress} /></td>
                      <td style={{ padding: '4px 8px' }}><BoolBadge value={r.technicalCompleted} /></td>
                      <td style={{ padding: '4px 8px' }}><BoolBadge value={r.accountingCompleted} /></td>
                      <td style={{ padding: '4px 8px' }}>
                        <a href={sepoliaBlockUrl(Number(r.blockNumber))} target="_blank" rel="noopener noreferrer"
                          style={{ color: 'var(--accent2)', fontFamily: 'monospace' }}>
                          {Number(r.blockNumber)}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
              {loading ? <span className="spinner" /> : 'No settlement records anchored yet.'}
            </p>
          )}
        </div>
      )}

      {!OBSERVER_ADDRESS && (
        <div className="alert alert-info" style={{ marginTop: 0 }}>
          <strong>Observer address not configured.</strong> Set{' '}
          <code>OBSERVER_ADDRESS=0x...</code> in <code>frontend/.env</code> and restart.
          ObserverTest is already deployed at <code>0x84E0439Da40a543E45847841393d71A45A715537</code>.
        </div>
      )}
    </div>
  )
}
