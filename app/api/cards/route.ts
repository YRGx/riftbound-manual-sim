import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fetchRiftcodexJson } from "@/src/lib/riftcodex";
import type { RiftCardListResponse } from "@/src/types/card";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const page = url.searchParams.get("page") ?? "1";
  const size = url.searchParams.get("size") ?? "24";
  const sort = url.searchParams.get("sort") ?? undefined;
  const dir = url.searchParams.get("dir") ?? undefined;

  try {
    const payload = await fetchRiftcodexJson<RiftCardListResponse>("/cards", {
      page,
      size,
      sort,
      dir,
    });

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load cards" },
      { status: 502 }
    );
  }
}
