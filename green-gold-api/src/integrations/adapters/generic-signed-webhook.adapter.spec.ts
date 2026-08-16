import { createHmac } from 'crypto';
import { GenericSignedWebhookAdapter } from './generic-signed-webhook.adapter';
import { NormalizedEventValidationError } from '../normalized-event';

const SECRET = 'sandbox-secret-value';

function sign(rawBody: Buffer, ts: string, secret = SECRET) {
  return createHmac('sha256', secret)
    .update(`${ts}.`)
    .update(rawBody)
    .digest('hex');
}

function validPayload() {
  return Buffer.from(
    JSON.stringify({
      schema_version: 1,
      provider: 'generic_signed_webhook',
      provider_event_id: 'evt-1',
      provider_reservation_id: 'res-1',
      property_id: 'prop-1',
      reservation_status: 'confirmed',
      occurred_at: new Date().toISOString(),
      greengold: {
        selected: true,
        amount_minor: 500,
        currency: 'EUR',
        payment_status: 'collected',
      },
    }),
  );
}

describe('GenericSignedWebhookAdapter.verifySignature', () => {
  const adapter = new GenericSignedWebhookAdapter();

  it('geçerli imza + güncel timestamp -> true', () => {
    const body = validPayload();
    const ts = String(Date.now());
    const sig = sign(body, ts);
    const ok = adapter.verifySignature({
      rawBody: body,
      headers: {
        'x-greengold-signature': `sha256=${sig}`,
        'x-greengold-timestamp': ts,
      },
      secret: SECRET,
    });
    expect(ok).toBe(true);
  });

  it('yanlış secret -> false (#11)', () => {
    const body = validPayload();
    const ts = String(Date.now());
    const sig = sign(body, ts, 'wrong-secret');
    const ok = adapter.verifySignature({
      rawBody: body,
      headers: {
        'x-greengold-signature': `sha256=${sig}`,
        'x-greengold-timestamp': ts,
      },
      secret: SECRET,
    });
    expect(ok).toBe(false);
  });

  it('body değiştirilmişse (tamper) -> false', () => {
    const body = validPayload();
    const ts = String(Date.now());
    const sig = sign(body, ts);
    const tampered = Buffer.from(
      body.toString('utf8').replace('500', '999999'),
    );
    const ok = adapter.verifySignature({
      rawBody: tampered,
      headers: {
        'x-greengold-signature': `sha256=${sig}`,
        'x-greengold-timestamp': ts,
      },
      secret: SECRET,
    });
    expect(ok).toBe(false);
  });

  it('header eksikse -> false', () => {
    const body = validPayload();
    expect(
      adapter.verifySignature({ rawBody: body, headers: {}, secret: SECRET }),
    ).toBe(false);
  });

  it('timestamp toleransın dışındaysa (replay) -> false', () => {
    const body = validPayload();
    const oldTs = String(Date.now() - 10 * 60 * 1000); // 10 dk önce
    const sig = sign(body, oldTs);
    const ok = adapter.verifySignature({
      rawBody: body,
      headers: {
        'x-greengold-signature': `sha256=${sig}`,
        'x-greengold-timestamp': oldTs,
      },
      secret: SECRET,
    });
    expect(ok).toBe(false);
  });

  it('bozuk imza formatı -> false', () => {
    const body = validPayload();
    const ts = String(Date.now());
    const ok = adapter.verifySignature({
      rawBody: body,
      headers: {
        'x-greengold-signature': 'not-a-signature',
        'x-greengold-timestamp': ts,
      },
      secret: SECRET,
    });
    expect(ok).toBe(false);
  });
});

describe('GenericSignedWebhookAdapter.parseEvent', () => {
  const adapter = new GenericSignedWebhookAdapter();

  it('geçerli JSON + geçerli şema -> NormalizedReservationEvent', () => {
    const event = adapter.parseEvent(validPayload());
    expect(event.provider_reservation_id).toBe('res-1');
  });

  it('geçersiz JSON -> NormalizedEventValidationError', () => {
    expect(() => adapter.parseEvent(Buffer.from('{not json'))).toThrow(
      NormalizedEventValidationError,
    );
  });

  it('şemaya uymayan JSON -> NormalizedEventValidationError', () => {
    expect(() =>
      adapter.parseEvent(Buffer.from(JSON.stringify({ foo: 'bar' }))),
    ).toThrow(NormalizedEventValidationError);
  });
});
