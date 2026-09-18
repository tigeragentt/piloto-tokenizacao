// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ObserverFund
 * @notice Standalone FIDC fund registry for the ABToken / CVM pilot.
 *         Deployed independently; its address is passed to Observer on deployment.
 *
 * @custom:security-contact sol@abtoken.xyz
 */
contract ObserverFund is Ownable {

    // ─── Errors ─────────────────────────────────────────────────────────────

    error FundAlreadyRegistered();
    error NotFound();
    error InvalidRange();
    error OutOfBounds();

    // ─── Structs ─────────────────────────────────────────────────────────────

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

    // ─── State ───────────────────────────────────────────────────────────────

    FundInfo[]                 private _funds;
    mapping(string => uint256) private _fundIdToIndex;   // 1-based; 0 = not registered

    // ─── Events ──────────────────────────────────────────────────────────────

    event FundRegistered(
        uint256 indexed fundIdx,
        string  indexed fundId,
        string          name
    );

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor(address _owner) Ownable(_owner) {}

    // ─── Write (onlyOwner) ────────────────────────────────────────────────────

    function registerFund(FundInput calldata f) external onlyOwner {
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

    // ─── Views ────────────────────────────────────────────────────────────────

    function isFundRegistered(string calldata fundId) external view returns (bool) {
        return _fundIdToIndex[fundId] != 0;
    }

    function getFundCount() external view returns (uint256) {
        return _funds.length;
    }

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
