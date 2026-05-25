import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const ROLES = ['Admin', 'PM', 'Contractor', 'Viewer'];

const ROLE_COLORS = {
  Admin:      { background: '#1e3a5f', color: '#60a5fa' },
  PM:         { background: '#1a3a29', color: '#4ade80' },
  Contractor: { background: '#3b1d1d', color: '#f87171' },
  Viewer:     { background: '#2a2a1e', color: '#facc15' },
};

function AdminUsers({ projects = [] }) {
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(null); // id of user being saved
  const [saved, setSaved]     = useState(null);  // id of user just saved (flash)
  const [error, setError]     = useState('');

  useEffect(() => { loadUsers(); }, []);

  async function loadUsers() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, role, company_id, assigned_projects')
      .order('role');

    if (error) {
      setError('Failed to load users: ' + error.message);
    } else {
      setUsers(data.map(u => ({ ...u, assigned_projects: u.assigned_projects ?? [] })));
    }
    setLoading(false);
  }

  function updateField(id, field, value) {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, [field]: value } : u));
  }

  function toggleProject(userId, projectId) {
    setUsers(prev => prev.map(u => {
      if (u.id !== userId) return u;
      const current = u.assigned_projects ?? [];
      const next = current.includes(projectId)
        ? current.filter(id => id !== projectId)
        : [...current, projectId];
      return { ...u, assigned_projects: next };
    }));
  }

  async function saveUser(user) {
    setSaving(user.id);
    setError('');
    const { error } = await supabase
      .from('profiles')
      .update({
        name:              user.name,
        role:              user.role,
        assigned_projects: user.assigned_projects,
      })
      .eq('id', user.id);

    setSaving(null);
    if (error) {
      setError('Save failed: ' + error.message);
    } else {
      setSaved(user.id);
      setTimeout(() => setSaved(null), 2000);
    }
  }

  if (loading) {
    return (
      <div className="auth-loading" style={{ minHeight: 300 }}>
        <div className="auth-loading-spinner" />
      </div>
    );
  }

  return (
    <div className="admin-users-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">Assign roles and projects to team members</p>
        </div>
        <button className="btn-ghost" onClick={loadUsers}>Refresh</button>
      </div>

      {error && (
        <div className="login-error" style={{ marginBottom: 20 }}>
          {error}
        </div>
      )}

      <div className="admin-users-grid">
        {users.map(user => (
          <div key={user.id} className="admin-user-card">
            {/* Header */}
            <div className="admin-user-header">
              <div className="admin-user-avatar">
                {(user.name ?? user.email ?? '?')[0].toUpperCase()}
              </div>
              <div className="admin-user-info">
                <input
                  className="admin-user-name-input"
                  value={user.name ?? ''}
                  onChange={e => updateField(user.id, 'name', e.target.value)}
                  placeholder="Display name"
                />
                <div className="admin-user-email">{user.email}</div>
              </div>
            </div>

            {/* Role selector */}
            <div className="admin-user-section">
              <label className="admin-label">Role</label>
              <div className="admin-role-grid">
                {ROLES.map(role => (
                  <button
                    key={role}
                    className="admin-role-btn"
                    style={user.role === role ? ROLE_COLORS[role] : {}}
                    onClick={() => updateField(user.id, 'role', role)}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            {/* Project assignments */}
            <div className="admin-user-section">
              <label className="admin-label">Assigned Projects</label>
              {projects.length === 0 ? (
                <p className="admin-no-projects">No projects yet</p>
              ) : (
                <div className="admin-project-list">
                  {projects.map(p => {
                    const assigned = (user.assigned_projects ?? []).includes(p.id);
                    return (
                      <label key={p.id} className="admin-project-row">
                        <input
                          type="checkbox"
                          checked={assigned}
                          onChange={() => toggleProject(user.id, p.id)}
                        />
                        <span className="admin-project-code">{p.storeCode}</span>
                        <span className="admin-project-name">{p.shoppingMallName}</span>
                        <span className="admin-project-city">{p.city}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Save */}
            <button
              className={`btn-primary admin-save-btn ${saved === user.id ? 'admin-save-ok' : ''}`}
              onClick={() => saveUser(user)}
              disabled={saving === user.id}
            >
              {saving === user.id
                ? 'Saving…'
                : saved === user.id
                  ? '✓ Saved'
                  : 'Save changes'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AdminUsers;
