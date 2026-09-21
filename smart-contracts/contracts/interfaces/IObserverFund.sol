// SPDX-License-Identifier: MIT
pragma solidity 0.8.36;

/**
 * @title IObserverFund
 * @notice Interface for the FIDC fund registry.
 *         Implemented by ObserverFund.sol; referenced by Observer.sol.
 */
interface IObserverFund {

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

    function registerFund(FundInput calldata f) external;
    function isFundRegistered(string calldata fundId) external view returns (bool);
    function getFundCount() external view returns (uint256);
    function getFund(uint256 idx) external view returns (FundInfo memory);
    function getFundById(string calldata fundId) external view returns (FundInfo memory);
    function getLatestFunds(uint256 count) external view returns (FundInfo[] memory);
    function getFunds(uint256 fromIndex, uint256 toIndex) external view returns (FundInfo[] memory);
}
