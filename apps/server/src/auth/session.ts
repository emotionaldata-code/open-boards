import { SignJWT, jwtVerify } from 'jose';
import { parse, serialize } from 'cookie';
import type { User } from '@open-boards/protocol';
export class Sessions {
  private key: Uint8Array;
  constructor(
    secret: string,
    private secure: boolean,
  ) {
    if (secret.length < 32) throw new Error('JWT_SECRET must have at least 32 characters');
    this.key = new TextEncoder().encode(secret);
  }
  async issue(user: User): Promise<string> {
    return new SignJWT({ name: user.name })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.id)
      .setIssuer('open-boards')
      .setAudience('open-boards')
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(this.key);
  }
  async verify(cookie: string | undefined): Promise<User> {
    const token = parse(cookie ?? '').boards_session;
    if (!token) throw new Error('Sign in to continue.');
    const { payload } = await jwtVerify(token, this.key, {
      algorithms: ['HS256'],
      issuer: 'open-boards',
      audience: 'open-boards',
    });
    if (!payload.sub || typeof payload.name !== 'string') throw new Error('Invalid session.');
    return { id: payload.sub, name: payload.name };
  }
  cookie(token: string): string {
    return serialize('boards_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.secure,
      path: '/',
      maxAge: 86400,
    });
  }
  clear(): string {
    return serialize('boards_session', '', {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.secure,
      path: '/',
      maxAge: 0,
    });
  }
}
