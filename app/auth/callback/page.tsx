"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
function parseHashParams(hash: string) {
  const clean = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(clean);
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [message, setMessage] = useState("Finishing sign in...");

  useEffect(() => {
    async function handleAuth() {
      const nextParam = searchParams.get("next") ?? "/lobby";
      const nextPath = nextParam.startsWith("/") ? nextParam : "/lobby";
      const hashParams = typeof window !== "undefined" ? parseHashParams(window.location.hash) : new URLSearchParams();
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const code = searchParams.get("code");

      async function persist(payload: Record<string, string>) {
        const response = await fetch("/api/auth/session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(data.error ?? "Failed to store session");
        }
      }

      if (accessToken && refreshToken) {
        try {
          await persist({ accessToken, refreshToken });
        } catch (error) {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "Failed to store session");
          return;
        }

        router.replace(nextPath);
        router.refresh();
        return;
      }

      if (code) {
        try {
          await persist({ code });
        } catch (error) {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : "Failed to store session");
          return;
        }
        router.replace(nextPath);
        router.refresh();
        return;
      }

      setStatus("error");
      setMessage("Missing auth parameters. Please try again.");
    }

    handleAuth();
  }, [router, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border border-white/5 bg-slate-900/60 p-8 text-center shadow-2xl backdrop-blur">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-400">Riftbound</p>
        <h1 className="mt-3 text-2xl font-semibold">Finishing sign in</h1>
        <p className="mt-2 text-sm text-slate-300">
          {status === "loading" ? "Hang tight while we set up your session." : message}
        </p>
        {status === "error" && (
          <button
            type="button"
            onClick={() => router.replace("/auth")}
            className="mt-6 w-full rounded-xl bg-cyan-500/90 px-4 py-3 text-base font-semibold text-slate-950 transition hover:bg-cyan-400"
          >
            Back to login
          </button>
        )}
      </div>
    </main>
  );
}
