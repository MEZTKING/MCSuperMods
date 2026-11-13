# The AI helper

The **AI helper** is an optional assistant built into MCSuperMods. Ask it about your project, a problem or an element, or describe something you want ("a ruby tools mod with ore, ingot, tools and a storage block") and let it build it. It never changes your project by itself: it **proposes** changes, you review them, and only **Apply** puts them in, as one step that a single Undo takes back.

The helper runs on Anthropic's Claude models with your own API key. MCSuperMods works exactly as before without a key; the helper is simply unavailable.

## Get an API key

1. Sign in to the Claude Console at <https://platform.claude.com> (the same account system as Anthropic's API) and add a payment method or credits.
2. Create an API key. It starts with `sk-ant-`. Copy it; the Console shows it only once.

Everything the helper does is billed to that Anthropic account at Anthropic's API prices (see [Limits, usage and cost](#limits-usage-and-cost)). MCSuperMods adds no charge of its own.

## Settings: AI helper

Open **Settings** (the gear icon on the toolbar) and scroll to **AI helper**.

- The key status reads **No key** or **Key set (…abcd)** with the last four characters of the stored key.
- **Anthropic API key**: paste the key, then **Save key**. The field empties after saving; the key is stored encrypted on this computer and never shown again. Saving a new key replaces the old one.
- **Test key** sends one tiny request to check the key and shows **The key works.** or why the test failed.
- **Clear key** deletes the stored key.
- **Model**: the Claude model the helper uses, with its approximate price per million tokens: **Claude Opus 5.5** (the default and the most capable), **Claude Sonnet 5.5** or **Claude Haiku 5.5** (the cheapest). A conversation keeps the model it started with; after a change the panel says "Start a new conversation to use …".
- **Effort in chat** and **Effort in build**: how hard the model thinks before it answers: **Low**, **Medium**, **High** or **Extra high**. Higher effort is slower and uses more tokens. The defaults are Medium for chat and High for build.
- **Allow Anthropic to answer with another Claude model when a request is declined** (on by default): when the model declines a request, Anthropic may answer it with another Claude model instead of stopping, and the transcript says so. Claude Haiku 5.5 has no fallback model.
- **AI helper guide** opens this page.

The section also shows the privacy text below.

## What is sent, and when

Nothing leaves your computer until you press **Send**. Then MCSuperMods sends to Anthropic, under your key:

- your message and the conversation so far, with any screenshots or pictures you added to it;
- the project content the helper reads while it works: element JSON, ids, problems, template and version data and the script typings.

Textures, other files and file paths are never sent, except pictures you add to a message yourself. The key stays in MCSuperMods' main process (the part that talks to Anthropic) and is never given to the window you work in. Conversations are kept in memory only, one per project: closing MCSuperMods forgets them.

The helper's placeholder textures are drawn on your computer, like the Creator's; the model only asks for a pattern and a colour.

## Open the helper

Open a project, then use one of:

- **AI helper** on the toolbar (the sparkle icon);
- **View → AI Helper**, or Ctrl+Shift+A;
- "Open AI helper" in the command palette (Ctrl+Shift+P).

The helper opens in the right-hand dock as a third tab, **AI helper**, next to **Preview** and **Problems**. Without a key it shows **Open Settings** and the privacy text instead.

At the top choose the mode: **Chat** or **Build**. Type in the box at the bottom; Enter sends (or press **Send**), Shift+Enter starts a new line. To show the helper something, paste a screenshot into the box (Ctrl+V), drop a picture on it or choose **Picture** (up to four per message); thumbnails show above the box, and the × on one removes it. A picture of an item, a mob or another mod's content is a good start in Build mode: "make this". **Stop** ends a run at once. The icon button **New conversation** starts afresh (it asks first when proposed changes are still waiting).

## Chat mode

Chat is for questions and small edits: "why does my sword not show in the creative tab?", "add a recipe for the ruby block from nine rubies", "rename `ruby:gem` to `ruby:ruby`".

The answer streams into the transcript. Lines such as "Read `ruby:ruby_ore`", "Proposed 2 elements" or "Checked: 0 problems" are the helper's tool calls: open one to see what it sent and got back. A collapsed **Thinking** line holds a summary of its reasoning.

When the helper proposes changes, they collect under **Proposed changes** (see [Review and Apply](#review-and-apply)).

### Explain this problem

In the **Problems** tab, **Explain** on a problem row opens the helper in Chat with the problem attached and the text "Explain this problem and how to fix it." ready in the box. You can edit the text or remove the attached context (the chip above the box) before you press **Send**; nothing is sent until then. The same is in the command palette as "Explain this problem with the AI helper".

### Ask AI

**Ask AI** in the editor header (also "Ask the AI helper about this element" in the palette) does the same for the selected element, with "Tell me about this element." in the box.

## Build mode

Build makes whole content from one prompt. Switch to **Build**, describe what you want and press **Send**. For example:

> make a ruby tools mod with ore, blocks, items, recipes, a mob

1. **The plan.** The helper first proposes a plan: a title, the items it will make (each with its kind and id), the textures it needs and notes. Nothing has been made yet. Remove items you do not want with the button on their row.
2. **Decide.** **Build all** builds every item without stopping. **Step through** builds one item at a time and pauses after each with **Continue** and **Stop**. **Revise** sends the plan back with what you typed in **Comments for Revise**, and the helper proposes a new one.
3. **Building.** The helper proposes the elements in batches and checks them after each batch, fixing what the checks find. Finished plan items are ticked. It uses the project starters and templates where they fit (its gear sets are made by the same flows as the [Creator](creator.md#the-ai-helper-uses-the-same-flows), so **Edit in Creator** reopens them).
   For a status effect or a throwable it uses the **Status effect** and **Throwable** flows ([Status effects and throwables](effects-and-throwables.md)); a script that runs while an effect is active goes through the effect's **While active** event and a `run_script` action. Placeholder textures include balls, knives, boomerangs, flasks and 18 by 18 effect icons.
4. **Summary.** The run ends with a short summary of what it made and what to do next.
5. **Review and Apply**, as below.

After applying, export as usual: the resource and data packs, and the **Fabric mod jar** when the content has new blocks, items or mobs ([Blocks and items](blocks-and-items.md#export-a-fabric-mod-jar)). Replace the placeholder textures with your own by importing textures with the same names (see [Replacing the placeholders](templates-and-examples.md#replacing-the-placeholders)).

## When MCSuperMods cannot do it yet

Some requests need something MCSuperMods does not have yet, for example a thrown item with a 3D model in flight or custom arrows for a bow. The helper then tries the other ways first (a vanilla component through `msm:components`, data pack commands, a script), proposes the closest version that works and tells you plainly what it does not do. It also adds the gap to the project's **Wishlist** (**Help → Wishlist…**, or "Wishlist" in the palette): what you asked for, what is missing and what it built instead. You can add your own wishes there, tick the ones that have been added to MCSuperMods, and **Copy** the open ones to send them on, so they can be built into a later version. The Wishlist is saved with the project (`msm.wishlist.json`). If you need something right away, **Export → Fabric Java project** gives you the mod as Java code to extend by hand.

AI conversations themselves are not saved: closing MCSuperMods forgets them (see [What is sent, and when](#what-is-sent-and-when)); the Wishlist keeps what matters from them.

## Review and Apply

Every change the helper proposes waits under **Proposed changes** (with "k of n kept" counting the changes you keep), grouped as **New elements**, **Changed elements**, **Deleted elements**, **Renamed elements** and **Placeholder textures**.

- Each row has a tick box: untick a change to leave it out.
- **Before and after** shows the element's JSON before and after the change (**Preview** shows a placeholder texture).
- Problems the checks found for a change are listed on its row. A row marked "Not applied: …" no longer fits the project (for example, you edited that element in the meantime).
- **Apply** puts every kept change into the project in one step: "Applied 5 changes. Undo reverts them in one step." **Edit → Undo** (Ctrl+Z) takes them all back. Apply is not available while a run is still going.
- **Discard** drops all proposed changes after asking; nothing has been applied to the project.

You can go on chatting after applying; the helper sees the project as it now is.

## Limits, usage and cost

Every run has limits, so a long build cannot run up a surprise bill. **Run limits** in the panel changes them for the next run only:

- **Tool turns**: how many rounds of tool calls the run may make (24 in chat and 150 in build by default).
- **Output tokens**: how much the model may write in the run (100,000 in chat and 600,000 in build by default).
- **Tell the model its output budget**: lets the model pace itself to finish within the output tokens.
- **Use defaults** restores the defaults.

When a run reaches a limit it stops with "The run stopped at its limit (…). Raise the limit under Run limits and send 'continue' to carry on." Your proposed changes are kept.

The line under the transcript shows the conversation's usage so far, for example "12,431 in / 3,210 out, 4 requests, about $0.11, Opus 5.5": tokens sent and received (sent tokens include those read from Anthropic's cache), the number of requests, an approximate cost in US dollars and the model. The cost is an estimate from the prices MCSuperMods knows; Anthropic's prices can change, and your Anthropic account's usage page is the real bill. Current prices are on [Anthropic's pricing page](https://platform.claude.com/docs/en/about-claude/pricing).

A rough guide: a chat question costs a few cents with Opus; a whole build can cost a dollar or more. Haiku is much cheaper and less capable; Sonnet is in between.

## Troubleshooting

| Message | What to do |
|---|---|
| **No key** in Settings, or "No API key is set. Add one under Settings > AI helper." | Add the key under **Settings → AI helper** and **Save key**. |
| "Encrypted storage is not available on this system, so a key cannot be saved." | MCSuperMods stores the key only with the operating system's encrypted storage. On Windows and macOS it is always there; on Linux it needs a keyring service (GNOME Keyring or KWallet). Without it the helper cannot be used. |
| "The key test failed (AuthenticationError): …" or "The run failed: The API key was rejected (AuthenticationError)" | The key is wrong, revoked or from an account without credits. Create a new key in the Console, then **Save key** and **Test key**. |
| "The run failed: Rate limited; try again shortly (RateLimitError)" | Your account sent too many requests in a short time. Wait a minute and send again (for example "continue"). |
| "The run failed: Could not reach Anthropic (…)" | No internet connection, or a firewall or proxy blocks MCSuperMods. |
| "The model declined to continue: …" | The model refused the request. Rephrase it, or keep **Allow Anthropic to answer with another Claude model when a request is declined** on. |
| "The run stopped at its limit (…)" | Raise **Tool turns** or **Output tokens** under **Run limits** and send "continue". |
| "The answer reached the maximum length and was cut off." | Ask for less at once, or send "continue". |
| "Start a new conversation to use …" | You changed the model in Settings; **New conversation** starts one on the new model. |
| A change shows "Not applied: …" after **Apply** | The project changed since the helper proposed it. Ask the helper to propose it again. |

## Limits of this version

- Conversations are not saved: they last until you close MCSuperMods or start a new one.
- The helper only proposes changes to elements and placeholder textures. It does not export, install, import files, open dialogs or run Minecraft.
- One API key for the whole app; no proxy or base URL setting.
- The helper's knowledge of Minecraft comes from the model and from the schemas and templates in MCSuperMods; check its work in the game ([Blocks and items](blocks-and-items.md)).
