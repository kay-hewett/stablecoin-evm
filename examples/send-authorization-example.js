/**
 * Example: How to CREATE and SEND authorization signatures
 * This shows how to generate authorization signatures that can be transmitted off-chain
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
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes memory signature) external",
  "function name() view returns (string)",
  "function balanceOf(address account) view returns (uint256)",
];

class AuthorizationSender {
  constructor(contractAddress, provider, signerWallet) {
    this.contractAddress = contractAddress;
    this.provider = provider;
    this.signerWallet = signerWallet;
    this.contract = new ethers.Contract(
      contractAddress,
      FIAT_TOKEN_ABI,
      signerWallet
    );
  }

  /**
   * Create a receiveWithAuthorization signature
   * This allows the RECIPIENT to execute the transfer (pull payment)
   */
  async createReceiveAuthorization(recipientAddress, amount, validHours = 24) {
    const name = await this.contract.name();
    const network = await this.provider.getNetwork();
    const signerAddress = await this.signerWallet.getAddress();

    // Domain
    const domain = {
      name: name,
      version: "2",
      chainId: network.chainId,
      verifyingContract: this.contractAddress,
    };

    // Message
    const nonce = ethers.randomBytes(32);
    const validAfter = Math.floor(Date.now() / 1000);
    const validBefore = validAfter + validHours * 60 * 60;

    const message = {
      from: signerAddress,
      to: recipientAddress,
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
    const signature = await this.signerWallet.signTypedData(
      domain,
      types,
      message
    );

    return {
      type: "receiveWithAuthorization",
      contractAddress: this.contractAddress,
      network: config.NETWORK,
      chainId: network.chainId.toString(),
      ...message,
      signature,
      validAfterDate: new Date(validAfter * 1000),
      validBeforeDate: new Date(validBefore * 1000),
    };
  }

  /**
   * Create a transferWithAuthorization signature
   * This allows ANYONE to execute the transfer (gas station pattern)
   */
  async createTransferAuthorization(recipientAddress, amount, validHours = 24) {
    const name = await this.contract.name();
    const network = await this.provider.getNetwork();
    const signerAddress = await this.signerWallet.getAddress();

    // Domain
    const domain = {
      name: name,
      version: "2",
      chainId: network.chainId,
      verifyingContract: this.contractAddress,
    };

    // Message
    const nonce = ethers.randomBytes(32);
    const validAfter = Math.floor(Date.now() / 1000);
    const validBefore = validAfter + validHours * 60 * 60;

    const message = {
      from: signerAddress,
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
    const signature = await this.signerWallet.signTypedData(
      domain,
      types,
      message
    );

    return {
      type: "transferWithAuthorization",
      contractAddress: this.contractAddress,
      network: config.NETWORK,
      chainId: network.chainId.toString(),
      ...message,
      signature,
      validAfterDate: new Date(validAfter * 1000),
      validBeforeDate: new Date(validBefore * 1000),
    };
  }

  async getBalance(address) {
    const balance = await this.contract.balanceOf(address);
    return ethers.formatUnits(balance, 6);
  }
}

/**
 * Example: Create authorizations and show how to send them
 */
async function demonstrateAuthorizationSending() {
  try {
    console.log("🚀 Creating USDC Authorization Signatures");
    console.log("=========================================");

    // Setup
    const provider = new ethers.JsonRpcProvider(config.RPC_URL);
    const contractAddress = config.USDC_ADDRESSES[config.NETWORK];

    if (!contractAddress) {
      throw new Error(
        `No USDC address configured for network: ${config.NETWORK}`
      );
    }

    // Create sender (the one who will authorize payments)
    const payerWallet = new ethers.Wallet(
      config.WALLETS.PAYER_PRIVATE_KEY,
      provider
    );
    const receiverWallet = new ethers.Wallet(
      config.WALLETS.RECEIVER_PRIVATE_KEY,
      provider
    );

    const authSender = new AuthorizationSender(
      contractAddress,
      provider,
      payerWallet
    );

    const payerAddress = await payerWallet.getAddress();
    const receiverAddress = await receiverWallet.getAddress();

    console.log(`\n📍 Configuration:`);
    console.log(`Network: ${config.NETWORK}`);
    console.log(`USDC Contract: ${contractAddress}`);
    console.log(`Payer (You): ${payerAddress}`);
    console.log(`Recipient: ${receiverAddress}`);

    // Check balance
    console.log(
      `\n💰 Payer Balance: ${await authSender.getBalance(payerAddress)} USDC`
    );

    // 1. CREATE RECEIVE AUTHORIZATION (Pull Payment)
    console.log(`\n1️⃣ Creating ReceiveWithAuthorization signature...`);
    const receiveAuth = await authSender.createReceiveAuthorization(
      receiverAddress,
      50 // 50 USDC
    );

    console.log(`✅ Receive Authorization Created:`);
    console.log(`   Type: ${receiveAuth.type}`);
    console.log(`   Amount: ${ethers.formatUnits(receiveAuth.value, 6)} USDC`);
    console.log(
      `   Valid until: ${receiveAuth.validBeforeDate.toLocaleString()}`
    );
    console.log(`   Nonce: ${receiveAuth.nonce}`);

    // 2. CREATE TRANSFER AUTHORIZATION (Gas Station Pattern)
    console.log(`\n2️⃣ Creating TransferWithAuthorization signature...`);
    const transferAuth = await authSender.createTransferAuthorization(
      receiverAddress,
      25 // 25 USDC
    );

    console.log(`✅ Transfer Authorization Created:`);
    console.log(`   Type: ${transferAuth.type}`);
    console.log(`   Amount: ${ethers.formatUnits(transferAuth.value, 6)} USDC`);
    console.log(
      `   Valid until: ${transferAuth.validBeforeDate.toLocaleString()}`
    );
    console.log(`   Nonce: ${transferAuth.nonce}`);

    // 3. SHOW HOW TO SEND/TRANSMIT AUTHORIZATIONS
    console.log(`\n📤 How to Send These Authorizations:`);
    console.log(`=====================================`);

    // JSON format for API transmission
    console.log(`\n🔗 JSON Format (for APIs):`);
    const jsonAuth = {
      ...receiveAuth,
      value: receiveAuth.value.toString(),
      validAfter: receiveAuth.validAfter.toString(),
      validBefore: receiveAuth.validBefore.toString(),
      chainId: receiveAuth.chainId.toString(),
    };
    console.log(JSON.stringify(jsonAuth, null, 2));

    // QR Code data (simplified)
    const qrData = {
      type: receiveAuth.type,
      contract: receiveAuth.contractAddress,
      from: receiveAuth.from,
      to: receiveAuth.to,
      value: receiveAuth.value.toString(),
      validAfter: receiveAuth.validAfter.toString(),
      validBefore: receiveAuth.validBefore.toString(),
      nonce: receiveAuth.nonce,
      signature: receiveAuth.signature,
    };

    console.log(`\n📱 QR Code Data (Base64):`);
    console.log(Buffer.from(JSON.stringify(qrData)).toString("base64"));

    // URL format for sharing
    const urlParams = new URLSearchParams({
      type: receiveAuth.type,
      contract: receiveAuth.contractAddress,
      from: receiveAuth.from,
      to: receiveAuth.to,
      value: receiveAuth.value.toString(),
      validBefore: receiveAuth.validBefore.toString(),
      nonce: receiveAuth.nonce,
      signature: receiveAuth.signature,
    });

    console.log(`\n🔗 URL Format for sharing:`);
    console.log(`https://your-app.com/claim?${urlParams.toString()}`);

    console.log(`\n✨ Next Steps:`);
    console.log(`• Send the JSON to recipient via API`);
    console.log(`• Generate QR code for mobile scanning`);
    console.log(`• Share URL for web-based claiming`);
    console.log(`• Store in database for later execution`);
  } catch (error) {
    console.error(`\n❌ Error:`, error.message);
  }
}

// Export for use in other modules
module.exports = {
  AuthorizationSender,
  demonstrateAuthorizationSending,
};

// Run if called directly
if (require.main === module) {
  demonstrateAuthorizationSending();
}
