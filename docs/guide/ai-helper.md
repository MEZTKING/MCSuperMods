# The AI helper

The **AI helper** is an optional assistant built into MCSuperMods. Say what you want in your own words ("make a ruby sword", or "a whole mod about rubies: ore, gem, tools and armour") and it works out what to make. It never changes your mod by itself: it shows you what it would make, you look at it, and only **Add to my mod** (**Apply** in Advanced) puts it in, as one step that **Undo** takes back.

The helper runs on Anthropic's Claude models with your own key. MCSuperMods works exactly as before without a key; the helper is simply not available.

The words on the helper's screens follow your view mode ([Very easy, Easy or Advanced](very-easy.md)). Very easy and Easy say the same plain sentences, and Easy also shows the files behind each thing; Advanced adds ids, kinds, numbers and Anthropic's own reasons, and uses Apply and Discard where the others say **Add to my mod** and **Throw away**. This page names both where they differ.

## Set it up

The first time, the helper shows a card, **Set up the AI helper**. Home's **Build with the AI helper** tile, the toolbar's helper button, the Welcome's **Or describe a mod and let the AI helper build it…** and New project with the AI helper all show the same card. What you typed stays in its box while you set up.

The card says that using the helper costs money on your Anthropic account (with the figure for your model, see [Cost](#what-it-costs)) and that if the account is not yours you should ask its owner first. Then three steps:

1. **1. Get a key.** **Open Anthropic's site** opens the page where you sign in, add credit if you have none, and make a new key (it starts with `sk-ant-`; the site shows it only once). Copy it.
2. **2. Paste it here.** Paste the key into the box.
3. **Save and check.** MCSuperMods stores the key encrypted on this computer, empties the box and at once sends one tiny request to see whether Anthropic accepts it. You read "The key works. You can start." or one sentence saying what is wrong and what to do (see [When something goes wrong](#when-something-goes-wrong)). A key that failed the check stays saved, so a busy service or a lost connection does not make you paste it again: **Check again** tries once more.

The card also lists **What is sent**. The key is never shown again, only its last four characters. Where the computer cannot lock the key away safely (some Linux systems without a keyring), the card says so and the key cannot be saved.

All of this, and more, is also in **Settings** (the gear icon) under **AI helper**: the same card with the saved key's line, **Check again** and **Remove the key**; **Model** (each with the cost of a first question: Claude Opus 5.5 is the default and the most capable, Claude Sonnet 5.5 is in between, Claude Haiku 5.5 is the cheapest); **Effort for questions and small changes** and **Effort for whole builds** (**Low**, **Medium**, **High** or **Extra high**; more effort thinks for longer and costs more; the defaults are Medium and High); and **Let Anthropic answer with another Claude model when this one declines**, on by default (Claude Haiku 5.5 has no other model to fall back to). In Advanced the Model list also gives the price per million tokens, and **Default limits** appears (see [Limits](#limits-in-settings)). **AI helper guide** opens this page; **All AI helper settings** in the panel opens the section with its top in view.

## Open the helper

Open a mod, then use **AI helper** on the toolbar (the sparkle icon), **View → AI Helper**, Ctrl+Shift+A, or "Open AI helper" in the command palette (Ctrl+Shift+P). It opens in the right-hand dock as a third tab, **AI helper**, next to **Preview** and **Problems**. Without a key it shows the set-up card.

There is no Chat or Build switch: a small ask and a whole mod use the same box. The whole-mod example ask below runs with the bigger limits.

## Ask for something

An empty panel asks **What would you like to make?** and offers four example asks: "Make a ruby sword", "Make a block that glows in the dark", "Make a friendly animal that follows me" and "Make a whole mod about rubies: ore, gem, tools and armour". Pressing one fills the box; nothing is sent until you press **Send**. Enter sends too, and Shift+Enter starts a new line. Under them a line says "Chats are not saved: they last until you close MCSuperMods or start a new one."

You can show the helper a picture: paste a screenshot (Ctrl+V), drop a picture on the box or choose **Picture** (up to four per message); the × on a thumbnail removes it. "Make this" with a picture of an item or a mob is a good start.

**New chat** starts again (it asks first when changes are still waiting). A conversation keeps the model it started with; after you change the model the panel says to start a new chat to use it.

### While it works

One line under the conversation, the state line, tells you what is happening and counts the seconds: "Thinking… (4 s)", "Looking at your mod…", "Making it… 2 things so far" and "Checking it works…". It shows at most one button. While it works that is **Stop**, which ends the run at once and keeps what was made. A tool line such as "Read the Ruby Sword" is shown in the conversation as it goes; in Advanced you can open one to see what was sent and got back, and the helper's reasoning shows as a closed **Thinking** line (in Very easy and Easy it is left out). The conversation follows the newest entry until you scroll up; then **New below** brings you back.

When the helper needs you, the line says "Your turn" and what to do, and nothing claims to be working: "Your turn: choose what to do with the plan." or "Your turn: keep going or stop?".

## A big ask: the plan

For a whole mod the helper first proposes a plan: **Here is my plan**, a line for each thing it would make ("Ruby Pickaxe, a tool"; in Advanced with its kind and id), and the pictures it needs. Nothing has been made yet. The state line says it is your turn, and the plan has these buttons:

- **Make all of it** builds every line without stopping.
- **One at a time** builds a line, then pauses with **Keep going** and **Stop**.
- **Change the plan** asks "What should be different?"; your words go back and the helper proposes a new plan.
- **Leave this out** on a line removes it before anything is made.

You can also answer by typing in the box: "go" makes all of it, or say what to change. Once it is decided, the plan closes to one line such as "Plan: Ruby mod. 3 of 5 made.", and finished lines are ticked. The helper uses MCSuperMods' own flows where they fit, so the pieces it makes match what the [Creator](creator.md#the-ai-helper-uses-the-same-flows) makes, and **Edit in Creator** reopens a set. A status effect or a throwable uses the same flows as [Status effects and throwables](effects-and-throwables.md).

The run ends with a short summary of what it made and what to do next.

## Look before you add

When the helper has made something, the state line reads, for example, "1 thing is ready. Nothing is in your mod yet." (Advanced: "1 proposed change is ready. Nothing is applied yet."), with **Look**. What it made waits in a tray between the conversation and the box, headed "Ready to add: 1 thing" (Easy adds "n files behind them"; Advanced reads "Proposed changes (n of n kept)"). **Look**, or the heading, opens it.

Open, the tray shows **cards**, one for each thing: its name, what it is, a picture of it where it has one, and what it comes with (a recipe, a drop, a name). A card says New, Changed or Taken out. Problems the checks found are said in plain words on the card. **See it** shows the thing as the game would draw it before it is in your mod, and follows what you keep or leave out.

- **Keep** on a card is ticked by default; untick a thing to leave it out.
- **Files behind this** (Easy) opens the files a thing is made of, in words ("Model", "Recipe", "Names"). Very easy shows no files. In Advanced there are no cards: each file has its own tick, and **Before and after** shows its JSON before and after.
- A card that says "Not added: …" no longer fits your mod, for example because you edited that thing in the meantime.
- **Add to my mod** (**Make these changes** when something is changed or taken out; **Apply** in Advanced) puts every kept thing in as one step.
- **Throw away** (**Discard** in Advanced) drops everything waiting after asking; nothing was added.

The helper can go on chatting after an add; it sees the mod as it now is.

## After adding

A notice names what was added: "Added 1 thing to your mod: Ruby Sword." (Advanced: "Applied 1 change.") with up to two buttons:

- **Show me** opens the thing: its Studio for one thing, Home's **My things** for several (a thing made by a Creator set opens that Creator page in Very easy). Advanced says **Show**.
- **Undo** takes the whole step out again. The toolbar's Undo and Ctrl+Z do the same. The notice then says "Taken out again." (Advanced: "Undone.").
- **Put back** puts it in again (**Redo** in Advanced). Undo is offered only while the helper's step is the last thing you did; after another edit it is not.

After that, export as usual ([Blocks and items](blocks-and-items.md#export-a-fabric-mod-jar)). Redraw drawn textures with **Draw…**, or replace them with your own ([Drawing pictures](pictures.md)).

## Ask the helper about a problem

In Very easy, each line of **Things to fix** has **Ask the helper**. It opens the helper with the problem attached and nothing sent: a chip above the box reads, for example, "About: Ruby Sword, it has no shape picture to show". Edit the box or remove the chip (**Remove the context**) and press **Send** when you are ready. In Easy and Advanced, **Explain** on a row of the **Problems** tab does the same, and **Ask AI** in the editor header (also "Ask the AI helper about this element" in the palette) asks about the selected element ("Tell me about this element."). Advanced's chip names the code and id ("Problem … on …", "Element … (kind)").

## It searches the library first

Before it makes anything by hand, the helper looks in MCSuperMods' own library with your words, using the same search as [Search everything](search.md): Creator flows, starters, templates, examples, kinds and Minecraft's ids. When a flow or starter fits ("a blue sword", "a pet that follows me"), it uses it with the answers your words give, such as the colour and the name, so what it makes matches what the Creator makes. In Advanced the conversation shows this as a line such as "Searched the library for `blue sword`". This search reads only the library and Minecraft's ids, never your mod's things and never Minecraft's names from your Minecraft folder.

The other way round works too: with a key set, the last row of the search is **Ask the AI helper**. It opens the helper with your words in its box (with no mod open, New project with the AI helper), and nothing is sent until you press **Send**.

## What is sent

Nothing leaves your computer until you press **Send**. Then MCSuperMods sends to Anthropic, under your key:

- your message and the chat so far, with any pictures you added to it;
- the parts of your mod the helper reads while it works: names, settings, problems, and the template and version data it needs.

Textures, other files and file paths are never sent, except pictures you add to a message yourself. The key stays in MCSuperMods' main process (the part that talks to Anthropic) and is never given to the window you work in. Chats are kept in memory only, one per mod: closing MCSuperMods forgets them.

When a context chip is attached, **See exactly what is sent** shows the exact block that goes with the message (**Hide what is sent** folds it); in a message already sent, **See exactly what was sent** does the same. Advanced shows the block by default.

The helper's textures are drawn on your computer, like the Creator's; the model only asks for a picture kind, a colour and a few choices ([Drawing pictures](pictures.md)).

## When MCSuperMods cannot do it yet

Some requests need something MCSuperMods does not have yet, for example a thrown item with a 3D model in flight or custom arrows for a bow. The helper then tries the other ways first (a vanilla component through `msm:components`, data pack commands, a script), proposes the closest version that works and tells you plainly what it does not do. It also writes down the gap in the project's **Wishlist** (**Help → Wishlist…**, or "Wishlist" in the palette): what you asked for, what is missing and what it built instead. You can add your own wishes there, tick the ones that have been added to MCSuperMods, and **Copy** the open ones to send them on, so they can be built into a later version. The Wishlist is saved with the project (`msm.wishlist.json`). If you need something right away, **Export → Fabric Java project** gives you the mod as Java code to extend by hand.

AI conversations themselves are not saved: closing MCSuperMods forgets them (see [What is sent](#what-is-sent)); the Wishlist keeps what matters from them.

## What it costs

Everything the helper does is billed to your Anthropic account at Anthropic's API prices, and MCSuperMods adds no charge. The set-up card and the Model list in Settings show what a typical question costs on your model, worked out by MCSuperMods from the size of the helper's instructions and the price table (read on 2026-11-22), so they always show the current figure; nobody types it in. In November 2026, on Claude Opus 5.5, that was about $0.29 for a first question (or one after an hour's pause) and about $0.05 for each question after it within the hour; making a whole mod costs more. Sonnet is about half and Haiku a good deal less, and less capable. The figure can grow a little as MCSuperMods teaches the helper about new features. Under the conversation, "This chat has cost about $0.11 so far." keeps the running estimate (Advanced adds the tokens, the requests and the model). It is an estimate: your Anthropic account's usage page is the real bill, and [Anthropic's pricing page](https://platform.claude.com/docs/en/about-claude/pricing) has the current prices.

## When something goes wrong

A failed or stopped run ends with one sentence on the state line and one button. Your waiting changes are kept.

| What you read | What it means, and what to do |
|---|---|
| "Your key was not accepted." (**Check my key**) | The key is wrong or revoked. **Check my key** opens **Settings → AI helper**; make a new key on Anthropic's site, then **Save and check**. |
| "Your key may not use this model." (**Check my key**) | The key's settings do not allow Claude. Look at the key on Anthropic's site, or make a new one. |
| "Add your Anthropic key first." (**Check my key**) | No key is saved yet. Set it up as above. |
| "Your Anthropic account has no credit left. Add credit on Anthropic's site." (**Try again**) | Add credit on your account, then **Try again**. |
| "Anthropic is busy just now." (**Try again**) | Anthropic is over its load, or you sent many asks at once. Wait a moment and **Try again**. |
| "No connection to Anthropic. Check the internet." (**Try again**) | No internet connection, or a firewall or proxy blocks MCSuperMods. Fix it, then **Try again**. |
| "Anthropic took too long to answer." (**Try again**) | Try again; ask for less at once if it keeps happening. |
| "It paused so the cost stays small." (**Keep going**) | The run reached its limit. **Keep going** carries on, and each run counts from zero. |
| "The answer got too long and was cut off." (**Keep going**) | Press **Keep going**, or ask for less at once. |
| "This chat has grown too long. Start a new chat to go on." (**New chat**) | Start a new chat; what you added stays in your mod. |
| "The message is too large to send. Try fewer or smaller pictures." | Remove or shrink the pictures. |
| "The helper would not do that. Try asking another way." | The model declined. Rephrase it. Leave **Let Anthropic answer with another Claude model when this one declines** on in Settings. |
| "Something went wrong while talking to Anthropic." (**Try again**) | Try again; if it repeats, see the key and connection rows. |
| "Adding to your mod did not work. Nothing was changed." | Ask the helper to make it again. |
| A card says "Not added: …" | The thing changed in your mod since the helper made it. Ask for it again. |

Advanced adds the reason in brackets: the error's name, Anthropic's own words for a refusal, and the numbers of a limit stop. "Encrypted storage is not available" means the computer has no keyring (GNOME Keyring or KWallet on Linux); without it the helper cannot be used.

## Limits in Settings

Every run has limits, so a long build cannot run up a surprise bill. The defaults live in **Settings → AI helper → Default limits**, which appears in Advanced: **Stop a small ask after** 24 **steps** and **and after about** 100,000 **tokens written**; **Stop a whole build after** 150 **steps** and about 600,000 **tokens written**; and a switch for each size, **Let the helper pace a small ask to its tokens** and **Let the helper pace a whole build to its tokens**, so the model plans to finish inside its budget. The section also states the most a stopped run can have cost at the defaults.

In Advanced the panel's **Run limits** changes them for the next run only (**Tool turns**, **Output tokens**, **Tell the model its output budget**, **Use defaults**, **Done**). A run that stops at its limit can simply be continued with **Keep going**, or by sending "continue". Very easy and Easy have no limit settings and need none.

## Limits of this version

- Chats are not saved: they last until you close MCSuperMods or start a new one. What you added stays in your mod.
- The helper only proposes changes to things in your mod and drawn pictures. It does not export, install, import files, open dialogs or run Minecraft.
- One key for the whole app; no proxy or base URL setting.
- The helper's knowledge of Minecraft comes from the model and from what MCSuperMods knows; check its work in the game ([Blocks and items](blocks-and-items.md)).
