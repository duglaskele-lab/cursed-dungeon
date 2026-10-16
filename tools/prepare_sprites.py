#!/usr/bin/env python3
"""
Подготовка спрайтов противниц для прототипа.

Берёт лист со стадиями на чёрном или белом фоне (стадии стоят слева направо),
убирает фон, разрезает на отдельные стадии, выравнивает стадии друг
относительно друга и сохраняет PNG одинакового размера с привязкой по низу.

Использование:
    python3 prepare_sprites.py <лист.png> <папка_вывода> [--stages 3] [--height 0] [--bg auto|black|white]

Требуется: pip install pillow numpy scipy
"""
import argparse
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage


def detect_bg(rgb):
    """Цвет фона по углам листа: 'black' или 'white'."""
    corners = np.array([rgb[0, 0], rgb[0, -1], rgb[-1, 0], rgb[-1, -1]])
    return 'white' if corners.mean() > 127 else 'black'


def background_mask(rgb, bg_type='black', hole_min_area=250, tol=None, holes=True):
    """True там, где фон. Фон = пиксели цвета фона, связанные с краем листа,
    плюс крупные замкнутые области чистого цвета фона (просветы между руками и телом)."""
    if bg_type == 'white':
        m = rgb.min(axis=2)
        near = m >= 255 - (tol if tol is not None else 9)
        pure = m >= 252
        hole_min_area = max(hole_min_area, 900)
    else:
        m = rgb.max(axis=2)
        near = m <= (tol if tol is not None else 6)
        pure = m <= 3
    lab, n = ndimage.label(near)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    border.discard(0)
    bg = np.isin(lab, list(border))
    if not holes:
        return bg
    holes = pure & ~bg
    hlab, hn = ndimage.label(holes)
    if hn:
        sizes = ndimage.sum(np.ones_like(hlab), hlab, index=np.arange(1, hn + 1))
        big = np.where(sizes >= hole_min_area)[0] + 1
        bg |= np.isin(hlab, big)
    return bg


def edge_alpha(rgb, fg, bg_type):
    """Альфа для фигуры: внутри 255, у края — по тому, насколько пиксель отличается от фона.
    Цвет краевых пикселей «отмешивается» от фона, чтобы не было светлого или тёмного ореола."""
    alpha = np.where(fg, 255.0, 0.0)
    band = fg & ndimage.binary_dilation(~fg, iterations=2)
    out = rgb.astype(np.float64).copy()
    if bg_type == 'white':
        diff = 255.0 - rgb.min(axis=2)
        a = np.clip(diff / 150.0, 0.0, 1.0)
        a = np.where(band, a, 1.0)
        safe = np.maximum(a, 1e-3)[..., None]
        unblended = 255.0 - (255.0 - out) / safe
        out = np.where(band[..., None], np.clip(unblended, 0, 255), out)
        alpha = np.where(fg, a * 255.0, 0.0)
    else:
        diff = rgb.max(axis=2).astype(np.float64)
        a = np.clip(diff / 60.0, 0.55, 1.0)  # тёмный контур рисунка не трогаем сильно
        a = np.where(band, a, 1.0)
        alpha = np.where(fg, a * 255.0, 0.0)
    return out.astype(np.uint8), alpha.astype(np.uint8)


def split_columns(fg, stages):
    """Делит лист на stages фигур по пустым вертикальным промежуткам."""
    occ = fg.sum(axis=0) > 0
    cols = np.where(occ)[0]
    segs = []
    start = prev = cols[0]
    for c in cols[1:]:
        if c - prev > 6:
            segs.append((start, prev + 1))
            start = c
        prev = c
    segs.append((start, prev + 1))
    # если сегментов больше (оторванные пряди и т.п.) — склеиваем ближайшие
    while len(segs) > stages:
        gaps = [segs[i + 1][0] - segs[i][1] for i in range(len(segs) - 1)]
        i = int(np.argmin(gaps))
        segs[i] = (segs[i][0], segs[i + 1][1])
        del segs[i + 1]
    if len(segs) != stages:
        sys.exit(f"Нашёл {len(segs)} фигур вместо {stages}. Проверьте лист.")
    return segs


def best_offset(ref, img, search=24, step=2):
    """Сдвиг (dy, dx) img относительно ref, при котором маски совпадают лучше всего."""
    best = (0, 0)
    best_score = -1
    h, w = ref.shape
    for dy in range(-search, search + 1, step):
        for dx in range(-search, search + 1, step):
            shifted = np.zeros_like(img)
            ys = slice(max(0, dy), min(h, h + dy))
            yd = slice(max(0, -dy), min(h, h - dy))
            xs = slice(max(0, dx), min(w, w + dx))
            xd = slice(max(0, -dx), min(w, w - dx))
            shifted[ys, xs] = img[yd, xd]
            score = (shifted & ref).sum() / max(1, (shifted | ref).sum())
            if score > best_score:
                best_score, best = score, (dy, dx)
    return best, best_score


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet")
    ap.add_argument("out_dir")
    ap.add_argument("--stages", type=int, default=3)
    ap.add_argument("--height", type=int, default=0, help="итоговая высота, 0 = как есть")
    ap.add_argument("--pad", type=int, default=12)
    ap.add_argument("--bg", choices=["auto", "black", "white"], default="auto", help="цвет фона листа")
    ap.add_argument("--tol", type=int, default=None, help="допуск фона (чёрный: 6, белый: 9)")
    ap.add_argument("--no-holes", action="store_true", help="не вырезать замкнутые просветы (для белой одежды на белом фоне)")
    args = ap.parse_args()

    im = Image.open(args.sheet).convert("RGBA")
    a = np.array(im)
    rgb = a[..., :3].astype(np.int32)
    bg_type = args.bg if args.bg != 'auto' else detect_bg(rgb)
    print("фон:", bg_type)
    bg = background_mask(rgb, bg_type, tol=args.tol, holes=not args.no_holes)
    fg = ~bg
    color, alpha = edge_alpha(rgb, fg, bg_type)
    rgba = np.dstack([color, alpha])

    segs = split_columns(fg, args.stages)
    H = a.shape[0]
    crops = [(rgba[:, x0:x1], fg[:, x0:x1]) for x0, x1 in segs]

    # общий холст по ширине самой широкой стадии + поле для сдвигов
    W = max(c[0].shape[1] for c in crops) + 80
    canvases = []
    masks = []
    for img, msk in crops:
        cv = np.zeros((H, W, 4), np.uint8)
        mk = np.zeros((H, W), bool)
        ox = (W - img.shape[1]) // 2
        cv[:, ox:ox + img.shape[1]] = img
        mk[:, ox:ox + img.shape[1]] = msk
        canvases.append(cv)
        masks.append(mk)

    # выравниваем стадии 2..N по стадии 1 (по маскам, сначала грубо, потом точно)
    aligned = [canvases[0]]
    for i in range(1, len(canvases)):
        (dy, dx), s1 = best_offset(masks[0], masks[i], search=40, step=4)
        best = (dy, dx)
        best_s = s1
        for ddy in range(-3, 4):
            for ddx in range(-3, 4):
                (y2, x2), s2 = best_offset(masks[0], np.roll(np.roll(masks[i], dy + ddy, 0), dx + ddx, 1), search=0)
                if s2 > best_s:
                    best_s, best = s2, (dy + ddy, dx + ddx)
        dy, dx = best
        dy = 0 if abs(dy) <= 1 else dy  # низ листа общий, вертикаль почти не сдвигаем
        print(f"стадия {i + 1}: сдвиг dx={dx}, dy={dy}, совпадение {best_s:.3f}")
        aligned.append(np.roll(np.roll(canvases[i], dy, 0), dx, 1))

    # общий кроп по объединению всех стадий
    union = np.zeros((H, W), bool)
    for cv in aligned:
        union |= cv[..., 3] > 0
    ys, xs = np.where(union)
    y0 = max(0, ys.min() - args.pad)
    x0 = max(0, xs.min() - args.pad)
    x1 = min(W, xs.max() + 1 + args.pad)
    y1 = H  # низ оставляем: ноги обрезаны краем листа

    os.makedirs(args.out_dir, exist_ok=True)
    for i, cv in enumerate(aligned):
        out = Image.fromarray(cv[y0:y1, x0:x1])
        if args.height:
            w = round(out.width * args.height / out.height)
            out = out.resize((w, args.height), Image.LANCZOS)
        path = os.path.join(args.out_dir, f"stage{i + 1}.png")
        out.save(path, optimize=True)
        print("сохранено", path, out.size)


if __name__ == "__main__":
    main()
