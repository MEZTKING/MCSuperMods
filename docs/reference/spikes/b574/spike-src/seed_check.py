# WS17: start a world with a typed seed, stop, and find the stored seed in its files.
import gzip, os, queue, random, shutil, subprocess, sys, threading, time, json
sys.path.insert(0, '/home/user/MCSuperMods/docs/reference/vanilla-worldgen/tools')
import region
version, text = sys.argv[1], sys.argv[2]
B = '/tmp/claude-0/-home-user/4a56a205-8696-50bd-85e1-c9cc01051fe4/scratchpad/b574'
run = f'{B}/srv/{version}'; level = 'w_seed'
shutil.rmtree(f'{run}/{level}', ignore_errors=True)
port = random.randint(30000, 40000)
open(f'{run}/server.properties', 'w').write(f'level-name={level}\nlevel-seed={text}\nonline-mode=false\nserver-port={port}\nview-distance=2\n')
p = subprocess.Popen(['/root/jdk/jdk-25.0.5+8/bin/java', '-Xmx1G', '-jar', os.path.expanduser(f'~/.cache/msm-fabric-server/minecraft-server-{version}.jar'), 'nogui'], cwd=run, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
for line in p.stdout:
  if 'Done (' in line: break
p.stdin.write('seed\n'); p.stdin.flush()
seedline = None
for line in p.stdout:
  if 'Seed:' in line: seedline = line.strip(); break
p.stdin.write('stop\n'); p.stdin.flush()
for line in p.stdout: pass
p.wait()
def jhash(s):
  h = 0
  for ch in s.encode('utf-16-be').decode('utf-16-be'):
    h = (31 * h + ord(ch)) & 0xffffffff
  return h - (1 << 32) if h >= 1 << 31 else h
found = []
def walk(o, path):
  if isinstance(o, dict):
    for k, v in o.items(): walk(v, path + '/' + k)
  elif isinstance(o, list):
    pass
  elif isinstance(o, int) and 'seed' in path.lower():
    found.append((path, o))
for root, dirs, files in os.walk(f'{run}/{level}'):
  for f in files:
    if f.endswith('.dat'):
      raw = open(os.path.join(root, f), 'rb').read()
      try: data = gzip.decompress(raw)
      except Exception: data = raw
      try: walk(region.NBT(data).root(), os.path.relpath(os.path.join(root, f), f'{run}/{level}'))
      except Exception as e: found.append((f, 'unreadable ' + str(e)))
print(json.dumps({'text': text, 'console': seedline, 'javaStringHash': jhash(text), 'stored': found}))
shutil.rmtree(f'{run}/{level}', ignore_errors=True)
