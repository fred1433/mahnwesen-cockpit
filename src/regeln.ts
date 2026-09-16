import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { Regeln, StufenRegel } from './typen.ts';

const PFAD = fileURLToPath(new URL('../regeln.yaml', import.meta.url));

/**
 * Lädt die Hausregeln. Im Code steht keine Frist und kein Betrag.
 * Die Regeldatei berechnet keine Gebühr und keinen Zins: die Tage darin
 * steuern ausschließlich interne Aufgaben.
 */
export function ladeRegeln(pfad: string = PFAD): Regeln {
  const regeln = parse(readFileSync(pfad, 'utf8')) as Regeln;
  pruefeRegeln(regeln);
  return regeln;
}

/** Eine kaputte Regeldatei soll laut scheitern, nicht still danebenliegen. */
export function pruefeRegeln(regeln: Regeln): void {
  if (!regeln?.stufen?.length) throw new Error('regeln.yaml: keine Stufen definiert');
  let letzte = -1;
  for (const stufe of regeln.stufen) {
    if (stufe.ab_tagen_nach_faelligkeit <= letzte) {
      throw new Error(`regeln.yaml: Stufe ${stufe.schluessel} liegt nicht nach der vorherigen`);
    }
    letzte = stufe.ab_tagen_nach_faelligkeit;
    if (stufe.wiedervorlage_in_tagen < 0) {
      throw new Error(`regeln.yaml: negative Wiedervorlage bei ${stufe.schluessel}`);
    }
    if ('gebuehr' in (stufe as unknown as Record<string, unknown>)) {
      throw new Error(
        `regeln.yaml: ${stufe.schluessel} enthält eine Gebühr. Dieser Prozess berechnet keine Gebühren und keine Zinsen.`,
      );
    }
  }
  if (regeln.sperren.mindestbetrag < 0) throw new Error('regeln.yaml: negativer Mindestbetrag');
  if (regeln.sperren.wartezeit_zwischen_stufen_tage < 0) {
    throw new Error('regeln.yaml: negative Wartezeit');
  }
  if (regeln.sperren.quelle_hoechstalter_stunden <= 0) {
    throw new Error('regeln.yaml: quelle_hoechstalter_stunden muss größer als null sein');
  }
  if (!regeln.entwurf?.gesperrte_woerter?.length) {
    throw new Error('regeln.yaml: keine gesperrten Wörter für Entwürfe definiert');
  }
}

export function stufeNach(regeln: Regeln, schluessel: string | null): StufenRegel | null {
  if (schluessel === null) return regeln.stufen[0] ?? null;
  const index = regeln.stufen.findIndex((s) => s.schluessel === schluessel);
  if (index < 0) return null;
  return regeln.stufen[index + 1] ?? null;
}

export function stufenBis(regeln: Regeln, schluessel: string): StufenRegel[] {
  const index = regeln.stufen.findIndex((s) => s.schluessel === schluessel);
  return index < 0 ? [] : regeln.stufen.slice(0, index);
}
