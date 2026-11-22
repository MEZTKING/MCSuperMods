# Checks WorldgenParityTest's way of measuring against a world the plain vanilla dedicated server makes (B579).
#
# The GameTest builds a level of its own per fixture dimension and seed; this script makes the same dimensions in an
# ordinary world instead: it starts the vanilla server jar (cached by tools/run-fabric-server in
# ~/.cache/msm-fabric-server) on a new world with the given seed and the fixture's lowered data pack, force-loads the
# GameTest's four column chunks in each named dimension, saves, stops, reads the region files with
# docs/reference/vanilla-worldgen/tools/region.py and compares every column with expectations.json. The world runs
# for a while, so grass under water or lava that turned to dirt by random ticks is listed apart, not counted as a
# miss. Nothing is written to the repository; the world goes into --work and should be deleted afterwards.
#
#   python3 fixtures/worldgen-parity/check_real_world.py --target mc-26.3 --minecraft 26.3 --pack-format 121 \
#       --seed 12345 --dims plain,rules_biome,aquifers --work <scratch folder>
import argparse
import json
import os
import queue
import random
import shutil
import subprocess
import sys
import threading
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(REPO, 'docs', 'reference', 'vanilla-worldgen', 'tools'))
import region  # noqa: E402

COLUMN_CHUNKS = [(0, 0), (-55, 66), (68, 27), (45, -56)]  # WorldgenParityTest.COLUMN_CHUNKS


def make_world(args, run):
    jar = os.path.expanduser(f'~/.cache/msm-fabric-server/minecraft-server-{args.minecraft}.jar')
    shutil.rmtree(os.path.join(run, 'w'), ignore_errors=True)
    pack = os.path.join(run, 'w', 'datapacks', 'worldgen_parity')
    shutil.copytree(os.path.join(HERE, args.target, 'lowered'), pack)
    fmt = args.pack_format
    with open(os.path.join(pack, 'pack.mcmeta'), 'w') as f:
        json.dump({'pack': {'description': 'worldgen parity', 'min_format': [fmt, 0], 'max_format': [fmt, 0],
                            'pack_format': fmt}}, f)
    with open(os.path.join(run, 'eula.txt'), 'w') as f:
        f.write('eula=true\n')
    with open(os.path.join(run, 'server.properties'), 'w') as f:
        f.write(f'level-name=w\nlevel-seed={args.seed}\nonline-mode=false\nserver-port={random.randint(30000, 40000)}\n'
                'max-tick-time=-1\nview-distance=3\nsimulation-distance=3\nsync-chunk-writes=true\n')
    server = subprocess.Popen([args.java, '-Xmx2G', '-jar', jar, 'nogui'], cwd=run, stdin=subprocess.PIPE,
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    lines = queue.Queue()
    log = open(os.path.join(run, 'server.log'), 'w')

    def read():
        for line in server.stdout:
            log.write(line)
            log.flush()
            lines.put(line)

    threading.Thread(target=read, daemon=True).start()

    def wait_for(test, timeout):
        end = time.time() + timeout
        while time.time() < end:
            try:
                line = lines.get(timeout=1)
            except queue.Empty:
                continue
            if test(line):
                return line
        server.kill()
        raise SystemExit(f'timed out; see {run}/server.log')

    def send(command):
        server.stdin.write(command + '\n')
        server.stdin.flush()

    wait_for(lambda line: 'Done (' in line, 600)
    pending = []
    for dim in args.dims:
        for cx, cz in COLUMN_CHUNKS:
            send(f'execute in worldgen_parity:{dim} run forceload add {cx * 16} {cz * 16}')
            pending.append((dim, cx * 16, cz * 16))
    while pending:
        dim, x, z = pending[0]
        send(f'execute in worldgen_parity:{dim} if loaded {x} 64 {z}')
        if 'Test passed' in wait_for(lambda line: 'Test passed' in line or 'Test failed' in line, 600):
            pending.pop(0)
        else:
            time.sleep(1)
    time.sleep(3)
    send('save-all flush')
    wait_for(lambda line: 'Saved the game' in line, 300)
    send('stop')
    server.wait(timeout=300)


def state(name, props):
    return name + ('[' + ','.join(f'{k}={v}' for k, v in sorted(props.items())) + ']' if props else '')


def compare(args, run):
    with open(os.path.join(HERE, 'expectations.json')) as f:
        dims = json.load(f)['targets'][args.target]['dimensions']
    misses = 0
    for dim in args.dims:
        expected = dims[f'worldgen_parity:{dim}']
        seed = expected['seeds'][str(args.seed)]
        chunks = {(cx, cz): c for cx, cz, c in
                  region.chunks(os.path.join(run, 'w', 'dimensions', 'worldgen_parity', dim, 'region'))}
        same = ticked = 0
        for i, (x, z) in enumerate(expected['columns']):
            sections = region.sections(chunks[(x >> 4, z >> 4)])
            got = []
            for y in range(expected['minY'], expected['minY'] + expected['height']):
                section = sections.get(y >> 4)
                if not section or not section.get('block_states'):
                    got.append('minecraft:air')
                    continue
                palette, indexes = region.container(section['block_states'])
                k = indexes[(x & 15) | ((z & 15) << 4) | ((y & 15) << 8)] if indexes is not None else 0
                got.append(state(*region.state(palette[k])))
            want = []
            runs = seed['columns'][i]
            for j in range(0, len(runs), 2):
                want += [expected['blocks'][runs[j]]] * runs[j + 1]
            # Region files leave out properties at their defaults.
            want = [w if g == w or '[' in g else w.split('[')[0] for g, w in zip(got, want)]
            if got == want:
                same += 1
                continue
            diffs = [k for k in range(len(got)) if got[k] != want[k]]
            if all(got[k] == 'minecraft:dirt' and want[k].startswith('minecraft:grass_block')
                   and got[k + 1].split('[')[0] in ('minecraft:water', 'minecraft:lava') for k in diffs):
                ticked += 1
                continue
            misses += 1
            k = diffs[0]
            print(f'  {dim} column {x} {z}: y {expected["minY"] + k} is {got[k]}, expected {want[k]}')
        print(f'{dim}: {same} of {len(expected["columns"])} columns the same, {ticked} only by random ticks')
    return misses


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--target', required=True)
    parser.add_argument('--minecraft', required=True)
    parser.add_argument('--pack-format', type=int, required=True)
    parser.add_argument('--seed', type=int, required=True)
    parser.add_argument('--dims', required=True)
    parser.add_argument('--work', required=True)
    parser.add_argument('--java', default=os.path.join(os.environ.get('JAVA_HOME', ''), 'bin', 'java'))
    args = parser.parse_args()
    args.dims = args.dims.split(',')
    os.makedirs(args.work, exist_ok=True)
    make_world(args, args.work)
    sys.exit(1 if compare(args, args.work) else 0)


if __name__ == '__main__':
    main()
