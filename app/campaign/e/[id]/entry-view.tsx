"use client";
// A document (editor for the DM, reader for players) or a picture (zoomable).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { DocNode } from "@/lib/vault/doc";
import { EyeIcon, ImageIcon, LockIcon } from "../../../components/icons";
import { deleteEntry, moveEntry, renameEntry, setShared, setStatus } from "../../actions";
import { DocEditor, DocReader } from "../../parts/editor";
import { fileUrl, uploadPicture } from "../../parts/upload";

type Entry = {
  id: string; kind: "doc" | "image"; title: string; shared: boolean; status: string | null; hasImage: boolean;
  imageW: number | null; imageH: number | null; updatedAt: string; folder: { id: string; kind: string; name: string };
};

export function EntryView({ entry, doc, secrets, canEdit, asPlayer, folders }: {
  entry: Entry; doc: DocNode | null; secrets: boolean; canEdit: boolean; asPlayer: boolean; folders: { id: string; name: string }[];
}) {
  const q = asPlayer ? "?view=player" : "";
  const [zoom, setZoom] = useState(false);
  const [coverV, setCoverV] = useState(entry.updatedAt);
  const [hasCover, setHasCover] = useState(entry.hasImage);
  return (
    <>
      <Link href={`/campaign/f/${entry.folder.id}${q}`} className="text-xs uppercase tracking-[0.12em] text-muted">← {entry.folder.name}</Link>

      {canEdit && <DmBar entry={entry} secrets={secrets} folders={folders} onCover={(v) => { setHasCover(true); setCoverV(v); }} />}

      {entry.kind === "image" ? (
        <>
          {canEdit ? <ImageTitle entry={entry} /> : <h1 className="mt-2 font-heading text-3xl font-bold leading-tight">{entry.title}</h1>}
          <button type="button" onClick={() => setZoom(true)} className="mt-3 block w-full overflow-hidden rounded-2xl border border-line bg-surface-2" aria-label="Open full screen">
            {/* eslint-disable-next-line @next/next/no-img-element -- private picture served by our own route */}
            <img src={fileUrl(entry.id, false, coverV)} alt={entry.title} className="w-full" style={entry.imageW && entry.imageH ? { aspectRatio: `${entry.imageW} / ${entry.imageH}` } : undefined} />
          </button>
          <p className="mt-2 text-center text-xs text-muted">Tap to open full screen and zoom</p>
          {zoom && <Zoom src={fileUrl(entry.id, false, coverV)} title={entry.title} onClose={() => setZoom(false)} />}
        </>
      ) : (
        <>
          {hasCover && (
            <button type="button" onClick={() => setZoom(true)} className="mt-3 block w-full overflow-hidden rounded-2xl border border-line" aria-label="Open picture full screen">
              {/* eslint-disable-next-line @next/next/no-img-element -- private picture served by our own route */}
              <img src={fileUrl(entry.id, false, coverV)} alt="" className="max-h-72 w-full object-cover" />
            </button>
          )}
          {zoom && <Zoom src={fileUrl(entry.id, false, coverV)} title={entry.title} onClose={() => setZoom(false)} />}
          <div className="mt-4">
            {canEdit ? (
              <DocEditor entryId={entry.id} folderId={entry.folder.id} initialTitle={entry.title} initialDoc={doc} />
            ) : (
              <article className="animate-rise">
                <DocReader doc={doc} />
              </article>
            )}
          </div>
        </>
      )}
    </>
  );
}

function DmBar({ entry, secrets, folders, onCover }: { entry: Entry; secrets: boolean; folders: { id: string; name: string }[]; onCover: (v: string) => void }) {
  const router = useRouter();
  const [shared, setLocalShared] = useState(entry.shared);
  const [status, setLocalStatus] = useState(entry.status);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const coverInput = useRef<HTMLInputElement>(null);

  return (
    <div className="mt-3 space-y-2">
      <button type="button" role="switch" aria-checked={shared} disabled={pending}
        onClick={() => { const next = !shared; setLocalShared(next); start(async () => { const r = await setShared(entry.id, next); if (r?.error) { setError(r.error); setLocalShared(!next); } router.refresh(); }); }}
        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${shared ? "border-success-line bg-success-bg" : "border-line bg-surface"}`}>
        {shared ? <EyeIcon className="h-5 w-5 shrink-0 text-success" /> : <LockIcon className="h-5 w-5 shrink-0 text-muted" />}
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-bold ${shared ? "text-success" : ""}`}>{shared ? "Shown to players" : "Secret (only you)"}</span>
          <span className="block text-xs text-muted">{shared ? (secrets ? "DM-only parts stay hidden from them." : "Players can open this now.") : "Tap to show it to your players."}</span>
        </span>
        <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${shared ? "bg-success" : "bg-line"}`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-text shadow transition-[left] duration-200 ${shared ? "left-6" : "left-1"}`} />
        </span>
      </button>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        {entry.folder.kind === "goals" && (
          <select aria-label="Goal status" value={status ?? "open"} className="h-9 rounded-lg border border-line bg-bg px-2 text-soft"
            onChange={(e) => { const v = e.target.value as "open" | "done" | "failed"; setLocalStatus(v); start(async () => { await setStatus(entry.id, v); router.refresh(); }); }}>
            <option value="open">Not done yet</option><option value="done">Done</option><option value="failed">Failed / skipped</option>
          </select>
        )}
        {entry.kind === "doc" && (
          <>
            <button type="button" onClick={() => coverInput.current?.click()} className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-2.5 text-soft">
              <ImageIcon className="h-4 w-4" />{busy ?? (entry.hasImage ? "Change picture" : "Add picture")}
            </button>
            <input ref={coverInput} type="file" accept="image/*" className="sr-only" aria-label="Cover picture" onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setBusy("Uploading…");
              try { await uploadPicture(f, { folderId: entry.folder.id, coverFor: entry.id }); onCover(String(Date.now())); router.refresh(); }
              catch (err) { setError((err as Error).message); }
              setBusy(null);
            }} />
          </>
        )}
        <select aria-label="Move to folder" value="" className="h-9 rounded-lg border border-line bg-bg px-2 text-soft"
          onChange={(e) => { const id = e.target.value; if (!id) return; start(async () => { const r = await moveEntry(entry.id, id); if (r?.error) setError(r.error); else router.push(`/campaign/f/${id}`); }); }}>
          <option value="">Move to…</option>
          {folders.filter((f) => f.id !== entry.folder.id).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <button type="button" className="ml-auto h-9 rounded-lg px-2 text-xs text-muted underline" onClick={() => {
          if (!confirm(`Delete "${entry.title}"? This can't be undone.`)) return;
          start(async () => { const r = await deleteEntry(entry.id); if ("error" in r) setError(r.error); else router.push(`/campaign/f/${r.folderId}`); });
        }}>Delete</button>
      </div>
      {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}

function ImageTitle({ entry }: { entry: Entry }) {
  const [title, setTitle] = useState(entry.title);
  const [, start] = useTransition();
  return (
    <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-label="Title"
      onBlur={() => title !== entry.title && start(async () => { await renameEntry(entry.id, title); })}
      className="mt-3 w-full bg-transparent font-heading text-3xl font-bold leading-tight outline-none" />
  );
}

/** Full-screen picture: pinch or use the buttons to zoom, drag to look around. */
function Zoom({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black/95" role="dialog" aria-label={title} aria-modal="true">
      <div className="flex items-center gap-2 px-4 py-3">
        <p className="min-w-0 flex-1 truncate font-semibold">{title}</p>
        {[1, 2, 4].map((z) => (
          <button key={z} type="button" onClick={() => setScale(z)} className={`h-9 w-11 rounded-lg text-sm font-bold ${scale === z ? "bg-accent text-accent-text" : "bg-surface text-soft"}`}>{z}×</button>
        ))}
        <button type="button" onClick={onClose} className="h-9 rounded-lg bg-surface px-3 text-sm" aria-label="Close">Close</button>
      </div>
      <div className="flex-1 overflow-auto" style={{ touchAction: "pan-x pan-y pinch-zoom" }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- private picture served by our own route */}
        <img src={src} alt={title} className="mx-auto max-w-none" style={{ width: `${scale * 100}%` }} />
      </div>
    </div>
  );
}
