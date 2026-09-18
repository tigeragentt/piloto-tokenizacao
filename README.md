# piloto-tokenizacao

Official pilot implementation for the ABToken / CVM regulatory tokenization project.

**Fund:** Horizonte Crédito Multirrede FIDC — Piloto XDC  
**Regulator:** CVM (Comissão de Valores Mobiliários)  
**Context:** GTT Frente 2 — debenture tokenization on XDC + XRPL

---

## Architecture

The settlement algorithm is `COORDINATED_CUSTODIAL_DELIVERY_THEN_PAYMENT`:

1. BRL-CVM (ERC-20) is locked in an escrow contract on XDC (chain 51)
2. CVD debenture IOU is delivered on XRPL testnet to the fund's custody wallet
3. The escrow releases BRL-CVM payment to the seller on XDC

Cross-chain correlation key: `intentHash` (appears as `InvoiceID` in the XRPL Payment tx)

```
XDC (eip155:51)                          XRPL testnet
────────────────────────────────         ─────────────────────────────
fidc-manager (0x8001BB21…)               issuer: r9aceEB7…
stable BRL-CVM (0x243e98…)               currency: CVD
escrow-factory (0x5f6d0B…)
escrow proxy (per-order, EIP-1167)
                         intentHash ←─────────────────────────────→
```

**Observer.sol** (Ethereum Sepolia) is the immutable supervisability layer:
- Chainlink CRE workflows anchor settlement proofs from the Capitare API
- CVM can independently verify `deliveryProofSHA256` and `resolutionHash` without trusting any intermediary

## Repository structure

```
smart-contracts/         Observer.sol (Hardhat, Sepolia)
workflow-capitare/       CRE workflow: polls Capitare API, anchors proofs on-chain
frontend/                React dashboard (Vite) — Dashboard, Orders, Observer, XDC, CRE pages
project.yaml             CRE project config (Sepolia chain selector + RPC)
secrets.yaml             CRE secret name → env var mapping (no actual values)
```

## Known staging test values

| Key | Value | Where it lives |
|---|---|---|
| `OBSERVER_ID` | `mb-observer-demo` | `capitareClientId` in `config.staging.json` |
| `BASE` | `https://dev-api-mercado-bitcoin.web3up.mobi/v1/external/observer` | `capitareBaseUrl` in `config.staging.json` |
| `FUND` | `be6f2e8a-5474-43c7-a692-7918c37e3f42` | `fundId` in `config.staging.json` |
| `ORDER` (test order) | `8fdac770-7ca3-4a1f-a283-33efa75c96ef` | `testOrderId` in `config.staging.json` |
| `OBSERVER_KEY` | _(secret)_ | `CAPITARE_OBSERVER_KEY` in `.env` |

### How to use in tests

**Option A — curl the staging API directly**

Make sure `CAPITARE_OBSERVER_KEY` is exported in your shell first:

```bash
export OBSERVER_ID='mb-observer-demo'
export OBSERVER_KEY='<value from .env>'
export BASE='https://dev-api-mercado-bitcoin.web3up.mobi/v1/external/observer'
export FUND='be6f2e8a-5474-43c7-a692-7918c37e3f42'
export ORDER='8fdac770-7ca3-4a1f-a283-33efa75c96ef'
```

List all orders for the fund:
```bash
curl -s \
  -H "X-Observer-Id: $OBSERVER_ID" \
  -H "X-Observer-Key: $OBSERVER_KEY" \
  "$BASE/funds/$FUND/debenture-orders" | python -m json.tool
```

Get settlement for the test order:
```bash
curl -s \
  -H "X-Observer-Id: $OBSERVER_ID" \
  -H "X-Observer-Key: $OBSERVER_KEY" \
  "$BASE/funds/$FUND/debenture-orders/$ORDER/settlement" | python -m json.tool
```

Get proof for the test order:
```bash
curl -s \
  -H "X-Observer-Id: $OBSERVER_ID" \
  -H "X-Observer-Key: $OBSERVER_KEY" \
  "$BASE/funds/$FUND/debenture-orders/$ORDER/proof" | python -m json.tool
```

**Option B — run CRE simulate against the real staging API**

All four non-secret values are already in `config.staging.json`. Only `CAPITARE_OBSERVER_KEY` needs to be in `.env`:

```bash
# CRON trigger — scans all orders and anchors settled ones
cre workflow simulate workflow-capitare --target staging-settings --non-interactive --trigger-index 0

# HTTP trigger — same logic, manual fire
cre workflow simulate workflow-capitare --target staging-settings --non-interactive --trigger-index 1 --http-payload ./workflow-capitare/payload.json
```

**Option C — run against the mock (no real API or keys needed)**

```bash
node test/mock-server.js &
cre workflow simulate workflow-capitare --target test-settings --non-interactive --trigger-index 0
```

---

## Testing with ObserverTest.sol

`ObserverTest.sol` is the Remix-ready version of Observer for development testing.

| | Observer.sol | ObserverTest.sol |
|---|---|---|
| Deploy via | Hardhat | Remix IDE |
| REPORTER_ROLE | Must be granted manually after deploy | Auto-granted to `msg.sender` in constructor |
| Deployed on Sepolia | see config | `0x84E0439Da40a543E45847841393d71A45A715537` |
| Purpose | Production / CRE workflow | Manual testing in Remix |

### Test sequence in Remix

Connect MetaMask to Sepolia, load `smart-contracts/remix/ObserverTest.sol`, and run in order:

**1. registerFund**

Paste into the `f` parameter:
```
["be6f2e8a-5474-43c7-a692-7918c37e3f42","Horizonte Crédito Multirrede FIDC — Piloto XDC","eip155:51","0x0000000000000000000000000000000000000001","0x0000000000000000000000000000000000000002","0x0000000000000000000000000000000000000003","xrpl:testnet","rTestIssuerXXXXXXXXXXXXXXXXXXXXXXXXXX","CVD"]
```
Verify: `isFundRegistered("be6f2e8a-5474-43c7-a692-7918c37e3f42")` → `true`

**2. reportSettlement** — order 0001 (ready to anchor)
```
["test-order-0001-ready-to-anchor","0xaabb000000000000000000000000000000000000000000000000000000000001","ACQUIRED_WITH_LOCK",true,true,"0xdeadbeef00000000000000000000000000000000000000000000000000000001","0xcc110000000000000000000000000000000000000000000000000000000001aa","eip155:51","xrpl:testnet"]
```
Verify:
- `isOrderAnchored("test-order-0001-ready-to-anchor")` → `true`
- `isSettlementAnchored("0xaabb000000000000000000000000000000000000000000000000000000000001")` → `true`
- Call again with same orderId → should revert with `OrderAlreadyAnchored`

**3. reportSettlement** — order 0003 (already anchored case)
```
["test-order-0003-already-anchored","0xaabb000000000000000000000000000000000000000000000000000000000003","ACQUIRED_WITH_LOCK",true,true,"0xdeadbeef00000000000000000000000000000000000000000000000000000003","0xcc110000000000000000000000000000000000000000000000000000000003aa","eip155:51","xrpl:testnet"]
```

**4. reportSettlement** — order 0004 (technical done, accounting pending)
```
["test-order-0004-tech-only","0xaabb000000000000000000000000000000000000000000000000000000000004","ACQUIRED_WITH_LOCK",true,false,"0xdeadbeef00000000000000000000000000000000000000000000000000000004","0xcc110000000000000000000000000000000000000000000000000000000004aa","eip155:51","xrpl:testnet"]
```

**5. View calls to verify state**

| Function | Input | Expected result |
|---|---|---|
| `isOrderAnchored` | `"test-order-0001-ready-to-anchor"` | `true` |
| `isOrderAnchored` | `"test-order-0002-not-settled"` | `false` |
| `getSettlementCount` | — | count of anchored settlements |
| `getLatestSettlement` | `0xaabb...0001` | full SettlementRecord |
| `getSettlement` | `0` | first record |
| `getFundCount` | — | `1` |
| `getFundById` | `"be6f2e8a-5474-43c7-a692-7918c37e3f42"` | full FundInfo |

> All fake input values match `test/fixtures.json` — run `node test/mock-server.js` to serve these same values as Capitare API for CRE workflow testing.

---

## Local testing (no real API needed)

Start the Capitare mock server (zero dependencies, Node built-in only):

```bash
node test/mock-server.js
# Capitare mock server running on http://localhost:3001
```

Run the CRE workflow against the mock:

```bash
cre workflow simulate workflow-capitare --target test-settings --non-interactive --trigger-index 0
```

For the frontend, set `CAPITARE_BASE_URL=http://localhost:3001` in `.env.local` so Vite proxies to the mock instead of the real API.

For Remix contract testing, see `test/remix-inputs.md` — copy-paste values for `registerFund`, `reportSettlement`, and all view calls.

---

## Frontend

React + Vite dashboard. Pages: Dashboard, Orders, Observer, Capitare, XDC, CRE.

### Local dev

```bash
cd frontend
npm install
```

Create `frontend/.env` (gitignored):

```
OBSERVER_ADDRESS=0x84E0439Da40a543E45847841393d71A45A715537
```

Start the dev server:

```bash
npm run dev
# http://localhost:5175
```

The Vite dev server proxies `/capitare-api` → Capitare staging API automatically, so no CORS issues in dev.

To test against the local mock server instead of the real API, set in `frontend/.env`:

```
CAPITARE_BASE=http://localhost:3001
```

### Build for production

```bash
npm run build
# output: frontend/dist/
```

Preview the production build locally before publishing:

```bash
npm run preview
```

### Publish (static hosting)

The `dist/` folder is a standard SPA — deploy to any static host:

**GitHub Pages:**
```bash
npm run build
# push frontend/dist/ to the gh-pages branch, or use gh-pages package
npx gh-pages -d dist
```

**Netlify / Vercel / Cloudflare Pages:**
- Build command: `npm run build`
- Output directory: `dist`
- Set `OBSERVER_ADDRESS` as an environment variable in the hosting dashboard

> Remember to set `OBSERVER_ADDRESS` as an env var in the hosting platform, not just in local `.env`.

---

## Setup

### Smart contracts

```bash
cd smart-contracts
npm install
npx hardhat compile
```

Deploy to Sepolia (set private key in hardhat.config.js `accounts` array or via env):

```bash
npx hardhat run scripts/deploy.js --network sepolia
```

After deployment:
1. Set `observerAddress` in `workflow-capitare/config/config.staging.json`
2. Grant `REPORTER_ROLE` to the CRE wallet on the deployed Observer:
   ```solidity
   observer.grantRole(REPORTER_ROLE, CRE_WALLET_ADDRESS)
   ```

### CRE workflow

Copy the env template and fill in your values:

```bash
cp .env.example .env
# edit .env and set CRE_ETH_PRIVATE_KEY
```

Install dependencies from the **project root**:

```bash
bun install --cwd ./workflow-capitare
```

Set CRE secrets (stored in the DON, not locally):
```
CAPITARE_OBSERVER_KEY=<from observer-api.env>
CRE_TRANSACTION_PRIVATE_KEY=<CRE wallet private key>
```

Simulate — CRON trigger (no payload needed):
```bash
cre workflow simulate workflow-capitare --target staging-settings --non-interactive --trigger-index 0
```

Simulate — HTTP trigger (uses `payload.json`):
```bash
cre workflow simulate workflow-capitare --target staging-settings --non-interactive --trigger-index 1 --http-payload ./workflow-capitare/payload.json
```

> Simulation calls the **real Capitare API** and the **real Sepolia RPC** — no mocks.
> Set `CAPITARE_OBSERVER_KEY` in `.env` and `observerAddress` in `config.staging.json` before running.

Deploy (staging):
```bash
bunx cre deploy --env staging
```

## Capitare API endpoints used

| Endpoint | Purpose |
|---|---|
| `GET /funds/{fundId}/debenture-orders` | List all orders with progress state |
| `GET /funds/{fundId}/debenture-orders/{id}/settlement` | Settlement proof (resolutionHash, flags) |

The workflow only anchors orders where `technicalSettlementCompleted = true`.

## Observer.sol — what CVM can verify

| Field | How to verify |
|---|---|
| `deliveryProofSHA256` | sha256 of the `capitare:debentures:delivery-proof:v1` canonical manifest |
| `resolutionHash` | keccak256 of resolution struct; must match `LockResolved` event on XDC escrow |
| `intentHash` | Cross-reference with XRPL transaction `InvoiceID` field |

## XDC contracts (Apothem testnet, chain 51)

| Contract | Address |
|---|---|
| fidc-manager | `0x6E45fFEB71b4d6beA4CC1ddDf8EE310AA49cB3Fa` |
| fidc | `0x8001BB21f4F061b444F02f50Ab76BAA6a84394A2` |
| stable BRL-CVM | `0x243e98638D619eB6f10eaBbaCfC071f318D5e9d0` |
| escrow-factory | `0x5f6d0B7886858ac75c32b9642090067157651Ff4` |
