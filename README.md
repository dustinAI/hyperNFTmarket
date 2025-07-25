# HYPERMarketNFT P2P

A decentralized peer-to-peer marketplace for NFT artists and collectors that runs completely on your local machine.

## 📖 Description

This DApp was originally intended to be a web application, but I realized during development that a centralized approach wouldn't work well for what I envisioned. Instead, it's now designed as a peer-to-peer marketplace that each user runs locally on their own machine via localhost: `http://127.0.0.1:PORT`

## ⚠️ Important

This project is not built on Pear, but it runs locally and privately on your machine — no servers or centralized backend. You control your own environment.

## 🛠️ How to Run It

### Prerequisites

Install Pear globally (if you haven't already):
```bash
npm install -g pear
```

### Installation

1. Clone this repo and navigate into it:
```bash
git clone https://github.com/dustinAI/hyperNFTmarket
cd hypernftMarket
```

2. Install dependencies:
```bash
npm install
```

3. Run the local server:
```bash
node server.js store1
```

4. Once started, the app will be available at `http://127.0.0.1:PORT` on your local machine.

## 🔐 Wallet & Seed Phrase Warning

The initial peer node (the one running `store1`) uses your seed from your HYPERTOKEN account.

**REMEMBER:** You must use the correct seed phrase linked to your HYPERTOKENS wallet.

This is where your TAP tokens will be sent from, and the wallet must match the sender address expected by the system.

### ✅ Important Verification

Please double-check your seed phrase and wallet address before sending any TAP tokens. Funds will only be credited if the wallet matches exactly.

## 🎯 Official HYPERMARKET Wallet

The official HYPERMARKET wallet is this. You need to send here and only here from HYPERTOKENS:

```
6346465811d55a117042949cf0ccb42a2c2d2d527fcd3f0914b5983fe79e146f
```

## 🎨 About the Project

I'm not a professional developer — I'm an NFT artist — but I built this with a lot of passion and effort so artists and collectors can have a decentralized way to connect and trade, peer-to-peer.

Even though it's not perfect or built with Pear natively, I hope you'll give it a try and see the vision behind it.

## 🤝 Contributions

If you have any questions or improvements, feel free to open an issue or pull request — your support means a lot.

Thanks for checking it out!

