"use client";
// A round token picture. Tap it to upload a new one (your character, or a monster if you're the DM).
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { load } from "@/app/campaign/parts/upload";

/** A square crop from the middle of a picture, 384 px WEBP: plenty for a token. */
export async function squarePortrait(file: File): Promise<Blob> {
  if (!/^image\//.test(file.type)) throw new Error("Choose a picture (PNG, JPG or WEBP).");
  const img = await load(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const c = document.createElement("canvas");
  c.width = c.height = Math.min(384, side);
  c.getContext("2d")!.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, c.width, c.height);
  return new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't convert the picture."))), "image/webp", 0.86));
}

/** Upload a prepared picture as a character's or monster's token picture. */
export async function sendPortrait(kind: "character" | "monster", id: string, blob: Blob): Promise<number> {
  const form = new FormData();
  form.set("file", blob, "portrait.webp");
  const r = await fetch(`/api/portrait/${kind}/${id}`, { method: "POST", body: form });
  const data = await r.json().catch(() => ({ error: "Upload failed." }));
  if (!r.ok || data.error) throw new Error(data.error ?? "Upload failed.");
  return data.portrait as number;
}

export async function uploadPortrait(kind: "character" | "monster", id: string, file: File): Promise<number> {
  return sendPortrait(kind, id, await squarePortrait(file));
}

export function PortraitButton({ kind, id, name, src, canEdit, size = 56 }: {
  kind: "character" | "monster"; id: string; name: string; src: string | null; canEdit: boolean; size?: number;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(src);
  const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const face = (
    <span className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-accent-line bg-accent-surface font-heading font-bold text-accent"
      style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {shown ? <img src={shown} alt="" className="h-full w-full object-cover" /> : initials}
      {busy && <span className="absolute inset-0 animate-pulse bg-bg/60" />}
    </span>
  );
  if (!canEdit) return face;
  return (
    <span className="flex flex-col items-center">
      <button type="button" onClick={() => input.current?.click()} disabled={busy} aria-label={`Change ${name}'s token picture`} title="Token picture (for the battle map)" className="relative">
        {face}
        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] text-accent-text" aria-hidden>✎</span>
      </button>
      <input ref={input} type="file" accept="image/*" className="hidden" aria-label="Token picture file"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true); setError(null);
          try {
            const stamp = await uploadPortrait(kind, id, f);
            setShown(`/api/portrait/${kind}/${id}?v=${stamp}`);
            router.refresh();
          } catch (err) { setError((err as Error).message); }
          setBusy(false);
        }} />
      {error && <span className="mt-1 max-w-32 text-center text-[11px] text-danger">{error}</span>}
    </span>
  );
}
