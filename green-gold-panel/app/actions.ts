'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { isAuthCookie } from '@/lib/supabase/cookie-policy';
import { revalidatePath } from 'next/cache';

export async function signOut() {
  const supabase = await createClient();
  // scope: 'local' — yalnızca bu tarayıcının oturumunu kapat. Global scope
  // paylaşılan demo hesabında bir ziyaretçinin çıkışında DİĞER tüm demo
  // ziyaretçilerini de düşürürdü. Gerçek kullanıcı için de local yeterli.
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // Local cleanup must also work during an Auth service outage.
  } finally {
    const store = await cookies();
    for (const { name } of store.getAll()) {
      if (isAuthCookie(name)) store.set(name, '', { path: '/', maxAge: 0 });
    }
    revalidatePath('/', 'layout');
  }
  redirect('/login');
}
