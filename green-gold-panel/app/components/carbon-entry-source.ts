import type {
  Airport,
  CarbonEntry,
  CarbonEntryInput,
  EmissionResource,
  ProviderUnit,
} from '@/lib/api';
import {
  attachCarbonEntryDocument,
  findAirports,
  loadCarbonEntries,
  loadEmissionResources,
  loadProviderUnits,
  markEntryDeletedInProvider,
  submitCarbonEntry,
} from '../ayarlar/actions';

/**
 * Veri girişi ekranının veri kaynağı. Gerçek kaynak 3pmetrics'e (API
 * üzerinden) gider; örnek kaynak hiçbir yere gitmez — tesis henüz
 * tanımlanmadan akışı göstermek içindir.
 */
type Result<T> = { data: T | null; error: string | null; code?: string | null };

export interface CarbonEntrySource {
  sample: boolean;
  loadUnits(): Promise<Result<ProviderUnit[]>>;
  loadResources(unitId: string): Promise<Result<EmissionResource[]>>;
  findAirports(query: string): Promise<Result<Airport[]>>;
  loadEntries(): Promise<Result<{ schema_ready: boolean; items: CarbonEntry[] }>>;
  submit(
    input: CarbonEntryInput,
  ): Promise<Result<{ entry: CarbonEntry; replayed: boolean }>>;
  attach(entryId: string, form: FormData): Promise<Result<CarbonEntry>>;
  markDeleted(entryId: string): Promise<Result<CarbonEntry>>;
}

export const liveSource: CarbonEntrySource = {
  sample: false,
  loadUnits: loadProviderUnits,
  loadResources: loadEmissionResources,
  findAirports,
  loadEntries: loadCarbonEntries,
  submit: submitCarbonEntry,
  attach: attachCarbonEntryDocument,
  markDeleted: markEntryDeletedInProvider,
};

// --- Örnek veri: 3pmetrics CCA API dokümanındaki örneklere dayanır. Gerçek
// liste, otelin 3pmetrics tesis tanımından gelir; bu yalnızca akış önizlemesidir.

const SAMPLE_UNITS: ProviderUnit[] = [
  { externalUnitId: 'ornek-otel', name: 'Örnek Otel', type: 'Other' },
];

export const SAMPLE_RESOURCES: EmissionResource[] = [
  {
    slug: 'electricity-consumption',
    title: 'Elektrik Tüketimi',
    header: 'Elektrik tüketim bilgilerini giriniz',
    description: 'Tesiste kullanılan elektrik tüketim miktarları',
    ghgScope: { id: 2, name: 'Scope 2' },
    systemOptions: {
      description: 'Birim Seçimi',
      options: [
        { name: 'Kilowatt-saat', value: '1' },
        { name: 'Megawatt-saat', value: '2' },
      ],
    },
    userOptions: null,
    inputMode: null,
    requiredFields: [],
  },
  {
    slug: 'natural-gas',
    title: 'Doğalgaz Tüketimi',
    header: 'Doğalgaz tüketim bilgilerini giriniz',
    description: 'Isınma ve sıcak su için kullanılan doğalgaz',
    ghgScope: { id: 1, name: 'Scope 1' },
    systemOptions: {
      description: 'Yakıt Türü',
      options: [
        { name: 'Doğalgaz (m3)', value: '1' },
        { name: 'Doğalgaz (kWh)', value: '2' },
      ],
    },
    userOptions: null,
    inputMode: null,
    requiredFields: [],
  },
  {
    slug: 'vehicle-fuel',
    title: 'Araç Yakıt Tüketimi',
    header: 'Araç yakıt bilgilerini giriniz',
    description: 'Otel servis araçlarının yakıt tüketimi',
    ghgScope: { id: 1, name: 'Scope 1' },
    systemOptions: {
      description: 'Yakıt Türü',
      options: [
        { name: 'Dizel (litre)', value: '1' },
        { name: 'Benzin (litre)', value: '2' },
      ],
    },
    userOptions: {
      description: 'Araç Plakası',
      options: [
        { name: '34ABC123', value: '1' },
        { name: '06XYZ789', value: '2' },
      ],
    },
    inputMode: null,
    requiredFields: [],
  },
  {
    slug: 'business-flights',
    title: 'İş Seyahati Uçuşları',
    header: 'Uçuş bilgilerini giriniz',
    description: 'Personel iş seyahatleri',
    ghgScope: { id: 3, name: 'Scope 3' },
    systemOptions: null,
    userOptions: null,
    inputMode: 'flight-route-v1',
    requiredFields: ['flightDate', 'departureIata', 'arrivalIata'],
  },
];

const SAMPLE_AIRPORTS: Airport[] = [
  { iata: 'IST', name: 'IST', city: 'İstanbul', country: 'TR' },
  { iata: 'SAW', name: 'SAW', city: 'İstanbul', country: 'TR' },
  { iata: 'ESB', name: 'ESB', city: 'Ankara', country: 'TR' },
  { iata: 'ADB', name: 'ADB', city: 'İzmir', country: 'TR' },
  { iata: 'AYT', name: 'AYT', city: 'Antalya', country: 'TR' },
  { iata: 'LHR', name: 'LHR', city: 'Londra', country: 'GB' },
];

const ok = <T,>(data: T): Promise<Result<T>> =>
  Promise.resolve({ data, error: null });

/** Her çağrıda yeni, bellekte yaşayan bir örnek kaynak (sayfa yenilenince sıfırlanır). */
export function createSampleSource(): CarbonEntrySource {
  let entries: CarbonEntry[] = [];
  let nextReply = 10_001;
  const update = (id: string, patch: Partial<CarbonEntry>) => {
    entries = entries.map((e) => (e.id === id ? { ...e, ...patch } : e));
    return ok(entries.find((e) => e.id === id) as CarbonEntry);
  };

  return {
    sample: true,
    loadUnits: () => ok(SAMPLE_UNITS),
    loadResources: () => ok(SAMPLE_RESOURCES),
    findAirports: (query) => {
      const q = query.toLocaleLowerCase('tr');
      return ok(
        SAMPLE_AIRPORTS.filter(
          (a) =>
            a.iata.toLowerCase().includes(q) ||
            (a.city ?? '').toLocaleLowerCase('tr').includes(q),
        ),
      );
    },
    loadEntries: () => ok({ schema_ready: true, items: entries }),
    submit: (input) => {
      const resource = SAMPLE_RESOURCES.find((r) => r.slug === input.resource_slug);
      const label = (group: EmissionResource['systemOptions'], value?: string) =>
        value === undefined
          ? null
          : { value, label: group?.options.find((o) => o.value === value)?.name ?? null };
      const entry: CarbonEntry = {
        id: crypto.randomUUID(),
        idempotency_key: input.idempotency_key,
        unit_id: input.unit_id,
        unit_name: SAMPLE_UNITS[0].name,
        resource_slug: input.resource_slug,
        resource_title: resource?.title ?? input.resource_slug,
        ghg_scope: resource?.ghgScope?.name ?? null,
        date: input.date,
        value: input.value === undefined ? null : Number(input.value),
        system_option: label(resource?.systemOptions ?? null, input.system_option_value),
        user_option: label(resource?.userOptions ?? null, input.user_option_value),
        flight: input.departure_iata
          ? {
              passengerOrFlightName: input.flight_name ?? '',
              departureIata: input.departure_iata,
              arrivalIata: input.arrival_iata ?? '',
            }
          : null,
        status: 'sent',
        reply_id: nextReply++,
        error_code: null,
        documents: [],
        environment: 'sample',
        created_at: new Date().toISOString(),
      };
      entries = [entry, ...entries];
      return ok({ entry, replayed: false });
    },
    attach: (entryId, form) => {
      const file = form.get('file');
      const name = file instanceof File ? file.name : 'belge';
      const current = entries.find((e) => e.id === entryId);
      return update(entryId, {
        documents: [
          ...(current?.documents ?? []),
          { file_name: name, uploaded_at: new Date().toISOString() },
        ],
      });
    },
    markDeleted: (entryId) => update(entryId, { status: 'deleted_in_provider' }),
  };
}
