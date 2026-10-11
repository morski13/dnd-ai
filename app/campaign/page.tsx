// Campaign page: the DM's organized folders (NPCs, Maps, Towns, Shops, Fights, Goals…).
// Players see only what the DM has shared.
import Link from "next/link";
import { Suspense } from "react";
import { itemsSummary } from "@/lib/items-data";
import { getReading } from "@/lib/reader-data";
import { getVault, type VaultEntry } from "@/lib/vault-data";
import { folderDef } from "@/lib/vault/folders";
import { BottomNav } from "../components/bottom-nav";
import { BagIcon, DocIcon, ImageIcon, LockIcon, SearchIcon } from "../components/icons";
import { FolderGlyph } from "./parts/folder-icon";
import { MindMap } from "./parts/mind-map";
import { Story } from "./parts/story";
import { NewFolder } from "./parts/new-folder";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default function CampaignPage({ searchParams }: { searchParams: SP }) {
  return (
    <>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pt-8 pb-28">
        <Suspense fallback={<div className="animate-pulse space-y-4"><div className="h-10 w-56 rounded bg-surface" /><div className="h-11 rounded-xl bg-surface" /><div className="grid grid-cols-2 gap-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-32 rounded-2xl bg-surface" />)}</div></div>}>
          <Campaign searchParams={searchParams} />
        </Suspense>
      </main>
      <BottomNav active="campaign" />
    </>
  );
}

async function Campaign({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const asPlayer = sp.view === "player";
  const tab = sp.tab === "map" || sp.tab === "story" ? sp.tab : "folders";
  const data = await getVault(tab === "folders" ? q : "");
  if (!data.campaign) {
    return <p className="text-sm text-muted">Join a campaign first on the <Link href="/" className="text-accent underline">Home</Link> screen.</p>;
  }
  const playerView = !data.isDm || asPlayer;
  const v = asPlayer ? "&view=player" : "";
  const folders = playerView && data.isDm ? data.folders.filter((f) => f.shared > 0) : data.folders;
  const results = data.results && asPlayer ? data.results.filter((r) => r.shared) : data.results;
  const items = await itemsSummary(data.supabase, data.campaign.id, data.isDm && !asPlayer);

  return (
    <>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Campaign</p>
          <h1 className="mt-1 font-heading text-3xl font-bold leading-tight">{data.campaign.name}</h1>
        </div>
        {data.isDm && (
          <Link href={tabHref(tab, !asPlayer)} className={`mt-1 shrink-0 rounded-xl border px-3 py-2 text-sm ${asPlayer ? "border-accent bg-accent-surface text-accent" : "border-line text-soft"}`}>
            {asPlayer ? "DM view" : "Player view"}
          </Link>
        )}
      </header>

      {asPlayer && (
        <p className="mt-4 rounded-xl border border-[#5A4024] bg-accent-surface px-3 py-2 text-sm text-soft">
          You&apos;re seeing exactly what your players see: only shared things, with every DM-only part removed.
        </p>
      )}

      <nav className="mt-5 flex border-b border-line" aria-label="Campaign views">
        {(["folders", "map", "story"] as const).map((t) => (
          <Link key={t} href={tabHref(t, asPlayer)} aria-current={tab === t ? "page" : undefined}
            className={`-mb-px flex h-11 flex-1 items-center justify-center border-b-2 text-[15px] ${tab === t ? "border-accent font-bold text-accent" : "border-transparent text-soft"}`}>
            {t === "folders" ? "Folders" : t === "map" ? "Mind map" : playerView ? "Quests" : "Story"}
          </Link>
        ))}
      </nav>

      {tab !== "folders" ? (
        <div className="mt-5">
          <Suspense fallback={<div className="animate-pulse space-y-3"><div className="h-8 w-64 rounded bg-surface" /><div className="h-[440px] rounded-[18px] bg-surface" /></div>}>
            <Reading tab={tab} asPlayer={asPlayer} />
          </Suspense>
        </div>
      ) : (<>
      <form action="/campaign" className="mt-5 flex items-center gap-2 rounded-xl border border-line bg-surface px-3" role="search">
        <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
        <input name="q" defaultValue={q} placeholder={playerView ? "Search what the DM shared" : "Search all your notes"} aria-label="Search"
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
        {asPlayer && <input type="hidden" name="view" value="player" />}
      </form>

      {!results && <ItemsStrip isDm={data.isDm && !asPlayer} openShops={items.openShops} pending={items.pending} />}

      {results ? (
        <Results results={results} q={q} isDm={data.isDm && !asPlayer} v={v} />
      ) : folders.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line p-6 text-center">
          <p className="font-semibold">Nothing shared yet</p>
          <p className="mt-1 text-sm text-muted">When the DM shares maps, NPCs or handouts, they show up here.</p>
        </div>
      ) : (
        <section className="mt-5 grid grid-cols-2 gap-3" aria-label="Folders">
          {folders.map((f, i) => {
            const count = playerView && data.isDm ? f.shared : f.count;
            const covers = playerView && data.isDm ? f.sharedCovers : f.covers;
            return (
              <Link key={f.id} href={`/campaign/f/${f.id}${asPlayer ? "?view=player" : ""}`}
                className="animate-rise group relative flex min-h-36 flex-col overflow-hidden rounded-2xl border border-line bg-surface p-4 active:border-accent"
                style={{ "--i": i } as React.CSSProperties}>
                {covers.length > 0 && (
                  <span className="pointer-events-none absolute inset-x-0 top-0 flex h-16 gap-0.5 opacity-35" aria-hidden>
                    {covers.map((id) => (
                      // eslint-disable-next-line @next/next/no-img-element -- private picture served by our own route
                      <img key={id} src={`/api/vault/file/${id}?size=thumb`} alt="" className="h-full flex-1 object-cover" loading="lazy" />
                    ))}
                    <span className="absolute inset-0 bg-gradient-to-b from-transparent to-surface" />
                  </span>
                )}
                <FolderGlyph kind={f.kind} className="relative h-7 w-7 text-accent" />
                <p className="relative mt-auto pt-4 font-bold leading-snug">{f.name}</p>
                <p className="relative mt-1 text-xs text-muted">
                  {count === 0 ? (data.isDm && !asPlayer ? folderDef(f.kind).blurb : "Empty") : `${count} item${count === 1 ? "" : "s"}`}
                </p>
                {data.isDm && !asPlayer && count > 0 && f.shared === 0 && (
                  <LockIcon className="absolute right-3 top-3 h-4 w-4 text-muted" />
                )}
              </Link>
            );
          })}
          {data.isDm && !asPlayer && <NewFolder />}
        </section>
      )}
      </>)}
    </>
  );
}

function tabHref(tab: string, player: boolean) {
  const p = new URLSearchParams();
  if (tab !== "folders") p.set("tab", tab);
  if (player) p.set("view", "player");
  const s = p.toString();
  return "/campaign" + (s ? "?" + s : "");
}

/** Mind map and story: what the reader found in the notes (players: only what was shared). */
async function Reading({ tab, asPlayer }: { tab: "map" | "story"; asPlayer: boolean }) {
  const { analysis, playerView, isDm, ai } = await getReading(asPlayer);
  if (!analysis) return null;
  const q = asPlayer ? "?view=player" : "";
  return tab === "map"
    ? <MindMap analysis={analysis} showSecrets={!playerView} q={q} ai={ai} />
    : <Story analysis={analysis} isDm={isDm && !playerView} q={q} />;
}

function ItemsStrip({ isDm, openShops, pending }: { isDm: boolean; openShops: { id: string; name: string }[]; pending: number }) {
  return (
    <section className="mt-4 flex flex-col gap-2" aria-label="Items and shops">
      <Link href="/items" className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 active:border-accent">
        <BagIcon className="h-6 w-6 shrink-0 text-accent" />
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{isDm ? "Items, shops & loot" : "Homebrew items"}</span>
          <span className="block text-xs text-muted">{isDm ? "Give items and coins, run shops, loot tables, custom items" : "Invent an item and ask your DM to approve it"}</span>
        </span>
        {isDm && pending > 0 && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-text">{pending} new</span>}
      </Link>
      {openShops.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#5A4024] bg-accent-surface px-3 py-2">
          <span className="text-xs uppercase tracking-[0.12em] text-accent">Open now</span>
          {openShops.map((s) => <Link key={s.id} href={`/shop/${s.id}`} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-bold text-accent-text">{s.name}</Link>)}
        </div>
      )}
    </section>
  );
}

function Results({ results, q, isDm, v }: { results: VaultEntry[]; q: string; isDm: boolean; v: string }) {
  return (
    <section className="mt-5">
      <div className="flex items-baseline justify-between">
        <p className="text-sm text-muted">{results.length} result{results.length === 1 ? "" : "s"} for “{q}”</p>
        <Link href={`/campaign${v ? "?view=player" : ""}`} className="text-sm text-accent underline">Clear</Link>
      </div>
      <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
        {results.map((r) => (
          <li key={r.id}>
            <Link href={`/campaign/e/${r.id}${v ? "?view=player" : ""}`} className="flex items-start gap-3 px-4 py-3">
              {r.kind === "image" ? <ImageIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" /> : <DocIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />}
              <span className="min-w-0">
                <span className="block font-semibold">{r.title}</span>
                {r.snippet && <span className="block truncate text-sm text-muted">{r.snippet}</span>}
              </span>
              {isDm && !r.shared && <LockIcon className="ml-auto mt-1 h-4 w-4 shrink-0 text-muted" />}
            </Link>
          </li>
        ))}
        {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">Nothing found.</li>}
      </ul>
    </section>
  );
}
