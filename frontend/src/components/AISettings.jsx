import { useEffect, useState } from 'react';

const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
};

export default function AISettings({ api, onClose }) {
  const [adminToken, setAdminToken] = useState(() => sessionStorage.getItem('vendormesh.adminToken') || '');
  const [provider, setProvider] = useState('anthropic');
  const [model, setModel] = useState(DEFAULT_MODELS.anthropic);
  const [apiKey, setApiKey] = useState('');
  const [keyConfigured, setKeyConfigured] = useState(false);
  const [source, setSource] = useState('environment');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const connect = async () => {
    sessionStorage.setItem('vendormesh.adminToken', adminToken.trim());
    setNotice('');
    setBusy(true);
    try {
      const config = await api('/api/ai/settings');
      setProvider(config.provider || 'anthropic');
      setModel(config.model || DEFAULT_MODELS[config.provider] || DEFAULT_MODELS.anthropic);
      setKeyConfigured(Boolean(config.keyConfigured));
      setSource(config.source || 'environment');
      setNotice('Connected to the protected AI settings endpoint.');
    } catch (err) {
      setNotice(err.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (adminToken) connect();
    // Connect only when this panel opens; changing the token uses the Connect button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeProvider = (next) => {
    setProvider(next);
    setModel(DEFAULT_MODELS[next]);
    setApiKey('');
    setKeyConfigured(false);
  };

  const test = async () => {
    setBusy(true);
    setNotice('');
    try {
      const result = await api('/api/ai/test', {
        method: 'POST',
        body: JSON.stringify({ provider, model, apiKey }),
      });
      setNotice(result.message);
    } catch (err) {
      setNotice(`Test failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice('');
    try {
      const result = await api('/api/ai/settings', {
        method: 'POST',
        body: JSON.stringify({ provider, model, apiKey }),
      });
      setKeyConfigured(Boolean(result.keyConfigured));
      setSource(result.source || 'database');
      setApiKey('');
      setNotice('AI settings saved. The API key is encrypted before it is stored.');
    } catch (err) {
      setNotice(`Could not save settings: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title">
        <div className="settings-heading">
          <div>
            <p className="eyebrow">Operator controls</p>
            <h2 id="ai-settings-title">AI provider settings</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close AI settings">×</button>
        </div>
        <p className="settings-description">Choose a provider and model. The API key is sent only to your backend over HTTPS and is encrypted in MongoDB; it is never sent back to the browser.</p>

        <label className="field">
          <span>Admin API token</span>
          <input type="password" autoComplete="current-password" value={adminToken} onChange={(e) => setAdminToken(e.target.value)} placeholder="Paste ADMIN_API_TOKEN from your server environment" />
        </label>
        <button type="button" className="btn" onClick={connect} disabled={busy || !adminToken.trim()}>Connect to backend</button>

        <form onSubmit={save} className="settings-form">
          <label className="field">
            <span>AI provider</span>
            <select value={provider} onChange={(e) => changeProvider(e.target.value)}>
              <option value="anthropic">Anthropic Claude</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </label>
          <label className="field">
            <span>Model ID</span>
            <input required minLength="2" maxLength="120" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Provider model ID" />
          </label>
          <label className="field">
            <span>API key {keyConfigured ? '(configured — enter a new key to rotate)' : ''}</span>
            <input type="password" required autoComplete="new-password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Provider API key" />
          </label>
          <div className="settings-status">
            <span className={keyConfigured ? 'status-dot status-dot-ok' : 'status-dot'} />
            {keyConfigured ? `A key is configured (${source}).` : 'No saved key is confirmed yet.'}
          </div>
          {notice && <p className="settings-notice" role="status">{notice}</p>}
          <div className="settings-actions">
            <button type="button" className="btn" disabled={busy || !apiKey.trim()} onClick={test}>{busy ? 'Working…' : 'Test connection'}</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !adminToken.trim() || !apiKey.trim() || !model.trim()}>{busy ? 'Working…' : 'Save provider'}</button>
          </div>
        </form>
        <p className="settings-footnote">Keep <code>ADMIN_API_TOKEN</code> and <code>AI_SETTINGS_ENCRYPTION_KEY</code> private. Use a unique token of at least 24 characters. Do not use this single-operator demo as a multi-user production control plane.</p>
      </section>
    </div>
  );
}
