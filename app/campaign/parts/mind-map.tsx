"use client";
// The mind map: everything in the campaign and how it connects, read from the DM's notes.
// Drag to move, pinch or use +/− to zoom, tap a box to see what the notes say about it.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { ask, type Answer } from "@/lib/reader/ask";
import { bounds, layout } from "@/lib/reader/layout";
import type { AiState } from "@/lib/reader/ai";
import type { Analysis, MapEdge, MapNode, NodeType } from "@/lib/reader/types";
import { LockIcon, SearchIcon } from "../../components/icons";
import { createDocIn } from "../actions";
import { askAi } from "../ai-actions";
import { AiReadButton } from "./ai-panel";

export const TYPES: { type: NodeType; label: string; color: string; fill: string }[] = [
  { type: "npc", label: "NPC", color: "#8A5A24", fill: "#2a1f15" },
  { type: "place", label: "Place", color: "#3C6070", fill: "#17232a" },
  { type: "faction", label: "Faction", color: "#6A4070", fill: "#241829" },
  { type: "party", label: "Party", color: "#4F6A3A", fill: "#1a2416" },
  { type: "lore", label: "Item & lore", color: "#7A6E3A", fill: "#23200f" },
  { type: "quest", label: "Quest", color: "#8A3F3A", fill: "#2a1716" },
  { type: "plan", label: "Session plan", color: "#B07A2E", fill: "#2c2210" },
  { type: "event", label: "Must happen", color: "#C0603A", fill: "#2e1912" },
  { type: "note", label: "Other pages", color: "#7A7468", fill: "#1f1d19" },
];
const FOLDER_FOR: Partial<Record<NodeType, { kind: string; label: string }>> = {
  npc: { kind: "npcs", label: "NPC" }, place: { kind: "places", label: "place" }, faction: { kind: "factions", label: "faction" }, lore: { kind: "lore", label: "item / lore" },
};
const T = Object.fromEntries(TYPES.map((t) => [t.type, t])) as Record<NodeType, (typeof TYPES)[number]>;
const H = 32;
const widthOf = (label: string) => Math.min(220, Math.round(label.length * 7.4 + 28));

export function MindMap({ analysis, showSecrets, q, ai }: { analysis: Analysis; showSecrets: boolean; q: string; ai?: AiState }) {
  const [on, setOn] = useState<Set<NodeType>>(new Set(["npc", "place", "faction", "party", "lore", "plan", "event", "note"]));
  const [secrets, setSecrets] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [aiAnswer, setAiAnswer] = useState<{ answer: string; about: string[] } | { error: string } | null>(null);
  const [asking, startAsk] = useTransition();

  const withSecrets = showSecrets && secrets;
  const nodes = useMemo(() => analysis.nodes.filter((n) => on.has(n.type) && (withSecrets || !n.secret)), [analysis, on, withSecrets]);
  const ids = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const edges = useMemo(() => analysis.edges.filter((e) => ids.has(e.a) && ids.has(e.b) && (withSecrets || !e.secret)), [analysis, ids, withSecrets]);
  const placed = useMemo(() => layout(
    nodes.map((n) => ({ id: n.id, w: widthOf(n.label), h: H, group: TYPES.findIndex((t) => t.type === n.type) })),
    edges.map((e) => ({ a: e.a, b: e.b, weight: e.weight })),
  ), [nodes, edges]);
  const at = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed]);
  const fit = useMemo(() => bounds(placed), [placed]);

  const sel = selected ? analysis.nodes.find((n) => n.id === selected) ?? null : null;
  const near = useMemo(() => {
    if (!sel) return null;
    const s = new Set([sel.id]);
    for (const e of edges) { if (e.a === sel.id) s.add(e.b); if (e.b === sel.id) s.add(e.a); }
    return s;
  }, [sel, edges]);

  const pick = (id: string | null) => {
    setSelected(id);
    const n = id ? analysis.nodes.find((x) => x.id === id) : null;
    if (n && !on.has(n.type)) setOn(new Set([...on, n.type]));
  };

  return (
    <div>
      {/* legend = filters */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show on the map">
        {TYPES.map((t) => {
          const active = on.has(t.type);
          const count = analysis.nodes.filter((n) => n.type === t.type && (withSecrets || !n.secret)).length;
          if (!count) return null;
          return (
            <button key={t.type} type="button" aria-pressed={active} onClick={() => { const s = new Set(on); if (active) s.delete(t.type); else s.add(t.type); setOn(s); }}
              className={`flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-xs ${active ? "border-line bg-surface text-text" : "border-dashed border-line text-muted"}`}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: active ? t.color : "transparent", border: `1.5px solid ${t.color}` }} />
              {t.label} <span className="text-muted">{count}</span>
            </button>
          );
        })}
        {showSecrets && (
          <button type="button" aria-pressed={secrets} onClick={() => setSecrets(!secrets)}
            className={`ml-auto flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs ${secrets ? "border-accent-line bg-accent-surface text-accent" : "border-line text-muted"}`}>
            <LockIcon className="h-3.5 w-3.5" />{secrets ? "Secrets shown" : "Secrets hidden"}
          </button>
        )}
      </div>

      {nodes.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
          Nothing to draw yet. Write NPCs, places, factions and items in their folders and the map builds itself.
        </p>
      ) : (
        <Canvas key={`${fit.x}|${fit.y}|${fit.w}|${fit.h}`} fit={fit} focus={selected ? at.get(selected) ?? null : null}>
          {edges.map((e) => <EdgeLine key={e.id} e={e} at={at} hot={!!sel && (e.a === sel.id || e.b === sel.id)} dim={!!sel && !(e.a === sel.id || e.b === sel.id)} />)}
          {nodes.map((n) => {
            const p = at.get(n.id)!;
            return <NodeBox key={n.id} n={n} x={p.x} y={p.y} w={p.w} selected={n.id === selected} dim={!!near && !near.has(n.id)} onPick={() => pick(n.id === selected ? null : n.id)} />;
          })}
          {sel && edges.filter((e) => e.a === sel.id || e.b === sel.id).map((e) => <EdgeLabel key={"l" + e.id} e={e} at={at} />)}
        </Canvas>
      )}
      <p className="mt-1.5 text-[11px] text-muted">Drag to move · pinch or +/− to zoom · tap a box{showSecrets ? " · dashed lines come from DM-only notes" : ""}{analysis.edges.some((e) => e.ai) ? " · purple lines were found by the AI" : ""}</p>
      {showSecrets && ai && <AiReadButton ai={ai} />}

      {sel ? <Selected n={sel} analysis={analysis} edges={edges} q={q} showSecrets={withSecrets} onPick={pick} /> : (
        <p className="mt-3 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          Tap a box to see what your notes say about it and everything it&apos;s linked to.
        </p>
      )}

      <form className="mt-5" onSubmit={(e) => { e.preventDefault(); setAiAnswer(null); setAnswer(ask(question, withSecrets ? analysis : publicOnly(analysis))); }}>
        <label htmlFor="ask" className="text-sm text-soft">Ask about the world</label>
        <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 focus-within:border-accent">
          <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
          <input id="ask" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What do we know about the Lanternhands?"
            className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
          <button className="h-9 shrink-0 rounded-lg bg-accent px-3 text-sm font-bold text-accent-text">Ask</button>
          {ai?.configured && (
            <button type="button" disabled={asking || question.trim().length < 3}
              onClick={() => { setAnswer(null); startAsk(async () => setAiAnswer(await askAi(question, q.includes("view=player"), withSecrets))); }}
              className="h-9 shrink-0 rounded-lg border border-[#6a5a8a] px-3 text-sm font-bold text-[#b9a6e0] disabled:opacity-50">{asking ? "…" : "✦ AI"}</button>
          )}
        </div>
      </form>
      {aiAnswer && (
        <section className="animate-rise mt-3 rounded-2xl border border-[#4a3f60] bg-surface p-4" aria-label="AI answer" aria-live="polite">
          {"error" in aiAnswer ? <p className="text-sm text-danger">{aiAnswer.error}</p> : (
            <>
              <p className="text-[15px] leading-relaxed text-soft">{aiAnswer.answer}</p>
              {aiAnswer.about.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {aiAnswer.about.map((id) => { const n = analysis.nodes.find((x) => x.id === id); return n ? (
                    <button key={id} type="button" onClick={() => pick(id)} className="flex h-8 items-center gap-1.5 rounded-full border border-line px-2.5 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: T[n.type].color }} />{n.label}
                    </button>) : null; })}
                </div>
              )}
              <p className="mt-3 text-[11px] text-muted">✦ Written by the AI from the notes{withSecrets ? "" : " the players can see"}. It can get things wrong: tap a name to check the notes.</p>
            </>
          )}
        </section>
      )}
      {answer && (
        <section className="animate-rise mt-3 rounded-2xl border border-line bg-surface p-4" aria-label="Answer" aria-live="polite">
          {answer.nodes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {answer.nodes.map((n) => (
                <button key={n.id} type="button" onClick={() => pick(n.id)} className="flex h-8 items-center gap-1.5 rounded-full border border-line px-2.5 text-xs">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: T[n.type].color }} />{n.label}
                </button>
              ))}
            </div>
          )}
          {answer.lines.length ? (
            <ul className="mt-2 space-y-2">
              {answer.lines.map((l, i) => (
                <li key={i} className="text-[14px] leading-relaxed">
                  {l.secret && <LockIcon className="mr-1 inline h-3.5 w-3.5 text-accent" aria-label="DM only" />}
                  <span className="text-soft">{l.text}</span> <span className="text-xs text-muted">· {l.from}</span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-sm text-muted">Nothing in the notes about that yet.</p>}
          <p className="mt-3 text-[11px] text-muted">Answers are lines from the notes{showSecrets ? "" : " the DM shared"}, nothing made up.</p>
        </section>
      )}
    </div>
  );
}

function publicOnly(a: Analysis): Analysis {
  return {
    ...a,
    nodes: a.nodes.filter((n) => !n.secret).map((n) => ({ ...n, facts: n.facts.filter((f) => !f.secret), aiSummary: n.aiSummary?.secret ? undefined : n.aiSummary })),
    edges: a.edges.filter((e) => !e.secret).map((e) => ({ ...e, evidence: e.evidence.filter((v) => !v.secret) })),
  };
}

/** SVG with pan (drag) and zoom (pinch, wheel, buttons). */
function Canvas({ fit, focus, children }: { fit: { x: number; y: number; w: number; h: number }; focus: { x: number; y: number } | null; children: React.ReactNode }) {
  const ref = useRef<SVGSVGElement>(null);
  // start readable: if the whole map would make labels tiny, start zoomed in on the middle (Fit shows everything)
  const [view, setView] = useState(() => {
    const minW = 520, aspect = 440 / 350;
    if (fit.w <= minW) return fit;
    const w = minW, h = Math.max(fit.h * (w / fit.w), w * aspect);
    return { x: fit.x + (fit.w - w) / 2, y: fit.y + (fit.h - h) / 2, w, h };
  });
  // when something is selected (tap, a link in the card, an answer), slide it into the middle if it's near the edge
  const [lastFocus, setLastFocus] = useState(focus);
  if (focus !== lastFocus) {
    setLastFocus(focus);
    if (focus) {
      const mx = view.w * 0.2, my = view.h * 0.2;
      const inside = focus.x > view.x + mx && focus.x < view.x + view.w - mx && focus.y > view.y + my && focus.y < view.y + view.h - my;
      if (!inside) setView({ ...view, x: focus.x - view.w / 2, y: focus.y - view.h / 2 });
    }
  }
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const last = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const moved = useRef(0);

  const scaleOf = () => { const r = ref.current!.getBoundingClientRect(); return Math.max(view.w / r.width, view.h / r.height); };
  const zoom = (f: number, cx?: number, cy?: number) => setView((v) => {
    const w = Math.min(fit.w * 3, Math.max(fit.w / 5, v.w * f)), h = (v.h * w) / v.w;
    const px = cx ?? v.x + v.w / 2, py = cy ?? v.y + v.h / 2;
    return { x: px - ((px - v.x) * w) / v.w, y: py - ((py - v.y) * h) / v.h, w, h };
  });
  const toWorld = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect(), s = scaleOf();
    return { x: view.x + (clientX - r.left - (r.width - view.w / s) / 2) * s, y: view.y + (clientY - r.top - (r.height - view.h / s) / 2) * s };
  };

  return (
    <div className="relative mt-3 overflow-hidden rounded-[18px] border border-line bg-surface">
      <svg ref={ref} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className="block h-[460px] w-full touch-none select-none" role="group" aria-label="Mind map"
        onPointerDown={(e) => { pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved.current = 0; last.current = null; }}
        onPointerMove={(e) => {
          const prev = pointers.current.get(e.pointerId);
          if (!prev) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const ps = [...pointers.current.values()];
          if (ps.length === 2) {
            const dist = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
            const c = toWorld((ps[0].x + ps[1].x) / 2, (ps[0].y + ps[1].y) / 2);
            if (last.current) zoom(last.current.dist / dist, c.x, c.y);
            last.current = { dist, cx: c.x, cy: c.y };
            moved.current += 10;
            return;
          }
          const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
          moved.current += Math.abs(dx) + Math.abs(dy);
          if (moved.current > 4) { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); const s = scaleOf(); setView((v) => ({ ...v, x: v.x - dx * s, y: v.y - dy * s })); }
        }}
        onPointerUp={(e) => { pointers.current.delete(e.pointerId); last.current = null; }}
        onPointerCancel={(e) => { pointers.current.delete(e.pointerId); last.current = null; }}
        onClickCapture={(e) => { if (moved.current > 6) { e.stopPropagation(); e.preventDefault(); } }}
        onWheel={(e) => { const c = toWorld(e.clientX, e.clientY); zoom(e.deltaY > 0 ? 1.12 : 1 / 1.12, c.x, c.y); }}>
        {children}
      </svg>
      <div className="absolute bottom-2 right-2 flex flex-col overflow-hidden rounded-xl border border-line bg-surface-2/95">
        <button type="button" aria-label="Zoom in" onClick={() => zoom(1 / 1.3)} className="h-9 w-9 text-lg text-soft">+</button>
        <button type="button" aria-label="Zoom out" onClick={() => zoom(1.3)} className="h-9 w-9 border-t border-line text-lg text-soft">−</button>
        <button type="button" aria-label="Fit the whole map" onClick={() => setView(fit)} className="h-9 w-9 border-t border-line text-xs text-soft">Fit</button>
      </div>
    </div>
  );
}

function EdgeLine({ e, at, hot, dim }: { e: MapEdge; at: Map<string, { x: number; y: number }>; hot: boolean; dim: boolean }) {
  const a = at.get(e.a)!, b = at.get(e.b)!;
  return (
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={hot ? "#e0913a" : e.ai ? "#8a74b8" : "#6b5d4a"} strokeWidth={hot ? 2 : 1 + Math.min(1.2, e.weight * 0.2)}
      strokeOpacity={dim ? 0.18 : hot ? 0.95 : 0.6} strokeDasharray={e.secret ? "5 5" : undefined} />
  );
}

function EdgeLabel({ e, at }: { e: MapEdge; at: Map<string, { x: number; y: number }> }) {
  if (e.label === "connected") return null;
  const a = at.get(e.a)!, b = at.get(e.b)!;
  const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2, w = e.label.length * 6 + 12;
  return (
    <g pointerEvents="none">
      <rect x={x - w / 2} y={y - 9} width={w} height={18} rx={9} fill="#15130f" stroke="#e0913a" strokeOpacity={0.6} />
      <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fill="#e0913a">{e.label}</text>
    </g>
  );
}

function NodeBox({ n, x, y, w, selected, dim, onPick }: { n: MapNode; x: number; y: number; w: number; selected: boolean; dim: boolean; onPick: () => void }) {
  const t = T[n.type];
  return (
    <g role="button" tabIndex={0} aria-label={`${n.label}, ${t.label}${n.noPage ? ", no page yet" : ""}${n.secret ? ", not shared yet" : ""}`} aria-pressed={selected}
      onClick={onPick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); } }}
      style={{ cursor: "pointer", opacity: dim ? 0.35 : 1, transition: "opacity 200ms" }} className="outline-none">
      <rect x={x - w / 2} y={y - H / 2} width={w} height={H} rx={n.type === "npc" || n.type === "party" ? 16 : 9}
        fill={selected ? "#e0913a" : n.noPage ? "#15130f" : t.fill} stroke={selected ? "#e0913a" : t.color} strokeWidth={1.5}
        strokeDasharray={n.noPage ? "2 3" : n.secret ? "4 3" : undefined} />
      <text x={x} y={y + 4.5} textAnchor="middle" fontSize={13} fontWeight={600} fill={selected ? "#1a140c" : "#efe7da"}>
        {n.label.length > 28 ? n.label.slice(0, 27) + "…" : n.label}
      </text>
    </g>
  );
}

function Selected({ n, analysis, edges, q, showSecrets, onPick }: {
  n: MapNode; analysis: Analysis; edges: MapEdge[]; q: string; showSecrets: boolean; onPick: (id: string) => void;
}) {
  const [all, setAll] = useState(false);
  const label = new Map(analysis.nodes.map((x) => [x.id, x]));
  const links = edges.filter((e) => e.a === n.id || e.b === n.id).sort((x, y) => Number(x.secret) - Number(y.secret) || y.weight - x.weight);
  const facts = n.facts.filter((f) => showSecrets || !f.secret);
  return (
    <section className="animate-rise mt-3 rounded-2xl border border-line bg-surface p-4" aria-label={`Selected: ${n.label}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm text-muted">Selected · {n.type === "note" ? n.folder ?? "Page" : T[n.type].label}{n.status ? ` · ${n.status === "done" ? "done" : "open"}` : ""}</p>
        {n.docId && <Link href={`/campaign/e/${n.docId}${q}`} className="text-sm font-bold text-accent">{n.type === "event" ? "Open plan" : "Open"}</Link>}
      </div>
      <h3 className="mt-1 font-heading text-2xl font-bold leading-tight">{n.label}</h3>
      {n.secret && <p className="mt-1 flex items-center gap-1 text-xs text-accent"><LockIcon className="h-3.5 w-3.5" />Not shared with players yet</p>}
      {n.summary && <p className="mt-2 text-[15px] leading-relaxed text-soft">{n.summary}</p>}
      {n.aiSummary && (showSecrets || !n.aiSummary.secret) && (
        <p className="mt-2 rounded-lg border border-[#4a3f60] px-3 py-2 text-[14px] leading-relaxed text-soft">
          <span className="text-xs font-bold text-[#b9a6e0]">✦ AI </span>{n.aiSummary.text}
          {n.aiSummary.secret && <LockIcon className="ml-1 inline h-3.5 w-3.5 text-accent" aria-label="uses DM-only notes" />}
        </p>
      )}
      {n.noPage && showSecrets && <MakePage n={n} />}

      {links.length > 0 && (
        <>
          <p className="mt-4 text-xs uppercase tracking-[0.12em] text-muted">Linked to</p>
          <ul className="mt-2 divide-y divide-line">
            {links.map((e) => {
              const other = label.get(e.a === n.id ? e.b : e.a)!;
              const rel = e.label === "connected" ? "" : e.a === n.id ? e.label : `${e.label} (them)`;
              const ev = e.evidence.find((v) => showSecrets || !v.secret);
              return (
                <li key={e.id} className="py-2">
                  <button type="button" onClick={() => onPick(other.id)} className="flex w-full items-start gap-2 text-left">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: T[other.type].color }} />
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{other.label}</span>
                      {rel && <span className="text-xs text-accent"> · {rel}</span>}
                      {e.secret && <LockIcon className="ml-1 inline h-3.5 w-3.5 text-accent" aria-label="secret link" />}
                      {e.ai && <span className="ml-1 text-[11px] font-bold text-[#b9a6e0]">✦ AI</span>}
                      {ev && <span className="block text-xs leading-snug text-muted">“{ev.text.length > 110 ? ev.text.slice(0, 109) + "…" : ev.text}” · {ev.docTitle}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {facts.length > 0 && (
        <>
          <button type="button" onClick={() => setAll(!all)} aria-expanded={all} className="mt-3 text-sm text-accent underline">
            {all ? "Hide the notes" : `Everything the notes say (${facts.length})`}
          </button>
          {all && (
            <ul className="mt-2 space-y-1.5 text-[14px] leading-relaxed">
              {facts.map((f, i) => (
                <li key={i} className={f.secret ? "rounded-lg bg-accent-surface px-2 py-1 text-soft" : "text-soft"}>
                  {f.secret && <LockIcon className="mr-1 inline h-3.5 w-3.5 text-accent" aria-label="DM only" />}{f.text}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/** A name from the notes with no page yet: one tap makes the page in the right folder. */
function MakePage({ n }: { n: MapNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const guess = FOLDER_FOR[n.type] ?? FOLDER_FOR.lore!;
  const others = Object.values(FOLDER_FOR).filter((f) => f!.kind !== guess.kind) as { kind: string; label: string }[];
  const make = (kind: string) => start(async () => {
    setError(null);
    const r = await createDocIn(kind, n.label);
    if ("error" in r) setError(r.error); else router.push(`/campaign/e/${r.id}`);
  });
  return (
    <div className="mt-3 rounded-xl border border-dashed border-line p-3">
      <p className="text-sm text-soft">Your notes name it, but it has no page yet. Make one and it joins the map for real.</p>
      <button type="button" disabled={pending} onClick={() => make(guess.kind)} className="mt-2 h-11 w-full rounded-xl bg-accent text-sm font-bold text-accent-text">
        {pending ? "Making…" : `Make ${guess.label === "item / lore" ? "an item / lore" : guess.label === "NPC" ? "an NPC" : "a " + guess.label} page`}
      </button>
      <p className="mt-2 text-xs text-muted">
        Or as:{" "}
        {others.map((o, i) => (
          <span key={o.kind}>{i > 0 && " · "}<button type="button" disabled={pending} onClick={() => make(o.kind)} className="text-accent underline">{o.label}</button></span>
        ))}
      </p>
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}
