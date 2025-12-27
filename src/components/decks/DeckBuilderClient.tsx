"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { DeckSummary, DeckCardEntry } from "@/src/types/deck";
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

  const totalCards = useMemo(
    () => workingDeck.cards.reduce((sum, entry) => sum + entry.quantity, 0),
    [workingDeck.cards]
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setSearching(true);
      const endpoint = searchTerm
        ? `/api/cards/search?query=${encodeURIComponent(searchTerm)}&size=24`
        : "/api/cards?size=24";
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
      new Set(workingDeck.cards.filter((entry) => !entry.card).map((entry) => entry.cardId))
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
      } catch (error) {
        if (!cancelled) {
          console.error(error);
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

  function handleAddCard(card: RiftCard) {
    setError(null);
    setWorkingDeck((prev) => {
      const existingIndex = prev.cards.findIndex((entry) => entry.cardId === card.id);
      if (existingIndex >= 0) {
        const existing = prev.cards[existingIndex];
        if (existing.quantity >= MAX_CARD_COPIES) {
          return prev;
        }
        const nextCards = prev.cards.map((entry, index) =>
          index === existingIndex ? { ...entry, quantity: entry.quantity + 1, card } : entry
        );
        setDirty(true);
        return { ...prev, cards: nextCards };
      }

      const nextEntry: DeckCardEntry = {
        cardId: card.id,
        cardName: card.name,
        cardPublicCode: card.public_code,
        quantity: 1,
        card,
      };
      setDirty(true);
      return { ...prev, cards: [...prev.cards, nextEntry] };
    });
  }

  function adjustQuantity(cardId: string, delta: number) {
    setWorkingDeck((prev) => {
      let changed = false;
      const next = prev.cards.map((entry) => {
        if (entry.cardId !== cardId) {
          return entry;
        }
        const nextQuantity = Math.min(
          MAX_CARD_COPIES,
          Math.max(1, entry.quantity + delta)
        );
        if (nextQuantity !== entry.quantity) {
          changed = true;
        }
        return { ...entry, quantity: nextQuantity };
      });
      if (!changed) {
        return prev;
      }
      setDirty(true);
      return { ...prev, cards: next };
    });
  }

  function removeCard(cardId: string) {
    setWorkingDeck((prev) => {
      const next = prev.cards.filter((entry) => entry.cardId !== cardId);
      if (next.length === prev.cards.length) {
        return prev;
      }
      setDirty(true);
      return { ...prev, cards: next };
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
    setTimeout(() => setSaveStatus(null), 2500);
  }

  const deckStats = useMemo(() => {
    const byDomain = new Map<string, number>();
    workingDeck.cards.forEach((entry) => {
      (entry.card?.classification?.domain ?? []).forEach((domain) => {
        byDomain.set(domain, (byDomain.get(domain) ?? 0) + entry.quantity);
      });
    });
    return Array.from(byDomain.entries()).sort((a, b) => b[1] - a[1]);
  }, [workingDeck.cards]);

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

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Total Cards</p>
              <p className="text-3xl font-semibold">{totalCards}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Domains</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {deckStats.length === 0 && <span className="text-slate-400">Add cards to analyze domains.</span>}
                {deckStats.map(([domain, count]) => (
                  <span key={domain} className="rounded-full bg-white/10 px-3 py-1">
                    {domain} · {count}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Mainboard</h3>
              <button
                onClick={saveDeck}
                disabled={workingDeck.name.trim().length === 0 || !dirty}
                className="rounded-xl bg-emerald-500/80 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
              >
                {saveStatus ?? (workingDeck.id ? "Save changes" : "Save deck")}
              </button>
            </div>
            <div className="mt-4 space-y-3">
              {workingDeck.cards.length === 0 && (
                <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
                  Search cards on the right and add them to your list.
                </p>
              )}
              {workingDeck.cards.map((entry) => (
                <div
                  key={entry.cardId}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/50 p-3"
                >
                  <div className="h-16 w-12 overflow-hidden rounded-lg bg-slate-800">
                    {entry.card?.media.image_url && (
                      <Image
                        src={entry.card.media.image_url}
                        alt={entry.card.name}
                        width={80}
                        height={112}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{entry.cardName}</p>
                    <p className="text-xs text-slate-400">
                      {entry.card?.classification?.type ?? "Unknown"} · {entry.card?.classification?.rarity ?? "?"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => adjustQuantity(entry.cardId, -1)}
                      className="rounded-full border border-white/20 px-2 py-1 text-sm"
                    >
                      -
                    </button>
                    <span className="min-w-[2ch] text-center text-lg font-semibold">{entry.quantity}</span>
                    <button
                      onClick={() => adjustQuantity(entry.cardId, 1)}
                      className="rounded-full border border-white/20 px-2 py-1 text-sm"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => removeCard(entry.cardId)}
                    className="rounded-full border border-white/20 px-2 py-1 text-xs text-slate-300"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </p>
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
              <button
                key={card.id}
                onClick={() => handleAddCard(card)}
                className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-left hover:border-cyan-400/60"
              >
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
                <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs text-cyan-200">Add</span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
