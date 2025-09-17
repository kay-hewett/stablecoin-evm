/**
 * Example: TransferWithAuthorization for ethers v6
 * This demonstrates both gas station and scheduled transfer patterns
 */

const { ethers } = require("ethers");

// Try to load configuration
let config;
try {
  config = require("./config.js");
} catch (error) {
  // Use fallback values if config doesn't exist
  config = {
    RPC_URL: "https://sepolia.drpc.org",
    USDC_ADDRESSES: {
      sepolia: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    },
    WALLETS: {
      PAYER_PRIVATE_KEY:
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      RECEIVER_PRIVATE_KEY:
        "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      GAS_STATION_PRIVATE_KEY:
        "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    },
    NETWORK: "sepolia",
  };
}

// USDC Contract ABI
const FIAT_TOKEN_ABI = [
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes memory signature) external",
  "function name() view returns (string)",
  "function balanceOf(address account) view returns (uint256)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
];

class FiatTokenSender {
  constructor(contractAddress, provider, senderSigner) {
    this.contractAddress = contractAddress;
    this.provider = provider;
    this.senderSigner = senderSigner;
    this.contract = new ethers.Contract(
      contractAddress,
      FIAT_TOKEN_ABI,
      senderSigner
    );
  }

  /**
   * Execute a transferWithAuthorization transaction
   */
  async transferWithAuthorization(authorization) {
    const {
      from,
      to,
      value,
      validAfter,
      validBefore,
      nonce,
      signature,
    } = authorization;

    console.log(`🔄 Executing transferWithAuthorization:`);
    console.log(`  From: ${from}`);
    console.log(`  To: ${to}`);
    console.log(`  Value: ${ethers.formatUnits(value, 6)} USDC`);
    console.log(`  Valid After: ${new Date(Number(validAfter) * 1000)}`);
    console.log(`  Valid Before: ${new Date(Number(validBefore) * 1000)}`);
    console.log(`  Nonce: ${nonce}`);

    // Check if authorization is still valid
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime < validAfter) {
      throw new Error("Authorization is not yet valid");
    }
    if (currentTime > validBefore) {
      throw new Error("Authorization has expired");
    }

    // Check if authorization has already been used
    const isUsed = await this.contract.authorizationState(from, nonce);
    if (isUsed) {
      throw new Error("Authorization has already been used");
    }

    // Execute the transaction
    const tx = await this.contract.transferWithAuthorization(
      from,
      to,
      value,
      validAfter,
      validBefore,
      nonce,
      signature
    );

    console.log(`📤 Transaction submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed in block: ${receipt.blockNumber}`);

    return receipt;
  }

  async getBalance(address) {
    const balance = await this.contract.balanceOf(address);
    return ethers.formatUnits(balance, 6);
  }
}

/**
 * Create a transfer authorization (done by the token holder)
 */
async function createTransferAuthorization(
  holderSigner,
  recipientAddress,
  amount,
  contractAddress
) {
  const contract = new ethers.Contract(
    contractAddress,
    FIAT_TOKEN_ABI,
    holderSigner
  );
  const name = await contract.name();
  const network = await holderSigner.provider.getNetwork();
  const holderAddress = await holderSigner.getAddress();

  // Domain
  const domain = {
    name: name,
    version: "2",
    chainId: network.chainId,
    verifyingContract: contractAddress,
  };

  // Message
  const nonce = ethers.randomBytes(32);
  const validAfter = 0; // Immediately valid
  const validBefore = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // Valid for 24 hours

  const message = {
    from: holderAddress,
    to: recipientAddress,
    value: ethers.parseUnits(amount.toString(), 6),
    validAfter: validAfter,
    validBefore: validBefore,
    nonce: nonce,
  };

  // Types
  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  // Sign
  const signature = await holderSigner.signTypedData(domain, types, message);

  return {
    ...message,
    signature,
  };
}

/**
 * Gas Station Pattern Example
 */
async function gasStationExample() {
  console.log("🚗 === Gas Station Transfer Example ===");

  // Configuration
  const provider = new ethers.JsonRpcProvider(config.RPC_URL);
  const contractAddress = config.USDC_ADDRESSES[config.NETWORK];

  // Wallets
  const tokenHolderWallet = new ethers.Wallet(
    config.WALLETS.PAYER_PRIVATE_KEY,
    provider
  );
  const recipientWallet = new ethers.Wallet(
    config.WALLETS.RECEIVER_PRIVATE_KEY,
    provider
  );
  const gasStationWallet = new ethers.Wallet(
    config.WALLETS.GAS_STATION_PRIVATE_KEY,
    provider
  );

  try {
    // Create sender instance (gas station pays gas)
    const sender = new FiatTokenSender(
      contractAddress,
      provider,
      gasStationWallet
    );

    // Get addresses
    const holderAddress = await tokenHolderWallet.getAddress();
    const recipientAddress = await recipientWallet.getAddress();
    const gasStationAddress = await gasStationWallet.getAddress();

    console.log(`Token Holder: ${holderAddress}`);
    console.log(`Recipient: ${recipientAddress}`);
    console.log(`Gas Station: ${gasStationAddress}`);

    // Check initial balances
    console.log(`\n💰 Initial Balances:`);
    console.log(`Token Holder: ${await sender.getBalance(holderAddress)} USDC`);
    console.log(`Recipient: ${await sender.getBalance(recipientAddress)} USDC`);

    // Step 1: Token holder creates authorization (off-chain)
    console.log(`\n1️⃣ Token holder creating transfer authorization...`);
    const authorization = await createTransferAuthorization(
      tokenHolderWallet,
      recipientAddress,
      50, // 50 USDC
      contractAddress
    );
    console.log(`✅ Authorization created`);

    // Step 2: Gas station executes the transfer (on-chain)
    console.log(`\n2️⃣ Gas station executing transferWithAuthorization...`);
    await sender.transferWithAuthorization(authorization);

    // Check final balances
    console.log(`\n💰 Final Balances:`);
    console.log(`Token Holder: ${await sender.getBalance(holderAddress)} USDC`);
    console.log(`Recipient: ${await sender.getBalance(recipientAddress)} USDC`);
  } catch (error) {
    console.error(`❌ Error:`, error.message);

    if (error.message.includes("insufficient funds")) {
      console.log(
        `💡 Tip: Make sure the token holder has enough USDC and gas station has ETH`
      );
    }
  }
}

/**
 * Scheduled Transfer Example
 */
async function scheduledTransferExample() {
  console.log("\n" + "=".repeat(50));
  console.log("⏰ === Scheduled Transfer Example ===");

  // Configuration
  const provider = new ethers.JsonRpcProvider(config.RPC_URL);
  const contractAddress = config.USDC_ADDRESSES[config.NETWORK];

  // Wallets
  const senderWallet = new ethers.Wallet(
    config.WALLETS.PAYER_PRIVATE_KEY,
    provider
  );
  const recipientWallet = new ethers.Wallet(
    config.WALLETS.RECEIVER_PRIVATE_KEY,
    provider
  );
  const executorWallet = new ethers.Wallet(
    config.WALLETS.GAS_STATION_PRIVATE_KEY,
    provider
  );

  try {
    const sender = new FiatTokenSender(
      contractAddress,
      provider,
      executorWallet
    );

    const recipientAddress = await recipientWallet.getAddress();

    // Create authorization for future execution (e.g., 15 seconds from now for demo)
    // Get current block timestamp to ensure consistency with blockchain
    const currentBlock = await provider.getBlock("latest");
    const futureTime = currentBlock.timestamp + 15; // 15 seconds from current block

    console.log(`📅 Creating scheduled transfer authorization...`);
    const scheduledAuth = await createScheduledTransferAuthorization(
      senderWallet,
      recipientAddress,
      25, // 25 USDC
      contractAddress,
      futureTime
    );

    console.log(
      `⏰ Transfer scheduled for: ${new Date(
        futureTime * 1000
      ).toLocaleTimeString()}`
    );
    console.log(
      `🔒 Authorization created and can be executed after the scheduled time`
    );

    // Try to execute now (should fail)
    console.log(`\n⚠️  Trying to execute before scheduled time...`);
    try {
      await sender.transferWithAuthorization(scheduledAuth);
    } catch (error) {
      console.log(`✅ Expected error: ${error.message}`);
    }

    // Wait for the scheduled time
    console.log(`\n⏳ Waiting for scheduled time (15 seconds)...`);
    await new Promise((resolve) => setTimeout(resolve, 16000));

    // Now execute successfully
    console.log(`\n✅ Executing at scheduled time...`);
    await sender.transferWithAuthorization(scheduledAuth);
  } catch (error) {
    console.error(`❌ Error:`, error.message);
  }
}

/**
 * Create scheduled transfer authorization
 */
async function createScheduledTransferAuthorization(
  holderSigner,
  recipientAddress,
  amount,
  contractAddress,
  executeAfter
) {
  const contract = new ethers.Contract(
    contractAddress,
    FIAT_TOKEN_ABI,
    holderSigner
  );
  const name = await contract.name();
  const network = await holderSigner.provider.getNetwork();
  const holderAddress = await holderSigner.getAddress();

  const domain = {
    name: name,
    version: "2",
    chainId: network.chainId,
    verifyingContract: contractAddress,
  };

  const nonce = ethers.randomBytes(32);
  const validAfter = executeAfter;
  const validBefore = executeAfter + 24 * 60 * 60; // Valid for 24 hours after that

  const message = {
    from: holderAddress,
    to: recipientAddress,
    value: ethers.parseUnits(amount.toString(), 6),
    validAfter: validAfter,
    validBefore: validBefore,
    nonce: nonce,
  };

  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  const signature = await holderSigner.signTypedData(domain, types, message);

  return {
    ...message,
    signature,
  };
}

// Export for use in other modules
module.exports = {
  FiatTokenSender,
  createTransferAuthorization,
  createScheduledTransferAuthorization,
  gasStationExample,
  scheduledTransferExample,
};

// Run examples if this file is executed directly
if (require.main === module) {
  console.log("🚀 Running Transfer Authorization Examples");
  console.log("==========================================");

  gasStationExample()
    .then(() => {
      return scheduledTransferExample();
    })
    .then(() => {
      console.log("\n🎉 All examples completed!");
    })
    .catch((error) => {
      console.error("❌ Example failed:", error.message);
    });
}
