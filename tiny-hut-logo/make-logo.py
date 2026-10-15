"""Builds the Lemound's Tiny Hut logo SVGs and PNG/ICO sizes. Run: python3 -I gen.py OUTDIR"""
import sys, os, io
import cairosvg
from PIL import Image

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

BG = "#15130F"
DOME = "M96 368 C96 228 168 150 256 150 C344 150 416 228 416 368"
SPARK = "M256 66 Q259 84 278 87 Q259 90 256 108 Q253 90 234 87 Q253 84 256 66 Z"

DEFS = """<defs>
  <linearGradient id="dd-rim" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#C9742A"/><stop offset="0.5" stop-color="#F2C48D"/><stop offset="1" stop-color="#E0913A"/>
  </linearGradient>
  <radialGradient id="dd-in" cx="0.5" cy="0.35" r="0.65">
    <stop offset="0" stop-color="#E0913A" stop-opacity="0.16"/><stop offset="1" stop-color="#E0913A" stop-opacity="0"/>
  </radialGradient>
  <radialGradient id="dd-spark" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0" stop-color="#F2C48D" stop-opacity="0.45"/><stop offset="1" stop-color="#F2C48D" stop-opacity="0"/>
  </radialGradient>
</defs>"""


def glow(shape, widths=((30, .05), (22, .08), (15, .13))):
    """Layered translucent strokes: a glow that renders the same in every renderer."""
    return "".join(
        shape.replace("STROKE", f'fill="none" stroke="#E0913A" stroke-width="{w}" stroke-opacity="{o}" stroke-linecap="round"')
        for w, o in widths)


def full():
    dome = f'<path d="{DOME}" STROKE/>'
    ring = '<ellipse cx="256" cy="370" rx="176" ry="17" STROKE/>'
    return f"""
  <path d="{DOME} Z" fill="url(#dd-in)"/>
  {glow(dome)}
  <path d="{DOME}" fill="none" stroke="url(#dd-rim)" stroke-width="7" stroke-linecap="round"/>
  <path d="M248 152 Q256 142 256 128 Q256 142 264 152 Z" fill="#F2C48D"/>
  <circle cx="256" cy="118" r="4" fill="#F2C48D"/>
  <circle cx="256" cy="56" r="4" fill="#F2C48D"/>
  <circle cx="256" cy="87" r="34" fill="url(#dd-spark)"/>
  <path d="{SPARK}" fill="#F2C48D"/>
  <ellipse cx="256" cy="370" rx="176" ry="17" fill="#0E0C09" fill-opacity="0.7"/>
  {glow(ring, ((24, .05), (16, .09), (10, .14)))}
  <ellipse cx="256" cy="370" rx="176" ry="17" fill="none" stroke="url(#dd-rim)" stroke-width="5"/>
  <rect x="288" y="206" width="13" height="34" fill="#8A5E3A"/>
  <rect x="286" y="203" width="17" height="5" fill="#B98A5C"/>
  <polygon points="178,304 246,296 246,362 178,362" fill="#6E4B2E"/>
  <line x1="200" y1="302" x2="200" y2="362" stroke="#57391F" stroke-width="3"/>
  <line x1="222" y1="299" x2="222" y2="362" stroke="#57391F" stroke-width="3"/>
  <rect x="192" y="316" width="22" height="22" fill="#0E0C09"/>
  <polygon points="302,230 232,250 152,308 234,296" fill="#A87A4E"/>
  <line x1="286" y1="236" x2="214" y2="301" stroke="#8A5E3A" stroke-width="3"/>
  <line x1="266" y1="242" x2="192" y2="303" stroke="#8A5E3A" stroke-width="3"/>
  <line x1="246" y1="248" x2="172" y2="305" stroke="#8A5E3A" stroke-width="3"/>
  <line x1="302" y1="230" x2="232" y2="250" stroke="#C9996A" stroke-width="4" stroke-linecap="round"/>
  <polygon points="248,294 302,244 356,294 356,362 248,362" fill="#B98A5C"/>
  <line x1="266" y1="280" x2="266" y2="362" stroke="#9C6E45" stroke-width="3"/>
  <line x1="338" y1="280" x2="338" y2="362" stroke="#9C6E45" stroke-width="3"/>
  <polyline points="230,298 302,230 374,298" fill="none" stroke="#C9996A" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/>
  <rect x="281" y="302" width="42" height="60" fill="#C9996A"/>
  <rect x="287" y="308" width="30" height="54" fill="#0E0C09"/>
  <path d="M164 364 L388 364" stroke="#9C6E45" stroke-width="4" stroke-linecap="round"/>
  <path d="M158 364 L165 338 L171 364 L179 330 L185 364 L192 344 L197 364 Z" fill="#9C6E45"/>
  <path d="M358 364 L365 342 L371 364 L379 328 L385 364 L393 346 L399 364 Z" fill="#9C6E45"/>"""


def small():
    """Bold version for 16-64 px: thick rim, big simple hut, spark only."""
    d = "M84 400 C84 230 160 136 256 136 C352 136 428 230 428 400"
    return f"""
  <path d="{d} Z" fill="url(#dd-in)"/>
  {glow(f'<path d="{d}" STROKE/>', ((52, .07), (40, .12)))}
  <path d="{d}" fill="none" stroke="url(#dd-rim)" stroke-width="26" stroke-linecap="round"/>
  <path d="M256 30 Q262 66 300 72 Q262 78 256 114 Q250 78 212 72 Q250 66 256 30 Z" fill="#F2C48D"/>
  <rect x="60" y="390" width="392" height="26" rx="13" fill="url(#dd-rim)"/>
  <polygon points="150,300 256,206 362,300 362,392 150,392" fill="#B98A5C"/>
  <polyline points="124,318 256,196 388,318" fill="none" stroke="#C9996A" stroke-width="26" stroke-linejoin="round" stroke-linecap="round"/>
  <rect x="222" y="312" width="68" height="80" fill="#0E0C09"/>"""


def svg(body, bg=None, pad=0.0, dy=0):
    """bg: fill colour or None; pad: fraction of size kept empty around the mark."""
    s = 512 * (1 - 2 * pad)
    t = f'translate({512 * pad:.1f} {512 * pad + dy * (1 - 2 * pad):.1f}) scale({s / 512:.4f})'
    back = f'<rect width="512" height="512" fill="{bg}"/>' if bg else ""
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">{DEFS}{back}'
            f'<g transform="{t}">{body}</g></svg>\n')


def png(s, size, name):
    data = cairosvg.svg2png(bytestring=s.encode(), output_width=size, output_height=size)
    with open(os.path.join(OUT, name), "wb") as f:
        f.write(data)
    return Image.open(io.BytesIO(data))


FULL_DY = 34   # centres the full mark (spark top to base ring)
mark = svg(full(), dy=FULL_DY)                        # transparent, for the app UI
icon_full = svg(full(), BG, pad=0.02, dy=FULL_DY)     # square with background
maskable = svg(full(), BG, pad=0.14, dy=FULL_DY)      # Android safe zone
icon_small = svg(small(), BG, pad=0.02, dy=10)

open(os.path.join(OUT, "logo-mark.svg"), "w").write(mark)
open(os.path.join(OUT, "icon.svg"), "w").write(icon_small)   # browser tab (Next app/icon.svg)
open(os.path.join(OUT, "logo-icon.svg"), "w").write(icon_full)

png(icon_full, 180, "apple-icon.png")
png(icon_full, 192, "icon-192.png")
png(icon_full, 512, "icon-512.png")
png(maskable, 512, "icon-maskable-512.png")
png(mark, 1024, "logo-mark-1024.png")
png(icon_full, 1024, "logo-icon-1024.png")
ico = [png(icon_small, n, f"_ico{n}.png").convert("RGBA") for n in (16, 32, 48)]
ico[2].save(os.path.join(OUT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)], append_images=ico[:2])
for n in (16, 32, 48):
    os.remove(os.path.join(OUT, f"_ico{n}.png"))

# splash: 1290x2796 (phone), mark centred, name under it
W, H = 1290, 2796
splash = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">{DEFS}'
          f'<rect width="{W}" height="{H}" fill="{BG}"/>'
          f'<g transform="translate({(W - 720) / 2} {H / 2 - 520}) scale({720 / 512})"><g transform="translate(0 {FULL_DY})">{full()}</g></g>'
          f'<text x="{W / 2}" y="{H / 2 + 330}" text-anchor="middle" font-family="Spectral, Georgia, serif" font-weight="700" font-size="108" fill="#EFE7DA">Lemound’s Tiny Hut</text>'
          f'<text x="{W / 2}" y="{H / 2 + 420}" text-anchor="middle" font-family="Manrope, Arial, sans-serif" font-weight="600" font-size="42" letter-spacing="6" fill="#A89C8A">YOUR CAMPAIGN COMPANION</text>'
          '</svg>\n')
open(os.path.join(OUT, "splash.svg"), "w").write(splash)
png_s = cairosvg.svg2png(bytestring=splash.encode(), output_width=W, output_height=H)
open(os.path.join(OUT, "splash-1290x2796.png"), "wb").write(png_s)
print("done", sorted(os.listdir(OUT)))
