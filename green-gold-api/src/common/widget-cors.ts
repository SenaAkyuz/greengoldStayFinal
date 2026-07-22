import type { NextFunction, Request, Response } from 'express';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * /widget/* için per-hotel dinamik CORS (global açık CORS'un yerine).
 *
 *  - Gerçek istek (GET /widget/config?key=, POST /widget/events + X-Widget-Key):
 *    Origin, isteğin otelinin allowed_origins'inde varsa ACAO ver; Origin var ama
 *    izinli değilse 403; Origin yoksa (server-side/non-browser) dokunma, geç.
 *  - Preflight (OPTIONS): key taşımadığı için oteli çözemeyiz -> TÜM otellerin
 *    allowed_origins BİRLEŞİMİ (global set) ile kontrol; asıl yetki gerçek istekte.
 *  - Dev kolaylığı: NODE_ENV !== 'production' iken http://localhost[:port] serbest.
 */
const ALLOW_METHODS = 'GET, POST, OPTIONS';
const ALLOW_HEADERS = 'X-Widget-Key, Content-Type';
const UNION_TTL_MS = 30_000;

function isDevLocalhost(origin: string): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const u = new URL(origin);
    return (
      u.protocol === 'http:' &&
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
    );
  } catch {
    return false;
  }
}

function setCorsHeaders(res: Response, origin: string): void {
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', ALLOW_METHODS);
  res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS);
  res.setHeader('Access-Control-Max-Age', '600');
}

export function createWidgetCors(supabase: SupabaseService) {
  let unionCache: { origins: Set<string>; at: number } | null = null;

  async function globalOrigins(): Promise<Set<string>> {
    const now = Date.now();
    if (unionCache && now - unionCache.at < UNION_TTL_MS) {
      return unionCache.origins;
    }
    const { data } = await supabase.db.from('hotels').select('allowed_origins');
    const set = new Set<string>();
    for (const row of data ?? []) {
      for (const o of (row.allowed_origins as string[] | null) ?? []) {
        set.add(o);
      }
    }
    unionCache = { origins: set, at: now };
    return set;
  }

  async function hotelOrigins(key: string | undefined): Promise<Set<string> | null> {
    if (!key) return null;
    const { data } = await supabase.db
      .from('hotels')
      .select('allowed_origins')
      .eq('public_widget_key', key)
      .single();
    if (!data) return null;
    return new Set<string>((data.allowed_origins as string[] | null) ?? []);
  }

  return function widgetCors(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');

    // Preflight: global birleşim üzerinden geçir (asıl yetki gerçek istekte).
    if (req.method === 'OPTIONS') {
      void (async () => {
        if (origin && (isDevLocalhost(origin) || (await globalOrigins()).has(origin))) {
          setCorsHeaders(res, origin);
        }
        res.status(204).end();
      })();
      return;
    }

    // Origin yoksa CORS uygulanmaz (server-side / non-browser) -> geç.
    if (!origin) {
      next();
      return;
    }

    void (async () => {
      const key =
        (req.headers['x-widget-key'] as string | undefined) ??
        (req.query?.key as string | undefined);
      const allowed = await hotelOrigins(key);
      if (isDevLocalhost(origin) || (allowed && allowed.has(origin))) {
        setCorsHeaders(res, origin);
        next();
        return;
      }
      res.status(403).json({
        success: false,
        data: null,
        error: { code: 'forbidden', message: 'origin not allowed' },
      });
    })();
  };
}
