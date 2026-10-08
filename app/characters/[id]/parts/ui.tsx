"use client";
// Small building blocks shared by the character sheet.
import { signed } from "@/lib/dice";

export function StatBox({ label, value, sub, sheet, onClick }: {
  label: string; value: string | number; sub?: string; sheet?: number; onClick?: () => void;
}) {
  const cls = `flex min-h-24 flex-col items-center justify-center rounded-2xl border bg-surface px-1 py-2 ${sheet !== undefined ? "border-[#8A5A24]" : "border-line"}`;
  const inner = (
    <>
      <span className="text-sm text-muted">{label}</span>
      <span className="text-2xl font-bold">{value}</span>
      {sheet !== undefined
        ? <span className="text-xs text-[#F2C48D]">sheet: {sheet}</span>
        : sub && <span className="text-xs text-muted">{sub}</span>}
    </>
  );
  return onClick
    ? <button type="button" onClick={onClick} className={`${cls} active:border-accent`}>{inner}</button>
    : <div className={cls}>{inner}</div>;
}

export function RollButton({ label, disabled, onClick, tone = "accent" }: {
  label: string; disabled: boolean; onClick: () => void; tone?: "accent" | "heal" | "quiet";
}) {
  const color = tone === "heal"
    ? "border border-success-line bg-success-bg text-success"
    : tone === "quiet" ? "border border-line text-soft" : "bg-accent text-accent-text";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-12 min-w-16 shrink-0 rounded-xl px-3 text-base font-bold disabled:opacity-40 ${color}`}
    >
      {label}
    </button>
  );
}

export function RowButton({ label, hint, bonus, proficient, expertise, disabled, onClick }: {
  label: string; hint?: string; bonus: number; proficient: boolean; expertise?: boolean; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-11 items-center justify-between gap-2 rounded-xl bg-surface px-3 text-left active:bg-accent-surface"
    >
      <span className="flex items-center gap-2 text-[15px]">
        <span className="w-4 text-xs text-accent">{expertise ? "●●" : proficient ? "●" : ""}</span>
        {label}
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </span>
      <span className="font-bold">{signed(bonus)}</span>
    </button>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">{text}</p>;
}

/** A row of pips: tap a full one to spend, an empty one to get it back. */
export function Pips({ max, used, label, disabled, onChange }: {
  max: number; used: number; label: string; disabled: boolean; onChange: (used: number) => void;
}) {
  const left = max - used;
  return (
    <div className="flex flex-wrap">
      {Array.from({ length: max }).map((_, p) => (
        <button
          key={p}
          type="button"
          disabled={disabled}
          aria-label={p < left ? `Use ${label}` : `Restore ${label}`}
          onClick={() => onChange(p < left ? used + 1 : used - 1)}
          className="flex h-11 w-9 items-center justify-center"
        >
          <span className={`h-6 w-6 rounded-full ${p < left ? "bg-accent" : "border-2 border-line"}`} />
        </button>
      ))}
    </div>
  );
}

export function Tag({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "accent" }) {
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${tone === "accent" ? "border-[#8A5A24] text-accent" : "border-line text-muted"}`}>
      {children}
    </span>
  );
}

/** Small words that stay lowercase in Title Case headings. */
const SMALL = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with", "your"]);
/** "Cantrip Upgrade." / "Using a Higher-Level Spell Slot." → a run-in heading. Normal sentences aren't. */
function isHeading(h: string) {
  const words = h.replace(/\.$/, "").split(/\s+/);
  return words.length <= 7 && words.every((w, i) => (i > 0 && SMALL.has(w)) || /^[A-Z0-9(“"]/.test(w));
}

/** Splits text into paragraphs and makes run-in headings ("Cantrip Upgrade.") bold. */
export function RulesText({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-[14px] leading-relaxed text-soft">
      {text.split("\n\n").map((p, i) => {
        const m = p.match(/^([^.]{1,60}\.)\s([\s\S]*)$/);
        return m && isHeading(m[1]) ? (
          <p key={i}><strong className="text-text">{m[1]}</strong> {m[2]}</p>
        ) : (
          <p key={i}>{p}</p>
        );
      })}
    </div>
  );
}

export const ACTION_LABEL: Record<string, string> = {
  action: "Action", bonus: "Bonus action", reaction: "Reaction", free: "Free", other: "Longer",
};
