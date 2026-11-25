// B840 S4: allocates until something stops it (JS heap) or up to a cap (ArrayBuffers).
const keep = [];
defineMsmPlugin({
  id: 'spike.hog',
  apiVersion: '^1.0.0',
  contributes: {
    ping() { return 1; },
    heap(capMb) {
      // Small objects on the JS heap: about 64 bytes each, until the heap limit or the cap.
      let n = 0;
      for (;;) {
        const block = new Array(1_000_000);
        for (let i = 0; i < block.length; i++) block[i] = { a: i, b: n };
        keep.push(block);
        n++;
        if (n * 64 > capMb) return { stoppedAtCap: true, approxMb: n * 64 };
      }
    },
    arraybuffer(capMb) {
      let mb = 0;
      try {
        while (mb < capMb) { const b = new Uint8Array(64 * 1024 * 1024); b.fill(1); keep.push(b); mb += 64; }
        return { allocatedMb: mb, stopped: 'cap' };
      } catch (e) { return { allocatedMb: mb, stopped: String(e) }; }
    },
  },
});
