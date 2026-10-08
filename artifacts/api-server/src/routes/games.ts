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
  createGame,
  drawCard,
  GameRuleError,
  getGame,
  joinGame,
  passTurn,
  playCard,
  startGame,
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
    res.status(201).json(CreateGameResponse.parse(createGame(playerName)));
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
    res.json(GetGameResponse.parse(getGame(params.data.code, params.data.playerId)));
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
    res.json(JoinGameResponse.parse(joinGame(params.data.code, playerName)));
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
    res.json(
      StartGameResponse.parse(startGame(params.data.code, body.data.playerId)),
    );
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
      PlayCardResponse.parse(
        playCard(
          params.data.code,
          body.data.playerId,
          body.data.cardId,
          body.data.chosenColor,
          body.data.declareUno,
        ),
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
    res.json(
      DrawCardResponse.parse(drawCard(params.data.code, body.data.playerId)),
    );
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
    res.json(
      PassTurnResponse.parse(passTurn(params.data.code, body.data.playerId)),
    );
  } catch (err) {
    sendError(req, res, err);
  }
});

export default router;
