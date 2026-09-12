"use client";
import { useState, useCallback } from "react";

/**
 * Drag-and-drop for any column board: pipeline, tasks, partnership deals.
 *
 * One hook rather than a copy per board, so a card behaves the same wherever
 * you pick it up — same grab cursor, same drop highlight, same optimistic move.
 *
 * Drag is a mouse gesture and does not exist on touch, so every board that uses
 * this MUST keep a tappable way to move a card as well. Drag is the shortcut,
 * never the only route.
 */
export interface BoardDrag {
  /** Id of the card currently being dragged, or null. */
  draggingId: string | null;
  /** Props for a card element. Spread onto the element that should be picked up. */
  cardProps: (id: string, canDrag?: boolean) => {
    draggable: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    className: string;
    "aria-grabbed"?: boolean;
  };
  /** Props for a column element. Spread onto the drop area. */
  columnProps: (key: string) => {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  /** True while a card is hovering this column — use it to highlight the drop target. */
  isDropTarget: (key: string) => boolean;
}

export function useBoardDrag(
  onMove: (id: string, columnKey: string) => void,
  /** Column keys that refuse a drop, e.g. terminal stages that fire something. */
  lockedColumns: readonly string[] = [],
): BoardDrag {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);

  const cardProps = useCallback((id: string, canDrag = true) => ({
    draggable: canDrag,
    onDragStart: (e: React.DragEvent) => {
      if (!canDrag) return;
      // Firefox refuses to start a drag unless some data is set.
      e.dataTransfer.setData("text/plain", id);
      e.dataTransfer.effectAllowed = "move";
      setDraggingId(id);
    },
    onDragEnd: () => { setDraggingId(null); setOverColumn(null); },
    className: canDrag
      ? `cursor-grab active:cursor-grabbing ${draggingId === id ? "opacity-40" : ""}`
      : "",
    "aria-grabbed": canDrag ? draggingId === id : undefined,
  }), [draggingId]);

  const columnProps = useCallback((key: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!draggingId || lockedColumns.includes(key)) return;
      e.preventDefault();               // without this the drop never fires
      e.dataTransfer.dropEffect = "move";
      setOverColumn(key);
    },
    onDragLeave: (e: React.DragEvent) => {
      // Moving between a column's own children fires dragleave; only clear the
      // highlight when the pointer has actually left the column.
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverColumn(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = draggingId ?? e.dataTransfer.getData("text/plain");
      setOverColumn(null);
      setDraggingId(null);
      if (id && !lockedColumns.includes(key)) onMove(id, key);
    },
  }), [draggingId, lockedColumns, onMove]);

  const isDropTarget = useCallback(
    (key: string) => overColumn === key && draggingId !== null,
    [overColumn, draggingId],
  );

  return { draggingId, cardProps, columnProps, isDropTarget };
}
