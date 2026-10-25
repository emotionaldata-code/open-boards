#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import process from 'node:process';
import { URL } from 'node:url';

const [link, output, ...extra] = process.argv.slice(2);

async function main() {
  if (!link || !output || extra.length)
    throw new Error(
      'Usage: node fetch-umdb.mjs <https://unmatched.cards/umdb/decks/slug> <output.json>',
    );

  const url = new URL(link);
  const match = /^\/umdb\/decks\/([a-z0-9_-]+)\/?$/i.exec(url.pathname);
  if (
    url.protocol !== 'https:' ||
    url.host !== 'unmatched.cards' ||
    url.username ||
    url.password ||
    !match
  )
    throw new Error('Expected a public https://unmatched.cards/umdb/decks/<slug> URL.');

  const sourceUrl = `https://unmatched.cards/umdb/decks/${match[1]}`;
  const apiUrl = `https://unmatched.cards/api/db/decks/${match[1]}`;
  const response = await globalThis.fetch(apiUrl, {
    headers: { Accept: 'application/json' },
    signal: globalThis.AbortSignal.timeout(30000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error(`Source request failed: HTTP ${response.status} (${apiUrl})`);
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('The source returned non-JSON content; inspect the deck page manually.');

  const deck = await response.json();
  if (
    !deck ||
    typeof deck.name !== 'string' ||
    !Array.isArray(deck.cards) ||
    !deck.cards.length ||
    !Array.isArray(deck.heroes) ||
    !deck.heroes.length
  )
    throw new Error('Unexpected UmDb deck shape; inspect the response before translating it.');

  const snapshot = { sourceUrl, apiUrl, retrievedAt: new Date().toISOString(), deck };
  await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: 'wx' });
  const copies = deck.cards.reduce(
    (total, card) =>
      Number.isInteger(card.quantity) && card.quantity > 0 ? total + card.quantity : NaN,
    0,
  );
  process.stdout.write(
    `Saved ${deck.name}: ${deck.cards.length} designs, ${Number.isNaN(copies) ? 'unknown' : copies} copies.\n` +
      `Source snapshot: ${output}\nAudit mechanics and artwork before creating a playable bundle.\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
