# Commands and creative tabs

Two small things make a mod feel finished: a **command** of your own that players type in chat (`/heal`, `/kit 5`), and a **creative tab** of your own that holds your blocks and items in the creative inventory instead of scattering them over the vanilla tabs.

Both are elements of the project (`msm:command` and `msm:creative_tab`), made without code. Both need the **Fabric mod jar** and the runtime of MCSuperMods 1.5.1 or later; a vanilla pack leaves them out ([Vanilla packs](#vanilla-packs)).

## Make a command

There are four ways:

- the Creator's **Custom command** flow (group **Scripts**; Fabric mod jar only). Its answers: **Command name** (`heal` gives `/heal`), **Who can use it** (**Every player** or **Operators only (as /give)**), **Message back**, **What it does** (**Heal you**, **Give you an effect**, **Give you an item** or **Launch you up**) with its numbers (**Health restored**, **Effect**, **Effect seconds**, **Item**, **How many**). It creates with its untouched defaults and zero problems;
- in Very easy mode, the Home tile **Make your mod do something** (heading **Rules and help**) opens the Custom command and Creative tab flows ([Very easy mode](very-easy.md));
- **Add element** (Ctrl+N), the templates under **Commands**: **Help command** (`/helpme`, also `/tips`: a chime and an answer in chat) and **Hop command** (`/hop`: a few blocks up, then a slow fall);
- the examples **Command: /welcome** (`/welcome`, also `/hi`) and **Server helper** (`/helpme` for everyone, `/hub` to jump to a lobby, `/boost` with a number for operators, and a rule book that points new players at `/helpme`).

Selecting a command opens the Command Studio.

## The Command Studio

- **How it is typed** shows the chat line as a player sees it: `/kit <who> [count]`, with `<…>` for needed words and `[…]` for the ones that may be left out, and the other names beneath.
- **Name** is the command's name (lower case letters, digits and `_`, without the slash, 1 to 64 characters) and up to four **Other name** entries (aliases).
- **What the player types after it** lists the words after the name. Each row has a **name** (what a function calls it), **is** (the kind of value, below), **Lowest** and **Highest** for numbers, **May be left out**, and move up, move down and remove buttons (each one undo step). Up to eight arguments. The kinds, in the Studio's words: **One word**, **Some text (the rest of the line)**, **A whole number**, **A number (may have a decimal point)**, **Yes or no (true or false)**, **One player**, **One or more players**, **One mob or player**, **A place (x y z)**, **A block position (x y z)**, **An item** and **A block**. Words that may be left out come last, and the text goes last of all.
- **Who can use it** is the permission level in five words: **Every player**, **Trusted players (level 1)**, **Operators, as for cheat commands like /give (level 2)**, **Server admins (level 3)** and **The server owner only (level 4)**.
- **What it does** picks one: **Do the steps of an event** (the events editor appears, with the actions you know from blocks), **Run a function** (a data pack function) or **Nothing here (a script listens for it)**.
- **Message back** is the text shown to the player when the command worked (`feedback_text`).
- The **Rules** section appears once a rule has something to say about the command ([Rules](rules.md#placing-explosions-commands-and-riding)).

**Problems** reports, in plain words, a name with letters it cannot use, a name that Minecraft or another of your commands already uses, a word that must be typed after one that may be left out, a "rest of the line" text that is not last, a lowest or highest value on something that is not a number, a lowest above the highest, a command that runs both a function and an event, an event that is not there any more, a command that does nothing yet, and two notes (below).

## How a command runs

When a player types the command, the game reads the words, then:

- an **event** runs with `self` and `other` both the player (the source of the command); its actions give items, heal, launch and so on ([Events and actions](blocks-and-items.md#events-and-actions));
- a **function** runs at once with the typed words passed in as macro values, as `/function <id> with storage <mod id>:args`. In the function write `$(count)` where a value goes: a whole number is `5`, a number `2.5`, yes or no `1` or `0`, a place `1.5 64.0 -2.25`, a block position `3 70 -4`, an item or block its id, **One player** the player's **name**, **One or more players** the names separated by spaces, and **One mob or player** its UUID;
- a **script** listens for the Script API's `command` event ([Scripting](scripting.md#script-api-16)), which says which command ran and what was typed;
- the **Message back** is sent, and the command's own **Rules** run.

A command with **Every player** and a function is worth a thought: the function runs with operator rights (level 2, the permission of cheat commands) whatever the player's own level, so anyone can do what the function does. The Studio and Problems say so (`commands.runs-as-player`). Keep such a function harmless, or make the command **Operators**.

After a Play, the commands also come back after `/reload` (the game registers them again and tells every player its new list). A new command is read when Minecraft starts, so adding one makes Play say **Restart needed**; changing the events of a command that exists reloads ([Playing and testing](playing-and-testing.md#restart-needed)).

## Make a creative tab

- the Creator's **Creative tab** flow (group **Scripts**; Fabric mod jar only): **Tab title** (My Blocks gives `my_blocks`), **Icon** (**The first block**, or a Diamond, Emerald, Bricks, Golden apple or Nether star), **Order** and **Make a first block in it** with **Block colour**, so the tab is not empty;
- the template **Creative tab** (category **Creative tabs**), the example **Creative tab: Curios**, or an element of its own.

Selecting a tab opens the Creative Tab Studio:

- **Tab**: **Title** and **Icon (an item)**, and **Order**: **In the order the mod adds them** or **By name, A to Z**;
- **Preview**;
- **What is in it** lists the items, block items and spawn eggs whose **Creative tab** field names this tab. **Add**, **Take out** and **Add everything without a tab** set or clear that field on the things, each as a single undo step however many things change. Items and blocks join a tab by naming it in their own **Creative tab** field too ([Blocks and items](blocks-and-items.md#the-block-studio)).

How the tab is ordered:

- **In the order the mod adds them** is the order the game registers things: all the block items, then the items, then the spawn eggs, each by mod id and then by file path. It is not always the order the project lists them in, so the list in the Studio is a guide.
- **By name, A to Z** sorts by the name players see.
- **There is no way to order a tab's items by hand.** Name things so that the order you want comes out, or use **By name**.
- A tab with an **icon that does not exist** shows no picture. Problems says so (`creative-tab-icon-unknown`), and also reports an item that names a tab that is not there (`creative-tab-unknown`).
- Extra tabs appear on the creative inventory's second page, after the vanilla tabs. A new creative tab needs a restart; nothing about it reloads.

## The limits

- **A name that clashes is not registered.** A command named like a vanilla command (there are 94) or like one of another mod, or with the same name as an earlier command of yours, is a load error in the game log and is not registered under that name. Problems warns first (`commands.name-clash`). The same goes for an alias.
- **The text is raw.** A text or word typed by a player goes into the function as it is. A `"` or `\` typed by a player can break a function that puts the value in quotes. Problems adds the note `commands.raw-text` to commands with text arguments. Keep text out of quoted places, or let a script read it.
- **`player` arguments take names or selectors**, not UUIDs: `/kit Ann 5` and `/kit @a 5` work. A function receives the name; a script receives the UUID in `args`.
- **Functions run at level 2** whatever the player's level (see above), and a command with permission 0 is for everyone.
- **A command that matches nobody fails.** The runtime always reads the arguments, so an event-only command whose player selector matches nobody says so and does not run.
- **Server side commands only.** There are no client-side commands, and no argument types of your own beyond the twelve.
- **A script rule is not run from the console.** Rules and scripts that listen for a command that runs a function do not run when the console or a command block runs it.
- **`as_listed` follows registration order** and there is no hand ordering of a tab's items (above).
- **Looks are in-game checks.** The Try it preview lists commands in **What happened** instead of showing their results, and the tab as the game draws it is best checked in the game ([Try it](try-it.md)).

## Vanilla packs

Commands and creative tabs are not in the resource or data pack exports: they need the runtime. The export says `export.needs-jar` ("only works in the Fabric mod jar. Share my mod makes one.") for each. A function in a vanilla data pack that runs a project command is kept with the warning `export.mod-only-function`, since a vanilla game would not know the command. The language file keys (`command.<namespace>.<name>.feedback` and `itemGroup.<namespace>.<name>`) go into the resource pack.

The [Java project export](eject.md) contains commands (`ModCommands`, with Brigadier builders for the same words and the same macro values) and tabs (`ModCreativeTabs`).

## The in-game check

Press **Play** (or export the Fabric mod jar). Type `/` in chat: your commands are listed with their words, and a wrong value is refused with the game's own message. In a creative world, open the creative inventory: your tab is on the second page when the vanilla tabs fill the first. For a command with a function, run it with a player selector, a number and a place to see what arrives. Look for `registered N command(s)` and `registered N creative tab(s)` in the log (`[msm_runtime]` lines).

The other chapters are listed in the [user guide](/).
