import { calculateCarbonPricing } from './carbon-pricing';

describe('Greenview demo pricing', () => {
  it('matches published Turkey five-star coefficient and rounds the nightly price', () => {
    const result = calculateCarbonPricing('Turkey', '', '5 Star', 'EUR');
    expect(result.coefficient_kg).toBe(43.442576);
    expect(result.amount_per_night).toBe(1.09);
    expect(result.price_is_demo).toBe(true);
    expect(result.data_year).toBe(2024);
  });
  it('uses the country aggregate, not an average of star classes', () => {
    expect(
      calculateCarbonPricing('Turkey', '', 'All Hotels', 'EUR').coefficient_kg,
    ).toBe(29.638204);
  });
  it('rejects invented locations, unsupported classes and currencies', () => {
    expect(() =>
      calculateCarbonPricing('Turkey', 'Istanbul', '5 Star', 'EUR'),
    ).toThrow();
    expect(() =>
      calculateCarbonPricing('Turkey', '', 'resort', 'EUR'),
    ).toThrow();
    expect(() => calculateCarbonPricing('', '', 'All Hotels', 'EUR')).toThrow();
    expect(() =>
      calculateCarbonPricing('Turkey', '', '5 Star', 'JPY'),
    ).toThrow();
  });
});
