import sys, json
sys.path.insert(0,'b517tools')
from plants import conv
from plantdiffs import DIFFS
out={}
for name,diffs in DIFFS.items():
    s=conv(name)
    for a,b in diffs:
        assert s.count(a)==1,(name,a[:80],s.count(a))
        s=s.replace(a,b)
    out[name]=s
json.dump(out,open('b517tools/plants.json','w'))
json.dump({k:[list(x) for x in v] for k,v in DIFFS.items()},open('b517tools/plantdiffs.json','w'),indent=1)
for k,v in out.items():
    bad=[l for l in v.split('\n') if ('definition' in l and not l.strip().startswith('*') and not l.strip().startswith('/')) or 'Companions' in l or 'BlockBehaviourDriver' in l or 'driver' in l]
    if bad: print(k,bad)
