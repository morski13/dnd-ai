// Colored Easy / Medium / Hard / Deadly badge.
export const TIER_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  Easy: { bg: "#1A2A1A", border: "#335A30", text: "#B5E0A8" },
  Medium: { bg: "#33240F", border: "#6A5020", text: "#F2C48D" },
  Hard: { bg: "#2A2017", border: "#8A5A24", text: "#E0913A" },
  Deadly: { bg: "#2A1A1A", border: "#5A3030", text: "#F07A6A" },
};

export function TierBadge({ tier, size = "sm" }: { tier: string; size?: "sm" | "lg" }) {
  const s = TIER_STYLE[tier] ?? TIER_STYLE.Medium;
  return (
    <span
      className={`inline-flex items-center rounded-lg border font-bold ${size === "lg" ? "px-3 py-1 font-heading text-2xl" : "px-2 py-0.5 text-xs uppercase tracking-[0.08em]"}`}
      style={{ background: s.bg, borderColor: s.border, color: s.text }}
    >
      {tier}
    </span>
  );
}
