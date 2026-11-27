// Screen flow and ticking (§4, §13, §14): title <-> armoury, title -> play <-> paused,
// level-up cards, game over (gold) -> Retry. No DOM: main.js feeds it timestamps, input
// frames and a storage wrapper, so it is tested under node. Only `game.tick(intent)` enters
// the sim; the armoury reaches it only as the `meta` a Game is built with (§13.1).
import { Accumulator, SPEEDS } from './loop.js';
import { cardAt, inRect, ARMOURY_BUTTON } from './render/screens.js';
import { armouryNav, armouryItemAt, cellItem, ITEMS, RESET, BACK } from './render/armoury.js';
import { createStore, metaFromRanks, goldFor, addGold, buy, refundAll, totalSpent } from './armoury.js';
import { Shake } from './render/shake.js';

// §19: F5 jumps the clock to 4:50.
export const DEBUG_JUMP_TO = 290;

export class App {
  // makeGame(seed, meta) -> Game (meta from the armoury's ranks, §13.1); fixedSeed: the
  // ?seed=N value or null; randomSeed() -> a new seed; audio: { play(name), resume() ->
  // Promise }. debug: §19 tools (the page has ?debug=1; makeGame must then build the Game
  // with { debug: true }); now() -> ms, for tick timing. store: { load() -> purse,
  // save(purse) } (armoury.js createStore); the default keeps the purse in memory only.
  // shake: screen shake on (§5; the page's ?shake=0 turns it off).
  constructor({ makeGame, fixedSeed = null, randomSeed, audio, debug = false, now = () => 0, store = createStore(null), shake = true }) {
    this.makeGame = makeGame;
    this.debug = debug;
    this.now = now;
    // Loop stats for the debug overlay: ticks run in the last frame, ms per tick (smoothed).
    this.stats = { ticks: 0, tickMs: 0 };
    this.fixedSeed = fixedSeed;
    this.randomSeed = randomSeed;
    this.audio = audio;
    this.acc = new Accumulator();
    this.shake = new Shake(shake); // fed by the sim's shake events, read by the renderer (§5)
    this.store = store;
    this.purse = store.load(); // { gold, ranks } (§13.1)
    this.armourySel = 0; // highlighted armoury item
    this.resetArmed = false; // the armoury's Reset waits for its confirm
    this.ranksAtOpen = '';
    this.goldGame = null; // the game whose gold has been paid out
    this.goldEarned = 0; // gold earned by that game
    this.game = makeGame(this.nextSeed(), this.meta());
    this.screen = 'title'; // 'title' | 'armoury' | 'play' | 'paused' | 'bestiary'
    this.bestiaryFrom = 'play'; // the screen the bestiary returns to when closed (§17.1)
    this.pending = { confirm: false, pick: -1, debug: [] };
    this.cardSel = 0; // highlighted level-up card (d-pad + A), reset for every new set of offers
    this.seenOffers = null;
  }

  nextSeed() {
    return this.fixedSeed ?? this.randomSeed();
  }

  // The sim's `meta` for the current ranks (§4.1, §13.1).
  meta() {
    return metaFromRanks(this.purse.ranks);
  }

  setPurse(purse) {
    this.purse = purse;
    this.store.save(purse);
  }

  openArmoury() {
    this.screen = 'armoury';
    this.armourySel = 0;
    this.resetArmed = false;
    this.ranksAtOpen = JSON.stringify(this.purse.ranks);
  }

  // Back to the title. If the ranks changed, the title's unticked game is rebuilt (same
  // seed) so the run that starts from it uses them.
  closeArmoury() {
    this.screen = 'title';
    this.resetArmed = false;
    if (JSON.stringify(this.purse.ranks) !== this.ranksAtOpen) this.game = this.makeGame(this.game.seed, this.meta());
  }

  // Enter / A / a click on armoury item `i`: buy a rank, Reset (twice: arm, then refund), Back.
  activateArmoury(i) {
    if (i === BACK) { this.closeArmoury(); return; }
    if (i === RESET) {
      if (this.resetArmed) {
        this.setPurse(refundAll(this.purse));
        this.resetArmed = false;
        this.audio.play('pickup');
      } else {
        this.resetArmed = totalSpent(this.purse) > 0;
      }
      return;
    }
    this.resetArmed = false;
    const { track, type } = cellItem(i);
    const next = buy(this.purse, track, type);
    if (next) {
      this.setPurse(next);
      this.audio.play('powerup');
    }
  }

  handleArmoury(input) {
    if (input.armoury || input.pause || input.back) { this.closeArmoury(); return; }
    const m = input.menu || { x: 0, y: 0 };
    if (m.x || m.y) {
      const sel = armouryNav(this.armourySel, m.x, m.y);
      if (sel !== this.armourySel) this.resetArmed = false;
      this.armourySel = sel;
    }
    let act = input.confirm ? this.armourySel : -1;
    if (input.click) {
      const i = armouryItemAt(input.click.x, input.click.y);
      if (i >= 0) {
        if (i !== this.armourySel) this.resetArmed = false;
        this.armourySel = act = i;
      }
    }
    if (act >= 0 && act < ITEMS) this.activateArmoury(act);
  }

  // Pays out a finished run's gold, once per game (§13.1).
  payGold() {
    if (this.game.phase !== 'over' || this.goldGame === this.game) return;
    this.goldGame = this.game;
    this.goldEarned = goldFor(this.game.score());
    this.setPurse(addGold(this.purse, this.goldEarned));
  }

  // The gold line of the game-over screen ({ earned, purse }), or null before the payout.
  goldLine() {
    return this.goldGame === this.game ? { earned: this.goldEarned, purse: this.purse.gold } : null;
  }

  // Ticks run only while playing (title, pause and the bestiary stop them). The sim itself
  // freezes in 'dying' and 'over', and while level-up offers are open.
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
    this.game = this.makeGame(this.nextSeed(), this.meta());
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
      // §13.1: U / Y or a click on the Armoury button opens the armoury; any other click,
      // Enter or A starts the run.
      if (input.armoury || (input.click && inRect(ARMOURY_BUTTON, input.click.x, input.click.y))) this.openArmoury();
      else if (input.confirm || input.click) this.start();
      return;
    }
    if (this.screen === 'armoury') {
      this.handleArmoury(input);
      return;
    }
    // §17.1: Tab / Back opens the bestiary during a run (from play or pause; ticks stop);
    // Tab, Back, Esc, P or Start closes it, back to where it was opened.
    if (this.screen === 'bestiary') {
      if (input.bestiary || input.pause) this.screen = this.bestiaryFrom;
      return;
    }
    if (input.bestiary && this.game.phase !== 'over') {
      this.bestiaryFrom = this.screen;
      this.screen = 'bestiary';
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
      for (const ev of this.game.events) {
        if (ev.type === 'sound') this.audio.play(ev.name);
        else if (ev.type === 'shake') this.shake.add(ev.kind, nowMs);
      }
    }
    if (n > 0) {
      const ms = (this.now() - t0) / n;
      this.stats.tickMs = this.stats.tickMs ? this.stats.tickMs * 0.9 + ms * 0.1 : ms;
    }
    this.stats.ticks = n;
    this.payGold();
    this.syncOffers();
    return n;
  }
}
