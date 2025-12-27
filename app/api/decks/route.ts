import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";
import { mapDeckRow, normalizeDeckPayload, validateDeckRules } from "@/src/lib/decks";
import type { DeckSummary } from "@/src/types/deck";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload?.name || typeof payload.name !== "string") {
    return NextResponse.json({ error: "Deck name is required" }, { status: 400 });
  }

  const normalized = normalizeDeckPayload(payload);

  const ruleCheck = validateDeckRules(normalized.cards ?? []);
  if (ruleCheck.errors.length > 0) {
    return NextResponse.json({ error: ruleCheck.errors.join(" ") }, { status: 400 });
  }

  const { data: deckRow, error } = await supabase
    .from("decks")
    .insert({
      owner_id: user.id,
      name: normalized.name,
      description: normalized.description ?? null,
      format: normalized.format ?? null,
      cover_card_id: normalized.coverCardId ?? null,
      is_public: Boolean(normalized.isPublic),
    })
    .select("id")
    .single();

  if (error || !deckRow) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create deck" },
      { status: 500 }
    );
  }

  if (normalized.cards && normalized.cards.length > 0) {
    const rows = normalized.cards.map((card) => ({
      deck_id: deckRow.id,
      card_id: card.cardId,
      card_name: card.cardName,
      card_public_code: card.cardPublicCode ?? null,
      quantity: card.quantity,
      section: card.section,
      card_domains: card.cardDomains ?? [],
      card_supertype: card.cardSupertype ?? null,
      card_type: card.cardType ?? null,
    }));

    const { error: cardsError } = await supabase.from("deck_cards").insert(rows);
    if (cardsError) {
      return NextResponse.json(
        { error: cardsError.message },
        { status: 500 }
      );
    }
  }

  const { data: fullDeckRow, error: fetchError } = await supabase
    .from("decks")
    .select(
      "id, owner_id, name, description, format, cover_card_id, is_public, created_at, updated_at, deck_cards(card_id, card_name, card_public_code, quantity, section, card_domains, card_supertype, card_type)"
    )
    .eq("id", deckRow.id)
    .single();

  if (fetchError || !fullDeckRow) {
    return NextResponse.json(
      { error: fetchError?.message ?? "Deck created but could not load" },
      { status: 500 }
    );
  }

  const deck: DeckSummary = mapDeckRow(fullDeckRow);
  return NextResponse.json({ deck });
}
