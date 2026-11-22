# B547 spike: a minimal NBT writer for structure templates (gzip, big-endian). Values are tagged tuples:
# ('byte', v), ('int', v), ('string', v), ('list', tag, [values]), ('compound', {k: value}), ('int_array', [..]).
import gzip, struct

TAG = {'end': 0, 'byte': 1, 'short': 2, 'int': 3, 'long': 4, 'float': 5, 'double': 6, 'string': 8, 'list': 9,
       'compound': 10, 'int_array': 11}


def _str(s):
    b = s.encode('utf-8')
    return struct.pack('>H', len(b)) + b


def _payload(v):
    t = v[0]
    if t == 'byte': return struct.pack('>b', v[1])
    if t == 'short': return struct.pack('>h', v[1])
    if t == 'int': return struct.pack('>i', v[1])
    if t == 'long': return struct.pack('>q', v[1])
    if t == 'float': return struct.pack('>f', v[1])
    if t == 'double': return struct.pack('>d', v[1])
    if t == 'string': return _str(v[1])
    if t == 'int_array': return struct.pack('>i', len(v[1])) + b''.join(struct.pack('>i', x) for x in v[1])
    if t == 'list':
        tag, items = v[1], v[2]
        if not items: tag = 'end'
        return struct.pack('>bi', TAG[tag], len(items)) + b''.join(_payload(i) for i in items)
    if t == 'compound':
        out = b''
        for k, val in v[1].items():
            out += struct.pack('>b', TAG[val[0]]) + _str(k) + _payload(val)
        return out + b'\x00'
    raise ValueError(t)


def write(path, root):
    data = struct.pack('>b', 10) + _str('') + _payload(root)[:-1] + b'\x00'
    with gzip.open(path, 'wb') as f:
        f.write(data)


def C(**kw):
    return ('compound', kw)


def ints(*xs):
    return ('list', 'int', [('int', x) for x in xs])


def template(data_version, size, blocks, block_nbt=None, form='id'):
    """blocks: {(x, y, z): (name, {props})}; every other position in the box is air (written, so placing clears)."""
    block_nbt = block_nbt or {}
    palette, index = [], {}
    def state(name, props):
        key = (name, tuple(sorted(props.items())))
        if key not in index:
            index[key] = len(palette)
            n, pk = ('id', 'properties') if form == 'id' else ('Name', 'Properties')
            entry = {n: ('string', name)}
            if props:
                entry[pk] = ('compound', {k: ('string', v) for k, v in props.items()})
            palette.append(('compound', entry))
        return index[key]
    out = []
    sx, sy, sz = size
    for x in range(sx):
        for y in range(sy):
            for z in range(sz):
                name, props = blocks.get((x, y, z), ('minecraft:air', {}))
                b = {'pos': ints(x, y, z), 'state': ('int', state(name, props))}
                if (x, y, z) in block_nbt:
                    b['nbt'] = block_nbt[(x, y, z)]
                out.append(('compound', b))
    return ('compound', {
        'DataVersion': ('int', data_version),
        'size': ints(*size),
        'palette': ('list', 'compound', palette),
        'blocks': ('list', 'compound', out),
        'entities': ('list', 'compound', []),
    })
