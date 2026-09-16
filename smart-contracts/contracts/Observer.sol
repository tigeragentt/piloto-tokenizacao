// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title Observer
 * @notice Immutable supervisability layer for the ABToken / CVM pilot.
 *         Deployed on Ethereum Sepolia. Chainlink CRE workflows anchor:
 *           - FIDC settlement proofs from the Capitare Observer API
 *           - XDC token actions (Transfer, EscrowCreated, LockResolved, …)
 *
 *         CVM auditors can independently verify:
 *           - deliveryProofSHA256: sha256 of capitare:debentures:delivery-proof:v1 manifest
 *           - resolutionHash: keccak256 of settlement resolution struct; must match
 *             the LockResolved event emitted by the escrow contract on XDC (chain 51)
 *
 * @custom:security-contact sol@abtoken.xyz
 */
contract Observer is AccessControl {

    string public constant VERSION = "1.0.0";

    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");

    // ─── Fund Registry ──────────────────────────────────────────────────────

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
    mapping(string => uint256)     private _fundIdToIndex;  // 1-based; 0 = not registered

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

    ActionRecord[] private _actions;

    // ─── Settlement Records ─────────────────────────────────────────────────

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

    SettlementRecord[] private _settlements;

    // intentHash → 1-based index into _settlements (latest record for this order)
    mapping(bytes32 => uint256) public latestSettlementId;

    // ─── Events ─────────────────────────────────────────────────────────────

    event FundRegistered(
        uint256 indexed fundIdx,
        string          fundId,
        string          name
    );

    event ActionReported(
        uint256    indexed recordId,
        string     indexed network,
        ActionType         action,
        string             from,
        string             to,
        uint256            amount,
        string             txHash,
        uint256            timestamp
    );

    event SettlementReported(
        uint256 indexed recordId,
        bytes32 indexed intentHash,
        string          orderId,
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
        // REPORTER_ROLE must be granted explicitly to the CRE wallet after deployment
    }

    // ─── Admin ──────────────────────────────────────────────────────────────

    function registerFund(
        string  calldata fundId,
        string  calldata name,
        string  calldata xdcNetwork,
        address          xdcFidcManager,
        address          xdcStable,
        address          xdcEscrowFactory,
        string  calldata xrplNetwork,
        string  calldata xrplIssuer,
        string  calldata debentureCurrency
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 existing = _fundIdToIndex[fundId];
        uint256 emitIdx;
        if (existing == 0) {
            _funds.push(FundInfo({
                fundId: fundId, name: name,
                xdcNetwork: xdcNetwork, xdcFidcManager: xdcFidcManager,
                xdcStable: xdcStable, xdcEscrowFactory: xdcEscrowFactory,
                xrplNetwork: xrplNetwork, xrplIssuer: xrplIssuer,
                debentureCurrency: debentureCurrency
            }));
            _fundIdToIndex[fundId] = _funds.length;
            emitIdx = _funds.length - 1;
        } else {
            FundInfo storage info = _funds[existing - 1];
            info.name = name;
            info.xdcFidcManager = xdcFidcManager;
            info.xdcStable = xdcStable;
            info.xdcEscrowFactory = xdcEscrowFactory;
            info.xrplIssuer = xrplIssuer;
            emitIdx = existing - 1;
        }
        emit FundRegistered(emitIdx, fundId, name);
    }

    // ─── Reporter ───────────────────────────────────────────────────────────

    /**
     * @notice Log a general on-chain action observed on XDC (or another network).
     * @param network  Origin chain identifier, e.g. "eip155:51".
     * @param action   ActionType enum value.
     * @param from     Sender address in string form (cross-chain compatible).
     * @param to       Receiver address.
     * @param amount   Raw token amount on the origin chain.
     * @param txHash   Transaction hash on the origin network.
     */
    function reportAction(
        string     calldata network,
        ActionType          action,
        string     calldata from,
        string     calldata to,
        uint256             amount,
        string     calldata txHash
    ) external onlyRole(REPORTER_ROLE) returns (uint256 recordId) {
        recordId = _actions.length;
        _actions.push(ActionRecord({
            network: network, action: action,
            from: from, to: to,
            amount: amount, txHash: txHash,
            timestamp: block.timestamp, blockNumber: block.number
        }));
        emit ActionReported(recordId, network, action, from, to, amount, txHash, block.timestamp);
    }

    /**
     * @notice Anchor a Capitare FIDC settlement proof on-chain.
     *         May be called multiple times for the same intentHash — each call
     *         appends a new record (allowing progress from delivery → full settlement).
     *         latestSettlementId[intentHash] always points to the most recent record.
     *
     * @param orderId              Capitare order UUID.
     * @param intentHash           bytes32 correlation key (prepend 0x to Capitare hex).
     * @param progress             Capitare progress string, e.g. "ACQUIRED_WITH_LOCK".
     * @param technicalCompleted   technicalSettlementCompleted from /settlement endpoint.
     * @param accountingCompleted  accountingCompleted from /settlement endpoint.
     * @param deliveryProofSHA256  sha256 of delivery-proof manifest (bytes32, 0x0 if unavailable).
     * @param resolutionHash       keccak256 of resolution struct; must match LockResolved on XDC.
     * @param sourceNetwork        e.g. "eip155:51".
     * @param destinationNetwork   e.g. "xrpl:testnet".
     */
    function reportSettlement(
        string   calldata orderId,
        bytes32           intentHash,
        string   calldata progress,
        bool              technicalCompleted,
        bool              accountingCompleted,
        bytes32           deliveryProofSHA256,
        bytes32           resolutionHash,
        string   calldata sourceNetwork,
        string   calldata destinationNetwork
    ) external onlyRole(REPORTER_ROLE) returns (uint256 recordId) {
        recordId = _settlements.length;
        _settlements.push(SettlementRecord({
            orderId: orderId,
            intentHash: intentHash,
            progress: progress,
            technicalCompleted: technicalCompleted,
            accountingCompleted: accountingCompleted,
            deliveryProofSHA256: deliveryProofSHA256,
            resolutionHash: resolutionHash,
            sourceNetwork: sourceNetwork,
            destinationNetwork: destinationNetwork,
            reportedAt: block.timestamp,
            blockNumber: block.number
        }));
        latestSettlementId[intentHash] = recordId + 1;
        emit SettlementReported(
            recordId, intentHash, orderId, progress,
            technicalCompleted, accountingCompleted,
            deliveryProofSHA256, resolutionHash, block.timestamp
        );
    }

    // ─── Settlement Views ───────────────────────────────────────────────────

    function isSettlementAnchored(bytes32 intentHash) external view returns (bool) {
        return latestSettlementId[intentHash] != 0;
    }

    function getLatestSettlement(bytes32 intentHash) external view returns (SettlementRecord memory) {
        uint256 id = latestSettlementId[intentHash];
        require(id != 0, "Observer: not found");
        return _settlements[id - 1];
    }

    function getSettlement(uint256 recordId) external view returns (SettlementRecord memory) {
        require(recordId < _settlements.length, "Observer: not found");
        return _settlements[recordId];
    }

    function getSettlementCount() external view returns (uint256) {
        return _settlements.length;
    }

    function getLatestSettlements(uint256 count) external view returns (SettlementRecord[] memory result) {
        uint256 total = _settlements.length;
        uint256 n = count > total ? total : count;
        result = new SettlementRecord[](n);
        for (uint256 i = 0; i < n; i++) result[i] = _settlements[total - n + i];
    }

    function getSettlements(uint256 fromIndex, uint256 toIndex) external view returns (SettlementRecord[] memory result) {
        require(fromIndex <= toIndex, "Observer: invalid range");
        require(toIndex < _settlements.length, "Observer: out of bounds");
        uint256 n = toIndex - fromIndex + 1;
        result = new SettlementRecord[](n);
        for (uint256 i = 0; i < n; i++) result[i] = _settlements[fromIndex + i];
    }

    // ─── Action Views ────────────────────────────────────────────────────────

    function getActionCount() external view returns (uint256) {
        return _actions.length;
    }

    function getAction(uint256 recordId) external view returns (ActionRecord memory) {
        require(recordId < _actions.length, "Observer: not found");
        return _actions[recordId];
    }

    function getLatestActions(uint256 count) external view returns (ActionRecord[] memory result) {
        uint256 total = _actions.length;
        uint256 n = count > total ? total : count;
        result = new ActionRecord[](n);
        for (uint256 i = 0; i < n; i++) result[i] = _actions[total - n + i];
    }

    function getActions(uint256 fromIndex, uint256 toIndex) external view returns (ActionRecord[] memory result) {
        require(fromIndex <= toIndex, "Observer: invalid range");
        require(toIndex < _actions.length, "Observer: out of bounds");
        uint256 n = toIndex - fromIndex + 1;
        result = new ActionRecord[](n);
        for (uint256 i = 0; i < n; i++) result[i] = _actions[fromIndex + i];
    }

    // ─── Fund Views ──────────────────────────────────────────────────────────

    function getFundCount() external view returns (uint256) {
        return _funds.length;
    }

    function getFund(uint256 idx) external view returns (FundInfo memory) {
        require(idx < _funds.length, "Observer: not found");
        return _funds[idx];
    }

    function getFundById(string calldata fundId) external view returns (FundInfo memory) {
        uint256 idx = _fundIdToIndex[fundId];
        require(idx != 0, "Observer: fund not found");
        return _funds[idx - 1];
    }

    function getLatestFunds(uint256 count) external view returns (FundInfo[] memory result) {
        uint256 total = _funds.length;
        uint256 n = count > total ? total : count;
        result = new FundInfo[](n);
        for (uint256 i = 0; i < n; i++) result[i] = _funds[total - n + i];
    }

    function getFunds(uint256 fromIndex, uint256 toIndex) external view returns (FundInfo[] memory result) {
        require(fromIndex <= toIndex, "Observer: invalid range");
        require(toIndex < _funds.length, "Observer: out of bounds");
        uint256 n = toIndex - fromIndex + 1;
        result = new FundInfo[](n);
        for (uint256 i = 0; i < n; i++) result[i] = _funds[fromIndex + i];
    }
}
