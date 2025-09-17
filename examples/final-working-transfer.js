/**
 * FINAL WORKING Transfer Authorization Example
 * This fixes the signature validation by using the correct signature format
 */

const { ethers } = require("ethers");
const { Web3 } = require("web3");

// Load configuration
const config = require("./config.js");

// Initialize web3 instance
const web3 = new Web3();

// USDC Contract ABI
const FIAT_TOKEN_ABI = [
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes memory signature) external",
  "function name() view returns (string)",
  "function balanceOf(address account) view returns (uint256)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
];

// Type hash from the contract
const transferWithAuthorizationTypeHash = web3.utils.keccak256(
  "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
);

function strip0x(input) {
  return input.startsWith("0x") ? input.slice(2) : input;
}

/**
 * Create the correct signature format for ECRecover.recover()
 * The contract expects: [r (32 bytes)][s (32 bytes)][v (1 byte)] = 65 bytes total
 */
function formatSignatureForContract(signature) {
  // ethers signature format: 0x + r(64 chars) + s(64 chars) + v(2 chars)
  if (!signature.startsWith("0x") || signature.length !== 132) {
    throw new Error("Invalid ethers signature format");
  }

  const r = signature.slice(2, 66); // 64 chars = 32 bytes
  const s = signature.slice(66, 130); // 64 chars = 32 bytes
  const v = signature.slice(130, 132); // 2 chars = 1 byte

  // Convert v from hex to decimal and ensure it's 27 or 28
  const vValue = parseInt(v, 16);
  const normalizedV = vValue < 27 ? vValue + 27 : vValue;

  // Pack as: r + s + v (65 bytes total)
  const packedSignature =
    "0x" + r + s + normalizedV.toString(16).padStart(2, "0");

  console.log(`📝 Signature components:`);
  console.log(`  r: 0x${r}`);
  console.log(`  s: 0x${s}`);
  console.log(`  v: ${normalizedV} (hex: ${normalizedV.toString(16)})`);
  console.log(`  Packed (65 bytes): ${packedSignature}`);
  console.log(
    `  Length check: ${packedSignature.length === 132 ? "✅" : "❌"} (${
      packedSignature.length
    } chars)`
  );

  return packedSignature;
}

class FinalFiatTokenSender {
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

    // Check timing
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
 * Create transfer authorization with CORRECT signature format
 */
async function createFinalTransferAuthorization(
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

  console.log(`📝 Creating authorization:`);
  console.log(`  Contract: ${name} v2`);
  console.log(`  Chain ID: ${network.chainId}`);
  console.log(`  From: ${holderAddress}`);
  console.log(`  To: ${recipientAddress}`);
  console.log(`  Amount: ${amount} USDC`);

  // EIP-712 Domain
  const domain = {
    name: name,
    version: "2",
    chainId: network.chainId,
    verifyingContract: contractAddress,
  };

  // Message parameters
  const nonce = ethers.randomBytes(32);
  const validAfter = 0; // Immediately valid
  const validBefore = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // Valid for 24 hours
  const value = ethers.parseUnits(amount.toString(), 6);

  const message = {
    from: holderAddress,
    to: recipientAddress,
    value: value,
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

  console.log(`📝 Signing EIP-712 message...`);

  // Sign using ethers.js built-in EIP-712 signing
  const signature = await holderSigner.signTypedData(domain, types, message);
  console.log(`✅ Raw ethers signature: ${signature}`);

  // Format signature for the contract's ECRecover.recover() function
  const contractSignature = formatSignatureForContract(signature);

  return {
    from: holderAddress,
    to: recipientAddress,
    value: value,
    validAfter: validAfter,
    validBefore: validBefore,
    nonce: nonce,
    signature: contractSignature,
  };
}

/**
 * Test the final working transfer
 */
async function testFinalTransfer() {
  try {
    console.log("🚀 Testing FINAL Working Transfer Authorization");
    console.log("==============================================");

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

    const sender = new FinalFiatTokenSender(
      contractAddress,
      provider,
      gasStationWallet
    );

    const holderAddress = await tokenHolderWallet.getAddress();
    const recipientAddress = await recipientWallet.getAddress();
    const gasStationAddress = await gasStationWallet.getAddress();

    console.log(`\n💼 Wallet addresses:`);
    console.log(`Token Holder: ${holderAddress}`);
    console.log(`Recipient: ${recipientAddress}`);
    console.log(`Gas Station: ${gasStationAddress}`);

    // Check initial balances
    console.log(`\n💰 Initial Balances:`);
    console.log(`Token Holder: ${await sender.getBalance(holderAddress)} USDC`);
    console.log(`Recipient: ${await sender.getBalance(recipientAddress)} USDC`);

    // Create authorization with correct signature format
    console.log(`\n1️⃣ Creating transfer authorization...`);
    const authorization = await createFinalTransferAuthorization(
      tokenHolderWallet,
      recipientAddress,
      2, // 2 USDC (small test amount)
      contractAddress
    );

    // Execute the transfer
    console.log(`\n2️⃣ Gas station executing transfer...`);
    await sender.transferWithAuthorization(authorization);

    // Check final balances
    console.log(`\n💰 Final Balances:`);
    console.log(`Token Holder: ${await sender.getBalance(holderAddress)} USDC`);
    console.log(`Recipient: ${await sender.getBalance(recipientAddress)} USDC`);

    console.log(`\n🎉 SUCCESS! Transfer completed successfully!`);
    console.log(`\n✅ Summary:`);
    console.log(`• Network detection: WORKING ✅`);
    console.log(`• EIP-712 signing: WORKING ✅`);
    console.log(`• Signature format: FIXED ✅`);
    console.log(`• Contract execution: SUCCESS ✅`);
  } catch (error) {
    console.error(`\n❌ Error:`, error.message);

    if (error.message.includes("insufficient funds")) {
      console.log(`💡 Make sure wallets have enough USDC/ETH`);
    } else if (error.message.includes("invalid signature")) {
      console.log(`💡 Signature format still needs adjustment`);
    } else if (error.message.includes("authorization is used")) {
      console.log(
        `💡 Try again with a new nonce (expected for repeated tests)`
      );
    }
  }
}

// Export for use in other modules
module.exports = {
  FinalFiatTokenSender,
  createFinalTransferAuthorization,
  testFinalTransfer,
  formatSignatureForContract,
};

// Run if called directly
if (require.main === module) {
  testFinalTransfer();
}
