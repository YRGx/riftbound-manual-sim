"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/src/lib/supabaseClient";

type AuthMode = "sign-in" | "sign-up";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const listener = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace("/lobby");
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.replace("/lobby");
      }
    });

    return () => {
      listener.data.subscription.unsubscribe();
    };
  }, [router]);

  const toggleLabel = useMemo(
    () => (mode === "sign-in" ? "Need an account?" : "Already registered?"),
    [mode]
  );

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setLoading(true);

    if (mode === "sign-up" && password !== confirm) {
      setMessage("Passwords do not match");
      setLoading(false);
      return;
    }

    const action =
      mode === "sign-in"
        ? supabase.auth.signInWithPassword({ email, password })
        : supabase.auth.signUp({ email, password });

    const { error } = await action;

    if (error) {
      setMessage(error.message);
    } else if (mode === "sign-up") {
      setMessage("Check your inbox to confirm the account if confirmations are enabled.");
    }

    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-white/5 bg-slate-900/60 p-8 shadow-2xl backdrop-blur"
      >
        <div className="space-y-2 text-center">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-400">Riftbound</p>
          <h1 className="text-3xl font-semibold">
            {mode === "sign-in" ? "Log in to the lobby" : "Create your commander"}
          </h1>
          <p className="text-sm text-slate-300">
            Manual play only. No rules enforced, just tools.
          </p>
        </div>

        <div className="mt-8 space-y-4">
          <label className="block text-sm font-medium text-slate-200">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-base focus:border-cyan-400 focus:outline-none"
              placeholder="you@example.com"
            />
          </label>

          <label className="block text-sm font-medium text-slate-200">
            Password
            <input
              type="password"
              required
              value={password}
              minLength={6}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-base focus:border-cyan-400 focus:outline-none"
              placeholder="••••••••"
            />
          </label>

          {mode === "sign-up" && (
            <label className="block text-sm font-medium text-slate-200">
              Confirm password
              <input
                type="password"
                required
                value={confirm}
                minLength={6}
                onChange={(event) => setConfirm(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2 text-base focus:border-cyan-400 focus:outline-none"
                placeholder="••••••••"
              />
            </label>
          )}
        </div>

        {message && (
          <p className="mt-4 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-xl bg-cyan-500/90 px-4 py-3 text-base font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
        >
          {loading ? "Working..." : mode === "sign-in" ? "Sign In" : "Sign Up"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMessage(null);
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          }}
          className="mt-4 w-full text-sm text-slate-300 hover:text-white"
        >
          {toggleLabel} <span className="text-cyan-300">Switch to {mode === "sign-in" ? "Sign Up" : "Sign In"}</span>
        </button>
      </form>
    </main>
  );
}
