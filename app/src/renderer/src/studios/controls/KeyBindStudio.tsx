/**
 * The Key bind Studio (B420, ADR 0091 D1, ADR 0088 D3, D8) for `msm:key_bind` element data: the
 * key's name and its Controls group (keys sharing a group share its name), the default key by
 * "Press a key" (the browser's key code through the target's code table, `key-codes.ts`) or
 * "No key", when it works (on foot, in a vehicle, driving, with the vehicle picker), the cooldown
 * and hold interval, and the press, hold and release triggers over the shared events editor.
 * Clashes with vanilla controls, the runtime's vehicle keys and other key binds are the
 * validators' warnings at `/default_key`, shown live under the key.
 *
 * Very easy (ADR 0083 D3) shows the name, the key and when it works. The Rules section (ADR
 * 0082) appears once the rules catalogue has a trigger for key binds (B424 adds them; none yet).
 * Loaded lazily by `./studios.tsx`.
 *
 * @packageDocumentation
 */

import type { Json } from '@msm/core';
import { lazy, Suspense, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { typingKey } from '../../forms/context';
import { asObject, eventNames, pathSetter } from '../blocks-items/blocks-items-model';
import { EventsEditor } from '../blocks-items/EventsEditor';
import { EventSelect, ProblemsAt, TextField } from '../blocks-items/parts';
import { projectPortals } from '../blocks-items/portal-model';
import { RulesSlot } from '../RulesSlot';
import { firstTriggerFor } from '../rules/turn-into-rules';
import { projectHandlers } from '../scripting/script-model';
import { NumberField } from '../structures/pickers';
import type { StudioProps } from '../types';
import { AdvancedToggle, Section } from '../worldgen/parts';
import {
  isVehicleCondition,
  KEY_WHEN_CHOICES,
  KEY_WHEN_LABELS,
  keyGroups,
  projectHudIds,
  projectVehicles,
  ticksWords,
  withCategory,
  withWhen,
} from './controls-model';
import { keyNameForCode, keyNameForMouseButton, keyWords } from './key-codes';
import { VehiclePicker, WordsSelect } from './parts';

/** The Rules section (ADR 0082 D7 (b)), a chunk of its own. */
const RulesSection = lazy(() => import('../rules/RulesSection'));

/** The "Press a key" capture: the next key or mouse button pressed on it becomes the key. */
export function KeyCapture(props: {
  facts: Parameters<typeof keyNameForCode>[0] | undefined;
  onKey(name: string): void;
}) {
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { facts } = props;
  if (facts === undefined) {
    return (
      <p className="text-muted text-xs" data-testid="key-bind-no-facts">
        This game version has no key table, so type the key name under “Advanced (all fields)”.
      </p>
    );
  }
  const take = (name: string | null, what: string) => {
    if (name === null) {
      setMessage(`Minecraft cannot use ${what} as a key. Press another one.`);
      return;
    }
    setMessage(null);
    setListening(false);
    props.onKey(name);
  };
  if (!listening) {
    return (
      <div className="flex flex-col gap-1">
        <Button
          className="self-start text-xs"
          data-testid="key-bind-press"
          onClick={() => {
            setMessage(null);
            setListening(true);
          }}
        >
          Press a key
        </Button>
        {message !== null && (
          <p className="text-warning text-xs" data-testid="key-bind-capture-message">
            {message}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        // biome-ignore lint/a11y/noAutofocus: the capture takes the very next key press.
        autoFocus
        data-testid="key-bind-capture"
        aria-label="Press the key you want, or click a mouse button here. Esc stops."
        className="self-start rounded border border-accent border-dashed px-3 py-2 text-sm"
        onKeyDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (event.code === 'Escape') {
            setListening(false);
            setMessage(null);
            return;
          }
          take(keyNameForCode(facts, event.code), event.key === ' ' ? 'Space' : `“${event.key}”`);
        }}
        onMouseDown={(event) => {
          event.preventDefault();
          take(keyNameForMouseButton(facts, event.button), 'that mouse button');
        }}
        onContextMenu={(event) => event.preventDefault()}
        onBlur={() => setListening(false)}
      >
        Press the key you want, or click a mouse button here… (Esc stops)
      </button>
      {message !== null && (
        <p className="text-warning text-xs" data-testid="key-bind-capture-message">
          {message}
        </p>
      )}
    </div>
  );
}

/** The Key bind Studio. */
export default function KeyBindStudio(props: StudioProps) {
  const { project, element, problems, suggest, onChange, target } = props;
  const [advanced, setAdvanced] = useState(false);

  if (advanced) {
    return (
      <section
        aria-label="Key bind Studio"
        data-testid="key-bind-studio"
        className="flex flex-col gap-3"
      >
        <AdvancedToggle
          checked={advanced}
          onChange={setAdvanced}
          testId="key-bind-advanced-toggle"
        />
        {props.form}
      </section>
    );
  }

  const data: Json = element.data;
  const object = asObject(data);
  const set = pathSetter(data, onChange);
  const namespace = element.id.slice(0, element.id.indexOf(':'));
  const groups = keyGroups(project, namespace);
  const ownGroup = groups.find((group) => group.ids.includes(element.id));
  const otherNames = (ownGroup?.names ?? []).filter((name) => name !== object.category_name);
  const vehicles = projectVehicles(project);
  const controls = target.controls;
  const key = typeof object.default_key === 'string' ? object.default_key : undefined;
  const unbound = key === undefined || key === (controls?.unboundKey ?? 'key.keyboard.unknown');
  const events = eventNames(data);
  const cooldown = typeof object.cooldown_ticks === 'number' ? object.cooldown_ticks : undefined;
  const hold =
    typeof object.hold_interval_ticks === 'number' ? object.hold_interval_ticks : undefined;

  return (
    <section
      aria-label="Key bind Studio"
      data-testid="key-bind-studio"
      className="flex flex-col gap-4"
    >
      <AdvancedToggle checked={advanced} onChange={setAdvanced} testId="key-bind-advanced-toggle" />
      <ProblemsAt problems={problems} pointer="" />
      <Section title="Name and group" testId="key-bind-name">
        <p className="text-muted text-xs">
          Players see the name and the group in Minecraft’s Controls screen, where they can change
          the key.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <TextField
            label="Name"
            value={object.display_name}
            testId="key-bind-display-name"
            onCommit={(value) => set(['display_name'], value, typingKey('/display_name'))}
          />
          <div className="flex flex-col">
            <TextField
              label="Group (an id such as abilities)"
              value={object.category}
              placeholder="keys"
              testId="key-bind-category"
              onCommit={(value) =>
                onChange('', withCategory(data, value, groups, element.id), {
                  coalesce: typingKey('/category'),
                })
              }
            />
          </div>
          <TextField
            label="Group name"
            value={object.category_name}
            testId="key-bind-category-name"
            onCommit={(value) => set(['category_name'], value, typingKey('/category_name'))}
          />
        </div>
        {groups.length > 1 && (
          <p className="text-muted text-xs" data-testid="key-bind-groups">
            Groups in this project: {groups.map((group) => group.category).join(', ')}.
          </p>
        )}
        {otherNames.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-2 text-xs"
            data-testid="key-bind-group-note"
          >
            <span className="text-warning">
              Other keys in this group call it “{otherNames[0]}”. Keys in one group share one name.
            </span>
            <Button
              className="text-xs"
              data-testid="key-bind-use-group-name"
              onClick={() => set(['category_name'], otherNames[0])}
            >
              Use “{otherNames[0]}”
            </Button>
          </div>
        )}
        {(['display_name', 'category', 'category_name', 'name'] as const).map((field) => (
          <ProblemsAt key={field} problems={problems} pointer={`/${field}`} />
        ))}
      </Section>
      <Section title="Default key" testId="key-bind-key">
        <p className="text-sm" data-testid="key-bind-key-words">
          {unbound ? 'No key: players pick one in Controls.' : (keyWords(key) ?? key)}
        </p>
        <div className="flex flex-wrap items-start gap-2">
          <KeyCapture facts={controls} onKey={(name) => set(['default_key'], name)} />
          <Button
            className="text-xs"
            data-testid="key-bind-no-key"
            disabled={unbound && key !== undefined}
            onClick={() => set(['default_key'], controls?.unboundKey ?? 'key.keyboard.unknown')}
          >
            No key
          </Button>
        </div>
        <div data-testid="key-bind-key-problems">
          <ProblemsAt problems={problems} pointer="/default_key" />
        </div>
      </Section>
      <Section title="When it works" testId="key-bind-when">
        <div className="flex flex-wrap items-end gap-2">
          <WordsSelect
            label="Works"
            value={object.when ?? 'always'}
            choices={KEY_WHEN_CHOICES}
            labels={KEY_WHEN_LABELS}
            testId="key-bind-when-select"
            onChange={(value) => onChange('', withWhen(data, value))}
          />
          {isVehicleCondition(object.when) && (
            <VehiclePicker
              value={object.vehicle}
              vehicles={vehicles}
              testId="key-bind-vehicle"
              onChange={(value) => set(['vehicle'], value)}
            />
          )}
        </div>
        {isVehicleCondition(object.when) && vehicles.length === 0 && (
          <p className="text-muted text-xs" data-testid="key-bind-no-vehicles">
            This project has no vehicles yet, so it works in any vehicle.
          </p>
        )}
        {(['when', 'vehicle'] as const).map((field) => (
          <ProblemsAt key={field} problems={problems} pointer={`/${field}`} />
        ))}
      </Section>
      <Section title="Timing" testId="key-bind-timing">
        <div className="flex flex-wrap items-end gap-2">
          <NumberField
            label="Wait between presses (ticks)"
            value={object.cooldown_ticks}
            integer
            allowEmpty
            testId="key-bind-cooldown"
            onCommit={(value) => set(['cooldown_ticks'], value, typingKey('/cooldown_ticks'))}
          />
          <span className="pb-1 text-muted text-xs" data-testid="key-bind-cooldown-words">
            {ticksWords(cooldown)}
          </span>
          <NumberField
            label="While held, every (ticks)"
            value={object.hold_interval_ticks}
            integer
            allowEmpty
            testId="key-bind-hold-interval"
            onCommit={(value) =>
              set(['hold_interval_ticks'], value, typingKey('/hold_interval_ticks'))
            }
          />
          <span className="pb-1 text-muted text-xs" data-testid="key-bind-hold-words">
            {ticksWords(hold ?? 10)}
          </span>
        </div>
        <p className="text-muted text-xs">20 ticks are one second.</p>
        {(['cooldown_ticks', 'hold_interval_ticks'] as const).map((field) => (
          <ProblemsAt key={field} problems={problems} pointer={`/${field}`} />
        ))}
      </Section>
      {firstTriggerFor(element.kind, data) !== undefined && (
        <RulesSlot>
          <Suspense
            fallback={
              <p className="text-muted text-xs" data-testid="rules-section-loading">
                Loading the Rules section…
              </p>
            }
          >
            <RulesSection
              project={project}
              element={element}
              target={target}
              context={props.context}
            />
          </Suspense>
        </RulesSlot>
      )}
      <EventsEditor
        element={element}
        project={project}
        target={target}
        problems={problems}
        suggest={suggest}
        onChange={onChange}
        handlers={projectHandlers(project)}
        portals={projectPortals(project)}
        huds={projectHudIds(project)}
        triggers={
          <div className="flex flex-col gap-2" data-testid="key-bind-triggers">
            <div className="flex flex-wrap items-end gap-2">
              {(
                [
                  ['msm:on_press', 'When pressed', 'key-bind-on-press'],
                  ['msm:while_held', 'While held', 'key-bind-while-held'],
                  ['msm:on_release', 'When let go', 'key-bind-on-release'],
                ] as const
              ).map(([field, label, testId]) => (
                <EventSelect
                  key={field}
                  label={label}
                  value={object[field]}
                  events={events}
                  testId={testId}
                  onChange={(value) => set([field], value)}
                />
              ))}
            </div>
            {(['msm:on_press', 'msm:while_held', 'msm:on_release'] as const).map((field) => (
              <ProblemsAt key={field} problems={problems} pointer={`/${field}`} />
            ))}
          </div>
        }
      />
    </section>
  );
}
