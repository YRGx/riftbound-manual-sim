"use client";

import type { PointerEvent, MouseEvent } from "react";
import styles from "./Card.module.css";

export type CardState = {
  id: string;
  title: string;
  x: number;
  y: number;
  rotation: number;
  faceUp: boolean;
  scale?: number;
  zIndex: number;
  zoneId: string | null;
  slotIndex: number | null;
  section?: string;
};

type CardProps = {
  card: CardState;
  selected: boolean;
  dragging: boolean;
  onPointerDown: (event: PointerEvent<HTMLDivElement>, cardId: string) => void;
  onContextMenu: (event: MouseEvent<HTMLDivElement>, cardId: string) => void;
  onDoubleClick: (cardId: string) => void;
};

export default function Card({ card, selected, dragging, onPointerDown, onContextMenu, onDoubleClick }: CardProps) {
  return (
    <div
      className={`${styles.card} ${selected ? styles.selected : ""} ${dragging ? styles.dragging : ""} ${
        card.faceUp ? "" : styles.faceDown
      }`}
      style={{
        left: `${card.x}%`,
        top: `${card.y}%`,
        zIndex: card.zIndex,
        transform: `rotate(${card.rotation}deg) scale(${card.scale ?? 1})`,
      }}
      onPointerDown={(event) => onPointerDown(event, card.id)}
      onContextMenu={(event) => onContextMenu(event, card.id)}
      onDoubleClick={() => onDoubleClick(card.id)}
    >
      <div className={styles.cardInner}>
        <span className={styles.cardTitle}>{card.title}</span>
      </div>
    </div>
  );
}
