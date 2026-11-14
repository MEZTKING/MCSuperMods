"""nbt.py — read a structure template (`.nbt`) out of a vanilla jar/data pack, with the standard library only.

    python nbt.py <file.nbt> [--blocks] [--chests]

Prints the template's size, its block palette, and (with --blocks) every block, and (with --chests) every block entity that
carries a loot table — which is how you find out what a village house's chest will contain without running the game.

Structure templates are plain NBT (gzip-compressed in a data pack, uncompressed in a mod's folder):
    size    = [x, y, z]
    palette = [{Name, Properties?}, ...]
    blocks  = [{pos: [x, y, z], state: <palette index>, nbt?: {...}}, ...]
"""
import gzip
import sys

import region


def load(path):
    data = open(path, "rb").read()
    if data[:2] == b"\x1f\x8b":
        data = gzip.decompress(data)
    return region.NBT(data).root()


def main(argv):
    if len(argv) < 2:
        sys.exit(__doc__.strip().splitlines()[0])
    root = load(argv[1])
    size = root.get("size") or [0, 0, 0]
    print(f"size {size[0]} {size[1]} {size[2]}")
    palette = root.get("palette") or []
    print(f"palette {len(palette)} states")
    for i, entry in enumerate(palette):
        name, props = region.state(entry)
        print(f"  [{i:3d}] {name}" + (f" {props}" if props else ""))
    blocks = root.get("blocks") or []
    print(f"blocks {len(blocks)}")
    if "--blocks" in argv:
        for b in blocks:
            p = b.get("pos") or [0, 0, 0]
            name, _props = region.state(palette[b.get("state", 0)]) if b.get("state", 0) < len(palette) else ("?", {})
            print(f"  {p[0]:3d} {p[1]:3d} {p[2]:3d}  {name}")
    if "--chests" in argv:
        for b in blocks:
            nbt = b.get("nbt") or {}
            loot = nbt.get("LootTable") or nbt.get("loot_table")
            if loot:
                p = b.get("pos") or [0, 0, 0]
                print(f"  chest at {p[0]} {p[1]} {p[2]} -> {loot}")


if __name__ == "__main__":
    main(sys.argv)
