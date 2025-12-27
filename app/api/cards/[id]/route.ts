import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { fetchRiftcodexJson } from "@/src/lib/riftcodex";
import type { RiftCard } from "@/src/types/card";

interface Params {
  params: { id: string };
}

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = params;

  if (!id) {
    return NextResponse.json({ error: "Card id missing" }, { status: 400 });
  }

  try {
    const payload = await fetchRiftcodexJson<RiftCard>(`/cards/${id}`);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load card" },
      { status: 502 }
    );
  }
}
