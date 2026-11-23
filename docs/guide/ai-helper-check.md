# Checking the AI helper with your own key

Every test of the [AI helper](ai-helper.md) so far has run against a scripted stand-in for the model. This page is a list of twelve things to try on Windows with a real Anthropic key, so that the real model's behaviour gets seen once. Each step says what to do and what you should see. If you see something else, note the step number and what was on the screen (a screenshot helps) and tell the developer.

The whole list costs a few dollars at most on Claude Opus 5.5, most of it in step 6. Use Claude Sonnet 5.5 under **Settings**, **AI helper**, **Model** to spend about half. Use a mod you do not mind changing, and set the view mode to **Very easy** unless a step says otherwise ([view modes](very-easy.md)).

## 1. Set up with a wrong key, then a right one

1. Open a mod and press the toolbar's **AI helper** button. The card **Set up the AI helper** should show. It should say that using the helper costs money on your Anthropic account, with a dollar figure.
2. Press **Open Anthropic's site**. A page where you can make a key should open.
3. In **2. Paste it here**, paste something that is not a key (type `sk-ant-wrong`) and press **Save and check**.

You should see "Your key was not accepted. Check that you copied all of it, or make a new one on Anthropic's site and paste it again." The box is empty again.

4. Paste your real key and press **Save and check**.

You should see "The key works. You can start." Only the last four characters of the key are shown afterwards. If the check cannot reach Anthropic, a button **Check again** tries once more without pasting the key again. More in [Set it up](ai-helper.md#set-it-up).

## 2. The typical cost against the real line

The set-up card (and **Settings**, **AI helper**, **Model**) gives the typical cost of a first question for your model, for example about $0.27 on Claude Opus 5.5. Write that figure down. Then ask one small question, such as "Make a ruby sword", and let it finish.

You should see, under the conversation, a line such as "This chat has cost about $0.11 so far." Compare it with the card's figure and with your Anthropic account's usage page (it can take a few minutes to update). Write down all three. The line is an estimate, so a difference of a few cents is normal; one that is several times larger or smaller is worth reporting. See [What it costs](ai-helper.md#what-it-costs).

## 3. "Make a ruby sword" in Very easy

Press **New chat**, type or choose "Make a ruby sword" and press **Send**.

You should see the state line under the conversation read "Thinking…" with a number of seconds that rises, and one button, **Stop**. When it ends it should read "1 thing is ready. Nothing is in your mod yet." with **Look**. Press **Look**: the tray shows one card, for example "Ruby Sword", with a picture. Nothing on the screen should show ids such as `msm:item` or file names.

Do not add it yet.

## 4. A vague ask

Press **New chat** and send only "make something cool".

You should see the helper either ask you a question (the state line then says "Your turn…", and the answer is in view without scrolling) or propose one small thing and say what it chose. It should not build a whole mod from five words. Answer its question in the box and press **Send**.

## 5. An ask MSM cannot do

Press **New chat** and ask for something it has no way to make, for example "Make a mod that adds multiplayer voice chat".

You should see it say plainly what it cannot do, offer the closest thing it can, and show the line "Wrote down a wish: …". Open **Help**, then **Wishlist…**: the wish should be listed there. See [When MCSuperMods cannot do it yet](ai-helper.md#when-mcsupermods-cannot-do-it-yet).

## 6. A whole mod, with a plan

Press **New chat** and choose the example ask "Make a whole mod about rubies: ore, gem, tools and armour", then press **Send**.

You should see **Here is my plan**: a line for each thing, and a line of **Pictures**. Nothing has been made, the state line says "Your turn: choose what to do with the plan." and says nothing about working. The box is still usable. Press **Make all of it** (or type "go" and press Enter). The state line should count seconds and say "Making it…" with the number of things so far, ending in "n things are ready. Nothing is in your mod yet." Press **Look**, and look at each card. Write down how long it took and what it cost (the cost line, as in step 2). Do not add it yet; step 9 uses it.

## 7. One at a time

Press **New chat**, send the same whole-mod ask, and this time press **One at a time**.

You should see it make one line, then stop with the state line "Your turn: keep going or stop?", the ticked line in the plan, and the buttons **Keep going** and **Stop**. Press **Keep going** once, check that a second line is made, then press **Stop**. What was made should still be waiting in the tray.

## 8. Change the plan

Press **New chat**, send the whole-mod ask again and, when the plan shows, press **Change the plan**. The box asks "What should be different?". Type "no armour, add a ruby pickaxe" and send it.

You should see a new plan that follows what you said (no armour; a pickaxe), still with nothing made. A **Leave this out** on a line removes just that line. Press **Make all of it** to end the step.

## 9. The review's pictures, Add to my mod, Show me and Undo

With waiting changes in the tray (from step 8, or step 3):

1. Open it with **Look**. Each card has a picture. Press **See it** on one: the thing should be drawn as the game would draw it. Untick **Keep** on one card: the picture should lose that thing within a moment.
2. Press **Add to my mod**. You should see a notice such as "Added 3 things to your mod: …" with **Show me** and **Undo**.
3. Press **Show me**: the thing, or Home's **My things**, should open.
4. Press the toolbar's **Undo** (or the notice's **Undo**). You should see "Taken out again." and the things gone from **My things**.
5. Press **Put back**: they should return.

The mod should be as it was after step 2 each time, with no half-added things.

## 10. Ask the helper on a thing to fix

Make a thing with a problem, for example a rule step with no item chosen, so that **Things to fix** on Home shows a line. Press **Ask the helper** on that line.

You should see the helper open with a chip above the box, for example "About: …", and **nothing sent yet**. Press **Send**. The answer should be about that problem and should offer a change you can look at and add.

## 11. Pulling the network cable

Send "Make a whole mod about rubies: ore, gem, tools and armour" again, press **Make all of it** and, while the state line says "Making it…", turn off the network (pull the cable, or turn off Wi-Fi).

You should see the run stop within a minute with "No connection to Anthropic. Check the internet." and one button, **Try again**. What was made so far should still be in the tray. Turn the network on and press **Try again**: it should carry on. See [When something goes wrong](ai-helper.md#when-something-goes-wrong).

## 12. The time to the first words

Press **New chat** and send "Make a ruby sword" again. Watch the state line: it first says "Thinking… (0 s)" and counts up.

Write down the seconds on the line at the moment the first words of the helper's reply appear in the conversation. Repeat it twice. The number is the time to the first words on your connection and model, and it is the figure that tells whether the screen feels slow. If it is more than about ten seconds on a small ask, say so, with the model and effort setting you used.

## What to send back

For each step: it matched, or what you saw instead. For step 2, the three costs. For steps 6 and 12, the times. If a sentence on the screen was confusing, copy it word for word.
