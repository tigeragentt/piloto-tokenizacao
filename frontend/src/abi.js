// Observer.sol + ObserverFund.sol ABIs — only the functions the frontend needs

const SETTLEMENT_RECORD_COMPONENTS = [
  { name: 'orderId',              type: 'string'  },
  { name: 'intentHash',          type: 'bytes32' },
  { name: 'progress',            type: 'string'  },
  { name: 'technicalCompleted',  type: 'bool'    },
  { name: 'accountingCompleted', type: 'bool'    },
  { name: 'deliveryProofSHA256', type: 'bytes32' },
  { name: 'resolutionHash',      type: 'bytes32' },
  { name: 'sourceNetwork',       type: 'string'  },
  { name: 'destinationNetwork',  type: 'string'  },
  { name: 'reportedAt',          type: 'uint256' },
  { name: 'blockNumber',         type: 'uint256' },
]

const FUND_INFO_COMPONENTS = [
  { name: 'fundId',             type: 'string'  },
  { name: 'name',               type: 'string'  },
  { name: 'xdcNetwork',         type: 'string'  },
  { name: 'xdcFidcManager',     type: 'address' },
  { name: 'xdcStable',          type: 'address' },
  { name: 'xdcEscrowFactory',   type: 'address' },
  { name: 'xrplNetwork',        type: 'string'  },
  { name: 'xrplIssuer',         type: 'string'  },
  { name: 'debentureCurrency',  type: 'string'  },
]

// Observer.sol (v1.5.0) — settlement proof registry + ReceiverTemplate security setters
// Fund management moved to ObserverFund.sol — use OBSERVER_FUND_ABI for fund reads/writes
export const OBSERVER_ABI = [
  // ─── View ───────────────────────────────────────────────────────────────────
  {
    name: 'VERSION',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
  },
  {
    name: 'fund',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'getForwarderAddress',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
  },
  {
    name: 'getExpectedWorkflowId',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
  },
  {
    name: 'getSettlementCount',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'isActionNotarized',
    type: 'function',
    inputs: [
      { name: 'network', type: 'string' },
      { name: 'txHash',  type: 'string' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'isOrderNotarized',
    type: 'function',
    inputs: [{ name: 'orderId', type: 'string' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'isSettlementNotarized',
    type: 'function',
    inputs: [{ name: 'intentHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'latestSettlementId',
    type: 'function',
    inputs: [{ name: '', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getLatestSettlement',
    type: 'function',
    inputs: [{ name: 'intentHash', type: 'bytes32' }],
    outputs: [{ name: '', type: 'tuple', components: SETTLEMENT_RECORD_COMPONENTS }],
    stateMutability: 'view',
  },
  {
    name: 'getSettlement',
    type: 'function',
    inputs: [{ name: 'recordId', type: 'uint256' }],
    outputs: [{ name: '', type: 'tuple', components: SETTLEMENT_RECORD_COMPONENTS }],
    stateMutability: 'view',
  },
  {
    name: 'getLatestSettlements',
    type: 'function',
    inputs: [{ name: 'count', type: 'uint256' }],
    outputs: [{ name: 'result', type: 'tuple[]', components: SETTLEMENT_RECORD_COMPONENTS }],
    stateMutability: 'view',
  },
  {
    name: 'getSettlements',
    type: 'function',
    inputs: [
      { name: 'fromIndex', type: 'uint256' },
      { name: 'toIndex',   type: 'uint256' },
    ],
    outputs: [{ name: 'result', type: 'tuple[]', components: SETTLEMENT_RECORD_COMPONENTS }],
    stateMutability: 'view',
  },

  // ─── Write (onlyOwner via ReceiverTemplate) ─────────────────────────────────
  {
    name: 'setForwarderAddress',
    type: 'function',
    inputs: [{ name: '_forwarder', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'setExpectedAuthor',
    type: 'function',
    inputs: [{ name: '_author', type: 'address' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'setExpectedWorkflowId',
    type: 'function',
    inputs: [{ name: '_id', type: 'bytes32' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
]

// ObserverFund.sol — FIDC fund registry (deployed separately, address passed to Observer)
export const OBSERVER_FUND_ABI = [
  // ─── View ───────────────────────────────────────────────────────────────────
  {
    name: 'isFundRegistered',
    type: 'function',
    inputs: [{ name: 'fundId', type: 'string' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'getFundCount',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getFund',
    type: 'function',
    inputs: [{ name: 'idx', type: 'uint256' }],
    outputs: [{ name: '', type: 'tuple', components: FUND_INFO_COMPONENTS }],
    stateMutability: 'view',
  },
  {
    name: 'getFundById',
    type: 'function',
    inputs: [{ name: 'fundId', type: 'string' }],
    outputs: [{ name: '', type: 'tuple', components: FUND_INFO_COMPONENTS }],
    stateMutability: 'view',
  },
  {
    name: 'getLatestFunds',
    type: 'function',
    inputs: [{ name: 'count', type: 'uint256' }],
    outputs: [{ name: 'result', type: 'tuple[]', components: FUND_INFO_COMPONENTS }],
    stateMutability: 'view',
  },

  // ─── Write (onlyOwner) ───────────────────────────────────────────────────────
  {
    name: 'registerFund',
    type: 'function',
    inputs: [
      {
        name: 'f',
        type: 'tuple',
        components: [
          { name: 'fundId',             type: 'string'  },
          { name: 'name',               type: 'string'  },
          { name: 'xdcNetwork',         type: 'string'  },
          { name: 'xdcFidcManager',     type: 'address' },
          { name: 'xdcStable',          type: 'address' },
          { name: 'xdcEscrowFactory',   type: 'address' },
          { name: 'xrplNetwork',        type: 'string'  },
          { name: 'xrplIssuer',         type: 'string'  },
          { name: 'debentureCurrency',  type: 'string'  },
        ],
      },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
]

// Minimal ERC-20 ABI for XDC contract reads
export const ERC20_ABI = [
  { name: 'name',        type: 'function', inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' },
  { name: 'symbol',      type: 'function', inputs: [], outputs: [{ type: 'string'  }], stateMutability: 'view' },
  { name: 'decimals',    type: 'function', inputs: [], outputs: [{ type: 'uint8'   }], stateMutability: 'view' },
  { name: 'totalSupply', type: 'function', inputs: [], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'balanceOf', type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }], stateMutability: 'view' },
]
