"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import type { MatchEventRecord, MatchState, MatchSummary, PlayerSlot } from "@/src/types/match";
import styles from "./MatchRoom.module.css";

interface MatchRoomProps {
  match: MatchSummary;
  initialState: MatchState;
  initialEvents: MatchEventRecord[];
  currentUserId: string;
}

const ZONE_CANVAS = { width: 1920, height: 1080 };
const ZONES: Array<{ name: string; x: number; y: number; width: number; height: number; rotation?: number }> = [
  {
    name: "zones_p2_champion",
    x: 1663.76528480649,
    y: 330.1842706054449,
    width: 155.79525756835938,
    height: 200.9532928466797,
    rotation: 180,
  },
  {
    name: "zones_p2_runes",
    x: 1491.0358276367188,
    y: 105.52299499511716,
    width: 976.542724609375,
    height: 200.9532928466797,
    rotation: 180,
  },
  {
    name: "zones_p2_base",
    x: 1318.3063659667969,
    y: 330.18427060544485,
    width: 803.8131713867188,
    height: 200.9532928466797,
    rotation: 180,
  },
  {
    name: "zones_p2_rune_deck",
    x: 1663.76528480649,
    y: 105.52299499511719,
    width: 155.79525756835938,
    height: 200.9532928466797,
    rotation: 180,
  },
  {
    name: "zones_p2_trash",
    x: 500.94580078125,
    y: 105.52299499511705,
    width: 155.79525756835938,
    height: 200.9532928466797,
    rotation: 180,
  },
  {
    name: "zones_p2_deck",
    x: 500.94580078125,
    y: 330.18427060544474,
    width: 155.79525756835938,
    height: 200.9532928466797,
    rotation: 180,
  },
  {
    name: "zones_p2_legend",
    x: 1491.0358276367188,
    y: 330.1842706054449,
    width: 155.79525756835938,
    height: 200.9532928466797,
    rotation: 180,
  },
  {
    name: "zones_battlefield_left",
    x: 345,
    y: 355,
    width: 602,
    height: 294,
  },
  {
    name: "zones_battlefield_right",
    x: 1064,
    y: 355,
    width: 600,
    height: 294,
  },
  {
    name: "zones_p1_champion",
    x: 345.1504878848791,
    y: 673.3853988945484,
    width: 155.79525756835938,
    height: 200.9532928466797,
  },
  {
    name: "zones_p1_runes",
    x: 517.8799743652344,
    y: 898.0467834472656,
    width: 976.542724609375,
    height: 200.9532928466797,
  },
  {
    name: "zones_p1_base",
    x: 690.6095581054688,
    y: 673.3853988945484,
    width: 803.8131713867188,
    height: 200.9532928466797,
  },
  {
    name: "zones_p1_rune_deck",
    x: 345.1504878848791,
    y: 898.0467834472656,
    width: 155.79525756835938,
    height: 200.9532928466797,
  },
  {
    name: "zones_p1_trash",
    x: 1507.9701843261719,
    y: 898.0467834472656,
    width: 155.79525756835938,
    height: 200.9532928466797,
  },
  {
    name: "zones_p1_deck",
    x: 1507.9701843261719,
    y: 673.3853988945484,
    width: 155.79525756835938,
    height: 200.9532928466797,
  },
  {
    name: "zones_p1_legend",
    x: 517.8799743652344,
    y: 673.3853988945484,
    width: 155.79525756835938,
    height: 200.9532928466797,
  },
];

export default function MatchRoom({ match, initialEvents, currentUserId }: MatchRoomProps) {
  const router = useRouter();
  const [events, setEvents] = useState<MatchEventRecord[]>(initialEvents);
  const [logOpen, setLogOpen] = useState(false);

  const viewerSlot: PlayerSlot | null = useMemo(() => {
    if (match.player1_id === currentUserId) return "p1";
    if (match.player2_id === currentUserId) return "p2";
    return null;
  }, [match.player1_id, match.player2_id, currentUserId]);

  useEffect(() => {
    const channel = supabase
      .channel(`match-${match.id}`)
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
    const response = await fetch(`/api/match/${match.code}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload }),
    });
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
          <div
            className={styles.zoneCanvas}
            style={{ width: ZONE_CANVAS.width, height: ZONE_CANVAS.height }}
            aria-hidden
          >
            {ZONES.map((zone) => (
              <div
                key={zone.name}
                className={styles.zoneRect}
                data-zone={zone.name}
                style={{
                  left: zone.x,
                  top: zone.y,
                  width: zone.width,
                  height: zone.height,
                  transform: `rotate(${zone.rotation ?? 0}deg)`,
                  transformOrigin: "0 0",
                }}
              />
            ))}
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
