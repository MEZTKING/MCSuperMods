/**
 * A damage type's death lines and a chat type's sample line (B611; ADR 0120 D6): the lines the
 * game would show for sample people, built as the game builds them (B600 2S10) and drawn by MSM
 * in the data's style. The words come from the project's language files over vanilla's; a key no
 * language file names shows as the key, as it does in the game. A damage type's hurt sound has
 * Play (ADR 0121 D2 follow-up): the event of its `effects` through the shared Play button, so
 * Minecraft's sound is read in place from the user's own asset store and a project that
 * redefines the event plays its own file.
 */

import type { Json } from '@msm/plugin-api';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import type { ReadProjectSound } from '../../../audio/provider';
import { SoundPlayButton } from '../../../audio/SoundPlayButton';
import type { VanillaSoundReader } from '../../../audio/vanilla-sounds';
import { LiveViewFrame } from '../../frame/LiveViewFrame';
import type { LiveViewProps } from '../../registry';
import { useLang, useSettled } from './lang';
import {
  type ChatSample,
  chatLineComponent,
  DAMAGE_EFFECT_SOUNDS,
  deathLines,
  deathMessageType,
  decorationOf,
  messageIdOf,
  SAMPLE,
} from './sample-lines';
import { TextLine } from './TextLine';
import { type LangLookup, textRuns } from './text-component';

const isRecord = (value: Json | undefined): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const SCALING_WORDS: Readonly<Record<string, string>> = {
  never: 'The same on every difficulty',
  always: 'Stronger on harder difficulties',
  when_caused_by_living_non_player: 'Stronger on harder difficulties when a mob causes it',
};

const EFFECT_WORDS: Readonly<Record<string, string>> = {
  hurt: 'the usual hurt sound',
  thorns: 'the thorns sound',
  drowning: 'the drowning sound',
  burning: 'the burning sound',
  poking: 'the poking sound',
  freezing: 'the freezing sound',
};

/** A line in the chat box's look: dark, the game's chat text colours. */
function ChatBox({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="rounded-sm bg-[#000000b0] px-2 py-1 font-mono text-sm text-white [overflow-wrap:anywhere]"
    >
      {children}
    </div>
  );
}

/** Whether the language has the key (the game shows the key itself when it does not). */
const missingKeys = (keys: readonly string[], lang: LangLookup): string[] =>
  keys.filter((key) => lang(key) === undefined);

/** Where the hurt sound's Play reads from: the view's own readers, else the shell's. */
interface HurtSoundSources {
  project: LiveViewProps['project'];
  sounds: VanillaSoundReader | null | undefined;
  readProjectAsset: ReadProjectSound | undefined;
}

function DeathLinesView({
  data,
  lang,
  sources,
}: {
  data: Json;
  lang: LangLookup;
  sources: HurtSoundSources;
}) {
  const lines = deathLines(data);
  const kind = deathMessageType(data);
  const missing = missingKeys([...new Set(lines.map((line) => line.key))], lang);
  const record = isRecord(data) ? data : {};
  const scaling = typeof record.scaling === 'string' ? record.scaling : null;
  const effects = typeof record.effects === 'string' ? record.effects : 'hurt';
  const exhaustion = typeof record.exhaustion === 'number' ? record.exhaustion : null;
  if (messageIdOf(data) === null) {
    return (
      <p data-testid="sample-line-empty" className="text-sm text-muted">
        Give it a message id to see the lines it shows when someone dies of it.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Death lines" className="flex flex-col gap-2">
        {lines.map((line) => (
          <li
            key={line.form}
            data-testid="sample-line-death"
            data-form={line.form}
            data-key={line.key}
            className="flex flex-col gap-1"
          >
            <span className="text-xs text-muted">{line.label}</span>
            <ChatBox>
              <TextLine runs={textRuns(line.component, { lang })} />
            </ChatBox>
          </li>
        ))}
      </ul>
      {missing.length > 0 && (
        <p data-testid="sample-line-missing-words" className="text-xs text-warning">
          {`No language file has words for ${missing.join(', ')} yet, so the game shows the key itself. Add the words in a language file (en_us).`}
        </p>
      )}
      <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted">When hurt</dt>
        <dd data-testid="sample-line-effects" className="flex flex-wrap items-center gap-2">
          {DAMAGE_EFFECT_SOUNDS[effects] !== undefined && (
            <SoundPlayButton
              event={DAMAGE_EFFECT_SOUNDS[effects]}
              compact
              project={sources.project}
              {...(sources.sounds === undefined ? {} : { sounds: sources.sounds })}
              {...(sources.readProjectAsset === undefined
                ? {}
                : { readProjectAsset: sources.readProjectAsset })}
              testId="sample-line-hurt-play"
            />
          )}
          <span>{`Plays ${EFFECT_WORDS[effects] ?? effects}`}</span>
        </dd>
        {scaling !== null && (
          <>
            <dt className="text-muted">Difficulty</dt>
            <dd>{SCALING_WORDS[scaling] ?? scaling}</dd>
          </>
        )}
        {exhaustion !== null && (
          <>
            <dt className="text-muted">Hunger</dt>
            <dd>{exhaustion === 0 ? 'Uses no hunger' : `Uses ${exhaustion} hunger exhaustion`}</dd>
          </>
        )}
        {kind === 'fall_variants' && (
          <>
            <dt className="text-muted">Falls</dt>
            <dd>
              After a fall the game picks a fall line instead; these are the lines without one.
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

function ChatLineView({
  data,
  lang,
  sample,
}: {
  data: Json;
  lang: LangLookup;
  sample: ChatSample;
}) {
  const record = isRecord(data) ? data : {};
  const chat = decorationOf(record.chat);
  const narration = decorationOf(record.narration);
  const missing = missingKeys(
    [chat?.key, narration?.key].filter((key): key is string => key !== undefined),
    lang,
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">In the chat box</span>
        <ChatBox testId="sample-line-chat">
          {chat === null ? (
            <span className="text-muted">No chat line: it needs a translation key.</span>
          ) : (
            <TextLine runs={textRuns(chatLineComponent(chat, sample), { lang })} />
          )}
        </ChatBox>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted">Read out by the narrator</span>
        <p data-testid="sample-line-narration" className="text-sm [overflow-wrap:anywhere]">
          {narration === null
            ? 'No narration line: it needs a translation key.'
            : textRuns(chatLineComponent({ ...narration, style: null }, sample), { lang })
                .map((run) => run.text)
                .join('')}
        </p>
      </div>
      {missing.length > 0 && (
        <p data-testid="sample-line-missing-words" className="text-xs text-warning">
          {`No language file has words for ${missing.join(', ')} yet, so the game shows the key itself. Add the words in a language file (en_us).`}
        </p>
      )}
    </div>
  );
}

/** The view of `minecraft:damage_type` and `minecraft:chat_type`. */
export default function SampleLine(props: LiveViewProps) {
  const { project, element, preferences, onPreferences, vanillaAssets, readProject } = props;
  const readProjectAsset = useMemo<ReadProjectSound | undefined>(
    () =>
      readProject === undefined
        ? undefined
        : (namespace: string, path: string) => readProject(`assets/${namespace}/${path}`),
    [readProject],
  );
  const settled = useSettled(useMemo(() => ({ project, element }), [project, element]));
  const { lookup } = useLang(settled.project, vanillaAssets);
  const [text, setText] = useState(preferences.sampleText);
  useEffect(() => setText(preferences.sampleText), [preferences.sampleText]);
  const isChat = element.kind === 'minecraft:chat_type';
  const data = settled.element.data as Json;
  const sample: ChatSample = {
    sender: SAMPLE.victim,
    target: SAMPLE.target,
    content: text.trim() === '' ? SAMPLE.content : text,
  };
  const notes = isChat
    ? [
        'The names and the message are samples.',
        'Drawn by MSM in the chat type’s style; the game’s font and spacing differ a little.',
      ]
    : [
        `The names are samples: ${SAMPLE.victim} dies, a zombie or ${SAMPLE.playerKiller} holding a sword named “${SAMPLE.itemName}” kills.`,
        'In the game the player’s name can be clicked to send them a message.',
        'The hurt sound is the one a player makes; a mob hurt by it makes its own.',
      ];
  return (
    <LiveViewFrame
      title={isChat ? 'Chat line' : 'Death lines'}
      fidelity="about_right"
      notes={notes}
      controls={
        isChat ? (
          <label className="flex flex-wrap items-center gap-2 text-sm">
            Type some text
            <input
              data-testid="sample-line-text"
              className="min-w-0 flex-1 rounded border border-border bg-bg px-1"
              value={text}
              placeholder={SAMPLE.content}
              onChange={(event) => {
                setText(event.target.value);
                onPreferences({ sampleText: event.target.value });
              }}
            />
          </label>
        ) : undefined
      }
    >
      {isChat ? (
        <ChatLineView data={data} lang={lookup} sample={sample} />
      ) : (
        <DeathLinesView
          data={data}
          lang={lookup}
          sources={{ project: settled.project, sounds: props.sounds, readProjectAsset }}
        />
      )}
    </LiveViewFrame>
  );
}
