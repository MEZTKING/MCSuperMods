/**
 * The jigsaw assembler (ADR 0122 D2, D5; B637 builds it from the rules J1 to J20 of the spike
 * `docs/reference/spikes/b634/README.md`). Stub made by B635: it answers an empty assembly.
 */

import type { Assembly, AssemblyInput, AssemblyStep } from './api';

/** The steps of an assembly, one at a time (B637). The stub yields only the stop. */
export function* assembleSteps(_input: AssemblyInput): Generator<AssemblyStep, void, undefined> {
  yield { kind: 'stopped', reason: 'done', pieces: 0 };
}

/** The whole assembly of one seed (B637). The stub places nothing. */
export function assemble(input: AssemblyInput): Assembly {
  const steps = [...assembleSteps(input)];
  return { pieces: [], steps, stoppedAtLimit: false };
}
