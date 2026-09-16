import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { Regeln, StufenRegel } from './typen.ts';

const PFAD = fileURLToPath(new URL('../regeln.yaml', import.meta.url));

/** Lädt die Hausregeln. Im Code steht keine Frist und kein Betrag. */
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
    if (stufe.gebuehr < 0) throw new Error(`regeln.yaml: negative Gebühr bei ${stufe.schluessel}`);
  }
  if (regeln.sperren.mindestbetrag < 0) throw new Error('regeln.yaml: negativer Mindestbetrag');
  if (regeln.sperren.wartezeit_zwischen_stufen_tage < 0) {
    throw new Error('regeln.yaml: negative Wartezeit');
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
