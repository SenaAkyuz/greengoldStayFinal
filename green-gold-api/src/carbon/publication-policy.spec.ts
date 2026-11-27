import { ConflictException } from '@nestjs/common';
import {
  INTERNAL_USE_PERMISSION,
  INTERNAL_USE_PUBLISH_ALLOWED,
  PERMITTED_SCOPES,
  assertPublishable,
  calculatedScopes,
  publicationBlock,
  scopesPermitted,
} from './publication-policy';

const connectHub = (
  scopes: unknown,
  countryPublishable: boolean | undefined = true,
) => ({
  verification_status: 'internal_use',
  form_data: {
    api: 'connecthub',
    pricing: { internal_use: true, coverage: { scopes_calculated: scopes } },
    ...(countryPublishable === undefined
      ? {}
      : { country_check: { publishable: countryPublishable } }),
  },
});

describe('publication-policy — misafir fiyatına yayın kapısı', () => {
  it('yazılı izin (2026-11-27) açık; yalnız Kapsam 1 ve 2, WTT/faktör/nötrlük yok', () => {
    expect(INTERNAL_USE_PUBLISH_ALLOWED).toBe(true);
    expect([...PERMITTED_SCOPES]).toEqual([1, 2]);
    expect(INTERNAL_USE_PERMISSION).toMatchObject({
      granted_on: '2026-11-27',
      wtt_included: false,
      factors_disclosed: false,
      neutrality_claims: false,
    });
  });

  it('eski CCA ölçümü (unverified, internal_use işareti yok) etkilenmez', () => {
    expect(
      publicationBlock({
        verification_status: 'unverified',
        form_data: {
          pricing: { provider: 'threepmetrics', coefficient_kg: 8 },
        },
      }),
    ).toBeNull();
    expect(
      publicationBlock({ verification_status: null, form_data: null }),
    ).toBeNull();
  });

  it('ConnectHub ölçümü: ülke doğrulandı + Kapsam 1/2 → yayınlanabilir', () => {
    expect(publicationBlock(connectHub([1, 2]))).toBeNull();
    expect(publicationBlock(connectHub([2]))).toBeNull();
  });

  it('Kapsam 3 (WTT dahil) ya da kapsam bilgisi yoksa yayınlanmaz (fail closed)', () => {
    expect(publicationBlock(connectHub([1, 2, 3]))).toBe(
      'carbon_measurement_scope_not_permitted',
    );
    expect(publicationBlock(connectHub([]))).toBe(
      'carbon_measurement_scope_not_permitted',
    );
    expect(publicationBlock(connectHub(undefined))).toBe(
      'carbon_measurement_scope_not_permitted',
    );
    expect(publicationBlock(connectHub(['1']))).toBe(
      'carbon_measurement_scope_not_permitted',
    );
    // Yalnız fiyat işareti de internal_use sayılır:
    expect(
      publicationBlock({
        verification_status: 'unverified',
        form_data: { pricing: { internal_use: true } },
      }),
    ).toBe('carbon_measurement_scope_not_permitted');
  });

  it('kapsam bilgisi calculation.coverage içinden de okunur', () => {
    expect(
      calculatedScopes({
        calculation: { coverage: { scopes_calculated: [1] } },
      }),
    ).toEqual([1]);
    expect(calculatedScopes(null)).toBeNull();
    expect(scopesPermitted([1, 2])).toBe(true);
    expect(scopesPermitted([1, 3])).toBe(false);
    expect(scopesPermitted(null)).toBe(false);
  });

  it('izin varken bile ülke doğrulanmamış sonuç yayınlanmaz (ülke kapısı önce)', () => {
    expect(publicationBlock(connectHub([1, 2], false))).toBe(
      'carbon_measurement_country_unverified',
    );
    expect(publicationBlock(connectHub([1, 2, 3], false))).toBe(
      'carbon_measurement_country_unverified',
    );
  });

  it('izin kapalı olsaydı (sabit false) internal_use engeli dönerdi', () => {
    expect(publicationBlock(connectHub([1, 2]), false)).toBe(
      'carbon_measurement_internal_use',
    );
  });

  it('assertPublishable 409 + kod', () => {
    try {
      assertPublishable(connectHub([1, 2, 3]));
      throw new Error('fırlatmalıydı');
    } catch (e) {
      expect(e).toBeInstanceOf(ConflictException);
      expect((e as ConflictException).getResponse()).toMatchObject({
        code: 'carbon_measurement_scope_not_permitted',
      });
    }
    expect(() => assertPublishable(connectHub([1, 2]))).not.toThrow();
    expect(() =>
      assertPublishable({ verification_status: 'unverified' }),
    ).not.toThrow();
  });
});
