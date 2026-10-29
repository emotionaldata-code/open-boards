import { createServer, type Server } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { clientAssets } from './client';

let directory: string;
let server: Server;
let endpoint: string;
const files = [
  'index.html',
  'assets/index-BiB2pM-d.js',
  'assets/index-WHvmjOpr.css',
  'artwork/maps/mine/map-1900-012345abcdef.webp',
  'assets/settings.js',
  'artwork/portrait.webp',
  'cards/fallback.svg',
  'artwork/manifest.json',
];

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'open-boards-client-'));
  for (const file of files) {
    await mkdir(join(directory, file, '..'), { recursive: true });
    await writeFile(join(directory, file), file);
  }
  const app = express();
  app.use(clientAssets(directory));
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No server address');
  endpoint = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (directory) await rm(directory, { recursive: true, force: true });
});

it.each(files.slice(1, 4))('caches hashed asset %s for one year', async (file) => {
  const response = await fetch(`${endpoint}/${file}`);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  expect(await response.text()).toBe(file);
});

it.each(['', files[0], ...files.slice(4)])('revalidates mutable asset /%s', async (file) => {
  const response = await fetch(`${endpoint}/${file}`);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-cache');
  await response.text();
  const cached = await fetch(`${endpoint}/${file}`, {
    cache: 'no-cache',
    headers: { 'If-None-Match': response.headers.get('etag')! },
  });
  expect(cached.status).toBe(304);
  expect(cached.headers.get('cache-control')).toBe('no-cache');
});

it('does not mark missing hashed URLs as immutable', async () => {
  const response = await fetch(`${endpoint}/artwork/missing-012345abcdef.webp`);
  expect(response.status).toBe(404);
  expect(response.headers.get('cache-control') ?? '').not.toContain('immutable');
});
