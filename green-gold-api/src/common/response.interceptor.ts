import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ResponseEnvelope<T> {
  success: true;
  data: T;
  error: null;
}

/**
 * Başarılı cevapları { success: true, data, error: null } zarfına sarar.
 * Handler zaten zarf döndürdüyse (success alanı varsa) tekrar sarmaz.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  ResponseEnvelope<T> | T
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ResponseEnvelope<T> | T> {
    // `CallHandler.handle()` Observable<any> döner; parametreyi T olarak
    // tiplemek zarfın içeriğini derleyici için görünür kılar (no-unsafe-*).
    return next.handle().pipe(
      map((data: T) => {
        if (
          data !== null &&
          typeof data === 'object' &&
          'success' in (data as Record<string, unknown>)
        ) {
          return data;
        }
        return { success: true, data, error: null };
      }),
    );
  }
}
