require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.8.36",
    settings: {
      optimizer: { enabled: false },
      evmVersion: "cancun"
    }
  },
  networks: {
    sepolia: {
      url: "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: []
    }
  },
  etherscan: {
    apiKey: "V9BV2K3KIU95Y9XHZRRFPJPTVASNII5249"
  }
};
