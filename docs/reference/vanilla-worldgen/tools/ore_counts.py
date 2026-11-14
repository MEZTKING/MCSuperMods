"""ore_counts.py — count ores per chunk in vanilla region files, per type, with every palette state read.

    python ore_counts.py <region-dir> [--csv out.csv]

Prints, per chunk, the count of every ore block (all the deepslate variants are counted with their stone counterpart) and a
summary: ores a chunk, and per type.

The palette forms matter (see region.py): a counter that only reads bare strings and `{"Name"}` silently drops every block
whose state is not the default.
"""
import sys
from collections import Counter

import region

ORES = {
    "coal_ore": "coal", "deepslate_coal_ore": "coal",
    "iron_ore": "iron", "deepslate_iron_ore": "iron",
    "copper_ore": "copper", "deepslate_copper_ore": "copper",
    "redstone_ore": "redstone", "deepslate_redstone_ore": "redstone",
    "lapis_ore": "lapis", "deepslate_lapis_ore": "lapis",
    "diamond_ore": "diamond", "deepslate_diamond_ore": "diamond",
    "gold_ore": "gold", "deepslate_gold_ore": "gold",
    "nether_gold_ore": "gold", "nether_quartz_ore": "quartz", "ancient_debris": "debris",
    "emerald_ore": "emerald", "deepslate_emerald_ore": "emerald",
}


def count_chunk(root):
    n = Counter()
    for _x, _y, _z, name, _props in region.blocks(root):
        kind = ORES.get(name.split(":")[-1])
        if kind:
            n[kind] += 1
    return n


def main(argv):
    if len(argv) < 2:
        sys.exit(__doc__.strip().splitlines()[0])
    total, chunks, rows = Counter(), 0, []
    for cx, cz, root in region.chunks(argv[1]):
        if region.status(root) not in (None, "minecraft:full", "full"):
            continue
        n = count_chunk(root)
        chunks += 1
        total.update(n)
        rows.append(f"{cx},{cz},{sum(n.values())}," + ",".join(f"{k}={n[k]}" for k in sorted(n)))
    if not chunks:
        sys.exit("no full chunks found (is this a region folder?)")
    print(f"chunks {chunks}")
    print(f"ores a chunk {sum(total.values()) / chunks:.3f}")
    for kind in sorted(total):
        print(f"  {kind:9s} {total[kind] / chunks:8.3f} a chunk   ({total[kind]} in all)")
    if "--csv" in argv:
        out = argv[argv.index("--csv") + 1]
        with open(out, "w", encoding="utf-8") as f:
            f.write("cx,cz,ores," + ",".join(sorted(total)) + "\n")
            f.write("\n".join(rows) + "\n")
        print(f"per-chunk rows written to {out}")
    print("\nFor reference, the vanilla overworld's 256-chunk average on seed 9 is 375.3 ores a chunk; a mod that changes ore"
          " placement should land within a few percent of that on the same chunks.")


if __name__ == "__main__":
    main(sys.argv)
