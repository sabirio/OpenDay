import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { authService } from '../auth/authService';
import { resolveRememberedDefaultRoute } from '../auth/workspaceSelection.js';

function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [stage, setStage]       = useState('login'); // 'login' | 'forgot' | 'sent'
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }
    setError('');
    setLoading(true);

    const result = await login(email.trim(), password, remember);

    setLoading(false);
    if (!result.success) {
      setError(result.error);
      return;
    }

    navigate(resolveRememberedDefaultRoute(result.user), { replace: true });
  }

  async function handleForgot(e) {
    e.preventDefault();
    if (!email) {
      setError('Enter your email address first.');
      return;
    }
    setError('');
    setLoading(true);
    await authService.requestPasswordReset(email.trim());
    setLoading(false);
    setStage('sent');
  }

  function goToForgot() {
    setError('');
    setStage('forgot');
  }

  function goToLogin() {
    setError('');
    setStage('login');
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Header */}
        <div className="login-header">
          <div className="login-logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" className="fill-ui-elevated" />
              <path d="M8 24V14l8-6 8 6v10H20v-6h-8v6H8Z" className="fill-ui-accent" />
            </svg>
          </div>
          <h1 className="login-title">OpenDay</h1>
          <p className="login-subtitle">
            {stage === 'forgot' || stage === 'sent'
              ? 'Reset your password'
              : 'Sign in to your account'}
          </p>
        </div>

        {/* ── Sign-in form ─────────────────────────────────── */}
        {stage === 'login' && (
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {error && (
              <div className="login-error" role="alert">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" className="stroke-ui-danger" strokeWidth="1.5" />
                  <path d="M8 5v4M8 11v.5" className="stroke-ui-danger" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                {error}
              </div>
            )}

            <div className="login-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="login-field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>

            <div className="login-row">
              <label className="login-checkbox">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  disabled={loading}
                />
                <span>Remember me</span>
              </label>
              <button type="button" className="login-link" onClick={goToForgot}>
                Forgot password?
              </button>
            </div>

            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="login-spinner" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        )}

        {/* ── Forgot-password form ─────────────────────────── */}
        {stage === 'forgot' && (
          <form className="login-form" onSubmit={handleForgot} noValidate>
            {error && (
              <div className="login-error" role="alert">
                {error}
              </div>
            )}
            <p className="login-hint">
              Enter your email and we'll send a reset link if an account exists.
            </p>
            <div className="login-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            <button className="login-btn" type="submit" disabled={loading}>
              {loading ? (
                <>
                  <span className="login-spinner" />
                  Sending…
                </>
              ) : (
                'Send reset link'
              )}
            </button>
            <button type="button" className="login-link" onClick={goToLogin}>
              ← Back to sign in
            </button>
          </form>
        )}

        {/* ── Sent confirmation ─────────────────────────────── */}
        {stage === 'sent' && (
          <div className="login-form">
            <div className="login-info">
              If that email is registered, a reset link has been sent. Check your inbox
              (and spam folder).
            </div>
            <button type="button" className="login-link" onClick={goToLogin}>
              ← Back to sign in
            </button>
          </div>
        )}

        <p className="login-footer">by Sabir Khairullin</p>
      </div>
    </div>
  );
}

export default Login;
