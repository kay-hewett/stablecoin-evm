/**
 * Diagnostic script to check the exact EIP-712 parameters of the deployed USDC contract
 */

const { ethers } = require("ethers");

// Load configuration
const config = require("./config.js");

// Extended ABI to get EIP-712 domain information
const DIAGNOSTIC_ABI = [
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  // Try both possible function signatures for domain info
  "function EIP712_VERSION() view returns (string)",
  "function TRANSFER_WITH_AUTHORIZATION_TYPEHASH() view returns (bytes32)",
  "function RECEIVE_WITH_AUTHORIZATION_TYPEHASH() view returns (bytes32)",
];

async function diagnoseContract() {
  try {
    console.log("🔍 Diagnosing USDC Contract on Sepolia");
    console.log("=====================================");

    const provider = new ethers.JsonRpcProvider(config.RPC_URL);
    const contractAddress = config.USDC_ADDRESSES[config.NETWORK];
    const contract = new ethers.Contract(
      contractAddress,
      DIAGNOSTIC_ABI,
      provider
    );

    console.log(`Contract Address: ${contractAddress}`);
    console.log(`Network: ${config.NETWORK}`);

    // Basic token info
    try {
      const name = await contract.name();
      console.log(`Name: "${name}"`);
    } catch (e) {
      console.log("❌ Could not get name:", e.message);
    }

    try {
      const symbol = await contract.symbol();
      console.log(`Symbol: "${symbol}"`);
    } catch (e) {
      console.log("❌ Could not get symbol:", e.message);
    }

    try {
      const decimals = await contract.decimals();
      console.log(`Decimals: ${decimals}`);
    } catch (e) {
      console.log("❌ Could not get decimals:", e.message);
    }

    // EIP-712 domain info
    try {
      const version = await contract.version();
      console.log(`Version: "${version}"`);
    } catch (e) {
      console.log("❌ Could not get version via version():", e.message);

      // Try alternative method
      try {
        const eip712Version = await contract.EIP712_VERSION();
        console.log(`EIP712_VERSION: "${eip712Version}"`);
      } catch (e2) {
        console.log("❌ Could not get EIP712_VERSION either:", e2.message);
      }
    }

    try {
      const domainSeparator = await contract.DOMAIN_SEPARATOR();
      console.log(`Domain Separator: ${domainSeparator}`);
    } catch (e) {
      console.log("❌ Could not get DOMAIN_SEPARATOR:", e.message);
    }

    // Check network info
    const network = await provider.getNetwork();
    console.log(`\n🌐 Network Info:`);
    console.log(`Chain ID: ${network.chainId}`);
    console.log(`Network Name: ${network.name}`);

    // Try to get type hashes if available
    try {
      const transferHash = await contract.TRANSFER_WITH_AUTHORIZATION_TYPEHASH();
      console.log(`\n📝 Type Hashes:`);
      console.log(`TRANSFER_WITH_AUTHORIZATION_TYPEHASH: ${transferHash}`);
    } catch (e) {
      console.log("\n❌ Could not get TRANSFER_WITH_AUTHORIZATION_TYPEHASH");
    }

    try {
      const receiveHash = await contract.RECEIVE_WITH_AUTHORIZATION_TYPEHASH();
      console.log(`RECEIVE_WITH_AUTHORIZATION_TYPEHASH: ${receiveHash}`);
    } catch (e) {
      console.log("❌ Could not get RECEIVE_WITH_AUTHORIZATION_TYPEHASH");
    }

    // Test EIP-712 domain calculation
    console.log(`\n🧮 EIP-712 Domain Calculation:`);

    const name = await contract.name();
    let version;
    try {
      version = await contract.version();
    } catch (e) {
      // Try common versions
      version = "2";
      console.log(`Using default version: "${version}"`);
    }

    const domain = {
      name: name,
      version: version,
      chainId: network.chainId,
      verifyingContract: contractAddress,
    };

    console.log(
      "Domain object:",
      JSON.stringify(
        {
          ...domain,
          chainId: domain.chainId.toString(),
        },
        null,
        2
      )
    ); // Calculate what the domain separator should be
    const domainType = [
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ];

    // Note: This is a simplified calculation - the actual domain separator
    // calculation involves keccak256 of the encoded domain
    console.log(
      "\nDomain type structure:",
      JSON.stringify(domainType, null, 2)
    );

    // Check balance of test wallet
    const payerWallet = new ethers.Wallet(
      config.WALLETS.PAYER_PRIVATE_KEY,
      provider
    );
    const payerAddress = await payerWallet.getAddress();
    const balance = await contract.balanceOf(payerAddress);
    console.log(`\n💰 Test Wallet Balance:`);
    console.log(`Address: ${payerAddress}`);
    console.log(`Balance: ${ethers.formatUnits(balance, 6)} USDC`);
  } catch (error) {
    console.error("❌ Diagnostic failed:", error.message);
    console.error("Full error:", error);
  }
}

// Run the diagnostic
if (require.main === module) {
  diagnoseContract();
}

module.exports = { diagnoseContract };
