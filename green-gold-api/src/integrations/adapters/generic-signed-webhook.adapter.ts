import { createHmac, timingSafeEqual } from 'crypto';
import {
  NormalizedEventValidationError,
  validateNormalizedReservationEvent,
  type NormalizedReservationEvent,
} from '../normalized-event';
import type {
  ProviderAdapter,
  WebhookVerificationInput,
} from './provider-adapter.interface';

/**
 * `generic_signed_webhook` — YALNIZCA İÇ TEST/SANDBOX kontratıdır. Gerçek bir
 * booking engine/PMS sağlayıcısını TEMSİL ETMEZ; "her payload'ı kabul eden
 * gevşek bir endpoint" da DEĞİLDİR — imza + timestamp + şema doğrulaması
 * tam uygulanır. Amaç: gerçek bir sağlayıcı adaptörü (ör. SynXis) yazılana
 * kadar çekirdeği (webhook ingestion, state machine, panel) uçtan uca test
 * edebilmek.
 *
 * İmza şeması (bu projeye özgü, herhangi bir sağlayıcı standardı DEĞİL):
 *   header 'x-greengold-signature': 'sha256=<hex hmac>'
 *   header 'x-greengold-timestamp': '<unix ms>'
 *   hmac = HMAC_SHA256(secret, `${timestamp}.` + rawBody)
 * Body'nin kendisi doğrudan NormalizedReservationEvent şeklindedir (adapter
 * ekstra bir alan eşleme/mapping YAPMAZ — payload zaten normalized).
 */
const SIGNATURE_HEADER = 'x-greengold-signature';
const TIMESTAMP_HEADER = 'x-greengold-timestamp';
// Replay penceresi: imza geçerli olsa bile çok eski/gelecekteki bir timestamp
// reddedilir (yeniden oynatma saldırısına karşı).
const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : v;
}

export class GenericSignedWebhookAdapter implements ProviderAdapter {
  readonly provider = 'generic_signed_webhook';
  readonly configured = true;

  verifySignature(input: WebhookVerificationInput): boolean {
    const sigHeader = headerValue(input.headers, SIGNATURE_HEADER);
    const tsHeader = headerValue(input.headers, TIMESTAMP_HEADER);
    if (!sigHeader || !tsHeader) return false;

    const match = /^sha256=([0-9a-fA-F]{64})$/.exec(sigHeader.trim());
    if (!match) return false;

    const ts = Number(tsHeader);
    if (!Number.isFinite(ts)) return false;
    if (Math.abs(Date.now() - ts) > TIMESTAMP_TOLERANCE_MS) return false;

    const expectedHex = createHmac('sha256', input.secret)
      .update(`${tsHeader}.`)
      .update(input.rawBody)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedHex, 'hex');
    const actualBuf = Buffer.from(match[1].toLowerCase(), 'hex');
    // Uzunluk farklıysa timingSafeEqual fırlatır — önce eşitle, aksi halde
    // erken dönüş yine de zamanlama sinyali vermez (sabit-uzunluk hash).
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  }

  parseEvent(rawBody: Buffer): NormalizedReservationEvent {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new NormalizedEventValidationError(
        'invalid_payload',
        'Body geçerli JSON değil.',
      );
    }
    return validateNormalizedReservationEvent(parsed);
  }
}
