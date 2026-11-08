/**
 * The note tool (ADR 0053): records a request MSM cannot fully build in the project's
 * Wishlist, so the user can review it and have the missing feature added to MSM.
 */
import { z } from 'zod';

export const noteMissingFeatureInput = z.object({
  title: z
    .string()
    .min(1)
    .max(120)
    .describe('A short name for the missing feature, for example "Set a player\'s velocity".'),
  request: z.string().min(1).max(1000).describe("What the user asked for, in the user's words."),
  missing: z
    .string()
    .min(1)
    .max(1000)
    .describe('What MSM lacks to build it as asked (a component, an action, a script API call).'),
  builtInstead: z
    .string()
    .max(1000)
    .optional()
    .describe('What you proposed instead, if anything, and how it falls short.'),
});

export type NoteMissingFeatureInput = z.infer<typeof noteMissingFeatureInput>;

export const NOTE_TOOLS = [
  {
    name: 'note_missing_feature',
    group: 'note',
    input: noteMissingFeatureInput,
    description:
      "Records in the project's Wishlist a request that MSM cannot build as asked, with what is missing and what you built instead. Call it once per missing feature, after you have proposed the closest working version (or explained that none exists). It changes nothing in the project's content; the user reviews the Wishlist and can have the feature added to MSM.",
  },
] as const;
