# Remix IDE — Compiler Settings

| Setting | Value |
|---|---|
| Compiler | 0.8.36 |
| EVM version | cancun |
| Optimizer | enabled, 200 runs |

## How to load (T-contracts)

Load files in this order so imports resolve correctly:

1. `ReceiverTemplate.sol`
2. `IObserverFunds.sol`
3. `TObserverFunds.sol`
4. `TObserver.sol`

Apply the compiler settings above before compiling.

## Deploy order

1. Deploy **TObserverFunds** — no constructor args; deployer gets `DEFAULT_ADMIN_ROLE` + `ADMIN_ROLE`
2. Copy the `TObserverFunds` deployed address
3. Deploy **TObserver(_fund)** — paste the `TObserverFunds` address

## Notes

- All imports use `@openzeppelin/contracts` — Remix resolves them automatically, no npm needed
- EVM version **cancun** is required to match the Hardhat config (important for Etherscan verification)
- `TObserver` uses the simulation forwarder by default: `0x15fC6ae953E024d975e77382eEeC56A9101f9F88`
- To test `onReport` from MetaMask: call `setForwarderAddress(YOUR_WALLET)` first
- `ObserverTestV1.sol` is kept for architecture comparison only — it shows v1.0.0 before the fund registry and CRE receiver were introduced
