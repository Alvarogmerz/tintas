// Printer-MIB estándar (RFC 3805) — funciona igual en Epson/Brother/HP en vez
// de depender de OIDs propietarios por fabricante.
export const OID = {
  // prtMarkerSuppliesTable: una fila por consumible (tóner/tinta/tambor/etc.)
  SUPPLIES_DESCRIPTION: "1.3.6.1.2.1.43.11.1.1.6.1", // texto libre, p.ej. "Black Toner"
  SUPPLIES_SUPPLY_CLASS: "1.3.6.1.2.1.43.11.1.1.4.1", // 3 = supply, 4 = receptacle
  SUPPLIES_MAX_CAPACITY: "1.3.6.1.2.1.43.11.1.1.8.1",
  SUPPLIES_LEVEL: "1.3.6.1.2.1.43.11.1.1.9.1",

  // prtAlertTable: alertas activas del dispositivo. Algunas impresoras (p.ej.
  // ciertos láser Brother) nunca dan un % de tóner por SUPPLIES_LEVEL (queda
  // en el centinela "desconocido" para siempre) pero sí avisan aquí por texto
  // cuando el tóner está bajo/agotado — es el único indicador fiable que dan.
  ALERT_GROUP_INDEX: "1.3.6.1.2.1.43.18.1.1.5.1", // a qué consumible se refiere (índice en prtMarkerSuppliesTable)
  ALERT_DESCRIPTION: "1.3.6.1.2.1.43.18.1.1.8.1", // texto libre, p.ej. "Toner Low" / "Sustituir tóner"
} as const;

// Valores centinela definidos por la RFC para prtMarkerSuppliesLevel /
// prtMarkerSuppliesMaxCapacity — no son niveles reales.
export const LEVEL_UNKNOWN = -1;
export const LEVEL_UNAVAILABLE_BUT_PRESENT = -2;
export const LEVEL_UNKNOWN_ALT = -3;
export const CAPACITY_UNKNOWN = -1;

// prtMarkerSuppliesClass: solo nos interesan los consumibles reales.
export const SUPPLY_CLASS_SUPPLY = 3;
