import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { OBSERVER_ABI } from '../abi.js'
import {
  FUND_ID, apiGet, getApiKey,
  OBSERVER_ADDRESS, SEPOLIA_RPC, SEPOLIA_NETWORK_PARAMS,
  shortHash, sepoliaTxUrl,
} from '../config.js'
import { useWallet } from '../context/WalletContext.jsx'
import StatusBadge, { BoolBadge } from '../components/StatusBadge.jsx'

const ZERO_B32 = '0x' + '0'.repeat(64)

function toBytes32(hex) {
  if (!hex) return ZERO_B32
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  return '0x' + clean.padStart(64, '0')
}

const readProvider = OBSERVER_ADDRESS ? new ethers.JsonRpcProvider(SEPOLIA_RPC) : null
const readContract = readProvider
  ? new ethers.Contract(OBSERVER_ADDRESS, OBSERVER_ABI, readProvider)
  : null

export default function ApiDataPage() {
  const { account, connectWallet } = useWallet()
  const [rows, setRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [anchoringId, setAnchoringId] = useState(null)
  const [txs, setTxs] = useState({})   // orderId → txHash

  const apiKey = getApiKey()

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const data = await apiGet(`/funds/${FUND_ID}/debenture-orders`)
      const orders = data.items || []

      const enriched = await Promise.all(orders.map(async (order) => {
        let settlement = null
        let proof = null
        let anchored = null

        if (order.settlementCompleted) {
          const [s, p] = await Promise.all([
            apiGet(`/funds/${FUND_ID}/debenture-orders/${order.id}/settlement`).catch(() => null),
            apiGet(`/funds/${FUND_ID}/debenture-orders/${order.id}/proof`).catch(() => null),
          ])
          settlement = s
          proof = p
        }

        if (readContract) {
          anchored = await readContract.isOrderAnchored(order.id).catch(() => null)
        }

        return { order, settlement, proof, anchored }
      }))

      setRows(enriched)
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (apiKey) loadAll() }, [])

  async function anchor({ order, settlement, proof }) {
    if (!account) { await connectWallet(); return }
    setAnchoringId(order.id)
    try {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [SEPOLIA_NETWORK_PARAMS],
      }).catch(() => {})
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: SEPOLIA_NETWORK_PARAMS.chainId }],
      })

      const signer = await new ethers.BrowserProvider(window.ethereum).getSigner()
      const contract = new ethers.Contract(OBSERVER_ADDRESS, OBSERVER_ABI, signer)

      const intent = order.intent || {}
      const s = {
        orderId:             order.id,
        intentHash:          toBytes32(order.intentHash),
        progress:            order.progress,
        technicalCompleted:  settlement?.technicalSettlementCompleted ?? false,
        accountingCompleted: settlement?.accountingCompleted ?? false,
        deliveryProofSHA256: proof?.sha256 ? toBytes32(proof.sha256) : ZERO_B32,
        resolutionHash:      settlement?.resolutionHash ? toBytes32(settlement.resolutionHash) : ZERO_B32,
        sourceNetwork:       intent.sourceNetwork || '',
        destinationNetwork:  intent.destinationNetwork || '',
      }

      const tx = await contract.reportSettlement(s)
      setTxs(prev => ({ ...prev, [order.id]: tx.hash }))
      await tx.wait()
      setRows(prev => prev.map(r =>
        r.order.id === order.id ? { ...r, anchored: true } : r
      ))
    } catch (e) {
      alert(`Anchor failed: ${e.reason || e.message}`)
    } finally {
      setAnchoringId(null)
    }
  }

  const readyCount    = rows?.filter(r => r.order.settlementCompleted && r.anchored === false).length ?? 0
  const anchoredCount = rows?.filter(r => r.anchored === true).length ?? 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 className="page-title">API</h1>
        <button className="btn btn-secondary btn-sm" onClick={loadAll} disabled={loading || !apiKey}>
          {loading ? <><span className="spinner" />Loading…</> : 'Refresh'}
        </button>
      </div>
      <p className="page-subtitle">
        Workflow simulation — Observer API orders vs. Observer.sol anchoring status on Sepolia
      </p>

      {!apiKey && (
        <div className="alert alert-warn">
          Observer API key not set — go to the <strong>Orders</strong> page to set it first.
        </div>
      )}
      {!OBSERVER_ADDRESS && (
        <div className="alert alert-info">
          Observer address not set. Add <code>OBSERVER_ADDRESS=0x...</code> to <code>frontend/.env</code> to enable the Observer status column.
        </div>
      )}
      {error && <div className="alert alert-warn">{error}</div>}

      {rows && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'Total orders',         value: rows.length,  color: 'var(--text)' },
            { label: 'Ready to anchor',      value: readyCount,   color: readyCount > 0 ? 'var(--warn)' : 'var(--green)' },
            { label: 'Anchored on Observer', value: anchoredCount, color: 'var(--green)' },
          ].map(({ label, value, color }) => (
            <div key={label} className="card" style={{ textAlign: 'center', padding: '14px 10px' }}>
              <div style={{ fontSize: 30, fontWeight: 700, color }}>{value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {rows && (
        <div className="card">
          <div className="card-title">Orders — API → Observer</div>
          {rows.length === 0 ? (
            <p style={{ color: 'var(--text-dim)' }}>No orders found.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    {['Order ID', 'Progress', 'intentHash', 'Technical', 'Accounting', 'Observer', 'Action'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-dim)', fontWeight: 500, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ order, settlement, proof, anchored }) => {
                    const txHash    = txs[order.id]
                    const isAnch    = anchoringId === order.id
                    const canAnchor = OBSERVER_ADDRESS && order.settlementCompleted && settlement && anchored === false && !txHash

                    return (
                      <tr key={order.id} style={{ borderBottom: '1px solid var(--border)' }}>

                        <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: 'var(--accent2)', fontSize: 11 }}>
                          <span title={order.id}>{order.id.slice(0, 8)}…{order.id.slice(-4)}</span>
                        </td>

                        <td style={{ padding: '8px 10px' }}>
                          <StatusBadge progress={order.progress} />
                        </td>

                        <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11 }}>
                          {shortHash(`0x${order.intentHash}`, 5)}
                        </td>

                        <td style={{ padding: '8px 10px' }}>
                          <BoolBadge
                            value={settlement?.technicalSettlementCompleted ?? order.settlementCompleted}
                            trueLabel="done" falseLabel="pending"
                          />
                        </td>

                        <td style={{ padding: '8px 10px' }}>
                          <BoolBadge
                            value={settlement?.accountingCompleted ?? order.accountingCompleted}
                            trueLabel="done" falseLabel="pending"
                          />
                        </td>

                        <td style={{ padding: '8px 10px' }}>
                          {anchored === null
                            ? <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>—</span>
                            : <BoolBadge value={anchored} trueLabel="anchored" falseLabel="not anchored" />
                          }
                          {txHash && (
                            <div style={{ marginTop: 3 }}>
                              <a href={sepoliaTxUrl(txHash)} target="_blank" rel="noopener noreferrer"
                                style={{ fontSize: 10, color: 'var(--accent2)' }}>
                                {shortHash(txHash)}
                              </a>
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '8px 10px' }}>
                          {canAnchor && (
                            <button className="btn btn-primary btn-sm"
                              disabled={isAnch}
                              onClick={() => anchor({ order, settlement, proof })}>
                              {isAnch ? <><span className="spinner" />Anchoring…</> : 'Anchor →'}
                            </button>
                          )}
                          {anchored === true && !isAnch && (
                            <span style={{ color: 'var(--green)', fontSize: 11 }}>✓ Anchored</span>
                          )}
                          {!order.settlementCompleted && (
                            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>Not ready</span>
                          )}
                          {order.settlementCompleted && !settlement && anchored !== true && (
                            <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>No proof</span>
                          )}
                        </td>

                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
