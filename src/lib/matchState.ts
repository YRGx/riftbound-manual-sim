import { MatchCard, MatchState, PlayerSlot, ZoneKey } from "@/src/types/match";

const ZONES: ZoneKey[] = ["deck", "hand", "battlefield", "discard"];

function randomCardName(index: number) {
  return `Card ${index + 1}`;
}

function createPlaceholderDeck(size = 40): MatchCard[] {
  return Array.from({ length: size }, (_, idx) => ({
    uid: crypto.randomUUID(),
    name: randomCardName(idx),
    img: null,
  }));
}

export function createInitialMatchState(
  playerOneId: string,
  playerTwoId: string | null
): MatchState {
  const now = new Date().toISOString();

  return {
    players: {
      p1: {
        id: playerOneId,
        life: 20,
        zones: {
          deck: createPlaceholderDeck(),
          hand: [],
          battlefield: [],
          discard: [],
        },
      },
      p2: {
        id: playerTwoId,
        life: 20,
        zones: {
          deck: createPlaceholderDeck(),
          hand: [],
          battlefield: [],
          discard: [],
        },
      },
    },
    turn: "p1",
    phase: "main",
    createdAt: now,
  };
}

export function assignPlayerTwo(state: MatchState, playerTwoId: string) {
  state.players.p2.id = playerTwoId;
}

function shuffleArray<T>(array: T[]) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

export function shuffleDeck(state: MatchState, slot: PlayerSlot) {
  const deck = state.players[slot].zones.deck;
  shuffleArray(deck);
}

export function drawCards(state: MatchState, slot: PlayerSlot, count = 1) {
  const player = state.players[slot];
  for (let i = 0; i < count; i += 1) {
    const card = player.zones.deck.shift();
    if (!card) break;
    player.zones.hand.unshift(card);
  }
}

export function moveCardBetweenZones(
  state: MatchState,
  from: { slot: PlayerSlot; zone: ZoneKey },
  to: { slot: PlayerSlot; zone: ZoneKey },
  cardUid: string,
  position: "top" | "bottom" = "top"
) {
  const sourceZone = state.players[from.slot].zones[from.zone];
  const cardIndex = sourceZone.findIndex((card) => card.uid === cardUid);
  if (cardIndex === -1) return;

  const [card] = sourceZone.splice(cardIndex, 1);
  const destinationZone = state.players[to.slot].zones[to.zone];
  if (position === "bottom") destinationZone.push(card);
  else destinationZone.unshift(card);
}

export function mulliganHand(state: MatchState, slot: PlayerSlot) {
  const player = state.players[slot];
  const hand = player.zones.hand;
  while (hand.length) {
    const card = hand.shift();
    if (card) {
      player.zones.deck.unshift(card);
    }
  }
  shuffleDeck(state, slot);
}

export function adjustLifeTotal(state: MatchState, slot: PlayerSlot, delta: number) {
  state.players[slot].life += delta;
}

export function endTurn(state: MatchState) {
  state.turn = state.turn === "p1" ? "p2" : "p1";
  state.phase = "main";
}

export function validateZone(zone: string): zone is ZoneKey {
  return ZONES.includes(zone as ZoneKey);
}
