import { useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { userSafeError } from '../utils/userError';
import { useAdminUsers } from '../hooks/useAdminUsers.js';
import Modal from '../components/shared/Modal.jsx';

const USER_ROLES = [
  'Construction Manager','Lease Manager','Project Manager','Security Manager',
  'IT Manager','HR Manager','Store Designer','Supply Manager','Facility Manager',
];
const ACCESS_ROLES = ['Admin','PM','Consultant','Approver','Executive'];
const ORGANIZATION_ROLES = [
  { value: 'MEMBER', label: 'Member' },
  { value: 'ORG_ADMIN', label: 'Organization Admin' },
];
const emptyInvite = { name: '', email: '', role: 'Project Manager', accessRole: 'PM', organizationRole: 'MEMBER' };

function MemberFields({ value, onChange, includeEmail = false }) {
  const patch = (field, next) => onChange({ ...value, [field]: next });
  return <div className="admin-user-edit-body">
    <label><span>Name</span><input className="ds-input" value={value.name || ''} onChange={event => patch('name', event.target.value)} placeholder="Full name" autoFocus /></label>
    {includeEmail && <label><span>Email</span><input className="ds-input" type="email" value={value.email || ''} onChange={event => patch('email', event.target.value)} placeholder="name@company.com" /></label>}
    <label><span>Job role</span><select className="ds-input admin-user-role-select" value={value.role || ''} onChange={event => patch('role', event.target.value)}>{USER_ROLES.map(role => <option key={role} value={role}>{role}</option>)}</select></label>
    <label><span>Operational access</span><select className="ds-input" value={value.accessRole} onChange={event => patch('accessRole', event.target.value)}>{ACCESS_ROLES.map(role => <option key={role} value={role}>{role}</option>)}</select><small>Controls the OpenDay work the colleague can perform. Paid capabilities are managed separately by OpenDay.</small></label>
    <label><span>Organization role</span><select className="ds-input" value={value.organizationRole} onChange={event => patch('organizationRole', event.target.value)}>{ORGANIZATION_ROLES.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select><small>Organization Admin can manage colleagues and project teams, but cannot change subscriptions or entitlements.</small></label>
  </div>;
}

function AdminUsers() {
  const { user } = useAuth();
  const organizations = useMemo(() => (user?.organizations || [])
    .filter(item => item.organizationRole === 'ORG_ADMIN' && item.membershipStatus === 'ACTIVE'), [user]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState(() => organizations[0]?.organizationId || '');
  const organizationId = organizations.some(item => item.organizationId === selectedOrganizationId)
    ? selectedOrganizationId : organizations[0]?.organizationId || '';
  const editor = useAdminUsers(organizationId);
  const [edits, setEdits] = useState({});
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [editingUserId, setEditingUserId] = useState(null);
  const [invite, setInvite] = useState(null);
  const users = useMemo(() => editor.users.map(member => ({ ...member, ...(edits[member.id] || {}) })), [editor.users, edits]);
  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;
    return users.filter(member => [member.name,member.email,member.role,member.accessRole,member.organizationRole]
      .some(value => String(value || '').toLowerCase().includes(normalized)));
  }, [query, users]);
  const editingUser = users.find(member => member.id === editingUserId) || null;
  const editingIsDirty = Boolean(editingUserId && edits[editingUserId]);
  const selectedOrganization = organizations.find(item => item.organizationId === organizationId);

  function editMember(next) {
    setEdits(previous => ({ ...previous, [next.id]: { ...(previous[next.id] || {}), ...next } }));
  }
  function closeEditor() {
    if (editingIsDirty && !window.confirm('Discard unsaved user changes?')) return;
    setEditingUserId(null);
  }
  async function saveUser(member) {
    setError('');
    try {
      await editor.save(member);
      setEdits(previous => { const next = { ...previous }; delete next[member.id]; return next; });
      setEditingUserId(null);
    } catch (saveError) {
      console.error('[AdminUsers] save failed:', saveError);
      setError(saveError?.code === '40001' ? 'This user was changed elsewhere. Refresh and try again.' : userSafeError('save'));
    }
  }
  async function removeUser(member) {
    if (!window.confirm(`Deactivate ${member.name || member.email} in ${selectedOrganization?.name || 'this organization'}? Historical records will be preserved.`)) return;
    setError('');
    try { await editor.remove(member); }
    catch (removeError) {
      console.error('[AdminUsers] remove failed:', removeError);
      setError('The colleague could not be deactivated. You cannot deactivate yourself or the last Organization Admin.');
    }
  }
  async function sendInvitation() {
    setError('');
    try { await editor.invite(invite); setInvite(null); }
    catch (inviteError) {
      console.error('[AdminUsers] invitation failed:', inviteError);
      setError('The invitation could not be sent. Check the email and try again.');
    }
  }

  if (organizations.length === 0) return <div className="admin-users-page"><div className="page-header"><div><h1 className="page-title">Users</h1><p className="page-subtitle">Organization Admin access is required.</p></div></div></div>;
  if (editor.status === 'loading') return <div className="auth-loading" style={{ minHeight: 300 }}><div className="auth-loading-spinner" /></div>;

  return <div className="admin-users-page">
    <div className="page-header">
      <div><h1 className="page-title">Users</h1><p className="page-subtitle">Invite colleagues, assign organization roles, and deactivate access. Project responsibilities remain on each project's Team page.</p></div>
      <div className="admin-users-header-actions"><button type="button" className="btn btn-secondary" onClick={editor.retry}>Refresh</button><button type="button" className="btn btn-primary" onClick={() => setInvite({ ...emptyInvite })}>Invite colleague</button></div>
    </div>

    {organizations.length > 1 && <label className="admin-users-organization"><span>Organization</span><select className="ds-input" value={organizationId} onChange={event => setSelectedOrganizationId(event.target.value)}>{organizations.map(item => <option key={item.organizationId} value={item.organizationId}>{item.name}</option>)}</select></label>}
    {(error || editor.error) && <div className="login-error" role="alert" style={{ marginBottom: 20 }}>{error || userSafeError('load')}</div>}

    <div className="admin-users-toolbar"><label className="admin-users-search"><span>Search users</span><input className="ds-input" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, email, role, or access" /></label><span className="admin-users-count">{filteredUsers.length} of {users.length} colleagues</span></div>
    <div className="admin-users-table-wrap"><table className="admin-users-table"><thead><tr><th>Name</th><th>Email</th><th>Job role</th><th>Operational access</th><th>Organization role</th><th>Status</th><th>Actions</th></tr></thead><tbody>
      {filteredUsers.map(member => <tr className="admin-user-row" key={member.id}>
        <td><div className="admin-user-cell"><div className="admin-user-avatar">{(member.name || member.email || '?')[0].toUpperCase()}</div><strong>{member.name || 'Unnamed user'}</strong></div></td>
        <td><span className="admin-user-email">{member.email}</span></td><td><span className="admin-user-role-badge">{member.role || 'Not assigned'}</span></td><td><span className="admin-user-access-badge">{member.accessRole}</span></td><td>{member.organizationRole === 'ORG_ADMIN' ? 'Organization Admin' : 'Member'}</td><td>{member.status === 'ACTIVE' ? 'Active' : 'Inactive'}</td>
        <td><div className="admin-user-row-actions"><button type="button" className="btn btn-secondary" disabled={member.status !== 'ACTIVE'} onClick={() => setEditingUserId(member.id)}>Edit</button><button type="button" className="btn-ghost-sm admin-user-remove" onClick={() => removeUser(member)} disabled={member.status !== 'ACTIVE' || editor.removing === member.id}>{editor.removing === member.id ? 'Deactivating…' : 'Deactivate'}</button></div></td>
      </tr>)}
      {filteredUsers.length === 0 && <tr><td colSpan="7" className="admin-users-empty">No users match this search.</td></tr>}
    </tbody></table></div>

    {editor.invitations.length > 0 && <section className="admin-users-pending"><h2>Pending invitations</h2><div className="admin-users-table-wrap"><table className="admin-users-table"><thead><tr><th>Name</th><th>Email</th><th>Job role</th><th>Organization role</th><th>Status</th></tr></thead><tbody>{editor.invitations.map(item => <tr key={item.id}><td>{item.name || '—'}</td><td>{item.email}</td><td>{item.role || item.accessRole}</td><td>{item.organizationRole === 'ORG_ADMIN' ? 'Organization Admin' : 'Member'}</td><td>{item.status}</td></tr>)}</tbody></table></div></section>}

    {editingUser && <Modal onClose={closeEditor} titleId="admin-user-edit-title" isDirty={editingIsDirty} dirtyMessage="Discard unsaved user changes?" className="modal admin-user-edit-modal"><div className="modal-header"><div><h2 id="admin-user-edit-title">Edit colleague</h2><p>{editingUser.email}</p></div><button type="button" className="close-button" onClick={closeEditor} aria-label="Close">×</button></div><MemberFields value={editingUser} onChange={editMember} /><div className="admin-user-edit-footer"><button type="button" className="btn btn-secondary" onClick={closeEditor}>Cancel</button><button type="button" className="btn btn-primary" onClick={() => saveUser(editingUser)} disabled={!editingIsDirty || !editingUser.name?.trim() || editor.saving === editingUser.id}>{editor.saving === editingUser.id ? 'Saving…' : 'Save changes'}</button></div></Modal>}
    {invite && <Modal onClose={() => setInvite(null)} titleId="admin-user-invite-title" isDirty dirtyMessage="Discard this invitation?" className="modal admin-user-edit-modal"><div className="modal-header"><div><h2 id="admin-user-invite-title">Invite colleague</h2><p>The recipient will receive a secure OpenDay sign-in link.</p></div><button type="button" className="close-button" onClick={() => setInvite(null)} aria-label="Close">×</button></div><MemberFields value={invite} onChange={setInvite} includeEmail /><div className="admin-user-edit-footer"><button type="button" className="btn btn-secondary" onClick={() => setInvite(null)}>Cancel</button><button type="button" className="btn btn-primary" onClick={sendInvitation} disabled={!invite.name.trim() || !invite.email.includes('@') || editor.inviting}>{editor.inviting ? 'Sending…' : 'Send invitation'}</button></div></Modal>}
  </div>;
}

export default AdminUsers;
