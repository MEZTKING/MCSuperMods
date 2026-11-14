"""region.py — read a Minecraft 26.x / 1.20+ region file with nothing but the standard library.

Why this exists: mods that touch world generation need to compare their output against the game's own. A region file is
straightforward once you know the four details that trip everyone up:

  1. a chunk's block data is a **paletted container** per 16³ section, with a packed long array only when the palette has more
     than one entry;
  2. a block state can be stored as a bare string, `{"Name": ..., "Properties": ...}`, or (26.x writes this) `{"id": ...,
     "properties": ...}` — a reader that only accepts the first two undercounts every non-default state;
  3. values in a packed array are 1.16-style: `values_per_long = 64 // bits`, entries never cross a long;
  4. `Heightmaps` values are stored relative to the dimension's minimum Y, not absolute.

Usage:
    import region
    for cx, cz, root in region.chunks("world/region"):
        for x, y, z, name, props in region.blocks(root):
            ...
        region.height(root, "MOTION_BLOCKING", x, z)     # absolute Y of the heightmap
        region.biome(root, x, y, z)                      # the section's biome palette entry
"""
from __future__ import annotations

import gzip
import struct
import zlib
from pathlib import Path

# ---- NBT ---------------------------------------------------------------------------------------


class NBT:
    """A minimal big-endian NBT reader: `NBT(blob).root()` gives the chunk as nested dicts/lists."""

    def __init__(self, data: bytes):
        self.d, self.p = data, 0

    def u8(self):
        v = self.d[self.p]
        self.p += 1
        return v

    def i8(self):
        v = struct.unpack_from(">b", self.d, self.p)[0]
        self.p += 1
        return v

    def i16(self):
        v = struct.unpack_from(">h", self.d, self.p)[0]
        self.p += 2
        return v

    def i32(self):
        v = struct.unpack_from(">i", self.d, self.p)[0]
        self.p += 4
        return v

    def i64(self):
        v = struct.unpack_from(">q", self.d, self.p)[0]
        self.p += 8
        return v

    def f32(self):
        v = struct.unpack_from(">f", self.d, self.p)[0]
        self.p += 4
        return v

    def f64(self):
        v = struct.unpack_from(">d", self.d, self.p)[0]
        self.p += 8
        return v

    def string(self):
        n = self.i16()
        s = self.d[self.p:self.p + n].decode("utf-8", "replace")
        self.p += n
        return s

    def payload(self, tag: int):
        if tag == 1:
            return self.i8()
        if tag == 2:
            return self.i16()
        if tag == 3:
            return self.i32()
        if tag == 4:
            return self.i64()
        if tag == 5:
            return self.f32()
        if tag == 6:
            return self.f64()
        if tag == 7:
            n = self.i32()
            v = self.d[self.p:self.p + n]
            self.p += n
            return v
        if tag == 8:
            return self.string()
        if tag == 9:
            sub = self.u8()
            n = self.i32()
            return [self.payload(sub) for _ in range(n)]
        if tag == 10:
            out = {}
            while True:
                t = self.u8()
                if t == 0:
                    return out
                name = self.string()
                out[name] = self.payload(t)
        if tag == 11:
            n = self.i32()
            v = list(struct.unpack_from(f">{n}i", self.d, self.p))
            self.p += 4 * n
            return v
        if tag == 12:
            n = self.i32()
            v = list(struct.unpack_from(f">{n}q", self.d, self.p))
            self.p += 8 * n
            return v
        raise ValueError(f"tag {tag}")

    def root(self):
        t = self.u8()
        self.string()  # the root's empty name
        return self.payload(t)


# ---- region files ------------------------------------------------------------------------------


def read_region_file(path: Path):
    """Yields (chunkX, chunkZ, root) for each chunk present in one .mca file."""
    path = Path(path)
    with open(path, "rb") as f:
        header = f.read(4096)
        for i in range(1024):
            b = i * 4
            off = (header[b] << 16) | (header[b + 1] << 8) | header[b + 2]
            if off == 0:
                continue
            f.seek(off * 4096)
            length = struct.unpack(">I", f.read(4))[0]
            comp = f.read(1)[0]
            blob = f.read(length - 1)
            if comp == 1:
                blob = gzip.decompress(blob)
            elif comp == 2:
                blob = zlib.decompress(blob)
            elif comp != 3:
                raise ValueError(f"compression {comp} in {path.name} chunk {i}")
            root = NBT(blob).root()
            yield root.get("xPos", i & 31), root.get("zPos", i >> 5), root


def chunks(region_dir):
    """Yields every chunk of every .mca in a folder (e.g. `world/dimensions/minecraft/overworld/region`)."""
    for mca in sorted(Path(region_dir).glob("*.mca")):
        yield from read_region_file(mca)


# ---- paletted containers -----------------------------------------------------------------------


def unpack_packed(longs, bits: int, count: int):
    """1.16+ packed values: `64 // bits` a long, each value entirely inside one long."""
    if bits == 0:
        return [0] * count
    per = 64 // bits
    mask = (1 << bits) - 1
    return [(longs[i // per] >> ((i % per) * bits)) & mask for i in range(count)]


def state(entry):
    """A block palette entry as `(name, properties)`, whichever of the three forms it is in."""
    if isinstance(entry, str):
        return entry, {}
    if not isinstance(entry, dict):
        return "?", {}
    # (`{"Name","Properties"}` is older; 26.x writes `{"id","properties"}`; `""` shows up in a few exporters.)
    name = entry.get("Name") or entry.get("id") or entry.get("") or "?"
    return name, entry.get("Properties") or entry.get("properties") or {}


def container(holder: dict, count: int = 4096, min_bits: int = 4):
    """`(palette, unpacked indices or None)` for a `block_states` / `biomes` container (None = one entry everywhere).

    Blocks hold 4,096 entries a section and use at least 4 bits; biomes hold 64 (4 × 4 × 4 cells) and use at least 1.
    """
    if holder is None:
        return [], None
    pal = holder.get("palette") or holder.get("palette") or []
    if isinstance(pal, dict):
        pal = [pal]
    data = holder.get("data")
    if data is None or len(pal) <= 1:
        return pal, None
    bits = max(min_bits, (len(pal) - 1).bit_length())
    return pal, unpack_packed(data, bits, count)


def sections(root):
    return {s["Y"]: s for s in root.get("sections", []) if "Y" in s}


def blocks(root, only_non_air=True):
    """Yields (x, y, z, name, properties) in absolute block coordinates."""
    secs = sections(root)
    for sy, sec in secs.items():
        bs = sec.get("block_states")
        pal, idx = container(bs) if bs else ([], None)
        if not pal:
            continue
        named = [state(e) for e in pal]
        if only_non_air and len(named) == 1 and named[0][0].endswith("air"):
            continue
        for i in range(4096):
            k = idx[i] if idx is not None else 0
            name, props = named[k] if k < len(named) else ("?", {})
            if only_non_air and name.endswith("air"):
                continue
            yield (i & 15), sy * 16 + (i >> 8), (i >> 4) & 15, name, props


def block_at(root, x: int, y: int, z: int):
    """The `(name, properties)` at an absolute position, or None."""
    sec = sections(root).get(y >> 4)
    if not sec or not sec.get("block_states"):
        return None
    pal, idx = container(sec["block_states"])
    if not pal:
        return None
    i = (x & 15) | ((z & 15) << 4) | ((y & 15) << 8)
    k = idx[i] if idx is not None else 0
    return state(pal[k]) if k < len(pal) else None


# ---- heightmaps and biomes ---------------------------------------------------------------------


def height(root, kind: str, x: int, z: int):
    """The absolute Y of the **first air above** the heightmap's block at (x, z) — vanilla's `getFirstAvailable`.

    The stored value is packed 9 bits a column and is relative to the dimension's minimum Y, and it is one past the highest
    block the map counts, so `block_at(root, x, height(...) - 1, z)` is the top block itself. (A 26.x chunk carries
    `MOTION_BLOCKING`; older versions also wrote `WORLD_SURFACE_WG`/`OCEAN_FLOOR_WG`.)
    """
    hm = (root.get("Heightmaps") or {}).get(kind)
    if not hm:
        return None
    min_y = (root.get("yPos") if "yPos" in root else -4) * 16
    return unpack_packed(hm, 9, 256)[(x & 15) + (z & 15) * 16] + min_y


def biome(root, x: int, y: int, z: int):
    """The name of the biome in the 4×4×4 cell that holds (x, y, z)."""
    sec = sections(root).get(y >> 4)
    if not sec or not sec.get("biomes"):
        return None
    pal, idx = container(sec["biomes"], count=64, min_bits=1)
    if not pal:
        return None
    i = ((x & 15) >> 2) | (((z & 15) >> 2) << 2) | (((y & 15) >> 2) << 4)
    k = idx[i] if idx is not None else 0
    return state(pal[k])[0] if k < len(pal) else None


def status(root):
    return root.get("Status") or root.get("status")
