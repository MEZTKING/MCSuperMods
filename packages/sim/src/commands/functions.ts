/**
 * Functions in Try it (ADR 0120 D8; B601 stub, B606 fills it): the project's lowered
 * `data/<ns>/function/<path>.mcfunction` files run line by line with the game's own commands
 * the preview honours (`vanilla.ts`); the `#minecraft:load` tag runs when the area starts (and
 * again after an edit to the functions, as `/reload` does), `#minecraft:tick` every tick, and
 * `schedule` waits for its tick.
 *
 * - **Order:** a function runs its lines in order; a `function` line (also under `execute ...
 *   run`) runs the called function whole before the next line (depth first), with an explicit
 *   stack, so deep chains never run out of stack. `return` ends the function with its value;
 *   `execute store ... run function` stores that value once the function ends.
 * - **Macro lines** (`$`) take their `$(name)` from the call's arguments (`function <id> {...}`,
 *   `with storage`, a project command's arguments); a missing one stops the call with the
 *   game's message, and nothing of that function runs.
 * - **The budget:** at most {@link TICK_COMMAND_CAP} commands run in one tick (the tick's
 *   functions, schedules, the chat box and Run in Try it together); a run that reaches it stops
 *   with one line, and the rest of that run does not happen.
 * - **Said:** every command or form the preview does not run is one "Only in Minecraft" line
 *   naming it, never silent; lines the game would not read are named with its error.
 * - **The log:** the tick tag's commands log only what the game shows (chat, titles) and what is
 *   only in Minecraft; other runs log each command's answer too, at most
 *   {@link LOG_LINES_PER_RUN} lines a run, then one line saying how many more there were.
 * - **Approximations:** the tick tag runs before the schedules due that tick, both at the start
 *   of the area's tick; a function that ends without `return` gives `execute store` nothing.
 */

import type { Json, JsonObject } from '@msm/plugin-api';
import { PLAYER } from '../events/actions.js';
import type { DataLookup } from '../tags/api.js';
import { createTagResolver } from '../tags/resolve.js';
import type { SimFiles, SimOrigin } from '../types.js';
import {
  AREA_DIMENSION,
  CommandState,
  type CompiledLine,
  compileLine,
  type FunctionCall,
  lineSupport,
  type Outcome,
  type RunContext,
  runCompiled,
  type Source,
  snbtWords,
  VANILLA_COMMANDS,
  type VanillaHost,
} from './vanilla.js';

/** The most commands one tick may run (ADR 0120 D8). */
export const TICK_COMMAND_CAP = 10_000;

/** The most log lines one run writes before it sums the rest up in one line. */
export const LOG_LINES_PER_RUN = 60;

/** The function tags the game runs by itself. */
export const LOAD_TAG = 'minecraft:load';
export const TICK_TAG = 'minecraft:tick';

/** One line of a function file. */
export interface FunctionLine {
  readonly text: string;
  /** The line's number in the file, from 1 (the first line of a continued line). */
  readonly line: number;
  /** A macro line (`$`), filled in from the call's arguments. */
  readonly macro: boolean;
}

/** A function of the project. */
export interface SimFunction {
  readonly id: string;
  /** The lines with a command (blank lines and comments left out). */
  readonly lines: readonly FunctionLine[];
  /** Whether it has macro lines (and so needs arguments). */
  readonly macro: boolean;
}

/** The folder names functions are read from (`TargetFacts.folders.data`). */
export interface FunctionsTarget {
  readonly folders: { readonly data: { readonly function?: string; readonly tags?: string } };
}

/** Reads the project's functions from the lowered files, by id. */
export function readFunctions(files: SimFiles, target: FunctionsTarget): Map<string, SimFunction> {
  const folder = target.folders.data.function;
  const out = new Map<string, SimFunction>();
  if (folder === undefined) return out;
  const pattern = new RegExp(`^data/([a-z0-9_.-]+)/${folder}/(.+)\\.mcfunction$`);
  const decoder = new TextDecoder();
  for (const [path, raw] of [...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const match = pattern.exec(path);
    if (match === null) continue;
    const id = `${match[1]}:${match[2]}`;
    const text = typeof raw === 'string' ? raw : decoder.decode(raw);
    out.set(id, parseFunction(id, text));
  }
  return out;
}

/** Splits a function file into its command lines (a `\` at the end continues a line). */
export function parseFunction(id: string, text: string): SimFunction {
  const lines: FunctionLine[] = [];
  const raw = text.split(/\r?\n/);
  for (let i = 0; i < raw.length; i += 1) {
    const first = i + 1;
    let line = (raw[i] as string).trim();
    while (line.endsWith('\\') && i + 1 < raw.length) {
      i += 1;
      line = `${line.slice(0, -1).trimEnd()} ${(raw[i] as string).trim()}`;
    }
    if (line === '' || line.startsWith('#')) continue;
    const macro = line.startsWith('$');
    lines.push({ text: macro ? line.slice(1) : line, line: first, macro });
  }
  return { id, lines, macro: lines.some((one) => one.macro) };
}

/** Fills a macro line's `$(name)`s; the names missing from `args`, if any. */
export function fillMacro(
  text: string,
  args: JsonObject | undefined,
): { readonly line: string; readonly missing: readonly string[] } {
  const missing: string[] = [];
  const line = text.replace(/\$\(([A-Za-z0-9_]+)\)/g, (_whole, name: string) => {
    const value: Json | undefined = args?.[name];
    if (value === undefined) {
      missing.push(name);
      return '';
    }
    return snbtWords(value);
  });
  return { line, missing };
}

/** What the engine works with: the commands' host and where to read function tags. */
export interface FunctionHost extends VanillaHost {
  /** The project's data files (function tags), project over vanilla. */
  readonly data?: () => DataLookup;
}

/** What one run did (Run in Try it, `/function` in the chat box, a project command). */
export interface FunctionRun {
  readonly id: string;
  /** Commands run. */
  readonly commands: number;
  /** Whether the tick's budget stopped it. */
  readonly stopped: boolean;
  /** The function's `return` value, when it returned one. */
  readonly result?: number;
  /** What the chat box shows: chat lines and the commands' answers. */
  readonly answer: readonly string[];
}

/** What the chat box shows for a line of the game's own commands. */
export interface VanillaChatAnswer {
  readonly result: 'ran' | 'error' | 'game';
  readonly answer: readonly string[];
}

interface Frame {
  readonly fn: SimFunction;
  readonly call: FunctionCall;
  readonly caller: Frame | null;
  index: number;
  done: boolean;
  result: number | undefined;
  success: boolean;
}

/** How a run logs: `quiet` runs (the tick tag) log only what the game shows. */
interface RunMode {
  readonly quiet: boolean;
  readonly answer: string[];
  logged: number;
  hidden: number;
  commands: number;
  stopped: boolean;
}

/** The functions of one area; see the module comment. */
export class FunctionEngine {
  /** Scores, tags, storage, effects, schedules and the last dialog. */
  readonly state = new CommandState();
  private readonly host: FunctionHost;
  private functions = new Map<string, SimFunction>();
  private target: FunctionsTarget;
  private files: SimFiles;
  private readonly compiled = new Map<string, CompiledLine>();
  private tagCache = new Map<string, readonly string[]>();
  private used = 0;
  private usedTick = -1;
  private stoppedTick = -1;
  private loadPending = true;

  constructor(host: FunctionHost, files: SimFiles, target: FunctionsTarget) {
    this.host = host;
    this.files = files;
    this.target = target;
    this.functions = readFunctions(files, target);
  }

  /** The project's functions by id. */
  get all(): ReadonlyMap<string, SimFunction> {
    return this.functions;
  }

  /** Commands run in the current tick so far. */
  get commandsThisTick(): number {
    return this.usedTick === this.host.now() ? this.used : 0;
  }

  /**
   * New lowered files after an edit: when the functions or their tags changed, they are read
   * again and the load tag runs at the next tick, as `/reload` does.
   */
  setFiles(files: SimFiles, target: FunctionsTarget = this.target): void {
    if (files === this.files && target === this.target) return;
    const before = this.signature(this.files, this.target);
    this.files = files;
    this.target = target;
    this.tagCache = new Map();
    if (this.signature(files, target) === before) return;
    this.functions = readFunctions(files, target);
    this.loadPending = true;
    this.host.log.info('Your functions changed; the load functions run again, as /reload does.');
  }

  /** "Clear the area": scores, tags, storage and schedules go; the load tag runs again. */
  clear(): void {
    this.state.clear();
    this.loadPending = true;
  }

  /** Whether a function (or `#` and a function tag) exists. */
  exists(id: string): boolean {
    if (id.startsWith('#')) return this.tagMembers(id.slice(1)) !== undefined;
    return this.functions.has(id);
  }

  /**
   * One tick (call it once per area tick, after the tick count moved on): the load tag if it is
   * due, the tick tag, then the schedules due now.
   */
  tick(): void {
    if (this.loadPending) {
      this.loadPending = false;
      if (this.tagMembers(LOAD_TAG) !== undefined) {
        this.run([{ id: `#${LOAD_TAG}`, source: this.serverSource() }], false);
      }
    }
    if (this.tagMembers(TICK_TAG) !== undefined) {
      this.run([{ id: `#${TICK_TAG}`, source: this.serverSource() }], true);
    }
    const now = this.host.now();
    const due = this.state.scheduled.filter((one) => one.due <= now);
    if (due.length > 0) {
      const kept = this.state.scheduled.filter((one) => one.due > now);
      this.state.scheduled.splice(0, this.state.scheduled.length, ...kept);
      this.run(
        due.map((one) => ({ id: one.id, source: this.serverSource() })),
        false,
      );
    }
  }

  /**
   * Runs a function now (Run in Try it, a project command's function): as and at the player
   * unless `asServer`, with macro arguments.
   */
  runFunction(
    id: string,
    options: {
      readonly args?: JsonObject;
      readonly asServer?: boolean;
      readonly origin?: SimOrigin;
    } = {},
  ): FunctionRun {
    const source = options.asServer === true ? this.serverSource() : this.playerSource();
    let result: number | undefined;
    const call: FunctionCall = {
      id,
      source: options.origin === undefined ? source : { ...source, origin: options.origin },
      ...(options.args === undefined ? {} : { args: options.args }),
      onDone: (value) => {
        result = value;
      },
    };
    if (!this.exists(id)) {
      this.host.log.info(`There is no function ${id} in the project.`, options.origin);
      return { id, commands: 0, stopped: false, answer: [`Unknown function ${id}`] };
    }
    const mode = this.run([call], false);
    this.host.log.info(
      `Ran ${mode.commands} ${mode.commands === 1 ? 'command' : 'commands'} from function ${id}.`,
      options.origin,
    );
    return {
      id,
      commands: mode.commands,
      stopped: mode.stopped,
      ...(result === undefined ? {} : { result }),
      answer: mode.answer,
    };
  }

  /** Runs a line typed in the chat box (one of the game's own commands), as the player. */
  runChatLine(line: string): VanillaChatAnswer {
    const text = line.trim().replace(/^\//, '');
    const compiled = this.compile(text);
    if (!compiled.ok) {
      if (compiled.kind === 'game') {
        this.host.log.onlyInMinecraft(`the game's ${compiled.why}`);
        return {
          result: 'game',
          answer: [
            VANILLA_COMMANDS.includes(compiled.command)
              ? `${compiled.why} runs only in Minecraft.`
              : `/${compiled.command} is one of the game's own commands; it runs only in Minecraft.`,
          ],
        };
      }
      this.host.log.info(`The command /${text} did not run: ${compiled.why}.`);
      return { result: 'error', answer: [compiled.why] };
    }
    const mode = this.newMode(false);
    let outcome: Outcome | undefined;
    if (this.spend(mode)) {
      outcome = runCompiled(compiled.run, this.context(mode), this.playerSource());
      if (outcome.calls !== undefined) this.drain(this.framesFor(outcome.calls, null, mode), mode);
    }
    this.flush(mode);
    const failed = outcome === undefined || !outcome.success;
    return { result: failed ? 'error' : 'ran', answer: mode.answer };
  }

  /** Whether Try it runs this line (the Function editor's gutter). */
  understands(line: string): boolean {
    const support = lineSupport(line);
    return support.runs && support.blank !== true;
  }

  // -------------------------------------------------------------------------------------------

  private signature(files: SimFiles, target: FunctionsTarget): string {
    const folder = `/${target.folders.data.function ?? '-'}/`;
    const tags = `/${target.folders.data.tags ?? '-'}/${target.folders.data.function ?? '-'}/`;
    const parts: string[] = [];
    for (const [path, raw] of files) {
      if (!path.startsWith('data/') || (!path.includes(folder) && !path.includes(tags))) continue;
      parts.push(`${path}\n${typeof raw === 'string' ? raw : raw.length}`);
    }
    return parts.sort().join('\n\n');
  }

  /** The functions of a function tag in order, or `undefined` when it does not resolve. */
  private tagMembers(id: string): readonly string[] | undefined {
    const cached = this.tagCache.get(id);
    if (cached !== undefined) return cached.length === 0 ? undefined : cached;
    const { tags, function: folder } = this.target.folders.data;
    if (tags === undefined || folder === undefined) return undefined;
    const project = (wanted: string, one: string): Json | undefined => {
      const colon = one.indexOf(':');
      const ns = colon < 0 ? 'minecraft' : one.slice(0, colon);
      const path = colon < 0 ? one : one.slice(colon + 1);
      const raw = this.files.get(`data/${ns}/${wanted}/${path}.json`);
      if (raw === undefined) return undefined;
      try {
        return JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw)) as Json;
      } catch {
        return undefined;
      }
    };
    const lookup: DataLookup = this.host.data?.() ?? project;
    const resolved = createTagResolver(lookup, {
      tagsFolder: tags,
      exists: (_registry, member) => this.functions.has(member),
    })(folder, id);
    const members = resolved.dropped ? [] : resolved.members.map((member) => member.id);
    this.tagCache.set(id, members);
    if (resolved.dropped && resolved.missing.some((one) => one !== `#${id}`)) {
      this.host.log.info(
        `The function tag #${id} names ${resolved.missing.join(', ')}, which do not exist; the game skips the whole tag.`,
      );
    }
    return members.length === 0 ? undefined : members;
  }

  private playerSource(): Source {
    const { player } = this.host;
    return {
      executor: PLAYER,
      pos: player.position,
      yaw: player.yaw,
      pitch: player.pitch,
      dimension: AREA_DIMENSION,
    };
  }

  /** The server at the area's spawn (the middle of the floor), as load and tick functions run. */
  private serverSource(): Source {
    const { world } = this.host;
    return {
      executor: null,
      pos: { x: world.sizeX / 2 + 0.5, y: 0, z: world.sizeZ / 2 + 0.5 },
      yaw: 0,
      pitch: 0,
      dimension: AREA_DIMENSION,
    };
  }

  private compile(text: string): CompiledLine {
    let found = this.compiled.get(text);
    if (found === undefined) {
      found = compileLine(text);
      if (this.compiled.size > 4096) this.compiled.clear();
      this.compiled.set(text, found);
    }
    return found;
  }

  private newMode(quiet: boolean): RunMode {
    return { quiet, answer: [], logged: 0, hidden: 0, commands: 0, stopped: false };
  }

  /** Takes one command from the tick's budget; false (with one line) when it is spent. */
  private spend(mode: RunMode): boolean {
    const tick = this.host.now();
    if (this.usedTick !== tick) {
      this.usedTick = tick;
      this.used = 0;
    }
    if (this.used >= TICK_COMMAND_CAP) {
      mode.stopped = true;
      if (this.stoppedTick !== tick) {
        this.stoppedTick = tick;
        this.host.log.info(
          `Try it stopped the functions after 10,000 commands in one tick (a function that keeps running itself?); the rest did not run.`,
        );
        mode.answer.push('Stopped after 10,000 commands in one tick.');
      }
      return false;
    }
    this.used += 1;
    mode.commands += 1;
    return true;
  }

  private context(mode: RunMode): RunContext {
    const write = (text: string, origin: SimOrigin | undefined): void => {
      if (mode.logged >= LOG_LINES_PER_RUN) {
        mode.hidden += 1;
        return;
      }
      mode.logged += 1;
      this.host.log.info(text, origin);
    };
    return {
      host: this.host,
      state: this.state,
      feedback: (text, origin) => {
        if (mode.answer.length < LOG_LINES_PER_RUN) mode.answer.push(text);
        if (!mode.quiet) write(text, origin);
      },
      chat: (text, origin) => {
        if (mode.answer.length < LOG_LINES_PER_RUN) mode.answer.push(text);
        write(text, origin);
      },
      only: (what, origin) => this.host.log.onlyInMinecraft(what, origin),
      functionExists: (id) => this.exists(id),
    };
  }

  private flush(mode: RunMode): void {
    if (mode.hidden > 0) {
      this.host.log.info(
        `${mode.hidden} more ${mode.hidden === 1 ? 'line' : 'lines'} from functions were left out of this list.`,
      );
      mode.hidden = 0;
    }
  }

  /** Runs calls to the end (or the budget) and returns how the run went. */
  private run(calls: readonly FunctionCall[], quiet: boolean): RunMode {
    const mode = this.newMode(quiet);
    this.drain(this.framesFor(calls, null, mode), mode);
    this.flush(mode);
    return mode;
  }

  /** Frames for calls, in the order they run (a tag's functions in its order). */
  private framesFor(calls: readonly FunctionCall[], caller: Frame | null, mode: RunMode): Frame[] {
    const frames: Frame[] = [];
    for (const call of calls) {
      const ids = call.id.startsWith('#') ? (this.tagMembers(call.id.slice(1)) ?? []) : [call.id];
      ids.forEach((id, index) => {
        const fn = this.functions.get(id);
        if (fn === undefined) {
          this.context(mode).feedback(`Unknown function ${id}`, call.source.origin);
          call.onDone?.(undefined, false);
          return;
        }
        if (fn.macro && call.args === undefined) {
          this.context(mode).feedback(
            `The function ${id} has macro lines and needs arguments; it did not run.`,
            call.source.origin,
          );
          call.onDone?.(undefined, false);
          return;
        }
        const last = index === ids.length - 1;
        frames.push({
          fn,
          call: last ? call : { ...call, returnFromCaller: false, onDone: () => {} },
          caller,
          index: 0,
          done: false,
          result: undefined,
          success: false,
        });
      });
    }
    return frames;
  }

  /** Runs frames depth first with an explicit stack. */
  private drain(frames: Frame[], mode: RunMode): void {
    const stack: Frame[] = [...frames].reverse();
    const rc = this.context(mode);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1] as Frame;
      if (frame.done || frame.index >= frame.fn.lines.length) {
        stack.pop();
        this.finish(frame);
        continue;
      }
      if (!this.spend(mode)) {
        stack.length = 0;
        break;
      }
      const line = frame.fn.lines[frame.index] as FunctionLine;
      frame.index += 1;
      const origin: SimOrigin = {
        elementId: frame.fn.id,
        pointer: `/data/lines/${line.line - 1}`,
      };
      let text = line.text;
      if (line.macro) {
        const filled = fillMacro(text, frame.call.args);
        if (filled.missing.length > 0) {
          rc.feedback(
            `Missing argument${filled.missing.length === 1 ? '' : 's'} ${filled.missing.join(', ')} for function ${frame.fn.id}; it stopped.`,
            origin,
          );
          frame.done = true;
          continue;
        }
        text = filled.line;
      }
      const compiled = this.compile(text);
      if (!compiled.ok) {
        if (compiled.kind === 'game') {
          rc.only(`the game's ${compiled.why} (in functions)`, origin);
        } else {
          rc.feedback(`${frame.fn.id}, line ${line.line}: ${compiled.why}`, origin);
        }
        continue;
      }
      const source: Source = { ...frame.call.source, origin };
      const outcome = runCompiled(compiled.run, rc, source);
      const children =
        outcome.calls === undefined || outcome.calls.length === 0
          ? []
          : this.framesFor(outcome.calls, frame, mode);
      if (outcome.returned === true) {
        const waits = children.some((child) => child.call.returnFromCaller === true);
        if (!waits) {
          frame.done = true;
          frame.result = outcome.success ? outcome.result : undefined;
          frame.success = outcome.success;
        }
      }
      for (let i = children.length - 1; i >= 0; i -= 1) stack.push(children[i] as Frame);
    }
  }

  private finish(frame: Frame): void {
    frame.call.onDone?.(frame.result, frame.success);
    if (frame.call.returnFromCaller === true && frame.caller !== null) {
      frame.caller.done = true;
      frame.caller.result = frame.result;
      frame.caller.success = frame.success;
    }
  }
}
