import { describe, expect, it } from 'vitest';
import { ladeBestand } from '../src/daten.ts';
import { fuehreLaufAus, ladeAufgaben } from '../src/lauf.ts';
import { KONTROLLEN, type Kontrolle } from '../src/pruefung.ts';
import { ladeRegeln } from '../src/regeln.ts';

/**
 * Eine Kontrolle, die man abschalten kann, ohne dass es auffällt, ist keine
 * Kontrolle. Dieser Test schaltet jede Kontrolle einzeln ab und verlangt, dass
 * sich das Ergebnis des Laufs dadurch ändert. Wer eine Kontrolle entkernt,
 * bekommt hier ein rotes Ergebnis, nicht ein stilles grünes.
 */

const regeln = ladeRegeln();
const vorher = ladeBestand('quelle_v1');
const nachher = ladeBestand('quelle_v2');
const aufgaben = ladeAufgaben();

const echt = fuehreLaufAus(regeln, vorher, nachher, aufgaben);

function entkernt(schluessel: string): Kontrolle[] {
  return KONTROLLEN.map((k) =>
    k.schluessel === schluessel
      ? { ...k, pruefe: () => ({ bestanden: true, text: 'entkernt' }) }
      : k,
  );
}

describe('Jede Kontrolle trägt etwas', () => {
  for (const kontrolle of KONTROLLEN) {
    it(`${kontrolle.schluessel}: abgeschaltet ändert sich der Lauf`, () => {
      const ohne = fuehreLaufAus(regeln, vorher, nachher, aufgaben, entkernt(kontrolle.schluessel));
      const vorherAngehalten = echt.vorgaenge.filter((v) => v.warteschlange !== 'zur_freigabe').length;
      const ohneAngehalten = ohne.vorgaenge.filter((v) => v.warteschlange !== 'zur_freigabe').length;
      expect(
        ohneAngehalten,
        `Ohne ${kontrolle.schluessel} halten genauso viele Vorgaenge an wie mit: die Kontrolle traegt nichts.`,
      ).toBeLessThan(vorherAngehalten);
    });
  }

  it('die Nachprüfung fällt ohne die Kontrolle Zahlungsstand durch: der bezahlte Vorgang ginge hinaus', () => {
    const ohne = fuehreLaufAus(regeln, vorher, nachher, aufgaben, entkernt('ZAHLUNGSSTAND'));
    expect(ohne.postausgang.some((p) => p.nummer === 'RE-2026-0282')).toBe(true);
    expect(echt.postausgang.some((p) => p.nummer === 'RE-2026-0282')).toBe(false);
  });
});
