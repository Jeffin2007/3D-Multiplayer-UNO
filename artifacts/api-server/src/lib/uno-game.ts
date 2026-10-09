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
  winnerId: string | null;
  lastAction: string | null;
  lastActivity: number;
  openingColorChooserId: string | null;
  unoCalloutPlayerId: string | null;
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
    if (now - room.lastActivity > roomTtlMs) rooms.delete(code);
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

function createDeckCard(color: UnoColor, kind: CardKind): Card {
  return makeCard(color, kind, null);
}

export function createGame(playerName: string): PublicGameState {
  cleanOldRooms();
  if (rooms.size >= maxRooms) {
    throw new GameRuleError("Rooms are temporarily full. Try again shortly.", 503);
  }
  const code = newRoomCode();
  const player: Player = { id: randomUUID(), name: playerName.trim(), hand: [] };
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
    winnerId: null,
    lastAction: `${player.name} opened the table.`,
    lastActivity: Date.now(),
    openingColorChooserId: null,
    unoCalloutPlayerId: null,
  };
  rooms.set(code, room);
  return getGameState(room, player.id);
}

export function joinGame(code: string, playerName: string): PublicGameState {
  const room = findRoom(code);
  if (room.status !== "lobby") throw new GameRuleError("This game has already started.");
  if (room.players.length >= 10) throw new GameRuleError("This room already has 10 players.");
  const player: Player = { id: randomUUID(), name: playerName.trim(), hand: [] };
  room.players.push(player);
  room.lastAction = `${player.name} joined the table.`;
  return getGameState(room, player.id);
}

export function getGame(code: string, playerId: string): PublicGameState {
  const room = findRoom(code);
  findPlayer(room, playerId);
  return getGameState(room, playerId);
}

export function startGame(code: string, playerId: string): PublicGameState {
  const room = findRoom(code);
  const host = findPlayer(room, playerId);
  if (host.id !== room.hostPlayerId) throw new GameRuleError("Only the host can start this game.", 403);
  if (room.status !== "lobby") throw new GameRuleError("This game has already started.");
  if (room.players.length < 2) throw new GameRuleError("At least two players are needed to start.");

  room.drawPile = buildDeck();
  room.discardPile = [];
  room.players.forEach((player) => { player.hand = []; });
  const startingIndex = randomInt(room.players.length);
  for (let card = 0; card < 7; card += 1) {
    for (let offset = 0; offset < room.players.length; offset += 1) {
      const player = room.players[(startingIndex + offset) % room.players.length];
      const dealt = room.drawPile.pop();
      if (!dealt) throw new GameRuleError("The deck could not be dealt.", 500);
      player.hand.push(dealt);
    }
  }

  const openingCard = room.drawPile.pop();
  if (!openingCard) throw new GameRuleError("Could not draw an opening card.", 500);
  room.discardPile.push(openingCard);
  room.currentColor = openingCard.color;
  room.currentPlayerIndex = startingIndex;
  room.direction = 1;
  room.status = "playing";
  room.openingColorChooserId = null;
  room.unoCalloutPlayerId = null;

  const firstPlayer = room.players[startingIndex];
  if (openingCard.kind === "wild" || openingCard.kind === "wild4") {
    room.currentColor = null;
    room.openingColorChooserId = firstPlayer.id;
    room.lastAction = `${firstPlayer.name} starts. Choose a color for the opening ${openingCard.label}.`;
  } else if (openingCard.kind === "skip") {
    const skipped = room.players[startingIndex];
    room.currentPlayerIndex = nextIndex(room, startingIndex);
    room.lastAction = `Opening Skip: ${skipped.name} loses their first turn.`;
  } else if (openingCard.kind === "reverse") {
    room.direction = -1;
    room.lastAction = `Opening Reverse: play is now counterclockwise. ${firstPlayer.name} starts.`;
  } else if (openingCard.kind === "draw2") {
    const drawn = drawMany(room, firstPlayer, 2);
    room.currentPlayerIndex = nextIndex(room, startingIndex);
    room.lastAction = `Opening +2: ${firstPlayer.name} drew ${drawn} cards and loses their first turn.`;
  } else {
    room.lastAction = `${firstPlayer.name} starts.`;
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

function refillDrawPile(room: Room): void {
  if (room.drawPile.length > 0 || room.discardPile.length <= 1) return;
  const top = room.discardPile.pop();
  if (!top) return;
  room.drawPile = shuffle(room.discardPile);
  room.discardPile = [top];
}

function drawOne(room: Room): Card | null {
  refillDrawPile(room);
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
  return drawn;
}

function isPlayable(room: Room, card: Card): boolean {
  if (card.kind === "wild" || card.kind === "wild4") return true;
  if (card.color === room.currentColor) return true;
  const top = room.discardPile.at(-1);
  if (!top || top.kind === "wild" || top.kind === "wild4") return false;
  if (card.kind === "number" && top.kind === "number") return card.value === top.value;
  return card.kind === top.kind;
}

function requireActiveTurn(room: Room, playerId: string): Player {
  const player = findPlayer(room, playerId);
  if (room.status !== "playing") throw new GameRuleError("The game is not in progress.");
  if (room.openingColorChooserId) {
    throw new GameRuleError("Choose a color for the opening Wild card first.");
  }
  if (currentPlayer(room).id !== playerId) {
    throw new GameRuleError("It is not your turn yet.", 403);
  }
  return player;
}

function finishTurn(room: Room): void {
  room.currentPlayerIndex = nextIndex(room, room.currentPlayerIndex);
}

export function drawCard(code: string, playerId: string): PublicGameState {
  const room = findRoom(code);
  const player = requireActiveTurn(room, playerId);
  const card = drawOne(room);
  if (!card) {
    throw new GameRuleError("There are no cards left to draw. Play a valid card instead.");
  }
  player.hand.push(card);
  room.unoCalloutPlayerId = null;
  room.lastAction = `${player.name} drew one card. Turn passes.`;
  finishTurn(room);
  return getGameState(room, playerId);
}

export function callUno(code: string, playerId: string): PublicGameState {
  const room = findRoom(code);
  const player = findPlayer(room, playerId);
  if (room.status !== "playing") throw new GameRuleError("The game is not in progress.");
  if (room.openingColorChooserId) {
    throw new GameRuleError("Choose a color for the opening Wild card first.");
  }
  if (player.hand.length === 1) {
    if (room.unoCalloutPlayerId === player.id) room.unoCalloutPlayerId = null;
    room.lastAction = `${player.name} called UNO!`;
  } else {
    const drawn = drawMany(room, player, 3);
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
    const drawn = drawMany(room, target, 3);
    room.unoCalloutPlayerId = null;
    room.lastAction = `${caller.name} caught ${target.name} without UNO. ${target.name} drew ${drawn} cards.`;
  } else {
    const drawn = drawMany(room, caller, 3);
    if (room.unoCalloutPlayerId === caller.id) room.unoCalloutPlayerId = null;
    room.lastAction = `${caller.name} called out ${target.name} incorrectly and drew ${drawn} cards.`;
  }
  return getGameState(room, playerId);
}

export function passTurn(code: string, playerId: string): PublicGameState {
  void code;
  void playerId;
  throw new GameRuleError("Passing is not allowed. Play one valid card or draw one card.");
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
    if (!openingCard || openingCard.id !== cardId || (openingCard.kind !== "wild" && openingCard.kind !== "wild4")) {
      throw new GameRuleError("Choose a color for the opening Wild card.");
    }
    if (!chosenColor || !colors.includes(chosenColor)) {
      throw new GameRuleError("Choose a color for your Wild card.");
    }

    room.currentColor = chosenColor;
    room.openingColorChooserId = null;
    const colorLabel = chosenColor[0].toUpperCase() + chosenColor.slice(1);
    if (openingCard.kind === "wild4") {
      const drawn = drawMany(room, openingPlayer, 4);
      room.currentPlayerIndex = nextIndex(room, room.currentPlayerIndex);
      room.lastAction = `${openingPlayer.name} chose ${colorLabel} for the opening +4, drew ${drawn} cards, and lost their first turn.`;
    } else {
      room.lastAction = `${openingPlayer.name} chose ${colorLabel} for the opening Wild. Their turn begins.`;
    }
    return getGameState(room, playerId);
  }

  const player = requireActiveTurn(room, playerId);
  const cardIndex = player.hand.findIndex((card) => card.id === cardId);
  if (cardIndex < 0) throw new GameRuleError("That card is not in your hand.");
  const card = player.hand[cardIndex];

  if (!isPlayable(room, card)) {
    throw new GameRuleError("That card does not match the current color or top card.");
  }
  if ((card.kind === "wild" || card.kind === "wild4") && !chosenColor) {
    throw new GameRuleError("Choose a color for your Wild card.");
  }

  const cardsAfterPlay = player.hand.length - 1;

  room.unoCalloutPlayerId = null;
  player.hand.splice(cardIndex, 1);
  room.discardPile.push(card);
  room.currentColor = card.kind === "wild" || card.kind === "wild4" ? chosenColor! : card.color;

  if (player.hand.length === 0) {
    room.status = "finished";
    room.winnerId = player.id;
    room.lastAction = `${player.name} played the last card and won!`;
    return getGameState(room, playerId);
  }

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
    const drawn = drawMany(room, player, 3);
    unoText = ` and incorrectly called UNO, drawing ${drawn} cards`;
  }
  let actionText = `${player.name} played ${card.label}${unoText}.`;

  if (card.kind === "skip") {
    const skipped = room.players[nextIndex(room, room.currentPlayerIndex)];
    room.currentPlayerIndex = nextIndex(room, room.currentPlayerIndex, 2);
    actionText = `${player.name} skipped ${skipped.name}${unoText}.`;
  } else if (card.kind === "reverse") {
    room.direction = room.direction === 1 ? -1 : 1;
    finishTurn(room);
    actionText = `${player.name} reversed direction${unoText}.`;
  } else if (card.kind === "draw2" || card.kind === "wild4") {
    const count = card.kind === "draw2" ? 2 : 4;
    const targetIndex = nextIndex(room, room.currentPlayerIndex);
    const target = room.players[targetIndex];
    const actualDrawn = drawMany(room, target, count);
    room.currentPlayerIndex = nextIndex(room, targetIndex);
    actionText =
      card.kind === "draw2"
        ? `${player.name} played +2${unoText}. ${target.name} drew ${actualDrawn} cards and lost their turn.`
        : `${player.name} played +4 and chose ${colorLabel}${unoText}. ${target.name} drew ${actualDrawn} cards and lost their turn.`;
  } else if (card.kind === "wild") {
    actionText = `${player.name} chose ${colorLabel}${unoText}.`;
    finishTurn(room);
  } else {
    finishTurn(room);
  }

  room.lastAction = actionText;
  return getGameState(room, playerId);
}

function getGameState(room: Room, playerId: string): PublicGameState {
  const me = findPlayer(room, playerId);
  const active = room.status === "playing" ? currentPlayer(room) : null;
  const topCard = room.discardPile.at(-1) ?? null;
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
    })),
    yourHand: me.hand.map((card) => ({ ...card })),
    topCard: topCard ? { ...topCard } : null,
    currentColor: room.currentColor,
    currentPlayerId: active?.id ?? null,
    direction: room.direction === 1 ? "clockwise" : "counterclockwise",
    drawPileCount: room.drawPile.length,
    hasDrawn: false,
    drawnCardId: null,
    winnerId: room.winnerId,
    lastAction: room.lastAction,
    canStart:
      room.status === "lobby" &&
      room.hostPlayerId === playerId &&
      room.players.length >= 2,
  };
}
