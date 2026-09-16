import { useState } from 'react'
import { useWallet } from '../context/WalletContext.jsx'

export default function WalletButton() {
  const { account, error, connect, disconnect } = useWallet()
  const [copied, setCopied] = useState(false)

  const shortAddr = account ? account.slice(0, 6) + '…' + account.slice(-4) : null

  function copyAddress() {
    navigator.clipboard.writeText(account).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="wallet-header-slot">
      {error && <span className="wallet-error-tip" title={error}>⚠</span>}
      {account ? (
        <>
          <span className="connected-addr-small">{shortAddr}</span>
          <button className="btn-copy" onClick={copyAddress} title="Copy full address" style={{ padding: '0.2rem 0.45rem' }}>
            {copied ? '✓' : '⧉'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={disconnect}>Disconnect</button>
        </>
      ) : (
        <button className="btn btn-primary btn-sm" onClick={() => connect()}>Connect MetaMask</button>
      )}
    </div>
  )
}
