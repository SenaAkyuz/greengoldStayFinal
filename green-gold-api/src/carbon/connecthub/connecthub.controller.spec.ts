import type { Server } from 'http';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { configureApp } from '../../bootstrap';
import { ConnectHubController } from './connecthub.controller';
import { ConnectHubService } from './connecthub.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { makeFakeSupabase } from '../../../test/fake-supabase';

/**
 * Yönlendirme ve sorgu doğrulaması (B): `GET periods?year=` ile
 * `GET periods/:period` çakışmamalı; yıl sayı değilse 400.
 * Global guard'lar AppModule'dedir ve serverless.spec'te ayrıca sınanır;
 * burada kimlik, isteğe `auth` eklenerek taklit edilir.
 */
describe('ConnectHubController — yönlendirme', () => {
  let app: INestApplication;
  const service = {
    listPeriods: jest.fn((hotelId: string, year: number) =>
      Promise.resolve({ hotelId, year }),
    ),
    getPeriod: jest.fn((hotelId: string, period: string) =>
      Promise.resolve({ hotelId, period }),
    ),
    listItems: jest.fn((hotelId: string, year?: number) =>
      Promise.resolve({ hotelId, year: year ?? null }),
    ),
    getPeriodMeasurement: jest.fn((hotelId: string, period: string) =>
      Promise.resolve({ hotelId, period, measurement: null }),
    ),
    listPeriodMeasurements: jest.fn((hotelId: string, period: string) =>
      Promise.resolve({ hotelId, period, versions: [] }),
    ),
    getProviderRecords: jest.fn((hotelId: string, period: string) =>
      Promise.resolve({ hotelId, period, records: [] }),
    ),
    getPeriodMeasurementVersion: jest.fn(
      (hotelId: string, period: string, id: string) =>
        Promise.resolve({ hotelId, period, id }),
    ),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ConnectHubController],
      providers: [
        { provide: ConnectHubService, useValue: service },
        {
          provide: SupabaseService,
          useValue: makeFakeSupabase({ hotels: [] }),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use((req: { auth?: unknown }, _res: unknown, next: () => void) => {
      req.auth = { hotelId: 'hotel-A', authUserId: 'u' };
      next();
    });
    configureApp(app);
    await app.init();
  });
  afterAll(() => app?.close());
  beforeEach(() => jest.clearAllMocks());

  const server = () => app.getHttpServer() as Server;
  const base = '/dashboard/carbon-provider/connecthub';

  it('GET periods?year=2025 → listPeriods(hotel-A, 2025)', async () => {
    const res = await request(server()).get(`${base}/periods?year=2025`);
    expect(res.status).toBe(200);
    expect(service.listPeriods).toHaveBeenCalledWith('hotel-A', 2025);
    expect(service.getPeriod).not.toHaveBeenCalled();
  });

  it('GET periods (yıl yok) → içinde bulunulan yıl', async () => {
    await request(server()).get(`${base}/periods`);
    expect(service.listPeriods).toHaveBeenCalledWith(
      'hotel-A',
      new Date().getUTCFullYear(),
    );
  });

  it('GET periods/2026-10 → getPeriod (liste ucu ile çakışmaz)', async () => {
    const res = await request(server()).get(`${base}/periods/2026-10`);
    expect(res.status).toBe(200);
    expect(service.getPeriod).toHaveBeenCalledWith('hotel-A', '2026-10');
    expect(service.listPeriods).not.toHaveBeenCalled();
  });

  it('GET periods/2026-10/measurement → getPeriodMeasurement (salt okuma)', async () => {
    const res = await request(server()).get(
      `${base}/periods/2026-10/measurement`,
    );
    expect(res.status).toBe(200);
    expect(service.getPeriodMeasurement).toHaveBeenCalledWith(
      'hotel-A',
      '2026-10',
    );
    expect(service.getPeriod).not.toHaveBeenCalled();
  });

  it("GET periods/2026-10/provider-records → getProviderRecords (salt okuma, hotel token'dan)", async () => {
    const res = await request(server()).get(
      `${base}/periods/2026-10/provider-records`,
    );
    expect(res.status).toBe(200);
    expect(service.getProviderRecords).toHaveBeenCalledWith(
      'hotel-A',
      '2026-10',
    );
  });

  it('GET periods/2026-10/measurements[/:id] → sürüm listesi ve ayrıntı', async () => {
    await request(server()).get(`${base}/periods/2026-10/measurements`);
    expect(service.listPeriodMeasurements).toHaveBeenCalledWith(
      'hotel-A',
      '2026-10',
    );
    await request(server()).get(`${base}/periods/2026-10/measurements/x-1`);
    expect(service.getPeriodMeasurementVersion).toHaveBeenCalledWith(
      'hotel-A',
      '2026-10',
      'x-1',
    );
    expect(service.getPeriodMeasurement).not.toHaveBeenCalled();
  });

  it.each(['abc', '20x5'])('GET periods?year=%s → 400', async (year) => {
    const res = await request(server()).get(`${base}/periods?year=${year}`);
    expect(res.status).toBe(400);
    expect(service.listPeriods).not.toHaveBeenCalled();
  });

  it('GET items?year=2026 → listItems(hotel-A, 2026); yıl yoksa undefined', async () => {
    await request(server()).get(`${base}/items?year=2026`);
    expect(service.listItems).toHaveBeenCalledWith('hotel-A', 2026);
    await request(server()).get(`${base}/items`);
    expect(service.listItems).toHaveBeenLastCalledWith('hotel-A', undefined);
  });
});
