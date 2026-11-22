import zipfile, sys, json, collections
res = {}
for mc in ["26.3", "26.4-snapshot-7"]:
    z = zipfile.ZipFile(f"/root/.gradle/caches/fabric-loom/{mc}/minecraft-client.jar")
    folders = collections.defaultdict(lambda: [0, 0, 0])
    for i in z.infolist():
        n = i.filename
        if not n.startswith("data/minecraft/") or n.endswith("/"):
            continue
        rest = n[len("data/minecraft/"):]
        parts = rest.split("/")
        key = parts[0]
        if key in ("tags", "worldgen") and len(parts) > 2:
            key = parts[0] + "/" + parts[1]
            if key == "tags/worldgen" and len(parts) > 3:
                key = "tags/worldgen/" + parts[2]
        if key == "worldgen" and False:
            pass
        f = folders[key]
        f[0] += 1; f[1] += i.file_size; f[2] += i.compress_size
    res[mc] = {k: {"files": v[0], "bytes": v[1], "zipped": v[2]} for k, v in sorted(folders.items())}
json.dump(res, open(sys.argv[1], "w"), indent=1)
for mc, f in res.items():
    print(mc, sum(v["files"] for v in f.values()), sum(v["bytes"] for v in f.values()))
    for k, v in f.items():
        print(f"  {k:45} {v['files']:5} {v['bytes']:9}")
