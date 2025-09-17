/**
 * Working Transfer Example - Fixed signature validation
 * This demonstrates how to properly execute transferWithAuthorization
 */

const { ethers } = require("ethers");

// Load configuration
const config = require("./config.js");

// Enhanced USDC Contract ABI with more functions for debugging
const FIAT_TOKEN_ABI = [
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes memory signature) external",
  "function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes memory signature) external",
  "function name() view returns (string)",
  "function version() view returns (string)",
  "function balanceOf(address account) view returns (uint256)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
  "function decimals() view returns (uint8)",
];

class WorkingFiatTokenSender {
  constructor(contractAddress, provider, executorSigner) {
    this.contractAddress = contractAddress;
    this.provider = provider;
    this.executorSigner = executorSigner;
    this.contract = new ethers.Contract(
      contractAddress,
      FIAT_TOKEN_ABI,
      executorSigner
    );
  }

  /**
   * Get the current blockchain timestamp (more accurate than Date.now())
   */
  async getCurrentBlockTimestamp() {
    const block = await this.provider.getBlock("latest");
    return block.timestamp;
  }

  /**
   * Create a proper EIP-712 signature for transferWithAuthorization
   */
  async createTransferAuthSignature(
    holderSigner,
    recipientAddress,
    amount,
    validAfterSeconds = 0, // 0 = immediate
    validForHours = 24
  ) {
    // Get contract info
    const name = await this.contract.name();
    const version = await this.contract.version();
    const network = await this.provider.getNetwork();
    const holderAddress = await holderSigner.getAddress();

    console.log(`📋 Contract Info:`);
    console.log(`   Name: ${name}`);
    console.log(`   Version: ${version}`);
    console.log(`   Chain ID: ${network.chainId}`);

    // Get current blockchain time for accurate timing
    const currentBlockTime = await this.getCurrentBlockTimestamp();
    // Subtract 60 seconds buffer to ensure the authorization is definitely valid
    const validAfter = Math.max(0, currentBlockTime - 60 + validAfterSeconds);
    const validBefore = validAfter + validForHours * 3600;

    console.log(`⏰ Timing:`);
    console.log(
      `   Current Block Time: ${currentBlockTime} (${new Date(
        currentBlockTime * 1000
      ).toLocaleString()})`
    );
    console.log(
      `   Valid After: ${validAfter} (${new Date(
        validAfter * 1000
      ).toLocaleString()})`
    );
    console.log(
      `   Valid Before: ${validBefore} (${new Date(
        validBefore * 1000
      ).toLocaleString()})`
    );

    // EIP-712 Domain
    const domain = {
      name: name,
      version: version,
      chainId: network.chainId,
      verifyingContract: this.contractAddress,
    };

    // Generate unique nonce
    const nonce = ethers.randomBytes(32);

    // EIP-712 Message
    const message = {
      from: holderAddress,
      to: recipientAddress,
      value: ethers.parseUnits(amount.toString(), 6),
      validAfter: validAfter,
      validBefore: validBefore,
      nonce: nonce,
    };

    // EIP-712 Types
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

    console.log(`🔏 Signing with holder: ${holderAddress}`);

    // Sign the message
    const signature = await holderSigner.signTypedData(domain, types, message);

    return {
      from: holderAddress,
      to: recipientAddress,
      value: message.value,
      validAfter: validAfter,
      validBefore: validBefore,
      nonce: nonce,
      signature: signature,
    };
  }

  /**
   * Execute transferWithAuthorization
   */
  async executeTransferWithAuth(authorization) {
    const {
      from,
      to,
      value,
      validAfter,
      validBefore,
      nonce,
      signature,
    } = authorization;

    console.log(`\n🚀 Executing transferWithAuthorization:`);
    console.log(`   From: ${from}`);
    console.log(`   To: ${to}`);
    console.log(`   Value: ${ethers.formatUnits(value, 6)} USDC`);
    console.log(`   Executor: ${await this.executorSigner.getAddress()}`);

    // Pre-flight checks (with buffer for timing)
    const currentBlockTime = await this.getCurrentBlockTimestamp();
    if (currentBlockTime < validAfter - 60) {
      // Only fail if we're more than 60 seconds before validAfter
      throw new Error(
        `Transfer not yet valid. Current: ${currentBlockTime}, Valid After: ${validAfter}`
      );
    }
    if (currentBlockTime > validBefore) {
      throw new Error(
        `Transfer expired. Current: ${currentBlockTime}, Valid Before: ${validBefore}`
      );
    }

    // Check if authorization already used
    const isUsed = await this.contract.authorizationState(from, nonce);
    if (isUsed) {
      throw new Error("Authorization has already been used");
    }

    // Check balance
    const balance = await this.contract.balanceOf(from);
    if (balance < value) {
      throw new Error(
        `Insufficient balance. Has: ${ethers.formatUnits(
          balance,
          6
        )} USDC, Needs: ${ethers.formatUnits(value, 6)} USDC`
      );
    }

    console.log(`✅ Pre-flight checks passed`);

    try {
      // Estimate gas first
      const gasEstimate = await this.contract.transferWithAuthorization.estimateGas(
        from,
        to,
        value,
        validAfter,
        validBefore,
        nonce,
        signature
      );

      console.log(`⛽ Estimated gas: ${gasEstimate.toString()}`);

      // Execute the transaction
      const tx = await this.contract.transferWithAuthorization(
        from,
        to,
        value,
        validAfter,
        validBefore,
        nonce,
        signature,
        {
          gasLimit: (gasEstimate * 120n) / 100n, // Add 20% buffer
        }
      );

      console.log(`📤 Transaction submitted: ${tx.hash}`);
      console.log(`⏳ Waiting for confirmation...`);

      const receipt = await tx.wait();
      console.log(`✅ Transaction confirmed in block: ${receipt.blockNumber}`);
      console.log(`⛽ Gas used: ${receipt.gasUsed.toString()}`);

      return receipt;
    } catch (error) {
      console.error(`❌ Transaction failed:`, error.message);

      if (error.message.includes("invalid signature")) {
        console.log(`\n🔍 Debugging signature issue:`);
        console.log(
          `   Domain Separator from contract:`,
          await this.contract.DOMAIN_SEPARATOR()
        );
        console.log(`   Signature length:`, signature.length);
        console.log(`   Signature:`, signature);
      }

      throw error;
    }
  }

  async getBalance(address) {
    const balance = await this.contract.balanceOf(address);
    return ethers.formatUnits(balance, 6);
  }
}

/**
 * Complete working example
 */
async function demonstrateWorkingTransfer() {
  try {
    console.log("🎯 Working Transfer Example");
    console.log("===========================");

    // Setup
    const provider = new ethers.JsonRpcProvider(config.RPC_URL);
    const contractAddress = config.USDC_ADDRESSES[config.NETWORK];

    // Create wallets
    const tokenHolderWallet = new ethers.Wallet(
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

    const tokenSender = new WorkingFiatTokenSender(
      contractAddress,
      provider,
      executorWallet
    );

    // Get addresses
    const holderAddress = await tokenHolderWallet.getAddress();
    const recipientAddress = await recipientWallet.getAddress();
    const executorAddress = await executorWallet.getAddress();

    console.log(`\n📍 Participants:`);
    console.log(`   Token Holder: ${holderAddress}`);
    console.log(`   Recipient: ${recipientAddress}`);
    console.log(`   Executor (Gas Payer): ${executorAddress}`);
    console.log(`   Contract: ${contractAddress}`);

    // Check initial balances
    console.log(`\n💰 Initial Balances:`);
    const holderBalance = await tokenSender.getBalance(holderAddress);
    const recipientBalance = await tokenSender.getBalance(recipientAddress);
    console.log(`   Token Holder: ${holderBalance} USDC`);
    console.log(`   Recipient: ${recipientBalance} USDC`);

    if (parseFloat(holderBalance) < 1) {
      console.log(
        `\n⚠️  Warning: Token holder has insufficient USDC balance for transfer`
      );
      console.log(
        `   You may need to get some test USDC from a faucet or use different wallets`
      );
    }

    // Step 1: Token holder creates authorization signature
    console.log(`\n1️⃣ Creating transfer authorization signature...`);
    const authorization = await tokenSender.createTransferAuthSignature(
      tokenHolderWallet,
      recipientAddress,
      1, // Transfer 1 USDC
      0, // Valid immediately
      24 // Valid for 24 hours
    );

    console.log(`✅ Authorization created successfully`);

    // Step 2: Executor executes the transfer (pays gas)
    console.log(`\n2️⃣ Executing transfer (executor pays gas)...`);
    const receipt = await tokenSender.executeTransferWithAuth(authorization);

    // Check final balances
    console.log(`\n💰 Final Balances:`);
    const holderBalanceFinal = await tokenSender.getBalance(holderAddress);
    const recipientBalanceFinal = await tokenSender.getBalance(
      recipientAddress
    );
    console.log(`   Token Holder: ${holderBalanceFinal} USDC`);
    console.log(`   Recipient: ${recipientBalanceFinal} USDC`);

    console.log(`\n🎉 Transfer completed successfully!`);
    console.log(`   Transaction: ${receipt.transactionHash}`);
    console.log(`   Block: ${receipt.blockNumber}`);
  } catch (error) {
    console.error(`\n❌ Error:`, error.message);

    if (error.message.includes("insufficient funds")) {
      console.log(`\n💡 Tips:`);
      console.log(`   • Make sure the token holder has enough USDC balance`);
      console.log(`   • Make sure the executor has enough ETH for gas`);
      console.log(
        `   • Try using different test wallets or get test tokens from a faucet`
      );
    } else if (error.message.includes("invalid signature")) {
      console.log(`\n💡 Signature issue - this might be due to:`);
      console.log(`   • Contract version mismatch (v2 vs v2_2)`);
      console.log(`   • Wrong EIP-712 domain parameters`);
      console.log(`   • Network/chainId mismatch`);
    }
  }
}

// Export for use in other modules
module.exports = {
  WorkingFiatTokenSender,
  demonstrateWorkingTransfer,
};

// Run if called directly
if (require.main === module) {
  demonstrateWorkingTransfer();
}
