/**
 * Datentypen des Mahnlaufs.
 *
 * Die Felder der Quelle sind bewusst an das öffentlich dokumentierte
 * Datenmodell von Lexware Office angelehnt: GET /v1/payments/{voucherId}
 * liefert unter anderem openAmount, voucherStatus und paymentItems.
 * Quelle: https://developers.lexware.io/docs/
 *
 * Reklamation, Kulanzliste und kaufmännische Freigabe sind KEINE Felder von
 * Lexware Office. Woher sie kämen, steht in der Herkunftstabelle des README.
 */

export type Kanal = 'email' | 'brief' | 'keiner';
export type Anrede = 'familie' | 'herr' | 'frau' | 'firma';

export interface StufenRegel {
  schluessel: string;
  name: string;
  ab_tagen_nach_faelligkeit: number;
  /** Interne Wiedervorlage. Kein Datum, das einem Kunden gesetzt wird. */
  wiedervorlage_in_tagen: number;
  kanal: Kanal;
}

export interface Regeln {
  stichtag: string;
  pruefzeitpunkt: string;
  waehrung: string;
  stufen: StufenRegel[];
  sperren: {
    mindestbetrag: number;
    wartezeit_zwischen_stufen_tage: number;
    toleranz_betrag: number;
    reklamation_stoppt: boolean;
    reihenfolge_erzwingen: boolean;
    kulanzliste: string[];
    quelle_hoechstalter_stunden: number;
  };
  eskalation: {
    an_geschaeftsfuehrung_ab_tagen: number;
    offene_aufgabe_nach_tagen: number;
    zusammenfassung_um: string;
    zusammenfassung_an: string;
  };
  entwurf: {
    gesperrte_woerter: string[];
    erlaubte_bankverbindung: string;
  };
}

export interface Kunde {
  id: string;
  name: string;
  anrede: Anrede;
  art: 'privat' | 'gewerblich';
  email: string | null;
  strasse: string | null;
  ort: string | null;
}

/** Eine Rechnung, so wie sie in der Rechnungsliste steht. */
export interface Rechnung {
  nummer: string;
  kundeId: string;
  leistung: string;
  projekt: string;
  rechnungsdatum: string;
  faelligkeit: string;
  betrag: number;
  /** Offener Betrag laut Rechnungsliste. Kann veraltet sein. */
  offenLautRechnungsliste: number;
}

/**
 * Der Zahlungsstand aus der Buchhaltungsquelle. Er wird unmittelbar vor dem
 * Versand noch einmal gelesen, denn er ist der maßgebliche Stand.
 * `belegstatus` bildet voucherStatus ab: ein offener Betrag von null kann auch
 * eine stornierte Rechnung sein und nicht nur eine bezahlte.
 */
export interface Zahlungsstand {
  nummer: string;
  offenerBetrag: number;
  waehrung: string;
  belegstatus: 'offen' | 'teilweise' | 'bezahlt' | 'storniert';
  bezahltAm: string | null;
  eingaenge: { datum: string; betrag: number; art: string }[];
}

/** Stand einer Quellabfrage: wann zuletzt gelesen, wie vollständig. */
export interface Quellstand {
  version: string;
  gelesenAm: string;
  /** Wie viele Belege die Quelle angekündigt hat. */
  erwartet: number;
  /** Wie viele tatsächlich übernommen wurden. */
  uebernommen: number;
  hinweis: string;
}

export interface Reklamation {
  id: string;
  projekt: string;
  kundeId: string;
  eroeffnet: string;
  status: 'offen' | 'geschlossen';
  betreff: string;
}

export interface Mahnschritt {
  nummer: string;
  stufe: string;
  versendetAm: string;
  kanal: Kanal;
}

/**
 * Eine Freigabe, die ein Mensch erteilt hat. Sie gilt für eine bestimmte
 * Fassung des Entwurfs: ändert sich die Quelle danach, verfällt sie.
 */
export interface Freigabe {
  nummer: string;
  fassung: string;
  freigegebenVon: string;
  freigegebenAm: string;
}

/**
 * Die strukturierte Ausgabe des Entwurfsagenten. In dieser Demonstration sind
 * es eingefrorene Beispielausgaben aus daten/agentenausgaben.json, kein
 * Modellaufruf. Sie werden genauso geprüft, wie eine echte Ausgabe geprüft
 * würde: Betrag, Empfänger, Bankverbindung und Wortlaut gegen die Quelle.
 */
export interface Agentenausgabe {
  nummer: string;
  betreff: string;
  betragBehauptet: number;
  empfaengerBehauptet: string;
  bankverbindung: string;
  freitext: string;
}

export interface Entwurf {
  nummer: string;
  fassung: string;
  kundeId: string;
  kundeName: string;
  projekt: string;
  leistung: string;
  stufe: StufenRegel;
  tageUeberfaellig: number;
  /** Betrag, mit dem der Entwurf geschrieben wurde: Stand Rechnungsliste. */
  briefbetrag: number;
  /** Interne Wiedervorlage, kein Datum an den Kunden. */
  wiedervorlageAm: string;
  brief: string;
  briefDatei: string;
}

export interface Befund {
  kontrolle: string;
  titel: string;
  bestanden: boolean;
  text: string;
}

/**
 * Vier Warteschlangen. Ein angehaltener Vorgang ist kein Brief, den man
 * trotzdem freigeben kann: nach der Korrektur läuft er erneut durch alle
 * Kontrollen.
 */
export type Warteschlange = 'erledigt' | 'klaerung' | 'daten_pruefen' | 'zur_freigabe';

export interface Vorgang {
  entwurf: Entwurf;
  befunde: Befund[];
  warteschlange: Warteschlange;
  grund: string;
  eskaliert: boolean;
  naechsteAktion: string;
  verantwortlich: string;
  faelligAm: string;
}

export interface Protokollzeile {
  schritt: number;
  nummer: string;
  stufe: string;
  kontrolle: string;
  titel: string;
  bestanden: boolean;
  text: string;
}

/** Eine interne Aufgabe aus einem früheren Lauf. */
export interface Aufgabe {
  id: string;
  nummer: string;
  betreff: string;
  verantwortlich: string;
  faelligAm: string;
  erledigt: boolean;
}

/** Eine tatsächlich erzeugte Eskalation, mit Empfänger und Spur. */
export interface Eskalationssatz {
  aufgabe: string;
  nummer: string;
  betreff: string;
  verantwortlich: string;
  faelligAm: string;
  tageUeberfaellig: number;
  anEmpfaenger: string;
  datei: string;
}

/** Was tatsächlich in den Test-Postausgang gelegt wurde. */
export interface Versandsatz {
  nummer: string;
  fassung: string;
  stufe: string;
  kanal: Kanal;
  anEmpfaenger: string;
  abgelegtAm: string;
  datei: string;
}

/** Die Nachprüfung unmittelbar vor dem Versand, auf der neuen Quellfassung. */
export interface Nachpruefung {
  nummer: string;
  fassung: string;
  quelleVorher: string;
  quelleNachher: string;
  ereignis: string;
  befundeVorher: Befund[];
  befundeNachher: Befund[];
  freigabeVerfallen: boolean;
  inPostausgang: boolean;
  warteschlangeNachher: Warteschlange;
  begruendung: string;
}

/** Was NICHT läuft, ist genauso zu sehen wie was läuft. */
export interface Ueberwachung {
  letzteQuelleGelesenAm: string;
  quelleVollstaendig: boolean;
  belegeErwartet: number;
  belegeUebernommen: number;
  aufgabenOhneVerantwortliche: number;
  ueberfaelligeAufgaben: number;
  naechsteErwarteteAusfuehrung: string;
}

export interface Lauf {
  beispieldaten: true;
  hinweis: string;
  stichtag: string;
  erzeugtVon: string;
  quelle: Quellstand;
  zahlen: {
    rechnungen: number;
    offeneRechnungen: number;
    entwuerfe: number;
    zurFreigabe: number;
    klaerung: number;
    datenPruefen: number;
    erledigt: number;
    eskaliert: number;
    kontrollenAusgefuehrt: number;
    imPostausgang: number;
    eskalationen: number;
  };
  vorgaenge: Vorgang[];
  nachpruefungen: Nachpruefung[];
  postausgang: Versandsatz[];
  eskalationen: Eskalationssatz[];
  ueberwachung: Ueberwachung;
  protokoll: Protokollzeile[];
  zusammenfassung: string[];
}
