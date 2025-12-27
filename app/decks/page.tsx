import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";
import DeckBuilderClient from "@/src/components/decks/DeckBuilderClient";
import { mapDeckRow } from "@/src/lib/decks";
import type { DeckSummary } from "@/src/types/deck";

export default async function DecksPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth");
  }

  const { data, error } = await supabase
    .from("decks")
    .select(
      "id, owner_id, name, description, format, cover_card_id, is_public, created_at, updated_at, deck_cards(card_id, card_name, card_public_code, quantity)"
    )
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error(error);
  }

  const decks: DeckSummary[] = Array.isArray(data) ? data.map(mapDeckRow) : [];

  return <DeckBuilderClient initialDecks={decks} />;
}
