/** Menü yardımcıları — saf fonksiyon (görünümden bağımsız, test edilir). */
export interface NavLinkLike {
  key: string;
  href: string;
}

/**
 * Adrese göre aktif menü öğesi: en uzun eşleşen `href` kazanır; "/" yalnız
 * tam eşleşmede aktif olur. Sorgu dizgisi (?…) ve sondaki "/" yok sayılır.
 */
export function resolveActiveKey(
  pathname: string,
  items: NavLinkLike[],
): string | null {
  const clean = (p: string) => {
    const path = p.split('?')[0].split('#')[0];
    return path.length > 1 ? path.replace(/\/+$/, '') : path;
  };
  const current = clean(pathname);
  let best: { key: string; len: number } | null = null;
  for (const item of items) {
    const href = clean(item.href);
    const match =
      href === '/'
        ? current === '/'
        : current === href || current.startsWith(`${href}/`);
    if (match && (!best || href.length > best.len)) {
      best = { key: item.key, len: href.length };
    }
  }
  return best?.key ?? null;
}
