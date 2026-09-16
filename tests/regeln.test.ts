/**
 * Die Hausregeln sind der einzige Ort für Fristen und Beträge. Wer sie ändert,
 * ändert den Lauf, und eine widersprüchliche Datei soll laut scheitern.
 */

import { describe, expect, it } from 'vitest';
import { ladeBestand } from '../src/daten.ts';
import { fuehreLaufAus } from '../src/lauf.ts';
import { pruefeRegeln, stufeNach, stufenBis } from '../src/regeln.ts';
import { REGELN } from './hilfen.ts';

describe('Hausregeln', () => {
  it('kennt die vier Stufen in aufsteigender Reihenfolge', () => {
    expect(REGELN.stufen.map((s) => s.schluessel)).toEqual([
      'erinnerung',
      'mahnung_1',
      'mahnung_2',
      'uebergabe',
    ]);
  });

  it('gibt die letzten beiden Stufen immer einem Menschen', () => {
    expect(REGELN.stufen.filter((s) => s.freigabe === 'mensch').map((s) => s.schluessel)).toEqual([
      'mahnung_2',
      'uebergabe',
    ]);
  });

  it('weist eine Regeldatei zurück, in der die Stufen nicht aufsteigen', () => {
    const kaputt = structuredClone(REGELN);
    kaputt.stufen[1]!.ab_tagen_nach_faelligkeit = 1;
    expect(() => pruefeRegeln(kaputt)).toThrow(/nicht nach der vorherigen/);
  });

  it('weist eine negative Gebühr zurück', () => {
    const kaputt = structuredClone(REGELN);
    kaputt.stufen[1]!.gebuehr = -5;
    expect(() => pruefeRegeln(kaputt)).toThrow(/negative Gebühr/);
  });

  it('kennt die Stufe danach und die Stufen davor', () => {
    expect(stufeNach(REGELN, null)?.schluessel).toBe('erinnerung');
    expect(stufeNach(REGELN, 'mahnung_2')?.schluessel).toBe('uebergabe');
    expect(stufeNach(REGELN, 'uebergabe')).toBeNull();
    expect(stufenBis(REGELN, 'mahnung_2').map((s) => s.schluessel)).toEqual(['erinnerung', 'mahnung_1']);
  });

  it('folgt den Hausregeln und nicht dem Quelltext', () => {
    const bestand = ladeBestand();
    const vorher = fuehreLaufAus(REGELN, bestand);

    const ohneMindestbetrag = structuredClone(REGELN);
    ohneMindestbetrag.sperren.mindestbetrag = 0;
    expect(fuehreLaufAus(ohneMindestbetrag, bestand).zahlen.gestoppt).toBe(vorher.zahlen.gestoppt - 1);

    const ohneWartezeit = structuredClone(REGELN);
    ohneWartezeit.sperren.wartezeit_zwischen_stufen_tage = 0;
    expect(fuehreLaufAus(ohneWartezeit, bestand).zahlen.gestoppt).toBe(vorher.zahlen.gestoppt - 1);

    const spaeter = structuredClone(REGELN);
    spaeter.stufen[0]!.ab_tagen_nach_faelligkeit = 12;
    expect(fuehreLaufAus(spaeter, bestand).zahlen.entwuerfe).toBeLessThan(vorher.zahlen.entwuerfe);

    const teurer = structuredClone(REGELN);
    teurer.stufen[1]!.gebuehr = 9;
    const mahnung = fuehreLaufAus(teurer, bestand).vorgaenge.find(
      (v) => v.entwurf.stufe.schluessel === 'mahnung_1',
    );
    expect(mahnung?.entwurf.brief).toContain('9,00 EUR');
  });
});
