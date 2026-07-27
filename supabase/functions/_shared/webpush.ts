// ============================================================
// Gửi Web Push notification KHÔNG dùng thư viện "web-push" (thư viện
// đó không tương thích với môi trường Deno của Supabase Edge Functions,
// gây lỗi "Deno.core.runMicrotasks() is not supported").
//
// File này tự cài đặt chuẩn Web Push (RFC 8291 + RFC 8188) bằng
// Web Crypto API gốc — 100% tương thích, không phụ thuộc thư viện ngoài.
// Dùng chung (import) cho mọi Edge Function cần gửi push.
// ============================================================

function b64urlDecode(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concatBytes(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrs) { out.set(a, offset); offset += a.length; }
  return out;
}

function u32be(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n, false);
  return b;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, data));
}

/* Tạo JWT VAPID (ES256), ký bằng khoá private VAPID */
async function createVapidJwt(endpoint: string, publicKeyB64: string, privateKeyB64: string, subject: string): Promise<string> {
  const pub = b64urlDecode(publicKeyB64);
  const x = pub.slice(1, 33), y = pub.slice(33, 65);
  const jwk = {
    kty: 'EC', crv: 'P-256', ext: true,
    x: b64urlEncode(x), y: b64urlEncode(y), d: privateKeyB64,
  };
  const privateKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);

  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = { aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject };
  const signingInput = `${b64urlEncode(new TextEncoder().encode(JSON.stringify(header)))}.${b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)))}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(signingInput)));
  return `${signingInput}.${b64urlEncode(sig)}`;
}

/* Mã hoá payload theo chuẩn aes128gcm (RFC 8291 + RFC 8188) */
async function encryptPayload(plaintext: string, p256dhB64: string, authB64: string) {
  const uaPublicRaw = b64urlDecode(p256dhB64);
  const authSecret = b64urlDecode(authB64);

  const asKeyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', asKeyPair.publicKey));

  const uaPublicKey = await crypto.subtle.importKey('raw', uaPublicRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaPublicKey }, asKeyPair.privateKey, 256));

  const prkKey = await hmacSha256(authSecret, ecdhSecret);
  const keyInfo = concatBytes(new TextEncoder().encode('WebPush: info\0'), uaPublicRaw, asPublicRaw);
  const ikm = (await hmacSha256(prkKey, concatBytes(keyInfo, new Uint8Array([1])))).slice(0, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmacSha256(salt, ikm);

  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const cek = (await hmacSha256(prk, concatBytes(cekInfo, new Uint8Array([1])))).slice(0, 16);

  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');
  const nonce = (await hmacSha256(prk, concatBytes(nonceInfo, new Uint8Array([1])))).slice(0, 12);

  const plainBytes = concatBytes(new TextEncoder().encode(plaintext), new Uint8Array([2])); // delimiter cuối bản ghi
  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cekKey, plainBytes));

  const header = concatBytes(salt, u32be(4096), new Uint8Array([65]), asPublicRaw);
  return concatBytes(header, ciphertext);
}

export interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth_key: string;
}

/* Hàm chính — gọi hàm này để gửi 1 push notification */
export async function sendWebPush(
  sub: PushSubscription,
  payload: { title: string; body: string; url?: string; tag?: string },
  vapidPublicKey: string,
  vapidPrivateKey: string,
  subject = 'mailto:admin@phatdatagency.id.vn'
): Promise<{ ok: boolean; status?: number; expired?: boolean }> {
  const body = await encryptPayload(JSON.stringify(payload), sub.p256dh, sub.auth_key);
  const jwt = await createVapidJwt(sub.endpoint, vapidPublicKey, vapidPrivateKey, subject);

  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
      'Authorization': `vapid t=${jwt}, k=${vapidPublicKey}`,
    },
    body,
  });

  if (res.status === 404 || res.status === 410) return { ok: false, status: res.status, expired: true };
  return { ok: res.ok, status: res.status };
}