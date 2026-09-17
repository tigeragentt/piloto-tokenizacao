# Remix Test Inputs — Observer / ObserverTest

Copy-paste values to test the deployed contract in the Remix UI.
All values are from `fixtures.json` so they match what the mock server serves.

---

## 1. registerFund

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

```
[
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

## 5. View calls to verify

| Function | Input | Expected |
|---|---|---|
| `isOrderAnchored` | `"test-order-0001-ready-to-anchor"` | `true` |
| `isOrderAnchored` | `"test-order-0002-not-settled"` | `false` |
| `getSettlementCount` | — | number of anchored settlements |
| `getLatestSettlement` | `0xaabb...0001` | full SettlementRecord |
| `getSettlement` | `0` | first record |
| `getFundCount` | — | `1` after registerFund |
| `getFundById` | `"be6f2e8a-5474-43c7-a692-7918c37e3f42"` | full FundInfo |

---

## Notes

- Use `ObserverTest.sol` on Remix (constructor grants REPORTER_ROLE to msg.sender automatically)
- Use `Observer.sol` via Hardhat for production — REPORTER_ROLE must be granted separately
- intentHash is bytes32: always 0x + 64 hex chars
- deliveryProofSHA256 and resolutionHash are also bytes32 with 0x prefix
