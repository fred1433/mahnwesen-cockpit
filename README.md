# Mahnwesen-Cockpit

**Ein Mahnlauf, aus dem keine Mahnung herausgeht, die nicht vorher maschinell geprüft wurde.**
Vorbereitung der Schreiben, deterministische Prüfung vor dem Versand, Freigabeliste mit Begründung,
Eskalation für das, was liegen bleibt.

Ansicht des Laufs: <https://wimmer-mahnwesen.theaipipe.com>

> **Beispieldaten.** Alle Kunden, Rechnungen, Beträge, Baustellen und Reklamationen in diesem
> Repository sind erfunden. Absender und Empfänger der Briefe sind ein fiktiver Betrieb und fiktive
> Kunden. Es sind keine Daten eines echten Unternehmens enthalten.
>
> **Keine Rechtsauskunft.** Fristen, Stufen und Mahngebühren stehen in `regeln.yaml` und sind
> Beispielwerte eines Hausprozesses. Was für einen bestimmten Betrieb gilt, entscheidet dieser mit
> seiner Steuerberatung oder seinem Anwalt, nicht dieses Programm.
>
> **Kein Modellaufruf.** Der Lauf, die Briefe und die Webseite kommen ohne Netzzugriff und ohne
> Sprachmodell aus. Die Brieftexte sind von Hand geschrieben und werden beim Lauf mit den Daten des
> Vorgangs gefüllt. Im Betrieb kann ein Sprachmodell die Entwürfe schreiben. Was hier gezeigt wird,
> ist die Stufe danach: die Prüfung ist Code, kein zweites Modell.

## Was der Lauf macht

1. **Fällige Stufe bestimmen.** Je Rechnung: wie viele Tage über die Fälligkeit, welche Stufe wurde
   zuletzt dokumentiert, welche wäre als nächste dran. Keine Stufe wird übersprungen.
2. **Entwurf schreiben.** Zahlungserinnerung, 1. Mahnung, 2. Mahnung oder interne Aktennotiz zur
   Übergabe, mit Betrag, Gebühr und Zahlungsziel aus den Hausregeln. Alle Entwürfe liegen in
   [`briefe/`](briefe/).
3. **Prüfen.** Acht Kontrollen, jede eine Funktion mit einem Ja oder Nein. Fällt eine durch, geht der
   Entwurf nicht hinaus, sondern mit Begründung in die Freigabeliste. Nichts wird still verworfen.
4. **Ablegen.** Der vollständige Lauf samt Protokoll steht in [`out/lauf.json`](out/lauf.json).

## Die acht Kontrollen

| Kontrolle | Frage | Stoppt, wenn |
|---|---|---|
| `ZAHLUNGSSTAND` | Ist die Rechnung inzwischen ausgeglichen? | Der Zahlungsstand meldet null offen, die Rechnungsliste noch einen Betrag |
| `BETRAGSABGLEICH` | Stimmt der Briefbetrag mit dem Zahlungsstand? | Eine Teilzahlung ist eingegangen, die im Brief nicht steht |
| `MINDESTBETRAG` | Lohnt der offene Betrag eine Mahnung? | Der offene Betrag liegt unter dem Mindestbetrag der Hausregeln |
| `REKLAMATION` | Läuft auf dieser Baustelle etwas Offenes? | Eine Reklamation zum selben Vorgang ist offen |
| `KULANZLISTE` | Ist der Kunde ein Fall für den Schreibtisch? | Der Kunde steht auf der Kulanzliste |
| `WARTEZEIT` | Liegt genug Zeit seit der letzten Stufe? | Die letzte Stufe ging vor weniger als der Wartezeit hinaus |
| `REIHENFOLGE` | Ist jede Stufe davor dokumentiert? | In der Historie fehlt eine Vorstufe |
| `KONTAKTDATEN` | Kann der Kanal überhaupt bedient werden? | Keine E-Mail-Adresse für eine E-Mail-Stufe, keine Anschrift für einen Brief |

Die Kontrollen stehen in [`src/pruefung.ts`](src/pruefung.ts), die Tests dazu in
[`tests/pruefung.test.ts`](tests/pruefung.test.ts). Jede Kontrolle wird zweimal getestet: an einem
Fall, den sie stoppen muss, und an einem, den sie durchlassen muss. Eine Sperre, die alles stoppt,
ist genauso kaputt wie eine, die nichts stoppt.

## Der Lauf vom 16.09.2026

| | |
|---|---|
| Rechnungen im Bestand | 42 |
| Entwürfe vorbereitet | 28 |
| Nach Prüfung freigegeben | 15 |
| Einem Menschen vorgelegt | 5 |
| **Gestoppt** | **8** |
| An die Geschäftsführung eskaliert | 2 |
| Ausgeführte Kontrollen | 224 |

Die Beispieldaten sind so gebaut, dass jede der acht Kontrollen in diesem Lauf genau einmal
anschlägt. Im Alltag greift eine Sperre seltener; hier soll jede einmal zu sehen sein.

## Selbst nachrechnen

```bash
npm ci
npm run pruefen      # Typen, Tests, Lauf
```

`npm run lauf` schreibt `briefe/` und `out/lauf.json` neu. Die CI führt denselben Befehl aus und
vergleicht das Ergebnis mit dem, was im Repository liegt: weicht ein Zeichen ab, wird sie rot. Die
abgelegten Briefe sind also nachweislich genau das, was der Code erzeugt, und keine Handarbeit.

## Anschluss an vorhandene Systeme

Was hier über fremde Software steht, stammt aus deren öffentlicher Dokumentation. Was dort nicht
steht, steht hier auch nicht.

**Lexware Office**, <https://developers.lexware.io/docs/>

- Der `payments`-Endpunkt „provides read access to the payment status of (bookkeeping or sales)
  vouchers, including invoices and credit notes“ und liefert unter anderem `openAmount`,
  `paymentStatus`, `paidDate`. Genau darauf zielt die Kontrolle `ZAHLUNGSSTAND`: der maßgebliche
  Stand wird unmittelbar vor dem Versand gelesen, nicht der Stand von gestern Nacht.
- Der `voucherlist`-Endpunkt lässt sich nach `voucherType` und `voucherStatus` filtern, also die
  offenen Rechnungen holen.
- Es gibt Webhooks („Event Subscriptions“) mit den Ereignissen `payment.changed` und
  `invoice.status.changed`. Damit muss kein Mahnlauf raten, ob inzwischen bezahlt wurde.
- Für die Mahnung selbst gibt es einen `dunnings`-Endpunkt mit „Create a dunning“ und „Pursue to a
  dunning“.
- Das Tempo ist dokumentiert begrenzt: „A client can make up to 2 requests per second to the Lexware
  API.“ Ein Lauf über einige hundert Rechnungen muss sich danach richten.

**HERO Software**, <https://hero-software.de/api-doku/graphql-guide>

- „Die HERO GraphQL API ermöglicht dir einen Vollzugriff auf dein Konto und alle Objekte, womit du
  Kundendaten, Projekte oder Dokumente einsehen, herunterladen, erstellen oder verändern kannst.“
- Endpunkt `https://login.hero-software.de/api/external/v7/graphql`, Authentifizierung über
  `Authorization: Bearer YOUR_API_KEY`, den Schlüssel gibt es laut Dokumentation über den Support.
- Dokumentierte Abfragen unter anderem `contacts`, `project_matches`, `customer_documents`,
  Mutationen unter anderem `create_contact`, `create_project_match`, `add_logbook_entry`. Für die
  Kontrolle `REKLAMATION` ist `project_matches` die naheliegende Quelle, für die Aktenlage
  `add_logbook_entry` der naheliegende Rückweg.

Ob diese Wege im konkreten Konto freigeschaltet und sinnvoll sind, klärt ein Blick in das jeweilige
System. Dieses Repository behauptet dazu nichts.

## Aufbau

```
regeln.yaml          Hausregeln: Stufen, Fristen, Gebühren, Sperren, Eskalation
daten/               Beispieldaten: Kunden, Rechnungen, Zahlungsstand, Reklamationen, Historie
src/regeln.ts        Regeln laden und auf Widersprüche prüfen
src/faellig.ts       Welche Stufe ist heute dran
src/entwurf.ts       Brieftexte
src/pruefung.ts      Die acht Kontrollen
src/lauf.ts          Der Lauf, schreibt briefe/ und out/lauf.json
tests/               47 Tests
briefe/              Die 28 Entwürfe dieses Laufs, mit Kopfzeile je Ergebnis
out/lauf.json        Vollständiger Lauf samt Protokoll aller 224 Kontrollen
```

Lizenz: MIT.

---

# Mahnwesen-Cockpit (English)

**A dunning run where no reminder leaves the building without passing a machine check first.**
Letters prepared, a deterministic check before anything is sent, an approval queue with reasons, and
escalation for whatever is left.

View of the run: <https://wimmer-mahnwesen.theaipipe.com>

> **Sample data.** Every customer, invoice, amount, site and complaint in this repository is
> invented. The sender and the recipients of the letters are a fictional company and fictional
> customers. No data from a real business is included.
>
> **Not legal advice.** Deadlines, stages and dunning fees live in `regeln.yaml` and are example
> values of a house process. What applies to a given company is for that company and its tax adviser
> or lawyer to decide, not for this program.
>
> **No model call.** The run, the letters and the web page work without network access and without a
> language model. The letter texts were written by hand and are filled with the data of each case at
> build time. In production a language model can draft them. What is shown here is the stage after
> that: the check is code, not a second model.

## What the run does

1. **Decide which stage is due.** Per invoice: how many days past the due date, which stage was last
   documented, which one is next. No stage is skipped.
2. **Draft.** Payment reminder, first reminder, second reminder, or an internal handover note, with
   amount, fee and payment window taken from the house rules. All drafts are in [`briefe/`](briefe/).
3. **Check.** Eight controls, each a function returning yes or no. If one fails, the draft does not
   go out; it goes to the approval queue with its reason. Nothing is dropped silently.
4. **Record.** The full run including the journal is in [`out/lauf.json`](out/lauf.json).

## The eight controls

| Control | Question | Stops when |
|---|---|---|
| `ZAHLUNGSSTAND` | Has the invoice been settled meanwhile? | The payment ledger says nothing is open while the invoice list still shows an amount |
| `BETRAGSABGLEICH` | Does the amount in the letter match the ledger? | A part payment arrived that the letter does not reflect |
| `MINDESTBETRAG` | Is the open amount worth a reminder? | It is below the minimum in the house rules |
| `REKLAMATION` | Is something open on this site? | A complaint on the same job is open |
| `KULANZLISTE` | Is this customer a desk decision? | The customer is on the courtesy list |
| `WARTEZEIT` | Has enough time passed since the last stage? | The previous stage went out less than the waiting period ago |
| `REIHENFOLGE` | Is every earlier stage documented? | A preceding stage is missing from the history |
| `KONTAKTDATEN` | Can the channel be served at all? | No email address for an email stage, no postal address for a letter |

Each control is tested twice: on a case it must stop, and on a case it must let through. A guard that
stops everything is as broken as one that stops nothing.

## The run of 16 September 2026

42 invoices, 28 drafts prepared, 15 released after the checks, 5 put in front of a human, **8
stopped**, 2 escalated to management, 224 controls executed. The sample data is built so that each of
the eight controls fires exactly once in this run.

## Reproduce it

```bash
npm ci
npm run pruefen      # types, tests, run
```

CI runs the same command and compares the result with what is committed. If a single character
differs, it turns red, so the letters in the repository are provably what the code produces.

## Connecting to existing systems

Everything said here about third party software comes from its public documentation, quoted with its
URL. What is not documented there is not claimed here. See the German section above for the exact
quotes from the Lexware Office API documentation (<https://developers.lexware.io/docs/>) and the HERO
Software GraphQL guide (<https://hero-software.de/api-doku/graphql-guide>).

License: MIT.
