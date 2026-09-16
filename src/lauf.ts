/**
 * Der Mahnlauf.
 *
 * Liest die Beispieldaten, bestimmt je Rechnung die fällige Stufe, schreibt
 * den Entwurf, lässt jede der acht Kontrollen darüber laufen und legt das
 * Ergebnis ab: die Briefe in briefe/, den vollständigen Lauf in out/lauf.json.
 *
 * Es wird kein Netz und kein Sprachmodell angefasst. Derselbe Stichtag liefert
 * denselben Lauf, deshalb kann die CI die abgelegten Briefe nachrechnen.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ladeBestand, type Bestand } from './daten.ts';
import { baueEntwurf } from './entwurf.ts';
import { faelligeStufe, schritteZu } from './faellig.ts';
import { datumDe, euro } from './format.ts';
import { durchgefallen, KONTROLLEN, pruefe } from './pruefung.ts';
import { ladeRegeln } from './regeln.ts';
import type { Lauf, Protokollzeile, Regeln, Vorgang } from './typen.ts';

export function fuehreLaufAus(regeln: Regeln, bestand: Bestand): Lauf {
  const stichtag = regeln.stichtag;
  const vorgaenge: Vorgang[] = [];
  const protokoll: Protokollzeile[] = [];
  let schritt = 0;

  const sortiert = bestand.rechnungen
    .slice()
    .sort((a, b) => a.faelligkeit.localeCompare(b.faelligkeit) || a.nummer.localeCompare(b.nummer));

  for (const rechnung of sortiert) {
    const schritte = schritteZu(bestand.historie, rechnung.nummer);
    const stufe = faelligeStufe(regeln, rechnung, schritte, stichtag);
    if (!stufe) continue;

    const kunde = bestand.kunden.get(rechnung.kundeId);
    const zahlung = bestand.zahlungen.get(rechnung.nummer);
    if (!kunde || !zahlung) throw new Error(`${rechnung.nummer}: Stammdaten fehlen`);

    const entwurf = baueEntwurf(rechnung, kunde, stufe, schritte, stichtag, regeln);
    const befunde = pruefe(entwurf, {
      regeln,
      kunde,
      zahlung,
      reklamationen: bestand.reklamationen,
      schritte,
      stichtag,
    });

    schritt += 1;
    for (const befund of befunde) {
      protokoll.push({
        schritt,
        nummer: entwurf.nummer,
        stufe: stufe.name,
        kontrolle: befund.kontrolle,
        titel: befund.titel,
        bestanden: befund.bestanden,
        text: befund.text,
      });
    }

    const gefallen = durchgefallen(befunde);
    const eskaliert = entwurf.tageUeberfaellig >= regeln.eskalation.an_geschaeftsfuehrung_ab_tagen;

    let ergebnis: Vorgang['ergebnis'];
    let grund: string;
    let naechsterSchritt: string;
    let zustaendig: string;

    if (gefallen.length > 0) {
      const erster = gefallen[0]!;
      ergebnis = 'gestoppt';
      grund = erster.titel;
      naechsterSchritt = `Vorlage zur Freigabe, Grund: ${erster.titel}`;
      zustaendig = eskaliert ? 'Geschäftsführung' : 'Buchhaltung';
    } else if (stufe.freigabe === 'mensch') {
      ergebnis = 'zur_freigabe';
      grund = 'Diese Stufe gibt immer ein Mensch frei';
      naechsterSchritt =
        stufe.kanal === 'keiner'
          ? 'Akte liegt der Geschäftsführung vor, es geht nichts hinaus'
          : `Nach Freigabe Versand per ${stufe.kanal}`;
      zustaendig = stufe.kanal === 'keiner' ? 'Geschäftsführung' : 'Buchhaltung';
    } else {
      ergebnis = 'freigegeben';
      grund = `${befunde.length} von ${befunde.length} Kontrollen bestanden`;
      naechsterSchritt = `Versand per ${stufe.kanal} am ${datumDe(stichtag)}`;
      zustaendig = 'Automatisch';
    }

    vorgaenge.push({ entwurf, befunde, ergebnis, grund, eskaliert, naechsterSchritt, zustaendig });
  }

  const zaehle = (art: Vorgang['ergebnis']) => vorgaenge.filter((v) => v.ergebnis === art).length;
  const offeneRechnungen = bestand.rechnungen.filter(
    (r) => (bestand.zahlungen.get(r.nummer)?.offenerBetrag ?? 0) > 0,
  ).length;

  const gestoppt = vorgaenge.filter((v) => v.ergebnis === 'gestoppt');
  const eskaliert = vorgaenge.filter((v) => v.eskaliert);

  const zusammenfassung = [
    `Mahnlauf ${datumDe(stichtag)}: ${vorgaenge.length} Entwürfe aus ${bestand.rechnungen.length} Rechnungen.`,
    `${zaehle('freigegeben')} nach Prüfung freigegeben, ${zaehle('zur_freigabe')} zur Freigabe vorgelegt, ${gestoppt.length} gestoppt.`,
    `${KONTROLLEN.length} Kontrollen je Entwurf, ${protokoll.length} Kontrollen insgesamt ausgeführt.`,
    ...gestoppt.map(
      (v) => `Gestoppt: ${v.entwurf.nummer}, ${v.entwurf.stufe.name}, ${euro(v.entwurf.briefbetrag)}, Grund ${v.grund}.`,
    ),
    ...eskaliert.map(
      (v) =>
        `Eskaliert an die Geschäftsführung: ${v.entwurf.nummer}, ${v.entwurf.tageUeberfaellig} Tage überfällig, ${euro(v.entwurf.briefbetrag)}.`,
    ),
  ];

  return {
    beispieldaten: true,
    stichtag,
    erzeugtVon: 'npm run lauf, ohne Netzzugriff und ohne Modellaufruf',
    zahlen: {
      rechnungen: bestand.rechnungen.length,
      offeneRechnungen,
      entwuerfe: vorgaenge.length,
      freigegeben: zaehle('freigegeben'),
      zurFreigabe: zaehle('zur_freigabe'),
      gestoppt: gestoppt.length,
      eskaliert: eskaliert.length,
      kontrollenAusgefuehrt: protokoll.length,
    },
    vorgaenge,
    protokoll,
    zusammenfassung,
  };
}

function briefKopf(vorgang: Vorgang): string {
  const gefallen = durchgefallen(vorgang.befunde);
  const ergebnis =
    vorgang.ergebnis === 'gestoppt'
      ? `GESTOPPT durch die Kontrolle ${gefallen[0]!.titel}, nicht versendet`
      : vorgang.ergebnis === 'zur_freigabe'
        ? 'Alle Kontrollen bestanden, liegt einem Menschen zur Freigabe vor'
        : 'Alle Kontrollen bestanden, freigegeben';
  return [
    '# BEISPIELBRIEF. Fiktiver Absender, fiktiver Empfänger, erfundene Beträge.',
    `# Vorgang    ${vorgang.entwurf.nummer}, ${vorgang.entwurf.leistung}`,
    `# Stufe      ${vorgang.entwurf.stufe.name}`,
    `# Kontrollen ${vorgang.befunde.filter((b) => b.bestanden).length} von ${vorgang.befunde.length} bestanden`,
    `# Ergebnis   ${ergebnis}`,
    '# Erzeugt    npm run lauf, ohne Modellaufruf',
    `# ${'-'.repeat(72)}`,
    '',
  ].join('\n');
}

function schreibe(lauf: Lauf): void {
  const wurzel = new URL('../', import.meta.url);
  const briefeOrdner = fileURLToPath(new URL('briefe/', wurzel));
  const outOrdner = fileURLToPath(new URL('out/', wurzel));
  mkdirSync(briefeOrdner, { recursive: true });
  mkdirSync(outOrdner, { recursive: true });

  for (const datei of readdirSync(briefeOrdner)) {
    if (datei.endsWith('.txt')) rmSync(fileURLToPath(new URL(`briefe/${datei}`, wurzel)));
  }

  for (const vorgang of lauf.vorgaenge) {
    writeFileSync(
      fileURLToPath(new URL(vorgang.entwurf.briefDatei, wurzel)),
      `${briefKopf(vorgang)}${vorgang.entwurf.brief}\n`,
      'utf8',
    );
  }

  writeFileSync(
    fileURLToPath(new URL('out/lauf.json', wurzel)),
    `${JSON.stringify(lauf, null, 2)}\n`,
    'utf8',
  );
}

export function main(): void {
  const regeln = ladeRegeln();
  const bestand = ladeBestand();
  const lauf = fuehreLaufAus(regeln, bestand);
  schreibe(lauf);
  for (const zeile of lauf.zusammenfassung) console.log(zeile);
  console.log(`\n${lauf.vorgaenge.length} Briefe in briefe/, vollstaendiger Lauf in out/lauf.json.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
