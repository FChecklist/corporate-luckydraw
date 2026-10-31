"""Makes every raster brand picture of Corporate Lucky Draw (run: python tools/make-icons.py): app icons, favicons, logos, the share card.
Original artwork, no faces: a teal rounded square with a tilted red raffle ticket and a gold stub, a white star on the ticket and a perforated edge."""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

PUB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "apps", "web", "public")
TEAL, RED, GOLD, CREAM, WHITE, INK = "#0E9488", "#FF4D4D", "#FFC93C", "#FFF3BF", "#FFFFFF", "#1B1442"


def star(d, cx, cy, r, fill):
    import math
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.42
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    d.polygon(pts, fill=fill)


def art(size, pad=0.0, rounded=True, bg=TEAL):
    """The picture at `size` px; `pad` is the share of each side kept empty (maskable icons need more)."""
    S = size * 4
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22) if rounded else 0, fill=bg)
    k = S * (1 - 2 * pad) / 64.0
    ox = S * pad
    tk = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    t = ImageDraw.Draw(tk)
    X = lambda v: ox + v * k
    Y = lambda v: ox + v * k
    t.rounded_rectangle([X(3), Y(18), X(45), Y(46)], radius=int(2.5 * k), fill=RED)
    t.rounded_rectangle([X(45), Y(18), X(61), Y(46)], radius=int(2.5 * k), fill=GOLD)
    t.rounded_rectangle([X(7), Y(22), X(41), Y(42)], radius=int(1.5 * k), outline=CREAM, width=max(1, int(k)))
    star(t, X(24), Y(32), 7.2 * k, WHITE)
    for yy in range(21, 44, 4):
        t.line([X(45), Y(yy), X(45), Y(yy + 2)], fill=WHITE, width=max(1, int(1.4 * k)))
    for cx in (3, 61):
        t.ellipse([X(cx) - 3.6 * k, Y(32) - 3.6 * k, X(cx) + 3.6 * k, Y(32) + 3.6 * k], fill=bg or TEAL)
    tk = tk.rotate(9, resample=Image.BICUBIC, center=(S / 2, S / 2))
    im.alpha_composite(tk)
    return im.resize((size, size), Image.LANCZOS)


def flat(size, pad=0.0, rounded=False):
    im = art(size, pad, rounded=rounded)
    out = Image.new("RGB", (size, size), TEAL)
    out.paste(im, (0, 0), im)
    return out


def font(names, size):
    for f in names:
        for root in ("C:/Windows/Fonts/", "/usr/share/fonts/truetype/dejavu/"):
            if os.path.exists(root + f):
                return ImageFont.truetype(root + f, size)
    return ImageFont.load_default()


def save(im, name, **kw):
    im.save(os.path.join(PUB, name), **kw)
    print("wrote", name)


for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180), ("logo-512.png", 512), ("logo-1024.png", 1024)]:
    save(flat(size, 0.0 if name.startswith("logo") else 0.04, rounded=False) if False else flat(size, 0.06), name, optimize=True)
for name, size in [("icon-maskable-192.png", 192), ("icon-maskable-512.png", 512)]:
    save(flat(size, 0.20), name, optimize=True)
fav = art(32, 0.0)
save(fav, "favicon-32.png", optimize=True)
art(48, 0.0).save(os.path.join(PUB, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)]); print("wrote favicon.ico")

# the share card: warm gradient, the icon on the left, words on the right
W, H = 1200, 630
card = Image.new("RGB", (W, H))
px = card.load()
for y in range(H):
    for x in range(W):
        t = (x / W * 0.6 + y / H * 0.4)
        px[x, y] = (int(255 - 8 * t), int(243 - 30 * t), int(205 - 50 * t))
d = ImageDraw.Draw(card)
for x in range(66, 1134, 14):
    d.line([x, 64, x + 7, 64], fill="#F2B85A", width=2); d.line([x, 566, x + 7, 566], fill="#F2B85A", width=2)
for y in range(64, 566, 14):
    d.line([66, y, 66, y + 7], fill="#F2B85A", width=2); d.line([1134, y, 1134, y + 7], fill="#F2B85A", width=2)
icon = art(280, 0.05)
card.paste(icon, (96, 175), icon)
serif = font(["georgiab.ttf", "timesbd.ttf", "DejaVuSans-Bold.ttf"], 104)
sans = font(["arialbd.ttf", "DejaVuSans-Bold.ttf"], 36)
small = font(["arialbd.ttf", "DejaVuSans-Bold.ttf"], 30)
d.text((420, 244), "C O R P O R A T E", font=small, fill="#4C4468")
d.text((416, 285), "Lucky Draw", font=serif, fill=INK)
d.text((420, 424), "Online games for company events", font=sans, fill="#4C4468")
d.text((420, 516), "luckydraw.corporatetambola.com", font=small, fill="#A33C00")
save(card, "og-card.png", optimize=True)
save(card, os.path.join("img", "card.png"), optimize=True)
