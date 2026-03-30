import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { Html5Qrcode } from 'html5-qrcode';
import EthereumProvider from '@walletconnect/ethereum-provider';

declare global {
  interface Window {
    ethereum?: ethers.Eip1193Provider;
  }
}

type WalletType = 'generated' | 'imported' | 'metamask' | 'walletconnect' | 'view';
type NetworkPreset = 'hardhat' | 'sepolia';
type AddWalletMode = 'generate' | 'metamask' | 'walletconnect' | 'private-key' | 'view-only';

type WalletRecord = {
  id: string;
  name: string;
  address: string;
  type: WalletType;
  signer?: ethers.BaseWallet;
};

const HARDHAT_RPC = 'http://127.0.0.1:8545';
const SEPOLIA_RPC =
  (import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined) ?? 'https://ethereum-sepolia-rpc.publicnode.com';
const WALLETCONNECT_PROJECT_ID = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ?? '';
const PRELOADED_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const BANK_WALLET_PRIVATE_KEY =
  (import.meta.env.VITE_BANK_PRIVATE_KEY as string | undefined) ?? PRELOADED_PRIVATE_KEY;

const NETWORKS: Record<
  NetworkPreset,
  {
    chainId: number;
    label: string;
    defaultRpc: string;
  }
> = {
  hardhat: {
    chainId: 31337,
    label: 'Hardhat local',
    defaultRpc: HARDHAT_RPC
  },
  sepolia: {
    chainId: 11155111,
    label: 'Sepolia',
    defaultRpc: SEPOLIA_RPC
  }
};

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatEth(valueWei: bigint): string {
  return Number(ethers.formatEther(valueWei)).toFixed(4);
}

function usdToCents(usdAmount: number): number {
  return Math.round(usdAmount * 100);
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function toHexChainId(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

function normalizeChainId(chainId: unknown): string | undefined {
  if (typeof chainId === 'number') {
    return toHexChainId(chainId);
  }

  if (typeof chainId === 'string') {
    const normalized = chainId.trim().toLowerCase();
    if (normalized.startsWith('0x')) {
      return normalized;
    }
    const numeric = Number(normalized);
    if (!Number.isNaN(numeric) && Number.isFinite(numeric)) {
      return toHexChainId(numeric);
    }
  }

  return undefined;
}

export function App() {
  const [networkPreset, setNetworkPreset] = useState<NetworkPreset>('hardhat');
  const [rpcUrl, setRpcUrl] = useState(NETWORKS.hardhat.defaultRpc);
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [targetAddress, setTargetAddress] = useState('');
  const [amountEth, setAmountEth] = useState('0.01');
  const [sellAmountEth, setSellAmountEth] = useState('0.01');
  const [usdEthRate, setUsdEthRate] = useState(2000); // USD per ETH price for simulation
  const [usdBalance, setUsdBalance] = useState(() => {
    if (typeof window === 'undefined') {
      return 80000;
    }
    const saved = window.localStorage.getItem('walletDemoUsdBalance');
    const parsed = saved ? Number(saved) : NaN;
    return Number.isFinite(parsed) ? parsed : 80000;
  });
  const [privateKeyInput, setPrivateKeyInput] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('walletDemoUsdBalance', usdBalance.toString());
    }
  }, [usdBalance]);
  const [addressInput, setAddressInput] = useState('');
  const [addWalletOpen, setAddWalletOpen] = useState(false);
  const [addWalletMode, setAddWalletMode] = useState<AddWalletMode>('generate');
  const [scanActive, setScanActive] = useState(false);
  const [status, setStatus] = useState('Ready. Choose Hardhat or Sepolia and add wallets.');
  const [statusKey, setStatusKey] = useState(0);
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set());
  const [newWalletId, setNewWalletId] = useState<string | null>(null);
  const prevBalancesRef = useRef<Record<string, string>>({});
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const walletConnectProviderRef = useRef<EthereumProvider | null>(null);
  const walletConnectWalletIdRef = useRef<string | null>(null);

  const selectedNetwork = NETWORKS[networkPreset];
  const selectedChainIdHex = toHexChainId(selectedNetwork.chainId);
  const provider = useMemo(
    () => new ethers.JsonRpcProvider(rpcUrl, selectedNetwork.chainId, { staticNetwork: true }),
    [rpcUrl, selectedNetwork.chainId]
  );
  const effectiveBankPrivateKey = networkPreset === 'hardhat' ? PRELOADED_PRIVATE_KEY : BANK_WALLET_PRIVATE_KEY;
  const bankWallet = useMemo(() => new ethers.Wallet(effectiveBankPrivateKey, provider), [effectiveBankPrivateKey, provider]);
  const bankAddress = bankWallet.address;

  const updateStatus = useCallback((msg: string) => {
    setStatus(msg);
    setStatusKey((k) => k + 1);
  }, []);

  const waitForTx = useCallback(
    async (txHash: string, context: string) => {
      const receipt = await provider.waitForTransaction(txHash, 1, 45_000);
      if (!receipt) {
        throw new Error(`${context} confirmation timed out. Reconnect wallet and try again.`);
      }
    },
    [provider]
  );

  const addWallet = useCallback(
    (wallet: WalletRecord) => {
      setNewWalletId(wallet.id);
      setWallets((current) => [wallet, ...current]);
      updateStatus(`Added ${wallet.type} wallet ${shortAddress(wallet.address)}.`);
      setTimeout(() => setNewWalletId(null), 700);
    },
    [updateStatus]
  );

  const ensureExternalProviderChain = useCallback(
    async (externalProvider: ethers.Eip1193Provider) => {
      const activeChainIdRaw = await externalProvider.request({ method: 'eth_chainId' });
      const activeChainIdHex = normalizeChainId(activeChainIdRaw);

      if (activeChainIdHex === selectedChainIdHex.toLowerCase()) {
        return;
      }

      try {
        await externalProvider.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: selectedChainIdHex }]
        });
      } catch (switchError) {
        const code = (switchError as { code?: number }).code;
        if (code !== 4902) {
          throw switchError;
        }

        const chainParams: {
          chainId: string;
          chainName: string;
          nativeCurrency: { name: string; symbol: string; decimals: number };
          rpcUrls: string[];
          blockExplorerUrls?: string[];
        } = {
          chainId: selectedChainIdHex,
          chainName: selectedNetwork.label,
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
          rpcUrls: [rpcUrl]
        };

        if (networkPreset === 'sepolia') {
          chainParams.blockExplorerUrls = ['https://sepolia.etherscan.io'];
        }

        await externalProvider.request({
          method: 'wallet_addEthereumChain',
          params: [chainParams]
        });
      }
    },
    [networkPreset, rpcUrl, selectedChainIdHex, selectedNetwork.label]
  );

  useEffect(() => {
    return () => {
      provider.destroy();
    };
  }, [provider]);

  useEffect(() => {
    let cancelled = false;

    const loadBalances = async () => {
      try {
        await provider.getBlockNumber();
      } catch {
        if (!cancelled) {
          const unavailableEntries = wallets.map((wallet) => [wallet.id, 'RPC unavailable'] as const);
          setBalances(Object.fromEntries(unavailableEntries));
        }
        return;
      }

      const entries = await Promise.all(
        wallets.map(async (wallet) => {
          try {
            const balance = await provider.getBalance(wallet.address);
            return [wallet.id, formatEth(balance)] as const;
          } catch {
            return [wallet.id, 'RPC unavailable'] as const;
          }
        })
      );

      if (!cancelled) {
        setBalances(Object.fromEntries(entries));
      }
    };

    if (wallets.length > 0) {
      void loadBalances();
    }

    return () => {
      cancelled = true;
    };
  }, [wallets, provider]);

  useEffect(() => {
    const prev = prevBalancesRef.current;
    const changed = new Set<string>();
    for (const [id, val] of Object.entries(balances)) {
      if (prev[id] !== undefined && prev[id] !== val) {
        changed.add(id);
      }
    }
    prevBalancesRef.current = balances;
    if (changed.size > 0) {
      setFlashedIds(changed);
      const timer = setTimeout(() => setFlashedIds(new Set()), 3000);
      return () => clearTimeout(timer);
    }
  }, [balances]);

  useEffect(() => {
    if (selectedWalletId && !wallets.some((wallet) => wallet.id === selectedWalletId)) {
      setSelectedWalletId('');
    }
  }, [wallets, selectedWalletId]);

  useEffect(() => {
    if (scanActive && (!addWalletOpen || addWalletMode !== 'private-key')) {
      setScanActive(false);
    }
  }, [addWalletMode, addWalletOpen, scanActive]);

  useEffect(() => {
    return () => {
      void walletConnectProviderRef.current?.disconnect().catch(() => undefined);
    };
  }, []);

  const onGenerateWallet = () => {
    const wallet = ethers.Wallet.createRandom();
    addWallet({
      id: uuid(),
      name: `Generated ${shortAddress(wallet.address)}`,
      address: wallet.address,
      type: 'generated',
      signer: wallet
    });
  };

  const onConnectMetamask = async () => {
    if (!window.ethereum) {
      updateStatus('MetaMask not found in this browser.');
      return;
    }

    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      await browserProvider.send('eth_requestAccounts', []);
      const signer = await browserProvider.getSigner();
      const address = await signer.getAddress();

      addWallet({
        id: uuid(),
        name: `MetaMask ${shortAddress(address)}`,
        address,
        type: 'metamask'
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed.';
      updateStatus(`MetaMask connection failed: ${message}`);
    }
  };

  const onConnectWalletConnect = async () => {
    if (!WALLETCONNECT_PROJECT_ID) {
      updateStatus('Set VITE_WALLETCONNECT_PROJECT_ID to enable WalletConnect.');
      return;
    }

    try {
      if (walletConnectProviderRef.current) {
        await walletConnectProviderRef.current.disconnect().catch(() => undefined);
        walletConnectProviderRef.current = null;
      }

      const walletConnectProvider = await EthereumProvider.init({
        projectId: WALLETCONNECT_PROJECT_ID,
        logger: 'silent',
        disableProviderPing: true,
        chains: [selectedNetwork.chainId],
        optionalChains: [NETWORKS.hardhat.chainId, NETWORKS.sepolia.chainId],
        showQrModal: true,
        metadata: {
          name: 'Wallet Aggregator POC',
          description: 'Wallet aggregator demo with WalletConnect',
          url: window.location.origin,
          icons: [`${window.location.origin}/favicon.ico`]
        },
        rpcMap: {
          [NETWORKS.hardhat.chainId]: networkPreset === 'hardhat' ? rpcUrl : NETWORKS.hardhat.defaultRpc,
          [NETWORKS.sepolia.chainId]: networkPreset === 'sepolia' ? rpcUrl : NETWORKS.sepolia.defaultRpc
        }
      });

      walletConnectProvider.on('disconnect', () => {
        walletConnectWalletIdRef.current = null;
        walletConnectProviderRef.current = null;
        setWallets((current) => current.filter((wallet) => wallet.type !== 'walletconnect'));
        updateStatus('WalletConnect disconnected. Reconnect to continue.');
      });

      walletConnectProvider.on('session_delete', () => {
        walletConnectWalletIdRef.current = null;
        walletConnectProviderRef.current = null;
        setWallets((current) => current.filter((wallet) => wallet.type !== 'walletconnect'));
        updateStatus('WalletConnect session ended. Reconnect wallet.');
      });

      walletConnectProvider.on('accountsChanged', (accounts: string[]) => {
        if (!accounts[0] || !walletConnectWalletIdRef.current) {
          return;
        }

        const nextAddress = ethers.getAddress(accounts[0]);
        setWallets((current) =>
          current.map((wallet) =>
            wallet.id === walletConnectWalletIdRef.current
              ? {
                  ...wallet,
                  address: nextAddress,
                  name: `WalletConnect ${shortAddress(nextAddress)}`
                }
              : wallet
          )
        );
      });

      await walletConnectProvider.connect();

      const browserProvider = new ethers.BrowserProvider(
        walletConnectProvider as unknown as ethers.Eip1193Provider
      );
      const signer = await browserProvider.getSigner();
      const address = await signer.getAddress();
      const walletId = uuid();

      walletConnectProviderRef.current = walletConnectProvider;
      walletConnectWalletIdRef.current = walletId;

      setWallets((current) => [
        {
          id: walletId,
          name: `WalletConnect ${shortAddress(address)}`,
          address,
          type: 'walletconnect'
        },
        ...current.filter((wallet) => wallet.type !== 'walletconnect')
      ]);

      setSelectedWalletId(walletId);
      setNewWalletId(walletId);
      setTimeout(() => setNewWalletId(null), 700);
      updateStatus(`WalletConnect connected: ${shortAddress(address)}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection failed.';
      updateStatus(`WalletConnect connection failed: ${message}`);
    }
  };

  const disconnectWalletConnect = async () => {
    const currentProvider = walletConnectProviderRef.current;
    if (!currentProvider) {
      updateStatus('No active WalletConnect session.');
      return;
    }

    await currentProvider.disconnect().catch(() => undefined);
    walletConnectProviderRef.current = null;
    walletConnectWalletIdRef.current = null;
    setWallets((current) => current.filter((wallet) => wallet.type !== 'walletconnect'));
    updateStatus('WalletConnect disconnected.');
  };

  const importPrivateKey = (privateKeyRaw: string) => {
    const privateKey = privateKeyRaw.trim();
    if (!privateKey) return;

    try {
      const wallet = new ethers.Wallet(privateKey);
      addWallet({
        id: uuid(),
        name: `Imported ${shortAddress(wallet.address)}`,
        address: wallet.address,
        type: 'imported',
        signer: wallet
      });
      setPrivateKeyInput('');
    } catch {
      updateStatus('Invalid private key format.');
    }
  };

  const importViewOnlyAddress = () => {
    try {
      const normalized = ethers.getAddress(addressInput.trim());
      addWallet({
        id: uuid(),
        name: `View-only ${shortAddress(normalized)}`,
        address: normalized,
        type: 'view'
      });
      setAddressInput('');
    } catch {
      updateStatus('Invalid Ethereum address.');
    }
  };

  const refreshBalances = async () => {
    if (wallets.length === 0) {
      updateStatus('No wallets to refresh.');
      return;
    }

    try {
      await provider.getBlockNumber();
    } catch {
      const unavailableEntries = wallets.map((wallet) => [wallet.id, 'RPC unavailable'] as const);
      setBalances(Object.fromEntries(unavailableEntries));
      updateStatus(`RPC unavailable at ${rpcUrl}.`);
      return;
    }

    const entries = await Promise.all(
      wallets.map(async (wallet) => {
        try {
          const balance = await provider.getBalance(wallet.address);
          return [wallet.id, formatEth(balance)] as const;
        } catch {
          return [wallet.id, 'RPC unavailable'] as const;
        }
      })
    );

    setBalances(Object.fromEntries(entries));
    updateStatus('Balances refreshed.');
  };

  const transferEth = async () => {
    const wallet = wallets.find((entry) => entry.id === selectedWalletId);
    if (!wallet) {
      updateStatus('Select sender wallet first.');
      return;
    }
    if (wallet.type === 'view') {
      updateStatus('View-only wallet cannot transfer.');
      return;
    }

    try {
      const to = ethers.getAddress(targetAddress.trim());
      const value = ethers.parseEther(amountEth || '0');

      if (wallet.type === 'metamask') {
        if (!window.ethereum) {
          updateStatus('MetaMask missing.');
          return;
        }
        await ensureExternalProviderChain(window.ethereum);
        const browserProvider = new ethers.BrowserProvider(window.ethereum);
        const signer = await browserProvider.getSigner();
        const tx = await signer.sendTransaction({ to, value });
        await waitForTx(tx.hash, 'MetaMask transfer');
        updateStatus(`MetaMask transfer sent: ${tx.hash}`);
      } else if (wallet.type === 'walletconnect') {
        if (!walletConnectProviderRef.current) {
          updateStatus('WalletConnect session not active. Reconnect first.');
          return;
        }

        const externalProvider = walletConnectProviderRef.current as unknown as ethers.Eip1193Provider;
        await ensureExternalProviderChain(externalProvider);
        const browserProvider = new ethers.BrowserProvider(externalProvider);
        const signer = await browserProvider.getSigner();
        const tx = await signer.sendTransaction({ to, value });
        await waitForTx(tx.hash, 'WalletConnect transfer');
        updateStatus(`WalletConnect transfer sent: ${tx.hash}`);
      } else if (wallet.signer) {
        const signer = wallet.signer.connect(provider);
        const tx = await signer.sendTransaction({ to, value });
        await waitForTx(tx.hash, 'Transfer');
        updateStatus(`Transfer sent: ${tx.hash}`);
      }

      await refreshBalances();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected transfer error.';
      updateStatus(`Transfer failed: ${message}`);
    }
  };

  const executeSendEth = async (wallet: WalletRecord, to: string, amount: number) => {
    const value = ethers.parseEther(amount.toString());

    if (wallet.type === 'metamask') {
      if (!window.ethereum) {
        throw new Error('MetaMask missing.');
      }
      await ensureExternalProviderChain(window.ethereum);
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();
      const tx = await signer.sendTransaction({ to, value });
      await waitForTx(tx.hash, 'MetaMask sell');
      return tx.hash;
    }

    if (wallet.type === 'walletconnect') {
      if (!walletConnectProviderRef.current) {
        throw new Error('WalletConnect session not active. Reconnect first.');
      }
      const externalProvider = walletConnectProviderRef.current as unknown as ethers.Eip1193Provider;
      await ensureExternalProviderChain(externalProvider);
      const browserProvider = new ethers.BrowserProvider(externalProvider);
      const signer = await browserProvider.getSigner();
      const tx = await signer.sendTransaction({ to, value });
      await waitForTx(tx.hash, 'WalletConnect sell');
      return tx.hash;
    }

    if (wallet.signer) {
      const signer = wallet.signer.connect(provider);
      const tx = await signer.sendTransaction({ to, value });
      await waitForTx(tx.hash, 'Sell');
      return tx.hash;
    }

    throw new Error('Wallet type cannot send transactions.');
  };

  const sellEth = async () => {
    const wallet = wallets.find((entry) => entry.id === selectedWalletId);
    if (!wallet) {
      updateStatus('Select sender wallet first.');
      return;
    }
    if (wallet.type === 'view') {
      updateStatus('View-only wallet cannot sell ETH.');
      return;
    }

    const amount = Number(sellAmountEth);
    if (Number.isNaN(amount) || amount <= 0) {
      updateStatus('Enter a valid ETH sell amount.');
      return;
    }

    if (!Number.isFinite(usdEthRate) || usdEthRate <= 0) {
      updateStatus('Set a valid ETH/USD price greater than 0.');
      return;
    }

    const usdReceivedCents = usdToCents(amount * usdEthRate);
    if (usdReceivedCents <= 0) {
      updateStatus('Trade amount is too small to change USD balance at 2-decimal precision.');
      return;
    }

    const usdReceived = usdReceivedCents / 100;

    try {
      const txHash = await executeSendEth(wallet, bankAddress, amount);

      setUsdBalance((current) => {
        const next = Number((current + usdReceived).toFixed(2));
        return next;
      });
      await refreshBalances();

      updateStatus(`Sold ${amount.toFixed(4)} ETH for $${usdReceived.toFixed(2)} USD (tx ${txHash}).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected sell error.';
      updateStatus(`Sell failed: ${message}`);
    }
  };

  const buyEth = async () => {
    const wallet = wallets.find((entry) => entry.id === selectedWalletId);
    if (!wallet) {
      updateStatus('Select wallet first.');
      return;
    }
    if (wallet.type === 'view') {
      updateStatus('View-only wallet cannot buy ETH.');
      return;
    }

    const amount = Number(sellAmountEth);
    if (Number.isNaN(amount) || amount <= 0) {
      updateStatus('Enter a valid ETH buy amount.');
      return;
    }

    if (!Number.isFinite(usdEthRate) || usdEthRate <= 0) {
      updateStatus('Set a valid ETH/USD price greater than 0.');
      return;
    }

    const costUsdCents = usdToCents(amount * usdEthRate);
    if (costUsdCents <= 0) {
      updateStatus('Trade amount is too small to change USD balance at 2-decimal precision.');
      return;
    }

    if (usdToCents(usdBalance) < costUsdCents) {
      updateStatus('Not enough USD balance to buy this amount of ETH.');
      return;
    }

    const costUsd = costUsdCents / 100;

    try {
      const tx = await bankWallet.sendTransaction({
        to: wallet.address,
        value: ethers.parseEther(amount.toString())
      });
      await waitForTx(tx.hash, 'Buy');

      setUsdBalance((current) => {
        const next = Number((current - costUsd).toFixed(2));
        return next;
      });
      await refreshBalances();

      updateStatus(`Bought ${amount.toFixed(4)} ETH for $${costUsd.toFixed(2)} USD (tx ${tx.hash}).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected buy error.';
      updateStatus(`Buy failed: ${message}`);
    }
  };

  useEffect(() => {
    if (!scanActive) {
      void scannerRef.current?.stop().catch(() => undefined);
      return;
    }

    const scanner = new Html5Qrcode('qr-reader');
    scannerRef.current = scanner;

    void scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 220 },
        (decodedText) => {
          importPrivateKey(decodedText);
          setScanActive(false);
        },
        () => undefined
      )
      .catch(() => {
        updateStatus('Camera unavailable or permission denied for QR import.');
        setScanActive(false);
      });

    return () => {
      void scanner.stop().catch(() => undefined);
      scanner.clear();
    };
  }, [scanActive]);

  return (
    <main className="mx-auto max-w-5xl p-6 text-slate-800">
      <header className="mb-6 grid gap-4 lg:grid-cols-[1fr_340px] lg:items-start">
        <div>
          <h1 className="text-3xl font-bold">Wallet Aggregator POC</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage generated, imported, MetaMask, WalletConnect, and view-only wallets in one place.
          </p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Add wallet</h2>
            <button
              className="rounded-sm border border-sky-600 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50"
              onClick={() => setAddWalletOpen((current) => !current)}
            >
              {addWalletOpen ? 'Close' : 'Add wallet'}
            </button>
          </div>

          {addWalletOpen && (
            <div className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Method</label>
                <select
                  className="w-full rounded-sm border border-slate-300 bg-white px-3 py-2"
                  value={addWalletMode}
                  onChange={(event) => setAddWalletMode(event.target.value as AddWalletMode)}
                >
                  <option value="generate">Generate wallet</option>
                  <option value="metamask">Connect MetaMask</option>
                  <option value="walletconnect">Connect WalletConnect</option>
                  <option value="private-key">Import private key</option>
                  <option value="view-only">Import view-only address</option>
                </select>
              </div>

              {addWalletMode === 'generate' && (
                <button
                  className="rounded-sm border border-sky-600 px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-50"
                  onClick={onGenerateWallet}
                >
                  Generate Ethereum wallet
                </button>
              )}

              {addWalletMode === 'metamask' && (
                <button
                  className="rounded-sm border border-sky-600 px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-50"
                  onClick={() => void onConnectMetamask()}
                >
                  Connect MetaMask
                </button>
              )}

              {addWalletMode === 'walletconnect' && (
                <div className="space-y-2">
                  <button
                    className="rounded-sm border border-sky-600 px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                    onClick={() => void onConnectWalletConnect()}
                    disabled={!WALLETCONNECT_PROJECT_ID}
                  >
                    Connect WalletConnect
                  </button>
                  <button
                    className="rounded-sm border border-slate-500 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                    onClick={() => void disconnectWalletConnect()}
                  >
                    Disconnect WalletConnect
                  </button>
                  {!WALLETCONNECT_PROJECT_ID && (
                    <p className="text-xs text-amber-700">
                      Set <code>VITE_WALLETCONNECT_PROJECT_ID</code> in your env to enable WalletConnect.
                    </p>
                  )}
                </div>
              )}

              {addWalletMode === 'private-key' && (
                <div>
                  <p className="mb-2 text-xs text-slate-500">Paste or scan a hex private key to gain full signing control.</p>
                  <input
                    className="mb-2 w-full rounded-sm border border-slate-300 bg-white px-3 py-2"
                    placeholder="0x..."
                    value={privateKeyInput}
                    onChange={(event) => setPrivateKeyInput(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="rounded-sm border border-sky-600 px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-50"
                      onClick={() => importPrivateKey(privateKeyInput)}
                    >
                      Import key string
                    </button>
                    <button
                      className="rounded-sm border border-sky-600 px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-50"
                      onClick={() => setScanActive((current) => !current)}
                    >
                      {scanActive ? 'Stop QR scan' : 'Import key via QR'}
                    </button>
                  </div>
                  {scanActive && (
                    <div id="qr-reader" className="mt-2 max-w-sm overflow-hidden rounded-sm border border-slate-200 bg-white" />
                  )}
                </div>
              )}

              {addWalletMode === 'view-only' && (
                <div>
                  <p className="mb-2 text-xs text-slate-500">Track any address balance without needing its private key.</p>
                  <input
                    className="mb-2 w-full rounded-sm border border-slate-300 bg-white px-3 py-2"
                    placeholder="0x..."
                    value={addressInput}
                    onChange={(event) => setAddressInput(event.target.value)}
                  />
                  <button
                    className="rounded-sm border border-sky-600 px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-50"
                    onClick={importViewOnlyAddress}
                  >
                    Import address
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Transfer ETH</h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Sender wallet</label>
              <select
                className="w-full rounded-sm border border-slate-300 px-3 py-2"
                value={selectedWalletId}
                onChange={(event) => setSelectedWalletId(event.target.value)}
              >
                <option value="">Choose wallet</option>
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.name} ({wallet.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Recipient address</label>
              <input
                className="w-full rounded-sm border border-slate-300 px-3 py-2"
                placeholder="0x..."
                value={targetAddress}
                onChange={(event) => setTargetAddress(event.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Amount (ETH)</label>
              <input
                className="w-full rounded-sm border border-slate-300 px-3 py-2"
                value={amountEth}
                onChange={(event) => setAmountEth(event.target.value)}
              />
            </div>

            <button
              className="w-full rounded-sm bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"
              onClick={() => void transferEth()}
            >
              Send transfer
            </button>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Trade ETH ↔ USD</h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Trading wallet</label>
              <select
                className="w-full rounded-sm border border-slate-300 px-3 py-2"
                value={selectedWalletId}
                onChange={(event) => setSelectedWalletId(event.target.value)}
              >
                <option value="">Choose wallet</option>
                {wallets.map((wallet) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.name} ({wallet.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">ETH/USD price</label>
              <input
                className="w-full rounded-sm border border-slate-300 px-3 py-2"
                type="number"
                value={usdEthRate}
                min={0}
                onChange={(event) => setUsdEthRate(Number(event.target.value))}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Trade amount (ETH)</label>
              <input
                className="w-full rounded-sm border border-slate-300 px-3 py-2"
                value={sellAmountEth}
                onChange={(event) => setSellAmountEth(event.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <button
                className="w-full rounded-sm bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
                onClick={() => void sellEth()}
              >
                Sell ETH → USD
              </button>
              <button
                className="w-full rounded-sm bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-800"
                onClick={() => void buyEth()}
              >
                Buy ETH ← USD
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Accounts</h2>
          <span className="text-xs text-slate-500">Wallet + cash balances</span>
        </div>

        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">USD account</span>
            <span className="text-lg font-semibold">${usdBalance.toFixed(2)} USD</span>
          </div>
        </div>

        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Wallet holdings</h3>
          <span className="text-xs text-slate-500">Transparent ETH balance list</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2">Wallet</th>
                <th className="py-2">Address</th>
                <th className="py-2">Type</th>
                <th className="py-2">Balance (ETH)</th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((wallet) => (
                <tr
                  key={wallet.id}
                  className={`border-b border-slate-100 ${wallet.id === newWalletId ? 'animate-slide-in' : ''}`}
                >
                  <td className="py-2">{wallet.name}</td>
                  <td className="py-2 font-mono text-xs">{wallet.address}</td>
                  <td className="py-2 capitalize">{wallet.type}</td>
                  <td className={`py-2 ${flashedIds.has(wallet.id) ? 'animate-flash-balance' : ''}`}>
                    {balances[wallet.id] ?? '...'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6 rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[220px_1fr_auto] md:items-end">
          <div>
            <label className="mb-1 block text-sm font-medium">Network profile</label>
            <select
              className="w-full rounded-sm border border-slate-300 px-3 py-2"
              value={networkPreset}
              onChange={(event) => {
                const next = event.target.value as NetworkPreset;
                setNetworkPreset(next);
                setRpcUrl(NETWORKS[next].defaultRpc);
                updateStatus(`Switched to ${NETWORKS[next].label} network profile.`);
              }}
            >
              <option value="hardhat">Hardhat (Local)</option>
              <option value="sepolia">Sepolia (Public testnet)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">RPC URL ({selectedNetwork.label})</label>
            <input
              className="w-full rounded-sm border border-slate-300 px-3 py-2"
              value={rpcUrl}
              onChange={(event) => setRpcUrl(event.target.value)}
            />
          </div>
          <button
            className="rounded-sm bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
            onClick={() => void refreshBalances()}
          >
            Refresh holdings
          </button>
        </div>
        {networkPreset === 'hardhat' ? (
          <p className="mt-1 text-xs text-slate-500">
            Run <code>npm run testnet</code> to host a local chain at 127.0.0.1:8545.
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            For Sepolia, fund sender wallets with faucet ETH and ensure your external wallet is on chain 11155111.
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">
          Bank ETH address: <span className="font-mono">{bankAddress}</span>
        </p>
      </section>

      <p
        key={statusKey}
        className="mt-4 animate-fade-in rounded-sm border border-sky-100 bg-sky-50 px-3 py-2 text-sm text-sky-900"
      >
        {status}
      </p>
    </main>
  );
}
