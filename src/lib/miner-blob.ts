import { getStore } from "@netlify/blobs";
import { POOL_WALLET, TOKEN_ADDRESS } from "@/lib/miner-shared";

export type BlobMiner = {
  id: string;
  secret: string;
  x_handle: string;
  post_url: string;
  anchor_post: string;
  post_checked: boolean;
  balance: number;
  lifetime_mined: number;
  gpu: boolean;
  withdraw_address: string;
  electricity_until_ms: number | null;
  accrual_ms: number;
};

export type BlobChallenge = {
  id: string;
  code: string;
  used: boolean;
  createdAt: number;
};

export type BlobWithdrawal = {
  id: number;
  minerId: string;
  handle: string;
  address: string;
  amount: number;
  status: string;
  txHash: string | null;
  createdAt: string;
};

export type BlobDeposit = {
  txHash: string;
  minerId: string;
  from: string;
  amount: number;
};

export type BlobSettings = {
  token_address: string;
  pool_wallet: string;
  pool_balance: number;
  admin_pin: string;
};

type State = {
  settings: BlobSettings;
  miners: BlobMiner[];
  challenges: BlobChallenge[];
  withdrawals: BlobWithdrawal[];
  deposits: BlobDeposit[];
  nextWithdrawalId: number;
};

function emptyState(): State {
  return {
    settings: {
      token_address: TOKEN_ADDRESS,
      pool_wallet: POOL_WALLET,
      pool_balance: 0,
      admin_pin: "4663",
    },
    miners: [],
    challenges: [],
    withdrawals: [],
    deposits: [],
    nextWithdrawalId: 1,
  };
}

export function isNetlifyStore() {
  if (process.env.DATABASE_URL?.trim()) return false;
  return process.env.NETLIFY === "true" || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
}

function store() {
  return getStore({ name: "miner", consistency: "strong" });
}

async function load(): Promise<{ state: State; etag?: string }> {
  const current = await store().getWithMetadata("state", { type: "json" });
  if (!current?.data) return { state: emptyState() };
  const data = current.data as Partial<State>;
  const base = emptyState();
  return {
    etag: current.etag,
    state: {
      ...base,
      ...data,
      settings: { ...base.settings, ...data.settings },
      miners: data.miners ?? [],
      challenges: data.challenges ?? [],
      withdrawals: data.withdrawals ?? [],
      deposits: data.deposits ?? [],
      nextWithdrawalId: data.nextWithdrawalId ?? 1,
    },
  };
}

export async function changeState<T>(mutate: (state: State) => T): Promise<T> {
  let last = "Could not save the miner.";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { state, etag } = await load();
    const result = mutate(state);
    try {
      await store().setJSON("state", state, etag ? { onlyIfMatch: etag } : undefined);
      return result;
    } catch (error) {
      last = error instanceof Error ? error.message : last;
    }
  }
  throw new Error(last);
}

export async function readState() {
  return (await load()).state;
}
