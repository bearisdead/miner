import { CHAIN_ID_HEX, EXPLORER, RPC_URL, TICKER, toTokenWei } from "@/lib/miner-shared";

type Eth = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

export function getEthereum(): Eth | null {
  if (typeof window === "undefined") return null;
  return (window as Window & { ethereum?: Eth }).ethereum ?? null;
}

async function ensureRobinhood(eth: Eth) {
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 4902) throw error;
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: CHAIN_ID_HEX,
          chainName: "Robinhood Chain",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: [RPC_URL],
          blockExplorerUrls: [EXPLORER],
        },
      ],
    });
  }
}

async function requireAccount(eth: Eth) {
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const from = accounts[0];
  if (!from) throw new Error("No wallet account connected.");
  return from;
}

export async function connectAddress() {
  const eth = getEthereum();
  if (!eth) return null;
  await ensureRobinhood(eth);
  return requireAccount(eth);
}

function transferData(to: string, amount: number) {
  return `0xa9059cbb${to.slice(2).toLowerCase().padStart(64, "0")}${toTokenWei(amount).toString(16).padStart(64, "0")}`;
}

export async function sendMinerTest(token: string, to: string, amount: number) {
  const eth = getEthereum();
  if (!eth) {
    throw new Error("No wallet in this browser. Open the pool desk inside MetaMask or Rabby to send the real coins.");
  }
  await ensureRobinhood(eth);
  const from = await requireAccount(eth);
  const tx = (await eth.request({
    method: "eth_sendTransaction",
    params: [{ from, to: token, data: transferData(to, amount) }],
  })) as string;
  return tx;
}

export async function depositMinerTest(token: string, pool: string, amount: number) {
  const eth = getEthereum();
  if (!eth) {
    throw new Error("No wallet in this browser. Send the coins to the pool address, then paste the transaction hash.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Enter how many $${TICKER} to deposit.`);
  }
  await ensureRobinhood(eth);
  const from = await requireAccount(eth);
  const tx = (await eth.request({
    method: "eth_sendTransaction",
    params: [{ from, to: token, data: transferData(pool, amount) }],
  })) as string;
  return tx;
}

export async function addTokenToWallet(token: string) {
  const eth = getEthereum();
  if (!eth) {
    throw new Error("No wallet in this browser. Copy the contract and add the coin by hand.");
  }
  await ensureRobinhood(eth);
  await eth.request({
    method: "wallet_watchAsset",
    params: {
      type: "ERC20",
      options: { address: token, symbol: TICKER, decimals: 18 },
    },
  });
}

export async function readTokenBalance(token: string, wallet: string) {
  const eth = getEthereum();
  if (!eth || !token || !wallet) return null;
  const data = `0x70a08231${wallet.slice(2).toLowerCase().padStart(64, "0")}`;
  const result = (await eth.request({
    method: "eth_call",
    params: [{ to: token, data }, "latest"],
  })) as string;
  if (!result || result === "0x") return 0;
  const wei = BigInt(result);
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  return Number(whole) + Number(frac) / 1e18;
}
