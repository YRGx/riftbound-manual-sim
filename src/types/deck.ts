import type { RiftCard } from "./card";

export type DeckSection = "legend" | "main" | "runes" | "battlefields" | "side";

export interface DeckCardEntry {
  cardId: string;
  cardName: string;
  cardPublicCode?: string | null;
  quantity: number;
  section: DeckSection;
  cardDomains: string[];
  cardSupertype?: string | null;
  cardType?: string | null;
  card?: RiftCard;
}

export interface DeckSummary {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  format: string | null;
  coverCardId: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  cards: DeckCardEntry[];
}
