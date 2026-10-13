#!/usr/bin/env python3
"""
Trace a line drawing (dark lines on white) into an SVG of stroked paths, so
it can be drawn on line by line (DrawSVG).

Fills would trace the outline of every line, twice; this traces their
centres instead: the lines are thresholded, thinned to one pixel
(Zhang-Suen), and the thinned pixels walked into polylines between their
ends and junctions, then simplified.

    python3 scripts/trace-line-drawing.py in.png out.svg [--threshold 225] [--scale 3] [--epsilon 0.7] [--min 3]
"""
import argparse
import cv2
import numpy as np


def thin(img):
    """Zhang-Suen thinning of a 0/1 image."""
    img = img.copy().astype(np.uint8)
    while True:
        changed = False
        for step in (0, 1):
            p = np.pad(img, 1)
            # Neighbours P2..P9, clockwise from north.
            n = [p[:-2, 1:-1], p[:-2, 2:], p[1:-1, 2:], p[2:, 2:], p[2:, 1:-1], p[2:, :-2], p[1:-1, :-2], p[:-2, :-2]]
            b = sum(x.astype(np.int32) for x in n)
            a = sum(((n[i] == 0) & (n[(i + 1) % 8] == 1)).astype(np.int32) for i in range(8))
            if step == 0:
                c = (n[0] * n[2] * n[4] == 0) & (n[2] * n[4] * n[6] == 0)
            else:
                c = (n[0] * n[2] * n[6] == 0) & (n[0] * n[4] * n[6] == 0)
            m = (img == 1) & (b >= 2) & (b <= 6) & (a == 1) & c
            if m.any():
                img[m] = 0
                changed = True
        if not changed:
            return img


OFFSETS = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]


def trace(skel):
    """Walk the one-pixel lines into polylines of (x, y)."""
    h, w = skel.shape
    on = set(zip(*np.nonzero(skel)))

    def neighbours(p):
        # A diagonal step that a two-step corner already covers is dropped:
        # otherwise every corner of a line reads as a junction, and the
        # lines break into scraps there.
        y, x = p
        out = []
        for dy, dx in OFFSETS:
            q = (y + dy, x + dx)
            if q not in on:
                continue
            if dy and dx and ((y + dy, x) in on or (y, x + dx) in on):
                continue
            out.append(q)
        return out

    degree = {p: len(neighbours(p)) for p in on}
    nodes = {p for p, d in degree.items() if d != 2}
    seen = set()  # visited edges, as frozensets of two pixels
    lines = []

    def walk(start, nxt):
        path = [start, nxt]
        seen.add(frozenset((start, nxt)))
        prev, cur = start, nxt
        while cur not in nodes:
            step = [q for q in neighbours(cur) if q != prev and frozenset((cur, q)) not in seen]
            if not step:
                break
            prev, cur = cur, step[0]
            seen.add(frozenset((prev, cur)))
            path.append(cur)
            if cur == start:
                break
        return path

    for n in nodes:
        for q in neighbours(n):
            if frozenset((n, q)) not in seen:
                lines.append(walk(n, q))
    # Closed loops with no ends or junctions.
    for p in on:
        for q in neighbours(p):
            if frozenset((p, q)) not in seen:
                lines.append(walk(p, q))
    return [[(x, y) for y, x in line] for line in lines]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('out')
    ap.add_argument('--threshold', type=int, default=225, help='Darker than this is line (0-255): faint grey lines count.')
    ap.add_argument('--long', type=float, default=0.08, help='Share of lines, longest first, drawn as outlines.')
    ap.add_argument('--medium', type=float, default=0.35, help='Share of lines, longest first, drawn by the end of the shapes pass.')
    ap.add_argument('--bands', type=int, nargs=3, default=[0, 32, 24], help='Bands across the sheet each pass is merged into.')
    ap.add_argument('--ink', type=float, default=0.45, help='Darkness that counts as full black (0-1).')
    ap.add_argument('--boost', type=float, default=3, help='How much faint lines are darkened before the threshold.')
    ap.add_argument('--scale', type=int, default=3, help='Upsample first, so hairlines thin cleanly.')
    ap.add_argument('--epsilon', type=float, default=0.7, help='Simplification tolerance, px.')
    ap.add_argument('--min', type=float, default=3, help='Drop lines shorter than this, px.')
    args = ap.parse_args()

    img = cv2.imread(args.src, cv2.IMREAD_UNCHANGED)
    if img.ndim == 3 and img.shape[2] == 4:
        # Transparent counts as paper.
        alpha = img[:, :, 3:4] / 255.0
        img = (img[:, :, :3] * alpha + 255 * (1 - alpha)).astype(np.uint8)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    h, w = gray.shape
    k = args.scale
    # Faint hairlines are paler than the threshold once antialiased: darken
    # every line by its local contrast first (a black top-hat), so the pale
    # ones count as well as the dark ones.
    contrast = cv2.morphologyEx(255 - gray, cv2.MORPH_TOPHAT, np.ones((7, 7), np.uint8))
    original = gray.copy()
    gray = np.clip(255 - contrast.astype(np.int32) * args.boost, 0, 255).astype(np.uint8)
    big = cv2.resize(gray, (w * k, h * k), interpolation=cv2.INTER_CUBIC)
    lines = trace(thin((big < args.threshold).astype(np.uint8)))

    # How dark the original is along a line: each point's darkest pixel
    # close by (the centre of the antialiased stroke), averaged.
    dark = 255 - cv2.erode(original, np.ones((3, 3), np.uint8))
    levels = np.array([0.3, 0.45, 0.6, 0.8, 1.0])

    def ink(pts):
        xs = np.clip(pts[:, 0].round().astype(int), 0, w - 1)
        ys = np.clip(pts[:, 1].round().astype(int), 0, h - 1)
        v = dark[ys, xs].mean() / 255 / args.ink
        return float(levels[np.abs(levels - min(1.0, v)).argmin()])

    paths = []
    for line in lines:
        pts = np.array(line, dtype=np.float32).reshape(-1, 1, 2) / k
        length = cv2.arcLength(pts, False)
        if length < args.min:
            continue
        simple = cv2.approxPolyDP(pts, args.epsilon, False).reshape(-1, 2)
        d = 'M' + 'L'.join(f'{x:.1f} {y:.1f}'.replace('.0 ', ' ').removesuffix('.0') for x, y in simple)
        paths.append({'d': d, 'ink': ink(pts.reshape(-1, 2)), 'length': length, 'x': float(simple[:, 0].min()), 'y': float(simple[:, 1].min())})

    # Three passes, as a draughtsman works: the longest lines (outlines),
    # the middling ones (the shapes they frame), the short ones (details).
    lengths = sorted((p['length'] for p in paths), reverse=True)
    long_cut = lengths[int(len(lengths) * args.long)]
    medium_cut = lengths[int(len(lengths) * args.medium)]
    for p in paths:
        p['pass'] = 0 if p['length'] >= long_cut else 1 if p['length'] >= medium_cut else 2

    # Thousands of separate strokes are slow to animate and to paint, so the
    # shapes and details are merged into compound strokes: one per pass,
    # tone and band of the sheet, its pieces top to bottom. Drawn on, a
    # compound stroke draws its pieces one after another. The outlines stay
    # one stroke each.
    bands = args.bands
    groups = {}
    for p in paths:
        key = (p['pass'], p['ink'], 0 if p['pass'] == 0 else int(p['x'] / w * bands[p['pass']]), id(p) if p['pass'] == 0 else 0)
        groups.setdefault(key, []).append(p)
    out = []
    for (pss, o, _, _), members in groups.items():
        members.sort(key=lambda p: (p['y'], p['x']))
        out.append({'pass': pss, 'ink': o, 'x': min(p['x'] for p in members), 'd': ''.join(p['d'] for p in members)})
    # Left to right reads as a sweep.
    out.sort(key=lambda p: (p['pass'], p['x']))

    with open(args.out, 'w') as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">\n')
        for p in out:
            # Its ink as an opacity of currentColor, in steps, so the
            # drawing keeps its dark outlines and pale construction lines.
            # The pass is written on it, so nothing needs measuring to draw it.
            op = '' if p['ink'] >= 0.95 else f' stroke-opacity="{p["ink"]:.2f}"'
            f.write(f'<path data-pass="{p["pass"]}" d="{p["d"]}"{op}/>\n')
        f.write('</svg>\n')
    counts = [sum(1 for p in out if p['pass'] == i) for i in range(3)]
    print(f'{len(paths)} lines in {len(out)} strokes (outlines {counts[0]}, shapes {counts[1]}, details {counts[2]}), {w}x{h}')


if __name__ == '__main__':
    main()
