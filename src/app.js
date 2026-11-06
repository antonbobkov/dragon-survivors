// Screen flow and ticking (§4, §13): title -> play <-> paused, game over -> Retry.
// No DOM: main.js feeds it timestamps and input frames, so it is tested under node.
// Only `game.tick(intent)` enters the sim.
import { Accumulator } from './loop.js';

export class App {
  // makeGame(seed) -> Game; fixedSeed: the ?seed=N value or null; randomSeed() -> a new seed;
  // audio: { play(name), resume() -> Promise }.
  constructor({ makeGame, fixedSeed = null, randomSeed, audio }) {
    this.makeGame = makeGame;
    this.fixedSeed = fixedSeed;
    this.randomSeed = randomSeed;
    this.audio = audio;
    this.acc = new Accumulator();
    this.game = makeGame(this.nextSeed());
    this.screen = 'title'; // 'title' | 'play' | 'paused'
    this.pending = { confirm: false, pick: -1 };
  }

  nextSeed() {
    return this.fixedSeed ?? this.randomSeed();
  }

  // Ticks run only while playing (title and pause stop them; the sim itself freezes in
  // 'dying' and 'over').
  ticking() {
    return this.screen === 'play';
  }

  start() {
    this.screen = 'play';
    this.acc.reset(); // the run starts on the next frame
    this.pending = { confirm: false, pick: -1 };
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

  // React to one frame of input (from input.readFrame).
  handle(input) {
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
    // Edge-triggered fields wait for the next tick, so a frame that runs no tick loses none.
    if (input.confirm) this.pending.confirm = true;
    if (input.pick >= 0) this.pending.pick = input.pick;
  }

  // One animation frame: handle input, then run the owed ticks. Returns the tick count.
  frame(nowMs, input) {
    this.handle(input);
    const n = this.acc.advance(nowMs, this.ticking());
    for (let i = 0; i < n; i++) {
      const intent = { ...input.intent, confirm: this.pending.confirm, pick: this.pending.pick };
      this.pending.confirm = false;
      this.pending.pick = -1;
      this.game.tick(intent);
      for (const ev of this.game.events) if (ev.type === 'sound') this.audio.play(ev.name);
    }
    return n;
  }
}
