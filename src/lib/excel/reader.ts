import ExcelJS from "exceljs";
import {
  COL,
  COLOR_SLOT_TO_PEDIR_COLUMN,
  COLOR_SLOT_TO_STOCK_COLUMN,
  FIRST_DATA_ROW,
  NOT_APPLICABLE_MARK,
  SHEET_NAME,
  type ColorSlotKey,
} from "./mapping";

export type CellType = "BLANK" | "NUMBER" | "X";
export type SkuGeneration = "NORMAL" | "XL";

export interface ParsedStockCell {
  colorSlot: ColorSlotKey;
  // Clasificación del bloque PEDIR (lo que hace falta pedir), ya con la
  // máscara del bloque STOCK aplicada: si STOCK dice "X" (no aplica a esta
  // impresora), PEDIR se trata como X también, sea lo que sea que tuviera.
  cellType: CellType;
  pendingQty: number | null;
  // Existencias físicas en almacén (bloque STOCK). 0 si estaba en blanco o
  // marcada "X" (no aplica).
  stockOnHand: number;
}

export interface ParsedCartridgeRow {
  excelRowIndex: number; // 0-indexed row in the sheet
  skuGeneration: SkuGeneration;
  tintaColorSku: string | null;
  tintaNegroSku: string | null;
  stockCells: ParsedStockCell[];
}

export interface ParsedPrinter {
  excelId: string | null;
  department: string;
  ip: string | null;
  brand: string;
  model: string;
  rows: ParsedCartridgeRow[];
}

export interface ReadWarning {
  rowIndex: number;
  colIndex: number;
  message: string;
}

export interface ParsedWorkbook {
  printers: ParsedPrinter[];
  warnings: ReadWarning[];
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in value) {
    return String(value.text ?? "");
  }
  if (typeof value === "object" && "result" in value) {
    return String(value.result ?? "");
  }
  return String(value);
}

type Classified = "BLANK" | "X" | { cellType: "NUMBER"; value: number };

function classifyNumericCell(
  raw: ExcelJS.CellValue,
  rowIndex: number,
  colIndex: number,
  warnings: ReadWarning[],
): Classified {
  const text = cellText(raw);
  const trimmed = text.trim();

  if (trimmed === "") {
    if (text !== "") {
      warnings.push({
        rowIndex,
        colIndex,
        message:
          "Celda con solo espacios en blanco; tratada como vacía (BLANK). Revisar manualmente si debería ser 'X'.",
      });
    }
    return "BLANK";
  }

  if (trimmed.toUpperCase() === NOT_APPLICABLE_MARK) {
    return "X";
  }

  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber) && trimmed !== "") {
    return { cellType: "NUMBER", value: asNumber };
  }

  warnings.push({
    rowIndex,
    colIndex,
    message: `Valor de celda no reconocido ("${trimmed}"); tratado como vacía (BLANK).`,
  });
  return "BLANK";
}

function skuGenerationOf(colorSku: string | null, negroSku: string | null): SkuGeneration {
  const combined = `${colorSku ?? ""} ${negroSku ?? ""}`.toUpperCase();
  return combined.includes("XL") ? "XL" : "NORMAL";
}

function nullableText(value: ExcelJS.CellValue): string | null {
  const text = cellText(value).trim();
  return text === "" ? null : text;
}

export async function parseTintaExcel(filePath: string): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) {
    throw new Error(`No se encontró la hoja "${SHEET_NAME}" en ${filePath}`);
  }

  const warnings: ReadWarning[] = [];
  const printers: ParsedPrinter[] = [];
  let current: ParsedPrinter | null = null;

  const lastRow = sheet.rowCount;
  for (let rowIndex = FIRST_DATA_ROW; rowIndex <= lastRow; rowIndex++) {
    // ExcelJS rows are 1-indexed; our COL/row constants are 0-indexed to match
    // the earlier raw inspection, so translate here.
    const row = sheet.getRow(rowIndex + 1);
    const get = (col: number) => row.getCell(col + 1).value;

    const department = nullableText(get(COL.DEPARTAMENTO));
    const ip = nullableText(get(COL.IP));
    const brand = nullableText(get(COL.MARCA));
    const model = nullableText(get(COL.MODELO));
    const excelId = nullableText(get(COL.ID));

    // Las filas fusionadas (segunda fila de un cartucho normal+XL) mirrorizan
    // el valor de la celda ancla al leer `.value`, así que un DEPARTAMENTO no
    // vacío por sí solo no basta para saber si es una fila nueva: hay que
    // comprobar si esta celda es la ancla (master) de su fusión o no.
    const deptCell = row.getCell(COL.DEPARTAMENTO + 1);
    const isAnchorRow = deptCell.master === deptCell;
    const isNewPrinter = department !== null && isAnchorRow;

    if (isNewPrinter) {
      current = {
        excelId,
        department,
        ip,
        brand: brand ?? "OTHER",
        model: model ?? "",
        rows: [],
      };
      printers.push(current);
    }

    if (!current) {
      // Data before any department header — skip, but flag it.
      const anyValue = [
        COL.TINTA_COLOR,
        COL.TINTA_NEGRO,
        ...Object.values(COLOR_SLOT_TO_STOCK_COLUMN),
        ...Object.values(COLOR_SLOT_TO_PEDIR_COLUMN),
      ].some((c) => nullableText(get(c)) !== null);
      if (anyValue) {
        warnings.push({
          rowIndex,
          colIndex: COL.DEPARTAMENTO,
          message: "Fila con datos de cartucho pero sin departamento asociado; se ignora.",
        });
      }
      continue;
    }

    const tintaColorSku = nullableText(get(COL.TINTA_COLOR));
    const tintaNegroSku = nullableText(get(COL.TINTA_NEGRO));

    const stockCells: ParsedStockCell[] = (
      Object.keys(COLOR_SLOT_TO_STOCK_COLUMN) as ColorSlotKey[]
    ).map((colorSlot) => {
      const stockColIndex = COLOR_SLOT_TO_STOCK_COLUMN[colorSlot];
      const pedirColIndex = COLOR_SLOT_TO_PEDIR_COLUMN[colorSlot];

      const stockClassified = classifyNumericCell(get(stockColIndex), rowIndex, stockColIndex, warnings);
      const pedirClassified = classifyNumericCell(get(pedirColIndex), rowIndex, pedirColIndex, warnings);

      const stockOnHand =
        typeof stockClassified === "object" && stockClassified.cellType === "NUMBER" ? stockClassified.value : 0;

      // La máscara de "no aplica" vive en STOCK; PEDIR la hereda aunque su
      // celda esté técnicamente en blanco (que es lo normal, ya que nunca
      // debería haber un número de pedido para un color que no existe).
      if (stockClassified === "X") {
        if (typeof pedirClassified === "object") {
          warnings.push({
            rowIndex,
            colIndex: pedirColIndex,
            message: `PEDIR tiene un valor (${pedirClassified.value}) para un color marcado "X" en STOCK; se ignora.`,
          });
        }
        return { colorSlot, cellType: "X", pendingQty: null, stockOnHand: 0 };
      }

      if (typeof pedirClassified === "object") {
        return { colorSlot, cellType: "NUMBER", pendingQty: pedirClassified.value, stockOnHand };
      }
      return { colorSlot, cellType: pedirClassified, pendingQty: null, stockOnHand };
    });

    const hasCartridgeData =
      tintaColorSku !== null ||
      tintaNegroSku !== null ||
      stockCells.some((c) => c.cellType !== "BLANK" || c.stockOnHand !== 0);

    if (!hasCartridgeData) {
      // Fila sin datos reales (típicamente formato de Excel que se extiende
      // más allá de la última fila con datos) — no es una fila de cartucho.
      continue;
    }

    current.rows.push({
      excelRowIndex: rowIndex,
      skuGeneration: skuGenerationOf(tintaColorSku, tintaNegroSku),
      tintaColorSku,
      tintaNegroSku,
      stockCells,
    });
  }

  for (const printer of printers) {
    if (printer.rows.length > 2) {
      warnings.push({
        rowIndex: printer.rows[0]?.excelRowIndex ?? -1,
        colIndex: COL.DEPARTAMENTO,
        message: `Departamento "${printer.department}" tiene ${printer.rows.length} filas de cartucho (se esperaban 1 o 2).`,
      });
    }
  }

  return { printers, warnings };
}
