/**
 * Die Hausregeln sind der einzige Ort für Fristen. Wer sie ändert, ändert den
 * Lauf, und eine widersprüchliche Datei soll laut scheitern.
 */

import { describe, expect, it } from 'vitest';
import { ladeBestand } from '../src/daten.ts';
import { bereiteVor, fuehreLaufAus, ladeAufgaben } from '../src/lauf.ts';
import { pruefeRegeln, stufeNach, stufenBis } from '../src/regeln.ts';
import { REGELN } from './hilfen.ts';

const vorher = ladeBestand('quelle_v1');
const nachher = ladeBestand('quelle_v2');
const aufgaben = ladeAufgaben();

describe('Hausregeln', () => {
  it('kennt die vier Vorlagen in aufsteigender Reihenfolge', () => {
    expect(REGELN.stufen.map((s) => s.schluessel)).toEqual([
      'erinnerung',
      'mahnung_1',
      'mahnung_2',
      'vorlage_leitung',
    ]);
  });

  it('kennt weder Gebühr noch Zins, in keiner Vorlage', () => {
    for (const stufe of REGELN.stufen) {
      expect(Object.keys(stufe)).not.toContain('gebuehr');
      expect(Object.keys(stufe)).not.toContain('zins');
    }
  });

  it('weist eine Regeldatei zurück, die wieder eine Gebühr einführt', () => {
    const kaputt = structuredClone(REGELN);
    (kaputt.stufen[1] as unknown as Record<string, unknown>).gebuehr = 5;
    expect(() => pruefeRegeln(kaputt)).toThrow(/keine Gebühren/);
  });

  it('weist eine Regeldatei zurück, in der die Vorlagen nicht aufsteigen', () => {
    const kaputt = structuredClone(REGELN);
    kaputt.stufen[1]!.ab_tagen_nach_faelligkeit = 1;
    expect(() => pruefeRegeln(kaputt)).toThrow(/nicht nach der vorherigen/);
  });

  it('weist eine Regeldatei ohne gesperrte Wörter zurück', () => {
    const kaputt = structuredClone(REGELN);
    kaputt.entwurf.gesperrte_woerter = [];
    expect(() => pruefeRegeln(kaputt)).toThrow(/gesperrte/);
  });

  it('kennt die Vorlage danach und die davor', () => {
    expect(stufeNach(REGELN, null)?.schluessel).toBe('erinnerung');
    expect(stufeNach(REGELN, 'mahnung_2')?.schluessel).toBe('vorlage_leitung');
    expect(stufeNach(REGELN, 'vorlage_leitung')).toBeNull();
    expect(stufenBis(REGELN, 'mahnung_2').map((s) => s.schluessel)).toEqual([
      'erinnerung',
      'mahnung_1',
    ]);
  });

  it('folgt den Hausregeln und nicht dem Quelltext', () => {
    const lauf = fuehreLaufAus(REGELN, vorher, nachher, aufgaben);
    const angehalten = (l: typeof lauf) =>
      l.vorgaenge.filter((v) => v.warteschlange !== 'zur_freigabe').length;

    const ohneMindestbetrag = structuredClone(REGELN);
    ohneMindestbetrag.sperren.mindestbetrag = 0;
    expect(angehalten(fuehreLaufAus(ohneMindestbetrag, vorher, nachher, aufgaben))).toBe(
      angehalten(lauf) - 1,
    );

    const ohneWartezeit = structuredClone(REGELN);
    ohneWartezeit.sperren.wartezeit_zwischen_stufen_tage = 0;
    expect(angehalten(fuehreLaufAus(ohneWartezeit, vorher, nachher, aufgaben))).toBe(
      angehalten(lauf) - 1,
    );

    const spaeter = structuredClone(REGELN);
    spaeter.stufen[0]!.ab_tagen_nach_faelligkeit = 12;
    expect(fuehreLaufAus(spaeter, vorher, nachher, aufgaben).zahlen.entwuerfe).toBeLessThan(
      lauf.zahlen.entwuerfe,
    );

    // Ein strengeres Hoechstalter haelt mehr Vorgaenge an. Die Freigaben aus der
    // Demonstration passen dann nicht mehr, deshalb nur Abschnitt A vergleichen.
    const strenger = structuredClone(REGELN);
    strenger.sperren.quelle_hoechstalter_stunden = 1;
    const mitStrenger = bereiteVor(strenger, vorher).vorgaenge.filter(
      (v) => v.warteschlange !== 'zur_freigabe',
    ).length;
    expect(mitStrenger).toBeGreaterThan(angehalten(lauf));
  });
});
