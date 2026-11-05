/**
 * Stable problem codes reported by `@msm/core`.
 *
 * @packageDocumentation
 */

/** Problem codes reported while loading, lowering and refactoring a project. */
export const ProblemCodes = {
  /** `msm.project.json` has a field of the wrong type; a default was used. */
  projectInvalidShape: 'project.invalid-shape',
  /** A namespace directory exists on disk but is not listed in `msm.project.json`. */
  projectUnlistedNamespace: 'project.unlisted-namespace',
  /** An element's kind is not registered. The element is still loaded and saved unchanged. */
  elementUnknownKind: 'element.unknown-kind',
  /** An element file is not at the path its kind's folder and its id imply. */
  elementFolderMismatch: 'element.folder-mismatch',
  /** An element file is not valid JSON. The file is skipped. */
  elementInvalidJson: 'element.invalid-json',
  /** An element file is valid JSON but not a valid element. The file is skipped. */
  elementInvalidShape: 'element.invalid-shape',
  /** An element's id namespace differs from the namespace directory it was found in. */
  elementIdMismatch: 'element.id-mismatch',
  /** Two element files declare the same id. The later file (in path order) is skipped. */
  elementDuplicateId: 'element.duplicate-id',
  /** An element's kind is not registered, so `lowerProject` cannot lower it. */
  loweringUnknownKind: 'lowering.unknown-kind',
  /** A kind's `lower` function threw. The element contributes no output files. */
  loweringFailed: 'lowering.failed',
  /**
   * Two output files share a layer and path and cannot merge (no `merge`, mixed modes or
   * differing schemas). The first element's file is kept.
   */
  loweringConflict: 'lowering.conflict',
  /**
   * Two mergeable output files (`OutputFile.merge`) at one path disagree: the same key has
   * different values, or contents do not have the merge mode's shape. The first value is kept.
   */
  loweringMergeConflict: 'lowering.merge-conflict',
  /** A rename's new id is already used by another element. Nothing is renamed. */
  refsRenameConflict: 'refs.rename-conflict',
} as const;

/** Any problem code reported by `@msm/core`. */
export type ProblemCode = (typeof ProblemCodes)[keyof typeof ProblemCodes];
