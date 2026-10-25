import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import * as argon from 'argon2';
import { credentialsSchema } from '@open-boards/protocol';
import type { Database } from '../db/database';
import type { Sessions } from './session';
export function authRoutes(
  db: Database,
  sessions: Sessions,
  onLogout: (id: string) => void,
): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  // Verify against a real hash even for missing accounts, keeping the login work comparable.
  const dummy = argon.hash('not-an-account-password', { type: argon.argon2id });
  for (const mode of ['register', 'login'] as const)
    router.post(`/${mode}`, limiter, async (req, res, next) => {
      try {
        const parsed = credentialsSchema.safeParse(req.body);
        if (!parsed.success) {
          res.status(400).json({ message: parsed.error.issues[0].message });
          return;
        }
        const { password } = parsed.data;
        const username = parsed.data.username.toLowerCase();
        let user;
        if (mode === 'register') {
          const hash = await argon.hash(password, { type: argon.argon2id });
          try {
            user = await db.createUser(username, hash);
          } catch (error) {
            if (
              (error as { cause?: { code?: string } }).cause?.code === '23505' ||
              (error as { code?: string }).code === '23505'
            ) {
              res.status(409).json({ message: 'That username is already taken.' });
              return;
            }
            throw error;
          }
        } else {
          user = await db.findUser(username);
          const valid = await argon.verify(user?.passwordHash ?? (await dummy), password);
          if (!user || !valid) {
            res.status(401).json({ message: 'Username or password is incorrect.' });
            return;
          }
        }
        const identity = { id: user.id, name: user.username };
        res.setHeader('Set-Cookie', sessions.cookie(await sessions.issue(identity)));
        res.status(mode === 'register' ? 201 : 200).json(identity);
      } catch (error) {
        next(error);
      }
    });
  router.get('/me', async (req, res) => {
    try {
      res.json(await sessions.verify(req.headers.cookie));
    } catch {
      res.status(401).json({ message: 'Sign in to continue.' });
    }
  });
  router.post('/logout', async (req, res) => {
    try {
      onLogout((await sessions.verify(req.headers.cookie)).id);
    } catch {
      /* An expired cookie can still be cleared. */
    }
    res.setHeader('Set-Cookie', sessions.clear());
    res.sendStatus(204);
  });
  return router;
}
