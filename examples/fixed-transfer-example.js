/**
 * Fixed Transfer Authorization Example with correct EIP-712 parameters
 */

const { ethers } = require("ethers");

// Load configuration
const config = require("./config.js");

// USDC Contract ABI
const FIAT_TOKEN_ABI = [
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes memory signature) external",
  "function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes memory signature) external",
  "function name() view returns (string)",
  "function balanceOf(address account) view returns (uint256)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
];

class FixedFiatTokenSender {
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
    console.log(`  Signature: ${signature.substring(0, 10)}...`);

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
 * Create a transfer authorization with CORRECT EIP-712 formatting
 */
async function createFixedTransferAuthorization(
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

  // Get blockchain timestamp to avoid timing issues
  const latestBlock = await holderSigner.provider.getBlock("latest");
  const blockTimestamp = latestBlock.timestamp;

  // Domain - this matches exactly what the contract expects
  const domain = {
    name: name,
    version: "2",
    chainId: network.chainId,
    verifyingContract: contractAddress,
  };

  // Message
  const nonce = ethers.randomBytes(32);
  const validAfter = 0; // Immediately valid
  const validBefore = blockTimestamp + 24 * 60 * 60; // Valid for 24 hours

  const message = {
    from: holderAddress,
    to: recipientAddress,
    value: ethers.parseUnits(amount.toString(), 6),
    validAfter: validAfter,
    validBefore: validBefore,
    nonce: nonce,
  };

  // Types - this MUST match the exact string format that generates the type hash
  // From contract: keccak256("TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)")
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

  console.log(`📝 Signing with domain:`, {
    name: domain.name,
    version: domain.version,
    chainId: domain.chainId.toString(),
    verifyingContract: domain.verifyingContract,
  });
  console.log(`📝 Message:`, {
    ...message,
    value: message.value.toString(),
    nonce: ethers.hexlify(message.nonce),
  });

  // Sign
  const signature = await holderSigner.signTypedData(domain, types, message);

  return {
    ...message,
    signature,
  };
}

/**
 * Test the fixed transfer authorization
 */
async function testFixedTransfer() {
  try {
    console.log("🔧 Testing FIXED Transfer Authorization");
    console.log("======================================");

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

    const sender = new FixedFiatTokenSender(
      contractAddress,
      provider,
      gasStationWallet
    );

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

    // Create authorization with fixed EIP-712 parameters
    console.log(`\n1️⃣ Creating FIXED transfer authorization...`);
    const authorization = await createFixedTransferAuthorization(
      tokenHolderWallet,
      recipientAddress,
      10, // 10 USDC (smaller amount to test)
      contractAddress
    );
    console.log(
      `✅ Authorization created with signature: ${authorization.signature.substring(
        0,
        20
      )}...`
    );

    // Execute the transfer
    console.log(`\n2️⃣ Gas station executing transfer...`);
    await sender.transferWithAuthorization(authorization);

    // Check final balances
    console.log(`\n💰 Final Balances:`);
    console.log(`Token Holder: ${await sender.getBalance(holderAddress)} USDC`);
    console.log(`Recipient: ${await sender.getBalance(recipientAddress)} USDC`);

    console.log(`\n🎉 SUCCESS! Transfer completed successfully!`);
  } catch (error) {
    console.error(`\n❌ Error:`, error.message);

    if (error.message.includes("insufficient funds")) {
      console.log(
        `💡 Tip: Make sure the token holder has enough USDC and gas station has ETH`
      );
    } else if (error.message.includes("invalid signature")) {
      console.log(`💡 Tip: There might still be an EIP-712 formatting issue`);
    }
  }
}

// Export for use in other modules
module.exports = {
  FixedFiatTokenSender,
  createFixedTransferAuthorization,
  testFixedTransfer,
};

// Run if called directly
if (require.main === module) {
  testFixedTransfer();
}
