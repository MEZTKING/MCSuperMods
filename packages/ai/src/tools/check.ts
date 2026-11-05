/** The check tool (ADR 0041 D4): validates the project with the pending changeset applied. */
import { z } from 'zod';

export const runChecksInput = z.object({
  scope: z
    .enum(['pending', 'all'])
    .describe(
      '"pending" reports the problems of the elements your proposals create or change; "all" reports every problem of the project with your proposals applied.',
    ),
});

export type RunChecksInput = z.infer<typeof runChecksInput>;

export const CHECK_TOOLS = [
  {
    name: 'run_checks',
    group: 'check',
    input: runChecksInput,
    description:
      "Builds a scratch copy of the project with every pending proposal applied (the user's project is not touched) and returns its problems from schema validation, the kinds' validators, the reference index, the mcfunction checker and the TypeScript check, grouped by element. Call it after every batch of proposals and before you finish, and fix every error it reports; warnings may stay if you explain them.",
  },
] as const;
