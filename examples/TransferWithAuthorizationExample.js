/**
 * Example: How to use transferWithAuthorization API
 * This demonstrates the complete flow for sending USDC transfers using signed authorizations
 */

const { ethers } = require("ethers");

// USDC Contract ABI - you would import this from the compiled artifacts
const FIAT_TOKEN_ABI = [
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes memory signature) external",
  "function name() view returns (string)",
  "function balanceOf(address account) view returns (uint256)",
  "function nonces(address owner) view returns (uint256)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
];

class FiatTokenSender {
  constructor(contractAddress, provider, senderSigner) {
    this.contractAddress = contractAddress;
    this.provider = provider;
    this.senderSigner = senderSigner; // Your wallet that will send the transaction
    this.contract = new ethers.Contract(
      contractAddress,
      FIAT_TOKEN_ABI,
      senderSigner
    );
  }

  /**
   * Create the EIP-712 domain separator for the FiatToken contract
   */
  async getDomain() {
    const name = await this.contract.name();
    const chainId = await this.senderSigner.getChainId();

    return {
      name: name,
      version: "2", // FiatTokenV2_2 uses version "2"
      chainId: chainId,
      verifyingContract: this.contractAddress,
    };
  }

  /**
   * EIP-712 type definition for transferWithAuthorization
   */
  getTransferWithAuthorizationTypes() {
    return {
      TransferWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    };
  }

  /**
   * Execute a transferWithAuthorization transaction
   * @param {Object} authorization - The authorization object with signature
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

    console.log(`Executing transferWithAuthorization:`);
    console.log(`  From: ${from}`);
    console.log(`  To: ${to}`);
    console.log(`  Value: ${ethers.utils.formatUnits(value, 6)} USDC`);
    console.log(`  Valid After: ${new Date(validAfter * 1000)}`);
    console.log(`  Valid Before: ${new Date(validBefore * 1000)}`);
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

    console.log(`Transaction submitted: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Transaction confirmed in block: ${receipt.blockNumber}`);

    return receipt;
  }

  /**
   * Check balance of an address
   */
  async getBalance(address) {
    const balance = await this.contract.balanceOf(address);
    return ethers.utils.formatUnits(balance, 6); // USDC has 6 decimals
  }
}

/**
 * Helper function to create a transfer authorization (done by the token holder)
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
  const chainId = await holderSigner.getChainId();
  const holderAddress = await holderSigner.getAddress();

  // Create domain
  const domain = {
    name: name,
    version: "2",
    chainId: chainId,
    verifyingContract: contractAddress,
  };

  // Create message
  const nonce = ethers.utils.randomBytes(32);
  const validAfter = 0; // Valid immediately
  const validBefore = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // Valid for 24 hours

  const message = {
    from: holderAddress,
    to: recipientAddress,
    value: ethers.utils.parseUnits(amount.toString(), 6), // Convert to USDC units
    validAfter: validAfter,
    validBefore: validBefore,
    nonce: nonce,
  };

  // Define types
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

  // Sign the message
  const signature = await holderSigner._signTypedData(domain, types, message);

  return {
    ...message,
    signature,
  };
}

/**
 * Example usage scenario: Gas Station Pattern
 * A third party (gas station) pays gas fees to execute transfers on behalf of users
 */
async function gasStationExample() {
  // Configuration
  const USDC_CONTRACT_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"; // Sepolia USDC
  const provider = new ethers.providers.JsonRpcProvider(
    "https://eth-sepolia.g.alchemy.com/v2/demo"
  );

  // Wallets
  const tokenHolderWallet = new ethers.Wallet(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    provider
  ); // User with USDC
  const recipientWallet = new ethers.Wallet(
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    provider
  ); // Transfer recipient
  const gasStationWallet = new ethers.Wallet(
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    provider
  ); // Pays gas fees

  try {
    // Create sender instance (gas station pays gas)
    const sender = new FiatTokenSender(
      USDC_CONTRACT_ADDRESS,
      provider,
      gasStationWallet
    );

    // Get addresses
    const holderAddress = await tokenHolderWallet.getAddress();
    const recipientAddress = await recipientWallet.getAddress();
    const gasStationAddress = await gasStationWallet.getAddress();

    console.log("=== Gas Station Transfer Example ===");
    console.log(`Token Holder: ${holderAddress}`);
    console.log(`Recipient: ${recipientAddress}`);
    console.log(`Gas Station: ${gasStationAddress}`);

    // Check initial balances
    console.log("\nInitial Balances:");
    console.log(`Token Holder: ${await sender.getBalance(holderAddress)} USDC`);
    console.log(`Recipient: ${await sender.getBalance(recipientAddress)} USDC`);

    // Step 1: Token holder creates authorization (off-chain)
    console.log("\n1. Token holder creating transfer authorization...");
    const authorization = await createTransferAuthorization(
      tokenHolderWallet,
      recipientAddress,
      50, // 50 USDC
      USDC_CONTRACT_ADDRESS
    );

    // Step 2: Gas station executes the transfer (on-chain)
    // The gas station pays the gas fees, but the tokens move from holder to recipient
    console.log("\n2. Gas station executing transferWithAuthorization...");
    await sender.transferWithAuthorization(authorization);

    // Check final balances
    console.log("\nFinal Balances:");
    console.log(`Token Holder: ${await sender.getBalance(holderAddress)} USDC`);
    console.log(`Recipient: ${await sender.getBalance(recipientAddress)} USDC`);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

/**
 * Example usage scenario: Scheduled Transfers
 * Execute a transfer at a specific time in the future
 */
async function scheduledTransferExample() {
  // Configuration
  const USDC_CONTRACT_ADDRESS = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  const provider = new ethers.providers.JsonRpcProvider(
    "https://eth-sepolia.g.alchemy.com/v2/demo"
  );

  // Wallets
  const senderWallet = new ethers.Wallet(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    provider
  );
  const recipientWallet = new ethers.Wallet(
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    provider
  );
  const executorWallet = new ethers.Wallet(
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
    provider
  );

  try {
    const sender = new FiatTokenSender(
      USDC_CONTRACT_ADDRESS,
      provider,
      executorWallet
    );

    const recipientAddress = await recipientWallet.getAddress();

    console.log("=== Scheduled Transfer Example ===");

    // Create authorization for future execution (e.g., 1 hour from now)
    const futureTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    const scheduledAuthorization = await createScheduledTransferAuthorization(
      senderWallet,
      recipientAddress,
      25, // 25 USDC
      USDC_CONTRACT_ADDRESS,
      futureTime
    );

    console.log(`Transfer scheduled for: ${new Date(futureTime * 1000)}`);
    console.log(
      "Authorization created and can be executed by anyone after the scheduled time"
    );

    // In a real scenario, you'd store this authorization and execute it later
    // For demo purposes, we'll show what would happen if we tried to execute now
    try {
      await sender.transferWithAuthorization(scheduledAuthorization);
    } catch (error) {
      console.log(`Expected error (too early): ${error.message}`);
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

/**
 * Helper function to create a scheduled transfer authorization
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
  const chainId = await holderSigner.getChainId();
  const holderAddress = await holderSigner.getAddress();

  const domain = {
    name: name,
    version: "2",
    chainId: chainId,
    verifyingContract: contractAddress,
  };

  const nonce = ethers.utils.randomBytes(32);
  const validAfter = executeAfter; // Execute after specific time
  const validBefore = executeAfter + 24 * 60 * 60; // Valid for 24 hours after that

  const message = {
    from: holderAddress,
    to: recipientAddress,
    value: ethers.utils.parseUnits(amount.toString(), 6),
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

  const signature = await holderSigner._signTypedData(domain, types, message);

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
};

// Run examples if this file is executed directly
if (require.main === module) {
  console.log("Running Gas Station Example...\n");
  gasStationExample().then(() => {
    console.log("\n" + "=".repeat(50) + "\n");
    console.log("Running Scheduled Transfer Example...\n");
    return scheduledTransferExample();
  });
}
