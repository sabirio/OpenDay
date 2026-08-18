import { Fragment, useMemo, useState } from 'react';
import { userSafeError } from '../utils/userError';
import { useAdminUsers } from '../hooks/useAdminUsers.js';
import Modal from '../components/shared/Modal.jsx';

const USER_ROLES = [
  'Construction Manager',
  'Lease Manager',
  'Project Manager',
  'Security Manager',
  'IT Manager',
  'HR Manager',
  'Store Designer',
  'Supply Manager',
  'Facility Manager',
];
const ACCESS_ROLES = ['Admin', 'PM', 'Consultant', 'Contractor', 'Approver', 'Executive'];

function AdminUsers({ projects = [] }) {
  const editor = useAdminUsers();
  const [edits, setEdits] = useState({});
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [editingUserId, setEditingUserId] = useState(null);
  const users = useMemo(() => editor.users.map(user => ({ ...user, ...(edits[user.id] || {}) })), [editor.users, edits]);
  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;
    return users.filter(user => [user.name, user.email, user.role, user.accessRole]
      .some(value => String(value || '').toLowerCase().includes(normalized)));
  }, [query, users]);
  const editingUser = users.find(user => user.id === editingUserId) || null;
  const editingIsDirty = Boolean(editingUserId && edits[editingUserId]);

  function updateField(id, field, value) {
    setEdits(previous => ({ ...previous, [id]: { ...(previous[id] || {}), [field]: value } }));
  }

  function changeAccessRole(user, accessRole) {
    setEdits(previous => ({
      ...previous,
      [user.id]: {
        ...(previous[user.id] || {}),
        accessRole,
        ...(accessRole === 'Contractor' ? { role: null } : {}),
      },
    }));
  }

  function toggleProject(user, projectId) {
    const current = user.assignedProjects ?? [];
    updateField(user.id, 'assignedProjects', current.includes(projectId)
      ? current.filter(id => id !== projectId)
      : [...current, projectId]);
  }

  function closeEditor() {
    if (editingIsDirty && !window.confirm('Discard unsaved user changes?')) return;
    setEditingUserId(null);
  }

  async function saveUser(user) {
    setError('');
    try {
      await editor.save(user);
      setEdits(previous => {
        const next = { ...previous };
        delete next[user.id];
        return next;
      });
      setEditingUserId(null);
      setSaved(user.id);
      setTimeout(() => setSaved(null), 2000);
    } catch (saveError) {
      console.error('[AdminUsers] save failed:', saveError);
      setError(userSafeError('save'));
    }
  }

  async function removeUser(user) {
    if (!window.confirm(`Remove ${user.name || user.email} from OpenDay? Their historical records will be preserved.`)) return;
    setError('');
    try {
      await editor.remove(user.id);
      setExpandedUserId(current => current === user.id ? null : current);
    } catch (removeError) {
      console.error('[AdminUsers] remove failed:', removeError);
      setError('The user could not be removed. You cannot remove your own administrator account.');
    }
  }

  if (editor.status === 'loading') {
    return <div className="auth-loading" style={{ minHeight: 300 }}><div className="auth-loading-spinner" /></div>;
  }

  const editIsContractor = editingUser?.accessRole === 'Contractor';
  const editCanSave = editingIsDirty && Boolean(editingUser?.name?.trim())
    && (editIsContractor || USER_ROLES.includes(editingUser?.role));

  return <div className="admin-users-page">
    <div className="page-header">
      <div><h1 className="page-title">Users</h1><p className="page-subtitle">Manage internal roles and system access. Project colleagues are assigned from each project's Team page.</p></div>
      <button type="button" className="btn-ghost" onClick={editor.retry}>Refresh</button>
    </div>

    {(error || editor.error) && <div className="login-error" role="alert" style={{ marginBottom: 20 }}>{error || userSafeError('load')}</div>}

    <div className="admin-users-toolbar">
      <label className="admin-users-search"><span>Search users</span><input className="ds-input" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, email, role, or access" /></label>
      <span className="admin-users-count">{filteredUsers.length} of {users.length} users</span>
    </div>

    <div className="admin-users-table-wrap">
      <table className="admin-users-table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>System access</th><th>Project access</th><th>Actions</th></tr></thead>
        <tbody>
          {filteredUsers.map(user => {
            const isContractor = user.accessRole === 'Contractor';
            const isExpanded = expandedUserId === user.id && isContractor;
            const assignmentCount = (user.assignedProjects || []).length;
            return <Fragment key={user.id}>
              <tr className="admin-user-row">
                <td><div className="admin-user-cell"><div className="admin-user-avatar">{(user.name || user.email || '?')[0].toUpperCase()}</div><strong>{user.name || 'Unnamed user'}</strong></div></td>
                <td><span className="admin-user-email">{user.email}</span></td>
                <td><span className={`admin-user-role-badge${user.role ? '' : ' is-empty'}`}>{user.role || (isContractor ? 'External contractor' : 'Not assigned')}</span></td>
                <td><span className="admin-user-access-badge">{user.accessRole}</span></td>
                <td>{isContractor
                  ? <button type="button" className="btn-ghost-sm" aria-expanded={isExpanded} onClick={() => setExpandedUserId(isExpanded ? null : user.id)}>{assignmentCount} project{assignmentCount === 1 ? '' : 's'} {isExpanded ? '▲' : '▼'}</button>
                  : <span className="admin-users-membership-note">Managed in Project Team</span>}</td>
                <td><div className="admin-user-row-actions"><button type="button" className="btn btn-secondary" onClick={() => setEditingUserId(user.id)}>Edit</button><button type="button" className="btn-ghost-sm admin-user-remove" onClick={() => removeUser(user)} disabled={editor.removing === user.id}>{editor.removing === user.id ? 'Removing…' : 'Remove'}</button>{saved === user.id && <span className="admin-user-saved">Saved</span>}</div></td>
              </tr>
              {isExpanded && <tr className="admin-user-projects-row"><td colSpan="6"><div className="admin-user-projects-panel"><strong>Contractor project access</strong>{projects.length === 0 ? <p className="admin-no-projects">No projects yet</p> : <div className="admin-project-list">{projects.map(project => {
                const assigned = (user.assignedProjects || []).includes(project.id);
                return <div key={project.id} className="admin-project-row is-readonly"><span className="admin-project-code">{project.storeCode}</span><span className="admin-project-name">{project.shoppingMallName}</span><span className="admin-project-city">{project.city}</span><span>{assigned ? 'Assigned' : 'Not assigned'}</span></div>;
              })}</div>}</div></td></tr>}
            </Fragment>;
          })}
          {filteredUsers.length === 0 && <tr><td colSpan="6" className="admin-users-empty">No users match this search.</td></tr>}
        </tbody>
      </table>
    </div>

    {editingUser && <Modal onClose={() => setEditingUserId(null)} titleId="admin-user-edit-title" isDirty={editingIsDirty} dirtyMessage="Discard unsaved user changes?" className="modal admin-user-edit-modal">
      <div className="modal-header"><div><h2 id="admin-user-edit-title">Edit user</h2><p>{editingUser.email}</p></div><button type="button" className="close-button" onClick={closeEditor} aria-label="Close">×</button></div>
      <div className="admin-user-edit-body">
        <label><span>Name</span><input className="ds-input" value={editingUser.name || ''} onChange={event => updateField(editingUser.id, 'name', event.target.value)} placeholder="Full name" autoFocus/></label>
        <label><span>Role</span><select className="ds-input admin-user-role-select" value={editingUser.role || ''} disabled={editIsContractor} onChange={event => updateField(editingUser.id, 'role', event.target.value)}><option value="">Select role</option>{USER_ROLES.map(role => <option key={role} value={role}>{role}</option>)}</select>{editIsContractor && <small>External contractors do not receive an internal role.</small>}</label>
        <label><span>System access</span><select className="ds-input" value={editingUser.accessRole} onChange={event => changeAccessRole(editingUser, event.target.value)}>{ACCESS_ROLES.map(role => <option key={role} value={role}>{role}</option>)}</select><small>Controls which OpenDay modules this user can use.</small></label>
        {editIsContractor && <fieldset className="admin-user-edit-projects"><legend>Contractor project access</legend>{projects.length === 0 ? <p className="admin-no-projects">No projects yet</p> : <div className="admin-project-list">{projects.map(project => {
          const assigned = (editingUser.assignedProjects || []).includes(project.id);
          return <label key={project.id} className="admin-project-row"><input type="checkbox" checked={assigned} onChange={() => toggleProject(editingUser, project.id)}/><span className="admin-project-code">{project.storeCode}</span><span className="admin-project-name">{project.shoppingMallName}</span><span className="admin-project-city">{project.city}</span></label>;
        })}</div>}</fieldset>}
      </div>
      <div className="admin-user-edit-footer"><button type="button" className="btn btn-secondary" onClick={closeEditor}>Cancel</button><button type="button" className="btn btn-primary" onClick={() => saveUser(editingUser)} disabled={!editCanSave || editor.saving === editingUser.id}>{editor.saving === editingUser.id ? 'Saving…' : 'Save changes'}</button></div>
    </Modal>}
  </div>;
}

export default AdminUsers;
