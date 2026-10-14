import { randomInt, randomUUID } from "node:crypto";

export type UnoColor = "red" | "yellow" | "green" | "blue";
export type CardKind = "number" | "skip" | "reverse" | "draw2" | "wild" | "wild4";
export type GameStatus = "lobby" | "playing" | "finished";

export interface Card {
  id: string;
  color: UnoColor | null;
  kind: CardKind;
  value: number | null;
  label: string;
}

interface Player {
  id: string;
  name: string;
  hand: Card[];
  penaltyCount: number;
  maxHandCount: number;
  bluffsAttempted: number;
  bluffsSuccessful: number;
  bluffsCaught: number;
}

export interface TurnHistoryPoint {
  turn: number;
  [playerId: string]: number;
}

export interface PostGameStats {
  villainPlayerId: string | null;
  villainPlayerName: string | null;
  villainPenalties: number;
  hoarderPlayerId: string | null;
  hoarderPlayerName: string | null;
  hoarderPeakHand: number;
  gamblerPlayerId: string | null;
  gamblerPlayerName: string | null;
  gamblerSubtitle: string | null;
  turnHistory: TurnHistoryPoint[];
}

export interface PendingChallenge {
  culpritPlayerId: string;
  victimPlayerId: string;
  chosenColor: UnoColor;
  activeColorBeforePlay: UnoColor | null;
  culpritDeclaredUno: boolean;
  victimOriginalIndex: number;
  culpritHandBefore: Card[];
  expiresAt: number;
  cardLabel: string;
  timeoutId?: NodeJS.Timeout;
}

interface Room {
  code: string;
  status: GameStatus;
  hostPlayerId: string;
  players: Player[];
  drawPile: Card[];
  discardPile: Card[];
  currentColor: UnoColor | null;
  currentPlayerIndex: number;
  direction: 1 | -1;
  hasDrawn: boolean;
  drawnCardId: string | null;
  winnerId: string | null;
  lastAction: string | null;
  lastActivity: number;
  openingColorChooserId: string | null;
  unoCalloutPlayerId: string | null;
  bluffingAllowed: boolean;
  hoveredCardIndex: number | null;
  hoveredPlayerId: string | null;
  pendingChallenge: PendingChallenge | null;
  revealedHand: { playerId: string; playerName: string; cards: Card[]; isBluff: boolean } | null;
  turnCount: number;
  turnHistory: TurnHistoryPoint[];
  stats: PostGameStats | null;
}

export interface PublicGameState {
  code: string;
  status: GameStatus;
  hostPlayerId: string;
  youPlayerId: string;
  players: {
    id: string;
    name: string;
    handCount: number;
    isHost: boolean;
    isYou: boolean;
    hoveredCardIndex?: number | null;
  }[];
  yourHand: Card[];
  topCard: Card | null;
  currentColor: UnoColor | null;
  currentPlayerId: string | null;
  direction: "clockwise" | "counterclockwise";
  drawPileCount: number;
  hasDrawn: boolean;
  drawnCardId: string | null;
  winnerId: string | null;
  lastAction: string | null;
  canStart: boolean;
  bluffingAllowed: boolean;
  pendingChallenge: {
    culpritPlayerId: string;
    culpritPlayerName: string;
    victimPlayerId: string;
    victimPlayerName: string;
    isYouVictim: boolean;
    isYouCulprit: boolean;
    expiresInSeconds: number;
  } | null;
  revealedHand: {
    playerId: string;
    playerName: string;
    cards: Card[];
    isBluff: boolean;
  } | null;
  postGameStats: PostGameStats | null;
}

export class GameRuleError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "GameRuleError";
  }
}

const rooms = new Map<string, Room>();
const roomTtlMs = 6 * 60 * 60 * 1000;
const maxRooms = 500;
const colors: UnoColor[] = ["red", "yellow", "green", "blue"];
const codeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const UNO_PENALTY_CARDS = 2; // Official Mattel rule

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function makeCard(color: UnoColor | null, kind: CardKind, value: number | null): Card {
  const labels: Record<CardKind, string> = {
    number: String(value),
    skip: "SKIP",
    reverse: "REV",
    draw2: "+2",
    wild: "WILD",
    wild4: "+4",
  };
  return { id: randomUUID(), color, kind, value, label: labels[kind] };
}

function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const color of colors) {
    deck.push(makeCard(color, "number", 0));
    for (let value = 1; value <= 9; value += 1) {
      deck.push(makeCard(color, "number", value), makeCard(color, "number", value));
    }
    for (const kind of ["skip", "reverse", "draw2"] as const) {
      deck.push(makeCard(color, kind, null), makeCard(color, kind, null));
    }
  }
  for (let i = 0; i < 4; i += 1) {
    deck.push(makeCard(null, "wild", null), makeCard(null, "wild4", null));
  }
  return shuffle(deck);
}

function newRoomCode(): string {
  let code = "";
  do {
    code = Array.from({ length: 6 }, () => codeAlphabet[randomInt(codeAlphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function cleanOldRooms(now = Date.now()): void {
  for (const [code, room] of rooms) {
    if (now - room.lastActivity > roomTtlMs) {
      if (room.pendingChallenge?.timeoutId) {
        clearTimeout(room.pendingChallenge.timeoutId);
      }
      rooms.delete(code);
    }
  }
}

function findRoom(code: string): Room {
  cleanOldRooms();
  const room = rooms.get(code.trim().toUpperCase());
  if (!room) throw new GameRuleError("That room code was not found.", 404);
  room.lastActivity = Date.now();
  return room;
}

function findPlayer(room: Room, playerId: string): Player {
  const player = room.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new GameRuleError("Your seat is not in this room. Rejoin with the room code.", 404);
  return player;
}

export function createGame(playerName: string): PublicGameState {
  cleanOldRooms();
  if (rooms.size >= maxRooms) {
    throw new GameRuleError("Rooms are temporarily full. Try again shortly.", 503);
  }
  const code = newRoomCode();
  const player: Player = {
    id: randomUUID(),
    name: playerName.trim(),
    hand: [],
    penaltyCount: 0,
    maxHandCount: 0,
    bluffsAttempted: 0,
    bluffsSuccessful: 0,
    bluffsCaught: 0,
  };
  const room: Room = {
    code,
    status: "lobby",
    hostPlayerId: player.id,
    players: [player],
    drawPile: [],
    discardPile: [],
    currentColor: null,
    currentPlayerIndex: 0,
    direction: 1,
    hasDrawn: false,
    drawnCardId: null,
    winnerId: null,
    lastAction: `${player.name} opened the table.`,
    lastActivity: Date.now(),
    openingColorChooserId: null,
    unoCalloutPlayerId: null,
    bluffingAllowed: true,
    hoveredCardIndex: null,
    hoveredPlayerId: null,
    pendingChallenge: null,
    revealedHand: null,
    turnCount: 0,
    turnHistory: [],
    stats: null,
  };
  rooms.set(code, room);
  return getGameState(room, player.id);
}

export function joinGame(code: string, playerName: string): PublicGameState {
  const room = findRoom(code);
  if (room.status !== "lobby") throw new GameRuleError("This game has already started.");
  if (room.players.length >= 10) throw new GameRuleError("This room already has 10 players.");
  const player: Player = {
    id: randomUUID(),
    name: playerName.trim(),
    hand: [],
    penaltyCount: 0,
    maxHandCount: 0,
    bluffsAttempted: 0,
    bluffsSuccessful: 0,
    bluffsCaught: 0,
  };
  room.players.push(player);
  room.lastAction = `${player.name} joined the table.`;
  return getGameState(room, player.id);
}

export function getGame(code: string, playerId: string): PublicGameState {
  const room = findRoom(code);
  findPlayer(room, playerId);

  // Check if pending challenge expired
  if (room.pendingChallenge && Date.now() > room.pendingChallenge.expiresAt) {
    resolveChallenge(code, room.pendingChallenge.victimPlayerId, "accept");
  }

  return getGameState(room, playerId);
}

function currentPlayer(room: Room): Player {
  return room.players[room.currentPlayerIndex];
}

function nextIndex(room: Room, index: number, steps = 1): number {
  const count = room.players.length;
  return ((index + room.direction * steps) % count + count) % count;
}

function recordTurnHistory(room: Room): void {
  room.turnCount += 1;
  const point: TurnHistoryPoint = { turn: room.turnCount };
  for (const p of room.players) {
    point[p.id] = p.hand.length;
    if (p.hand.length > p.maxHandCount) {
      p.maxHandCount = p.hand.length;
    }
  }
  room.turnHistory.push(point);
}

function advanceTurn(room: Room, steps = 1): void {
  const count = room.players.length;
  room.currentPlayerIndex = ((room.currentPlayerIndex + steps * room.direction) % count + count) % count;
  room.hasDrawn = false;
  room.drawnCardId = null;
  room.hoveredCardIndex = null;
  room.hoveredPlayerId = null;
  recordTurnHistory(room);
}

function ensureDrawPile(room: Room): boolean {
  if (room.drawPile.length > 0) return true;
  if (room.discardPile.length <= 1) return false;

  const topCard = room.discardPile.pop()!;
  const cardsToRecycle = room.discardPile.splice(0, room.discardPile.length);

  for (const c of cardsToRecycle) {
    if (c.kind === "wild" || c.kind === "wild4") {
      c.color = null;
    }
  }

  room.drawPile = shuffle(cardsToRecycle);
  room.discardPile = [topCard];
  return room.drawPile.length > 0;
}

function drawOne(room: Room): Card | null {
  const available = ensureDrawPile(room);
  if (!available) return null;
  return room.drawPile.pop() ?? null;
}

function drawMany(room: Room, player: Player, count: number): number {
  let drawn = 0;
  for (let i = 0; i < count; i += 1) {
    const card = drawOne(room);
    if (!card) break;
    player.hand.push(card);
    drawn += 1;
  }
  if (player.hand.length > player.maxHandCount) {
    player.maxHandCount = player.hand.length;
  }
  return drawn;
}

/**
 * Shared validation logic for both uno-game.ts and App.tsx
 */
export function isCardPlayable(
  card: Card,
  topCard: Card | null,
  activeColor: UnoColor | null,
  playerHand: Card[],
  hasDrawn: boolean,
  drawnCardId: string | null,
  strictWild4Rule = true,
): boolean {
  if (!topCard) return false;

  // 1. If the player already drew a card this turn, they can ONLY play that drawn card
  if (hasDrawn && card.id !== drawnCardId) {
    return false;
  }

  // 2. Standard Wild is always playable
  if (card.kind === "wild") {
    return true;
  }

  // 3. Wild Draw 4: When strictWild4Rule is true, requires having NO cards matching activeColor
  if (card.kind === "wild4") {
    if (!strictWild4Rule || !activeColor) return true;
    const hasMatchingColorInHand = playerHand.some(
      (c) => c.id !== card.id && c.color === activeColor,
    );
    return !hasMatchingColorInHand;
  }

  // 4. Color match
  if (activeColor && card.color === activeColor) {
    return true;
  }

  // 5. Number match (only when both cards are 'number' cards)
  if (card.kind === "number" && topCard.kind === "number") {
    return card.value === topCard.value;
  }

  // 6. Action symbol match (skip, reverse, draw2)
  if (card.kind !== "number" && card.kind === topCard.kind) {
    return true;
  }

  return false;
}

export function calculateRoundPoints(room: Room, winnerId: string): number {
  let points = 0;
  for (const player of room.players) {
    if (player.id === winnerId) continue;
    for (const card of player.hand) {
      if (card.kind === "number") {
        points += card.value ?? 0;
      } else if (card.kind === "skip" || card.kind === "reverse" || card.kind === "draw2") {
        points += 20;
      } else if (card.kind === "wild" || card.kind === "wild4") {
        points += 50;
      }
    }
  }
  return points;
}

function computePostGameStats(room: Room): PostGameStats {
  let villainPlayerId: string | null = null;
  let villainPlayerName: string | null = null;
  let maxPenalties = -1;

  let hoarderPlayerId: string | null = null;
  let hoarderPlayerName: string | null = null;
  let maxHand = -1;

  let gamblerPlayerId: string | null = null;
  let gamblerPlayerName: string | null = null;
  let gamblerSubtitle: string | null = null;
  let maxSuccessfulBluffs = 0;
  let maxCaughtBluffs = 0;

  for (const p of room.players) {
    if (p.penaltyCount > maxPenalties) {
      maxPenalties = p.penaltyCount;
      villainPlayerId = p.id;
      villainPlayerName = p.name;
    }
    if (p.maxHandCount > maxHand) {
      maxHand = p.maxHandCount;
      hoarderPlayerId = p.id;
      hoarderPlayerName = p.name;
    }
    if (p.bluffsSuccessful > maxSuccessfulBluffs) {
      maxSuccessfulBluffs = p.bluffsSuccessful;
      gamblerPlayerId = p.id;
      gamblerPlayerName = p.name;
      gamblerSubtitle = `Master Bluffer: Pulled off ${p.bluffsSuccessful} high-stakes +4 bluff(s) undetected!`;
    }
  }

  if (!gamblerPlayerId) {
    for (const p of room.players) {
      if (p.bluffsCaught > maxCaughtBluffs) {
        maxCaughtBluffs = p.bluffsCaught;
        gamblerPlayerId = p.id;
        gamblerPlayerName = p.name;
        gamblerSubtitle = `Caught Red-Handed: Busted ${p.bluffsCaught} time(s) trying to sneak a +4!`;
      }
    }
  }

  if (!gamblerPlayerId && room.winnerId) {
    const winner = room.players.find((p) => p.id === room.winnerId);
    if (winner) {
      gamblerPlayerId = winner.id;
      gamblerPlayerName = winner.name;
      gamblerSubtitle = "Calculated Play: Kept cards close and played by the book.";
    }
  }

  return {
    villainPlayerId,
    villainPlayerName,
    villainPenalties: Math.max(0, maxPenalties),
    hoarderPlayerId,
    hoarderPlayerName,
    hoarderPeakHand: Math.max(0, maxHand),
    gamblerPlayerId,
    gamblerPlayerName,
    gamblerSubtitle,
    turnHistory: room.turnHistory,
  };
}

export function startGame(code: string, playerId: string): PublicGameState {
  const room = findRoom(code);
  const host = findPlayer(room, playerId);
  if (host.id !== room.hostPlayerId) throw new GameRuleError("Only the host can start this game.", 403);
  if (room.status !== "lobby") throw new GameRuleError("This game has already started.");
  if (room.players.length < 2) throw new GameRuleError("At least two players are needed to start.");

  if (room.pendingChallenge?.timeoutId) {
    clearTimeout(room.pendingChallenge.timeoutId);
  }

  room.drawPile = buildDeck();
  room.discardPile = [];
  room.turnCount = 0;
  room.turnHistory = [];
  room.pendingChallenge = null;
  room.revealedHand = null;
  room.stats = null;
  room.hoveredCardIndex = null;
  room.hoveredPlayerId = null;
  room.players.forEach((player) => {
    player.hand = [];
    player.penaltyCount = 0;
    player.maxHandCount = 7;
    player.bluffsAttempted = 0;
    player.bluffsSuccessful = 0;
    player.bluffsCaught = 0;
  });

  const startingIndex = randomInt(room.players.length);
  for (let card = 0; card < 7; card += 1) {
    for (let offset = 0; offset < room.players.length; offset += 1) {
      const player = room.players[(startingIndex + offset) % room.players.length];
      const dealt = room.drawPile.pop();
      if (!dealt) throw new GameRuleError("The deck could not be dealt.", 500);
      player.hand.push(dealt);
    }
  }

  // 1. Fix Opening Wild Draw 4 & First-Card Setup
  let openingCard = room.drawPile.pop();
  if (!openingCard) throw new GameRuleError("Could not draw an opening card.", 500);

  // Official Rule: Wild Draw 4 cannot be the starting card - reshuffle until non-wild4
  while (openingCard.kind === "wild4") {
    room.drawPile.push(openingCard);
    room.drawPile = shuffle(room.drawPile);
    openingCard = room.drawPile.pop();
    if (!openingCard) throw new GameRuleError("Could not draw an opening card.", 500);
  }

  room.discardPile.push(openingCard);
  room.currentColor = openingCard.color; // null if standard 'wild'
  room.currentPlayerIndex = startingIndex;
  room.direction = 1;
  room.status = "playing";
  room.hasDrawn = false;
  room.drawnCardId = null;
  room.openingColorChooserId = null;
  room.unoCalloutPlayerId = null;

  const firstPlayer = room.players[startingIndex];
  if (openingCard.kind === "wild") {
    room.currentColor = null;
    room.openingColorChooserId = firstPlayer.id;
    room.lastAction = `${firstPlayer.name} starts. Choose a color for the opening ${openingCard.label}.`;
  } else if (openingCard.kind === "skip") {
    const skipped = room.players[startingIndex];
    room.currentPlayerIndex = nextIndex(room, startingIndex, 1);
    room.lastAction = `Opening Skip: ${skipped.name} loses their first turn.`;
  } else if (openingCard.kind === "reverse") {
    room.direction = -1;
    if (room.players.length === 2) {
      room.currentPlayerIndex = nextIndex(room, startingIndex, 1);
      room.lastAction = `Opening Reverse: 2-player skip. ${firstPlayer.name} is skipped.`;
    } else {
      room.lastAction = `Opening Reverse: play is now counterclockwise. ${firstPlayer.name} starts.`;
    }
  } else if (openingCard.kind === "draw2") {
    const drawn = drawMany(room, firstPlayer, 2);
    room.currentPlayerIndex = nextIndex(room, startingIndex, 1);
    room.lastAction = `Opening +2: ${firstPlayer.name} drew ${drawn} cards and loses their first turn.`;
  } else {
    room.lastAction = `${firstPlayer.name} starts.`;
  }

  recordTurnHistory(room);
  return getGameState(room, playerId);
}

function requireActiveTurn(room: Room, playerId: string): Player {
  const player = findPlayer(room, playerId);
  if (room.status !== "playing") throw new GameRuleError("The game is not in progress.");
  if (room.openingColorChooserId) {
    throw new GameRuleError("Choose a color for the opening Wild card first.");
  }
  if (room.pendingChallenge) {
    throw new GameRuleError("A Wild Draw 4 challenge is currently underway.");
  }
  if (currentPlayer(room).id !== playerId) {
    throw new GameRuleError("It is not your turn yet.", 403);
  }
  return player;
}

export function drawCard(code: string, playerId: string): PublicGameState {
  const room = findRoom(code);
  const player = requireActiveTurn(room, playerId);
  if (room.hasDrawn) {
    throw new GameRuleError("You have already drawn a card this turn.");
  }

  const hasCardsAvailable = ensureDrawPile(room);
  const topCard = room.discardPile.at(-1) ?? null;

  if (!hasCardsAvailable) {
    const canPlayAnything = player.hand.some((c) =>
      isCardPlayable(c, topCard, room.currentColor, player.hand, false, null, !room.bluffingAllowed),
    );
    if (!canPlayAnything) {
      room.unoCalloutPlayerId = null;
      room.lastAction = `${player.name} could not draw (deck exhausted) and passed turn.`;
      advanceTurn(room, 1);
      return getGameState(room, playerId);
    }
    throw new GameRuleError("No cards left in deck, and you have a playable card in hand!");
  }

  const drawn = room.drawPile.pop()!;
  player.hand.push(drawn);
  room.unoCalloutPlayerId = null;

  const canPlayDrawnCard = isCardPlayable(
    drawn,
    topCard,
    room.currentColor,
    player.hand,
    false,
    null,
    !room.bluffingAllowed,
  );

  room.hoveredCardIndex = null;
  room.hoveredPlayerId = null;

  if (canPlayDrawnCard) {
    room.hasDrawn = true;
    room.drawnCardId = drawn.id;
    room.lastAction = `${player.name} drew a playable card (${drawn.label}). Play it or pass.`;
  } else {
    room.lastAction = `${player.name} drew one card. Turn passes.`;
    advanceTurn(room, 1);
  }

  return getGameState(room, playerId);
}

export function passTurn(code: string, playerId: string): PublicGameState {
  const room = findRoom(code);
  const player = requireActiveTurn(room, playerId);

  const deckEmpty = room.drawPile.length === 0 && room.discardPile.length <= 1;

  if (!room.hasDrawn && !deckEmpty) {
    throw new GameRuleError("You must draw a card before passing.");
  }

  room.unoCalloutPlayerId = null;
  room.hoveredCardIndex = null;
  room.hoveredPlayerId = null;
  room.lastAction = `${player.name} passed the turn.`;
  advanceTurn(room, 1);
  return getGameState(room, playerId);
}

export function callUno(code: string, playerId: string): PublicGameState {
  const room = findRoom(code);
  const player = findPlayer(room, playerId);
  if (room.status !== "playing") throw new GameRuleError("The game is not in progress.");
  if (room.openingColorChooserId) {
    throw new GameRuleError("Choose a color for the opening Wild card first.");
  }
  if (player.hand.length === 1 || (player.hand.length === 2 && currentPlayer(room).id === player.id)) {
    if (room.unoCalloutPlayerId === player.id) room.unoCalloutPlayerId = null;
    room.lastAction = `${player.name} called UNO!`;
  } else {
    const drawn = drawMany(room, player, UNO_PENALTY_CARDS);
    if (room.unoCalloutPlayerId === player.id) room.unoCalloutPlayerId = null;
    room.lastAction = `${player.name} called UNO incorrectly and drew ${drawn} cards.`;
  }
  return getGameState(room, playerId);
}

export function callOutUno(
  code: string,
  playerId: string,
  targetPlayerId: string,
): PublicGameState {
  const room = findRoom(code);
  const caller = findPlayer(room, playerId);
  const target = findPlayer(room, targetPlayerId);
  if (room.status !== "playing") throw new GameRuleError("The game is not in progress.");
  if (room.openingColorChooserId) {
    throw new GameRuleError("Choose a color for the opening Wild card first.");
  }

  if (
    caller.id !== target.id &&
    room.unoCalloutPlayerId === target.id &&
    target.hand.length === 1
  ) {
    const drawn = drawMany(room, target, UNO_PENALTY_CARDS);
    room.unoCalloutPlayerId = null;
    room.lastAction = `${caller.name} caught ${target.name} without UNO. ${target.name} drew ${drawn} cards.`;
  } else {
    const drawn = drawMany(room, caller, UNO_PENALTY_CARDS);
    if (room.unoCalloutPlayerId === caller.id) room.unoCalloutPlayerId = null;
    room.lastAction = `${caller.name} called out ${target.name} incorrectly and drew ${drawn} cards.`;
  }
  return getGameState(room, playerId);
}

export function setHoverTelemetry(code: string, playerId: string, cardIndex: number | null): PublicGameState {
  const room = findRoom(code);
  if (room.status === "playing" && currentPlayer(room).id === playerId) {
    room.hoveredPlayerId = playerId;
    room.hoveredCardIndex = cardIndex;
  }
  return getGameState(room, playerId);
}

export function toggleBluffing(code: string, playerId: string, allowed?: boolean): PublicGameState {
  const room = findRoom(code);
  const player = findPlayer(room, playerId);
  if (player.id !== room.hostPlayerId) throw new GameRuleError("Only the host can toggle game rules.", 403);
  room.bluffingAllowed = allowed ?? !room.bluffingAllowed;
  room.lastAction = `Wild Draw 4 Bluffing is now ${room.bluffingAllowed ? "ENABLED" : "DISABLED"}.`;
  return getGameState(room, playerId);
}

export function resolveChallenge(code: string, playerId: string, decision: "accept" | "challenge"): PublicGameState {
  const room = findRoom(code);
  if (!room.pendingChallenge) {
    throw new GameRuleError("No pending challenge found.");
  }
  const { culpritPlayerId, victimPlayerId, victimOriginalIndex, culpritHandBefore, activeColorBeforePlay, cardLabel, timeoutId } = room.pendingChallenge;
  if (playerId !== victimPlayerId) {
    throw new GameRuleError("Only the targeted player can decide on the challenge.", 403);
  }

  if (timeoutId) {
    clearTimeout(timeoutId);
  }

  const culprit = findPlayer(room, culpritPlayerId);
  const victim = findPlayer(room, victimPlayerId);
  room.pendingChallenge = null;
  room.hoveredCardIndex = null;
  room.hoveredPlayerId = null;

  if (decision === "accept") {
    // Victim accepts +4 cards and loses turn
    const drawn = drawMany(room, victim, 4);
    culprit.penaltyCount += drawn;

    const wasBluffing = Boolean(activeColorBeforePlay && culpritHandBefore.some((c) => c.color === activeColorBeforePlay));
    if (wasBluffing) {
      culprit.bluffsSuccessful += 1;
      culprit.bluffsAttempted += 1;
    }

    room.lastAction = `${victim.name} accepted the +4 from ${culprit.name}, drew ${drawn} cards, and was skipped.`;
    room.revealedHand = null;

    if (culprit.hand.length === 0) {
      room.status = "finished";
      room.winnerId = culprit.id;
      const points = calculateRoundPoints(room, culprit.id);
      room.stats = computePostGameStats(room);
      room.lastAction = `${culprit.name} played their last card (${cardLabel})! ${victim.name} accepted and drew ${drawn} cards. ${culprit.name} won with ${points} points!`;
      return getGameState(room, playerId);
    }
    // Turn advances past victim
    advanceTurn(room, 2);
  } else {
    // Challenged! Check if culprit was holding any card matching activeColorBeforePlay
    const wasBluffing = Boolean(activeColorBeforePlay && culpritHandBefore.some((c) => c.color === activeColorBeforePlay));

    room.revealedHand = {
      playerId: culprit.id,
      playerName: culprit.name,
      cards: culprit.hand.map((c) => ({ ...c })),
      isBluff: wasBluffing,
    };

    if (wasBluffing) {
      // Culprit was caught bluffing! Culprit draws 4 penalty cards and victim takes their turn!
      culprit.bluffsCaught += 1;
      culprit.bluffsAttempted += 1;
      victim.bluffsSuccessful += 1;

      const drawn = drawMany(room, culprit, 4);
      victim.penaltyCount += drawn;
      room.lastAction = `CHALLENGE SUCCESSFUL! ${culprit.name} was caught bluffing with a matching card! ${culprit.name} drew 4 penalty cards. ${victim.name} takes the turn!`;
      // Victim gets to play their turn
      room.currentPlayerIndex = victimOriginalIndex;
      recordTurnHistory(room);
    } else {
      // Culprit was innocent! Victim draws 4 + 2 = 6 cards and is skipped!
      culprit.bluffsSuccessful += 1;
      const drawn = drawMany(room, victim, 6);
      culprit.penaltyCount += drawn;
      room.lastAction = `CHALLENGE FAILED! ${culprit.name} had NO matching color. ${victim.name} drew 6 cards (4 + 2 penalty) and was skipped!`;

      if (culprit.hand.length === 0) {
        room.status = "finished";
        room.winnerId = culprit.id;
        const points = calculateRoundPoints(room, culprit.id);
        room.stats = computePostGameStats(room);
        room.lastAction = `${culprit.name} played their last card! Challenge failed, ${victim.name} drew ${drawn} cards. ${culprit.name} won with ${points} points!`;
        return getGameState(room, playerId);
      }
      advanceTurn(room, 2);
    }
  }

  return getGameState(room, playerId);
}

export function playCard(
  code: string,
  playerId: string,
  cardId: string,
  chosenColor: UnoColor | null | undefined,
  declareUno: boolean,
): PublicGameState {
  const room = findRoom(code);
  if (room.openingColorChooserId) {
    const openingPlayer = findPlayer(room, playerId);
    const openingCard = room.discardPile.at(-1);
    if (room.openingColorChooserId !== playerId) {
      throw new GameRuleError("Only the first player can choose the opening color.", 403);
    }
    if (!openingCard || openingCard.id !== cardId || openingCard.kind !== "wild") {
      throw new GameRuleError("Choose a color for the opening Wild card.");
    }
    if (!chosenColor || !colors.includes(chosenColor)) {
      throw new GameRuleError("Choose a color for your Wild card.");
    }

    room.currentColor = chosenColor;
    room.openingColorChooserId = null;
    const colorLabel = chosenColor[0].toUpperCase() + chosenColor.slice(1);
    room.lastAction = `${openingPlayer.name} chose ${colorLabel} for the opening Wild. Their turn begins.`;
    return getGameState(room, playerId);
  }

  const player = requireActiveTurn(room, playerId);
  const cardIndex = player.hand.findIndex((card) => card.id === cardId);
  if (cardIndex < 0) throw new GameRuleError("That card is not in your hand.");
  const card = player.hand[cardIndex];
  const topCard = room.discardPile.at(-1) ?? null;

  if (!isCardPlayable(card, topCard, room.currentColor, player.hand, room.hasDrawn, room.drawnCardId, !room.bluffingAllowed)) {
    throw new GameRuleError("That card cannot be legally played right now.");
  }
  if ((card.kind === "wild" || card.kind === "wild4") && !chosenColor) {
    throw new GameRuleError("Choose a color for your Wild card.");
  }

  const cardsAfterPlay = player.hand.length - 1;
  const culpritHandBefore = player.hand.filter((c) => c.id !== card.id);

  room.unoCalloutPlayerId = null;
  room.revealedHand = null;
  player.hand.splice(cardIndex, 1);
  room.discardPile.push(card);

  // Always reset drawn card and hover tracking when playing a card
  room.hasDrawn = false;
  room.drawnCardId = null;
  room.hoveredCardIndex = null;
  room.hoveredPlayerId = null;

  const activeColorBeforePlay = room.currentColor;
  room.currentColor = card.kind === "wild" || card.kind === "wild4" ? chosenColor! : card.color;

  const colorLabel = room.currentColor
    ? room.currentColor[0].toUpperCase() + room.currentColor.slice(1)
    : "";
  let unoText = "";
  if (cardsAfterPlay === 1) {
    if (declareUno) {
      unoText = " and called UNO";
    } else {
      room.unoCalloutPlayerId = player.id;
      unoText = " and did not call UNO";
    }
  } else if (declareUno) {
    const drawn = drawMany(room, player, UNO_PENALTY_CARDS);
    unoText = ` and incorrectly called UNO, drawing ${drawn} cards`;
  }
  let actionText = `${player.name} played ${card.label}${unoText}.`;

  // 1. Check for Wild Draw 4 with Bluffing (only when culprit still has remaining cards in hand!)
  // If player.hand.length === 0, they played their final card: no challenge is permitted (hand is empty, so innocent),
  // and the +4 penalty executes immediately with round points awarded!
  if (card.kind === "wild4" && room.bluffingAllowed && player.hand.length > 0) {
    const targetIndex = nextIndex(room, room.currentPlayerIndex, 1);
    const target = room.players[targetIndex];

    if (room.pendingChallenge?.timeoutId) {
      clearTimeout(room.pendingChallenge.timeoutId);
    }

    const timeoutId = setTimeout(() => {
      try {
        const curRoom = rooms.get(code);
        if (curRoom?.pendingChallenge && curRoom.pendingChallenge.victimPlayerId === target.id) {
          resolveChallenge(code, target.id, "accept");
        }
      } catch {
        // Ignored
      }
    }, 12500);

    room.pendingChallenge = {
      culpritPlayerId: player.id,
      victimPlayerId: target.id,
      chosenColor: chosenColor!,
      activeColorBeforePlay,
      culpritDeclaredUno: declareUno,
      victimOriginalIndex: targetIndex,
      culpritHandBefore,
      expiresAt: Date.now() + 12000, // 12 seconds decision window
      cardLabel: card.label,
      timeoutId,
    };
    room.lastAction = `${player.name} played +4 and chose ${colorLabel}${unoText}! Showdown: ${target.name} must Accept (+4) or Challenge Bluff!`;
    return getGameState(room, playerId);
  }

  if (card.kind === "draw2" || card.kind === "wild4") {
    const count = card.kind === "draw2" ? 2 : 4;
    const targetIndex = nextIndex(room, room.currentPlayerIndex, 1);
    const target = room.players[targetIndex];
    const actualDrawn = drawMany(room, target, count);
    player.penaltyCount += actualDrawn;
    actionText =
      card.kind === "draw2"
        ? `${player.name} played +2${unoText}. ${target.name} drew ${actualDrawn} cards and lost their turn.`
        : `${player.name} played +4 and chose ${colorLabel}${unoText}. ${target.name} drew ${actualDrawn} cards and lost their turn.`;

    if (player.hand.length === 0) {
      room.status = "finished";
      room.winnerId = player.id;
      const points = calculateRoundPoints(room, player.id);
      room.stats = computePostGameStats(room);
      room.lastAction = `${player.name} played their final card (${card.label})! ${target.name} drew ${actualDrawn} cards. ${player.name} won with ${points} points!`;
      return getGameState(room, playerId);
    }
    advanceTurn(room, 2);
  } else if (player.hand.length === 0) {
    room.status = "finished";
    room.winnerId = player.id;
    const points = calculateRoundPoints(room, player.id);
    room.stats = computePostGameStats(room);
    room.lastAction = `${player.name} played the last card and won with ${points} points!`;
    return getGameState(room, playerId);
  } else if (card.kind === "skip") {
    const skipped = room.players[nextIndex(room, room.currentPlayerIndex, 1)];
    advanceTurn(room, 2);
    actionText = `${player.name} skipped ${skipped.name}${unoText}.`;
  } else if (card.kind === "reverse") {
    if (room.players.length === 2) {
      advanceTurn(room, 2);
      actionText = `${player.name} played Reverse (acts as Skip in 2-player)${unoText}.`;
    } else {
      room.direction = (room.direction * -1) as 1 | -1;
      advanceTurn(room, 1);
      actionText = `${player.name} reversed direction${unoText}.`;
    }
  } else if (card.kind === "wild") {
    actionText = `${player.name} chose ${colorLabel}${unoText}.`;
    advanceTurn(room, 1);
  } else {
    advanceTurn(room, 1);
  }

  room.lastAction = actionText;
  return getGameState(room, playerId);
}

function getGameState(room: Room, playerId: string): PublicGameState {
  const me = findPlayer(room, playerId);
  const active = room.status === "playing" ? currentPlayer(room) : null;
  const topCard = room.discardPile.at(-1) ?? null;

  let pendingChallenge: PublicGameState["pendingChallenge"] = null;
  if (room.pendingChallenge) {
    const culprit = room.players.find((p) => p.id === room.pendingChallenge!.culpritPlayerId);
    const victim = room.players.find((p) => p.id === room.pendingChallenge!.victimPlayerId);
    pendingChallenge = {
      culpritPlayerId: room.pendingChallenge.culpritPlayerId,
      culpritPlayerName: culprit?.name ?? "Opponent",
      victimPlayerId: room.pendingChallenge.victimPlayerId,
      victimPlayerName: victim?.name ?? "Target",
      isYouVictim: room.pendingChallenge.victimPlayerId === playerId,
      isYouCulprit: room.pendingChallenge.culpritPlayerId === playerId,
      expiresInSeconds: Math.max(0, Math.ceil((room.pendingChallenge.expiresAt - Date.now()) / 1000)),
    };
  }

  return {
    code: room.code,
    status: room.status,
    hostPlayerId: room.hostPlayerId,
    youPlayerId: playerId,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      handCount: player.hand.length,
      isHost: player.id === room.hostPlayerId,
      isYou: player.id === playerId,
      hoveredCardIndex: room.hoveredPlayerId === player.id ? room.hoveredCardIndex : null,
    })),
    yourHand: me.hand.map((card) => ({ ...card })),
    topCard: topCard ? { ...topCard } : null,
    currentColor: room.currentColor,
    currentPlayerId: active?.id ?? null,
    direction: room.direction === 1 ? "clockwise" : "counterclockwise",
    drawPileCount: room.drawPile.length,
    hasDrawn: room.hasDrawn,
    drawnCardId: room.drawnCardId,
    winnerId: room.winnerId,
    lastAction: room.lastAction,
    canStart:
      room.status === "lobby" &&
      room.hostPlayerId === playerId &&
      room.players.length >= 2,
    bluffingAllowed: room.bluffingAllowed,
    pendingChallenge,
    revealedHand: room.pendingChallenge ? null : room.revealedHand,
    postGameStats: room.stats ?? (room.status === "finished" ? computePostGameStats(room) : null),
  };
}
