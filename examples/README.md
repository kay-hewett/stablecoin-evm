# USDC Authorization Examples

This directory contains practical examples for using Circle's USDC gas
abstraction features: `receiveWithAuthorization` and
`transferWithAuthorization`.

## 🎯 Overview

These examples demonstrate how to implement USDC's EIP-3009 gas abstraction
patterns:

- **ReceiveWithAuthorization**: Pull payment pattern where recipients execute
  transfers
- **TransferWithAuthorization**: Gas station pattern where third parties can
  execute transfers

## 🚀 Key Features Demonstrated

✅ **EIP-712 Signature Creation**: Proper domain separation and message
signing  
✅ **Signature Validation**: Fixed ECRecover.recover() compatibility  
✅ **Authorization Patterns**: Both pull payments and gas station designs  
✅ **Off-chain Transmission**: JSON, QR codes, and URL formats  
✅ **Error Handling**: Comprehensive error diagnostics and debugging

## 📁 File Structure

### Core Examples

- **`send-authorization-example.js`** - Create and format authorization
  signatures for transmission
- **`correct-transfer-final.js`** - Working transferWithAuthorization with
  correct signature format
- **`working-receive-example.js`** - Working receiveWithAuthorization
  implementation

### Utilities

- **`config.example.js`** - Configuration template (copy to config.js)
- **`diagnose-contract.js`** - Contract diagnostic tool for debugging

### Legacy/Development Files

- **`TransferWithAuthorizationExample.js`** - Original comprehensive example
- **`ReceiveWithAuthorizationExample.js`** - Original comprehensive example

## ⚙️ Setup

### 1. Install Dependencies

```bash
yarn install
```

### 2. Create Configuration

```bash
cp examples/config.example.js examples/config.js
# Edit config.js with your settings
```

### 3. Get Testnet ETH

Get Sepolia testnet ETH for gas fees:

- **Alchemy Faucet**: https://sepoliafaucet.com/
- **Chainlink Faucet**: https://faucets.chain.link/sepolia

Fund these addresses:

- Recipient: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`
- Gas Station: `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`

## 🏃‍♂️ Running Examples

### Create Authorization Signatures

```bash
node examples/send-authorization-example.js
```

Creates authorization signatures in multiple formats (JSON, QR, URL) for
off-chain transmission.

### Execute Receive Authorization (Pull Payment)

```bash
node examples/working-receive-example.js
```

Demonstrates how recipients can execute transfers authorized by payers.

### Execute Transfer Authorization (Gas Station)

```bash
node examples/correct-transfer-final.js
```

Demonstrates how gas stations can execute transfers on behalf of users.

### Diagnose Contract Issues

```bash
node examples/diagnose-contract.js
```

Debug tool to inspect deployed USDC contract parameters and validate
configurations.

## 🔧 Key Technical Fixes

### Signature Validation Issue Resolution

The major breakthrough in these examples is solving the **"FiatTokenV2: invalid
signature"** error that occurs when using standard ethers.js signatures with
Circle's USDC contract.

**The Problem**: Circle's USDC contract uses `ECRecover.recover()` which expects
signatures in a specific 65-byte format: `[r(32)][s(32)][v(1)]`

**The Solution**: Convert ethers signatures to ECRecover format:

```javascript
function formatSignatureForECRecover(signature) {
  const cleanSig = signature.replace("0x", "");
  const r = cleanSig.substring(0, 64); // first 32 bytes
  const s = cleanSig.substring(64, 128); // next 32 bytes
  let v = parseInt(cleanSig.substring(128, 130), 16); // last byte

  if (v < 27) v += 27; // Normalize v to 27/28

  return "0x" + r + s + v.toString(16).padStart(2, "0");
}
```

## 📋 Configuration Options

### Network Configuration

- **RPC_URL**: Ethereum JSON-RPC endpoint
- **USDC_ADDRESSES**: Contract addresses for different networks
- **NETWORK**: Target network (sepolia, mainnet, etc.)

### Wallet Configuration

- **PAYER_PRIVATE_KEY**: Wallet that authorizes payments
- **RECEIVER_PRIVATE_KEY**: Wallet that receives payments
- **GAS_STATION_PRIVATE_KEY**: Wallet that pays gas fees

## 🎯 Use Cases

### Pull Payments (receiveWithAuthorization)

- Subscription services
- Invoice payments
- Merchant checkouts
- Bill payments

### Gas Station Pattern (transferWithAuthorization)

- Gasless transactions for users
- Corporate payment processing
- Automated payment systems
- Cross-chain bridges

## ⚠️ Security Notes

- Never use the example private keys in production
- Always validate authorization parameters before execution
- Check authorization state to prevent replay attacks
- Verify timing windows (validAfter/validBefore)

## 🎉 Success Metrics

These examples successfully demonstrate:

- ✅ EIP-712 signature creation and validation
- ✅ USDC contract interaction with proper signature formatting
- ✅ Off-chain authorization transmission in multiple formats
- ✅ On-chain execution of both authorization patterns
- ✅ Comprehensive error handling and debugging capabilities

## 🔗 Resources

- [EIP-3009: Transfer With Authorization](https://eips.ethereum.org/EIPS/eip-3009)
- [EIP-712: Typed Structured Data](https://eips.ethereum.org/EIPS/eip-712)
- [Circle USDC Documentation](https://www.circle.com/en/usdc)
- [Original Repository](https://github.com/circlefin/stablecoin-evm)

---

**Built with ❤️ for the Ethereum community**
