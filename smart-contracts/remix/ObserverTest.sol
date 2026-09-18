// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/**
 * @title ObserverTest
 * @notice Remix-only deploy target — mirrors Observer.sol v1.2.0 exactly but:
 *           1. Self-contained (IReceiver defined inline; no local imports needed)
 *           2. No-arg constructor that defaults to the Sepolia simulation forwarder
 *           3. Auto-grants REPORTER_ROLE to the deployer for easier manual testing
 *         Do NOT deploy this to production. Use contracts/Observer.sol instead.
 */

// ─── IReceiver interface (inline copy — matches contracts/interfaces/IReceiver.sol) ──

interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

// ─── ObserverTest ────────────────────────────────────────────────────────────

contract ObserverTest is AccessControl, IReceiver {

    // ─── Errors ─────────────────────────────────────────────────────────────

    error FundAlreadyRegistered();
    error ActionAlreadyAnchored();
    error OrderAlreadyAnchored();
    error NotFound();
    error InvalidRange();
    error OutOfBounds();

    error InvalidForwarderAddress();
    error InvalidSender(address sender, address expected);
    error InvalidAuthor(address received, address expected);
    error InvalidWorkflowName(bytes10 received, bytes10 expected);
    error InvalidWorkflowId(bytes32 received, bytes32 expected);
    error WorkflowNameRequiresAuthorValidation();

    // ─── Constants ───────────────────────────────────────────────────────────

    string public constant VERSION = "1.2.0";

    bytes32 public constant REPORTER_ROLE = keccak256("REPORTER_ROLE");

    bytes private constant HEX_CHARS = "0123456789abcdef";

    // Sepolia simulation forwarder — default for Remix deployments.
    // Update via setForwarderAddress() to switch to:
    //   Production : 0xF8344CFd5c43616a4366C34E3EEE75af79a74482
    address private constant SIMULATION_FORWARDER = 0x15fC6ae953E024d975e77382eEeC56A9101f9F88;

    // ─── Receiver Security State ─────────────────────────────────────────────

    address private s_forwarderAddress;
    address private s_expectedAuthor;
    bytes10 private s_expectedWorkflowName;
    bytes32 private s_expectedWorkflowId;

    // ─── Fund Registry ───────────────────────────────────────────────────────

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

    FundInfo[]                     private _funds;
    mapping(string => uint256)     private _fundIdToIndex;

    // ─── General Action Log ──────────────────────────────────────────────────

    enum ActionType {
        Transfer, Mint, Burn, Approve, FIDCCreated, Invested,
        EscrowCreated, Whitelisted, Withdrawn, FundingAcknowledged,
        LockResolved, ExcessReturned, DeliveryProofAnchored,
        SettlementProofAnchored, Divergence
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
    mapping(bytes32 => bool) private _txAnchored;

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
        string   orderId;
        bytes32  intentHash;
        string   progress;
        bool     technicalCompleted;
        bool     accountingCompleted;
        bytes32  deliveryProofSHA256;
        bytes32  resolutionHash;
        string   sourceNetwork;
        string   destinationNetwork;
        uint256  reportedAt;
        uint256  blockNumber;
    }

    SettlementRecord[] private _settlements;
    mapping(string => bool)     private _orderAnchored;

    mapping(bytes32 => uint256) public latestSettlementId;

    // ─── Events ──────────────────────────────────────────────────────────────

    event ForwarderAddressUpdated(address indexed previousForwarder, address indexed newForwarder);
    event ExpectedAuthorUpdated(address indexed previousAuthor, address indexed newAuthor);
    event ExpectedWorkflowNameUpdated(bytes10 indexed previousName, bytes10 indexed newName);
    event ExpectedWorkflowIdUpdated(bytes32 indexed previousId, bytes32 indexed newId);
    event SecurityWarning(string message);

    event FundRegistered(uint256 indexed fundIdx, string indexed fundId, string name);

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

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // Remix convenience: deployer can call reportSettlement() directly
        _grantRole(REPORTER_ROLE, msg.sender);
        // Default to simulation forwarder — call setForwarderAddress() to change
        s_forwarderAddress = SIMULATION_FORWARDER;
        emit ForwarderAddressUpdated(address(0), SIMULATION_FORWARDER);
    }

    // ─── Receiver Security — Getters ─────────────────────────────────────────

    function getForwarderAddress() external view returns (address) { return s_forwarderAddress; }
    function getExpectedAuthor() external view returns (address) { return s_expectedAuthor; }
    function getExpectedWorkflowName() external view returns (bytes10) { return s_expectedWorkflowName; }
    function getExpectedWorkflowId() external view returns (bytes32) { return s_expectedWorkflowId; }

    // ─── Receiver Security — Setters ─────────────────────────────────────────

    function setForwarderAddress(address _forwarder) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address prev = s_forwarderAddress;
        if (_forwarder == address(0)) emit SecurityWarning("Forwarder address set to zero - contract is now INSECURE");
        s_forwarderAddress = _forwarder;
        emit ForwarderAddressUpdated(prev, _forwarder);
    }

    function setExpectedAuthor(address _author) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address prev = s_expectedAuthor;
        s_expectedAuthor = _author;
        emit ExpectedAuthorUpdated(prev, _author);
    }

    function setExpectedWorkflowName(string calldata _name) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes10 prev = s_expectedWorkflowName;
        if (bytes(_name).length == 0) {
            s_expectedWorkflowName = bytes10(0);
            emit ExpectedWorkflowNameUpdated(prev, bytes10(0));
            return;
        }
        bytes32 hash = sha256(bytes(_name));
        bytes memory hexStr = _bytesToHexString(abi.encodePacked(hash));
        bytes memory first10 = new bytes(10);
        for (uint256 i = 0; i < 10; i++) first10[i] = hexStr[i];
        s_expectedWorkflowName = bytes10(first10);
        emit ExpectedWorkflowNameUpdated(prev, s_expectedWorkflowName);
    }

    function setExpectedWorkflowId(bytes32 _id) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 prev = s_expectedWorkflowId;
        s_expectedWorkflowId = _id;
        emit ExpectedWorkflowIdUpdated(prev, _id);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

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

    // ─── IReceiver Implementation ─────────────────────────────────────────────

    /// @inheritdoc IReceiver
    /// @dev To test in Remix: call setForwarderAddress(YOUR_ADDRESS) first, then call onReport.
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (s_forwarderAddress != address(0) && msg.sender != s_forwarderAddress) {
            revert InvalidSender(msg.sender, s_forwarderAddress);
        }

        if (s_expectedWorkflowId != bytes32(0) || s_expectedAuthor != address(0) || s_expectedWorkflowName != bytes10(0)) {
            (bytes32 workflowId, bytes10 workflowName, address workflowOwner) = _decodeMetadata(metadata);

            if (s_expectedWorkflowId != bytes32(0) && workflowId != s_expectedWorkflowId) {
                revert InvalidWorkflowId(workflowId, s_expectedWorkflowId);
            }
            if (s_expectedAuthor != address(0) && workflowOwner != s_expectedAuthor) {
                revert InvalidAuthor(workflowOwner, s_expectedAuthor);
            }
            if (s_expectedWorkflowName != bytes10(0)) {
                if (s_expectedAuthor == address(0)) revert WorkflowNameRequiresAuthorValidation();
                if (workflowName != s_expectedWorkflowName) revert InvalidWorkflowName(workflowName, s_expectedWorkflowName);
            }
        }

        _processReport(report);
    }

    function reportSettlement(SettlementInput calldata s) external onlyRole(REPORTER_ROLE) returns (uint256 recordId) {
        return _reportSettlement(s);
    }

    // ─── Reporter ─────────────────────────────────────────────────────────────

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

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _processReport(bytes calldata report) internal {
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

    function _decodeMetadata(bytes memory metadata)
        internal pure
        returns (bytes32 workflowId, bytes10 workflowName, address workflowOwner)
    {
        assembly {
            workflowId    := mload(add(metadata, 32))
            workflowName  := mload(add(metadata, 64))
            workflowOwner := shr(mul(12, 8), mload(add(metadata, 74)))
        }
    }

    function _bytesToHexString(bytes memory data) private pure returns (bytes memory) {
        bytes memory hexStr = new bytes(data.length * 2);
        for (uint256 i = 0; i < data.length; i++) {
            hexStr[i * 2]     = HEX_CHARS[uint8(data[i] >> 4)];
            hexStr[i * 2 + 1] = HEX_CHARS[uint8(data[i] & 0x0f)];
        }
        return hexStr;
    }

    // ─── ERC165 ───────────────────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControl, IERC165) returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || super.supportsInterface(interfaceId);
    }

    // ─── Existence Checks ─────────────────────────────────────────────────────

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

    // ─── Fund Views ───────────────────────────────────────────────────────────

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
