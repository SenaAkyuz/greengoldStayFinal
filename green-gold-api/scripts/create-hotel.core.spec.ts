import {
  validateInput,
  planCreateHotel,
  runCreateHotel,
  type CreateHotelDeps,
} from './create-hotel.core';

describe('validateInput', () => {
  it('geçerli minimum girdi -> normalize', () => {
    const inp = validateInput({ name: '  Deniz Otel ', adminEmail: 'A@B.CO' });
    expect(inp.name).toBe('Deniz Otel');
    expect(inp.adminEmail).toBe('a@b.co');
    expect(inp.timezone).toBe('Europe/Istanbul');
    expect(inp.hotelType).toBe('city');
    expect(inp.city).toBeNull();
    expect(inp.adminName).toBe('a');
  });

  it('ad yoksa reddedilir', () => {
    expect(() => validateInput({ adminEmail: 'a@b.co' })).toThrow(/Otel adı/);
  });
  it('geçersiz e-posta reddedilir', () => {
    expect(() => validateInput({ name: 'X', adminEmail: 'notanemail' })).toThrow(
      /e-posta/,
    );
  });
  it('geçersiz timezone reddedilir', () => {
    expect(() =>
      validateInput({ name: 'X', adminEmail: 'a@b.co', timezone: 'Mars/Base' }),
    ).toThrow(/timezone/);
  });
  it('geçersiz hotel_type reddedilir', () => {
    expect(() =>
      validateInput({ name: 'X', adminEmail: 'a@b.co', hotelType: 'luxury' }),
    ).toThrow(/hotel_type/);
  });
});

// --- deps mock'u ---
interface Calls {
  inserted?: Record<string, unknown>;
  userRow?: Record<string, unknown>;
  deletedHotel: string[];
  deletedAuth: string[];
  invited: string[];
}
function makeDeps(over: Partial<CreateHotelDeps> = {}): {
  deps: CreateHotelDeps;
  calls: Calls;
} {
  const calls: Calls = {
    deletedHotel: [],
    deletedAuth: [],
    invited: [],
  };
  const deps: CreateHotelDeps = {
    // preflight: hepsi temiz (çakışma yok)
    authUserExists: async () => false,
    userProfileByEmail: async () => null,
    hotelNameExists: async () => false,
    hotelCodeExists: async () => false,
    genHotelCode: () => 'HTL-TEST',
    // writes
    insertHotel: async (row) => {
      calls.inserted = row;
      return { id: 'hotel-1', public_widget_key: 'key-xyz' };
    },
    deleteHotel: async (id) => {
      calls.deletedHotel.push(id);
    },
    createAuthUser: async (email, opts) => {
      calls.invited.push(email);
      return {
        id: 'auth-1',
        inviteLink: opts.password ? null : 'https://sb/verify?token=abc',
      };
    },
    deleteAuthUser: async (id) => {
      calls.deletedAuth.push(id);
    },
    insertUser: async (row) => {
      calls.userRow = row;
      return { id: 'user-1' };
    },
    ...over,
  };
  return { deps, calls };
}

const INPUT = validateInput({
  name: 'Pilot Otel',
  city: 'İstanbul',
  timezone: 'Europe/Istanbul',
  hotelType: 'city',
  adminEmail: 'yonetici@otel.com',
  adminName: 'Yönetici',
});

const REDIRECT = 'http://localhost:3001/auth/callback?next=/set-password';

describe('planCreateHotel (dry-run)', () => {
  it('doğrulama + preflight yapar ama HİÇBİR yazma çağrısı yapmaz', async () => {
    const { deps, calls } = makeDeps();
    const spyInsert = jest.spyOn(deps, 'insertHotel');
    const spyInvite = jest.spyOn(deps, 'createAuthUser');
    const spyUser = jest.spyOn(deps, 'insertUser');

    const plan = await planCreateHotel(INPUT, deps);

    expect(plan.status).toBe('pending');
    expect(plan.hotelCode).toBe('HTL-TEST');
    expect(spyInsert).not.toHaveBeenCalled();
    expect(spyInvite).not.toHaveBeenCalled();
    expect(spyUser).not.toHaveBeenCalled();
    expect(calls.deletedHotel).toHaveLength(0);
  });

  it('çakışma varsa dry-run da reddeder (yazma yok)', async () => {
    const { deps } = makeDeps({
      userProfileByEmail: async () => ({ hotelName: 'Başka Otel' }),
    });
    await expect(planCreateHotel(INPUT, deps)).rejects.toThrow(/Başka Otel/);
  });
});

describe('runCreateHotel', () => {
  it("otel 'pending' + davet linki; kullanıcı otele bağlı (tenant izolasyonu)", async () => {
    const { deps, calls } = makeDeps();
    const res = await runCreateHotel(INPUT, deps, REDIRECT);

    expect(res.hotelId).toBe('hotel-1');
    expect(res.publicWidgetKey).toBe('key-xyz');
    expect(res.inviteLink).toBe('https://sb/verify?token=abc');
    expect((res as { tempPassword?: string }).tempPassword).toBeUndefined();

    expect(calls.inserted).toMatchObject({
      name: 'Pilot Otel',
      status: 'pending', // active DEĞİL
      hotel_code: 'HTL-TEST',
      hotel_type: 'city',
    });
    expect(calls.userRow).toMatchObject({
      hotel_id: 'hotel-1',
      auth_user_id: 'auth-1',
      email: 'yonetici@otel.com',
      role: 'otel_yoneticisi',
    });
    expect(calls.deletedHotel).toHaveLength(0);
    expect(calls.deletedAuth).toHaveLength(0);
  });

  it('preflight: e-posta public.users\'ta -> net mesajla çık, yazma yok', async () => {
    const { deps, calls } = makeDeps({
      userProfileByEmail: async () => ({ hotelName: 'Deniz Otel' }),
    });
    await expect(runCreateHotel(INPUT, deps, REDIRECT)).rejects.toThrow(
      /'Deniz Otel' oteline bağlı/,
    );
    expect(calls.inserted).toBeUndefined();
    expect(calls.invited).toHaveLength(0);
  });

  it('preflight: e-posta auth.users\'ta -> reddet', async () => {
    const { deps, calls } = makeDeps({ authUserExists: async () => true });
    await expect(runCreateHotel(INPUT, deps, REDIRECT)).rejects.toThrow(
      /Auth'ta zaten kayıtlı/,
    );
    expect(calls.inserted).toBeUndefined();
  });

  it('preflight: otel adı mevcut -> reddet', async () => {
    const { deps } = makeDeps({ hotelNameExists: async () => true });
    await expect(runCreateHotel(INPUT, deps, REDIRECT)).rejects.toThrow(
      /adında bir otel zaten var/,
    );
  });

  it('otel kodu çakışırsa yeniden üretir', async () => {
    let n = 0;
    const { deps, calls } = makeDeps({
      genHotelCode: () => `HTL-${n++}`,
      hotelCodeExists: async (code) => code === 'HTL-0', // ilk kod çakışır
    });
    const res = await runCreateHotel(INPUT, deps, REDIRECT);
    expect(res.hotelCode).toBe('HTL-1');
    expect(calls.inserted).toMatchObject({ hotel_code: 'HTL-1' });
  });

  it('demo rolü + şifre: role yazılır, davet linki YOK', async () => {
    const demoInput = validateInput({
      name: 'Green Gold Demo Otel',
      adminEmail: 'demo@greengold.example',
      role: 'demo_viewer',
      password: 'demopass123',
    });
    const { deps, calls } = makeDeps();
    const res = await runCreateHotel(demoInput, deps, REDIRECT);
    expect(res.role).toBe('demo_viewer');
    expect(res.inviteLink).toBeNull();
    expect(calls.userRow).toMatchObject({ role: 'demo_viewer' });
  });

  it('geçersiz role reddedilir', () => {
    expect(() =>
      validateInput({ name: 'X', adminEmail: 'a@b.co', role: 'superadmin' }),
    ).toThrow(/role/);
  });

  it('davet linki üretilemezse otel geri alınır (rollback)', async () => {
    const { deps, calls } = makeDeps({
      createAuthUser: async () => {
        throw new Error('davet patladı');
      },
    });
    await expect(runCreateHotel(INPUT, deps, REDIRECT)).rejects.toThrow(
      'davet patladı',
    );
    expect(calls.deletedHotel).toEqual(['hotel-1']);
    expect(calls.deletedAuth).toHaveLength(0);
  });

  it('profil satırı açılamazsa auth + otel geri alınır (rollback)', async () => {
    const { deps, calls } = makeDeps({
      insertUser: async () => {
        throw new Error('profil patladı');
      },
    });
    await expect(runCreateHotel(INPUT, deps, REDIRECT)).rejects.toThrow(
      'profil patladı',
    );
    expect(calls.deletedAuth).toEqual(['auth-1']);
    expect(calls.deletedHotel).toEqual(['hotel-1']);
  });
});
