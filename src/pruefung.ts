/**
 * Die Prüfung vor dem Versand.
 *
 * Jede Kontrolle ist eine Funktion mit einem Ja oder Nein, kein zweites
 * Sprachmodell und keine Bewertung. Fällt eine Kontrolle durch, geht der
 * Entwurf nicht hinaus, sondern mit Begründung in eine der vier
 * Warteschlangen. Nichts wird still verworfen, und nichts wird still
 * freigegeben: eine Rechnung, deren Stand unbekannt ist, gilt nie als
 * "nichts zu tun".
 *
 * Keine Kontrolle beurteilt eine Rechtslage. Sie vergleichen Daten aus der
 * Quelle mit dem, was im Entwurf steht.
 */

import { stufenBis } from './regeln.ts';
import { cent, datumDe, euro, tageZwischen } from './format.ts';
import type {
  Agentenausgabe,
  Befund,
  Entwurf,
  Kunde,
  Mahnschritt,
  Quellstand,
  Regeln,
  Reklamation,
  Warteschlange,
  Zahlungsstand,
} from './typen.ts';

export interface Pruefkontext {
  regeln: Regeln;
  kunde: Kunde;
  /** Der Stand aus der Quelle. Undefiniert heißt: die Quelle hat ihn nicht geliefert. */
  zahlung: Zahlungsstand | undefined;
  quelle: Quellstand;
  quelleVollstaendig: boolean;
  /** Zeitpunkt der Prüfung, für das Alter der Quelle. */
  geprueftAm: string;
  reklamationen: Reklamation[];
  schritte: Mahnschritt[];
  agentenausgabe: Agentenausgabe | undefined;
  stichtag: string;
}

export interface Kontrolle {
  schluessel: string;
  titel: string;
  frage: string;
  /** Wohin der Vorgang geht, wenn diese Kontrolle anschlägt. */
  warteschlange: Warteschlange;
  pruefe: (entwurf: Entwurf, kontext: Pruefkontext) => { bestanden: boolean; text: string };
}

function stundenZwischen(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
}

export const KONTROLLEN: Kontrolle[] = [
  {
    schluessel: 'QUELLE',
    titel: 'Quelle',
    frage: 'Ist der Stand aus der Buchhaltung vorhanden und frisch genug?',
    warteschlange: 'daten_pruefen',
    pruefe: (_entwurf, { zahlung, quelle, quelleVollstaendig, geprueftAm, regeln }) => {
      if (!zahlung) {
        return {
          bestanden: false,
          text: `Die Quelle hat zu diesem Beleg keinen Stand geliefert (${quelle.uebernommen} von ${quelle.erwartet} Belegen übernommen). Unbekannt ist nicht dasselbe wie nichts offen, deshalb geht hier nichts hinaus.`,
        };
      }
      const alter = stundenZwischen(quelle.gelesenAm, geprueftAm);
      const grenze = regeln.sperren.quelle_hoechstalter_stunden;
      if (alter > grenze) {
        return {
          bestanden: false,
          text: `Der Stand der Quelle ist ${alter.toFixed(1)} Stunden alt, erlaubt sind ${grenze}. Auf einem veralteten Stand wird nicht gemahnt.`,
        };
      }
      if (!quelleVollstaendig) {
        return {
          bestanden: true,
          text: `Stand vorhanden, ${alter.toFixed(1)} Stunden alt. Der Import ist unvollständig, dieser Beleg ist aber dabei.`,
        };
      }
      return { bestanden: true, text: `Stand vorhanden, ${alter.toFixed(1)} Stunden alt.` };
    },
  },
  {
    schluessel: 'ZAHLUNGSSTAND',
    titel: 'Zahlungsstand',
    frage: 'Ist der Beleg inzwischen ausgeglichen oder storniert?',
    warteschlange: 'erledigt',
    pruefe: (entwurf, { zahlung }) => {
      if (!zahlung) {
        return { bestanden: true, text: 'Kein Stand geliefert, das entscheidet die Kontrolle Quelle.' };
      }
      if (zahlung.belegstatus === 'storniert') {
        return {
          bestanden: false,
          text: `Die Quelle führt den Beleg als storniert, die Rechnungsliste zeigt noch ${euro(entwurf.briefbetrag)}. Ein offener Betrag von null ist nicht immer eine Zahlung.`,
        };
      }
      const offen = cent(zahlung.offenerBetrag);
      if (offen > 0) {
        return { bestanden: true, text: `Offen laut Quelle: ${euro(offen)}.` };
      }
      const wann = zahlung.bezahltAm ? ` am ${datumDe(zahlung.bezahltAm)}` : '';
      return {
        bestanden: false,
        text: `Die Quelle weist den Beleg${wann} als ausgeglichen aus, die Rechnungsliste zeigt noch ${euro(entwurf.briefbetrag)}.`,
      };
    },
  },
  {
    schluessel: 'BETRAGSABGLEICH',
    titel: 'Abgleich mit der Quelle',
    frage: 'Stimmt der Betrag im Entwurf mit dem offenen Betrag der Quelle überein?',
    warteschlange: 'daten_pruefen',
    pruefe: (entwurf, { zahlung, regeln }) => {
      if (!zahlung) {
        return { bestanden: true, text: 'Kein Stand geliefert, das entscheidet die Kontrolle Quelle.' };
      }
      const offen = cent(zahlung.offenerBetrag);
      if (offen <= 0) {
        return { bestanden: true, text: 'Kein offener Betrag, der Fall gehört zur Kontrolle Zahlungsstand.' };
      }
      const abweichung = cent(Math.abs(entwurf.briefbetrag - offen));
      if (abweichung <= regeln.sperren.toleranz_betrag) {
        return { bestanden: true, text: `Entwurf und Quelle nennen ${euro(offen)}.` };
      }
      const letzter = zahlung.eingaenge.at(-1);
      const quelleHinweis = letzter
        ? ` Ein Eingang über ${euro(letzter.betrag)} vom ${datumDe(letzter.datum)} ist noch nicht in der Rechnungsliste.`
        : '';
      return {
        bestanden: false,
        text: `Der Entwurf nennt ${euro(entwurf.briefbetrag)}, die Quelle ${euro(offen)}, Abweichung ${euro(abweichung)}.${quelleHinweis} Der maßgebliche Betrag ist der aus der Quelle, nie ein gerechneter.`,
      };
    },
  },
  {
    schluessel: 'MINDESTBETRAG',
    titel: 'Mindestbetrag',
    frage: 'Lohnt der offene Betrag überhaupt ein Schreiben?',
    warteschlange: 'erledigt',
    pruefe: (_entwurf, { zahlung, regeln }) => {
      if (!zahlung) {
        return { bestanden: true, text: 'Kein Stand geliefert, das entscheidet die Kontrolle Quelle.' };
      }
      const offen = cent(zahlung.offenerBetrag);
      const grenze = regeln.sperren.mindestbetrag;
      if (offen <= 0) {
        return { bestanden: true, text: 'Kein offener Betrag, das entscheidet die Kontrolle Zahlungsstand.' };
      }
      if (offen >= grenze) {
        return { bestanden: true, text: `${euro(offen)} erreicht den Mindestbetrag von ${euro(grenze)}.` };
      }
      return {
        bestanden: false,
        text: `${euro(offen)} liegt unter dem Mindestbetrag von ${euro(grenze)} aus den Hausregeln. Der Vorgang gehört auf die Sammelliste, nicht in ein Schreiben.`,
      };
    },
  },
  {
    schluessel: 'REKLAMATION',
    titel: 'Reklamation',
    frage: 'Läuft auf dieser Baustelle eine offene Reklamation?',
    warteschlange: 'klaerung',
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
        text: `${offene.id} ist seit dem ${datumDe(offene.eroeffnet)} offen: ${offene.betreff}. Vorschlag der Hausregel: den Vorgang anhalten, bis das geklärt ist. Über die Forderung selbst sagt diese Sperre nichts.`,
      };
    },
  },
  {
    schluessel: 'KULANZLISTE',
    titel: 'Kulanzliste',
    frage: 'Ist der Kunde ein Fall für den Schreibtisch?',
    warteschlange: 'klaerung',
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
    frage: 'Liegt genug Zeit seit dem letzten Schreiben?',
    warteschlange: 'klaerung',
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
        return { bestanden: true, text: `Letztes Schreiben vor ${abstand} Tagen, Wartezeit ${frist} Tage.` };
      }
      return {
        bestanden: false,
        text: `Das letzte Schreiben ging erst vor ${abstand} Tagen hinaus, die Hausregel verlangt ${frist} Tage Abstand. Zwei Schreiben in einer Woche sehen nach Maschine aus.`,
      };
    },
  },
  {
    schluessel: 'REIHENFOLGE',
    titel: 'Reihenfolge',
    frage: 'Ist jeder Schritt davor dokumentiert?',
    warteschlange: 'daten_pruefen',
    pruefe: (entwurf, { schritte, regeln }) => {
      if (!regeln.sperren.reihenfolge_erzwingen) {
        return { bestanden: true, text: 'Reihenfolgeprüfung ist in den Hausregeln abgeschaltet.' };
      }
      const vorstufen = stufenBis(regeln, entwurf.stufe.schluessel);
      if (vorstufen.length === 0) {
        return { bestanden: true, text: 'Erster Schritt, es gibt nichts davor.' };
      }
      const versendet = new Set(schritte.map((s) => s.stufe));
      const fehlend = vorstufen.filter((s) => !versendet.has(s.schluessel));
      if (fehlend.length === 0) {
        return { bestanden: true, text: `Dokumentiert: ${vorstufen.map((s) => s.name).join(', ')}.` };
      }
      return {
        bestanden: false,
        text: `In der Historie fehlt ${fehlend.map((s) => s.name).join(' und ')}. Einen Schritt zu überspringen, dessen Vorstufe niemand belegen kann, ist genau der Vorgang, den später niemand mehr erklären kann.`,
      };
    },
  },
  {
    schluessel: 'KONTAKTDATEN',
    titel: 'Kontaktdaten',
    frage: 'Ist der Weg zum Kunden überhaupt hinterlegt?',
    warteschlange: 'daten_pruefen',
    pruefe: (entwurf, { kunde }) => {
      if (entwurf.stufe.kanal === 'keiner') {
        return { bestanden: true, text: 'Interne Notiz, es geht nichts hinaus.' };
      }
      if (entwurf.stufe.kanal === 'email') {
        return kunde.email
          ? { bestanden: true, text: 'E-Mail-Adresse hinterlegt.' }
          : {
              bestanden: false,
              text: 'Für diesen Kunden ist keine E-Mail-Adresse hinterlegt. Das Schreiben hätte niemanden erreicht und niemand hätte es bemerkt.',
            };
      }
      return kunde.strasse && kunde.ort
        ? { bestanden: true, text: 'Vollständige Anschrift hinterlegt.' }
        : { bestanden: false, text: 'Die Anschrift ist unvollständig, ein Brief kann so nicht raus.' };
    },
  },
  {
    schluessel: 'AGENTENAUSGABE',
    titel: 'Agentenausgabe',
    frage: 'Hält die Ausgabe des Entwurfsagenten dem Abgleich mit der Quelle stand?',
    warteschlange: 'daten_pruefen',
    pruefe: (entwurf, { agentenausgabe, zahlung, kunde, regeln }) => {
      if (!agentenausgabe) {
        return {
          bestanden: true,
          text: 'Keine Agentenausgabe zu diesem Vorgang, der Entwurf kommt aus der Vorlage.',
        };
      }
      const gesperrt = regeln.entwurf.gesperrte_woerter.find((wort) =>
        agentenausgabe.freitext.toLowerCase().includes(wort.toLowerCase()),
      );
      if (gesperrt) {
        return {
          bestanden: false,
          text: `Die Agentenausgabe enthält das gesperrte Wort "${gesperrt}". Über Verzug, Zinsen oder Rechtsfolgen schreibt dieser Prozess nichts.`,
        };
      }
      if (agentenausgabe.bankverbindung !== regeln.entwurf.erlaubte_bankverbindung) {
        return {
          bestanden: false,
          text: 'Die Agentenausgabe nennt eine andere Bankverbindung als die hinterlegte. Zahlungsdaten kommen nie aus einem Modelltext.',
        };
      }
      if (agentenausgabe.empfaengerBehauptet !== kunde.name) {
        return {
          bestanden: false,
          text: `Die Agentenausgabe adressiert "${agentenausgabe.empfaengerBehauptet}", im Stamm steht "${kunde.name}".`,
        };
      }
      const massgeblich = zahlung ? cent(zahlung.offenerBetrag) : entwurf.briefbetrag;
      const abweichung = cent(Math.abs(agentenausgabe.betragBehauptet - massgeblich));
      if (abweichung > regeln.sperren.toleranz_betrag) {
        return {
          bestanden: false,
          text: `Die Agentenausgabe behauptet ${euro(agentenausgabe.betragBehauptet)}, die Quelle führt ${euro(massgeblich)}. Ein Betrag aus einem Modelltext wird nie übernommen.`,
        };
      }
      return {
        bestanden: true,
        text: `Betrag, Empfänger, Bankverbindung und Wortlaut halten dem Abgleich stand (${euro(agentenausgabe.betragBehauptet)}).`,
      };
    },
  },
];

export function pruefe(
  entwurf: Entwurf,
  kontext: Pruefkontext,
  kontrollen: Kontrolle[] = KONTROLLEN,
): Befund[] {
  return kontrollen.map((kontrolle) => {
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

/**
 * In welche Warteschlange der Vorgang gehört. Die erste durchgefallene
 * Kontrolle bestimmt sie; hält alles, geht der Entwurf zur Freigabe an einen
 * Menschen. Im Pilotbetrieb gibt jeden Entwurf ein Mensch frei.
 */
export function warteschlangeFuer(
  befunde: Befund[],
  kontrollen: Kontrolle[] = KONTROLLEN,
): Warteschlange {
  const erste = befunde.find((b) => !b.bestanden);
  if (!erste) return 'zur_freigabe';
  const kontrolle = kontrollen.find((k) => k.schluessel === erste.kontrolle);
  if (!kontrolle) throw new Error(`Unbekannte Kontrolle im Befund: ${erste.kontrolle}`);
  return kontrolle.warteschlange;
}
