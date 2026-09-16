/**
 * Die Prüfung vor dem Versand.
 *
 * Jede Kontrolle ist eine Funktion mit einem Ja oder Nein, kein zweites
 * Sprachmodell und keine Bewertung. Fällt eine Kontrolle durch, geht der
 * Entwurf nicht hinaus, sondern mit Begründung in die Freigabeliste.
 * Nichts wird still verworfen.
 */

import { stufenBis } from './regeln.ts';
import { cent, datumDe, euro, tageZwischen } from './format.ts';
import type { Befund, Entwurf, Kunde, Mahnschritt, Regeln, Reklamation, Zahlungsstand } from './typen.ts';

export interface Pruefkontext {
  regeln: Regeln;
  kunde: Kunde;
  zahlung: Zahlungsstand;
  reklamationen: Reklamation[];
  schritte: Mahnschritt[];
  stichtag: string;
}

export interface Kontrolle {
  schluessel: string;
  titel: string;
  frage: string;
  pruefe: (entwurf: Entwurf, kontext: Pruefkontext) => { bestanden: boolean; text: string };
}

export const KONTROLLEN: Kontrolle[] = [
  {
    schluessel: 'ZAHLUNGSSTAND',
    titel: 'Zahlungsstand',
    frage: 'Ist die Rechnung inzwischen ausgeglichen?',
    pruefe: (entwurf, { zahlung }) => {
      const offen = cent(zahlung.offenerBetrag);
      if (offen > 0) {
        return { bestanden: true, text: `Offen laut Zahlungsstand: ${euro(offen)}.` };
      }
      const wann = zahlung.bezahltAm ? ` am ${datumDe(zahlung.bezahltAm)}` : '';
      return {
        bestanden: false,
        text: `Der Zahlungsstand weist die Rechnung${wann} als ausgeglichen aus, die Rechnungsliste zeigt noch ${euro(entwurf.briefbetrag)}.`,
      };
    },
  },
  {
    schluessel: 'BETRAGSABGLEICH',
    titel: 'Betragsabgleich',
    frage: 'Stimmt der Betrag im Brief mit dem Zahlungsstand überein?',
    pruefe: (entwurf, { zahlung, regeln }) => {
      const offen = cent(zahlung.offenerBetrag);
      if (offen <= 0) {
        return { bestanden: true, text: 'Kein offener Betrag, der Fall gehört zur Kontrolle Zahlungsstand.' };
      }
      const abweichung = cent(Math.abs(entwurf.briefbetrag - offen));
      if (abweichung <= regeln.sperren.toleranz_betrag) {
        return { bestanden: true, text: `Brief und Zahlungsstand nennen ${euro(offen)}.` };
      }
      const letzter = zahlung.eingaenge.at(-1);
      const quelle = letzter ? ` Ein Eingang über ${euro(letzter.betrag)} vom ${datumDe(letzter.datum)} ist noch nicht in der Rechnungsliste.` : '';
      return {
        bestanden: false,
        text: `Der Brief nennt ${euro(entwurf.briefbetrag)}, der Zahlungsstand ${euro(offen)}, Abweichung ${euro(abweichung)}.${quelle}`,
      };
    },
  },
  {
    schluessel: 'MINDESTBETRAG',
    titel: 'Mindestbetrag',
    frage: 'Lohnt der offene Betrag eine Mahnung?',
    pruefe: (_entwurf, { zahlung, regeln }) => {
      const offen = cent(zahlung.offenerBetrag);
      const grenze = regeln.sperren.mindestbetrag;
      if (offen <= 0 || offen >= grenze) {
        return { bestanden: true, text: `${euro(offen)} erreicht den Mindestbetrag von ${euro(grenze)}.` };
      }
      return {
        bestanden: false,
        text: `${euro(offen)} liegt unter dem Mindestbetrag von ${euro(grenze)}. Der Vorgang gehört auf die Sammelliste, nicht in eine Mahnung.`,
      };
    },
  },
  {
    schluessel: 'REKLAMATION',
    titel: 'Reklamation',
    frage: 'Läuft auf dieser Baustelle eine offene Reklamation?',
    pruefe: (entwurf, { reklamationen, regeln }) => {
      if (!regeln.sperren.reklamation_stoppt) {
        return { bestanden: true, text: 'Reklamationssperre ist in den Hausregeln abgeschaltet.' };
      }
      const offene = reklamationen.find(
        (r) => r.status === 'offen' && r.projekt === entwurf.projekt && r.kundeId === entwurf.kundeId,
      );
      if (!offene) {
        return { bestanden: true, text: `Keine offene Reklamation zu ${entwurf.projekt}.` };
      }
      return {
        bestanden: false,
        text: `${offene.id} ist seit dem ${datumDe(offene.eroeffnet)} offen: ${offene.betreff}. Wer auf eine Nachbesserung wartet, bekommt keine Mahnung.`,
      };
    },
  },
  {
    schluessel: 'KULANZLISTE',
    titel: 'Kulanzliste',
    frage: 'Steht der Kunde auf der Liste, die nie automatisch gemahnt wird?',
    pruefe: (entwurf, { regeln }) => {
      if (!regeln.sperren.kulanzliste.includes(entwurf.kundeId)) {
        return { bestanden: true, text: `${entwurf.kundeId} steht nicht auf der Kulanzliste.` };
      }
      return {
        bestanden: false,
        text: `${entwurf.kundeName} steht auf der Kulanzliste. Solche Kunden gehen immer über den Schreibtisch, nie automatisch hinaus.`,
      };
    },
  },
  {
    schluessel: 'WARTEZEIT',
    titel: 'Wartezeit',
    frage: 'Liegt genug Zeit seit der letzten Mahnung?',
    pruefe: (_entwurf, { schritte, regeln, stichtag }) => {
      const frist = regeln.sperren.wartezeit_zwischen_stufen_tage;
      const letzter = schritte
        .slice()
        .sort((a, b) => a.versendetAm.localeCompare(b.versendetAm))
        .at(-1);
      if (!letzter) {
        return { bestanden: true, text: 'Noch nichts versendet, keine Wartezeit zu beachten.' };
      }
      const abstand = tageZwischen(letzter.versendetAm, stichtag);
      if (abstand >= frist) {
        return { bestanden: true, text: `Letzte Stufe vor ${abstand} Tagen, Wartezeit ${frist} Tage.` };
      }
      return {
        bestanden: false,
        text: `Die letzte Stufe ging erst vor ${abstand} Tagen hinaus, die Hausregel verlangt ${frist} Tage Abstand. Zwei Schreiben in einer Woche sehen nach Maschine aus.`,
      };
    },
  },
  {
    schluessel: 'REIHENFOLGE',
    titel: 'Reihenfolge',
    frage: 'Ist jede Stufe davor dokumentiert?',
    pruefe: (entwurf, { schritte, regeln }) => {
      if (!regeln.sperren.reihenfolge_erzwingen) {
        return { bestanden: true, text: 'Reihenfolgeprüfung ist in den Hausregeln abgeschaltet.' };
      }
      const vorstufen = stufenBis(regeln, entwurf.stufe.schluessel);
      if (vorstufen.length === 0) {
        return { bestanden: true, text: 'Erste Stufe, es gibt nichts davor.' };
      }
      const versendet = new Set(schritte.map((s) => s.stufe));
      const fehlend = vorstufen.filter((s) => !versendet.has(s.schluessel));
      if (fehlend.length === 0) {
        return {
          bestanden: true,
          text: `Dokumentiert: ${vorstufen.map((s) => s.name).join(', ')}.`,
        };
      }
      return {
        bestanden: false,
        text: `In der Historie fehlt ${fehlend.map((s) => s.name).join(' und ')}. Eine Stufe zu überspringen, deren Vorstufe niemand belegen kann, ist genau der Vorgang, den später niemand mehr erklären kann.`,
      };
    },
  },
  {
    schluessel: 'KONTAKTDATEN',
    titel: 'Kontaktdaten',
    frage: 'Ist der Weg zum Kunden überhaupt hinterlegt?',
    pruefe: (entwurf, { kunde }) => {
      if (entwurf.stufe.kanal === 'keiner') {
        return { bestanden: true, text: 'Interne Notiz, es geht nichts hinaus.' };
      }
      if (entwurf.stufe.kanal === 'email') {
        return kunde.email
          ? { bestanden: true, text: 'E-Mail-Adresse hinterlegt.' }
          : {
              bestanden: false,
              text: 'Für diesen Kunden ist keine E-Mail-Adresse hinterlegt. Der Brief hätte niemanden erreicht und niemand hätte es bemerkt.',
            };
      }
      return kunde.strasse && kunde.ort
        ? { bestanden: true, text: 'Vollständige Anschrift hinterlegt.' }
        : { bestanden: false, text: 'Die Anschrift ist unvollständig, ein Brief kann so nicht raus.' };
    },
  },
];

export function pruefe(entwurf: Entwurf, kontext: Pruefkontext): Befund[] {
  return KONTROLLEN.map((kontrolle) => {
    const ergebnis = kontrolle.pruefe(entwurf, kontext);
    return {
      kontrolle: kontrolle.schluessel,
      titel: kontrolle.titel,
      bestanden: ergebnis.bestanden,
      text: ergebnis.text,
    } satisfies Befund;
  });
}

export function durchgefallen(befunde: Befund[]): Befund[] {
  return befunde.filter((b) => !b.bestanden);
}
