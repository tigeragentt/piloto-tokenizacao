# Remix IDE — Compiler Settings

| Setting | Value |
|---|---|
| Compiler | 0.8.36 |
| EVM version | cancun |
| Optimizer | enabled, 200 runs |

## How to load

1. Open [remix.ethereum.org](https://remix.ethereum.org)
2. Create a new file and paste `Observer.sol`, or use **Load from GitHub** pointing to this file
3. Apply the compiler settings above
4. Deploy to Injected Provider (MetaMask) on Sepolia

## Notes

- The import uses a raw GitHub URL — Remix fetches OpenZeppelin v5.2.0 automatically, no npm needed
- EVM version **cancun** is required to match the Hardhat config (important for Etherscan verification)
- After deployment, grant `REPORTER_ROLE` to the CRE wallet:
  ```
  grantRole(REPORTER_ROLE, <CRE_WALLET_ADDRESS>)
  ```
