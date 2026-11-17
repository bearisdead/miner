export function Logo({ className = "size-11" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Bear is Dead">
      <circle cx="32" cy="32" r="29" fill="var(--color-bg)" stroke="var(--color-neon)" strokeWidth="4" />
      <g fill="var(--color-fg)">
        <ellipse cx="32" cy="40" rx="9" ry="7.5" />
        <circle cx="18.5" cy="26" r="4.2" />
        <circle cx="27" cy="19.5" r="4.4" />
        <circle cx="37.5" cy="19.5" r="4.4" />
        <circle cx="46" cy="26.5" r="4.2" />
      </g>
      <path d="M16 48 L48 16" stroke="var(--color-neon)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function LogoRow() {
  return (
    <div className="flex items-center justify-center gap-3 py-2" aria-hidden>
      <Logo className="size-6" />
      <Logo className="size-8" />
      <Logo className="size-6" />
      <Logo className="size-8" />
      <Logo className="size-6" />
    </div>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="min-w-0 leading-none">
      <p className={compact ? "font-display text-xl text-fg" : "font-display text-4xl text-fg"}>
        BEAR IS DEAD
      </p>
      <p className="mt-1 text-sm font-semibold tracking-widest text-muted">
        MOBILE <span className="text-neon">MINER</span>
      </p>
    </div>
  );
}
