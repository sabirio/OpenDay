import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getDefaultRoute } from '../engines/permissionEngine';

const DEMO_CREDENTIALS = [
  { role: 'Admin',      email: 'admin@construction.com', password: 'Admin' },
  { role: 'PM',         email: 'pm@construction.com',    password: 'Pm'    },
  { role: 'Contractor', email: 'gc@construction.com',    password: 'Gc'    },
];

function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

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

    // Always use role-based default — avoids sending Contractor to a page they can't access
    navigate(getDefaultRoute(result.user.role), { replace: true });
  }

  function fillDemo(cred) {
    setEmail(cred.email);
    setPassword(cred.password);
    setError('');
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Header */}
        <div className="login-header">
          <div className="login-logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#1e3a5f" />
              <path d="M8 24V14l8-6 8 6v10H20v-6h-8v6H8Z" fill="#60a5fa" />
            </svg>
          </div>
          <h1 className="login-title">Construction PM Portal</h1>
          <p className="login-subtitle">Sign in to your account</p>
        </div>

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="login-error" role="alert">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="7" stroke="#f87171" strokeWidth="1.5" />
                <path d="M8 5v4M8 11v.5" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round" />
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
            <button
              type="button"
              className="login-link"
              onClick={() => alert('Password reset is not configured yet.\nContact your administrator.')}
            >
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

        {/* Demo credentials */}
        <div className="login-demo">
          <p className="login-demo-title">Demo accounts</p>
          <div className="login-demo-grid">
            {DEMO_CREDENTIALS.map((c) => (
              <button
                key={c.role}
                type="button"
                className="login-demo-btn"
                onClick={() => fillDemo(c)}
                disabled={loading}
              >
                {c.role}
              </button>
            ))}
          </div>
        </div>

        <p className="login-footer">by Sabir Khairullin</p>
      </div>
    </div>
  );
}

export default Login;
