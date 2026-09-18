import { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import { OBSERVER_ABI } from '../abi.js'
import {
  SEPOLIA_RPC, SEPOLIA_NETWORK_PARAMS, OBSERVER_ADDRESS,
  REPORTER_ROLE_HASH, DEFAULT_ADMIN_ROLE,
  shortHash, isZeroBytes32, sepoliaBlockUrl, sepoliaTxUrl,
  formatTimestamp,
  CAPITARE_FUND_ID, XDC_FIDC_MANAGER, XDC_STABLE, XDC_ESCROW_FACTORY,
} from '../config.js'
import { useWallet } from '../context/WalletContext.jsx'
import StatusBadge, { BoolBadge } from '../components/StatusBadge.jsx'
import HashCell from '../components/HashCell.jsx'

const readProvider = OBSERVER_ADDRESS ? new ethers.JsonRpcProvider(SEPOLIA_RPC) : null

function ObserverNotDeployed() {
  return (
    <div className="card">
      <div className="card-title">Observer.sol — Address Not Configured</div>
      <div className="alert alert-warn" style={{ marginBottom: 12 }}>
        <code>OBSERVER_ADDRESS</code> is not set in <code>frontend/.env</code>.
        Set it to the deployed Observer (or ObserverTest) address on Sepolia and restart the frontend.
      </div>
      <div className="section-label">Quick Start (ObserverTest already deployed)</div>
      <ol style={{ fontSize: 13, color: 'var(--text-dim)', paddingLeft: 20, lineHeight: 2.2 }}>
        <li>Add to <code>frontend/.env</code>: <code>OBSERVER_ADDRESS=0x84E0439Da40a543E45847841393d71A45A715537</code></li>
        <li>Restart the frontend</li>
      </ol>
      <div className="section-label" style={{ marginTop: 12 }}>Deploy Production Observer.sol</div>
      <ol style={{ fontSize: 13, color: 'var(--text-dim)', paddingLeft: 20, lineHeight: 2.2 }}>
        <li>Install: <code>cd smart-contracts &amp;&amp; npm install</code></li>
        <li>Compile: <code>npx hardhat compile</code></li>
        <li>Deploy to Sepolia: <code>npx hardhat run scripts/deploy.js --network sepolia</code></li>
        <li>Copy the deployed address</li>
        <li>Set <code>observerAddress</code> in <code>workflow-capitare/config/config.staging.json</code></li>
        <li>Grant <code>REPORTER_ROLE</code> to the CRE wallet on the deployed contract</li>
        <li>Set <code>OBSERVER_ADDRESS=0x...</code> in <code>frontend/.env</code> and restart</li>
      </ol>
    </div>
  )
}

function SettlementTable({ records }) {
  const [expanded, setExpanded] = useState(null)

  if (!records || records.length === 0) {
    return <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>No settlement records anchored yet.</p>
  }

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              {['#', 'Order ID', 'intentHash', 'Progress', 'Technical', 'Accounting', 'Block', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '6px 10px', color: 'var(--text-dim)', fontWeight: 500, fontSize: 11 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((r, i) => (
              <>
                <tr key={i}
                  style={{ borderBottom: expanded === i ? 'none' : '1px solid var(--border)', cursor: 'pointer', background: expanded === i ? 'var(--bg3)' : undefined }}
                  onClick={() => setExpanded(expanded === i ? null : i)}
                >
                  <td style={{ padding: '8px 10px', color: 'var(--text-dim)' }}>{i}</td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace', color: 'var(--accent2)' }}>
                    {r.orderId?.slice(0, 8)}…
                  </td>
                  <td style={{ padding: '8px 10px', fontFamily: 'monospace' }}>
                    {shortHash(r.intentHash)}
                  </td>
                  <td style={{ padding: '8px 10px' }}><StatusBadge progress={r.progress} /></td>
                  <td style={{ padding: '8px 10px' }}><BoolBadge value={r.technicalCompleted} /></td>
                  <td style={{ padding: '8px 10px' }}><BoolBadge value={r.accountingCompleted} /></td>
                  <td style={{ padding: '8px 10px' }}>
                    <a href={sepoliaBlockUrl(Number(r.blockNumber))} target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--accent2)' }}>{Number(r.blockNumber)}</a>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>{expanded === i ? '▲' : '▼'}</span>
                  </td>
                </tr>
                {expanded === i && (
                  <tr key={`exp-${i}`} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
                    <td colSpan={8} style={{ padding: '12px 16px' }}>
                      <table className="info-table" style={{ width: 'auto', minWidth: 500 }}>
                        <tbody>
                          <tr><td>Order ID</td><td style={{ fontFamily: 'monospace' }}>{r.orderId}</td></tr>
                          <tr>
                            <td>intentHash</td>
                            <td><HashCell hash={r.intentHash} chars={16} /></td>
                          </tr>
                          <tr>
                            <td>deliveryProofSHA256</td>
                            <td>
                              {isZeroBytes32(r.deliveryProofSHA256)
                                ? <span style={{ color: 'var(--text-dim)' }}>—</span>
                                : <HashCell hash={r.deliveryProofSHA256} chars={16} />}
                            </td>
                          </tr>
                          <tr>
                            <td>resolutionHash</td>
                            <td>
                              {isZeroBytes32(r.resolutionHash)
                                ? <span style={{ color: 'var(--text-dim)' }}>—</span>
                                : <HashCell hash={r.resolutionHash} chars={16} />}
                            </td>
                          </tr>
                          <tr><td>Source network</td><td>{r.sourceNetwork}</td></tr>
                          <tr><td>Destination network</td><td>{r.destinationNetwork}</td></tr>
                          <tr><td>Anchored at</td><td>{formatTimestamp(r.reportedAt)}</td></tr>
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LookupPanel({ observerContract }) {
  const [intentHash, setIntentHash] = useState('')
  const [result, setResult]         = useState(null)
  const [status, setStatus]         = useState('idle')
  const [errMsg, setErrMsg]         = useState(null)

  async function lookup() {
    setStatus('loading')
    setResult(null)
    setErrMsg(null)
    try {
      const h = intentHash.trim().startsWith('0x') ? intentHash.trim() : `0x${intentHash.trim()}`
      const anchored = await observerContract.isSettlementAnchored(h)
      if (!anchored) {
        setResult({ anchored: false })
        setStatus('success')
        return
      }
      const rec = await observerContract.getLatestSettlement(h)
      setResult({ anchored: true, record: rec })
      setStatus('success')
    } catch (e) {
      setErrMsg(e.message || String(e))
      setStatus('error')
    }
  }

  return (
    <div className="fn-card">
      <div className="fn-header">
        <span className="fn-name">isSettlementAnchored / getLatestSettlement</span>
        <span className="fn-badge read">read</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
        Look up a settlement record by <code>intentHash</code> (32 bytes, with or without 0x prefix).
      </p>
      <div className="fn-inputs">
        <div className="fn-input-group" style={{ flex: 1 }}>
          <label className="fn-input-label">intentHash (bytes32)</label>
          <input
            className="fn-input"
            style={{ width: '100%', minWidth: 400 }}
            placeholder="0x61179240cd0b..."
            value={intentHash}
            onChange={e => setIntentHash(e.target.value)}
          />
        </div>
      </div>
      <button className="btn btn-primary btn-sm" onClick={lookup} disabled={!intentHash || status === 'loading'}>
        {status === 'loading' ? <><span className="spinner" />Looking up…</> : 'Look Up'}
      </button>
      {errMsg && <div className="fn-result error">{errMsg}</div>}
      {result && !result.anchored && <div className="fn-result error">Not anchored in Observer.</div>}
      {result?.anchored && result.record && (
        <div style={{ marginTop: 10 }}>
          <div className="fn-result success">Found — record details below</div>
          <table className="info-table" style={{ marginTop: 8 }}>
            <tbody>
              <tr><td>Order ID</td><td style={{ fontFamily: 'monospace' }}>{result.record.orderId}</td></tr>
              <tr><td>Progress</td><td><StatusBadge progress={result.record.progress} /></td></tr>
              <tr><td>Technical settled</td><td><BoolBadge value={result.record.technicalCompleted} /></td></tr>
              <tr><td>Accounting settled</td><td><BoolBadge value={result.record.accountingCompleted} /></td></tr>
              <tr><td>deliveryProofSHA256</td><td><HashCell hash={result.record.deliveryProofSHA256} chars={16} /></td></tr>
              <tr><td>resolutionHash</td><td><HashCell hash={result.record.resolutionHash} chars={16} /></td></tr>
              <tr><td>Anchored at</td><td>{formatTimestamp(result.record.reportedAt)}</td></tr>
              <tr><td>Block</td>
                <td>
                  <a href={sepoliaBlockUrl(Number(result.record.blockNumber))} target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--accent2)' }}>{Number(result.record.blockNumber)}</a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function AdminPanel({ signer }) {
  const [role, setRole]    = useState(REPORTER_ROLE_HASH)
  const [addr, setAddr]    = useState('')
  const [status, setStatus] = useState('idle')
  const [msg, setMsg]      = useState(null)

  async function send(fnName) {
    setStatus('loading')
    setMsg(null)
    try {
      const contract = new ethers.Contract(OBSERVER_ADDRESS, OBSERVER_ABI, signer)
      const tx = await contract[fnName](role, addr.trim())
      setMsg(`Tx sent: ${tx.hash}`)
      setStatus('pending')
      const receipt = await tx.wait()
      setMsg(`Confirmed in block ${receipt.blockNumber} — ${tx.hash}`)
      setStatus('success')
    } catch (e) {
      setMsg(e.reason || e.message || String(e))
      setStatus('error')
    }
  }

  const ROLES = [
    { label: 'REPORTER_ROLE', value: REPORTER_ROLE_HASH },
    { label: 'DEFAULT_ADMIN_ROLE', value: DEFAULT_ADMIN_ROLE },
  ]

  return (
    <div className="fn-card">
      <div className="fn-header">
        <span className="fn-name">grantRole / revokeRole</span>
        <span className="fn-badge write">write</span>
      </div>
      <div className="fn-inputs">
        <div className="fn-input-group">
          <label className="fn-input-label">role (bytes32)</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="fn-input" style={{ flex: '0 0 160px', cursor: 'pointer' }}
              value={ROLES.find(r => r.value === role)?.label || ''}
              onChange={e => {
                const r = ROLES.find(x => x.label === e.target.value)
                if (r) setRole(r.value)
              }}
            >
              {ROLES.map(r => <option key={r.label}>{r.label}</option>)}
            </select>
            <input className="fn-input" style={{ flex: 1 }} value={role}
              onChange={e => setRole(e.target.value)} />
          </div>
        </div>
        <div className="fn-input-group" style={{ flex: 1 }}>
          <label className="fn-input-label">account (address)</label>
          <input className="fn-input" style={{ minWidth: 340 }} placeholder="0x..." value={addr}
            onChange={e => setAddr(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" disabled={!addr || status === 'loading' || status === 'pending'}
          onClick={() => send('grantRole')}>
          Grant Role
        </button>
        <button className="btn btn-danger btn-sm" disabled={!addr || status === 'loading' || status === 'pending'}
          onClick={() => send('revokeRole')}>
          Revoke Role
        </button>
      </div>
      {msg && <div className={`fn-result ${status}`}>{msg}</div>}
    </div>
  )
}

function RegisterFundPanel({ signer }) {
  const [form, setForm] = useState({
    fundId: '',
    name: '',
    xdcNetwork: '',
    xdcFidcManager: '',
    xdcStable: '',
    xdcEscrowFactory: '',
    xrplNetwork: '',
    xrplIssuer: '',
    debentureCurrency: '',
  })
  const [status, setStatus] = useState('idle')
  const [msg, setMsg] = useState(null)

  async function submit() {
    setStatus('loading')
    setMsg(null)
    try {
      const contract = new ethers.Contract(OBSERVER_ADDRESS, OBSERVER_ABI, signer)
      const tx = await contract.registerFund({
        fundId:            form.fundId,
        name:              form.name,
        xdcNetwork:        form.xdcNetwork,
        xdcFidcManager:    form.xdcFidcManager,
        xdcStable:         form.xdcStable,
        xdcEscrowFactory:  form.xdcEscrowFactory,
        xrplNetwork:       form.xrplNetwork,
        xrplIssuer:        form.xrplIssuer,
        debentureCurrency: form.debentureCurrency,
      })
      setMsg(`Tx sent: ${tx.hash}`)
      setStatus('pending')
      const receipt = await tx.wait()
      setMsg(`Confirmed in block ${receipt.blockNumber}`)
      setStatus('success')
    } catch (e) {
      setMsg(e.reason || e.message || String(e))
      setStatus('error')
    }
  }

  const fields = [
    ['fundId', 'Fund ID (Capitare UUID)'], ['name', 'Name'],
    ['xdcNetwork', 'XDC Network'], ['xdcFidcManager', 'FIDC Manager address'],
    ['xdcStable', 'Stable (BRL-CVM) address'], ['xdcEscrowFactory', 'Escrow Factory address'],
    ['xrplNetwork', 'XRPL Network'], ['xrplIssuer', 'XRPL Issuer (r…)'],
    ['debentureCurrency', 'Debenture Currency (e.g. CVD)'],
  ]

  return (
    <div className="fn-card">
      <div className="fn-header">
        <span className="fn-name">registerFund</span>
        <span className="fn-badge write">write / admin</span>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
        Pre-filled with pilot values. Call once after deploying Observer.sol.
      </p>
      <div className="fn-inputs" style={{ flexDirection: 'column' }}>
        {fields.map(([key, label]) => (
          <div key={key} className="fn-input-group" style={{ width: '100%' }}>
            <label className="fn-input-label">{label}</label>
            <input className="fn-input" style={{ width: '100%', minWidth: 380 }}
              value={form[key]} onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))} />
          </div>
        ))}
      </div>
      <button className="btn btn-primary btn-sm" onClick={submit}
        disabled={status === 'loading' || status === 'pending'}>
        {status === 'loading' || status === 'pending' ? <><span className="spinner" />Sending…</> : 'Register Fund'}
      </button>
      {msg && <div className={`fn-result ${status === 'pending' ? 'pending' : status}`}>{msg}</div>}
    </div>
  )
}

export default function ObserverPage() {
  const { account, signer, error: connError, connect } = useWallet()
  const [records, setRecords]   = useState(null)
  const [count, setCount]       = useState(null)
  const [version, setVersion]   = useState(null)
  const [loading, setLoading]   = useState(false)
  const [loadErr, setLoadErr]   = useState(null)

  async function loadRecords() {
    if (!OBSERVER_ADDRESS) return
    setLoading(true)
    setLoadErr(null)
    try {
      const c = new ethers.Contract(OBSERVER_ADDRESS, OBSERVER_ABI, readProvider)
      const [n, v] = await Promise.all([c.getSettlementCount(), c.VERSION().catch(() => '—')])
      const total = Number(n)
      setCount(total)
      setVersion(v)
      const recs = total > 0 ? await c.getLatestSettlements(Math.min(total, 20)) : []
      setRecords([...recs].reverse())
    } catch (e) {
      setLoadErr(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadRecords() }, [])

  if (!OBSERVER_ADDRESS) return <ObserverNotDeployed />

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <h1 className="page-title">Observer</h1>
        <button className="btn btn-secondary btn-sm" onClick={loadRecords} disabled={loading}>
          {loading ? <><span className="spinner" />Loading…</> : 'Refresh'}
        </button>
      </div>
      <p className="page-subtitle">
        Observer.sol on Ethereum Sepolia &mdash; immutable settlement proof registry for CVM auditors
        <br />
        <code style={{ fontSize: 11, color: 'var(--accent2)' }}>{OBSERVER_ADDRESS}</code>
        {version && <span style={{ marginLeft: 10, color: 'var(--text-dim)', fontSize: 11 }}>v{version}</span>}
      </p>

      {loadErr && <div className="alert alert-warn">{loadErr}</div>}
      {connError && <div className="alert alert-warn">{connError}</div>}

      {/* ── Stats ── */}
      <div className="dashboard-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className="stat-card">
          <div className="stat-label">Anchored Records</div>
          <div className="stat-value">{loading ? <span className="spinner" /> : (count ?? '—')}</div>
          <div className="stat-sub">settlement reports on Sepolia</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Contract</div>
          <div className="stat-value" style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--green)', wordBreak: 'break-all' }}>
            {OBSERVER_ADDRESS.slice(0, 10)}…
          </div>
          <div className="stat-sub">Ethereum Sepolia (11155111)</div>
        </div>
      </div>

      {/* ── Settlement Records ── */}
      <div className="section-label">Settlement Records</div>
      <div className="card">
        <div className="card-title">
          Recent Anchored Settlement Proofs (newest first)
        </div>
        {loading && <p style={{ color: 'var(--text-dim)' }}><span className="spinner" />Loading from Sepolia…</p>}
        {!loading && <SettlementTable records={records} />}
      </div>

      {/* ── Lookup ── */}
      <div className="section-label">Verify by intentHash</div>
      <div className="fn-list">
        <LookupPanel observerContract={new ethers.Contract(OBSERVER_ADDRESS, OBSERVER_ABI, readProvider)} />
      </div>

      {/* ── Admin ── */}
      <div className="section-label">Admin (requires DEFAULT_ADMIN_ROLE on Sepolia)</div>
      {!account ? (
        <div className="connect-bar">
          <button className="btn btn-primary" onClick={() => connect(
            { chainId: '0xaa36a7', chainName: 'Sepolia', rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              blockExplorerUrls: ['https://sepolia.etherscan.io'] }
          )}>
            Connect MetaMask (Sepolia) for Admin
          </button>
        </div>
      ) : (
        <div className="connect-bar" style={{ marginBottom: 16 }}>
          <span className="connected-addr">{account}</span>
          <span className="network-badge" style={{ color: 'var(--accent2)', borderColor: 'var(--accent2)' }}>Sepolia</span>
        </div>
      )}

      {signer && (
        <div className="fn-list">
          <RegisterFundPanel signer={signer} />
          <AdminPanel signer={signer} />
        </div>
      )}
    </div>
  )
}
