import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { Sessions } from './auth/session';
import { authRoutes } from './auth/routes';
import { clientAssets } from './client';
import type { Database } from './db/database';
import { activeSeats, type Match } from './rooms/match';
import { gameRoom } from './rooms/game-room';
export interface ServerConfig {
  origin: string;
  secret: string;
  production?: boolean;
  reconnectSeconds?: number;
}
export function createApp(db: Database, config: ServerConfig) {
  const app = express();
  const sessions = new Sessions(config.secret, !!config.production);
  const rooms = new Map<string, Match>();
  const owners = new Map<string, string>();
  app.disable('x-powered-by');
  // Production traffic reaches this process through Dokploy's Traefik proxy.
  if (config.production) app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    const origin = req.headers.origin;
    if (
      (origin && origin !== config.origin) ||
      (req.method !== 'GET' && req.method !== 'HEAD' && origin !== config.origin)
    ) {
      res.status(403).json({ message: 'Untrusted origin.' });
      return;
    }
    next();
  });
  app.use(express.json({ limit: '8kb' }));
  app.use(
    '/api/auth',
    authRoutes(db, sessions, (id) => activeSeats.get(id)?.disconnect()),
  );
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/api/rooms', async (req, res) => {
    try {
      await sessions.verify(req.headers.cookie);
      res.json(
        [...rooms.values()]
          .filter((r) => !r.game && r.seats.length > 0 && r.seats.length < r.capacity)
          .map((r) => r.listing()),
      );
    } catch {
      res.status(401).json({ message: 'Sign in to list rooms.' });
    }
  });
  app.post('/api/rooms/leave', async (req, res) => {
    try {
      const user = await sessions.verify(req.headers.cookie);
      activeSeats.get(user.id)?.disconnect();
      res.sendStatus(204);
    } catch {
      res.status(401).json({ message: 'Sign in to leave a room.' });
    }
  });
  app.use(
    '/matchmake',
    rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  if (config.production) {
    const client = fileURLToPath(new URL('../../client/dist', import.meta.url));
    app.use(clientAssets(client));
  }
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      console.error(error);
      res.status(500).json({ message: 'The server could not complete that request.' });
    },
  );
  const http = createServer(app);
  const server = new Server({
    greet: false,
    gracefullyShutdown: false,
    transport: new WebSocketTransport({
      server: http,
      beforeUpgrade: async (request) => {
        if (request.headers.get('origin') !== config.origin)
          return new Response(null, { status: 403 });
        try {
          const user = await sessions.verify(request.headers.get('cookie') ?? undefined);
          const sessionId = new URL(request.url).searchParams.get('sessionId');
          const owner = sessionId ? owners.get(sessionId) : undefined;
          if (owner && owner !== user.id) return new Response(null, { status: 403 });
        } catch {
          return new Response(null, { status: 401 });
        }
      },
    }),
  });
  server.define('arena', gameRoom(sessions, config.origin, rooms, owners, config.reconnectSeconds));
  return {
    app,
    http,
    server,
    rooms,
    sessions,
    async close() {
      await server.gracefullyShutdown(false);
    },
  };
}
