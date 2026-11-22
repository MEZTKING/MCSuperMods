"""structure_pieces.py — dump the pieces of every structure start in a generated reference world.

    python "Vanilla Jar/tools/structure_pieces.py" --world build/vanilla-server/world-seed4
    python "Vanilla Jar/tools/structure_pieces.py" --world build/vanilla-server/world-seed4 --kind minecraft:mansion --json out.json

Minecraft keeps a structure start in its chunk's `structures.starts`: the start's chunk and, per piece, the piece's id,
its bounding box, its template (TF/TP) and whether it overwrites (O). This reads every dimension's region folder and
prints one line a piece (`PIECE kind id x1 y1 z1 x2 y2 z2 ...`), plus `START` and `TOTAL` lines. Reads only; nothing is
written unless `--json` is given.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from extract_terrain import read_region  # noqa: E402

DIMS = ("overworld", "the_nether", "the_end")


def pieces_of(start):
    """The start compound's children in Minecraft's NBT names, whichever spelling this version writes."""
    for key in ("children", "Children", "pieces", "Pieces"):
        if key in start:
            return start[key]
    return []


def texts(d):
    return {k: v for k, v in d.items() if isinstance(v, (str, int, float, list, dict))}


def dump(world, want_kinds=None):
    found = []
    for dim in DIMS:
        region = world / f"dimensions/minecraft/{dim}/region"
        if not region.exists():
            continue
        for mca in sorted(region.glob("*.mca")):
            for cx, cz, root in read_region(mca):
                structures = root.get("structures") or root.get("Structures")
                if not structures:
                    continue
                starts = structures.get("starts") or structures.get("Starts") or {}
                for kind, start in starts.items():
                    if want_kinds and kind not in want_kinds:
                        continue
                    sx = start.get("ChunkX", cx)
                    sz = start.get("ChunkZ", cz)
                    pieces = pieces_of(start)
                    print(f"START {dim} {kind} chunk {sx},{sz} pieces {len(pieces)} keys {sorted(start.keys())}")
                    for p in pieces:
                        bb = p.get("BB") or p.get("bb") or []
                        print(f"PIECE {kind} {p.get('id')} bb {list(bb)} tf {p.get('TF')!r} tp {p.get('TP')!r} "
                              f"o {p.get('O')!r} gd {p.get('GD')!r} keys {sorted(k for k in p if k not in ('BB',))}")
                    found.append({"dim": dim, "kind": kind, "chunk": [sx, sz],
                                  "pieces": [{k: (v.tolist() if isinstance(v, bytes) else v) for k, v in p.items()}
                                             for p in pieces]})
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--world", required=True)
    ap.add_argument("--kind", action="append", help="only these structure ids (repeatable)")
    ap.add_argument("--json", help="write the starts to this file")
    a = ap.parse_args()
    found = dump(Path(a.world), a.kind)
    print(f"TOTAL {len(found)} starts")
    if a.json:
        Path(a.json).write_text(json.dumps(found, indent=1, default=str), encoding="utf-8")


if __name__ == "__main__":
    main()
