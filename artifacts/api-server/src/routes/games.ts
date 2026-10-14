import { Router, type IRouter, type Request, type Response } from "express";
import {
  CreateGameBody,
  CreateGameResponse,
  DrawCardBody,
  DrawCardParams,
  DrawCardResponse,
  GetGameParams,
  GetGameResponse,
  JoinGameBody,
  JoinGameParams,
  JoinGameResponse,
  PassTurnBody,
  PassTurnParams,
  PassTurnResponse,
  PlayCardBody,
  PlayCardParams,
  PlayCardResponse,
  StartGameBody,
  StartGameParams,
  StartGameResponse,
} from "@workspace/api-zod";
import {
  callOutUno,
  callUno,
  createGame,
  drawCard,
  GameRuleError,
  getGame,
  joinGame,
  passTurn,
  playCard,
  resolveChallenge,
  setHoverTelemetry,
  startGame,
  toggleBluffing,
} from "../lib/uno-game";

const router: IRouter = Router();

function sendError(
  req: Request,
  res: Response,
  err: unknown,
): void {
  if (err instanceof GameRuleError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  req.log.error({ err }, "UNO game action failed");
  res.status(500).json({ error: "The game could not complete that action." });
}

router.post("/games", (req, res): void => {
  const body = CreateGameBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const playerName = body.data.playerName.trim();
  if (!playerName) {
    res.status(400).json({ error: "Enter a player name." });
    return;
  }
  try {
    res.status(201).json(createGame(playerName));
  } catch (err) {
    sendError(req, res, err);
  }
});

router.get("/games/:code/players/:playerId", (req, res): void => {
  const params = GetGameParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    res.json(getGame(params.data.code, params.data.playerId));
  } catch (err) {
    sendError(req, res, err);
  }
});

router.post("/games/:code/join", (req, res): void => {
  const params = JoinGameParams.safeParse(req.params);
  const body = JoinGameBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: !params.success ? params.error.message : body.error?.message ?? "Invalid request.",
    });
    return;
  }
  const playerName = body.data.playerName.trim();
  if (!playerName) {
    res.status(400).json({ error: "Enter a player name." });
    return;
  }
  try {
    res.json(joinGame(params.data.code, playerName));
  } catch (err) {
    sendError(req, res, err);
  }
});

router.post("/games/:code/start", (req, res): void => {
  const params = StartGameParams.safeParse(req.params);
  const body = StartGameBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: !params.success ? params.error.message : body.error?.message ?? "Invalid request.",
    });
    return;
  }
  try {
    res.json(startGame(params.data.code, body.data.playerId));
  } catch (err) {
    sendError(req, res, err);
  }
});

router.post("/games/:code/play", (req, res): void => {
  const params = PlayCardParams.safeParse(req.params);
  const body = PlayCardBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: !params.success ? params.error.message : body.error?.message ?? "Invalid request.",
    });
    return;
  }
  try {
    res.json(
      playCard(
        params.data.code,
        body.data.playerId,
        body.data.cardId,
        body.data.chosenColor,
        body.data.declareUno,
      ),
    );
  } catch (err) {
    sendError(req, res, err);
  }
});

router.post("/games/:code/draw", (req, res): void => {
  const params = DrawCardParams.safeParse(req.params);
  const body = DrawCardBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: !params.success ? params.error.message : body.error?.message ?? "Invalid request.",
    });
    return;
  }
  try {
    res.json(drawCard(params.data.code, body.data.playerId));
  } catch (err) {
    sendError(req, res, err);
  }
});

router.post("/games/:code/uno", (req, res): void => {
  const params = GetGameParams.safeParse(req.params);
  const body = DrawCardBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: !params.success ? params.error.message : body.error?.message ?? "Invalid request.",
    });
    return;
  }
  try {
    res.json(callUno(params.data.code, body.data.playerId));
  } catch (err) {
    sendError(req, res, err);
  }
});

router.post("/games/:code/pass", (req, res): void => {
  const params = PassTurnParams.safeParse(req.params);
  const body = PassTurnBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: !params.success ? params.error.message : body.error?.message ?? "Invalid request.",
    });
    return;
  }
  try {
    const updatedState = passTurn(params.data.code, body.data.playerId);
    res.json(updatedState);
  } catch (err) {
    sendError(req, res, err);
  }
});

router.post("/games/:code/callout", (req, res): void => {
  const params = GetGameParams.safeParse(req.params);
  const body = req.body as { playerId?: unknown; targetPlayerId?: unknown } | null;
  if (
    !params.success ||
    !body ||
    typeof body.playerId !== "string" ||
    body.playerId.trim().length === 0 ||
    typeof body.targetPlayerId !== "string" ||
    body.targetPlayerId.trim().length === 0
  ) {
    res.status(400).json({
      error: !params.success
        ? params.error.message
        : "Both playerId and targetPlayerId are required.",
    });
    return;
  }
  try {
    res.json(callOutUno(params.data.code, body.playerId, body.targetPlayerId));
  } catch (err) {
    sendError(req, res, err);
  }
});

router.post("/games/:code/telemetry", (req, res): void => {
  const params = GetGameParams.safeParse(req.params);
  const body = req.body as { playerId?: unknown; cardIndex?: unknown } | null;
  if (!params.success || !body || typeof body.playerId !== "string") {
    res.status(400).json({ error: "Invalid request payload." });
    return;
  }
  const cardIndex = typeof body.cardIndex === "number" ? body.cardIndex : null;
  try {
    res.json(setHoverTelemetry(params.data.code, body.playerId, cardIndex));
  } catch (err) {
    sendError(req, res, err);
  }
});

router.post("/games/:code/toggle-bluffing", (req, res): void => {
  const params = GetGameParams.safeParse(req.params);
  const body = req.body as { playerId?: unknown; allowed?: unknown } | null;
  if (!params.success || !body || typeof body.playerId !== "string") {
    res.status(400).json({ error: "Invalid request payload." });
    return;
  }
  const allowed = typeof body.allowed === "boolean" ? body.allowed : undefined;
  try {
    res.json(toggleBluffing(params.data.code, body.playerId, allowed));
  } catch (err) {
    sendError(req, res, err);
  }
});

router.post("/games/:code/challenge", (req, res): void => {
  const params = GetGameParams.safeParse(req.params);
  const body = req.body as { playerId?: unknown; decision?: unknown } | null;
  if (
    !params.success ||
    !body ||
    typeof body.playerId !== "string" ||
    (body.decision !== "accept" && body.decision !== "challenge")
  ) {
    res.status(400).json({ error: "decision must be 'accept' or 'challenge'." });
    return;
  }
  try {
    res.json(resolveChallenge(params.data.code, body.playerId, body.decision));
  } catch (err) {
    sendError(req, res, err);
  }
});

export default router;
