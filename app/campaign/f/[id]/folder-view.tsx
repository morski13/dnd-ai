"use client";
// A folder: pictures as a grid, documents as cards. Empty folders ask what to add first.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import type { VaultEntry } from "@/lib/vault-data";
import { TierBadge } from "../../../fights/tier";
import type { ShopSummary } from "@/lib/items-data";
import { BagIcon, DocIcon, EyeIcon, ImageIcon, LockIcon, PlusIcon } from "../../../components/icons";
import { createDoc, createPartyPages, deleteFolder, renameFolder, setStatus } from "../../actions";
import { FolderGlyph } from "../../parts/folder-icon";
import { fileUrl, uploadPicture } from "../../parts/upload";

type Def = { blurb: string; first: "doc" | "image"; newDocLabel: string };

export function FolderView({ folder, def, entries, canEdit, asPlayer, fights, shops = [] }: {
  folder: { id: string; kind: string; name: string }; def: Def; entries: VaultEntry[]; canEdit: boolean; asPlayer: boolean;
  fights: { id: string; name: string; tier: string | null }[]; shops?: ShopSummary[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(folder.name);
  const fileInput = useRef<HTMLInputElement>(null);
  const q = asPlayer ? "?view=player" : "";
  const images = entries.filter((e) => e.kind === "image");
  const docs = entries.filter((e) => e.kind === "doc");
  const goals = folder.kind === "goals";

  function newDoc() {
    setError(null);
    start(async () => {
      const r = await createDoc(folder.id);
      if ("error" in r) return setError(r.error);
      router.push(`/campaign/e/${r.id}`);
    });
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const list = Array.from(files).slice(0, 12);
    for (let i = 0; i < list.length; i++) {
      setUploading(list.length > 1 ? `Uploading ${i + 1} of ${list.length}…` : "Uploading…");
      try { await uploadPicture(list[i], { folderId: folder.id }); }
      catch (e) { setError((e as Error).message); break; }
    }
    setUploading(null);
    router.refresh();
  }

  const docLabel = def.newDocLabel;
  const addPicture = () => fileInput.current?.click();

  return (
    <>
      <header>
        <Link href={`/campaign${q}`} className="text-xs uppercase tracking-[0.12em] text-muted">← Campaign</Link>
        <div className="mt-1 flex items-center gap-3">
          <FolderGlyph kind={folder.kind} className="h-8 w-8 shrink-0 text-accent" />
          {renaming ? (
            <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await renameFolder(folder.id, name); if (r?.error) setError(r.error); setRenaming(false); router.refresh(); }); }}>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={60} aria-label="Folder name"
                className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-bg px-3 font-heading text-xl font-bold outline-none focus:border-accent" />
              <button className="h-11 rounded-xl bg-accent px-3 text-sm font-bold text-accent-text">Save</button>
            </form>
          ) : (
            <h1 className="font-heading text-3xl font-bold leading-tight">{folder.name}</h1>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">{def.blurb}</p>
        {canEdit && folder.kind === "custom" && !renaming && (
          <div className="mt-2 flex gap-3 text-xs">
            <button type="button" onClick={() => setRenaming(true)} className="text-muted underline">Rename</button>
            <button type="button" onClick={() => start(async () => { const r = await deleteFolder(folder.id); if (r?.error) setError(r.error); else router.push("/campaign"); })} className="text-muted underline">Delete folder</button>
          </div>
        )}
      </header>

      <input ref={fileInput} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void onFiles(e.target.files); e.target.value = ""; }} aria-label="Add pictures" />

      {canEdit && entries.length > 0 && (
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button type="button" disabled={pending} onClick={def.first === "image" ? addPicture : newDoc}
            className="flex h-12 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-accent-text">
            <PlusIcon className="h-5 w-5" />{def.first === "image" ? "Add pictures" : docLabel}
          </button>
          <button type="button" disabled={pending} onClick={def.first === "image" ? newDoc : addPicture}
            className="flex h-12 items-center justify-center gap-2 rounded-xl border border-line text-sm font-semibold text-soft">
            {def.first === "image" ? <><DocIcon className="h-5 w-5" />{docLabel}</> : <><ImageIcon className="h-5 w-5" />Add pictures</>}
          </button>
        </div>
      )}
      {canEdit && folder.kind === "party" && <PartyPages folderId={folder.id} />}
      {uploading && <p className="mt-3 text-sm text-accent" role="status">{uploading}</p>}
      {error && <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      {/* Empty folder: ask what to add */}
      {entries.length === 0 && (
        canEdit ? (
          <section className="animate-rise mt-6 rounded-[18px] border border-dashed border-[#5A4024] bg-accent-surface p-5 text-center">
            <FolderGlyph kind={folder.kind} className="mx-auto h-10 w-10 text-accent" />
            <p className="mt-3 font-heading text-xl font-semibold">This folder is empty</p>
            <p className="mt-1 text-sm text-soft">{def.first === "image" ? "Start with a picture (maps, portraits, handouts), or write something." : "Start with a document, or add a picture."}</p>
            <div className="mt-4 flex flex-col gap-2">
              {def.first === "image" ? (
                <>
                  <button type="button" onClick={addPicture} className="h-12 rounded-xl bg-accent font-bold text-accent-text">Upload a picture</button>
                  <button type="button" onClick={newDoc} disabled={pending} className="h-12 rounded-xl border border-line font-semibold text-soft">{docLabel}</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={newDoc} disabled={pending} className="h-12 rounded-xl bg-accent font-bold text-accent-text">{pending ? "Creating…" : docLabel}</button>
                  <button type="button" onClick={addPicture} className="h-12 rounded-xl border border-line font-semibold text-soft">Upload a picture</button>
                </>
              )}
            </div>
          </section>
        ) : (
          <p className="mt-6 rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">Nothing here yet.</p>
        )
      )}

      {/* Pictures */}
      {images.length > 0 && (
        <section className="mt-6" aria-label="Pictures">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">Pictures</p>
          <ul className="mt-2 grid grid-cols-2 gap-2">
            {images.map((e, i) => (
              <li key={e.id} className="animate-rise" style={{ "--i": i } as React.CSSProperties}>
                <Link href={`/campaign/e/${e.id}${q}`} className="group relative block overflow-hidden rounded-xl border border-line bg-surface">
                  {/* eslint-disable-next-line @next/next/no-img-element -- private picture served by our own route */}
                  <img src={fileUrl(e.id, true, e.updatedAt)} alt={e.title} loading="lazy" className="aspect-[4/3] w-full object-cover transition-transform group-active:scale-[1.02]" />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 text-xs font-semibold">{e.title}</span>
                  {canEdit && <ShareBadge shared={e.shared} />}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Documents */}
      {docs.length > 0 && (
        <section className="mt-6" aria-label="Documents">
          <p className="text-xs uppercase tracking-[0.12em] text-muted">{goals ? "Goals & milestones" : "Documents"}</p>
          <ul className="mt-2 space-y-2">
            {docs.map((e, i) => (
              <li key={e.id} className="animate-rise flex items-stretch gap-2" style={{ "--i": i } as React.CSSProperties}>
                {goals && <GoalCheck entry={e} canEdit={canEdit} />}
                <Link href={`/campaign/e/${e.id}${q}`} className="flex min-w-0 flex-1 gap-3 rounded-2xl border border-line bg-surface p-3 active:border-accent">
                  {e.hasImage ? (
                    // eslint-disable-next-line @next/next/no-img-element -- private picture served by our own route
                    <img src={fileUrl(e.id, true, e.updatedAt)} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-surface-2"><FolderGlyph kind={folder.kind} className="h-6 w-6 text-muted" /></span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={`block font-semibold leading-snug ${e.status === "done" ? "text-muted line-through" : ""}`}>{e.title}</span>
                    <span className="mt-0.5 line-clamp-2 text-sm text-muted">{e.snippet || "Empty document"}</span>
                  </span>
                  {canEdit && (e.shared ? <EyeIcon className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <LockIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />)}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Shops: the real shops (stock, prices, open for players) */}
      {folder.kind === "shops" && (canEdit || shops.length > 0) && (
        <section className="mt-6" aria-label="Shops">
          <div className="flex items-baseline justify-between">
            <p className="text-xs uppercase tracking-[0.12em] text-muted">{canEdit ? "Shops with stock & prices" : "Open shops"}</p>
            {canEdit && <Link href="/items?tab=shops" className="text-sm text-accent underline">New shop</Link>}
          </div>
          {shops.length === 0 ? <p className="mt-2 text-sm text-muted">No shops yet. Shops stay secret until you open them for the players.</p> : (
            <ul className="mt-2 flex flex-col gap-2">
              {shops.map((s) => (
                <li key={s.id}>
                  <Link href={`/shop/${s.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 active:border-accent">
                    <BagIcon className="h-6 w-6 shrink-0 text-accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{s.name}</span>
                      <span className="block text-xs text-muted">{s.stock} item{s.stock === 1 ? "" : "s"}{s.keeper ? ` · ${s.keeper}` : ""}</span>
                    </span>
                    {canEdit && <ShareBadgeInline open={s.isOpen} />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Fights: the ones planned in the Fight planner */}
      {folder.kind === "fights" && canEdit && (
        <section className="mt-6">
          <div className="flex items-baseline justify-between">
            <p className="text-xs uppercase tracking-[0.12em] text-muted">Planned in the Fight planner</p>
            <Link href="/fights" className="text-sm text-accent underline">Plan a fight</Link>
          </div>
          {fights.length === 0 ? <p className="mt-2 text-sm text-muted">No planned fights yet.</p> : (
            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
              {fights.map((f) => (
                <li key={f.id}><Link href={`/fights/${f.id}`} className="flex items-center justify-between gap-3 px-4 py-3"><span className="font-semibold">{f.name}</span>{f.tier && <TierBadge tier={f.tier} />}</Link></li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

function ShareBadgeInline({ open }: { open: boolean }) {
  return (
    <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${open ? "bg-success-bg text-success" : "bg-bg text-muted"}`}>
      {open ? <EyeIcon className="h-3 w-3" /> : <LockIcon className="h-3 w-3" />}{open ? "Open" : "Secret"}
    </span>
  );
}

function ShareBadge({ shared }: { shared: boolean }) {
  return (
    <span className={`absolute right-1.5 top-1.5 flex h-6 items-center gap-1 rounded-full px-2 text-[10px] font-bold ${shared ? "bg-success-bg text-success" : "bg-black/60 text-soft"}`}>
      {shared ? <EyeIcon className="h-3 w-3" /> : <LockIcon className="h-3 w-3" />}{shared ? "Shared" : "Secret"}
    </span>
  );
}

function GoalCheck({ entry, canEdit }: { entry: VaultEntry; canEdit: boolean }) {
  const router = useRouter();
  const [status, setLocal] = useState(entry.status ?? "open");
  const [, start] = useTransition();
  const done = status === "done";
  return (
    <button type="button" role="checkbox" aria-checked={done} aria-label={`${entry.title}: ${done ? "done" : "not done yet"}`} disabled={!canEdit}
      onClick={() => { const next = done ? "open" : "done"; setLocal(next); start(async () => { await setStatus(entry.id, next); router.refresh(); }); }}
      className={`flex w-12 shrink-0 items-center justify-center rounded-2xl border ${done ? "border-success-line bg-success-bg text-success" : "border-line bg-surface text-muted"}`}>
      <span className={`flex h-6 w-6 items-center justify-center rounded-md border-2 ${done ? "animate-pop border-success bg-success text-bg" : "border-current"}`}>
        {done && <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={3}><path d="m5 12 5 5 9-10" /></svg>}
      </span>
    </button>
  );
}

/** Player characters folder: one tap makes a backstory page for every character without one. */
function PartyPages({ folderId }: { folderId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="mt-4 rounded-2xl border border-[#5A4024] bg-accent-surface p-3">
      <p className="text-sm text-soft">Backstories, family and bonds written here join the mind map: each page becomes part of that character&apos;s box.</p>
      <button type="button" disabled={pending} onClick={() => start(async () => {
        const r = await createPartyPages(folderId);
        if ("error" in r) setNote(r.error);
        else { setNote(r.made ? `Made ${r.made} page${r.made === 1 ? "" : "s"}.` : "Every character already has a page."); router.refresh(); }
      })} className="mt-2 h-11 w-full rounded-xl bg-accent text-sm font-bold text-accent-text">
        {pending ? "Making pages…" : "Make a page for each character"}
      </button>
      {note && <p className="mt-2 text-sm text-soft" role="status">{note}</p>}
    </div>
  );
}
