# Hyperframes Video Polish

An agent skill that polishes Hyperframes videos and verifies the actual MP4 export. It fixes layout drift, staged-motion bugs, premature connector paths, weak reading hierarchy, and unfinished closing screens, then checks the rendered file instead of trusting stills alone.

Works with Claude Code, Codex, OpenCode, and other agents that load Agent Skills.

## What it does

- Diagnoses visible problems from the composition source and real frames.
- Enforces alignment invariants: centered groups, equal-width rows, shared baselines, price-plus-unit widths.
- Enforces motion invariants: causal staging, safe SVG path hiding, stagger completion math, no conflicting tweens.
- Tightens narrative and closing screens without stripping billing terms or proof.
- Runs `hyperframes lint`, `check`, and `snapshot` with honest interpretation of the reports.
- Verifies the exported MP4: streams, codecs, dimensions, FPS, duration, frame count, full decode, and optional preserved-audio comparison.

## Requirements

- A Hyperframes project with an HTML/CSS/JS composition.
- Node.js 18 or newer for the portable verifier.
- `ffmpeg` and `ffprobe` on `PATH`.
- Optional on Windows: PowerShell 5.1 or newer for the bundled `.ps1` verifier.

## Install

### Skills CLI

```bash
npx skills add rocksstarcode/hyperframes-video-polish
```

### Manual

Clone or copy this repository into a skills directory named `video-polish-qa`:

```bash
git clone https://github.com/rocksstarcode/hyperframes-video-polish.git <skills-dir>/video-polish-qa
```

Common locations (verify against your tool's current documentation):

| Tool | Project-level | User-level |
| --- | --- | --- |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| Codex | `.agents/skills/` | `~/.agents/skills/` |
| OpenCode | `.opencode/skills/` | `~/.config/opencode/skills/` |

Keep the folder name `video-polish-qa` so it matches the skill's frontmatter.

### Manual use without skill support

Paste `SKILL.md` into the conversation and point the agent at your composition source, then use the verifier commands below.

## Use

Ask your agent to use the skill:

```text
Use $video-polish-qa to polish this Hyperframes video, then verify the exported MP4.
```

The skill resolves your project's entry point, render command, and output folder from your own package scripts and docs. It does not assume filenames.

## Verify an export directly

Node (any platform):

```bash
node scripts/verify-video.mjs --video "exports/my film/final.mp4" --expected-duration 48
```

Preserve-audio check against an earlier cut:

```bash
node scripts/verify-video.mjs --video "exports/my film/final.mp4" --expected-duration 48 --reference "exports/my film/previous.mp4" --json
```

Windows PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-video.ps1 -Video "exports/my film/final.mp4" -ExpectedDuration 48
```

Both scripts accept custom dimensions and FPS:

```bash
node scripts/verify-video.mjs --video final.mp4 --width 1080 --height 1920 --fps 30
```

## Scope and limitations

- This is a Hyperframes-focused visual-polish skill, not a general video editor.
- Visual-only revisions preserve the existing audio and timing unless retiming is requested.
- Sampled stills and automated checks do not prove every frame is correct.
- `hyperframes check` may report `motion.enabled: false`; that means motion analysis did not run.
- GPU and worker flags depend on the machine doing the render; validate them there.

## License

MIT
