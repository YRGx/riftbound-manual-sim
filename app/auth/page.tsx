"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const signIn = async () => {
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) setMessage(error.message);
    setLoading(false);
  };

  const signUp = async () => {
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    if (error) setMessage(error.message);
    else setMessage("Account created. If email confirmations are on, check your inbox.");
    setLoading(false);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 text-white">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-center">Riftbound</h1>

        <input
          className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-700"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          className="w-full px-3 py-2 rounded bg-zinc-900 border border-zinc-700"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {message && <p className="text-sm text-red-400 text-center">{message}</p>}

        <div className="flex gap-2">
          <button
            onClick={signIn}
            disabled={loading}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded"
          >
            Sign In
          </button>

          <button
            onClick={signUp}
            disabled={loading}
            className="flex-1 bg-zinc-700 hover:bg-zinc-600 px-4 py-2 rounded"
          >
            Sign Up
          </button>
        </div>
      </div>
    </main>
  );
}
