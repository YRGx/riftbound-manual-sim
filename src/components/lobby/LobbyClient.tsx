"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";
import type { MatchSummary } from "@/src/types/match";

interface LobbyClientProps {
  initialMatches: MatchSummary[];
  userId: string;
}

export default function LobbyClient({ initialMatches, userId }: LobbyClientProps) {
  const router = useRouter();
  const [matches, setMatches] = useState(initialMatches);
  const [codeInput, setCodeInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeMatches = useMemo(
    () =>
      matches.filter(
        (match) => match.player1_id === userId || match.player2_id === userId
      ),
    [matches, userId]
  );

  async function refreshMatches() {
    const { data, error: refreshError } = await supabase
      .from("matches")
      .select("id, code, player1_id, player2_id, spectators_allowed, created_at")
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    if (!refreshError && data) {
      setMatches(data as MatchSummary[]);
    }
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    const response = await fetch("/api/match/create", { method: "POST" });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(payload.error ?? "Could not create match");
      setCreating(false);
      return;
    }

    router.push(`/match/${payload.code}`);
  }

  async function handleJoin(event: React.FormEvent) {
    event.preventDefault();
    const code = codeInput.trim().toUpperCase();
    if (!code) {
      setError("Enter a match code");
      return;
    }

    setJoining(true);
    setError(null);

    const response = await fetch("/api/match/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(payload.error ?? "Could not join match");
      setJoining(false);
      return;
    }

    router.push(`/match/${payload.code}`);
  }

  async function handleSpectate(event: React.FormEvent) {
    event.preventDefault();
    const code = codeInput.trim().toUpperCase();
    if (!code) {
      setError("Enter a match code to spectate");
      return;
    }

    router.push(`/match/${code}`);
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/auth");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-10 px-4 py-12">
      <header className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-slate-900/60 p-6 shadow-xl backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-400">Riftbound</p>
          <h1 className="text-3xl font-semibold">Manual Lobby</h1>
          <p className="text-sm text-slate-300">
            Create a match, share the code, and run the game yourselves.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={refreshMatches}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white hover:border-cyan-400"
          >
            Refresh
          </button>
          <button
            onClick={handleSignOut}
            className="rounded-xl bg-rose-500/80 px-4 py-2 text-sm font-medium text-white hover:bg-rose-400"
          >
            Sign Out
          </button>
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 rounded-2xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
          <h2 className="text-lg font-semibold">Host a match</h2>
          <p className="text-sm text-slate-300">
            Creates a clean room with placeholder decks.
          </p>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="w-full rounded-xl bg-cyan-500/80 px-4 py-3 text-base font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-60"
          >
            {creating ? "Preparing..." : "Create match"}
          </button>
        </div>

        <form
          onSubmit={handleJoin}
          className="space-y-4 rounded-2xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur"
        >
          <h2 className="text-lg font-semibold">Join by code</h2>
          <p className="text-sm text-slate-300">Fill the second seat if it is open.</p>
          <input
            value={codeInput}
            onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
            placeholder="ABC123"
            className="w-full rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 uppercase tracking-widest text-center text-lg focus:border-cyan-400 focus:outline-none"
          />
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={joining}
              className="flex-1 rounded-xl bg-emerald-500/80 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              {joining ? "Joining..." : "Join as Player"}
            </button>
            <button
              type="button"
              onClick={handleSpectate}
              className="flex-1 rounded-xl border border-white/10 px-4 py-3 text-sm text-white hover:border-cyan-400"
            >
              Watch only
            </button>
          </div>
        </form>

        <div className="rounded-2xl border border-white/5 bg-slate-900/70 p-6 backdrop-blur">
          <h2 className="text-lg font-semibold">How manual play works</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-300">
            <li>Nothing is enforced. Use the zones responsibly.</li>
            <li>Communicate everything via chat or voice off-platform.</li>
            <li>Log keeps a record of moves for transparency.</li>
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-white/5 bg-slate-950/60 p-6 backdrop-blur">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Your matches</h2>
          <span className="text-sm text-slate-400">{activeMatches.length} active</span>
        </div>
        <div className="mt-4 divide-y divide-white/5">
          {activeMatches.length === 0 && (
            <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
              No matches yet. Host one above.
            </p>
          )}
          {activeMatches.map((match) => {
            const isOwner = match.player1_id === userId;
            const ready = Boolean(match.player1_id && match.player2_id);
            return (
              <button
                key={match.id}
                onClick={() => router.push(`/match/${match.code}`)}
                className="flex w-full items-center justify-between gap-6 py-4 text-left text-white hover:text-cyan-300"
              >
                <div>
                  <p className="text-lg font-semibold tracking-widest">{match.code}</p>
                  <p className="text-sm text-slate-400">
                    {isOwner ? "You created this room" : "Invited"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    ready ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-200"
                  }`}
                >
                  {ready ? "Ready" : "Waiting"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      )}
    </main>
  );
}
