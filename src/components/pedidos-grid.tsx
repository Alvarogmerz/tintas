"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StockCellEditor } from "@/components/stock-cell-editor";
import { receiveStockAction, type ReceivedItem } from "@/lib/actions/receiving";

const COLOR_ORDER = ["CYAN", "MAGENTA", "AMARILLO", "TRICOLOR", "NEGRO"] as const;
const COLOR_LABEL: Record<string, string> = {
  CYAN: "Cian",
  MAGENTA: "Magenta",
  AMARILLO: "Amarillo",
  TRICOLOR: "Tricolor",
  NEGRO: "Negro",
};

export interface PedidoCell {
  id: number;
  colorSlot: string;
  cellType: "BLANK" | "NUMBER" | "X";
  pendingQty: number | null;
  stockOnHand: number;
}

export interface PedidoCartridgeRow {
  id: number;
  skuGeneration: string;
  tintaColorSku: string | null;
  tintaNegroSku: string | null;
  cells: PedidoCell[];
}

export interface PedidoCardData {
  printerId: number;
  department: string;
  brand: string;
  model: string;
  rows: PedidoCartridgeRow[];
}

interface PendingItem {
  cellId: number;
  department: string;
  row: string;
  colorSlot: string;
  orderedQty: number;
}

type Stage = "idle" | "review" | "correct" | "confirmCorrect";

export function PedidosGrid({ cards }: { cards: PedidoCardData[] }) {
  const [stage, setStage] = useState<Stage>("idle");
  const [correctionValues, setCorrectionValues] = useState<Record<number, string>>({});
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<{ message: string; isWarning: boolean } | null>(null);
  const router = useRouter();

  const pendingItems = useMemo<PendingItem[]>(() => {
    const items: PendingItem[] = [];
    for (const card of cards) {
      for (const row of card.rows) {
        for (const cell of row.cells) {
          if (cell.cellType === "NUMBER" && cell.pendingQty !== null) {
            items.push({
              cellId: cell.id,
              department: card.department,
              row: row.skuGeneration,
              colorSlot: cell.colorSlot,
              orderedQty: cell.pendingQty,
            });
          }
        }
      }
    }
    return items;
  }, [cards]);

  function openReview() {
    if (pendingItems.length === 0) {
      setOutcome({ message: "No hay ningún pedido pendiente para comprobar.", isWarning: true });
      return;
    }
    setOutcome(null);
    setStage("review");
  }

  function applyResult(result: Awaited<ReturnType<typeof receiveStockAction>>) {
    if (result.error) {
      setOutcome({ message: result.error, isWarning: true });
      return;
    }
    setOutcome({
      message: result.syncMessage
        ? `Recepcionado(s) ${result.receivedCount} color(es). ${result.syncMessage}`
        : `Recepcionado(s) ${result.receivedCount} color(es) correctamente.`,
      isWarning: Boolean(result.syncMessage),
    });
    setStage("idle");
    router.refresh();
  }

  function confirmAllCorrect() {
    startTransition(async () => {
      const items: ReceivedItem[] = pendingItems.map((i) => ({ cellId: i.cellId, receivedQty: i.orderedQty }));
      applyResult(await receiveStockAction(items));
    });
  }

  function startCorrection() {
    const initial: Record<number, string> = {};
    for (const item of pendingItems) initial[item.cellId] = String(item.orderedQty);
    setCorrectionValues(initial);
    setStage("correct");
  }

  function applyCorrection() {
    startTransition(async () => {
      const items: ReceivedItem[] = pendingItems.map((i) => ({
        cellId: i.cellId,
        receivedQty: Number(correctionValues[i.cellId] ?? "0") || 0,
      }));
      applyResult(await receiveStockAction(items));
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={openReview}
          className="rounded-lg bg-accent-400 px-4 py-2 text-sm font-semibold text-brand-950 shadow-sm shadow-accent-400/40 hover:bg-accent-500"
        >
          Comprobar pedido
        </button>
        {outcome && (
          <span className={`text-sm ${outcome.isWarning ? "text-amber-600" : "text-green-700"}`}>{outcome.message}</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {cards.map((card) => (
          <div key={card.printerId} className="rounded-2xl border border-slate-200/70 bg-white shadow-sm shadow-slate-200/50 p-4">
            <div className="mb-2">
              <p className="font-medium text-slate-900">{card.department}</p>
              <p className="text-xs text-slate-500">
                {card.brand} {card.model}
              </p>
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-1" rowSpan={2}>
                    Cartucho
                  </th>
                  <th className="border-l border-slate-200 bg-blue-50 py-1 text-center" colSpan={5}>
                    STOCK
                  </th>
                  <th className="border-l border-slate-200 bg-amber-50 py-1 text-center" colSpan={5}>
                    PEDIR
                  </th>
                </tr>
                <tr>
                  {COLOR_ORDER.map((c) => (
                    <th key={`stock-${c}`} className="border-l border-slate-200 bg-blue-50/50 py-1 text-center">
                      {COLOR_LABEL[c]}
                    </th>
                  ))}
                  {COLOR_ORDER.map((c) => (
                    <th key={`pedir-${c}`} className="border-l border-slate-200 bg-amber-50/50 py-1 text-center">
                      {COLOR_LABEL[c]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {card.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="py-1 text-xs text-slate-500">{row.skuGeneration}</td>
                    {COLOR_ORDER.map((color) => {
                      const cell = row.cells.find((c) => c.colorSlot === color);
                      if (!cell) return <td key={`stock-${color}`} className="border-l border-slate-100 py-1" />;
                      if (cell.cellType === "X") {
                        return (
                          <td key={`stock-${color}`} className="border-l border-slate-100 py-1 text-center text-slate-300">
                            —
                          </td>
                        );
                      }
                      return (
                        <td key={`stock-${color}`} className="border-l border-slate-100 py-1 text-center">
                          <StockCellEditor cellId={cell.id} cellType={cell.cellType} variant="stock" value={cell.stockOnHand} />
                        </td>
                      );
                    })}
                    {COLOR_ORDER.map((color) => {
                      const cell = row.cells.find((c) => c.colorSlot === color);
                      if (!cell) return <td key={`pedir-${color}`} className="border-l border-slate-100 py-1" />;
                      if (cell.cellType === "X") {
                        return (
                          <td key={`pedir-${color}`} className="border-l border-slate-100 py-1 text-center text-slate-300">
                            —
                          </td>
                        );
                      }
                      return (
                        <td key={`pedir-${color}`} className="border-l border-slate-100 py-1 text-center">
                          <StockCellEditor cellId={cell.id} cellType={cell.cellType} variant="pedir" value={cell.pendingQty} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {stage === "review" && (
        <Overlay onClose={() => setStage("idle")}>
          <h2 className="text-sm font-semibold text-slate-900">Comprobar pedido</h2>
          <p className="mt-1 text-xs text-slate-500">Esto es lo que hay pedido ahora mismo. ¿Ha llegado tal cual?</p>
          <PedidoItemsTable items={pendingItems} />
          <div className="mt-4 flex gap-3">
            <button
              onClick={confirmAllCorrect}
              disabled={pending}
              className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-60"
            >
              {pending ? "Guardando..." : "Correcto"}
            </button>
            <button
              onClick={startCorrection}
              disabled={pending}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              Incorrecto
            </button>
            <button onClick={() => setStage("idle")} className="text-sm text-slate-500 hover:underline">
              Cerrar
            </button>
          </div>
        </Overlay>
      )}

      {(stage === "correct" || stage === "confirmCorrect") && (
        <Overlay onClose={() => setStage("idle")}>
          <h2 className="text-sm font-semibold text-slate-900">Corregir lo recibido</h2>
          <p className="mt-1 text-xs text-slate-500">
            Indica la cantidad que ha llegado de verdad de cada una. Lo que falte se quedará pendiente en PEDIR y lo
            recibido se sumará a STOCK.
          </p>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-1">Departamento</th>
                <th className="py-1">Cartucho</th>
                <th className="py-1">Color</th>
                <th className="py-1 text-right">Pedido</th>
                <th className="py-1 text-right">Llegado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendingItems.map((item) => (
                <tr key={item.cellId}>
                  <td className="py-1 font-medium text-slate-900">{item.department}</td>
                  <td className="py-1 text-slate-600">{item.row}</td>
                  <td className="py-1 text-slate-600">{COLOR_LABEL[item.colorSlot] ?? item.colorSlot}</td>
                  <td className="py-1 text-right text-slate-500">{item.orderedQty}</td>
                  <td className="py-1 text-right">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={correctionValues[item.cellId] ?? ""}
                      onChange={(e) =>
                        setCorrectionValues((prev) => ({ ...prev, [item.cellId]: e.target.value }))
                      }
                      className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-sm focus:border-slate-500 focus:outline-none"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => setStage("idle")}
              disabled={pending}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              onClick={() => setStage("confirmCorrect")}
              disabled={pending}
              className="rounded-lg bg-brand-800 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
            >
              Corregir
            </button>
          </div>

          {stage === "confirmCorrect" && (
            <Overlay onClose={() => setStage("correct")}>
              <p className="text-sm text-slate-900">¿Estás seguro de que los valores introducidos son correctos?</p>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={applyCorrection}
                  disabled={pending}
                  className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-60"
                >
                  {pending ? "Guardando..." : "Sí, aplicar"}
                </button>
                <button
                  onClick={() => setStage("correct")}
                  disabled={pending}
                  className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  No, revisar
                </button>
              </div>
            </Overlay>
          )}
        </Overlay>
      )}
    </div>
  );
}

function PedidoItemsTable({ items }: { items: PendingItem[] }) {
  return (
    <table className="mt-3 w-full text-sm">
      <thead className="text-left text-xs uppercase text-slate-500">
        <tr>
          <th className="py-1">Departamento</th>
          <th className="py-1">Cartucho</th>
          <th className="py-1">Color</th>
          <th className="py-1 text-right">Cantidad</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {items.map((item) => (
          <tr key={item.cellId}>
            <td className="py-1 font-medium text-slate-900">{item.department}</td>
            <td className="py-1 text-slate-600">{item.row}</td>
            <td className="py-1 text-slate-600">{COLOR_LABEL[item.colorSlot] ?? item.colorSlot}</td>
            <td className="py-1 text-right text-slate-700">{item.orderedQty}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
