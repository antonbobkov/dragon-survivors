// The merchant's shop (§14.3). While `game.shop` is open the world is frozen like the level-up
// screen (§14) and the choices travel in the intent: `pick` buys an offer (main page) or a card
// (cards page), `leave` goes back from the cards page or leaves. One trade per merchant: a
// purchase or leaving closes the shop and he walks on, never to trade again. Prices are paid
// from the XP banked towards the next level (`game.xp`), so a level is never lost.
import { SHOP_ITEMS, SHOP_PRICES, SHOP_HEAL } from './content.js';
import { cardPool, applyCard } from './levelup.js';

// Shop: { merchant (his id), page: 'main' | 'cards', cards (the cards on offer on the cards page) }.
export function openShop(game, m) {
  game.shop = { merchant: m.id, page: 'main', cards: [] };
  game.sound('pickup');
}

// The cards the shop sells: the level-up pool (§14.1) at this moment, in pool order, without
// Repair (the shop heals). No random draws.
export function shopCards(game) {
  return cardPool(game).map((p) => p.card).filter((c) => c.kind !== 'repair');
}

// Offer `id` ('reroll', 'card' or 'heal'): { id, price, ok }. `ok` when the banked XP covers the
// price and the offer would do something: a card needs a non-empty pool, a heal a hurt tower.
export function shopOffer(game, id) {
  const price = SHOP_PRICES[id];
  let ok = game.xp >= price;
  if (id === 'card') ok = ok && shopCards(game).length > 0;
  if (id === 'heal') ok = ok && game.tower.hp < game.tower.maxHp;
  return { id, price, ok };
}

export function shopOffers(game) {
  return SHOP_ITEMS.map((id) => shopOffer(game, id));
}

// Instead of the world steps while the shop is open (no level-up offers open).
export function stepShop(game, intent) {
  const s = game.shop;
  if (s.page === 'cards') {
    if (intent.leave) { s.page = 'main'; s.cards = []; return; }
    const card = s.cards[intent.pick];
    if (!card || game.xp < SHOP_PRICES.card) return;
    game.xp -= SHOP_PRICES.card;
    applyCard(game, card);
    game.sound('powerup');
    closeShop(game);
    return;
  }
  if (intent.leave) { closeShop(game); return; }
  const id = SHOP_ITEMS[intent.pick];
  if (!id || !shopOffer(game, id).ok) return;
  if (id === 'card') { s.page = 'cards'; s.cards = shopCards(game); return; }
  game.xp -= SHOP_PRICES[id];
  if (id === 'reroll') game.rerolls++;
  else game.tower.hp = Math.min(game.tower.maxHp, game.tower.hp + SHOP_HEAL);
  game.sound('powerup');
  closeShop(game);
}

// The merchant walks on and will not trade again.
export function closeShop(game) {
  const m = game.merchants.find((x) => x.id === game.shop.merchant);
  if (m) { m.willTrade = false; m.trade = 0; }
  game.shop = null;
}
