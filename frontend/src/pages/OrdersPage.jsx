import { useEffect, useState, useCallback } from 'react'
import {
  CAPITARE_FUND_ID, capitareGet, getCapitareKey,
  shortHash, isZeroBytes32, xrplTxUrl, xdcTxUrl, formatTimestamp,
} from '../config.js'
import StatusBadge, { BoolBadge } from '../components/StatusBadge.jsx'
import HashCell from '../components/HashCell.jsx'

const KEY_STORAGE = 'capitare_observer_key'

function OrderDetail({ order, onClose }) {
  const [proof, setProof]         = useState(null)
  const [settlement, setSettlement] = useState(null)
  const [loadingProof, setLoadingProof] = useState(false)
  const [proofErr, setProofErr]   = useState(null)

  async function fetchProofs() {
    setLoadingProof(true)
    setProofErr(null)
    try {
      const [p, s] = await Promise.all([
        capitareGet(`/funds/${CAPITARE_FUND_ID}/debenture-orders/${order.id}/proof`).catch(() => null),
        capitareGet(`/funds/${CAPITARE_FUND_ID}/debenture-orders/${order.id}/settlement`).catch(() => null),
      ])
      setProof(p)
      setSettlement(s)
    } catch (e) {
      setProofErr(e.message)
    } finally {
      setLoadingProof(false)
    }
  }

  useEffect(() => { fetchProofs() }, [order.id])

  const intent = order.intent || {}
  const srcEv  = order.sourceEvidence
  const dstEv  = order.destinationEvidence

  return (
    <div className="order-detail-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="order-detail-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div className="card-title" style={{ marginBottom: 2 }}>Order Detail</div>
            <code style={{ fontSize: 12, color: 'var(--text-dim)' }}>{order.id}</code>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕ Close</button>
        </div>

        <div className="detail-section">
          <div className="detail-section-title">Status</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div><span className="detail-label">Progress</span><StatusBadge progress={order.progress} /></div>
            <div><span className="detail-label">Settlement</span><BoolBadge value={order.settlementCompleted} trueLabel="done" falseLabel="pending" /></div>
            <div><span className="detail-label">Accounting</span><BoolBadge value={order.accountingCompleted} trueLabel="done" falseLabel="pending" /></div>
          </div>
        </div>

        <div className="detail-section">
          <div className="detail-section-title">Cross-chain Keys</div>
          <table className="info-table">
            <tbody>
              <tr>
                <td>intentHash</td>
                <td><HashCell hash={`0x${order.intentHash}`} chars={12} /></td>
              </tr>
              <tr><td>Source network</td><td>{intent.sourceNetwork || '—'}</td></tr>
              <tr><td>Destination network</td><td>{intent.destinationNetwork || '—'}</td></tr>
              <tr><td>Quantity</td><td>{intent.quantity} {intent.representationId?.split(':').pop() || ''}</td></tr>
              <tr><td>Cash amount</td><td>{intent.cashAmount ? (BigInt(intent.cashAmount) / BigInt(1e18)).toString() + ' BRL-CVM' : '—'}</td></tr>
            </tbody>
          </table>
        </div>

        {srcEv && (
          <div className="detail-section">
            <div className="detail-section-title">Source Evidence (XDC)</div>
            <table className="info-table">
              <tbody>
                <tr><td>Disposition</td><td style={{ color: srcEv.disposition === 'LOCKED' ? 'var(--green)' : 'inherit' }}>{srcEv.disposition}</td></tr>
                <tr><td>Amount</td><td>{srcEv.amount ? (BigInt(srcEv.amount) / BigInt(1e18)).toString() + ' BRL-CVM' : '—'}</td></tr>
                <tr><td>Tx (lock)</td>
                  <td><a href={xdcTxUrl(srcEv.anchor?.txHash)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent2)', fontSize: 11 }}>
                    {shortHash(srcEv.anchor?.txHash)}
                  </a></td>
                </tr>
                <tr><td>Block</td><td>{srcEv.anchor?.blockNumber}</td></tr>
              </tbody>
            </table>
          </div>
        )}

        {dstEv && (
          <div className="detail-section">
            <div className="detail-section-title">Destination Evidence (XRPL)</div>
            <table className="info-table">
              <tbody>
                <tr><td>Disposition</td><td style={{ color: dstEv.disposition === 'DELIVERED' ? 'var(--green)' : 'inherit' }}>{dstEv.disposition}</td></tr>
                <tr><td>Amount</td><td>{dstEv.amount} {dstEv.assetId?.split(':').pop() || ''}</td></tr>
                <tr><td>From</td><td style={{ fontFamily: 'monospace', fontSize: 11 }}>{dstEv.from}</td></tr>
                <tr><td>To</td><td style={{ fontFamily: 'monospace', fontSize: 11 }}>{dstEv.to}</td></tr>
                <tr><td>XRPL TxHash</td>
                  <td><a href={xrplTxUrl(dstEv.anchor?.txHash)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent2)', fontSize: 11 }}>
                    {dstEv.anchor?.txHash?.slice(0, 18)}…
                  </a></td>
                </tr>
                <tr><td>Ledger</td><td>{dstEv.anchor?.blockNumber}</td></tr>
              </tbody>
            </table>
          </div>
        )}

        {/* Proof section */}
        <div className="detail-section">
          <div className="detail-section-title">Settlement Proofs</div>
          {loadingProof && <p style={{ color: 'var(--text-dim)', fontSize: 13 }}><span className="spinner" />Loading proofs…</p>}
          {proofErr && <p style={{ color: 'var(--warn)', fontSize: 13 }}>{proofErr}</p>}
          {proof && (
            <table className="info-table">
              <tbody>
                <tr><td>Hash domain</td><td style={{ fontSize: 11 }}>{proof.hashDomain?.trim()}</td></tr>
                <tr><td>Delivery proof SHA256</td><td><HashCell hash={`0x${proof.sha256}`} chars={10} /></td></tr>
              </tbody>
            </table>
          )}
          {settlement && (
            <table className="info-table" style={{ marginTop: 8 }}>
              <tbody>
                <tr>
                  <td>Resolution hash</td>
                  <td><HashCell hash={settlement.resolutionHash} chars={10} /></td>
                </tr>
                <tr><td>Technical settled</td><td><BoolBadge value={settlement.technicalSettlementCompleted} /></td></tr>
                <tr><td>Accounting settled</td><td><BoolBadge value={settlement.accountingCompleted} /></td></tr>
                <tr><td>Atomic cross-chain</td><td><BoolBadge value={settlement.atomicAcrossNetworks} trueLabel="atomic" falseLabel="coordinated" /></td></tr>
              </tbody>
            </table>
          )}
          {!proof && !settlement && !loadingProof && !proofErr && (
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No proof data available (order may not be settled yet).</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function OrdersPage() {
  const [orders, setOrders]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [apiKey, setApiKey]   = useState(() => localStorage.getItem(KEY_STORAGE) || '')
  const [editingKey, setEditingKey] = useState(!localStorage.getItem(KEY_STORAGE))
  const [selected, setSelected] = useState(null)

  const saveKey = useCallback((v) => {
    setApiKey(v)
    if (v) localStorage.setItem(KEY_STORAGE, v)
    else localStorage.removeItem(KEY_STORAGE)
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await capitareGet(`/funds/${CAPITARE_FUND_ID}/debenture-orders`)
      setOrders(data.items || [])
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (apiKey) load()
  }, [apiKey])

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 className="page-title">Orders</h1>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading || !apiKey}>
          {loading ? <><span className="spinner" />Loading…</> : 'Refresh'}
        </button>
      </div>
      <p className="page-subtitle">
        Debenture orders from the Capitare Observer API &mdash; fund{' '}
        <code style={{ fontSize: 11 }}>{CAPITARE_FUND_ID}</code>
      </p>

      {/* ── API Key settings ── */}
      <div className="card">
        <div className="card-title">Capitare Observer API Key</div>
        {!editingKey && apiKey ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: 'var(--green)', fontSize: 13 }}>✓ API key set</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setEditingKey(true)}>Change</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { saveKey(''); setEditingKey(true) }}>Clear</button>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>
              Paste your <code>X-Observer-Key</code> header value. Stored locally only — never sent to any server.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="fn-input"
                style={{ flex: 1 }}
                placeholder="mq-xxxxxxxx..."
                defaultValue={apiKey}
                id="api-key-input"
              />
              <button className="btn btn-primary btn-sm" onClick={() => {
                const v = document.getElementById('api-key-input').value.trim()
                if (v) { saveKey(v); setEditingKey(false); load() }
              }}>Save &amp; Load</button>
            </div>
          </div>
        )}
      </div>

      {error && <div className="alert alert-warn">{error}</div>}
      {!apiKey && !error && (
        <div className="alert alert-info">Set your Capitare Observer API key above to load orders.</div>
      )}

      {orders && (
        <div className="card">
          <div className="card-title">
            {orders.length} Order{orders.length !== 1 ? 's' : ''}
          </div>
          {orders.length === 0 ? (
            <p style={{ color: 'var(--text-dim)' }}>No orders found.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    {['Order ID', 'Progress', 'intentHash', 'Technical', 'Accounting', 'Updated', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-dim)', fontWeight: 500, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => (
                    <tr key={order.id}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onClick={() => setSelected(order)}
                    >
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: 'var(--accent2)' }}>
                        {order.id.slice(0, 8)}…
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <StatusBadge progress={order.progress} />
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>
                        {shortHash(`0x${order.intentHash}`)}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <BoolBadge value={order.settlementCompleted} trueLabel="done" falseLabel="pending" />
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <BoolBadge value={order.accountingCompleted} trueLabel="done" falseLabel="pending" />
                      </td>
                      <td style={{ padding: '8px 10px', color: 'var(--text-dim)' }}>
                        {order.updatedAt ? new Date(order.updatedAt).toLocaleDateString() : '—'}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); setSelected(order) }}>
                          Detail →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {selected && <OrderDetail order={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
