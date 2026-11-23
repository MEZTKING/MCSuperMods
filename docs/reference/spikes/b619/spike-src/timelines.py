"""B619 spike (throwaway), 3S10: the shape of the jar's timelines and world clocks (ids, field names, counts only)."""
import json, sys, zipfile, collections
out = {}
env = {}
for t in ('mc-26.3', 'mc-26.4'):
    pass
for v in ['26.3', '26.4-snapshot-7']:
    z = zipfile.ZipFile(f'/root/.gradle/caches/fabric-loom/{v}/minecraft-client.jar')
    r = {'timelines': {}, 'world_clocks': {}}
    for n in z.namelist():
        if n.startswith('data/minecraft/timeline/') and n.endswith('.json'):
            d = json.loads(z.read(n))
            tracks = {}
            for k, tr in (d.get('tracks') or {}).items():
                kf = tr.get('keyframes', [])
                tracks[k] = {'keyframes': len(kf), 'fields': sorted(tr), 'ease': tr.get('ease', 'linear') if isinstance(tr.get('ease', 'linear'), str) else 'cubic_bezier',
                             'valueKind': type(kf[0]['value']).__name__ if kf else None}
            r['timelines'][n.split('/')[-1][:-5]] = {'fields': sorted(d), 'period_ticks': d.get('period_ticks'), 'clock': d.get('clock'),
                                                    'time_markers': len(d.get('time_markers') or {}), 'tracks': tracks}
        if n.startswith('data/minecraft/world_clock/') and n.endswith('.json'):
            r['world_clocks'][n.split('/')[-1][:-5]] = sorted(json.loads(z.read(n)))
    out[v] = r
json.dump(out, open(sys.argv[1], 'w'), indent=1, sort_keys=True)
for v, r in out.items():
    print(v, 'clocks', r['world_clocks'])
    for n, t in r['timelines'].items():
        print(' ', n, t['period_ticks'], t['clock'], t['time_markers'], len(t['tracks']), sorted(set(x['valueKind'] for x in t['tracks'].values())), sorted(set(x['ease'] for x in t['tracks'].values())))
