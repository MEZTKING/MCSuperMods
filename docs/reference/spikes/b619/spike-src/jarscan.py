import zipfile, json, sys, collections
out = {}
for v in ['26.3', '26.4-snapshot-7']:
    z = zipfile.ZipFile(f'/root/.gradle/caches/fabric-loom/{v}/minecraft-client.jar')
    folders = collections.defaultdict(lambda: [0, 0, 0])
    for i in z.infolist():
        n = i.filename
        if n.endswith('/'): continue
        p = n.split('/')
        if p[0] == 'assets' and len(p) > 3:
            key = '/'.join(p[2:4]) if p[2] in ('textures', 'shaders') and len(p) > 4 else p[2]
            if p[2] == 'textures' and p[3] in ('gui',) and len(p) > 5: key = '/'.join(p[2:5])
            if p[2] == 'textures' and p[3] in ('entity','trims') and len(p) > 5: key = '/'.join(p[2:5])
        elif p[0] == 'data' and len(p) > 3:
            key = 'data:' + p[2] + ('/' + p[3] if p[2] in ('tags', 'worldgen') and len(p) > 4 else '')
        else:
            continue
        f = folders[key]; f[0] += 1; f[1] += i.file_size; f[2] += i.compress_size
    out[v] = {k: {'files': a, 'bytes': b, 'zipped': c} for k, (a, b, c) in sorted(folders.items())}
json.dump(out, open(sys.argv[1], 'w'), indent=1, sort_keys=True)
