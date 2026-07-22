import type { WidgetConfig, WidgetEventType } from './types';

/** Public config'i çeker. Hata/geçersiz key -> null (widget sessizce render etmez). */
export async function fetchConfig(
  apiBase: string,
  key: string,
): Promise<WidgetConfig | null> {
  try {
    const res = await fetch(
      `${apiBase}/widget/config?key=${encodeURIComponent(key)}`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success: boolean;
      data: WidgetConfig | null;
    };
    if (!json.success || !json.data) return null;
    return json.data;
  } catch {
    return null;
  }
}

/**
 * Event gönderir. FIRE-AND-FORGET: UI'ı bloklamaz, ağ hatasını sessizce yutar.
 * Widget host sayfayı asla patlatmamalı.
 */
export function sendEvent(
  apiBase: string,
  key: string,
  eventType: WidgetEventType,
  sessionRef: string,
  metadata: Record<string, unknown>,
): void {
  try {
    void fetch(`${apiBase}/widget/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Widget-Key': key,
      },
      body: JSON.stringify({
        event_type: eventType,
        session_ref: sessionRef,
        metadata,
      }),
      keepalive: true,
    }).catch(() => {
      /* sessizce yut */
    });
  } catch {
    /* sessizce yut */
  }
}
