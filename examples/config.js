/**
 * Configuration for running USDC authorization examples
 * Copy this file to config.js and fill in your values
 */

module.exports = {
  // Network Configuration
  RPC_URL: "https://sepolia.drpc.org", // Using dRPC public endpoint

  // USDC Contract Addresses (choose the right one for your network)
  USDC_ADDRESSES: {
    // Mainnet
    mainnet: "0xA0b86a33E6441E6aB5b3e1b0D2FB3d8CE0A3A11B",

    // Testnets
    sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // USDC on Sepolia
    polygon: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC on Polygon

    // Add more networks as needed
  },

  // Test Wallet Private Keys (NEVER use these in production!)
  WALLETS: {
    PAYER_PRIVATE_KEY:
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    RECEIVER_PRIVATE_KEY:
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    GAS_STATION_PRIVATE_KEY:
      "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // Wallet that pays gas
  },

  // Network to use (change this to your preferred network)
  NETWORK: "sepolia", // or "mainnet", "polygon", etc.
};
