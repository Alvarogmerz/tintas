"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/status-badge";
import { InkLevelBars, type InkLevel } from "@/components/ink-level-bars";

export interface PrinterCardData {
  id: number;
  department: string;
  brand: string;
  model: string;
  tone: "ok" | "warn" | "critical" | "neutral";
  levels: InkLevel[];
  lastError: string | null;
}

const STORAGE_KEY = "tintas-auto:resumen:orden-tarjetas";

function applyStoredOrder(cards: PrinterCardData[], storedIds: number[]): PrinterCardData[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const ordered: PrinterCardData[] = [];
  for (const id of storedIds) {
    const card = byId.get(id);
    if (card) {
      ordered.push(card);
      byId.delete(id);
    }
  }
  // Impresoras nuevas (no vistas antes en este navegador) van al final, en su
  // orden original.
  for (const card of cards) {
    if (byId.has(card.id)) ordered.push(card);
  }
  return ordered;
}

export function PrinterCardGrid({ cards, threshold }: { cards: PrinterCardData[]; threshold: number }) {
  const [ordered, setOrdered] = useState(cards);
  const [draggedId, setDraggedId] = useState<number | null>(null);

  useEffect(() => {
    // localStorage solo existe en el navegador: no se puede leer durante el
    // renderizado inicial en servidor, así que el reordenado guardado se
    // aplica aquí, después de montar, en vez de en el estado inicial.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const storedIds: number[] = JSON.parse(raw);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza con localStorage, no puede derivarse del render
      setOrdered(applyStoredOrder(cards, storedIds));
    } catch {
      // localStorage no disponible o dato corrupto: se queda con el orden por defecto.
    }
  }, [cards]);

  function persist(next: PrinterCardData[]) {
    setOrdered(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next.map((c) => c.id)));
    } catch {
      // Almacenamiento no disponible (modo privado, etc.) — se pierde el
      // orden al recargar, pero la app sigue funcionando con normalidad.
    }
  }

  function handleDragOver(overId: number) {
    if (draggedId === null || draggedId === overId) return;
    const fromIndex = ordered.findIndex((c) => c.id === draggedId);
    const toIndex = ordered.findIndex((c) => c.id === overId);
    if (fromIndex === -1 || toIndex === -1) return;
    const next = [...ordered];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setOrdered(next);
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {ordered.map((card) => (
        <div
          key={card.id}
          draggable
          onDragStart={() => setDraggedId(card.id)}
          onDragOver={(e) => {
            e.preventDefault();
            handleDragOver(card.id);
          }}
          onDrop={(e) => e.preventDefault()}
          onDragEnd={() => {
            setDraggedId(null);
            persist(ordered);
          }}
          className={`group relative rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50 p-4 transition ${
            draggedId === card.id ? "opacity-40" : "hover:border-slate-300 hover:shadow-sm"
          }`}
        >
          <div
            className="absolute right-2 top-2 cursor-grab select-none text-slate-300 opacity-0 transition group-hover:opacity-100 active:cursor-grabbing"
            title="Arrastrar para reordenar"
          >
            ⠿
          </div>

          <Link href={`/impresoras/${card.id}`} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2 pr-4">
              <div>
                <p className="font-medium text-slate-900">{card.department}</p>
                <p className="text-xs text-slate-500">
                  {card.brand} {card.model}
                </p>
              </div>
              <StatusBadge tone={card.tone}>
                {card.tone === "ok"
                  ? "OK"
                  : card.tone === "warn"
                    ? "Bajo"
                    : card.tone === "critical"
                      ? "Crítico"
                      : "Sin datos"}
              </StatusBadge>
            </div>

            <InkLevelBars levels={card.levels} threshold={threshold} />

            {card.lastError && <p className="text-xs text-red-600">{card.lastError}</p>}
          </Link>
        </div>
      ))}
    </div>
  );
}
