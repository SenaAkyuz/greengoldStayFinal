import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/** Değerin geçerli bir IANA timezone olup olmadığını Intl ile doğrular. */
export function isValidTimeZone(tz: unknown): boolean {
  if (typeof tz !== 'string' || tz.length === 0) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

@ValidatorConstraint({ name: 'isIanaTimeZone', async: false })
class IsIanaTimeZoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return isValidTimeZone(value);
  }
  defaultMessage(): string {
    return 'timezone geçerli bir IANA zaman dilimi olmalı (ör. Europe/Istanbul).';
  }
}

export function IsIanaTimeZone(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options,
      constraints: [],
      validator: IsIanaTimeZoneConstraint,
    });
  };
}
