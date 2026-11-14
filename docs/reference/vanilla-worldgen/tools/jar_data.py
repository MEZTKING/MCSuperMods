"""jar_data.py — list or print files out of a Minecraft jar's data pack, with the standard library only.

    python jar_data.py <jar|zip> list [prefix]      # e.g. list worldgen/feature
    python jar_data.py <jar|zip> cat  <path>        # e.g. cat worldgen/feature/oak.json
    python jar_data.py <jar|zip> grep <text>        # find files whose text contains something
    python jar_data.py <jar|zip> extract <dir> [prefix]   # write the data pack out to a folder

A modern `server.jar` is a **bundler**: the real server (and its data pack) sits in a nested jar under `versions/` (or
`META-INF/versions/`), which is why a plain listing of the outer jar shows no `data/`. This tool opens the nested jar when the
outer one has no `data/` entry.

Paths inside a data pack are `data/<namespace>/<path>`; give them without `data/minecraft/`, e.g. `worldgen/feature/oak.json`.
"""
import io
import sys
import zipfile


def open_pack(jar):
    """The zip file that holds `data/`, following a bundler jar's nested server jar."""
    z = zipfile.ZipFile(jar)
    if any(n.startswith("data/") for n in z.namelist()):
        return z
    nested = [n for n in z.namelist() if n.endswith(".jar") and ("versions/" in n or "bundler" in n)]
    nested.sort(key=len)
    if not nested:
        return z
    inner = zipfile.ZipFile(io.BytesIO(z.read(nested[0])))
    return inner


def entries(z, want):
    prefix = "data/minecraft/" + want
    return [n for n in z.namelist() if n.startswith(prefix)]


def main(argv):
    if len(argv) < 3:
        sys.exit(__doc__.strip().splitlines()[0])
    jar, verb = argv[1], argv[2]
    z = open_pack(jar)
    if verb == "list":
        want = argv[3] if len(argv) > 3 else ""
        hits = entries(z, want)
        for n in hits:
            print(n)
        if not hits:
            print(f"no data/minecraft/{want} entries", file=sys.stderr)
    elif verb == "cat":
        for n in entries(z, argv[3]):
            print(f"===== {n}")
            print(z.read(n).decode("utf-8", "replace"))
    elif verb == "grep":
        text = argv[3]
        hits = 0
        for n in z.namelist():
            if not n.startswith("data/") or not (n.endswith(".json") or n.endswith(".mcfunction")):
                continue
            if text in z.read(n).decode("utf-8", "replace"):
                print(n)
                hits += 1
        print(f"{hits} files contain {text!r}")
    elif verb == "extract":
        out = argv[3]
        want = argv[4] if len(argv) > 4 else ""
        import os
        n = 0
        for name in entries(z, want):
            rel = name.split("data/minecraft/", 1)[1]
            path = os.path.join(out, rel)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "wb") as f:
                f.write(z.read(name))
            n += 1
        print(f"wrote {n} files under {out}")
    else:
        sys.exit(f"unknown verb {verb}")


if __name__ == "__main__":
    main(sys.argv)
