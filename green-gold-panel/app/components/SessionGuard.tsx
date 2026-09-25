'use client';
import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export function SessionGuard({ userId }: { userId: string }) {
  useEffect(() => {
    const supabase = createClient();
    let leaving = false;
    const checkIdentity = (nextId: string | undefined) => {
      if (leaving || nextId === userId) return;
      leaving = true;
      try { sessionStorage.removeItem('greengold_demo_carbon_preview'); } catch {}
      window.location.replace(nextId ? '/' : '/login');
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      checkIdentity(session?.user.id);
    });
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      checkIdentity(data.session?.user.id);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') void check(); };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener('focus', onVisible);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(onVisible, 15000);
    return () => {
      leaving = true;
      subscription.unsubscribe();
      clearInterval(timer);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId]);
  return null;
}
