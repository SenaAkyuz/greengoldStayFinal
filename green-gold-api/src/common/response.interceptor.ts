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
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ResponseEnvelope<T> | T>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ResponseEnvelope<T> | T> {
    return next.handle().pipe(
      map((data) => {
        if (
          data !== null &&
          typeof data === 'object' &&
          'success' in (data as Record<string, unknown>)
        ) {
          return data as T;
        }
        return { success: true, data, error: null } as ResponseEnvelope<T>;
      }),
    );
  }
}
