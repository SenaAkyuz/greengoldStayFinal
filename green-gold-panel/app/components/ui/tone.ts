/**
 * Durum tonları — bileşenler arası ortak sözlük. İş mantığı bir durumu
 * (ör. "onay bekliyor") bir TONA eşler; tonun rengi yalnızca tasarım
 * token'larında tanımlıdır.
 */
export type Tone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'pending';

export const TONES: readonly Tone[] = [
  'neutral',
  'info',
  'success',
  'warning',
  'danger',
  'pending',
];
