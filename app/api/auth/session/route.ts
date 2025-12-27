import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/src/lib/supabaseServer";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "accessToken" in payload &&
    "refreshToken" in payload
  ) {
    const { accessToken, refreshToken } = payload as {
      accessToken: string;
      refreshToken: string;
    };

    if (!accessToken || !refreshToken) {
      return NextResponse.json({ error: "Missing tokens" }, { status: 400 });
    }

    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  }

  if (typeof payload === "object" && payload !== null && "code" in payload) {
    const { code } = payload as { code: string };

    if (!code) {
      return NextResponse.json({ error: "Missing code" }, { status: 400 });
    }

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unsupported payload" }, { status: 400 });
}
