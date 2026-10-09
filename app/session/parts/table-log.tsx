// The table log: everyone's rolls, newest first. Secret DM rolls show as hidden to players.
import type { LogRow } from "@/lib/session-data";

function result(r: LogRow): { text: string; tone: "muted" | "accent" | "success" | "danger" | "text" } {
  if (r.masked) return { text: "DM roll, hidden", tone: "muted" };
  switch (r.roll_type) {
    case "attack":
      if (r.is_crit) return { text: `${r.total} · crit!`, tone: "accent" };
      if (r.success === false) return { text: `${r.total} · miss`, tone: "muted" };
      if (r.success === true) return { text: `${r.total} · hit`, tone: "text" };
      return { text: String(r.total), tone: "text" };
    case "damage": return { text: `${r.total} ${r.damage_type ?? ""}`.trim(), tone: "accent" };
    case "heal": return { text: `+${r.total} HP`, tone: "success" };
    case "save_dc": return { text: `DC ${r.dc} ${r.ability ?? ""}`.trim(), tone: "text" };
    case "initiative": return { text: `init ${r.total}`, tone: "text" };
    case "other": return { text: r.total == null ? "used" : String(r.total), tone: "text" };
    default: return { text: String(r.total ?? ""), tone: r.is_fumble ? "danger" : "text" };
  }
}

const TONE = { muted: "text-muted", accent: "text-accent font-bold", success: "text-success font-bold", danger: "text-danger", text: "text-text font-bold" };

export function TableLog({ rows }: { rows: LogRow[] }) {
  return (
    <section>
      <p className="text-xs uppercase tracking-[0.12em] text-muted">Table log</p>
      {rows.length === 0 && <p className="mt-3 text-sm text-muted">No rolls yet this session.</p>}
      <ul className="mt-1 divide-y divide-line">
        {rows.map((r) => {
          const res = result(r);
          return (
            <li key={r.id} className="flex items-center justify-between gap-3 py-3">
              <p className="min-w-0 text-[15px] leading-snug">
                <span className="font-bold">{r.actor.split(" ")[0]}</span>{" "}
                <span className="text-soft">{r.masked ? "rolled" : r.source}{r.spell_slot ? ` (lvl ${r.spell_slot})` : ""}</span>
                {r.target && !r.masked && <span className="text-soft"> → {r.target.split(" ")[0]}</span>}
                {r.advantage !== "normal" && !r.masked && <span className="ml-1 text-xs text-muted">{r.advantage === "advantage" ? "adv" : "dis"}</span>}
              </p>
              <p className={`shrink-0 text-[15px] ${TONE[res.tone]}`}>{res.text}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
