"use client";

import { useState } from "react";
import { supabase } from "@/src/lib/supabaseClient";

export default function AuthForm() {
  const [loadingProvider, setLoadingProvider] = useState<"twitter" | "discord" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleOAuth(provider: "twitter" | "discord") {
    setMessage(null);
    setLoadingProvider(provider);

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback?next=${encodeURIComponent("/lobby")}`
        : undefined;

    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: redirectTo ? { redirectTo } : undefined,
    });

    if (error) {
      setMessage(error.message);
      setLoadingProvider(null);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-white/5 bg-slate-900/60 p-8 shadow-2xl backdrop-blur">
        <div className="space-y-2 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-400">Riftbound</p>
          <h1 className="text-3xl font-semibold">Log in with your commander identity</h1>
          <p className="text-sm text-slate-300">Manual play only. No rules enforced, just tools.</p>
        </div>

        {message && (
          <p className="mt-4 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {message}
          </p>
        )}

        <div className="mt-8 space-y-4">
          <button
            type="button"
            onClick={() => handleOAuth("twitter")}
            disabled={loadingProvider !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-base font-semibold text-white transition hover:bg-white/10 disabled:opacity-60"
          >
            {loadingProvider === "twitter" ? "Connecting to X..." : "Continue with X (Twitter)"}
          </button>

          <button
            type="button"
            onClick={() => handleOAuth("discord")}
            disabled={loadingProvider !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-400/50 bg-indigo-500/20 px-4 py-3 text-base font-semibold text-white transition hover:bg-indigo-500/30 disabled:opacity-60"
          >
            {loadingProvider === "discord" ? "Connecting to Discord..." : "Continue with Discord"}
          </button>
        </div>
      </section>
    </main>
  );
}
