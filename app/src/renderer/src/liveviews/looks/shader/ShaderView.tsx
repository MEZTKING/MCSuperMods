/**
 * The shader program's live view (ADR 0121 D8; B629): whether the vertex and fragment shaders it
 * names compile for the app's graphics after the mechanical translation (`translate.ts`), with
 * the compiler's lines against the user's own lines, and where it may run, the program drawn on
 * MSM's test picture, about right. A core shader of the game is a compile check only (B619 3S8:
 * its picture needs the game's vertex formats and values). Where it does not compile, nothing is
 * drawn and the view says the effect is only in the game (3L6). The work is done in the shader
 * worker 150 ms after the last edit.
 */

import type { Json } from '@msm/plugin-api';
import { useEffect, useState } from 'react';
import { type Fidelity, weakest } from '../../frame/fidelity';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import type { LiveViewProps } from '../../registry';
import { sharedGlClient } from './gl-client';
import type { GlAnswer } from './gl-jobs';
import { COMPILE_LIMIT_WORDS, CompilerLines, PicturePair, stageWords } from './ShaderParts';
import {
  FULL_SCREEN_VERTEX_SHADERS,
  type PreparedStage,
  prepareStage,
  type ShaderReaders,
  splitId,
} from './sources';
import type { ShaderDefines } from './translate';
import { missingWords, standInLines, useSettled, versionOf } from './view-helpers';

/** What a shader program file names. */
export interface ShaderProgramFile {
  readonly vertex: string | null;
  readonly fragment: string | null;
  /** Uniform values by name (the file's `uniforms`). */
  readonly uniforms: Readonly<Record<string, unknown>>;
  readonly defines?: ShaderDefines;
}

function isObject(value: unknown): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads a shader program file (`minecraft:shader`). */
export function programOf(data: Json): ShaderProgramFile {
  const object = isObject(data) ? data : {};
  const name = (value: Json | undefined) =>
    typeof value === 'string' && value.trim() !== ''
      ? value.includes(':')
        ? value
        : `minecraft:${value}`
      : null;
  const uniforms: Record<string, unknown> = {};
  for (const uniform of Array.isArray(object.uniforms) ? object.uniforms : []) {
    if (isObject(uniform) && typeof uniform.name === 'string') {
      uniforms[uniform.name] = uniform.values ?? uniform.value ?? [];
    }
  }
  const out: ShaderProgramFile = {
    vertex: name(object.vertex),
    fragment: name(object.fragment),
    uniforms,
  };
  const defines = object.defines;
  if (isObject(defines)) {
    const values: Record<string, string> = {};
    if (isObject(defines.values)) {
      for (const [key, value] of Object.entries(defines.values)) values[key] = String(value);
    }
    const flags = Array.isArray(defines.flags)
      ? defines.flags.filter((flag): flag is string => typeof flag === 'string')
      : [];
    return { ...out, defines: { values, flags } };
  }
  return out;
}

/** Why a program is compiled but not drawn, or `null` when it may run. */
export function compileOnlyReason(stages: readonly PreparedStage[]): string | null {
  const core = stages.find(
    (stage) =>
      stage.ok &&
      stage.file.from === 'vanilla' &&
      splitId(stage.source.id)[1].startsWith('core/') &&
      !FULL_SCREEN_VERTEX_SHADERS.includes(stage.source.id),
  );
  if (core === undefined) return null;
  return 'Minecraft’s core shaders need the game’s own vertex data and values, so the app checks that they compile but does not draw them.';
}

type ViewState =
  | { readonly phase: 'reading' }
  | {
      readonly phase: 'read';
      readonly program: ShaderProgramFile;
      readonly stages: readonly PreparedStage[];
      readonly answer: GlAnswer | null;
      readonly compileOnly: string | null;
    };

export default function ShaderView(props: LiveViewProps) {
  const data = useSettled(props.element.data as Json);
  const { readProject, vanillaAssets } = props;
  const [state, setState] = useState<ViewState>({ phase: 'reading' });

  useEffect(() => {
    let live = true;
    const readers: ShaderReaders = { readProject, vanillaAssets };
    const program = programOf(data);
    void (async () => {
      const ids: [string | null, 'vertex' | 'fragment'][] = [
        [program.vertex, 'vertex'],
        [program.fragment, 'fragment'],
      ];
      const stages = await Promise.all(
        ids
          .filter((entry): entry is [string, 'vertex' | 'fragment'] => entry[0] !== null)
          .map(([id, stage]) => prepareStage(id, stage, readers, program.defines)),
      );
      if (!live) return;
      const compileOnly = compileOnlyReason(stages);
      setState({ phase: 'read', program, stages, answer: null, compileOnly });
      const vertex = stages.find((stage) => stage.ok && stage.source.stage === 'vertex');
      const fragment = stages.find((stage) => stage.ok && stage.source.stage === 'fragment');
      if (vertex === undefined || !vertex.ok || fragment === undefined || !fragment.ok) return;
      const answer = await sharedGlClient().run({
        kind: 'program',
        vertex: vertex.source,
        fragment: fragment.source,
        uniforms: program.uniforms,
        compileOnly,
      });
      if (!live || answer === null) return;
      setState({ phase: 'read', program, stages, answer, compileOnly });
    })();
    return () => {
      live = false;
    };
  }, [data, readProject, vanillaAssets]);

  const version = versionOf(props.project.targets);
  if (state.phase === 'reading') {
    return (
      <LiveViewFrame title="Shader program" fidelity="only_in_game">
        <p data-testid="shader-checking" className="text-sm text-muted">
          Reading the shaders…
        </p>
      </LiveViewFrame>
    );
  }

  const { program, stages, answer, compileOnly } = state;
  const notes = new Set<string>();
  const levels: Fidelity[] = [];
  let needsSetUp = false;
  for (const stage of stages) {
    if (!stage.ok) {
      if (stage.file.reason === 'not_set_up') needsSetUp = true;
      continue;
    }
    if (stage.includesNeedSetUp) needsSetUp = true;
    for (const note of stage.notes) notes.add(note);
  }
  const missing = stages.filter(
    (stage): stage is Extract<PreparedStage, { ok: false }> => !stage.ok,
  );
  const unnamed: string[] = [];
  if (program.vertex === null) unnamed.push('The program names no vertex shader.');
  if (program.fragment === null) unnamed.push('The program names no fragment shader.');
  const missingIncludes = stages.flatMap((stage) => (stage.ok ? stage.missingIncludes : []));

  const compiled = answer?.webgl === true && answer.kind === 'program';
  const failed =
    compiled &&
    (!answer.stages.vertex.ok || !answer.stages.fragment.ok || answer.stages.link !== null);
  const run = compiled ? answer.run : null;
  if (run?.ran === true) {
    levels.push('about_right');
    for (const line of standInLines(run.standIns)) notes.add(line);
  } else levels.push('only_in_game');

  return (
    <LiveViewFrame
      title="Shader program"
      fidelity={weakest(levels)}
      notes={[...notes]}
      needsSetUp={needsSetUp}
      onSetup={props.onSetup}
    >
      <div className="flex flex-col gap-3" data-testid="shader-view">
        {[...unnamed, ...missing.map((stage) => missingWords(stage, version))].map((line) => (
          <p key={line} data-testid="shader-missing" className="text-sm text-warning">
            {line}
          </p>
        ))}
        {missingIncludes.length > 0 && (
          <p data-testid="shader-missing-includes" className="text-sm text-warning">
            {`Not found, so left out: ${missingIncludes.join(', ')}.`}
          </p>
        )}
        {stages.map((stage) => {
          if (!stage.ok) return null;
          const result = compiled
            ? stage.source.stage === 'vertex'
              ? answer.stages.vertex
              : answer.stages.fragment
            : null;
          if (result === null) {
            return (
              <p key={stage.source.stage} className="text-sm text-muted">
                {`${stageWords(stage.source.stage)} ${stage.source.id}: ${
                  answer === null ? 'checking…' : 'not checked'
                }`}
              </p>
            );
          }
          return (
            <CompilerLines
              key={stage.source.stage}
              stage={stage.source.stage}
              id={stage.source.id}
              file={stage.file}
              answer={result}
            />
          );
        })}
        {compiled && answer.stages.link !== null && (
          <p data-testid="shader-link" className="text-sm text-error [overflow-wrap:anywhere]">
            {`The two shaders compile but do not fit together: ${answer.stages.link}`}
          </p>
        )}
        {failed && (
          <p data-testid="shader-limit" className="text-sm">
            {COMPILE_LIMIT_WORDS}
          </p>
        )}
        {answer !== null && !answer.webgl && (
          <p data-testid="shader-no-webgl" className="text-sm">
            {`${answer.reason} The shader itself is only in the game.`}
          </p>
        )}
        {run?.ran === true && <PicturePair before={run.before} after={run.after} ms={run.ms} />}
        {run !== null && !run.ran && !failed && (
          <p data-testid="shader-not-run" className="text-sm text-muted">
            {compileOnly ?? `It compiles, but is not drawn here: ${run.reason}`}
          </p>
        )}
      </div>
    </LiveViewFrame>
  );
}
