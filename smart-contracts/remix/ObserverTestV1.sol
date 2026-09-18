// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

// ─── ObserverTest v1.0.0 — kept for comparison ───────────────────────────────
// Access control: AccessControl (REPORTER_ROLE, DEFAULT_ADMIN_ROLE)
// No CRE receiver interface (no onReport / ReceiverTemplate)
// No ObserverFund split
// Current version: ObserverTest.sol (v1.5.0) — ReceiverTemplate + ObserverFund ref

import "@openzeppelin/contracts/access/AccessControl.sol";

contract ObserverTestV1 is AccessControl {

    error FundAlreadyRegistered();
    error ActionAlreadyAnchored();
    error OrderAlreadyAnchored();
    error NotFound();
    error InvalidRange();
    error OutOfBounds();

    string public constant VERSION = "1.0.0";

    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");

    // ─── Fund Registry ──────────────────────────────────────────────────────

    struct FundInput {
        string  fundId;
        string  name;
        string  xdcNetwork;
        address xdcFidcManager;
        address xdcStable;
        address xdcEscrowFactory;
        string  xrplNetwork;
        string  xrplIssuer;
        string  debentureCurrency;
    }

    struct FundInfo {
        string  fundId;              // Capitare fund UUID
        string  name;                // e.g. "Horizonte Crédito Multirrede FIDC — Piloto XDC"
        string  xdcNetwork;          // "eip155:51"
        address xdcFidcManager;      // fidc-manager contract
        address xdcStable;           // BRL-CVM stable token (ERC-20)
        address xdcEscrowFactory;    // escrow-factory contract
        string  xrplNetwork;         // "xrpl:testnet"
        string  xrplIssuer;          // XRPL issuer address (r…)
        string  debentureCurrency;   // "CVD"
    }

    FundInfo[]                     private _funds;
    mapping(string => uint256)     private _fundIdToIndex;   // 1-based; 0 = not registered

    // ─── General Action Log ─────────────────────────────────────────────────

    enum ActionType {
        Transfer,              // 0  BRL-CVM ERC-20 transfer on XDC
        Mint,                  // 1
        Burn,                  // 2
        Approve,               // 3
        FIDCCreated,           // 4  FIDC fund created on XDC
        Invested,              // 5  quota investment
        EscrowCreated,         // 6  EIP-1167 escrow proxy deployed
        Whitelisted,           // 7  address added to custody or payment whitelist
        Withdrawn,             // 8
        FundingAcknowledged,   // 9  FIDC acknowledged cash lock
        LockResolved,          // 10 escrow cash lock released on XDC
        ExcessReturned,        // 11
        DeliveryProofAnchored, // 12 delivery proof SHA256 anchored
        SettlementProofAnchored, // 13 full settlement proof anchored
        Divergence             // 14 cross-chain mismatch detected
    }

    struct ActionRecord {
        string     network;
        ActionType action;
        string     from;
        string     to;
        uint256    amount;
        string     txHash;
        uint256    timestamp;
        uint256    blockNumber;
    }

    ActionRecord[]           private _actions;
    mapping(bytes32 => bool) private _txAnchored;   // keccak256(network ++ txHash) → seen

    // ─── Settlement Records ─────────────────────────────────────────────────

    struct SettlementInput {
        string   orderId;
        bytes32  intentHash;
        string   progress;
        bool     technicalCompleted;
        bool     accountingCompleted;
        bytes32  deliveryProofSHA256;
        bytes32  resolutionHash;
        string   sourceNetwork;
        string   destinationNetwork;
    }

    struct SettlementRecord {
        string   orderId;              // Capitare order UUID
        bytes32  intentHash;           // cross-chain correlation key (= XRPL InvoiceID)
        string   progress;             // Capitare progress state at time of anchoring
        bool     technicalCompleted;   // technicalSettlementCompleted from /settlement
        bool     accountingCompleted;  // accountingCompleted from /settlement
        bytes32  deliveryProofSHA256;  // sha256 of delivery-proof manifest; 0x0 if unavailable
        bytes32  resolutionHash;       // keccak256 of resolution struct (must match LockResolved on XDC)
        string   sourceNetwork;        // "eip155:51"
        string   destinationNetwork;   // "xrpl:testnet"
        uint256  reportedAt;           // block.timestamp
        uint256  blockNumber;
    }

    SettlementRecord[]       private _settlements;
    mapping(string => bool)  private _orderAnchored;   // orderId → seen

    // intentHash → 1-based index into _settlements (workflow lookup key)
    mapping(bytes32 => uint256) public latestSettlementId;

    // ─── Events ─────────────────────────────────────────────────────────────

    event FundRegistered(
        uint256 indexed fundIdx,
        string  indexed fundId,
        string          name
    );

    event ActionReported(
        uint256    indexed recordId,
        string     indexed network,
        string     indexed txHash,
        ActionType         action,
        string             from,
        string             to,
        uint256            amount,
        uint256            timestamp
    );

    event SettlementReported(
        uint256 indexed recordId,
        string  indexed orderId,
        bytes32 indexed intentHash,
        string          progress,
        bool            technicalCompleted,
        bool            accountingCompleted,
        bytes32         deliveryProofSHA256,
        bytes32         resolutionHash,
        uint256         reportedAt
    );

    // ─── Constructor ────────────────────────────────────────────────────────

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(REPORTER_ROLE, msg.sender);
    }

    // ─── Admin ──────────────────────────────────────────────────────────────

    function registerFund(FundInput calldata f) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_fundIdToIndex[f.fundId] != 0) revert FundAlreadyRegistered();
        _funds.push(FundInfo({
            fundId: f.fundId, name: f.name,
            xdcNetwork: f.xdcNetwork, xdcFidcManager: f.xdcFidcManager,
            xdcStable: f.xdcStable, xdcEscrowFactory: f.xdcEscrowFactory,
            xrplNetwork: f.xrplNetwork, xrplIssuer: f.xrplIssuer,
            debentureCurrency: f.debentureCurrency
        }));
        _fundIdToIndex[f.fundId] = _funds.length;
        emit FundRegistered(_funds.length - 1, f.fundId, f.name);
    }

    // ─── Reporter ───────────────────────────────────────────────────────────

    function reportAction(
        string     calldata network,
        ActionType          action,
        string     calldata from,
        string     calldata to,
        uint256             amount,
        string     calldata txHash
    ) external onlyRole(REPORTER_ROLE) returns (uint256 recordId) {
        bytes32 txKey = keccak256(abi.encodePacked(network, txHash));
        if (_txAnchored[txKey]) revert ActionAlreadyAnchored();
        _txAnchored[txKey] = true;
        recordId = _actions.length;
        _actions.push(ActionRecord({
            network: network, action: action,
            from: from, to: to,
            amount: amount, txHash: txHash,
            timestamp: block.timestamp, blockNumber: block.number
        }));
        emit ActionReported(recordId, network, txHash, action, from, to, amount, block.timestamp);
    }

    function reportSettlement(SettlementInput calldata s) external onlyRole(REPORTER_ROLE) returns (uint256 recordId) {
        if (_orderAnchored[s.orderId]) revert OrderAlreadyAnchored();
        _orderAnchored[s.orderId] = true;
        recordId = _settlements.length;
        _settlements.push(SettlementRecord({
            orderId:             s.orderId,
            intentHash:          s.intentHash,
            progress:            s.progress,
            technicalCompleted:  s.technicalCompleted,
            accountingCompleted: s.accountingCompleted,
            deliveryProofSHA256: s.deliveryProofSHA256,
            resolutionHash:      s.resolutionHash,
            sourceNetwork:       s.sourceNetwork,
            destinationNetwork:  s.destinationNetwork,
            reportedAt:          block.timestamp,
            blockNumber:         block.number
        }));
        latestSettlementId[s.intentHash] = recordId + 1;
        emit SettlementReported(
            recordId, s.orderId, s.intentHash, s.progress,
            s.technicalCompleted, s.accountingCompleted,
            s.deliveryProofSHA256, s.resolutionHash, block.timestamp
        );
    }

    // ─── Existence Checks ───────────────────────────────────────────────────

    function isFundRegistered(string calldata fundId) external view returns (bool) {
        return _fundIdToIndex[fundId] != 0;
    }

    function isActionAnchored(string calldata network, string calldata txHash) external view returns (bool) {
        return _txAnchored[keccak256(abi.encodePacked(network, txHash))];
    }

    function isOrderAnchored(string calldata orderId) external view returns (bool) {
        return _orderAnchored[orderId];
    }

    function isSettlementAnchored(bytes32 intentHash) external view returns (bool) {
        return latestSettlementId[intentHash] != 0;
    }

    // ─── Settlement Views ───────────────────────────────────────────────────

    function getLatestSettlement(bytes32 intentHash) external view returns (SettlementRecord memory) {
        uint256 id = latestSettlementId[intentHash];
        if (id == 0) revert NotFound();
        return _settlements[id - 1];
    }

    function getSettlement(uint256 recordId) external view returns (SettlementRecord memory) {
        if (recordId >= _settlements.length) revert NotFound();
        return _settlements[recordId];
    }

    function getSettlementCount() external view returns (uint256) { return _settlements.length; }

    function getLatestSettlements(uint256 count) external view returns (SettlementRecord[] memory result) {
        uint256 total = _settlements.length;
        uint256 n = count > total ? total : count;
        result = new SettlementRecord[](n);
        for (uint256 i = 0; i < n; i++) result[i] = _settlements[total - n + i];
    }

    function getSettlements(uint256 fromIndex, uint256 toIndex) external view returns (SettlementRecord[] memory result) {
        if (fromIndex > toIndex) revert InvalidRange();
        if (toIndex >= _settlements.length) revert OutOfBounds();
        uint256 n = toIndex - fromIndex + 1;
        result = new SettlementRecord[](n);
        for (uint256 i = 0; i < n; i++) result[i] = _settlements[fromIndex + i];
    }

    // ─── Action Views ────────────────────────────────────────────────────────

    function getActionCount() external view returns (uint256) { return _actions.length; }

    function getAction(uint256 recordId) external view returns (ActionRecord memory) {
        if (recordId >= _actions.length) revert NotFound();
        return _actions[recordId];
    }

    function getLatestActions(uint256 count) external view returns (ActionRecord[] memory result) {
        uint256 total = _actions.length;
        uint256 n = count > total ? total : count;
        result = new ActionRecord[](n);
        for (uint256 i = 0; i < n; i++) result[i] = _actions[total - n + i];
    }

    function getActions(uint256 fromIndex, uint256 toIndex) external view returns (ActionRecord[] memory result) {
        if (fromIndex > toIndex) revert InvalidRange();
        if (toIndex >= _actions.length) revert OutOfBounds();
        uint256 n = toIndex - fromIndex + 1;
        result = new ActionRecord[](n);
        for (uint256 i = 0; i < n; i++) result[i] = _actions[fromIndex + i];
    }

    // ─── Fund Views ──────────────────────────────────────────────────────────

    function getFundCount() external view returns (uint256) { return _funds.length; }

    function getFund(uint256 idx) external view returns (FundInfo memory) {
        if (idx >= _funds.length) revert NotFound();
        return _funds[idx];
    }

    function getFundById(string calldata fundId) external view returns (FundInfo memory) {
        uint256 idx = _fundIdToIndex[fundId];
        if (idx == 0) revert NotFound();
        return _funds[idx - 1];
    }

    function getLatestFunds(uint256 count) external view returns (FundInfo[] memory result) {
        uint256 total = _funds.length;
        uint256 n = count > total ? total : count;
        result = new FundInfo[](n);
        for (uint256 i = 0; i < n; i++) result[i] = _funds[total - n + i];
    }

    function getFunds(uint256 fromIndex, uint256 toIndex) external view returns (FundInfo[] memory result) {
        if (fromIndex > toIndex) revert InvalidRange();
        if (toIndex >= _funds.length) revert OutOfBounds();
        uint256 n = toIndex - fromIndex + 1;
        result = new FundInfo[](n);
        for (uint256 i = 0; i < n; i++) result[i] = _funds[fromIndex + i];
    }
}
