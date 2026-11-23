/**
 * Lowering of `msm:team` (ADR 0113 D4): one load function, `<ns>:msm_games/team/<path>/load`,
 * that makes the team `<ns>.<path>` if it is missing (`team add` fails harmlessly when it
 * exists, B547 Y10) and sets every option on every load. MSM never removes a team (limit M7).
 */
import type { Element, OutputFile, TargetFacts } from '@msm/plugin-api';
import {
  bool,
  fillForm,
  isRecord,
  type SharedContribution,
  sharedFunctionFiles,
  splitId,
  str,
  teamName,
  textComponent,
} from './shared-functions';

/** The commands that make and set up a team. */
export function teamLoadLines(element: Element, target: TargetFacts): string[] {
  const data = isRecord(element.data) ? element.data : {};
  const team = teamName(element.id);
  const name = textComponent(str(data.name, team));
  return [
    fillForm(target, 'team_add', { team, display_name: name }),
    fillForm(target, 'team_display_name', { team, text: name }),
    fillForm(target, 'team_colour', { team, colour: str(data.colour, 'white') }),
    fillForm(target, 'team_friendly_fire', { team, boolean: bool(data.friendly_fire, true) }),
    fillForm(target, 'team_see_invisible_friends', {
      team,
      boolean: bool(data.see_invisible_friends, true),
    }),
    fillForm(target, 'team_name_tags', { team, name_tags: str(data.name_tags, 'always') }),
    fillForm(target, 'team_collision', { team, collision: str(data.collision, 'always') }),
    fillForm(target, 'team_prefix', { team, text: textComponent(str(data.prefix, '')) }),
    fillForm(target, 'team_suffix', { team, text: textComponent(str(data.suffix, '')) }),
  ];
}

/** Lowers a team to its load function and the tag entries that run it. */
export function lowerTeam(element: Element, target: TargetFacts): OutputFile[] {
  const { namespace, path } = splitId(element.id);
  const contributions: SharedContribution[] = [
    { phase: 'load', path: `team/${path}/load`, lines: teamLoadLines(element, target) },
  ];
  return sharedFunctionFiles(target, namespace, contributions);
}
