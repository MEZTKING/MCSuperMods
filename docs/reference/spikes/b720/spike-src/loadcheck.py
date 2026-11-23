import re, sys, srv
v = sys.argv[1]
s = srv.Server(v, packs={'b720': f'../../packs/{v}/b720'})
print('start', s.start_seconds)
for l in s.startup:
    if re.search(r'ERROR|Failed|Couldn|Unknown|missed|LOAD|Not a', l):
        print(l[:700])
import time; time.sleep(1)
if s.p.poll() is None:
    print(s.cmd('datapack list enabled'))
    print(s.cmd('function b720:noop'))
    s.stop()
