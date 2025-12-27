import type { DeckSummary, DeckCardEntry } from "@/src/types/deck";

export function mapDeckRow(row: any): DeckSummary {
  const cards: DeckCardEntry[] = Array.isArray(row?.deck_cards)
    ? row.deck_cards.map((card: any) => ({
        cardId: card.card_id,
        cardName: card.card_name,
        cardPublicCode: card.card_public_code,
        quantity: card.quantity,
      }))
    : [];

  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    description: row.description,
    format: row.format,
    coverCardId: row.cover_card_id,
    isPublic: row.is_public,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cards,
  };
}

export interface DeckPayloadCard {
  cardId: string;
  cardName: string;
  cardPublicCode?: string | null;
  quantity: number;
}

export interface DeckPayload {
  name: string;
  description?: string;
  format?: string;
  coverCardId?: string | null;
  isPublic?: boolean;
  cards?: DeckPayloadCard[];
}

export function normalizeDeckPayload(payload: DeckPayload) {
  const { cards = [], ...rest } = payload;
  const sanitizedCards = cards
    .filter((card) => card.cardId && card.cardName)
    .map((card) => ({
      cardId: card.cardId,
      cardName: card.cardName,
      cardPublicCode: card.cardPublicCode ?? null,
      quantity: Math.max(1, card.quantity ?? 1),
    }));

  return {
    ...rest,
    cards: sanitizedCards,
  };
}
