# Journaling Bookshelf — Higgsfield Asset Workflow

This folder holds the AI-generated assets for the Journaling Bookshelf feature.
Right now it ships **stubs only** (`journalAssets.js` has every `source: null`),
so the feature runs procedurally with no assets and no extra dependencies. This
doc is the recipe for producing the real Higgsfield assets and wiring them in.

---

## 1. What each asset is

| Asset            | Higgsfield tool   | Output       | Used as                          |
| ---------------- | ----------------- | ------------ | -------------------------------- |
| `leather`        | `generate_image`  | PNG 1024²    | `map` on the Permanent journal   |
| `holographic`    | `generate_image`  | PNG 1024²    | `map`/`emissiveMap` on Temporary |
| `lock`           | `generate_video`  | sprite sheet | "seal/lock" one-shot on save     |
| `vanish`         | `generate_video`  | sprite sheet | "dissolve" one-shot on submit    |
| `shimmer`        | `generate_video`  | sprite sheet | ambient holographic idle loop    |

The exact prompts live in [`journalAssets.js`](./journalAssets.js) (`prompt` /
`motionPrompt` fields) so the art is reproducible. Don't retype them here — edit
them there.

---

## 2. Why sprite sheets (not `VideoTexture`)

`THREE.VideoTexture` wraps an HTML `<video>` element. **There is no DOM in React
Native / `expo-gl`**, so `VideoTexture` cannot work here. (The same reason the
rest of this app is procedural — plain `THREE.TextureLoader` also depends on the
DOM `Image`.)

The performant, RN-safe equivalent is a **sprite-sheet flipbook**: one PNG atlas
of N frames, uploaded as a single GPU texture, with the material's `offset` /
`repeat` stepped each frame to show one cell. One texture, one draw call, no
video decoder. This is what `SpriteFlipbook.js` does.

> If you ever target **web** as well, `SpriteFlipbook` can be extended to use
> `THREE.VideoTexture` behind a `Platform.OS === 'web'` branch and feed it the
> raw WebM — same component API, same controller timeline.

---

## 3. Higgsfield → sprite sheet (the conversion)

1. **Generate** the motion loop in Higgsfield (`generate_video`) using the
   `motionPrompt`. Ask for a transparent/alpha background and a short, seamless
   loop (~1–1.5s). Download the **WebM (VP9 alpha)** or **MOV (ProRes 4444)** so
   transparency survives.

2. **Normalize** to the frame count declared in `journalAssets.js`
   (`frameCount`, `columns`, `rows`). For `vanish` that's 36 frames in a 6×6
   grid:

   ```bash
   # 1) extract exactly 36 evenly-spaced frames, premultiplied alpha preserved
   ffmpeg -i vanish.webm -vf "fps=30,scale=256:256" -frames:v 36 frame_%03d.png

   # 2) tile them into a 6x6 atlas (256px cells -> 1536x1536 sheet)
   ffmpeg -i frame_%03d.png -vf "tile=6x6" -frames:v 1 vanish_smoke_sheet.png
   ```

   Keep cells **power-of-two friendly** (256 or 128) and the sheet ≤ 2048² for
   mobile GPUs. 36 frames @ 30fps = the 1200ms `durationMs`.

3. **Drop** `vanish_smoke_sheet.png` into this folder.

For the **still textures** (`leather`, `holographic`) there's no tiling step —
just export the `generate_image` PNG at 1024² and drop it in.

---

## 4. Wiring it in (the one-line swap)

Add the loader dependency once:

```bash
npx expo install expo-asset
```

Then in [`journalAssets.js`](./journalAssets.js) flip the relevant `source`:

```js
// before (stub)
vanish: { source: null, /* ... */ }
// after (live)
vanish: { source: require('./vanish_smoke_sheet.png'), /* ... */ }
```

That's the whole swap. `SpriteFlipbook` detects a non-null `source`, resolves it
with `expo-asset`, uploads it to the live `expo-gl` context, and the procedural
fallback for that asset turns off automatically. Any asset left at `source: null`
keeps using its procedural fallback, so you can migrate them one at a time.

---

## 5. File checklist

```
src/assets/journal/
├── README.md                 (this file)
├── journalAssets.js          manifest + prompts  ✅ committed
├── leather_cover_albedo.png  ⬜ from generate_image
├── holo_cover_emissive.png   ⬜ from generate_image
├── lock_seal_sheet.png       ⬜ 6x4 atlas, 24 frames
├── vanish_smoke_sheet.png    ⬜ 6x6 atlas, 36 frames
└── holo_shimmer_sheet.png    ⬜ 6x4 atlas, 24 frames
```
