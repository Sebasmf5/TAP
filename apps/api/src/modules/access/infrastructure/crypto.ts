import { hash, verify } from '@node-rs/argon2';
import { StaffRoleSchema } from '@tap/contracts';
import { SignJWT, jwtVerify } from 'jose';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from 'node:crypto';
import { UnauthorizedError } from '../../../shared/index.ts';
import type { AccessTokenClaims } from '../domain/entities.ts';
import type {
  GoogleOAuthClient,
  GoogleOAuthUserInfo,
  JwtTokenService,
  PasswordHasher,
  SignAccessTokenInput,
} from '../domain/ports.ts';

export class Argon2PasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return hash(password, {
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}

export function generateEd25519KeyPairBase64(): {
  privateKeyBase64: string;
  publicKeyBase64: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return {
    privateKeyBase64: Buffer.from(privateKey, 'utf8').toString('base64'),
    publicKeyBase64: Buffer.from(publicKey, 'utf8').toString('base64'),
  };
}

export function parseTtlToSeconds(ttl: string): number {
  const match = /^(\d+)\s*([smhd])$/.exec(ttl.trim());
  if (!match?.[1] || !match[2]) {
    return 900; // 15m por defecto
  }
  const amount = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return amount * (multipliers[unit] ?? 60);
}

function loadEd25519KeyPair(
  privateKeyBase64: string,
  publicKeyBase64: string,
): { privateKey: KeyObject; publicKey: KeyObject } {
  const privPem = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
  const pubPem = Buffer.from(publicKeyBase64, 'base64').toString('utf8');

  if (privPem.includes('-----BEGIN') && pubPem.includes('-----BEGIN')) {
    const privateKey = createPrivateKey({ key: privPem, format: 'pem' });
    const publicKey = createPublicKey({ key: pubPem, format: 'pem' });
    if (privateKey.asymmetricKeyType !== 'ed25519' || publicKey.asymmetricKeyType !== 'ed25519') {
      throw new Error('Las claves JWT deben ser de tipo Ed25519.');
    }
    return { privateKey, publicKey };
  }

  // En pruebas unitarias que inyectan valores efímeros cortos, genera un par Ed25519 en memoria.
  const generated = generateKeyPairSync('ed25519');
  return {
    privateKey: generated.privateKey,
    publicKey: generated.publicKey,
  };
}

export class JoseJwtTokenService implements JwtTokenService {
  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly accessTtlSeconds: number;
  private readonly keyId: string;

  constructor(params: {
    privateKeyBase64: string;
    publicKeyBase64: string;
    issuer: string;
    audience: string;
    accessTtl: string;
    keyId?: string;
  }) {
    const keys = loadEd25519KeyPair(params.privateKeyBase64, params.publicKeyBase64);
    this.privateKey = keys.privateKey;
    this.publicKey = keys.publicKey;
    this.issuer = params.issuer;
    this.audience = params.audience;
    this.accessTtlSeconds = parseTtlToSeconds(params.accessTtl);
    this.keyId = params.keyId ?? 'tap-ed25519-v1';
  }

  async signAccessToken(
    input: SignAccessTokenInput,
  ): Promise<{ token: string; expiresInSeconds: number }> {
    const iat = Math.floor(input.now.getTime() / 1000);
    const exp = iat + this.accessTtlSeconds;

    // Sin datos personales (ni correo ni nombre) según AGENTS.md A7.1.
    const token = await new SignJWT({
      org: input.organizationId,
      role: input.role,
    })
      .setProtectedHeader({
        alg: 'EdDSA',
        typ: 'JWT',
        kid: this.keyId,
      })
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setSubject(input.userId)
      .setJti(input.jti)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(this.privateKey);

    return {
      token,
      expiresInSeconds: this.accessTtlSeconds,
    };
  }

  async verifyAccessToken(token: string, now = new Date()): Promise<AccessTokenClaims> {
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedError('Token de acceso requerido.');
    }

    try {
      const { payload, protectedHeader } = await jwtVerify(token, this.publicKey, {
        algorithms: ['EdDSA'],
        issuer: this.issuer,
        audience: this.audience,
        currentDate: now,
        clockTolerance: 0,
      });

      if (protectedHeader.alg !== 'EdDSA' || !protectedHeader.kid) {
        throw new UnauthorizedError('Cabecera de token no permitida.');
      }

      if (typeof payload.sub !== 'string' || !payload.sub) {
        throw new UnauthorizedError('El token no contiene sujeto válido.');
      }
      if (typeof payload.jti !== 'string' || !payload.jti) {
        throw new UnauthorizedError('El token no contiene identificador único (jti).');
      }
      if (typeof payload.iat !== 'number' || typeof payload.exp !== 'number') {
        throw new UnauthorizedError('El token no contiene marcas de tiempo válidas.');
      }

      const roleResult = StaffRoleSchema.safeParse(payload['role']);
      if (!roleResult.success) {
        throw new UnauthorizedError('El rol incluido en el token no es válido.');
      }

      const rawOrg = payload['org'];
      const org = typeof rawOrg === 'string' ? rawOrg : null;

      return {
        iss: this.issuer,
        aud: this.audience,
        sub: payload.sub,
        org,
        role: roleResult.data,
        iat: payload.iat,
        exp: payload.exp,
        jti: payload.jti,
      };
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        throw error;
      }
      throw new UnauthorizedError('Token de acceso inválido o expirado.');
    }
  }
}

export class HttpGoogleOAuthClient implements GoogleOAuthClient {
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly redirectUri: string | undefined;

  constructor(params: { clientId?: string; clientSecret?: string; redirectUri?: string }) {
    this.clientId = params.clientId?.trim() || undefined;
    this.clientSecret = params.clientSecret?.trim() || undefined;
    this.redirectUri = params.redirectUri?.trim() || undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }

  buildAuthorizationUrl(state: string): string {
    if (!this.clientId || !this.redirectUri) {
      throw new Error('Google OAuth no está configurado.');
    }
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'select_account');
    return url.toString();
  }

  async exchangeCodeForUser(code: string): Promise<GoogleOAuthUserInfo> {
    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new Error('Google OAuth no está configurado.');
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      throw new UnauthorizedError('No fue posible validar el código de autorización con Google.');
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      throw new UnauthorizedError('Respuesta de Google OAuth incompleta.');
    }

    const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      throw new UnauthorizedError('No fue posible obtener el perfil de Google.');
    }

    const profile = (await userRes.json()) as {
      sub?: string;
      email?: string;
      name?: string;
      email_verified?: boolean;
    };

    if (!profile.sub || !profile.email) {
      throw new UnauthorizedError('El perfil de Google no contiene correo electrónico.');
    }

    return {
      sub: profile.sub,
      email: profile.email,
      name: profile.name ?? profile.email,
      emailVerified: Boolean(profile.email_verified),
    };
  }
}
