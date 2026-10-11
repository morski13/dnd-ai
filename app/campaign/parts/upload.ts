// Shrinks a picture in the browser (big maps → max 2400 px, WEBP) and uploads it with a small thumbnail.
async function load(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("Couldn't open that picture."));
      im.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function toBlob(img: HTMLImageElement, max: number, quality: number): Promise<{ blob: Blob; w: number; h: number }> {
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d")!.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve({ blob: b, w, h }) : reject(new Error("Couldn't convert the picture."))), "image/webp", quality));
}

export type UploadTarget = { folderId: string; title?: string; coverFor?: string; parentId?: string };

export async function uploadPicture(file: File, target: UploadTarget): Promise<{ id: string }> {
  if (!/^image\//.test(file.type)) throw new Error("Choose a picture (PNG, JPG or WEBP).");
  const img = await load(file);
  let main = await toBlob(img, 2400, 0.86);
  if (main.blob.size > 5.5 * 1024 * 1024) main = await toBlob(img, 1800, 0.8);
  const thumb = await toBlob(img, 480, 0.8);
  const form = new FormData();
  form.set("file", main.blob, "picture.webp");
  form.set("thumb", thumb.blob, "thumb.webp");
  form.set("folderId", target.folderId);
  form.set("title", target.title ?? file.name.replace(/\.[^.]+$/, "").slice(0, 120));
  form.set("w", String(main.w));
  form.set("h", String(main.h));
  if (target.coverFor) form.set("coverFor", target.coverFor);
  if (target.parentId) form.set("parentId", target.parentId);
  const res = await fetch("/api/vault/upload", { method: "POST", body: form });
  const data = await res.json().catch(() => ({ error: "Upload failed." }));
  if (!res.ok || data.error) throw new Error(data.error ?? "Upload failed.");
  return data as { id: string };
}

export const fileUrl = (id: string, thumb = false, v?: string) =>
  `/api/vault/file/${id}${thumb || v ? "?" : ""}${thumb ? "size=thumb" : ""}${thumb && v ? "&" : ""}${v ? `v=${encodeURIComponent(v)}` : ""}`;
