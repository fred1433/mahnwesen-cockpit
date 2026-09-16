import { stufeNach } from './regeln.ts';
import { tageZwischen } from './format.ts';
import type { Mahnschritt, Rechnung, Regeln, StufenRegel } from './typen.ts';

export function tageUeberfaellig(rechnung: Rechnung, stichtag: string): number {
  return tageZwischen(rechnung.faelligkeit, stichtag);
}

export function schritteZu(historie: Mahnschritt[], nummer: string): Mahnschritt[] {
  return historie.filter((s) => s.nummer === nummer);
}

/**
 * Die zuletzt dokumentierte Stufe, gemessen an der Reihenfolge der Regeln und
 * nicht am Datum: wenn jemand von Hand eine 2. Mahnung eingetragen hat, ohne
 * die 1. Mahnung zu dokumentieren, zählt trotzdem die höchste erreichte Stufe.
 */
export function hoechsteStufe(regeln: Regeln, schritte: Mahnschritt[]): string | null {
  let besterIndex = -1;
  for (const schritt of schritte) {
    const index = regeln.stufen.findIndex((s) => s.schluessel === schritt.stufe);
    if (index > besterIndex) besterIndex = index;
  }
  return besterIndex < 0 ? null : (regeln.stufen[besterIndex]?.schluessel ?? null);
}

/** Die Stufe, die als nächste an der Reihe wäre. Null, wenn alles ausgereizt ist. */
export function naechsteStufe(
  regeln: Regeln,
  schritte: Mahnschritt[],
): StufenRegel | null {
  return stufeNach(regeln, hoechsteStufe(regeln, schritte));
}

/**
 * Steht für diese Rechnung heute eine Stufe an?
 * Kein offener Betrag in der Rechnungsliste heißt: hier ist nichts zu tun.
 */
export function faelligeStufe(
  regeln: Regeln,
  rechnung: Rechnung,
  schritte: Mahnschritt[],
  stichtag: string,
): StufenRegel | null {
  if (rechnung.offenLautRechnungsliste <= 0) return null;
  const stufe = naechsteStufe(regeln, schritte);
  if (!stufe) return null;
  const tage = tageUeberfaellig(rechnung, stichtag);
  return tage >= stufe.ab_tagen_nach_faelligkeit ? stufe : null;
}
