/**
 * User-decision tools (ADR 0041 D4, D6): the tool result is the user's answer. They have no
 * deadline; cancelling the run ends them.
 */
import { z } from 'zod';
import { kindIdSchema, namespaceSchema, resourceIdSchema } from './common';

export const proposePlanInput = z.object({
  title: z.string().min(1).max(200),
  items: z
    .array(
      z.object({
        itemId: z
          .string()
          .regex(/^[a-z0-9_-]+$/)
          .max(64)
          .describe('A short id of the plan item, for example "ore-block".'),
        kind: kindIdSchema.describe('The kind of the main element this item makes.'),
        elementId: resourceIdSchema.describe('The id of the main element this item makes.'),
        summary: z.string().min(1).max(500).describe('One sentence the user reads.'),
        dependsOn: z
          .array(z.string().max(64))
          .max(64)
          .optional()
          .describe('itemIds that must be built before this one.'),
      }),
    )
    .min(1)
    .max(100),
  assets: z
    .array(
      z.object({
        namespace: namespaceSchema,
        path: z.string().max(200),
        purpose: z.string().max(200),
      }),
    )
    .max(100)
    .optional()
    .describe('Placeholder textures the plan needs.'),
  notes: z.string().max(2000).optional(),
});

export const checkpointInput = z.object({
  completedItemIds: z.array(z.string().max(64)).max(100),
  nextItemId: z.string().max(64).optional(),
  summary: z.string().min(1).max(1000).describe('What was just built, in one or two sentences.'),
});

export type ProposePlanInput = z.infer<typeof proposePlanInput>;
export type CheckpointInput = z.infer<typeof checkpointInput>;

/** The answer `propose_plan` returns (built by the host). */
export interface PlanDecision {
  decision: 'build_all' | 'step' | 'revise';
  /** The plan items as the user left them (they may remove or edit items). */
  items: ProposePlanInput['items'];
  comments: string;
}

/** The answer `checkpoint` returns (built by the host). */
export interface CheckpointDecision {
  decision: 'continue' | 'stop';
}

export const DECIDE_TOOLS = [
  {
    name: 'propose_plan',
    group: 'decide',
    input: proposePlanInput,
    description:
      'Shows the user a build plan and waits for their answer. In build mode call it first, before any proposal. List one item per main element in dependency order (the msm:mod element and blocks before items, items before recipes and loot tables), with the textures the plan needs. Returns { decision: "build_all" | "step" | "revise", items, comments }: build the returned items (the user may have removed or edited some); on "revise", change the plan according to the comments and call propose_plan again.',
  },
  {
    name: 'checkpoint',
    group: 'decide',
    input: checkpointInput,
    description:
      'Reports progress after each plan item is built and checked. Returns { decision: "continue" | "stop" }. In step-through mode the user decides; otherwise it returns "continue" at once. On "stop", stop proposing and summarise what is pending.',
  },
] as const;
