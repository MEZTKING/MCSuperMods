import { Button } from '../ui/Button';

/** What the helper sends to Anthropic (ADR 0041 D1, D7); shown in Settings and without a key. */
export const AI_PRIVACY_TEXT =
  'When you send a message, MCSuperMods sends your message, the conversation so far and the project content the helper reads (element JSON, ids, problems, template and version data, script typings) to Anthropic under your API key. Textures, other files and file paths are never sent. Nothing is sent until you send a message.';

/** The panel's first screen without an API key: the privacy notice and "Open Settings". */
export function AiKeyMissing(props: { onOpenSettings(): void }) {
  return (
    <div className="flex flex-col gap-2 p-3 text-sm" data-testid="ai-key-missing">
      <p className="font-medium">Add your Anthropic API key to use the AI helper.</p>
      <p className="text-muted">
        The helper answers questions about your project and proposes changes you review before
        anything is applied. It uses your own API key, so usage is billed to your Anthropic account.
        Add the key under Settings, AI helper.
      </p>
      <p className="text-xs text-muted" data-testid="ai-privacy">
        {AI_PRIVACY_TEXT}
      </p>
      <div>
        <Button data-testid="ai-open-settings" onClick={props.onOpenSettings}>
          Open Settings
        </Button>
      </div>
    </div>
  );
}
