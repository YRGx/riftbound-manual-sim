import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";
import { mapDeckRow, normalizeDeckPayload, validateDeckRules } from "@/src/lib/decks";
import type { DeckSummary } from "@/src/types/deck";

interface Params {
  params: { id: string };
}

export async function PUT(request: NextRequest, { params }: Params) {
  const deckId = params.id;
  if (!deckId) {
    return NextResponse.json({ error: "Deck id missing" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient({ allowCookieWrite: true });
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: deckOwner } = await supabase
    .from("decks")
    .select("id")
    .eq("id", deckId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!deckOwner) {
    return NextResponse.json({ error: "Deck not found" }, { status: 404 });
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

  const { error: updateError } = await supabase
    .from("decks")
    .update({
      name: normalized.name,
      description: normalized.description ?? null,
      format: normalized.format ?? null,
      cover_card_id: normalized.coverCardId ?? null,
      is_public: Boolean(normalized.isPublic),
    })
    .eq("id", deckId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  // Replace deck cards with new payload
  const { error: deleteError } = await supabase.from("deck_cards").delete().eq("deck_id", deckId);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  if (normalized.cards && normalized.cards.length > 0) {
    const rows = normalized.cards.map((card) => ({
      deck_id: deckId,
      card_id: card.cardId,
      card_name: card.cardName,
      card_public_code: card.cardPublicCode ?? null,
      quantity: card.quantity,
      section: card.section,
      card_domains: card.cardDomains ?? [],
      card_supertype: card.cardSupertype ?? null,
      card_type: card.cardType ?? null,
    }));

    const { error: insertError } = await supabase.from("deck_cards").insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  const { data: fullDeckRow, error: fetchError } = await supabase
    .from("decks")
    .select(
      "id, owner_id, name, description, format, cover_card_id, is_public, created_at, updated_at, deck_cards(card_id, card_name, card_public_code, quantity, section, card_domains, card_supertype, card_type)"
    )
    .eq("id", deckId)
    .single();

  if (fetchError || !fullDeckRow) {
    return NextResponse.json(
      { error: fetchError?.message ?? "Deck saved but could not load" },
      { status: 500 }
    );
  }

  const deck: DeckSummary = mapDeckRow(fullDeckRow);
  return NextResponse.json({ deck });
}
