import { describe, expect, it } from 'vitest';
import {
  canResend,
  formatEmission,
  formatNumber,
  formatPercent,
  formatPeriod,
  periodStatusView,
  recordStatusView,
  type PeriodStatus,
  type RecordStatus,
} from '../lib/carbon-ui/status';

const PERIODS: PeriodStatus[] = ['future', 'in_progress', 'empty', 'draft', 'awaiting_approval', 'blocked', 'preview_only', 'calculated', 'published'];
const RECORDS: RecordStatus[] = ['sending', 'pending_approval', 'approved', 'rejected', 'outcome_unknown'];

describe('durum sözlüğü', () => {
  it('her dönem durumu için etiket, ton ve yönlendirici açıklama var', () => {
    for (const s of PERIODS) {
      const v = periodStatusView(s);
      expect(v.label.length).toBeGreaterThan(2);
      expect(v.help.length).toBeGreaterThan(10);
    }
  });
  it('metinler teknik terim içermez', () => {
    const all = [...PERIODS.map(periodStatusView), ...RECORDS.map(recordStatusView)]
      .map((v) => `${v.label} ${v.help}`)
      .join(' ');
    expect(all).not.toMatch(/external_id|api|endpoint|ConnectHub|pending_approval|422|409/i);
  });
  it('yalnız önizleme ve yayında farklı anlatılır', () => {
    expect(periodStatusView('preview_only').help).toContain('misafire gösterilmez');
    expect(periodStatusView('published').label).toBe('Yayında');
  });
});

describe('yeniden gönderim (mükerrer koruması)', () => {
  it('yalnız sonucu belirsiz veya reddedilen kayıt yeniden gönderilir', () => {
    expect(canResend('outcome_unknown')).toBe(true);
    expect(canResend('rejected')).toBe(true);
    expect(canResend('approved')).toBe(false);
    expect(canResend('pending_approval')).toBe(false);
    expect(canResend('sending')).toBe(false);
  });
  it('belirsiz sonuç açıklaması mükerrer oluşmayacağını söyler', () => {
    expect(recordStatusView('outcome_unknown').help).toContain('mükerrer kayıt oluşmaz');
  });
});

describe('biçimlendirme', () => {
  it('eksik değer null döner (0 yazılmaz)', () => {
    expect(formatNumber(null)).toBeNull();
    expect(formatNumber(Number.NaN)).toBeNull();
    expect(formatEmission(undefined)).toEqual({ value: null, unit: 'kg CO₂e' });
    expect(formatPercent(null)).toBeNull();
  });
  it('tr-TR ayraçları ve birim seçimi', () => {
    expect(formatNumber(1503.017, 1)).toBe('1.503,0');
    expect(formatEmission(469.657)).toEqual({ value: '469,7', unit: 'kg CO₂e' });
    expect(formatEmission(1503.017)).toEqual({ value: '1,50', unit: 't CO₂e' });
    expect(formatEmission(0)).toEqual({ value: '0,0', unit: 'kg CO₂e' });
    expect(formatPercent(0.909)).toBe('%91');
  });
  it('dönem adı', () => {
    expect(formatPeriod('2026-10')).toBe('Ekim 2026');
    expect(formatPeriod('2026-02')).toBe('Şubat 2026');
    expect(formatPeriod('bozuk')).toBe('bozuk');
  });
});
