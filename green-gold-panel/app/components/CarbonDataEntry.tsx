'use client';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
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
 * 3pmetrics veri girişi — otel emisyon verisini (fatura/sayaç miktarları) bu
 * panelden girer, kayıt 3pmetrics'e yazılır ve 3pmetrics emisyonu hesaplar.
 *
 * Otelden İSTENEN bilgiler sabit değildir: seçilen birimin emisyon
 * kaynakları 3pmetrics'ten okunur ve form her kaynağın tanımından çizilir
 * (miktar + birim/yakıt türü seçeneği + varsa kullanıcı seçeneği; uçuş
 * kaynaklarında miktar yerine rota).
 *
 * GERİ ALINAMAZLIK: 3pmetrics API'si kayıt silmez. Gönderimden önce otel
 * özeti görür ve açıkça onaylar; yanlış kayıt 3pmetrics arayüzünden silinir.
 *
 * Bu bileşen ayarlar <form>'unun İÇİNDE çizilir: kendi <form>'u yoktur,
 * alanlarının `name`'i yoktur (ayarlar kaydına karışmaz) ve Enter tuşu
 * ayarlar formunu göndermez.
 */

const inputClass =
  'mt-1.5 w-full rounded-lg border border-[#d8e1da] bg-white px-3 py-2.5 text-sm text-[#17372d] focus:outline-none focus:ring-2 focus:ring-emerald-200';
const buttonClass =
  'rounded-lg bg-[#075442] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50';
const secondaryButtonClass =
  'rounded-lg border border-[#d8e1da] bg-white px-4 py-2 text-sm font-medium text-[#17372d] disabled:opacity-50';

const FLIGHT_MODE = 'flight-route-v1';
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const DOCUMENT_ACCEPT = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx';

const STATUS_TEXT: Record<CarbonEntry['status'], string> = {
  sending: 'Gönderiliyor',
  sent: "3pmetrics'e gönderildi",
  failed: '3pmetrics kabul etmedi',
  outcome_unknown: 'Sonucu belirsiz',
  deleted_in_provider: "3pmetrics'ten silindi",
};

const STATUS_CLASS: Record<CarbonEntry['status'], string> = {
  sending: 'bg-neutral-100 text-neutral-700',
  sent: 'bg-emerald-50 text-emerald-800',
  failed: 'bg-red-50 text-red-700',
  outcome_unknown: 'bg-amber-50 text-amber-800',
  deleted_in_provider: 'bg-neutral-100 text-neutral-500 line-through',
};

const today = () => new Date().toISOString().slice(0, 10);

const stopEnter = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter') e.preventDefault();
};

interface Draft {
  date: string;
  value: string;
  systemOption: string;
  userOption: string;
  flightName: string;
  departure: string;
  arrival: string;
}

const emptyDraft = (): Draft => ({
  date: today(),
  value: '',
  systemOption: '',
  userOption: '',
  flightName: '',
  departure: '',
  arrival: '',
});

/** "1.250,50" / "1250,5" / "1250.50" -> "1250.50" */
function normalizeAmount(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s/g, '');
  if (!trimmed) return null;
  const normalized =
    trimmed.includes(',') && trimmed.includes('.')
      ? trimmed.replace(/\./g, '').replace(',', '.')
      : trimmed.replace(',', '.');
  return /^\d{1,12}(\.\d{1,6})?$/.test(normalized) && Number(normalized) > 0
    ? normalized
    : null;
}

function AirportPicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (iata: string) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Airport[]>([]);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const search = () =>
    startTransition(async () => {
      setError('');
      if (query.trim().length < 2) {
        setError('En az 2 karakter girin.');
        return;
      }
      const res = await findAirports(query.trim());
      if (res.error || !res.data) {
        setError(res.error ?? 'Havalimanı aranamadı.');
        return;
      }
      setResults(res.data);
      if (res.data.length === 0) setError('Sonuç bulunamadı.');
    });

  return (
    <div className="text-sm font-medium text-neutral-700">
      {label}
      {value ? (
        <div className="mt-1.5 flex items-center gap-3">
          <span className="rounded-lg bg-emerald-50 px-3 py-2 font-semibold text-emerald-900">
            {value}
          </span>
          <button
            type="button"
            className="text-xs text-neutral-500 underline"
            onClick={() => onChange('')}
            disabled={disabled}
          >
            Değiştir
          </button>
        </div>
      ) : (
        <>
          <div className="mt-1.5 flex gap-2">
            <input
              className={inputClass + ' mt-0'}
              placeholder="Şehir veya kod (ör. ist)"
              value={query}
              disabled={disabled}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  search();
                }
              }}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={search}
              disabled={disabled || pending}
            >
              {pending ? 'Aranıyor…' : 'Ara'}
            </button>
          </div>
          {results.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {results.map((airport) => (
                <button
                  key={airport.iata}
                  type="button"
                  className={secondaryButtonClass}
                  onClick={() => {
                    onChange(airport.iata);
                    setResults([]);
                    setQuery('');
                  }}
                >
                  {airport.iata}
                  {airport.city ? ` · ${airport.city}` : ''}
                </button>
              ))}
            </div>
          )}
          {error && <p className="mt-1 text-xs text-amber-700">{error}</p>}
        </>
      )}
    </div>
  );
}

function EntryRow({
  entry,
  locked,
  onChanged,
}: {
  entry: CarbonEntry;
  locked: boolean;
  onChanged: (entry: CarbonEntry) => void;
}) {
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const upload = (file: File | undefined) => {
    if (!file) return;
    setError('');
    if (file.size > MAX_DOCUMENT_BYTES) {
      setError('Belge en fazla 4 MB olabilir.');
      return;
    }
    startTransition(async () => {
      const form = new FormData();
      form.append('file', file, file.name);
      const res = await attachCarbonEntryDocument(entry.id, form);
      if (res.error || !res.data) {
        setError(res.error ?? 'Belge yüklenemedi.');
        return;
      }
      onChanged(res.data);
    });
  };

  const markDeleted = () => {
    if (
      !window.confirm(
        "Bu kaydı 3pmetrics arayüzünden sildiyseniz onaylayın. Bu işlem 3pmetrics'te bir şey silmez; yalnızca listenizi günceller.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await markEntryDeletedInProvider(entry.id);
      if (res.error || !res.data) {
        setError(res.error ?? 'Kayıt güncellenemedi.');
        return;
      }
      onChanged(res.data);
    });
  };

  const amount = entry.flight
    ? `${entry.flight.departureIata} → ${entry.flight.arrivalIata} (${entry.flight.passengerOrFlightName})`
    : `${entry.value?.toLocaleString('tr-TR') ?? '—'} ${entry.system_option?.label ?? ''}`;

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[#17372d]">
            {entry.resource_title ?? entry.resource_slug}
            {entry.ghg_scope ? (
              <span className="ml-2 text-xs font-normal text-neutral-500">
                {entry.ghg_scope}
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            {entry.date} · {entry.unit_name ?? entry.unit_id}
            {entry.user_option?.label ? ` · ${entry.user_option.label}` : ''}
          </p>
          <p className="mt-0.5 text-sm text-neutral-700">{amount}</p>
          {entry.documents.length > 0 && (
            <p className="mt-0.5 text-xs text-neutral-500">
              Belgeler: {entry.documents.map((d) => d.file_name).join(', ')}
            </p>
          )}
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_CLASS[entry.status]}`}
        >
          {STATUS_TEXT[entry.status]}
          {entry.status === 'sent' && entry.reply_id !== null
            ? ` · no ${entry.reply_id}`
            : ''}
        </span>
      </div>
      {entry.status === 'outcome_unknown' && (
        <p className="mt-1 text-xs text-amber-700">
          3pmetrics&apos;ten yanıt alınamadı; kayıt oluşmuş olabilir. Tekrar
          girmeden önce 3pmetrics hesabınızdan kontrol edin.
        </p>
      )}
      {(entry.status === 'sent' || entry.status === 'outcome_unknown') && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {entry.status === 'sent' && (
            <label
              className={`${secondaryButtonClass} cursor-pointer ${locked || pending ? 'pointer-events-none opacity-50' : ''}`}
            >
              {pending ? 'İşleniyor…' : 'Belge ekle (fatura vb.)'}
              <input
                type="file"
                className="sr-only"
                accept={DOCUMENT_ACCEPT}
                disabled={locked || pending}
                onChange={(e) => {
                  upload(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
          )}
          <button
            type="button"
            className="text-xs text-neutral-500 underline disabled:opacity-50"
            onClick={markDeleted}
            disabled={locked || pending}
          >
            3pmetrics&apos;ten sildim
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </li>
  );
}

export function CarbonDataEntry({
  locked,
  environment,
}: {
  locked: boolean;
  environment: 'sandbox' | 'production' | undefined;
}) {
  const [units, setUnits] = useState<ProviderUnit[] | null>(null);
  const [unitId, setUnitId] = useState('');
  const [resources, setResources] = useState<EmissionResource[] | null>(null);
  const [resourceSlug, setResourceSlug] = useState('');
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [review, setReview] = useState<CarbonEntryInput | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState('');
  const [entries, setEntries] = useState<CarbonEntry[]>([]);
  const [entriesReady, setEntriesReady] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();

  const resource = useMemo(
    () => resources?.find((r) => r.slug === resourceSlug) ?? null,
    [resources, resourceSlug],
  );
  const isFlight = resource?.inputMode === FLIGHT_MODE;
  const unsupportedMode =
    resource !== null && resource.inputMode !== null && !isFlight;

  const refreshEntries = useCallback(async () => {
    const res = await loadCarbonEntries();
    if (res.data) {
      setEntries(res.data.items);
      setEntriesReady(res.data.schema_ready);
    }
  }, []);

  const selectUnit = useCallback((id: string) => {
    setUnitId(id);
    setResources(null);
    setResourceSlug('');
    if (!id) return;
    startTransition(async () => {
      const res = await loadEmissionResources(id);
      if (res.error || !res.data) {
        setError(res.error ?? 'Emisyon kaynakları alınamadı.');
        return;
      }
      setResources(res.data);
    });
  }, []);

  useEffect(() => {
    startTransition(async () => {
      const [unitRes] = await Promise.all([
        loadProviderUnits(),
        refreshEntries(),
      ]);
      if (unitRes.error || !unitRes.data) {
        setError(unitRes.error ?? '3pmetrics birimleri alınamadı.');
        setUnits([]);
        return;
      }
      setUnits(unitRes.data);
      if (unitRes.data.length === 1) {
        selectUnit(unitRes.data[0].externalUnitId);
      }
    });
  }, [refreshEntries, selectUnit]);

  const resetForm = () => {
    setDraft(emptyDraft());
    setReview(null);
    setAcknowledged(false);
    setDuplicateWarning('');
    setIdempotencyKey(crypto.randomUUID());
  };

  const prepareReview = () => {
    setError('');
    setMessage('');
    setDuplicateWarning('');
    if (!resource || !unitId) {
      setError('Birim ve emisyon kaynağı seçin.');
      return;
    }
    if (!draft.date || draft.date > today()) {
      setError('Geçerli bir tarih seçin (ileri tarih olamaz).');
      return;
    }
    const input: CarbonEntryInput = {
      idempotency_key: idempotencyKey,
      unit_id: unitId,
      resource_slug: resource.slug,
      date: draft.date,
      confirm_irreversible: true,
    };
    if (isFlight) {
      if (!draft.flightName.trim() || !draft.departure || !draft.arrival) {
        setError('Uçuş kodu, kalkış ve varış havalimanını girin.');
        return;
      }
      if (draft.departure === draft.arrival) {
        setError('Kalkış ve varış havalimanı aynı olamaz.');
        return;
      }
      input.flight_name = draft.flightName.trim();
      input.departure_iata = draft.departure;
      input.arrival_iata = draft.arrival;
    } else {
      const amount = normalizeAmount(draft.value);
      if (!amount) {
        setError('Miktar sıfırdan büyük bir sayı olmalı.');
        return;
      }
      input.value = amount;
    }
    if (resource.systemOptions) {
      if (!draft.systemOption) {
        setError(
          `${resource.systemOptions.description || 'Seçenek'} seçilmeli.`,
        );
        return;
      }
      input.system_option_value = draft.systemOption;
    }
    if (resource.userOptions && draft.userOption) {
      input.user_option_value = draft.userOption;
    }
    setAcknowledged(false);
    setReview(input);
  };

  const send = (allowDuplicate: boolean) =>
    startTransition(async () => {
      if (!review) return;
      setError('');
      setMessage('');
      const res = await submitCarbonEntry({
        ...review,
        ...(allowDuplicate ? { allow_duplicate: true } : {}),
      });
      if (res.error || !res.data) {
        if (res.code === 'carbon_entry_possible_duplicate') {
          setDuplicateWarning(res.error ?? '');
          return;
        }
        setError(res.error ?? 'Kayıt gönderilemedi.');
        await refreshEntries();
        return;
      }
      setMessage(
        res.data.replayed
          ? 'Bu kayıt zaten gönderilmişti; ikinci kez gönderilmedi.'
          : `Kayıt 3pmetrics'e gönderildi (no ${res.data.entry.reply_id}). İsterseniz aşağıdan belge ekleyebilirsiniz.`,
      );
      resetForm();
      await refreshEntries();
    });

  const optionName = (
    group: EmissionResource['systemOptions'],
    value: string | undefined,
  ) => group?.options.find((o) => o.value === value)?.name ?? '';

  const unitName =
    units?.find((u) => u.externalUnitId === unitId)?.name ?? unitId;
  const formLocked = locked || pending || review !== null;

  return (
    <div className="space-y-6">
      {environment === 'sandbox' && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Test ortamı: kayıtlar 3pmetrics test hesabına gider.
        </p>
      )}

      {units !== null && units.length === 0 && !error && (
        <div className="rounded-xl border border-[#d8e1da] bg-[#f6f9f6] p-4 text-sm text-neutral-600">
          <p className="font-semibold text-[#17372d]">
            3pmetrics hesabınızda henüz tesis tanımlı değil
          </p>
          <p className="mt-2">
            Veri girebilmek için tesisinizin 3pmetrics hesabınızda bir birim
            olarak tanımlanması gerekir. Birimler 3pmetrics arayüzünden
            oluşturulur; tanımlandıktan sonra bu ekranı yenileyin.
          </p>
        </div>
      )}

      {units !== null && units.length > 0 && (
        <fieldset disabled={formLocked} className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-neutral-700">
            Tesis (3pmetrics birimi)
            <select
              className={inputClass}
              value={unitId}
              onChange={(e) => selectUnit(e.target.value)}
            >
              <option value="">Seçin</option>
              {units.map((unit) => (
                <option key={unit.externalUnitId} value={unit.externalUnitId}>
                  {unit.name}
                  {unit.type ? ` (${unit.type})` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-neutral-700">
            Emisyon kaynağı
            <select
              className={inputClass}
              value={resourceSlug}
              disabled={!resources}
              onChange={(e) => {
                setResourceSlug(e.target.value);
                setDraft((d) => ({
                  ...emptyDraft(),
                  date: d.date,
                }));
              }}
            >
              <option value="">
                {unitId && !resources ? 'Yükleniyor…' : 'Seçin'}
              </option>
              {(resources ?? []).map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.title}
                  {r.ghgScope?.name ? ` — ${r.ghgScope.name}` : ''}
                </option>
              ))}
            </select>
            {resources?.length === 0 && (
              <span className="mt-1 block text-xs font-normal text-amber-700">
                Bu birim için 3pmetrics&apos;te tanımlı emisyon kaynağı yok.
              </span>
            )}
          </label>

          {resource && (
            <div className="rounded-lg bg-[#f6f9f6] p-3 text-sm text-neutral-600 sm:col-span-2">
              <p className="font-medium text-[#17372d]">
                {resource.header ?? resource.title}
              </p>
              {resource.description && (
                <p className="mt-1">{resource.description}</p>
              )}
              {resource.ghgScope?.name && (
                <p className="mt-1 text-xs text-neutral-500">
                  GHG kapsamı: {resource.ghgScope.name}
                </p>
              )}
            </div>
          )}

          {unsupportedMode && (
            <p className="text-sm text-amber-700 sm:col-span-2">
              Bu kaynağın veri biçimi panelde henüz desteklenmiyor; bu kaynak
              için veriyi 3pmetrics üzerinden girin.
            </p>
          )}

          {resource && !unsupportedMode && (
            <>
              <label className="block text-sm font-medium text-neutral-700">
                {isFlight ? 'Uçuş tarihi' : 'Tarih (fatura/dönem tarihi)'}
                <input
                  className={inputClass}
                  type="date"
                  max={today()}
                  value={draft.date}
                  onKeyDown={stopEnter}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, date: e.target.value }))
                  }
                />
              </label>

              {isFlight ? (
                <>
                  <label className="block text-sm font-medium text-neutral-700">
                    Uçuş kodu
                    <input
                      className={inputClass}
                      placeholder="ör. TK 1983"
                      maxLength={120}
                      value={draft.flightName}
                      onKeyDown={stopEnter}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, flightName: e.target.value }))
                      }
                    />
                    <span className="mt-1 block text-xs font-normal text-neutral-500">
                      3pmetrics yolcu adı da kabul eder; kişisel veri
                      paylaşmamak için uçuş kodunu girmeniz önerilir.
                    </span>
                  </label>
                  <AirportPicker
                    label="Kalkış havalimanı"
                    value={draft.departure}
                    disabled={formLocked}
                    onChange={(iata) =>
                      setDraft((d) => ({ ...d, departure: iata }))
                    }
                  />
                  <AirportPicker
                    label="Varış havalimanı"
                    value={draft.arrival}
                    disabled={formLocked}
                    onChange={(iata) =>
                      setDraft((d) => ({ ...d, arrival: iata }))
                    }
                  />
                </>
              ) : (
                <label className="block text-sm font-medium text-neutral-700">
                  Miktar
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    placeholder="ör. 15000"
                    value={draft.value}
                    onKeyDown={stopEnter}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, value: e.target.value }))
                    }
                  />
                </label>
              )}

              {resource.systemOptions && (
                <label className="block text-sm font-medium text-neutral-700">
                  {resource.systemOptions.description || 'Seçenek'}
                  <select
                    className={inputClass}
                    value={draft.systemOption}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, systemOption: e.target.value }))
                    }
                  >
                    <option value="">Seçin</option>
                    {resource.systemOptions.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {resource.userOptions && (
                <label className="block text-sm font-medium text-neutral-700">
                  {resource.userOptions.description || 'Ek seçenek'}{' '}
                  <span className="font-normal text-neutral-500">
                    (isteğe bağlı)
                  </span>
                  <select
                    className={inputClass}
                    value={draft.userOption}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, userOption: e.target.value }))
                    }
                  >
                    <option value="">Seçilmedi</option>
                    {resource.userOptions.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
        </fieldset>
      )}

      {resource && !unsupportedMode && !review && (
        <button
          type="button"
          className={buttonClass}
          onClick={prepareReview}
          disabled={locked || pending}
        >
          Kontrol et
        </button>
      )}

      {review && resource && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-sm">
          <p className="font-semibold text-[#17372d]">
            3pmetrics&apos;e gönderilecek kayıt
          </p>
          <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-neutral-700">
            <dt className="text-neutral-500">Tesis</dt>
            <dd>{unitName}</dd>
            <dt className="text-neutral-500">Kaynak</dt>
            <dd>{resource.title}</dd>
            <dt className="text-neutral-500">Tarih</dt>
            <dd>{review.date}</dd>
            {review.value !== undefined && (
              <>
                <dt className="text-neutral-500">Miktar</dt>
                <dd>
                  {Number(review.value).toLocaleString('tr-TR')}{' '}
                  {optionName(
                    resource.systemOptions,
                    review.system_option_value,
                  )}
                </dd>
              </>
            )}
            {review.value === undefined && review.system_option_value && (
              <>
                <dt className="text-neutral-500">
                  {resource.systemOptions?.description || 'Seçenek'}
                </dt>
                <dd>
                  {optionName(
                    resource.systemOptions,
                    review.system_option_value,
                  )}
                </dd>
              </>
            )}
            {review.user_option_value && (
              <>
                <dt className="text-neutral-500">
                  {resource.userOptions?.description || 'Ek seçenek'}
                </dt>
                <dd>
                  {optionName(resource.userOptions, review.user_option_value)}
                </dd>
              </>
            )}
            {review.departure_iata && (
              <>
                <dt className="text-neutral-500">Uçuş</dt>
                <dd>
                  {review.flight_name} · {review.departure_iata} →{' '}
                  {review.arrival_iata}
                </dd>
              </>
            )}
          </dl>
          <label className="mt-4 flex items-start gap-2 text-neutral-700">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={acknowledged}
              disabled={pending}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span>
              Bu kaydın 3pmetrics&apos;e gönderildikten sonra buradan
              silinemeyeceğini, yanlışsa yalnızca 3pmetrics arayüzünden
              silinebileceğini anlıyorum.
            </span>
          </label>
          {duplicateWarning && (
            <p className="mt-3 text-amber-800">{duplicateWarning}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className={buttonClass}
              disabled={!acknowledged || pending || locked}
              onClick={() => send(duplicateWarning !== '')}
            >
              {pending
                ? 'Gönderiliyor…'
                : duplicateWarning
                  ? 'Yine de gönder'
                  : "3pmetrics'e gönder"}
            </button>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={pending}
              onClick={() => {
                setReview(null);
                setDuplicateWarning('');
              }}
            >
              Düzenle
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p aria-live="polite" className="text-sm text-emerald-800">
          {message}
        </p>
      )}

      <div className="border-t border-neutral-100 pt-4">
        <h4 className="text-sm font-semibold text-[#17372d]">
          Gönderilen kayıtlar
        </h4>
        <p className="mt-1 text-xs text-neutral-500">
          Yanlış girilen bir kaydı 3pmetrics arayüzünden silebilirsiniz; sildikten
          sonra burada &quot;3pmetrics&apos;ten sildim&quot; ile işaretleyin.
        </p>
        {!entriesReady ? (
          <p className="mt-3 text-sm text-neutral-500">
            Kayıt listesi kurulum bekliyor.
          </p>
        ) : entries.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-500">Henüz kayıt yok.</p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-100">
            {entries.map((entry) => (
              <EntryRow
                key={entry.id}
                entry={entry}
                locked={locked}
                onChanged={(updated) =>
                  setEntries((list) =>
                    list.map((e) => (e.id === updated.id ? updated : e)),
                  )
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
