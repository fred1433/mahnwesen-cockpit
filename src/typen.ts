/**
 * Datentypen des Mahnlaufs.
 *
 * Die Felder der Zahlungsseite sind bewusst an das öffentlich dokumentierte
 * Datenmodell von Lexware Office angelehnt (payments: openAmount, currency,
 * paymentStatus, paidDate; voucherlist: voucherStatus, dueDate, openAmount).
 * Quelle: https://developers.lexware.io/docs/
 */

export type Kanal = 'email' | 'brief' | 'keiner';
export type Freigabeart = 'automatisch_nach_pruefung' | 'mensch';
export type Anrede = 'familie' | 'herr' | 'frau' | 'firma';

export interface StufenRegel {
  schluessel: string;
  name: string;
  ab_tagen_nach_faelligkeit: number;
  gebuehr: number;
  zahlbar_in_tagen: number;
  kanal: Kanal;
  freigabe: Freigabeart;
}

export interface Regeln {
  stichtag: string;
  waehrung: string;
  stufen: StufenRegel[];
  sperren: {
    mindestbetrag: number;
    wartezeit_zwischen_stufen_tage: number;
    toleranz_betrag: number;
    reklamation_stoppt: boolean;
    reihenfolge_erzwingen: boolean;
    kulanzliste: string[];
  };
  eskalation: {
    an_geschaeftsfuehrung_ab_tagen: number;
    zusammenfassung_um: string;
    zusammenfassung_an: string;
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

/** Der Zahlungsstand, zweite Quelle, wird unmittelbar vor dem Versand gelesen. */
export interface Zahlungsstand {
  nummer: string;
  offenerBetrag: number;
  waehrung: string;
  zahlungsstatus: 'offen' | 'teilweise' | 'ausgeglichen';
  bezahltAm: string | null;
  eingaenge: { datum: string; betrag: number; art: string }[];
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

export interface Entwurf {
  nummer: string;
  kundeId: string;
  kundeName: string;
  projekt: string;
  leistung: string;
  stufe: StufenRegel;
  tageUeberfaellig: number;
  /** Betrag, mit dem der Brief geschrieben wurde: Stand Rechnungsliste. */
  briefbetrag: number;
  gebuehr: number;
  zuZahlen: number;
  zahlbarBis: string;
  brief: string;
  briefDatei: string;
}

export interface Befund {
  kontrolle: string;
  titel: string;
  bestanden: boolean;
  text: string;
}

export type Ergebnis = 'freigegeben' | 'zur_freigabe' | 'gestoppt';

export interface Vorgang {
  entwurf: Entwurf;
  befunde: Befund[];
  ergebnis: Ergebnis;
  grund: string;
  eskaliert: boolean;
  naechsterSchritt: string;
  zustaendig: string;
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

export interface Lauf {
  beispieldaten: true;
  stichtag: string;
  erzeugtVon: string;
  zahlen: {
    rechnungen: number;
    offeneRechnungen: number;
    entwuerfe: number;
    freigegeben: number;
    zurFreigabe: number;
    gestoppt: number;
    eskaliert: number;
    kontrollenAusgefuehrt: number;
  };
  vorgaenge: Vorgang[];
  protokoll: Protokollzeile[];
  zusammenfassung: string[];
}
