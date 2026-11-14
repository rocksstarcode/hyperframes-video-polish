<div align="center">

# Hyperframes Video Polish

**An agent skill that turns a rough [Hyperframes](https://github.com/heygen-com/hyperframes) render into a launch-ready product film — and proves it on the actual MP4.**

[![Follow @AdiCoSto on X](https://img.shields.io/badge/Follow-%40AdiCoSto-000000?style=for-the-badge&logo=x&logoColor=white)](https://x.com/AdiCoSto)
[![License: MIT](https://img.shields.io/badge/License-MIT-e8552d?style=for-the-badge)](LICENSE)
[![Agent Skill](https://img.shields.io/badge/Agent%20Skill-Claude%20Code%20%C2%B7%20Codex%20%C2%B7%20OpenCode-1f1f1f?style=for-the-badge)](#install)

[![Watch on YouTube](https://img.shields.io/badge/Watch%20the%20film-YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white)](https://www.youtube.com/watch?v=rFsLY9sUA2I)

Built by **[@AdiCoSto](https://x.com/AdiCoSto)**

</div>

## Made with this skill

<p align="center">
  <a href="https://www.youtube.com/watch?v=rFsLY9sUA2I">
    <img src="assets/leadsthatmatter-preview.gif" alt="Highlights from the LeadsThatMatter product film: hook, AI agent diagram, prospect cards, per-lead pricing, and the closing $5/month offer" width="100%">
  </a>
</p>

<p align="center"><b>LeadsThatMatter — AI-powered lead generation starting at $5/month</b><br>
109-second 1080p60 product film built in Hyperframes and polished with this skill.<br>
<a href="https://www.youtube.com/watch?v=rFsLY9sUA2I">▶ Watch the full film on YouTube</a> · <a href="https://github.com/rocksstarcode/hyperframes-video-polish/releases/download/v1.1.0/leadsthatmatter-demo.mp4">Download MP4 (10 MB)</a></p>

Every beat above went through the skill's loop: centered price groups and card rows, origin-first connector diagrams, staggered entrances that finish before anything else moves, and a closing screen with a settled hold — then a verified export (1920x1080, 60 FPS, 6540 frames, H.264/AAC, full decode).

## Why

Agents are good at generating motion graphics and bad at noticing that a price is 6 px off-center, that a connector line flashes in before its origin, or that the "final" MP4 has the wrong frame count. This skill gives them the invariants and the verification step that catch those problems.

Works with Claude Code, Codex, OpenCode, and other agents that load [Agent Skills](https://agentskills.io).

## What it does

- Diagnoses visible problems from real frames, Hyperframes' own `timeline` and `keyframes` tools (GSAP, CSS, and Anime.js), and the composition source.
- Enforces alignment invariants: centered groups, equal-width rows, shared baselines, price-plus-unit widths.
- Enforces motion invariants: causal staging, safe SVG path hiding, stagger completion math, no conflicting tweens.
- Tightens narrative and closing screens without stripping billing terms or proof.
- Runs `hyperframes lint`, `check --at-transitions`, and `snapshot` with honest interpretation of the reports.
- Verifies the real export in any Hyperframes format — MP4, WebM, MOV, GIF, HLS, or PNG sequence; landscape, portrait, or square; any frame rate: codecs, size, FPS, duration, frame count, audio drift, transparency, a full decode, and an optional preserved-audio comparison.

## Requirements

- A Hyperframes project (tested with Hyperframes 0.8).
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

The format is detected from the path. Width, height, and FPS are enforced only when you pass them, so pass the values your render used.

```bash
# 1080p60 MP4 with narration
node scripts/verify-video.mjs --video "exports/my film/final.mp4" --expected-duration 48 --fps 60 --width 1920 --height 1080

# Hyperframes defaults: 30 FPS, portrait, no soundtrack
node scripts/verify-video.mjs --video reel.mp4 --expected-duration 15 --fps 30 --width 1080 --height 1920 --no-audio

# Transparent overlay
node scripts/verify-video.mjs --video lower-third.mov --alpha --no-audio

# HLS output folder or PNG-sequence folder
node scripts/verify-video.mjs --video renders/promo-hls
node scripts/verify-video.mjs --video renders/promo-frames --fps 30 --expected-duration 15

# Visual-only revision: encoded audio must be identical to the previous cut
node scripts/verify-video.mjs --video v3.mp4 --reference v2.mp4 --json
```

Windows PowerShell runs the same checks and returns an object:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-video.ps1 -Video "exports/my film/final.mp4" -ExpectedDuration 48 -ExpectedFps 60
```

| Format | Video codec | Audio codec |
| --- | --- | --- |
| MP4 | H.264 or HEVC | AAC |
| WebM | VP9, VP8, or AV1 | Opus or Vorbis |
| MOV | ProRes (Hyperframes' alpha MOV), H.264, or HEVC | AAC or PCM |
| HLS | H.264 | AAC |
| GIF | GIF | none |
| PNG sequence | PNG | none |

Override with `--video-codec` or `--audio-codec`. Duration is judged from the video stream, not the container, because AAC encoder padding commonly makes the container a few tens of milliseconds longer than the picture. Audio/video drift fails above 0.25 s (`--max-audio-drift`).

## Scope and limitations

- This is a Hyperframes-focused visual-polish skill, not a general video editor.
- Visual-only revisions preserve the existing audio and timing unless retiming is requested.
- Sampled stills and automated checks do not prove every frame is correct.
- `hyperframes check` may report `motion.enabled: false`; that means motion analysis did not run.
- GPU and worker flags depend on the machine doing the render; validate them there.

## Author

Made by **[@AdiCoSto](https://x.com/AdiCoSto)**. If this skill saved you a render, follow along on X for more agent skills and Hyperframes builds — and share what you make with it.

## License

MIT — see [LICENSE](LICENSE).
