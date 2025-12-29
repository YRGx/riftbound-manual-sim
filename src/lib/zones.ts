import rawZones from "@/data/zones.json";

export type Zone = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export const zones: Zone[] = rawZones as Zone[];
