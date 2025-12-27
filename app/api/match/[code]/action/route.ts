import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";
import { createSupabaseAdminClient } from "@/src/lib/supabaseAdmin";
import {
  adjustLifeTotal,
  drawCards,
  endTurn,
  moveCardBetweenZones,
  mulliganHand,
  shuffleDeck,
  validateZone,
} from "@/src/lib/matchState";
import type { MatchState, PlayerSlot, ZoneKey } from "@/src/types/match";

type ActionType =
  | "draw-card"
  | "shuffle-deck"
  | "move-card"
  | "mulligan"
  | "life-change"
  | "end-turn";

type ActionPayload = Record<string, unknown>;

function normalizePlayer(payloadPlayer: unknown, fallback: PlayerSlot): PlayerSlot {
  if (payloadPlayer === "p1" || payloadPlayer === "p2") {
    return payloadPlayer;
  }
  return fallback;
}

function ensureZone(value: unknown): ZoneKey | null {
  if (typeof value === "string" && validateZone(value)) {
    return value;
  }
  return null;
}

function cardExists(state: MatchState, slot: PlayerSlot, zone: ZoneKey, cardUid: string) {
  return state.players[slot].zones[zone].some((card) => card.uid === cardUid);
}

export async function POST(
  request: Request,
  { params }: { params: { code: string } }
) {
  const { code } = params;
  const supabase = await createSupabaseServerClient({ allowCookieWrite: true });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { type, payload } = (await request.json().catch(() => ({}))) as {
    type?: ActionType;
    payload?: ActionPayload;
  };

  if (!type) {
    return NextResponse.json({ error: "Action type is required" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const normalizedCode = code.trim().toUpperCase();

  const { data: match, error: matchError } = await admin
    .from("matches")
    .select("id, code, player1_id, player2_id, spectators_allowed")
    .eq("code", normalizedCode)
    .single();

  if (matchError || !match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  let actorSlot: PlayerSlot | null = null;
  if (match.player1_id === user.id) actorSlot = "p1";
  if (match.player2_id === user.id) actorSlot = actorSlot ?? "p2";

  if (!actorSlot) {
    return NextResponse.json({ error: "Only players can mutate the match" }, { status: 403 });
  }

  const { data: stateRow, error: stateError } = await admin
    .from("match_state")
    .select("state")
    .eq("match_id", match.id)
    .single();

  if (stateError || !stateRow) {
    return NextResponse.json({ error: stateError?.message ?? "Match state missing" }, { status: 500 });
  }

  const state = stateRow.state as MatchState;
  const resolvedPayload = payload ?? {};
  const eventPayload: Record<string, unknown> = { actor: actorSlot, type };

  switch (type) {
    case "draw-card": {
      const target = normalizePlayer(resolvedPayload.player, actorSlot);
      const count = typeof resolvedPayload.count === "number" ? resolvedPayload.count : 1;
      drawCards(state, target, Math.max(1, count));
      eventPayload.player = target;
      eventPayload.count = Math.max(1, count);
      break;
    }
    case "shuffle-deck": {
      const target = normalizePlayer(resolvedPayload.player, actorSlot);
      shuffleDeck(state, target);
      eventPayload.player = target;
      break;
    }
    case "move-card": {
      const cardUid = typeof resolvedPayload.cardUid === "string" ? resolvedPayload.cardUid : null;
      const fromSlot = normalizePlayer(resolvedPayload.fromSlot, actorSlot);
      const toSlot = normalizePlayer(resolvedPayload.toSlot, actorSlot);
      const fromZone = ensureZone(resolvedPayload.fromZone);
      const toZone = ensureZone(resolvedPayload.toZone);
      const position = resolvedPayload.position === "bottom" ? "bottom" : "top";

      if (!cardUid || !fromZone || !toZone) {
        return NextResponse.json({ error: "Invalid move parameters" }, { status: 400 });
      }

      if (!cardExists(state, fromSlot, fromZone, cardUid)) {
        return NextResponse.json({ error: "Card not found in source zone" }, { status: 400 });
      }

      moveCardBetweenZones(
        state,
        { slot: fromSlot, zone: fromZone },
        { slot: toSlot, zone: toZone },
        cardUid,
        position
      );

      eventPayload.cardUid = cardUid;
      eventPayload.from = { slot: fromSlot, zone: fromZone };
      eventPayload.to = { slot: toSlot, zone: toZone };
      eventPayload.position = position;
      break;
    }
    case "mulligan": {
      const target = normalizePlayer(resolvedPayload.player, actorSlot);
      mulliganHand(state, target);
      eventPayload.player = target;
      break;
    }
    case "life-change": {
      const target = normalizePlayer(resolvedPayload.player, actorSlot);
      const delta = typeof resolvedPayload.delta === "number" ? resolvedPayload.delta : 0;
      if (delta === 0) {
        return NextResponse.json({ error: "Delta must be non-zero" }, { status: 400 });
      }
      adjustLifeTotal(state, target, delta);
      eventPayload.player = target;
      eventPayload.delta = delta;
      break;
    }
    case "end-turn": {
      endTurn(state);
      eventPayload.turn = state.turn;
      break;
    }
    default:
      return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const { error: updateError } = await admin
    .from("match_state")
    .update({ state })
    .eq("match_id", match.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await admin.from("match_events").insert({
    match_id: match.id,
    player_id: user.id,
    type,
    payload: eventPayload,
  });

  return NextResponse.json({ success: true });
}
