/**
 * Schema-driven form generator (DESIGN §6). Presentational only; the host wires values,
 * edits, problems, hidden paths and completions.
 */
export type { ChangeOptions, CompletionSource, FormChange, FormProblem } from './context';
export {
  IdDraftInput,
  type IdDraftInputProps,
  IdInput,
  type IdInputProps,
  idSuggestions,
  type SuggestIds,
} from './IdInput';
export { ProblemList } from './NodeEditor';
export { isWithin } from './pointer';
export {
  DEFAULT_MAX_DEPTH,
  SchemaForm,
  type SchemaFormHandle,
  type SchemaFormProps,
} from './SchemaForm';
export { inputClass } from './scalars';
export { defaultValue, inferMember, resolveNode } from './schema-utils';
