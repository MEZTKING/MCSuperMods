/**
 * A post effect's chain of passes as a diagram (B629): the targets it declares, then each pass
 * from the pictures it reads, through its shaders, to the target it draws. Drawn always, with or
 * without WebGL, so the chain can be followed where it cannot be run.
 */

import { gameTargetsOf, MAIN_TARGET, type PostChain } from './chain';

/** How a pass fared, for its badge. */
export type PassStatus = 'checking' | 'compiles' | 'fails' | 'missing' | 'not_checked';

const STATUS_WORDS: Readonly<Record<PassStatus, string>> = {
  checking: 'Checking…',
  compiles: 'Compiles',
  fails: 'Does not compile here',
  missing: 'A shader file is missing',
  not_checked: 'Not checked',
};

const STATUS_CLASS: Readonly<Record<PassStatus, string>> = {
  checking: 'text-muted',
  compiles: 'text-muted',
  fails: 'text-error',
  missing: 'text-warning',
  not_checked: 'text-muted',
};

function targetWords(name: string, gameTargets: ReadonlySet<string>): string {
  if (name === MAIN_TARGET) return 'the screen (minecraft:main)';
  if (gameTargets.has(name)) return `${name} (the game’s)`;
  return name;
}

/** The diagram. */
export function PostDiagram(props: {
  readonly chain: PostChain;
  readonly statuses: readonly PassStatus[];
}) {
  const { chain, statuses } = props;
  const gameTargets = new Set(gameTargetsOf(chain));
  return (
    <div data-testid="post-diagram" className="flex flex-col gap-2 text-sm">
      {chain.targets.length > 0 && (
        <p className="text-xs text-muted [overflow-wrap:anywhere]">
          {`Targets: ${chain.targets
            .map((target) =>
              target.width !== undefined || target.height !== undefined
                ? `${target.name} (${target.width ?? 'screen'} by ${target.height ?? 'screen'})`
                : target.name,
            )
            .join(', ')}`}
        </p>
      )}
      <ol aria-label="Passes, in order" className="flex flex-col gap-1">
        {chain.passes.map((pass, index) => {
          const status = statuses[index] ?? 'not_checked';
          return (
            <li
              key={index}
              data-testid={`post-pass-${index}`}
              data-status={status}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-border px-2 py-1"
            >
              <span className="flex flex-wrap gap-1">
                {pass.inputs.length === 0 && (
                  <span className="text-xs text-muted">nothing read</span>
                )}
                {pass.inputs.map((input) => (
                  <span
                    key={`${input.samplerName}|${input.name}`}
                    data-testid="post-input"
                    className="rounded bg-panel px-1.5 py-0.5 text-xs [overflow-wrap:anywhere]"
                    title={`Read as ${input.samplerName}Sampler${input.bilinear ? ', smoothed' : ''}`}
                  >
                    {input.type === 'texture'
                      ? `picture ${input.name}`
                      : `${targetWords(input.name, gameTargets)}${input.useDepth === true ? ' depth' : ''}`}
                  </span>
                ))}
              </span>
              <span aria-hidden="true">→</span>
              <span className="flex flex-col">
                <span className="font-medium">{`Pass ${index + 1}`}</span>
                <code className="text-xs [overflow-wrap:anywhere]">
                  {pass.fragmentShader || '?'}
                </code>
                <code className="text-xs text-muted [overflow-wrap:anywhere]">
                  {pass.vertexShader || '?'}
                </code>
              </span>
              <span aria-hidden="true">→</span>
              <span className="rounded bg-panel px-1.5 py-0.5 text-xs [overflow-wrap:anywhere]">
                {targetWords(pass.output, gameTargets)}
              </span>
              <span className={`ml-auto text-xs ${STATUS_CLASS[status]}`}>
                {STATUS_WORDS[status]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
