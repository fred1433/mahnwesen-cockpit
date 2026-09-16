import { betragDe, cent, datumDe, euro, plusTage } from './format.ts';
import { tageUeberfaellig } from './faellig.ts';
import type { Entwurf, Kunde, Mahnschritt, Rechnung, Regeln, StufenRegel } from './typen.ts';

/**
 * Absender und Empfänger dieser Briefe sind erfunden. Die Texte sind von Hand
 * geschrieben und werden beim Lauf nur mit den Daten des Vorgangs gefüllt.
 * Es wird kein Sprachmodell aufgerufen, weder hier noch auf der Webseite.
 */
export const ABSENDER = {
  name: 'Musterbetrieb Heizung und Sanitär GmbH',
  strasse: 'Beispielweg 4',
  ort: '82000 Musterort',
  abteilung: 'Buchhaltung',
};

const BREITE = 72;

/** Absatzweiser Umbruch, damit die Briefe wie gesetzt aussehen. */
export function umbruch(text: string, breite = BREITE): string {
  return text
    .split('\n\n')
    .map((absatz) => {
      const zeilen: string[] = [];
      let zeile = '';
      for (const wort of absatz.split(/\s+/).filter(Boolean)) {
        if (zeile === '') zeile = wort;
        else if (`${zeile} ${wort}`.length <= breite) zeile = `${zeile} ${wort}`;
        else {
          zeilen.push(zeile);
          zeile = wort;
        }
      }
      if (zeile) zeilen.push(zeile);
      return zeilen.join('\n');
    })
    .join('\n\n');
}

export function anredezeile(kunde: Kunde): string {
  switch (kunde.anrede) {
    case 'familie':
      return `Sehr geehrte ${kunde.name},`;
    case 'herr':
      return `Sehr geehrter ${kunde.name},`;
    case 'frau':
      return `Sehr geehrte ${kunde.name},`;
    default:
      return 'Sehr geehrte Damen und Herren,';
  }
}

function tabelle(zeilen: [string, number][]): string {
  const breiteBezeichnung = Math.max(...zeilen.map(([b]) => b.length));
  const breiteBetrag = Math.max(...zeilen.map(([, w]) => betragDe(w).length));
  return zeilen
    .map(
      ([bezeichnung, wert]) =>
        `  ${bezeichnung.padEnd(breiteBezeichnung + 4)}${betragDe(wert).padStart(breiteBetrag)} EUR`,
    )
    .join('\n');
}

function kopf(kunde: Kunde, stichtag: string, betreff: string): string {
  const empfaenger = [kunde.name, kunde.strasse ?? '(keine Anschrift hinterlegt)', kunde.ort].filter(
    (z): z is string => typeof z === 'string' && z.length > 0,
  );
  return [
    ABSENDER.name,
    `${ABSENDER.strasse} · ${ABSENDER.ort}`,
    '',
    '',
    ...empfaenger,
    '',
    '',
    `Musterort, ${datumDe(stichtag)}`,
    '',
    betreff,
  ].join('\n');
}

function fuss(): string {
  return ['Mit freundlichen Grüßen', '', ABSENDER.name, ABSENDER.abteilung].join('\n');
}

function schrittDatum(schritte: Mahnschritt[], stufe: string): string | null {
  const treffer = schritte.filter((s) => s.stufe === stufe).sort((a, b) => a.versendetAm.localeCompare(b.versendetAm));
  const letzter = treffer.at(-1);
  return letzter ? datumDe(letzter.versendetAm) : null;
}

function stufenName(regeln: Regeln, schluessel: string): string {
  return regeln.stufen.find((s) => s.schluessel === schluessel)?.name ?? schluessel;
}

/** Baut den Entwurf samt Brieftext. Der Brief nennt den Stand der Rechnungsliste. */
export function baueEntwurf(
  rechnung: Rechnung,
  kunde: Kunde,
  stufe: StufenRegel,
  schritte: Mahnschritt[],
  stichtag: string,
  regeln: Regeln,
): Entwurf {
  const briefbetrag = cent(rechnung.offenLautRechnungsliste);
  const gebuehr = cent(stufe.gebuehr);
  const zuZahlen = cent(briefbetrag + gebuehr);
  const zahlbarBis = plusTage(stichtag, stufe.zahlbar_in_tagen);
  const tage = tageUeberfaellig(rechnung, stichtag);
  const leistung = `${rechnung.leistung}, Vorgang ${rechnung.projekt}`;
  const privat = kunde.art === 'privat';

  let brief: string;

  if (stufe.schluessel === 'erinnerung') {
    const absatz = [
      `zu unserer Rechnung ${rechnung.nummer} vom ${datumDe(rechnung.rechnungsdatum)} über ${euro(briefbetrag)} (${leistung}) ist bei uns bis heute kein Zahlungseingang verbucht. Fällig war der Betrag am ${datumDe(rechnung.faelligkeit)}.`,
      privat
        ? `Vermutlich ist die Rechnung im Alltag untergegangen. Wir bitten Sie, den offenen Betrag bis zum ${datumDe(zahlbarBis)} zu überweisen.`
        : `Erfahrungsgemäß hängt das am Rechnungslauf und nicht an unserer Arbeit. Wir bitten Sie, den offenen Betrag bis zum ${datumDe(zahlbarBis)} anzuweisen.`,
      'Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es bitte als gegenstandslos.',
      'Wenn an der Rechnung oder an unserer Arbeit etwas nicht stimmt, rufen Sie uns an. Das klären wir am Telefon schneller als auf dem Postweg.',
    ].join('\n\n');
    brief = [
      kopf(kunde, stichtag, `Zahlungserinnerung zur Rechnung ${rechnung.nummer}`),
      '',
      anredezeile(kunde),
      '',
      umbruch(absatz),
      '',
      fuss(),
    ].join('\n');
  } else if (stufe.schluessel === 'mahnung_1') {
    const erinnerung = schrittDatum(schritte, 'erinnerung');
    const absatz = [
      `${erinnerung ? `unsere Zahlungserinnerung vom ${erinnerung} zur` : 'unsere'} Rechnung ${rechnung.nummer} vom ${datumDe(rechnung.rechnungsdatum)} ist ohne Zahlungseingang geblieben. Die Rechnung über ${euro(briefbetrag)} (${leistung}) war am ${datumDe(rechnung.faelligkeit)} fällig, das sind inzwischen ${tage} Tage.`,
      `Wir bitten Sie, den offenen Betrag bis zum ${datumDe(zahlbarBis)} auszugleichen. Für den zusätzlichen Aufwand berechnen wir nach unseren Zahlungsbedingungen eine Mahngebühr von ${euro(gebuehr)}.`,
    ].join('\n\n');
    const schluss =
      'Falls es einen Grund für die Verzögerung gibt, melden Sie sich bitte bei uns. Eine Ratenzahlung lässt sich in den meisten Fällen vereinbaren.';
    brief = [
      kopf(kunde, stichtag, `1. Mahnung zur Rechnung ${rechnung.nummer}`),
      '',
      anredezeile(kunde),
      '',
      umbruch(absatz),
      '',
      tabelle([
        ['Offener Rechnungsbetrag', briefbetrag],
        ['Mahngebühr', gebuehr],
        ['Zu zahlen', zuZahlen],
      ]),
      '',
      umbruch(schluss),
      '',
      fuss(),
    ].join('\n');
  } else if (stufe.schluessel === 'mahnung_2') {
    const erinnerung = schrittDatum(schritte, 'erinnerung');
    const mahnung1 = schrittDatum(schritte, 'mahnung_1');
    const verlauf = [
      erinnerung ? `am ${erinnerung} eine Zahlungserinnerung` : null,
      mahnung1 ? `am ${mahnung1} eine erste Mahnung` : null,
    ]
      .filter(Boolean)
      .join(' und ');
    const absatz = [
      `zur Rechnung ${rechnung.nummer} vom ${datumDe(rechnung.rechnungsdatum)} über ${euro(briefbetrag)} (${leistung}) haben wir Ihnen ${verlauf} geschickt. Ein Zahlungseingang ist bis heute nicht verbucht, die Rechnung ist seit ${tage} Tagen überfällig.`,
      `Wir bitten Sie, den offenen Betrag bis zum ${datumDe(zahlbarBis)} zu begleichen.`,
    ].join('\n\n');
    const schluss =
      'Sollten bis dahin weder eine Zahlung noch eine Rückmeldung von Ihnen vorliegen, geben wir den Vorgang zur weiteren Klärung an die Geschäftsführung. Ein Anruf genügt, wenn Sie das vermeiden möchten.';
    brief = [
      kopf(kunde, stichtag, `2. Mahnung zur Rechnung ${rechnung.nummer}`),
      '',
      anredezeile(kunde),
      '',
      umbruch(absatz),
      '',
      tabelle([
        ['Offener Rechnungsbetrag', briefbetrag],
        ['Mahngebühr', gebuehr],
        ['Zu zahlen', zuZahlen],
      ]),
      '',
      umbruch(schluss),
      '',
      fuss(),
    ].join('\n');
  } else {
    const verlauf = schritte
      .slice()
      .sort((a, b) => a.versendetAm.localeCompare(b.versendetAm))
      .map((s) => `${stufenName(regeln, s.stufe)} am ${datumDe(s.versendetAm)}`)
      .join(', ');
    brief = [
      'Interne Aktennotiz. Kein Schreiben an den Kunden.',
      '',
      `Vorgang            ${rechnung.nummer}, ${rechnung.leistung}`,
      `Kunde              ${kunde.name} (${kunde.id})`,
      `Bauvorhaben        ${rechnung.projekt}`,
      `Offener Betrag     ${euro(briefbetrag)}`,
      `Fällig seit        ${datumDe(rechnung.faelligkeit)} (${tage} Tage)`,
      `Historie           ${verlauf || 'nichts dokumentiert'}`,
      '',
      umbruch(
        'Über das weitere Vorgehen entscheidet die Geschäftsführung. Diese Notiz bereitet die Akte vor, sie verschickt nichts und sie beauftragt niemanden.',
      ),
    ].join('\n');
  }

  return {
    nummer: rechnung.nummer,
    kundeId: kunde.id,
    kundeName: kunde.name,
    projekt: rechnung.projekt,
    leistung: rechnung.leistung,
    stufe,
    tageUeberfaellig: tage,
    briefbetrag,
    gebuehr,
    zuZahlen,
    zahlbarBis,
    brief,
    briefDatei: `briefe/${rechnung.nummer}_${stufe.schluessel}.txt`,
  };
}
