/**
 * journalAnimationController.js — DELIVERABLE 2: the Animation Controller class.
 *
 * A framework-agnostic state machine that owns the whole interaction timeline:
 *   click a book -> tween the camera in -> open the editor -> on submit play the
 *   Higgsfield seal/vanish sequence -> tween back to the idle shelf.
 *
 * It is the "Data/View separation" boundary. This class has NO React and NO JSX:
 *   - the View (Book / Canvas) reads its fields every frame inside useFrame and
 *     never re-renders because of it (cheap, 60fps);
 *   - React state (the DOM/RN editor overlay) is updated only at discrete
 *     transitions via the injected callbacks (onEnterEditing / onIdle / ...).
 *
 * Step it once per frame:  controller.update(camera, delta)
 *
 * This mirrors the inline `control` ref pattern already used in
 * YouthRoomHome.js, promoted to a reusable class as the brief requested.
 */

import * as THREE from 'three';

export const JournalState = {
  IDLE: 'idle', // resting shelf overview, books tappable
  FOCUSING: 'focusing', // camera tweening toward the chosen book
  EDITING: 'editing', // camera parked; RN editor overlay is open
  SEALING: 'sealing', // permanent: lock sequence playing, book stays
  VANISHING: 'vanishing', // temporary: dissolve playing, opacity -> 0
  RETURNING: 'returning', // camera tweening back to the shelf overview
};

const EPS_POS = 0.08; // "arrived" threshold for camera position lerps
const SCRATCH = new THREE.Vector3();

export default class BookAnimationController {
  /**
   * @param {object} [cb] discrete-transition callbacks (wired to React state)
   * @param {(book:object)=>void} [cb.onEnterEditing] camera parked on a book
   * @param {(book:object)=>void} [cb.onAnimationComplete] seal/vanish finished
   * @param {()=>void}            [cb.onIdle] returned to the shelf overview
   * @param {(state:string)=>void}[cb.onStateChange] any state transition
   */
  constructor(cb = {}) {
    this.cb = cb;
    this.books = new Map(); // id -> { id, variant, anchor:Vec3, focusPos:Vec3 }
    this.home = { position: new THREE.Vector3(0, 1.4, 6), target: new THREE.Vector3(0, 1.2, 0) };

    this.state = JournalState.IDLE;
    this.activeId = null;
    this.progress = 0; // 0..1 timeline for SEALING / VANISHING
    this._durationMs = 1000;
    this._fired = false; // guards single onAnimationComplete fire
  }

  /** Register a book and where the camera should sit when focusing it. */
  registerBook(id, { variant, anchor, focusPos }) {
    this.books.set(id, {
      id,
      variant, // 'permanent' | 'temporary'
      anchor: new THREE.Vector3(...anchor),
      focusPos: new THREE.Vector3(...focusPos),
    });
  }

  /** Set the resting overview camera framing. */
  setHome(position, target) {
    this.home.position.set(...position);
    this.home.target.set(...target);
  }

  get activeBook() {
    return this.activeId ? this.books.get(this.activeId) : null;
  }

  _setState(next) {
    if (this.state === next) return;
    this.state = next;
    this.cb.onStateChange && this.cb.onStateChange(next, this.activeBook);
  }

  // ---- intents (called from click handlers / overlay buttons) --------------

  /** Click a book: start the focus tween (ignored mid-animation). */
  focus(id) {
    if (this.state !== JournalState.IDLE) return;
    if (!this.books.has(id)) return;
    this.activeId = id;
    this.progress = 0;
    this._fired = false;
    this._setState(JournalState.FOCUSING);
  }

  /** Permanent journal saved: play the Higgsfield "lock" sequence. */
  beginSeal(durationMs) {
    if (this.state !== JournalState.EDITING) return;
    this._durationMs = durationMs || 800;
    this.progress = 0;
    this._fired = false;
    this._setState(JournalState.SEALING);
  }

  /** Temporary journal submitted: play the "vanish" + drive opacity to 0. */
  beginVanish(durationMs) {
    if (this.state !== JournalState.EDITING) return;
    this._durationMs = durationMs || 1200;
    this.progress = 0;
    this._fired = false;
    this._setState(JournalState.VANISHING);
  }

  /** Cancel editing without saving: tween straight back to the shelf. */
  cancel() {
    if (this.state === JournalState.EDITING || this.state === JournalState.FOCUSING) {
      this._setState(JournalState.RETURNING);
    }
  }

  /** Hard reset (e.g. on screen focus) so the camera is never stuck. */
  reset() {
    this.state = JournalState.IDLE;
    this.activeId = null;
    this.progress = 0;
    this._fired = false;
  }

  // ---- per-frame render state the View reads (no React churn) --------------

  /**
   * What the Book mesh should look like this frame.
   * @returns {{active:boolean, opacity:number, sealProgress:number, vanishProgress:number}}
   */
  renderStateFor(id) {
    const active = id === this.activeId;
    if (!active) return { active: false, opacity: 1, sealProgress: 0, vanishProgress: 0 };
    const vanishing = this.state === JournalState.VANISHING;
    return {
      active: true,
      // temporary book dissolves out; everything else stays solid
      opacity: vanishing ? 1 - this.progress : 1,
      sealProgress: this.state === JournalState.SEALING ? this.progress : 0,
      vanishProgress: vanishing ? this.progress : 0,
    };
  }

  // ---- the frame step ------------------------------------------------------

  /**
   * Advance camera + timeline. Call once per frame from useFrame.
   * @param {THREE.Camera} camera the live r3f camera
   * @param {number} delta seconds since last frame
   */
  update(camera, delta) {
    const book = this.activeBook;

    switch (this.state) {
      case JournalState.FOCUSING: {
        camera.position.lerp(book.focusPos, 0.12);
        camera.lookAt(book.anchor);
        if (camera.position.distanceTo(book.focusPos) < EPS_POS) {
          this._setState(JournalState.EDITING);
          this.cb.onEnterEditing && this.cb.onEnterEditing(book);
        }
        break;
      }

      case JournalState.EDITING: {
        // hold the framing steady while the overlay is open
        camera.position.lerp(book.focusPos, 0.2);
        camera.lookAt(book.anchor);
        break;
      }

      case JournalState.SEALING:
      case JournalState.VANISHING: {
        camera.position.lerp(book.focusPos, 0.2);
        camera.lookAt(book.anchor);
        this.progress = Math.min(1, this.progress + (delta * 1000) / this._durationMs);
        if (!this._fired && this.progress >= 1) {
          this._fired = true;
          this.cb.onAnimationComplete && this.cb.onAnimationComplete(book);
          this._setState(JournalState.RETURNING);
        }
        break;
      }

      case JournalState.RETURNING: {
        camera.position.lerp(this.home.position, 0.1);
        camera.lookAt(SCRATCH.copy(this.home.target));
        if (camera.position.distanceTo(this.home.position) < EPS_POS) {
          this.activeId = null;
          this.progress = 0;
          this._setState(JournalState.IDLE);
          this.cb.onIdle && this.cb.onIdle();
        }
        break;
      }

      case JournalState.IDLE:
      default:
        // overview camera is driven by the screen's orbit rig; nothing to do
        break;
    }
  }
}
