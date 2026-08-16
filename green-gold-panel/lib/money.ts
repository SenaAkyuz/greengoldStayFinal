// amount_minor (integer minor units, ör. 500 = 5.00) -> okunabilir para birimi
// metni. Faz 2 çekirdeğinin (green-gold-api) sözleşmesiyle birebir aynı birim.
export function formatMinorAmount(amountMinor: number, currency: string): string {
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(
      major,
    );
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}
