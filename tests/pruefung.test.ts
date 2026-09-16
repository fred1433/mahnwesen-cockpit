import { describe, expect, it } from 'vitest';
import { KONTROLLEN, durchgefallen, pruefe, warteschlangeFuer } from '../src/pruefung.ts';
import {
  agentenausgabe,
  befund,
  entwurfFuer,
  kontext,
  kunde,
  quellstand,
  REGELN,
  zahlung,
} from './hilfen.ts';
import type { Mahnschritt, Reklamation } from '../src/typen.ts';

/**
 * Jede Kontrolle wird zweimal geprüft: an einem Fall, den sie anhalten muss,
 * und an einem, den sie durchlassen muss. Eine Sperre, die alles anhält, ist
 * genauso kaputt wie eine, die nichts anhält.
 */

describe('Quelle', () => {
  it('hält an, wenn die Quelle zu diesem Beleg nichts geliefert hat', () => {
    const befunde = pruefe(entwurfFuer(), kontext({ zahlung: undefined, quelleVollstaendig: false }));
    expect(befund(befunde, 'QUELLE')).toBe(false);
    expect(durchgefallen(befunde)[0]!.text).toContain('Unbekannt ist nicht dasselbe wie nichts offen');
  });

  it('hält an, wenn der Stand der Quelle zu alt ist', () => {
    const befunde = pruefe(
      entwurfFuer(),
      kontext({ quelle: quellstand({ gelesenAm: '2026-09-14T06:30:00+02:00' }) }),
    );
    expect(befund(befunde, 'QUELLE')).toBe(false);
  });

  it('lässt einen frischen, vorhandenen Stand durch', () => {
    expect(befund(pruefe(entwurfFuer(), kontext()), 'QUELLE')).toBe(true);
  });

  it('schickt einen fehlenden Stand nach Daten prüfen, nie nach erledigt', () => {
    const befunde = pruefe(entwurfFuer(), kontext({ zahlung: undefined }));
    expect(warteschlangeFuer(befunde)).toBe('daten_pruefen');
  });
});

describe('Zahlungsstand', () => {
  it('hält an, wenn die Rechnung inzwischen ausgeglichen ist', () => {
    const befunde = pruefe(
      entwurfFuer(),
      kontext({ zahlung: zahlung({ offenerBetrag: 0, belegstatus: 'bezahlt', bezahltAm: '2026-09-15' }) }),
    );
    expect(befund(befunde, 'ZAHLUNGSSTAND')).toBe(false);
    expect(warteschlangeFuer(befunde)).toBe('erledigt');
  });

  it('hält an, wenn der Beleg storniert ist, und sagt das auch so', () => {
    const befunde = pruefe(
      entwurfFuer(),
      kontext({ zahlung: zahlung({ offenerBetrag: 0, belegstatus: 'storniert' }) }),
    );
    expect(befund(befunde, 'ZAHLUNGSSTAND')).toBe(false);
    expect(durchgefallen(befunde)[0]!.text).toContain('storniert');
  });

  it('lässt durch, solange etwas offen ist', () => {
    expect(befund(pruefe(entwurfFuer(), kontext()), 'ZAHLUNGSSTAND')).toBe(true);
  });
});

describe('Abgleich mit der Quelle', () => {
  it('hält bei einer Teilzahlung an, die noch nicht in der Rechnungsliste steht', () => {
    const befunde = pruefe(
      entwurfFuer(),
      kontext({
        zahlung: zahlung({
          offenerBetrag: 400,
          belegstatus: 'teilweise',
          eingaenge: [{ datum: '2026-09-15', betrag: 600, art: 'SEPA-Überweisung' }],
        }),
      }),
    );
    expect(befund(befunde, 'BETRAGSABGLEICH')).toBe(false);
    expect(warteschlangeFuer(befunde)).toBe('daten_pruefen');
  });

  it('lässt eine Abweichung innerhalb der Toleranz durch', () => {
    const befunde = pruefe(entwurfFuer(), kontext({ zahlung: zahlung({ offenerBetrag: 1000.01 }) }));
    expect(befund(befunde, 'BETRAGSABGLEICH')).toBe(true);
  });

  it('lässt durch, wenn die Teilzahlung in beiden Quellen steht', () => {
    const befunde = pruefe(
      entwurfFuer('erinnerung', { rechnung: { offenLautRechnungsliste: 400 } }),
      kontext({
        zahlung: zahlung({
          offenerBetrag: 400,
          belegstatus: 'teilweise',
          eingaenge: [{ datum: '2026-09-15', betrag: 600, art: 'SEPA-Überweisung' }],
        }),
      }),
    );
    expect(befund(befunde, 'BETRAGSABGLEICH')).toBe(true);
  });
});

describe('Mindestbetrag', () => {
  it('hält unterhalb der Grenze aus den Hausregeln an', () => {
    const befunde = pruefe(
      entwurfFuer('erinnerung', { rechnung: { offenLautRechnungsliste: 9 } }),
      kontext({ zahlung: zahlung({ offenerBetrag: 9 }) }),
    );
    expect(befund(befunde, 'MINDESTBETRAG')).toBe(false);
  });

  it('lässt genau auf der Grenze durch', () => {
    const grenze = REGELN.sperren.mindestbetrag;
    const befunde = pruefe(
      entwurfFuer('erinnerung', { rechnung: { offenLautRechnungsliste: grenze } }),
      kontext({ zahlung: zahlung({ offenerBetrag: grenze }) }),
    );
    expect(befund(befunde, 'MINDESTBETRAG')).toBe(true);
  });
});

const REK: Reklamation = {
  id: 'REK-9000-001',
  projekt: 'BV-9000-001',
  kundeId: 'K-9001',
  eroeffnet: '2026-09-01',
  status: 'offen',
  betreff: 'Nachbesserung angekündigt',
};

describe('Reklamation', () => {
  it('hält bei einer offenen Reklamation auf derselben Baustelle an und schlägt eine Pause vor', () => {
    const befunde = pruefe(entwurfFuer(), kontext({ reklamationen: [REK] }));
    expect(befund(befunde, 'REKLAMATION')).toBe(false);
    expect(warteschlangeFuer(befunde)).toBe('klaerung');
  });

  it('behauptet nicht, dass die Forderung dadurch entfällt', () => {
    const befunde = pruefe(entwurfFuer(), kontext({ reklamationen: [REK] }));
    const text = durchgefallen(befunde)[0]!.text;
    expect(text).toContain('Über die Forderung selbst sagt diese Sperre nichts');
    expect(text).not.toMatch(/Verzug|gesetzlich|entfällt/);
  });

  it('lässt durch, wenn die Reklamation geschlossen ist', () => {
    const befunde = pruefe(entwurfFuer(), kontext({ reklamationen: [{ ...REK, status: 'geschlossen' }] }));
    expect(befund(befunde, 'REKLAMATION')).toBe(true);
  });

  it('lässt durch, wenn die Reklamation zu einer anderen Baustelle gehört', () => {
    const befunde = pruefe(entwurfFuer(), kontext({ reklamationen: [{ ...REK, projekt: 'BV-9000-777' }] }));
    expect(befund(befunde, 'REKLAMATION')).toBe(true);
  });
});

describe('Kulanzliste', () => {
  it('hält einen Kunden von der Kulanzliste an', () => {
    const id = REGELN.sperren.kulanzliste[0]!;
    const befunde = pruefe(
      entwurfFuer('erinnerung', { rechnung: { kundeId: id }, kunde: { id } }),
      kontext({ kunde: kunde({ id }) }),
    );
    expect(befund(befunde, 'KULANZLISTE')).toBe(false);
    expect(warteschlangeFuer(befunde)).toBe('klaerung');
  });

  it('lässt einen Kunden durch, der nicht auf der Liste steht', () => {
    expect(befund(pruefe(entwurfFuer(), kontext()), 'KULANZLISTE')).toBe(true);
  });
});

const schritt = (versendetAm: string): Mahnschritt => ({
  nummer: 'RE-9000-0001',
  stufe: 'erinnerung',
  versendetAm,
  kanal: 'email',
});

describe('Wartezeit', () => {
  it('hält an, wenn das letzte Schreiben zu kurz zurückliegt', () => {
    const befunde = pruefe(entwurfFuer(), kontext({ schritte: [schritt('2026-09-13')] }));
    expect(befund(befunde, 'WARTEZEIT')).toBe(false);
  });

  it('lässt genau nach Ablauf der Wartezeit durch', () => {
    const befunde = pruefe(entwurfFuer(), kontext({ schritte: [schritt('2026-09-09')] }));
    expect(befund(befunde, 'WARTEZEIT')).toBe(true);
  });
});

describe('Reihenfolge', () => {
  it('hält an, wenn ein Schritt davor in der Historie fehlt', () => {
    const befunde = pruefe(
      entwurfFuer('mahnung_2', { schritte: [schritt('2026-08-01')] }),
      kontext({ schritte: [schritt('2026-08-01')] }),
    );
    expect(befund(befunde, 'REIHENFOLGE')).toBe(false);
    expect(warteschlangeFuer(befunde)).toBe('daten_pruefen');
  });

  it('lässt eine lückenlose Historie durch', () => {
    const schritte: Mahnschritt[] = [
      schritt('2026-08-01'),
      { nummer: 'RE-9000-0001', stufe: 'mahnung_1', versendetAm: '2026-08-10', kanal: 'email' },
    ];
    const befunde = pruefe(entwurfFuer('mahnung_2', { schritte }), kontext({ schritte }));
    expect(befund(befunde, 'REIHENFOLGE')).toBe(true);
  });

  it('lässt den ersten Schritt durch, dort gibt es nichts davor', () => {
    expect(befund(pruefe(entwurfFuer(), kontext()), 'REIHENFOLGE')).toBe(true);
  });
});

describe('Kontaktdaten', () => {
  it('hält eine E-Mail-Stufe ohne hinterlegte Adresse an', () => {
    const befunde = pruefe(
      entwurfFuer('erinnerung', { kunde: { email: null } }),
      kontext({ kunde: kunde({ email: null }) }),
    );
    expect(befund(befunde, 'KONTAKTDATEN')).toBe(false);
  });

  it('hält eine Briefstufe ohne Anschrift an', () => {
    const schritte: Mahnschritt[] = [
      schritt('2026-08-01'),
      { nummer: 'RE-9000-0001', stufe: 'mahnung_1', versendetAm: '2026-08-10', kanal: 'email' },
    ];
    const befunde = pruefe(
      entwurfFuer('mahnung_2', { kunde: { strasse: null }, schritte }),
      kontext({ kunde: kunde({ strasse: null }), schritte }),
    );
    expect(befund(befunde, 'KONTAKTDATEN')).toBe(false);
  });

  it('lässt durch, wenn der Kanal bedient werden kann', () => {
    expect(befund(pruefe(entwurfFuer(), kontext()), 'KONTAKTDATEN')).toBe(true);
  });
});

describe('Agentenausgabe', () => {
  it('weist einen Betrag zurück, den die Quelle nicht führt', () => {
    const befunde = pruefe(
      entwurfFuer(),
      kontext({ agentenausgabe: agentenausgabe({ betragBehauptet: 1750 }) }),
    );
    expect(befund(befunde, 'AGENTENAUSGABE')).toBe(false);
    expect(warteschlangeFuer(befunde)).toBe('daten_pruefen');
  });

  it('weist eine fremde Bankverbindung zurück', () => {
    const befunde = pruefe(
      entwurfFuer(),
      kontext({ agentenausgabe: agentenausgabe({ bankverbindung: 'DE99 1111 2222 3333 4444 55' }) }),
    );
    expect(befund(befunde, 'AGENTENAUSGABE')).toBe(false);
  });

  it('weist einen fremden Empfänger zurück', () => {
    const befunde = pruefe(
      entwurfFuer(),
      kontext({ agentenausgabe: agentenausgabe({ empfaengerBehauptet: 'Familie Musterfrau' }) }),
    );
    expect(befund(befunde, 'AGENTENAUSGABE')).toBe(false);
  });

  it('weist gesperrte Wörter zurück, auch wenn sonst alles stimmt', () => {
    for (const wort of REGELN.entwurf.gesperrte_woerter) {
      const befunde = pruefe(
        entwurfFuer(),
        kontext({ agentenausgabe: agentenausgabe({ freitext: `Hinweis zu ${wort} in diesem Vorgang.` }) }),
      );
      expect(befund(befunde, 'AGENTENAUSGABE'), `gesperrtes Wort ${wort}`).toBe(false);
    }
  });

  it('lässt eine Ausgabe durch, die dem Abgleich standhält', () => {
    expect(befund(pruefe(entwurfFuer(), kontext({ agentenausgabe: agentenausgabe() })), 'AGENTENAUSGABE')).toBe(
      true,
    );
  });

  it('lässt durch, wenn es gar keine Agentenausgabe gibt', () => {
    expect(befund(pruefe(entwurfFuer(), kontext()), 'AGENTENAUSGABE')).toBe(true);
  });
});

describe('Die Prüfung insgesamt', () => {
  it('führt immer alle Kontrollen aus, auch wenn eine davon bereits anhält', () => {
    const befunde = pruefe(
      entwurfFuer(),
      kontext({ zahlung: zahlung({ offenerBetrag: 0, belegstatus: 'bezahlt' }), reklamationen: [REK] }),
    );
    expect(befunde).toHaveLength(KONTROLLEN.length);
  });

  it('gibt zu jedem Befund einen Text, der den Grund nennt', () => {
    for (const b of pruefe(entwurfFuer(), kontext())) {
      expect(b.text.length).toBeGreaterThan(10);
    }
  });

  it('lässt einen sauberen Vorgang vollständig durch und legt ihn zur Freigabe', () => {
    const befunde = pruefe(entwurfFuer(), kontext());
    expect(durchgefallen(befunde)).toHaveLength(0);
    expect(warteschlangeFuer(befunde)).toBe('zur_freigabe');
  });

  it('jede Kontrolle nennt eine Warteschlange, die es gibt', () => {
    for (const k of KONTROLLEN) {
      expect(['erledigt', 'klaerung', 'daten_pruefen', 'zur_freigabe']).toContain(k.warteschlange);
    }
  });
});
