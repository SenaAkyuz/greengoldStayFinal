import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** Dev'de (prod DEĞİL) http://localhost[:port] origin'ine izin verilir mi. */
function devLocalhostAllowed(): boolean {
  return process.env.NODE_ENV !== 'production';
}

/**
 * Geçerli bir CORS origin mi: `scheme://host[:port]`, path/query yok, wildcard yok.
 * https zorunlu; dev'de http://localhost istisnası.
 */
export function isValidOrigin(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (value.includes('*')) return false;

  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }

  // Yalnızca origin: path (/ hariç), query, fragment, kimlik bilgisi olamaz.
  if (u.pathname !== '/' && u.pathname !== '') return false;
  if (u.search || u.hash || u.username || u.password) return false;

  // Girdi tam olarak origin'e eşit olmalı (normalize: sondaki / kırp).
  const norm = value.replace(/\/+$/, '');
  if (u.origin !== norm) return false;

  if (u.protocol === 'https:') return true;
  if (
    devLocalhostAllowed() &&
    u.protocol === 'http:' &&
    (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
  ) {
    return true;
  }
  return false;
}

@ValidatorConstraint({ name: 'isOriginArray', async: false })
class IsOriginArrayConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!Array.isArray(value)) return false;
    return value.every((v) => isValidOrigin(v));
  }
  defaultMessage(args: ValidationArguments): string {
    return `${args.property} yalnızca geçerli origin'ler içerebilir (https://host[:port], wildcard yok).`;
  }
}

/** Bir string[]'in tümünün geçerli origin olduğunu doğrular. */
export function IsOriginArray(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsOriginArrayConstraint,
    });
  };
}
