# Prints each scenario's console without the per-player echo noise (for reading the results).
import json, sys
r = json.load(open(sys.argv[1]))
keys = sys.argv[2:] or list(r['scenarios'])
for k in keys:
    sc = r['scenarios'].get(k)
    if not sc:
        continue
    print('=====', k)
    for l in sc.get('before', []) + sc.get('console', []):
        if 'sprint' in l.lower() or 'joined the game' in l or 'left the game' in l:
            continue
        if l.startswith('[STDOUT]: B720SEE') and not any(w in l for w in ('Ann ', 'deathscreen', 'merchant', 'dialog')):
            continue
        if l.startswith('[STDOUT]: B720SEE Ann chat') and 'trigger' not in l.lower() and 'cannot' not in l.lower() and 'bed' not in l.lower():
            continue
        print(l[:420].replace('[STDOUT]: ', ''))
