const { ethers } = require("ethers");
const { Web3 } = require("web3");
const config = require("./config");

// Initialize web3 for utils
const web3 = new Web3();

const FIAT_TOKEN_ABI = [
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, bytes signature) external",
  "function balanceOf(address account) view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function nonces(address owner) view returns (uint256)",
  "function authorizationState(address authorizer, bytes32 nonce) view returns (bool)",
  "function DOMAIN_SEPARATOR() view returns (bytes32)",
];

const TRANSFER_WITH_AUTHORIZATION_TYPEHASH = web3.utils.keccak256(
  "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
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

class CorrectTransferSender {
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

  async getDomainSeparator() {
    return await this.contract.DOMAIN_SEPARATOR();
  }

  async createTransferAuthorization(
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

    console.log(`📝 Creating transfer authorization:`);
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
          TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
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

  async executeTransfer(authorization) {
    const {
      from,
      to,
      value,
      validAfter,
      validBefore,
      nonce,
      signature,
    } = authorization;

    console.log(`🚀 Executing transferWithAuthorization...`);
    console.log(`  Gas Station: ${this.senderSigner.address}`);

    try {
      const tx = await this.contract.transferWithAuthorization(
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
      console.log(`✅ Transfer successful!`);
      console.log(`  Block number: ${receipt.blockNumber}`);
      console.log(`  Gas used: ${receipt.gasUsed.toString()}`);

      return receipt;
    } catch (error) {
      console.log(`❌ Transfer failed: ${error.message}`);
      throw error;
    }
  }

  async getBalance(address) {
    const balance = await this.contract.balanceOf(address);
    return ethers.formatUnits(balance, 6);
  }
}

async function main() {
  console.log("🚀 Testing CORRECT Transfer Authorization");
  console.log("==========================================\\n");

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
  const gasStationWallet = new ethers.Wallet(
    config.WALLETS.GAS_STATION_PRIVATE_KEY,
    provider
  );

  console.log(`💼 Wallet addresses:`);
  console.log(`Token Holder: ${tokenHolderWallet.address}`);
  console.log(`Recipient: ${recipientWallet.address}`);
  console.log(`Gas Station: ${gasStationWallet.address}\\n`);

  // Create transfer sender (gas station executes)
  const sender = new CorrectTransferSender(
    config.USDC_ADDRESSES[config.NETWORK],
    provider,
    gasStationWallet
  );

  try {
    // Check initial balances
    const initialHolderBalance = await sender.getBalance(
      tokenHolderWallet.address
    );
    const initialRecipientBalance = await sender.getBalance(
      recipientWallet.address
    );

    console.log(`💰 Initial Balances:`);
    console.log(`Token Holder: ${initialHolderBalance} USDC`);
    console.log(`Recipient: ${initialRecipientBalance} USDC\\n`);

    // Create authorization
    console.log(`1️⃣ Creating transfer authorization...`);
    const authorization = await sender.createTransferAuthorization(
      tokenHolderWallet.address,
      recipientWallet.address,
      2, // 2 USDC
      0, // valid immediately
      Math.floor(Date.now() / 1000) + 3600 // valid for 1 hour
    );

    // Sign with token holder's wallet
    console.log(`\\n2️⃣ Signing authorization...`);
    const signedAuth = await sender.signAuthorization(
      authorization,
      tokenHolderWallet
    );

    // Execute transfer (gas station pays gas)
    console.log(`\\n3️⃣ Executing transfer...`);
    await sender.executeTransfer(signedAuth);

    // Check final balances
    console.log(`\\n4️⃣ Checking final balances...`);
    const finalHolderBalance = await sender.getBalance(
      tokenHolderWallet.address
    );
    const finalRecipientBalance = await sender.getBalance(
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

    console.log(`\\n🎉 Transfer completed successfully!`);
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

module.exports = { CorrectTransferSender };
