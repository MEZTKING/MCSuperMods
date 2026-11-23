"""B619 spike (throwaway), 3S5 and 3S6: colours sampled from the trim and banner screenshots (MSM's own patterns and
palettes) against MSM's own prediction. Only numbers are written; the screenshots are deleted after."""
import json, math, sys
import numpy as np
from PIL import Image

shots, client_json, out = sys.argv[1], sys.argv[2], sys.argv[3]
c = json.load(open(client_json))
FOV = math.radians(30)


def proj(cam, yaw, pitch, W, H, P):
    y, p = math.radians(yaw), math.radians(pitch)
    f = np.array([-math.sin(y) * math.cos(p), -math.sin(p), math.cos(y) * math.cos(p)])
    r = np.array([-math.cos(y), 0.0, -math.sin(y)])
    u = np.cross(r, f)
    F = (H / 2) / math.tan(FOV / 2)
    d = np.array(P) - np.array(cam)
    z = d @ f
    return W / 2 + F * (d @ r) / z, H / 2 - F * (d @ u) / z


def sample(img, x, y, k=4):
    a = np.array(img).astype(float)[int(y) - k:int(y) + k + 1, int(x) - k:int(x) + k + 1, :3]
    return np.median(a.reshape(-1, 3), 0)


def norm(v):
    v = np.array(v, float)
    return v / max(1e-6, v.max())


res = {}
# trims
material = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0), (255, 0, 255), (0, 255, 255), (255, 128, 0), (128, 0, 255)]
order = c['trims.layout'].split('order ')[1].split(';')[0].split(',')
img = Image.open(f'{shots}/b619_trims.png')
trims = {}
for i, key in enumerate(order):
    col, row = i % 7, i // 7
    x, y = proj((103.5, 149.82, 14.5), 180, 0, 1200, 1200, (100.5 + col, 150 - 3 * row + 1.15, 0.5 + 0.2))
    rgb = sample(img, x, y)
    pat, mat = key.split('/')
    entry = {'measured': [round(v) for v in rgb]}
    if pat.startswith('k') and pat[1:].isdigit() and mat == 'msm_b619:m':
        exp = material[int(pat[1:])]
        entry['predicted'] = list(exp)
        entry['chromaError'] = round(float(np.abs(norm(rgb) - norm(exp)).max()), 3)
    trims[key] = entry
res['trims'] = trims
# banners
img = Image.open(f'{shots}/b619_banners.png')
dsrc = json.load(open(sys.argv[4]))['dyes.textureDiffuseColor'] if len(sys.argv) > 4 else c['dyes.textureDiffuseColor']
dyes = {k: tuple(int(v[i:i + 2], 16) for i in (1, 3, 5)) for k, v in dsrc.items()}
lay = c['banners.layout']
ban = {}
ref = None
for name, (bx, by, bz) in lay.items():
    if name.startswith('shield'):
        continue
    bc = [float(v) for v in c['banners.screenshot'].split(' camera ')[1].split()[:3]]
    x, y = proj(bc, 180, 0, 1600, 1200, (bx + 0.5, by - 0.4, 0.1))
    if not (8 <= x < 1592 and 8 <= y < 1192):
        continue  # outside the picture
    ban[name] = [round(v) for v in sample(img, x, y, 6)]
white = np.array(ban['full_white'], float)
banners = {}
for name, rgb in ban.items():
    e = {'measured': rgb}
    if name.startswith('full_'):
        d = name[5:]
        pred = np.array(dyes[d], float) / np.array(dyes['white'], float) * white  # pattern white x dye, same light
        e['predicted'] = [round(v) for v in pred]
        e['maxError'] = round(float(np.abs(pred - np.array(rgb)).max()), 1)
    banners[name] = e
# multiply and blend checks against the full-pattern references
def pr(name, pred):
    banners[name]['predicted'] = [round(v) for v in pred]
    banners[name]['maxError'] = round(float(np.abs(np.array(pred) - np.array(banners[name]['measured'])).max()), 1)
pr('grey_white', np.array(ban['full_white']) * 128 / 255)
pr('grey_yellow', np.array(ban['full_yellow']) * 128 / 255)
pr('blue_then_yellow', np.array(ban['full_yellow'], float))
blue = ban.get('full_blue', np.array(dyes['blue'], float) / np.array(dyes['white'], float) * white)
pr('blue_then_halfa_lime', (np.array(blue, float) * (127 / 255) + np.array(ban['full_lime'], float) * (128 / 255)))
pr('red_halfa_white', (np.array(ban['base_red'], float) * (127 / 255) + np.array(ban['full_white'], float) * (128 / 255)))
res['banners'] = banners
res['dyes'] = dsrc
res['dyesFrom'] = 'the 26.3 accessor (26.4 has none)' if len(sys.argv) > 4 else 'this target'
json.dump(res, open(out, 'w'), indent=1)
for k, v in res['trims'].items():
    print('trim', k, v)
for k, v in res['banners'].items():
    print('banner', k, v)
