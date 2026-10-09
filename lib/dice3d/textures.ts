// Paints the faces of the dice (color, pattern, number, pictures) on small canvases.
// Every face of one die type has the same shape, so we paint one picture per number and reuse it.
import { labelText, makeShape, maxValue, type DieType, type Shape, type V3 } from "./shapes";
import { seeded } from "./sim";
import type { DiceSkin, Font } from "./skin";

export const TEX = 256;
type P2 = [number, number]; // texture coords, 0..1, v pointing up

// ---------------------------------------------------------------------------
// Face layouts

export type Layout = {
  poly: P2[];              // the face outline in texture space (counter-clockwise)
  label: P2;               // where the number goes
  fontScale: number;       // number size, as a share of the texture
};

const layoutCache = new Map<DieType, Layout>();

/** The outline every face of this die type uses on its texture. */
export function faceLayout(type: DieType): Layout {
  const hit = layoutCache.get(type);
  if (hit) return hit;
  const shape = makeShape(type);
  const face = shape.faces[0];
  const order = rotatedVerts(shape, 0);
  // Flatten the 3D face into 2D: x along the face, y toward the first corner.
  const c = face.centroid;
  const first = sub(shape.vertices[order[0]], c);
  const up = normalize(first);
  const right = cross(up, face.normal);
  const pts = order.map((i) => { const d = sub(shape.vertices[i], c); return [dot(d, right), dot(d, up)] as P2; });
  // Fit inside the texture with a small margin
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
  const s = 0.94 / Math.max(w, h);
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const poly = pts.map(([x, y]) => [0.5 + (x - cx) * s, 0.5 + (y - cy) * s] as P2);
  // Kites (d10): number sits a bit toward the wide end
  const label: P2 = type === "d10" || type === "d100" ? [0.5, 0.5 + (0 - cy) * s - 0.06] : [0.5 + (0 - cx) * s, 0.5 + (0 - cy) * s];
  const fontScale = { d4: 0.2, d6: 0.42, d8: 0.3, d10: 0.28, d100: 0.22, d12: 0.3, d20: 0.24 }[type];
  const layout = { poly, label, fontScale };
  layoutCache.set(type, layout);
  return layout;
}

/**
 * The corners of face `fi`, starting from the one that matches corner 0 of the shared layout.
 * For d10 kites that is the sharp tip; for other dice any corner works (regular faces).
 */
export function rotatedVerts(shape: Shape, fi: number): number[] {
  const verts = shape.faces[fi].verts;
  if (shape.type === "d10" || shape.type === "d100") {
    const tip = verts.findIndex((v) => v === 0 || v === 1); // the two tips are vertices 0 and 1
    return [...verts.slice(tip), ...verts.slice(0, tip)];
  }
  return verts;
}

// ---------------------------------------------------------------------------
// Painting

const FONT_FAMILY: Record<Font, () => string> = {
  classic: () => cssVar("--font-spectral", "Georgia, serif"),
  modern: () => cssVar("--font-manrope", "system-ui, sans-serif"),
  storybook: () => "Georgia, 'Times New Roman', serif",
  typewriter: () => "'Courier New', Courier, monospace",
};

function cssVar(name: string, fallback: string) {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

const toCanvas = ([u, v]: P2): P2 => [u * TEX, (1 - v) * TEX];

function polyPath(ctx: CanvasRenderingContext2D, poly: P2[]) {
  ctx.beginPath();
  poly.map(toCanvas).forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (amt > 0 ? (255 - c) * amt : c * amt))));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function paintPattern(ctx: CanvasRenderingContext2D, skin: DiceSkin, seed: number) {
  const r = seeded(seed * 9973 + 17);
  const S = TEX;
  ctx.save();
  ctx.fillStyle = skin.body;
  ctx.fillRect(0, 0, S, S);
  const A = skin.accent;
  switch (skin.pattern) {
    case "gradient": {
      const g = ctx.createLinearGradient(0, 0, S, S);
      g.addColorStop(0, skin.body); g.addColorStop(1, A);
      ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
      break;
    }
    case "marble": {
      ctx.lineCap = "round";
      for (let i = 0; i < 7; i++) {
        ctx.strokeStyle = rgba(A, 0.25 + r() * 0.45);
        ctx.lineWidth = 1 + r() * 5;
        ctx.shadowColor = A; ctx.shadowBlur = 6;
        ctx.beginPath();
        let x = r() * S, y = -10;
        ctx.moveTo(x, y);
        while (y < S + 10) {
          const nx = x + (r() - 0.5) * 70, ny = y + 20 + r() * 40;
          ctx.quadraticCurveTo(x + (r() - 0.5) * 60, (y + ny) / 2, nx, ny);
          x = nx; y = ny;
        }
        ctx.stroke();
      }
      break;
    }
    case "swirl": {
      ctx.lineCap = "round";
      for (let i = 0; i < 6; i++) {
        ctx.strokeStyle = rgba(A, 0.2 + r() * 0.4);
        ctx.lineWidth = 3 + r() * 10;
        ctx.beginPath();
        const cx = r() * S, cy = r() * S, rad = 30 + r() * 90, a0 = r() * 6;
        ctx.arc(cx, cy, rad, a0, a0 + 2 + r() * 3);
        ctx.stroke();
      }
      break;
    }
    case "galaxy": {
      for (let i = 0; i < 4; i++) {
        const cx = r() * S, cy = r() * S, rad = 60 + r() * 90;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, rgba(A, 0.55)); g.addColorStop(1, rgba(A, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
      }
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
        const s = r() < 0.9 ? 1 + r() * 1.5 : 2.5;
        ctx.fillRect(r() * S, r() * S, s, s);
      }
      break;
    }
    case "stars": {
      ctx.fillStyle = rgba(A, 0.75);
      for (let i = 0; i < 14; i++) {
        const cx = r() * S, cy = r() * S, s = 4 + r() * 9;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
          const ang = (k * Math.PI) / 4, rad = k % 2 ? s * 0.35 : s;
          ctx.lineTo(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad);
        }
        ctx.fill();
      }
      break;
    }
    case "stripes": {
      ctx.fillStyle = rgba(A, 0.55);
      ctx.translate(S / 2, S / 2); ctx.rotate(Math.PI / 4); ctx.translate(-S, -S);
      for (let x = 0; x < S * 2; x += 36) ctx.fillRect(x, 0, 14, S * 2);
      break;
    }
    case "dots": {
      ctx.fillStyle = rgba(A, 0.6);
      for (let y = 0; y < S + 30; y += 30) for (let x = (y / 30) % 2 ? 15 : 0; x < S + 30; x += 30) {
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case "scales": {
      ctx.lineWidth = 3;
      for (let y = -10, row = 0; y < S + 30; y += 18, row++) for (let x = row % 2 ? 0 : 16; x < S + 32; x += 32) {
        const g = ctx.createRadialGradient(x, y + 8, 2, x, y, 18);
        g.addColorStop(0, rgba(A, 0.5)); g.addColorStop(1, rgba(A, 0.05));
        ctx.fillStyle = g; ctx.strokeStyle = rgba(A, 0.7);
        ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI); ctx.fill(); ctx.stroke();
      }
      break;
    }
    case "wood": {
      const cx = S * (0.2 + r() * 0.6);
      for (let i = 0; i < 26; i++) {
        ctx.strokeStyle = rgba(A, 0.25 + r() * 0.35);
        ctx.lineWidth = 1 + r() * 3;
        ctx.beginPath();
        for (let y = -10; y <= S + 10; y += 8) {
          const x = cx + (i - 13) * 11 + Math.sin(y / 40 + i) * 6;
          if (y === -10) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }
    case "solid":
    default:
      break;
  }
  ctx.restore();
}

/** Draws a picture inside the face, keeping its proportions. */
function drawImage(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, at: P2, size: number, alpha: number) {
  const [x, y] = toCanvas(at);
  const s = size * TEX;
  const k = Math.min(s / img.width, s / img.height);
  const w = img.width * k, h = img.height * k;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
  ctx.restore();
}

function drawNumber(ctx: CanvasRenderingContext2D, skin: DiceSkin, text: string, at: P2, size: number, angle = 0) {
  const [x, y] = toCanvas(at);
  const px = Math.round(size * TEX);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.font = `700 ${px}px ${FONT_FAMILY[skin.font]()}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, px * 0.12);
  ctx.strokeStyle = skin.outline;
  ctx.strokeText(text, 0, px * 0.04);
  ctx.fillStyle = skin.ink;
  ctx.fillText(text, 0, px * 0.04);
  // 6 and 9 get a line so you can tell them apart
  if (text === "6" || text === "9") {
    const w = ctx.measureText(text).width;
    ctx.fillRect(-w / 2, px * 0.42, w, Math.max(2, px * 0.07));
  }
  ctx.restore();
}

function edges(ctx: CanvasRenderingContext2D, poly: P2[]) {
  // A soft darker rim and a thin light line: reads like a rounded edge in 3D.
  ctx.save();
  polyPath(ctx, poly);
  ctx.clip();
  polyPath(ctx, poly);
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 18;
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

export type Images = { all?: HTMLImageElement; max?: HTMLImageElement; faces: Record<string, HTMLImageElement> };

export async function loadImages(skin: DiceSkin): Promise<Images> {
  const load = (src?: string) => new Promise<HTMLImageElement | undefined>((resolve) => {
    if (!src) return resolve(undefined);
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(undefined);
    im.src = src;
  });
  const faces: Record<string, HTMLImageElement> = {};
  await Promise.all(Object.entries(skin.images.faces ?? {}).map(async ([k, v]) => { const im = await load(v); if (im) faces[k] = im; }));
  return { all: await load(skin.images.all), max: await load(skin.images.max), faces };
}

/** One face picture for die `type` showing `value`. */
export function paintFace(skin: DiceSkin, images: Images, type: DieType, value: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TEX;
  const ctx = canvas.getContext("2d")!;
  const L = faceLayout(type);
  paintPattern(ctx, skin, value + type.length * 31);
  edges(ctx, L.poly);
  const picture = images.faces[`${type}:${value}`] ?? (value === maxValue(type) && type !== "d100" ? images.max : undefined);
  const fs = L.fontScale;
  if (images.all) drawImage(ctx, images.all, L.label, fs * 2.2, skin.allOpacity);
  if (picture) {
    drawImage(ctx, picture, [L.label[0], L.label[1] + (skin.numbersOnPictures ? fs * 0.18 : 0)], fs * (skin.numbersOnPictures ? 1.7 : 2.3), 1);
    if (skin.numbersOnPictures) drawNumber(ctx, skin, labelText(type, value), [L.label[0], L.label[1] - fs * 0.95], fs * 0.45);
  } else {
    drawNumber(ctx, skin, labelText(type, value), L.label, fs);
  }
  return canvas;
}

/** A d4 face: three numbers, one in each corner, pointing at it. */
export function paintD4Face(skin: DiceSkin, images: Images, cornerLabels: number[]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TEX;
  const ctx = canvas.getContext("2d")!;
  const L = faceLayout("d4");
  paintPattern(ctx, skin, cornerLabels.reduce((a, b) => a * 5 + b, 3));
  edges(ctx, L.poly);
  const c: P2 = [L.poly.reduce((s, p) => s + p[0], 0) / 3, L.poly.reduce((s, p) => s + p[1], 0) / 3];
  if (images.all) drawImage(ctx, images.all, c, 0.32, skin.allOpacity);
  L.poly.forEach((p, k) => {
    const at: P2 = [c[0] + (p[0] - c[0]) * 0.55, c[1] + (p[1] - c[1]) * 0.55];
    const ang = Math.atan2(-(p[1] - c[1]), p[0] - c[0]) + Math.PI / 2; // canvas y is flipped
    const v = cornerLabels[k];
    const pic = images.faces[`d4:${v}`] ?? (v === 4 ? images.max : undefined);
    if (pic) drawImage(ctx, pic, at, 0.16, 1);
    else drawNumber(ctx, skin, String(v), at, L.fontScale, ang);
  });
  return canvas;
}

// small vector helpers
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalize = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export { shade };
