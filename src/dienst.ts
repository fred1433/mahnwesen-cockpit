/**
 * Ein kleiner HTTP-Dienst, damit n8n den Prüfcode aufrufen kann.
 *
 * Warum HTTP und nicht der Knoten "Execute Command": n8n 2.x schaltet
 * `n8n-nodes-base.executeCommand` standardmäßig ab (nachgemessen an dieser
 * Installation: die Voreinstellung von NODES_EXCLUDE enthält den Knoten, eine
 * Ausführung endet mit "Unrecognized node type"). Ein Workflow, der ihn
 * braucht, läuft auf einer frischen selbst gehosteten Installation nicht. Der
 * Knoten "HTTP Request" ist dagegen immer da.
 *
 * Der Dienst hört nur auf 127.0.0.1, hat keine Zugangsdaten, schreibt nichts
 * nach draußen und liest ausschließlich die Beispieldaten dieses Repositories.
 *
 * Start: npm run dienst
 */

import { appendFileSync, mkdirSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ladeBestand } from './daten.ts';
import { fuehreLaufAus, ladeAufgaben, schreibeLauf } from './lauf.ts';
import { ladeRegeln } from './regeln.ts';

const PORT = Number(process.env.MAHNWESEN_PORT ?? 5789);
const PROTOKOLL = fileURLToPath(new URL('../n8n/ausfuehrungen/fehlerprotokoll.txt', import.meta.url));

function antworte(res: ServerResponse, status: number, koerper: unknown): void {
  const text = typeof koerper === 'string' ? koerper : JSON.stringify(koerper);
  res.writeHead(status, {
    'content-type': typeof koerper === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
  });
  res.end(text);
}

async function koerperLesen(req: IncomingMessage): Promise<string> {
  const teile: Buffer[] = [];
  for await (const teil of req) teile.push(teil as Buffer);
  return Buffer.concat(teile).toString('utf8');
}

export function baueDienst() {
  return createServer((req, res) => {
    void (async () => {
      const pfad = (req.url ?? '/').split('?')[0];
      try {
        if (req.method === 'GET' && pfad === '/gesundheit') {
          const bestand = ladeBestand('quelle_v2');
          return antworte(res, 200, {
            status: 'bereit',
            beispieldaten: true,
            quelle: bestand.quelle,
          });
        }

        if (req.method === 'POST' && pfad === '/lauf') {
          const regeln = ladeRegeln();
          const lauf = fuehreLaufAus(
            regeln,
            ladeBestand('quelle_v1'),
            ladeBestand('quelle_v2'),
            ladeAufgaben(),
          );
          schreibeLauf(lauf);
          return antworte(res, 200, lauf);
        }

        if (req.method === 'POST' && pfad === '/fehlerprotokoll') {
          const text = await koerperLesen(req);
          mkdirSync(fileURLToPath(new URL('../n8n/ausfuehrungen/', import.meta.url)), {
            recursive: true,
          });
          appendFileSync(PROTOKOLL, `${text.trim()}\n`, 'utf8');
          return antworte(res, 200, { protokolliert: true });
        }

        if (req.method === 'POST' && pfad === '/fehler-test') {
          // Absichtlich. Nur dafuer da, dass die Fehlerbehandlung in n8n
          // nachweislich von selbst anspringt.
          return antworte(res, 503, {
            fehler: 'Quelle nicht erreichbar (absichtlicher Test der Fehlerbehandlung).',
          });
        }

        return antworte(res, 404, { fehler: `Unbekannter Pfad ${pfad}` });
      } catch (fehler) {
        return antworte(res, 500, { fehler: (fehler as Error).message });
      }
    })();
  });
}

export function main(): void {
  baueDienst().listen(PORT, '127.0.0.1', () => {
    console.log(`Mahnwesen-Dienst auf http://127.0.0.1:${PORT} (nur lokal, Beispieldaten).`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
