import { describe, expect, it } from 'vitest';
import { faelligeStufe, hoechsteStufe, naechsteStufe, tageUeberfaellig } from '../src/faellig.ts';
import { REGELN, STICHTAG, rechnung } from './hilfen.ts';
import type { Mahnschritt } from '../src/typen.ts';

const schritt = (stufe: string, versendetAm: string): Mahnschritt => ({
  nummer: 'RE-9000-0001',
  stufe,
  versendetAm,
  kanal: 'email',
});

describe('Fälligkeit', () => {
  it('zählt die Tage ab dem Fälligkeitsdatum', () => {
    expect(tageUeberfaellig(rechnung({ faelligkeit: '2026-09-09' }), STICHTAG)).toBe(7);
    expect(tageUeberfaellig(rechnung({ faelligkeit: '2026-09-30' }), STICHTAG)).toBe(-14);
  });

  it('bereitet nichts vor, solange die Schwelle der Stufe nicht erreicht ist', () => {
    expect(faelligeStufe(REGELN, rechnung({ faelligkeit: '2026-09-12' }), [], STICHTAG)).toBeNull();
  });

  it('bereitet die Zahlungserinnerung genau auf der Schwelle vor', () => {
    const stufe = faelligeStufe(REGELN, rechnung({ faelligkeit: '2026-09-11' }), [], STICHTAG);
    expect(stufe?.schluessel).toBe('erinnerung');
  });

  it('springt keine Stufe, auch wenn die Rechnung uralt ist', () => {
    const stufe = faelligeStufe(REGELN, rechnung({ faelligkeit: '2026-06-01' }), [], STICHTAG);
    expect(stufe?.schluessel).toBe('erinnerung');
  });

  it('nimmt die nächste Stufe nach der letzten dokumentierten', () => {
    const schritte = [schritt('erinnerung', '2026-09-01')];
    const stufe = faelligeStufe(REGELN, rechnung({ faelligkeit: '2026-08-28' }), schritte, STICHTAG);
    expect(stufe?.schluessel).toBe('mahnung_1');
  });

  it('bereitet nichts vor, wenn die Rechnungsliste keinen offenen Betrag zeigt', () => {
    const offen0 = rechnung({ faelligkeit: '2026-08-01', offenLautRechnungsliste: 0 });
    expect(faelligeStufe(REGELN, offen0, [], STICHTAG)).toBeNull();
  });

  it('ist am Ende der Stufenleiter fertig', () => {
    const schritte = [
      schritt('erinnerung', '2026-07-01'),
      schritt('mahnung_1', '2026-07-10'),
      schritt('mahnung_2', '2026-07-20'),
      schritt('vorlage_leitung', '2026-08-01'),
    ];
    expect(naechsteStufe(REGELN, schritte)).toBeNull();
    expect(faelligeStufe(REGELN, rechnung({ faelligkeit: '2026-06-01' }), schritte, STICHTAG)).toBeNull();
  });

  it('nimmt bei einer lückenhaften Historie die höchste erreichte Stufe', () => {
    const schritte = [schritt('erinnerung', '2026-07-29'), schritt('mahnung_2', '2026-08-20')];
    expect(hoechsteStufe(REGELN, schritte)).toBe('mahnung_2');
    expect(naechsteStufe(REGELN, schritte)?.schluessel).toBe('vorlage_leitung');
  });
});
