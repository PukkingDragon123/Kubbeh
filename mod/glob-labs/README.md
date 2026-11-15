# GLOB LABS for Claude Code

GLOB LABS turns a Claude Code session into a back-alley alien laboratory. A pane shows the GLOB LABS ship deck (a real render of the voxel app) where pixel-finished voxel aliens act out what Claude is really doing, a fuel tank reads your real Claude usage limits, and an Auto-Saver spends less of them as the tank runs low. It is the Claude Code half of the GLOB LABS project; the full voxel web app lives in `app/` of the same repository.

## Install

At the prompt of a terminal session:

```
/plugin install glob-labs --marketplace PukkingDragon123/Kubbeh
```

From a shell:

```
claude plugin install glob-labs --marketplace PukkingDragon123/Kubbeh
```

Answer `y` to add the marketplace, then pick a scope. In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `PukkingDragon123/Kubbeh`, then Add plugin.

## What you get

- **The lab pane** (`/glob`). Blip types at the terminal while Bash runs, Zib carries files for every Edit and Write, Mossy reads at the bookshelf for Read/Grep/Glob and peers through the telescope for web searches, Pounce (a snow-leopard-kitten alien) updates the whiteboard for task lists, and every subagent pops out of the cloning vat as a clone that does its own tool calls. When Claude asks you something, the alien runs to the front with a speech bubble. Hover an alien to read exactly what it is doing. On the desktop app's small widget seat the pane becomes a glance: tank plus busy aliens.
- **The fuel tank** (`/glob-fuel` or `/glob fuel`). One glass tank per usage window the engine reports (5-hour, weekly, spend limit), with markers at 50%, 25% and 10% left, warning lamps, reset countdowns, plus context fill and session cost. When a marker is crossed, the lamps flash, an alarm plays and a toast says what the Auto-Saver is doing.
- **Auto-Saver** (`/glob saver on|off`, on by default). Below 50% left it caps effort at high; below 25% at medium, allows one subagent at a time and adds a short "be direct" note beside your prompt; below 10% it drops effort to low, holds back new subagents (Claude is told to do that part itself) and adds a stricter note. It only ever lowers effort, never raises it.
- **Caveman mode** (`/glob-caveman off|lite|full|ultra|auto`). Terse-output instructions that ride beside each prompt. `auto` (the default) turns on lite below 25% and full below 10%.
- **Prompt polish** (`/glob-polish off|on|model`, off by default). `on` trims filler and politeness locally, free, never touching code, quotes, paths or numbers. `model` also asks Haiku (low effort) to tighten long prompts and keeps its rewrite only if every key term survived. The prompt you see in the transcript is the one that was sent.
- **Prof. Glorp's idea mode** (`/glob-idea <your game idea>`, `/glob-idea done`). Claude becomes Prof. Glorp: it asks smart multiple-choice questions about loop, mechanics, progression, controls, visuals and scope until the design is clear, then writes one compact, complete build prompt.
- **Gene Points** (`/glob-genes`). Earned for finished turns, files written, clones delivered and trimmed prompts, with achievements. They persist across sessions.
- **The look.** A night-alley green theme with neon accents, and on the desktop and mobile apps a slowly moving alley backdrop (brick walls, buzzing neon, a drifting UFO).

Every command is also a subcommand of `/glob` (`/glob fuel`, `/glob caveman lite`, `/glob polish on`, `/glob idea <idea>`, `/glob genes`). The names are prefixed so they never clash with a skill or command you already have, such as a `/caveman` skill; if a name is still taken, that one command is skipped and the rest of the lab runs.

## What is real and what is not

- The fuel figures are the engine's own rate-limit windows (`$.session.usage()` and `session.measure`), the same numbers the status line uses. They exist on a Claude subscription after the first reply; API-key sessions report none, and the tank says so instead of inventing numbers.
- The aliens move only on real tool calls, subagent starts and turn ends.
- Effort changes apply per request through `turn.step`. On a model that takes effort per message this keeps the prompt cache; on others a changed level costs one cache write.
- Notes for caveman, the saver and idea mode go in as prompt context, so turning them on or off never rewrites what a thread already sent.
- Sounds play where the platform has a player (macOS); elsewhere they are silent.

Sounds: CC0 clips from Kenney and Juhani Junkala via OpenGameArt; see `assets/sfx/CREDITS.md`.
