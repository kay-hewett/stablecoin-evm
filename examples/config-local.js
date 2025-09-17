/**
 * Configuration for running USDC authorization examples on LOCAL network
 */

module.exports = {
  // Network Configuration - LOCAL HARDHAT
  RPC_URL: "http://127.0.0.1:8546", // Local Hardhat node

  // USDC Contract Addresses - We'll need to deploy locally
  USDC_ADDRESSES: {
    // For local testing, we'll use a mock address or deploy our own
    local: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // We'll use this as placeholder
    sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // USDC on Sepolia
  },

  // Test Wallet Private Keys (these are the Hardhat default accounts with 10k ETH each!)
  WALLETS: {
    PAYER_PRIVATE_KEY:
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // 10k ETH
    RECEIVER_PRIVATE_KEY:
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // 10k ETH
    GAS_STATION_PRIVATE_KEY:
      "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // 10k ETH
  },

  // Network to use
  NETWORK: "sepolia", // Still use sepolia config but point to local node
};
