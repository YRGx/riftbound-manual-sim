import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";
import MatchRoom from "@/src/components/match/MatchRoom";
import type { MatchEventRecord, MatchState, MatchSummary } from "@/src/types/match";

interface MatchPageProps {
  params?: { code?: string } | Promise<{ code?: string }>;
}

export default async function MatchPage({ params }: MatchPageProps) {
  const resolvedParams = params instanceof Promise ? await params : params;
  const rawCode = resolvedParams?.code;

  if (!rawCode) {
    notFound();
  }

  const code = rawCode.toUpperCase();
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, code, player1_id, player2_id, spectators_allowed, created_at")
    .eq("code", code)
    .single();

  if (matchError || !match) {
    notFound();
  }

  const isPlayer = match.player1_id === user.id || match.player2_id === user.id;
  if (!isPlayer && !match.spectators_allowed) {
    redirect("/lobby");
  }

  const { data: stateRow } = await supabase
    .from("match_state")
    .select("state")
    .eq("match_id", match.id)
    .single();

  if (!stateRow) {
    notFound();
  }

  const { data: events } = await supabase
    .from("match_events")
    .select("id, match_id, player_id, type, payload, created_at")
    .eq("match_id", match.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <MatchRoom
      match={match as MatchSummary}
      initialState={stateRow.state as MatchState}
      initialEvents={(events ?? []) as MatchEventRecord[]}
      currentUserId={user.id}
    />
  );
}
