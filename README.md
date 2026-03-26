# Wallet Aggregator POC

Minimal single-page wallet aggregator implemented with **React + TypeScript (Vite)** and **Tailwind CSS**.

## Implemented product spec

- Generate Ethereum wallets directly in-app.
- Connect MetaMask and send transfers.
- Import private keys by plain string.
- Import private keys via QR scan (camera, browser permissions required).
- Import view-only Ethereum addresses.
- Send ETH for all wallet types except view-only.
- View transparent ETH holdings for every wallet in one table.
- Connect to a local ETH testnet.
- Includes a predefined wallet (Hardhat account #0) which starts funded on local testnet.

## Run

```bash
npm install
```

### Start local testnet

```bash
npm run testnet
```

This starts a local JSON-RPC Ethereum node at `http://127.0.0.1:8545`.

### Start app

```bash
npm run dev
```

Open the URL shown by Vite (usually `http://localhost:5173`).

## Predefined funded wallet

The app preloads this wallet:

- Address: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- Private key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

On a standard Hardhat local node, this account is funded by default.
