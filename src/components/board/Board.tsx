"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";
import { useParams } from "next/navigation";
import Card, { type CardState } from "./Card";
import styles from "./Board.module.css";
import { zones, type Zone } from "@/src/lib/zones";
import { supabase } from "@/src/lib/supabaseClient";
import { mapDeckRow } from "@/src/lib/decks";
import type { DeckCardEntry, DeckSummary } from "@/src/types/deck";
import {
  CARD_HEIGHT_PCT,
  CARD_WIDTH_PCT,
  CARD_GAP_PCT,
  STACK_OFFSET_PCT,
  getZoneAtPoint,
  getSlotGrid,
  getNearestSlotIndex,
  getSlotPosition,
} from "@/src/lib/snap";

type DragState = {
  ids: string[];
  startPoint: { x: number; y: number };
  startPositions: Record<string, { x: number; y: number }>;
  pointerId: number;
};

type ContextMenuState = {
  cardId: string;
  x: number;
  y: number;
};

const HAND_GAP_PCT = 1.2;
const HAND_COLLAPSED_SCALE = 0.65;
const HAND_COLLAPSED_OFFSET_PCT = 4;
const HAND_DROP_BAND_PERCENT = 0.4;

const ZONE_IDS = {
  runes: "zones_p1_runes",
  runeDeck: "zones_p1_rune_deck",
  mainDeck: "zones_p1_deck",
  champion: "zones_p1_champion",
  legend: "zones_p1_legend",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

type DeckSetup = {
  cards: CardState[];
  legend?: DeckCardEntry;
  champion?: DeckCardEntry;
};

function expandEntries(entries: DeckCardEntry[]) {
  return entries.flatMap((entry) =>
    Array.from({ length: entry.quantity }, (_, index) => ({
      entry,
      instanceId: `${entry.cardId}-${index + 1}`,
    }))
  );
}

function isChampion(entry: DeckCardEntry) {
  const supertype = entry.cardSupertype?.toLowerCase() ?? "";
  const type = entry.cardType?.toLowerCase() ?? "";
  return supertype === "champion" || type.includes("champion");
}

function sharesLegendTag(entry: DeckCardEntry, legend?: DeckCardEntry) {
  if (!legend) return false;
  const legendTags = (legend.cardTags ?? []).map((tag) => tag.toLowerCase());
  const entryTags = (entry.cardTags ?? []).map((tag) => tag.toLowerCase());
  return legendTags.some((tag) => entryTags.includes(tag));
}

function getZoneCenter(zone: Zone) {
  return {
    x: zone.x + (zone.width - CARD_WIDTH_PCT) / 2,
    y: zone.y + (zone.height - CARD_HEIGHT_PCT) / 2,
  };
}

function getStackPosition(zone: Zone, index: number) {
  const center = getZoneCenter(zone);
  return {
    x: clamp(center.x + index * STACK_OFFSET_PCT, 0, 100 - CARD_WIDTH_PCT),
    y: clamp(center.y + index * STACK_OFFSET_PCT, 0, 100 - CARD_HEIGHT_PCT),
  };
}

function buildCardsFromDeck(deck: DeckSummary, zoneMap: Map<string, Zone>): DeckSetup {
  const legendEntry = deck.cards.find((card) => card.section === "legend");
  const mainEntries = deck.cards.filter((card) => card.section === "main");
  const runeEntries = deck.cards.filter((card) => card.section === "runes");
  const championEntries = deck.cards.filter((card) => card.section === "champion");

  const mainInstances = expandEntries(mainEntries);
  const runeInstances = expandEntries(runeEntries);

  let championInstance = championEntries.length > 0 ? expandEntries([championEntries[0]])[0] : undefined;
  if (!championInstance) {
    const candidates = mainInstances.filter((instance) => isChampion(instance.entry));
    championInstance =
      candidates.find((instance) => sharesLegendTag(instance.entry, legendEntry)) ?? candidates[0];
  }

  if (championInstance) {
    const removeIndex = mainInstances.findIndex((instance) => instance.instanceId === championInstance!.instanceId);
    if (removeIndex >= 0) {
      mainInstances.splice(removeIndex, 1);
    }
  }

  const handInstances = mainInstances.splice(0, 4);

  const mainDeckZone = zoneMap.get(ZONE_IDS.mainDeck);
  const runeDeckZone = zoneMap.get(ZONE_IDS.runeDeck);
  const championZone = zoneMap.get(ZONE_IDS.champion);
  const legendZone = zoneMap.get(ZONE_IDS.legend);

  const cards: CardState[] = [];
  let zIndex = 1;

  if (legendEntry && legendZone) {
    const position = getZoneCenter(legendZone);
    cards.push({
      id: `legend-${legendEntry.cardId}`,
      title: legendEntry.cardName,
      x: position.x,
      y: position.y,
      rotation: 0,
      faceUp: true,
      zIndex: zIndex++,
      zoneId: legendZone.id,
      slotIndex: 0,
      section: "legend",
    });
  }

  if (championInstance && championZone) {
    const position = getZoneCenter(championZone);
    cards.push({
      id: `champion-${championInstance.instanceId}`,
      title: championInstance.entry.cardName,
      x: position.x,
      y: position.y,
      rotation: 0,
      faceUp: true,
      zIndex: zIndex++,
      zoneId: championZone.id,
      slotIndex: 0,
      section: "champion",
    });
  }

  if (runeDeckZone) {
    runeInstances.forEach((instance, index) => {
      const position = getStackPosition(runeDeckZone, index);
      cards.push({
        id: `rune-${instance.instanceId}`,
        title: instance.entry.cardName,
        x: position.x,
        y: position.y,
        rotation: 0,
        faceUp: false,
        zIndex: zIndex++,
        zoneId: runeDeckZone.id,
        slotIndex: 0,
        section: "runes",
      });
    });
  }

  if (mainDeckZone) {
    mainInstances.forEach((instance, index) => {
      const position = getStackPosition(mainDeckZone, index);
      cards.push({
        id: `main-${instance.instanceId}`,
        title: instance.entry.cardName,
        x: position.x,
        y: position.y,
        rotation: 0,
        faceUp: false,
        zIndex: zIndex++,
        zoneId: mainDeckZone.id,
        slotIndex: 0,
        section: "main",
      });
    });
  }

  handInstances.forEach((instance) => {
    cards.push({
      id: `hand-${instance.instanceId}`,
      title: instance.entry.cardName,
      x: 50,
      y: 50,
      rotation: 0,
      faceUp: true,
      zIndex: zIndex++,
      zoneId: "hand",
      slotIndex: null,
      section: "main",
      scale: HAND_COLLAPSED_SCALE,
    });
  });

  return { cards, legend: legendEntry, champion: championInstance?.entry };
}

export default function Board() {
  const boardRef = useRef<HTMLDivElement | null>(null);
  const params = useParams();
  const [cards, setCards] = useState<CardState[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [showZones, setShowZones] = useState(false);
  const [actionLog, setActionLog] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [zoomCardId, setZoomCardId] = useState<string | null>(null);
  const [handExpanded, setHandExpanded] = useState(false);
  const [deckName, setDeckName] = useState<string | null>(null);
  const [deckData, setDeckData] = useState<DeckSummary | null>(null);
  const [deckError, setDeckError] = useState<string | null>(null);
  const [loadingDeck, setLoadingDeck] = useState(true);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const zoneMap = useMemo(() => new Map(zones.map((zone) => [zone.id, zone])), []);
  const runesZone = zoneMap.get(ZONE_IDS.runes) ?? null;

  useEffect(() => {
    const loadDeck = async () => {
      const matchCodeRaw = typeof params?.code === "string" ? params.code : undefined;
      const matchCode = matchCodeRaw?.toUpperCase();
      const storedDeckId =
        (matchCode && window.localStorage.getItem(`matchDeck:${matchCode}`)) ||
        window.localStorage.getItem("selectedDeckId");

      if (!storedDeckId) {
        setDeckError("No deck selected. Return to the lobby and choose a deck.");
        setLoadingDeck(false);
        return;
      }

      const { data, error } = await supabase
        .from("decks")
        .select(
          "id, owner_id, name, description, format, cover_card_id, is_public, created_at, updated_at, deck_cards(card_id, card_name, card_public_code, quantity, section, card_domains, card_supertype, card_type, card_tags)"
        )
        .eq("id", storedDeckId)
        .single();

      if (error || !data) {
        setDeckError(error?.message ?? "Could not load the selected deck.");
        setLoadingDeck(false);
        return;
      }

      const deck = mapDeckRow(data);
      const missingZones = Object.values(ZONE_IDS).filter((id) => !zoneMap.get(id));
      if (missingZones.length > 0) {
        setDeckError(`Missing zones in zones.json: ${missingZones.join(", ")}`);
        setLoadingDeck(false);
        return;
      }

      setDeckName(deck.name);
      setDeckData(deck);
      const setup = buildCardsFromDeck(deck, zoneMap);
      setCards(setup.cards);
      setLoadingDeck(false);
      setActionLog((prev) => [
        `Loaded deck ${deck.name}`,
        setup.champion ? `Champion: ${setup.champion.cardName}` : "Champion: none",
        setup.legend ? `Legend: ${setup.legend.cardName}` : "Legend: none",
        "Drew 4 cards",
        ...prev,
      ]);
    };

    loadDeck();
  }, [params, zoneMap]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "z" || event.key === "Z") {
        setShowZones((prev) => !prev);
      }
      if (event.key === "Escape") {
        setSelectedIds([]);
        setContextMenu(null);
        setZoomCardId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const handlePointerDown = () => setContextMenu(null);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [contextMenu]);

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return;
      const point = getBoardPoint(event.clientX, event.clientY);
      if (!point) return;
      const deltaX = point.x - dragState.startPoint.x;
      const deltaY = point.y - dragState.startPoint.y;

      setCards((prev) =>
        prev.map((card) => {
          if (!dragState.ids.includes(card.id)) return card;
          const start = dragState.startPositions[card.id];
          const nextX = clamp(start.x + deltaX, 0, 100 - CARD_WIDTH_PCT);
          const nextY = clamp(start.y + deltaY, 0, 100 - CARD_HEIGHT_PCT);
          return { ...card, x: nextX, y: nextY };
        })
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) return;
      finalizeDrag();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState]);

  const handLayout = useMemo(() => {
    if (!runesZone) return new Map<string, { x: number; y: number; scale: number }>();
    const handCards = cards.filter((card) => card.zoneId === "hand");
    if (handCards.length === 0) return new Map();

    const ordered = [...handCards].sort((a, b) => a.zIndex - b.zIndex);
    const spacing = Math.min(
      CARD_WIDTH_PCT * 0.8,
      (runesZone.width - CARD_WIDTH_PCT) / Math.max(ordered.length - 1, 1)
    );
    const totalWidth = CARD_WIDTH_PCT + spacing * (ordered.length - 1);
    const startX = runesZone.x + (runesZone.width - totalWidth) / 2;
    const baseY = handExpanded
      ? runesZone.y + runesZone.height - CARD_HEIGHT_PCT - 0.5
      : runesZone.y + runesZone.height - CARD_HEIGHT_PCT * 0.65 - HAND_COLLAPSED_OFFSET_PCT;
    const scale = handExpanded ? 1 : HAND_COLLAPSED_SCALE;

    return new Map(
      ordered.map((card, index) => [
        card.id,
        {
          x: clamp(startX + index * spacing, 0, 100 - CARD_WIDTH_PCT),
          y: clamp(baseY, 0, 100 - CARD_HEIGHT_PCT),
          scale,
        },
      ])
    );
  }, [cards, handExpanded, runesZone]);

  useEffect(() => {
    if (handLayout.size === 0) return;
    setCards((prev) => {
      let changed = false;
      const next = prev.map((card) => {
        if (card.zoneId !== "hand") return card;
        const layout = handLayout.get(card.id);
        if (!layout) return card;
        if (card.x === layout.x && card.y === layout.y && card.scale === layout.scale) {
          return card;
        }
        changed = true;
        return { ...card, x: layout.x, y: layout.y, scale: layout.scale };
      });
      return changed ? next : prev;
    });
  }, [handLayout]);

  function pushLog(entry: string) {
    setActionLog((prev) => [entry, ...prev].slice(0, 6));
  }

  function getBoardPoint(clientX: number, clientY: number) {
    const board = boardRef.current;
    if (!board) return null;
    const rect = board.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return { x, y };
  }

  function isPointInHandArea(point: { x: number; y: number }) {
    if (!runesZone) return false;
    const bandTop = runesZone.y + runesZone.height * (1 - HAND_DROP_BAND_PERCENT);
    return (
      point.x >= runesZone.x &&
      point.x <= runesZone.x + runesZone.width &&
      point.y >= bandTop &&
      point.y <= runesZone.y + runesZone.height
    );
  }

  function handleBoardPointerDown() {
    setContextMenu(null);
    setSelectedIds([]);
  }

  function handleBoardPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!runesZone) return;
    const point = getBoardPoint(event.clientX, event.clientY);
    if (!point) return;
    const hoveringHand = cards.some(
      (card) =>
        card.zoneId === "hand" &&
        point.x >= card.x &&
        point.x <= card.x + CARD_WIDTH_PCT &&
        point.y >= card.y &&
        point.y <= card.y + CARD_HEIGHT_PCT
    );
    if (hoveringHand !== handExpanded) {
      setHandExpanded(hoveringHand);
    }
  }

  function handleBoardPointerLeave() {
    if (handExpanded) setHandExpanded(false);
  }

  function handleCardPointerDown(event: ReactPointerEvent<HTMLDivElement>, cardId: string) {
    if (event.button !== 0) return;
    event.stopPropagation();
    setContextMenu(null);

    if (event.shiftKey) {
      setSelectedIds((prev) =>
        prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]
      );
      return;
    }

    setSelectedIds((prev) => (prev.includes(cardId) ? prev : [cardId]));

    const point = getBoardPoint(event.clientX, event.clientY);
    if (!point) return;

    const dragIds = selectedSet.has(cardId) ? Array.from(selectedSet) : [cardId];
    const startPositions: DragState["startPositions"] = {};
    const handIds = new Set<string>();
    cards.forEach((card) => {
      if (!dragIds.includes(card.id)) return;
      if (card.zoneId === "hand") {
        const layout = handLayout.get(card.id);
        if (layout) {
          startPositions[card.id] = { x: layout.x, y: layout.y };
          handIds.add(card.id);
          return;
        }
      }
      startPositions[card.id] = { x: card.x, y: card.y };
    });

    if (handIds.size > 0) {
      setCards((prev) =>
        prev.map((card) => {
          if (!handIds.has(card.id)) return card;
          const layout = handLayout.get(card.id);
          if (!layout) return card;
          return { ...card, x: layout.x, y: layout.y, zoneId: null, scale: 1 };
        })
      );
    }

    setDragState({
      ids: dragIds,
      startPoint: point,
      startPositions,
      pointerId: event.pointerId,
    });

    const topZ = Math.max(...cards.map((card) => card.zIndex));
    setCards((prev) =>
      prev.map((card) => (dragIds.includes(card.id) ? { ...card, zIndex: topZ + 1 } : card))
    );
  }

  function finalizeDrag() {
    if (!dragState) return;
    const draggedSet = new Set(dragState.ids);
    const cardSize = { width: CARD_WIDTH_PCT, height: CARD_HEIGHT_PCT };
    const logEntries: string[] = [];

    setCards((prev) => {
      const slotCounts = new Map<string, number>();
      prev.forEach((card) => {
        if (!card.zoneId || draggedSet.has(card.id) || card.slotIndex === null) return;
        const key = `${card.zoneId}:${card.slotIndex}`;
        slotCounts.set(key, (slotCounts.get(key) ?? 0) + 1);
      });

      return prev.map((card) => {
        if (!draggedSet.has(card.id)) return card;
        const center = { x: card.x + CARD_WIDTH_PCT / 2, y: card.y + CARD_HEIGHT_PCT / 2 };
        const shouldDropToHand = isPointInHandArea(center) && card.section !== "runes";
        if (shouldDropToHand) {
          logEntries.push(`Moved ${card.title} to hand`);
          return { ...card, zoneId: "hand", slotIndex: null, faceUp: true };
        }

        const zone = getZoneAtPoint(center, zones);
        if (!zone) {
          if (card.zoneId) {
            logEntries.push(`Moved ${card.title}`);
          }
          return { ...card, zoneId: null, slotIndex: null };
        }

        const { slots } = getSlotGrid(zone, cardSize, CARD_GAP_PCT);
        const slotIndex = getNearestSlotIndex(center, slots, cardSize);
        const slotPos = getSlotPosition(zone, slotIndex, cardSize, CARD_GAP_PCT);
        const key = `${zone.id}:${slotIndex}`;
        const stackOffset = (slotCounts.get(key) ?? 0) * STACK_OFFSET_PCT;
        slotCounts.set(key, (slotCounts.get(key) ?? 0) + 1);

        const nextX = clamp(slotPos.x + stackOffset, 0, 100 - CARD_WIDTH_PCT);
        const nextY = clamp(slotPos.y + stackOffset, 0, 100 - CARD_HEIGHT_PCT);

        logEntries.push(`Moved ${card.title} to ${zone.id}`);
        return { ...card, x: nextX, y: nextY, zoneId: zone.id, slotIndex };
      });
    });

    if (logEntries.length > 0) {
      setActionLog((prev) => [...logEntries, ...prev].slice(0, 6));
    }

    setDragState(null);
  }

  function handleCardContextMenu(event: ReactMouseEvent<HTMLDivElement>, cardId: string) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedIds([cardId]);
    setContextMenu({ cardId, x: event.clientX, y: event.clientY });
  }

  function handleDoubleClick(cardId: string) {
    setZoomCardId(cardId);
  }

  function updateCard(cardId: string, updater: (card: CardState) => CardState) {
    setCards((prev) => prev.map((card) => (card.id === cardId ? updater(card) : card)));
  }

  function handleRotate(cardId: string, degrees: number) {
    updateCard(cardId, (card) => ({ ...card, rotation: (card.rotation + degrees) % 360 }));
    pushLog(`Rotated ${getCardTitle(cardId)}`);
  }

  function handleFlip(cardId: string) {
    updateCard(cardId, (card) => ({ ...card, faceUp: !card.faceUp }));
    pushLog(`Flipped ${getCardTitle(cardId)}`);
  }

  function handleBringToFront(cardId: string) {
    const maxZ = Math.max(...cards.map((card) => card.zIndex));
    updateCard(cardId, (card) => ({ ...card, zIndex: maxZ + 1 }));
    pushLog(`Brought ${getCardTitle(cardId)} to front`);
  }

  function handleSendToBack(cardId: string) {
    const minZ = Math.min(...cards.map((card) => card.zIndex));
    updateCard(cardId, (card) => ({ ...card, zIndex: minZ - 1 }));
    pushLog(`Sent ${getCardTitle(cardId)} to back`);
  }

  function handleDuplicate(cardId: string) {
    const source = cards.find((card) => card.id === cardId);
    if (!source) return;
    const maxZ = Math.max(...cards.map((card) => card.zIndex));
    const copy: CardState = {
      ...source,
      id: `card-${crypto.randomUUID()}`,
      title: `${source.title} Copy`,
      x: clamp(source.x + 1.2, 0, 100 - CARD_WIDTH_PCT),
      y: clamp(source.y + 1.2, 0, 100 - CARD_HEIGHT_PCT),
      zIndex: maxZ + 1,
      zoneId: null,
      slotIndex: null,
    };
    setCards((prev) => [...prev, copy]);
    pushLog(`Duplicated ${source.title}`);
  }

  function handleDelete(cardId: string) {
    const title = getCardTitle(cardId);
    setCards((prev) => prev.filter((card) => card.id !== cardId));
    setSelectedIds((prev) => prev.filter((id) => id !== cardId));
    pushLog(`Deleted ${title}`);
  }

  function getCardTitle(cardId: string) {
    return cards.find((card) => card.id === cardId)?.title ?? "card";
  }

  function handleReset() {
    if (deckData) {
      const setup = buildCardsFromDeck(deckData, zoneMap);
      setCards(setup.cards);
    } else {
      setCards([]);
    }
    setSelectedIds([]);
    setContextMenu(null);
    setZoomCardId(null);
    pushLog("Reset demo");
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Riftbound Tabletop</h1>
          <p>Drag cards, press Z for zones, Shift+click to multi-select.</p>
          {deckName && <span className={styles.deckBadge}>Deck: {deckName}</span>}
        </div>
        <button type="button" className={styles.resetButton} onClick={handleReset}>
          Reset Demo
        </button>
      </header>

      {loadingDeck && <div className={styles.notice}>Loading deck...</div>}
      {deckError && <div className={styles.noticeError}>{deckError}</div>}

      <div
        ref={boardRef}
        className={styles.board}
        onPointerDown={handleBoardPointerDown}
        onPointerMove={handleBoardPointerMove}
        onPointerLeave={handleBoardPointerLeave}
        style={{
          ["--card-width-pct" as never]: `${CARD_WIDTH_PCT}`,
          ["--card-height-pct" as never]: `${CARD_HEIGHT_PCT}`,
        }}
      >
        <div className={styles.zoneLayer}>
          {zones.map((zone) => (
            <div
              key={zone.id}
              className={`${styles.zoneOutline} ${showZones ? styles.zoneVisible : ""}`}
              style={{
                left: `${zone.x}%`,
                top: `${zone.y}%`,
                width: `${zone.width}%`,
                height: `${zone.height}%`,
              }}
            />
          ))}
        </div>

        <div className={styles.cardLayer}>
          {cards.map((card) => (
            <Card
              key={card.id}
              card={card}
              selected={selectedSet.has(card.id)}
              dragging={!!dragState && dragState.ids.includes(card.id)}
              onPointerDown={handleCardPointerDown}
              onContextMenu={handleCardContextMenu}
              onDoubleClick={handleDoubleClick}
            />
          ))}
        </div>

        <div className={styles.logPanel}>
          <div className={styles.logTitle}>Action Log</div>
          {actionLog.length === 0 ? (
            <div className={styles.logEmpty}>No actions yet.</div>
          ) : (
            actionLog.map((entry, index) => (
              <div key={`${entry}-${index}`} className={styles.logEntry}>
                {entry}
              </div>
            ))
          )}
        </div>
      </div>

      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <button type="button" onClick={() => handleRotate(contextMenu.cardId, 90)}>
            Rotate 90 deg
          </button>
          <button type="button" onClick={() => handleRotate(contextMenu.cardId, 180)}>
            Rotate 180 deg
          </button>
          <button type="button" onClick={() => handleFlip(contextMenu.cardId)}>
            Flip Face
          </button>
          <button type="button" onClick={() => handleBringToFront(contextMenu.cardId)}>
            Bring to Front
          </button>
          <button type="button" onClick={() => handleSendToBack(contextMenu.cardId)}>
            Send to Back
          </button>
          <button type="button" onClick={() => handleDuplicate(contextMenu.cardId)}>
            Duplicate
          </button>
          <button type="button" onClick={() => handleDelete(contextMenu.cardId)}>
            Delete
          </button>
        </div>
      )}

      {zoomCardId && (
        <div className={styles.zoomOverlay} onClick={() => setZoomCardId(null)}>
          <div className={styles.zoomCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.zoomTitle}>{getCardTitle(zoomCardId)}</div>
            <div className={styles.zoomHint}>Double-click a card to preview. Press ESC to close.</div>
          </div>
        </div>
      )}
    </main>
  );
}
