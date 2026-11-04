import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as Iron from 'iron-webcrypto';
import { env } from 'cloudflare:workers';

function getEnv(): Env {
  return env as Env;
}

function getSupabase(): SupabaseClient {
  const e = getEnv();
  const supabaseUrl = e.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) throw new Error('EXPO_PUBLIC_SUPABASE_URL not set');
  const supabaseServiceKey = e.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseServiceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    db: {
      schema: 'public',
    },
  });
}

export async function sealSessionData(data: object): Promise<string> {
  const ironKey = getEnv().IRON_KEY;
  return await Iron.seal(data, ironKey, Iron.defaults);
}

export async function unsealSessionData<T = object>(sealed: string): Promise<T> {
  const ironKey = getEnv().IRON_KEY;
  return (await Iron.unseal(sealed, ironKey, Iron.defaults)) as T;
}

/**
 * Find the IC userID previously stored for a student, matched by personID and
 * district (personIDs are only unique within a district).
 */
export async function findStoredUserID(personID: number, baseURL: string): Promise<number | null> {
  const { data, error } = await getSupabase()
    .from('ic_sessions')
    .select('user_id, session_token')
    .eq('person_id', personID);
  if (error || !data) return null;

  for (const row of data) {
    try {
      const session = await unsealSessionData<{ baseURL?: string }>(row.session_token);
      if (session.baseURL === baseURL) return row.user_id;
    } catch {
      // Ignore rows sealed with an older key.
    }
  }
  return null;
}

export async function createICSession(
  userID: number,
  personId: number,
  sessionToken: string
): Promise<string | null> {
  const supabase = getSupabase();
  const uuid = `${userID}.${personId}`;

  const { data, error } = await supabase
    .from('ic_sessions')
    .upsert({
      uuid: uuid,
      user_id: userID,
      person_id: personId,
      session_token: sessionToken,
    })
    .select('uuid')
    .single();

  if (error) {
    console.error('Error creating IC session:', error);
    return null;
  }

  return data?.uuid || null;
}

export type WebPairAttemptStatus = 'pending' | 'approved' | 'consumed' | 'expired';

export type WebPairAttempt = {
  id: string;
  status: WebPairAttemptStatus;
  expiresAt: string;
  approvedSessionToken: string | null;
};

function mapWebPairAttempt(data: {
  id: string;
  status: WebPairAttemptStatus;
  expires_at: string;
  approved_session_token: string | null;
}): WebPairAttempt {
  return {
    id: data.id,
    status: data.status,
    expiresAt: data.expires_at,
    approvedSessionToken: data.approved_session_token,
  };
}

export async function createWebPairAttempt(
  id: string,
  approvalTokenHash: string,
  completionTokenHash: string,
  expiresAt: string
): Promise<boolean> {
  const supabase = getSupabase();
  const { error } = await supabase.from('web_pair_attempts').insert({
    id,
    approval_token_hash: approvalTokenHash,
    completion_token_hash: completionTokenHash,
    status: 'pending',
    expires_at: expiresAt,
  });

  if (error) {
    console.error('Error creating web pair attempt:', error);
    return false;
  }

  return true;
}

export async function approveWebPairAttempt(
  id: string,
  approvalTokenHash: string,
  sessionToken: string
): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('web_pair_attempts')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_session_token: sessionToken,
    })
    .eq('id', id)
    .eq('approval_token_hash', approvalTokenHash)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error approving web pair attempt:', error);
    return false;
  }

  return !!data;
}

export async function getWebPairAttemptForCompletion(
  id: string,
  completionTokenHash: string
): Promise<WebPairAttempt | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('web_pair_attempts')
    .select('id, status, expires_at, approved_session_token')
    .eq('id', id)
    .eq('completion_token_hash', completionTokenHash)
    .maybeSingle();

  if (error) {
    console.error('Error fetching web pair attempt:', error);
    return null;
  }

  return data ? mapWebPairAttempt(data) : null;
}

export async function consumeWebPairAttempt(
  id: string,
  completionTokenHash: string
): Promise<boolean> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('web_pair_attempts')
    .update({
      status: 'consumed',
      consumed_at: new Date().toISOString(),
      approved_session_token: null,
    })
    .eq('id', id)
    .eq('completion_token_hash', completionTokenHash)
    .eq('status', 'approved')
    .gt('expires_at', new Date().toISOString())
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error consuming web pair attempt:', error);
    return false;
  }

  return !!data;
}

export async function expireWebPairAttempt(id: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('web_pair_attempts')
    .update({
      status: 'expired',
      approved_session_token: null,
    })
    .eq('id', id)
    .in('status', ['pending', 'approved'])
    .lte('expires_at', new Date().toISOString());

  if (error) {
    console.error('Error expiring web pair attempt:', error);
  }
}
