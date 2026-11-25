// B840 S3: runs inside a sandboxed srcdoc iframe (opaque origin). Reports what it can reach and
// draws on its canvas at 30 frames a second for the UI-thread cost.
(async () => {
  const r = {};
  const t = async (name, fn) => { try { r[name] = 'OPEN: ' + String(await fn()).slice(0, 120); } catch (e) { r[name] = 'refused: ' + String(e && e.name) + ' ' + String(e && e.message).slice(0, 120); } };
  r.origin = String(self.origin);
  await t('fetch https', () => fetch('https://example.com/').then((x) => x.status));
  await t('fetch msm-app', () => fetch('msm-app://app/index.html').then((x) => x.status));
  await t('localStorage', () => { localStorage.setItem('a', '1'); return 'stored'; });
  await t('indexedDB.open', () => new Promise((res, rej) => { const q = indexedDB.open('x'); q.onsuccess = () => res('opened'); q.onerror = () => rej(q.error); }));
  await t('caches.open', () => caches.open('x').then(() => 'opened'));
  await t('document.cookie', () => { document.cookie = 'a=1'; return document.cookie || '(empty)'; });
  await t('top navigation', () => { top.location.href = 'msm-app://app/elsewhere.html'; return 'no exception'; });
  await t('window.open', () => { const w = window.open('https://example.com'); return w === null ? 'returned null (blocked)' : 'opened'; });
  await t('pointer lock', () => new Promise((res, rej) => { document.addEventListener('pointerlockerror', () => rej(new Error('pointerlockerror'))); document.addEventListener('pointerlockchange', () => res('locked')); const p = document.body.requestPointerLock(); if (p && p.catch) p.catch(rej); setTimeout(() => rej(new Error('no event')), 1000); }));
  await t('blob worker', () => new Promise((res, rej) => { try { const w = new Worker(URL.createObjectURL(new Blob(['postMessage(1)'], { type: 'text/javascript' }))); w.onmessage = () => res('worker ran'); w.onerror = (e) => rej(new Error('worker error ' + e.message)); setTimeout(() => rej(new Error('no message')), 1500); } catch (e) { rej(e); } }));
  await t('inline script ran', () => (window.__inline === true ? 'yes' : Promise.reject(new Error('inline script did not run'))));
  await t('parent DOM', () => parent.document.title);
  r['navigate self to https'] = 'see the harness log: ERR_BLOCKED_BY_CSP (the parent page has no frame-src for https)';
  parent.postMessage({ type: 'frame-probe', r }, '*');
  // Drawing for the UI-thread cost: the frame shares the page's thread when not isolated.
  window.addEventListener('message', async (e) => {
    if (!e.data || e.data.type !== 'draw') return;
    const c = document.getElementById('c').getContext('2d');
    const busy = e.data.busyMs;
    const drawMs = [];
    for (let f = 0; f < e.data.frames; f++) {
      const s = performance.now();
      c.fillStyle = `hsl(${f * 5 % 360} 50% 50%)`; c.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 300; i++) { c.fillStyle = `hsl(${(i * 7 + f) % 360} 70% 60%)`; c.fillRect((i * 37 + f) % 512, (i * 53) % 512, 12, 12); }
      while (performance.now() - s < busy) { /* stands in for plugin work */ }
      drawMs.push(performance.now() - s);
      await new Promise((res) => setTimeout(res, Math.max(0, 33.3 - (performance.now() - s))));
    }
    parent.postMessage({ type: 'frame-drawn', drawMs }, '*');
  });
})();
