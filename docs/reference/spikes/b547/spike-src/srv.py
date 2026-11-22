# B547 spike: drive the vanilla dedicated server (cached by tools/run-fabric-server) over stdin and read its console.
import os, queue, random, shutil, subprocess, threading, time

B = '<scratchpad>/b547'
JAVA = '/root/jdk/jdk-25.0.5+8/bin/java'
JARS = {'26.3': '26.3', '26.4': '26.4-snapshot-7'}


class Server:
    def __init__(self, version, world, props=None, packs=None, fresh=True, run_dir=None):
        self.version = version
        self.run = run_dir or f'{B}/srv/{version}'
        os.makedirs(self.run, exist_ok=True)
        self.world = world
        wdir = f'{self.run}/{world}'
        if fresh:
            shutil.rmtree(wdir, ignore_errors=True)
        for name, src in (packs or {}).items():
            dst = f'{wdir}/datapacks/{name}'
            shutil.rmtree(dst, ignore_errors=True)
            shutil.copytree(src, dst)
        open(f'{self.run}/eula.txt', 'w').write('eula=true\n')
        p = {'level-name': world, 'online-mode': 'false', 'server-port': str(random.randint(30000, 40000)),
             'max-tick-time': '-1', 'spawn-protection': '0', 'view-distance': '4', 'simulation-distance': '4',
             'sync-chunk-writes': 'true', 'level-seed': '547'}
        p.update(props or {})
        open(f'{self.run}/server.properties', 'w').write(''.join(f'{k}={v}\n' for k, v in p.items()))
        jar = os.path.expanduser(f'~/.cache/msm-fabric-server/minecraft-server-{JARS[version]}.jar')
        self.p = subprocess.Popen([JAVA, '-Xmx2G', '-jar', jar, 'nogui'], cwd=self.run, stdin=subprocess.PIPE,
                                  stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        self.q = queue.Queue()
        self.lines = []
        self.log = open(f'{self.run}/{world}.log', 'w' if fresh else 'a')
        threading.Thread(target=self._reader, daemon=True).start()
        self.n = 0
        t0 = time.time()
        self.startup = self.wait_for(lambda l: 'Done (' in l or 'Failed to start' in l or 'Exception' in l and 'Done' in l, 600)
        self.start_seconds = round(time.time() - t0, 1)

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
        """Sends a command and returns the console lines up to a marker said after it (same tick or later)."""
        self.n += 1
        mark = f'MARK{self.n}X'
        t0 = time.time()
        self.send(cmd)
        self.send(f'say {mark}')
        seen = self.wait_for(lambda l: mark in l, timeout)
        out = [strip(l) for l in seen if mark not in l]
        return out, round(time.time() - t0, 3)

    def stop(self):
        try:
            self.send('stop')
            self.p.wait(timeout=300)
        except Exception:
            self.p.kill()
        return self.p.returncode


def strip(line):
    # "[12:00:00] [Server thread/INFO]: text" -> "text"
    i = line.find(']: ')
    return line[i + 3:] if i >= 0 else line
