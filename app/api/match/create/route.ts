import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";
import { createSupabaseAdminClient } from "@/src/lib/supabaseAdmin";
import { createInitialMatchState } from "@/src/lib/matchState";

function generateCode(length = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "";
  for (let i = 0; i < length; i += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const body = (await request.json().catch(() => ({}))) as {
    spectatorsAllowed?: boolean;
  };

  const spectatorsAllowed = body.spectatorsAllowed ?? true;

  let code = "";
  let attempt = 0;
  const maxAttempts = 5;

  while (attempt < maxAttempts) {
    code = generateCode(6 + (attempt > 1 ? 1 : 0));
    const { data: existing } = await admin
      .from("matches")
      .select("id")
      .eq("code", code)
      .maybeSingle();

    if (!existing) break;
    attempt += 1;
  }

  if (!code) {
    return NextResponse.json({ error: "Could not generate match code" }, { status: 500 });
  }

  const { data: match, error: matchError } = await admin
    .from("matches")
    .insert({
      code,
      player1_id: user.id,
      spectators_allowed: spectatorsAllowed,
    })
    .select()
    .single();

  if (matchError || !match) {
    return NextResponse.json(
      { error: matchError?.message ?? "Failed to create match" },
      { status: 500 }
    );
  }

  const initialState = createInitialMatchState(user.id, null);
  const { error: stateError } = await admin
    .from("match_state")
    .insert({ match_id: match.id, state: initialState });

  if (stateError) {
    return NextResponse.json({ error: stateError.message }, { status: 500 });
  }

  await admin.from("match_events").insert({
    match_id: match.id,
    player_id: user.id,
    type: "match_created",
    payload: { spectatorsAllowed },
  });

  return NextResponse.json({ code: match.code });
}
