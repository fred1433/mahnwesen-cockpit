/** Datum und Betrag, deutsch formatiert, ohne Zeitzonenüberraschungen. */

const TAG = 24 * 60 * 60 * 1000;

export function alsDatum(iso: string): Date {
  const teile = iso.split('-').map(Number);
  const [jahr, monat, tag] = teile;
  if (jahr === undefined || monat === undefined || tag === undefined || Number.isNaN(jahr)) {
    throw new Error(`Ungültiges Datum: ${iso}`);
  }
  return new Date(Date.UTC(jahr, monat - 1, tag));
}

/** Ganze Tage von a bis b. Positiv, wenn b später liegt. */
export function tageZwischen(a: string, b: string): number {
  return Math.round((alsDatum(b).getTime() - alsDatum(a).getTime()) / TAG);
}

export function plusTage(iso: string, tage: number): string {
  const d = new Date(alsDatum(iso).getTime() + tage * TAG);
  return d.toISOString().slice(0, 10);
}

export function datumDe(iso: string): string {
  const [jahr, monat, tag] = iso.split('-');
  return `${tag}.${monat}.${jahr}`;
}

export function betragDe(wert: number): string {
  return wert.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function euro(wert: number): string {
  return `${betragDe(wert)} EUR`;
}

/** Cent-genau runden, damit 0.1 + 0.2 nicht zum Thema wird. */
export function cent(wert: number): number {
  return Math.round(wert * 100) / 100;
}
