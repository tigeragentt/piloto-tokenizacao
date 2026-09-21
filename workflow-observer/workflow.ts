import {
  CronCapability,
  EVMClient,
  HTTPCapability,
  HTTPClient,
  LAST_FINALIZED_BLOCK_NUMBER,
  bytesToBase64,
  bytesToHex,
  consensusIdenticalAggregation,
  encodeCallMsg,
  getNetwork,
  handler,
  json,
  ok,
  prepareReportRequest,
  TxStatus,
  type HTTPPayload,
  type HTTPSendRequester,
  type Runtime,
} from "@chainlink/cre-sdk"
import {
  encodeAbiParameters,
  encodeFunctionData,
  decodeFunctionResult,
  zeroAddress,
} from "viem"

export type Config = {
  capitareBaseUrl: string   // e.g. "https://dev-api-mercado-bitcoin.web3up.mobi/v1/external/observer"
  capitareClientId: string  // X-Observer-Id header value, e.g. "mb-observer-demo"
  fundId: string            // Capitare fund UUID
  schedule: string          // cron expression, e.g. "0 */2 * * * *"
  chainSelectorName: string // CRE chain selector name, e.g. "ethereum-testnet-sepolia"
  observerAddress: string   // Observer.sol on Sepolia; "" = disabled
  maxOrdersPerRun: number   // max ACQUIRED_WITH_LOCK orders to anchor per execution; 1 for simulation (15 HTTP call limit)
}

// ─── Observer.sol ABI (read-only) ────────────────────────────────────────────

const OBSERVER_ABI = [
  {
    name: "isOrderAnchored",
    type: "function",
    inputs: [{ name: "orderId", type: "string" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const

// ─── Capitare API types ───────────────────────────────────────────────────────

type Order = {
  id: string
  intentHash: string        // hex without 0x prefix
  progress: string
  settlementCompleted: boolean
  accountingCompleted: boolean
  intent: {
    sourceNetwork: string
    destinationNetwork: string
  }
}

type OrdersResponse = {
  items: Order[]
}

type SettlementResponse = {
  resolutionHash: string        // hex with 0x prefix
  technicalSettlementCompleted: boolean
  accountingCompleted: boolean
  resolution: {
    deliveryProofSHA256: string  // hex without 0x prefix
  }
}

type ScanResult = {
  ordersChecked: number
  anchored: number
  skipped: number
  errors: string[]
}

// Envelope returned by capitareGet — never null (CRE consensus can't wrap null)
type CapitareResult = { found: false } | { found: true; body: object }

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toBytes32 = (hex: string): `0x${string}` => {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex
  if (clean.length !== 64) throw new Error(`toBytes32: expected 64 hex chars, got ${clean.length} for "${hex}"`)
  return `0x${clean}` as `0x${string}`
}

const ZERO_BYTES32: `0x${string}` = "0x0000000000000000000000000000000000000000000000000000000000000000"

// ─── Capitare API helpers ─────────────────────────────────────────────────────

const capitareGet = (
  runtime: Runtime<Config>,
  httpClient: HTTPClient,
  path: string,
  observerKey: string,
): CapitareResult => {
  const { capitareBaseUrl, capitareClientId } = runtime.config
  const url = `${capitareBaseUrl}${path}`
  // Serialize to string — consensusIdenticalAggregation only reliably handles primitives
  const raw = httpClient.sendRequest(
    runtime,
    (sendRequester: HTTPSendRequester): string => {
      const r = sendRequester.sendRequest({
        url,
        method: "GET",
        headers: {
          "X-Observer-Id": capitareClientId,
          "X-Observer-Key": observerKey,
          "Accept": "application/json",
        },
        body: bytesToBase64(new Uint8Array(0)),
      }).result()
      if (r.statusCode === 404) return JSON.stringify({ found: false })
      if (!ok(r)) throw new Error(`Capitare GET ${path} → HTTP ${r.statusCode}`)
      return JSON.stringify({ found: true, body: json(r) })
    },
    consensusIdenticalAggregation<string>()
  )().result()
  return JSON.parse(raw) as CapitareResult
}

// ─── Observer check ───────────────────────────────────────────────────────────

const isAlreadyAnchored = (
  runtime: Runtime<Config>,
  evmClient: EVMClient,
  orderId: string,
): boolean => {
  const { observerAddress } = runtime.config
  const callData = encodeFunctionData({
    abi: OBSERVER_ABI,
    functionName: "isOrderAnchored",
    args: [orderId],
  })
  const result = evmClient.callContract(runtime, {
    call: encodeCallMsg({
      from: zeroAddress,
      to: observerAddress as `0x${string}`,
      data: callData,
    }),
    blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
  }).result()
  return decodeFunctionResult({
    abi: OBSERVER_ABI,
    functionName: "isOrderAnchored",
    data: bytesToHex(result.data),
  }) as boolean
}

// ─── Anchor settlement ────────────────────────────────────────────────────────

const anchorSettlement = (
  runtime: Runtime<Config>,
  evmClient: EVMClient,
  order: Order,
  settlement: SettlementResponse,
): void => {
  const { observerAddress } = runtime.config
  const intentHashBytes32 = toBytes32(order.intentHash)
  const deliveryBytes32 = settlement.resolution?.deliveryProofSHA256
    ? toBytes32(settlement.resolution.deliveryProofSHA256)
    : ZERO_BYTES32
  const resolutionBytes32 = toBytes32(settlement.resolutionHash)

  // ABI-encode SettlementInput struct — must match what Observer.sol's onReport decodes
  const encoded = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "fundId",              type: "string"  },
          { name: "orderId",             type: "string"  },
          { name: "intentHash",          type: "bytes32" },
          { name: "progress",            type: "string"  },
          { name: "technicalCompleted",  type: "bool"    },
          { name: "accountingCompleted", type: "bool"    },
          { name: "deliveryProofSHA256", type: "bytes32" },
          { name: "resolutionHash",      type: "bytes32" },
          { name: "sourceNetwork",       type: "string"  },
          { name: "destinationNetwork",  type: "string"  },
        ],
      },
    ] as const,
    [
      {
        fundId:              runtime.config.fundId,
        orderId:             order.id,
        intentHash:          intentHashBytes32,
        progress:            order.progress,
        technicalCompleted:  settlement.technicalSettlementCompleted,
        accountingCompleted: settlement.accountingCompleted,
        deliveryProofSHA256: deliveryBytes32,
        resolutionHash:      resolutionBytes32,
        sourceNetwork:       order.intent.sourceNetwork,
        destinationNetwork:  order.intent.destinationNetwork,
      },
    ]
  )

  const signedReport = runtime.report(prepareReportRequest(encoded)).result()

  const txResult = evmClient.writeReport(runtime, {
    receiver: observerAddress,
    report: signedReport,
    gasConfig: { gasLimit: "500000" },
  }).result()

  if (txResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`writeReport failed: ${txResult.errorMessage ?? txResult.txStatus}`)
  }

  const txHash = bytesToHex(txResult.txHash ?? new Uint8Array(32))
  runtime.log(`anchorSettlement orderId=${order.id} txHash=${txHash}`)
}

// ─── Main scan ────────────────────────────────────────────────────────────────

// Polls the Capitare API for all debenture orders in the configured fund, then
// anchors each fully-settled order on-chain via the Observer contract.
//
// For each order it:
//   1. Skips orders whose progress is not "ACQUIRED_WITH_LOCK" (not yet settled)
//   2. Skips orders already anchored on-chain (idempotent — reads Observer.isOrderAnchored)
//   3. Fetches the settlement proof from Capitare (deliveryProofSHA256, resolutionHash, etc.)
//   4. Skips if technicalSettlementCompleted is false
//   5. Calls Observer.reportSettlement via CRE writeReport — the DON signs and submits the tx
//
// Stops after maxOrdersPerRun anchors to avoid running too long in a single trigger.
// Returns a ScanResult with counts of anchored / skipped / errored orders.
const scanAndAnchor = async (runtime: Runtime<Config>): Promise<ScanResult> => {
  const { observerAddress, fundId, maxOrdersPerRun, chainSelectorName } = runtime.config
  const result: ScanResult = { ordersChecked: 0, anchored: 0, skipped: 0, errors: [] }
  let processed = 0

  const httpClient = new HTTPClient()

  const network = getNetwork({ chainFamily: "evm", chainSelectorName })
  if (!network) throw new Error(`Unknown chainSelectorName: ${chainSelectorName}`)
  const evmClient = new EVMClient(network.chainSelector.selector)

  const observerKey = runtime.getSecret({ id: "api_observer_key" }).result().value as string

  runtime.log(`Fetching orders for fund ${fundId}`)
  const ordersData = capitareGet(runtime, httpClient, `/funds/${fundId}/debenture-orders`, observerKey)
  if (!ordersData.found) {
    runtime.log("No orders data (404) — fund not found or no orders yet")
    return result
  }

  const { items: orders } = ordersData.body as OrdersResponse
  result.ordersChecked = orders.length
  runtime.log(`Found ${orders.length} order(s)`)
  for (const o of orders) {
    runtime.log(`  Order ${o.id}: progress=${o.progress} intentHash=${o.intentHash}`)
  }

  for (const order of orders) {
    if (processed >= maxOrdersPerRun) {
      runtime.log(`Reached maxOrdersPerRun=${maxOrdersPerRun} — stopping early (${orders.length - result.skipped - processed} order(s) deferred)`)
      break
    }

    if (order.progress !== "ACQUIRED_WITH_LOCK") {
      runtime.log(`Order ${order.id}: progress=${order.progress} — skip (not settled)`)
      result.skipped++
      continue
    }

    try {
      if (observerAddress && isAlreadyAnchored(runtime, evmClient, order.id)) {
        runtime.log(`Order ${order.id}: already anchored — skip`)
        result.skipped++
        continue
      }

      runtime.log(`Order ${order.id}: fetching settlement proof`)
      const settlementData = capitareGet(
        runtime, httpClient,
        `/funds/${fundId}/debenture-orders/${order.id}/settlement`,
        observerKey,
      )
      if (!settlementData.found) {
        runtime.log(`Order ${order.id}: settlement endpoint returned 404 — skip`)
        result.skipped++
        continue
      }

      const settlement = settlementData.body as SettlementResponse
      if (!settlement.technicalSettlementCompleted) {
        runtime.log(`Order ${order.id}: technicalSettlementCompleted=false — skip`)
        result.skipped++
        continue
      }

      if (!observerAddress) {
        runtime.log(`Order ${order.id}: ready to anchor but observerAddress is empty — dry run only`)
        result.skipped++
        continue
      }

      anchorSettlement(runtime, evmClient, order, settlement)
      result.anchored++
      processed++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      runtime.log(`Order ${order.id}: ERROR — ${msg}`)
      result.errors.push(`${order.id}: ${msg}`)
      processed++
    }
  }

  runtime.log(`Scan complete: ${result.anchored} anchored, ${result.skipped} skipped, ${result.errors.length} errors`)
  return result
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export const onCronTrigger = async (runtime: Runtime<Config>): Promise<string> => {
  const result = await scanAndAnchor(runtime)
  return JSON.stringify(result)
}

export const onHttpTrigger = async (runtime: Runtime<Config>, _triggerEvent: HTTPPayload): Promise<string> => {
  const result = await scanAndAnchor(runtime)
  return JSON.stringify(result)
}

export const initWorkflow = (config: unknown) => {
  const cron = new CronCapability()
  const http = new HTTPCapability()
  const cfg = config as Config
  return [
    handler(cron.trigger({ schedule: cfg.schedule }), onCronTrigger),
    handler(http.trigger({ authorizedKeys: [] }), onHttpTrigger),
  ]
}
