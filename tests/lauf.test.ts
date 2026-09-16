import { describe, expect, it } from 'vitest';
import { ladeBestand } from '../src/daten.ts';
import { eskaliereAufgaben, fuehreLaufAus, ladeAufgaben, nachpruefen, bereiteVor } from '../src/lauf.ts';
import { KONTROLLEN } from '../src/pruefung.ts';
import { ladeRegeln } from '../src/regeln.ts';
import type { Lauf } from '../src/typen.ts';

const regeln = ladeRegeln();
const vorher = ladeBestand('quelle_v1');
const nachher = ladeBestand('quelle_v2');
const aufgaben = ladeAufgaben();
const lauf: Lauf = fuehreLaufAus(regeln, vorher, nachher, aufgaben);

describe('Mahnlauf auf den Beispieldaten', () => {
  it('kommt auf die Zahlen, die auch auf der Seite stehen', () => {
    expect(lauf.zahlen.entwuerfe).toBe(lauf.vorgaenge.length);
    expect(lauf.zahlen.kontrollenAusgefuehrt).toBe(lauf.vorgaenge.length * KONTROLLEN.length);
    expect(
      lauf.zahlen.zurFreigabe + lauf.zahlen.klaerung + lauf.zahlen.datenPruefen + lauf.zahlen.erledigt,
    ).toBe(lauf.vorgaenge.length);
  });

  it('führt an jedem Entwurf alle Kontrollen aus', () => {
    for (const v of lauf.vorgaenge) expect(v.befunde).toHaveLength(KONTROLLEN.length);
  });

  it('bringt jede Kontrolle an einem echten Vorgang zum Anschlagen', () => {
    const angeschlagen = new Set(
      lauf.vorgaenge.flatMap((v) => v.befunde.filter((b) => !b.bestanden).map((b) => b.kontrolle)),
    );
    for (const k of KONTROLLEN) {
      expect(angeschlagen, `Kontrolle ${k.schluessel} schlägt in diesem Lauf nie an`).toContain(
        k.schluessel,
      );
    }
  });

  it('hält mindestens zwei Mahnungen an und nennt jeweils den Grund', () => {
    const angehalten = lauf.vorgaenge.filter((v) => v.warteschlange !== 'zur_freigabe');
    expect(angehalten.length).toBeGreaterThanOrEqual(2);
    for (const v of angehalten) {
      expect(v.befunde.some((b) => !b.bestanden)).toBe(true);
      expect(v.grund.length).toBeGreaterThan(0);
      expect(v.naechsteAktion.length).toBeGreaterThan(0);
    }
  });

  it('gibt jedem angehaltenen Vorgang einen Verantwortlichen, keiner fällt in ein Loch', () => {
    for (const v of lauf.vorgaenge) expect(v.verantwortlich.length).toBeGreaterThan(0);
    expect(lauf.ueberwachung.aufgabenOhneVerantwortliche).toBe(0);
  });

  it('lässt nichts in die Freigabe, an dem eine Kontrolle angeschlagen hat', () => {
    for (const v of lauf.vorgaenge) {
      if (v.warteschlange === 'zur_freigabe') {
        expect(v.befunde.every((b) => b.bestanden)).toBe(true);
      }
    }
  });

  it('behandelt einen fehlenden Beleg als unbekannt, nie als erledigt', () => {
    const fehlend = lauf.vorgaenge.find((v) => !vorher.zahlungen.has(v.entwurf.nummer));
    expect(fehlend, 'kein Vorgang ohne Stand in der Quelle').toBeDefined();
    expect(fehlend!.warteschlange).toBe('daten_pruefen');
    expect(fehlend!.warteschlange).not.toBe('erledigt');
  });

  it('nennt in jedem Schreiben den Betrag, den auch die Quelle führt', () => {
    for (const v of lauf.vorgaenge) {
      if (v.warteschlange !== 'zur_freigabe') continue;
      const stand = vorher.zahlungen.get(v.entwurf.nummer)!;
      expect(v.entwurf.brief).toContain(
        stand.offenerBetrag.toLocaleString('de-DE', { minimumFractionDigits: 2 }),
      );
    }
  });

  it('eskaliert genau die Vorgänge jenseits der Schwelle aus den Hausregeln', () => {
    for (const v of lauf.vorgaenge) {
      expect(v.eskaliert).toBe(
        v.entwurf.tageUeberfaellig >= regeln.eskalation.an_geschaeftsfuehrung_ab_tagen,
      );
    }
  });

  it('bleibt bei gleichem Stichtag Zeichen für Zeichen gleich', () => {
    const zweiter = fuehreLaufAus(regeln, ladeBestand('quelle_v1'), ladeBestand('quelle_v2'), aufgaben);
    expect(JSON.stringify(zweiter)).toBe(JSON.stringify(lauf));
  });
});

describe('Keine Rechtsbehauptung, keine Gebühr, kein Zins', () => {
  const entwuerfe = lauf.vorgaenge.map((v) => v.entwurf.brief).join('\n');

  it('nennt in keinem Entwurf einen gesperrten Begriff', () => {
    for (const wort of ['Verzug', 'Verzugszinsen', 'Mahngebühr', 'Mahnbescheid', 'rechtssicher', '§']) {
      expect(entwuerfe, `gesperrter Begriff ${wort}`).not.toContain(wort);
    }
  });

  it('darf einen gesperrten Begriff im Befund zitieren, wenn sie ihn gerade zurückweist', () => {
    const befund = lauf.vorgaenge
      .flatMap((v) => v.befunde)
      .find((b) => !b.bestanden && b.kontrolle === 'AGENTENAUSGABE' && b.text.includes('gesperrte Wort'));
    expect(befund, 'kein zurueckgewiesenes gesperrtes Wort im Lauf').toBeDefined();
  });

  it('rechnet keinen Betrag auf den offenen Betrag drauf', () => {
    for (const v of lauf.vorgaenge) {
      const stand = vorher.zahlungen.get(v.entwurf.nummer);
      if (!stand || stand.offenerBetrag <= 0) continue;
      expect(v.entwurf.brief).not.toContain('Zu zahlen');
    }
  });
});

describe('Eskalation liegengebliebener Aufgaben', () => {
  it('erzeugt zu einer überfälligen Aufgabe wirklich eine Eskalation mit Empfänger und Spur', () => {
    expect(lauf.eskalationen.length).toBeGreaterThanOrEqual(1);
    for (const e of lauf.eskalationen) {
      expect(e.anEmpfaenger.length).toBeGreaterThan(0);
      expect(e.datei).toMatch(/^postausgang_test\//);
      expect(e.tageUeberfaellig).toBeGreaterThanOrEqual(regeln.eskalation.offene_aufgabe_nach_tagen);
    }
  });

  it('eskaliert keine erledigte und keine noch nicht fällige Aufgabe', () => {
    const eskaliert = new Set(lauf.eskalationen.map((e) => e.aufgabe));
    for (const a of aufgaben) {
      if (a.erledigt) expect(eskaliert.has(a.id)).toBe(false);
    }
    const ohne = eskaliereAufgaben(regeln, aufgaben.map((a) => ({ ...a, faelligAm: regeln.stichtag })));
    expect(ohne).toHaveLength(0);
  });
});

describe('Ein angehaltener Vorgang ist kein freigebbarer Brief', () => {
  it('weist eine Freigabe zurück, die auf einem angehaltenen Vorgang liegt', () => {
    const angehalten = lauf.vorgaenge.find((v) => v.warteschlange === 'daten_pruefen')!;
    const manipuliert = {
      ...nachher,
      freigaben: [
        {
          nummer: angehalten.entwurf.nummer,
          fassung: angehalten.entwurf.fassung,
          freigegebenVon: 'Test',
          freigegebenAm: '2026-09-16T09:00:00+02:00',
        },
      ],
    };
    expect(() => nachpruefen(regeln, lauf.vorgaenge, vorher, manipuliert)).toThrow(
      /kein freigebbarer Brief/,
    );
  });
});

describe('Überwachung dessen, was nicht läuft', () => {
  it('meldet einen unvollständigen Import, statt ihn zu verschweigen', () => {
    expect(lauf.ueberwachung.belegeUebernommen).toBeLessThan(lauf.ueberwachung.belegeErwartet);
    expect(lauf.ueberwachung.quelleVollstaendig).toBe(false);
  });

  it('nennt, wann die Quelle zuletzt gelesen wurde und wann der nächste Lauf erwartet wird', () => {
    expect(lauf.ueberwachung.letzteQuelleGelesenAm).toBe(nachher.quelle.gelesenAm);
    expect(lauf.ueberwachung.naechsteErwarteteAusfuehrung).toContain(
      regeln.eskalation.zusammenfassung_um,
    );
  });
});

describe('Abschnitt A einzeln', () => {
  it('bereitet zu keiner Rechnung ohne offenen Betrag in der Rechnungsliste einen Entwurf vor', () => {
    const { vorgaenge } = bereiteVor(regeln, vorher);
    for (const v of vorgaenge) {
      const r = vorher.rechnungen.find((x) => x.nummer === v.entwurf.nummer)!;
      expect(r.offenLautRechnungsliste).toBeGreaterThan(0);
    }
  });
});
