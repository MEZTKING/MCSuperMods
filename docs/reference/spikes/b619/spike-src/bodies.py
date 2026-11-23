"""B619 spike (throwaway), 3S3: stand-in bodies from the decoded views.

Input: run/<mc>/client.json (camera numbers) and run/<mc>/bodies/<body>_<view>.png (each pixel: the texel of MSM's
coded test picture it shows; B 255 = sure, 128 = moved between frames, 64 = a weak bit, 0 = background).
1. Each view is cut into faces: connected pixels whose texels differ by at most one.
2. Each face gets a map texel -> screen (least squares over texel centroids). A face seen square on (two equal,
   perpendicular steps) lies in a plane parallel to the picture; its depth is unknown.
3. Depths come from neighbours: where a face's UV edge borders a face of a perpendicular view along the same world
   axis, the edge is shared in 3D, so each face's plane is the other's edge. Iterated a few times (perspective).
4. The faces found are drawn again with the same cameras and compared with the game's decode, texel by texel.
Output: results/bodies-<mc>.json (per body: faces with UV rectangles and corners in model pixels, texel scale, the
match rate, faces at an angle that were left out).
"""
import json, math, sys
import numpy as np
from PIL import Image

RUN, MC, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
ONLY = sys.argv[4].split(',') if len(sys.argv) > 4 and sys.argv[4] else None
S = 1200
FPX = (S / 2) / math.tan(math.radians(15))


def axes(yaw, pitch):
    y, p = math.radians(yaw), math.radians(pitch)
    f = np.array([-math.sin(y) * math.cos(p), -math.sin(p), math.cos(y) * math.cos(p)])
    r = np.array([-math.cos(y), 0.0, -math.sin(y)])
    u = np.cross(r, f)
    return f, r, u


def components(U, V, ok):
    h, w = U.shape
    idx = np.arange(h * w).reshape(h, w)
    lab = np.where(ok, idx, -1).ravel()
    Uf, Vf, okf = U.ravel(), V.ravel(), ok.ravel()
    pairs = []
    for dy, dx in ((0, 1), (1, 0)):
        a = idx[: h - dy, : w - dx].ravel()
        b = idx[dy:, dx:].ravel()
        m = okf[a] & okf[b] & (np.abs(Uf[a] - Uf[b]) <= 1) & (np.abs(Vf[a] - Vf[b]) <= 1)
        pairs.append((a[m], b[m]))
    a = np.concatenate([p[0] for p in pairs])
    b = np.concatenate([p[1] for p in pairs])
    for _ in range(200):
        la, lb = lab[a], lab[b]
        mn = np.minimum(la, lb)
        changed = (la != mn).any() or (lb != mn).any()
        np.minimum.at(lab, a, mn)
        np.minimum.at(lab, b, mn)
        valid = lab >= 0
        lab[valid] = lab[lab[valid]]
        if not changed:
            break
    return lab.reshape(h, w)


def view_faces(img, cam, vname):
    a = np.array(img).astype(np.int64)
    U, V, B = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    ok = B == 255
    lab = components(U, V, ok)
    f, r, up = axes(cam[3], cam[4])
    C = np.array(cam[:3])
    ys, xs = np.nonzero(ok)
    L = lab[ys, xs]
    code = U[ys, xs] * 256 + V[ys, xs]
    key = L * 65536 + code
    uk, inv, cnt = np.unique(key, return_inverse=True, return_counts=True)
    cx = np.bincount(inv, weights=xs + 0.5) / cnt
    cy = np.bincount(inv, weights=ys + 0.5) / cnt
    comp = uk // 65536
    tu = (uk % 65536) // 256
    tv = uk % 256
    faces = []
    for c in np.unique(comp):
        m = np.nonzero(comp == c)[0]
        rest = m
        while len(rest) >= 4:
            uu, vv = tu[rest] + 0.5, tv[rest] + 0.5
            M = np.stack([uu, vv, np.ones_like(uu)], 1)
            X = np.stack([cx[rest], cy[rest]], 1)
            w = cnt[rest].astype(float)
            keep = np.ones(len(rest), bool)
            for thr in (3.0, 1.5, 0.6, -3.0, -1.5, -1.2, -1.2):
                if keep.sum() < 4:
                    break
                A, *_ = np.linalg.lstsq(M[keep] * np.sqrt(w[keep])[:, None], X[keep] * np.sqrt(w[keep])[:, None], rcond=None)
                step = (np.linalg.norm(A[0]) + np.linalg.norm(A[1])) / 2
                resid = np.sqrt(((M @ A - X) ** 2).sum(1))
                keep = resid < (-thr if thr < 0 else max(1.0, thr * step))
            if keep.sum() < 4:
                break
            sel = rest[keep]
            res = float(np.sqrt((((M @ A - X) ** 2).sum(1))[keep].mean()))
            du, dv = A[0], A[1]
            nu, nv = np.linalg.norm(du), np.linalg.norm(dv)
            ext = min(int(tu[sel].max() - tu[sel].min()) + 1, int(tv[sel].max() - tv[sel].min()) + 1)
            tol = max(0.08, 0.3 / ext)
            square = abs(nu - nv) / max(nu, nv) < tol and abs(du @ dv) / (nu * nv) < tol
            faces.append({'view': vname, 'C': C, 'f': f, 'r': r, 'up': up, 'A': A.T, 'res': res, 'square': square,
                          'uv': (int(tu[sel].min()), int(tv[sel].min()), int(tu[sel].max()) + 1, int(tv[sel].max()) + 1),
                          'texels': set(zip(tu[sel].tolist(), tv[sel].tolist())), 'pixels': int(cnt[sel].sum()),
                          'step': float((nu + nv) / 2)})
            rest = rest[~keep]
    return faces


def world(face, t, u, v):
    if 'quad' in face:
        P0, Wu, Wv = face['quad']
        return P0 + u * Wu + v * Wv
    s = face['A'] @ np.array([u, v, 1.0])
    return face['C'] + t * (face['f'] + (s[0] - S / 2) / FPX * face['r'] - (s[1] - S / 2) / FPX * face['up'])


def edges(face):
    u0, v0, u1, v1 = face['uv']
    return [('u', u0, v0, v1, -1), ('u', u1, v0, v1, 0), ('v', v0, u0, u1, -1), ('v', v1, u0, u1, 0)]


def ray(face, u, v):
    sc = face['A'] @ np.array([u, v, 1.0])
    d = face['f'] + (sc[0] - S / 2) / FPX * face['r'] - (sc[1] - S / 2) / FPX * face['up']
    return face['C'], d / np.linalg.norm(d)


def triangulate(faces, cands, u, v):
    """The 3D point of UV point (u, v) from two faces of different, non-parallel views that hold its texel."""
    best = None
    for a in range(len(cands)):
        for b in range(a + 1, len(cands)):
            fa, fb = faces[cands[a]], faces[cands[b]]
            if fa['view'] == fb['view'] or abs(fa['f'] @ fb['f']) > 0.9:
                continue
            c1, d1 = ray(fa, u, v)
            c2, d2 = ray(fb, u, v)
            w0 = c1 - c2
            bb = d1 @ d2
            den = 1 - bb * bb
            if den < 1e-6:
                continue
            s1 = (bb * (d2 @ w0) - (d1 @ w0)) / den
            s2 = ((d2 @ w0) - bb * (d1 @ w0)) / den
            p1, p2 = c1 + s1 * d1, c2 + s2 * d2
            gap = np.linalg.norm(p1 - p2)
            if best is None or gap < best[1]:
                best = ((p1 + p2) / 2, gap)
    return best


def solve(faces, D):
    for fc in faces:
        fc['t'] = D
    by_texel = {}
    for i, fc in enumerate(faces):
        for tx in fc['texels']:
            by_texel.setdefault(tx, []).append(i)
    links = []
    for i, fc in enumerate(faces):
        if not fc['square']:
            continue
        for kind, line, a0, a1, off in edges(fc):
            for other in set(j for k in range(a0, a1) for j in by_texel.get(
                    ((line + off, k) if kind == 'u' else (k, line + off)), []) if j != i):
                g = faces[other]
                if not g['square'] or abs(fc['f'] @ g['f']) > 0.1:
                    continue
                links.append((i, other, kind, line, a0, a1))
    good = []
    for _ in range(6):
        cons = {}
        good = []
        for i, j, kind, line, a0, a1 in links:
            fi, fj = faces[i], faces[j]
            pts_i = [world(fi, fi['t'], line, k + 0.5) if kind == 'u' else world(fi, fi['t'], k + 0.5, line) for k in (a0, a1 - 1)]
            pts_j = [world(fj, fj['t'], line, k + 0.5) if kind == 'u' else world(fj, fj['t'], k + 0.5, line) for k in (a0, a1 - 1)]
            di, dj = pts_i[1] - pts_i[0], pts_j[1] - pts_j[0]
            if a1 - a0 > 1:
                ni, nj = np.linalg.norm(di), np.linalg.norm(dj)
                if ni == 0 or nj == 0 or (di @ dj) / (ni * nj) < 0.95:
                    continue
            # the edge's position along fi's view axis is fi's plane distance
            ti = float(np.mean([fi['f'] @ (p - fi['C']) for p in pts_j]))
            good.append((i, j))
            cons.setdefault(i, []).append(ti)
        for i, ts in cons.items():
            faces[i]['t'] = float(np.median(ts))
    linked = {i for i, _ in good}
    # Square faces without a square neighbour: their shared UV edges triangulated from two views.
    for i, fc in enumerate(faces):
        if not fc['square'] or i in linked:
            continue
        ts = []
        for kind, line, a0, a1, off in edges(fc):
            for k in range(a0, a1):
                tx = (line + off, k) if kind == 'u' else (k, line + off)
                cands = [j for j in by_texel.get(tx, []) if j != i]
                if len(cands) < 2:
                    continue
                uv = (line, k + 0.5) if kind == 'u' else (k + 0.5, line)
                tri = triangulate(faces, cands, *uv)
                if tri is not None and tri[1] < 0.02:
                    ts.append(fc['f'] @ (tri[0] - fc['C']))
        if ts:
            fc['t'] = float(np.median(ts))
            linked.add(i)
            fc['via'] = 'triangulated edge'
    # Faces at an angle: corners triangulated from two views, kept as a general quad.
    for i, fc in enumerate(faces):
        fc['linked'] = i in linked
        if fc['square']:
            continue
        u0, v0, u1, v1 = fc['uv']
        pts = {}
        for uu, vv, tx in ((u0 + 0.5, v0 + 0.5, (u0, v0)), (u1 - 0.5, v0 + 0.5, (u1 - 1, v0)), (u0 + 0.5, v1 - 0.5, (u0, v1 - 1))):
            cands = by_texel.get(tx, [])
            if i in cands and len(cands) >= 2:
                tri = triangulate(faces, cands, uu, vv)
                if tri is not None and tri[1] < 0.02:
                    pts[(uu, vv)] = tri[0]
        if len(pts) == 3 and u1 - u0 > 1 and v1 - v0 > 1:
            (pa, a), (pb, b), (pc, c) = list(pts.items())
            Wu = (pts[(u1 - 0.5, v0 + 0.5)] - pts[(u0 + 0.5, v0 + 0.5)]) / (u1 - u0 - 1)
            Wv = (pts[(u0 + 0.5, v1 - 0.5)] - pts[(u0 + 0.5, v0 + 0.5)]) / (v1 - v0 - 1)
            fc['quad'] = (pts[(u0 + 0.5, v0 + 0.5)] - (u0 + 0.5) * Wu - (v0 + 0.5) * Wv, Wu, Wv)
            fc['linked'] = True
    return faces


def render(faces, cam, shape):
    f, r, up = axes(cam[3], cam[4])
    C = np.array(cam[:3])
    ys, xs = np.mgrid[0:shape[0], 0:shape[1]]
    dirs = f[None, None, :] + ((xs + 0.5 - S / 2) / FPX)[..., None] * r - ((ys + 0.5 - S / 2) / FPX)[..., None] * up
    best = np.full(shape, np.inf)
    out_u = np.full(shape, -1)
    out_v = np.full(shape, -1)
    for fc in faces:
        if not fc['linked']:
            continue
        P0 = world(fc, fc.get('t', 0), 0, 0)
        Wu = world(fc, fc.get('t', 0), 1, 0) - P0
        Wv = world(fc, fc.get('t', 0), 0, 1) - P0
        n = np.cross(Wu, Wv)
        n = n / np.linalg.norm(n)
        if n @ (P0 - fc['C']) < 0:
            n = -n  # n points away from the camera that saw it: visible where dir . n > 0
        den = dirs @ n
        with np.errstate(divide='ignore', invalid='ignore'):
            s = ((P0 - C) @ n) / den
        H = C[None, None, :] + s[..., None] * dirs
        G = np.array([[Wu @ Wu, Wu @ Wv], [Wu @ Wv, Wv @ Wv]])
        Gi = np.linalg.inv(G)
        rel = H - P0
        b = np.stack([rel @ Wu, rel @ Wv], -1)
        uv = b @ Gi.T
        u0, v0, u1, v1 = fc['uv']
        inside = (den > 1e-9) & (s > 0) & (uv[..., 0] >= u0) & (uv[..., 0] < u1) & (uv[..., 1] >= v0) & (uv[..., 1] < v1)
        inside &= np.isin(np.floor(uv[..., 0]).astype(int) * 256 + np.floor(uv[..., 1]).astype(int),
                          np.array([a * 256 + c for a, c in fc['texels']]))
        closer = inside & (s < best)
        best[closer] = s[closer]
        out_u[closer] = np.floor(uv[..., 0][closer])
        out_v[closer] = np.floor(uv[..., 1][closer])
    return out_u, out_v


client = json.load(open(f'{RUN}/{MC}/client.json'))
try:
    client.update({k: v for k, v in json.load(open(f'{RUN}/{MC}/client-rerun.json')).items() if k.startswith('body.')})
except FileNotFoundError:
    pass
results = {}
for key, meta in sorted(client.items()):
    if not key.startswith('body.') or not isinstance(meta, dict) or 'views' not in meta:
        continue
    name = key[5:]
    if ONLY and name not in ONLY:
        continue
    ent = np.array(meta['entity'][:3])
    views = {v['view']: v for v in meta['views']}
    faces = []
    imgs = {}
    for vn in ['front', 'back', 'east', 'west', 'top', 'bottom']:
        try:
            img = Image.open(f'{RUN}/{MC}/bodies/{name}_{vn}.png').convert('RGB')
        except FileNotFoundError:
            continue
        imgs[vn] = np.array(img).astype(int)
        faces += view_faces(img, views[vn]['camera'], vn)
    solve(faces, meta['distance'])
    # compare
    total = same = sil_game = sil_both = 0
    per_view = {}
    for vn, a in imgs.items():
        ou, ov = render(faces, views[vn]['camera'], a.shape[:2])
        okg = a[:, :, 2] == 255
        fgg = a[:, :, 2] > 0
        fgm = ou >= 0
        eq = okg & fgm & (ou == a[:, :, 0]) & (ov == a[:, :, 1])
        per_view[vn] = {'texelMatch': round(float(eq.sum() / max(1, okg.sum())), 4),
                        'silhouetteIoU': round(float((fgg & fgm).sum() / max(1, (fgg | fgm).sum())), 4)}
        total += okg.sum()
        same += eq.sum()
        sil_game += (fgg | fgm).sum()
        sil_both += (fgg & fgm).sum()
    kept = [fc for fc in faces if fc['linked']]
    out_faces = []
    for fc in kept:
        u0, v0, u1, v1 = fc['uv']
        corners = [((world(fc, fc.get('t', 0), uu, vv) - ent) * 16).round(2).tolist() for uu, vv in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]
        scale = float(np.linalg.norm(world(fc, fc.get('t', 0), 1, 0) - world(fc, fc.get('t', 0), 0, 0)) * 16)
        out_faces.append({'view': fc['view'], 'uv': [u0, v0, u1, v1], 'corners': corners, 'pxPerTexel': round(scale, 3),
                          'fit': round(fc['res'], 2), 'how': 'triangulated corners' if 'quad' in fc else fc.get('via', 'square neighbour')})
    stable = {v['view']: v['unstable'] for v in meta['views']}
    results[name] = {
        'variant': meta.get('variant', '')[:120], 'textures': meta['textures'],
        'faces': len(faces), 'kept': len(kept),
        'atAnAngle': sum(1 for fc in faces if not fc['square']),
        'atAnAngleKept': sum(1 for fc in faces if 'quad' in fc),
        'unlinked': sum(1 for fc in faces if not fc['linked']),
        'texelMatch': round(float(same / max(1, total)), 4), 'silhouetteIoU': round(float(sil_both / max(1, sil_game)), 4),
        'perView': per_view, 'unstablePixels': stable, 'faceList': out_faces}
    print(name, 'faces', len(faces), 'kept', len(kept), 'angle', results[name]['atAnAngle'], 'unlinked', results[name]['unlinked'],
          'match', results[name]['texelMatch'], 'IoU', results[name]['silhouetteIoU'], flush=True)
json.dump(results, open(OUT, 'w'), indent=1)
