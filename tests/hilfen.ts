import { baueEntwurf } from '../src/entwurf.ts';
import { ladeRegeln } from '../src/regeln.ts';
import type {
  Entwurf,
  Kunde,
  Mahnschritt,
  Rechnung,
  Regeln,
  Reklamation,
  StufenRegel,
  Zahlungsstand,
} from '../src/typen.ts';
import type { Pruefkontext } from '../src/pruefung.ts';

export const REGELN: Regeln = ladeRegeln();
export const STICHTAG = REGELN.stichtag;

export function stufe(schluessel: string): StufenRegel {
  const treffer = REGELN.stufen.find((s) => s.schluessel === schluessel);
  if (!treffer) throw new Error(`Unbekannte Stufe ${schluessel}`);
  return treffer;
}

export function kunde(teil: Partial<Kunde> = {}): Kunde {
  return {
    id: 'K-9001',
    name: 'Familie Mustermann',
    anrede: 'familie',
    art: 'privat',
    email: 'mustermann@beispiel.invalid',
    strasse: 'Beispielweg 1',
    ort: '82000 Musterort',
    ...teil,
  };
}

export function rechnung(teil: Partial<Rechnung> = {}): Rechnung {
  return {
    nummer: 'RE-9000-0001',
    kundeId: 'K-9001',
    leistung: 'Austausch Heizkessel',
    projekt: 'BV-9000-001',
    rechnungsdatum: '2026-08-20',
    faelligkeit: '2026-09-03',
    betrag: 1000,
    offenLautRechnungsliste: 1000,
    ...teil,
  };
}

export function zahlung(teil: Partial<Zahlungsstand> = {}): Zahlungsstand {
  return {
    nummer: 'RE-9000-0001',
    offenerBetrag: 1000,
    waehrung: 'EUR',
    zahlungsstatus: 'offen',
    bezahltAm: null,
    eingaenge: [],
    ...teil,
  };
}

export function entwurfFuer(
  schluessel = 'erinnerung',
  teile: { rechnung?: Partial<Rechnung>; kunde?: Partial<Kunde>; schritte?: Mahnschritt[] } = {},
): Entwurf {
  return baueEntwurf(
    rechnung(teile.rechnung),
    kunde(teile.kunde),
    stufe(schluessel),
    teile.schritte ?? [],
    STICHTAG,
    REGELN,
  );
}

export function kontext(teil: Partial<Pruefkontext> = {}): Pruefkontext {
  return {
    regeln: REGELN,
    kunde: kunde(),
    zahlung: zahlung(),
    reklamationen: [] as Reklamation[],
    schritte: [] as Mahnschritt[],
    stichtag: STICHTAG,
    ...teil,
  };
}

export function befund(befunde: { kontrolle: string; bestanden: boolean }[], schluessel: string): boolean {
  const treffer = befunde.find((b) => b.kontrolle === schluessel);
  if (!treffer) throw new Error(`Kontrolle ${schluessel} wurde nicht ausgeführt`);
  return treffer.bestanden;
}
