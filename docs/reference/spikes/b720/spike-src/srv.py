# B720 spike: a Fabric dedicated server (cached jars of tools/run-fabric-server) with Fabric API and the throwaway
# spike mod (stand-in players driven from the console), driven over stdin; console lines read back.
import os, queue, random, re, shutil, subprocess, threading, time

S = '<scratchpad>/b720'
JAVA = '/root/jdk25/jdk-25.0.5.1+2/bin/java'
CACHE = os.path.expanduser('~/.cache/msm-fabric-server')
FULL = {'26.3': '26.3', '26.4': '26.4-snapshot-7'}
FAPI = {'26.3': 'fabric-api-0.165.2+26.3.jar', '26.4': 'fabric-api-0.165.4+26.4.jar'}


class Server:
    def __init__(self, version, world='world', props=None, packs=None, fresh=True, mods=True):
        self.version = version
        full = FULL[version]
        self.run = f'{S}/srv/{version}'
        os.makedirs(self.run, exist_ok=True)
        wdir = f'{self.run}/{world}'
        if fresh:
            shutil.rmtree(wdir, ignore_errors=True)
            for f in ('ops.json', 'usercache.json'):
                if os.path.exists(f'{self.run}/{f}'):
                    os.remove(f'{self.run}/{f}')
        for name, src in (packs or {}).items():
            dst = f'{wdir}/datapacks/{name}'
            shutil.rmtree(dst, ignore_errors=True)
            shutil.copytree(src, dst)
        open(f'{self.run}/eula.txt', 'w').write('eula=true\n')
        p = {'level-name': world, 'online-mode': 'false', 'server-port': str(random.randint(30000, 40000)),
             'max-tick-time': '-1', 'spawn-protection': '0', 'view-distance': '3', 'simulation-distance': '3',
             'sync-chunk-writes': 'true', 'level-seed': '720', 'level-type': 'minecraft:flat', 'generator-settings': '{"layers":[{"block":"minecraft:bedrock","height":1},{"block":"minecraft:dirt","height":2},{"block":"minecraft:grass_block","height":1}],"biome":"minecraft:plains"}', 'pvp': 'true', 'allow-flight': 'true',
             'spawn-monsters': 'false', 'spawn-animals': 'false', 'generate-structures': 'false', 'difficulty': 'normal'}
        p.update(props or {})
        open(f'{self.run}/server.properties', 'w').write(''.join(f'{k}={v}\n' for k, v in p.items()))
        shutil.rmtree(f'{self.run}/mods', ignore_errors=True)
        os.makedirs(f'{self.run}/mods')
        if mods:
            shutil.copy(f'{CACHE}/{FAPI[version]}', f'{self.run}/mods/')
            shutil.copy(f'{S}/build/{full}/b720spike.jar', f'{self.run}/mods/')
        if not os.path.exists(f'{self.run}/server.jar'):
            shutil.copy(f'{CACHE}/minecraft-server-{full}.jar', f'{self.run}/server.jar')
        launcher = f'{CACHE}/fabric-server-mc.{full}-loader.0.20.1-launcher.1.1.2.jar'
        self.p = subprocess.Popen([JAVA, '-Xmx2G', '-jar', launcher, 'nogui'], cwd=self.run, stdin=subprocess.PIPE,
                                  stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        self.q = queue.Queue()
        self.lines = []
        self.log = open(f'{self.run}/{world}.log', 'w' if fresh else 'a')
        threading.Thread(target=self._reader, daemon=True).start()
        self.n = 0
        t0 = time.time()
        self.startup = self.wait_for(lambda l: 'Done (' in l or 'Failed to start' in l, 900)
        self.start_seconds = round(time.time() - t0, 1)
        self.errors = [strip(l) for l in self.startup if re.search(r'ERROR|Failed to load|Couldn\'t parse|Couldn\'t load', l)]

    def _reader(self):
        for line in self.p.stdout:
            self.log.write(line)
            self.log.flush()
            self.lines.append(line.rstrip('\n'))
            self.q.put(line.rstrip('\n'))
        self.q.put(None)

    def wait_for(self, pred, timeout=300):
        end = time.time() + timeout
        seen = []
        while time.time() < end:
            try:
                line = self.q.get(timeout=1)
            except queue.Empty:
                continue
            if line is None:
                return seen
            seen.append(line)
            if pred(line):
                return seen
        raise TimeoutError('timeout; see ' + self.log.name)

    def send(self, cmd):
        self.p.stdin.write(cmd + '\n')
        self.p.stdin.flush()

    def cmd(self, cmd, timeout=300):
        """Sends a command; returns the console lines up to a marker said after it."""
        self.n += 1
        mark = f'MARK{self.n}X'
        self.send(cmd)
        self.send(f'say {mark}')
        seen = self.wait_for(lambda l: mark in l, timeout)
        return [strip(l) for l in seen if mark not in l]

    def many(self, cmds):
        out = []
        for c in cmds:
            out.append({'cmd': c, 'out': self.cmd(c)})
        return out

    def ticks(self, n):
        """Runs n ticks at once (tick sprint) and waits for its end."""
        self.send(f'tick sprint {n}')
        return [strip(l) for l in self.wait_for(lambda l: 'Sprint completed' in l or 'sprint' in l.lower() and 'complet' in l.lower(), 600)]

    def stop(self):
        try:
            self.send('stop')
            self.p.wait(timeout=300)
        except Exception:
            self.p.kill()
        return self.p.returncode


def strip(line):
    i = line.find(']: ')
    return line[i + 3:] if i >= 0 else line
