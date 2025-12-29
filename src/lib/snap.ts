import type { Zone } from "@/src/lib/zones";

export type Point = { x: number; y: number };
export type CardSize = { width: number; height: number };

export const CARD_WIDTH_PCT = 6;
export const CARD_HEIGHT_PCT = 9;
export const CARD_GAP_PCT = 0.6;
export const STACK_OFFSET_PCT = 0.35;

export function isPointInZone(point: Point, zone: Zone) {
  return (
    point.x >= zone.x &&
    point.x <= zone.x + zone.width &&
    point.y >= zone.y &&
    point.y <= zone.y + zone.height
  );
}

export function getZoneAtPoint(point: Point, zones: Zone[]) {
  return zones.find((zone) => isPointInZone(point, zone)) ?? null;
}

export function getSlotGrid(zone: Zone, cardSize: CardSize, gap = CARD_GAP_PCT) {
  const columns = Math.max(1, Math.floor((zone.width + gap) / (cardSize.width + gap)));
  const rows = Math.max(1, Math.floor((zone.height + gap) / (cardSize.height + gap)));
  const slots: Point[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const x = zone.x + gap / 2 + col * (cardSize.width + gap);
      const y = zone.y + gap / 2 + row * (cardSize.height + gap);
      const clampedX = Math.min(x, zone.x + zone.width - cardSize.width);
      const clampedY = Math.min(y, zone.y + zone.height - cardSize.height);
      slots.push({ x: clampedX, y: clampedY });
    }
  }

  return { rows, columns, slots };
}

export function getNearestSlotIndex(point: Point, slots: Point[], cardSize: CardSize) {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  slots.forEach((slot, index) => {
    const centerX = slot.x + cardSize.width / 2;
    const centerY = slot.y + cardSize.height / 2;
    const dx = centerX - point.x;
    const dy = centerY - point.y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

export function getSlotPosition(zone: Zone, slotIndex: number, cardSize: CardSize, gap = CARD_GAP_PCT) {
  const { slots } = getSlotGrid(zone, cardSize, gap);
  return slots[slotIndex] ?? slots[0] ?? { x: zone.x, y: zone.y };
}
