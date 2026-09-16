import { describe, expect, it } from 'vitest';
import { ladeBestand } from '../src/daten.ts';
import { bereiteVor, nachpruefen } from '../src/lauf.ts';
import { ladeRegeln } from '../src/regeln.ts';

/**
 * Der Kern der Demonstration: zwischen Vorbereitung und Versand ändert sich die
 * Quelle. Die Nachprüfung liest sie erneut, dieselben Kontrollen laufen noch
 * einmal, und was jetzt nicht mehr hält, kommt nicht in den Postausgang.
 */

const regeln = ladeRegeln();
const vorher = ladeBestand('quelle_v1');
const nachher = ladeBestand('quelle_v2');
const { vorgaenge } = bereiteVor(regeln, vorher);
const { nachpruefungen, postausgang } = nachpruefen(regeln, vorgaenge, vorher, nachher);

const BEZAHLT = 'RE-2026-0282';

describe('Zahlung nach der Vorbereitung und nach der Freigabe', () => {
  const fall = nachpruefungen.find((n) => n.nummer === BEZAHLT)!;

  it('hat den Vorgang vorher sauber durch alle Kontrollen gelassen', () => {
    expect(fall).toBeDefined();
    expect(fall.befundeVorher.every((b) => b.bestanden)).toBe(true);
  });

  it('erkennt das neue Ereignis in der Quelle', () => {
    expect(fall.quelleVorher).toBe('quelle_v1');
    expect(fall.quelleNachher).toBe('quelle_v2');
    expect(fall.ereignis).toContain('Zahlungseingang');
  });

  it('lässt die Kontrolle erneut laufen und sie schlägt jetzt an', () => {
    const zahlungsstand = fall.befundeNachher.find((b) => b.kontrolle === 'ZAHLUNGSSTAND')!;
    expect(zahlungsstand.bestanden).toBe(false);
    expect(fall.befundeNachher).toHaveLength(fall.befundeVorher.length);
  });

  it('lässt die Freigabe verfallen und legt nichts ab', () => {
    expect(fall.freigabeVerfallen).toBe(true);
    expect(fall.inPostausgang).toBe(false);
    expect(fall.warteschlangeNachher).toBe('erledigt');
    expect(postausgang.some((p) => p.nummer === BEZAHLT)).toBe(false);
  });
});

describe('Der Weg, der bis zum Ende geht', () => {
  it('legt nach der Freigabe genau einen Satz je Vorgang in den Test-Postausgang', () => {
    expect(postausgang.length).toBeGreaterThanOrEqual(1);
    const schluessel = postausgang.map((p) => `${p.nummer}|${p.fassung}`);
    expect(new Set(schluessel).size).toBe(schluessel.length);
    for (const p of postausgang) {
      expect(p.datei).toMatch(/^postausgang_test\//);
      expect(p.anEmpfaenger).toContain('Test-Postausgang');
    }
  });

  it('legt nur ab, was die Nachprüfung vollständig bestanden hat', () => {
    for (const p of postausgang) {
      const n = nachpruefungen.find((x) => x.nummer === p.nummer)!;
      expect(n.befundeNachher.every((b) => b.bestanden)).toBe(true);
    }
  });

  it('erzeugt beim zweiten Lauf desselben Ereignisses keinen zweiten Satz', () => {
    const wieder = nachpruefen(regeln, vorgaenge, vorher, nachher);
    expect(wieder.postausgang.map((p) => p.nummer).sort()).toEqual(
      postausgang.map((p) => p.nummer).sort(),
    );
    expect(wieder.postausgang).toHaveLength(postausgang.length);
  });
});

describe('Nachprüfung auf unveränderter Quelle', () => {
  it('lässt alles durch, wenn sich zwischen den Abfragen nichts geändert hat', () => {
    const gleich = nachpruefen(regeln, vorgaenge, vorher, {
      ...vorher,
      freigaben: nachher.freigaben,
    });
    expect(gleich.nachpruefungen.every((n) => !n.freigabeVerfallen)).toBe(true);
    expect(gleich.postausgang).toHaveLength(nachher.freigaben.length);
    for (const n of gleich.nachpruefungen) {
      expect(n.ereignis).toContain('Keine Änderung');
    }
  });
});
