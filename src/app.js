// Screen flow and ticking (§4, §13, §14): title -> play <-> paused, level-up cards, game
// over -> Retry. No DOM: main.js feeds it timestamps and input frames, so it is tested
// under node. Only `game.tick(intent)` enters the sim.
import { Accumulator, SPEEDS } from './loop.js';
import { cardAt } from './render/screens.js';

// §19: F5 jumps the clock to 4:50.
export const DEBUG_JUMP_TO = 290;

export class App {
  // makeGame(seed) -> Game; fixedSeed: the ?seed=N value or null; randomSeed() -> a new seed;
  // audio: { play(name), resume() -> Promise }. debug: §19 tools (the page has ?debug=1;
  // makeGame must then build the Game with { debug: true }); now() -> ms, for tick timing.
  constructor({ makeGame, fixedSeed = null, randomSeed, audio, debug = false, now = () => 0 }) {
    this.makeGame = makeGame;
    this.debug = debug;
    this.now = now;
    // Loop stats for the debug overlay: ticks run in the last frame, ms per tick (smoothed).
    this.stats = { ticks: 0, tickMs: 0 };
    this.fixedSeed = fixedSeed;
    this.randomSeed = randomSeed;
    this.audio = audio;
    this.acc = new Accumulator();
    this.game = makeGame(this.nextSeed());
    this.screen = 'title'; // 'title' | 'play' | 'paused'
    this.pending = { confirm: false, pick: -1, debug: [] };
    this.cardSel = 0; // highlighted level-up card (d-pad + A), reset for every new set of offers
    this.seenOffers = null;
  }

  nextSeed() {
    return this.fixedSeed ?? this.randomSeed();
  }

  // Ticks run only while playing (title and pause stop them). The sim itself freezes in
  // 'dying' and 'over', and while level-up offers are open.
  ticking() {
    return this.screen === 'play';
  }

  // The level-up screen shows while the running game has offers open.
  levelUpOpen() {
    return this.screen === 'play' && this.game.phase === 'play' && this.game.offers.length > 0;
  }

  // A new set of offers starts with the first card highlighted.
  syncOffers() {
    if (this.game.offers !== this.seenOffers) {
      this.seenOffers = this.game.offers;
      this.cardSel = 0;
    }
  }

  start() {
    this.screen = 'play';
    this.acc.reset(); // the run starts on the next frame
    this.pending = { confirm: false, pick: -1, debug: [] };
    Promise.resolve(this.audio.resume()).then(() => this.audio.play('start_game'));
  }

  // New game with a new random seed (or the fixed ?seed), straight into play.
  retry() {
    this.game = this.makeGame(this.nextSeed());
    this.start();
  }

  // Window blur or a hidden tab pauses a running game.
  blur() {
    if (this.screen === 'play' && this.game.phase !== 'over') this.screen = 'paused';
  }

  // Game speed (§19 debug): one step along SPEEDS per + / - press.
  get speed() { return this.acc.speed; }
  changeSpeed(delta) {
    const i = SPEEDS.indexOf(this.acc.speed);
    const j = Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? SPEEDS.indexOf(1) : i) + delta));
    this.acc.speed = SPEEDS[j];
  }

  // React to one frame of input (from input.readFrame).
  handle(input) {
    if (this.debug && input.debug && input.debug.speed) this.changeSpeed(input.debug.speed);
    if (this.screen === 'title') {
      if (input.confirm || input.click) this.start();
      return;
    }
    if (this.screen === 'paused') {
      if (input.pause) this.screen = 'play';
      return;
    }
    if (this.game.phase === 'over') {
      if (input.confirm || input.click) this.retry();
      return;
    }
    if (input.pause) {
      this.screen = 'paused';
      return;
    }
    if (this.levelUpOpen()) {
      // §14.1: keys 1/2/3, a click on a card, or d-pad left/right + A. The pick reaches the
      // sim through the next tick's intent, and the sim applies it.
      this.syncOffers();
      const n = this.game.offers.length;
      if (input.nav) this.cardSel = Math.max(0, Math.min(n - 1, this.cardSel + input.nav));
      let pick = input.pick >= 0 && input.pick < n ? input.pick : -1;
      if (input.confirm) pick = this.cardSel;
      if (input.click) {
        const i = cardAt(input.click.x, input.click.y, n);
        if (i >= 0) pick = i;
      }
      if (pick >= 0) this.pending.pick = pick;
      return;
    }
    // Edge-triggered fields wait for the next tick, so a frame that runs no tick loses none.
    if (input.confirm) this.pending.confirm = true;
    if (input.pick >= 0) this.pending.pick = input.pick;
    // §19: F1–F4 / F5 queue up and reach the sim one per tick as `intent.debug`, so presses
    // made while no tick runs (a slow or throttled frame) are not lost.
    if (this.debug && input.debug) {
      for (const grant of input.debug.grants || []) this.pending.debug.push({ grant });
      if (input.debug.jump) this.pending.debug.push({ jumpTo: DEBUG_JUMP_TO });
    }
  }

  // One animation frame: handle input, then run the owed ticks. Returns the tick count.
  frame(nowMs, input) {
    this.handle(input);
    const n = this.acc.advance(nowMs, this.ticking());
    const t0 = n > 0 ? this.now() : 0;
    for (let i = 0; i < n; i++) {
      const intent = { ...input.intent, confirm: this.pending.confirm, pick: this.pending.pick };
      if (this.pending.debug.length) intent.debug = this.pending.debug.shift();
      this.pending.confirm = false;
      this.pending.pick = -1;
      this.game.tick(intent);
      for (const ev of this.game.events) if (ev.type === 'sound') this.audio.play(ev.name);
    }
    if (n > 0) {
      const ms = (this.now() - t0) / n;
      this.stats.tickMs = this.stats.tickMs ? this.stats.tickMs * 0.9 + ms * 0.1 : ms;
    }
    this.stats.ticks = n;
    this.syncOffers();
    return n;
  }
}
