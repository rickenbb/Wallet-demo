# Wallet Aggregator POC

Minimal single-page wallet aggregator implemented with **React + TypeScript (Vite)** and **Tailwind CSS**.

## Implemented product spec

- Generate Ethereum wallets directly in-app.
- Connect MetaMask and send transfers.
- Connect WalletConnect and send transfers.
- Import private keys by plain string.
- Import private keys via QR scan (camera, browser permissions required).
- Import view-only Ethereum addresses.
- Send ETH for all wallet types except view-only.
- View transparent ETH holdings for every wallet in one table.
- Switch network profile between **Hardhat local** and **Sepolia**.
- Includes a predefined wallet (Hardhat account #0) which starts funded on local testnet.

## Run

```bash
npm install
```

### Optional env for WalletConnect + Sepolia

Create a `.env.local` file:

```bash
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
VITE_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

`VITE_WALLETCONNECT_PROJECT_ID` is required for WalletConnect.

### Start local testnet (Hardhat mode)

```bash
npm run testnet
```

This starts a local JSON-RPC Ethereum node at `http://127.0.0.1:8545`.

### Start app

```bash
npm run dev
```

Open the URL shown by Vite (usually `http://localhost:5173`).

## Demo notes

- Use the bottom **Network profile** selector to choose `Hardhat` or `Sepolia`.
- On `Hardhat`, the predefined wallet is funded by default.
- On `Sepolia`, you need faucet ETH for sender wallets.

## Predefined funded wallet

The app preloads this wallet:

- Address: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- Private key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

On a standard Hardhat local node, this account is funded by default.
