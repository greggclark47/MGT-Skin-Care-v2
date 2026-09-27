'use client';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AdminApiClient } from '@mgt/shared';
import type { AdminRole, Permission } from '@mgt/domain';

// Admin identity for the console.
//
// Identity is currently an `x-admin-user-id` header, which is a DEVELOPMENT SEAM, not auth: a
// header the browser controls is a claim, not a credential. The console is written so that
// replacing this provider with one backed by a real session is the only change needed --
// nothing below it constructs the header itself, and every screen takes its roles from the
// server's /admin/me rather than from anything it decided locally.
//
// Until that swap happens the admin console must not be exposed publicly. The server-side
// checks are real (unknown id -> 403, every mutation audited, approval gated on the SME role),
// so this is a front-door problem, not a hole in the workflow.

const STORAGE_KEY = 'mgt_admin_user_id';

export interface AdminMe {
  id: string;
  roles: AdminRole[];
  is_sme: boolean;
  permissions: Permission[];
}

interface AdminIdentityValue {
  adminUserId: string;
  setAdminUserId: (id: string) => void;
  me: AdminMe | null;
  /** null while loading, then the server's answer; an error means the id is not an admin. */
  error: string | null;
  loading: boolean;
  api: AdminApiClient;
  can: (permission: Permission) => boolean;
}

const AdminIdentityContext = createContext<AdminIdentityValue | null>(null);

export function useAdminIdentity(): AdminIdentityValue {
  const ctx = useContext(AdminIdentityContext);
  if (!ctx) throw new Error('useAdminIdentity must be used inside <AdminIdentityProvider>');
  return ctx;
}

export function AdminIdentityProvider({ baseUrl, children }: { baseUrl: string; children: React.ReactNode }) {
  const [adminUserId, setAdminUserIdState] = useState('');
  const [me, setMe] = useState<AdminMe | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = typeof window === 'undefined' ? '' : (window.sessionStorage.getItem(STORAGE_KEY) ?? '');
    setAdminUserIdState(stored);
  }, []);

  const api = useMemo(() => new AdminApiClient(baseUrl, adminUserId), [baseUrl, adminUserId]);

  useEffect(() => {
    if (!adminUserId) {
      setMe(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`${baseUrl}/admin/me`, { headers: { 'x-admin-user-id': adminUserId } })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setMe(null);
          setError(res.status === 403 ? 'This account has no admin access.' : 'Could not resolve admin identity.');
        } else {
          setMe(json as AdminMe);
          setError(null);
        }
      })
      .catch(() => { if (!cancelled) setError('API unreachable.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [baseUrl, adminUserId]);

  function setAdminUserId(id: string) {
    if (typeof window !== 'undefined') window.sessionStorage.setItem(STORAGE_KEY, id);
    setAdminUserIdState(id);
  }

  const value: AdminIdentityValue = {
    adminUserId, setAdminUserId, me, error, loading, api,
    // Permission checks read the server's answer. The console never computes permissions from
    // a role list it assembled itself, so it cannot drift from what the API will actually do.
    can: (permission) => Boolean(me?.permissions.includes(permission)),
  };

  return <AdminIdentityContext.Provider value={value}>{children}</AdminIdentityContext.Provider>;
}
