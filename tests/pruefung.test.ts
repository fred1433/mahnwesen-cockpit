/**
 * Jede Kontrolle wird zweimal geprüft: an einem Fall, den sie stoppen MUSS,
 * und an einem Fall, den sie durchlassen MUSS. Eine Sperre, die alles stoppt,
 * ist genauso kaputt wie eine, die nichts stoppt.
 */

import { describe, expect, it } from 'vitest';
import { KONTROLLEN, pruefe } from '../src/pruefung.ts';
import { befund, entwurfFuer, kontext, zahlung } from './hilfen.ts';

describe('Zahlungsstand', () => {
  it('stoppt, wenn die Rechnung inzwischen ausgeglichen ist', () => {
    const befunde = pruefe(
      entwurfFuer('erinnerung'),
      kontext({ zahlung: zahlung({ offenerBetrag: 0, zahlungsstatus: 'ausgeglichen', bezahltAm: '2026-09-15' }) }),
    );
    expect(befund(befunde, 'ZAHLUNGSSTAND')).toBe(false);
    expect(befunde.find((b) => b.kontrolle === 'ZAHLUNGSSTAND')?.text).toContain('15.09.2026');
  });

  it('lässt durch, solange etwas offen ist', () => {
    const befunde = pruefe(entwurfFuer('erinnerung'), kontext());
    expect(befund(befunde, 'ZAHLUNGSSTAND')).toBe(true);
  });
});

describe('Betragsabgleich', () => {
  it('stoppt bei einer Teilzahlung, die noch nicht in der Rechnungsliste steht', () => {
    const befunde = pruefe(
      entwurfFuer('erinnerung'),
      kontext({
        zahlung: zahlung({
          offenerBetrag: 400,
          zahlungsstatus: 'teilweise',
          eingaenge: [{ datum: '2026-09-14', betrag: 600, art: 'SEPA-Überweisung' }],
        }),
      }),
    );
    expect(befund(befunde, 'BETRAGSABGLEICH')).toBe(false);
  });

  it('lässt eine Abweichung innerhalb der Toleranz durch', () => {
    const befunde = pruefe(entwurfFuer('erinnerung'), kontext({ zahlung: zahlung({ offenerBetrag: 1000.01 }) }));
    expect(befund(befunde, 'BETRAGSABGLEICH')).toBe(true);
  });

  it('lässt durch, wenn eine Teilzahlung in beiden Quellen steht', () => {
    const befunde = pruefe(
      entwurfFuer('erinnerung', { rechnung: { offenLautRechnungsliste: 400 } }),
      kontext({
        zahlung: zahlung({
          offenerBetrag: 400,
          zahlungsstatus: 'teilweise',
          eingaenge: [{ datum: '2026-08-10', betrag: 600, art: 'Überweisung' }],
        }),
      }),
    );
    expect(befund(befunde, 'BETRAGSABGLEICH')).toBe(true);
  });
});

describe('Mindestbetrag', () => {
  it('stoppt unterhalb der Grenze aus den Hausregeln', () => {
    const befunde = pruefe(
      entwurfFuer('erinnerung', { rechnung: { offenLautRechnungsliste: 12.4 } }),
      kontext({ zahlung: zahlung({ offenerBetrag: 12.4 }) }),
    );
    expect(befund(befunde, 'MINDESTBETRAG')).toBe(false);
  });

  it('lässt genau auf der Grenze durch', () => {
    const befunde = pruefe(
      entwurfFuer('erinnerung', { rechnung: { offenLautRechnungsliste: 15 } }),
      kontext({ zahlung: zahlung({ offenerBetrag: 15 }) }),
    );
    expect(befund(befunde, 'MINDESTBETRAG')).toBe(true);
  });
});

describe('Reklamation', () => {
  const offene = {
    id: 'REK-9000-001',
    projekt: 'BV-9000-001',
    kundeId: 'K-9001',
    eroeffnet: '2026-09-01',
    status: 'offen' as const,
    betreff: 'Nachbesserung zugesagt',
  };

  it('stoppt bei einer offenen Reklamation auf derselben Baustelle', () => {
    const befunde = pruefe(entwurfFuer('erinnerung'), kontext({ reklamationen: [offene] }));
    expect(befund(befunde, 'REKLAMATION')).toBe(false);
  });

  it('lässt durch, wenn die Reklamation geschlossen ist', () => {
    const befunde = pruefe(
      entwurfFuer('erinnerung'),
      kontext({ reklamationen: [{ ...offene, status: 'geschlossen' as const }] }),
    );
    expect(befund(befunde, 'REKLAMATION')).toBe(true);
  });

  it('lässt durch, wenn die Reklamation zu einer anderen Baustelle gehört', () => {
    const befunde = pruefe(
      entwurfFuer('erinnerung'),
      kontext({ reklamationen: [{ ...offene, projekt: 'BV-9000-002' }] }),
    );
    expect(befund(befunde, 'REKLAMATION')).toBe(true);
  });
});

describe('Kulanzliste', () => {
  it('stoppt einen Kunden von der Kulanzliste', () => {
    const befunde = pruefe(
      entwurfFuer('erinnerung', { rechnung: { kundeId: 'K-1042' }, kunde: { id: 'K-1042' } }),
      kontext(),
    );
    expect(befund(befunde, 'KULANZLISTE')).toBe(false);
  });

  it('lässt einen Kunden durch, der nicht auf der Liste steht', () => {
    const befunde = pruefe(entwurfFuer('erinnerung'), kontext());
    expect(befund(befunde, 'KULANZLISTE')).toBe(true);
  });
});

describe('Wartezeit', () => {
  const schritt = (versendetAm: string) => [
    { nummer: 'RE-9000-0001', stufe: 'erinnerung', versendetAm, kanal: 'email' as const },
  ];

  it('stoppt, wenn die letzte Stufe zu kurz zurückliegt', () => {
    const befunde = pruefe(
      entwurfFuer('mahnung_1', { schritte: schritt('2026-09-13') }),
      kontext({ schritte: schritt('2026-09-13') }),
    );
    expect(befund(befunde, 'WARTEZEIT')).toBe(false);
  });

  it('lässt genau nach Ablauf der Wartezeit durch', () => {
    const befunde = pruefe(
      entwurfFuer('mahnung_1', { schritte: schritt('2026-09-09') }),
      kontext({ schritte: schritt('2026-09-09') }),
    );
    expect(befund(befunde, 'WARTEZEIT')).toBe(true);
  });
});

describe('Reihenfolge', () => {
  it('stoppt, wenn eine Vorstufe in der Historie fehlt', () => {
    const schritte = [
      { nummer: 'RE-9000-0001', stufe: 'erinnerung', versendetAm: '2026-07-29', kanal: 'email' as const },
      { nummer: 'RE-9000-0001', stufe: 'mahnung_2', versendetAm: '2026-08-20', kanal: 'brief' as const },
    ];
    const befunde = pruefe(entwurfFuer('uebergabe', { schritte }), kontext({ schritte }));
    expect(befund(befunde, 'REIHENFOLGE')).toBe(false);
    expect(befunde.find((b) => b.kontrolle === 'REIHENFOLGE')?.text).toContain('1. Mahnung');
  });

  it('lässt eine lückenlose Historie durch', () => {
    const schritte = [
      { nummer: 'RE-9000-0001', stufe: 'erinnerung', versendetAm: '2026-07-29', kanal: 'email' as const },
      { nummer: 'RE-9000-0001', stufe: 'mahnung_1', versendetAm: '2026-08-08', kanal: 'email' as const },
      { nummer: 'RE-9000-0001', stufe: 'mahnung_2', versendetAm: '2026-08-20', kanal: 'brief' as const },
    ];
    const befunde = pruefe(entwurfFuer('uebergabe', { schritte }), kontext({ schritte }));
    expect(befund(befunde, 'REIHENFOLGE')).toBe(true);
  });

  it('lässt die erste Stufe durch, dort gibt es nichts davor', () => {
    const befunde = pruefe(entwurfFuer('erinnerung'), kontext());
    expect(befund(befunde, 'REIHENFOLGE')).toBe(true);
  });
});

describe('Kontaktdaten', () => {
  it('stoppt eine E-Mail-Stufe ohne hinterlegte Adresse', () => {
    const befunde = pruefe(
      entwurfFuer('erinnerung', { kunde: { email: null } }),
      kontext({ kunde: { ...kontext().kunde, email: null } }),
    );
    expect(befund(befunde, 'KONTAKTDATEN')).toBe(false);
  });

  it('stoppt eine Briefstufe ohne Anschrift', () => {
    const ohneAnschrift = { ...kontext().kunde, strasse: null, ort: null };
    const befunde = pruefe(
      entwurfFuer('mahnung_2', { kunde: { strasse: null, ort: null } }),
      kontext({ kunde: ohneAnschrift }),
    );
    expect(befund(befunde, 'KONTAKTDATEN')).toBe(false);
  });

  it('lässt durch, wenn der Kanal bedient werden kann', () => {
    const befunde = pruefe(entwurfFuer('erinnerung'), kontext());
    expect(befund(befunde, 'KONTAKTDATEN')).toBe(true);
  });
});

describe('Die Prüfung insgesamt', () => {
  it('führt immer alle Kontrollen aus, auch wenn eine davon bereits stoppt', () => {
    const befunde = pruefe(
      entwurfFuer('erinnerung'),
      kontext({ zahlung: zahlung({ offenerBetrag: 0, zahlungsstatus: 'ausgeglichen', bezahltAm: '2026-09-15' }) }),
    );
    expect(befunde).toHaveLength(KONTROLLEN.length);
    expect(new Set(befunde.map((b) => b.kontrolle)).size).toBe(KONTROLLEN.length);
  });

  it('gibt zu jedem Befund einen Text, der den Grund nennt', () => {
    const befunde = pruefe(entwurfFuer('erinnerung'), kontext());
    for (const b of befunde) expect(b.text.length).toBeGreaterThan(10);
  });

  it('lässt einen sauberen Vorgang vollständig durch', () => {
    const befunde = pruefe(entwurfFuer('erinnerung'), kontext());
    expect(befunde.every((b) => b.bestanden)).toBe(true);
  });
});
