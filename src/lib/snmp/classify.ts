import type { ColorSlotKey } from "../excel/mapping";

/**
 * Clasifica la descripción de un consumible SNMP (texto libre, varía por
 * fabricante/idioma) en uno de nuestros 5 slots de color. Devuelve null si no
 * se reconoce, para que quede como "sin clasificar" en vez de asumir algo mal.
 */
export function classifyColorSlot(description: string): ColorSlotKey | null {
  const text = description.toLowerCase();

  // Tricolor / combinado (típico en cartuchos HP/Epson de gama baja que
  // integran C+M+Y en un solo cartucho) se comprueba antes que los colores
  // individuales para no confundirlo con "cyan/magenta/yellow" sueltos.
  if (/tri[- ]?color|color\s*\(cmy\)|cmy\b/.test(text)) return "TRICOLOR";

  if (/black|negro|noir|schwarz/.test(text)) return "NEGRO";
  if (/cyan|cian/.test(text)) return "CYAN";
  if (/magenta/.test(text)) return "MAGENTA";
  if (/yellow|amarillo|jaune|gelb/.test(text)) return "AMARILLO";

  return null;
}

/**
 * Detecta si el texto de una alerta SNMP (prtAlertDescription) indica que un
 * consumible está bajo/agotado. Es un texto libre que varía por fabricante e
 * idioma, así que se usan palabras clave en vez de códigos numéricos exactos
 * de la RFC (más robusto entre marcas, y no hace falta verificar el código
 * exacto contra hardware real antes de tenerlo funcionando).
 *
 * Pensado sobre todo para impresoras que nunca dan un % de nivel por SNMP
 * (p.ej. algunos láser Brother, ver prtMarkerSuppliesLevel = centinela
 * "desconocido" siempre) — es la única señal fiable que dan de que hace
 * falta pedir. Aviso: el texto exacto de "vacío" no se ha podido verificar
 * todavía contra un cartucho realmente agotado; si al vaciarse de verdad no
 * se detecta, hay que mirar el texto real que dé la impresora en ese momento
 * (queda guardado en InkLevelReading.alertText) y añadirlo aquí.
 */
export function isCriticalSupplyAlert(description: string): boolean {
  const text = description.toLowerCase();
  return /toner|tinta|ink|cartridge|cartucho|supply|suministro/.test(text) &&
    /low|bajo|empty|vac[ií]o|agotad|out|replace|sustitu|reemplaz|cambi/.test(text);
}
