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

## Run

```bash
npm install
```

### Optional env for WalletConnect + Sepolia + bank wallet

Create a `.env.local` file:

```bash
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
VITE_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
VITE_BANK_PRIVATE_KEY=0xyour_bank_private_key
```

`VITE_WALLETCONNECT_PROJECT_ID` is required for WalletConnect.
Frontend env vars must use the `VITE_` prefix.
In `Hardhat` mode, the app forces the bank wallet to the funded local account #0.

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
- On `Hardhat`, the app starts with no client wallet; use **Add wallet** to create/import one.
- On `Sepolia`, you need faucet ETH for sender wallets.

## Bank wallet

On `Hardhat`, the app bank uses this funded local account:

- Address: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`
- Private key: `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

This account is internal bank liquidity and is not auto-added as a client wallet.
