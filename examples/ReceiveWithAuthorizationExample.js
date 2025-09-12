/**
 * Example: How to use receiveWithAuthorization API
 * This demonstrates the complete flow for receiving USDC transfers using signed authorizations
 */

const { ethers } = require("ethers");

// USDC Contract ABI - you would import this from the compiled artifacts
const FIAT_TOKEN_ABI = [
  "function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes memory signature) external",
  "function name() view returns (string)",
  "function balanceOf(address account) view returns (uint256)",
  "function nonces(address owner) view returns (uint256)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
];

class FiatTokenReceiver {
  constructor(contractAddress, provider, receiverSigner) {
    this.contractAddress = contractAddress;
    this.provider = provider;
    this.receiverSigner = receiverSigner; // Your wallet that will receive tokens
    this.contract = new ethers.Contract(
      contractAddress,
      FIAT_TOKEN_ABI,
      receiverSigner
    );
  }

  /**
   * Create the EIP-712 domain separator for the FiatToken contract
   */
  async getDomain() {
    const name = await this.contract.name();
    const chainId = await this.receiverSigner.getChainId();

    return {
      name: name,
      version: "2", // FiatTokenV2_2 uses version "2"
      chainId: chainId,
      verifyingContract: this.contractAddress,
    };
  }

  /**
   * EIP-712 type definition for receiveWithAuthorization
   */
  getReceiveWithAuthorizationTypes() {
    return {
      ReceiveWithAuthorization: [
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
   * Execute a receiveWithAuthorization transaction
   * @param {Object} authorization - The authorization object with signature
   */
  async receiveWithAuthorization(authorization) {
    const {
      from,
      to,
      value,
      validAfter,
      validBefore,
      nonce,
      signature,
    } = authorization;

    // Verify that 'to' address matches our receiver address
    const receiverAddress = await this.receiverSigner.getAddress();
    if (to.toLowerCase() !== receiverAddress.toLowerCase()) {
      throw new Error(
        `Authorization 'to' address ${to} does not match receiver ${receiverAddress}`
      );
    }

    console.log(`Executing receiveWithAuthorization:`);
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
    const tx = await this.contract.receiveWithAuthorization(
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
 * Helper function to create an authorization (this would typically be done by the payer)
 */
async function createPaymentAuthorization(
  payerSigner,
  receiverAddress,
  amount,
  contractAddress
) {
  const contract = new ethers.Contract(
    contractAddress,
    FIAT_TOKEN_ABI,
    payerSigner
  );
  const name = await contract.name();
  const chainId = await payerSigner.getChainId();
  const payerAddress = await payerSigner.getAddress();

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
    from: payerAddress,
    to: receiverAddress,
    value: ethers.utils.parseUnits(amount.toString(), 6), // Convert to USDC units
    validAfter: validAfter,
    validBefore: validBefore,
    nonce: nonce,
  };

  // Define types
  const types = {
    ReceiveWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  // Sign the message
  const signature = await payerSigner._signTypedData(domain, types, message);

  return {
    ...message,
    signature,
  };
}

/**
 * Example usage
 */
async function example() {
  // Configuration
  const USDC_CONTRACT_ADDRESS = "0xA0b86a33E6441E6aB5b3e1b0D2FB3d8CE0A3A11B"; // Example address
  const provider = new ethers.providers.JsonRpcProvider("YOUR_RPC_URL");

  // Wallets
  const payerWallet = new ethers.Wallet("PAYER_PRIVATE_KEY", provider);
  const receiverWallet = new ethers.Wallet("RECEIVER_PRIVATE_KEY", provider);

  try {
    // Create receiver instance
    const receiver = new FiatTokenReceiver(
      USDC_CONTRACT_ADDRESS,
      provider,
      receiverWallet
    );

    // Check initial balances
    const payerAddress = await payerWallet.getAddress();
    const receiverAddress = await receiverWallet.getAddress();

    console.log("Initial Balances:");
    console.log(`Payer: ${await receiver.getBalance(payerAddress)} USDC`);
    console.log(`Receiver: ${await receiver.getBalance(receiverAddress)} USDC`);

    // Step 1: Payer creates authorization (off-chain)
    console.log("\n1. Creating payment authorization...");
    const authorization = await createPaymentAuthorization(
      payerWallet,
      receiverAddress,
      100, // 100 USDC
      USDC_CONTRACT_ADDRESS
    );

    // Step 2: Receiver executes the authorization (on-chain)
    console.log("\n2. Executing receiveWithAuthorization...");
    await receiver.receiveWithAuthorization(authorization);

    // Check final balances
    console.log("\nFinal Balances:");
    console.log(`Payer: ${await receiver.getBalance(payerAddress)} USDC`);
    console.log(`Receiver: ${await receiver.getBalance(receiverAddress)} USDC`);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Export for use in other modules
module.exports = {
  FiatTokenReceiver,
  createPaymentAuthorization,
};

// Run example if this file is executed directly
if (require.main === module) {
  example();
}
