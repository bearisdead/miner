import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Cpu,
  LayoutDashboard,
  Wallet,
  Zap,
} from "lucide-react";
import { Wordmark } from "@/components/miner/logo";
import {
  buyElectricity,
  buyGraphics,
  confirmDeposit,
  getMiner,
  startChallenge,
  verifyPost,
  withdrawCoins,
} from "@/lib/miner-fns";
import { addTokenToWallet, connectAddress, depositMinerTest, readTokenBalance } from "@/lib/chain-client";
import {
  BASE_RATE,
  DAY_MS,
  EXPLORER,
  formatClock,
  formatCoins,
  GPU_RATE,
  liveBalance,
  PONS_URL,
  POSTS,
  SESSION_KEY,
  TICKER,
  TOKEN_ADDRESS,
  tweetFor,
  type MinerView,
} from "@/lib/miner-shared";

type Screen = "intro" | "start" | "link" | "hub" | "tower" | "lair" | "dash" | "wallet";

export function MinerApp() {
  const [screen, setScreen] = useState<Screen>("intro");
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<MinerView | null>(null);
  const [secret, setSecret] = useState("");
  const [tick, setTick] = useState(0);
  const anchor = useRef({ serverNow: 0, clientNow: 0 });

  function remember(next: MinerView | null, nextSecret?: string) {
    if (next) {
      anchor.current = { serverNow: next.serverNow, clientNow: Date.now() };
      setView(next);
    } else {
      setView(null);
    }
    if (nextSecret !== undefined) {
      setSecret(nextSecret);
      if (nextSecret) localStorage.setItem(SESSION_KEY, nextSecret);
      else localStorage.removeItem(SESSION_KEY);
    }
  }

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY) ?? "";
    if (!stored) {
      setReady(true);
      return;
    }
    getMiner({ data: { secret: stored } })
      .then((result) => {
        if (result.ok && result.view) remember(result.view, stored);
        else localStorage.removeItem(SESSION_KEY);
      })
      .catch(() => localStorage.removeItem(SESSION_KEY))
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!secret) return;
    const id = window.setInterval(() => {
      getMiner({ data: { secret } })
        .then((result) => {
          if (result.ok && result.view) remember(result.view);
        })
        .catch(() => undefined);
    }, 20000);
    return () => window.clearInterval(id);
  }, [secret]);

  const now = anchor.current.serverNow
    ? anchor.current.serverNow + (Date.now() - anchor.current.clientNow)
    : Date.now();
  void tick;

  function finishIntro() {
    sessionStorage.setItem("bid-intro", "1");
    setScreen(view ? "hub" : "start");
  }

  function unlink() {
    remember(null, "");
    setScreen("start");
  }

  if (!ready) {
    return (
      <main className="grid h-dvh place-items-center bg-bg">
        <p className="font-display text-2xl text-fg">MOBILE MINER</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-bg text-fg">
      {screen === "intro" ? (
        <Intro onDone={finishIntro} />
      ) : screen === "start" ? (
        <Start onNext={() => setScreen("link")} />
      ) : screen === "link" ? (
        <LinkX
          onBack={() => setScreen("start")}
          onLinked={(nextSecret, nextView) => {
            remember(nextView, nextSecret);
            setScreen("hub");
          }}
        />
      ) : view ? (
        <Authed
          screen={screen}
          view={view}
          now={now}
          setScreen={setScreen}
          onView={(next) => remember(next)}
          secret={secret}
          onUnlink={unlink}
        />
      ) : (
        <Start onNext={() => setScreen("link")} />
      )}
    </main>
  );
}

function Intro({ onDone }: { onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      const id = window.setTimeout(() => done.current(), 400);
      return () => window.clearTimeout(id);
    }
    const cap = window.setTimeout(() => done.current(), 8000);
    return () => window.clearTimeout(cap);
  }, []);

  return (
    <section className="relative h-full bg-bg">
      <img src="/splash-bg.png" alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-x-0 bottom-0 safe-bottom bg-gradient-to-t from-bg via-bg/80 to-transparent px-5 pt-16">
        <button type="button" onClick={onDone} className="glow-btn mt-2 h-14 w-full rounded-full bg-neon text-lg font-extrabold text-bg">
          GET STARTED
        </button>
      </div>
    </section>
  );
}

function Start({ onNext }: { onNext: () => void }) {
  return (
    <section className="relative h-full">
      <img src="/splash-bg.png" alt="" className="splash-photo absolute inset-0" />
      <div className="absolute inset-x-0 bottom-0 safe-bottom bg-gradient-to-t from-bg via-bg/92 to-transparent px-5 pt-20">
        <p className="mb-3 text-center text-sm font-semibold tracking-wide text-fg">THE CITY IS YOURS.</p>
        <button type="button" onClick={onNext} className="glow-btn h-14 w-full rounded-full bg-neon text-lg font-extrabold text-bg">
          GET STARTED
        </button>
        <p className="mt-3 text-center text-xs tracking-widest text-fg">BEARISDEAD.COM</p>
        <p className="mt-2 text-center">
          <Link to="/admin" className="text-xs font-semibold text-gold">
            Admin
          </Link>
        </p>
        <p className="mt-2 text-center">
          <a href="/restore.zip" download="BearIsDead-Miner-Restore.zip" className="text-xs font-semibold text-gold">
            Save restore zip
          </a>
        </p>
      </div>
    </section>
  );
}

function LinkX({
  onBack,
  onLinked,
}: {
  onBack: () => void;
  onLinked: (secret: string, view: MinerView) => void;
}) {
  const [challenge, setChallenge] = useState<{ id: string; code: string } | null>(null);
  const [postUrl, setPostUrl] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    startChallenge()
      .then(setChallenge)
      .catch(() => setError("Could not make a code. Try again."));
  }, []);

  const post = challenge ? tweetFor(challenge.code) : "";

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
    } catch {
      setCopied("");
      setError("Copy was blocked. Select the code and copy it yourself.");
    }
  }

  async function verify() {
    if (!challenge) return;
    setBusy(true);
    setError("");
    try {
      const result = await verifyPost({ data: { challengeId: challenge.id, postUrl } });
      if (!result.ok || !result.view) {
        setError(result.ok ? "Could not open that miner." : result.error);
        return;
      }
      onLinked(result.secret, result.view);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verify failed.");
    } finally {
      setBusy(false);
    }
  }

  async function pasteLink() {
    setError("");
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setError("Nothing on the clipboard.");
        return;
      }
      setPostUrl(text);
    } catch {
      setError("Paste was blocked. Use the Paste button again.");
    }
  }

  return (
    <section className="flex h-full flex-col">
      <ScreenHeader title="LINK X" onBack={onBack} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-28">
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="text-xs font-semibold tracking-widest text-neon">YOUR CODE</p>
          <p className="mt-2 whitespace-pre-wrap text-lg text-fg">{post || "····"}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!post}
              onClick={() => copy(post, "post")}
              className="flex h-12 items-center justify-center gap-2 rounded-full border border-neon text-sm font-bold text-neon"
            >
              <Copy className="size-4" />
              {copied === "post" ? "COPIED" : "COPY"}
            </button>
            <a
              href={challenge ? `https://x.com/intent/tweet?text=${encodeURIComponent(post)}` : undefined}
              target="_blank"
              rel="noreferrer"
              className={`flex h-12 items-center justify-center rounded-full bg-fg text-sm font-extrabold text-bg ${challenge ? "" : "pointer-events-none opacity-50"}`}
            >
              POST ON X
            </a>
          </div>
        </div>
        <div className="block">
          <span className="text-xs font-semibold tracking-widest text-muted">X POST LINK</span>
          <button
            type="button"
            onClick={pasteLink}
            className="mt-2 h-12 w-full rounded-full border border-neon text-sm font-extrabold text-neon"
          >
            PASTE
          </button>
          <textarea
            value={postUrl}
            onChange={(event) => setPostUrl(event.target.value)}
            onPaste={(event) => {
              const text = event.clipboardData.getData("text");
              if (!text) return;
              event.preventDefault();
              setPostUrl(text.trim());
            }}
            onFocus={(event) => {
              const node = event.currentTarget;
              window.setTimeout(() => node.scrollIntoView({ block: "center" }), 300);
            }}
            placeholder="https://x.com/you/status/…"
            rows={3}
            enterKeyHint="done"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="mt-2 w-full resize-none rounded-2xl border border-line bg-surface-2 px-4 py-3 text-base text-fg outline-none"
          />
        </div>
        {error ? <p className="text-sm text-gold">{error}</p> : null}
        <button
          type="button"
          disabled={busy || !challenge}
          onClick={verify}
          className="glow-btn h-14 w-full rounded-full bg-neon text-lg font-extrabold text-bg"
        >
          {busy ? "CHECKING…" : "VERIFY"}
        </button>
      </div>
    </section>
  );
}

function Authed({
  screen,
  view,
  now,
  setScreen,
  onView,
  secret,
  onUnlink,
}: {
  screen: Screen;
  view: MinerView;
  now: number;
  setScreen: (screen: Screen) => void;
  onView: (view: MinerView) => void;
  secret: string;
  onUnlink: () => void;
}) {
  const balance = liveBalance(view, now);
  const left = view.electricityUntil ? Math.max(0, view.electricityUntil - now) : 0;
  const nav = (
    <nav className="safe-bottom grid grid-cols-4 border-t border-line bg-bg px-1 pt-2">
      <NavButton label="Dash" active={screen === "dash"} onClick={() => setScreen("dash")} icon={<LayoutDashboard className="size-5" />} />
      <NavButton label="Tower" active={screen === "tower"} onClick={() => setScreen("tower")} icon={<Zap className="size-5" />} />
      <NavButton label="Lair" active={screen === "lair"} onClick={() => setScreen("lair")} icon={<Cpu className="size-5" />} />
      <NavButton label="Wallet" active={screen === "wallet"} onClick={() => setScreen("wallet")} icon={<Wallet className="size-5" />} />
    </nav>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {screen === "hub" ? <Hub view={view} balance={balance} onOpen={setScreen} /> : null}
        {screen === "tower" ? (
          <PowerShop
            title="ELECTRICITY"
            badge="24h"
            view={view}
            left={left}
            secret={secret}
            mode="power"
            action="TURN ON"
            note="Electricity lasts 24 hours and cannot stack. When the clock hits zero, pick a post and turn it on again. A normal miner digs 40 a day."
            onBack={() => setScreen("hub")}
            onDone={(next) => {
              onView(next);
              setScreen("dash");
            }}
          />
        ) : null}
        {screen === "lair" ? (
          <PowerShop
            title="HACKER'S LAIR"
            badge={view.gpu ? "2x" : "CARD"}
            view={view}
            left={left}
            secret={secret}
            mode="gpu"
            action={view.gpu ? "OPEN DASHBOARD" : "INSTALL CARD"}
            note="The graphics card stays installed and doubles the miner from 40 to 80 $MINERTEST every 24 hours. You still need electricity from the tower."
            onBack={() => setScreen("hub")}
            onDone={(next) => {
              onView(next);
              setScreen("dash");
            }}
          />
        ) : null}
        {screen === "dash" ? (
          <Dashboard view={view} balance={balance} left={left} onOpen={setScreen} />
        ) : null}
        {screen === "wallet" ? (
          <WalletScreen
            view={view}
            balance={balance}
            secret={secret}
            onBack={() => setScreen("hub")}
            onView={onView}
            onUnlink={onUnlink}
          />
        ) : null}
      </div>
      {screen === "hub" ? null : nav}
    </div>
  );
}

function Hub({
  view,
  balance,
  onOpen,
}: {
  view: MinerView;
  balance: number;
  onOpen: (screen: Screen) => void;
}) {
  return (
    <section className="px-4 pt-5 pb-8">
      <div className="flex items-center gap-3">
        <Wordmark compact />
      </div>
      <div className="mt-4 overflow-hidden rounded-card border border-line">
        <img src="/bull.jpg" alt="Bull miner" className="h-40 w-full object-cover object-top" />
      </div>
      <div className="mt-4 flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold tracking-widest text-neon">@{view.handle}</p>
          <p className="font-display text-4xl text-fg">{formatCoins(balance)}</p>
          <p className="text-xs text-muted">${TICKER} mined</p>
        </div>
      </div>
      {!view.postChecked ? (
        <p className="mt-3 text-sm text-gold">X did not hand us the post text. The link is saved. Mining still runs.</p>
      ) : null}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Choice title="Dashboard" body={view.powered ? "Miner is on" : "Miner is idle"} onClick={() => onOpen("dash")} icon={<LayoutDashboard className="size-5" />} />
        <Choice title="Tower" body="Buy 24h electricity" onClick={() => onOpen("tower")} icon={<Zap className="size-5 text-gold" />} />
        <Choice title="Hacker's Lair" body={view.gpu ? "Card installed" : "Double to 80"} onClick={() => onOpen("lair")} icon={<Cpu className="size-5 text-neon" />} />
        <Choice title="Wallet" body="Withdraw coins" onClick={() => onOpen("wallet")} icon={<Wallet className="size-5" />} />
      </div>
      <p className="mt-4 text-center text-xs tracking-widest text-muted">BEARISDEAD.COM</p>
    </section>
  );
}

function Choice({
  title,
  body,
  onClick,
  icon,
}: {
  title: string;
  body: string;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className="rounded-card border border-line bg-surface p-4 text-left">
      <span className="grid size-10 place-items-center rounded-xl bg-surface-2 text-neon">{icon}</span>
      <span className="mt-3 block font-bold text-fg">{title}</span>
      <span className="mt-1 block text-sm text-muted">{body}</span>
    </button>
  );
}

function PowerShop({
  title,
  badge,
  view,
  left,
  secret,
  mode,
  action,
  note,
  onBack,
  onDone,
}: {
  title: string;
  badge: string;
  view: MinerView;
  left: number;
  secret: string;
  mode: "power" | "gpu";
  action: string;
  note: string;
  onBack: () => void;
  onDone: (view: MinerView) => void;
}) {
  const [picked, setPicked] = useState("p1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const posts = POSTS.map((post, index) =>
    index === 0 && view.anchorPost ? { ...post, text: view.anchorPost } : post,
  );
  const fraction = mode === "power" ? Math.min(1, left / DAY_MS) : view.gpu ? 1 : 0;

  const locked = mode === "power" && left > 0;

  async function go() {
    if (locked) return;
    if (mode === "gpu" && view.gpu) {
      onDone(view);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "power"
          ? await buyElectricity({ data: { secret, postId: picked } })
          : await buyGraphics({ data: { secret, postId: picked } });
      if (!result.ok || !result.view) {
        setError(result.ok ? "Nothing changed." : result.error);
        return;
      }
      onDone(result.view);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the miner.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <ScreenHeader title={title} onBack={onBack} badge={badge} />
      <div className="space-y-4 px-4 pb-6">
        {mode === "power" ? (
          <div className="rounded-card border border-line bg-surface p-4">
            <div className="h-7 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-neon" style={{ width: `${Math.max(6, fraction * 100)}%` }} />
            </div>
            <p className="mt-2 text-center font-semibold text-neon">
              {left > 0 ? `${formatClock(left)} remaining` : "No electricity"}
            </p>
          </div>
        ) : (
          <div className="rounded-card border border-line bg-surface p-4 text-center">
            <p className="font-semibold text-neon">{view.gpu ? "Graphics card installed · 80 / day" : "No graphics card yet"}</p>
          </div>
        )}
        <div className="overflow-hidden rounded-card border border-line">
          <img
            src="/bull.jpg"
            alt=""
            className="h-36 w-full object-cover"
          />
        </div>
        <div className="flex items-center gap-2">
        <p className="text-sm font-bold text-fg">SELECT YOUR POST · @{view.handle}</p>
        </div>
        <div className="space-y-2">
          {posts.map((post) => {
            const selected = picked === post.id;
            return (
              <button
                key={post.id}
                type="button"
                onClick={() => setPicked(post.id)}
                className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left ${selected ? "border-neon bg-surface-2" : "border-line bg-surface"}`}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-neon font-extrabold text-bg">X</span>
                <span className="flex-1 text-sm text-fg">{post.text}</span>
                <span className={`grid size-6 place-items-center rounded-full border ${selected ? "border-neon bg-neon text-bg" : "border-line"}`}>
                  {selected ? <Check className="size-3.5" /> : null}
                </span>
              </button>
            );
          })}
        </div>
        {error ? <p className="text-sm text-gold">{error}</p> : null}
        <button type="button" disabled={busy || locked} onClick={go} className="glow-btn h-14 w-full rounded-full bg-neon text-lg font-extrabold text-bg">
          {locked ? `ON · ${formatClock(left)} LEFT` : busy ? "WORKING…" : action}
        </button>
        <p className="text-center text-sm text-muted">{note}</p>
      </div>
    </section>
  );
}

function Dashboard({
  view,
  balance,
  left,
  onOpen,
}: {
  view: MinerView;
  balance: number;
  left: number;
  onOpen: (screen: Screen) => void;
}) {
  const rate = view.gpu ? GPU_RATE : BASE_RATE;
  return (
    <section>
      <div className="flex items-center justify-between px-2 pt-3">
        <button type="button" onClick={() => onOpen("hub")} className="grid size-11 place-items-center text-fg" aria-label="Back">
          <ArrowLeft className="size-6" />
        </button>
        <div className="flex items-center gap-2">
          <p className="font-display text-2xl text-fg">MOBILE MINER</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-extrabold ${view.powered ? "bg-neon text-bg" : "bg-surface-2 text-muted"}`}>
          {view.powered ? "ON" : "OFF"}
        </span>
      </div>
      <div className="m-4 rounded-card border border-line bg-surface p-4 text-center">
        <p className="text-sm font-bold tracking-widest text-neon">NEXT REWARD</p>
        <p className="mt-1 font-display text-5xl text-neon">{view.powered ? formatClock(left) : "00:00:00"}</p>
        <p className="mt-1 text-sm text-muted">
          {view.powered ? "Hours keep ticking in the background." : "Tower power is out. Turn electricity on."}
        </p>
        <p className="mt-3 font-display text-3xl text-fg">{formatCoins(balance)}</p>
        <p className="text-xs text-muted">${TICKER} in this miner</p>
      </div>
      <div className="mx-4 overflow-hidden rounded-card border border-line">
        <img src="/bull.jpg" alt="Bull miner" className="h-44 w-full object-cover object-top" />
      </div>
      <div className="mx-4 mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-card border border-line bg-surface p-3 text-center">
          <p className="text-xs text-muted">MINING RATE</p>
          <p className={`font-display text-5xl ${view.gpu ? "text-neon" : "text-orange"}`}>{view.powered ? rate : BASE_RATE}</p>
          <p className="text-xs text-muted">{view.gpu ? "per day · 2x power" : "per day · normal miner"}</p>
        </div>
        <div className="rounded-card border border-line bg-surface p-3 text-center">
          <p className="text-xs text-muted">GRAPHICS CARD</p>
          <p className="font-display text-5xl text-neon">{view.gpu ? GPU_RATE : "—"}</p>
          <p className="text-xs text-muted">{view.gpu ? "installed · 2x" : "not installed"}</p>
        </div>
      </div>
      <div className="mx-4 mt-3 flex items-center gap-3 rounded-card border border-line bg-surface p-3">
        <span className="grid size-12 place-items-center rounded-xl bg-surface-2 text-neon">
          <Zap className="size-6" />
        </span>
        <div className="flex-1">
          <p className="text-xs text-muted">ELECTRICITY (24h)</p>
          <p className="font-display text-2xl text-fg">{view.powered ? formatClock(left) : "00:00:00"}</p>
        </div>
        <button type="button" onClick={() => onOpen("tower")} className="rounded-full bg-neon px-3 py-2 text-xs font-extrabold text-bg">
          ADD MORE
        </button>
      </div>
      <div className="px-4">
        {!view.gpu ? (
          <button type="button" onClick={() => onOpen("lair")} className="mt-3 h-12 w-full rounded-full border border-neon font-bold text-neon">
            GET THE GRAPHICS CARD
          </button>
        ) : null}
      </div>
    </section>
  );
}

function WalletScreen({
  view,
  balance,
  secret,
  onBack,
  onView,
  onUnlink,
}: {
  view: MinerView;
  balance: number;
  secret: string;
  onBack: () => void;
  onView: (view: MinerView) => void;
  onUnlink: () => void;
}) {
  const [address, setAddress] = useState(view.withdrawAddress);
  const [amount, setAmount] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [txHash, setTxHash] = useState("");
  const [walletCoins, setWalletCoins] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const token = view.tokenAddress || TOKEN_ADDRESS;

  async function useWallet() {
    try {
      const account = await connectAddress();
      if (!account) {
        setError("No wallet in this browser. Paste the address instead.");
        return;
      }
      setAddress(account);
      if (token) {
        const held = await readTokenBalance(token, account);
        setWalletCoins(held);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Wallet connection was cancelled.");
    }
  }

  async function credit(hash: string) {
    const result = await confirmDeposit({ data: { secret, txHash: hash } });
    if (!result.ok || !result.view) {
      setError(result.ok ? "Deposit did not credit." : result.error);
      return;
    }
    onView(result.view);
    setDepositAmount("");
    setTxHash("");
    const added = "amount" in result && result.amount ? formatCoins(result.amount) : "";
    setNote(added ? `Deposited ${added} real $${TICKER}.` : `That deposit was already on this miner.`);
  }

  async function deposit() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      if (!view.poolWallet) {
        setError("Pool wallet is not set.");
        return;
      }
      const tx = await depositMinerTest(token, view.poolWallet, Number(depositAmount));
      setTxHash(tx);
      await credit(tx);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmHash() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      await credit(txHash);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deposit failed.");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    setError("");
    setNote("");
    const value = amount.trim() ? Number(amount) : balance;
    try {
      const result = await withdrawCoins({ data: { secret, address, amount: value } });
      if (!result.ok || !result.view) {
        setError(result.ok ? "Withdrawal did not go through." : result.error);
        return;
      }
      onView(result.view);
      setAmount("");
      setNote("Queued. The pool desk sends the real $MINERTEST from the pool wallet on Robinhood Chain.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdrawal failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <ScreenHeader title="WALLET" onBack={onBack} />
      <div className="space-y-4 px-4 pb-6">
        <div className="rounded-card border border-line bg-surface p-4 text-center">
          <p className="mt-2 text-xs tracking-widest text-muted">READY TO WITHDRAW</p>
          <p className="font-display text-5xl text-neon">{formatCoins(balance)}</p>
          <p className="text-sm text-fg">${TICKER}</p>
          <p className="mt-2 text-xs text-muted">Pool holding {formatCoins(view.poolBalance)} for payouts</p>
          {walletCoins !== null ? (
            <p className="mt-1 text-xs text-gold">Wallet holds {formatCoins(walletCoins)} real ${TICKER}</p>
          ) : null}
        </div>
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="text-xs font-semibold tracking-widest text-muted">DEPOSIT REAL ${TICKER}</p>
          <p className="mt-2 text-xs text-muted">
            Buy on Pons first if this wallet is empty. The supply starts on the curve. A deposit sends real coins to the pool wallet and adds them here.
          </p>
          <p className="mt-2 break-all text-xs text-fg">{view.poolWallet}</p>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(view.poolWallet);
              setNote("Pool wallet copied. Send the coins there, then paste the tx hash.");
            }}
            className="mt-2 h-10 w-full rounded-full border border-line text-xs font-bold text-fg"
          >
            COPY POOL WALLET
          </button>
          <input
            value={depositAmount}
            onChange={(event) => setDepositAmount(event.target.value)}
            inputMode="decimal"
            placeholder="Amount to deposit"
            className="mt-2 h-14 w-full rounded-2xl border border-line bg-surface-2 px-4 text-fg outline-none"
          />
          <button type="button" disabled={busy} onClick={deposit} className="glow-btn mt-2 h-12 w-full rounded-full bg-neon font-extrabold text-bg">
            {busy ? "SENDING…" : "DEPOSIT FROM WALLET"}
          </button>
          <input
            value={txHash}
            onChange={(event) => setTxHash(event.target.value)}
            placeholder="Or paste the tx hash 0x…"
            className="mt-2 h-14 w-full rounded-2xl border border-line bg-surface-2 px-4 text-xs text-fg outline-none"
          />
          <button type="button" disabled={busy} onClick={confirmHash} className="mt-2 h-12 w-full rounded-full border border-neon font-bold text-neon">
            CREDIT THIS TRANSFER
          </button>
        </div>
        <label className="block">
          <span className="text-xs font-semibold tracking-widest text-muted">WALLET ADDRESS</span>
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="0x…"
            className="mt-2 h-14 w-full rounded-2xl border border-line bg-surface-2 px-4 text-sm text-fg outline-none"
          />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={useWallet} className="h-12 flex-1 rounded-full border border-line text-sm font-bold text-fg">
            USE WALLET
          </button>
          <button type="button" onClick={() => setAmount(String(Math.floor(balance * 100) / 100))} className="h-12 flex-1 rounded-full border border-line text-sm font-bold text-fg">
            MAX
          </button>
        </div>
        <label className="block">
          <span className="text-xs font-semibold tracking-widest text-muted">AMOUNT</span>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
            placeholder="All mined coins"
            className="mt-2 h-14 w-full rounded-2xl border border-line bg-surface-2 px-4 text-fg outline-none"
          />
        </label>
        {error ? <p className="text-sm text-gold">{error}</p> : null}
        {note ? <p className="text-sm text-neon">{note}</p> : null}
        <button type="button" disabled={busy} onClick={withdraw} className="glow-btn h-14 w-full rounded-full bg-neon text-lg font-extrabold text-bg">
          {busy ? "SENDING…" : "WITHDRAW"}
        </button>
        <CoinCard token={token} />
        <div className="space-y-2">
          {view.withdrawals.map((row) => (
            <div key={row.id} className="rounded-2xl border border-line bg-surface px-3 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold text-fg">{formatCoins(row.amount)} ${TICKER}</span>
                <span className="text-xs font-bold text-neon">{row.status.toUpperCase()}</span>
              </div>
              <p className="mt-1 break-all text-xs text-muted">{row.address}</p>
              {row.txHash ? (
                <a className="mt-1 block text-xs text-gold" href={`${EXPLORER}/tx/${row.txHash}`} target="_blank" rel="noreferrer">
                  View transfer
                </a>
              ) : null}
            </div>
          ))}
        </div>
        <button type="button" onClick={onUnlink} className="w-full text-center text-xs text-muted">
          Unlink this phone
        </button>
      </div>
    </section>
  );
}

function CoinCard({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState("");
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
      <div>
          <p className="text-sm font-extrabold text-fg">${TICKER}</p>
          <p className="text-xs text-muted">Robinhood Chain · 4663</p>
        </div>
      </div>
      <p className="mt-3 break-all text-xs text-fg">{token}</p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(token).then(() => setCopied(true));
          }}
          className="flex h-10 flex-1 items-center justify-center gap-1 rounded-full border border-neon text-xs font-bold text-neon"
        >
          <Copy className="size-3.5" />
          {copied ? "COPIED" : "COPY CA"}
        </button>
        <button
          type="button"
          onClick={() => {
            addTokenToWallet(token)
              .then(() => setAdded("Added to the wallet."))
              .catch((err: unknown) => setAdded(err instanceof Error ? err.message : "Could not add the coin."));
          }}
          className="flex h-10 flex-1 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-fg"
        >
          ADD COIN
        </button>
      </div>
      {added ? <p className="mt-2 text-xs text-gold">{added}</p> : null}
      <div className="mt-3 flex gap-3">
        <a href={PONS_URL} target="_blank" rel="noreferrer" className="text-xs font-semibold text-gold">
          Buy on Pons
        </a>
        <a href={`${EXPLORER}/token/${token}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-gold">
          Explorer
        </a>
      </div>
    </div>
  );
}

function ScreenHeader({
  title,
  onBack,
  badge,
}: {
  title: string;
  onBack: () => void;
  badge?: string;
}) {
  return (
    <header className="flex items-center gap-2 px-3 py-3">
      <button type="button" onClick={onBack} className="grid size-11 place-items-center text-fg" aria-label="Back">
        <ArrowLeft className="size-6" />
      </button>
      <p className="flex-1 text-center text-sm font-extrabold tracking-widest text-fg">{title}</p>
      {badge ? (
        <span className="rounded-full bg-gold px-3 py-1 text-xs font-extrabold text-bg">{badge}</span>
      ) : (
        <span className="size-11" />
      )}
    </header>
  );
}

function NavButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={`flex flex-col items-center gap-1 py-1 text-xs font-semibold ${active ? "text-neon" : "text-muted"}`}>
      {icon}
      {label}
    </button>
  );
}
