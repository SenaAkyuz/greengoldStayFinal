'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function signOut() {
  const supabase = await createClient();
  // scope: 'local' — yalnızca bu tarayıcının oturumunu kapat. Global scope
  // paylaşılan demo hesabında bir ziyaretçinin çıkışında DİĞER tüm demo
  // ziyaretçilerini de düşürürdü. Gerçek kullanıcı için de local yeterli.
  await supabase.auth.signOut({ scope: 'local' });
  redirect('/login');
}
