import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * service_role client'ı sağlar. service_role RLS'i BYPASS eder ve tam yetkilidir —
 * yalnızca sunucu tarafında kullanılır, asla client'a sızmaz.
 *
 * Tenant izolasyonu bu client ile OTOMATİK sağlanmaz; her sorgu API katmanında
 * (auth guard'dan gelen hotel_id ile) kod içinde filtrelenmek ZORUNDADIR.
 */
@Injectable()
export class SupabaseService implements OnModuleInit {
  private client!: SupabaseClient;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.config.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    if (!url || !serviceRoleKey) {
      throw new Error(
        'SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY ortam değişkenleri zorunludur.',
      );
    }

    this.client = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  /** service_role client (RLS bypass). */
  get db(): SupabaseClient {
    return this.client;
  }

  /**
   * Verilen access token'ı doğrular ve auth.users kaydını döndürür.
   * (auth.getUser token'ı server tarafında güvenle doğrular.)
   */
  async getUserFromToken(accessToken: string) {
    return this.client.auth.getUser(accessToken);
  }
}
