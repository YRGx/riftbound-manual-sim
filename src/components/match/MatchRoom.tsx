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

const ZONE_CANVAS = { width: 1440, height: 960 };
const ZONES = [
  { name: "zone_01", x: 133, y: 0, width: 138, height: 95 },
  { name: "zone_02", x: 283, y: 0, width: 874, height: 294 },
  { name: "zone_03", x: 1163, y: 0, width: 138, height: 95 },
  { name: "zone_04", x: 133, y: 116, width: 138, height: 178 },
  { name: "zone_05", x: 1010, y: 116, width: 138, height: 178 },
  { name: "zone_06", x: 1163, y: 116, width: 138, height: 178 },
  { name: "zone_07", x: 137, y: 315, width: 530, height: 269 },
  { name: "zone_08", x: 771, y: 315, width: 530, height: 262 },
  { name: "zone_09", x: 119, y: 598, width: 152, height: 178 },
  { name: "zone_10", x: 286, y: 598, width: 138, height: 184 },
  { name: "zone_11", x: 439, y: 598, width: 712, height: 186 },
  { name: "zone_12", x: 1163, y: 598, width: 138, height: 178 },
  { name: "zone_13", x: 286, y: 787, width: 865, height: 173 },
  { name: "zone_14", x: 133, y: 796, width: 138, height: 164 },
  { name: "zone_15", x: 1163, y: 797, width: 138, height: 163 },
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
