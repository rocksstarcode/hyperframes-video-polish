---
name: video-polish-qa
description: Polish and verify Hyperframes videos, fixing alignment, overlapping animation, premature connector paths, reading hierarchy, and closing screens before checking the actual MP4 export.
---

# Polish and verify a Hyperframes video

Use for visual refinements, timestamped feedback, or a final production pass on a Hyperframes composition. Resolve the project's entry point, output folder, and render commands from its own package scripts, README, or agent instructions; do not assume filenames. Preserve audio and scene timing for visual-only work unless a requested change requires retiming.

## Resolve project context

1. Read the project's package scripts and docs before running anything. Confirm the composition entry (HTML/JS/CSS), lint/check/snapshot commands, render command, and where exports belong.
2. Identify the project's revision convention. Keep new exports distinct and inside the project's output folder; do not overwrite a prior verified cut.
3. Read the current composition source. Treat docs and earlier review notes as dated evidence; revalidate against the actual source when they disagree.

## Diagnose the visible state

1. Inspect the actual composition and feedback frames. Map each timestamp to its scene and timeline actions in the composition's JS; inspect the corresponding CSS.
2. Reproduce the problem at its start, midpoint, and settled state. An offset may be a tween still running rather than a wrong coordinate. Capture both sides of a scene boundary when a transient is involved.
3. Identify the cause before adding another transform: fixed offsets, mismatched widths, unequal text heights, transform-origin errors, early visibility, or multiple tweens writing the same property. Fix the underlying layout or timing.

## Alignment invariants

- Center a text block geometrically, not with guessed `left` coordinates: a centered-box helper should center the box and text. An intrinsic-group helper should center logos, price groups, and chips. Preserve `xPercent: -50` when applying scale or translation.
- For equal-width rows, derive the starting x from the complete group width: `count * cardWidth + (count - 1) * gap`. Subtract from canvas width and divide by two. Keep a shared y, card height, and padding.
- Align contents too: one-line and wrapping headings need a shared reserved height to keep icons, avatars, and lower rows on the same baseline. For example, one verified composition reserved a fixed flex-centered title area so wrapped titles did not push cards out of line.
- Keep price plus unit in one centered group. A smaller unit label still contributes to the group's width. Test estimate labels, usage statements, slogans, and domains independently.
- Check actual rendered text bounds and optical balance at normal viewing size. A centered parent does not guarantee that a child group, wrapped title, or negative letter spacing looks centered.

## Motion invariants

- Stage causal diagrams: introduce the origin, move it into position, reveal the nodes or endpoints, then draw the connections outward. Never show floating paths before their origin is established.
- Hide SVG paths with opacity as well as stroke dash offset, then enable them at draw time. Dash hiding alone can leave round-cap artifacts; a separate static base path can still leak into the frame.
- Let row entrances finish before secondary movement starts. For a uniform stagger, last completion = `start + (count - 1) * stagger + duration`. Account for different durations when relevant. Use an independent overlay for card emphasis when the row itself must not move.
- Do not stack two tweens on the same transform property unless the overlap is intentional and verified. Prefer a nested element or an opacity/border accent for emphasis during a parent's move.
- Add emphasis with a clear reveal and resolution: word stagger plus underline, a coordinated icon pulse, or a short rotation of a single glyph. Return to a stable readable state and hold it long enough to absorb.
- Reduced-motion branches affect browser preview only. They do not make a rendered MP4 respond to a viewer's preferences; offer a calmer export if requested.

## Narrative and closing pass

Remove incidental production labels and repeated filler without removing meaningful sections. Retain billing terms, estimate/range labels, and proof figures that qualify a claim. Generic example cards must not masquerade as live recorded data.

Treat the final screen as a conclusion: brand, price or offer, included usage where applicable, a large properly cased domain or product name, then the closing slogan. Animate the reveal and leave a settled hold. Adapt the structure to the product rather than copying one layout everywhere.

## Verify before export

Run the project's own commands; the following is a verified pattern, not a guarantee for every Hyperframes version:

```powershell
node --check <composition-entry>.js
npm run lint
npx --no-install hyperframes check --samples 18 --max-issues 8 --json
npx --no-install hyperframes snapshot --at "<scene-specific times>" --output <review-dir>
```

Choose timestamps from the film's beats and boundaries, not from another project. Inspect the images, not only the exit status. Check early/mid/settled states, the longest label, every price or data card revealed, and the closing hold. Watch revised motion in preview or short output clips when stills cannot resolve timing or trajectory concerns.

Interpret reports honestly: layout/contrast/craft sampling does not prove every frame is correct, and `motion.enabled: false` means automated motion analysis did not run. Resolve reported problems or document their specific limitations before calling the cut verified. If a flag is unsupported, check `npx hyperframes --help` for the current interface.

## Render and verify the artifact

Quote paths containing spaces. Choose a distinct output name; a configured render command may overwrite its default output. Keep revisions and companion exports in the project's documented output folder. GPU encoding (`--gpu`) and browser GPU rendering (`--no-browser-gpu`) are independent choices; more workers are not automatically faster or safer. Validate performance flags on the machine doing the render.

Run the render in the foreground, track it to completion, then verify the exported file with the bundled portable script (Node 18+, `ffmpeg`/`ffprobe` on PATH):

```powershell
node <skill-dir>/scripts/verify-video.mjs --video "<output>.mp4" --expected-duration <seconds>
```

On Windows, the equivalent PowerShell helper is also bundled:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-video.ps1 -Video "<output>.mp4" -ExpectedDuration <seconds>
```

It checks dimensions, FPS, frame count, H.264/AAC streams, and a full decode. For a visual-only revision that must preserve the existing encoded audio, add `--reference "<previous-cut>.mp4"` (Node) or `-ReferenceVideo "<previous-cut>.mp4"` (PowerShell); this compares AAC payload hashes. Adapt expectation parameters to other formats.

Extract and inspect key frames from the actual MP4, including proof, pricing, and closing. Listen across edited boundaries if audio timing or content changed. Preserve source audio, evidence images, and earlier exports. Never fix a visual problem by quietly altering the recording.

Report what was checked and any unresolved issue. Offer the actual output with an absolute path. A queued viewer request does not confirm the user has seen the file.

Field-tested on a Hyperframes product film. Revalidate the commands when the framework version or project structure changes; source remains authoritative.
