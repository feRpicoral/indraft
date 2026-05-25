import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/types';
import { loadEnv } from '../config/loader';
import {
  listCredentials,
  addCredential,
  updateCounter,
  storeChallenge,
  consumeChallenge,
  type StoredCredential,
} from '../state/webauthn';

const RP_NAME = 'InDraft';
const USER_ID = 'owner'; // single-user; no DB-keyed identity needed
const USER_NAME = 'owner';

function rpId(): string {
  return loadEnv().WEBAUTHN_RP_ID;
}

function expectedOrigin(): string {
  const id = rpId();
  // localhost dev allows http; everything else assumes https.
  if (id === 'localhost' || id.endsWith('.localhost')) return `http://${id}:3000`;
  return `https://${id}`;
}

export async function buildRegistrationOptions(
  sessionId: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
  const existing = await listCredentials();
  const opts = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpId(),
    userID: new TextEncoder().encode(USER_ID),
    userName: USER_NAME,
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({
      id: c.id,
      transports: (c.transports ?? []) as AuthenticatorTransportFuture[],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
  await storeChallenge(sessionId, opts.challenge);
  return opts;
}

export async function verifyRegistration(args: {
  sessionId: string;
  response: RegistrationResponseJSON;
}): Promise<{ verified: boolean }> {
  const expectedChallenge = await consumeChallenge(args.sessionId);
  if (!expectedChallenge) return { verified: false };
  const result = await verifyRegistrationResponse({
    response: args.response,
    expectedChallenge,
    expectedOrigin: expectedOrigin(),
    expectedRPID: rpId(),
  });
  if (!result.verified || !result.registrationInfo) return { verified: false };
  const info = result.registrationInfo;
  const cred: StoredCredential = {
    id: info.credential.id,
    publicKey: Buffer.from(info.credential.publicKey).toString('base64'),
    counter: info.credential.counter,
    transports: info.credential.transports as string[] | undefined,
    created_at: Date.now(),
  };
  await addCredential(cred);
  return { verified: true };
}

export async function buildAuthenticationOptions(args: {
  sessionId: string;
  challengeBinding?: string;
}): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const existing = await listCredentials();
  const opts = await generateAuthenticationOptions({
    rpID: rpId(),
    allowCredentials: existing.map((c) => ({
      id: c.id,
      transports: (c.transports ?? []) as AuthenticatorTransportFuture[],
    })),
    userVerification: 'preferred',
    // Bind a challenge to the draft version when provided so a stolen
    // assertion can't be replayed against a different draft state.
    ...(args.challengeBinding ? { challenge: new TextEncoder().encode(args.challengeBinding) } : {}),
  });
  await storeChallenge(args.sessionId, opts.challenge);
  return opts;
}

export async function verifyAuthentication(args: {
  sessionId: string;
  response: AuthenticationResponseJSON;
}): Promise<{ verified: boolean }> {
  const expectedChallenge = await consumeChallenge(args.sessionId);
  if (!expectedChallenge) return { verified: false };
  const credentials = await listCredentials();
  const stored = credentials.find((c) => c.id === args.response.id);
  if (!stored) return { verified: false };

  const result = await verifyAuthenticationResponse({
    response: args.response,
    expectedChallenge,
    expectedOrigin: expectedOrigin(),
    expectedRPID: rpId(),
    credential: {
      id: stored.id,
      publicKey: new Uint8Array(Buffer.from(stored.publicKey, 'base64')),
      counter: stored.counter,
      transports: (stored.transports ?? []) as AuthenticatorTransportFuture[],
    },
  });
  if (!result.verified) return { verified: false };
  await updateCounter(stored.id, result.authenticationInfo.newCounter);
  return { verified: true };
}
