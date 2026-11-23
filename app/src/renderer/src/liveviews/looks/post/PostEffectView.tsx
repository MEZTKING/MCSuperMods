/**
 * The post effect's live view (ADR 0121 D8; B629): the chain of passes as a diagram, always;
 * each pass's shaders read (project first, then the target's jar: a name only another version
 * has is named missing, with the name this version uses), translated and compiled in the shader
 * worker, with the compiler's lines against the user's own code; and where every pass compiles
 * and every input can be given, the chain run once on MSM's test picture, about right. Without
 * WebGL the diagram alone, and the effect is only in the game.
 */

import type { Json } from '@msm/plugin-api';
import { useEffect, useState } from 'react';
import { type Fidelity, weakest } from '../../frame/fidelity';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import type { LiveViewProps } from '../../registry';
import { decodePng } from '../font/png';
import { sharedGlClient } from '../shader/gl-client';
import type { GlAnswer, StageSource } from '../shader/gl-jobs';
import { COMPILE_LIMIT_WORDS, CompilerLines, PicturePair } from '../shader/ShaderParts';
import {
  otherFullScreenShader,
  type PreparedStage,
  prepareStage,
  type ShaderReaders,
  splitId,
} from '../shader/sources';
import type { RgbaPicture } from '../shader/test-picture';
import { missingWords, standInLines, useSettled, versionOf } from '../shader/view-helpers';
import { MAIN_TARGET, type PostChain, parsePostEffect } from './chain';
import { type PassStatus, PostDiagram } from './PostDiagram';

/** A pass's two stages as read. */
interface PassStages {
  readonly vertex: PreparedStage | null;
  readonly fragment: PreparedStage | null;
  /** The full-screen vertex shader this version has, when the pass names the other one. */
  readonly otherFullScreen: string | null;
}

type ViewState =
  | { readonly phase: 'reading'; readonly chain: PostChain }
  | {
      readonly phase: 'read';
      readonly chain: PostChain;
      readonly passes: readonly PassStages[];
      readonly answer: GlAnswer | null;
    };

/** The path of a texture input's picture (`assets/<ns>/textures/effect/<path>.png`). */
export function effectTexturePath(location: string): string {
  const [namespace, path] = splitId(location);
  return `assets/${namespace}/textures/effect/${path}.png`;
}

async function readTexture(location: string, readers: ShaderReaders): Promise<RgbaPicture | null> {
  const path = effectTexturePath(location);
  const bytes =
    (await readers.readProject?.(path).catch(() => null)) ??
    (namespaceIsMinecraft(location)
      ? await readers.vanillaAssets?.readAsset(path).catch(() => null)
      : null) ??
    null;
  if (bytes === null) return null;
  try {
    return decodePng(bytes);
  } catch {
    return null;
  }
}

function namespaceIsMinecraft(id: string): boolean {
  return splitId(id)[0] === 'minecraft';
}

/** Each pass's status for the diagram. */
export function passStatuses(passes: readonly PassStages[], answer: GlAnswer | null): PassStatus[] {
  return passes.map((pass, index) => {
    if (pass.vertex === null || pass.fragment === null) return 'missing';
    if (!pass.vertex.ok || !pass.fragment.ok) return 'missing';
    if (answer === null) return 'checking';
    if (!answer.webgl || answer.kind !== 'post') return 'not_checked';
    const result = answer.passes[index];
    if (result === null || result === undefined) return 'missing';
    return result.vertex.ok && result.fragment.ok && result.link === null ? 'compiles' : 'fails';
  });
}

export default function PostEffectView(props: LiveViewProps) {
  const data = useSettled(props.element.data as Json);
  const { readProject, vanillaAssets } = props;
  const [state, setState] = useState<ViewState>(() => ({
    phase: 'reading',
    chain: parsePostEffect(props.element.data as Json),
  }));

  useEffect(() => {
    let live = true;
    const chain = parsePostEffect(data);
    const readers: ShaderReaders = { readProject, vanillaAssets };
    setState((previous) => (previous.phase === 'reading' ? { phase: 'reading', chain } : previous));
    void (async () => {
      const cache = new Map<string, Promise<PreparedStage>>();
      const stageOf = (id: string, stage: 'vertex' | 'fragment') => {
        const key = `${stage}|${id}`;
        let entry = cache.get(key);
        if (entry === undefined) {
          entry = prepareStage(id, stage, readers);
          cache.set(key, entry);
        }
        return entry;
      };
      const passes: PassStages[] = await Promise.all(
        chain.passes.map(async (pass) => {
          const vertex =
            pass.vertexShader === '' ? null : await stageOf(pass.vertexShader, 'vertex');
          const fragment =
            pass.fragmentShader === '' ? null : await stageOf(pass.fragmentShader, 'fragment');
          const otherFullScreen =
            vertex !== null && !vertex.ok && vertex.file.reason === 'missing'
              ? await otherFullScreenShader(pass.vertexShader, readers)
              : null;
          return { vertex, fragment, otherFullScreen };
        }),
      );
      if (!live) return;
      setState({ phase: 'read', chain, passes, answer: null });
      const locations = [
        ...new Set(
          chain.passes.flatMap((pass) =>
            pass.inputs.filter((input) => input.type === 'texture').map((input) => input.name),
          ),
        ),
      ];
      const pictures = await Promise.all(
        locations.map((location) => readTexture(location, readers)),
      );
      if (!live) return;
      const stages = passes.map((pass) =>
        pass.vertex?.ok === true && pass.fragment?.ok === true
          ? {
              vertex: pass.vertex.source as StageSource,
              fragment: pass.fragment.source as StageSource,
            }
          : null,
      );
      if (chain.passes.length === 0) return;
      const answer = await sharedGlClient().run({
        kind: 'post',
        chain,
        passes: stages,
        textures: Object.fromEntries(
          locations.map((location, index) => [location, pictures[index] ?? null]),
        ),
      });
      if (!live || answer === null) return;
      setState({ phase: 'read', chain, passes, answer });
    })();
    return () => {
      live = false;
    };
  }, [data, readProject, vanillaAssets]);

  const version = versionOf(props.project.targets);
  const { chain } = state;
  const passes = state.phase === 'read' ? state.passes : [];
  const answer = state.phase === 'read' ? state.answer : null;
  const statuses: PassStatus[] =
    state.phase === 'read' ? passStatuses(passes, answer) : chain.passes.map(() => 'checking');

  const notes = new Set<string>(chain.problems);
  const levels: Fidelity[] = [];
  let needsSetUp = false;
  const missing: string[] = [];
  passes.forEach((pass, index) => {
    for (const stage of [pass.vertex, pass.fragment]) {
      if (stage === null) continue;
      if (!stage.ok) {
        if (stage.file.reason === 'not_set_up') needsSetUp = true;
        const hint =
          pass.otherFullScreen !== null && stage === pass.vertex
            ? ` Minecraft ${version} names its full-screen shader ${pass.otherFullScreen}.`
            : '';
        missing.push(`Pass ${index + 1}: ${missingWords(stage, version)}${hint}`);
        continue;
      }
      if (stage.includesNeedSetUp) needsSetUp = true;
      for (const note of stage.notes) notes.add(note);
    }
  });

  const post = answer?.webgl && answer.kind === 'post' ? answer : null;
  const run = post?.run ?? null;
  const anyFailed = statuses.includes('fails');
  if (run?.ran === true) {
    levels.push('about_right');
    for (const line of standInLines(run.standIns)) notes.add(line);
    if (run.gameTargets.length > 0) {
      notes.add(
        `${run.gameTargets.join(', ')} ${run.gameTargets.length === 1 ? 'is' : 'are'} drawn by the game while playing; here ${run.gameTargets.length === 1 ? 'it is' : 'they are'} blank.`,
      );
    }
    if (run.readsDepth) notes.add('A still picture has no depth: depth inputs are blank here.');
    if (run.blankTextures.length > 0) {
      notes.add(`No picture found for ${run.blankTextures.join(', ')}: blank here.`);
    }
    notes.add('One still frame, not motion: persistent targets start empty.');
  } else levels.push('only_in_game');

  // The compiler's lines of each distinct failing file, once.
  const failing: { key: string; stage: Extract<PreparedStage, { ok: true }>; index: number }[] = [];
  if (post !== null) {
    const seen = new Set<string>();
    passes.forEach((pass, index) => {
      const result = post.passes[index];
      if (result === null || result === undefined) return;
      for (const [stage, compiled] of [
        [pass.vertex, result.vertex],
        [pass.fragment, result.fragment],
      ] as const) {
        if (stage === null || !stage.ok || compiled.ok) continue;
        const key = `${stage.source.stage}|${stage.source.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        failing.push({ key, stage, index });
      }
    });
  }

  return (
    <LiveViewFrame
      title="Post effect"
      fidelity={weakest(levels)}
      notes={[...notes]}
      needsSetUp={needsSetUp}
      onSetup={props.onSetup}
    >
      <div className="flex flex-col gap-3" data-testid="post-view">
        <PostDiagram chain={chain} statuses={statuses} />
        {missing.map((line) => (
          <p key={line} data-testid="post-missing" className="text-sm text-warning">
            {line}
          </p>
        ))}
        {failing.map(({ key, stage, index }) => {
          const result = post?.passes[index];
          if (result === null || result === undefined) return null;
          return (
            <CompilerLines
              key={key}
              stage={stage.source.stage}
              id={stage.source.id}
              file={stage.file}
              answer={stage.source.stage === 'vertex' ? result.vertex : result.fragment}
              testId={`post-compile-${index}-${stage.source.stage}`}
            />
          );
        })}
        {post?.passes.map((result, index) =>
          result?.link !== null && result?.link !== undefined ? (
            <p
              key={index}
              data-testid="post-link"
              className="text-sm text-error [overflow-wrap:anywhere]"
            >
              {`Pass ${index + 1}: the two shaders compile but do not fit together: ${result.link}`}
            </p>
          ) : null,
        )}
        {anyFailed && (
          <p data-testid="post-limit" className="text-sm">
            {COMPILE_LIMIT_WORDS}
          </p>
        )}
        {answer !== null && !answer.webgl && (
          <p data-testid="post-no-webgl" className="text-sm">
            {`${answer.reason} The chain is shown as a diagram; the effect itself is only in the game.`}
          </p>
        )}
        {run?.ran === true && <PicturePair before={run.before} after={run.after} ms={run.ms} />}
        {run !== null && !run.ran && !anyFailed && (
          <p data-testid="post-not-run" className="text-sm text-muted">
            {`Not drawn here: ${run.reason} The effect itself is only in the game.`}
          </p>
        )}
        {chain.passes.length > 0 && !chain.passes.some((pass) => pass.output === MAIN_TARGET) && (
          <p className="text-xs text-muted">No pass draws to the screen (minecraft:main).</p>
        )}
      </div>
    </LiveViewFrame>
  );
}
