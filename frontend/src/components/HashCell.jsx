import { useState } from 'react'
import { isZeroBytes32 } from '../config.js'

export default function HashCell({ hash, href, chars = 8 }) {
  const [copied, setCopied] = useState(false)
  if (isZeroBytes32(hash)) return <span className="hash-zero">—</span>

  const display = hash
    ? `${hash.slice(0, chars + 2)}…${hash.slice(-(chars))}` // preserve 0x
    : '—'

  function copy(e) {
    e.preventDefault()
    navigator.clipboard.writeText(hash).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }

  return (
    <span className="hash-cell">
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="hash-link">{display}</a>
      ) : (
        <span className="hash-text">{display}</span>
      )}
      <button className="hash-copy-btn" onClick={copy} title="Copy full hash">
        {copied ? '✓' : '⧉'}
      </button>
    </span>
  )
}
