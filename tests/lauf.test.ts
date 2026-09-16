/**
 * Der ganze Lauf auf den Beispieldaten. Hier steht, was die Seite behauptet:
 * wenn sich diese Zahlen ändern, wird die Seite rot, nicht still falsch.
 */

import { describe, expect, it } from 'vitest';
import { ladeBestand } from '../src/daten.ts';
import { fuehreLaufAus } from '../src/lauf.ts';
import { KONTROLLEN } from '../src/pruefung.ts';
import { ladeRegeln } from '../src/regeln.ts';

const regeln = ladeRegeln();
const bestand = ladeBestand();
const lauf = fuehreLaufAus(regeln, bestand);

describe('Mahnlauf auf den Beispieldaten', () => {
  it('kommt auf die Zahlen, die auf der Seite stehen', () => {
    expect(lauf.zahlen).toEqual({
      rechnungen: 42,
      offeneRechnungen: 37,
      entwuerfe: 28,
      freigegeben: 15,
      zurFreigabe: 5,
      gestoppt: 8,
      eskaliert: 2,
      kontrollenAusgefuehrt: 224,
    });
  });

  it('führt an jedem Entwurf alle acht Kontrollen aus', () => {
    expect(lauf.protokoll).toHaveLength(lauf.zahlen.entwuerfe * KONTROLLEN.length);
    for (const vorgang of lauf.vorgaenge) {
      expect(vorgang.befunde).toHaveLength(KONTROLLEN.length);
    }
  });

  it('bringt jede der acht Kontrollen an einem echten Vorgang zum Anschlagen', () => {
    const angeschlagen = new Map<string, string[]>();
    for (const zeile of lauf.protokoll) {
      if (zeile.bestanden) continue;
      const liste = angeschlagen.get(zeile.kontrolle) ?? [];
      liste.push(zeile.nummer);
      angeschlagen.set(zeile.kontrolle, liste);
    }
    expect([...angeschlagen.keys()].sort()).toEqual(KONTROLLEN.map((k) => k.schluessel).sort());
  });

  it('stoppt mindestens zwei Mahnungen und nennt jeweils den Grund', () => {
    const gestoppt = lauf.vorgaenge.filter((v) => v.ergebnis === 'gestoppt');
    expect(gestoppt.length).toBeGreaterThanOrEqual(2);
    for (const vorgang of gestoppt) {
      expect(vorgang.befunde.some((b) => !b.bestanden)).toBe(true);
      expect(vorgang.grund.length).toBeGreaterThan(3);
      expect(vorgang.naechsterSchritt).toMatch(/Freigabe/);
    }
  });

  it('lässt nichts durch, an dem eine Kontrolle angeschlagen hat', () => {
    for (const vorgang of lauf.vorgaenge) {
      const sauber = vorgang.befunde.every((b) => b.bestanden);
      if (!sauber) expect(vorgang.ergebnis).toBe('gestoppt');
      if (vorgang.ergebnis === 'freigegeben') expect(sauber).toBe(true);
    }
  });

  it('gibt keine Stufe automatisch frei, die laut Hausregeln einem Menschen gehört', () => {
    for (const vorgang of lauf.vorgaenge) {
      if (vorgang.entwurf.stufe.freigabe === 'mensch') {
        expect(vorgang.ergebnis).not.toBe('freigegeben');
      }
    }
  });

  it('nennt in jedem freigegebenen Brief den Betrag, den auch der Zahlungsstand führt', () => {
    for (const vorgang of lauf.vorgaenge) {
      if (vorgang.ergebnis !== 'freigegeben') continue;
      const stand = bestand.zahlungen.get(vorgang.entwurf.nummer);
      expect(stand).toBeDefined();
      expect(Math.abs(vorgang.entwurf.briefbetrag - stand!.offenerBetrag)).toBeLessThanOrEqual(
        regeln.sperren.toleranz_betrag,
      );
      expect(vorgang.entwurf.brief).toContain(vorgang.entwurf.nummer);
    }
  });

  it('eskaliert genau die Vorgänge jenseits der Schwelle aus den Hausregeln', () => {
    const schwelle = regeln.eskalation.an_geschaeftsfuehrung_ab_tagen;
    for (const vorgang of lauf.vorgaenge) {
      expect(vorgang.eskaliert).toBe(vorgang.entwurf.tageUeberfaellig >= schwelle);
    }
  });

  it('schreibt keinen Brief an einen Kunden, dessen Vorgang gestoppt wurde', () => {
    const gestoppt = lauf.vorgaenge.filter((v) => v.ergebnis === 'gestoppt');
    for (const vorgang of gestoppt) {
      expect(vorgang.zustaendig).not.toBe('Automatisch');
      expect(vorgang.naechsterSchritt).not.toMatch(/Versand/);
    }
  });

  it('bleibt bei gleichem Stichtag Zeichen für Zeichen gleich', () => {
    const zweiterLauf = fuehreLaufAus(ladeRegeln(), ladeBestand());
    expect(JSON.stringify(zweiterLauf)).toBe(JSON.stringify(lauf));
  });
});
