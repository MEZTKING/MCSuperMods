"""B619 spike (throwaway): writes MSM's own test pictures and data into the GameTest resources.

Every picture here is drawn by this script. The only values taken from the user's jar at run time are
the eight grey levels of the trim key palette (so the test pattern uses the levels a real pattern
would), read into memory and never written anywhere but the throwaway pattern files.
Usage: python3 -I make_fixture.py <engine-mod/src/gametest/resources> <client jar>
"""
import io, json, os, shutil, sys, zipfile
from PIL import Image

res, jar = sys.argv[1], sys.argv[2]
A = os.path.join(res, 'assets', 'msm_b619')
D = os.path.join(res, 'data', 'msm_b619')
for root in (A, D):
    shutil.rmtree(root, ignore_errors=True)


def png(path, img):
    full = os.path.join(A, 'textures', path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    img.save(full)


def js(base, path, obj):
    full = os.path.join(base, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w') as f:
        json.dump(obj, f, indent=2, sort_keys=True)


z = zipfile.ZipFile(jar)
key = Image.open(io.BytesIO(z.read('assets/minecraft/textures/palettes/trim_base.png'))).convert('L')
levels = [key.getpixel((i, 0)) for i in range(key.size[0])]

# 3S5 trims: one pattern per key level (the whole picture that level), two colours outside the key, one half alpha.
patterns = {f'k{i}': (lv, lv, lv, 255) for i, lv in enumerate(levels)}
patterns['xred'] = (255, 0, 0, 255)
mid = (levels[3] + levels[4]) // 2
patterns['xgrey'] = (mid, mid, mid, 255)
patterns['khalf'] = (levels[4], levels[4], levels[4], 128)
patterns['knometa'] = (levels[3], levels[3], levels[3], 255)
for name, colour in patterns.items():
    for layer in ('humanoid', 'humanoid_leggings'):
        png(f'trims/entity/{layer}/{name}.png', Image.new('RGBA', (64, 32), colour))
        if name != 'knometa':
            # Since 26.3 a pattern picture names its key palette in its .mcmeta (texture_meta 'palette.base_palette').
            with open(os.path.join(A, 'textures', f'trims/entity/{layer}/{name}.png.mcmeta'), 'w') as f:
                json.dump({'palette': {'base_palette': 'minecraft:trim_base'}}, f)
    js(D, f'trim_pattern/{name}.json', {'asset_id': f'msm_b619:{name}', 'decal': False, 'description': f'b619 {name}'})
material = [(255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0), (255, 0, 255), (0, 255, 255), (255, 128, 0), (128, 0, 255)]
pal = Image.new('RGB', (len(material), 1))
for i, c in enumerate(material):
    pal.putpixel((i, 0), c)
png('palettes/trim/m.png', pal)
js(D, 'trim_material/m.json', {'palette_id': 'msm_b619:trim/m', 'description': 'b619 m'})
js(A, 'equipment/clear.json', {'layers': {'humanoid': [{'texture': 'msm_b619:clear'}], 'humanoid_leggings': [{'texture': 'msm_b619:clear'}]}})
for layer in ('humanoid', 'humanoid_leggings'):
    png(f'entity/equipment/{layer}/clear.png', Image.new('RGBA', (64, 32), (0, 0, 0, 0)))

# 3S6 banners and shields: uniform patterns (full white, grey 128, white at alpha 128).
for name, colour in {'full': (255, 255, 255, 255), 'grey': (128, 128, 128, 255), 'halfa': (255, 255, 255, 128)}.items():
    png(f'entity/banner/{name}.png', Image.new('RGBA', (64, 64), colour))
    png(f'entity/shield/{name}.png', Image.new('RGBA', (64, 64), colour))
    js(D, f'banner_pattern/{name}.json', {'asset_id': f'msm_b619:{name}', 'translation_key': f'b619.{name}'})

# 3S11 waypoint style: four sprites, a colour each, distances 8 and 32.
for i, c in enumerate([(255, 0, 0, 255), (0, 255, 0, 255), (0, 0, 255, 255), (255, 255, 0, 255)]):
    png(f'gui/sprites/hud/locator_bar_dot/w{i}.png', Image.new('RGBA', (9, 9), c))
js(A, 'waypoint_style/test.json', {'near_distance': 8, 'far_distance': 32, 'sprites': [f'msm_b619:w{i}' for i in range(4)]})

# 3S7 fonts: an 8 by 8 glyph sheet with known opaque columns.
cols = {'A': range(0, 8), 'B': range(0, 5), 'C': [0], 'D': [], 'E': [0, 1, 2, 5], 'F': [2, 3], 'G': range(0, 8), 'H': [7]}
sheet = Image.new('RGBA', (32, 16), (0, 0, 0, 0))
for idx, ch in enumerate('ABCDEFGH'):
    cx, cy = (idx % 4) * 8, (idx // 4) * 8
    rows = [0] if ch == 'G' else range(0, 8)
    for x in cols[ch]:
        for y in rows:
            sheet.putpixel((cx + x, cy + y), (255, 255, 255, 255))
png('font/glyphs.png', sheet)
bitmap = {'type': 'bitmap', 'file': 'msm_b619:font/glyphs.png', 'chars': ['ABCD', 'EFGH']}
js(A, 'font/bitmap8.json', {'providers': [dict(bitmap, ascent=7, height=8)]})
js(A, 'font/bitmap16.json', {'providers': [dict(bitmap, ascent=14, height=16)]})
js(A, 'font/bitmap4.json', {'providers': [dict(bitmap, ascent=3, height=4)]})
js(A, 'font/space.json', {'providers': [{'type': 'space', 'advances': {' ': 7, 'a': 12.5, 'b': -3}}]})
js(A, 'font/ref.json', {'providers': [{'type': 'reference', 'id': 'msm_b619:bitmap8'}, {'type': 'space', 'advances': {' ': 9}}]})
ttf = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
if os.path.exists(ttf):
    os.makedirs(os.path.join(A, 'font'), exist_ok=True)
    shutil.copy(ttf, os.path.join(A, 'font', 'dejavu.ttf'))
    js(A, 'font/ttf11.json', {'providers': [{'type': 'ttf', 'file': 'msm_b619:dejavu.ttf', 'size': 11, 'oversample': 2, 'shift': [0, 0]}]})
print('levels', len(levels), 'patterns', len(patterns))
