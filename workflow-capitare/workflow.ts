import {
  CronCapability,
  ConsensusAggregationByFields,
  HTTPCapability,
  HTTPClient,
  bytesToBase64,
  consensusIdenticalAggregation,
  identical,
  handler,
  json,
  ok,
  type HTTPPayload,
  type HTTPSendRequester,
  type NodeRuntime,
  type Runtime,
} from "@chainlink/cre-sdk"
import { encodeFunctionData, decodeFunctionResult } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { keccak256 } from "viem"

export type Config = {
  capitareBaseUrl: string   // e.g. "https://dev-api-mercado-bitcoin.web3up.mobi/v1/external/observer"
  capitareClientId: string  // X-Observer-Id header value, e.g. "mb-observer-demo"
  fundId: string            // Capitare fund UUID
  schedule: string          // cron expression, e.g. "0 */2 * * * *"
  sepoliaRpcUrl: string
  sepoliaChainId: number
  observerAddress: string   // Observer.sol on Sepolia; "" = disabled
}

// ─── Observer.sol ABI ────────────────────────────────────────────────────────

const OBSERVER_ABI = [
  {
    name: "isOrderAnchored",
    type: "function",
    inputs: [{ name: "orderId", type: "string" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    name: "isSettlementAnchored",
    type: "function",
    inputs: [{ name: "intentHash", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
  {
    name: "reportSettlement",
    type: "function",
    inputs: [
      {
        name: "s",
        type: "tuple",
        components: [
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
    ],
    outputs: [{ name: "recordId", type: "uint256" }],
    stateMutability: "nonpayable",
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toBytes32 = (hex: string): `0x${string}` => {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex
  if (clean.length !== 64) throw new Error(`toBytes32: expected 64 hex chars, got ${clean.length} for "${hex}"`)
  return `0x${clean}` as `0x${string}`
}

const ZERO_BYTES32: `0x${string}` = "0x0000000000000000000000000000000000000000000000000000000000000000"

// ─── RPC helpers ─────────────────────────────────────────────────────────────

const rpcCall = (
  runtime: Runtime<Config>,
  httpClient: HTTPClient,
  rpcUrl: string,
  method: string,
  params: unknown[],
  id: number,
): string => {
  const bodyBytes = bytesToBase64(
    new TextEncoder().encode(JSON.stringify({ jsonrpc: "2.0", method, params, id }))
  )
  return httpClient.sendRequest(
    runtime,
    (sendRequester: HTTPSendRequester) => {
      const r = sendRequester.sendRequest({
        url: rpcUrl,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: bodyBytes,
      }).result()
      if (!ok(r)) throw new Error(`${method} HTTP ${r.statusCode}`)
      const resp = json(r) as { result: unknown; error?: { message: string } }
      if (resp.error) throw new Error(`RPC: ${resp.error.message}`)
      return JSON.stringify(resp.result)
    },
    consensusIdenticalAggregation<string>()
  )().result()
}

// ─── Capitare API helpers ─────────────────────────────────────────────────────

const capitareGet = (
  runtime: Runtime<Config>,
  httpClient: HTTPClient,
  path: string,
  observerKey: string,
): object | null => {
  const { capitareBaseUrl, capitareClientId } = runtime.config
  const url = `${capitareBaseUrl}${path}`
  return httpClient.sendRequest(
    runtime,
    (sendRequester: HTTPSendRequester): object | null => {
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
      if (r.statusCode === 404) return null
      if (!ok(r)) throw new Error(`Capitare GET ${path} → HTTP ${r.statusCode}`)
      return json(r) as object
    },
    consensusIdenticalAggregation<object | null>()
  )().result()
}

// ─── Node-mode: submit signed tx ─────────────────────────────────────────────

const submitTx = (
  nodeRuntime: NodeRuntime<Config>,
  signedTx: string,
): { status: string } => {
  const httpClient = new HTTPClient()
  const { sepoliaRpcUrl } = nodeRuntime.config
  const body = JSON.stringify({ jsonrpc: "2.0", method: "eth_sendRawTransaction", params: [signedTx], id: 1 })
  const response = httpClient.sendRequest(nodeRuntime, {
    url: sepoliaRpcUrl,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: bytesToBase64(new TextEncoder().encode(body)),
    cacheSettings: { store: false },
  }).result()
  if (!ok(response)) throw new Error(`HTTP ${response.statusCode}`)
  const result = json(response) as { result?: string; error?: { message: string } }
  if (result.error) {
    const msg = result.error.message.toLowerCase()
    if (msg.includes("already known") || msg.includes("nonce too low") || msg.includes("replacement")) {
      return { status: "already_known" }
    }
    throw new Error(`RPC: ${result.error.message}`)
  }
  return { status: "submitted" }
}

// ─── Observer check ───────────────────────────────────────────────────────────

const isAlreadyAnchored = (
  runtime: Runtime<Config>,
  httpClient: HTTPClient,
  orderId: string,
): boolean => {
  const { sepoliaRpcUrl, observerAddress } = runtime.config
  const callData = encodeFunctionData({
    abi: OBSERVER_ABI,
    functionName: "isOrderAnchored",
    args: [orderId],
  })
  const raw = JSON.parse(
    rpcCall(runtime, httpClient, sepoliaRpcUrl, "eth_call", [{ to: observerAddress, data: callData }, "latest"], 50)
  ) as string
  return decodeFunctionResult({
    abi: OBSERVER_ABI,
    functionName: "isOrderAnchored",
    data: raw as `0x${string}`,
  }) as boolean
}

// ─── Anchor settlement ────────────────────────────────────────────────────────

const anchorSettlement = async (
  runtime: Runtime<Config>,
  httpClient: HTTPClient,
  order: Order,
  settlement: SettlementResponse,
): Promise<void> => {
  const { sepoliaRpcUrl, sepoliaChainId, observerAddress } = runtime.config
  const privateKey = runtime.getSecret({ id: "cre_transaction_private_key" }).result().value as `0x${string}`
  const account = privateKeyToAccount(privateKey)

  const intentHashBytes32 = toBytes32(order.intentHash)
  const deliveryBytes32 = settlement.resolution?.deliveryProofSHA256
    ? toBytes32(settlement.resolution.deliveryProofSHA256)
    : ZERO_BYTES32
  const resolutionBytes32 = toBytes32(settlement.resolutionHash)

  const data = encodeFunctionData({
    abi: OBSERVER_ABI,
    functionName: "reportSettlement",
    args: [
      {
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
    ],
  })

  const nonceHex = JSON.parse(rpcCall(runtime, httpClient, sepoliaRpcUrl, "eth_getTransactionCount", [account.address, "pending"], 60))
  const gasPriceHex = JSON.parse(rpcCall(runtime, httpClient, sepoliaRpcUrl, "eth_gasPrice", [], 61))

  const signedTx = await account.signTransaction({
    to: observerAddress as `0x${string}`,
    data,
    nonce: parseInt(nonceHex as string, 16),
    gasPrice: BigInt(gasPriceHex as string),
    gas: 300000n,
    chainId: sepoliaChainId,
    type: "legacy",
  })

  const txHash = keccak256(signedTx)
  runtime.log(`anchorSettlement orderId=${order.id} intentHash=0x${order.intentHash} txHash=${txHash}`)

  runtime.runInNodeMode(
    submitTx,
    ConsensusAggregationByFields<{ status: string }>({ status: identical })
  )(signedTx).result()
}

// ─── Main scan ────────────────────────────────────────────────────────────────

const scanAndAnchor = async (runtime: Runtime<Config>): Promise<ScanResult> => {
  const { observerAddress, fundId } = runtime.config
  const result: ScanResult = { ordersChecked: 0, anchored: 0, skipped: 0, errors: [] }

  const observerKey = runtime.getSecret({ id: "capitare_observer_key" }).result().value as string
  const httpClient = new HTTPClient()

  runtime.log(`Fetching orders for fund ${fundId}`)
  const ordersData = capitareGet(runtime, httpClient, `/funds/${fundId}/debenture-orders`, observerKey)
  if (!ordersData) {
    runtime.log("No orders data (404) — fund not found or no orders yet")
    return result
  }

  const { items: orders } = ordersData as OrdersResponse
  result.ordersChecked = orders.length
  runtime.log(`Found ${orders.length} order(s)`)

  for (const order of orders) {
    if (order.progress !== "ACQUIRED_WITH_LOCK") {
      runtime.log(`Order ${order.id}: progress=${order.progress} — skip (not settled)`)
      result.skipped++
      continue
    }

    try {
      const intentHashBytes32 = toBytes32(order.intentHash)

      if (observerAddress && isAlreadyAnchored(runtime, httpClient, order.id)) {
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
      if (!settlementData) {
        runtime.log(`Order ${order.id}: settlement endpoint returned 404 — skip`)
        result.skipped++
        continue
      }

      const settlement = settlementData as SettlementResponse
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

      await anchorSettlement(runtime, httpClient, order, settlement)
      result.anchored++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      runtime.log(`Order ${order.id}: ERROR — ${msg}`)
      result.errors.push(`${order.id}: ${msg}`)
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
