# Remix IDE — T-contracts

## Compiler Settings

| Setting | Value |
|---|---|
| Compiler | 0.8.36 |
| EVM version | cancun |
| Optimizer | enabled, 200 runs |

## Files

| File | Version | Notes |
|---|---|---|
| `ReceiverTemplate.sol` | — | Remix-only copy; inlines owner pattern (no Ownable import) for AccessControl compatibility |
| `IObserverFund.sol` | — | Interface; defines `FundInput` / `FundInfo` structs |
| `TObserverFund.sol` | 1.1.0 | `AccessControl` (ADMIN_ROLE); implements `IObserverFund` |
| `TObserver.sol` | 1.3.0 | `ReceiverTemplate + AccessControl`; hardcoded simulation forwarder; public write functions; fundId in all structs |
| `ObserverTestV1.sol` | 1.0.0 | Original monolithic contract — no CRE receiver, no fund split; kept for reference |

## Load order in Remix

Load files in this order so imports resolve correctly:

1. `ReceiverTemplate.sol`
2. `IObserverFund.sol`
3. `TObserverFund.sol`
4. `TObserver.sol`

Apply the compiler settings above before compiling.

## Deploy order

1. Deploy **TObserverFund** — no constructor args; deployer gets `DEFAULT_ADMIN_ROLE` + `ADMIN_ROLE`
2. Copy the `TObserverFund` deployed address
3. Deploy **TObserver(_fund)** — paste the `TObserverFund` address

## Test sequence in Remix

Connect MetaMask to Sepolia, then run in order:

### 1. registerFund (on TObserverFund)

```
["be6f2e8a-5474-43c7-a692-7918c37e3f42","Horizonte Crédito Multirrede FIDC — Piloto XDC","eip155:51","0x0000000000000000000000000000000000000001","0x0000000000000000000000000000000000000002","0x0000000000000000000000000000000000000003","xrpl:testnet","rTestIssuerXXXXXXXXXXXXXXXXXXXXXXXXXX","CVD"]
```

Verify: `isFundRegistered("be6f2e8a-5474-43c7-a692-7918c37e3f42")` → `true`

### 2. reportSettlement (on TObserver) — order 0001

`fundId` is the **first field** in `SettlementInput` (v1.2.0+):

```
["be6f2e8a-5474-43c7-a692-7918c37e3f42","test-order-0001-ready-to-anchor","0xaabb000000000000000000000000000000000000000000000000000000000001","ACQUIRED_WITH_LOCK",true,true,"0xdeadbeef00000000000000000000000000000000000000000000000000000001","0xcc110000000000000000000000000000000000000000000000000000000001aa","eip155:51","xrpl:testnet"]
```

Verify:
- `isOrderAnchored("test-order-0001-ready-to-anchor")` → `true`
- `isSettlementAnchored("0xaabb...0001")` → `true`
- Call again → reverts with `OrderAlreadyAnchored`
- Call with unregistered fundId → reverts with `FundNotRegistered`

### 3. Test the CRE `onReport` path

```solidity
setForwarderAddress(YOUR_METAMASK_ADDRESS)
// call onReport with metadata = 0x, report = abi.encode(SettlementInput)
setForwarderAddress(0x15fC6ae953E024d975e77382eEeC56A9101f9F88)  // restore
```

### 4. View calls

| Contract | Function | Input | Expected |
|---|---|---|---|
| TObserver | `isOrderAnchored` | `"test-order-0001-ready-to-anchor"` | `true` |
| TObserver | `getSettlementCount` | — | count |
| TObserver | `getForwarderAddress` | — | current forwarder |
| TObserverFund | `getFundCount` | — | `1` |
| TObserverFund | `getFundById` | `"be6f2e8a-5474-43c7-a692-7918c37e3f42"` | full FundInfo |

> See `test/remix-inputs.md` for complete copy-paste tuples for all test calls.

## Forwarder addresses

| Network | Address |
|---|---|
| Ethereum Sepolia — simulation | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` |
| Ethereum Sepolia — production | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` |

- `TObserver` defaults to the simulation forwarder
- To test `onReport` from MetaMask: call `setForwarderAddress(YOUR_WALLET)` first
- All imports use `@openzeppelin/contracts` — Remix resolves them automatically, no npm needed
- EVM version **cancun** is required to match the Hardhat config (important for Etherscan verification)
