import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateWidgetEventDto } from './create-widget-event.dto';

const OPTS = { whitelist: true, forbidNonWhitelisted: true };

async function errorsFor(payload: unknown) {
  const dto = plainToInstance(CreateWidgetEventDto, payload);
  return validate(dto as object, OPTS);
}

describe('CreateWidgetEventDto (#9 runtime DTO doğrulama)', () => {
  it('geçerli event doğrulamayı geçer', async () => {
    const errs = await errorsFor({
      event_type: 'katki_ekle_butonuna_basildi',
      session_ref: 'sess-1',
      metadata: { nights: 3, rooms: 2, amount_total: 30 },
    });
    expect(errs).toHaveLength(0);
  });

  it('rooms opsiyonel — göndermeyen eski widget kurulumu geçerli kalır', async () => {
    const errs = await errorsFor({
      event_type: 'checkbox_secildi',
      metadata: { nights: 3, amount_total: 9 },
    });
    expect(errs).toHaveLength(0);
  });

  it('sınır aşan rooms reddedilir — 1001', async () => {
    const errs = await errorsFor({
      event_type: 'checkbox_secildi',
      metadata: { nights: 2, rooms: 1001 },
    });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('rooms < 1 reddedilir', async () => {
    const errs = await errorsFor({
      event_type: 'checkbox_secildi',
      metadata: { nights: 2, rooms: 0 },
    });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('tam sayı olmayan rooms reddedilir', async () => {
    const errs = await errorsFor({
      event_type: 'checkbox_secildi',
      metadata: { nights: 2, rooms: 1.5 },
    });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('metadata olmadan da geçerli (opsiyonel)', async () => {
    const errs = await errorsFor({ event_type: 'widget_goruntulendi' });
    expect(errs).toHaveLength(0);
  });

  it('geçersiz event_type reddedilir (d)', async () => {
    const errs = await errorsFor({ event_type: 'hack_event' });
    expect(errs.length).toBeGreaterThan(0);
    expect(errs[0].property).toBe('event_type');
  });

  it("booking_engine_clicked DTO seviyesinde kabul edilir (otel bazlı feature flag WidgetService'te)", async () => {
    const errs = await errorsFor({
      event_type: 'booking_engine_clicked',
      session_ref: 'sess-journey-1',
    });
    expect(errs).toHaveLength(0);
  });

  it('sınır aşan nights reddedilir — 999999 (e)', async () => {
    const errs = await errorsFor({
      event_type: 'checkbox_secildi',
      metadata: { nights: 999999 },
    });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('nights < 1 reddedilir', async () => {
    const errs = await errorsFor({
      event_type: 'checkbox_secildi',
      metadata: { nights: 0 },
    });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('metadata içindeki bilinmeyen alan reddedilir — forbidNonWhitelisted (e)', async () => {
    const errs = await errorsFor({
      event_type: 'checkbox_secildi',
      metadata: { nights: 2, injected_amount: 999 },
    });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('üst seviye bilinmeyen alan reddedilir', async () => {
    const errs = await errorsFor({
      event_type: 'checkbox_secildi',
      hotel_id: 'spoofed-hotel',
    });
    expect(errs.length).toBeGreaterThan(0);
  });

  it('100 karakterden uzun session_ref reddedilir', async () => {
    const errs = await errorsFor({
      event_type: 'checkbox_secildi',
      session_ref: 'x'.repeat(101),
    });
    expect(errs.length).toBeGreaterThan(0);
  });
});
