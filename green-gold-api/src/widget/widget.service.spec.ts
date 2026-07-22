import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { WidgetService } from './widget.service';
import { makeFakeSupabase, type FakeDataset } from '../../test/fake-supabase';

function hotelRow(over: Record<string, unknown> = {}) {
  return {
    id: 'hotel-A',
    name: 'Pilot Otel',
    city: 'İstanbul',
    default_currency: 'EUR',
    contribution_amount_per_night: 3,
    estimated_co2_per_night_kg: 8.3,
    status: 'active',
    public_widget_key: 'key-active',
    ...over,
  };
}

function makeService(dataset: FakeDataset) {
  const fake = makeFakeSupabase(dataset);
  return { service: new WidgetService(fake as never), fake };
}

describe('WidgetService.getConfig', () => {
  it('bilinmeyen key -> 404 (b)', async () => {
    const { service } = makeService({ hotels: [hotelRow()] });
    await expect(service.getConfig('yok-boyle-key')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('suspended otel -> 403 (c)', async () => {
    const { service } = makeService({
      hotels: [hotelRow({ status: 'suspended', public_widget_key: 'key-susp' })],
    });
    await expect(service.getConfig('key-susp')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('aktif otel -> config döner (is_estimated her zaman true)', async () => {
    const { service } = makeService({ hotels: [hotelRow()] });
    const cfg = await service.getConfig('key-active');
    expect(cfg.hotel_name).toBe('Pilot Otel');
    expect(cfg.is_estimated).toBe(true);
  });
});

describe('WidgetService.recordEvent', () => {
  const validDto = {
    event_type: 'katki_ekle_butonuna_basildi' as const,
    session_ref: 'sess-1',
    metadata: { nights: 3 },
  };

  it('X-Widget-Key yoksa -> 401', async () => {
    const { service } = makeService({ hotels: [hotelRow()] });
    await expect(service.recordEvent(undefined, validDto)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('bilinmeyen key -> 403', async () => {
    const { service } = makeService({ hotels: [hotelRow()] });
    await expect(service.recordEvent('yok', validDto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('suspended otel event gönderemez -> 403 (#2, c)', async () => {
    const { service } = makeService({
      hotels: [hotelRow({ status: 'suspended', public_widget_key: 'key-susp' })],
    });
    await expect(
      service.recordEvent('key-susp', validDto),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('aktif otel -> event insert edilir ve id döner', async () => {
    const { service, fake } = makeService({ hotels: [hotelRow()] });
    const res = await service.recordEvent('key-active', validDto);
    expect(res.id).toBeTruthy();
    expect(fake.dataset.widget_events).toHaveLength(1);
    expect(fake.dataset.widget_events![0].hotel_id).toBe('hotel-A');
  });

  it('idempotency: aynı (hotel,session,type) iki kez -> tek satır, ikisi de başarı', async () => {
    const fake = makeFakeSupabase(
      { hotels: [hotelRow()], widget_events: [] },
      { uniqueBy: { widget_events: ['hotel_id', 'session_ref', 'event_type'] } },
    );
    const service = new WidgetService(fake as never);
    const r1 = await service.recordEvent('key-active', validDto);
    const r2 = await service.recordEvent('key-active', validDto); // aynı session+type
    expect(r1.id).toBeTruthy();
    expect(r2.id).toBeTruthy(); // çakışmada da başarı
    expect(fake.dataset.widget_events).toHaveLength(1); // TEK kayıt
  });

  it('session_ref null -> idempotency yok, her insert ayrı satır', async () => {
    const fake = makeFakeSupabase(
      { hotels: [hotelRow()], widget_events: [] },
      { uniqueBy: { widget_events: ['hotel_id', 'session_ref', 'event_type'] } },
    );
    const service = new WidgetService(fake as never);
    const noSession = { event_type: 'widget_goruntulendi' as const };
    await service.recordEvent('key-active', noSession);
    await service.recordEvent('key-active', noSession);
    expect(fake.dataset.widget_events).toHaveLength(2); // null session -> dedup edilmez
  });
});
