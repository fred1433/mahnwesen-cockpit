/**
 * Der Mahnlauf, in drei Abschnitten.
 *
 *  A  Offene Posten prüfen und Entwürfe vorbereiten, auf der Quellfassung v1.
 *     Jeder Entwurf läuft durch alle Kontrollen und landet in einer von vier
 *     Warteschlangen. Nichts geht automatisch hinaus.
 *  B  Ein Mensch gibt einzelne Entwürfe frei (daten/freigaben.json). Eine
 *     Freigabe gilt für die Fassung, auf der sie erteilt wurde.
 *  C  Unmittelbar vor dem Versand wird die Quelle NOCH EINMAL gelesen, in der
 *     Fassung v2, und dieselben Kontrollen laufen erneut. Wer die Nachprüfung
 *     nicht besteht, verliert seine Freigabe und kommt nicht in den
 *     Test-Postausgang. Das ist der Kern dieser Demonstration.
 *
 * Dazu: interne Aufgaben, die zu lange liegen, werden eskaliert, und was NICHT
 * gelaufen ist, steht in der Überwachung.
 *
 * Es wird kein Netz und kein Sprachmodell angefasst. Derselbe Stichtag liefert
 * denselben Lauf, deshalb kann die CI alles nachrechnen.
 */

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ladeBestand, quelleVollstaendig, type Bestand } from './daten.ts';
import { baueEntwurf } from './entwurf.ts';
import { faelligeStufe, schritteZu } from './faellig.ts';
import { datumDe, euro, tageZwischen } from './format.ts';
import { durchgefallen, KONTROLLEN, pruefe, warteschlangeFuer, type Kontrolle } from './pruefung.ts';
import { ladeRegeln } from './regeln.ts';
import type {
  Aufgabe,
  Befund,
  Entwurf,
  Eskalationssatz,
  Lauf,
  Nachpruefung,
  Protokollzeile,
  Regeln,
  Versandsatz,
  Vorgang,
  Warteschlange,
} from './typen.ts';

const TEST_EMPFAENGER = 'Test-Postausgang (kein Versand nach draussen)';
const TEST_LEITUNG = 'Test-Eskalation an die Geschaeftsfuehrung';

export const WARTESCHLANGEN: Record<Warteschlange, string> = {
  erledigt: 'Erledigt / Keine Mahnung',
  klaerung: 'Klärung erforderlich',
  daten_pruefen: 'Daten prüfen',
  zur_freigabe: 'Zur Freigabe',
};

function verantwortlichFuer(warteschlange: Warteschlange, eskaliert: boolean): string {
  if (eskaliert) return 'Geschäftsführung';
  switch (warteschlange) {
    case 'klaerung':
      return 'Geschäftsführung';
    case 'daten_pruefen':
      return 'Buchhaltung';
    case 'zur_freigabe':
      return 'Buchhaltung';
    default:
      return 'Niemand, der Vorgang ist zu';
  }
}

function naechsteAktionFuer(
  warteschlange: Warteschlange,
  entwurf: Entwurf,
  gefallen: Befund[],
): string {
  switch (warteschlange) {
    case 'erledigt':
      return `Kein Schreiben. ${gefallen[0]?.titel ?? 'Nichts offen'}, der Vorgang ist zu.`;
    case 'klaerung':
      return `Klären: ${gefallen[0]?.titel ?? 'offen'}. Wiedervorlage am ${datumDe(entwurf.wiedervorlageAm)}.`;
    case 'daten_pruefen':
      return `Daten richtigstellen: ${gefallen[0]?.titel ?? 'offen'}. Danach läuft der Vorgang erneut durch alle Kontrollen.`;
    default:
      return entwurf.stufe.kanal === 'keiner'
        ? 'Akte liegt der Geschäftsführung vor, es geht nichts hinaus.'
        : `Freigabe durch einen Menschen, danach Ablage im Test-Postausgang (${entwurf.stufe.kanal}).`;
  }
}

interface AbschnittA {
  vorgaenge: Vorgang[];
  protokoll: Protokollzeile[];
}

/** Abschnitt A: offene Posten prüfen, Entwürfe vorbereiten, einsortieren. */
export function bereiteVor(
  regeln: Regeln,
  bestand: Bestand,
  kontrollen: Kontrolle[] = KONTROLLEN,
): AbschnittA {
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
    if (!kunde) throw new Error(`${rechnung.nummer}: Kunde fehlt im Stamm`);

    const entwurf = baueEntwurf(
      rechnung,
      kunde,
      stufe,
      schritte,
      stichtag,
      regeln,
      bestand.quelle.version,
    );
    const befunde = pruefe(
      entwurf,
      {
        regeln,
        kunde,
        zahlung: bestand.zahlungen.get(rechnung.nummer),
        quelle: bestand.quelle,
        quelleVollstaendig: quelleVollstaendig(bestand.quelle),
        geprueftAm: regeln.pruefzeitpunkt,
        reklamationen: bestand.reklamationen,
        schritte,
        agentenausgabe: bestand.agentenausgaben.get(rechnung.nummer),
        stichtag,
      },
      kontrollen,
    );

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
    const warteschlange = warteschlangeFuer(befunde, kontrollen);
    const eskaliert = entwurf.tageUeberfaellig >= regeln.eskalation.an_geschaeftsfuehrung_ab_tagen;

    vorgaenge.push({
      entwurf,
      befunde,
      warteschlange,
      grund: gefallen[0]?.titel ?? `${befunde.length} von ${befunde.length} Kontrollen bestanden`,
      eskaliert,
      naechsteAktion: naechsteAktionFuer(warteschlange, entwurf, gefallen),
      verantwortlich: verantwortlichFuer(warteschlange, eskaliert),
      faelligAm: entwurf.wiedervorlageAm,
    });
  }

  return { vorgaenge, protokoll };
}

/**
 * Abschnitt C: Nachprüfung auf der neuen Quellfassung, unmittelbar bevor
 * etwas hinausginge. Nur wer hier noch besteht, kommt in den Postausgang.
 */
export function nachpruefen(
  regeln: Regeln,
  vorgaenge: Vorgang[],
  vorher: Bestand,
  nachher: Bestand,
  kontrollen: Kontrolle[] = KONTROLLEN,
): { nachpruefungen: Nachpruefung[]; postausgang: Versandsatz[] } {
  const nachpruefungen: Nachpruefung[] = [];
  const postausgang: Versandsatz[] = [];
  const freigegeben = new Map(nachher.freigaben.map((f) => [f.nummer, f]));

  for (const vorgang of vorgaenge) {
    const freigabe = freigegeben.get(vorgang.entwurf.nummer);
    if (!freigabe) continue;
    if (vorgang.warteschlange !== 'zur_freigabe') {
      throw new Error(
        `${vorgang.entwurf.nummer}: freigegeben, obwohl der Vorgang in ${vorgang.warteschlange} liegt. Ein angehaltener Vorgang ist kein freigebbarer Brief.`,
      );
    }
    if (freigabe.fassung !== vorgang.entwurf.fassung) {
      throw new Error(`${vorgang.entwurf.nummer}: Freigabe gilt für Fassung ${freigabe.fassung}`);
    }

    const kunde = nachher.kunden.get(vorgang.entwurf.kundeId)!;
    const schritte = schritteZu(nachher.historie, vorgang.entwurf.nummer);
    const befundeNachher = pruefe(
      vorgang.entwurf,
      {
        regeln,
        kunde,
        zahlung: nachher.zahlungen.get(vorgang.entwurf.nummer),
        quelle: nachher.quelle,
        quelleVollstaendig: quelleVollstaendig(nachher.quelle),
        geprueftAm: regeln.pruefzeitpunkt,
        reklamationen: nachher.reklamationen,
        schritte,
        agentenausgabe: nachher.agentenausgaben.get(vorgang.entwurf.nummer),
        stichtag: regeln.stichtag,
      },
      kontrollen,
    );

    const gefallen = durchgefallen(befundeNachher);
    const haelt = gefallen.length === 0;
    const vorherStand = vorher.zahlungen.get(vorgang.entwurf.nummer);
    const nachherStand = nachher.zahlungen.get(vorgang.entwurf.nummer);
    const eingang = nachherStand?.eingaenge.find(
      (e) => !vorherStand?.eingaenge.some((v) => v.datum === e.datum && v.betrag === e.betrag),
    );

    const ereignis = eingang
      ? `Zahlungseingang ${euro(eingang.betrag)} am ${datumDe(eingang.datum)} (${eingang.art})`
      : 'Keine Änderung in der Quelle zwischen den beiden Abfragen';

    let datei = '';
    if (haelt) {
      datei = `postausgang_test/${vorgang.entwurf.nummer}_${vorgang.entwurf.stufe.schluessel}.txt`;
      // Derselbe Vorgang in derselben Fassung wird nie zweimal abgelegt.
      const schonDa = postausgang.some(
        (p) => p.nummer === vorgang.entwurf.nummer && p.fassung === vorgang.entwurf.fassung,
      );
      if (!schonDa) {
        postausgang.push({
          nummer: vorgang.entwurf.nummer,
          fassung: vorgang.entwurf.fassung,
          stufe: vorgang.entwurf.stufe.name,
          kanal: vorgang.entwurf.stufe.kanal,
          anEmpfaenger: TEST_EMPFAENGER,
          abgelegtAm: regeln.pruefzeitpunkt,
          datei,
        });
      }
    }

    nachpruefungen.push({
      nummer: vorgang.entwurf.nummer,
      fassung: vorgang.entwurf.fassung,
      quelleVorher: vorher.quelle.version,
      quelleNachher: nachher.quelle.version,
      ereignis,
      befundeVorher: vorgang.befunde,
      befundeNachher,
      freigabeVerfallen: !haelt,
      inPostausgang: haelt,
      warteschlangeNachher: warteschlangeFuer(befundeNachher, kontrollen),
      begruendung: haelt
        ? `Alle ${befundeNachher.length} Kontrollen halten auch auf der Fassung ${nachher.quelle.version}, Ablage im Test-Postausgang.`
        : `${gefallen[0]!.titel}: ${gefallen[0]!.text} Die Freigabe vom ${datumDe(freigabe.freigegebenAm.slice(0, 10))} ist damit verfallen, abgelegt wurde nichts.`,
    });
  }

  return { nachpruefungen, postausgang };
}

/** Interne Aufgaben, die zu lange liegen, kommen auf den Tisch der Leitung. */
export function eskaliereAufgaben(regeln: Regeln, aufgaben: Aufgabe[]): Eskalationssatz[] {
  const grenze = regeln.eskalation.offene_aufgabe_nach_tagen;
  return aufgaben
    .filter((a) => !a.erledigt && tageZwischen(a.faelligAm, regeln.stichtag) >= grenze)
    .map((a) => ({
      aufgabe: a.id,
      nummer: a.nummer,
      betreff: a.betreff,
      verantwortlich: a.verantwortlich,
      faelligAm: a.faelligAm,
      tageUeberfaellig: tageZwischen(a.faelligAm, regeln.stichtag),
      anEmpfaenger: TEST_LEITUNG,
      datei: `postausgang_test/eskalation_${a.id}.txt`,
    }));
}

export function fuehreLaufAus(
  regeln: Regeln,
  vorher: Bestand,
  nachher: Bestand,
  aufgaben: Aufgabe[],
  kontrollen: Kontrolle[] = KONTROLLEN,
): Lauf {
  const { vorgaenge, protokoll } = bereiteVor(regeln, vorher, kontrollen);
  const { nachpruefungen, postausgang } = nachpruefen(regeln, vorgaenge, vorher, nachher, kontrollen);
  const eskalationen = eskaliereAufgaben(regeln, aufgaben);

  const zaehle = (w: Warteschlange) => vorgaenge.filter((v) => v.warteschlange === w).length;
  const offeneRechnungen = vorher.rechnungen.filter(
    (r) => (vorher.zahlungen.get(r.nummer)?.offenerBetrag ?? 0) > 0,
  ).length;
  const angehalten = vorgaenge.filter((v) => v.warteschlange !== 'zur_freigabe');
  const verfallen = nachpruefungen.filter((n) => n.freigabeVerfallen);

  const zusammenfassung = [
    `Mahnlauf ${datumDe(regeln.stichtag)}: ${vorgaenge.length} Entwürfe aus ${vorher.rechnungen.length} Rechnungen, Quelle ${vorher.quelle.version}.`,
    `${zaehle('zur_freigabe')} zur Freigabe, ${zaehle('klaerung')} zur Klärung, ${zaehle('daten_pruefen')} mit Datenfrage, ${zaehle('erledigt')} ohne Mahnung erledigt.`,
    `${kontrollen.length} Kontrollen je Entwurf, ${protokoll.length} Kontrollen insgesamt ausgeführt.`,
    ...angehalten.map(
      (v) =>
        `Angehalten: ${v.entwurf.nummer}, ${v.entwurf.stufe.name}, ${euro(v.entwurf.briefbetrag)}, ${WARTESCHLANGEN[v.warteschlange]}, Grund ${v.grund}.`,
    ),
    `Nachprüfung auf Quelle ${nachher.quelle.version}: ${nachpruefungen.length} freigegebene Entwürfe erneut geprüft, ${verfallen.length} Freigabe verfallen, ${postausgang.length} im Test-Postausgang.`,
    ...verfallen.map((n) => `Freigabe verfallen: ${n.nummer}, ${n.ereignis}, nichts abgelegt.`),
    ...eskalationen.map(
      (e) =>
        `Eskaliert: Aufgabe ${e.aufgabe} zu ${e.nummer} liegt seit ${e.tageUeberfaellig} Tagen bei ${e.verantwortlich}.`,
    ),
  ];

  return {
    beispieldaten: true,
    hinweis:
      'Fiktive Beispieldaten. Keine Verbindung zu einem echten System. Kein Versand: der Postausgang ist ein Ordner in diesem Repository.',
    stichtag: regeln.stichtag,
    erzeugtVon: 'npm run lauf, ohne Netzzugriff und ohne Modellaufruf',
    quelle: nachher.quelle,
    zahlen: {
      rechnungen: vorher.rechnungen.length,
      offeneRechnungen,
      entwuerfe: vorgaenge.length,
      zurFreigabe: zaehle('zur_freigabe'),
      klaerung: zaehle('klaerung'),
      datenPruefen: zaehle('daten_pruefen'),
      erledigt: zaehle('erledigt'),
      eskaliert: vorgaenge.filter((v) => v.eskaliert).length,
      kontrollenAusgefuehrt: protokoll.length,
      imPostausgang: postausgang.length,
      eskalationen: eskalationen.length,
    },
    vorgaenge,
    nachpruefungen,
    postausgang,
    eskalationen,
    ueberwachung: {
      letzteQuelleGelesenAm: nachher.quelle.gelesenAm,
      quelleVollstaendig: quelleVollstaendig(nachher.quelle),
      belegeErwartet: nachher.quelle.erwartet,
      belegeUebernommen: nachher.quelle.uebernommen,
      aufgabenOhneVerantwortliche: vorgaenge.filter((v) => !v.verantwortlich).length,
      ueberfaelligeAufgaben: eskalationen.length,
      naechsteErwarteteAusfuehrung: `täglich um ${regeln.eskalation.zusammenfassung_um} an ${regeln.eskalation.zusammenfassung_an}`,
    },
    protokoll,
    zusammenfassung,
  };
}

function entwurfKopf(vorgang: Vorgang): string {
  const gefallen = durchgefallen(vorgang.befunde);
  const ergebnis =
    vorgang.warteschlange === 'zur_freigabe'
      ? 'Alle Kontrollen bestanden, liegt einem Menschen zur Freigabe vor'
      : `ANGEHALTEN durch die Kontrolle ${gefallen[0]!.titel}, Warteschlange ${WARTESCHLANGEN[vorgang.warteschlange]}`;
  return [
    '# ENTWURF, NICHT VERSENDET. Fiktiver Absender, fiktiver Empfänger, erfundene Beträge.',
    `# Vorgang    ${vorgang.entwurf.nummer}, ${vorgang.entwurf.leistung}`,
    `# Stufe      ${vorgang.entwurf.stufe.name}`,
    `# Kontrollen ${vorgang.befunde.filter((b) => b.bestanden).length} von ${vorgang.befunde.length} bestanden`,
    `# Ergebnis   ${ergebnis}`,
    '# Erzeugt    npm run lauf, ohne Modellaufruf',
    `# ${'-'.repeat(72)}`,
    '',
  ].join('\n');
}

function leere(ordner: string, wurzel: URL): void {
  const pfad = fileURLToPath(new URL(`${ordner}/`, wurzel));
  mkdirSync(pfad, { recursive: true });
  for (const datei of readdirSync(pfad)) {
    if (datei.endsWith('.txt')) rmSync(fileURLToPath(new URL(`${ordner}/${datei}`, wurzel)));
  }
}

export function schreibeLauf(lauf: Lauf): void {
  const wurzel = new URL('../', import.meta.url);
  leere('entwuerfe', wurzel);
  leere('postausgang_test', wurzel);
  mkdirSync(fileURLToPath(new URL('out/', wurzel)), { recursive: true });

  const nachIndex = new Map(lauf.nachpruefungen.map((n) => [n.nummer, n]));

  for (const vorgang of lauf.vorgaenge) {
    writeFileSync(
      fileURLToPath(new URL(vorgang.entwurf.briefDatei, wurzel)),
      `${entwurfKopf(vorgang)}${vorgang.entwurf.brief}\n`,
      'utf8',
    );
  }

  for (const satz of lauf.postausgang) {
    const vorgang = lauf.vorgaenge.find((v) => v.entwurf.nummer === satz.nummer)!;
    const nach = nachIndex.get(satz.nummer)!;
    const kopf = [
      '# TEST-POSTAUSGANG. Dieser Ordner ist der einzige Empfänger: es geht nichts nach draussen.',
      `# Vorgang      ${satz.nummer}, ${satz.stufe}`,
      `# Freigabe     Mensch, Fassung ${satz.fassung}`,
      `# Nachprüfung  ${nach.befundeNachher.length} von ${nach.befundeNachher.length} Kontrollen auf Quelle ${nach.quelleNachher} bestanden`,
      `# Abgelegt     ${satz.abgelegtAm}`,
      `# ${'-'.repeat(72)}`,
      '',
    ].join('\n');
    writeFileSync(
      fileURLToPath(new URL(satz.datei, wurzel)),
      `${kopf}${vorgang.entwurf.brief}\n`,
      'utf8',
    );
  }

  for (const e of lauf.eskalationen) {
    const text = [
      '# TEST-ESKALATION. Interne Nachricht, fiktive Daten, kein Versand nach draussen.',
      `# An           ${e.anEmpfaenger}`,
      `# ${'-'.repeat(72)}`,
      '',
      `Aufgabe ${e.aufgabe} zum Vorgang ${e.nummer} ist seit dem ${datumDe(e.faelligAm)} offen,`,
      `das sind ${e.tageUeberfaellig} Tage. Zuständig: ${e.verantwortlich}.`,
      '',
      `Betreff: ${e.betreff}`,
      '',
      'Diese Nachricht entsteht, weil die Aufgabe liegen geblieben ist, nicht weil',
      'jemand daran gedacht hat.',
    ].join('\n');
    writeFileSync(fileURLToPath(new URL(e.datei, wurzel)), `${text}\n`, 'utf8');
  }

  writeFileSync(
    fileURLToPath(new URL('out/lauf.json', wurzel)),
    `${JSON.stringify(lauf, null, 2)}\n`,
    'utf8',
  );
}

export function ladeAufgaben(): Aufgabe[] {
  const pfad = fileURLToPath(new URL('../daten/aufgaben.json', import.meta.url));
  return (JSON.parse(readFileSync(pfad, 'utf8')) as { aufgaben: Aufgabe[] }).aufgaben;
}

export function main(): void {
  // --json  gibt den ganzen Lauf auf stdout aus, damit n8n ihn weiterreichen kann.
  // --fehler-test bricht absichtlich ab, um die Fehlerbehandlung in n8n zu pruefen.
  const alsJson = process.argv.includes('--json');
  if (process.argv.includes('--fehler-test')) {
    console.error('Absichtlicher Abbruch: Quelle nicht erreichbar (Test der Fehlerbehandlung).');
    process.exit(2);
  }
  const regeln = ladeRegeln();
  const vorher = ladeBestand('quelle_v1');
  const nachher = ladeBestand('quelle_v2');
  const aufgaben = ladeAufgaben();
  const lauf = fuehreLaufAus(regeln, vorher, nachher, aufgaben);
  schreibeLauf(lauf);
  if (alsJson) {
    console.log(JSON.stringify(lauf));
    return;
  }
  for (const zeile of lauf.zusammenfassung) console.log(zeile);
  console.log(
    `\n${lauf.vorgaenge.length} Entwuerfe in entwuerfe/, ${lauf.postausgang.length} Schreiben und ${lauf.eskalationen.length} Eskalationen in postausgang_test/, vollstaendiger Lauf in out/lauf.json.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
