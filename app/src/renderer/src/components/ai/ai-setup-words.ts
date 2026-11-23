/**
 * The words of the AI helper's set-up card, its Settings section and the start dialog (ADR 0125
 * D5, D8, D10, D13). Every string a user reads in those places comes from here, so one test can
 * sweep them: nothing in {@link SETUP_WORDS} or the functions without "Advanced" in their name
 * may hold an id, "API", "token", "request" or the other words Very easy never shows.
 *
 * @packageDocumentation
 */

import {
  type AiKeyTestResult,
  type AiModelId,
  type AiTypicalCost,
  classifyModelClientError,
  formatCost,
  ModelClientError,
  modelInfo,
  typicalCost,
} from '@msm/ai';

/**
 * Where a key is made: the Claude Console's API keys page (verified on 2026-11-22: the old
 * `console.anthropic.com/settings/keys` redirects here). Opened outside the app.
 */
export const ANTHROPIC_KEYS_URL = 'https://platform.claude.com/settings/keys';

/** The user guide page of the AI helper. */
export const AI_GUIDE_URL = 'https://meztking.github.io/MCSuperMods/ai-helper';

/** The fixed words of the card, the Settings section and the start dialog (every mode). */
export const SETUP_WORDS = Object.freeze({
  heading: 'Set up the AI helper',
  stepGet: '1. Get a key',
  stepGetHint: "Sign in on Anthropic's site, make a new key there and copy it.",
  openSite: "Open Anthropic's site",
  stepPaste: '2. Paste it here',
  keyPlaceholder: 'Paste your key',
  keyPlaceholderReplace: 'Paste a new key to replace the saved one',
  stepSave: '3.',
  saveAndCheck: 'Save and check',
  checking: 'Checking your key…',
  works: 'The key works. You can start.',
  checkAgain: 'Check again',
  removeKey: 'Remove the key',
  removed: 'The key is removed.',
  noEncryption: 'This computer cannot lock the key away safely, so it cannot be saved here.',
  whatIsSent: 'What is sent',
  sentHeading: 'Sent to Anthropic when you press Send:',
  sent: [
    'Your message and this chat so far.',
    'The parts of your mod the helper looks at: names, settings and problems.',
    'Pictures you add to a message yourself.',
  ],
  neverSentHeading: 'Never sent:',
  neverSent: [
    "Your mod's pictures and sounds.",
    'Where files are on your computer.',
    'Your key, to anyone but Anthropic.',
  ],
  nothingUntilSend: 'Nothing is sent until you press Send.',
  guide: 'AI helper guide',
  moreSettings: 'All AI helper settings',
  // Settings.
  sectionHeading: 'AI helper',
  model: 'Model',
  effortSmall: 'Effort for questions and small changes',
  effortBuild: 'Effort for whole builds',
  effortHint: 'More effort thinks for longer and costs more.',
  fallback: 'Let Anthropic answer with another Claude model when this one declines',
  // Start dialog.
  startTitle: 'New project with the AI helper',
  startAsk: 'What should your mod add?',
  startPlaceholder: 'Describe the blocks, items, mobs or other things you want, in your own words.',
  startName: 'What is your mod called?',
  startNamePlaceholder: 'Ruby mod',
  startFolderSubmit: 'Choose folder and build…',
  startNameSubmit: 'Make my mod',
  startNeedsKey: 'Set up the helper first. What you typed stays here.',
});

/** The effort choices, in order. */
export const EFFORT_WORDS = Object.freeze([
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
] as const);

/**
 * The typical cost, as the end of the card's sentence "…costs money on that account: <this>."
 * Worked out from the measured prompt and the price table (`typicalCost`), never typed.
 */
export function costSentence(model: AiModelId, cost: AiTypicalCost = typicalCost(model)): string {
  return (
    `with ${modelInfo(model).label} a first question costs ${formatCost(cost.firstQuestion)} ` +
    `and each question after it within an hour ${formatCost(cost.followUp)}; ` +
    'making a whole mod costs more'
  );
}

/** The card's opening paragraph. */
export function introSentence(model: AiModelId): string {
  return (
    "The helper is Anthropic's Claude. It needs a key, like a password, from an Anthropic " +
    `account, and using it costs money on that account: ${costSentence(model)}. ` +
    'If the account is not yours, ask its owner first.'
  );
}

/** The start dialog's last line. */
export function startFooter(model: AiModelId, asksName: boolean): string {
  const where = asksName ? 'starts a new mod' : 'makes a new project in a folder you choose';
  return (
    `MCSuperMods ${where}, then the helper plans it, makes it step by step and shows you ` +
    `everything before it goes in. It is paid from your Anthropic account: ${costSentence(model)}. ` +
    'The helper shows the cost as it goes.'
  );
}

/** "It is saved in <folder>" under the mod name, as Very easy's New says it. */
export function savedIn(folder: string): string {
  return `It is saved in ${folder}`;
}

/** A model in the Model list, by the typical cost of a first question. */
export function modelOption(model: AiModelId): string {
  const info = modelInfo(model);
  return `${info.label} (a first question ${formatCost(typicalCost(model).firstQuestion)})`;
}

/** A model in the Model list in Advanced: the price per million tokens as well. */
export function modelOptionAdvanced(model: AiModelId): string {
  const { label, pricing } = modelInfo(model);
  return `${label} (about $${pricing.inputPerMTok} in, $${pricing.outputPerMTok} out per million tokens)`;
}

/** Under the fallback switch for a model that has none. */
export function noFallback(model: AiModelId): string {
  return `${modelInfo(model).label} has no other model to answer for it.`;
}

/** The prices' date. */
export function pricesChecked(checkedOn: string): string {
  return `The costs are estimates from Anthropic's prices of ${checkedOn}; the panel shows what each chat has cost.`;
}

/** The outcome of the key check, as a sentence with what to do next. */
export interface KeyCheckWords {
  ok: boolean;
  text: string;
  /** Whether **Check again** is offered (the key may be fine; Anthropic could not be asked). */
  checkAgain: boolean;
}

/** The key check's error classes that main and the key test send besides the SDK's. */
const NO_KEY = 'NoKey';

/**
 * The sentence for a key check (ADR 0125 D9, F5): a key that is not accepted is said at once,
 * and a check that could not be made says the key is kept. Never the class name or the raw text.
 */
export function keyCheckWords(result: AiKeyTestResult): KeyCheckWords {
  if (result.ok) return { ok: true, text: SETUP_WORDS.works, checkAgain: false };
  if (result.errorClass === NO_KEY) {
    return { ok: false, text: 'No key is saved yet. Paste one above.', checkAgain: false };
  }
  const kind = classifyModelClientError(new ModelClientError(result.errorClass, result.error));
  switch (kind) {
    case 'AuthenticationError':
      return {
        ok: false,
        text: "Your key was not accepted. Check that you copied all of it, or make a new one on Anthropic's site and paste it again.",
        checkAgain: false,
      };
    case 'PermissionDeniedError':
      return {
        ok: false,
        text: "Your key may not use Claude. Look at the key's settings on Anthropic's site, or make a new one.",
        checkAgain: true,
      };
    case 'BillingError':
      return {
        ok: false,
        text: "The key is right, but the Anthropic account has no credit left. Add credit on Anthropic's site, then check again.",
        checkAgain: true,
      };
    case 'RateLimitError':
    case 'OverloadedError':
    case 'InternalServerError':
    case 'TimeoutError':
      return {
        ok: false,
        text: 'Anthropic is busy just now, so the key could not be checked. It is saved; check again in a minute.',
        checkAgain: true,
      };
    case 'APIConnectionError':
      return {
        ok: false,
        text: 'No connection to Anthropic, so the key could not be checked. It is saved; check the internet, then check again.',
        checkAgain: true,
      };
    default:
      return {
        ok: false,
        text: 'The key could not be checked. It is saved; check again, or see the AI helper guide.',
        checkAgain: true,
      };
  }
}

/** Every user-facing string of this file that every mode may show, for the words test. */
export function plainSetupStrings(model: AiModelId): string[] {
  const fixed = Object.values(SETUP_WORDS).flatMap((value) =>
    typeof value === 'string' ? [value] : [...value],
  );
  const checks = [
    'AuthenticationError',
    'PermissionDeniedError',
    'BillingError',
    'RateLimitError',
    'APIConnectionError',
    'Error',
    NO_KEY,
  ].map((errorClass) => keyCheckWords({ ok: false, error: 'x', errorClass }).text);
  return [
    ...fixed,
    ...EFFORT_WORDS.map((entry) => entry.label),
    ...checks,
    costSentence(model),
    introSentence(model),
    startFooter(model, true),
    startFooter(model, false),
    savedIn('C:\\Users\\Ann\\Documents\\MCSuperMods\\Ruby mod'),
    modelOption(model),
    noFallback(model),
    pricesChecked('2026-11-22'),
  ];
}
