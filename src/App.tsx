import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ethers } from 'ethers';
import { Html5Qrcode } from 'html5-qrcode';

declare global {
  interface Window {
    ethereum?: ethers.Eip1193Provider;
  }
}

type WalletType = 'generated' | 'imported' | 'metamask' | 'view';

type WalletRecord = {
  id: string;
  name: string;
  address: string;
  type: WalletType;
  signer?: ethers.Wallet;
};

const DEFAULT_RPC = 'http://127.0.0.1:8545';
const PRELOADED_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatEth(valueWei: bigint): string {
  return Number(ethers.formatEther(valueWei)).toFixed(4);
}

export function App() {
  const [rpcUrl, setRpcUrl] = useState(DEFAULT_RPC);
  const [wallets, setWallets] = useState<WalletRecord[]>([]);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [selectedWalletId, setSelectedWalletId] = useState<string>('');
  const [targetAddress, setTargetAddress] = useState('');
  const [amountEth, setAmountEth] = useState('0.01');
  const [privateKeyInput, setPrivateKeyInput] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [scanActive, setScanActive] = useState(false);
  const [status, setStatus] = useState('Ready. Start local testnet and add wallets.');
  const [statusKey, setStatusKey] = useState(0);
  const [flashedIds, setFlashedIds] = useState<Set<string>>(new Set());
  const [newWalletId, setNewWalletId] = useState<string | null>(null);
  const prevBalancesRef = useRef<Record<string, string>>({});
  const scannerRef = useRef<Html5Qrcode | null>(null);

  const provider = useMemo(() => new ethers.JsonRpcProvider(rpcUrl), [rpcUrl]);

  const updateStatus = useCallback((msg: string) => {
    setStatus(msg);
    setStatusKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const preloaded = new ethers.Wallet(PRELOADED_PRIVATE_KEY);
    setWallets([
      {
        id: crypto.randomUUID(),
        name: 'Preloaded Test Wallet (100 ETH)',
        address: preloaded.address,
        type: 'imported',
        signer: preloaded
      }
    ]);
  }, []);

  useEffect(() => {
    const loadBalances = async () => {
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
    };

    if (wallets.length > 0) {
      void loadBalances();
    }
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

  const addWallet = (wallet: WalletRecord) => {
    setNewWalletId(wallet.id);
    setWallets((current) => [wallet, ...current]);
    updateStatus(`Added ${wallet.type} wallet ${shortAddress(wallet.address)}.`);
    setTimeout(() => setNewWalletId(null), 700);
  };

  const onGenerateWallet = () => {
    const wallet = ethers.Wallet.createRandom();
    addWallet({
      id: crypto.randomUUID(),
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

    const browserProvider = new ethers.BrowserProvider(window.ethereum);
    await browserProvider.send('eth_requestAccounts', []);
    const signer = await browserProvider.getSigner();
    const address = await signer.getAddress();

    addWallet({
      id: crypto.randomUUID(),
      name: `MetaMask ${shortAddress(address)}`,
      address,
      type: 'metamask'
    });
  };

  const importPrivateKey = (privateKeyRaw: string) => {
    const privateKey = privateKeyRaw.trim();
    if (!privateKey) return;

    try {
      const wallet = new ethers.Wallet(privateKey);
      addWallet({
        id: crypto.randomUUID(),
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
        id: crypto.randomUUID(),
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
    for (const wallet of wallets) {
      try {
        const b = await provider.getBalance(wallet.address);
        setBalances((current) => ({ ...current, [wallet.id]: formatEth(b) }));
      } catch {
        setBalances((current) => ({ ...current, [wallet.id]: 'RPC unavailable' }));
      }
    }
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

    const to = ethers.getAddress(targetAddress.trim());
    const value = ethers.parseEther(amountEth || '0');

    if (wallet.type === 'metamask') {
      if (!window.ethereum) {
        updateStatus('MetaMask missing.');
        return;
      }
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();
      const tx = await signer.sendTransaction({ to, value });
      await tx.wait();
      updateStatus(`MetaMask transfer sent: ${tx.hash}`);
    } else if (wallet.signer) {
      const signer = wallet.signer.connect(provider);
      const tx = await signer.sendTransaction({ to, value });
      await tx.wait();
      updateStatus(`Transfer sent: ${tx.hash}`);
    }

    await refreshBalances();
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
      void scanner.clear().catch(() => undefined);
    };
  }, [scanActive]);

  return (
    <main className="mx-auto max-w-5xl p-6 text-slate-800">
      <header className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-semibold">Wallet Aggregator POC</h1>
        <p className="text-sm text-slate-600">
          Manage generated, imported, MetaMask, and view-only wallets in one place.
        </p>
      </header>

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium">RPC URL (local testnet)</label>
            <input
              className="w-full rounded border border-slate-300 px-3 py-2"
              value={rpcUrl}
              onChange={(event) => setRpcUrl(event.target.value)}
            />
          </div>
          <button
            className="rounded bg-sky-700 px-4 py-2 text-sm font-medium text-white hover:bg-sky-800"
            onClick={() => void refreshBalances()}
          >
            Refresh holdings
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Run <code>npm run testnet</code> to host a local chain at 127.0.0.1:8545.
        </p>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Add wallets</h2>
          <div className="flex flex-wrap gap-2">
            <button className="rounded bg-sky-700 px-3 py-2 text-sm text-white hover:bg-sky-800" onClick={onGenerateWallet}>
              Generate Ethereum wallet
            </button>
            <button className="rounded bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-700" onClick={() => void onConnectMetamask()}>
              Connect MetaMask
            </button>
          </div>

          <div className="mt-4 space-y-2">
            <label className="block text-sm font-medium">Import private key</label>
            <input
              className="w-full rounded border border-slate-300 px-3 py-2"
              placeholder="0x..."
              value={privateKeyInput}
              onChange={(event) => setPrivateKeyInput(event.target.value)}
            />
            <div className="flex gap-2">
              <button
                className="rounded bg-sky-700 px-3 py-2 text-sm text-white hover:bg-sky-800"
                onClick={() => importPrivateKey(privateKeyInput)}
              >
                Import key string
              </button>
              <button
                className="rounded bg-sky-600 px-3 py-2 text-sm text-white hover:bg-sky-700"
                onClick={() => setScanActive((current) => !current)}
              >
                {scanActive ? 'Stop QR scan' : 'Import key via QR'}
              </button>
            </div>
            {scanActive && <div id="qr-reader" className="max-w-sm overflow-hidden rounded border border-slate-200" />}
          </div>

          <div className="mt-4 space-y-2">
            <label className="block text-sm font-medium">Import view-only address</label>
            <input
              className="w-full rounded border border-slate-300 px-3 py-2"
              placeholder="0x..."
              value={addressInput}
              onChange={(event) => setAddressInput(event.target.value)}
            />
            <button
              className="rounded bg-sky-700 px-3 py-2 text-sm text-white hover:bg-sky-800"
              onClick={importViewOnlyAddress}
            >
              Import address
            </button>

          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Transfer ETH</h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Sender wallet</label>
              <select
                className="w-full rounded border border-slate-300 px-3 py-2"
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
                className="w-full rounded border border-slate-300 px-3 py-2"
                placeholder="0x..."
                value={targetAddress}
                onChange={(event) => setTargetAddress(event.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Amount (ETH)</label>
              <input
                className="w-full rounded border border-slate-300 px-3 py-2"
                value={amountEth}
                onChange={(event) => setAmountEth(event.target.value)}
              />
            </div>

            <button className="w-full rounded bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800" onClick={() => void transferEth()}>
              Send transfer
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Wallet holdings</h2>
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

      <p key={statusKey} className="mt-4 animate-fade-in rounded border border-sky-100 bg-sky-50 px-3 py-2 text-sm text-sky-900">{status}</p>
    </main>
  );
}
