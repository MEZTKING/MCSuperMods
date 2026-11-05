# @msm/ai

The AI helper's logic without Electron ([ADR 0041](../../docs/adr/0041-ai-helper.md)): the protocol shared by main, preload and renderer, the tool catalogue, the agent loop over a `ModelClient` seam, run limits and cost, the system prompt, the model table and a scripted client for tests.

## Entry points

| Entry | Who imports it | Runtime dependencies |
|---|---|---|
| `@msm/ai` | main, renderer, tests | `zod` only; SDK types are `import type` and erased |
| `@msm/ai/sdk` | main only, through a dynamic `import()` | `@anthropic-ai/sdk` |

The split keeps the Claude SDK out of the renderer and the preload (Biome forbids `@anthropic-ai/sdk` and `@msm/ai/sdk` there) and lets electron-vite emit the SDK as a lazy main chunk. `src/sdk/index.ts` is the only file with a runtime import of the SDK.

`createAnthropicModelClient({ apiKey })` pins the base URL to `https://api.anthropic.com` and passes `authToken: null`, so no `ANTHROPIC_*` environment variable or credential profile replaces the user's key or host. SDK errors become `ModelClientError` (with the SDK class name in `errorClass`) or `ModelOutputError` (unreadable streamed tool input).

## The loop

`runAssistant({ client, conversation, request, settings, limits, host, signal })` drives one run: it streams requests, forwards text and thinking-summary deltas, validates every tool input with zod, sends valid tool calls to `host.executeTool` (emitting `tool_request` first), appends all results of a turn as one user message and stops on `end_turn`, `refusal`, `max_tokens`, a limit, cancellation or an error. History is committed in whole turns, so a cancelled run never leaves a `tool_use` without its result.

## Writing a model script

`ScriptedModelClient` replays an `AiModelScript` (validated by `aiModelScriptSchema`), one turn per request:

```json
{
  "turns": [
    {
      "content": [
        { "type": "thinking", "thinking": "I should look at the project first." },
        { "type": "tool_use", "name": "project_summary", "input": {} }
      ]
    },
    {
      "content": [{ "type": "text", "text": "Your project has no elements yet." }],
      "usage": { "inputTokens": 1200, "outputTokens": 40 }
    }
  ]
}
```

- Block types: `text`, `thinking`, `tool_use` (ids are assigned as `toolu_1`, `toolu_2`, ... across the script) and `fallback` (`from`, `to`; a refusal-fallback notice).
- `stopReason` defaults to `tool_use` when the turn has a `tool_use` block, otherwise `end_turn`; `max_tokens` and `refusal` are available.
- `usage` defaults to 100 input and 50 output tokens.
- Every request is recorded in `client.requests`; a request past the last turn throws.

The e2e hook `MSM_E2E_AI_SCRIPT=<file>` makes main use this client with the script in that file.
