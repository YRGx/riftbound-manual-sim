"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import type {
  MatchEventRecord,
  MatchState,
  MatchSummary,
  PlayerSlot,
  PlayerState,
} from "@/src/types/match";
import styles from "./MatchRoom.module.css";

interface MatchRoomProps {
  match: MatchSummary;
  initialState: MatchState;
  initialEvents: MatchEventRecord[];
  currentUserId: string;
}

const BOARD_BASE_HEIGHT = 900;
const HEADER_RESERVE = 140;
const MIN_BOARD_SCALE = 0.7;

export default function MatchRoom({ match, initialState, initialEvents, currentUserId }: MatchRoomProps) {
  const router = useRouter();
  const [state, setState] = useState<MatchState>(initialState);
  const [events, setEvents] = useState<MatchEventRecord[]>(initialEvents);
  const [actionError, setActionError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [boardScale, setBoardScale] = useState(1);

  const viewerSlot: PlayerSlot | null = useMemo(() => {
    if (match.player1_id === currentUserId) return "p1";
    if (match.player2_id === currentUserId) return "p2";
    return null;
  }, [match.player1_id, match.player2_id, currentUserId]);

  const bottomSlot: PlayerSlot = viewerSlot ?? "p1";
  const topSlot: PlayerSlot = bottomSlot === "p1" ? "p2" : "p1";
  const canControl = Boolean(viewerSlot);

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

  useEffect(() => {
    function syncScale() {
      if (typeof window === "undefined") {
        return;
      }
      const available = window.innerHeight - HEADER_RESERVE;
      const ratio = available / BOARD_BASE_HEIGHT;
      const nextScale = Math.min(1, Math.max(MIN_BOARD_SCALE, ratio));
      setBoardScale(Number.isFinite(nextScale) ? nextScale : 1);
    }

    syncScale();
    window.addEventListener("resize", syncScale);
    return () => {
      window.removeEventListener("resize", syncScale);
    };
  }, []);

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

  return (
    <main className={styles.page}>
      <div className={styles.pageBackground} aria-hidden />
      <div className={styles.pageContent}>
      <header className={styles.matchHeader}>
        <div className={styles.headerButtons}>
          <button onClick={() => router.push("/lobby")} className={styles.secondaryButton}>
            Back to Lobby
          </button>
          {viewerSlot && (
            <button onClick={() => runAction("end-turn")} className={styles.primaryButton}>
              End Turn
            </button>
          )}
        </div>
      </header>

      <div className={styles.stage}>
        <div className={styles.boardViewport} style={{ height: BOARD_BASE_HEIGHT * boardScale }}>
          <section
            className={styles.boardShell}
            style={{
              height: BOARD_BASE_HEIGHT,
              ...(boardScale < 1
                ? { transform: `scale(${boardScale})`, transformOrigin: "center top" }
                : {}),
            }}
          >
            <div className={styles.board}>
            <PlayerMat
              slot={topSlot}
              viewerSlot={viewerSlot}
              player={state.players[topSlot]}
              canControl={canControl}
              onDraw={() => runAction("draw-card", { player: topSlot })}
              onShuffle={() => runAction("shuffle-deck", { player: topSlot })}
              onMulligan={() => runAction("mulligan", { player: topSlot })}
              onLife={(delta) => runAction("life-change", { player: topSlot, delta })}
            />

            <div className={styles.centerField}>RIFTBOUND ARENA</div>

            <PlayerMat
              slot={bottomSlot}
              viewerSlot={viewerSlot}
              player={state.players[bottomSlot]}
              canControl={canControl}
              onDraw={() => runAction("draw-card", { player: bottomSlot })}
              onShuffle={() => runAction("shuffle-deck", { player: bottomSlot })}
              onMulligan={() => runAction("mulligan", { player: bottomSlot })}
              onLife={(delta) => runAction("life-change", { player: bottomSlot, delta })}
            />
          </div>

          {actionError && <p className={styles.errorBanner}>{actionError}</p>}
          </section>
        </div>

        <button
          type="button"
          className={`${styles.logTab} ${logOpen ? styles.logTabOpen : ""}`}
          onClick={() => setLogOpen((prev) => !prev)}
        >
          Log
        </button>

        <aside className={`${styles.logDrawer} ${logOpen ? styles.logDrawerOpen : ""}`}>
          <div className={styles.logHeader}>
            <h2>Game Log</h2>
            <button type="button" className={styles.closeDrawer} onClick={() => setLogOpen(false)}>
              Close
            </button>
          </div>
          <div className={styles.logScroll}>
            {events.length === 0 && <p className={styles.emptyLog}>Actions will appear here.</p>}
            {events.map((event) => (
              <div key={event.id} className={styles.logEntry}>
                <p>{describeEvent(event)}</p>
                <p className={styles.logTimestamp}>
                  {new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </div>
      </div>
    </main>
  );
}

interface PlayerMatProps {
  slot: PlayerSlot;
  viewerSlot: PlayerSlot | null;
  player: PlayerState;
  canControl: boolean;
  onDraw: () => void;
  onShuffle: () => void;
  onMulligan: () => void;
  onLife: (delta: number) => void;
}

function PlayerMat({
  slot,
  viewerSlot,
  player,
  canControl,
  onDraw,
  onShuffle,
  onMulligan,
  onLife,
}: PlayerMatProps) {
  const label = viewerSlot === slot ? "You" : slot === "p1" ? "Player One" : "Player Two";
  const controlsEnabled = canControl && viewerSlot === slot;

  return (
    <div className={styles.playerShell}>
      <div className={styles.playerHeader}>
        <div>
          <p className={styles.playerSlot}>{slot.toUpperCase()}</p>
          <h2>{label}</h2>
          <p className={styles.playerCounts}>
            Deck {player.zones.deck.length} | Hand {player.zones.hand.length}
          </p>
        </div>
        <div className={styles.playerControls}>
          <div className={styles.lifeDial}>
            <button
              disabled={!controlsEnabled}
              onClick={() => onLife(-1)}
              className={styles.lifeButton}
            >
              -
            </button>
            <span className={styles.lifeValue}>{player.life}</span>
            <button
              disabled={!controlsEnabled}
              onClick={() => onLife(1)}
              className={styles.lifeButton}
            >
              +
            </button>
          </div>
          <div className={styles.actionButtons}>
            <button onClick={onDraw} disabled={!controlsEnabled} className={styles.actionButton}>
              Draw
            </button>
            <button onClick={onShuffle} disabled={!controlsEnabled} className={styles.actionButton}>
              Shuffle
            </button>
            <button onClick={onMulligan} disabled={!controlsEnabled} className={styles.actionButton}>
              Mulligan
            </button>
          </div>
        </div>
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
    case "life-change": {
      const delta = Number(payload.delta ?? 0);
      return `Player ${payload.player ?? "?"} ${delta >= 0 ? "gained" : "lost"} ${Math.abs(delta)} life`;
    }
    case "end-turn":
      return `Turn passed to ${payload.turn}`;
    case "match_created":
      return "Match created";
    case "player_joined":
      return "Second seat filled";
    default:
      return event.type;
  }
}

function formatZone(zone: unknown): string {
  if (!zone || typeof zone !== "object") return "unknown";
  const value = zone as { slot?: string; zone?: string };
  return `${value.slot ?? "?"} ${value.zone ?? "zone"}`;
}
