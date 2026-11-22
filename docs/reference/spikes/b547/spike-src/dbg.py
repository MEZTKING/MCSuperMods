import sys, os, time, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from srv import Server, B
v = sys.argv[1]
props = json.loads(sys.argv[2])
s = Server(v, 'w_dbg', props=props, packs={'b547': f'{B}/packs/{v}/main'})
for cmd in sys.argv[3:]:
    if cmd.startswith('sleep '):
        time.sleep(float(cmd[6:])); continue
    out, secs = s.cmd(cmd)
    print('>', cmd, secs); [print('   ', l) for l in out if 'Saving' not in l and 'Saved' not in l]
s.stop()
