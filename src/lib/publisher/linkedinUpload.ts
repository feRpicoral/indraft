import { fetchWithRetry } from '../util/http';
import { log } from '../util/logger';
import { PublisherAuthError } from './index';

const LI_BASE = 'https://api.linkedin.com/rest';

/**
 * LinkedIn image upload: a two-step ceremony. Initialize an upload to get a
 * pre-signed URL + image URN, PUT the bytes, then reference the URN in the
 * post. The bytes never flow through LinkedIn's REST endpoint directly.
 */
export async function uploadImage(args: {
  accessToken: string;
  personUrn: string;
  bytes: ArrayBuffer | Buffer | Uint8Array;
  mime: string;
  apiVersion: string;
}): Promise<string> {
  const init = await initialize(args);
  await put(init.uploadUrl, args.bytes, args.mime);
  return init.imageUrn;
}

async function initialize(args: {
  accessToken: string;
  personUrn: string;
  apiVersion: string;
}): Promise<{ uploadUrl: string; imageUrn: string }> {
  const res = await fetchWithRetry(`${LI_BASE}/images?action=initializeUpload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      'LinkedIn-Version': args.apiVersion,
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      initializeUploadRequest: { owner: args.personUrn },
    }),
    retries: 2,
  });
  if (res.status === 401) throw new PublisherAuthError('LinkedIn token rejected on image init');
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`LinkedIn image init ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    value?: { uploadUrl?: string; image?: string };
  };
  const uploadUrl = data.value?.uploadUrl;
  const imageUrn = data.value?.image;
  if (!uploadUrl || !imageUrn) {
    throw new Error('LinkedIn image init returned malformed body');
  }
  return { uploadUrl, imageUrn };
}

async function put(uploadUrl: string, bytes: ArrayBuffer | Buffer | Uint8Array, mime: string): Promise<void> {
  const res = await fetchWithRetry(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mime },
    body: bytes as BodyInit,
    retries: 1,
  });
  if (!res.ok) {
    const t = await res.text();
    log.warn('linkedin image PUT non-ok', { status: res.status, body: t.slice(0, 200) });
    throw new Error(`LinkedIn image PUT ${res.status}`);
  }
}
