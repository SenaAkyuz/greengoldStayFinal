import type { ProfileErrors } from '@/lib/carbon-ui/profile';

/** Tesis profili kaydının sonucu (Server Action ↔ form). */
export interface ProfileSaveState {
  status: 'idle' | 'success' | 'error';
  message: string;
  fieldErrors?: ProfileErrors;
}

export const PROFILE_IDLE: ProfileSaveState = { status: 'idle', message: '' };
