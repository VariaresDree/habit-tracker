import { getSupabase, isSyncConfigured } from './client';

export interface SyncUser {
  id: string;
  email: string;
}

// Email one-time codes: no password to manage, and no browser-tab detour
// that would bounce an installed PWA out to Safari/Chrome.
export async function sendCode(email: string): Promise<void> {
  const { error } = await getSupabase().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw new Error(error.message);
}

export async function verifyCode(email: string, code: string): Promise<SyncUser> {
  const { data, error } = await getSupabase().auth.verifyOtp({
    email,
    token: code.trim(),
    type: 'email',
  });
  if (error) throw new Error(error.message);
  const user = data.user;
  if (!user) throw new Error('Sign-in did not return a user.');
  return { id: user.id, email: user.email ?? email };
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut();
}

// supabase-js persists the session itself; this restores it on app start.
export async function getCurrentUser(): Promise<SyncUser | null> {
  if (!isSyncConfigured()) return null;
  const { data } = await getSupabase().auth.getSession();
  const user = data.session?.user;
  return user ? { id: user.id, email: user.email ?? '' } : null;
}
