/** Answers from typed words by question type, with B650's clash rules (B659). */
export { assignAnswers, type FlowInput, type RequestMentions, type SlotAnswers } from './assign';
export { MAX_NAME_CHARS } from './name';
export type {
  Answer,
  AnswerKind,
  AnswerValidator,
  ColourMention,
  Dropped,
  NumberSpan,
  ThingMention,
} from './state';
export { fitsQuestion } from './state';
export type { SearchThing } from './things';
