import { createContext, useContext, useState, useCallback } from 'react'
import { ethers } from 'ethers'

const WalletContext = createContext(null)

export function WalletProvider({ children }) {
  const [account, setAccount] = useState(null)
  const [signer, setSigner] = useState(null)
  const [error, setError] = useState(null)

  const connect = useCallback(async (networkParams = null) => {
    setError(null)
    if (!window.ethereum) {
      setError('MetaMask not found. Install it and try again.')
      return
    }
    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      await provider.send('eth_requestAccounts', [])

      if (networkParams) {
        const network = await provider.getNetwork()
        if (Number(network.chainId) !== parseInt(networkParams.chainId, 16)) {
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: networkParams.chainId }],
            })
          } catch (switchErr) {
            if (switchErr.code === 4902) {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [networkParams],
              })
            } else throw switchErr
          }
        }
      }

      const s = await provider.getSigner()
      setAccount(await s.getAddress())
      setSigner(s)
    } catch (e) {
      setError(e.message || String(e))
    }
  }, [])

  const disconnect = useCallback(() => {
    setAccount(null)
    setSigner(null)
    setError(null)
  }, [])

  return (
    <WalletContext.Provider value={{ account, signer, error, connect, disconnect }}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  return useContext(WalletContext)
}
