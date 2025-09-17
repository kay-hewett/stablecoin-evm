/**
 * Working Transfer Authorization Example using the EXACT same signing method as the tests
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
  "function TRANSFER_WITH_AUTHORIZATION_TYPEHASH() view returns (bytes32)",
];

// Type hash from the contract tests
const transferWithAuthorizationTypeHash = web3.utils.keccak256(
  "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
);

function strip0x(input) {
  return input.startsWith("0x") ? input.slice(2) : input;
}

function ecSign(digest, privateKey) {
  const signingKey = new ethers.SigningKey(privateKey);
  const signature = signingKey.sign(digest);
  return {
    v: signature.v,
    r: signature.r,
    s: signature.s,
  };
}

function packSignature(signature) {
  return (
    strip0x(signature.r) +
    strip0x(signature.s) +
    (signature.v - 27).toString(16).padStart(2, "0")
  );
}

/**
 * Sign using the EXACT same method as the tests
 */
function signEIP712(domainSeparator, typeHash, types, parameters, privateKey) {
  const digest = web3.utils.keccak256(
    "0x1901" +
      strip0x(domainSeparator) +
      strip0x(
        web3.utils.keccak256(
          web3.eth.abi.encodeParameters(
            ["bytes32", ...types],
            [typeHash, ...parameters]
          )
        )
      )
  );

  return ecSign(digest, privateKey);
}

/**
 * Create transfer authorization using test method
 */
function signTransferAuthorization(
  from,
  to,
  value,
  validAfter,
  validBefore,
  nonce,
  domainSeparator,
  privateKey
) {
  return signEIP712(
    domainSeparator,
    transferWithAuthorizationTypeHash,
    ["address", "address", "uint256", "uint256", "uint256", "bytes32"],
    [from, to, value, validAfter, validBefore, nonce],
    privateKey
  );
}

class WorkingFiatTokenSender {
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
 * Create transfer authorization using the EXACT test method
 */
async function createWorkingTransferAuthorization(
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
  const holderAddress = await holderSigner.getAddress();

  // Get the domain separator from the contract
  const domainSeparator = await contract.DOMAIN_SEPARATOR();

  // Generate parameters
  const nonce = ethers.randomBytes(32);
  const validAfter = 0; // Immediately valid
  const validBefore = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // Valid for 24 hours
  const value = ethers.parseUnits(amount.toString(), 6);

  console.log(`📝 Signing with domain separator: ${domainSeparator}`);
  console.log(`📝 Type hash: ${transferWithAuthorizationTypeHash}`);
  console.log(`📝 Parameters:`, {
    from: holderAddress,
    to: recipientAddress,
    value: value.toString(),
    validAfter,
    validBefore,
    nonce: ethers.hexlify(nonce),
  });

  // Sign using the exact test method
  const signature = signTransferAuthorization(
    holderAddress,
    recipientAddress,
    value.toString(),
    validAfter,
    validBefore,
    ethers.hexlify(nonce),
    domainSeparator,
    holderSigner.privateKey
  );

  // Pack the signature in bytes format
  const packedSignature = "0x" + packSignature(signature);

  return {
    from: holderAddress,
    to: recipientAddress,
    value: value,
    validAfter: validAfter,
    validBefore: validBefore,
    nonce: nonce,
    signature: packedSignature,
  };
}

/**
 * Test the working transfer
 */
async function testWorkingTransfer() {
  try {
    console.log("🚀 Testing WORKING Transfer Authorization");
    console.log("========================================");

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

    const sender = new WorkingFiatTokenSender(
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

    // Create authorization using the working method
    console.log(`\n1️⃣ Creating WORKING transfer authorization...`);
    const authorization = await createWorkingTransferAuthorization(
      tokenHolderWallet,
      recipientAddress,
      5, // 5 USDC (smaller amount to test)
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
      console.log(`💡 Still having signature issues - need to debug further`);
      console.log(
        `📊 Contract Type Hash: ${transferWithAuthorizationTypeHash}`
      );
    }
  }
}

// Export for use in other modules
module.exports = {
  WorkingFiatTokenSender,
  createWorkingTransferAuthorization,
  testWorkingTransfer,
  signTransferAuthorization,
  transferWithAuthorizationTypeHash,
};

// Run if called directly
if (require.main === module) {
  testWorkingTransfer();
}
