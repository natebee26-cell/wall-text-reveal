---
name: wall-text-reveal
description: Pin a word or short phrase onto a real surface in the shot (wall, container, table, sign) as 3D letters with real thickness, angled with the surface, typed in letter by letter (each letter grows out of the surface) with a soft tick per letter and a soft drop shadow, so it looks part of the scene. Remotion component for the VideoStudio. Run only when the user types /wall-text-reveal.
disable-model-invocation: true
---

# Wall text reveal

Reference look (CNN "Geran-4" reel, saved as a study, not reused): white bold sans text sits on the
side of a shipping container, angled with the wall, letters appear one by one (G → Ger → Geran- →
Geran-4, ~22 letters/sec), a soft dark shadow below-right makes it float slightly off the surface,
and it moves with the camera.

## What's here
- `assets/WallTextReveal.tsx` — the component (corner pin via CSS `matrix3d`, grapheme-safe typing,
  3D letter thickness that grows in per letter, per-letter tick + optional whoosh from the studio's
  commercial-safe library, fade-out).

3D is the default look. For the old flat text pass `depth={0}`.

## Install into the studio (once, with the user's OK)
1. Copy `assets/WallTextReveal.tsx` to `~/VideoStudio/remotion/src/custom/WallTextReveal.tsx`.
2. Use it inside a custom composition (see `src/custom/compositions.tsx`) over the footage, or wrap
   it in a `<Sequence from={…} durationInFrames={…}>` on top of the clip.

## How to place it on a surface
1. Grab one frame where the text should land:
   `~/VideoStudio/tools/ffmpeg/ffmpeg -ss <sec> -i <clip> -frames:v 1 frame.jpg`
2. Look at the frame and pick the 4 corners of the area the text should cover, in frame pixels,
   in this order: top-left, top-right, bottom-right, bottom-left. Follow the surface lines
   (container ribs, wall edges, tiles) so the angle matches. Keep the box about 2.5× wider than tall.
3. Render a single still to check placement before rendering the video:
   `./studio npx remotion still src/index.ts <id> check.png --frame=<n>` and adjust corners.
4. Camera moves? Pass keyframes instead of one quad:
   `quad: [{frame: 0, quad: [...]}, {frame: 45, quad: [...]}]` — read the corners off 2–4 frames
   (start, end, and any turn). Interpolation is linear between keys.

## Props (defaults match the reference)
| prop | default | notes |
|---|---|---|
| `text` | — | Hebrew or English; `dir` defaults to `rtl`, set `ltr` for English |
| `quad` | — | 4 corners, or keyframes |
| `durationInFrames` | — | whole overlay incl. fade-out |
| `charsPerSecond` | 22 | lower (12–15) for a calmer, more readable type-on |
| `startDelay` | 0 | frames before the first letter (sync to the spoken word) |
| `fontFamily` / `fontWeight` | Heebo / 800 | reference uses Helvetica Bold; Heebo is the Hebrew match |
| `size` | 0.42 | font size as a share of the surface height |
| `shadow` | true | soft offset shadow that sells the "on the wall" depth |
| `depth` | 14 | letter thickness in canvas px (canvas 1000×400); `0` = flat text |
| `depthColor` | `#9ea3aa` | color of the letters' sides; darker for dark text |
| `depthDir` | `[0.55, 1]` | which way the sides show; match the light/camera (e.g. `[-0.55, 1]` = down-left) |
| `popFrames` | 5 | frames for each new letter to grow to full depth |
| `tickSrc` / `tickVolume` | `library/sfx/bundled/tick.wav` / 0.35 | `''` = silent; `click.wav` is a harder alternative |
| `whooshSrc` / `whooshVolume` | `library/sfx/bundled/whoosh-quick.wav` / 0.25 | `''` = none |

## Rules
- Sound only from the studio library (commercial-safe). Never rip audio from reference videos.
- Sync `startDelay` so the last letter lands on the spoken word.
- One word or a short phrase (≤ 3 words). Longer text breaks the illusion.
- Check one still before the full render; check the final with one small contact sheet.
- Automatic camera tracking is not built in yet; for a moving shot use keyframes (step 4).
