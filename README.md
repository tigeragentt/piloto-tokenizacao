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

From the **project root**:

```bash
bun install --cwd ./workflow-capitare
```

Set environment variables:
```
CAPITARE_OBSERVER_KEY=<from observer-api.env>
CRE_TRANSACTION_PRIVATE_KEY=<CRE wallet private key>
```

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
