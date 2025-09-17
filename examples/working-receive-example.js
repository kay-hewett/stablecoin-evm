const { ethers } = require("ethers");
const { Web3 } = require("web3");
const config = require("./config");

// Initialize web3 for utils
const web3 = new Web3();

const FIAT_TOKEN_ABI = [
  "function receiveWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature) external",
  "function balanceOf(address account) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function nonces(address owner) view returns (uint256)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
];

const RECEIVE_WITH_AUTHORIZATION_TYPEHASH = web3.utils.keccak256(
  "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
);

// Convert ethers signature to the format ECRecover expects
function formatSignatureForECRecover(signature) {
  // Remove 0x and validate length
  const cleanSig = signature.replace("0x", "");
  if (cleanSig.length !== 130) {
    throw new Error(`Invalid signature length: ${cleanSig.length}`);
  }

  // Extract r, s, v from ethers signature
  const r = cleanSig.substring(0, 64); // first 32 bytes
  const s = cleanSig.substring(64, 128); // next 32 bytes
  let v = parseInt(cleanSig.substring(128, 130), 16); // last byte

  // Normalize v to 27/28 if needed
  if (v < 27) v += 27;

  // Pack as ECRecover expects: r + s + v (65 bytes total)
  const packed = r + s + v.toString(16).padStart(2, "0");
  return "0x" + packed;
}

class WorkingReceiveExample {
  constructor(contractAddress, provider, recipientSigner) {
    this.contractAddress = contractAddress;
    this.provider = provider;
    this.recipientSigner = recipientSigner;
    this.contract = new ethers.Contract(
      contractAddress,
      FIAT_TOKEN_ABI,
      recipientSigner
    );
  }

  async getDomainSeparator() {
    return await this.contract.DOMAIN_SEPARATOR();
  }

  async createReceiveAuthorization(
    from,
    to,
    amount,
    validAfter = 0,
    validBefore = null
  ) {
    if (!validBefore) {
      validBefore = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    }

    const nonce = ethers.randomBytes(32);
    const value = ethers.parseUnits(amount.toString(), 6);

    console.log(`📝 Creating receive authorization:`);
    console.log(`  From: ${from}`);
    console.log(`  To: ${to}`);
    console.log(`  Amount: ${amount} USDC`);
    console.log(`  Valid After: ${new Date(validAfter * 1000)}`);
    console.log(`  Valid Before: ${new Date(validBefore * 1000)}`);
    console.log(`  Nonce: ${ethers.hexlify(nonce)}`);

    // Get domain separator
    const domainSeparator = await this.getDomainSeparator();
    console.log(`  Domain Separator: ${domainSeparator}`);

    // Create the message hash
    const structHash = web3.utils.keccak256(
      web3.eth.abi.encodeParameters(
        [
          "bytes32",
          "address",
          "address",
          "uint256",
          "uint256",
          "uint256",
          "bytes32",
        ],
        [
          RECEIVE_WITH_AUTHORIZATION_TYPEHASH,
          from,
          to,
          value,
          validAfter,
          validBefore,
          nonce,
        ]
      )
    );

    const digest = web3.utils.keccak256(
      "0x1901" +
        domainSeparator.replace("0x", "") +
        structHash.replace("0x", "")
    );

    console.log(`  Struct Hash: ${structHash}`);
    console.log(`  Digest: ${digest}`);

    return {
      from,
      to,
      value,
      validAfter,
      validBefore,
      nonce,
      digest,
      domainSeparator,
      structHash,
    };
  }

  async signAuthorization(authorization, wallet) {
    console.log(`🔏 Signing authorization with wallet: ${wallet.address}`);

    // Use ethers to sign the digest
    const signature = await wallet.signMessage(
      ethers.getBytes(authorization.digest)
    );
    console.log(`  Raw ethers signature: ${signature}`);

    // Convert to ECRecover format
    const contractSignature = formatSignatureForECRecover(signature);
    console.log(`  ECRecover format: ${contractSignature}`);
    console.log(
      `  Length: ${contractSignature.length} chars (${
        (contractSignature.length - 2) / 2
      } bytes)`
    );

    return {
      ...authorization,
      signature: contractSignature,
    };
  }

  async executeReceive(authorization) {
    const {
      from,
      to,
      value,
      validAfter,
      validBefore,
      nonce,
      signature,
    } = authorization;

    console.log(`🚀 Executing receiveWithAuthorization...`);
    console.log(`  Recipient: ${this.recipientSigner.address}`);

    try {
      const tx = await this.contract.receiveWithAuthorization(
        from,
        to,
        value,
        validAfter,
        validBefore,
        nonce,
        signature,
        { gasLimit: 100000 }
      );

      console.log(`  Transaction hash: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(`✅ Receive successful!`);
      console.log(`  Block number: ${receipt.blockNumber}`);
      console.log(`  Gas used: ${receipt.gasUsed.toString()}`);

      return receipt;
    } catch (error) {
      console.log(`❌ Receive failed: ${error.message}`);
      throw error;
    }
  }

  async getBalance(address) {
    const balance = await this.contract.balanceOf(address);
    return ethers.formatUnits(balance, 6);
  }
}

async function main() {
  console.log("🚀 Testing WORKING Receive Authorization");
  console.log("========================================\\n");

  // Setup providers and wallets
  const provider = new ethers.JsonRpcProvider(config.RPC_URL);
  const tokenHolderWallet = new ethers.Wallet(
    config.WALLETS.PAYER_PRIVATE_KEY,
    provider
  );
  const recipientWallet = new ethers.Wallet(
    config.WALLETS.RECEIVER_PRIVATE_KEY,
    provider
  );

  console.log(`💼 Wallet addresses:`);
  console.log(`Token Holder: ${tokenHolderWallet.address}`);
  console.log(`Recipient: ${recipientWallet.address}\\n`);

  // Create receiver (recipient executes the transaction)
  const receiver = new WorkingReceiveExample(
    config.USDC_ADDRESSES[config.NETWORK],
    provider,
    recipientWallet
  );

  try {
    // Check initial balances
    const initialHolderBalance = await receiver.getBalance(
      tokenHolderWallet.address
    );
    const initialRecipientBalance = await receiver.getBalance(
      recipientWallet.address
    );

    console.log(`💰 Initial Balances:`);
    console.log(`Token Holder: ${initialHolderBalance} USDC`);
    console.log(`Recipient: ${initialRecipientBalance} USDC\\n`);

    // Create authorization
    console.log(`1️⃣ Creating receive authorization...`);
    const authorization = await receiver.createReceiveAuthorization(
      tokenHolderWallet.address, // from (token holder)
      recipientWallet.address, // to (recipient)
      3, // 3 USDC
      0, // valid immediately
      Math.floor(Date.now() / 1000) + 3600 // valid for 1 hour
    );

    // Sign with token holder's wallet (the one giving authorization)
    console.log(`\\n2️⃣ Signing authorization...`);
    const signedAuth = await receiver.signAuthorization(
      authorization,
      tokenHolderWallet
    );

    // Execute receive (recipient pulls the funds)
    console.log(`\\n3️⃣ Executing receive...`);
    await receiver.executeReceive(signedAuth);

    // Check final balances
    console.log(`\\n4️⃣ Checking final balances...`);
    const finalHolderBalance = await receiver.getBalance(
      tokenHolderWallet.address
    );
    const finalRecipientBalance = await receiver.getBalance(
      recipientWallet.address
    );

    console.log(`💰 Final Balances:`);
    console.log(
      `Token Holder: ${finalHolderBalance} USDC (${
        finalHolderBalance - initialHolderBalance > 0 ? "+" : ""
      }${finalHolderBalance - initialHolderBalance})`
    );
    console.log(
      `Recipient: ${finalRecipientBalance} USDC (+${
        finalRecipientBalance - initialRecipientBalance
      })`
    );

    console.log(`\\n🎉 Receive completed successfully!`);
  } catch (error) {
    console.error(`❌ Error:`, error.message);
    if (error.data) {
      console.error(`Data:`, error.data);
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { WorkingReceiveExample };
