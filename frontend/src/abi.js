// Observer.sol ABI — only the functions the frontend needs

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
    name: 'getSettlementCount',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'isFundRegistered',
    type: 'function',
    inputs: [{ name: 'fundId', type: 'string' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'isActionAnchored',
    type: 'function',
    inputs: [
      { name: 'network', type: 'string' },
      { name: 'txHash',  type: 'string' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'isOrderAnchored',
    type: 'function',
    inputs: [{ name: 'orderId', type: 'string' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'isSettlementAnchored',
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
    name: 'hasRole',
    type: 'function',
    inputs: [
      { name: 'role',    type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },

  // ─── Write ──────────────────────────────────────────────────────────────────
  {
    name: 'reportSettlement',
    type: 'function',
    inputs: [
      {
        name: 's',
        type: 'tuple',
        components: [
          { name: 'orderId',             type: 'string'  },
          { name: 'intentHash',          type: 'bytes32' },
          { name: 'progress',            type: 'string'  },
          { name: 'technicalCompleted',  type: 'bool'    },
          { name: 'accountingCompleted', type: 'bool'    },
          { name: 'deliveryProofSHA256', type: 'bytes32' },
          { name: 'resolutionHash',      type: 'bytes32' },
          { name: 'sourceNetwork',       type: 'string'  },
          { name: 'destinationNetwork',  type: 'string'  },
        ],
      },
    ],
    outputs: [{ name: 'recordId', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
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
  {
    name: 'grantRole',
    type: 'function',
    inputs: [
      { name: 'role',    type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'revokeRole',
    type: 'function',
    inputs: [
      { name: 'role',    type: 'bytes32' },
      { name: 'account', type: 'address' },
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
