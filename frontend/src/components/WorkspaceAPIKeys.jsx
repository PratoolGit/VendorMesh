import { useEffect, useState } from 'react';

const SCOPE_OPTIONS = [
  { value: 'inventory:read', label: 'Inventory read', description: 'List workspace stock, reorder points, costs and demand fields.' },
  { value: 'suppliers:read', label: 'Supplier read', description: 'List workspace supplier contacts, lead times and reliability.' },
  { value: 'purchasing:read', label: 'Purchasing read', description: 'Read purchase request and receipt status metadata.' }
];

export default function WorkspaceAPIKeys({ api }) {
  const [keys, setKeys] = useState([]);
  const [name, setName] = useState('Reporting integration');
  const [scopes, setScopes] = useState(['inventory:read']);
  const [expiresInDays, setExpiresInDays] = useState('90');
  const [createdToken, setCreatedToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function loadKeys() {
    const result = await api('/api/workspace/api-keys');
    setKeys(result.keys || []);
  }

  async function refresh() {
    setLoading(true);
    setError('');
    try { await loadKeys(); }
    catch (err) { setError(err.message || 'Unable to load API keys.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { refresh(); }, [api]);

  function toggleScope(scope) {
    setScopes(current => current.includes(scope) ? current.filter(value => value !== scope) : [...current, scope]);
  }

  async function createKey(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    setCreatedToken(null);
    try {
      const result = await api('/api/workspace/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name, scopes, expiresInDays: Number(expiresInDays) })
      });
      setCreatedToken(result.key);
      setNotice(result.warning);
      await loadKeys();
    } catch (err) {
      setError(err.message || 'Unable to create API key.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(key) {
    if (!window.confirm(`Revoke API key "${key.name}"? Any integration using it will stop working immediately.`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api(`/api/workspace/api-keys/${key.id}`, { method: 'DELETE' });
      setCreatedToken(null);
      setNotice(`API key "${key.name}" revoked.`);
      await loadKeys();
    } catch (err) {
      setError(err.message || 'Unable to revoke API key.');
    } finally {
      setBusy(false);
    }
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(createdToken.token);
      setNotice('Token copied. Store it in your integration secret manager; it cannot be retrieved again.');
    } catch {
      setError('Clipboard access was blocked. Select and copy the token text manually.');
    }
  }

  if (loading) return <div className="loading">Loading workspace API access…</div>;

  return <section className="workspace-keys">
    <div className="section-heading">
      <div><h2>External API access</h2><p>Create scoped tokens for trusted reporting or integration services.</p></div>
      <button type="button" className="secondary" onClick={refresh} disabled={busy}>Refresh</button>
    </div>
    {(error || notice) && <div className={error ? 'flash flash-error' : 'flash flash-ok'} role={error ? 'alert' : 'status'}>{error || notice}</div>}

    <div className="api-key-security">
      <strong>Read-only keys only</strong>
      <p>Keys are scoped to this workspace, expire within 365 days, are hashed in the database, and can be revoked. Public API v1 can read inventory, suppliers and purchase requests only; it cannot approve purchases or initiate payments.</p>
    </div>

    {createdToken && <section className="api-key-created" aria-live="polite">
      <div><strong>Copy your new API token now</strong><p>This is the only time the full token is shown. Closing or leaving this page clears it from the UI.</p></div>
      <label>Secret token
        <textarea rows="3" readOnly value={createdToken.token} onFocus={event => event.target.select()} />
      </label>
      <div className="api-key-created-meta"><span>Prefix: <code>{createdToken.prefix}</code></span><span>Expires: {new Date(createdToken.expiresAt).toLocaleDateString()}</span></div>
      <div className="ai-actions"><button type="button" className="secondary" onClick={copyToken}>Copy token</button><button type="button" className="primary" onClick={() => setCreatedToken(null)}>I saved it</button></div>
    </section>}

    <form className="form-card api-key-form" onSubmit={createKey}>
      <h3>Create API key</h3>
      <div className="fields api-key-fields">
        <label>Key name<input required minLength="3" maxLength="80" value={name} onChange={event => setName(event.target.value)} placeholder="e.g. Monthly procurement report" /></label>
        <label>Expires in
          <select value={expiresInDays} onChange={event => setExpiresInDays(event.target.value)}>
            <option value="30">30 days</option><option value="60">60 days</option><option value="90">90 days</option><option value="180">180 days</option><option value="365">365 days</option>
          </select>
        </label>
      </div>
      <fieldset className="api-key-scopes">
        <legend>Read scopes</legend>
        {SCOPE_OPTIONS.map(scope=><label className="api-key-scope" key={scope.value}>
          <input type="checkbox" checked={scopes.includes(scope.value)} onChange={() => toggleScope(scope.value)} />
          <span><b>{scope.label}</b><small>{scope.description}</small></span>
        </label>)}
      </fieldset>
      <button type="submit" className="primary" disabled={busy || name.trim().length<3 || scopes.length===0}>{busy ? 'Creating…' : 'Generate read-only key'}</button>
    </form>

    <section className="table-card">
      <div className="api-key-table-heading"><div><h3>Workspace API keys</h3><p className="muted">Only a key's prefix and metadata are displayed after creation.</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>Name</th><th>Prefix</th><th>Scopes</th><th>Created</th><th>Last used</th><th>Expires</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {keys.map(key=><tr key={key.id}>
          <td><b>{key.name}</b></td>
          <td><code>{key.prefix}</code></td>
          <td>{key.scopes.map(scope=><span className="api-scope-badge" key={scope}>{scope}</span>)}</td>
          <td>{new Date(key.createdAt).toLocaleDateString()}</td>
          <td>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : 'Never'}</td>
          <td>{new Date(key.expiresAt).toLocaleDateString()}</td>
          <td><span className={'status '+(key.revokedAt ? 'status-rejected' : new Date(key.expiresAt)<=new Date() ? 'status-pending' : 'status-ok')}>{key.revokedAt ? 'revoked' : new Date(key.expiresAt)<=new Date() ? 'expired' : 'active'}</span></td>
          <td>{!key.revokedAt && new Date(key.expiresAt)>new Date() ? <button type="button" className="secondary danger-button" disabled={busy} onClick={() => revokeKey(key)}>Revoke</button> : '—'}</td>
        </tr>)}
      </tbody></table></div>
      {keys.length===0 && <p className="muted api-key-empty">No API keys created for this workspace.</p>}
    </section>
  </section>;
}
