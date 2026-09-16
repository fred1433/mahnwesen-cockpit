import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  Agentenausgabe,
  Freigabe,
  Kunde,
  Mahnschritt,
  Quellstand,
  Rechnung,
  Reklamation,
  Zahlungsstand,
} from './typen.ts';

function pfadZu(datei: string): string {
  return fileURLToPath(new URL(`../daten/${datei}`, import.meta.url));
}

function lies<T>(datei: string, schluessel: string): T[] {
  const inhalt = JSON.parse(readFileSync(pfadZu(datei), 'utf8')) as Record<string, unknown>;
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
  freigaben: Freigabe[];
  agentenausgaben: Map<string, Agentenausgabe>;
  quelle: Quellstand;
}

/**
 * Lädt den Bestand für eine Fassung der Buchhaltungsquelle.
 *
 * Wichtig: fehlt zu einer Rechnung der Zahlungsstand, wird sie NICHT als
 * "nichts offen" behandelt und auch nicht stillschweigend übersprungen. Sie
 * bleibt im Bestand, ihr Stand ist unbekannt, und die Kontrolle QUELLE hält
 * sie an. Ein unvollständiger Import darf nie wie ein erledigter Vorgang
 * aussehen.
 */
export function ladeBestand(quellfassung: 'quelle_v1' | 'quelle_v2' = 'quelle_v1'): Bestand {
  const kunden = lies<Kunde>('kunden.json', 'kunden');
  const rechnungen = lies<Rechnung>('rechnungen.json', 'rechnungen');
  const zahlungen = lies<Zahlungsstand>(`${quellfassung}/zahlungen.json`, 'zahlungen');
  const reklamationen = lies<Reklamation>('reklamationen.json', 'reklamationen');
  const historie = lies<Mahnschritt>('mahnhistorie.json', 'schritte');
  const freigaben = lies<Freigabe>('freigaben.json', 'freigaben');
  const agentenausgaben = lies<Agentenausgabe>('agentenausgaben.json', 'ausgaben');
  const quelle = JSON.parse(readFileSync(pfadZu(`${quellfassung}/stand.json`), 'utf8')) as Quellstand;

  const bestand: Bestand = {
    kunden: new Map(kunden.map((k) => [k.id, k])),
    rechnungen,
    zahlungen: new Map(zahlungen.map((z) => [z.nummer, z])),
    reklamationen,
    historie,
    freigaben,
    agentenausgaben: new Map(agentenausgaben.map((a) => [a.nummer, a])),
    quelle,
  };
  pruefeBestand(bestand);
  return bestand;
}

/** Lückenhafte Stammdaten sollen beim Laden auffallen, nicht erst im Entwurf. */
export function pruefeBestand(bestand: Bestand): void {
  for (const r of bestand.rechnungen) {
    if (!bestand.kunden.has(r.kundeId)) {
      throw new Error(`${r.nummer}: Kunde ${r.kundeId} nicht im Stamm`);
    }
  }
  const nummern = new Set(bestand.rechnungen.map((r) => r.nummer));
  for (const s of bestand.historie) {
    if (!nummern.has(s.nummer)) throw new Error(`Mahnhistorie: unbekannte Rechnung ${s.nummer}`);
  }
  for (const f of bestand.freigaben) {
    if (!nummern.has(f.nummer)) throw new Error(`Freigaben: unbekannte Rechnung ${f.nummer}`);
  }
}

/** Wie viele Belege die Quelle angekündigt und wie viele sie geliefert hat. */
export function quelleVollstaendig(quelle: Quellstand): boolean {
  return quelle.uebernommen >= quelle.erwartet;
}
