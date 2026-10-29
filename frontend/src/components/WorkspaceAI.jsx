import { useEffect, useState } from 'react';

const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.5-flash',
};

const PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Google Gemini' },
];

function messageFor(error, fallback) {
  return error?.message || fallback;
}

export default function WorkspaceAI({ api, session }) {
  const [settings, setSettings] = useState(null);
  const [provider, setProvider] = useState('anthropic');
  const [model, setModel] = useState(DEFAULT_MODELS.anthropic);
  const [apiKey, setApiKey] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function loadSettings() {
    const result = await api('/api/workspace/ai/settings');
    setSettings(result);
    setProvider(result.provider || 'anthropic');
    setModel(result.model || DEFAULT_MODELS[result.provider] || DEFAULT_MODELS.anthropic);
  }

  async function loadUsage() {
    const result = await api('/api/workspace/ai/usage');
    setUsage(result);
  }

  async function refreshAll() {
    setLoading(true);
    setError('');
    const results = await Promise.allSettled([loadSettings(), loadUsage()]);
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) setError(messageFor(failed.reason, 'Unable to load the AI workspace settings.'));
    setLoading(false);
  }

  useEffect(() => {
    refreshAll();
    // A new workspace means new AI settings and usage; the backend still authorizes every call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.company?.id]);

  function changeProvider(value) {
    setProvider(value);
    setModel(DEFAULT_MODELS[value]);
    setApiKey('');
    setNotice('');
  }

  async function saveSettings(event) {
    event.preventDefault();
    setBusy('save');
    setError('');
    setNotice('');
    try {
      if (apiKey.trim().length < 10) throw new Error('Enter the provider API key. The key is only held in this page while you configure it.');
      const result = await api('/api/workspace/ai/settings', {
        method: 'PUT',
        body: JSON.stringify({ provider, model: model.trim(), apiKey: apiKey.trim() })
      });
      setApiKey('');
      setSettings(result);
      setProvider(result.provider);
      setModel(result.model);
      setNotice('Workspace AI settings saved. The secret is encrypted on the server and is not returned to this page.');
      await loadUsage().catch(() => {});
    } catch (err) {
      setError(messageFor(err, 'Unable to save AI settings.'));
    } finally {
      setBusy('');
    }
  }

  async function testProvider() {
    setBusy('test');
    setError('');
    setNotice('');
    try {
      if (apiKey.trim().length < 10) throw new Error('Enter the API key you want to test.');
      const result = await api('/api/workspace/ai/settings/test', {
        method: 'POST',
        body: JSON.stringify({ provider, model: model.trim(), apiKey: apiKey.trim() })
      });
      setNotice(result.message || 'Provider test succeeded.');
    } catch (err) {
      setError(messageFor(err, 'Provider test failed.'));
    } finally {
      setBusy('');
      await loadUsage().catch(() => {});
    }
  }

  async function removeSettings() {
    if (!window.confirm('Remove the saved AI credential for this workspace? This does not remove your provider account or any other workspace settings.')) return;
    setBusy('remove');
    setError('');
    setNotice('');
    try {
      await api('/api/workspace/ai/settings', { method: 'DELETE' });
      setSettings({ provider, model, keyConfigured: false, maskedKey: '', source: 'workspace' });
      setApiKey('');
      setAnswer('');
      setNotice('The saved AI credential for this workspace was removed.');
    } catch (err) {
      setError(messageFor(err, 'Unable to remove the saved credential.'));
    } finally {
      setBusy('');
    }
  }

  async function askCopilot(event) {
    event.preventDefault();
    setBusy('ask');
    setError('');
    setNotice('');
    setAnswer('');
    try {
      const result = await api('/api/workspace/ai/ask', {
        method: 'POST',
        body: JSON.stringify({ question: question.trim() })
      });
      setAnswer(result.answer || '');
      setNotice(`Advice generated with ${result.provider} · ${result.model}. No business records were changed.`);
      await loadUsage().catch(() => {});
    } catch (err) {
      setError(messageFor(err, 'Unable to generate procurement advice.'));
      await loadUsage().catch(() => {});
    } finally {
      setBusy('');
    }
  }

  if (loading) return <div className="loading">Loading workspace AI settings…</div>;

  const configured = Boolean(settings?.keyConfigured);
  const quotaPct = usage?.dailyLimit ? Math.min(100, ((usage.requestsUsed || 0) / usage.dailyLimit) * 100) : 0;

  return <section className="workspace-ai">
    <div className="section-heading">
      <div>
        <h2>Workspace AI copilot</h2>
        <p>Ask for procurement analysis from this workspace's inventory, suppliers, and recent purchase requests.</p>
      </div>
      <button type="button" className="secondary" onClick={refreshAll} disabled={Boolean(busy)}>Refresh</button>
    </div>

    {(error || notice) && <div className={error ? 'flash flash-error' : 'flash flash-ok'} role={error ? 'alert' : 'status'}>{error || notice}</div>}

    <div className="ai-security-note">
      <strong>Human-in-the-loop by design</strong>
      <p>AI responses are advisory only. The copilot has no tools to approve purchases, alter inventory, change prices, or initiate payments. Prompts and answer text are not written to the usage log, but the question and selected workspace data are sent to the provider you configure.</p>
    </div>

    <div className="ai-layout">
      <section className="form-card ai-config-card">
        <div className="ai-section-heading">
          <div><h3>Provider configuration</h3><p className="muted">Credentials are isolated by workspace.</p></div>
          <span className={'status ' + (configured ? 'status-ok' : 'status-pending')}>{configured ? 'Configured' : 'Setup needed'}</span>
        </div>
        <form onSubmit={saveSettings}>
          <div className="fields ai-config-fields">
            <label>Provider
              <select value={provider} onChange={(event) => changeProvider(event.target.value)} disabled={Boolean(busy)}>
                {PROVIDERS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label>Model ID
              <input required minLength="2" maxLength="120" value={model} onChange={event => setModel(event.target.value)} disabled={Boolean(busy)} />
            </label>
            <label>API key
              <input type="password" autoComplete="new-password" minLength="10" maxLength="512" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={configured ? 'Enter a new key to rotate' : 'Paste provider API key'} disabled={Boolean(busy)} />
            </label>
          </div>
          <p className="inline-hint">The saved secret is never sent back in plaintext. {configured ? `Current key status: ${settings.maskedKey || 'configured'}.` : 'No key is saved for this workspace yet.'}</p>
          <div className="ai-actions">
            <button type="button" className="secondary" onClick={testProvider} disabled={Boolean(busy) || apiKey.trim().length < 10}>{busy === 'test' ? 'Testing…' : 'Test credential'}</button>
            <button type="submit" className="primary" disabled={Boolean(busy) || apiKey.trim().length < 10 || !model.trim()}>{busy === 'save' ? 'Saving…' : 'Save provider'}</button>
            {configured && <button type="button" className="secondary danger-button" onClick={removeSettings} disabled={Boolean(busy)}>{busy === 'remove' ? 'Removing…' : 'Remove key'}</button>}
          </div>
        </form>
      </section>

      <section className="form-card ai-usage-card">
        <div className="ai-section-heading"><div><h3>Usage guardrails</h3><p className="muted">Per-workspace request count, reset at 00:00 UTC.</p></div><button type="button" className="secondary" onClick={loadUsage} disabled={Boolean(busy)}>↻</button></div>
        {usage ? <>
          <div className="ai-quota"><div><span>Requests used today</span><strong>{usage.requestsUsed} / {usage.dailyLimit}</strong></div><b>{usage.requestsRemaining} left</b></div>
          <div className="ai-quota-track" aria-label={`${quotaPct.toFixed(0)} percent of daily AI request quota used`}><span style={{ width: `${quotaPct}%` }} /></div>
          <p className="muted ai-usage-footnote">Default limit: 25 requests per UTC day. The server can set a limit from 1–500 using <code>AI_MAX_REQUESTS_PER_DAY</code>. Request limits do not guarantee that a provider's own API is free.</p>
        </> : <p className="muted">Usage data is currently unavailable.</p>}
      </section>
    </div>

    <section className="form-card ai-question-card">
      <div className="ai-section-heading"><div><h3>Ask the copilot</h3><p className="muted">Use it to explain a stock risk, compare available suppliers, or prepare questions for a purchase review.</p></div></div>
      <form onSubmit={askCopilot}>
        <label className="ai-question-label">Your procurement question
          <textarea rows="4" maxLength="4000" minLength="3" required value={question} onChange={event => setQuestion(event.target.value)} placeholder="Example: Which items appear most at risk based on current stock and configured daily demand, and what data should I verify before ordering?" disabled={!configured || Boolean(busy)} />
        </label>
        <div className="ai-actions"><span className="muted ai-character-count">{question.length}/4000 characters</span><button className="primary" type="submit" disabled={!configured || Boolean(busy) || question.trim().length < 3}>{busy === 'ask' ? 'Thinking…' : 'Generate advice'}</button></div>
      </form>
      {!configured && <p className="inline-hint">Save a workspace AI credential above to enable the copilot. The legacy global operator key is not reused here.</p>}
      {answer && <article className="ai-answer" aria-live="polite"><div className="ai-answer-title"><strong>Copilot response</strong><span>Advisory only</span></div><p>{answer}</p></article>}
    </section>

    <section className="table-card ai-usage-table">
      <div className="ai-table-title"><div><h3>Recent provider activity</h3><p className="muted">Usage metadata only. Prompts and answer content are not stored in this table.</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>Time</th><th>Provider / model</th><th>Operation</th><th>Result</th><th>Input tokens</th><th>Output tokens</th><th>Duration</th></tr></thead><tbody>
        {(usage?.events || []).map((event,index)=><tr key={event._id || index}>
          <td>{new Date(event.createdAt).toLocaleString()}</td>
          <td><b>{event.provider}</b><small className="table-sub">{event.model}</small></td>
          <td>{event.kind}</td>
          <td><span className={'status ' + (event.outcome === 'success' ? 'status-ok' : 'status-rejected')}>{event.outcome}</span>{event.errorCategory && <small className="table-sub">{event.errorCategory}</small>}</td>
          <td>{event.inputTokens ?? '—'}</td><td>{event.outputTokens ?? '—'}</td><td>{(event.durationMs / 1000).toFixed(1)} s</td>
        </tr>)}
      </tbody></table></div>
      {(!usage?.events || usage.events.length===0) && <p className="muted ai-no-usage">No provider requests recorded for this workspace yet.</p>}
    </section>
    <p className="muted ai-role-note">Visible only to workspace owners and administrators. Keep provider keys private and verify your provider's quota and billing terms before use.</p>
  </section>;
}
