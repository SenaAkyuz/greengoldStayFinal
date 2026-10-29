// Panel genelinde TR sayı biçimleri.

export const formatNumber = (n: number) => n.toLocaleString('tr-TR');

export const formatPercent = (n: number) => `%${n.toLocaleString('tr-TR')}`;

// En fazla `digits` ondalık; tam sayılarda ondalık göstermez.
export const formatDecimal = (n: number, digits = 1) =>
  n.toLocaleString('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
