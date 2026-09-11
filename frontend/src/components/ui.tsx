import { clsx } from "clsx";
import { Loader2, X } from "lucide-react";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">{actions}</div>}
    </div>
  );
}

export function Card({ children, className, title, action }: { children: ReactNode; className?: string; title?: string; action?: ReactNode }) {
  return (
    <section className={clsx("card p-5", className)}>
      {(title || action) && (
        <header className="flex items-center justify-between mb-4">
          {title && <h3 className="text-sm font-semibold text-slate-700">{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "good" | "warn" }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={clsx("mt-2 text-2xl font-semibold font-display", tone === "good" && "text-emerald-700", tone === "warn" && "text-amber-700", tone === "default" && "text-ocean-950")}>{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "amber" | "red" | "blue" | "violet" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-rose-100 text-rose-800",
    blue: "bg-ocean-100 text-ocean-800",
    violet: "bg-violet-100 text-violet-800",
  };
  return <span className={clsx("badge", tones[tone])}>{children}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("animate-spin text-ocean-500", className ?? "w-5 h-5")} />;
}

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-slate-500 py-10 justify-center">
      <Spinner /> {label}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-sm text-slate-500 text-center py-10 border border-dashed border-slate-200 rounded-2xl">{children}</div>;
}

export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  const msg = error instanceof Error ? error.message : String(error);
  return <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm px-4 py-3">{msg}</div>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ocean-950/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className={clsx("card w-full max-h-[90vh] overflow-y-auto p-6", wide ? "max-w-4xl" : "max-w-xl")} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn-ghost p-2" onClick={onClose} aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

export function Progress({ value, max, className }: { value: number; max: number; className?: string }) {
  const ratio = max ? Math.min(1, value / max) : 0;
  const color = ratio >= 1 ? "bg-rose-500" : ratio >= 0.7 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className={clsx("h-1.5 w-full rounded-full bg-slate-100 overflow-hidden", className)}>
      <div className={clsx("h-full rounded-full", color)} style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}
