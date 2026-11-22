# Dump a generated world compactly: per chunk status, biome cells and run-length block columns. Then the caller deletes it.
import json, os, sys
sys.path.insert(0, '/home/user/MCSuperMods/docs/reference/vanilla-worldgen/tools')
import region
world, out = sys.argv[1], sys.argv[2]
dims = {}
for root_dir, dirs, files in os.walk(os.path.join(world, 'dimensions')):
  if os.path.basename(root_dir) == 'region':
    rel = os.path.relpath(os.path.dirname(root_dir), os.path.join(world, 'dimensions'))
    dims[rel.replace(os.sep, ':', 1)] = root_dir
result = {}
for dim, rdir in sorted(dims.items()):
  chunks = []
  starts = []
  for cx, cz, root in region.chunks(rdir):
    st = region.status(root)
    for sid, sv in ((root.get('structures') or {}).get('starts') or {}).items():
      if isinstance(sv, dict) and sv.get('id', 'INVALID') != 'INVALID': starts.append([cx, cz, sid])
    for sid, refs in ((root.get('structures') or {}).get('References') or {}).items():
      for v in (refs or []):
        v &= (1 << 64) - 1
        x = v & 0xffffffff; z = v >> 32
        if x >= 1 << 31: x -= 1 << 32
        if z >= 1 << 31: z -= 1 << 32
        starts.append([x, z, sid])
    secs = region.sections(root)
    biomes = {}
    cols = None
    for sy, sec in sorted(secs.items()):
      if sec.get('biomes'):
        pal, idx = region.container(sec['biomes'], count=64, min_bits=1)
        names = [region.state(e)[0] for e in pal]
        biomes[sy] = [names[(idx[i] if idx else 0)] for i in range(64)]
    if st and st.replace('minecraft:', '') in ('structure_starts', 'empty', 'structure_references'): continue
    if st and st.replace('minecraft:', '') not in ('empty', 'structure_starts', 'structure_references', 'biomes', 'initialize_light'):
      cols = [[] for _ in range(256)]
      for sy in sorted(secs):
        sec = secs[sy]
        bs = sec.get('block_states')
        if not bs: continue
        pal, idx = region.container(bs)
        names = [region.state(e) for e in pal]
        labels = []
        for n, props in names:
          lab = n.replace('minecraft:', '')
          if props.get('waterlogged') == 'true': lab += '~w'
          labels.append(lab)
        for i in range(4096):
          c = i & 255
          if (c & 3) != 2 or ((c >> 4) & 3) != 2: continue
          k = idx[i] if idx is not None else 0
          lab = labels[k]
          col = cols[c]
          # i = x | z<<4 | y<<8 ; columns indexed x + z*16 ; y ascending
          if col and col[-1][0] == lab: col[-1][1] += 1
          else: col.append([lab, 1])
      ymin = min(secs) * 16 if secs else 0
      cols = {'ymin': min(s for s in secs if secs[s].get('block_states')) * 16 if any(secs[s].get('block_states') for s in secs) else 0, 'runs': cols}
    chunks.append({'cx': cx, 'cz': cz, 'status': st, 'biomes': biomes, 'cols': cols})
  result[dim] = chunks
  result['starts:' + dim] = sorted(set(tuple(x) for x in starts))
  print(dim, len(chunks), {s: sum(1 for c in chunks if c['status'] == s) for s in set(c['status'] for c in chunks)}, file=sys.stderr)
json.dump(result, open(out, 'w'))
