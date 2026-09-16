import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Kunde, Mahnschritt, Rechnung, Reklamation, Zahlungsstand } from './typen.ts';

function lies<T>(datei: string, schluessel: string): T[] {
  const pfad = fileURLToPath(new URL(`../daten/${datei}`, import.meta.url));
  const inhalt = JSON.parse(readFileSync(pfad, 'utf8')) as Record<string, unknown>;
  const liste = inhalt[schluessel];
  if (!Array.isArray(liste)) throw new Error(`${datei}: Schlüssel ${schluessel} fehlt`);
  return liste as T[];
}

export interface Bestand {
  kunden: Map<string, Kunde>;
  rechnungen: Rechnung[];
  zahlungen: Map<string, Zahlungsstand>;
  reklamationen: Reklamation[];
  historie: Mahnschritt[];
}

export function ladeBestand(): Bestand {
  const kunden = lies<Kunde>('kunden.json', 'kunden');
  const rechnungen = lies<Rechnung>('rechnungen.json', 'rechnungen');
  const zahlungen = lies<Zahlungsstand>('zahlungen.json', 'zahlungen');
  const reklamationen = lies<Reklamation>('reklamationen.json', 'reklamationen');
  const historie = lies<Mahnschritt>('mahnhistorie.json', 'schritte');

  const bestand: Bestand = {
    kunden: new Map(kunden.map((k) => [k.id, k])),
    rechnungen,
    zahlungen: new Map(zahlungen.map((z) => [z.nummer, z])),
    reklamationen,
    historie,
  };
  pruefeBestand(bestand);
  return bestand;
}

/**
 * Lückenhafte Stammdaten sollen beim Laden auffallen, nicht erst im Brief.
 * Fehlt zu einer Rechnung der Zahlungsstand, kann keine Kontrolle greifen:
 * dann bricht der Lauf ab, statt ungeprüft zu mahnen.
 */
export function pruefeBestand(bestand: Bestand): void {
  for (const r of bestand.rechnungen) {
    if (!bestand.kunden.has(r.kundeId)) {
      throw new Error(`${r.nummer}: Kunde ${r.kundeId} nicht im Stamm`);
    }
    if (!bestand.zahlungen.has(r.nummer)) {
      throw new Error(`${r.nummer}: kein Zahlungsstand vorhanden, Lauf abgebrochen`);
    }
  }
  const nummern = new Set(bestand.rechnungen.map((r) => r.nummer));
  for (const s of bestand.historie) {
    if (!nummern.has(s.nummer)) throw new Error(`Mahnhistorie: unbekannte Rechnung ${s.nummer}`);
  }
}
