import { execFileSync } from 'node:child_process';
import { test } from 'vitest';
test('b720 forms', async () => {
  process.argv[2] = '<repo>';
  process.argv[3] = '<scratchpad>/b720';
  await import('./check_forms.ts');
}, 600000);
