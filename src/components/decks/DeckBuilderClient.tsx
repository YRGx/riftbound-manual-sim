"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [dragFeedback, setDragFeedback] = useState<string | null>(null);

  const legendCard = useMemo(
    () => workingDeck.cards.find((card) => card.section === "legend"),
    [workingDeck.cards]
  );

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

  const validation = useMemo(() => validateDeckRules(workingDeck.cards), [workingDeck.cards]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setSearching(true);
      const endpoint = searchTerm
        ? `/api/cards/search?query=${encodeURIComponent(searchTerm)}&size=50`
        : "/api/cards?size=50";
      try {
        const response = await fetch(endpoint, { signal: controller.signal });
        if (!response.ok) {
          throw new Error("Failed to load cards");
        }
        const payload = (await response.json()) as RiftCardListResponse;
        if (active) {
          setSearchResults(payload.items);
        }
      } catch (fetchError) {
        if (active && !(fetchError instanceof DOMException && fetchError.name === "AbortError")) {
          console.error(fetchError);
        }
      } finally {
        if (active) {
          setSearching(false);
        }
      }
    }, searchTerm ? 350 : 0);

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [searchTerm]);

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
        const maxQuantity = card.section === "battlefields" ? 1 : MAX_CARD_COPIES;
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
      if (sectionTotals.side + quantity > SECTION_TARGETS.side) {
        return "Side deck limit reached.";
      }
      return null;
    }

    if (section === "main") {
      if (sectionTotals.main + quantity > SECTION_TARGETS.main) {
        return "Main deck is capped at 40 cards.";
      }
      return null;
    }

    return "Invalid section";
  }

  function setLegend(card: RiftCard) {
    if (!isChampion(card)) {
      setError("Legends must be champion units.");
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
      const maxQuantity = section === "battlefields" ? 1 : MAX_CARD_COPIES;
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
        const maxQuantity = toSection === "battlefields" ? 1 : MAX_CARD_COPIES;
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

  function renderCardRow(entry: DeckCardEntry) {
    const canDrag = entry.section === "main" || entry.section === "side";
    return (
      <div
        key={`${entry.cardId}-${entry.section}`}
        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/50 p-3"
        draggable={canDrag}
        onDragStart={(event) => {
          if (!canDrag) return;
          event.dataTransfer.setData(
            DRAG_MIME,
            JSON.stringify({ cardId: entry.cardId, section: entry.section })
          );
          event.dataTransfer.effectAllowed = "move";
          setDragFeedback(
            entry.section === "main" ? "Drag to side deck" : "Drag to main deck"
          );
        }}
        onDragEnd={() => setDragFeedback(null)}
      >
        <div className="h-16 w-12 overflow-hidden rounded-lg bg-slate-800">
          {entry.card?.media.image_url && (
            <Image
              src={entry.card.media.image_url}
              alt={entry.card?.name ?? entry.cardName}
              width={80}
              height={112}
              className="h-full w-full object-cover"
            />
          )}
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold">{entry.cardName}</p>
          <p className="text-xs text-slate-400">
            {entry.card?.classification?.type ?? entry.cardType ?? "Unknown"} · {entry.card?.classification?.rarity ?? ""}
          </p>
        </div>
        {entry.section !== "legend" && entry.section !== "battlefields" && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => adjustQuantity(entry.cardId, entry.section, -1)}
              className="rounded-full border border-white/20 px-2 py-1 text-sm"
            >
              -
            </button>
            <span className="min-w-[2ch] text-center text-lg font-semibold">{entry.quantity}</span>
            <button
              onClick={() => adjustQuantity(entry.cardId, entry.section, 1)}
              className="rounded-full border border-white/20 px-2 py-1 text-sm"
            >
              +
            </button>
          </div>
        )}
        {entry.section === "battlefields" && (
          <span className="rounded-full border border-white/20 px-3 py-1 text-xs">1x</span>
        )}
        <button
          onClick={() => removeCard(entry.cardId, entry.section)}
          className="rounded-full border border-white/20 px-2 py-1 text-xs text-slate-300"
        >
          Remove
        </button>
      </div>
    );
  }

  function renderSection(section: DeckSection, extra?: { droppable?: boolean }) {
    const cards = workingDeck.cards.filter((card) => card.section === section);
    const needed = SECTION_TARGETS[section];
    const count = sectionTotals[section];
    const isComplete = count === needed;
    const droppable = extra?.droppable;

    return (
      <div
        key={section}
        className={`rounded-2xl border p-4 ${
          isComplete ? "border-white/10 bg-slate-900/60" : "border-amber-400/40 bg-amber-500/5"
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
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-400">{SECTION_LABELS[section]}</p>
            <p className="text-sm text-slate-400">{SECTION_HINTS[section]}</p>
          </div>
          <span className="text-sm font-semibold">
            {count}/{needed}
          </span>
        </div>
        <div className="mt-3 space-y-3">
          {cards.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-xs text-slate-400">
              Empty slot
            </p>
          )}
          {cards.map((card) => renderCardRow(card))}
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 lg:grid lg:grid-cols-[260px_minmax(0,1fr)_360px]">
        <aside className="rounded-3xl border border-white/10 bg-slate-950/60 p-5 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-400">Vault</p>
              <h2 className="text-xl font-semibold">My Decks</h2>
            </div>
            <button
              className="rounded-full bg-cyan-500/80 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
              onClick={() => handleSelectDeck(undefined)}
            >
              New
            </button>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {decks.length === 0 && (
              <li className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-center text-slate-400">
                No saved decks yet.
              </li>
            )}
            {decks.map((deck) => (
              <li key={deck.id}>
                <button
                  onClick={() => handleSelectDeck(deck)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                    selectedDeckId === deck.id
                      ? "border-cyan-400/80 bg-cyan-500/10"
                      : "border-white/10 bg-white/5 hover:border-cyan-400/40"
                  }`}
                >
                  <p className="text-sm font-semibold">{deck.name}</p>
                  <p className="text-xs text-slate-400">
                    {deck.cards.reduce((sum, entry) => sum + entry.quantity, 0)} cards
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 shadow-2xl backdrop-blur">
          <header className="flex flex-col gap-4 border-b border-white/5 pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-400">Deck Studio</p>
              <input
                value={workingDeck.name}
                onChange={(event) => {
                  setWorkingDeck({ ...workingDeck, name: event.target.value });
                  setDirty(true);
                }}
                className="mt-1 w-full bg-transparent text-3xl font-semibold focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <span>Format</span>
                <input
                  value={workingDeck.format}
                  onChange={(event) => {
                    setWorkingDeck({ ...workingDeck, format: event.target.value });
                    setDirty(true);
                  }}
                  className="rounded-xl border border-white/10 bg-slate-900/80 px-3 py-1 text-sm focus:border-cyan-400 focus:outline-none"
                  placeholder="Origins"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={workingDeck.isPublic}
                  onChange={(event) => {
                    setWorkingDeck({ ...workingDeck, isPublic: event.target.checked });
                    setDirty(true);
                  }}
                  className="h-4 w-4 rounded border-white/20 bg-slate-900"
                />
                <span>Make deck public</span>
              </label>
              <button
                onClick={saveDeck}
                disabled={workingDeck.name.trim().length === 0 || validation.errors.length > 0 || !dirty}
                className="rounded-xl bg-emerald-500/80 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
              >
                {saveStatus ?? (workingDeck.id ? "Save changes" : "Save deck")}
              </button>
            </div>
          </header>

          <textarea
            value={workingDeck.description}
            onChange={(event) => {
              setWorkingDeck({ ...workingDeck, description: event.target.value });
              setDirty(true);
            }}
            placeholder="Describe your plan, synergies, matchup notes..."
            className="mt-4 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-3 text-sm text-slate-200 focus:border-cyan-400 focus:outline-none"
            rows={3}
          />

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {renderSection("legend")}
            {renderSection("battlefields")}
            {renderSection("runes")}
            {renderSection("side", { droppable: true })}
          </div>

          <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900/60 p-4" onDragOver={(event) => {
            if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
            event.preventDefault();
          }} onDrop={(event) => {
            if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
            event.preventDefault();
            const raw = event.dataTransfer.getData(DRAG_MIME);
            try {
              const payload = JSON.parse(raw) as { cardId: string; section: DeckSection };
              moveCard(payload.cardId, payload.section, "main");
            } catch (dropError) {
              console.error(dropError);
            }
          }}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-400">Main Deck</p>
                <p className="text-sm text-slate-400">{SECTION_HINTS.main}</p>
              </div>
              <span className="text-sm font-semibold">
                {sectionTotals.main}/{SECTION_TARGETS.main}
              </span>
            </div>
            <div className="mt-3 space-y-3">
              {workingDeck.cards
                .filter((card) => card.section === "main")
                .map((card) => renderCardRow(card))}
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </p>
          )}
          {validation.errors.length > 0 && (
            <ul className="mt-4 space-y-2 text-sm text-amber-200">
              {validation.errors.map((message) => (
                <li key={message} className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                  {message}
                </li>
              ))}
            </ul>
          )}
          {dragFeedback && (
            <p className="mt-4 text-center text-xs text-slate-400">{dragFeedback}</p>
          )}
        </section>

        <aside className="rounded-3xl border border-white/10 bg-slate-950/60 p-5 shadow-2xl backdrop-blur">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-400">Riftcodex</p>
            <h2 className="text-xl font-semibold">Card Library</h2>
          </div>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search name, domain, etc."
            className="mt-4 w-full rounded-2xl border border-white/10 bg-slate-900/60 px-4 py-2 text-sm focus:border-cyan-400 focus:outline-none"
          />
          <div className="mt-4 h-[70vh] space-y-3 overflow-y-auto pr-2">
            {searching && <p className="text-xs text-slate-400">Loading cards...</p>}
            {searchResults.map((card) => (
              <div
                key={card.id}
                className="rounded-2xl border border-white/10 bg-white/5 p-3"
              >
                <div className="flex items-center gap-3">
                  <div className="h-20 w-14 overflow-hidden rounded-lg bg-slate-800">
                    {card.media.image_url && (
                      <Image
                        src={card.media.image_url}
                        alt={card.name}
                        width={90}
                        height={128}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{card.name}</p>
                    <p className="text-xs text-slate-400">
                      {card.classification?.type ?? ""} · {(card.classification?.domain ?? []).join(", ")}
                    </p>
                    <p className="text-xs text-slate-500 line-clamp-2">{card.text.plain}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <button
                    onClick={() => addCardToSection(card, "main")}
                    className="rounded-xl border border-white/10 px-2 py-2 text-center hover:border-cyan-400"
                  >
                    Add to Main
                  </button>
                  <button
                    onClick={() => addCardToSection(card, "side")}
                    className="rounded-xl border border-white/10 px-2 py-2 text-center hover:border-cyan-400"
                  >
                    Add to Side
                  </button>
                  <button
                    onClick={() => addCardToSection(card, "runes")}
                    className="rounded-xl border border-white/10 px-2 py-2 text-center hover:border-cyan-400"
                  >
                    Add Rune
                  </button>
                  <button
                    onClick={() => addCardToSection(card, "battlefields")}
                    className="rounded-xl border border-white/10 px-2 py-2 text-center hover:border-cyan-400"
                  >
                    Add Battlefield
                  </button>
                  <button
                    onClick={() => setLegend(card)}
                    className="col-span-2 rounded-xl border border-white/10 px-2 py-2 text-center hover:border-cyan-400"
                  >
                    Set as Legend
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
