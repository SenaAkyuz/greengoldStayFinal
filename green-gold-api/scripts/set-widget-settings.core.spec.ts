import { resolveWidgetSettings } from '../src/common/widget-settings';
import {
  applyPatch,
  runSetWidgetSettings,
  type SetWidgetSettingsDeps,
} from './set-widget-settings.core';

describe('applyPatch', () => {
  it('boş patch -> mevcut değerler değişmez', () => {
    const current = resolveWidgetSettings({ show_estimated_impact: true });
    const next = applyPatch(current, {});
    expect(next).toEqual(current);
  });

  it('yalnızca verilen bayraklar değişir, diğerleri korunur', () => {
    const current = resolveWidgetSettings({
      show_estimated_impact: true,
      enable_booking_click_tracking: false,
    });
    const next = applyPatch(current, { enableBookingClickTracking: true });
    expect(next.showEstimatedImpact).toBe(true); // korunur
    expect(next.enableBookingClickTracking).toBe(true); // değişir
  });

  it('içerik override kısmi eklenir, diğer alanlar korunur', () => {
    const current = resolveWidgetSettings({
      content_overrides: { tr: { heading: 'Eski başlık' } },
    });
    const next = applyPatch(current, {
      contentTr: { addButton: 'Kaydet' },
    });
    expect(next.contentOverrides.tr).toEqual({
      heading: 'Eski başlık',
      addButton: 'Kaydet',
    });
  });

  it('boş string ile bir override alanı temizlenebilir', () => {
    const current = resolveWidgetSettings({
      content_overrides: { tr: { heading: 'X', addButton: 'Y' } },
    });
    const next = applyPatch(current, { contentTr: { heading: '' } });
    expect(next.contentOverrides.tr).toEqual({ addButton: 'Y' });
  });

  it('clearContentOverrides -> tüm override\'lar silinir', () => {
    const current = resolveWidgetSettings({
      content_overrides: { tr: { heading: 'X' }, en: { heading: 'Y' } },
    });
    const next = applyPatch(current, { clearContentOverrides: true });
    expect(next.contentOverrides).toEqual({});
  });
});

function makeDeps(
  hotel: { id: string; name: string; widget_settings: unknown } | null,
): { deps: SetWidgetSettingsDeps; writes: { id: string; settings: unknown }[] } {
  const writes: { id: string; settings: unknown }[] = [];
  const deps: SetWidgetSettingsDeps = {
    getHotelByKey: async () => hotel,
    updateWidgetSettings: async (id, settings) => {
      writes.push({ id, settings });
    },
  };
  return { deps, writes };
}

describe('runSetWidgetSettings', () => {
  it('otel bulunamazsa hata, yazma yok', async () => {
    const { deps, writes } = makeDeps(null);
    await expect(
      runSetWidgetSettings('yok', {}, deps),
    ).rejects.toThrow(/bulunamadı/);
    expect(writes).toHaveLength(0);
  });

  it('değişiklik varsa yazılır', async () => {
    const { deps, writes } = makeDeps({
      id: 'h1',
      name: 'Otel',
      widget_settings: {},
    });
    const res = await runSetWidgetSettings(
      'key-1',
      { showEstimatedImpact: true },
      deps,
    );
    expect(res.changed).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0].id).toBe('h1');
  });

  it('dry-run: değişiklik hesaplanır ama yazılmaz', async () => {
    const { deps, writes } = makeDeps({
      id: 'h1',
      name: 'Otel',
      widget_settings: {},
    });
    const res = await runSetWidgetSettings(
      'key-1',
      { pilotMode: true },
      deps,
      { dryRun: true },
    );
    expect(res.changed).toBe(true);
    expect(writes).toHaveLength(0);
  });

  it('değişiklik yoksa yazma yapılmaz (no-op)', async () => {
    const { deps, writes } = makeDeps({
      id: 'h1',
      name: 'Otel',
      widget_settings: { show_estimated_impact: true },
    });
    const res = await runSetWidgetSettings(
      'key-1',
      { showEstimatedImpact: true },
      deps,
    );
    expect(res.changed).toBe(false);
    expect(writes).toHaveLength(0);
  });
});
