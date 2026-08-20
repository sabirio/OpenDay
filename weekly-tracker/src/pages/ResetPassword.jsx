import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService, supabaseClient } from '../auth/authService';

/**
 * /reset-password — landed here from a Supabase password-reset email link.
 *
 * Detection strategy: subscribe to onAuthStateChange and wait for PASSWORD_RECOVERY.
 * Supabase v2 replays the current auth state to new listeners, so this works even
 * though the URL hash (with the recovery token) was already consumed by the client
 * before React mounted. The `settled` flag ensures we only act on the first event.
 */
function ResetPassword() {
  const navigate  = useNavigate();
  const [stage, setStage]         = useState('loading'); // 'loading'|'form'|'invalid'|'success'
  const [newPassword, setNew]      = useState('');
  const [confirm, setConfirm]      = useState('');
  const [error, setError]          = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let settled = false;
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event) => {
      if (settled) return;
      settled = true;
      setStage(event === 'PASSWORD_RECOVERY' ? 'form' : 'invalid');
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setError('');
    setSubmitting(true);
    const result = await authService.updatePassword(newPassword);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error || 'Failed to update password. The link may have expired.');
      return;
    }
    setStage('success');
    setTimeout(() => navigate('/login', { replace: true }), 3000);
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" className="fill-ui-elevated" />
              <path d="M8 24V14l8-6 8 6v10H20v-6h-8v6H8Z" className="fill-ui-accent" />
            </svg>
          </div>
          <h1 className="login-title">OpenDay</h1>
          <p className="login-subtitle">Set a new password</p>
        </div>

        {stage === 'loading' && (
          <div className="login-form">
            <div className="flex items-center gap-2.5 text-sm text-ui-muted">
              <span className="login-spinner !border-t-ui-muted" />
              Verifying reset link…
            </div>
          </div>
        )}

        {stage === 'invalid' && (
          <div className="login-form">
            <div className="login-error" role="alert">
              This reset link is invalid or has expired. Please request a new one.
            </div>
            <a href="/login" className="login-link">← Back to sign in</a>
          </div>
        )}

        {stage === 'form' && (
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            {error && (
              <div className="login-error" role="alert">{error}</div>
            )}
            <div className="login-field">
              <label htmlFor="new-password">New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNew(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="login-field">
              <label htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                placeholder="Repeat new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                disabled={submitting}
              />
            </div>
            <button className="login-btn" type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <span className="login-spinner" />
                  Updating…
                </>
              ) : (
                'Set new password'
              )}
            </button>
          </form>
        )}

        {stage === 'success' && (
          <div className="login-form">
            <div className="login-info">
              Password updated. Redirecting to sign in…
            </div>
          </div>
        )}

        <p className="login-footer">by Sabir Khairullin</p>
      </div>
    </div>
  );
}

export default ResetPassword;
