import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Copy } from "lucide-react";
import { POOL_WALLET, TICKER } from "@/lib/miner-shared";

export function AdminApp() {
  const [copied, setCopied] = useState(false);

  return (
    <main className="mx-auto flex h-dvh w-full max-w-[430px] flex-col bg-bg text-fg">
      <header className="flex items-center gap-2 px-3 py-3">
        <Link to="/" className="grid size-11 place-items-center text-fg" aria-label="Back">
          <ArrowLeft className="size-6" />
        </Link>
        <p className="flex-1 text-center text-sm font-extrabold tracking-widest">ADMIN</p>
        <span className="size-11" />
      </header>
      <div className="px-4 pt-6">
        <p className="text-xs font-semibold tracking-widest text-muted">DEPOSIT ADDRESS</p>
        <p className="mt-2 text-sm text-fg">Send ${TICKER} here. This wallet pays the withdrawals.</p>
        <p className="mt-4 break-all rounded-2xl border border-line bg-surface px-4 py-4 font-display text-lg text-neon">
          {POOL_WALLET}
        </p>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(POOL_WALLET).then(() => setCopied(true));
          }}
          className="glow-btn mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-full bg-neon text-lg font-extrabold text-bg"
        >
          <Copy className="size-5" />
          {copied ? "COPIED" : "COPY ADDRESS"}
        </button>
      </div>
    </main>
  );
}
