# GLOB LABS

A back-alley alien laboratory for Claude. Two pieces, one lab:

| | What it is | Where |
|---|---|---|
| **GLOB LABS app** | A full Claude workspace inside a 3D voxel lab: chats, projects, files, artifacts, coding tools, an idea assistant, a fuel tank, Gene Points, a shop and a crew of jelly aliens who act out what Claude is doing. | [`app/`](app) |
| **GLOB LABS mod** | A Claude Code plugin that reskins Claude Code itself, with a lab pane, a fuel tank fed by your **real subscription usage windows**, and an Auto-Saver that lowers effort and holds back sub-agents as fuel runs low. | [`mod/glob-labs/`](mod/glob-labs) |

## The app

### Run it

```bash
cd app
npm install
npm run dev
```

Open the printed URL, press **T** for the Terminal, and link an account.

| Build | Command | Output |
|---|---|---|
| Static site (host anywhere, GitHub Pages workflow included) | `npm run build` | `app/dist/` |
| One self-contained HTML file | `npm run build:single` | `app/dist-single/index.html` |
| claude.ai artifact page | `npm run build:artifact` | `app/dist-artifact/glob-labs.html` |

`?mock=1` runs a scripted offline Claude, so you can watch the full flow without spending anything: a file write, a question bubble, two clones and an artifact.

### Accounts and engines

- **API key (Claude Console).** Paste a key in *Accounts*. The key stays in this browser's storage and is only sent to `api.anthropic.com`. Add as many keys as you like; each account has its own projects, chats, files and usage ledger, and the HUD switches between them.
- **Your claude.ai account.** When GLOB LABS runs as a published claude.ai artifact, it uses your own Claude account through the artifact runtime: no key needed. Your data is kept in the artifact's private per-viewer storage.
- Signing in with a claude.ai subscription is not available to third-party web apps, so the app doesn't pretend to offer it.

### What's inside

- **Lab (3D voxel).** Brick alley, pipes, neon, a cloning vat, a giant fuel tank, a GENE-O-MAT vending machine, a wardrobe pod. Click the computer bank for the Terminal, Prof. Glorp for ideas, the tank for fuel. Drag to orbit, scroll to zoom.
- **The crew mirrors Claude.** Every streamed event drives an alien:
  - Blip thinks and types.
  - Zib carries files.
  - Mossy searches the web.
  - Pounce, the snow-leopard kitten skin, plans and builds artifacts.
  - Sub-agents come out of the vat as clones.
  - When Claude has a question, an alien runs to the front and a speech bubble pops up for your answer.
- **Terminal.** Projects dashboard, chats grouped by project, Cmd/Ctrl+K search, attachments (images, PDFs, text, code), Markdown with highlighted code, and Claude tools for project files, artifacts, project tasks, questions and parallel clones. The drawer holds Files (ZIP export), Artifacts (sandboxed live preview), Tasks and Project settings.
- **Fuel tank and Auto-Saver.** Markers sit at 50 / 25 / 10 %. When fuel crosses one, warning lights flash and the Auto-Saver lowers effort, caps clones, turns on caveman output and compacts sooner.
  - API accounts: the tank uses exact `usage` from every response, priced per model, measured against the budget you set, plus rate-limit headroom when the browser can read those headers.
  - claude.ai accounts: tokens are estimated, and labelled as estimates.
- **Token savers.** Prompt Polisher (free local compressor plus an optional cheap model rewrite that flags anything it dropped), caveman mode, context compaction and prompt caching.
- **Idea Lab.** Prof. Glorp brainstorms game ideas with you. He asks multiple-choice questions, fills a live design doc with a completeness meter, and fuses mechanics in the Mechanic Mixer. He then writes a final build prompt at the detail level you pick, checked so every requirement you stated is in it. **Build it in Terminal** turns it into a project.
- **Gene Points.** Earned from finished experiments, files, artifacts, clones, compactions, daily streaks and 31 achievements. Spend them in the GENE-O-MAT on furniture, alien plants with mouths, lab equipment, an Idea Slot Machine that spins random game ideas, a playable arcade cabinet, and alien cosmetics (skins, hats, outfits, accessories, expressions). **Edit HQ** to place and rearrange everything.
- **Floating widget.** An always-on-top Picture-in-Picture window (Chrome/Edge) with the aliens at work, your project progress, fuel and UFOs. Other browsers get a popup or an in-page mini widget.

## The mod

See [`mod/glob-labs/README.md`](mod/glob-labs/README.md). Install:

```
/plugin install glob-labs --marketplace PukkingDragon123/Kubbeh
```

The fuel tank in the mod uses Claude Code's own rate-limit windows (5-hour and weekly), the same numbers as the status line.

## Credits

- Sound effects are CC0 from OpenGameArt: Kenney's UI SFX and Sci-Fi Sounds, "100 CC0 SFX", and Juhani Junkala's retro collection. Details in [`app/src/assets/sfx/CREDITS.md`](app/src/assets/sfx/CREDITS.md).
- All voxel models, pixel art and icons are drawn in code for this project.
