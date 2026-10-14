"use client";
// The DM's map list: add (picture or plain grid), change the grid, use in the running fight, delete.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { MapRow } from "@/lib/maps-data";
import { load, toBlob } from "../campaign/parts/upload";
import { setFightMap } from "../session/map-actions";
import { createPlainMap, deleteMap, updateMap } from "./actions";
import { GridEditor, type Picture } from "./grid-editor";

type Item = MapRow & { image: string | null };
type Editing =
  | { kind: "new"; picture: Picture | null; blob: Blob | null; name: string }
  | { kind: "edit"; map: Item; picture: Picture | null };

export function MapLibrary({ maps, fightId, inFight }: { maps: Item[]; fightId: string | null; inFight: string | null }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { if (editing) top.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, [editing]);

  async function pick(f: File) {
    setError(null);
    if (!/^image\//.test(f.type)) return setError("Choose a picture (PNG, JPG or WEBP).");
    setBusy(true);
    try {
      const img = await load(f);
      let out = await toBlob(img, 2400, 0.86);
      if (out.blob.size > 7.5 * 1024 * 1024) out = await toBlob(img, 1800, 0.8);
      setEditing({ kind: "new", blob: out.blob, picture: { src: URL.createObjectURL(out.blob), w: out.w, h: out.h }, name: f.name.replace(/\.[^.]+$/, "").slice(0, 80) });
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  function act(fn: () => Promise<unknown>, done?: () => void) {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r && typeof r === "object" && "error" in r) return setError(String((r as { error: string }).error));
      done?.();
      router.refresh();
    });
  }

  if (editing) {
    const isNew = editing.kind === "new";
    return (
      <div ref={top} className="mt-6 scroll-mt-4">
        <h2 className="font-heading text-xl font-semibold">{isNew ? (editing.picture ? "Fit the squares" : "Plain grid") : `Edit ${editing.map.name}`}</h2>
        <div className="mt-3">
          <GridEditor
            picture={editing.picture}
            initial={editing.kind === "edit" ? { cols: editing.map.cols, rows: editing.map.rows, crop: editing.map.crop ?? { x: 0, y: 0, w: editing.map.cols, h: editing.map.rows }, stretch: editing.map.stretch } : null}
            name={isNew ? editing.name : editing.map.name}
            feet={isNew ? 5 : editing.map.feet}
            saving={busy || pending}
            saveLabel={isNew ? "Save map" : "Save changes"}
            onCancel={() => setEditing(null)}
            onSave={async ({ fit, name, feet }) => {
              setError(null);
              if (editing.kind === "edit") return act(() => updateMap(editing.map.id, { fit, name, feet }), () => setEditing(null));
              if (!editing.blob || !editing.picture) {
                return act(async () => {
                  const r = await createPlainMap(name, fit.cols, fit.rows);
                  if ("error" in r) return r;
                  if (feet !== 5) await updateMap(r.id, { feet });
                }, () => setEditing(null));
              }
              setBusy(true);
              try {
                const form = new FormData();
                form.set("file", editing.blob, "map.webp");
                form.set("w", String(editing.picture.w));
                form.set("h", String(editing.picture.h));
                form.set("fit", JSON.stringify(fit));
                form.set("name", name);
                form.set("feet", String(feet));
                const res = await fetch("/api/maps/upload", { method: "POST", body: form });
                const data = await res.json().catch(() => ({ error: "Upload failed." }));
                if (!res.ok || data.error) throw new Error(data.error ?? "Upload failed.");
                setEditing(null);
                router.refresh();
              } catch (e) { setError((e as Error).message); }
              setBusy(false);
            }}
          />
        </div>
        {error && <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" disabled={busy} onClick={() => file.current?.click()} className="h-12 rounded-xl bg-accent font-bold text-accent-text disabled:opacity-50">
          {busy ? "Opening…" : "Upload a map"}
        </button>
        <button type="button" onClick={() => setEditing({ kind: "new", picture: null, blob: null, name: "Plain grid" })} className="h-12 rounded-xl border border-line font-semibold text-soft">
          Plain grid
        </button>
      </div>
      <input ref={file} type="file" accept="image/*" className="hidden" aria-label="Map picture" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pick(f); }} />
      {error && <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      {!fightId && maps.length > 0 && <p className="mt-3 text-xs text-muted">Start a fight in Session mode to put a map in it (or pick it there under DM tools).</p>}

      <ul className="mt-5 flex flex-col gap-3">
        {maps.length === 0 && <li className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">No maps yet. Upload a picture of your battle map: the app finds the squares painted on it, or you set them.</li>}
        {maps.map((m) => (
          <li key={m.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
            {m.image
              ? <img src={m.image} alt="" className="h-36 w-full object-cover" />
              : <div className="h-24 w-full" style={{ backgroundImage: "linear-gradient(var(--color-line) 1px, transparent 1px), linear-gradient(90deg, var(--color-line) 1px, transparent 1px)", backgroundSize: "16px 16px" }} />}
            <div className="p-3">
              <p className="font-bold">{m.name} {inFight === m.id && <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-text">in this fight</span>}</p>
              <p className="text-xs text-muted">{m.cols} × {m.rows} squares · {m.cols * m.feet} × {m.rows * m.feet} ft{m.stretch ? " · stretched" : ""}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {fightId && inFight !== m.id && (
                  <button type="button" disabled={pending} onClick={() => act(() => setFightMap(m.id), () => router.push("/session"))}
                    className="h-10 rounded-xl bg-accent px-3 text-sm font-bold text-accent-text">Use in this fight</button>
                )}
                <button type="button" onClick={() => setEditing({ kind: "edit", map: m, picture: m.image && m.image_w && m.image_h ? { src: m.image, w: m.image_w, h: m.image_h } : null })}
                  className="h-10 rounded-xl border border-line px-3 text-sm text-soft">Edit grid</button>
                <button type="button" disabled={pending} onClick={() => { if (confirm(`Delete ${m.name}?`)) act(() => deleteMap(m.id)); }}
                  className="h-10 rounded-xl border border-danger-line px-3 text-sm text-danger">Delete</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
