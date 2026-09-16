# Mahnwesen-Cockpit

**Ein vorgeschlagener Mahnwesen-Prozess, in dem kein Schreiben hinausgeht, das nicht unmittelbar
vorher maschinell geprüft wurde.** n8n orchestriert, der Code in diesem Repository trägt die
Kontrollen, eine statische Seite zeigt das Ergebnis.

Ansicht des Laufs: <https://wimmer-mahnwesen.theaipipe.com>

> **Fiktive Beispieldaten. Keine Verbindung zu Ihren Systemen. Kein Versand.**
> Alle Kunden, Rechnungen, Beträge, Baustellen und Reklamationen sind erfunden. Absender und
> Empfänger sind ein fiktiver Betrieb und fiktive Kunden. Der "Postausgang" ist ein Ordner in
> diesem Repository.
>
> **Was das hier ist und was nicht.** Es ist die Demonstration eines VORGESCHLAGENEN Prozesses,
> aufgebaut aus öffentlich formulierten Anforderungen. Es ist nicht die Abbildung eines bestehenden
> Prozesses: welche Schritte ein Betrieb heute geht und wer sie verantwortet, ist zu bestätigen.
>
> **Keine Rechtsauskunft.** Dieser Prozess berechnet keine Mahngebühr, keinen Zins und keinen
> Verzugseintritt, und er behauptet keine Rechtsfolge. Die Tage in `regeln.yaml` steuern INTERNE
> Aufgaben: wann ein Vorgang wieder auf den Tisch kommt. Was ein Betrieb seinen Kunden gegenüber
> tut, entscheidet er mit seiner Steuerberatung oder seinem Anwalt.
>
> **Kein Modellaufruf.** Lauf, Entwürfe und Webseite kommen ohne Netzzugriff und ohne Sprachmodell
> aus. Die Vorlagen sind von Hand geschrieben: eine Standarderinnerung setzt sich deterministisch
> zusammen, dafür braucht es kein Modell. Wo ein Agent im Betrieb sinnvoll wäre, liegen hier
> **eingefrorene Beispielausgaben** in `daten/agentenausgaben.json`, und sie werden genauso geprüft,
> wie eine echte Modellausgabe geprüft würde.

## Der Kern: eine Zahlung kommt herein, nachdem alles schon freigegeben war

Das ist der Fall, an dem sich zeigt, ob eine Prüfung echt ist oder nur ein Haken.

| | |
|---|---|
| **Ausgangslage** | `RE-2026-0282`, 1.140,00 EUR offen laut Rechnungsliste, Quellfassung `quelle_v1` |
| **Entwurf** | 1. Mahnung vorbereitet, alle zehn Kontrollen bestanden, Warteschlange **Zur Freigabe** |
| **Freigabe** | von einem Menschen erteilt, `daten/freigaben.json`, gültig für die Fassung `quelle_v1` |
| **Ereignis** | in `quelle_v2` steht ein Zahlungseingang über 1.140,00 EUR vom 16.09.2026 |
| **Kontrolle** | die Nachprüfung liest die Quelle erneut, `ZAHLUNGSSTAND` schlägt an |
| **Wirkung** | die Freigabe verfällt, in `postausgang_test/` liegt **nichts** zu diesem Vorgang, er geht nach **Erledigt / Keine Mahnung** |

Nachzulesen in [`out/lauf.json`](out/lauf.json) unter `nachpruefungen`, geprüft in
[`tests/nachpruefung.test.ts`](tests/nachpruefung.test.ts). Der Gegenbeweis steht daneben: schaltet
man die Kontrolle `ZAHLUNGSSTAND` ab, landet genau dieser Vorgang im Postausgang, und
[`tests/neutralisierung.test.ts`](tests/neutralisierung.test.ts) wird rot.

## Der Prozess

```
Offene Posten prüfen  →  Entwurf vorbereiten  →  Freigabe oder Klärung  →  Nachverfolgen
                                                          │
                                                          └─ eigener Zweig: ob ein Vorgang
                                                             weitergegeben wird, entscheidet
                                                             ein Mensch, nicht dieser Prozess
```

Vier Warteschlangen, und keine davon ist ein Papierkorb:

| Warteschlange | Wofür | Wer |
|---|---|---|
| **Erledigt / Keine Mahnung** | Beleg ausgeglichen oder storniert, Betrag unter dem Mindestbetrag. Zu, ohne dass ein Mensch etwas bestätigen muss | niemand |
| **Klärung erforderlich** | offene Reklamation, Kulanzfall, Abstand zum letzten Schreiben. Mit Verantwortlichem, nächster Aktion und Wiedervorlage | Geschäftsführung |
| **Daten prüfen** | Quelle unvollständig oder widersprüchlich, fehlende Kontaktdaten, Lücke in der Historie, zurückgewiesene Agentenausgabe | Buchhaltung |
| **Zur Freigabe** | Entwurf hält allen Kontrollen stand, ein Mensch gibt frei | Buchhaltung |

Ein angehaltener Vorgang ist **kein Brief, den man trotzdem freigeben kann**: eine Freigabe auf
einem angehaltenen Vorgang lässt den Lauf abbrechen. Nach der Korrektur läuft der Vorgang erneut
durch alle Kontrollen.

## Die zehn Kontrollen

| Kontrolle | Frage | Hält an, wenn | Geht nach |
|---|---|---|---|
| `QUELLE` | Ist der Stand aus der Buchhaltung da und frisch genug? | Der Beleg fehlt im Import oder der Stand ist zu alt | Daten prüfen |
| `ZAHLUNGSSTAND` | Ausgeglichen oder storniert? | Die Quelle meldet null offen oder `storniert` | Erledigt |
| `BETRAGSABGLEICH` | Stimmt der Entwurfsbetrag mit der Quelle? | Eine Teilzahlung fehlt in der Rechnungsliste | Daten prüfen |
| `MINDESTBETRAG` | Lohnt der Betrag ein Schreiben? | Unter dem Mindestbetrag der Hausregeln | Erledigt |
| `REKLAMATION` | Läuft auf der Baustelle etwas Offenes? | Eine Reklamation zum selben Vorgang ist offen | Klärung |
| `KULANZLISTE` | Fall für den Schreibtisch? | Der Kunde steht auf der Kulanzliste | Klärung |
| `WARTEZEIT` | Genug Abstand zum letzten Schreiben? | Kürzer als die Wartezeit der Hausregeln | Klärung |
| `REIHENFOLGE` | Ist jeder Schritt davor dokumentiert? | In der Historie fehlt eine Vorstufe | Daten prüfen |
| `KONTAKTDATEN` | Kann der Kanal bedient werden? | Keine E-Mail für eine E-Mail-Stufe, keine Anschrift für einen Brief | Daten prüfen |
| `AGENTENAUSGABE` | Hält die Ausgabe des Entwurfsagenten dem Abgleich stand? | Betrag, Empfänger, Bankverbindung oder Wortlaut passen nicht | Daten prüfen |

Jede Kontrolle wird **zweimal** geprüft: an einem Fall, den sie anhalten muss, und an einem, den
sie durchlassen muss. Eine Sperre, die alles anhält, ist genauso kaputt wie eine, die nichts anhält.
Und jede Kontrolle wird **einzeln abgeschaltet**: ändert sich das Ergebnis des Laufs dadurch nicht,
trägt sie nichts und der Test wird rot ([`tests/neutralisierung.test.ts`](tests/neutralisierung.test.ts)).

Der Betrag, die Rechnungsnummer, der Empfänger und die Bankverbindung stammen immer aus der Quelle
oder aus den Stammdaten, nie aus einem Modelltext. `AGENTENAUSGABE` weist in diesem Lauf drei von
vier eingefrorenen Ausgaben zurück: einen erfundenen Betrag, eine fremde Bankverbindung und einen
Satz mit gesperrten Wörtern.

## Der Lauf vom 16.09.2026

| | |
|---|---|
| Rechnungen im Bestand | 42 |
| Belege, die die Quelle geliefert hat | 41 von 42 angekündigten |
| Entwürfe vorbereitet | 28 |
| Zur Freigabe | 15 |
| Klärung erforderlich | 3 |
| Daten prüfen | 7 |
| Erledigt / Keine Mahnung | 3 |
| Ausgeführte Kontrollen | 280 |
| Nach der Nachprüfung im Test-Postausgang | 2 |
| Verfallene Freigaben | 1 |
| Eskalierte interne Aufgaben | 1 |

Die Beispieldaten sind so gebaut, dass jede der zehn Kontrollen in diesem Lauf mindestens einmal
anschlägt. Die 42 Rechnungen sind kein Beweis für sich; sie zeigen einen Import über mehrere Seiten,
bei dem kein Vorgang verloren geht, auch der nicht, dessen Stand fehlt.

## n8n: orchestriert wirklich, nicht nur auf dem Papier

Die drei Workflows in [`n8n/`](n8n/) wurden auf einer lokalen n8n-Installation **importiert und
ausgeführt**, nicht von Hand gezeichnet. Die Spuren dieser Ausführungen liegen in
[`n8n/ausfuehrungen/`](n8n/ausfuehrungen/).

| Datei | Was drin ist |
|---|---|
| `mahnlauf.json` | Manueller Start, HTTP Request auf den Prüfcode, Code-Knoten zum Aufteilen, Switch in die vier Warteschlangen |
| `fehlerbehandlung.json` | Error Trigger, schreibt jeden Fehlschlag ins Protokoll |
| `mahnlauf_fehlerfall.json` | Bricht absichtlich ab, damit die Fehlerbehandlung nachweislich **von selbst** anspringt |
| `ausfuehrungen/mahnlauf_erfolg.json` | Spur des erfolgreichen Laufs: 28 Elemente, aufgeteilt in 15 / 3 / 7 / 3 |
| `ausfuehrungen/mahnlauf_fehlerfall.json` | Spur des Fehlschlags |
| `ausfuehrungen/fehlerprotokoll.txt` | Was die Fehlerbehandlung geschrieben hat, ohne dass jemand sie angestoßen hat |

Zwei Dinge, die beim Ausführen auf einer frischen Installation aufgefallen sind und die ein
Workflow, den niemand laufen lässt, nicht zeigt (gemessen an **n8n 2.39.6**):

1. **`n8n-nodes-base.executeCommand` ist in n8n 2.x standardmäßig abgeschaltet.** Die Voreinstellung
   von `NODES_EXCLUDE` enthält den Knoten; eine Ausführung endet mit `Unrecognized node type`.
   Deshalb ruft der Workflow den Prüfcode über **HTTP Request** auf, einen Knoten, der immer da ist.
2. **Ein Error Workflow muss aktiv sein.** Ist er es nicht, meldet n8n
   `Workflow ... is not active and cannot be executed` und der Fehler versandet. Nach dem Import
   also aktivieren, sonst ist die Fehlerbehandlung nur Dekoration.

Dazu: `$env` ist in Ausdrücken standardmäßig gesperrt (`access to env vars denied`), deshalb steht
die lokale Adresse direkt im Workflow. In den Exporten stehen **keine Zugangsdaten, keine
Auth-Header und keine Pfade**; die CI prüft das bei jedem Commit. Es gibt keinen proprietären Knoten
und keine Oberfläche zum Verwalten.

Der Prüfcode ist über einen kleinen Dienst erreichbar ([`src/dienst.ts`](src/dienst.ts), nur
`127.0.0.1`, ohne Zugangsdaten): `POST /lauf`, `GET /gesundheit`, `POST /fehlerprotokoll`,
`POST /fehler-test`.

```bash
npm ci
npm run dienst      # Terminal 1
npm run pruefen     # Terminal 2: Typen, Tests, Lauf

# n8n dazu
npx n8n import:workflow --separate --input=./n8n
npx n8n update:workflow --id=FEHLERBEHANDLUNG --active=true
npx n8n execute --id=MAHNLAUF
npx n8n execute --id=MAHNLAUFFEHLER   # muss fehlschlagen und ins Protokoll schreiben
```

`npm run lauf` schreibt `entwuerfe/`, `postausgang_test/` und `out/lauf.json` neu. Die CI führt
denselben Befehl aus und vergleicht das Ergebnis mit dem, was im Repository liegt: weicht ein
Zeichen ab, wird sie rot. Die abgelegten Dateien sind also nachweislich das, was der Code erzeugt.

## Woher jedes Feld käme

Nicht alles, was dieser Prozess braucht, steht in der Buchhaltung. Was fehlt, ist hier benannt
statt stillschweigend erfunden.

| Feld | Vermutete Quelle | Abgleich | Wenn es fehlt |
|---|---|---|---|
| offener Betrag, Belegstatus, Zahlungseingänge | Buchhaltung (`GET /v1/payments/{voucherId}`: `openAmount`, `voucherStatus`, `paymentItems`) | Belegnummer | Vorgang anhalten, **Daten prüfen**, nie "nichts zu tun" |
| Rechnungsliste, Fälligkeit | Buchhaltung oder Handwerkersystem, je nachdem wo fakturiert wird | Belegnummer | Vorgang anhalten |
| Kunde, Anschrift, E-Mail | Stammdaten des führenden Systems | Kundennummer | `KONTAKTDATEN` hält an |
| Baustelle, Vorgang, **Reklamation** | Handwerkersystem. **Kein Feld der Buchhaltungs-API** | Projektnummer | `REKLAMATION` kann nicht greifen: der Vorgang gehört dann in **Klärung**, nicht in den Versand |
| **Kulanzliste** | Kaufmännische Entscheidung, heute meist im Kopf. **In keinem System ein Feld** | Kundennummer | ohne Liste keine Sperre, deshalb steht sie in `regeln.yaml` |
| **Freigabe** | Der Mensch, der freigibt. Kein Feld einer API | Belegnummer plus Fassung | ohne Freigabe geht nichts in den Postausgang |
| Mahnhistorie | Handwerkersystem oder Buchhaltung, oft von Hand geführt | Belegnummer | `REIHENFOLGE` hält an |

Ein offener Betrag von null ist übrigens nicht immer eine Zahlung: er kann auch eine stornierte
Rechnung sein. Deshalb liest `ZAHLUNGSSTAND` den Belegstatus mit und sagt beides getrennt an.

## Anschluss an vorhandene Systeme

Was hier über fremde Software steht, stammt aus deren öffentlicher Dokumentation, mit URL. Was dort
nicht steht, steht hier auch nicht.

**Lexware Office**, <https://developers.lexware.io/docs/> und <https://help.lexware.de/>

- Der `payments`-Endpunkt „provides read access to the payment status of (bookkeeping or sales)
  vouchers, including invoices and credit notes“ und liefert unter anderem `openAmount`,
  `voucherStatus`, `paidDate`. Genau darauf zielt `ZAHLUNGSSTAND`: der maßgebliche Stand wird
  unmittelbar vor dem Versand gelesen, nicht der Stand von gestern Nacht.
- Der `voucherlist`-Endpunkt lässt sich nach `voucherType` und `voucherStatus` filtern.
- Es gibt Webhooks („Event Subscriptions“) mit den Ereignissen `payment.changed` und
  `invoice.status.changed`. Damit muss kein Lauf raten, ob inzwischen bezahlt wurde.
- Das Tempo ist dokumentiert begrenzt: „A client can make up to 2 requests per second to the Lexware
  API.“
- **Lexware Office mahnt bereits selbst**, und zwar mit zwei dokumentierten Einschränkungen
  ([Hilfeartikel 547985](https://help.lexware.de/de-form/articles/547985-zahlungserinnerungen-und-mahnungen-erstellen)):
  „Die Option **Mahnen** steht nur für Belege zur Verfügung, die direkt in Lexware Office erstellt
  wurden. Für importierte oder extern erstellte Belege ist diese Funktion nicht verfügbar.“ Und:
  „Lexware Office bietet derzeit keine automatische Funktion für den Versand von Mahnungen. Jede
  Mahnung muss manuell ausgelöst werden.“
  **Daraus folgt eine Frage, keine Diagnose**: Werden die Rechnungen im Handwerkersystem oder in der
  Buchhaltung erstellt, und wie kommen sie in die Buchhaltung? Der Vorschlag hier ist deshalb
  ausdrücklich, **Fakturierung und Buchhaltung zu lassen, wo sie sind**, und dazwischen den
  Abgleich, die Ausnahmen und die Überwachung zu bauen.

**HERO Software**, <https://hero-software.de/api-doku/graphql-guide>

- „Die HERO GraphQL API ermöglicht dir einen Vollzugriff auf dein Konto und alle Objekte, womit du
  Kundendaten, Projekte oder Dokumente einsehen, herunterladen, erstellen oder verändern kannst.“
- Endpunkt `https://login.hero-software.de/api/external/v7/graphql`, Authentifizierung über
  `Authorization: Bearer YOUR_API_KEY`, den Schlüssel gibt es laut Dokumentation über den Support.
- Dokumentierte Abfragen unter anderem `contacts`, `project_matches`, `customer_documents`,
  Mutationen unter anderem `create_contact`, `create_project_match`, `add_logbook_entry`. Für
  `REKLAMATION` ist `project_matches` die naheliegende Quelle, für die Aktenlage `add_logbook_entry`
  der naheliegende Rückweg.

**Hermes.** Es gibt öffentlich ein Projekt „Hermes Agent“, die Anforderung nennt aber weder
Repository noch Version. Deshalb wird hier keine Integration behauptet. Die Rolle, die ein Agent in
diesem Prozess sinnvoll ausfüllt, ist eng und austauschbar: einen Vorgang entgegennehmen und einen
strukturierten Entwurf vorschlagen. Über den offenen Betrag entscheidet er nicht, und versenden kann
er nichts.

Ob diese Wege im konkreten Konto freigeschaltet und sinnvoll sind, klärt ein Blick in das jeweilige
System. Dieses Repository behauptet dazu nichts.

## Was überwacht wird, auch wenn nichts passiert

`out/lauf.json` führt unter `ueberwachung`: wann die Quelle zuletzt gelesen wurde, ob der Import
vollständig war (hier: 41 von 42), wie viele Aufgaben ohne Verantwortliche sind (hier: 0), wie viele
überfällig sind, und wann der nächste Lauf erwartet wird. Eine interne Aufgabe, die zu lange liegt,
erzeugt eine Eskalation mit Empfänger und Spur, ohne dass jemand daran denken muss.

## Aufbau

```
regeln.yaml                 Hausregeln: Vorlagen, interne Fristen, Sperren, Eskalation, gesperrte Wörter
daten/quelle_v1/            Buchhaltungsquelle, erste Abfrage
daten/quelle_v2/            dieselbe Quelle, zweite Abfrage: eine Zahlung ist eingegangen
daten/freigaben.json        Freigaben eines Menschen, gültig je Fassung
daten/agentenausgaben.json  eingefrorene Agentenausgaben, drei davon absichtlich fehlerhaft
daten/aufgaben.json         interne Aufgaben aus früheren Läufen
src/pruefung.ts             die zehn Kontrollen
src/lauf.ts                 der Lauf in drei Abschnitten, Nachprüfung, Eskalation, Überwachung
src/dienst.ts               der lokale HTTP-Dienst, über den n8n den Prüfcode aufruft
n8n/                        drei Workflows plus die Spuren ihrer echten Ausführungen
tests/                      89 Tests, darunter die Neutralisierung jeder einzelnen Kontrolle
entwuerfe/                  die 28 Entwürfe dieses Laufs, mit Kopfzeile je Ergebnis
postausgang_test/           was tatsächlich abgelegt wurde: 2 Schreiben, 1 Eskalation
out/lauf.json               vollständiger Lauf samt Protokoll aller 280 Kontrollen
```

Lizenz: MIT.

---

# Mahnwesen-Cockpit (English)

**A proposed dunning process in which nothing leaves the building without being machine checked
immediately beforehand.** n8n orchestrates, the code in this repository carries the controls, a
static page shows the result.

View of the run: <https://wimmer-mahnwesen.theaipipe.com>

> **Fictional sample data. No connection to your systems. Nothing is sent.** Every customer,
> invoice, amount, site and complaint is invented, and the "outbox" is a folder in this repository.
>
> **What this is and is not.** It is a demonstration of a PROPOSED process, built from publicly
> stated requirements. It is not a picture of an existing process: which steps a company takes today
> and who owns them is for that company to confirm.
>
> **Not legal advice.** This process computes no dunning fee, no interest and no legal status, and
> it asserts no legal consequence. The days in `regeln.yaml` drive INTERNAL tasks only: when a case
> comes back onto someone's desk.
>
> **No model call.** The run, the drafts and the web page work without network access and without a
> language model. Where an agent would make sense in production, this repository holds **frozen
> sample outputs** and checks them exactly as a live model output would be checked.

## The point: a payment lands after everything was already approved

`RE-2026-0282` was prepared, passed all ten controls and was approved by a human on source version
`quelle_v1`. In `quelle_v2` a payment of 1,140.00 EUR appears. The re-check reads the source again,
`ZAHLUNGSSTAND` fires, the approval lapses, and nothing for that case is in `postausgang_test/`.
Turn that one control off and the case does land in the outbox, which is why
`tests/neutralisierung.test.ts` goes red when any control is neutralised.

## The process

`Check open items → prepare draft → approve or clarify → follow up`, with a separate branch for the
decision to take a case further, which a person makes and this process does not.

Four queues, none of them a bin: **Done / no reminder** (settled or cancelled, closes itself),
**Needs clarification** (complaint, courtesy case, spacing; with an owner, a next action and a
review date), **Check the data** (incomplete or contradictory source, missing contact details, gap
in the history, rejected agent output), **For approval** (a draft that withstands every control).
A stopped case is not an approvable letter: an approval placed on a stopped case aborts the run.

## The ten controls

Source freshness and completeness, payment status (settled or cancelled), amount against the source,
minimum amount, open complaint, courtesy list, spacing since the last letter, documented sequence,
contact details, and agent output (amount, recipient, bank details and wording checked against the
source and the house rules).

Each control is tested twice, on a case it must stop and on a case it must let through, and each one
is then **neutralised in turn**: if switching it off does not change the run, it carries nothing and
the suite goes red.

## n8n really orchestrates

The three workflows in `n8n/` were imported and executed on a local n8n (2.39.6); the traces are in
`n8n/ausfuehrungen/`. Two things a workflow nobody runs would not reveal: in n8n 2.x
`n8n-nodes-base.executeCommand` is excluded by default (`Unrecognized node type`), so the workflow
calls the checking code over **HTTP Request**; and an error workflow must be **active**, otherwise
n8n reports `Workflow ... is not active and cannot be executed` and the failure goes nowhere. The
exports contain no credentials, no auth headers and no paths, and CI checks that on every commit.

## Reproduce it

```bash
npm ci
npm run dienst      # terminal 1
npm run pruefen     # terminal 2: types, tests, run
```

CI runs the same command and compares the result with what is committed. If a single character
differs it turns red, so the files in the repository are provably what the code produces.

## Where each field would come from

Not everything this process needs lives in the accounting system. Complaints come from the trade
software, the courtesy list and the approval are not a field in any API, and a zero open amount can
mean a cancelled document rather than a payment. The German provenance table above names each field,
its assumed source, the key it is matched on, and what happens when it is missing. Nothing defaults
to "no reminder needed".

## Connecting to existing systems

Everything said here about third party software comes from its public documentation, quoted with its
URL. Notably, Lexware Office already dunns by itself, with two documented limits: the **Mahnen**
action exists only for documents created in Lexware Office, not for imported ones, and there is
currently no automatic sending, every reminder is triggered by hand
([help article 547985](https://help.lexware.de/de-form/articles/547985-zahlungserinnerungen-und-mahnungen-erstellen)).
That raises a question rather than a diagnosis: where are invoices created, and how do they reach
the books? The proposal here is therefore to **leave invoicing and accounting where they are** and
to build the cross-check, the exception handling and the monitoring between the tools.

License: MIT.
