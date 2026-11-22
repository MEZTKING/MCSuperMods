import json, glob, os, collections
B = '/tmp/claude-0/-home-user/4a56a205-8696-50bd-85e1-c9cc01051fe4/scratchpad/b574/results'
rows = {}
for f in sorted(glob.glob(B + '/parity-*.json')):
  if os.path.getsize(f) == 0: continue
  d = json.load(open(f))
  v = d['version'][:4]
  for dim, r in d['dims'].items():
    g = 'climate dims' if dim.startswith('b574:clim') else dim.replace('minecraft:', '').replace('b574:', '')
    a = rows.setdefault((v, g), collections.Counter())
    if 'biome' in r: a['bcells'] += r['biome']['cells']; a['bmatch'] += r['biome']['match']
    for st in ('terrain', 'full'):
      x = r[st]; p = st[0]
      a[p + 'cols'] += x['columns']; a[p + 'exact'] += x['exactProfile']; a[p + 'exactNC'] += x.get('exactNoCarve', 0)
      a[p + 'cells'] += x['cells']; a[p + 'cellMatch'] += x['cellMatch']
      a[p + 'top4'] += x['top4']; a[p + 'top4n'] += x['top4n']
      for k, n in x['heightErr'].items():
        a[p + 'h0' if k == '0' else (p + 'h1' if k in ('1', '-1') else (p + 'h2_7' if k not in ('>=8', '<=-8') else p + 'h8'))] += n
      a[p + 'hn'] += sum(x['heightErr'].values())
      for k, n in x.get('k', {}).items(): a[p + k] += n
      a[p + 'under'] += x['under']['cells']; a[p + 'carve'] += x['under']['obsAir_dsSolid']; a[p + 'uSolidGame'] += x['under']['obsSolid_dsAir']; a[p + 'uWater'] += x['under']['water']; a[p + 'uLava'] += x['under']['lava']
      a[p + 'ms'] += x['msPerColumn'] * x['columns']
out = {}
for (v, g), a in sorted(rows.items()):
  pc = lambda n, d: round(100 * a[n] / a[d], 1) if a[d] else None
  o = {'biomeCells': a['bcells'] or None, 'biomeMatchPct': pc('bmatch', 'bcells')}
  for p, name in (('t', 'terrain'), ('f', 'full')):
    o[name] = {'columns': a[p + 'cols'], 'cellMatchPct': pc(p + 'cellMatch', p + 'cells'), 'exactColumnPct': pc(p + 'exact', p + 'cols'), 'exactColumnIgnoringCarvedPct': pc(p + 'exactNC', p + 'cols'),
               'heightExactPct': pc(p + 'h0', p + 'hn'), 'heightOff1Pct': pc(p + 'h1', p + 'hn'), 'heightOff2to7Pct': pc(p + 'h2_7', p + 'hn'), 'heightOff8PlusPct': pc(p + 'h8', p + 'hn'),
               'top4ExactPct': pc(p + 'top4', p + 'top4n'), 'cellsSolidOnlyInGame': a[p + 'solidOnlyInGame'], 'cellsSolidOnlyInPreview': a[p + 'solidOnlyInPreview'], 'cellsFluidDiffers': a[p + 'fluidDiffers'],
               'underground': {'cells': a[p + 'under'], 'carvedInGamePct': pc(p + 'carve', p + 'under'), 'solidOnlyInGamePct': pc(p + 'uSolidGame', p + 'under'), 'waterDiffersPct': pc(p + 'uWater', p + 'under'), 'lavaDiffersPct': pc(p + 'uLava', p + 'under')},
               'msPerColumn': round(a[p + 'ms'] / a[p + 'cols'], 1) if a[p + 'cols'] else None}
  out[f'{v} {g}'] = o
print(json.dumps(out, indent=1))
