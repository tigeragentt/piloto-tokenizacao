// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {ReceiverTemplate} from "./interfaces/ReceiverTemplate.sol";
import {ObserverFund} from "./ObserverFund.sol";

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
 *         Deployment order:
 *           1. Deploy ObserverFund (pass deployer address as _owner)
 *           2. Deploy Observer (pass forwarder address + ObserverFund address)
 *
 *         CRE write path: KeystoneForwarder → onReport() [ReceiverTemplate] → _processReport()
 *         Direct write path: owner calls reportSettlement() / reportAction()
 *
 * @custom:security-contact sol@abtoken.xyz
 */
contract Observer is ReceiverTemplate {

    // ─── Errors ─────────────────────────────────────────────────────────────

    error ActionAlreadyAnchored();
    error OrderAlreadyAnchored();
    error FundNotRegistered();
    error NotFound();
    error InvalidRange();
    error OutOfBounds();

    // ─── Constants ───────────────────────────────────────────────────────────

    string public constant VERSION = "1.6.0";

    // ─── Fund reference ───────────────────────────────────────────────────────

    ObserverFund public fund;

    // ─── General Action Log ──────────────────────────────────────────────────

    enum ActionType {
        Transfer,              // 0  BRL-CVM ERC-20 transfer on XDC
        Mint,                  // 1
        Burn,                  // 2
        Approve,               // 3
        Invested,              // 4  quota investment
        EscrowCreated,         // 5  EIP-1167 escrow proxy deployed
        Whitelisted,           // 6  address added to custody or payment whitelist
        Withdrawn,             // 7
        FundingAcknowledged,   // 8  FIDC acknowledged cash lock
        LockResolved,          // 9  escrow cash lock released on XDC
        ExcessReturned,        // 10
        DeliveryProofAnchored, // 11 delivery proof SHA256 anchored
        SettlementProofAnchored, // 12 full settlement proof anchored
        Divergence             // 13 cross-chain mismatch detected
    }

    struct ActionRecord {
        string     fundId;     // Capitare fund UUID — links action to its FIDC fund
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
    mapping(bytes32 => bool) private _txAnchored;      // keccak256(network ++ txHash) → seen
    mapping(string => uint256[]) private _fundActions; // fundId → action record IDs

    // ─── Settlement Records ──────────────────────────────────────────────────

    struct SettlementInput {
        string   fundId;            // Capitare fund UUID
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
        string   fundId;               // Capitare fund UUID — links order to its FIDC fund
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
    mapping(string => bool)  private _orderAnchored;         // orderId → seen
    mapping(string => uint256[]) private _fundSettlements;   // fundId → settlement record IDs

    // intentHash → 1-based index into _settlements (workflow lookup key)
    mapping(bytes32 => uint256) public latestSettlementId;

    // ─── Events ──────────────────────────────────────────────────────────────

    event ActionReported(
        uint256    indexed recordId,
        string     indexed network,
        string     indexed txHash,
        string             fundId,
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
        string          fundId,
        string          progress,
        bool            technicalCompleted,
        bool            accountingCompleted,
        bytes32         deliveryProofSHA256,
        bytes32         resolutionHash,
        uint256         reportedAt
    );

    // ─── Constructor ─────────────────────────────────────────────────────────

    /// @param _forwarderAddress CRE KeystoneForwarder address.
    ///        Simulation Sepolia: 0x15fC6ae953E024d975e77382eEeC56A9101f9F88
    ///        Production Sepolia: 0xF8344CFd5c43616a4366C34E3EEE75af79a74482
    /// @param _fund Address of the deployed ObserverFund contract.
    constructor(address _forwarderAddress, address _fund) ReceiverTemplate(_forwarderAddress) {
        fund = ObserverFund(_fund);
    }

    // ─── Direct write path (onlyOwner — bypass CRE for admin / recovery) ─────

    function reportAction(
        string     calldata fundId,
        string     calldata network,
        ActionType          action,
        string     calldata from,
        string     calldata to,
        uint256             amount,
        string     calldata txHash
    ) external onlyOwner returns (uint256 recordId) {
        if (!fund.isFundRegistered(fundId)) revert FundNotRegistered();
        bytes32 txKey = keccak256(abi.encodePacked(network, txHash));
        if (_txAnchored[txKey]) revert ActionAlreadyAnchored();
        _txAnchored[txKey] = true;
        recordId = _actions.length;
        _actions.push(ActionRecord({
            fundId: fundId, network: network, action: action,
            from: from, to: to,
            amount: amount, txHash: txHash,
            timestamp: block.timestamp, blockNumber: block.number
        }));
        _fundActions[fundId].push(recordId);
        emit ActionReported(recordId, network, txHash, fundId, action, from, to, amount, block.timestamp);
    }

    function reportSettlement(SettlementInput calldata s) external onlyOwner returns (uint256 recordId) {
        return _reportSettlement(s);
    }

    // ─── ReceiverTemplate — CRE write path ───────────────────────────────────

    /// @notice Called by ReceiverTemplate.onReport() after security checks pass.
    ///         report = abi.encode(SettlementInput)
    function _processReport(bytes calldata report) internal override {
        SettlementInput memory s = abi.decode(report, (SettlementInput));
        _reportSettlement(s);
    }

    function _reportSettlement(SettlementInput memory s) internal returns (uint256 recordId) {
        if (!fund.isFundRegistered(s.fundId)) revert FundNotRegistered();
        if (_orderAnchored[s.orderId]) revert OrderAlreadyAnchored();
        _orderAnchored[s.orderId] = true;
        recordId = _settlements.length;
        _settlements.push(SettlementRecord({
            fundId:              s.fundId,
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
        _fundSettlements[s.fundId].push(recordId);
        latestSettlementId[s.intentHash] = recordId + 1;
        emit SettlementReported(
            recordId, s.orderId, s.intentHash, s.fundId, s.progress,
            s.technicalCompleted, s.accountingCompleted,
            s.deliveryProofSHA256, s.resolutionHash, block.timestamp
        );
    }

    // ─── Existence Checks ─────────────────────────────────────────────────────

    function isActionAnchored(string calldata network, string calldata txHash) external view returns (bool) {
        return _txAnchored[keccak256(abi.encodePacked(network, txHash))];
    }

    function isOrderAnchored(string calldata orderId) external view returns (bool) {
        return _orderAnchored[orderId];
    }

    function isSettlementAnchored(bytes32 intentHash) external view returns (bool) {
        return latestSettlementId[intentHash] != 0;
    }

    // ─── Settlement Views ─────────────────────────────────────────────────────

    function getLatestSettlement(bytes32 intentHash) external view returns (SettlementRecord memory) {
        uint256 id = latestSettlementId[intentHash];
        if (id == 0) revert NotFound();
        return _settlements[id - 1];
    }

    function getSettlement(uint256 recordId) external view returns (SettlementRecord memory) {
        if (recordId >= _settlements.length) revert NotFound();
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
        if (fromIndex > toIndex) revert InvalidRange();
        if (toIndex >= _settlements.length) revert OutOfBounds();
        uint256 n = toIndex - fromIndex + 1;
        result = new SettlementRecord[](n);
        for (uint256 i = 0; i < n; i++) result[i] = _settlements[fromIndex + i];
    }

    /// @notice Returns all settlement record IDs anchored for a given fund.
    function getSettlementsByFund(string calldata fundId) external view returns (uint256[] memory) {
        return _fundSettlements[fundId];
    }

    // ─── Action Views ─────────────────────────────────────────────────────────

    function getActionCount() external view returns (uint256) {
        return _actions.length;
    }

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

    /// @notice Returns all action record IDs anchored for a given fund.
    function getActionsByFund(string calldata fundId) external view returns (uint256[] memory) {
        return _fundActions[fundId];
    }
}
