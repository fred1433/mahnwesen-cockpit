import { cent, datumDe, euro, plusTage } from './format.ts';
import { tageUeberfaellig } from './faellig.ts';
import type { Entwurf, Kunde, Mahnschritt, Rechnung, Regeln, StufenRegel } from './typen.ts';

/**
 * Absender und Empfänger dieser Entwürfe sind erfunden.
 *
 * Die Texte sind Vorlagen, von Hand geschrieben, die beim Lauf mit den Daten
 * des Vorgangs gefüllt werden. Es wird kein Sprachmodell aufgerufen, weder
 * hier noch auf der Webseite: eine Standarderinnerung setzt sich deterministisch
 * zusammen, dafür braucht es kein Modell. Wer im Betrieb einen Agenten die
 * Entwürfe schreiben lässt, ändert nur diese Stelle. Die Kontrollen dahinter
 * bleiben dieselben.
 *
 * Was diese Vorlagen NICHT tun: eine Gebühr berechnen, einen Zins berechnen,
 * eine Frist setzen, einen Rechtsstand behaupten. Der Betrag kommt aus der
 * Quelle, der Rest ist eine Bitte.
 */
export const ABSENDER = {
  name: 'Musterbetrieb Heizung und Sanitär GmbH',
  strasse: 'Beispielweg 4',
  ort: '82000 Musterort',
  abteilung: 'Buchhaltung',
};

const BREITE = 72;

/** Absatzweiser Umbruch, damit die Entwürfe wie gesetzt aussehen. */
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
  const treffer = schritte
    .filter((s) => s.stufe === stufe)
    .sort((a, b) => a.versendetAm.localeCompare(b.versendetAm));
  const letzter = treffer.at(-1);
  return letzter ? datumDe(letzter.versendetAm) : null;
}

function stufenName(regeln: Regeln, schluessel: string): string {
  return regeln.stufen.find((s) => s.schluessel === schluessel)?.name ?? schluessel;
}

/** Die Fassung eines Entwurfs: an welcher Quellfassung er hängt. */
export function fassungVon(quellfassung: string): string {
  return quellfassung;
}

/**
 * Baut den Entwurf samt Text. Der Text nennt den Betrag aus der Rechnungsliste;
 * ob dieser Betrag noch stimmt, entscheidet nicht der Text, sondern die
 * Kontrolle unmittelbar vor dem Versand.
 */
export function baueEntwurf(
  rechnung: Rechnung,
  kunde: Kunde,
  stufe: StufenRegel,
  schritte: Mahnschritt[],
  stichtag: string,
  regeln: Regeln,
  quellfassung: string,
): Entwurf {
  const briefbetrag = cent(rechnung.offenLautRechnungsliste);
  const wiedervorlageAm = plusTage(stichtag, stufe.wiedervorlage_in_tagen);
  const tage = tageUeberfaellig(rechnung, stichtag);
  const leistung = `${rechnung.leistung}, Vorgang ${rechnung.projekt}`;
  const privat = kunde.art === 'privat';

  let brief: string;

  if (stufe.schluessel === 'erinnerung') {
    const absatz = [
      `zu unserer Rechnung ${rechnung.nummer} vom ${datumDe(rechnung.rechnungsdatum)} über ${euro(briefbetrag)} (${leistung}) ist bei uns bis heute kein Zahlungseingang verbucht. Fällig war der Betrag am ${datumDe(rechnung.faelligkeit)}.`,
      privat
        ? 'Vermutlich ist die Rechnung im Alltag untergegangen. Wir bitten Sie um Ausgleich des offenen Betrags.'
        : 'Erfahrungsgemäß hängt das am Rechnungslauf und nicht an unserer Arbeit. Wir bitten Sie um Ausgleich des offenen Betrags.',
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
      'Wir bitten Sie um Ausgleich des offenen Betrags.',
      'Falls es einen Grund für die Verzögerung gibt, melden Sie sich bitte bei uns. Eine Ratenzahlung lässt sich in den meisten Fällen vereinbaren.',
    ].join('\n\n');
    brief = [
      kopf(kunde, stichtag, `1. Mahnung zur Rechnung ${rechnung.nummer}`),
      '',
      anredezeile(kunde),
      '',
      umbruch(absatz),
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
      'Wir bitten Sie um Ausgleich des offenen Betrags.',
      'Hören wir nichts von Ihnen, legen wir den Vorgang unserer Geschäftsführung vor. Ein Anruf genügt, wenn Sie das vermeiden möchten.',
    ].join('\n\n');
    brief = [
      kopf(kunde, stichtag, `2. Mahnung zur Rechnung ${rechnung.nummer}`),
      '',
      anredezeile(kunde),
      '',
      umbruch(absatz),
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
        'Über das weitere Vorgehen entscheidet die Geschäftsführung, einschließlich der Frage, ob dafür jemand Fachkundiges hinzugezogen wird. Diese Notiz bereitet die Akte vor, sie verschickt nichts und sie beauftragt niemanden.',
      ),
    ].join('\n');
  }

  return {
    nummer: rechnung.nummer,
    fassung: fassungVon(quellfassung),
    kundeId: kunde.id,
    kundeName: kunde.name,
    projekt: rechnung.projekt,
    leistung: rechnung.leistung,
    stufe,
    tageUeberfaellig: tage,
    briefbetrag,
    wiedervorlageAm,
    brief,
    briefDatei: `entwuerfe/${rechnung.nummer}_${stufe.schluessel}.txt`,
  };
}
