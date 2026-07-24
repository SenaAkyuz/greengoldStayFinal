import { SetMetadata } from '@nestjs/common';

/**
 * @Public() — global AuthGuard'ı atlar (auth gerektirmeyen public uçlar için;
 * ör. /widget/*, /internal/health).
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * @AllowDemoWrite() — global DemoReadOnlyGuard'ın yazma yasağına AÇIK istisna.
 * Deny-by-default: bu decorator olmadan demo_viewer için tüm yazma metotları
 * kapalı; bir ucu bilerek açmak için eklenir.
 */
export const ALLOW_DEMO_WRITE_KEY = 'allowDemoWrite';
export const AllowDemoWrite = () => SetMetadata(ALLOW_DEMO_WRITE_KEY, true);
