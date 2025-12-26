export type PlayerSlot = "p1" | "p2";
export type ZoneKey = "deck" | "hand" | "battlefield" | "discard";

export interface MatchCard {
  uid: string;
  name: string;
  img: string | null;
}

export interface PlayerZones {
  deck: MatchCard[];
  hand: MatchCard[];
  battlefield: MatchCard[];
  discard: MatchCard[];
}

export interface PlayerState {
  id: string | null;
  life: number;
  zones: PlayerZones;
}

export interface MatchState {
  players: {
    p1: PlayerState;
    p2: PlayerState;
  };
  turn: PlayerSlot;
  phase: string;
  createdAt: string;
}

export interface MatchEventRecord {
  id: number;
  match_id: string;
  player_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface MatchSummary {
  id: string;
  code: string;
  player1_id: string;
  player2_id: string | null;
  spectators_allowed: boolean;
  created_at: string;
}
