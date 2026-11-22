# B547 spike: decode probes. Starts a fresh world with one pack variant and records errors and whether it started.
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from srv import Server, B

version = sys.argv[1]
results = {}
for variant in sys.argv[2:]:
    s = Server(version, f'probe_{variant}', packs={'b547': f'{B}/packs/{version}/{variant}'})
    started = any('Done (' in l for l in s.startup)
    errs = [l for l in s.lines if ('ERROR' in l or 'WARN' in l and ('b547' in l or 'pack' in l.lower())) or 'Failed' in l]
    out = {}
    if started:
        out['datapack_list'], _ = s.cmd('datapack list enabled')
        if variant.startswith('origin'):
            out['locate'], _ = s.cmd('locate structure minecraft:igloo')
    results[variant] = {'started': started, 'start_seconds': s.start_seconds, 'errors': errs[:20], **out}
    s.stop()
json.dump(results, open(f'{B}/results/probe-{version}.json', 'w'), indent=2)
print(json.dumps(results, indent=2)[:6000])
