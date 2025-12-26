import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";
import LobbyClient from "@/src/components/lobby/LobbyClient";
import type { MatchSummary } from "@/src/types/match";

export default async function LobbyPage() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data: matches } = await supabase
    .from("matches")
    .select("id, code, player1_id, player2_id, spectators_allowed, created_at")
    .or(`player1_id.eq.${user.id},player2_id.eq.${user.id}`)
    .order("created_at", { ascending: false });

  return (
    <LobbyClient
      initialMatches={(matches ?? []) as MatchSummary[]}
      userId={user.id}
    />
  );
}
