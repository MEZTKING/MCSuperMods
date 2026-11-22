# Generate a real world on the vanilla dedicated server: forceload spots, wait until loaded, save, stop.
import json, os, queue, random, shutil, subprocess, sys, threading, time
version, seedname, seed = sys.argv[1], sys.argv[2], sys.argv[3]
B = '/tmp/claude-0/-home-user/4a56a205-8696-50bd-85e1-c9cc01051fe4/scratchpad/b574'
run = f'{B}/srv/{version}'
os.makedirs(run, exist_ok=True)
jar = os.path.expanduser(f'~/.cache/msm-fabric-server/minecraft-server-{version}.jar')
level = f'w_{seedname}'
shutil.rmtree(f'{run}/{level}', ignore_errors=True)
os.makedirs(f'{run}/{level}/datapacks', exist_ok=True)
shutil.copytree(os.environ.get('SPIKE_PACK') or f'{B}/pack/{version}', f'{run}/{level}/datapacks/b574')
open(f'{run}/eula.txt', 'w').write('eula=true\n')
port = random.randint(30000, 40000)
open(f'{run}/server.properties', 'w').write(f'''level-name={level}
level-seed={seed}
online-mode=false
server-port={port}
max-tick-time=-1
spawn-protection=0
view-distance=3
simulation-distance=3
sync-chunk-writes=true
''')
SPOTS = {
  'minecraft:overworld': [(0, 0), (1600, -800), (-2400, 1200), (3200, 3200), (-800, -3008), (5008, -1504)],
  'minecraft:the_nether': [(0, 0), (400, -304)],
  'minecraft:the_end': [(0, 0), (1200, 0)],
}
for d in ['clim_temperature', 'clim_humidity', 'clim_continentalness', 'clim_erosion', 'clim_depth', 'clim_weirdness', 'clim_mix', 'checker']:
  SPOTS['b574:' + d] = [(0, 0), (2000, -1600)] if d != 'checker' else [(0, 0)]
if os.environ.get('SPIKE_PACK'):
  SPOTS = json.load(open(os.environ['SPIKE_PACK'] + '/spots.json'))
json.dump(SPOTS, open(f'{run}/{level}.spots.json', 'w'))
java = '/root/jdk/jdk-25.0.5+8/bin/java'
p = subprocess.Popen([java, '-Xmx2G', '-jar', jar, 'nogui'], cwd=run, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
q = queue.Queue()
log = open(f'{run}/{level}.log', 'w')
def reader():
  for line in p.stdout:
    log.write(line); log.flush(); q.put(line)
threading.Thread(target=reader, daemon=True).start()
def wait_for(pred, timeout):
  end = time.time() + timeout
  while time.time() < end:
    try: line = q.get(timeout=1)
    except queue.Empty: continue
    if pred(line): return line
  p.kill()
  raise SystemExit(f'timeout waiting; see {run}/{level}.log')
def send(cmd):
  p.stdin.write(cmd + '\n'); p.stdin.flush()
t0 = time.time()
wait_for(lambda l: 'Done (' in l, 600)
print('started', round(time.time() - t0, 1), flush=True)
for dim, spots in SPOTS.items():
  for x, z in spots:
    send(f'execute in {dim} run forceload add {x} {z} {x+16} {z+16}')
t1 = time.time()
pending = [(dim, x + dx, z + dz) for dim, spots in SPOTS.items() for x, z in spots for dx in (0, 16) for dz in (0, 16)]
while pending:
  dim, x, z = pending[0]
  send(f'execute in {dim} if loaded {x} 64 {z}')
  line = wait_for(lambda l: 'Test passed' in l or 'Test failed' in l, 600)
  if 'Test passed' in line: pending.pop(0)
  else: time.sleep(1)
print('loaded', round(time.time() - t1, 1), flush=True)
time.sleep(5)
send('save-all flush')
wait_for(lambda l: 'Saved the game' in l, 300)
send('stop')
p.wait(timeout=300)
print('exit', p.returncode, 'total', round(time.time() - t0, 1), flush=True)
