"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import type {
  MatchCard,
  MatchEventRecord,
  MatchState,
  MatchSummary,
  PlayerSlot,
  PlayerState,
  ZoneKey,
} from "@/src/types/match";

interface MatchRoomProps {
  match: MatchSummary;
  initialState: MatchState;
  initialEvents: MatchEventRecord[];
  currentUserId: string;
}

interface DropPayload {
  cardUid: string;
  fromSlot: PlayerSlot;
  fromZone: ZoneKey;
}

export default function MatchRoom({
  match,
  initialState,
  initialEvents,
  currentUserId,
}: MatchRoomProps) {
  const router = useRouter();
  const [state, setState] = useState<MatchState>(initialState);
  const [events, setEvents] = useState<MatchEventRecord[]>(initialEvents);
  const [actionError, setActionError] = useState<string | null>(null);

  const viewerSlot: PlayerSlot | null = useMemo(() => {
    if (match.player1_id === currentUserId) return "p1";
    if (match.player2_id === currentUserId) return "p2";
    return null;
  }, [match.player1_id, match.player2_id, currentUserId]);

  const leftSlot: PlayerSlot = viewerSlot ?? "p1";
  const rightSlot: PlayerSlot = leftSlot === "p1" ? "p2" : "p1";

  useEffect(() => {
    const channel = supabase
      .channel(`match-${match.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "match_state", filter: `match_id=eq.${match.id}` },
        (payload) => {
          setState(payload.new.state as MatchState);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "match_events", filter: `match_id=eq.${match.id}` },
        (payload) => {
          setEvents((prev) => [payload.new as MatchEventRecord, ...prev].slice(0, 60));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [match.id]);

  async function runAction(type: string, payload?: Record<string, unknown>) {
    setActionError(null);
    const response = await fetch(`/api/match/${match.code}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setActionError(body.error ?? "Action failed");
    }
  }

  function handleDrop(slot: PlayerSlot, zone: ZoneKey, nativeEvent: DragEvent<HTMLDivElement>) {
    if (!viewerSlot) return;
    nativeEvent.preventDefault();
    const data = nativeEvent.dataTransfer.getData("application/json");
    if (!data) return;

    const payload = JSON.parse(data) as DropPayload;
    runAction("move-card", {
      cardUid: payload.cardUid,
      fromSlot: payload.fromSlot,
      fromZone: payload.fromZone,
      toSlot: slot,
      toZone: zone,
    });
  }

  function handleDragStart(event: DragEvent<HTMLDivElement>, slot: PlayerSlot, zone: ZoneKey, card: MatchCard) {
    event.dataTransfer.setData(
      "application/json",
      JSON.stringify({ cardUid: card.uid, fromSlot: slot, fromZone: zone })
    );
  }

  const canControl = Boolean(viewerSlot);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-4 rounded-2xl border border-white/5 bg-slate-900/70 p-6 shadow-xl backdrop-blur md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.4em] text-cyan-400">Match Code</p>
          <div className="flex items-center gap-4">
            <h1 className="text-4xl font-extrabold tracking-[0.3em]">{match.code}</h1>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white/80">
              {viewerSlot ? (viewerSlot === "p1" ? "Player 1" : "Player 2") : "Spectator"}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-300">
            Turn: <span className="font-semibold text-white">{state.turn === viewerSlot ? "You" : state.turn.toUpperCase()}</span>
            <span className="ml-3 text-xs uppercase tracking-widest text-slate-400">Phase: {state.phase}</span>
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => router.push("/lobby")}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white hover:border-cyan-400"
          >
            Back to Lobby
          </button>
          {viewerSlot && (
            <button
              onClick={() => runAction("end-turn")}
              className="rounded-xl bg-emerald-500/80 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            >
              End Turn
            </button>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="space-y-6">
          <PlayerBoard
            slot={leftSlot}
            viewerSlot={viewerSlot}
            player={state.players[leftSlot]}
            canControl={canControl}
            onDraw={() => runAction("draw-card", { player: leftSlot })}
            onShuffle={() => runAction("shuffle-deck", { player: leftSlot })}
            onMulligan={() => runAction("mulligan", { player: leftSlot })}
            onLife={(delta) => runAction("life-change", { player: leftSlot, delta })}
            onDrop={handleDrop}
            onDragStart={handleDragStart}
          />

          <PlayerBoard
            slot={rightSlot}
            viewerSlot={viewerSlot}
            player={state.players[rightSlot]}
            canControl={canControl}
            onDraw={() => runAction("draw-card", { player: rightSlot })}
            onShuffle={() => runAction("shuffle-deck", { player: rightSlot })}
            onMulligan={() => runAction("mulligan", { player: rightSlot })}
            onLife={(delta) => runAction("life-change", { player: rightSlot, delta })}
            onDrop={handleDrop}
            onDragStart={handleDragStart}
          />
        </section>

        <aside className="flex flex-col gap-6">
          <div className="rounded-2xl border border-white/5 bg-slate-900/80 p-5">
            <h2 className="text-lg font-semibold">Game Log</h2>
            <div className="mt-4 space-y-3 overflow-y-auto text-sm max-h-[60vh] pr-2">
              {events.length === 0 && (
                <p className="text-slate-400">Actions will appear here.</p>
              )}
              {events.map((event) => (
                <div key={event.id} className="rounded-lg border border-white/5 bg-white/5 p-3">
                  <p className="font-medium">{describeEvent(event)}</p>
                  <p className="text-xs text-slate-400">
                    {new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {actionError && (
            <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {actionError}
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}

interface PlayerBoardProps {
  slot: PlayerSlot;
  viewerSlot: PlayerSlot | null;
  player: PlayerState;
  canControl: boolean;
  onDraw: () => void;
  onShuffle: () => void;
  onMulligan: () => void;
  onLife: (delta: number) => void;
  onDrop: (slot: PlayerSlot, zone: ZoneKey, event: DragEvent<HTMLDivElement>) => void;
  onDragStart: (
    event: DragEvent<HTMLDivElement>,
    slot: PlayerSlot,
    zone: ZoneKey,
    card: MatchCard
  ) => void;
}

function PlayerBoard({
  slot,
  viewerSlot,
  player,
  canControl,
  onDraw,
  onShuffle,
  onMulligan,
  onLife,
  onDrop,
  onDragStart,
}: PlayerBoardProps) {
  const label = viewerSlot === slot ? "You" : slot === "p1" ? "Player One" : "Player Two";
  const controlsEnabled = canControl && viewerSlot === slot;

  return (
    <div className="space-y-4 rounded-2xl border border-white/5 bg-slate-950/60 p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-slate-400">{slot.toUpperCase()}</p>
          <h2 className="text-2xl font-bold">{label}</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2">
            <button
              disabled={!controlsEnabled}
              onClick={() => onLife(-1)}
              className="rounded bg-white/10 px-2 py-1 text-lg disabled:opacity-40"
            >
              -
            </button>
            <span className="text-3xl font-black text-emerald-300">{player.life}</span>
            <button
              disabled={!controlsEnabled}
              onClick={() => onLife(1)}
              className="rounded bg-white/10 px-2 py-1 text-lg disabled:opacity-40"
            >
              +
            </button>
          </div>
          <div className="text-sm text-slate-300">
            <p>Deck: {player.zones.deck.length}</p>
            <p>Hand: {player.zones.hand.length}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={onDraw}
          disabled={!controlsEnabled}
          className="rounded-xl bg-cyan-500/80 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
        >
          Draw
        </button>
        <button
          onClick={onShuffle}
          disabled={!controlsEnabled}
          className="rounded-xl bg-blue-500/80 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
        >
          Shuffle
        </button>
        <button
          onClick={onMulligan}
          disabled={!controlsEnabled}
          className="rounded-xl bg-amber-500/80 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
        >
          Mulligan
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Zone
          title="Deck"
          slot={slot}
          zoneKey="deck"
          cards={player.zones.deck}
          viewerSlot={viewerSlot}
          canControl={controlsEnabled}
          onDrop={onDrop}
          onDragStart={onDragStart}
        />
        <Zone
          title="Hand"
          slot={slot}
          zoneKey="hand"
          cards={player.zones.hand}
          viewerSlot={viewerSlot}
          canControl={controlsEnabled}
          onDrop={onDrop}
          onDragStart={onDragStart}
        />
        <Zone
          title="Battlefield"
          slot={slot}
          zoneKey="battlefield"
          cards={player.zones.battlefield}
          viewerSlot={viewerSlot}
          canControl={controlsEnabled}
          onDrop={onDrop}
          onDragStart={onDragStart}
        />
        <Zone
          title="Discard"
          slot={slot}
          zoneKey="discard"
          cards={player.zones.discard}
          viewerSlot={viewerSlot}
          canControl={controlsEnabled}
          onDrop={onDrop}
          onDragStart={onDragStart}
        />
      </div>
    </div>
  );
}

interface ZoneProps {
  title: string;
  slot: PlayerSlot;
  zoneKey: ZoneKey;
  cards: MatchCard[];
  viewerSlot: PlayerSlot | null;
  canControl: boolean;
  onDrop: (slot: PlayerSlot, zone: ZoneKey, event: DragEvent<HTMLDivElement>) => void;
  onDragStart: (
    event: DragEvent<HTMLDivElement>,
    slot: PlayerSlot,
    zone: ZoneKey,
    card: MatchCard
  ) => void;
}

function Zone({
  title,
  slot,
  zoneKey,
  cards,
  viewerSlot,
  canControl,
  onDrop,
  onDragStart,
}: ZoneProps) {
  const faceDown = zoneKey === "deck" || (zoneKey === "hand" && viewerSlot !== slot);
  const showCards = !faceDown;

  return (
    <div>
      <div className="flex items-center justify-between text-sm text-slate-300">
        <h3 className="font-semibold uppercase tracking-wide text-white">{title}</h3>
        <span>{cards.length}</span>
      </div>
      <div
        className={`mt-2 min-h-[120px] rounded-xl border border-dashed border-white/10 bg-slate-900/70 p-3 ${
          canControl ? "hover:border-cyan-400" : ""
        }`}
        onDragOver={(event) => {
          if (canControl) {
            event.preventDefault();
          }
        }}
        onDrop={(event) => {
          if (canControl) {
            onDrop(slot, zoneKey, event);
          }
        }}
      >
        {!cards.length && <p className="text-center text-xs text-slate-500">Empty</p>}
        {showCards ? (
          <div className="flex flex-wrap gap-2">
            {cards.map((card) => (
              <div
                key={card.uid}
                draggable={canControl}
                onDragStart={(event) => onDragStart(event, slot, zoneKey, card)}
                className={`h-14 w-24 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[11px] leading-tight ${
                  canControl ? "cursor-grab" : "cursor-not-allowed"
                }`}
              >
                <p className="font-semibold">{card.name}</p>
                {card.img && <p className="text-[10px] text-slate-300">Image attached</p>}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
            <span className="h-8 w-6 rounded border border-white/20 bg-white/5" />
            <span>Hidden stack</span>
          </div>
        )}
      </div>
    </div>
  );
}

function describeEvent(event: MatchEventRecord) {
  const payload = event.payload ?? {};
  switch (event.type) {
    case "draw-card":
      return `Player ${payload.player ?? "?"} drew ${Number(payload.count ?? 1)}`;
    case "shuffle-deck":
      return `Player ${payload.player ?? "?"} shuffled their deck`;
    case "move-card":
      return `Moved card ${payload.cardUid} from ${formatZone(payload.from)} to ${formatZone(payload.to)}`;
    case "mulligan":
      return `Player ${payload.player ?? "?"} mulliganed their hand`;
    case "life-change":
      const delta = Number(payload.delta ?? 0);
      return `Player ${payload.player ?? "?"} ${delta >= 0 ? "gained" : "lost"} ${Math.abs(delta)} life`;
    case "end-turn":
      return `Turn passed to ${payload.turn}`;
    case "match_created":
      return "Match created";
    case "player_joined":
      return `Second seat filled`;
    default:
      return event.type;
  }
}

function formatZone(
  zone: unknown
): string {
  if (!zone || typeof zone !== "object") return "unknown";
  const value = zone as { slot?: string; zone?: string };
  return `${value.slot ?? "?"} ${value.zone ?? "zone"}`;
}
