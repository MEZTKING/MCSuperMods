// B619 spike (throwaway): renderer tasks. Sounds (3S2), shader compiles (3S8), post chains (3S9).
// Vanilla files are read at run time from the Loom cache or a scratch extraction; only numbers leave this page.
const fs = require('node:fs');
const path = require('node:path');

function oggInfo(buf) {
  // First Ogg page: 27-byte header, segment table, then the Vorbis identification packet.
  const segs = buf[26];
  const p = 27 + segs;
  if (buf.toString('latin1', p + 1, p + 7) !== 'vorbis') return { channels: 0, rate: 0 };
  return { channels: buf[p + 11], rate: buf.readUInt32LE(p + 12) };
}

async function sounds([indexFile, objects, limitArg]) {
  const idx = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  let keys = Object.keys(idx.objects).filter((k) => k.startsWith('minecraft/sounds/') && k.endsWith('.ogg')).sort();
  if (limitArg) keys = keys.slice(0, Number(limitArg));
  const ctx = new OfflineAudioContext(2, 1, 48000);
  const out = { files: keys.length, ok: 0, failed: [], byFolder: {}, channels: {}, rates: {}, readMs: 0, decodeMs: 0,
    totalBytes: 0, totalSeconds: 0, decodedBytesAt48k: 0, longest: [], slowest: [] };
  const rows = [];
  for (const k of keys) {
    const h = idx.objects[k].hash;
    const file = path.join(objects, h.slice(0, 2), h);
    const t0 = performance.now();
    const buf = fs.readFileSync(file);
    const t1 = performance.now();
    const info = oggInfo(buf);
    let audio = null;
    try {
      audio = await ctx.decodeAudioData(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    } catch (e) {
      out.failed.push({ key: k, error: String(e).slice(0, 120) });
    }
    const t2 = performance.now();
    out.readMs += t1 - t0;
    out.decodeMs += t2 - t1;
    out.totalBytes += buf.length;
    const folder = k.split('/')[2];
    const f = (out.byFolder[folder] ??= { files: 0, bytes: 0, seconds: 0, failed: 0 });
    f.files++;
    f.bytes += buf.length;
    out.channels[info.channels] = (out.channels[info.channels] ?? 0) + 1;
    out.rates[info.rate] = (out.rates[info.rate] ?? 0) + 1;
    if (audio) {
      out.ok++;
      f.seconds += audio.duration;
      out.totalSeconds += audio.duration;
      out.decodedBytesAt48k += audio.length * audio.numberOfChannels * 4;
      rows.push({ key: k, seconds: audio.duration, bytes: buf.length, decodeMs: t2 - t1, channels: info.channels });
    } else f.failed++;
  }
  rows.sort((a, b) => b.seconds - a.seconds);
  out.longest = rows.slice(0, 8).map((r) => ({ folder: r.key.split('/').slice(2, 4).join('/'), seconds: +r.seconds.toFixed(1),
    bytes: r.bytes, decodeMs: +r.decodeMs.toFixed(0), channels: r.channels, decodedMB: +((r.seconds * 48000 * r.channels * 4) / 1e6).toFixed(1) }));
  const shortRows = rows.filter((r) => r.seconds < 10);
  shortRows.sort((a, b) => a.decodeMs - b.decodeMs);
  const pct = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(arr.length * q))];
  out.shortUnder10s = { count: shortRows.length, decodeMsMedian: +pct(shortRows, 0.5).decodeMs.toFixed(2),
    decodeMsP95: +pct(shortRows, 0.95).decodeMs.toFixed(2), decodeMsMax: +shortRows[shortRows.length - 1].decodeMs.toFixed(1) };
  out.readMs = +out.readMs.toFixed(0);
  out.decodeMs = +out.decodeMs.toFixed(0);
  out.totalSeconds = +out.totalSeconds.toFixed(0);
  return out;
}

async function stream([indexFile, objects, key]) {
  const idx = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  const h = idx.objects[key].hash;
  const buf = fs.readFileSync(path.join(objects, h.slice(0, 2), h));
  const mem0 = await process.getProcessMemoryInfo();
  const out = { bytes: buf.length };
  // Whole-file decode through Web Audio.
  const ac = new AudioContext();
  let t = performance.now();
  const audio = await ac.decodeAudioData(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  out.decodeMs = +(performance.now() - t).toFixed(0);
  out.seconds = +audio.duration.toFixed(1);
  out.contextRate = ac.sampleRate;
  out.decodedMB = +((audio.length * audio.numberOfChannels * 4) / 1e6).toFixed(1);
  const mem1 = await process.getProcessMemoryInfo();
  out.privateKBGrowthAfterDecode = mem1.private - mem0.private;
  // A media element on a blob URL (needs media-src blob: in the app's CSP).
  const url = URL.createObjectURL(new Blob([buf], { type: 'audio/ogg' }));
  const el = new Audio();
  el.preload = 'auto';
  t = performance.now();
  const meta = new Promise((r) => el.addEventListener('loadedmetadata', () => r(performance.now() - t), { once: true }));
  const through = new Promise((r) => el.addEventListener('canplaythrough', () => r(performance.now() - t), { once: true }));
  const err = new Promise((r) => el.addEventListener('error', () => r(-1), { once: true }));
  el.src = url;
  out.elementMetadataMs = +(await Promise.race([meta, err])).toFixed(0);
  out.elementCanPlayThroughMs = +(await Promise.race([through, err])).toFixed(0);
  out.elementDuration = +el.duration.toFixed(1);
  out.elementCanPlayOgg = el.canPlayType('audio/ogg; codecs=vorbis');
  const mem2 = await process.getProcessMemoryInfo();
  out.privateKBAfterElement = mem2.private - mem0.private;
  return out;
}

// ---- shaders ----

const PRECISION = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n' +
  'precision highp sampler3D;\nprecision highp samplerCube;\nprecision highp sampler2DArray;\nprecision highp isampler2D;\n' +
  'precision highp usampler2D;\n';

function makeTranslator(includeRoots) {
  // The mechanical translation of ADR 0121 D8: the version line, the separate-shader-objects extension line,
  // precision, includes (#include <ns:path> since 26.x, #moj_import before), binding qualifiers, and location
  // qualifiers on the varyings between stages (ES 3.00 allows them only on vertex inputs and fragment outputs).
  return function translate(src, stage = 'fragment', seen = new Set()) {
    const notes = new Set();
    const body = src.split('\n').map((line) => {
      if (/^\s*#version\b/.test(line)) { notes.add('version'); return '// version line replaced'; }
      if (/^\s*#extension\s+GL_ARB_separate_shader_objects/.test(line)) { notes.add('extension'); return '// extension line removed'; }
      const m = /^\s*#(?:moj_import|include)\s*[<"]([^>"]+)[>"]/.exec(line);
      if (m) {
        notes.add('include');
        const id = m[1].includes(':') ? m[1] : 'minecraft:' + m[1];
        const [ns, p] = id.split(':');
        if (seen.has(id)) return '// already included';
        seen.add(id);
        for (const root of includeRoots) {
          const f = path.join(root, ns, 'shaders/include', p);
          if (fs.existsSync(f)) {
            const inner = translate(fs.readFileSync(f, 'utf8'), stage, seen);
            for (const n of inner.notes) notes.add(n);
            return inner.body;
          }
        }
        notes.add('missing-include');
        return '// missing include';
      }
      let l = line;
      if (/layout\s*\([^)]*binding\s*=/.test(l)) {
        notes.add('binding');
        l = l.replace(/,?\s*binding\s*=\s*\d+\s*,?/, (s) => (s.startsWith(',') && s.endsWith(',') ? ',' : '')).replace(/layout\s*\(\s*\)/, '');
      }
      const varying = stage === 'vertex' ? /layout\s*\(\s*location\s*=\s*\d+\s*\)\s*((?:flat\s+|smooth\s+|noperspective\s+)?out\b)/
        : /layout\s*\(\s*location\s*=\s*\d+\s*\)\s*((?:flat\s+|smooth\s+|noperspective\s+)?in\b)/;
      if (varying.test(l)) { notes.add('varying-location'); l = l.replace(varying, '$1'); }
      if (/\bgl_(VertexIndex|InstanceIndex)\b/.test(l)) {
        notes.add('vulkan-builtins');
        l = l.replace(/\bgl_VertexIndex\b/g, 'gl_VertexID').replace(/\bgl_InstanceIndex\b/g, 'gl_InstanceID');
      }
      return l;
    }).join('\n');
    return { body, notes: [...notes] };
  };
}

function compile(gl, type, text) {
  const s = gl.createShader(type);
  gl.shaderSource(s, text);
  gl.compileShader(s);
  const ok = gl.getShaderParameter(s, gl.COMPILE_STATUS);
  const log = ok ? '' : gl.getShaderInfoLog(s);
  return { shader: s, ok, log };
}

function category(log) {
  // Generic categories only: identifiers and numbers are stripped, so no game code is kept.
  return [...new Set(log.split('\n').filter((l) => l.includes('ERROR')).map((l) => l.replace(/^ERROR:\s*\d+:\d+:\s*/, '')
    .replace(/'[^']*'/g, "'_'").replace(/\d+/g, 'N').trim()))].slice(0, 4);
}

function walk(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((n) => {
    const f = path.join(dir, n);
    return fs.statSync(f).isDirectory() ? walk(f, ext) : ext.some((e) => n.endsWith(e)) ? [f] : [];
  });
}

async function shaders([jarAssets, selfAssets]) {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  const out = { renderer: gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION), sets: {} };
  const translate = makeTranslator([selfAssets, jarAssets].filter(Boolean));
  const sets = { core: path.join(jarAssets, 'minecraft/shaders/core'), post: path.join(jarAssets, 'minecraft/shaders/post'),
    include: path.join(jarAssets, 'minecraft/shaders/include') };
  if (selfAssets) sets.self = path.join(selfAssets, 'msm_b619/shaders');
  for (const [name, dir] of Object.entries(sets)) {
    const files = walk(dir, ['.vsh', '.fsh', '.glsl']);
    const r = { files: files.length, ok: 0, okUntranslated: 0, failed: 0, categories: {}, notes: {}, perFile: {} };
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const vertex = f.endsWith('.vsh') || (f.endsWith('.glsl') && !/out\s+vec4\s+\w+\s*;[^]*void\s+main/.test(src) && /gl_Position/.test(src));
      const type = vertex ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER;
      let text;
      const tr = translate(src, vertex ? 'vertex' : 'fragment');
      for (const n of tr.notes) r.notes[n] = (r.notes[n] ?? 0) + 1;
      if (f.endsWith('.glsl')) {
        // An include alone: compiled inside an empty main, as a fragment or vertex unit.
        text = PRECISION + tr.body + (/void\s+main\s*\(/.test(src) ? '' : '\nvoid main() {}\n');
      } else text = PRECISION + tr.body;
      const c = compile(gl, type, text);
      const raw = compile(gl, type, src);
      if (raw.ok) r.okUntranslated++;
      const rel = path.relative(dir, f);
      if (c.ok) r.ok++;
      else {
        r.failed++;
        for (const cat of category(c.log)) r.categories[cat] = (r.categories[cat] ?? 0) + 1;
      }
      r.perFile[rel] = c.ok ? 'ok' : category(c.log).join(' | ');
      gl.deleteShader(c.shader);
      gl.deleteShader(raw.shader);
    }
    out.sets[name] = r;
  }
  return out;
}

// ---- post effects ----

function stillFrame(w, h) {
  // A stand-in for a Try it still frame: sky gradient, ground, some blocks.
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, h * 0.6);
  sky.addColorStop(0, '#6d9bff');
  sky.addColorStop(1, '#c4dcff');
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#5d8a3a';
  g.fillRect(0, h * 0.6, w, h * 0.4);
  for (let i = 0; i < 12; i++) {
    g.fillStyle = `hsl(${i * 30},60%,45%)`;
    g.fillRect(40 + i * 64, h * 0.45 - (i % 3) * 30, 48, 48);
  }
  return g.getImageData(0, 0, w, h);
}

function linkProgram(gl, vsText, fsText) {
  const v = compile(gl, gl.VERTEX_SHADER, vsText);
  const f = compile(gl, gl.FRAGMENT_SHADER, fsText);
  if (!v.ok || !f.ok) return { ok: false, stage: !v.ok ? 'vertex' : 'fragment', log: category(!v.ok ? v.log : f.log) };
  const p = gl.createProgram();
  gl.attachShader(p, v.shader);
  gl.attachShader(p, f.shader);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return { ok: false, stage: 'link', log: [gl.getProgramInfoLog(p).replace(/'[^']*'/g, "'_'").slice(0, 160)] };
  return { ok: true, program: p };
}

function shaderFile(roots, id, ext) {
  const [ns, p] = id.includes(':') ? id.split(':') : ['minecraft', id];
  for (const root of roots) {
    const f = path.join(root, ns, 'shaders', p + ext);
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  }
  return null;
}

async function post([jarAssets, selfAssets, w = '854', h = '480']) {
  const W = Number(w), H = Number(h);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
  const roots = [selfAssets, jarAssets].filter(Boolean);
  const translate = makeTranslator(roots);
  const out = { size: `${W}x${H}`, renderer: gl.getParameter(gl.RENDERER), effects: {} };
  const frame = stillFrame(W, H);
  const mkTarget = (tw, th) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { tex: t, fb, w: tw, h: th };
  };
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]), gl.STATIC_DRAW);
  const files = walk(path.join(jarAssets, 'minecraft/post_effect'), ['.json']).map((f) => ['jar', f]);
  if (selfAssets) files.push(...walk(path.join(selfAssets, 'msm_b619/post_effect'), ['.json']).map((f) => ['self', f]));
  for (const [origin, file] of files) {
    const name = origin + ':' + path.basename(file, '.json');
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    const e = { passes: (json.passes ?? []).length, targets: Object.keys(json.targets ?? {}).length, fields: {} };
    const targets = { 'minecraft:main': mkTarget(W, H) };
    gl.bindTexture(gl.TEXTURE_2D, targets['minecraft:main'].tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, frame.data);
    for (const [tn, td] of Object.entries(json.targets ?? {})) {
      targets[tn.includes(':') ? tn : 'minecraft:' + tn] = mkTarget(td.width ?? W, td.height ?? H);
      for (const k of Object.keys(td)) e.fields['target.' + k] = true;
    }
    const external = new Set();
    const tgt = (n) => {
      const k = n.includes(':') ? n : 'minecraft:' + n;
      if (!targets[k]) { targets[k] = mkTarget(W, H); external.add(k === 'minecraft:main' ? k : 'game:' + k.split(':')[1]); }
      return targets[k];
    };
    const passes = [];
    let runnable = true;
    for (const pass of json.passes ?? []) {
      for (const k of Object.keys(pass)) e.fields['pass.' + k] = true;
      for (const inp of pass.inputs ?? []) for (const k of Object.keys(inp)) e.fields['input.' + k] = true;
      const vs = shaderFile(roots, pass.vertex_shader, '.vsh');
      const fsrc = shaderFile(roots, pass.fragment_shader, '.fsh');
      if (vs === null || fsrc === null) { passes.push({ ok: false, stage: 'missing' }); runnable = false; continue; }
      const prog = linkProgram(gl, PRECISION + translate(vs, 'vertex').body, PRECISION + translate(fsrc, 'fragment').body);
      if (!prog.ok) { passes.push(prog); runnable = false; continue; }
      passes.push({ ok: true, prog: prog.program, pass });
    }
    e.passResults = passes.map((p) => (p.ok ? 'ok' : `${p.stage}: ${(p.log ?? []).join(' | ')}`));
    const usesTextureInput = (json.passes ?? []).some((p) => (p.inputs ?? []).some((i) => i.location));
    if (usesTextureInput) e.textureInput = true;
    if (runnable) {
      const unknownUniforms = new Set();
      const run = () => {
        for (const p of passes) {
          const pr = p.prog;
          gl.useProgram(pr);
          const outT = tgt(p.pass.output);
          let unit = 0;
          let inSize = [W, H];
          for (const inp of p.pass.inputs ?? []) {
            const t = inp.target ? tgt(inp.target) : null;
            const loc = gl.getUniformLocation(pr, inp.sampler_name + 'Sampler');
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, t ? t.tex : targets['minecraft:main'].tex);
            if (loc) gl.uniform1i(loc, unit);
            if (t && unit === 0) inSize = [t.w, t.h];
            unit++;
          }
          const nBlocks = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORM_BLOCKS);
          for (let b = 0; b < nBlocks; b++) {
            const bname = gl.getActiveUniformBlockName(pr, b);
            const size = gl.getActiveUniformBlockParameter(pr, b, gl.UNIFORM_BLOCK_DATA_SIZE);
            const idxs = gl.getActiveUniformBlockParameter(pr, b, gl.UNIFORM_BLOCK_ACTIVE_UNIFORM_INDICES);
            const offs = gl.getActiveUniforms(pr, idxs, gl.UNIFORM_OFFSET);
            const data = new Float32Array(size / 4);
            const given = Object.fromEntries((p.pass.uniforms?.[bname] ?? []).map((u, i) => [u.name ?? i, u.value]));
            idxs.forEach((ui, k) => {
              const info = gl.getActiveUniform(pr, ui);
              const n = info.name.replace(/^.*\./, '');
              let v = given[n];
              if (v === undefined && /OutSize|ScreenSize/.test(n)) v = [outT.w, outT.h];
              if (v === undefined && n === 'InSize') v = inSize;
              if (v === undefined) unknownUniforms.add(`${bname}.${n}`);
              const vals = Array.isArray(v) ? v.flat() : typeof v === 'number' ? [v] : [];
              vals.forEach((x, j) => { data[offs[k] / 4 + j] = x; });
            });
            const ubo = gl.createBuffer();
            gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
            gl.bufferData(gl.UNIFORM_BUFFER, data, gl.DYNAMIC_DRAW);
            gl.uniformBlockBinding(pr, b, b);
            gl.bindBufferBase(gl.UNIFORM_BUFFER, b, ubo);
          }
          const nAttr = gl.getProgramParameter(pr, gl.ACTIVE_ATTRIBUTES);
          for (let a = 0; a < nAttr; a++) {
            const info = gl.getActiveAttrib(pr, a);
            const loc = gl.getAttribLocation(pr, info.name);
            gl.bindBuffer(gl.ARRAY_BUFFER, quad);
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
          }
          gl.bindFramebuffer(gl.FRAMEBUFFER, outT.fb);
          gl.viewport(0, 0, outT.w, outT.h);
          gl.drawArrays(gl.TRIANGLES, 0, nAttr > 0 ? 6 : 3);
        }
      };
      run();
      gl.finish();
      const t0 = performance.now();
      const N = 20;
      for (let i = 0; i < N; i++) run();
      const px = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      e.msPerFrame = +((performance.now() - t0) / N).toFixed(2);
      e.unknownUniforms = [...unknownUniforms].map((u) => u.replace(/\.[^.]+$/, '.<member>')).filter((v, i, a) => a.indexOf(v) === i).length;
      // Did the picture change? Compare the main target (or the last output) against the still frame.
      const last = passes[passes.length - 1].pass.output;
      const lt = tgt(last);
      e.gameTargets = [...external];
      gl.bindFramebuffer(gl.FRAMEBUFFER, lt.fb);
      const buf = new Uint8Array(lt.w * lt.h * 4);
      gl.readPixels(0, 0, lt.w, lt.h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let diff = 0;
      if (lt.w === W && lt.h === H) for (let i = 0; i < buf.length; i += 97) diff += Math.abs(buf[i] - frame.data[i]);
      e.changedPicture = diff > 0;
    }
    out.effects[name] = e;
  }
  return out;
}

async function ipc([indexFile, objects, ...keys]) {
  const { ipcRenderer } = require('electron');
  const idx = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  const out = {};
  for (const k of keys) {
    const h = idx.objects[k].hash;
    const f = path.join(objects, h.slice(0, 2), h);
    const times = [];
    let bytes = 0;
    for (let i = 0; i < 12; i++) {
      const t = performance.now();
      const b = await ipcRenderer.invoke('b619:read', f);
      times.push(performance.now() - t);
      bytes = b.byteLength;
    }
    times.sort((a, b) => a - b);
    out[k.split('/').slice(2).join('/')] = { bytes, firstMs: +times[times.length - 1].toFixed(1), medianMs: +times[6].toFixed(1) };
  }
  return out;
}

async function ttf([file, size, ...texts]) {
  const face = new FontFace('b619', fs.readFileSync(file));
  await face.load();
  document.fonts.add(face);
  const g = new OffscreenCanvas(10, 10).getContext('2d');
  g.font = `${size}px b619`;
  return { widths: Object.fromEntries(texts.map((t) => [t, +g.measureText(t).width.toFixed(2)])) };
}

window.runTask = async (name, args) => {
  const t = performance.now();
  const r = await { sounds, stream, shaders, post, ipc, ttf }[name](args);
  r.taskMs = +(performance.now() - t).toFixed(0);
  return r;
};
