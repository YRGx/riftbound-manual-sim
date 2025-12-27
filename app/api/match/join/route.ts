import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";
import { createSupabaseAdminClient } from "@/src/lib/supabaseAdmin";
import { assignPlayerTwo } from "@/src/lib/matchState";
import type { MatchState } from "@/src/types/match";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient({ allowCookieWrite: true });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { code } = (await request.json().catch(() => ({}))) as { code?: string };
  if (!code) {
    return NextResponse.json({ error: "Match code is required" }, { status: 400 });
  }

  const normalizedCode = code.trim().toUpperCase();
  const admin = createSupabaseAdminClient();

  const { data: match, error: matchError } = await admin
    .from("matches")
    .select("id, code, player1_id, player2_id, spectators_allowed")
    .eq("code", normalizedCode)
    .single();

  if (matchError || !match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  if (match.player1_id === user.id || match.player2_id === user.id) {
    return NextResponse.json({ code: match.code, status: "already_joined" });
  }

  if (match.player2_id) {
    return NextResponse.json({ error: "Match is already full" }, { status: 409 });
  }

  const { error: updateError } = await admin
    .from("matches")
    .update({ player2_id: user.id })
    .eq("id", match.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { data: stateRow, error: stateError } = await admin
    .from("match_state")
    .select("state")
    .eq("match_id", match.id)
    .single();

  if (stateError || !stateRow) {
    return NextResponse.json({ error: stateError?.message ?? "State missing" }, { status: 500 });
  }

  const state = stateRow.state as MatchState;
  assignPlayerTwo(state, user.id);

  const { error: stateUpdateError } = await admin
    .from("match_state")
    .update({ state })
    .eq("match_id", match.id);

  if (stateUpdateError) {
    return NextResponse.json({ error: stateUpdateError.message }, { status: 500 });
  }

  await admin.from("match_events").insert({
    match_id: match.id,
    player_id: user.id,
    type: "player_joined",
    payload: { slot: "p2" },
  });

  return NextResponse.json({ code: match.code });
}
