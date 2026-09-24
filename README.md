# piloto-tokenizacao

Official pilot implementation for the ABToken / CVM regulatory tokenization project.

**Fund:** Horizonte Crédito Multirrede FIDC — Piloto XDC  
**Regulator:** CVM (Comissão de Valores Mobiliários)  
**Context:** GTT — debenture tokenization on XD, XRPL and Stellar

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
- Chainlink CRE workflows anchor settlement proofs from the Observer API
- CVM can independently verify `deliveryProofSHA256` and `resolutionHash` without trusting any intermediary
- Implements `IReceiver` (ReceiverTemplate pattern) — the Chainlink KeystoneForwarder calls `onReport()` with DON-signed reports

## Repository structure

```
smart-contracts/
  contracts/
    Observer.sol         v1.9.0 — settlement/action proof registry, ReceiverTemplate; fundId in all structs
    ObserverFund.sol     Standalone FIDC fund registry (deployed separately)
    interfaces/          ReceiverTemplate.sol, IReceiver
  remix/                 Testnet/Remix versions (T-prefix, independent versioning)
    IObserverFund.sol   Interface — single source of truth for fund structs
    TObserverFund.sol   v1.1.0 — AccessControl, implements IObserverFund
    TObserver.sol        v1.4.0 — ReceiverTemplate + AccessControl; fundId in all structs
    ReceiverTemplate.sol Flat copy for Remix (no imports needed)
    ObserverTestV1.sol   v1.0.0 — original monolithic contract, kept for comparison
workflow-observer/       CRE workflow: polls Observer API, anchors proofs on-chain
frontend/                React dashboard (Vite) — Dashboard, Orders, Observer, XDC, CRE pages
project.yaml             CRE project config (Sepolia chain selector + RPC)
secrets.yaml             CRE secret name → env var mapping (no actual values)
```

---

## Setup

### Smart contracts

```bash
cd smart-contracts
npm install
npx hardhat compile
```

Deploy to Sepolia — deployment order:
1. Deploy `ObserverFund(deployerAddress)`
2. Deploy `Observer(forwarderAddress, observerFundAddress)`

After deployment:
1. Set `OBSERVER_ADDRESS` and `OBSERVER_FUND_ADDRESS` in root `.env` (single source of truth)
2. Run `cd workflow-observer && node scripts/sync-config.js` to patch `config.staging.json` from root `.env`
3. _(Recommended)_ Lock down to your specific workflow after deploying to CRE:
   ```solidity
   observer.setExpectedWorkflowId(YOUR_WORKFLOW_ID)
   ```

### CRE workflow

```bash
cp .env.example .env
```

Set CRE_ETH_PRIVATE_KEY in .env

```bash
bun install --cwd ./workflow-observer
```

Set CRE secrets (stored in the DON):

```
API_OBSERVER_KEY=<from observer-api.env>
```

Simulate (no transactions onchain):
```bash
cre workflow simulate workflow-observer --target staging-settings --non-interactive --trigger-index 0
```

Simulate onchain:
```bash
cre workflow simulate workflow-observer --target staging-settings --non-interactive --trigger-index 0 --broadcast
```

Deploy (staging):
```bash
bunx cre deploy --env staging
```

## Observer API endpoints used

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


---

## Observer contracts

### Two-contract architecture (v1.9.0)

Observer is split into two independently deployable contracts:

| Contract | Role | Access control |
|---|---|---|
| `ObserverFund.sol` | FIDC fund registry | `Ownable` — only deployer can `registerFund` |
| `Observer.sol` | Settlement/action proof registry + CRE receiver | `AccessControl` (ADMIN_ROLE, REPORTER_ROLE) |

Observer stores a reference to ObserverFund and reads from it:

```solidity
IObserverFund public funds;
```

Observer's constructor:

```solidity
constructor(address _forwarderAddress, address _fund)
```

**Deployment order:**
1. Deploy `ObserverFund(deployerAddress)`
2. Deploy `Observer(forwarderAddress, observerFundAddress)`

| Network | Forwarder address |
|---|---|
| Ethereum Sepolia — simulation | `0x15fC6ae953E024d975e77382eEeC56A9101f9F88` |
| Ethereum Sepolia — production | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` |

### ReceiverTemplate pattern

```
KeystoneForwarder → onReport() → security checks → _processReport() → _reportSettlement()
```

### Security setters (onlyOwner)

| Function | Purpose |
|---|---|
| `setForwarderAddress(address)` | Update the trusted forwarder. Setting `address(0)` disables the check (insecure) |
| `setExpectedAuthor(address)` | Restrict `onReport` to a specific CRE workflow owner |
| `setExpectedWorkflowName(string)` | Restrict by workflow name (requires `setExpectedAuthor` to also be set) |
| `setExpectedWorkflowId(bytes32)` | Restrict to an exact workflow ID — strongest lock-down |

After deploying and registering the workflow in CRE, call `setExpectedWorkflowId(workflowId)` to ensure only your specific workflow can write to this contract.

### Write paths

| Caller | Contract | Function |
|---|---|---|
| Chainlink KeystoneForwarder | Observer | `onReport(bytes metadata, bytes report)` |
| `REPORTER_ROLE` wallet | Observer | `reportSettlement(SettlementInput)` |
| `REPORTER_ROLE` wallet | Observer | `reportAction(ActionInput)` |
| `ADMIN_ROLE` wallet | Observer | `setForwarderAddress / setExpectedAuthor / setExpectedWorkflowId` |
| Owner wallet | ObserverFund | `registerFund(FundInput)` |

---

## Testing with Remix (T-contracts)

See [`smart-contracts/remix/remix.md`](smart-contracts/remix/remix.md) for compiler settings, load order, deploy order, and test sequences.

---

## Local testing (no real API needed)

Start the Observer API mock server (zero dependencies, Node built-in only):

```bash
node test/mock-server.js
# Observer API mock server running on http://localhost:3001
```

Run the CRE workflow against the mock:

```bash
cre workflow simulate workflow-observer --target test-settings --non-interactive --trigger-index 0
```

## Known staging test values

| Key | Value | Where it lives |
|---|---|---|
| `OBSERVER_ID` | `mb-observer-demo` | `apiClientId` in `config.staging.json` |
| `BASE` | `https://dev-api-mercado-bitcoin.web3up.mobi/v1/external/observer` | `apiBaseUrl` in `config.staging.json` |
| `FUND` | `be6f2e8a-5474-43c7-a692-7918c37e3f42` | `fundId` in `config.staging.json` |
| `ORDER` (test order) | `8fdac770-7ca3-4a1f-a283-33efa75c96ef` | `testOrderId` in `config.staging.json` |
| `OBSERVER_KEY` | _(secret)_ | `API_OBSERVER_KEY` in `.env` |

### How to use in tests

**Option A — curl the staging API directly**

Make sure `API_OBSERVER_KEY` is exported in your shell first:

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

All four non-secret values are already in `config.staging.json`. Only `API_OBSERVER_KEY` needs to be in `.env`:

```bash
# CRON trigger — scans all orders and anchors settled ones
cre workflow simulate workflow-observer --target staging-settings --non-interactive --trigger-index 0

# HTTP trigger — same logic, manual fire
cre workflow simulate workflow-observer --target staging-settings --non-interactive --trigger-index 1 --http-payload ./workflow-observer/payload.json
```

**Option C — run against the mock (no real API or keys needed)**

```bash
node test/mock-server.js &
cre workflow simulate workflow-observer --target test-settings --non-interactive --trigger-index 0
```

---

## Frontend

React + Vite dashboard. Pages: Dashboard, Orders, Observer, API, XDC, CRE.

### Local dev

```bash
cd frontend
npm install
```

Create root `.env` (gitignored) — single source of truth for both frontend and CRE workflow:

```
OBSERVER_FUND_ADDRESS=<deployed ObserverFund.sol address>
OBSERVER_ADDRESS=<deployed Observer.sol address>
```

See `.env.example` for the full list of required variables.

Start the dev server:

```bash
npm run dev
# http://localhost:5175
```

### Build for production

```bash
npm run build
# output: frontend/dist/
```

### Publish (static hosting)

**Netlify / Vercel / Cloudflare Pages:**
- Build command: `npm run build`
- Output directory: `dist`
- Set `OBSERVER_ADDRESS` and `OBSERVER_FUND_ADDRESS` as environment variables

