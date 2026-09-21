import { useState } from 'react'

const TRIGGER_STORAGE = 'cre_trigger_url'
const DEFAULT_TRIGGER = 'http://localhost:2000/workflow-observer-staging/trigger'

export default function CREPage() {
  const [triggerUrl, setTriggerUrl] = useState(
    () => localStorage.getItem(TRIGGER_STORAGE) || DEFAULT_TRIGGER
  )
  const [editUrl, setEditUrl]     = useState(triggerUrl)
  const [editing, setEditing]     = useState(false)
  const [status, setStatus]       = useState('idle')
  const [result, setResult]       = useState(null)

  function saveUrl(v) {
    const url = v.trim() || DEFAULT_TRIGGER
    setTriggerUrl(url)
    localStorage.setItem(TRIGGER_STORAGE, url)
    setEditing(false)
  }

  async function triggerScan() {
    setStatus('loading')
    setResult(null)
    try {
      const resp = await fetch(triggerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual: true, source: 'frontend' }),
      })
      const text = await resp.text()
      let json
      try { json = JSON.parse(text) } catch { json = null }
      setResult({ ok: resp.ok, status: resp.status, body: json || text })
      setStatus(resp.ok ? 'success' : 'error')
    } catch (e) {
      setResult({ ok: false, body: e.message })
      setStatus('error')
    }
  }

  return (
    <div>
      <h1 className="page-title">CRE Workflow</h1>
      <p className="page-subtitle">
        workflow-observer — polls Capitare Observer API and anchors settlement proofs on Ethereum Sepolia via Observer.sol
      </p>

      {/* ── Workflow info ── */}
      <div className="section-label">Workflow Overview</div>
      <div className="card">
        <div className="card-title">workflow-observer (TypeScript CRE)</div>
        <table className="info-table">
          <tbody>
            <tr><td>Workflow file</td><td><code>workflow-observer/workflow.ts</code></td></tr>
            <tr><td>YAML config</td><td><code>workflow-observer/workflow.yaml</code></td></tr>
            <tr><td>Staging name</td><td><code>workflow-observer-staging</code></td></tr>
            <tr><td>Default schedule</td><td><code>0 */2 * * * *</code> (every 2 minutes)</td></tr>
            <tr><td>Source</td><td>Capitare Observer API → <code>ACQUIRED_WITH_LOCK</code> orders with <code>technicalSettlementCompleted = true</code></td></tr>
            <tr><td>Target</td><td>Observer.sol on Ethereum Sepolia — <code>reportSettlement()</code></td></tr>
            <tr><td>Secrets</td>
              <td>
                <code>capitare_observer_key</code> (API header) &amp;{' '}
                <code>cre_transaction_private_key</code> (Sepolia signer)
              </td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 10 }}>
          <strong>Dry-run mode:</strong> if <code>observerAddress</code> is empty in config, the workflow logs
          settlement data but does not send any transactions. Set a deployed Observer address to enable anchoring.
        </p>
      </div>

      {/* ── Trigger URL ── */}
      <div className="section-label">HTTP Trigger</div>
      <div className="fn-card">
        <div className="fn-header">
          <span className="fn-name">Manual Scan Trigger</span>
          <span className="fn-badge write">POST</span>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
          Triggers an immediate workflow run outside the cron schedule.
          The CRE node must be running locally with HTTP trigger enabled.
        </p>
        <div className="fn-inputs" style={{ flexDirection: 'column' }}>
          <div className="fn-input-group" style={{ width: '100%' }}>
            <label className="fn-input-label">Trigger URL</label>
            {editing ? (
              <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                <input
                  className="fn-input"
                  style={{ flex: 1 }}
                  value={editUrl}
                  onChange={e => setEditUrl(e.target.value)}
                  placeholder={DEFAULT_TRIGGER}
                />
                <button className="btn btn-primary btn-sm" onClick={() => saveUrl(editUrl)}>Save</button>
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditUrl(triggerUrl); setEditing(false) }}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={{ fontSize: 12, color: 'var(--accent2)', flex: 1, wordBreak: 'break-all' }}>{triggerUrl}</code>
                <button className="btn btn-secondary btn-sm" onClick={() => { setEditUrl(triggerUrl); setEditing(true) }}>Edit</button>
              </div>
            )}
          </div>
        </div>
        <button
          className="btn btn-primary btn-sm"
          style={{ marginTop: 10 }}
          onClick={triggerScan}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? <><span className="spinner" />Triggering…</> : 'Trigger Scan Now'}
        </button>
        {result && (
          <div className={`fn-result ${result.ok ? 'success' : 'error'}`} style={{ marginTop: 10 }}>
            <div style={{ marginBottom: 4 }}>HTTP {result.status || '—'} — {result.ok ? 'Scan triggered successfully' : 'Request failed'}</div>
            {result.body && (
              <pre style={{ margin: 0, fontSize: 11, overflowX: 'auto', maxHeight: 200 }}>
                {typeof result.body === 'string' ? result.body : JSON.stringify(result.body, null, 2)}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* ── Setup guide ── */}
      <div className="section-label">Setup</div>
      <div className="card">
        <div className="card-title">First-Time Setup Checklist</div>
        <ol style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 2.4, paddingLeft: 20, margin: 0 }}>
          <li>Deploy <code>Observer.sol</code> to Sepolia, copy the address</li>
          <li>Set <code>observerAddress</code> in <code>config/config.staging.json</code></li>
          <li>Grant <code>REPORTER_ROLE</code> to the CRE wallet on Observer.sol (use Observer page above)</li>
          <li>Create <code>secrets.yaml</code> with your actual keys (see template in repo root)</li>
          <li>Run: <code>npm install</code> inside <code>workflow-observer/</code></li>
          <li>Start the CRE node: <code>cre dev --config workflow.yaml</code></li>
          <li>Set the trigger URL above and click "Trigger Scan Now" to test</li>
        </ol>
      </div>

      {/* ── Config ── */}
      <div className="section-label">Staging Config Reference</div>
      <div className="card">
        <div className="card-title">config/config.staging.json</div>
        <pre style={{
          background: 'var(--bg3)',
          padding: 14,
          borderRadius: 8,
          fontSize: 12,
          overflowX: 'auto',
          margin: 0,
          color: 'var(--text)',
          lineHeight: 1.7,
        }}>
{`{
  "capitareBaseUrl": "https://dev-api-mercado-bitcoin.web3up.mobi/v1/external/observer",
  "capitareClientId": "mb-observer-demo",
  "fundId": "be6f2e8a-5474-43c7-a692-7918c37e3f42",
  "schedule": "0 */2 * * * *",
  "sepoliaRpcUrl": "https://ethereum-sepolia-rpc.publicnode.com",
  "sepoliaChainId": 11155111,
  "observerAddress": ""    // ← set after deploying Observer.sol
}`}
        </pre>
      </div>

      {/* ── Flow diagram ── */}
      <div className="section-label">Data Flow</div>
      <div className="card">
        <div className="card-title">workflow-observer Flow</div>
        <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-dim)', lineHeight: 2.2, padding: 4 }}>
          <div><span style={{ color: 'var(--accent2)' }}>Cron trigger (every 2 min)</span></div>
          <div style={{ paddingLeft: 20 }}>↓ GET /funds/:fundId/debenture-orders</div>
          <div style={{ paddingLeft: 20 }}>↓ filter: progress = ACQUIRED_WITH_LOCK &amp; technicalSettlementCompleted = true</div>
          <div style={{ paddingLeft: 20 }}>↓ for each order: isSettlementAnchored(intentHash) → skip if already anchored</div>
          <div style={{ paddingLeft: 20 }}>↓ GET /funds/:fundId/debenture-orders/:id/settlement</div>
          <div style={{ paddingLeft: 20 }}>↓ GET /funds/:fundId/debenture-orders/:id/proof</div>
          <div style={{ paddingLeft: 20 }}>↓ <span style={{ color: 'var(--green)' }}>Observer.reportSettlement(orderId, intentHash, …)</span> on Sepolia</div>
          <div style={{ paddingLeft: 20 }}>↓ emit <span style={{ color: 'var(--accent)' }}>SettlementAnchored</span> event</div>
        </div>
      </div>
    </div>
  )
}
