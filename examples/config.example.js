/**
 * Configuration for running USDC authorization examples
 * Copy this file to config.js and fill in your values
 */

module.exports = {
  // Network Configuration
  RPC_URL: "YOUR_RPC_URL_HERE", // e.g., "https://eth-sepolia.g.alchemy.com/v2/YOUR-API-KEY"

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
    PAYER_PRIVATE_KEY: "0x1234567890abcdef...", // Wallet with USDC
    RECEIVER_PRIVATE_KEY: "0xabcdef1234567890...", // Wallet that will receive
    GAS_STATION_PRIVATE_KEY: "0x567890abcdef1234...", // Wallet that pays gas
  },

  // Network to use (change this to your preferred network)
  NETWORK: "sepolia", // or "mainnet", "polygon", etc.
};
