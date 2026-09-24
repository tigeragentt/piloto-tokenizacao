// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import "@openzeppelin/contracts/access/AccessControl.sol";
import {ReceiverTemplate} from "./ReceiverTemplate.sol";
import {IObserverFund} from "./IObserverFund.sol";

/**
 * @title TObserver
 * @notice Remix-only deploy target — mirrors Observer.sol v1.6.0 exactly but:
 *           1. Constructor takes (_fundAddress) and uses the simulation forwarder
 *           2. reportSettlement() and reportAction() are public (no role check)
 *         Do NOT deploy this to production. Use contracts/Observer.sol instead.
 *
 * @dev Load: ReceiverTemplate.sol, IObserverFund.sol, TObserverFund.sol, TObserver.sol
 *      Deploy TObserverFund first, then pass its address to TObserver constructor.
 */
contract TObserver is ReceiverTemplate, AccessControl {

    // ─── Errors ─────────────────────────────────────────────────────────────

    error ActionAlreadyNotarized();
    error OrderAlreadyNotarized();
    error FundNotRegistered();
    error NotFound();
    error InvalidRange();
    error OutOfBounds();

    // ─── Constants ───────────────────────────────────────────────────────────

    string public constant VERSION = "1.4.0";
    bytes32 public constant ADMIN_ROLE    = keccak256("ADMIN_ROLE");
    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");

    // Sepolia simulation forwarder — default for no-arg constructor.
    // Call setForwarderAddress() to switch.
    // Production: 0xF8344CFd5c43616a4366C34E3EEE75af79a74482
    address private constant SIMULATION_FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;

    // ─── Fund reference ───────────────────────────────────────────────────────

    IObserverFund public funds;

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
        DeliveryProofNotarized, // 11 delivery proof SHA256 notarized
        SettlementProofNotarized, // 12 full settlement proof notarized
        Divergence             // 13 cross-chain mismatch detected
    }

    struct ActionInput {
        string     fundId;
        string     network;
        ActionType action;
        string     from;
        string     to;
        uint256    amount;
        string     txHash;
    }

    struct ActionRecord {
        string     fundId;     // Fund UUID — links action to its FIDC fund
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
    mapping(bytes32 => bool) private _txNotarized;      // keccak256(network ++ txHash) → seen
    mapping(string => uint256[]) private _fundActions; // fundId → action record IDs

    // ─── Settlement Records ──────────────────────────────────────────────────

    struct SettlementInput {
        string   fundId;            // Fund UUID
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
        string   fundId;               // Fund UUID — links order to its FIDC fund
        string   orderId;              // Order UUID
        bytes32  intentHash;           // cross-chain correlation key (= XRPL InvoiceID)
        string   progress;             // Progress state at time of anchoring
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
    mapping(string => bool)  private _orderNotarized;         // orderId → seen
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

    constructor(address _fundAddress) ReceiverTemplate(SIMULATION_FORWARDER) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(REPORTER_ROLE, msg.sender);
        funds = IObserverFund(_fundAddress);
    }

    // ─── Reporter ────────────────────────────────────────────────────────────

    function reportAction(ActionInput calldata a) external returns (uint256 recordId) {
        if (!funds.isFundRegistered(a.fundId)) revert FundNotRegistered();
        bytes32 txKey = keccak256(abi.encodePacked(a.network, a.txHash));
        if (_txNotarized[txKey]) revert ActionAlreadyNotarized();
        _txNotarized[txKey] = true;
        recordId = _actions.length;
        _actions.push(ActionRecord({
            fundId: a.fundId, network: a.network, action: a.action,
            from: a.from, to: a.to,
            amount: a.amount, txHash: a.txHash,
            timestamp: block.timestamp, blockNumber: block.number
        }));
        _fundActions[a.fundId].push(recordId);
        emit ActionReported(recordId, a.network, a.txHash, a.fundId, a.action, a.from, a.to, a.amount, block.timestamp);
    }

    function reportSettlement(SettlementInput calldata s) external returns (uint256 recordId) {
        return _reportSettlement(s);
    }

    // ─── ReceiverTemplate — CRE write path ───────────────────────────────────

    function _processReport(bytes calldata report) internal override {
        SettlementInput memory s = abi.decode(report, (SettlementInput));
        _reportSettlement(s);
    }

    function _reportSettlement(SettlementInput memory s) internal returns (uint256 recordId) {
        if (!funds.isFundRegistered(s.fundId)) revert FundNotRegistered();
        if (_orderNotarized[s.orderId]) revert OrderAlreadyNotarized();
        _orderNotarized[s.orderId] = true;
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

    // ─── ERC165 ───────────────────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId) public view override(AccessControl, ReceiverTemplate) returns (bool) {
        return AccessControl.supportsInterface(interfaceId) || ReceiverTemplate.supportsInterface(interfaceId);
    }

    // ─── Existence Checks ─────────────────────────────────────────────────────

    function isActionNotarized(string calldata network, string calldata txHash) external view returns (bool) {
        return _txNotarized[keccak256(abi.encodePacked(network, txHash))];
    }

    function isOrderNotarized(string calldata orderId) external view returns (bool) {
        return _orderNotarized[orderId];
    }

    function isSettlementNotarized(bytes32 intentHash) external view returns (bool) {
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

    /// @notice Returns all settlement record IDs notarized for a given fund.
    function getSettlementsByFund(string calldata fundId) external view returns (uint256[] memory) {
        return _fundSettlements[fundId];
    }

    // ─── Action Views ─────────────────────────────────────────────────────────

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

    /// @notice Returns all action record IDs notarized for a given fund.
    function getActionsByFund(string calldata fundId) external view returns (uint256[] memory) {
        return _fundActions[fundId];
    }
}
