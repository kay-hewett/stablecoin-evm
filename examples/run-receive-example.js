/**
 * Runnable version of ReceiveWithAuthorizationExample
 * Updated for ethers.js v6 and with proper configuration
 */

const { ethers } = require("ethers");

// Try to load configuration
let config;
try {
  config = require("./config.js");
} catch (error) {
  console.error(
    "❌ Config file not found. Please create examples/config.js from config.example.js"
  );
  process.exit(1);
}

// USDC Contract ABI
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
    this.receiverSigner = receiverSigner;
    this.contract = new ethers.Contract(
      contractAddress,
      FIAT_TOKEN_ABI,
      receiverSigner
    );
  }

  /**
   * Create the EIP-712 domain separator
   */
  async getDomain() {
    const name = await this.contract.name();
    const network = await this.provider.getNetwork();

    return {
      name: name,
      version: "2",
      chainId: network.chainId,
      verifyingContract: this.contractAddress,
    };
  }

  /**
   * Execute receiveWithAuthorization
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

    // Verify 'to' address matches receiver
    const receiverAddress = await this.receiverSigner.getAddress();
    if (to.toLowerCase() !== receiverAddress.toLowerCase()) {
      throw new Error(
        `Authorization 'to' address ${to} does not match receiver ${receiverAddress}`
      );
    }

    console.log(`🔄 Executing receiveWithAuthorization:`);
    console.log(`  From: ${from}`);
    console.log(`  To: ${to}`);
    console.log(`  Value: ${ethers.formatUnits(value, 6)} USDC`);
    console.log(`  Valid After: ${new Date(Number(validAfter) * 1000)}`);
    console.log(`  Valid Before: ${new Date(Number(validBefore) * 1000)}`);
    console.log(`  Nonce: ${nonce}`);

    // Validation checks
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime < validAfter) {
      throw new Error("Authorization is not yet valid");
    }
    if (currentTime > validBefore) {
      throw new Error("Authorization has expired");
    }

    const isUsed = await this.contract.authorizationState(from, nonce);
    if (isUsed) {
      throw new Error("Authorization has already been used");
    }

    // Execute transaction
    const tx = await this.contract.receiveWithAuthorization(
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
 * Create payment authorization (done by payer)
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
  const network = await payerSigner.provider.getNetwork();
  const payerAddress = await payerSigner.getAddress();

  // Domain
  const domain = {
    name: name,
    version: "2",
    chainId: network.chainId,
    verifyingContract: contractAddress,
  };

  // Message
  const nonce = ethers.randomBytes(32);
  const validAfter = 0;
  const validBefore = Math.floor(Date.now() / 1000) + 24 * 60 * 60;

  const message = {
    from: payerAddress,
    to: receiverAddress,
    value: ethers.parseUnits(amount.toString(), 6),
    validAfter: validAfter,
    validBefore: validBefore,
    nonce: nonce,
  };

  // Types
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

  // Sign
  const signature = await payerSigner.signTypedData(domain, types, message);

  return {
    ...message,
    signature,
  };
}

/**
 * Main example function
 */
async function runExample() {
  try {
    console.log("🚀 Starting USDC ReceiveWithAuthorization Example");
    console.log("================================================");

    // Setup
    const provider = new ethers.JsonRpcProvider(config.RPC_URL);
    const contractAddress = config.USDC_ADDRESSES[config.NETWORK];

    if (!contractAddress) {
      throw new Error(
        `No USDC address configured for network: ${config.NETWORK}`
      );
    }

    // Create wallets
    const payerWallet = new ethers.Wallet(
      config.WALLETS.PAYER_PRIVATE_KEY,
      provider
    );
    const receiverWallet = new ethers.Wallet(
      config.WALLETS.RECEIVER_PRIVATE_KEY,
      provider
    );

    // Create receiver instance
    const receiver = new FiatTokenReceiver(
      contractAddress,
      provider,
      receiverWallet
    );

    // Get addresses
    const payerAddress = await payerWallet.getAddress();
    const receiverAddress = await receiverWallet.getAddress();

    console.log(`\n📍 Configuration:`);
    console.log(`Network: ${config.NETWORK}`);
    console.log(`USDC Contract: ${contractAddress}`);
    console.log(`Payer: ${payerAddress}`);
    console.log(`Receiver: ${receiverAddress}`);

    // Check initial balances
    console.log(`\n💰 Initial Balances:`);
    console.log(`Payer: ${await receiver.getBalance(payerAddress)} USDC`);
    console.log(`Receiver: ${await receiver.getBalance(receiverAddress)} USDC`);

    // Step 1: Payer creates authorization
    console.log(`\n1️⃣ Creating payment authorization...`);
    const authorization = await createPaymentAuthorization(
      payerWallet,
      receiverAddress,
      100, // 100 USDC
      contractAddress
    );
    console.log(`✅ Authorization created`);

    // Step 2: Receiver executes
    console.log(`\n2️⃣ Executing receiveWithAuthorization...`);
    await receiver.receiveWithAuthorization(authorization);

    // Check final balances
    console.log(`\n💰 Final Balances:`);
    console.log(`Payer: ${await receiver.getBalance(payerAddress)} USDC`);
    console.log(`Receiver: ${await receiver.getBalance(receiverAddress)} USDC`);

    console.log(`\n🎉 Example completed successfully!`);
  } catch (error) {
    console.error(`\n❌ Error:`, error.message);

    if (error.message.includes("insufficient funds")) {
      console.log(
        `\n💡 Tip: Make sure the payer wallet has enough USDC and ETH for gas`
      );
    }

    if (error.message.includes("network")) {
      console.log(`\n💡 Tip: Check your RPC_URL in config.js`);
    }
  }
}

// Export for use in other modules
module.exports = {
  FiatTokenReceiver,
  createPaymentAuthorization,
  runExample,
};

// Run if called directly
if (require.main === module) {
  runExample();
}
