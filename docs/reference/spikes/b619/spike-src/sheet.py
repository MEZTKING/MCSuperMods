"""B619 spike (throwaway): a contact sheet of the decoded views (each pixel: the texel of MSM's coded test picture the
game drew there, u as red, v as green; white where the pose moved between frames). MSM's codes only."""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
run, mc, out = sys.argv[1], sys.argv[2], sys.argv[3]
names = sorted({f.rsplit('_', 1)[0] for f in os.listdir(f'{run}/{mc}/bodies') if f.endswith('.png')})
views = ['front', 'back', 'east', 'west', 'top', 'bottom']
T = 112
sheet = Image.new('RGB', (T * len(views) + 150, T * len(names)), (16, 16, 24))
d = ImageDraw.Draw(sheet)
for r, n in enumerate(names):
    d.text((4, r * T + T // 2 - 6), n, fill=(220, 220, 220))
    for c, v in enumerate(views):
        p = f'{run}/{mc}/bodies/{n}_{v}.png'
        if not os.path.exists(p):
            continue
        a = np.array(Image.open(p).convert('RGB')).astype(int)
        fg = a[:, :, 2] > 0
        ys, xs = np.nonzero(fg)
        if len(xs) == 0:
            continue
        cx, cy = (xs.min() + xs.max()) // 2, (ys.min() + ys.max()) // 2
        half = max(xs.max() - xs.min(), ys.max() - ys.min()) // 2 + 10
        img = np.zeros(a.shape, np.uint8)
        img[..., 0] = np.where(fg, a[..., 0] * 255 // 127, 0)
        img[..., 1] = np.where(fg, a[..., 1] * 255 // 127, 0)
        img[..., 2] = np.where(a[..., 2] == 128, 255, np.where(fg, 60, 0))
        moved = a[..., 2] == 128
        img[moved] = 255
        crop = Image.fromarray(img).crop((cx - half, cy - half, cx + half, cy + half)).resize((T - 4, T - 4), Image.NEAREST)
        sheet.paste(crop, (150 + c * T + 2, r * T + 2))
sheet.save(out, optimize=True)
print(out, os.path.getsize(out))
