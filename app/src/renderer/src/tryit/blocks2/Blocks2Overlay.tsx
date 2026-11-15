/**
 * What vanilla parity 2 adds over Try it's picture (B463): the sign editor and the sign text
 * plaque, the bag screen and the chat box; and beside it, the side panel's "Time and commands"
 * part (the weathering time-lapse, the chat box button and the project's commands). The view
 * registers both; everything here reads and changes the simulation's `parity2` part
 * (`@msm/sim` `blocks/types2/area.ts`).
 *
 * Part of the lazy Try it chunk.
 */

import { type BlockPos, signSideFor } from '@msm/sim';
import { Clock, MessageSquare } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import type { TryItArea } from '../session-source';
import { BagScreen } from './BagScreen';
import { ChatBox } from './ChatBox';
import { SignEditor } from './SignEditor';
import { SignPlaque } from './SignPlaque';

/** The chat box's state in the view: closed, or open with a first line. */
export type ChatState = { readonly start: string } | null;

/** Props of {@link Blocks2Overlay}. */
export interface Blocks2OverlayProps {
  readonly area: TryItArea;
  /** The block the crosshair is on, when it is on a block. */
  readonly pointed: BlockPos | null;
  /** The hotbar slot chosen (a bag's own slot is locked while it is open). */
  readonly heldSlot: number;
  readonly chat: ChatState;
  onCloseChat(): void;
  /** Something changed that the view shows. */
  onChanged(): void;
  /** Gives the keys back to the picture. */
  onFocusBack(): void;
}

/** The layer over the picture; see the module comment. */
export function Blocks2Overlay(props: Blocks2OverlayProps) {
  const { area, pointed } = props;
  const parity2 = area.source.parity2;
  const editing = parity2.signEditing;
  const bag = parity2.bag;
  const done = (): void => {
    props.onChanged();
    props.onFocusBack();
  };
  const pointedState = pointed === null ? null : area.source.world.get(pointed);
  const pointedBlock =
    pointedState === null ? undefined : area.source.catalogue.blockFor(pointedState.name);
  const showPlaque =
    editing === null &&
    pointed !== null &&
    pointedState !== null &&
    (pointedBlock?.type === 'sign' || pointedBlock?.type === 'hanging_sign');
  return (
    <>
      {showPlaque && pointedState !== null && pointed !== null && (
        <SignPlaque
          name={pointedBlock?.displayName ?? pointedState.name}
          text={parity2.signText(pointed)}
          side={signSideFor(pointedState, area.source.player.yaw)}
        />
      )}
      {editing !== null && (
        <SignEditor
          key={`${editing.pos.x},${editing.pos.y},${editing.pos.z},${editing.side}`}
          editing={editing}
          text={parity2.signText(editing.pos)}
          onDone={(write) => {
            parity2.writeSign({ lines: write.lines, colour: write.colour, glowing: write.glowing });
            if (write.wax) parity2.waxSign(editing.pos);
            done();
          }}
          onClose={() => {
            parity2.closeSignEditor();
            done();
          }}
        />
      )}
      {bag !== null && (
        <BagScreen
          bag={bag}
          heldSlot={props.heldSlot}
          onClose={() => {
            parity2.closeBag();
            done();
          }}
        />
      )}
      {props.chat !== null && (
        <ChatBox
          start={props.chat.start}
          history={parity2.commands.lines}
          commands={parity2.commands.commands}
          onRun={(line) => {
            area.source.chat(line);
            props.onChanged();
          }}
          onClose={() => {
            props.onCloseChat();
            props.onFocusBack();
          }}
        />
      )}
    </>
  );
}

/** Props of {@link Blocks2Panel}. */
export interface Blocks2PanelProps {
  readonly area: TryItArea;
  onOpenChat(): void;
  onChanged(): void;
}

/** The side panel's "Time and commands"; see the module comment. */
export function Blocks2Panel({ area, onOpenChat, onChanged }: Blocks2PanelProps) {
  const parity2 = area.source.parity2;
  const commands = parity2.commands.commands;
  const ageing = parity2.weathering.count;
  return (
    <section
      aria-label="Time and commands"
      data-testid="tryit-parity2"
      className="flex flex-col gap-1"
    >
      <h3 className="text-xs font-semibold text-muted">Time and commands</h3>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          data-testid="tryit-timelapse"
          title="Let one in-game day of ageing go by at once"
          onClick={() => {
            area.source.timeLapse();
            onChanged();
          }}
        >
          <Clock size={14} aria-hidden />
          Time-lapse a day
        </Button>
        <Button type="button" data-testid="tryit-chat-open" onClick={onOpenChat}>
          <MessageSquare size={14} aria-hidden />
          Chat
        </Button>
      </div>
      <p className="text-xs text-muted" data-testid="tryit-ageing" data-count={ageing}>
        {ageing === 0
          ? 'Blocks that age (copper-like) change in the time-lapse.'
          : `${ageing} block${ageing === 1 ? '' : 's'} here can age.`}
      </p>
      {commands.length > 0 && (
        <ul data-testid="tryit-commands" className="text-xs text-muted">
          {commands.map((command) => (
            <li key={command.id} className="font-mono">
              /{command.name}
              {command.arguments.map((one) =>
                one.optional ? ` [<${one.name}>]` : ` <${one.name}>`,
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
