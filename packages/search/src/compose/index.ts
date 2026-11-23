/** The head and the clause, behaviours and the answer reader (B659). */
export {
  type BehaviourFit,
  behaviourFit,
  type MadeBehaviour,
  makeBehaviour,
  type PluginBehaviour,
  replaceThing,
  THING_PLACEHOLDER,
  uniqueRuleKey,
} from './behaviour';
export { CLAUSE_WORDS, splitClause } from './clause';
export {
  type AnswerReader,
  type AnswerReaderOptions,
  createAnswerReader,
  type DetailedEntryReading,
  defaultStarterOf,
  type FlowFacts,
  type ReaderPluginData,
} from './reader';
