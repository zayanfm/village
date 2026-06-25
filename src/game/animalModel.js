/**
 * animalModel.js — Pure game logic for the co-op "Farm Animals" feed/collect loop.
 *
 * No React. No Firebase. No IO. Deterministic wall-clock math over a plain
 * `animal` map so BOTH devices (worker 3D village + youth 2D screen) compute the
 * same produce state from timestamps with zero network round-trips — exactly like
 * plotModel does for crops.
 *
 * THE MIRROR (so the timer idiom is identical to crops)
 * ─────────────────────────────────────────────────────
 *   crop  : plantedAt + growMs → growthProgress / remainingMs / isRipe
 *   animal: fedAt     + produceMs → produceProgress / animalRemainingMs / isReady
 *
 * An animal is HUNGRY (fedAt == null) → FEED stamps fedAt + a produceMs snapshot →
 * it PRODUCES on a real-time timer → once isReady, COLLECT resets it to hungry and
 * bumps its lifetime collectCount. There is NO stored "ready" flag: readiness is
 * derived purely from wall-clock, so it is offline- and co-op-safe.
 *
 * Contract: `role` is the literal 'worker' | 'youth'. The UI calls a `can*` guard,
 * then the matching reducer (feed / collect), which returns a NEW animal map (never
 * mutates). `kind` is trusted from the wire WHEN VALID (so a BOUGHT pig/chicken at a
 * new pen index persists across normalize); it falls back to ANIMAL_ROSTER for the
 * starter slots, then 'chicken'. The pen length is now DYNAMIC (3..ANIMAL_MAX) —
 * derived from the stored animals, no longer a fixed ANIMAL_COUNT truth.
 */

/* ── Tunable constants ─────────────────────────────────────────── */

/**
 * Animal catalog. Two visible rhythms: the quick chicken (egg) and the patient
 * pig (truffle). produceMs is the real time from feed → ready (demo-fast).
 */
export const ANIMALS = {
  chicken: {
    label: 'Chicken',
    emoji: '🐔',
    produceEmoji: '🥚',
    produce: 'egg',
    produceMs: 90000,
    color: '#E8C76A',
  },
  pig: {
    label: 'Pig',
    emoji: '🐖',
    produceEmoji: '🍄',
    produce: 'truffle',
    produceMs: 240000,
    color: '#E59BB0',
  },
};

/**
 * Starter pen roster — index → kind for the INITIAL seed only. Cheap on purpose:
 * 1 pig + 2 chickens. Indices are stable: [0]=pig, [1]=chicken, [2]=chicken. The
 * live pen can grow past this via the shop (bought animals append at the next index).
 */
export const ANIMAL_ROSTER = ['pig', 'chicken', 'chicken'];

/**
 * Initial animals per farm. KEPT for back-compat, but NO LONGER a global truth —
 * the live pen length is dynamic (derive from the stored animals). Use ANIMAL_MAX
 * as the cap.
 */
export const ANIMAL_COUNT = ANIMAL_ROSTER.length; // 3 (initial only)

/** Coins to buy +1 animal from the shop (pig is the patient, pricier producer). */
export const ANIMAL_PRICE = { chicken: 40, pig: 90 };

/** Hard cap on pen size (keeps the 3D pen cheap + the 2-row layout tidy). */
export const ANIMAL_MAX = 6;

/** Coins earned on collect, by produce kind (truffle is worth the most). */
export const PRODUCE_REWARD = { egg: 6, truffle: 30 };

/* ── Helpers (module-private) ──────────────────────────────────── */

function nowOr(now) {
  return typeof now === 'number' ? now : Date.now();
}

function rand(role) {
  // Defensive: only 'worker' / 'youth' are valid; anything else is treated as a
  // distinct actor so guards stay safe rather than throwing.
  return role === 'worker' ? 'worker' : role === 'youth' ? 'youth' : role || null;
}

function animalDef(kind) {
  return (kind && ANIMALS[kind]) || ANIMALS.chicken;
}

/** Effective produce time: the snapshot taken at feed, or the catalog default. */
function effectiveProduceMs(animal) {
  if (!animal) return 0;
  const def = animalDef(animal.kind);
  return animal.produceMs || def.produceMs || 0;
}

/* ── Factory ───────────────────────────────────────────────────── */

/**
 * @param {('pig'|'chicken')} [kind]
 * @returns {object} a fresh, hungry animal map (mirror of defaultGarden()).
 */
export function defaultAnimal(kind = 'chicken') {
  return {
    kind: ANIMALS[kind] ? kind : 'chicken',
    fedAt: null,
    fedBy: null,
    produceMs: 0,
    collectCount: 0,
    lastActor: null,
    lastActorAt: null,
  };
}

/* ── Produce math (pure wall-clock; mirror of plotModel growth) ── */

/** isFed — true once the animal has been fed (producing or ready). */
export function isFed(animal) {
  return Boolean(animal && animal.fedAt);
}

/**
 * produceProgress — fraction toward ready, 0..1.
 * @param {object} animal
 * @param {number} [now]
 * @returns {number}
 */
export function produceProgress(animal, now) {
  if (!isFed(animal)) return 0;
  const total = effectiveProduceMs(animal);
  if (total <= 0) return 1;
  const elapsed = nowOr(now) - animal.fedAt;
  if (elapsed <= 0) return 0;
  return Math.min(1, elapsed / total);
}

/**
 * isReady — true once a fed animal's produce timer has elapsed.
 * @param {object} animal
 * @param {number} [now]
 * @returns {boolean}
 */
export function isReady(animal, now) {
  if (!isFed(animal)) return false;
  return nowOr(now) - animal.fedAt >= effectiveProduceMs(animal);
}

/**
 * animalRemainingMs — real milliseconds left until ready. 0 when hungry or ready.
 * @param {object} animal
 * @param {number} [now]
 * @returns {number}
 */
export function animalRemainingMs(animal, now) {
  if (!isFed(animal)) return 0;
  if (isReady(animal, now)) return 0;
  return Math.max(0, effectiveProduceMs(animal) - (nowOr(now) - animal.fedAt));
}

/* ── Action guards ─────────────────────────────────────────────── */

/** canFeed — true when the animal is hungry (idle). */
export function canFeed(animal) {
  return Boolean(animal) && !isFed(animal);
}

/** canCollect — true once a fed animal is ready. */
export function canCollect(animal, now) {
  return isReady(animal, now);
}

/* ── Reducers (pure: return a NEW animal, never mutate) ─────────── */

/**
 * feed — stamp fedAt + a produceMs snapshot, record the actor, and start the
 * timer. Idempotently safe: returns the animal unchanged if not allowed.
 */
export function feed(animal, role, now) {
  const base = animal || defaultAnimal();
  if (!canFeed(base)) return base;
  const t = nowOr(now);
  const me = rand(role);
  const def = animalDef(base.kind);
  return {
    ...base,
    fedAt: t,
    fedBy: me,
    produceMs: def.produceMs,
    lastActor: me,
    lastActorAt: t,
  };
}

/**
 * collect — gather a ready animal's produce, bump its lifetime collectCount, and
 * reset it to hungry. Idempotently safe: no-op if not ready.
 */
export function collect(animal, role, now) {
  const base = animal || defaultAnimal();
  if (!canCollect(base, now)) return base;
  const t = nowOr(now);
  const me = rand(role);
  return {
    ...defaultAnimal(base.kind),
    collectCount: (base.collectCount || 0) + 1,
    lastActor: me,
    lastActorAt: t,
  };
}
