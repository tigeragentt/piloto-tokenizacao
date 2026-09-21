// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import "@openzeppelin/contracts/access/AccessControl.sol";
import {ReceiverTemplate} from "./ReceiverTemplate.sol";
import {IObserverFund} from "./IObserverFund.sol";

/**
 * @title TObserver
 * @notice Remix-only deploy target — mirrors Observer.sol v1.5.0 exactly but:
 *           1. Constructor takes (_fundAddress) and uses the simulation forwarder
 *           2. reportSettlement() and reportAction() are public (no role check)
 *         Do NOT deploy this to production. Use contracts/Observer.sol instead.
 *
 * @dev Load: ReceiverTemplate.sol, IObserverFund.sol, TObserverFund.sol, TObserver.sol
 *      Deploy TObserverFund first, then pass its address to TObserver constructor.
 */
contract TObserver is ReceiverTemplate, AccessControl {

    // ─── Errors ─────────────────────────────────────────────────────────────
    error ActionAlreadyAnchored();
    error OrderAlreadyAnchored();
    error NotFound();
    error InvalidRange();
    error OutOfBounds();

    // ─── Constants ───────────────────────────────────────────────────────────
    string public constant VERSION = "1.2.0";
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
        FIDCFundCreated,       // 4  FIDC fund created on XDC
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

    // ─── Settlement Records ──────────────────────────────────────────────────

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

    // ─── Events ──────────────────────────────────────────────────────────────

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

    // ─── Constructor ─────────────────────────────────────────────────────────

    // Deploys its own ObserverFund for Remix convenience.
    // Call fund() to get the ObserverFund address, then use it directly.
    constructor(address _fundAddress) ReceiverTemplate(SIMULATION_FORWARDER) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(REPORTER_ROLE, msg.sender);
        funds = IObserverFund(_fundAddress);
    }

    // ─── Reporter ───────────────────────────────────────────────────────────

    function reportAction(
        string     calldata network,
        ActionType          action,
        string     calldata from,
        string     calldata to,
        uint256             amount,
        string     calldata txHash
    ) external returns (uint256 recordId) {
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

    function reportSettlement(SettlementInput calldata s) external returns (uint256 recordId) {
        return _reportSettlement(s);
    }

    // ─── ReceiverTemplate — CRE write path ───────────────────────────────────
    function _processReport(bytes calldata report) internal override {
        SettlementInput memory s = abi.decode(report, (SettlementInput));
        _reportSettlement(s);
    }

    function _reportSettlement(SettlementInput memory s) internal returns (uint256 recordId) {
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

    // ─── ERC165 ───────────────────────────────────────────────────────────────
    function supportsInterface(bytes4 interfaceId) public view override(AccessControl, ReceiverTemplate) returns (bool) {
        return AccessControl.supportsInterface(interfaceId) || ReceiverTemplate.supportsInterface(interfaceId);
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
}
