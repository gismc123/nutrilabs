#!/usr/bin/env python3
"""Generate NutriLabs PNG icons from code (Pillow-based, no SVG renderer needed)."""
from PIL import Image, ImageDraw
import math

def lerp_color(c1, c2, t):
    return (int(c1[0]+(c2[0]-c1[0])*t), int(c1[1]+(c2[1]-c1[1])*t), int(c1[2]+(c2[2]-c1[2])*t))

def bezier(t, p0, p1, p2, p3):
    u = 1-t
    return (u**3*p0[0]+3*u**2*t*p1[0]+3*u*t**2*p2[0]+t**3*p3[0],
            u**3*p0[1]+3*u**2*t*p1[1]+3*u*t**2*p2[1]+t**3*p3[1])

def leaf_pts(cx, cy, length, hw, angle_deg, n=48):
    """Polygon approximation of one leaf; base at (cx,cy), tip points in angle_deg direction."""
    a = math.radians(angle_deg)
    ca, sa = math.cos(a), math.sin(a)
    def rot(lx, ly): return (cx + lx*ca - ly*sa, cy + lx*sa + ly*ca)
    pts = []
    # left side: base → tip
    for i in range(n+1):
        t = i/n
        pts.append(rot(*bezier(t, (0,0), (-hw,-length*.38), (-hw,-length*.72), (0,-length))))
    # right side: tip → base
    for i in range(1, n+1):
        t = i/n
        pts.append(rot(*bezier(t, (0,-length), (hw,-length*.72), (hw,-length*.38), (0,0))))
    return [(int(x), int(y)) for x,y in pts]

def make_icon(size):
    s = size / 512
    C_TOP   = (52, 211, 153)    # #34d399 emerald-400
    C_BOT   = (6, 78, 59)       # #064e3b emerald-900
    WHITE   = (255, 255, 255, 255)
    LIQUID  = (110, 231, 183, 155)

    # Gradient background
    bg = Image.new('RGBA', (size, size))
    draw_bg = ImageDraw.Draw(bg)
    for y in range(size):
        t = y / max(1, size-1)
        draw_bg.line([(0, y), (size-1, y)], fill=(*lerp_color(C_TOP, C_BOT, t), 255))

    # Rounded-square mask
    rx = max(2, int(112*s))
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([(0,0),(size-1,size-1)], radius=rx, fill=255)
    bg.putalpha(mask)

    img = Image.new('RGBA', (size, size), (0,0,0,0))
    img.paste(bg, mask=bg)
    draw = ImageDraw.Draw(img, 'RGBA')

    def p(x, y): return (int(x*s), int(y*s))

    # ── Flask (Erlenmeyer shape) ──────────────────────────────────────
    # neck top: y=104, neck x=242–270; neck base: y=225, x=228–284
    # body flares to y=456, x=118–394
    flask = [
        p(242,104), p(270,104),
        p(284,130), p(284,225),
        p(412,420), p(407,440), p(394,456),
        p(118,456), p(105,440), p(100,420),
        p(228,225), p(228,130), p(228,112),
    ]
    draw.polygon(flask, fill=(255,255,255,22))
    lw = max(2, int(16*s))
    draw.line(flask + [flask[0]], fill=WHITE, width=lw)
    # round joins
    r = lw // 2
    for pt in flask:
        draw.ellipse([(pt[0]-r, pt[1]-r),(pt[0]+r, pt[1]+r)], fill=WHITE)

    # ── Liquid (bottom third of flask) ───────────────────────────────
    ly0 = 305
    lx_l = 228 + (100-228)*(ly0-225)/(420-225)
    lx_r = 284 + (412-284)*(ly0-225)/(420-225)
    liq = [
        p(lx_l, ly0), p(lx_r, ly0),
        p(412,420), p(407,440), p(394,456),
        p(118,456), p(105,440), p(100,420),
    ]
    draw.polygon(liq, fill=LIQUID)

    # ── Bubbles ───────────────────────────────────────────────────────
    for bx,by,br,ba in [(183,375,10,135),(220,410,6,110),(316,365,8,135),(282,405,4,95)]:
        bx,by,br = int(bx*s),int(by*s),max(1,int(br*s))
        draw.ellipse([(bx-br,by-br),(bx+br,by+br)], fill=(255,255,255,ba))

    # ── Three leaves sprouting from flask mouth ───────────────────────
    lbase = p(256, 104)
    ll, lhw = 80*s, 19*s
    for deg in [-42, 0, 42]:
        pts = leaf_pts(lbase[0], lbase[1], ll, lhw, deg)
        draw.polygon(pts, fill=WHITE)

    return img

OUT = '/home/gismc/Documents/nutrilabs/apps/web/public/'
sizes = [
    ('icon-512.png', 512),
    ('icon-192.png', 192),
    ('apple-touch-icon.png', 180),
    ('favicon-32.png', 32),
    ('favicon-16.png', 16),
]
icons = {}
for fname, sz in sizes:
    icons[sz] = make_icon(sz)
    icons[sz].save(OUT + fname)
    print(f'  ✓ {fname} ({sz}x{sz})')

# Multi-resolution favicon.ico
icons[32].save(OUT + 'favicon.ico', format='ICO',
               sizes=[(32,32),(16,16)],
               append_images=[icons[16]])
print('  ✓ favicon.ico (32+16)')
print('Done!')
