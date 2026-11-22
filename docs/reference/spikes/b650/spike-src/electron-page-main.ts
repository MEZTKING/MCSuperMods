// B650 spike: the page-main-thread side of the Electron run (input set by the main process).
import { runBench } from './bench-core.ts';

const w = window as unknown as { __ok: (v: unknown) => void; __input: Parameters<typeof runBench>[0] };
const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
w.__ok(runBench(w.__input, mem ? () => mem.usedJSHeapSize : undefined));
