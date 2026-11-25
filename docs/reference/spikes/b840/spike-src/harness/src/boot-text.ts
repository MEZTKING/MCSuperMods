import { bootstrapSource } from '../../../wt-B840/app/src/renderer/src/plugins/sandbox/worker-bootstrap.ts';
import { spikeBootstrapSource } from './spike-bootstrap.js';
import { writeFileSync } from 'node:fs';
writeFileSync(process.argv[2], bootstrapSource());
writeFileSync(process.argv[3], spikeBootstrapSource());
