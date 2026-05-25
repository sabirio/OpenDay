import { createContext, useContext, useState, useEffect } from 'react';
import { authService, supabaseClient } from './authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore existing session on mount
    authService.getSession()
      .then((session) => {
        setUser(session);
      })
      .catch((err) => {
        console.error('[AuthContext] getSession failed:', err);
      })
      .finally(() => {
        setLoading(false);
      });

    // Keep state in sync: only handle sign-out and token refresh here.
    // SIGNED_IN is handled directly by login() to avoid double fetchProfile.
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          setUser(null);
        } else if (event === 'TOKEN_REFRESHED') {
          const userData = await authService.getSession();
          setUser(userData);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function login(email, password, remember) {
    // `remember` is handled by Supabase automatically (localStorage by default).
    // Pass it here for future fine-grained control (e.g. shorter JWT expiry).
    const result = await authService.login(email, password, remember);
    if (result.success) setUser(result.user);
    return result;
  }

  function logout() {
    authService.logout();   // async, but onAuthStateChange fires immediately
    setUser(null);
  }

  const value = {
    user,
    role: user?.role ?? null,
    isAuthenticated: !!user,
    login,
    logout,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
