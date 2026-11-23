/**
 * Timer Studio (ADR 0117 D1, ADR 0113 D6; B555) for `msm:timer`, loaded lazily: the words shown
 * with the time, how long, counting down or up, "Show on the boss bar" (or above the hotbar, or
 * not at all) and the bar's colour, when it starts, whether it starts again, and "When the time
 * is up" (a function; Rules reach it with "The time is up").
 *
 * Live view (ADR 0119 D1): "How the timer looks", the boss bar or the line above the hotbar at
 * any second of the timer (a slider), and Play, which counts in real seconds and starts again
 * when the timer repeats; it follows every edit (about right: MSM's letters). Try it counts it
 * as the game plays (B558).
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { Pause, Play } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { typingKey } from '../../forms/context';
import { LiveViewFrame } from '../../liveviews/frame/LiveViewFrame';
import { asObject, pathSetter } from '../blocks-items/blocks-items-model';
import { CheckField, TextField } from '../blocks-items/parts';
import { ChoiceField } from '../entities/MobKindSection';
import { BOSS_BAR_COLOUR_LABELS, BOSS_BAR_COLOURS } from '../entities/mob-kinds';
import { NumberField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { Section } from '../worldgen/parts';
import {
  clockOf,
  gamesFunction,
  objectOf,
  TIMER_COUNT_LABELS,
  TIMER_SHOW_LABELS,
  TIMER_STARTS_LABELS,
  textOf,
  timerAt,
  timerText,
} from './games-model';
import { ThingField } from './pickers';
import { CommandLines, GamesStudioShell } from './shell';

/** Boss bar colours as CSS, close to the game's bars. */
export const BOSS_BAR_CSS: Readonly<Record<string, string>> = Object.freeze({
  pink: '#ec00b8',
  blue: '#00b7ec',
  red: '#ec3500',
  green: '#1dec00',
  yellow: '#e9ec00',
  purple: '#7b00ec',
  white: '#ececec',
});

/** The live view; see the module comment. */
function TimerLook(props: { data: Json }) {
  const data = objectOf(props.data);
  const length = typeof data.seconds === 'number' && data.seconds >= 1 ? data.seconds : 1;
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const sliderId = useId();
  const repeat = data.repeat === true;
  // A shorter timer brings the slider back within it.
  const at = Math.min(elapsed, length);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setElapsed((before) => (before + 1 <= length ? before + 1 : repeat ? 0 : before));
    }, 1000);
    return () => clearInterval(timer);
  }, [playing, length, repeat]);
  // A timer that does not repeat stops playing once its time is up.
  useEffect(() => {
    if (playing && !repeat && at >= length) setPlaying(false);
  }, [playing, repeat, at, length]);
  const state = timerAt(props.data, at);
  const show = textOf(data.show) || 'boss_bar';
  const text = timerText(props.data, state.shown);
  const colour = BOSS_BAR_CSS[textOf(data.colour)] ?? BOSS_BAR_CSS.white;
  return (
    <LiveViewFrame
      title="How the timer looks"
      fidelity="about_right"
      notes={[
        'Drawn in MSM’s own letters. The game counts in whole seconds, shared by every player.',
      ]}
      controls={
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button
            data-testid="timer-live-play"
            aria-pressed={playing}
            onClick={() => {
              if (!playing && at >= length) setElapsed(0);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
            {playing ? 'Pause' : 'Play'}
          </Button>
          <label htmlFor={sliderId} className="text-muted text-xs">
            Seconds since it started
          </label>
          <input
            id={sliderId}
            type="range"
            min={0}
            max={length}
            step={1}
            value={at}
            data-testid="timer-live-slider"
            onChange={(event) => setElapsed(Number(event.target.value))}
          />
          <span className="text-xs tabular-nums">{clockOf(at)}</span>
        </div>
      }
    >
      <div
        className="flex min-h-20 flex-col items-center justify-between gap-2 rounded bg-[#3a5a2a] p-3 font-mono text-sm text-white"
        data-testid="timer-live-look"
        data-shown={state.shown}
      >
        {show === 'boss_bar' ? (
          <div
            className="flex w-64 max-w-full flex-col items-center gap-1"
            data-testid="timer-live-boss-bar"
          >
            <span>{text}</span>
            <div className="h-1.5 w-full bg-black/60">
              <div
                className="h-full"
                style={{ width: `${state.fill * 100}%`, background: colour }}
              />
            </div>
          </div>
        ) : (
          <span />
        )}
        {show === 'action_bar' && <span data-testid="timer-live-action-bar">{text}</span>}
        {show === 'none' && (
          <span className="text-xs text-white/70" data-testid="timer-live-hidden">
            Not shown. It still counts, and your rules can read the time left.
          </span>
        )}
        {state.ended && (
          <span className="text-xs text-white/80" data-testid="timer-live-ended">
            The time is up{repeat ? ': it starts again.' : '.'}
          </span>
        )}
      </div>
    </LiveViewFrame>
  );
}

/** The Timer Studio. */
export default function TimerStudio(props: StudioProps) {
  const { element, onChange, project, target, suggest } = props;
  const data = asObject(element.data);
  const set = pathSetter(element.data, onChange);
  const seconds = typeof data.seconds === 'number' ? data.seconds : 300;
  return (
    <GamesStudioShell studio={props} label="Timer Studio" testId="timer">
      <Section title="How the timer looks" testId="timer-live">
        <TimerLook data={element.data} />
      </Section>
      <Section title="Timer" testId="timer-general">
        <TextField
          label="Words shown with the time"
          value={data.name}
          testId="timer-name"
          placeholder="Time left"
          onCommit={(value) => set(['name'], value, typingKey('/name'))}
        />
        <div className="flex flex-wrap items-end gap-2">
          <NumberField
            label="Minutes"
            value={Math.floor(seconds / 60)}
            integer
            testId="timer-minutes"
            onCommit={(value) =>
              set(
                ['seconds'],
                Math.max(1, (value ?? 0) * 60 + (seconds % 60)),
                typingKey('/seconds'),
              )
            }
          />
          <NumberField
            label="Seconds"
            value={seconds % 60}
            integer
            testId="timer-seconds"
            onCommit={(value) =>
              set(
                ['seconds'],
                Math.max(1, Math.floor(seconds / 60) * 60 + (value ?? 0)),
                typingKey('/seconds'),
              )
            }
          />
          <span className="pb-1 text-muted text-xs">{clockOf(seconds)} in all</span>
        </div>
        <ChoiceField
          label="Which way"
          value={textOf(data.count) || 'down'}
          choices={Object.keys(TIMER_COUNT_LABELS)}
          labels={TIMER_COUNT_LABELS}
          testId="timer-count"
          onChange={(value) => set(['count'], value ?? 'down')}
        />
        <div className="flex flex-wrap items-end gap-2">
          <ChoiceField
            label="Where it shows"
            value={textOf(data.show) || 'boss_bar'}
            choices={Object.keys(TIMER_SHOW_LABELS)}
            labels={TIMER_SHOW_LABELS}
            testId="timer-show"
            onChange={(value) => set(['show'], value ?? 'boss_bar')}
          />
          {(textOf(data.show) || 'boss_bar') === 'boss_bar' && (
            <ChoiceField
              label="Bar colour"
              value={textOf(data.colour) || 'white'}
              choices={BOSS_BAR_COLOURS}
              labels={BOSS_BAR_COLOUR_LABELS}
              testId="timer-colour"
              onChange={(value) => set(['colour'], value ?? 'white')}
            />
          )}
        </div>
      </Section>
      <Section title="When it runs" testId="timer-when">
        <ChoiceField
          label="Starts"
          value={textOf(data.starts) || 'manual'}
          choices={Object.keys(TIMER_STARTS_LABELS)}
          labels={TIMER_STARTS_LABELS}
          testId="timer-starts"
          onChange={(value) => set(['starts'], value ?? 'manual')}
        />
        <CheckField
          label="Starts again when the time is up"
          checked={data.repeat === true}
          testId="timer-repeat"
          onChange={(checked) => set(['repeat'], checked)}
        />
        <ThingField
          project={project}
          target={target}
          sort="function"
          label="When the time is up, run"
          value={textOf(data.on_end)}
          emptyLabel="Nothing (or a rule: “The time is up”)"
          testId="timer-on-end"
          suggest={suggest}
          onChange={(value) => set(['on_end'], value)}
        />
        <p className="text-muted text-xs">
          Rules start and stop it (“Start a timer”, “Stop a timer”) and react to “The time is up”.
        </p>
        <CommandLines
          testId="timer-commands"
          lines={[
            `/function ${gamesFunction(element.id, 'timer', 'start')}`,
            `/function ${gamesFunction(element.id, 'timer', 'stop')}`,
          ]}
        />
      </Section>
    </GamesStudioShell>
  );
}
