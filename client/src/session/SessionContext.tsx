import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useState,
} from 'react';
import { ApiError, apiFetch } from '../api';
import { Archetype, Character, PublicUser } from '../api-types';

export type SessionStatus =
  'loading' | 'anonymous' | 'needsCharacter' | 'ready';

/**
 * The check-in seam (Phase 1 plan): distinct from ordinary navigation.
 * Starts 'arriving' the moment a session first becomes usable (fresh
 * login, session restore on page load, or a character just created) and
 * flips to 'settled' once City Hub has rendered its arrival framing once.
 * Every later return to City Hub within the same session - after a
 * fight, after travel - reads 'settled'. Logging out resets it, so the
 * next login gets its own arrival.
 */
export type CheckIn = 'arriving' | 'settled';

interface SessionContextValue {
  status: SessionStatus;
  user: PublicUser | null;
  character: Character | null;
  checkIn: CheckIn;
  settleCheckIn: () => void;
  login: (username: string, password: string) => Promise<void>;
  register: (
    email: string,
    username: string,
    password: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  createCharacter: (name: string, archetype: Archetype) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [checkIn, setCheckIn] = useState<CheckIn>('arriving');

  const authQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiFetch<PublicUser>('GET', '/auth/me'),
    retry: false,
  });

  const characterQuery = useQuery({
    queryKey: ['character', 'me'],
    queryFn: () => apiFetch<Character>('GET', '/characters/me'),
    retry: false,
    enabled: authQuery.isSuccess,
    // HP/AP regenerate server-side on their own clock (RegenTask), with
    // nothing telling the client when that happened - polling is the
    // honest way to reflect that drift without a manual reload. Only
    // once a character actually exists, so this doesn't hammer a 404
    // every few seconds during needsCharacter.
    refetchInterval: (query) => (query.state.data ? 15_000 : false),
  });

  let status: SessionStatus = 'loading';
  if (authQuery.isError) {
    status = 'anonymous';
  } else if (authQuery.isSuccess) {
    if (characterQuery.isSuccess) {
      status = 'ready';
    } else if (
      characterQuery.isError &&
      characterQuery.error instanceof ApiError &&
      characterQuery.error.status === 404
    ) {
      status = 'needsCharacter';
    } else if (characterQuery.isError) {
      // An unexpected error (not "no character yet") - treat as anonymous
      // rather than silently stalling on 'loading' forever.
      status = 'anonymous';
    }
  }

  const settleCheckIn = useCallback(() => setCheckIn('settled'), []);

  // ['character', 'me'] is the same cache key no matter which account is
  // signed in - real bug found by playing this: logging out used
  // queryClient.setQueryData(['auth', 'me'], undefined) to clear the
  // session, but setQueryData with an undefined value is a documented
  // no-op in TanStack Query v5 (it does NOT clear the cache entry). The
  // previous account's auth data - and, since login/register never
  // touched the character key either, potentially its character data too
  // - could still be sitting there when a new account signed in, which
  // is exactly how "logged out, registered fresh, still didn't land on
  // Create Character" happens. Every account transition below now
  // removes both keys outright rather than trying to overwrite them.
  const login = useCallback(
    async (username: string, password: string) => {
      const user = await apiFetch<PublicUser>('POST', '/auth/login', {
        username,
        password,
      });
      queryClient.removeQueries({ queryKey: ['character', 'me'] });
      queryClient.setQueryData(['auth', 'me'], user);
      setCheckIn('arriving');
    },
    [queryClient],
  );

  const register = useCallback(
    async (email: string, username: string, password: string) => {
      const user = await apiFetch<PublicUser>('POST', '/auth/register', {
        email,
        username,
        password,
      });
      queryClient.removeQueries({ queryKey: ['character', 'me'] });
      queryClient.setQueryData(['auth', 'me'], user);
      setCheckIn('arriving');
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    await apiFetch('POST', '/auth/logout');
    queryClient.removeQueries({ queryKey: ['character', 'me'] });
    queryClient.removeQueries({ queryKey: ['auth', 'me'] });
    setCheckIn('arriving');
  }, [queryClient]);

  const createCharacter = useCallback(
    async (name: string, archetype: Archetype) => {
      const character = await apiFetch<Character>('POST', '/characters', {
        name,
        archetype,
      });
      queryClient.setQueryData(['character', 'me'], character);
    },
    [queryClient],
  );

  const value: SessionContextValue = {
    status,
    user: authQuery.data ?? null,
    character: characterQuery.data ?? null,
    checkIn,
    settleCheckIn,
    login,
    register,
    logout,
    createCharacter,
  };

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
}
