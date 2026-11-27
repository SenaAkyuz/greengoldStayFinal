import { describe, expect, it } from 'vitest';
import { isWidgetSrcValid, widgetSetupSteps } from '../lib/panel/integration-setup';
import type { HotelInfo } from '../lib/api';

const hotel = (over: Partial<HotelInfo> = {}): HotelInfo => ({
  hotel_name: 'H', city: null, status: 'active', timezone: 'Europe/Istanbul', currency: 'EUR', amount_per_night: 0.02,
  estimated_co2_per_night_kg: 0.687, commission_rate: 0, public_widget_key: 'pk', allowed_origins: ['https://a.example'],
  hotel_type: 'city', logo_url: null, brand_color: null, role: 'admin', ...over,
});

describe('entegrasyon kurulumu (UX-6.x)', () => {
  it('yer tutucu ya da https olmayan betik adresi geçersiz → kopyalama engellenir', () => {
    expect(isWidgetSrcValid('https://<panel-domain>/green-gold-widget.v1.js')).toBe(false);
    expect(isWidgetSrcValid('http://panel.example.com/green-gold-widget.v1.js')).toBe(false);
    expect(isWidgetSrcValid('')).toBe(false);
    expect(isWidgetSrcValid('https://panel.example.com/green-gold-widget.v1.js')).toBe(true);
  });
  it('adımlar yalnız gerçek sinyallerden; okunamayan veri "bilinmiyor"', () => {
    const s = widgetSetupSteps({ hotel: hotel({ allowed_origins: [] }), widgetSrcValid: true, recentViews: null });
    expect(s.map((x) => x.state)).toEqual(['done', 'pending', 'done', 'unknown']);
    expect(widgetSetupSteps({ hotel: hotel(), widgetSrcValid: false, recentViews: true })[0].state).toBe('pending');
  });
});
