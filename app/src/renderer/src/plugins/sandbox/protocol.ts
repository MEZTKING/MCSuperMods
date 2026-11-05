/**
 * Message protocol between the renderer host and a plugin worker (ADR 0035 D3). Everything
 * that crosses is JSON or `Uint8Array` (structured clone).
 *
 * @packageDocumentation
 */

/** Methods the host may call on a plugin worker; each names one contribution function. */
export type SandboxMethod = 'lower' | 'data' | 'build' | 'validate' | 'run' | 'import';

/**
 * The arguments of each method. `point` and `id` name the contribution; the rest are the
 * function's arguments as data (a target as `TargetFacts`, a registry as a snapshot key plus
 * the snapshot the first time the worker sees that key).
 */
export interface SandboxArgs {
  lower: [kindId: string, element: unknown, target: unknown];
  data: [templateId: string, context: unknown];
  build: [point: 'projectStarters' | 'examples', id: string, context: unknown];
  validate: [
    validatorId: string,
    input: { elements: unknown; target: unknown },
    registryKey: string,
    snapshot: Record<string, string[]> | null,
  ];
  run: [exporterId: string, input: unknown];
  import: [importerId: string, file: unknown, namespace: string];
}

/** Host to worker: one request. */
export interface SandboxRequest {
  type: 'request';
  id: number;
  method: SandboxMethod;
  args: unknown[];
}

/** Worker to host: the plugin registered and describes itself. */
export interface SandboxReady {
  type: 'ready';
  description: PluginDescription;
}

/** Worker to host: the answer to one request. */
export type SandboxResponse =
  | { type: 'response'; id: number; ok: true; value: unknown }
  | { type: 'response'; id: number; ok: false; code: string; message: string };

/** Worker to host: an `OutputSink.writeFile` or `ProblemReporter.report` call during a request. */
export interface SandboxCallback {
  type: 'callback';
  id: number;
  op: 'writeFile' | 'report';
  args: unknown[];
}

/** Worker to host: the plugin failed before registering (or never called the register hook). */
export interface SandboxFatal {
  type: 'fatal';
  code: string;
  message: string;
}

/** Any message a worker sends. */
export type SandboxWorkerMessage = SandboxReady | SandboxResponse | SandboxCallback | SandboxFatal;

/** One contribution as the worker describes it: its data fields plus the names of its functions. */
export interface ContributionDescription {
  data: Record<string, unknown>;
  functions: string[];
}

/** What a plugin worker reports when it is ready. */
export interface PluginDescription {
  id: string;
  apiVersion: string;
  /** Every contribution point the plugin object has, including unsupported ones. */
  contributes: Record<string, ContributionDescription[]>;
}
