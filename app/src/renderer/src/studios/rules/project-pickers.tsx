/**
 * Pickers for blanks that name one of the project's own things without a picture (B424a): the
 * HUD element a "Show on screen" step shows (with "Make a new on-screen number" for "Show a
 * number on screen", made inline as one undo step with the rule), and the weapon of the rule's
 * vehicle whose ammunition a reading reads (absent means the vehicle's first weapon). Key binds
 * and vehicles go through the ThingPicker with the project's elements only.
 *
 * @packageDocumentation
 */

import type { Json, Project } from '@msm/core';
import { HUD_KIND } from '@msm/plugin-rules';
import { useId } from 'react';
import { thingName, thingWords } from '../../components/thing-picker/thing-sources';
import { inputClass } from '../../forms';
import { newNumberHud } from './book-changes';
import { useBookEdit, useRulesEnv } from './env';
import { MenuList } from './parts';
import { asArray, asObject, getAt, type RuleBookData, setAt } from './rules-model';

/** The step that offers "Make a new on-screen number". */
export const NEW_NUMBER_STEP = 'set_hud';

/** The undo label of "Make a new on-screen number". */
export const NEW_NUMBER_LABEL = 'Make a new on-screen number';

/** The key of the "Make a new on-screen number" choice in the HUD menu. */
const NEW_NUMBER_KEY = '\u0000new';

/** The project's HUD elements as `{ id, name }`, by name then id. */
export function projectHuds(project: Project): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind === HUD_KIND) {
        out.push({ id: element.id, name: thingName(project, element.id, 'hud') });
      }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

/** The namespace of an id (`demo` of `demo:rules`); `minecraft` without one. */
const namespaceOf = (id: string): string =>
  id.includes(':') ? id.slice(0, id.indexOf(':')) : 'minecraft';

/**
 * `book` with a new on-screen number picked at `pointer`, and the element to make with it (in
 * the book's namespace, with a free id).
 */
export function withNewNumberHud(
  project: Project,
  bookId: string,
  book: RuleBookData,
  pointer: string,
): { next: RuleBookData; hud: { id: string; kind: string; data: Json } } {
  const hud = newNumberHud(project, namespaceOf(bookId));
  return { next: setAt(book, pointer, hud.id), hud };
}

/** The menu of a `hud` blank: the project's HUD elements, and the inline new number. */
export function HudMenu(props: { pointer: string; stepId: string; label: string }) {
  const env = useRulesEnv();
  const { book, change, changeWith } = useBookEdit();
  const value = getAt(book, props.pointer);
  const huds = projectHuds(env.project);
  const offerNew = props.stepId === NEW_NUMBER_STEP && changeWith !== undefined;
  return (
    <>
      {huds.length === 0 && (
        <p className="text-xs text-muted" data-testid="rules-hud-none">
          {offerNew
            ? 'Nothing to show on screen yet. Make a new on-screen number here, or a bar or text in a HUD element.'
            : 'Nothing to show on screen yet. Make a HUD element first.'}
        </p>
      )}
      <MenuList
        label={props.label}
        choices={[
          ...huds.map((hud) => ({
            key: hud.id,
            label: hud.name,
            chosen: hud.id === value,
            testId: `rules-hud-${hud.id}`,
          })),
          ...(offerNew
            ? [{ key: NEW_NUMBER_KEY, label: NEW_NUMBER_LABEL, testId: 'rules-hud-new-number' }]
            : []),
        ]}
        onPick={(key) => {
          if (key !== NEW_NUMBER_KEY) {
            change(setAt(book, props.pointer, key));
            return;
          }
          const made = withNewNumberHud(env.project, env.bookId, book, props.pointer);
          changeWith?.(made.next, [made.hud], NEW_NUMBER_LABEL);
        }}
      />
    </>
  );
}

/** The data of project element `id`, if the project has it. */
function elementData(project: Project, id: string): Json | undefined {
  for (const namespace of project.namespaces) {
    const element = namespace.elements.find((entry) => entry.id === id);
    if (element !== undefined) return element.data;
  }
  return undefined;
}

/** The weapon ids of vehicle `vehicleId`, in the vehicle's order (the first one is the default). */
export function vehicleWeapons(project: Project, vehicleId: string | undefined): string[] {
  if (vehicleId === undefined) return [];
  const weapons = asArray(asObject(elementData(project, vehicleId))?.weapons);
  return weapons.flatMap((weapon) => {
    const id = asObject(weapon)?.id;
    return typeof id === 'string' && id.length > 0 ? [id] : [];
  });
}

/** The subject of the rule that holds `pointer` (`/rules/<n>/...`), when it names one. */
export function ruleSubjectAt(book: RuleBookData, pointer: string): string | undefined {
  const match = /^\/rules\/(\d+)(?:\/|$)/.exec(pointer);
  if (match === null) return undefined;
  const subject = getAt(book, `/rules/${match[1]}/when/subject`);
  return typeof subject === 'string' ? subject : undefined;
}

/** The words of a weapon id ("Main cannon" for `main_cannon`). */
export const weaponWords = (id: string): string => thingWords(id);

/**
 * The weapon of the rule's vehicle at `pointer` (a reading's `weapon`): the vehicle's weapons by
 * id, absent meaning its first weapon. A weapon the vehicle no longer has stays listed, marked.
 */
export function WeaponSelect(props: { pointer: string; label?: string }) {
  const env = useRulesEnv();
  const { book, change } = useBookEdit();
  const id = useId();
  const raw = getAt(book, props.pointer);
  const value = typeof raw === 'string' ? raw : '';
  const weapons = vehicleWeapons(env.project, ruleSubjectAt(book, props.pointer));
  const first = weapons[0];
  return (
    <span className="flex items-center gap-1.5">
      <label htmlFor={id}>{props.label ?? 'Weapon'}</label>
      <select
        id={id}
        className={inputClass}
        data-testid="rules-weapon"
        value={value}
        onChange={(event) =>
          change(
            setAt(book, props.pointer, event.target.value === '' ? undefined : event.target.value),
          )
        }
      >
        <option value="">
          {first === undefined ? 'The first weapon' : `The first weapon (${weaponWords(first)})`}
        </option>
        {weapons.map((weapon) => (
          <option key={weapon} value={weapon}>
            {weaponWords(weapon)}
          </option>
        ))}
        {value !== '' && !weapons.includes(value) && (
          <option value={value}>{`${value} (not on this vehicle)`}</option>
        )}
      </select>
    </span>
  );
}
