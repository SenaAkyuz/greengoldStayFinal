import {
  resolveWidgetSettings,
  toStoredWidgetSettings,
  SAFE_DEFAULT_WIDGET_SETTINGS,
} from './widget-settings';

describe('resolveWidgetSettings', () => {
  it('null/undefined/bozuk girdi -> güvenli platform varsayılanları (hepsi kapalı)', () => {
    expect(resolveWidgetSettings(null)).toEqual(SAFE_DEFAULT_WIDGET_SETTINGS);
    expect(resolveWidgetSettings(undefined)).toEqual(
      SAFE_DEFAULT_WIDGET_SETTINGS,
    );
    expect(resolveWidgetSettings('not-an-object')).toEqual(
      SAFE_DEFAULT_WIDGET_SETTINGS,
    );
    expect(resolveWidgetSettings([1, 2, 3])).toEqual(
      SAFE_DEFAULT_WIDGET_SETTINGS,
    );
  });

  it('geçerli booleanlar okunur', () => {
    const s = resolveWidgetSettings({
      pilot_mode: true,
      show_estimated_impact: true,
      enable_booking_click_tracking: true,
    });
    expect(s.pilotMode).toBe(true);
    expect(s.showEstimatedImpact).toBe(true);
    expect(s.enableBookingClickTracking).toBe(true);
  });

  it('yanlış tipli alan -> güvenli varsayılana düşer (savunmacı okuma)', () => {
    const s = resolveWidgetSettings({
      show_estimated_impact: 'true', // string, boolean değil
      enable_booking_click_tracking: 1, // number, boolean değil
    });
    expect(s.showEstimatedImpact).toBe(false);
    expect(s.enableBookingClickTracking).toBe(false);
  });

  it('içerik override: geçerli düz metin kabul edilir', () => {
    const s = resolveWidgetSettings({
      content_overrides: {
        tr: { heading: 'Özel başlık', addButton: 'Kaydet' },
        en: { heading: 'Custom heading' },
      },
    });
    expect(s.contentOverrides.tr).toEqual({
      heading: 'Özel başlık',
      addButton: 'Kaydet',
    });
    expect(s.contentOverrides.en).toEqual({ heading: 'Custom heading' });
  });

  it('içerik override: HTML/etiket içeren metin reddedilir (XSS savunması)', () => {
    const s = resolveWidgetSettings({
      content_overrides: {
        tr: { heading: '<script>alert(1)</script>' },
      },
    });
    expect(s.contentOverrides.tr).toBeUndefined();
  });

  it('içerik override: çok uzun metin reddedilir', () => {
    const s = resolveWidgetSettings({
      content_overrides: { tr: { heading: 'x'.repeat(201) } },
    });
    expect(s.contentOverrides.tr).toBeUndefined();
  });

  it('içerik override: bilinmeyen alan sessizce yok sayılır (whitelist)', () => {
    const s = resolveWidgetSettings({
      content_overrides: {
        tr: { heading: 'Ok', unknownField: 'zararsız ama tanımsız' },
      },
    });
    expect(s.contentOverrides.tr).toEqual({ heading: 'Ok' });
  });

  it('bir otelin ayarı diğerini etkilemez (bağımsız çağrılar izole)', () => {
    const a = resolveWidgetSettings({ show_estimated_impact: true });
    const b = resolveWidgetSettings({ show_estimated_impact: false });
    expect(a.showEstimatedImpact).toBe(true);
    expect(b.showEstimatedImpact).toBe(false);
  });

  it('toStoredWidgetSettings round-trip: resolve(store(x)) === x', () => {
    const original = resolveWidgetSettings({
      pilot_mode: true,
      show_estimated_impact: true,
      enable_booking_click_tracking: false,
      content_overrides: { tr: { addButton: 'Devam' } },
    });
    const stored = toStoredWidgetSettings(original);
    const roundTripped = resolveWidgetSettings(stored);
    expect(roundTripped).toEqual(original);
  });
});
