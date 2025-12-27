"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { SECTION_TARGETS, validateDeckRules } from "@/src/lib/decks";
import type { DeckSummary, DeckCardEntry, DeckSection } from "@/src/types/deck";
import type { RiftCard, RiftCardListResponse } from "@/src/types/card";

interface DeckBuilderClientProps {
  initialDecks: DeckSummary[];
}

type WorkingDeck = {
  id?: string;
  name: string;
  description: string;
  format: string;
  isPublic: boolean;
  coverCardId: string | null;
  cards: DeckCardEntry[];
};

const MAX_CARD_COPIES = 3;
const DRAG_MIME = "application/riftbound-card";

const SECTION_LABELS: Record<DeckSection, string> = {
  legend: "Legend",
  main: "Main Deck",
  runes: "Runes",
  battlefields: "Battlefields",
  side: "Side Deck",
};

const SECTION_HINTS: Record<DeckSection, string> = {
  legend: "Exactly 1 legend defines your colors.",
  main: "Exactly 40 cards, includes your legend's champion.",
  runes: "Exactly 12 runes that match the legend's domains.",
  battlefields: "Pick 3 unique battlefields (1 copy each).",
  side: "Exactly 8 cards you can pivot into during matches.",
};

const HEADER_LINKS = ["Decks", "Proxies"];

const LIBRARY_TABS = [
  { id: "legend", label: "Legend", helper: "Select the commander that sets your colors." },
  { id: "main", label: "Main Deck", helper: "Browse units, spells, and relics." },
  { id: "battlefields", label: "Battlefields", helper: "Every deck needs three arenas." },
  { id: "runes", label: "Runes", helper: "Twelve runes must match your legend." },
] as const;

type LibraryTab = (typeof LIBRARY_TABS)[number]["id"];

const STUDIO_TABS = [
  { id: "legend", label: "Preview" },
  { id: "main", label: "Main Deck" },
  { id: "battlefields", label: "Battlefields" },
  { id: "side", label: "Side Deck" },
  { id: "runes", label: "Runes" },
] as const;

type StudioTab = (typeof STUDIO_TABS)[number]["id"];

const SECTION_ACCENTS: Record<DeckSection, { border: string; badge: string }> = {
  legend: { border: "border-[#f6d38e]/60", badge: "text-[#f6d38e]" },
  main: { border: "border-[#7ce7f4]/40", badge: "text-[#7ce7f4]" },
  runes: { border: "border-[#b487ff]/40", badge: "text-[#c9a2ff]" },
  battlefields: { border: "border-[#ff9c73]/40", badge: "text-[#ffb590]" },
  side: { border: "border-[#9ce39a]/40", badge: "text-[#c9ffb8]" },
};

const SECTION_GRID_COLUMNS: Record<DeckSection, string> = {
  legend: "grid-cols-1 sm:grid-cols-2",
  main: "grid-cols-3 sm:grid-cols-4 xl:grid-cols-5",
  runes: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
  battlefields: "grid-cols-2 sm:grid-cols-3",
  side: "grid-cols-3 sm:grid-cols-5 xl:grid-cols-6",
};

const LIBRARY_PAGE_SIZE = 60;

const emptyDeck = (): WorkingDeck => ({
  name: "Untitled Prototype",
  description: "",
  format: "Origins",
  isPublic: false,
  coverCardId: null,
  cards: [],
});

function toWorkingDeck(deck?: DeckSummary): WorkingDeck {
  if (!deck) {
    return emptyDeck();
  }

  return {
    id: deck.id,
    name: deck.name,
    description: deck.description ?? "",
    format: deck.format ?? "Origins",
    isPublic: deck.isPublic,
    coverCardId: deck.coverCardId,
    cards: deck.cards.map((card) => ({ ...card })),
  };
}

function createEntry(card: RiftCard, section: DeckSection, quantity = 1): DeckCardEntry {
  return {
    cardId: card.id,
    cardName: card.name,
    cardPublicCode: card.public_code,
    quantity,
    section,
    cardDomains: card.classification?.domain ?? [],
    cardSupertype: card.classification?.supertype ?? null,
    cardType: card.classification?.type ?? null,
    card,
  };
}

function maxCopiesForSection(section: DeckSection) {
  if (section === "battlefields") {
    return 1;
  }
  if (section === "runes") {
    return SECTION_TARGETS.runes;
  }
  return MAX_CARD_COPIES;
}

function isRune(card: RiftCard) {
  return (card.classification?.type ?? "").toLowerCase().includes("rune");
}

function isBattlefield(card: RiftCard) {
  return (card.classification?.type ?? "").toLowerCase().includes("battlefield");
}

function isChampion(card: RiftCard) {
  const supertype = card.classification?.supertype ?? "";
  const type = card.classification?.type ?? "";
  return supertype.toLowerCase() === "champion" || type.toLowerCase().includes("champion");
}

function isLegendCard(card: RiftCard) {
  return (card.classification?.type ?? "").toLowerCase().includes("legend");
}

function matchesLibraryTab(card: RiftCard, tab: LibraryTab) {
  if (tab === "legend") {
    return isLegendCard(card);
  }
  if (tab === "battlefields") {
    return isBattlefield(card);
  }
  if (tab === "runes") {
    return isRune(card);
  }
  // Main deck pool excludes specialized card types
  return !isRune(card) && !isBattlefield(card) && !isLegendCard(card);
}

function matchesSearchQuery(card: RiftCard, query: string) {
  const haystacks = [
    card.name,
    card.public_code,
    card.classification?.type,
    card.classification?.rarity,
    (card.classification?.domain ?? []).join(" "),
    card.text?.plain,
    (card.tags ?? []).join(" "),
  ]
    .filter(Boolean)
    .map((value) => (value ?? "").toLowerCase());

  return haystacks.some((value) => value.includes(query));
}

function domainsMatchLegend(cardDomains: string[], legendDomains: string[]) {
  if (legendDomains.length === 0 || cardDomains.length === 0) {
    return true;
  }
  return cardDomains.every((domain) => legendDomains.includes(domain));
}

export default function DeckBuilderClient({ initialDecks }: DeckBuilderClientProps) {
  const router = useRouter();
  const [decks, setDecks] = useState<DeckSummary[]>(initialDecks);
  const [selectedDeckId, setSelectedDeckId] = useState<string | "new">(
    initialDecks[0]?.id ?? "new"
  );
  const [workingDeck, setWorkingDeck] = useState<WorkingDeck>(
    initialDecks[0] ? toWorkingDeck(initialDecks[0]) : emptyDeck()
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<RiftCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryPage, setLibraryPage] = useState(1);
  const [libraryHasMore, setLibraryHasMore] = useState(true);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [expandedCard, setExpandedCard] = useState<RiftCard | null>(null);
  const [activeLibraryTab, setActiveLibraryTab] = useState<LibraryTab>("legend");
  const [activeStudioTab, setActiveStudioTab] = useState<StudioTab>("legend");
  const libraryScrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const hasLoadedLibraryPages = useRef(false);

  const legendCard = useMemo(
    () => workingDeck.cards.find((card) => card.section === "legend"),
    [workingDeck.cards]
  );
  const legendDomains = legendCard?.cardDomains ?? [];

  const sectionTotals = useMemo(() => {
    const totals: Record<DeckSection, number> = {
      legend: 0,
      main: 0,
      runes: 0,
      battlefields: 0,
      side: 0,
    };
    workingDeck.cards.forEach((card) => {
      totals[card.section] += card.quantity;
    });
    return totals;
  }, [workingDeck.cards]);
  const totalCardCount = useMemo(
    () => workingDeck.cards.reduce((sum, card) => sum + card.quantity, 0),
    [workingDeck.cards]
  );

  const validation = useMemo(() => validateDeckRules(workingDeck.cards), [workingDeck.cards]);
  const libraryHelper = useMemo(
    () => LIBRARY_TABS.find((tab) => tab.id === activeLibraryTab)?.helper ?? "",
    [activeLibraryTab]
  );
  const normalizedQuery = searchTerm.trim().toLowerCase();
  const deckDisplayName = workingDeck.name.trim() || "Untitled Prototype";
  const filteredLibraryResults = useMemo(() => {
    if (searchResults.length === 0) {
      return [];
    }
    return searchResults.filter((card) => {
      if (!matchesLibraryTab(card, activeLibraryTab)) {
        return false;
      }
      if (normalizedQuery && !matchesSearchQuery(card, normalizedQuery)) {
        return false;
      }
      if (
        legendCard &&
        legendDomains.length > 0 &&
        (activeLibraryTab === "main" || activeLibraryTab === "runes")
      ) {
        const domains = card.classification?.domain ?? [];
        if (!domainsMatchLegend(domains, legendDomains)) {
          return false;
        }
      }
      return true;
    });
  }, [searchResults, activeLibraryTab, normalizedQuery, legendCard, legendDomains]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const page = libraryPage;

    async function loadCards() {
      setSearching(true);
      setLibraryError(null);
      const params = new URLSearchParams({
        page: page.toString(),
        size: LIBRARY_PAGE_SIZE.toString(),
      });
      const endpoint = `/api/cards?${params.toString()}`;

      try {
        const response = await fetch(endpoint, { signal: controller.signal });
        if (!response.ok) {
          throw new Error("Failed to load cards");
        }
        const payload = (await response.json()) as RiftCardListResponse;
        if (!active) {
          return;
        }

        setSearchResults((prev) => {
          const next = page === 1 ? [] : [...prev];
          const seen = new Set(next.map((card) => card.id));
          payload.items.forEach((card) => {
            if (!seen.has(card.id)) {
              next.push(card);
              seen.add(card.id);
            }
          });
          return next;
        });
        hasLoadedLibraryPages.current = true;
        setLibraryHasMore(payload.page < payload.pages);
      } catch (fetchError) {
        if (!active || (fetchError instanceof DOMException && fetchError.name === "AbortError")) {
          return;
        }
        console.error(fetchError);
        setLibraryError("Unable to load card library.");
      } finally {
        if (active) {
          setSearching(false);
        }
      }
    }

    loadCards();

    return () => {
      active = false;
      controller.abort();
    };
  }, [libraryPage]);

  useEffect(() => {
    const target = sentinelRef.current;
    const root = libraryScrollRef.current;
    if (!target || !root) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting && libraryHasMore && !searching) {
          setLibraryPage((prev) => prev + 1);
        }
      },
      {
        root,
        rootMargin: "0px 0px 160px 0px",
        threshold: 0.1,
      }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [libraryHasMore, searching, filteredLibraryResults.length]);

  useEffect(() => {
    if (!hasLoadedLibraryPages.current) {
      return;
    }
    if (filteredLibraryResults.length === 0 && libraryHasMore && !searching) {
      setLibraryPage((prev) => prev + 1);
    }
  }, [filteredLibraryResults.length, libraryHasMore, searching, activeLibraryTab, searchTerm]);

  useEffect(() => {
    if (!expandedCard) {
      return;
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpandedCard(null);
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [expandedCard]);

  useEffect(() => {
    const missingIds = Array.from(
      new Set(
        workingDeck.cards
          .filter((entry) => !entry.card)
          .map((entry) => entry.cardId)
      )
    );

    if (missingIds.length === 0) {
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const results = await Promise.all(
          missingIds.map(async (id) => {
            const response = await fetch(`/api/cards/${id}`);
            if (!response.ok) {
              return null;
            }
            return (await response.json()) as RiftCard;
          })
        );

        if (cancelled) {
          return;
        }

        const cardMap = new Map<string, RiftCard>();
        results.forEach((card) => {
          if (card) {
            cardMap.set(card.id, card);
          }
        });

        if (cardMap.size === 0) {
          return;
        }

        setWorkingDeck((prev) => ({
          ...prev,
          cards: prev.cards.map((entry) =>
            cardMap.has(entry.cardId) ? { ...entry, card: cardMap.get(entry.cardId) } : entry
          ),
        }));
      } catch (fetchError) {
        if (!cancelled) {
          console.error(fetchError);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workingDeck.id, workingDeck.cards]);

  function handleSelectDeck(deck?: DeckSummary) {
    if (deck) {
      setSelectedDeckId(deck.id);
      setWorkingDeck(toWorkingDeck(deck));
    } else {
      setSelectedDeckId("new");
      setWorkingDeck(emptyDeck());
    }
    setDirty(false);
    setError(null);
  }

  function upsertEntry(card: DeckCardEntry) {
    setWorkingDeck((prev) => {
      const existingIndex = prev.cards.findIndex(
        (entry) => entry.cardId === card.cardId && entry.section === card.section
      );

      if (existingIndex >= 0) {
        const existing = prev.cards[existingIndex];
        const maxQuantity = maxCopiesForSection(card.section);
        const nextQuantity = Math.min(maxQuantity, existing.quantity + card.quantity);
        if (nextQuantity === existing.quantity) {
          return prev;
        }
        const nextCards = [...prev.cards];
        nextCards[existingIndex] = { ...existing, quantity: nextQuantity, card: card.card ?? existing.card };
        setDirty(true);
        return { ...prev, cards: nextCards };
      }

      setDirty(true);
      return { ...prev, cards: [...prev.cards, card] };
    });
  }

  type CardLike = RiftCard | DeckCardEntry;

  function cardDomains(card: CardLike) {
    if ("classification" in card) {
      return card.classification?.domain ?? [];
    }
    return card.cardDomains ?? [];
  }

  function cardType(card: CardLike) {
    if ("classification" in card) {
      return card.classification?.type ?? "";
    }
    return card.cardType ?? "";
  }

  function cardSupertype(card: CardLike) {
    if ("classification" in card) {
      return card.classification?.supertype ?? "";
    }
    return card.cardSupertype ?? "";
  }

  function canAddToSection(card: CardLike, section: DeckSection, quantity = 1): string | null {
    if (section === "legend") {
      if (sectionTotals.legend >= SECTION_TARGETS.legend) {
        return "Legend slot already filled.";
      }
      return null;
    }

    if (section === "runes") {
      if (!legendCard) {
        return "Pick a legend before adding runes.";
      }
      const type = cardType(card).toLowerCase();
      if (!type.includes("rune")) {
        return "Only Rune cards can be added here.";
      }
      const remaining = SECTION_TARGETS.runes - sectionTotals.runes;
      if (remaining < quantity) {
        return "Rune capacity reached.";
      }
      const runeDomains = cardDomains(card);
      const legendDomains = legendCard.cardDomains ?? [];
      const invalidDomain = runeDomains.find((domain) => !legendDomains.includes(domain));
      if (invalidDomain) {
        return "Rune colors must match your legend.";
      }
      return null;
    }

    if (section === "battlefields") {
      const type = cardType(card).toLowerCase();
      if (!type.includes("battlefield")) {
        return "Only Battlefield cards belong here.";
      }
      if (sectionTotals.battlefields >= SECTION_TARGETS.battlefields) {
        return "You already have 3 battlefields.";
      }
      return null;
    }

    if (section === "side") {
      if (legendCard && legendCard.cardDomains && legendCard.cardDomains.length > 0) {
        const candidateDomains = cardDomains(card);
        if (!domainsMatchLegend(candidateDomains, legendCard.cardDomains)) {
          return "Card colors must match your legend.";
        }
      }
      if (sectionTotals.side + quantity > SECTION_TARGETS.side) {
        return "Side deck limit reached.";
      }
      return null;
    }

    if (section === "main") {
      if (legendCard && legendCard.cardDomains && legendCard.cardDomains.length > 0) {
        const candidateDomains = cardDomains(card);
        if (!domainsMatchLegend(candidateDomains, legendCard.cardDomains)) {
          return "Card colors must match your legend.";
        }
      }
      if (sectionTotals.main + quantity > SECTION_TARGETS.main) {
        return "Main deck is capped at 40 cards.";
      }
      return null;
    }

    return "Invalid section";
  }

  function setLegend(card: RiftCard) {
    if (!isLegendCard(card)) {
      setError("You can only slot cards with the Legend type here.");
      return;
    }
    setError(null);
    setWorkingDeck((prev) => {
      const filtered = prev.cards.filter((entry) => entry.section !== "legend");
      return {
        ...prev,
        cards: [...filtered, createEntry(card, "legend", 1)],
      };
    });
    setDirty(true);
  }

  function addCardToSection(card: RiftCard, section: DeckSection) {
    const guard = canAddToSection(card, section);
    if (guard) {
      setError(guard);
      return;
    }
    setError(null);
    const entry = createEntry(card, section, section === "legend" ? 1 : 1);
    upsertEntry(entry);
  }

  function adjustQuantity(cardId: string, section: DeckSection, delta: number) {
    setWorkingDeck((prev) => {
      const index = prev.cards.findIndex(
        (entry) => entry.cardId === cardId && entry.section === section
      );
      if (index === -1) {
        return prev;
      }

      const entry = prev.cards[index];
      const maxQuantity = maxCopiesForSection(section);
      const nextQuantity = Math.min(
        maxQuantity,
        Math.max(1, entry.quantity + delta)
      );

      if (section !== "main" && sectionTotals[section] - entry.quantity + nextQuantity > SECTION_TARGETS[section]) {
        return prev;
      }

      if (nextQuantity === entry.quantity) {
        return prev;
      }

      const nextCards = [...prev.cards];
      nextCards[index] = { ...entry, quantity: nextQuantity };
      setDirty(true);
      return { ...prev, cards: nextCards };
    });
  }

  function removeCard(cardId: string, section: DeckSection) {
    setWorkingDeck((prev) => {
      const next = prev.cards.filter(
        (entry) => !(entry.cardId === cardId && entry.section === section)
      );
      if (next.length === prev.cards.length) {
        return prev;
      }
      setDirty(true);
      return { ...prev, cards: next };
    });
  }

  function moveCard(cardId: string, fromSection: DeckSection, toSection: DeckSection) {
    if (fromSection === toSection) {
      return;
    }
    setWorkingDeck((prev) => {
      const index = prev.cards.findIndex(
        (entry) => entry.cardId === cardId && entry.section === fromSection
      );
      if (index === -1) {
        return prev;
      }

      const entry = prev.cards[index];
      const guard = canAddToSection(entry, toSection, entry.quantity);
      if (guard) {
        setError(guard);
        return prev;
      }

      const filtered = prev.cards.filter((_, idx) => idx !== index);
      const existingIndex = filtered.findIndex(
        (item) => item.cardId === cardId && item.section === toSection
      );

        if (existingIndex >= 0) {
          const existing = filtered[existingIndex];
          const maxQuantity = maxCopiesForSection(toSection);
        filtered[existingIndex] = {
          ...existing,
          quantity: Math.min(maxQuantity, existing.quantity + entry.quantity),
        };
      } else {
        filtered.push({ ...entry, section: toSection });
      }

      setDirty(true);
      return { ...prev, cards: filtered };
    });
  }

  async function saveDeck() {
    setError(null);
    setSaveStatus("Saving...");
    const payload = {
      name: workingDeck.name,
      description: workingDeck.description,
      format: workingDeck.format,
      isPublic: workingDeck.isPublic,
      coverCardId: workingDeck.coverCardId,
      cards: workingDeck.cards.map((card) => ({
        cardId: card.cardId,
        cardName: card.cardName,
        cardPublicCode: card.cardPublicCode,
        quantity: card.quantity,
        section: card.section,
        cardDomains: card.cardDomains,
        cardSupertype: card.cardSupertype ?? card.card?.classification?.supertype ?? null,
        cardType: card.cardType ?? card.card?.classification?.type ?? null,
      })),
    };

    const endpoint = workingDeck.id ? `/api/decks/${workingDeck.id}` : "/api/decks";
    const method = workingDeck.id ? "PUT" : "POST";

    const response = await fetch(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error ?? "Unable to save deck");
      setSaveStatus(null);
      return;
    }

    const savedDeck = data.deck as DeckSummary;
    setDecks((prev) => {
      const otherDecks = prev.filter((deck) => deck.id !== savedDeck.id);
      return [savedDeck, ...otherDecks];
    });
    setWorkingDeck(toWorkingDeck(savedDeck));
    setSelectedDeckId(savedDeck.id);
    setSaveStatus("Saved");
    setDirty(false);
    router.refresh();
    setTimeout(() => setSaveStatus(null), 2000);
  }

  type ThumbOptions = {
    keyOverride?: string;
    hideQuantityBadge?: boolean;
    singleCopy?: boolean;
    containerClass?: string;
    imageSize?: string;
    stackedPreview?: boolean;
    stackedHeight?: number;
  };

  function renderCardThumb(entry: DeckCardEntry, options?: ThumbOptions) {
    const canDrag = entry.section === "main" || entry.section === "side";
    const allowAdjust = entry.section !== "legend" && entry.section !== "battlefields";
    const isRuneEntry = entry.section === "runes";
    const isMainEntry = entry.section === "main";
    const isSideEntry = entry.section === "side";
    const showBottomControls = isRuneEntry || isMainEntry || isSideEntry;
    const runeArtwork = isRuneEntry || Boolean(entry.card && isRune(entry.card));
    const cardTypeLabel = entry.card?.classification?.type ?? entry.cardType ?? "Card";
    const battlefield = cardTypeLabel.toLowerCase().includes("battlefield");
    const aspect = battlefield ? "aspect-[4/3]" : "aspect-[5/7]";
    const fit = battlefield ? "object-contain" : runeArtwork ? "object-contain" : "object-cover";
    const imageUrl = entry.card?.media.image_url;
    const key = options?.keyOverride ?? `${entry.cardId}-${entry.section}`;
    const isStackedPreview = Boolean(options?.stackedPreview);
    const stackPreviewCopies = isStackedPreview ? Math.min(entry.quantity, 4) : 1;
    const stackPadding = battlefield ? "75%" : "140%";
    const displayQuantity = options?.singleCopy ? 1 : entry.quantity;
    const showQuantityBadge = !(isRuneEntry || isMainEntry || isSideEntry) && !options?.hideQuantityBadge && displayQuantity > 1;
    const quantityBadgePosition = isRuneEntry
      ? "left-2 bottom-2"
      : isStackedPreview
      ? "right-2 top-2"
      : "left-2 top-2";
    const countBadgeStyles = isRuneEntry
      ? {
          text: "text-[#f4e6ff]",
          border: "border border-[#c9a2ff]/60",
          bg: "bg-[#1b0f2d]/95",
          shadow: "shadow-[0_12px_35px_rgba(185,135,255,0.35)]",
        }
      : isMainEntry
      ? {
          text: "text-[#d5f9ff]",
          border: "border border-[#7ce7f4]/60",
          bg: "bg-[#041c23]/95",
          shadow: "shadow-[0_12px_35px_rgba(124,231,244,0.25)]",
        }
      : isSideEntry
      ? {
          text: "text-[#edffe3]",
          border: "border border-[#c9ffb8]/60",
          bg: "bg-[#132611]/95",
          shadow: "shadow-[0_12px_35px_rgba(201,255,184,0.25)]",
        }
      : null;

    const handleCardClick = () => {
      if (!entry.card) return;
      setExpandedCard(entry.card);
    };

    const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!entry.card) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setExpandedCard(entry.card);
      }
    };

    const renderImage = () =>
      imageUrl ? (
        <Image
          src={imageUrl}
          alt={entry.cardName}
          fill
          className={`${fit} cursor-zoom-in`}
          sizes={options?.imageSize ?? "120px"}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-slate-500">No art</div>
      );

    return (
      <div
        key={key}
        className={`group relative flex flex-col gap-2 rounded-2xl border border-white/5 bg-[#060a15]/80 p-1.5 ${options?.containerClass ?? ""}`}
        style={options?.stackedHeight ? { minHeight: options.stackedHeight } : undefined}
        draggable={canDrag}
        onDragStart={(event) => {
          if (!canDrag) return;
          event.dataTransfer.setData(
            DRAG_MIME,
            JSON.stringify({ cardId: entry.cardId, section: entry.section })
          );
          event.dataTransfer.effectAllowed = "move";
        }}
      >
        <div
          className={`${
            isStackedPreview ? "relative overflow-visible" : `relative ${aspect} overflow-hidden`
          } rounded-xl bg-black/60 ${isRuneEntry ? "flex-1" : ""}`}
          style={isStackedPreview ? { paddingBottom: stackPadding } : undefined}
          onClick={handleCardClick}
          role={entry.card ? "button" : undefined}
          tabIndex={entry.card ? 0 : -1}
          onKeyDown={handleKeyDown}
        >
          {isStackedPreview ? (
            Array.from({ length: stackPreviewCopies }).map((_, idx) => (
              <div
                key={`${key}-stack-${idx}`}
                className={`absolute inset-0 rounded-[18px] border border-white/10 bg-black/80 shadow-lg ${
                  battlefield ? "p-2" : ""
                }`}
                style={{
                  transform: `translate(${idx * 6}px, ${-idx * 6}px)`,
                  zIndex: 20 - idx,
                }}
              >
                <div className="relative h-full w-full overflow-hidden rounded-[16px]">
                  {renderImage()}
                </div>
              </div>
            ))
          ) : (
            renderImage()
          )}
          {countBadgeStyles && (
            <div className="pointer-events-none absolute left-1/2 top-2 z-40 -translate-x-1/2">
              <span
                className={`min-w-[58px] rounded-full px-5 py-1.5 text-[1.35rem] font-black leading-none tracking-[0.15em] drop-shadow-[0_8px_18px_rgba(0,0,0,0.65)] ${countBadgeStyles.bg} ${countBadgeStyles.text} ${countBadgeStyles.border} ${countBadgeStyles.shadow}`}
                aria-label={`${entry.quantity} copies of ${entry.cardName}`}
              >
                {entry.quantity}
              </span>
            </div>
          )}
          {showQuantityBadge && (
            <span
              className={`pointer-events-none absolute rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white ${quantityBadgePosition}`}
            >
              x{entry.quantity}
            </span>
          )}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (options?.singleCopy && entry.quantity > 1) {
                adjustQuantity(entry.cardId, entry.section, -1);
                return;
              }
              removeCard(entry.cardId, entry.section);
            }}
            className={`absolute rounded-full border border-white/30 bg-black/70 px-2 py-0.5 text-xs text-slate-100 opacity-0 transition group-hover:opacity-100 ${
              isStackedPreview ? "left-2 top-2" : "right-2 top-2"
            }`}
          >
            X
          </button>
          {allowAdjust && !showBottomControls && (
            <div className="absolute bottom-2 right-2 flex flex-col gap-1 opacity-0 transition group-hover:opacity-100">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  adjustQuantity(entry.cardId, entry.section, 1);
                }}
                className="rounded-full border border-white/40 bg-black/70 px-2 text-xs text-white"
              >
                +
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  adjustQuantity(entry.cardId, entry.section, -1);
                }}
                className="rounded-full border border-white/40 bg-black/70 px-2 text-xs text-white"
              >
                -
              </button>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent px-2 py-1 text-center text-[0.65rem] font-semibold">
            {entry.cardName}
          </div>
        </div>
        {showBottomControls && (
          <div className="flex w-full gap-3 pt-2 text-2xl font-bold">
            <button
              type="button"
              aria-label={`Increase ${entry.cardName}`}
              onClick={(event) => {
                event.stopPropagation();
                adjustQuantity(entry.cardId, entry.section, 1);
              }}
              className="flex-1 rounded-full border border-[#b487ff]/60 bg-[#b487ff]/20 py-1 text-[#c9a2ff] transition-transform hover:bg-[#b487ff]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a2ff]/40 active:scale-95"
            >
              +
            </button>
            <button
              type="button"
              aria-label={`Decrease ${entry.cardName}`}
              onClick={(event) => {
                event.stopPropagation();
                adjustQuantity(entry.cardId, entry.section, -1);
              }}
              className="flex-1 rounded-full border border-white/40 bg-black/70 py-1 text-slate-100 transition-transform hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 active:scale-95"
            >
              -
            </button>
          </div>
        )}
      </div>
    );
  }

  function renderSection(section: DeckSection, extra?: { droppable?: boolean; stacked?: boolean }) {
    const cards = workingDeck.cards.filter((card) => card.section === section);
    const needed = SECTION_TARGETS[section];
    const count = sectionTotals[section];
    const isComplete = count === needed;
    const droppable = extra?.droppable;
    const stackedPreview = Boolean(extra?.stacked);
    const accent = SECTION_ACCENTS[section];
    const gridClass = SECTION_GRID_COLUMNS[section] ?? "grid-cols-2";
    const cardThumbOptions: ThumbOptions | undefined = (() => {
      if (section === "runes" || section === "side") {
        return { stackedPreview: true, imageSize: "280px" };
      }
      if (stackedPreview) {
        return { stackedPreview: true, imageSize: "220px" };
      }
      if (section === "battlefields") {
        return { imageSize: "220px" };
      }
      return undefined;
    })();

    return (
      <div
        key={section}
        className={`rounded-2xl border ${accent.border} bg-[#0b101b]/80 p-4 transition ${
          isComplete ? "shadow-[0_0_25px_rgba(246,211,142,0.08)]" : "shadow-[0_0_20px_rgba(0,0,0,0.4)]"
        }`}
        onDragOver={(event) => {
          if (!droppable) return;
          if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
          event.preventDefault();
        }}
        onDrop={(event) => {
          if (!droppable) return;
          if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
          event.preventDefault();
          const raw = event.dataTransfer.getData(DRAG_MIME);
          try {
            const payload = JSON.parse(raw) as { cardId: string; section: DeckSection };
            moveCard(payload.cardId, payload.section, section);
          } catch (dropError) {
            console.error(dropError);
          }
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className={`text-[0.65rem] uppercase tracking-[0.4em] ${accent.badge}`}>
              {SECTION_LABELS[section]}
            </p>
            <p className="text-xs text-slate-400">{SECTION_HINTS[section]}</p>
          </div>
          <span className="text-sm font-semibold text-white">
            {count}/{needed}
          </span>
        </div>
        {cards.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-slate-500">
            Empty — add cards from the library.
          </p>
        ) : section === "legend" ? (
          <div className="mt-3 flex justify-center">
            {cards.map((card) =>
              renderCardThumb(card, {
                hideQuantityBadge: true,
                singleCopy: true,
                containerClass: "max-w-[220px] w-full",
                imageSize: "220px",
              })
            )}
          </div>
        ) : (
          <div className={`mt-3 grid gap-4 ${gridClass}`}>
            {cards.map((card) =>
              renderCardThumb(card, cardThumbOptions)
            )}
          </div>
        )}
      </div>
    );
  }

  function renderDeckDetailsPanel() {
    return (
      <div className="space-y-4 rounded-2xl border border-white/10 bg-black/30 p-4 shadow-inner">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.4em] text-[#7ce7f4]">Deck Studio</p>
            <input
              value={workingDeck.name}
              onChange={(event) => {
                setWorkingDeck({ ...workingDeck, name: event.target.value });
                setDirty(true);
              }}
              className="mt-1 w-full bg-transparent text-3xl font-semibold focus:outline-none"
            />
          </div>
          <div>
            <label className="text-[0.6rem] uppercase tracking-[0.3em] text-slate-400">
              Deck Vault
              <select
                value={selectedDeckId}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "new") {
                    handleSelectDeck(undefined);
                    return;
                  }
                  const nextDeck = decks.find((deck) => deck.id === value);
                  handleSelectDeck(nextDeck);
                }}
                className="mt-1 w-full rounded-xl border border-white/10 bg-[#05070d] px-3 py-2 text-xs uppercase tracking-[0.3em] focus:border-[#f6d38e] focus:outline-none"
              >
                <option value="new">New prototype</option>
                {decks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-slate-300">
          <label className="flex flex-1 flex-col">
            <span className="text-[0.6rem] uppercase tracking-[0.3em] text-slate-400">Format</span>
            <input
              value={workingDeck.format}
              onChange={(event) => {
                setWorkingDeck({ ...workingDeck, format: event.target.value });
                setDirty(true);
              }}
              className="mt-1 rounded-xl border border-white/10 bg-[#05070d] px-3 py-2 text-sm focus:border-[#f6d38e] focus:outline-none"
              placeholder="Origins"
            />
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2">
            <input
              type="checkbox"
              checked={workingDeck.isPublic}
              onChange={(event) => {
                setWorkingDeck({ ...workingDeck, isPublic: event.target.checked });
                setDirty(true);
              }}
              className="h-4 w-4 rounded border-white/20 bg-slate-900"
            />
            <span className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-400">Public</span>
          </label>
          <button
            onClick={saveDeck}
            disabled={
              workingDeck.name.trim().length === 0 || validation.errors.length > 0 || !dirty
            }
            className="rounded-xl border border-[#9ce39a]/50 bg-[#9ce39a]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#c9ffb8] transition hover:bg-[#9ce39a]/20 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-slate-500"
          >
            {saveStatus ?? (workingDeck.id ? "Save changes" : "Save deck")}
          </button>
        </div>

        <textarea
          value={workingDeck.description}
          onChange={(event) => {
            setWorkingDeck({ ...workingDeck, description: event.target.value });
            setDirty(true);
          }}
          placeholder="Describe your plan, synergies, matchup notes..."
          className="w-full rounded-2xl border border-white/10 bg-[#05070d] px-4 py-3 text-sm text-slate-200 focus:border-[#f6d38e] focus:outline-none"
          rows={3}
        />
      </div>
    );
  }

  function renderLibraryActions(card: RiftCard) {
    if (activeLibraryTab === "legend") {
      return (
        <button
          onClick={() => setLegend(card)}
          className="w-full rounded-xl border border-[#f6d38e]/40 bg-[#f6d38e]/10 px-3 py-2 text-xs font-semibold text-[#f6d38e] transition hover:bg-[#f6d38e]/20"
        >
          Set as Legend
        </button>
      );
    }

    if (activeLibraryTab === "battlefields") {
      return (
        <button
          onClick={() => addCardToSection(card, "battlefields")}
          className="w-full rounded-xl border border-[#ff9c73]/40 bg-[#ff9c73]/10 px-3 py-2 text-xs font-semibold text-[#ffb590] transition hover:bg-[#ff9c73]/20"
        >
          Add Battlefield
        </button>
      );
    }

    if (activeLibraryTab === "runes") {
      return (
        <button
          onClick={() => addCardToSection(card, "runes")}
          className="w-full rounded-xl border border-[#b487ff]/40 bg-[#b487ff]/10 px-3 py-2 text-xs font-semibold text-[#c9a2ff] transition hover:bg-[#b487ff]/20"
        >
          Add Rune
        </button>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => addCardToSection(card, "main")}
          className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-xs font-semibold text-white transition hover:border-[#7ce7f4]/50"
        >
          Main Deck
        </button>
        <button
          onClick={() => addCardToSection(card, "side")}
          className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-xs font-semibold text-white transition hover:border-[#9ce39a]/70"
        >
          Sideboard
        </button>
      </div>
    );
  }

  function renderMainDeckPanel() {
    const mainCards = workingDeck.cards.filter((card) => card.section === "main");

    return (
      <div
        className="rounded-2xl border border-[#7ce7f4]/40 bg-[#0b111d]/90 p-4"
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
          event.preventDefault();
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
          event.preventDefault();
          const raw = event.dataTransfer.getData(DRAG_MIME);
          try {
            const payload = JSON.parse(raw) as { cardId: string; section: DeckSection };
            moveCard(payload.cardId, payload.section, "main");
          } catch (dropError) {
            console.error(dropError);
          }
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.35em] text-[#7ce7f4]">Main Deck</p>
            <p className="text-xs text-slate-400">{SECTION_HINTS.main}</p>
            <p className="text-[0.6rem] uppercase tracking-[0.35em] text-slate-500">
              Sort: Energy › Power › Name
            </p>
          </div>
          <span className="text-sm font-semibold">
            {sectionTotals.main}/{SECTION_TARGETS.main}
          </span>
        </div>
        {mainCards.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-white/15 px-4 py-6 text-center text-xs text-slate-500">
            Add cards to your main deck.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {mainCards.map((entry) =>
              renderCardThumb(entry, {
                stackedPreview: true,
                imageSize: "280px",
              })
            )}
          </div>
        )}
      </div>
    );
  }

  function renderStudioTabContent() {
    switch (activeStudioTab) {
      case "legend":
        return renderSection("legend");
      case "main":
        return renderMainDeckPanel();
      case "battlefields":
        return renderSection("battlefields");
      case "side":
        return renderSection("side", { droppable: true, stacked: true });
      case "runes":
        return renderSection("runes");
      default:
        return null;
    }
  }

  

  return (
    <div className="min-h-screen bg-[#05070d] text-white">
      <div className="border-b border-white/5 bg-[#080c15]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex flex-wrap items-center gap-6">
            <p className="font-display text-2xl text-[#f6d38e]">Rift Archive</p>
            <nav className="hidden gap-6 text-sm text-slate-300 md:flex">
              {HEADER_LINKS.map((entry) => (
                <span key={entry} className="tracking-wide text-slate-500">
                  {entry}
                </span>
              ))}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[0.65rem] uppercase tracking-[0.35em] text-slate-400">
            <button
              type="button"
              onClick={() => router.push("/lobby")}
              className="rounded-full border border-white/20 px-4 py-1 text-[0.6rem] font-semibold tracking-[0.35em] text-slate-100 transition hover:border-[#f6d38e]/60 hover:text-[#f6d38e]"
            >
              Back to Lobby
            </button>
            <span
              className={`rounded-full border border-white/10 px-3 py-1 ${dirty ? "text-amber-200" : "text-emerald-200"}`}
            >
              {dirty ? "Unsaved" : "Synced"}
            </span>
            <span className="rounded-full border border-[#f6d38e]/70 px-3 py-1 text-[#f6d38e]">
              {totalCardCount} cards
            </span>
          </div>
        </div>
      </div>

      <main className="grid min-h-[calc(100vh-120px)] w-full gap-6 px-4 py-8 lg:grid-cols-[minmax(540px,1.2fr)_minmax(520px,0.9fr)] 2xl:grid-cols-[minmax(680px,1.35fr)_minmax(600px,0.95fr)]">
        <section className="rounded-[32px] border border-white/5 bg-gradient-to-b from-[#161c2f] via-[#101629] to-[#090f1c] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.6)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.6em] text-[#7ce7f4]">Card Library</p>
              <h2 className="font-display text-3xl text-[#f6d38e]">Legendarium</h2>
              <p className="text-xs text-slate-400">{libraryHelper}</p>
            </div>
            <div className="rounded-full border border-white/10 px-4 py-2 text-xs text-slate-300">
              {filteredLibraryResults.length} cards
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {LIBRARY_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveLibraryTab(tab.id)}
                className={`rounded-full border px-4 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.35em] transition ${
                  activeLibraryTab === tab.id
                    ? "border-[#f6d38e] bg-[#f6d38e]/15 text-[#f6d38e]"
                    : "border-white/10 text-slate-300 hover:border-[#f6d38e]/60"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <div className="flex-1 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-sm shadow-inner">
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search cards, domains, keywords..."
                className="w-full bg-transparent placeholder:text-slate-500 focus:outline-none"
              />
            </div>
            <button className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.4em] text-slate-300">
              Sort
            </button>
            <button className="rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.4em] text-slate-300">
              Filters
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Active legend: {legendCard ? legendCard.cardName : "None"}
          </p>

          <div className="mt-5 flex h-[calc(100vh-260px)] flex-col overflow-hidden">
            <div ref={libraryScrollRef} className="flex-1 space-y-4 overflow-y-auto pr-2">
              {searching && <p className="text-xs text-slate-400">Loading cards...</p>}
              {filteredLibraryResults.length === 0 && !searching && (
                <p className="text-xs text-slate-500">No cards match the filters.</p>
              )}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filteredLibraryResults.map((card) => {
                  const battlefield = isBattlefield(card);
                  const aspect = battlefield ? "aspect-[4/3]" : "aspect-[5/7]";
                  const fit = battlefield ? "object-contain" : "object-cover";
                  return (
                    <div
                      key={card.id}
                      className="flex h-full flex-col rounded-[24px] border border-white/10 bg-[#0b111d] shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
                    >
                      <div
                        className={`relative ${aspect} cursor-zoom-in overflow-hidden rounded-t-[24px] bg-black/60`}
                        onClick={() => setExpandedCard(card)}
                      >
                        {card.media.image_url && (
                          <Image
                            src={card.media.image_url}
                            alt={card.name}
                            fill
                            sizes="220px"
                            className={fit}
                          />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                        <div className="absolute bottom-3 left-4 right-4 text-sm font-semibold tracking-wide drop-shadow-lg">
                          {card.name}
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col gap-3 border-t border-white/5 p-4 text-sm">
                        <p className="text-[0.65rem] uppercase tracking-[0.35em] text-slate-400">
                          {card.classification?.type ?? "Unknown"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {(card.classification?.domain ?? []).join(", ")}
                        </p>
                        {renderLibraryActions(card)}
                      </div>
                    </div>
                  );
                })}
              </div>
              {libraryHasMore && (
                <div ref={sentinelRef} className="h-12 w-full" />
              )}
            </div>
            {libraryError && (
              <p className="pt-3 text-xs text-rose-300">{libraryError}</p>
            )}
          </div>
        </section>

        <section className="rounded-[32px] border border-white/5 bg-[#080d16]/90 p-6 shadow-[0_10px_60px_rgba(0,0,0,0.45)] backdrop-blur">
          <div className="space-y-5">
            <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[0.6rem] uppercase tracking-[0.35em] text-slate-400">Deck Studio</p>
                <span className="text-[0.6rem] uppercase tracking-[0.3em] text-slate-500">
                  Active deck: {deckDisplayName}
                </span>
              </div>
              <div className="mt-3 overflow-x-auto">
                <div
                  role="tablist"
                  className="flex min-w-max flex-nowrap gap-4 border-b border-white/10 pb-1"
                >
                  {STUDIO_TABS.map((tab) => {
                    const isActive = activeStudioTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setActiveStudioTab(tab.id)}
                        className={`relative whitespace-nowrap px-2 pb-3 pt-2 text-[0.65rem] font-semibold uppercase tracking-[0.35em] transition ${
                          isActive ? "text-[#f6d38e]" : "text-slate-400 hover:text-[#f6d38e]"
                        }`}
                      >
                        {tab.label}
                        <span
                          className={`absolute bottom-0 left-0 right-0 mx-auto h-0.5 rounded-full transition ${
                            isActive ? "bg-[#f6d38e]" : "bg-transparent"
                          }`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-3 overflow-x-auto whitespace-nowrap text-[0.6rem] uppercase tracking-[0.3em] text-slate-400">
                <div className="flex flex-nowrap items-center gap-4">
                  {Object.entries(SECTION_LABELS).map(([key, label]) => (
                    <span key={key} className={`${SECTION_ACCENTS[key as DeckSection].badge}`}>
                      {label} {sectionTotals[key as DeckSection]}/{SECTION_TARGETS[key as DeckSection]}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {activeStudioTab === "legend" && renderDeckDetailsPanel()}

            {renderStudioTabContent()}

            {error && (
              <p className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </p>
            )}
            {validation.errors.length > 0 && (
              <ul className="space-y-2 text-sm text-amber-200">
                {validation.errors.map((message) => (
                  <li key={message} className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                    {message}
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-xs">
              <div className="flex flex-wrap gap-2 text-[0.65rem] uppercase tracking-[0.35em] text-slate-400">
                <button className="rounded-full border border-white/10 px-3 py-1" disabled>
                  Import
                </button>
                <button className="rounded-full border border-white/10 px-3 py-1" disabled>
                  Export
                </button>
                <button
                  className="rounded-full border border-white/10 px-3 py-1"
                  onClick={() => {
                    handleSelectDeck(undefined);
                  }}
                >
                  Clear
                </button>
              </div>
              <button
                onClick={saveDeck}
                disabled={workingDeck.name.trim().length === 0 || validation.errors.length > 0 || !dirty}
                className="rounded-full border border-[#f6d38e]/70 bg-[#f6d38e]/20 px-5 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.35em] text-[#f6d38e] transition hover:bg-[#f6d38e]/30 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-transparent disabled:text-slate-500"
              >
                {saveStatus ?? (workingDeck.id ? "Save changes" : "Save deck")}
              </button>
            </div>
          </div>
        </section>
      </main>
      {expandedCard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setExpandedCard(null)}
        >
          {(() => {
            const battlefield = isBattlefield(expandedCard);
            const aspect = battlefield ? "aspect-[4/3]" : "aspect-[5/7]";
            const fit = battlefield ? "object-contain" : "object-cover";
            return (
              <div
                className="relative w-full max-w-2xl rounded-[32px] border border-white/10 bg-[#05070d] p-4"
                onClick={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setExpandedCard(null)}
                  className="absolute right-6 top-6 rounded-full border border-white/30 px-3 py-1 text-sm text-white"
                >
                  Close
                </button>
                <div className={`relative ${aspect} overflow-hidden rounded-3xl bg-black/70`}>
                  {expandedCard.media.image_url ? (
                    <Image
                      src={expandedCard.media.image_url}
                      alt={expandedCard.name}
                      fill
                      className={`${fit}`}
                      sizes="480px"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">
                      No art available
                    </div>
                  )}
                </div>
                <div className="mt-4 text-center">
                  <p className="text-[0.65rem] uppercase tracking-[0.35em] text-slate-400">
                    {expandedCard.classification?.type ?? "Card"}
                  </p>
                  <h3 className="font-display text-2xl text-white">{expandedCard.name}</h3>
                  <p className="text-sm text-slate-300">
                    {(expandedCard.classification?.domain ?? []).join(", ") || "Neutral"}
                  </p>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
