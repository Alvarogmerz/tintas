// Mapeo fijo de la estructura real de TintaImpresoras.xlsx (hoja "Hoja1").
// Verificado leyendo el archivo real el 2026-09-01: cabecera fusionada en las
// filas 0-1 (0-indexed), datos empezando en la fila 3. Hay DOS bloques de 5
// columnas de color, no uno: "STOCK" (existencias físicas en almacén) y
// "PEDIR" (cantidad pendiente de pedir) — son cosas distintas y viven en
// columnas distintas del archivo, aunque comparten la misma disposición de
// colores.

export const SHEET_NAME = "Hoja1";

// Filas de cabecera (0-indexed). La fila 2 es un separador en blanco.
export const HEADER_ROW_MAIN = 0;
export const HEADER_ROW_SUB = 1;
export const FIRST_DATA_ROW = 3;

// Columnas (0-indexed).
export const COL = {
  ID: 0,
  DEPARTAMENTO: 1,
  IP: 2,
  MARCA: 3,
  MODELO: 4,
  TINTA_COLOR: 5,
  TINTA_NEGRO: 6,
  STOCK_CYAN: 7,
  STOCK_MAGENTA: 8,
  STOCK_AMARILLO: 9,
  STOCK_TRICOLOR: 10,
  STOCK_NEGRO: 11,
  PEDIR_CYAN: 12,
  PEDIR_MAGENTA: 13,
  PEDIR_AMARILLO: 14,
  PEDIR_TRICOLOR: 15,
  PEDIR_NEGRO: 16,
} as const;

export const COLOR_SLOT_TO_STOCK_COLUMN = {
  CYAN: COL.STOCK_CYAN,
  MAGENTA: COL.STOCK_MAGENTA,
  AMARILLO: COL.STOCK_AMARILLO,
  TRICOLOR: COL.STOCK_TRICOLOR,
  NEGRO: COL.STOCK_NEGRO,
} as const;

export const COLOR_SLOT_TO_PEDIR_COLUMN = {
  CYAN: COL.PEDIR_CYAN,
  MAGENTA: COL.PEDIR_MAGENTA,
  AMARILLO: COL.PEDIR_AMARILLO,
  TRICOLOR: COL.PEDIR_TRICOLOR,
  NEGRO: COL.PEDIR_NEGRO,
} as const;

export type ColorSlotKey = keyof typeof COLOR_SLOT_TO_STOCK_COLUMN;

// La marca "no aplica" usada en el Excel (solo aparece en el bloque STOCK;
// el bloque PEDIR hereda la misma máscara: un color que no aplica a una
// impresora tampoco se pide nunca). Cualquier variante en mayúsculas/
// minúsculas o con espacios se normaliza a esto durante la importación.
export const NOT_APPLICABLE_MARK = "X";
