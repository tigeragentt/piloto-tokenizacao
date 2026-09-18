# Remix Test Inputs — TObserverFunds / TObserver

Copy-paste values to test the deployed contracts in the Remix UI.
All values are from `fixtures.json` so they match what the mock server serves.

**Load order in Remix:** `ReceiverTemplate.sol` → `IObserverFunds.sol` → `TObserverFunds.sol` → `TObserver.sol`

**Deploy order:**
1. Deploy `TObserverFunds` — no args; deployer gets `ADMIN_ROLE`
2. Deploy `TObserver(_fund)` — paste the `TObserverFunds` address

---

## 1. registerFund (on TObserverFunds)

Paste this tuple into the `f` parameter of `registerFund`:

```
[
  "be6f2e8a-5474-43c7-a692-7918c37e3f42",
  "Horizonte Crédito Multirrede FIDC — Piloto XDC",
  "eip155:51",
  "0x0000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000002",
  "0x0000000000000000000000000000000000000003",
  "xrpl:testnet",
  "rTestIssuerXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "CVD"
]
```

Check after: `isFundRegistered("be6f2e8a-5474-43c7-a692-7918c37e3f42")` → should return `true`

---

## 2. reportSettlement — order 0001 (ready to anchor)

Call on **TObserver**. `fundId` is the first field (new in v1.2.0):

```
[
  "be6f2e8a-5474-43c7-a692-7918c37e3f42",
  "test-order-0001-ready-to-anchor",
  "0xaabb000000000000000000000000000000000000000000000000000000000001",
  "ACQUIRED_WITH_LOCK",
  true,
  true,
  "0xdeadbeef00000000000000000000000000000000000000000000000000000001",
  "0xcc110000000000000000000000000000000000000000000000000000000001aa",
  "eip155:51",
  "xrpl:testnet"
]
```

Check after:
- `isOrderAnchored("test-order-0001-ready-to-anchor")` → `true`
- `isSettlementAnchored("0xaabb000000000000000000000000000000000000000000000000000000000001")` → `true`
- Call it again → should revert with `OrderAlreadyAnchored`

---

## 3. reportSettlement — order 0003 (simulate "already anchored" case)

```
[
  "be6f2e8a-5474-43c7-a692-7918c37e3f42",
  "test-order-0003-already-anchored",
  "0xaabb000000000000000000000000000000000000000000000000000000000003",
  "ACQUIRED_WITH_LOCK",
  true,
  true,
  "0xdeadbeef00000000000000000000000000000000000000000000000000000003",
  "0xcc110000000000000000000000000000000000000000000000000000000003aa",
  "eip155:51",
  "xrpl:testnet"
]
```

---

## 4. reportSettlement — order 0004 (tech-only, accounting not done)

```
[
  "be6f2e8a-5474-43c7-a692-7918c37e3f42",
  "test-order-0004-tech-only",
  "0xaabb000000000000000000000000000000000000000000000000000000000004",
  "ACQUIRED_WITH_LOCK",
  true,
  false,
  "0xdeadbeef00000000000000000000000000000000000000000000000000000004",
  "0xcc110000000000000000000000000000000000000000000000000000000004aa",
  "eip155:51",
  "xrpl:testnet"
]
```

---

## 5. reportAction (on TObserver)

`fundId` is the first parameter:

```
reportAction(
  "be6f2e8a-5474-43c7-a692-7918c37e3f42",   // fundId
  "eip155:51",                                // network
  0,                                          // ActionType.Transfer
  "0x0000000000000000000000000000000000000001",
  "0x0000000000000000000000000000000000000002",
  1000000000000000000,                        // 1 token (18 decimals)
  "0xdeadbeef000000000000000000000000000000000000000000000000deadbeef"
)
```

---

## 6. View calls to verify

All settlement/action reads are on **TObserver**; fund reads are on **TObserverFunds**.

| Contract | Function | Input | Expected |
|---|---|---|---|
| TObserver | `isOrderAnchored` | `"test-order-0001-ready-to-anchor"` | `true` |
| TObserver | `isOrderAnchored` | `"test-order-0002-not-settled"` | `false` |
| TObserver | `getSettlementCount` | — | number of anchored settlements |
| TObserver | `getLatestSettlement` | `0xaabb...0001` | full SettlementRecord |
| TObserver | `getSettlement` | `0` | first record |
| TObserverFunds | `getFundCount` | — | `1` after registerFund |
| TObserverFunds | `getFundById` | `"be6f2e8a-5474-43c7-a692-7918c37e3f42"` | full FundInfo |

---

## Notes

- Use `TObserverFunds.sol` for fund management (separate contract from TObserver)
- Use `TObserver.sol` for settlement and action records
- `fundId` (Capitare fund UUID) is now the **first field** in every `SettlementInput` and `ActionRecord` tuple
- `TObserver` reverts with `FundNotRegistered` if you call `reportSettlement` before `registerFund`
- `intentHash`, `deliveryProofSHA256`, `resolutionHash` are all `bytes32`: always `0x` + 64 hex chars
- Compare with `ObserverTestV1.sol` (kept in `remix/` for reference) to see how the architecture evolved
