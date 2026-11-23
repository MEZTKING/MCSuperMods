/**
 * Parts shared by the shader and post effect views (B629): the compiler's lines against the
 * user's own code, the stated limit (the plan's 3L6), and the test picture before and after.
 */

import { useEffect, useRef } from 'react';
import type { CompileResult, CompilerLine } from './compile';
import type { ShaderFile } from './sources';
import { pictureDifference, type RgbaPicture } from './test-picture';

/** The limit when the app's graphics do not compile a shader (3L6). */
export const COMPILE_LIMIT_WORDS =
  'The app’s graphics (WebGL 2) could not compile this after MSM’s fixed translation, so nothing is drawn here. The game’s OpenGL is less strict (it takes a whole number where a decimal is expected, for example), so it may still work there: the effect itself is only in the game.';

/** The line under a picture run. */
export const TEST_PICTURE_WORDS =
  'Drawn by your shader on MSM’s own test picture, not a frame of the game.';

/** The words for a stage. */
export function stageWords(stage: 'vertex' | 'fragment'): string {
  return stage === 'vertex' ? 'Vertex shader' : 'Fragment shader';
}

function placeWords(line: CompilerLine): string {
  if (line.include !== undefined) {
    return `In ${line.include.id}, line ${line.include.line} (included on line ${line.line})`;
  }
  return line.line > 0 ? `Line ${line.line}` : 'The whole file';
}

/** The compiler's lines grouped by the place they are on, in order. */
export function groupByLine(lines: readonly CompilerLine[]): CompilerLine[][] {
  const groups = new Map<string, CompilerLine[]>();
  for (const line of lines) {
    const key = `${line.line}|${line.include?.id ?? ''}|${line.include?.line ?? ''}`;
    const group = groups.get(key) ?? [];
    group.push(line);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** The compiler's lines of one stage, each against the user's own line. */
export function CompilerLines(props: {
  readonly stage: 'vertex' | 'fragment';
  readonly id: string;
  readonly file: Extract<ShaderFile, { ok: true }>;
  readonly answer: CompileResult;
  readonly testId?: string;
}) {
  const { stage, id, file, answer } = props;
  const own = file.from === 'project' ? file.text.split('\n') : null;
  const errors = answer.lines.filter((line) => line.severity !== 'warning');
  return (
    <div
      data-testid={props.testId ?? `shader-stage-${stage}`}
      data-ok={answer.ok ? 'true' : 'false'}
      data-from={file.from}
      className="flex flex-col gap-1 text-sm"
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-medium">{stageWords(stage)}</span>
        <code className="text-xs [overflow-wrap:anywhere]">{id}</code>
        <span className={answer.ok ? 'text-xs text-muted' : 'text-xs text-error'}>
          {answer.ok ? 'Compiles' : 'Does not compile here'}
        </span>
        <span className="text-xs text-muted">
          {file.from === 'project' ? 'your file' : 'Minecraft’s own file'}
        </span>
      </div>
      {!answer.ok && (
        <ul aria-label={`${stageWords(stage)}: compiler lines`} className="flex flex-col gap-1">
          {groupByLine(errors).map((group) => {
            const line = group[0] as CompilerLine;
            const code =
              own !== null && line.include === undefined && line.line > 0
                ? own[line.line - 1]
                : undefined;
            return (
              <li
                key={`${line.line}|${line.include?.id ?? ''}|${line.include?.line ?? ''}`}
                data-testid="compiler-line"
                data-line={line.line}
                className="flex flex-col gap-0.5 rounded border border-error px-2 py-1 text-xs"
              >
                <span className="text-muted">{placeWords(line)}</span>
                {code !== undefined && (
                  <code
                    data-testid="compiler-line-code"
                    className="whitespace-pre-wrap [overflow-wrap:anywhere]"
                  >
                    {code.trim()}
                  </code>
                )}
                {group.map((entry) => (
                  <span
                    key={entry.message}
                    data-testid="compiler-message"
                    className="text-error [overflow-wrap:anywhere]"
                  >
                    {entry.message}
                  </span>
                ))}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A picture on a canvas (nothing where the document has no 2D canvas, as in tests). */
export function PictureCanvas(props: {
  readonly picture: RgbaPicture;
  readonly label: string;
  readonly testId: string;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const { picture } = props;
  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null || typeof ImageData === 'undefined') return;
    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext('2d');
    } catch {
      context = null;
    }
    if (context === null) return;
    context.putImageData(
      new ImageData(new Uint8ClampedArray(picture.data), picture.width, picture.height),
      0,
      0,
    );
  }, [picture]);
  return (
    <figure className="flex min-w-0 flex-col gap-1">
      <canvas
        ref={ref}
        data-testid={props.testId}
        aria-label={props.label}
        role="img"
        width={picture.width}
        height={picture.height}
        className="h-auto w-full max-w-[384px] rounded border border-border [image-rendering:pixelated]"
      />
      <figcaption className="text-xs text-muted">{props.label}</figcaption>
    </figure>
  );
}

/** The test picture before and after a run. */
export function PicturePair(props: {
  readonly before: RgbaPicture;
  readonly after: RgbaPicture;
  readonly ms: number;
}) {
  return (
    <div
      data-testid="shader-run"
      data-ms={props.ms}
      data-changed={pictureDifference(props.before, props.after).toFixed(3)}
      className="flex flex-col gap-1"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <PictureCanvas picture={props.before} label="Before" testId="shader-before" />
        <PictureCanvas picture={props.after} label="After" testId="shader-after" />
      </div>
      <p className="text-xs text-muted">{TEST_PICTURE_WORDS}</p>
    </div>
  );
}
