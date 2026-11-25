// B840 S2 plugin: draws 512 x 512 at 30 frames a second on a transferred canvas or on its own
// OffscreenCanvas whose frames it posts as ImageBitmaps.
defineMsmPlugin({
  id: 'spike.canvas',
  apiVersion: '^1.0.0',
  contributes: {
    async canvas(canvas, options, api) {
      const contexts = {};
      for (const type of ['2d', 'webgl2', 'webgl', 'bitmaprenderer']) {
        try {
          const c = new OffscreenCanvas(16, 16).getContext(type);
          contexts[type] = c !== null;
          if (type === 'webgl2' && c) {
            const dbg = c.getExtension('WEBGL_debug_renderer_info');
            contexts.renderer = dbg ? c.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER);
          }
        } catch (e) { contexts[type] = `throws ${e}`; }
      }
      contexts.webgpu = typeof navigator.gpu;
      if (options.probeOnly) { api.report({ contexts }); return; }
      const W = 512, H = 512;
      const target = canvas ?? new OffscreenCanvas(W, H);
      const kind = options.context;
      const ctx = target.getContext(kind);
      let gl = null, prog = null;
      if (kind === 'webgl2') {
        gl = ctx;
        const vs = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vs, '#version 300 es\nin vec2 p; uniform float t; void main(){ gl_Position = vec4(p.x*cos(t)-p.y*sin(t), p.x*sin(t)+p.y*cos(t), 0, 1); }');
        gl.compileShader(vs);
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fs, '#version 300 es\nprecision mediump float; out vec4 o; void main(){ o = vec4(0.3, 0.6, 0.9, 1); }');
        gl.compileShader(fs);
        prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        const pts = [];
        for (let i = 0; i < 2000; i++) { const a = i * 0.01, r = (i % 100) / 100; pts.push(Math.cos(a) * r, Math.sin(a) * r, Math.cos(a + 0.05) * r, Math.sin(a + 0.05) * r, 0, 0); }
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        gl.useProgram(prog);
      }
      const draw = (frame) => {
        if (gl) {
          gl.viewport(0, 0, W, H); gl.clearColor(0.1, 0.1, 0.1, 1); gl.clear(gl.COLOR_BUFFER_BIT);
          gl.uniform1f(gl.getUniformLocation(prog, 't'), frame * 0.03);
          gl.drawArrays(gl.TRIANGLES, 0, 6000);
          gl.flush();
        } else {
          const g = ctx;
          const grad = g.createLinearGradient(0, 0, W, H);
          grad.addColorStop(0, '#203040'); grad.addColorStop(1, `hsl(${frame % 360} 50% 40%)`);
          g.fillStyle = grad; g.fillRect(0, 0, W, H);
          for (let i = 0; i < 300; i++) { g.fillStyle = `hsl(${(i * 7 + frame) % 360} 70% 60%)`; g.fillRect((i * 37 + frame) % W, (i * 53) % H, 12, 12); }
          g.fillStyle = '#fff'; g.font = '20px sans-serif'; g.fillText(`frame ${frame}`, 10, 30);
        }
      };
      const frames = options.frames ?? 90;
      const drawMs = [], intervals = [], postMs = [];
      let last = performance.now();
      for (let f = 0; f < frames; f++) {
        const start = performance.now();
        intervals.push(start - last); last = start;
        draw(f);
        const drawn = performance.now();
        drawMs.push(drawn - start);
        if (canvas === null) {
          const bitmap = target.transferToImageBitmap();
          api.postBitmap(bitmap, { frame: f, sentAt: performance.timeOrigin + performance.now() });
          postMs.push(performance.now() - drawn);
        }
        const wait = Math.max(0, 1000 / 30 - (performance.now() - start));
        await new Promise((r) => setTimeout(r, wait));
      }
      api.report({ contexts, drawMs, intervals: intervals.slice(1), postMs, done: true });
    },
  },
});
