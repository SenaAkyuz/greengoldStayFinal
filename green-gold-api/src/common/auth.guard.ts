import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { SupabaseService } from '../supabase/supabase.service';
import { IS_PUBLIC_KEY } from './route-metadata';

export interface AuthContext {
  authUserId: string;
  hotelId: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  auth: AuthContext;
}

/**
 * Supabase Auth guard.
 *   1. Bearer token'ı al, supabase.auth.getUser(token) ile doğrula -> auth.uid().
 *   2. public.users'tan auth_user_id = uid ile satırı çek -> hotel_id & role'ü request'e koy.
 *   3. Geçersizse -> 401.
 *
 * request.auth.hotel_id tenant izolasyonunun ASIL kaynağıdır (sorgular bununla filtrelenir).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // @Public() ile işaretli uçlar (widget, health) auth'tan muaf.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Bearer token gerekli.');
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      throw new UnauthorizedException('Bearer token gerekli.');
    }

    const { data, error } = await this.supabase.getUserFromToken(token);
    if (error || !data?.user) {
      throw new UnauthorizedException('Geçersiz veya süresi dolmuş token.');
    }

    const authUserId = data.user.id;

    const { data: profile, error: profileError } = await this.supabase.db
      .from('users')
      .select('hotel_id, role')
      .eq('auth_user_id', authUserId)
      .single();

    if (profileError || !profile) {
      throw new UnauthorizedException('Kullanıcı profili bulunamadı.');
    }

    req.auth = {
      authUserId,
      hotelId: profile.hotel_id as string,
      role: profile.role as string,
    };

    return true;
  }
}
