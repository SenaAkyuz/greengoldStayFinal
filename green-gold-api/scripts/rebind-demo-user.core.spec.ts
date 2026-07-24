import {
  runRebindDemoUser,
  type RebindDeps,
  type UserProfile,
} from './rebind-demo-user.core';

const INPUT = {
  demoEmail: 'demo@greengold.example',
  hotelName: 'Green Gold Demo Otel',
  city: 'Antalya',
  timezone: 'Europe/Istanbul',
};

interface Calls {
  inserted: Record<string, unknown>[];
  updated: { id: string; patch: Record<string, unknown> }[];
  deleted: string[];
  createdHotel: boolean;
}

function makeDeps(opts: {
  authUser?: { id: string } | null;
  demoHotel?: { id: string } | null;
  profiles?: UserProfile[];
}): { deps: RebindDeps; calls: Calls } {
  const calls: Calls = {
    inserted: [],
    updated: [],
    deleted: [],
    createdHotel: false,
  };
  const deps: RebindDeps = {
    findAuthUserByEmail: async () =>
      opts.authUser === undefined ? { id: 'auth-demo' } : opts.authUser,
    findDemoHotelByName: async () => opts.demoHotel ?? null,
    createDemoHotel: async () => {
      calls.createdHotel = true;
      return { id: 'demo-hotel' };
    },
    listUserProfilesByEmail: async () => opts.profiles ?? [],
    insertUserProfile: async (row) => {
      calls.inserted.push(row);
      return { id: 'new-profile' };
    },
    updateUserProfile: async (id, patch) => {
      calls.updated.push({ id, patch });
    },
    deleteUserProfile: async (id) => {
      calls.deleted.push(id);
    },
  };
  return { deps, calls };
}

describe('runRebindDemoUser', () => {
  it('demo Auth kullanıcısı yoksa hata (yeni oluşturmaz)', async () => {
    const { deps } = makeDeps({ authUser: null });
    await expect(runRebindDemoUser(INPUT, deps)).rejects.toThrow(
      /Auth kullanıcısı bulunamadı/,
    );
  });

  it('pilot otele bağlı mevcut profili demo otele yeniden bağlar', async () => {
    const { deps, calls } = makeDeps({
      demoHotel: { id: 'demo-hotel' },
      profiles: [
        {
          id: 'p1',
          hotel_id: 'pilot-hotel',
          auth_user_id: 'auth-demo',
          role: 'otel_yoneticisi',
        },
      ],
    });
    const res = await runRebindDemoUser(INPUT, deps);
    expect(res.action).toBe('rebound');
    expect(res.deletedOrphans).toBe(0);
    expect(calls.updated).toEqual([
      {
        id: 'p1',
        patch: {
          hotel_id: 'demo-hotel',
          role: 'demo_viewer',
          auth_user_id: 'auth-demo',
        },
      },
    ]);
    expect(calls.inserted).toHaveLength(0);
  });

  it('yetim temizliği: fazla profiller silinir, tek kanonik kalır', async () => {
    const { deps, calls } = makeDeps({
      demoHotel: { id: 'demo-hotel' },
      profiles: [
        { id: 'p1', hotel_id: 'pilot', auth_user_id: 'auth-demo', role: 'x' },
        { id: 'p2', hotel_id: 'other', auth_user_id: null, role: 'y' },
        { id: 'p3', hotel_id: 'x', auth_user_id: null, role: 'z' },
      ],
    });
    const res = await runRebindDemoUser(INPUT, deps);
    expect(res.profileId).toBe('p1'); // auth eşleşen kanonik
    expect(res.deletedOrphans).toBe(2);
    expect(calls.deleted.sort()).toEqual(['p2', 'p3']);
  });

  it('profil yoksa tek profil oluşturur (auth kullanıcı zaten var)', async () => {
    const { deps, calls } = makeDeps({
      demoHotel: { id: 'demo-hotel' },
      profiles: [],
    });
    const res = await runRebindDemoUser(INPUT, deps);
    expect(res.action).toBe('created');
    expect(calls.inserted).toHaveLength(1);
    expect(calls.inserted[0]).toMatchObject({
      hotel_id: 'demo-hotel',
      role: 'demo_viewer',
      auth_user_id: 'auth-demo',
    });
  });

  it('demo otel yoksa oluşturur', async () => {
    const { deps, calls } = makeDeps({ demoHotel: null, profiles: [] });
    const res = await runRebindDemoUser(INPUT, deps);
    expect(res.hotelCreated).toBe(true);
    expect(calls.createdHotel).toBe(true);
  });

  it('idempotent: ikinci çalıştırma no-op benzeri (rebound, 0 yetim)', async () => {
    // İlk koşudan sonraki durum: tek profil, demo otele ve demo_viewer'a bağlı.
    const { deps, calls } = makeDeps({
      demoHotel: { id: 'demo-hotel' },
      profiles: [
        {
          id: 'p1',
          hotel_id: 'demo-hotel',
          auth_user_id: 'auth-demo',
          role: 'demo_viewer',
        },
      ],
    });
    const res = await runRebindDemoUser(INPUT, deps);
    expect(res.action).toBe('rebound');
    expect(res.deletedOrphans).toBe(0);
    expect(calls.deleted).toHaveLength(0);
    expect(calls.inserted).toHaveLength(0);
  });

  it('dry-run: hiçbir yazma yapmaz', async () => {
    const { deps, calls } = makeDeps({
      demoHotel: null,
      profiles: [
        { id: 'p1', hotel_id: 'pilot', auth_user_id: 'auth-demo', role: 'x' },
        { id: 'p2', hotel_id: 'other', auth_user_id: null, role: 'y' },
      ],
    });
    const res = await runRebindDemoUser(INPUT, deps, { dryRun: true });
    expect(res.deletedOrphans).toBe(1);
    expect(calls.createdHotel).toBe(false);
    expect(calls.updated).toHaveLength(0);
    expect(calls.deleted).toHaveLength(0);
    expect(calls.inserted).toHaveLength(0);
  });
});
