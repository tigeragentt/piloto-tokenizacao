// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

/**
 * @title IObserverFunds
 * @notice Interface for the FIDC fund registry contract.
 *         TObserver (and any future consumer) depends on this interface,
 *         not on the concrete TObserverFunds implementation.
 */
interface IObserverFunds {

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

    // ─── Events ──────────────────────────────────────────────────────────────

    event FundRegistered(uint256 indexed fundIdx, string indexed fundId, string name);

    // ─── Write ────────────────────────────────────────────────────────────────

    function registerFund(FundInput calldata f) external;

    // ─── Views ────────────────────────────────────────────────────────────────

    function isFundRegistered(string calldata fundId) external view returns (bool);
    function getFundCount() external view returns (uint256);
    function getFund(uint256 idx) external view returns (FundInfo memory);
    function getFundById(string calldata fundId) external view returns (FundInfo memory);
    function getLatestFunds(uint256 count) external view returns (FundInfo[] memory);
    function getFunds(uint256 fromIndex, uint256 toIndex) external view returns (FundInfo[] memory);
}
