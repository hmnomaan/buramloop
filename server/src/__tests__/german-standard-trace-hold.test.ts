// server/src/__tests__/german-standard-trace-hold.test.ts
import {
  formatDinKg,
  formatDinPct,
  formatDinDate,
  formatDinMetric,
  formatDinDateTime,
  TRACE_MULTILANG_I18N,
} from '../../../shared/src/schemas/formatters-de';

describe('BL-042: German Industrial Standard (DIN 1333 / DIN 5008) & Multi-language Traceability Helpers', () => {
  it('formats kilograms and percentages strictly according to German DIN 1333 comma-decimal rules', () => {
    expect(formatDinKg(6704)).toMatch(/6\.?704,0 kg/);
    expect(formatDinKg(272)).toBe('272,0 kg');
    expect(formatDinPct(68.7, 1)).toBe('68,7 %');
    expect(formatDinPct(0, 2)).toBe('0,00 %');
  });

  it('formats dates according to German DIN 5008 DD.MM.YYYY in Europe/Berlin timezone', () => {
    expect(formatDinDate('2026-10-28T09:04:00.000Z')).toBe('28.10.2026');
  });

  it('formats lab metrics with German comma decimal representation', () => {
    expect(formatDinMetric(8.2)).toBe('8,2');
    expect(formatDinMetric(null)).toBe('—');
  });

  it('formats 24-hour timestamps with language-specific timezone labels', () => {
    const formattedDe = formatDinDateTime('2026-10-28T09:04:00.000Z', 'DE');
    expect(formattedDe).toContain('28.10.2026');
    expect(formattedDe).toContain('Uhr MEZ');

    const formattedEn = formatDinDateTime('2026-10-28T09:04:00.000Z', 'EN');
    expect(formattedEn).toContain('CET');

    const formattedTr = formatDinDateTime('2026-10-28T09:04:00.000Z', 'TR');
    expect(formattedTr).toContain('TSİ/CET');
  });

  it('provides complete translations across all 4 requested languages (DE, EN, TR, BN)', () => {
    const languages = ['DE', 'EN', 'TR', 'BN'] as const;
    for (const lang of languages) {
      const dict = TRACE_MULTILANG_I18N[lang];
      expect(dict).toBeDefined();
      expect(dict.pageTitle).toBeTruthy();
      expect(dict.viewChainBtn).toBeTruthy();
      expect(dict.viewCertBtn).toBeTruthy();
      expect(dict.holdActionBtn).toBeTruthy();
      expect(dict.staffViewBtn).toBeTruthy();
      expect(dict.inspectorViewBtn).toBeTruthy();
      expect(dict.col1SourceLots).toBeTruthy();
      expect(dict.col2Drums).toBeTruthy();
      expect(dict.col3Batch).toBeTruthy();
      expect(dict.col4Process).toBeTruthy();
      expect(dict.col5Rework).toBeTruthy();
      expect(dict.col6ShipmentLot).toBeTruthy();
    }
  });
});
