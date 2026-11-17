import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";
import {
  BASE_RATE,
  CHAIN_ID,
  GPU_RATE,
  isAddress,
  isPostId,
  isTxHash,
  parsePostUrl,
  POOL_WALLET,
  RPC_URL,
  TICKER,
  TOKEN_ADDRESS,
  TRANSFER_TOPIC,
  type AdminView,
  type MinerView,
  type PublicConfig,
  type WithdrawalRow,
} from "@/lib/miner-shared";

type MinerRow = {
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

type SettingsRow = {
  token_address: string;
  pool_wallet: string;
  pool_balance: number;
  admin_pin: string;
};

function round6(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

function pinsMatch(input: string, stored: string) {
  const a = Buffer.from(input);
  const b = Buffer.from(stored);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function ensureInstalled() {
  const sql = await getSql();
  await sql`
    create table if not exists miner_deposits (
      tx_hash text primary key,
      miner_id text not null,
      from_address text not null,
      amount double precision not null,
      created_at timestamptz not null default now()
    )
  `;
  await sql`
    update miner_settings
    set token_address = case when btrim(token_address) = '' then ${TOKEN_ADDRESS} else token_address end,
        pool_wallet = case when btrim(pool_wallet) = '' then ${POOL_WALLET} else pool_wallet end,
        updated_at = now()
    where id = 1
      and (btrim(token_address) = '' or btrim(pool_wallet) = '')
  `;
}

async function settings() {
  await ensureInstalled();
  const sql = await getSql();
  const rows = await sql<SettingsRow>`
    select token_address, pool_wallet, pool_balance::float8 as pool_balance, admin_pin
    from miner_settings
    where id = 1
  `;
  if (!rows[0]) throw new Error("Miner settings are missing.");
  return rows[0];
}

async function requirePin(pin: string) {
  const row = await settings();
  if (!pinsMatch(pin.trim(), row.admin_pin)) {
    throw new Error("Wrong pool pin.");
  }
  return row;
}

async function readMiner(secret: string) {
  const sql = await getSql();
  const rows = await sql<MinerRow>`
    select
      id,
      secret,
      x_handle,
      post_url,
      anchor_post,
      post_checked,
      balance::float8 as balance,
      lifetime_mined::float8 as lifetime_mined,
      gpu,
      withdraw_address,
      (extract(epoch from electricity_until) * 1000)::float8 as electricity_until_ms,
      (extract(epoch from accrual_at) * 1000)::float8 as accrual_ms
    from miners
    where secret = ${secret}
  `;
  return rows[0] ?? null;
}

async function settle(row: MinerRow) {
  const now = Date.now();
  const anchor = row.accrual_ms || now;
  const until = row.electricity_until_ms;
  let earned = 0;
  if (until && until > anchor) {
    const end = Math.min(now, until);
    if (end > anchor) {
      const rate = row.gpu ? GPU_RATE : BASE_RATE;
      earned = (rate * (end - anchor)) / 86_400_000;
    }
  }
  const balance = round6(row.balance + earned);
  const lifetime = round6(row.lifetime_mined + earned);
  if (earned > 0 || now - anchor > 1000) {
    const sql = await getSql();
    await sql`
      update miners
      set balance = ${balance},
          lifetime_mined = ${lifetime},
          accrual_at = now()
      where id = ${row.id}
    `;
  }
  const capped = until && until > now + 86_400_000 ? now + 86_400_000 : until;
  if (capped && until && capped < until) {
    const sql = await getSql();
    await sql`
      update miners
      set electricity_until = to_timestamp(${capped} / 1000.0)
      where id = ${row.id}
    `;
  }
  return { ...row, balance, lifetime_mined: lifetime, accrual_ms: now, electricity_until_ms: capped };
}

async function withdrawalsFor(minerId: string) {
  const sql = await getSql();
  const rows = await sql<{
    id: number;
    x_handle: string;
    address: string;
    amount: number;
    status: string;
    tx_hash: string | null;
    created_at: string;
  }>`
    select id, x_handle, address, amount::float8 as amount, status, tx_hash, created_at::text as created_at
    from miner_withdrawals
    where miner_id = ${minerId}
    order by id desc
    limit 8
  `;
  return rows.map(mapWithdrawal);
}

function mapWithdrawal(row: {
  id: number;
  x_handle: string;
  address: string;
  amount: number;
  status: string;
  tx_hash: string | null;
  created_at: string;
}): WithdrawalRow {
  return {
    id: row.id,
    handle: row.x_handle,
    address: row.address,
    amount: row.amount,
    status: row.status,
    txHash: row.tx_hash,
    createdAt: row.created_at,
  };
}

async function present(secret: string): Promise<MinerView | null> {
  const found = await readMiner(secret);
  if (!found) return null;
  const row = await settle(found);
  const cfg = await settings();
  const now = Date.now();
  const powered = Boolean(row.electricity_until_ms && row.electricity_until_ms > now);
  return {
    handle: row.x_handle,
    postUrl: row.post_url,
    anchorPost: row.anchor_post,
    postChecked: row.post_checked,
    balance: row.balance,
    lifetime: row.lifetime_mined,
    electricityUntil: row.electricity_until_ms,
    gpu: row.gpu,
    powered,
    ratePerDay: powered ? (row.gpu ? GPU_RATE : BASE_RATE) : 0,
    withdrawAddress: row.withdraw_address,
    serverNow: now,
    poolBalance: cfg.pool_balance,
    tokenAddress: cfg.token_address,
    poolWallet: cfg.pool_wallet,
    withdrawals: await withdrawalsFor(row.id),
  };
}

async function readTweet(id: string) {
  const urls = [
    `https://api.fxtwitter.com/status/${id}`,
    `https://api.vxtwitter.com/Twitter/status/${id}`,
  ];
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(4500),
      });
      if (!response.ok) continue;
      const body = (await response.json()) as {
        tweet?: { text?: string };
        text?: string;
      };
      const text = body.tweet?.text || body.text;
      if (typeof text === "string" && text.trim()) return text.trim();
    } catch {
      // try the next public reader
    }
  }
  return null;
}

async function onChainBalance(token: string, wallet: string) {
  if (!isAddress(token) || !isAddress(wallet)) {
    return { balance: null as number | null, error: null as string | null };
  }
  const data = `0x70a08231${wallet.slice(2).toLowerCase().padStart(64, "0")}`;
  try {
    const response = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: token, data }, "latest"],
      }),
      signal: AbortSignal.timeout(8000),
    });
    const body = (await response.json()) as { result?: string; error?: { message?: string } };
    if (!body.result || body.result === "0x") {
      return { balance: null, error: body.error?.message || "No balance returned." };
    }
    const wei = BigInt(body.result);
    const whole = wei / 10n ** 18n;
    const frac = wei % 10n ** 18n;
    const balance = Number(whole) + Number(frac) / 1e18;
    return { balance, error: null };
  } catch (error) {
    return {
      balance: null,
      error: error instanceof Error ? error.message : "Chain read failed.",
    };
  }
}

function publicConfig(row: SettingsRow): PublicConfig {
  return {
    tokenAddress: row.token_address,
    poolWallet: row.pool_wallet,
    poolBalance: row.pool_balance,
    ticker: TICKER,
    chainId: CHAIN_ID,
  };
}

export const startChallenge = createServerFn({ method: "POST" }).handler(async () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(4);
  let code = "BID-";
  for (let i = 0; i < 4; i += 1) code += alphabet[bytes[i]! % alphabet.length];
  const id = randomUUID();
  const sql = await getSql();
  await sql`insert into miner_challenges (id, code) values (${id}, ${code})`;
  return { id, code };
});

export const verifyPost = createServerFn({ method: "POST" })
  .validator((input: { challengeId: string; postUrl: string }) => {
    const challengeId = input?.challengeId?.trim() ?? "";
    const postUrl = input?.postUrl?.trim() ?? "";
    if (!challengeId || !postUrl) throw new Error("Paste the link to your X post.");
    return { challengeId, postUrl };
  })
  .handler(async ({ data }) => {
    const parsed = parsePostUrl(data.postUrl);
    if (!parsed) {
      return { ok: false as const, error: "That is not an X post link. Copy the status URL from your post." };
    }
    const sql = await getSql();
    const challenges = await sql<{ id: string; code: string; used: boolean; age_hours: number }>`
      select id, code, used, (extract(epoch from (now() - created_at)) / 3600)::float8 as age_hours
      from miner_challenges
      where id = ${data.challengeId}
    `;
    const challenge = challenges[0];
    if (!challenge || challenge.used || challenge.age_hours > 12) {
      return { ok: false as const, error: "That code expired. Generate a new one and post it." };
    }
    const tweet = await readTweet(parsed.id);
    if (tweet && !tweet.toUpperCase().includes(challenge.code.toUpperCase())) {
      return {
        ok: false as const,
        error: `That post does not include ${challenge.code}. Post the code, then paste that exact link.`,
      };
    }
    const checked = Boolean(tweet);
    const anchor = tweet ? tweet.slice(0, 220) : "";
    const secret = randomBytes(24).toString("hex");
    const existing = await sql<{ id: string }>`
      select id from miners where lower(x_handle) = lower(${parsed.handle}) limit 1
    `;
    if (existing[0]) {
      await sql`
        update miners
        set secret = ${secret},
            post_url = ${data.postUrl},
            anchor_post = ${anchor},
            post_checked = ${checked},
            x_handle = ${parsed.handle}
        where id = ${existing[0].id}
      `;
    } else {
      await sql`
        insert into miners (id, secret, x_handle, post_url, anchor_post, post_checked)
        values (${randomUUID()}, ${secret}, ${parsed.handle}, ${data.postUrl}, ${anchor}, ${checked})
      `;
    }
    await sql`update miner_challenges set used = true where id = ${challenge.id}`;
    const view = await present(secret);
    return {
      ok: true as const,
      secret,
      checked,
      view,
    };
  });

export const getMiner = createServerFn({ method: "POST" })
  .validator((input: { secret: string }) => {
    const secret = input?.secret?.trim() ?? "";
    if (!secret) throw new Error("Missing session.");
    return { secret };
  })
  .handler(async ({ data }) => {
    const view = await present(data.secret);
    if (!view) return { ok: false as const, error: "Session ended. Link X again." };
    return { ok: true as const, view };
  });

async function activate(
  secret: string,
  postId: string,
  mode: "power" | "gpu",
): Promise<{ ok: true; view: MinerView } | { ok: false; error: string }> {
  if (!isPostId(postId)) return { ok: false, error: "Pick one of your posts first." };
  const found = await readMiner(secret);
  if (!found) return { ok: false, error: "Session ended. Link X again." };
  await settle(found);
  const sql = await getSql();
  if (mode === "power") {
    const fresh = await readMiner(secret);
    const now = Date.now();
    if ((fresh?.electricity_until_ms ?? 0) > now) {
      return { ok: false, error: "Electricity is still on. Buy again only after this 24 hours runs out." };
    }
    const next = now + 86_400_000;
    await sql`
      update miners
      set electricity_until = to_timestamp(${next} / 1000.0)
      where secret = ${secret}
    `;
  } else {
    await sql`update miners set gpu = true where secret = ${secret}`;
  }
  const view = await present(secret);
  if (!view) return { ok: false, error: "Session ended. Link X again." };
  return { ok: true, view };
}

export const buyElectricity = createServerFn({ method: "POST" })
  .validator((input: { secret: string; postId: string }) => input)
  .handler(async ({ data }) => activate(data.secret, data.postId, "power"));

export const buyGraphics = createServerFn({ method: "POST" })
  .validator((input: { secret: string; postId: string }) => input)
  .handler(async ({ data }) => activate(data.secret, data.postId, "gpu"));

export const withdrawCoins = createServerFn({ method: "POST" })
  .validator((input: { secret: string; address: string; amount: number }) => {
    const secret = input?.secret?.trim() ?? "";
    const address = input?.address?.trim() ?? "";
    const amount = round6(Number(input?.amount));
    if (!secret) throw new Error("Missing session.");
    return { secret, address, amount };
  })
  .handler(async ({ data }) => {
    if (!isAddress(data.address)) {
      return { ok: false as const, error: "Paste a real Robinhood Chain wallet address. It starts with 0x and is 42 characters." };
    }
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      return { ok: false as const, error: "Enter how many $MINERTEST coins to withdraw." };
    }
    const found = await readMiner(data.secret);
    if (!found) return { ok: false as const, error: "Session ended. Link X again." };
    const row = await settle(found);
    if (data.amount - row.balance > 0.000001) {
      return { ok: false as const, error: "That is more than you have mined." };
    }
    const sql = await getSql();
    const taken = await sql<{ id: string }>`
      update miners
      set balance = balance - ${data.amount},
          withdraw_address = ${data.address}
      where secret = ${data.secret} and balance + 0.000001 >= ${data.amount}
      returning id
    `;
    if (!taken[0]) return { ok: false as const, error: "Balance changed. Try that amount again." };
    const pooled = await sql<{ pool_balance: number }>`
      update miner_settings
      set pool_balance = pool_balance - ${data.amount}, updated_at = now()
      where id = 1 and pool_balance + 0.000001 >= ${data.amount}
      returning pool_balance::float8 as pool_balance
    `;
    if (!pooled[0]) {
      await sql`
        update miners set balance = balance + ${data.amount} where secret = ${data.secret}
      `;
      return {
        ok: false as const,
        error: "The $MINERTEST pool is short. Open the pool desk and add coins before this withdrawal can clear.",
      };
    }
    await sql`
      insert into miner_withdrawals (miner_id, x_handle, address, amount, status)
      values (${taken[0].id}, ${row.x_handle}, ${data.address}, ${data.amount}, 'queued')
    `;
    const view = await present(data.secret);
    return { ok: true as const, view };
  });

type Receipt = {
  status?: string;
  logs?: { address?: string; topics?: string[]; data?: string }[];
};

function fromWei(wei: bigint) {
  const whole = wei / 10n ** 18n;
  const frac = wei % 10n ** 18n;
  return round6(Number(whole) + Number(frac) / 1e18);
}

async function rpc<T>(method: string, params: unknown[]) {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(8000),
  });
  const body = (await response.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || "Chain read failed.");
  return body.result;
}

function depositFromReceipt(receipt: Receipt | null, token: string, pool: string) {
  if (!receipt || receipt.status !== "0x1") return null;
  let total = 0n;
  let from = "";
  for (const log of receipt.logs ?? []) {
    if ((log.address ?? "").toLowerCase() !== token.toLowerCase()) continue;
    const topics = log.topics ?? [];
    if ((topics[0] ?? "").toLowerCase() !== TRANSFER_TOPIC) continue;
    if (topics.length < 3 || !log.data || log.data === "0x") continue;
    const to = `0x${topics[2].slice(-40)}`.toLowerCase();
    if (to !== pool.toLowerCase()) continue;
    from = `0x${topics[1].slice(-40)}`.toLowerCase();
    total += BigInt(log.data);
  }
  if (total <= 0n || !from) return null;
  return { from, amount: fromWei(total) };
}

export const confirmDeposit = createServerFn({ method: "POST" })
  .validator((input: { secret: string; txHash: string }) => {
    const secret = input?.secret?.trim() ?? "";
    const txHash = (input?.txHash ?? "").trim();
    if (!secret) throw new Error("Missing session.");
    return { secret, txHash };
  })
  .handler(async ({ data }) => {
    if (!isTxHash(data.txHash)) {
      return { ok: false as const, error: "Paste the full transaction hash. It starts with 0x and is 66 characters." };
    }
    const found = await readMiner(data.secret);
    if (!found) return { ok: false as const, error: "Session ended. Link X again." };
    const cfg = await settings();
    if (!isAddress(cfg.token_address) || !isAddress(cfg.pool_wallet)) {
      return { ok: false as const, error: "The live coin is not installed yet." };
    }
    const hash = data.txHash.toLowerCase();
    const sql = await getSql();
    const prior = await sql<{ miner_id: string }>`
      select miner_id from miner_deposits where tx_hash = ${hash}
    `;
    if (prior[0]) {
      if (prior[0].miner_id !== found.id) {
        return { ok: false as const, error: "That transfer was already credited to another miner." };
      }
      const view = await present(data.secret);
      return { ok: true as const, view, already: true as const };
    }
    let receipt: Receipt | null;
    try {
      receipt = (await rpc<Receipt | null>("eth_getTransactionReceipt", [hash])) ?? null;
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Could not read that transaction.",
      };
    }
    if (!receipt) {
      return { ok: false as const, error: "That transaction is not confirmed yet. Wait a few seconds and try the same hash again." };
    }
    const parsed = depositFromReceipt(receipt, cfg.token_address, cfg.pool_wallet);
    if (!parsed || parsed.amount <= 0) {
      return {
        ok: false as const,
        error: `That transaction did not send $${TICKER} to the pool wallet.`,
      };
    }
    const inserted = await sql<{ tx_hash: string }>`
      insert into miner_deposits (tx_hash, miner_id, from_address, amount)
      values (${hash}, ${found.id}, ${parsed.from}, ${parsed.amount})
      on conflict (tx_hash) do nothing
      returning tx_hash
    `;
    if (!inserted[0]) {
      return { ok: false as const, error: "That transfer was already credited." };
    }
    await sql`
      update miners
      set balance = balance + ${parsed.amount}
      where id = ${found.id}
    `;
    await sql`
      update miner_settings
      set pool_balance = pool_balance + ${parsed.amount},
          updated_at = now()
      where id = 1
    `;
    const view = await present(data.secret);
    return { ok: true as const, view, amount: parsed.amount };
  });

async function buildAdmin(pin: string): Promise<{ ok: true; view: AdminView } | { ok: false; error: string }> {
  let cfg: SettingsRow;
  try {
    cfg = await requirePin(pin);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Wrong pool pin." };
  }
  const sql = await getSql();
  const withdrawals = await sql<{
    id: number;
    x_handle: string;
    address: string;
    amount: number;
    status: string;
    tx_hash: string | null;
    created_at: string;
  }>`
    select id, x_handle, address, amount::float8 as amount, status, tx_hash, created_at::text as created_at
    from miner_withdrawals
    order by id desc
    limit 20
  `;
  const counts = await sql<{ miners: number }>`select count(*)::float8 as miners from miners`;
  const chain = await onChainBalance(cfg.token_address, cfg.pool_wallet);
  return {
    ok: true,
    view: {
      ...publicConfig(cfg),
      withdrawals: withdrawals.map(mapWithdrawal),
      miners: counts[0]?.miners ?? 0,
      onChainBalance: chain.balance,
      onChainError: chain.error,
    },
  };
}

export const adminState = createServerFn({ method: "POST" })
  .validator((input: { pin: string }) => ({ pin: input?.pin ?? "" }))
  .handler(async ({ data }) => buildAdmin(data.pin));

export const adminAddPool = createServerFn({ method: "POST" })
  .validator((input: { pin: string; amount: number }) => ({
    pin: input?.pin ?? "",
    amount: round6(Number(input?.amount)),
  }))
  .handler(async ({ data }) => {
    try {
      await requirePin(data.pin);
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Wrong pool pin." };
    }
    if (!Number.isFinite(data.amount) || data.amount <= 0) {
      return { ok: false as const, error: "Enter a positive amount of $MINERTEST to add." };
    }
    const sql = await getSql();
    await sql`
      update miner_settings
      set pool_balance = pool_balance + ${data.amount}, updated_at = now()
      where id = 1
    `;
    return buildAdmin(data.pin);
  });

export const adminCreditPool = createServerFn({ method: "POST" })
  .validator((input: { pin: string; txHash: string }) => ({
    pin: input?.pin ?? "",
    txHash: (input?.txHash ?? "").trim(),
  }))
  .handler(async ({ data }) => {
    try {
      await requirePin(data.pin);
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Wrong pool pin." };
    }
    if (!isTxHash(data.txHash)) {
      return { ok: false as const, error: "Paste the full transaction hash. It starts with 0x and is 66 characters." };
    }
    const cfg = await settings();
    if (!isAddress(cfg.token_address) || !isAddress(cfg.pool_wallet)) {
      return { ok: false as const, error: "The live coin is not installed yet." };
    }
    const hash = data.txHash.toLowerCase();
    const sql = await getSql();
    const prior = await sql<{ tx_hash: string }>`select tx_hash from miner_deposits where tx_hash = ${hash}`;
    if (prior[0]) return { ok: false as const, error: "That transfer was already added to the pool." };
    let receipt: Receipt | null;
    try {
      receipt = (await rpc<Receipt | null>("eth_getTransactionReceipt", [hash])) ?? null;
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Could not read that transaction." };
    }
    if (!receipt) {
      return { ok: false as const, error: "That transaction is not confirmed yet. Wait a few seconds and try the same hash again." };
    }
    const parsed = depositFromReceipt(receipt, cfg.token_address, cfg.pool_wallet);
    if (!parsed || parsed.amount <= 0) {
      return { ok: false as const, error: `That transaction did not send $${TICKER} to the pool wallet.` };
    }
    const inserted = await sql<{ tx_hash: string }>`
      insert into miner_deposits (tx_hash, miner_id, from_address, amount)
      values (${hash}, ${"pool"}, ${parsed.from}, ${parsed.amount})
      on conflict (tx_hash) do nothing
      returning tx_hash
    `;
    if (!inserted[0]) return { ok: false as const, error: "That transfer was already added to the pool." };
    await sql`
      update miner_settings
      set pool_balance = pool_balance + ${parsed.amount}, updated_at = now()
      where id = 1
    `;
    return buildAdmin(data.pin);
  });

export const adminSaveCoin = createServerFn({ method: "POST" })
  .validator((input: { pin: string; tokenAddress: string; poolWallet: string; pinNext: string }) => ({
    pin: input?.pin ?? "",
    tokenAddress: (input?.tokenAddress ?? "").trim(),
    poolWallet: (input?.poolWallet ?? "").trim(),
    pinNext: (input?.pinNext ?? "").trim(),
  }))
  .handler(async ({ data }) => {
    try {
      await requirePin(data.pin);
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Wrong pool pin." };
    }
    if (data.tokenAddress && !isAddress(data.tokenAddress)) {
      return { ok: false as const, error: "Token contract must be a 0x address." };
    }
    if (data.poolWallet && !isAddress(data.poolWallet)) {
      return { ok: false as const, error: "Pool wallet must be a 0x address." };
    }
    if (data.pinNext && data.pinNext.length < 4) {
      return { ok: false as const, error: "New pin needs at least 4 characters." };
    }
    const sql = await getSql();
    await sql`
      update miner_settings
      set token_address = ${data.tokenAddress},
          pool_wallet = ${data.poolWallet},
          admin_pin = ${data.pinNext || data.pin},
          updated_at = now()
      where id = 1
    `;
    return buildAdmin(data.pinNext || data.pin);
  });

export const adminMarkSent = createServerFn({ method: "POST" })
  .validator((input: { pin: string; id: number; txHash: string }) => ({
    pin: input?.pin ?? "",
    id: Number(input?.id),
    txHash: (input?.txHash ?? "").trim(),
  }))
  .handler(async ({ data }) => {
    try {
      await requirePin(data.pin);
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : "Wrong pool pin." };
    }
    if (!Number.isFinite(data.id)) return { ok: false as const, error: "Missing withdrawal." };
    const sql = await getSql();
    await sql`
      update miner_withdrawals
      set status = 'sent', tx_hash = ${data.txHash || null}
      where id = ${data.id}
    `;
    return buildAdmin(data.pin);
  });
