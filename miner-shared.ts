export const CHAIN_ID = 4663;
export const CHAIN_ID_HEX = "0x1237";
export const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
export const EXPLORER = "https://robinhoodchain.blockscout.com";
export const TICKER = "MINERTEST";
export const COIN_NAME = "Miner Test";
export const BASE_RATE = 40;
export const GPU_RATE = 80;
export const DAY_MS = 86_400_000;
export const SESSION_KEY = "bid-miner-secret";

/** Live Pons v2 launch on Robinhood Chain, 2026-11-16 20:02:05 UTC. */
export const TOKEN_ADDRESS = "0xD2b80F2a2c8aE73c10F4822AA2D955cBb6aB22d7";
/** Wallet that called launchToken. Deposits land here until the pool desk changes it. */
export const POOL_WALLET = "0x92C2f3324681BAb5edC77cedFF427ba818ec773D";
export const LAUNCH_TX = "0xe757e6b64906c47ac1308eae99a8d98808b4bb92532cefb688ba55d9f6242e5a";
export const PONS_URL = `https://ponsfamily.com/launchpad/${TOKEN_ADDRESS}`;
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export const POSTS = [
  { id: "p1", text: "mobile miner test" },
  { id: "p2", text: "mobile miner test · tower" },
  { id: "p3", text: "mobile miner test · electricity" },
  { id: "p4", text: "mobile miner test · graphics card" },
  { id: "p5", text: "mobile miner test · wallet" },
] as const;

export type PostId = (typeof POSTS)[number]["id"];

export function isPostId(id: string): id is PostId {
  return POSTS.some((post) => post.id === id);
}

export function tweetFor(code: string) {
  return `mobile miner test\n${code}`;
}

export function parsePostUrl(raw: string): { handle: string; id: string } | null {
  const match = raw
    .trim()
    .match(
      /https?:\/\/(?:www\.)?(?:x|twitter|mobile\.twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/i,
    );
  if (!match) return null;
  return { handle: match[1], id: match[2] };
}

export function isAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export function isTxHash(value: string) {
  return /^0x[a-fA-F0-9]{64}$/.test(value.trim());
}

export type WithdrawalRow = {
  id: number;
  handle: string;
  address: string;
  amount: number;
  status: string;
  txHash: string | null;
  createdAt: string;
};

export type MinerView = {
  handle: string;
  postUrl: string;
  anchorPost: string;
  postChecked: boolean;
  balance: number;
  lifetime: number;
  electricityUntil: number | null;
  gpu: boolean;
  powered: boolean;
  ratePerDay: number;
  withdrawAddress: string;
  serverNow: number;
  poolBalance: number;
  tokenAddress: string;
  poolWallet: string;
  withdrawals: WithdrawalRow[];
};

export type PublicConfig = {
  tokenAddress: string;
  poolWallet: string;
  poolBalance: number;
  ticker: string;
  chainId: number;
};

export type AdminView = PublicConfig & {
  withdrawals: WithdrawalRow[];
  miners: number;
  onChainBalance: number | null;
  onChainError: string | null;
};

export function formatCoins(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (value >= 1000) return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (value >= 1) return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function formatClock(ms: number) {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return [h, m, s].map((part) => String(part).padStart(2, "0")).join(":");
}

export function liveBalance(view: MinerView, now: number) {
  if (!view.powered || !view.electricityUntil || view.ratePerDay <= 0) return view.balance;
  const end = Math.min(now, view.electricityUntil);
  const elapsed = Math.max(0, end - view.serverNow);
  return view.balance + (view.ratePerDay * elapsed) / DAY_MS;
}

export function toTokenWei(amount: number) {
  const [whole, frac = ""] = amount.toFixed(6).split(".");
  const frac6 = `${frac}000000`.slice(0, 6);
  return BigInt(whole) * 10n ** 18n + BigInt(frac6) * 10n ** 12n;
}
