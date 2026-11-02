// Session recap: what happened in one session. Opens by itself when a session ends (DM's or the players'),
// and from Statistics. Numbers come from the same rules as the statistics; the story is written by the AI
// from those numbers only.
import { ShareButton } from "../../components/share-card";
import Link from "next/link";
import { Suspense } from "react";
import { aiProviders } from "@/lib/ai/client";
import { getRecapData, type RecapView } from "@/lib/stats-data";
import type { Moment } from "@/lib/stats/recap";
import { BottomNav } from "../../components/bottom-nav";
import { Awards, Section, Tiles } from "../parts/bits";
import { Story } from "./story";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function RecapPage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <main className="mx-auto w-full max-w-md md:max-w-3xl md:px-8 lg:max-w-4xl lg:px-10 flex-1 px-5 pt-8 pb-28">
        <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-10 w-56 rounded bg-surface" /><div className="h-28 rounded-2xl bg-surface" /><div className="h-48 rounded-[18px] bg-surface" /></div>}>
          <Recap searchParams={searchParams} />
        </Suspense>
      </main>
      <BottomNav active="stats" />
    </>
  );
}

const MOMENT_ICON: Record<Moment["kind"], string> = { fight: "⚔", crit: "🎯", fumble: "🎲", "big-hit": "💥", down: "💀", "pc-down": "🛌", heal: "🩹" };

async function Recap({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const data = await getRecapData({ s: typeof sp.s === "string" ? sp.s : undefined });
  if ("empty" in data) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">
        <p className="font-semibold text-text">No session to recap yet</p>
        <p className="mt-1">Start a session (DM) or press Track game on a character sheet, roll, and the recap fills in.</p>
        <Link href="/stats" className="mt-3 inline-flex min-h-10 items-center text-accent underline">Statistics</Link>
      </div>
    );
  }
  const d = data as RecapView;
  const r = d.recap;
  const colorOf = (name: string) => d.characters.find((c) => c.name === name)?.color;
  const colorKey = (key: string | null) => d.characters.find((c) => c.key === key)?.color;
  const idx = d.sessions.findIndex((s) => s.number === d.session.number);
  const prev = idx > 0 ? d.sessions[idx - 1] : null, next = idx >= 0 && idx < d.sessions.length - 1 ? d.sessions[idx + 1] : null;
  const hours = r.minutes >= 60 ? `${Math.floor(r.minutes / 60)} h ${r.minutes % 60} min` : `${r.minutes} min`;

  return (
    <>
      <header>
        <p className="text-xs uppercase tracking-[0.12em] text-muted">{d.campaignName}</p>
        <h1 className="mt-1 font-heading text-3xl font-bold leading-tight">Session {d.session.number} recap</h1>
        <p className="mt-1 text-sm text-muted">
          {[d.session.title, d.session.live ? "still running" : null, d.session.players ? "tracked by the players" : null, r.minutes ? `${hours} of rolling` : null].filter(Boolean).join(" · ")}
        </p>
        <nav className="mt-3 flex flex-wrap gap-2 text-sm" aria-label="Other sessions">
          {prev && <Link href={`/stats/recap?s=${prev.number}`} className="inline-flex h-9 items-center rounded-full border border-line px-3 text-soft">← Session {prev.number}</Link>}
          {next && <Link href={`/stats/recap?s=${next.number}`} className="inline-flex h-9 items-center rounded-full border border-line px-3 text-soft">Session {next.number} →</Link>}
          <Link href={`/stats?s=${d.session.number}`} className="inline-flex h-9 items-center rounded-full border border-accent-line px-3 font-bold text-accent">All stats for this session</Link>
        </nav>
      </header>

      {!r.party.rolls ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line p-5 text-sm text-muted">No rolls in this session yet.</p>
      ) : (
        <>
          <div className="mt-5">
            <Tiles items={[
              { label: "damage dealt", value: r.party.damage },
              { label: "HP healed", value: r.party.healing },
              { label: "foes down", value: r.party.kills },
              { label: "natural 20s", value: r.party.nat20 },
              { label: "natural 1s", value: r.party.nat1 },
              { label: "times dropped", value: r.party.dropped },
            ]} />
          </div>

          {r.mvp && (
            <div className="animate-rise mt-4 flex items-center gap-3 rounded-2xl border border-accent-line bg-accent-surface p-4">
              <span className="text-3xl" aria-hidden>👑</span>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.12em] text-accent">MVP</p>
                <p className="font-heading text-xl font-bold">{r.mvp}</p>
                <p className="text-sm text-soft">{mvpLine(r.heroes[0])}</p>
              </div>
              <div className="ml-auto shrink-0"><ShareButton card={{ kicker: `Session ${d.session.number} MVP`, big: String(r.heroes[0]?.damage ?? ""), emoji: "👑", title: r.mvp, sub: mvpLine(r.heroes[0]), name: r.mvp, campaign: d.campaignName }} /></div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ShareButton label="Share this session" card={{ kicker: `Session ${d.session.number}${d.session.title ? ` · ${d.session.title}` : ""}`, big: String(r.party.damage), emoji: "⚔️",
              title: "damage dealt by the party", sub: `${r.party.nat20} natural 20s · ${r.party.kills} enemies down · ${r.party.healing} healed`, campaign: d.campaignName }} />
            <Link href="/stats/wrapped" className="inline-flex min-h-9 items-center text-xs font-bold text-accent underline">Campaign Wrapped ›</Link>
          </div>

          <Section title="The story" sub="Written by the AI from this page's numbers only, for the whole table">
            <Story sessionId={d.session.id} initial={d.session.story} aiReady={aiProviders().length > 0} />
          </Section>

          {r.moments.length > 0 && (
            <Section title="Moments" sub="In the order they happened">
              <ol className="relative ml-2 border-l border-line pl-5">
                {r.moments.map((m, i) => (
                  <li key={i} className="animate-rise relative pb-4 last:pb-0" style={{ "--i": i } as React.CSSProperties}>
                    <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface text-xs" aria-hidden>{MOMENT_ICON[m.kind]}</span>
                    <p className="text-[15px] leading-snug">
                      {m.who && colorKey(m.who) && <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: colorKey(m.who) }} />}
                      {m.text}
                    </p>
                    <p className="text-[11px] text-muted">{new Date(m.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</p>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          <Section title="The heroes">
            <ul className="grid gap-2 md:grid-cols-2">
              {r.heroes.map((h) => (
                <li key={h.key} className="rounded-2xl border border-line bg-surface p-4">
                  <p className="flex items-center gap-2 font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(h.name) }} />{h.name}</p>
                  <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <Num label="damage" value={h.damage} />
                    <Num label={h.healing ? "healed" : "hits"} value={h.healing || (h.attacks ? `${h.hits}/${h.attacks}` : "–")} />
                    <Num label="foes down" value={h.kills} />
                  </dl>
                  <p className="mt-2 text-xs text-muted">
                    {[h.biggest ? `Biggest hit ${h.biggest.amount}` : null, h.topAttack ? `mostly ${h.topAttack}` : null, h.topSpell ? `favourite spell ${h.topSpell}` : null,
                      h.nat20 ? `${h.nat20}× nat 20` : null, h.nat1 ? `${h.nat1}× nat 1` : null, h.dropped ? `dropped ${h.dropped}×` : null].filter(Boolean).join(" · ") || "Quiet session"}
                  </p>
                </li>
              ))}
            </ul>
          </Section>

          {r.awards.length > 0 && (
            <Section title="Awards">
              <Awards awards={r.awards} colorOf={colorOf} campaign={d.campaignName} />
            </Section>
          )}

          {r.fights.length > 0 && (
            <Section title="Fights">
              <ul className="flex flex-col gap-2">
                {r.fights.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
                    <span className="font-semibold">{f.name}</span>
                    <span className="text-muted">{f.rounds} round{f.rounds === 1 ? "" : "s"} · {f.enemiesDown} down · {f.pcsDropped} dropped</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </>
  );
}

function Num({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-bg px-1 py-2">
      <dd className="font-heading text-xl font-bold leading-none">{value}</dd>
      <dt className="mt-1 text-[11px] text-muted">{label}</dt>
    </div>
  );
}

function mvpLine(h: RecapView["recap"]["heroes"][number] | undefined) {
  if (!h) return "";
  return [h.damage ? `${h.damage} damage` : null, h.healing ? `${h.healing} HP healed` : null, h.kills ? `${h.kills} foe${h.kills === 1 ? "" : "s"} down` : null].filter(Boolean).join(" · ");
}
