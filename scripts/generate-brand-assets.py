#!/usr/bin/env python3
# Usage: python3 scripts/generate-brand-assets.py assets/brand  (requires Pillow). Regenerates placeholder icons.
"""Generate placeholder brand assets: a rounded burnt-orange tile with three ascending 'steps' and a dot."""
import sys
from PIL import Image, ImageDraw

OUT = sys.argv[1]
ORANGE = (184, 84, 24, 255)
BEIGE = (247, 241, 232, 255)
ACCENT = (240, 138, 60, 255)
SS = 4  # supersampling

def mark(draw, x0, y0, size, fg, dot):
    # a three-step staircase (session by session) with a dot (the child) on the top step
    sw = size * 0.22          # step width
    total_w = sw * 3
    sx = x0 + (size - total_w) / 2
    base = y0 + size * 0.80
    heights = [0.20, 0.36, 0.52]
    r = sw * 0.22
    for i, h in enumerate(heights):
        bx = sx + i * sw
        draw.rounded_rectangle([bx, base - size * h, bx + sw + (r if i < 2 else 0), base], radius=r, fill=fg)
    # fill the seams between the rounded bottoms so the staircase reads as one shape
    draw.rectangle([sx + r, base - size * heights[0] + r, sx + total_w - r, base], fill=fg)
    for i in (1, 2):
        jx = sx + i * sw
        draw.rectangle([jx - r, base - size * heights[i - 1], jx + r, base], fill=fg)
    dr = size * 0.085
    cx = sx + 2 * sw + sw / 2
    cy = base - size * heights[2] - dr * 1.45
    draw.ellipse([cx - dr, cy - dr, cx + dr, cy + dr], fill=dot)

def tile(px, bg=ORANGE, fg=BEIGE, dot=ACCENT, rounded=True, pad=0.0):
    S = px * SS
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if bg:
        if rounded:
            d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 0.22, fill=bg)
        else:
            d.rectangle([0, 0, S, S], fill=bg)
    inner = S * (1 - 2 * pad)
    mark(d, S * pad, S * pad, inner, fg, dot)
    return im.resize((px, px), Image.LANCZOS)

tile(1024, rounded=False, pad=0.12).save(f'{OUT}/icon.png')
# Adaptive icon foreground: mark only, inside the 66% safe zone, on transparent (background colour from config)
fg = tile(1024, bg=None, fg=ORANGE, dot=ACCENT, pad=0.2)
fg.save(f'{OUT}/adaptive-foreground.png')
tile(1024, bg=None, fg=(255, 255, 255, 255), dot=(255, 255, 255, 255), pad=0.2).save(f'{OUT}/adaptive-monochrome.png')
tile(512, rounded=True, pad=0.12).save(f'{OUT}/splash.png')
tile(96, bg=None, fg=(255, 255, 255, 255), dot=(255, 255, 255, 255), pad=0.05).save(f'{OUT}/notification-icon.png')
tile(48, rounded=True, pad=0.12).save(f'{OUT}/favicon.png')
print('ok')
