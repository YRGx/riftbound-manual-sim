import type { DeckSummary, DeckCardEntry, DeckSection } from "@/src/types/deck";

export const SECTION_TARGETS: Record<DeckSection, number> = {
  legend: 1,
  main: 40,
  runes: 12,
  battlefields: 3,
  side: 8,
};

export const MAX_CARD_COPIES = 3;

export function mapDeckRow(row: any): DeckSummary {
  const cards: DeckCardEntry[] = Array.isArray(row?.deck_cards)
    ? row.deck_cards.map((card: any) => ({
        cardId: card.card_id,
        cardName: card.card_name,
        cardPublicCode: card.card_public_code,
        quantity: card.quantity,
        section: (card.section ?? "main") as DeckSection,
        cardDomains: Array.isArray(card.card_domains) ? card.card_domains : [],
        cardSupertype: card.card_supertype,
        cardType: card.card_type,
        cardTags: Array.isArray(card.card_tags) ? card.card_tags : [],
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
  section: DeckSection;
  cardDomains?: string[];
  cardSupertype?: string | null;
  cardType?: string | null;
  cardTags?: string[];
}

export interface DeckPayload {
  name: string;
  description?: string;
  format?: string;
  coverCardId?: string | null;
  isPublic?: boolean;
  cards?: DeckPayloadCard[];
}

export interface DeckValidationResult {
  errors: string[];
  legendCard?: DeckPayloadCard;
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
      section: (card.section ?? "main") as DeckSection,
      cardDomains: Array.isArray(card.cardDomains) ? card.cardDomains : [],
      cardSupertype: card.cardSupertype ?? null,
      cardType: card.cardType ?? null,
      cardTags: Array.isArray(card.cardTags) ? card.cardTags : [],
    }));

  return {
    ...rest,
    cards: sanitizedCards,
  };
}

function sumSection(cards: DeckPayloadCard[], section: DeckSection) {
  return cards
    .filter((card) => card.section === section)
    .reduce((sum, card) => sum + card.quantity, 0);
}

export function validateDeckRules(cards: DeckPayloadCard[]): DeckValidationResult {
  const errors: string[] = [];
  const cardNames = new Map<string, string>();
  cards.forEach((card) => {
    if (!cardNames.has(card.cardId)) {
      cardNames.set(card.cardId, card.cardName);
    }
  });

  const legendCards = cards.filter((card) => card.section === "legend");
  const legendCount = legendCards.reduce((sum, card) => sum + card.quantity, 0);
  if (legendCount !== SECTION_TARGETS.legend) {
    errors.push("Deck must include exactly 1 legend card.");
  }
  const legendCard = legendCards[0];

  const mainCount = sumSection(cards, "main");
  if (mainCount !== SECTION_TARGETS.main) {
    errors.push("Main deck must contain exactly 40 cards.");
  }

  const runesCount = sumSection(cards, "runes");
  if (runesCount !== SECTION_TARGETS.runes) {
    errors.push("You need exactly 12 runes.");
  }

  const battlefields = cards.filter((card) => card.section === "battlefields");
  const battlefieldsCount = battlefields.reduce((sum, card) => sum + card.quantity, 0);
  if (battlefieldsCount !== SECTION_TARGETS.battlefields) {
    errors.push("Choose exactly 3 battlefields (1 copy each).");
  }
  if (battlefields.some((card) => card.quantity !== 1)) {
    errors.push("Battlefields can only be included as single copies.");
  }

  const sideCount = sumSection(cards, "side");
  if (sideCount !== SECTION_TARGETS.side) {
    errors.push("Side deck must contain exactly 8 cards.");
  }

  const combinedCounts = new Map<string, number>();
  cards
    .filter((card) => card.section === "main" || card.section === "side")
    .forEach((card) => {
      const current = combinedCounts.get(card.cardId) ?? 0;
      combinedCounts.set(card.cardId, current + card.quantity);
    });
  combinedCounts.forEach((total, cardId) => {
    if (total > MAX_CARD_COPIES) {
      const cardName = cardNames.get(cardId) ?? "A card";
      errors.push(`${cardName} exceeds the ${MAX_CARD_COPIES}-copy limit across main and side decks.`);
    }
  });

  if (legendCard) {
    const legendDomains = legendCard.cardDomains ?? [];
    const legendTags = (legendCard.cardTags ?? []).map((tag) => tag.toLowerCase());
    const championCandidates = cards.filter((card) => {
      if (card.section !== "main") {
        return false;
      }
      const supertype = card.cardSupertype?.toLowerCase() ?? "";
      const type = card.cardType?.toLowerCase() ?? "";
      return supertype === "champion" || type.includes("champion");
    });

    if (legendTags.length === 0) {
      errors.push("Legend card must include at least one tag to pair with a champion.");
    } else {
      const matchingChampion = championCandidates.find((card) => {
        const tags = (card.cardTags ?? []).map((tag) => tag.toLowerCase());
        return tags.some((tag) => legendTags.includes(tag));
      });

      if (!matchingChampion) {
        errors.push("Main deck must include a champion that shares a tag with the legend.");
      }
    }

    if (legendDomains.length > 0) {
      const runeMismatch = cards
        .filter((card) => card.section === "runes")
        .find((card) => card.cardDomains.some((domain) => !legendDomains.includes(domain)));
      if (runeMismatch) {
        errors.push("Every rune must match one of the legend's domains.");
      }
    }
  }

  return {
    errors,
    legendCard,
  };
}
