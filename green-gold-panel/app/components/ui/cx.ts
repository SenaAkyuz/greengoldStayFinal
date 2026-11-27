/** Koşullu sınıf birleştirme (bağımlılıksız). */
export function cx(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(' ');
}
