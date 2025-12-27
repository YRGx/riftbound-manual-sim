import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fetchRiftcodexJson } from "@/src/lib/riftcodex";
import type { RiftCardListResponse } from "@/src/types/card";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const query = url.searchParams.get("query");
  const page = url.searchParams.get("page") ?? "1";
  const size = url.searchParams.get("size") ?? "24";

  if (!query) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  try {
    const payload = await fetchRiftcodexJson<RiftCardListResponse>("/cards/search", {
      query,
      page,
      size,
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to search cards" },
      { status: 502 }
    );
  }
}
