import { useState } from 'react'
import { ethers } from 'ethers'
import { OBSERVER_ABI, OBSERVER_FUND_ABI } from '../abi.js'
import {
  SEPOLIA_RPC, OBSERVER_ADDRESS, OBSERVER_FUND_ADDRESS,
  shortHash, isZeroBytes32, formatTimestamp, sepoliaBlockUrl, sepoliaTxUrl,
  FUND_ID, XDC_FIDC_MANAGER, XDC_STABLE, XDC_ESCROW_FACTORY,
} from '../config.js'
import { useWallet } from '../context/WalletContext.jsx'
import WalletButton from '../components/WalletButton.jsx'

// ─── Result renderer ─────────────────────────────────────────────────────────

function FundRow({ f, i }) {
  return (
    <table className="info-table" style={{ marginTop: i > 0 ? 12 : 0 }}>
      <tbody>
        {i !== undefined && <tr><td colSpan={2} style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Fund #{i}</td></tr>}
        <tr><td>fundId</td><td style={{ fontFamily: 'monospace' }}>{f.fundId}</td></tr>
        <tr><td>name</td><td>{f.name}</td></tr>
        <tr><td>xdcNetwork</td><td style={{ fontFamily: 'monospace' }}>{f.xdcNetwork}</td></tr>
        <tr><td>xdcFidcManager</td><td style={{ fontFamily: 'monospace' }}>{f.xdcFidcManager}</td></tr>
        <tr><td>xdcStable</td><td style={{ fontFamily: 'monospace' }}>{f.xdcStable}</td></tr>
        <tr><td>xdcEscrowFactory</td><td style={{ fontFamily: 'monospace' }}>{f.xdcEscrowFactory}</td></tr>
        <tr><td>xrplNetwork</td><td style={{ fontFamily: 'monospace' }}>{f.xrplNetwork}</td></tr>
        <tr><td>xrplIssuer</td><td style={{ fontFamily: 'monospace' }}>{f.xrplIssuer}</td></tr>
        <tr><td>debentureCurrency</td><td style={{ fontFamily: 'monospace' }}>{f.debentureCurrency}</td></tr>
      </tbody>
    </table>
  )
}

function SettlementRow({ r, i }) {
  return (
    <table className="info-table" style={{ marginTop: i > 0 ? 12 : 0 }}>
      <tbody>
        {i !== undefined && <tr><td colSpan={2} style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Record #{i}</td></tr>}
        <tr><td>orderId</td><td style={{ fontFamily: 'monospace' }}>{r.orderId}</td></tr>
        <tr><td>intentHash</td><td style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{r.intentHash}</td></tr>
        <tr><td>progress</td><td><code>{r.progress}</code></td></tr>
        <tr><td>technicalCompleted</td><td>{r.technicalCompleted ? '✓ yes' : '✗ no'}</td></tr>
        <tr><td>accountingCompleted</td><td>{r.accountingCompleted ? '✓ yes' : '✗ no'}</td></tr>
        <tr><td>deliveryProofSHA256</td><td style={{ fontFamily: 'monospace', wordBreak: 'break-all', fontSize: 11 }}>{r.deliveryProofSHA256}</td></tr>
        <tr><td>resolutionHash</td><td style={{ fontFamily: 'monospace', wordBreak: 'break-all', fontSize: 11 }}>{r.resolutionHash}</td></tr>
        <tr><td>sourceNetwork</td><td style={{ fontFamily: 'monospace' }}>{r.sourceNetwork}</td></tr>
        <tr><td>destinationNetwork</td><td style={{ fontFamily: 'monospace' }}>{r.destinationNetwork}</td></tr>
        <tr><td>reportedAt</td><td>{formatTimestamp(r.reportedAt)}</td></tr>
        <tr><td>blockNumber</td><td>
          <a href={sepoliaBlockUrl(Number(r.blockNumber))} target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--accent2)' }}>{Number(r.blockNumber)}</a>
        </td></tr>
      </tbody>
    </table>
  )
}

function renderValue(val) {
  if (val === null || val === undefined) return '—'
  if (typeof val === 'boolean') return val ? 'true' : 'false'
  if (typeof val === 'bigint') return val.toString()
  if (typeof val === 'string') return val
  if (Array.isArray(val)) {
    if (val.length === 0) return '(empty array)'
    return null
  }
  if (typeof val === 'object') return null
  return String(val)
}

function ResultDisplay({ result, fnName }) {
  if (result === null || result === undefined) return null

  // array of settlements
  if (Array.isArray(result) && result.length > 0 && result[0]?.orderId !== undefined) {
    return <div style={{ marginTop: 8 }}>{result.map((r, i) => <SettlementRow key={i} r={r} i={i} />)}</div>
  }
  // array of funds
  if (Array.isArray(result) && result.length > 0 && result[0]?.fundId !== undefined) {
    return <div style={{ marginTop: 8 }}>{result.map((f, i) => <FundRow key={i} f={f} i={i} />)}</div>
  }
  // empty array
  if (Array.isArray(result) && result.length === 0) {
    return <div className="fn-result success">(empty array)</div>
  }
  // single settlement
  if (result?.orderId !== undefined) return <SettlementRow r={result} />
  // single fund
  if (result?.fundId !== undefined) return <FundRow f={result} />
  // scalar
  const text = renderValue(result)
  if (text !== null) return <div className="fn-result success">{text}</div>
  return <div className="fn-result success">{JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2)}</div>
}

// ─── Generic read panel ───────────────────────────────────────────────────────

function ReadPanel({ fnName, params, call }) {
  const [vals, setVals] = useState(params.map(() => ''))
  const [result, setResult] = useState(undefined)
  const [status, setStatus] = useState('idle')
  const [err, setErr] = useState(null)

  async function run() {
    setStatus('loading')
    setErr(null)
    setResult(undefined)
    try {
      const args = params.map((p, i) => {
        const v = vals[i].replace(/\s+/g, '')
        if (p.type === 'uint256') return BigInt(v)
        if (p.type === 'bytes32') return v.startsWith('0x') ? v : `0x${v}`
        return v
      })
      const res = await call(...args)
      setResult(res)
      setStatus('success')
    } catch (e) {
      setErr(e.message || String(e))
      setStatus('error')
    }
  }

  const sig = `${fnName}(${params.map(p => `${p.type} ${p.name}`).join(', ')})`

  return (
    <div className="fn-card">
      <div className="fn-header" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          <span className="fn-name">{sig}</span>
          <span className="fn-badge read">read</span>
        </div>
        <button className="btn btn-primary btn-sm" style={{ flexShrink: 0, marginLeft: 8 }} onClick={run} disabled={status === 'loading'}>
          {status === 'loading' ? <><span className="spinner" />Calling…</> : 'Call'}
        </button>
      </div>
      {params.length > 0 && (
        <div className="fn-inputs" style={{ flexDirection: 'column', gap: 8 }}>
          {params.map((p, i) => (
            <div key={i} className="fn-input-group" style={{ width: '100%' }}>
              <label className="fn-input-label">{p.name} ({p.type})</label>
              <input
                className="fn-input"
                style={{ width: '100%' }}
                placeholder={p.placeholder || p.type}
                value={vals[i]}
                onChange={e => setVals(prev => { const n = [...prev]; n[i] = e.target.value; return n })}
              />
            </div>
          ))}
        </div>
      )}
      {err && <div className="fn-result error">{err}</div>}
      {status === 'success' && <ResultDisplay result={result} fnName={fnName} />}
    </div>
  )
}

// ─── Generic write panel ──────────────────────────────────────────────────────

function WritePanel({ fnName, params, call, signer, disabled: extDisabled }) {
  const [vals, setVals] = useState(params.map(() => ''))
  const [status, setStatus] = useState('idle')
  const [msg, setMsg] = useState(null)

  async function send() {
    if (!signer) return
    setStatus('loading')
    setMsg(null)
    try {
      const args = params.map((p, i) => {
        const v = vals[i].replace(/\s+/g, '')
        if (p.type === 'uint256') return BigInt(v)
        if (p.type === 'bytes32') return v.startsWith('0x') ? v : `0x${v}`
        return v
      })
      const tx = await call(signer, ...args)
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

  const sig = `${fnName}(${params.map(p => `${p.type} ${p.name}`).join(', ')})`

  return (
    <div className="fn-card">
      <div className="fn-header" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          <span className="fn-name">{sig}</span>
          <span className="fn-badge write">write</span>
        </div>
        <button className="btn btn-primary btn-sm" style={{ flexShrink: 0, marginLeft: 8 }} onClick={send}
          disabled={!signer || status === 'loading' || status === 'pending' || extDisabled}>
          {status === 'loading' || status === 'pending' ? <><span className="spinner" />Sending…</> : 'Send'}
        </button>
      </div>
      {!signer && <div className="fn-result error" style={{ marginBottom: 8 }}>Connect wallet to send transactions</div>}
      {params.length > 0 && (
        <div className="fn-inputs" style={{ flexDirection: 'column', gap: 8 }}>
          {params.map((p, i) => (
            <div key={i} className="fn-input-group" style={{ width: '100%' }}>
              <label className="fn-input-label">{p.name} ({p.type})</label>
              <input
                className="fn-input"
                style={{ width: '100%' }}
                placeholder={p.placeholder || p.type}
                value={vals[i]}
                onChange={e => setVals(prev => { const n = [...prev]; n[i] = e.target.value; return n })}
              />
            </div>
          ))}
        </div>
      )}
      {msg && (
        <div className={`fn-result ${status === 'pending' ? 'pending' : status}`}>
          {status === 'success' || status === 'pending'
            ? <a href={sepoliaTxUrl(msg.match(/0x[0-9a-f]{64}/i)?.[0])} target="_blank" rel="noopener noreferrer"
                style={{ color: 'inherit' }}>{msg}</a>
            : msg}
        </div>
      )}
    </div>
  )
}

// ─── registerFund (tuple) panel ───────────────────────────────────────────────

const FUND_FIELDS = [
  ['fundId',            'fundId (string)',                   FUND_ID],
  ['name',              'name (string)',                     'Horizonte Crédito Multirrede FIDC — Piloto XDC'],
  ['xdcNetwork',        'xdcNetwork (string)',               'eip155:51'],
  ['xdcFidcManager',    'xdcFidcManager (address)',          XDC_FIDC_MANAGER],
  ['xdcStable',         'xdcStable (address)',               XDC_STABLE],
  ['xdcEscrowFactory',  'xdcEscrowFactory (address)',        XDC_ESCROW_FACTORY],
  ['xrplNetwork',       'xrplNetwork (string)',              'xrpl:testnet'],
  ['xrplIssuer',        'xrplIssuer (string)',               'r9aceEB7Qy5JrHtYt2KGhF4KVMgEGjoY2U'],
  ['debentureCurrency', 'debentureCurrency (string)',        'CVD'],
]

function RegisterFundPanel({ signer, addr }) {
  const [form, setForm] = useState(Object.fromEntries(FUND_FIELDS.map(([k,, v]) => [k, v])))
  const [status, setStatus] = useState('idle')
  const [msg, setMsg] = useState(null)

  async function send() {
    if (!signer) return
    setStatus('loading')
    setMsg(null)
    try {
      const c = new ethers.Contract(addr, OBSERVER_FUND_ABI, signer)
      const tx = await c.registerFund(form)
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

  return (
    <div className="fn-card">
      <div className="fn-header" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          <span className="fn-name">registerFund(FundInfo f)</span>
          <span className="fn-badge write">write / owner</span>
        </div>
        <button className="btn btn-primary btn-sm" style={{ flexShrink: 0, marginLeft: 8 }} onClick={send}
          disabled={!signer || status === 'loading' || status === 'pending'}>
          {status === 'loading' || status === 'pending' ? <><span className="spinner" />Sending…</> : 'Send'}
        </button>
      </div>
      {!signer && <div className="fn-result error" style={{ marginBottom: 8 }}>Connect wallet to send transactions</div>}
      <div className="fn-inputs" style={{ flexDirection: 'column', gap: 8 }}>
        {FUND_FIELDS.map(([key, label]) => (
          <div key={key} className="fn-input-group" style={{ width: '100%' }}>
            <label className="fn-input-label">{label}</label>
            <input className="fn-input" style={{ width: '100%' }}
              value={form[key]}
              onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
          </div>
        ))}
      </div>
      {msg && (
        <div className={`fn-result ${status === 'pending' ? 'pending' : status}`}>
          {status === 'success' || status === 'pending'
            ? <a href={sepoliaTxUrl(msg.match(/0x[0-9a-f]{64}/i)?.[0])} target="_blank" rel="noopener noreferrer"
                style={{ color: 'inherit' }}>{msg}</a>
            : msg}
        </div>
      )}
    </div>
  )
}

// ─── Address header ───────────────────────────────────────────────────────────

function ContractHeader({ label, defaultAddr, addr, setAddr }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(addr)

  function save() { setAddr(draft.trim()); setEditing(false) }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
      <span style={{ fontWeight: 600, fontSize: 13 }}>{label}</span>
      {editing ? (
        <>
          <input className="fn-input" style={{ flex: 1, minWidth: 340 }} value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }} />
          <button className="btn btn-primary btn-sm" onClick={save}>Save</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { setDraft(defaultAddr); setAddr(defaultAddr); setEditing(false) }}>Reset</button>
        </>
      ) : (
        <>
          <code style={{ fontSize: 11, color: 'var(--accent2)', wordBreak: 'break-all' }}>
            {addr || <span style={{ color: 'var(--red)' }}>not set</span>}
          </code>
          <button className="btn btn-secondary btn-sm" onClick={() => { setDraft(addr); setEditing(true) }}>Edit</button>
        </>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const CONTRACTS = [
  { value: 'fund',     label: 'ObserverFund.sol' },
  { value: 'observer', label: 'Observer.sol'      },
]

export default function RemixPage() {
  const { signer } = useWallet()
  const [selected,     setSelected]     = useState('fund')
  const [fundAddr,     setFundAddr]     = useState(OBSERVER_FUND_ADDRESS || '')
  const [observerAddr, setObserverAddr] = useState(OBSERVER_ADDRESS      || '')

  const ro = () => new ethers.JsonRpcProvider(SEPOLIA_RPC)
  const fund     = () => new ethers.Contract(fundAddr,     OBSERVER_FUND_ABI, ro())
  const observer = () => new ethers.Contract(observerAddr, OBSERVER_ABI,      ro())

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Remix</h1>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {CONTRACTS.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <p className="page-subtitle">All contract functions — Ethereum Sepolia</p>

      {!signer && (
        <div className="alert alert-warn" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          Connect your wallet to use write functions.
          <WalletButton />
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          ObserverFund
      ════════════════════════════════════════════════════════════════════════ */}
      {selected === 'fund' && (
        <>
          <ContractHeader
            label="ObserverFund address"
            defaultAddr={OBSERVER_FUND_ADDRESS || ''}
            addr={fundAddr}
            setAddr={setFundAddr}
          />
          <div className="fn-list">
            <ReadPanel fnName="getFundCount" params={[]}
              call={() => fund().getFundCount()} />

            <ReadPanel fnName="isFundRegistered"
              params={[{ name: 'fundId', type: 'string', placeholder: 'be6f2e8a-…' }]}
              call={id => fund().isFundRegistered(id)} />

            <ReadPanel fnName="getFundById"
              params={[{ name: 'fundId', type: 'string', placeholder: 'be6f2e8a-…' }]}
              call={id => fund().getFundById(id)} />

            <ReadPanel fnName="getFund"
              params={[{ name: 'idx', type: 'uint256', placeholder: '0' }]}
              call={i => fund().getFund(i)} />

            <ReadPanel fnName="getLatestFunds"
              params={[{ name: 'count', type: 'uint256', placeholder: '5' }]}
              call={n => fund().getLatestFunds(n)} />

            <RegisterFundPanel signer={signer} addr={fundAddr} />
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          Observer
      ════════════════════════════════════════════════════════════════════════ */}
      {selected === 'observer' && (
        <>
          <ContractHeader
            label="Observer address"
            defaultAddr={OBSERVER_ADDRESS || ''}
            addr={observerAddr}
            setAddr={setObserverAddr}
          />
          <div className="fn-list">
            <ReadPanel fnName="VERSION"               params={[]} call={() => observer().VERSION()} />
            <ReadPanel fnName="fund"                  params={[]} call={() => observer().fund()} />
            <ReadPanel fnName="getForwarderAddress"   params={[]} call={() => observer().getForwarderAddress()} />
            <ReadPanel fnName="getExpectedWorkflowId" params={[]} call={() => observer().getExpectedWorkflowId()} />
            <ReadPanel fnName="getSettlementCount"    params={[]} call={() => observer().getSettlementCount()} />

            <ReadPanel fnName="isOrderNotarized"
              params={[{ name: 'orderId', type: 'string', placeholder: '8fdac770-…' }]}
              call={id => observer().isOrderNotarized(id)} />

            <ReadPanel fnName="isSettlementNotarized"
              params={[{ name: 'intentHash', type: 'bytes32', placeholder: '0x…' }]}
              call={h => observer().isSettlementNotarized(h)} />

            <ReadPanel fnName="isActionNotarized"
              params={[
                { name: 'network', type: 'string', placeholder: 'eip155:51' },
                { name: 'txHash',  type: 'string', placeholder: '0x…' },
              ]}
              call={(net, tx) => observer().isActionNotarized(net, tx)} />

            <ReadPanel fnName="latestSettlementId"
              params={[{ name: 'intentHash', type: 'bytes32', placeholder: '0x…' }]}
              call={h => observer().latestSettlementId(h)} />

            <ReadPanel fnName="getLatestSettlement"
              params={[{ name: 'intentHash', type: 'bytes32', placeholder: '0x…' }]}
              call={h => observer().getLatestSettlement(h)} />

            <ReadPanel fnName="getSettlement"
              params={[{ name: 'recordId', type: 'uint256', placeholder: '0' }]}
              call={i => observer().getSettlement(i)} />

            <ReadPanel fnName="getLatestSettlements"
              params={[{ name: 'count', type: 'uint256', placeholder: '5' }]}
              call={n => observer().getLatestSettlements(n)} />

            <ReadPanel fnName="getSettlements"
              params={[
                { name: 'fromIndex', type: 'uint256', placeholder: '0' },
                { name: 'toIndex',   type: 'uint256', placeholder: '5' },
              ]}
              call={(from, to) => observer().getSettlements(from, to)} />

            <WritePanel fnName="setForwarderAddress"
              params={[{ name: '_forwarder', type: 'address', placeholder: '0x15fC6ae953…' }]}
              signer={signer}
              call={(s, addr) => new ethers.Contract(observerAddr, OBSERVER_ABI, s).setForwarderAddress(addr)} />

            <WritePanel fnName="setExpectedAuthor"
              params={[{ name: '_author', type: 'address', placeholder: '0x…' }]}
              signer={signer}
              call={(s, addr) => new ethers.Contract(observerAddr, OBSERVER_ABI, s).setExpectedAuthor(addr)} />

            <WritePanel fnName="setExpectedWorkflowId"
              params={[{ name: '_id', type: 'bytes32', placeholder: '0x…' }]}
              signer={signer}
              call={(s, id) => new ethers.Contract(observerAddr, OBSERVER_ABI, s).setExpectedWorkflowId(id)} />
          </div>
        </>
      )}
    </div>
  )
}
