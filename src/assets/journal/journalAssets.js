/**
 * journalAssets.js — Higgsfield asset manifest for the Journaling Bookshelf.
 *
 * SINGLE SOURCE OF TRUTH for every AI-generated asset the bookshelf consumes.
 * The 3D layer never hard-codes a file path; it reads from here. That keeps the
 * "stub now / real asset later" swap to a one-line edit per entry.
 *
 * STUB STATE (current): every `source` is `null`. With a null source the 3D
 * layer falls back to a fully procedural material / particle effect, so the
 * feature runs in Expo Go today with ZERO new dependencies and ZERO assets.
 *
 * GOING LIVE: drop the Higgsfield exports into this folder, add
 * `expo-asset` (see README.md), and set `source: require('./<file>')`. Nothing
 * else in the feature changes. The `prompt` / `motionPrompt` fields are the
 * exact Higgsfield briefs used to generate each asset — kept in code so the
 * art is reproducible.
 *
 *   texture maps  -> still PNG, applied as `map` / `emissiveMap`
 *   motion loops  -> sprite-sheet PNG atlas (cols x rows), UV-stepped per frame
 *                    (NOT VideoTexture — see README "Why sprite sheets").
 */

// ---------------------------------------------------------------------------
// TEXTURE MAPS  (Higgsfield "generate_image", 1024² tileable)
// ---------------------------------------------------------------------------
export const JOURNAL_TEXTURES = {
  // Permanent journal — committed, archival, weighty.
  leather: {
    source: null, // require('./leather_cover_albedo.png')
    prompt:
      'Tileable seamless texture, aged oxblood leather book cover, deep grain, ' +
      'subtle gold-leaf embossed border, soft studio light, PBR albedo, no logo, ' +
      'square, 1024x1024, photoreal',
    // Optional companion maps (same Higgsfield run, "normal/roughness" variants).
    normal: null,
    roughness: null,
    fallback: { color: '#6E3B2E', roughness: 0.62, metalness: 0.08 },
  },

  // Temporary journal — ethereal, holographic, impermanent.
  holographic: {
    source: null, // require('./holo_cover_emissive.png')
    prompt:
      'Tileable seamless texture, iridescent holographic foil, soft teal-to-violet ' +
      'thin-film interference, faint flowing caustics, dark translucent base, ' +
      'emissive, square, 1024x1024',
    emissive: null, // require('./holo_cover_emissive.png')
    fallback: { color: '#1B2A4A', emissive: '#65F0E0', emissiveIntensity: 0.9 },
  },
};

// ---------------------------------------------------------------------------
// MOTION LOOPS  (Higgsfield "generate_video" -> ffmpeg sprite sheet, see README)
// ---------------------------------------------------------------------------
//
//   columns/rows : atlas grid. frameCount may be < cols*rows (trailing cells
//                  in the last row are simply unused).
//   fps          : playback rate the controller times the sequence at.
//   loop         : true  -> free-running ambient effect (idle shimmer)
//                  false -> one-shot, driven 0->1 by the controller timeline
//
export const JOURNAL_MOTION = {
  // Permanent journal: brass clasp snaps shut + a sealing-wax glow. One-shot,
  // played when an entry is committed (the "Lock" sequence).
  lock: {
    source: null, // require('./lock_seal_sheet.png')
    motionPrompt:
      'Short loopable motion, an ornate brass book clasp snapping closed over a ' +
      'leather journal, a warm wax seal igniting with a soft gold glow, clean ' +
      'alpha background, 24 frames, subtle, premium',
    columns: 6,
    rows: 4,
    frameCount: 24,
    fps: 30,
    loop: false,
    durationMs: 800, // = frameCount / fps, surfaced for the controller timeline
  },

  // Temporary journal: the cover dissolves into rising particles / smoke. One-
  // shot, played on submit while the mesh opacity is driven to 0 (the "Vanish").
  vanish: {
    source: null, // require('./vanish_smoke_sheet.png')
    motionPrompt:
      'Short loopable motion, a glowing holographic book dissolving upward into ' +
      'fine teal and violet embers and wispy smoke, particles rising and fading, ' +
      'transparent background, 36 frames, ethereal, premium',
    columns: 6,
    rows: 6,
    frameCount: 36,
    fps: 30,
    loop: false,
    durationMs: 1200,
  },

  // Temporary journal idle: a gentle holographic shimmer that loops forever
  // while the book sits on the shelf. Ambient, free-running.
  shimmer: {
    source: null, // require('./holo_shimmer_sheet.png')
    motionPrompt:
      'Seamless looping shimmer, soft iridescent light sweeping across a ' +
      'holographic surface, slow, subtle, transparent background, 24 frames',
    columns: 6,
    rows: 4,
    frameCount: 24,
    fps: 18,
    loop: true,
    durationMs: null,
  },
};

export default { JOURNAL_TEXTURES, JOURNAL_MOTION };
