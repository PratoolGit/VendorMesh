import { useCallback, useEffect, useMemo, useState } from 'react';
import { CommandPalette } from './components/ui.jsx';
import WorkspaceAI from './components/WorkspaceAI.jsx';
import WorkspaceAPIKeys from './components/WorkspaceAPIKeys.jsx';
import WorkspaceInvoices from './components/WorkspaceInvoices.jsx';
import WorkspaceReconciliation from './components/WorkspaceReconciliation.jsx';
import './styles.css';

const API = import.meta.env.VITE_API_URL || '';
const tokenKey = 'vendormesh.session';
async function api(path, options = {}) {
  const token = sessionStorage.getItem(tokenKey) || '';
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) }
  });
  if (res.status === 204) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}
const money = (v, currency = 'USD') => new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(v || 0));

function NavIcon({ name }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false };
  const glyphs = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/></>,
    inventory: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/><path d="M12 13v8"/></>,
    suppliers: <><path d="M3 7h11v10H3z"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="7.5" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/></>,
    purchases: <><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h3"/></>,
    invoices: <><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h4M9 12h6M9 16h6"/></>,
    sparkles: <><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z"/><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z"/></>,
    forecast: <><path d="M4 19V5M4 19h17"/><path d="m7 15 4-4 3 2 5-6"/><path d="M16 7h3v3"/></>,
    anomalies: <><path d="M12 3 20 6v5c0 5-3.4 8.2-8 10-4.6-1.8-8-5-8-10V6l8-3Z"/><path d="M12 8v4M12 16h.01"/></>,
    pricing: <><path d="M4 19V5M4 19h17"/><path d="m7 15 3-4 3 2 5-6"/><circle cx="18" cy="7" r="1"/></>,
    reconciliation: <><path d="M4 7h13l-3-3M20 17H7l3 3"/><path d="M17 4 20 7l-3 3M7 14l-3 3 3 3"/></>,
    team: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-1.2A4.8 4.8 0 0 1 7.8 14h2.4a4.8 4.8 0 0 1 4.8 4.8V20M16 5.5a3 3 0 0 1 0 5.8M18 14a4.7 4.7 0 0 1 3 4.4V20"/></>,
    audit: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
    key: <><circle cx="8" cy="15" r="4"/><path d="m11 12 8-8 2 2-2 2 2 2-3 3-2-2-2 2"/></>
  };
  return <svg {...common}>{glyphs[name] || glyphs.overview}</svg>;
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('landing');
  const [form, setForm] = useState({ name: '', email: '', password: '', companyName: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = (key) => (e) => setForm((s) => ({ ...s, [key]: e.target.value }));
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await api(mode === 'register' ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST', body: JSON.stringify(mode === 'register' ? form : { email: form.email, password: form.password })
      });
      sessionStorage.setItem(tokenKey, result.token);
      onAuthenticated(result);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  if (mode === 'landing') {
    return (
      <main className="public-shell">
        <header className="public-nav">
          <a className="public-brand" href="#top" aria-label="VendorMesh home">
            <img className="brand-symbol" src="/vendormesh-mark.svg" alt="" />
            <span><b>VendorMesh</b><small>PROCUREMENT WORKSPACE</small></span>
          </a>
          <nav className="public-nav-links" aria-label="Public navigation"><a href="#capabilities">Capabilities</a><a href="#workflow">How it works</a></nav>
          <div className="public-nav-actions">
            <button className="public-signin" type="button" onClick={() => { setMode('login'); setError(''); }}>Sign in</button>
            <button className="public-cta public-cta-small" type="button" onClick={() => { setMode('register'); setError(''); }}>Create workspace <span>↗</span></button>
          </div>
        </header>

        <section className="public-hero" id="top">
          <div className="public-hero-copy">
            <div className="announcement-pill"><span className="announcement-dot"/>Procurement, with a clearer operating picture</div>
            <p className="public-eyebrow">INVENTORY · SUPPLIERS · PURCHASING</p>
            <h1>Every purchase.<br/><span>More intentional.</span></h1>
            <p className="public-lede">Bring stock visibility, supplier context and approval-led purchasing into one focused workspace. Make decisions with the operating details in view.</p>
            <div className="public-hero-actions">
              <button className="public-cta" type="button" onClick={() => { setMode('register'); setError(''); }}>Create your workspace <span>→</span></button>
              <button className="public-cta-secondary" type="button" onClick={() => { setMode('login'); setError(''); }}>Sign in to VendorMesh</button>
            </div>
            <div className="public-assurance"><span>✳</span> Company-scoped workspaces <i/> Human-reviewed purchasing <i/> Transparent planning signals</div>
          </div>

          <div className="public-preview-wrap" aria-label="Illustrative workspace preview">
            <div className="public-preview-glow"/>
            <div className="public-preview">
              <div className="preview-topbar"><div className="preview-brand"><img src="/vendormesh-mark.svg" alt=""/><b>VendorMesh</b></div><span>WORKSPACE PREVIEW</span><i/></div>
              <div className="preview-body">
                <div className="preview-sidebar"><b>Overview</b><span>Inventory</span><span>Suppliers</span><span>Purchasing</span><span>AI insights</span></div>
                <div className="preview-content">
                  <div className="preview-heading"><small>WORKSPACE / OVERVIEW</small><b>Procurement overview</b></div>
                  <div className="preview-stat-grid"><div><small>INVENTORY</small><b>Stock position</b><i/></div><div><small>SUPPLIERS</small><b>Vendor records</b><i/></div><div><small>PURCHASING</small><b>Approval queue</b><i/></div></div>
                  <div className="preview-chart-card"><div><b>Inventory position</b><small>ILLUSTRATIVE VIEW</small></div>
                    <svg viewBox="0 0 520 150" role="img" aria-label="Illustrative chart artwork">
                      <defs><linearGradient id="public-preview-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#818cf8" stopOpacity=".34"/><stop offset="100%" stopColor="#818cf8" stopOpacity="0"/></linearGradient></defs>
                      <path d="M0 36H520M0 76H520M0 116H520" stroke="rgba(255,255,255,.08)" strokeDasharray="3 6"/>
                      <path d="M0 125 C55 115 58 82 105 95 S170 56 215 75 S285 31 325 56 S400 76 438 48 S490 35 520 20 L520 150 L0 150Z" fill="url(#public-preview-fill)"/>
                      <path d="M0 125 C55 115 58 82 105 95 S170 56 215 75 S285 31 325 56 S400 76 438 48 S490 35 520 20" fill="none" stroke="#818cf8" strokeWidth="2.5"/>
                    </svg>
                  </div>
                  <div className="preview-row"><span>Inventory controls</span><b>Configured</b></div>
                  <div className="preview-row"><span>Approval workflow</span><b>Human review</b></div>
                </div>
              </div>
              <div className="preview-disclaimer">Illustrative interface · no customer data shown</div>
            </div>
            <div className="preview-orbit"/>
          </div>
        </section>

        <section className="public-capabilities" id="capabilities">
          <div className="public-section-head"><div><p className="public-eyebrow">A WORKSPACE BUILT AROUND THE WORK</p><h2>Clarity across the buying cycle.</h2></div><p>Keep operational context close without giving up human control over purchasing decisions.</p></div>
          <div className="public-feature-grid">
            <article className="public-feature public-feature-wide"><span>01 / INVENTORY</span><h3>Know what is on hand.</h3><p>Track SKUs, quantities, reorder thresholds and unit costs. Surface stock that needs attention before creating a request.</p><div className="feature-visual"><b/><i/></div><small>POSITION VS. REORDER POINT</small></article>
            <article className="public-feature"><span>02 / SUPPLIERS</span><h3>Keep supplier context close.</h3><p>Store contacts, lead times, reliability scores and payment terms alongside purchasing work.</p><div className="feature-pills"><i>Contacts</i><i>Lead time</i><i>Reliability</i></div></article>
            <article className="public-feature"><span>03 / APPROVALS</span><h3>Put approvals in the workflow.</h3><p>Submit purchase requests for owner/admin review, then record order and receipt progress.</p><div className="feature-flow"><b>Request</b><i>→</i><b>Human review</b></div></article>
            <article className="public-feature public-feature-wide"><span>04 / INTELLIGENCE</span><h3>Turn records into useful signals.</h3><p>Use transparent inventory coverage estimates, rule-based review signals, advisory pricing scenarios and an optional workspace AI copilot.</p><div className="feature-intel"><b/><b/><b/><b/><b/><b/><b/></div><small>PLANNING BASELINE · NOT A GUARANTEED FORECAST</small></article>
          </div>
        </section>

        <section className="public-workflow" id="workflow">
          <div><p className="public-eyebrow">BUILT FOR ACCOUNTABLE OPERATIONS</p><h2>Useful context.<br/>Clear next steps.</h2></div>
          <div className="workflow-steps">
            <div><b>01</b><span><strong>Build the workspace</strong><small>Add inventory and supplier records to establish your operating baseline.</small></span></div>
            <div><b>02</b><span><strong>Prepare a purchase request</strong><small>Connect the item, supplier, quantity and business rationale.</small></span></div>
            <div><b>03</b><span><strong>Review and record</strong><small>Owners/admins review requests; the team can record order and receipt progress.</small></span></div>
          </div>
        </section>
        <section className="public-bottom-cta"><div><p className="public-eyebrow">YOUR PROCUREMENT WORKSPACE</p><h2>Bring your buying workflow into focus.</h2><p>Start with your own records and a human-reviewed process.</p></div><button className="public-cta" type="button" onClick={() => { setMode('register'); setError(''); }}>Create your workspace <span>→</span></button></section>
        <footer className="public-footer"><span>VENDORMESH · PROCUREMENT WORKSPACE</span><span>Inventory visibility. Supplier context. Accountable purchasing.</span></footer>
      </main>
    );
  }

  return <main className="auth-shell">
    <section className="auth-form-side">
      <div className="auth-card">
        <div className="auth-brand-row"><img className="brand-symbol auth-brand-symbol" src="/vendormesh-mark.svg" alt="VendorMesh" /><span>VENDORMESH / WORKSPACE</span><span className="auth-secure"><i /> PRIVATE WORKSPACE</span></div>
        <p className="eyebrow">PROCUREMENT INTELLIGENCE</p>
        <h1>{mode === 'register' ? 'Make every purchase more deliberate.' : 'Welcome back.'}</h1>
        <p className="muted">{mode === 'register' ? 'Bring inventory, supplier relationships and purchase approvals into one focused workspace.' : 'Sign in to continue managing your workspace.'}</p>
        <div className="auth-tabs">
          <button type="button" className={mode === 'register' ? 'selected' : ''} onClick={() => { setMode('register'); setError(''); }}>Create workspace</button>
          <button type="button" className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button>
        </div>
        <form onSubmit={submit} className="form-stack">
          {mode === 'register' && <>
            <label>Your name<input required minLength="2" maxLength="120" autoComplete="name" value={form.name} onChange={change('name')} placeholder="Alex Morgan" /></label>
            <label>Company name<input required minLength="2" maxLength="120" autoComplete="organization" value={form.companyName} onChange={change('companyName')} placeholder="Acme Supply Co." /></label>
          </>}
          <label>Work email<input required type="email" autoComplete="email" value={form.email} onChange={change('email')} placeholder="you@company.com" /></label>
          <label>Password<input required type="password" minLength={mode === 'register' ? 10 : 1} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={form.password} onChange={change('password')} placeholder={mode === 'register' ? 'At least 10 characters' : 'Your password'} /></label>
          {error && <div className="error-box" role="alert">{error}</div>}
          <button className="primary wide auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create your workspace' : 'Sign in'} <span aria-hidden="true">→</span></button>
        </form>
        <p className="tiny muted">Your business workspace is isolated from other companies. Keep your login credentials private.</p>
      </div>
    </section>
    <aside className="auth-aside"><div className="auth-ambient-grid" aria-hidden="true" /><div className="auth-aside-content">
      <span className="aside-kicker">A MORE ACCOUNTABLE WAY TO BUY</span>
      <h2>Clarity from stock signal to purchase decision.</h2>
      <p>Make operational context easier to see. Keep procurement workflows reviewable, deliberate and grounded in your workspace records.</p>
      <div className="auth-preview">
        <div className="auth-preview-heading"><span>WORKSPACE FLOW</span><span className="auth-preview-tag">PRODUCT PREVIEW</span></div>
        <div className="auth-flow-row"><span className="auth-flow-icon">▦</span><span><b>Inventory visibility</b><small>Stock counts · Reorder thresholds</small></span><span className="auth-flow-state">01</span></div>
        <div className="auth-flow-connector" />
        <div className="auth-flow-row"><span className="auth-flow-icon">⇄</span><span><b>Supplier context</b><small>Contacts · Lead times · Reliability</small></span><span className="auth-flow-state">02</span></div>
        <div className="auth-flow-connector" />
        <div className="auth-flow-row"><span className="auth-flow-icon">✓</span><span><b>Human-reviewed purchasing</b><small>Requests · Approvals · Audit trail</small></span><span className="auth-flow-state">03</span></div>
        <div className="auth-preview-footer"><span><i /> WORKSPACE CONTROLS</span><span>BUILT AROUND REVIEWABLE DECISIONS</span></div>
      </div>
      <div className="auth-feature-line"><span>INVENTORY</span><span>SUPPLIER INTELLIGENCE</span><span>APPROVAL WORKFLOWS</span></div>
    </div></aside>
  </main>;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [summary, setSummary] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [team, setTeam] = useState([]);
  const [auditEntries, setAuditEntries] = useState([]);
  const [forecastResult, setForecastResult] = useState(null);
  const [anomalyResult, setAnomalyResult] = useState(null);
  const [pricingForm, setPricingForm] = useState({ basePrice: '100', unitCost: '60', baselineUnits: '100', elasticity: '1.2', competitorPrice: '' });
  const [pricingResult, setPricingResult] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [itemForm, setItemForm] = useState({ sku: '', name: '', onHand: '0', reorderPoint: '0', unitCost: '0', dailyDemand: '0' });
  const [supplierForm, setSupplierForm] = useState({ name: '', email: '', leadTimeDays: '7', reliabilityScore: '80', paymentTerms: 'Net 30' });
  const [requestForm, setRequestForm] = useState({ inventoryItemId: '', supplierId: '', quantity: '1', unitCost: '', rationale: '' });
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('vendormesh.theme') === 'light' ? 'light' : 'dark'; }
    catch { return 'dark'; }
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [focusTarget, setFocusTarget] = useState('');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem('vendormesh.theme', theme); } catch { /* Storage can be unavailable in private contexts. */ }
  }, [theme]);

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && session) {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [session]);

  useEffect(() => {
    if (!focusTarget) return;
    const target = document.querySelector('[data-command-target="' + focusTarget + '"]');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.querySelector('input:not([type="hidden"]), select, textarea')?.focus({ preventScroll: true });
    }
    setFocusTarget('');
  }, [tab, focusTarget]);

  const refresh = useCallback(async () => {
    const [s, i, v, p, r] = await Promise.all([
      api('/api/workspace/summary'), api('/api/workspace/inventory'), api('/api/workspace/suppliers'), api('/api/workspace/purchase-requests'), api('/api/workspace/recommendations')
    ]);
    setSummary(s); setInventory(i); setSuppliers(v); setRequests(p); setRecommendations(r.recommendations || []);
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem(tokenKey);
    if (!token) { setLoading(false); return; }
    api('/api/auth/me').then(async (me) => { setSession(me); await refresh(); }).catch(() => sessionStorage.removeItem(tokenKey)).finally(() => setLoading(false));
  }, [refresh]);

  async function authenticated(result) {
    setSummary(null); setInventory([]); setSuppliers([]); setRequests([]); setRecommendations([]); setTeam([]); setAuditEntries([]); setPricingResult(null); setForecastResult(null); setAnomalyResult(null); setTab('overview');
    setSession({ user: result.user, company: result.company });
    setError(''); setNotice('Workspace ready. Add your inventory and suppliers to get started.');
    try { await refresh(); } catch (e) { setError(e.message); }
  }
  function signOut() { sessionStorage.removeItem(tokenKey); setSession(null); setSummary(null); setInventory([]); setSuppliers([]); setRequests([]); setRecommendations([]); setTeam([]); setAuditEntries([]); setPricingResult(null); setForecastResult(null); setAnomalyResult(null); setTab('overview'); }
  async function act(fn, success) {
    setBusy(true); setError(''); setNotice('');
    try { await fn(); await refresh(); if (success) setNotice(success); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function addInventory(e) {
    e.preventDefault();
    await act(async () => { await api('/api/workspace/inventory', { method: 'POST', body: JSON.stringify({ ...itemForm, onHand: Number(itemForm.onHand), reorderPoint: Number(itemForm.reorderPoint), unitCost: Number(itemForm.unitCost), dailyDemand: Number(itemForm.dailyDemand) }) }); setItemForm({ sku: '', name: '', onHand: '0', reorderPoint: '0', unitCost: '0', dailyDemand: '0' }); }, 'Inventory item saved.');
  }
  async function addSupplier(e) {
    e.preventDefault();
    const manager = ['owner', 'admin'].includes(session?.company?.role);
    const payload = {
      name: supplierForm.name,
      email: supplierForm.email,
      ...(manager ? { leadTimeDays: Number(supplierForm.leadTimeDays), reliabilityScore: Number(supplierForm.reliabilityScore), paymentTerms: supplierForm.paymentTerms } : {})
    };
    await act(async () => { await api('/api/workspace/suppliers', { method: 'POST', body: JSON.stringify(payload) }); setSupplierForm({ name: '', email: '', leadTimeDays: '7', reliabilityScore: '80', paymentTerms: 'Net 30' }); }, 'Supplier added.');
  }
  async function createRequest(e) {
    e.preventDefault();
    await act(async () => { await api('/api/workspace/purchase-requests', { method: 'POST', body: JSON.stringify({ ...requestForm, quantity: Number(requestForm.quantity), ...(requestForm.unitCost !== '' ? { unitCost: Number(requestForm.unitCost) } : {}) }) }); setRequestForm({ inventoryItemId: '', supplierId: '', quantity: '1', unitCost: '', rationale: '' }); }, 'Purchase request submitted for review.');
  }
  async function review(id, decision) {
    await act(() => api(`/api/workspace/purchase-requests/${id}/review`, { method: 'POST', body: JSON.stringify({ decision }) }), `Request ${decision}.`);
  }
  async function transitionRequest(id, payload) {
    await act(() => api(`/api/workspace/purchase-requests/${id}/transition`, { method: 'POST', body: JSON.stringify(payload) }), `Request moved to ${payload.status.replaceAll('_', ' ')}.`);
  }
  async function runPricing(e) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const result = await api('/api/workspace/pricing-simulator', { method: 'POST', body: JSON.stringify({ basePrice: Number(pricingForm.basePrice), unitCost: Number(pricingForm.unitCost), baselineUnits: Number(pricingForm.baselineUnits), elasticity: Number(pricingForm.elasticity), ...(pricingForm.competitorPrice !== '' ? { competitorPrice: Number(pricingForm.competitorPrice) } : {}) }) });
      setPricingResult(result); setNotice('Pricing scenarios calculated. No prices were changed.');
    } catch (e2) { setError(e2.message); }
    finally { setBusy(false); }
  }
  async function loadAnomalies() {
    try { setAnomalyResult(await api('/api/workspace/anomalies')); }
    catch (e) { setError(e.message); }
  }
  async function loadForecast() {
    try { setForecastResult(await api('/api/workspace/forecast')); }
    catch (e) { setError(e.message); }
  }
  async function loadAuditLog() {
    try { const result = await api('/api/workspace/audit-log?limit=50'); setAuditEntries(result.entries || []); }
    catch (e) { setError(e.message); }
  }
  async function loadTeam() {
    try { setTeam(await api('/api/workspace/team')); } catch (e) { setError(e.message); }
  }
  async function updateMember(id, patch) {
    await act(async () => { await api(`/api/workspace/team/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }); await loadTeam(); }, 'Team permissions updated.');
  }
  useEffect(() => { if (tab === 'forecast' && session) loadForecast(); }, [tab, session?.company?.id]);
  useEffect(() => { if (tab === 'anomalies' && session) loadAnomalies(); }, [tab, session?.company?.id]);
  useEffect(() => { if (tab === 'team' && ['owner', 'admin'].includes(session?.company?.role)) loadTeam(); }, [tab, session?.company?.role]);
  useEffect(() => { if (tab === 'audit' && ['owner', 'admin'].includes(session?.company?.role)) loadAuditLog(); }, [tab, session?.company?.role]);
  if (loading) return <div className="loading">Loading your workspace…</div>;
  if (!session) return <AuthScreen onAuthenticated={authenticated} />;

  const lowCount = inventory.filter((i) => i.lowStock).length;
  const firstName = (session.user?.name || 'there').trim().split(/\s+/)[0];
  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
  const todayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  const isManager = ['owner', 'admin'].includes(session.company?.role);
  const nav = [['overview', 'Overview', 'overview'], ['inventory', 'Inventory', 'inventory'], ['suppliers', 'Suppliers', 'suppliers'], ['purchases', 'Purchasing', 'purchases'], ['invoices', 'Invoices', 'invoices'], ['recommendations', 'AI insights', 'sparkles'], ['forecast', 'Forecast', 'forecast'], ['anomalies', 'Review queue', 'anomalies'], ['pricing', 'Pricing lab', 'pricing'], ...(isManager ? [['reconciliation', 'Reconciliation', 'reconciliation'], ['team', 'Team access', 'team'], ['audit', 'Audit log', 'audit'], ['ai', 'AI copilot', 'sparkles'], ['api-keys', 'API access', 'key']] : [])];
  const pageTitles = {overview:'Procurement overview',inventory:'Inventory control',suppliers:'Supplier directory',purchases:'Purchase approvals',invoices:'Invoice review',reconciliation:'Financial reconciliation',recommendations:'Replenishment intelligence',forecast:'Inventory forecast',anomalies:'Risk review queue',pricing:'Pricing scenario lab',ai:'AI procurement copilot','api-keys':'External API access',team:'Team access & permissions',audit:'Workspace audit trail'};
  const commandItems = [
    ...nav.map(([id, label]) => ({ id: 'page-' + id, group: 'Navigation', label: 'Go to ' + label, description: pageTitles[id], icon: '↗', onSelect: () => setTab(id) })),
    { id: 'new-inventory', group: 'Quick actions', label: 'Add inventory item', description: 'Open the inventory form', icon: '+', onSelect: () => { setTab('inventory'); setFocusTarget('inventory-form'); } },
    { id: 'new-supplier', group: 'Quick actions', label: 'Add supplier', description: 'Open the supplier form', icon: '+', onSelect: () => { setTab('suppliers'); setFocusTarget('supplier-form'); } },
    { id: 'new-purchase', group: 'Quick actions', label: 'Create purchase request', description: 'Prepare a request for human approval', icon: '+', onSelect: () => { setTab('purchases'); setFocusTarget('purchase-form'); } },
    { id: 'theme-toggle', group: 'Preferences', label: 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' appearance', description: 'Change the workspace color theme', icon: theme === 'dark' ? '☼' : '◐', onSelect: () => setTheme(theme === 'dark' ? 'light' : 'dark') }
  ];
  return <>
    <div className={'app-shell' + (sidebarCollapsed ? ' sidebar-collapsed' : '')}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="side-brand"><img className="brand-symbol" src="/vendormesh-mark.svg" alt="" /><div className="side-brand-copy"><strong>VendorMesh</strong><small>PROCUREMENT WORKSPACE</small></div>
          <button className="sidebar-toggle" type="button" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}>{sidebarCollapsed ? '»' : '«'}</button>
        </div>
        <div className="workspace-label">ACTIVE WORKSPACE</div>
        <div className="workspace-chip" title={session.company?.name || 'Active workspace'}>
          <span className="company-avatar">{(session.company?.name || 'V').slice(0,1).toUpperCase()}</span>
          <span><b>{session.company?.name}</b><small>{session.company?.role || 'member'}</small></span>
        </div>
        <button className="quick-jump" type="button" onClick={() => setCommandOpen(true)} aria-label="Open quick jump command palette">
          <span className="quick-jump-icon" aria-hidden="true">⌕</span><span className="quick-jump-label">Quick Jump...</span><kbd>Ctrl K</kbd>
        </button>
        <nav aria-label="Workspace pages">
          {nav.map(([id, label, icon]) => (
            <button key={id} title={label} aria-label={label} className={tab === id ? 'nav-active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>
              <span className="nav-icon"><NavIcon name={icon}/></span><span className="nav-label">{label}</span>
              {id === 'inventory' && lowCount > 0 && <i className="nav-counter nav-counter-warn">{lowCount}</i>}
              {id === 'purchases' && summary?.pendingApprovals > 0 && <i className="nav-counter">{summary.pendingApprovals}</i>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="secure-note"><span>●</span><span className="secure-note-label">Workspace session active</span></div>
          <button className="signout" onClick={signOut}><span aria-hidden="true">↪</span><span className="signout-label">Sign out</span></button>
        </div>
      </aside>
      <main className="main-area" id="main-content" tabIndex="-1">
        <header className="topbar">
          <div className="topbar-heading"><p className="eyebrow"><span>WORKSPACE</span><span className="breadcrumb-separator"> / </span>{tab.toUpperCase()}</p><h1>{pageTitles[tab]}</h1></div>
          <div className="topbar-actions">
            <button className="topbar-search" type="button" onClick={() => setCommandOpen(true)} aria-label="Search pages and actions"><span aria-hidden="true">⌕</span><span className="topbar-search-label">Search pages &amp; actions</span><kbd>Ctrl K</kbd></button>
            <button className="theme-toggle" type="button" onClick={() => setTheme((value) => value === 'dark' ? 'light' : 'dark')} aria-label={'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' mode'} title={'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' mode'}><span aria-hidden="true">{theme === 'dark' ? '☼' : '◐'}</span><span className="theme-toggle-label">{theme === 'dark' ? 'Light' : 'Dark'}</span></button>
            <div className="top-user"><div className="user-avatar">{(session.user?.name || 'U').slice(0,1).toUpperCase()}</div><div><b>{session.user?.name}</b><small>{session.user?.email}</small></div></div>
          </div>
        </header>      {(error || notice) && <div className={error ? 'flash flash-error' : 'flash flash-ok'} role={error ? 'alert' : 'status'}>{error || notice}<button onClick={() => {setError('');setNotice('');}}>×</button></div>}
      {tab === 'overview' && <>
        <section className="dashboard-hero">
          <div className="dashboard-hero-copy">
            <div className="dashboard-meta"><span className="dashboard-kicker">WORKSPACE SNAPSHOT</span><span className="dashboard-date">{todayLabel}</span></div>
            <h2>{greeting}, {firstName}.</h2>
            <p>Your procurement workspace, grounded in the inventory and purchasing records your team has entered.</p>
            <div className="dashboard-hero-actions">
              <button className="primary" onClick={() => { setTab('purchases'); setFocusTarget('purchase-form'); }}>＋ New purchase request</button>
              <button className="secondary" onClick={() => { setTab('suppliers'); setFocusTarget('supplier-form'); }}>Add supplier</button>
            </div>
          </div>
          <div className="dashboard-hero-value">
            <span>ESTIMATED INVENTORY VALUE</span>
            <strong>{money(summary?.inventoryValue, session.company?.currency)}</strong>
            <small>On-hand quantity × recorded unit cost</small>
            <div className="hero-value-foot"><span><b>{summary?.inventoryCount ?? 0}</b> SKUs</span><span><b>{summary?.totalUnits ?? 0}</b> units on hand</span></div>
          </div>
          <div className="dashboard-hero-orbit" aria-hidden="true" />
        </section>
        <div className="dashboard-section-head">
          <div><span className="dashboard-kicker">AT A GLANCE</span><h2>Operational overview</h2><p>Current values from this workspace. Small bars show record profiles, not historical performance.</p></div>
          <span className="snapshot-status"><i /> WORKSPACE DATA</span>
        </div>
        <div className="metric-grid dashboard-metrics">
          <Metric label="Inventory items" value={summary?.inventoryCount ?? '—'} note={(summary?.totalUnits ?? 0) + ' units on hand'} icon="▦" series={inventory.slice(0,12).map((item) => item.onHand)} seriesLabel="On-hand units across the first 12 inventory records" seriesCaption="ON-HAND PROFILE" />
          <Metric label="Low-stock alerts" value={summary?.lowStock ?? 0} note={lowCount ? 'Items at or below reorder thresholds' : 'No items below reorder thresholds'} icon="⌁" tone={lowCount ? 'amber' : ''} series={inventory.slice(0,12).map((item) => item.lowStock ? 1 : 0)} seriesLabel="Low-stock status across the first 12 inventory records" seriesCaption="STOCK STATUS" />
          <Metric label="Active suppliers" value={summary?.supplierCount ?? '—'} note="Supplier records in this workspace" icon="⇄" series={suppliers.slice(0,12).map((supplier) => supplier.reliabilityScore).filter((score) => Number.isFinite(Number(score)))} seriesLabel="Recorded supplier reliability scores" seriesCaption="RECORDED RELIABILITY" />
          <Metric label="Pending approvals" value={summary?.pendingApprovals ?? 0} note="Requests awaiting owner/admin review" icon="◷" tone={summary?.pendingApprovals ? 'amber' : ''} series={requests.slice(0,12).map((request) => request.status === 'pending' ? 1 : 0)} seriesLabel="Pending status across the first 12 purchase requests" seriesCaption="REQUEST STATUS" />
        </div>
        <div className="dashboard-bento">
          <PurchaseRequestChart requests={requests} currency={session.company?.currency} />
          <ActionInbox requests={requests} inventory={inventory} currency={session.company?.currency} onPurchases={() => setTab('purchases')} onInventory={() => setTab('inventory')} onInsights={() => setTab('recommendations')} />
        </div>
        <div className="section-heading"><div><h2>Inventory health</h2><p>Stock levels compared with your reorder thresholds.</p></div><button className="secondary" onClick={() => setTab('inventory')}>Manage inventory →</button></div>
        <div className="table-card"><InventoryTable items={inventory.slice(0,6)} currency={session.company?.currency}/>{inventory.length === 0 && <Empty title="Your inventory starts here" text="Add SKUs, stock counts, reorder points and unit costs to get a useful stock-risk view."/>}</div>
        <div className="section-heading"><div><h2>Recent purchase requests</h2><p>Keep purchasing decisions reviewable and accountable.</p></div><button className="secondary" onClick={() => setTab('purchases')}>Open approvals →</button></div>
        <div className="table-card"><RequestTable requests={requests.slice(0,5)} currency={session.company?.currency}/>{requests.length === 0 && <Empty title="No purchase requests yet" text="Create a request when an item needs replenishment or planned buying."/>}</div>
      </>}      {tab === 'inventory' && <><div className="section-heading"><div><h2>Inventory records</h2><p>Track quantities, reorder points, unit cost and demand.</p></div></div><form className="form-card" data-command-target="inventory-form" onSubmit={addInventory}><h3>Add inventory item</h3><div className="fields"><Field label="SKU" value={itemForm.sku} onChange={v=>setItemForm({...itemForm,sku:v})} required/><Field label="Item name" value={itemForm.name} onChange={v=>setItemForm({...itemForm,name:v})} required/><Field label="On hand" type="number" min="0" value={itemForm.onHand} onChange={v=>setItemForm({...itemForm,onHand:v})} required/><Field label="Reorder point" type="number" min="0" value={itemForm.reorderPoint} onChange={v=>setItemForm({...itemForm,reorderPoint:v})} required/><Field label="Unit cost" type="number" min="0" step="0.01" value={itemForm.unitCost} onChange={v=>setItemForm({...itemForm,unitCost:v})} required/><Field label="Daily demand" type="number" min="0" step="0.1" value={itemForm.dailyDemand} onChange={v=>setItemForm({...itemForm,dailyDemand:v})}/></div><button className="primary" disabled={busy}>{busy?'Saving…':'Save inventory item'}</button></form><div className="table-card"><InventoryTable items={inventory} currency={session.company?.currency}/>{inventory.length===0&&<Empty title="No inventory records" text="Use the form above to add your first SKU."/>}</div></>}
      {tab === 'suppliers' && <><div className="section-heading"><div><h2>Supplier directory</h2><p>Keep contact details, lead times and reliability in one place.</p></div></div><form className="form-card" data-command-target="supplier-form" onSubmit={addSupplier}><h3>Add supplier</h3><div className="fields"><Field label="Supplier name" value={supplierForm.name} onChange={v=>setSupplierForm({...supplierForm,name:v})} required/><Field label="Contact email" type="email" value={supplierForm.email} onChange={v=>setSupplierForm({...supplierForm,email:v})}/>{['owner','admin'].includes(session.company?.role) && <><Field label="Lead time (days)" type="number" min="0" value={supplierForm.leadTimeDays} onChange={v=>setSupplierForm({...supplierForm,leadTimeDays:v})}/><Field label="Reliability (0–100)" type="number" min="0" max="100" value={supplierForm.reliabilityScore} onChange={v=>setSupplierForm({...supplierForm,reliabilityScore:v})}/><Field label="Payment terms" value={supplierForm.paymentTerms} onChange={v=>setSupplierForm({...supplierForm,paymentTerms:v})}/></>}</div><button className="primary" disabled={busy}>{busy?'Saving…':'Add supplier'}</button></form><div className="supplier-grid">{suppliers.map(s=><article className="supplier-card" key={s._id}><div className="supplier-avatar">{s.name.slice(0,1).toUpperCase()}</div><div className="supplier-info"><h3>{s.name}</h3><p>{s.email || 'No contact email added'}</p><div className="supplier-meta"><span>{s.leadTimeDays} day lead time</span><span>{s.reliabilityScore}% reliability</span></div><small>{s.paymentTerms}</small></div></article>)}</div>{suppliers.length===0&&<Empty title="Build your supplier network" text="Add your trusted vendors before creating purchase requests."/>}</>}
      {tab === 'recommendations' && <><div className="section-heading"><div><h2>Inventory recommendations</h2><p>Rules-based suggestions from this workspace's stock, demand and supplier lead times. No orders are placed automatically.</p></div><button className="secondary" onClick={() => act(async () => { const result = await api('/api/workspace/recommendations'); setRecommendations(result.recommendations || []); }, 'Recommendations refreshed.')}>Refresh insights</button></div>{recommendations.length === 0 ? <Empty title="No urgent replenishment signals" text="Add daily demand, reorder points and supplier records to make these insights more useful."/> : <div className="table-card"><div className="table-scroll"><table><thead><tr><th>Item</th><th>Priority</th><th>On hand</th><th>Days of cover</th><th>Suggested qty</th><th>Supplier</th><th>Why flagged</th><th>Next step</th></tr></thead><tbody>{recommendations.map(r=><tr key={r.inventoryItemId}><td><b>{r.name}</b><small className="table-sub">{r.sku}</small></td><td><span className={`status ${r.priority==='high'?'status-low':r.priority==='medium'?'status-pending':'status-ok'}`}>{r.priority}</span></td><td>{r.onHand}</td><td>{r.daysOfCover===null?'—':r.daysOfCover}</td><td>{r.suggestedQuantity}</td><td>{r.supplier ? <>{r.supplier.name}<small className="table-sub">{r.supplier.leadTimeDays} day lead · {r.supplier.reliabilityScore}% reliable</small></> : 'Not linked'}</td><td>{r.reasons.join(' ')}</td><td>{r.action==='review_purchase_request' && r.supplier ? <button className="secondary" onClick={()=>{setRequestForm({inventoryItemId:r.inventoryItemId,supplierId:r.supplier.id,quantity:String(Math.max(1,r.suggestedQuantity)),unitCost:String(inventory.find(i=>i._id===r.inventoryItemId)?.unitCost ?? 0),rationale:r.reasons.join(' ')});setTab('purchases');}}>Prepare request →</button> : <span className="muted">Monitor stock</span>}</td></tr>)}</tbody></table></div></div>}</>}
      {tab === 'ai' && <WorkspaceAI api={api} session={session} />}
      {tab === 'invoices' && <WorkspaceInvoices api={api} role={session.company?.role} currency={session.company?.currency} />}
      {tab === 'reconciliation' && <WorkspaceReconciliation api={api} />}
      {tab === 'api-keys' && <WorkspaceAPIKeys api={api} />}
      {tab === 'anomalies' && <><div className="section-heading"><div><h2>Review signals</h2><p>Rule-based checks across recent workspace purchase requests. Flags never approve, reject, or pay automatically.</p></div><button className="secondary" onClick={loadAnomalies}>Refresh review queue</button></div>{anomalyResult && <><p className="inline-hint">{anomalyResult.warning} The review set includes the latest 500 purchase requests only.</p><div className="metric-grid"><Metric label="Signals found" value={anomalyResult.count} note="Not fraud findings" icon="!"/><Metric label="High-priority review" value={anomalyResult.anomalies.filter(a=>a.severity==='high_priority_review').length} note="Human review recommended" icon="⌁" tone="amber"/><Metric label="Review recommended" value={anomalyResult.anomalies.filter(a=>a.severity==='review_recommended').length} note="Verify record consistency" icon="✓"/></div><div className="table-card"><div className="table-scroll"><table><thead><tr><th>Priority</th><th>Signal</th><th>Record</th><th>Finding</th><th>Evidence</th><th>Suggested review</th></tr></thead><tbody>{anomalyResult.anomalies.map(a=><tr key={a.id}><td><span className={'status '+(a.severity==='high_priority_review'?'status-rejected':'status-pending')}>{a.severity.replaceAll('_',' ')}</span></td><td><b>{a.title}</b><small className="table-sub">{a.type.replaceAll('_',' ')}</small></td><td><code>{a.recordId}</code><small className="table-sub">{a.evidence.itemName || 'Purchase request'}</small></td><td>{a.message}</td><td>{a.evidence.supplierName || 'Supplier unavailable'}{a.evidence.totalCost !== undefined && <small className="table-sub">Total {money(a.evidence.totalCost,a.evidence.currency)} · Limit {money(a.evidence.maximumAllowed,a.evidence.currency)}</small>}{a.evidence.previousRequestId && <small className="table-sub">Similar request: {a.evidence.previousRequestId}</small>}</td><td>{a.nextStep}</td></tr>)}</tbody></table></div>{anomalyResult.count===0&&<Empty title="No review signals found" text="No matching review conditions were found in the latest requests. This is not a guarantee that all records are correct."/>}</div></>}</>}
      {tab === 'forecast' && <><div className="section-heading"><div><h2>Inventory coverage baseline</h2><p>Planning estimates based on each item's configured daily demand, active supplier lead time, and a 3-day safety buffer.</p></div><button className="secondary" onClick={loadForecast}>Refresh forecast</button></div>{forecastResult && <><p className="inline-hint">{forecastResult.limitation} These are advisory estimates, not validated machine-learning predictions or guarantees.</p><div className="metric-grid"><Metric label="Items assessed" value={forecastResult.forecasts.length} note="Records in this workspace" icon="▦"/><Metric label="High stockout risk" value={forecastResult.forecasts.filter(f=>f.stockoutRisk==='high').length} note="Cover at/below lead time" icon="!" tone="amber"/><Metric label="Need demand data" value={forecastResult.forecasts.filter(f=>f.stockoutRisk==='insufficient_data').length} note="Add daily demand first" icon="⌁"/></div><div className="table-card"><div className="table-scroll"><table><thead><tr><th>Item</th><th>On hand</th><th>Daily demand</th><th>7-day demand</th><th>30-day demand</th><th>Days of cover</th><th>Supplier lead</th><th>Risk</th><th>Suggested reorder</th></tr></thead><tbody>{forecastResult.forecasts.map(f=><tr key={f.inventoryItemId}><td><b>{f.name}</b><small className="table-sub">{f.sku}</small></td><td>{f.onHand ?? '—'}</td><td>{f.dailyDemand ?? '—'}</td><td>{f.next7DaysDemand ?? '—'}</td><td>{f.next30DaysDemand ?? '—'}</td><td>{f.daysOfCover ?? '—'}</td><td>{f.supplier ? (f.supplier.leadTimeDays + ' days') : '7-day fallback'}</td><td><span className={'status ' + (f.stockoutRisk==='high'?'status-low':f.stockoutRisk==='medium'?'status-pending':f.stockoutRisk==='normal'?'status-ok':'')}>{f.stockoutRisk.replace('_',' ')}</span><small className="table-sub">{f.explanation}</small></td><td>{f.suggestedReorderQuantity ?? 'Add demand data'}</td></tr>)}</tbody></table></div>{forecastResult.forecasts.length===0&&<Empty title="No inventory to forecast" text="Add workspace inventory records to generate transparent stock coverage estimates."/>}</div></>}</>}
      {tab === 'pricing' && <><div className="section-heading"><div><h2>What-if pricing scenarios</h2><p>Estimate revenue and gross profit across five price points before making a human-reviewed decision.</p></div></div><form className="form-card" onSubmit={runPricing}><h3>Scenario assumptions</h3><div className="fields"><Field label="Current unit price" type="number" min="0.01" step="0.01" value={pricingForm.basePrice} onChange={v=>setPricingForm({...pricingForm,basePrice:v})} required/><Field label="Unit cost" type="number" min="0" step="0.01" value={pricingForm.unitCost} onChange={v=>setPricingForm({...pricingForm,unitCost:v})} required/><Field label="Baseline units in period" type="number" min="0" step="1" value={pricingForm.baselineUnits} onChange={v=>setPricingForm({...pricingForm,baselineUnits:v})} required/><Field label="Demand elasticity (0–5)" type="number" min="0" max="5" step="0.1" value={pricingForm.elasticity} onChange={v=>setPricingForm({...pricingForm,elasticity:v})} required/><Field label="Competitor price (optional)" type="number" min="0.01" step="0.01" value={pricingForm.competitorPrice} onChange={v=>setPricingForm({...pricingForm,competitorPrice:v})}/></div><button className="primary" disabled={busy}>{busy?'Calculating…':'Calculate scenarios'}</button></form>{pricingResult&&<><div className="flash flash-ok">{pricingResult.warning}</div><div className="section-heading"><div><h2>Estimated outcomes</h2><p>These are model-based estimates, not guaranteed forecasts.</p></div></div><div className="table-card"><div className="table-scroll"><table><thead><tr><th>Price change</th><th>Price</th><th>Predicted units</th><th>Revenue</th><th>Gross profit</th><th>Margin</th><th>Vs. competitor</th></tr></thead><tbody>{pricingResult.scenarios.map((s)=><tr key={s.changePercent}><td>{s.changePercent>0?'+':''}{s.changePercent}%</td><td>{money(s.price)}</td><td>{s.predictedUnits}</td><td>{money(s.revenue)}</td><td>{money(s.grossProfit)}</td><td>{s.marginPercent}%</td><td>{s.versusCompetitorPercent===null?'—':`${s.versusCompetitorPercent>0?'+':''}${s.versusCompetitorPercent}%`}</td></tr>)}</tbody></table></div><p className="muted">Highest estimated gross profit: {money(pricingResult.highestEstimatedGrossProfit.grossProfit)} at {money(pricingResult.highestEstimatedGrossProfit.price)}.</p></div></>}</>}
      {tab === 'audit' && <><div className="section-heading"><div><h2>Workspace activity</h2><p>Recent authenticated write requests. Request payloads and secrets are never displayed.</p></div><button className="secondary" onClick={loadAuditLog}>Refresh log ↻</button></div><div className="table-card"><div className="table-scroll"><table><thead><tr><th>Time</th><th>Actor</th><th>Role</th><th>Action</th><th>Resource</th><th>Status</th><th>Request ID</th></tr></thead><tbody>{auditEntries.map((entry) => <tr key={entry._id}><td>{entry.occurredAt ? new Date(entry.occurredAt).toLocaleString() : '—'}</td><td><code>{entry.actorUserId || 'system'}</code></td><td>{entry.actorRole || 'unknown'}</td><td><span className="status">{entry.action}</span></td><td><code>{entry.resource}</code></td><td><span className={`status ${entry.statusCode >= 400 ? 'status-low' : 'status-ok'}`}>{entry.statusCode}</span></td><td><code>{entry.requestId || '—'}</code></td></tr>)}</tbody></table></div>{auditEntries.length===0&&<Empty title="No audit events yet" text="Authenticated write requests will appear here after workspace activity."/>}</div></>}
      {tab === 'team' && <><div className="section-heading"><div><h2>Workspace members</h2><p>Review current access. Owners retain ownership; only owners can grant admin access.</p></div><button className="secondary" onClick={loadTeam}>Refresh members</button></div><div className="table-card"><div className="table-scroll"><table><thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Status</th><th>Permissions</th></tr></thead><tbody>{team.map(m=><tr key={m.id}><td><b>{m.name}</b></td><td>{m.email}</td><td>{m.role==='owner'?'Owner':<select aria-label={`Role for ${m.name}`} value={m.role} disabled={busy||session.company?.role!=='owner'} onChange={e=>updateMember(m.id,{role:e.target.value})}><option value="staff">Staff</option><option value="admin">Admin</option></select>}</td><td><span className={`status ${m.status==='active'?'status-ok':'status-low'}`}>{m.status}</span></td><td>{m.role==='owner'?'Protected owner account':<button className="secondary" disabled={busy} onClick={()=>updateMember(m.id,{status:m.status==='active'?'suspended':'active'})}>{m.status==='active'?'Suspend access':'Restore access'}</button>}</td></tr>)}</tbody></table></div>{team.length===0&&<Empty title="No team members loaded" text="Refresh to load members. Only owners and admins can view this page."/>}</div><p className="inline-hint">Team member invitations and email delivery are not included in this release. This screen manages existing workspace memberships only.</p></>}
      {tab === 'purchases' && <><div className="section-heading"><div><h2>Purchase requests</h2><p>Requests remain pending until an owner or admin reviews them.</p></div></div><form className="form-card" data-command-target="purchase-form" onSubmit={createRequest}><h3>New purchase request</h3>{(!inventory.length || !suppliers.some(s=>s.active)) && <p className="inline-hint">Add at least one inventory item and one active supplier before creating a request.</p>}<div className="fields"><label>Inventory item<select required value={requestForm.inventoryItemId} onChange={e=>{const item=inventory.find(i=>i._id===e.target.value);setRequestForm({...requestForm,inventoryItemId:e.target.value,unitCost:item?String(item.unitCost):''});}}><option value="">Select item…</option>{inventory.map(i=><option key={i._id} value={i._id}>{i.sku} — {i.name}</option>)}</select></label><label>Supplier<select required value={requestForm.supplierId} onChange={e=>setRequestForm({...requestForm,supplierId:e.target.value})}><option value="">Select supplier…</option>{suppliers.filter(s=>s.active).map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select></label><Field label="Quantity" type="number" min="1" value={requestForm.quantity} onChange={v=>setRequestForm({...requestForm,quantity:v})} required/><Field label="Unit cost" type="number" min="0" step="0.01" value={requestForm.unitCost} onChange={v=>setRequestForm({...requestForm,unitCost:v})} required/><Field label="Business rationale" value={requestForm.rationale} onChange={v=>setRequestForm({...requestForm,rationale:v})}/></div>{requestForm.quantity && requestForm.unitCost!=='' && <p className="estimate">Estimated request total <b>{money(Number(requestForm.quantity)*Number(requestForm.unitCost),session.company?.currency)}</b></p>}<button className="primary" disabled={busy||!inventory.length||!suppliers.some(s=>s.active)}>{busy?'Submitting…':'Submit for approval'}</button></form><div className="table-card"><RequestTable requests={requests} currency={session.company?.currency} onReview={review} onTransition={transitionRequest} role={session.company?.role}/>{requests.length===0&&<Empty title="No requests to review" text="Purchase requests will appear here with their approval status and audit details."/>}</div></>}
      <footer className="footer"><span>VENDORMESH · PROCUREMENT WORKSPACE</span><span>Human-reviewed decisions. Clear operational records.</span></footer>
      </main>
    </div>
    <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} items={commandItems} placeholder="Search pages, actions, and workspace tools..." />
  </>;
}
function Metric({label,value,note,icon,tone,series,seriesLabel,seriesCaption}) {
  const values = Array.isArray(series) ? series.map(Number).filter((value) => Number.isFinite(value)) : [];
  const max = Math.max(1, ...values);
  return <article className="metric-card">
    <div className="metric-card-top"><div className={'metric-icon ' + (tone || '')}>{icon}</div><span className="metric-label">{label}</span></div>
    <strong>{value}</strong>
    <small>{note}</small>
    {values.length > 0 && <div className="metric-profile" role="img" aria-label={seriesLabel || 'Record profile'}>
      <div className="metric-profile-bars">{values.map((value,index) => <span key={index} style={{height: Math.max(12, (value / max) * 100) + '%'}} />)}</div>
      <span>{seriesCaption || 'RECORD PROFILE'}</span>
    </div>}
  </article>;
}
function PurchaseRequestChart({requests,currency}) {
  const [range,setRange] = useState(7);
  const chart = useMemo(() => {
    const end = new Date();
    end.setHours(23,59,59,999);
    const start = new Date(end);
    start.setDate(start.getDate() - (range - 1));
    start.setHours(0,0,0,0);
    const count = range === 7 ? 7 : range === 30 ? 10 : 12;
    const bucketMs = (end.getTime() - start.getTime() + 1) / count;
    const points = Array.from({length:count},(_,index)=>({label:new Date(start.getTime() + bucketMs * index),value:0,count:0}));
    requests.forEach((request) => {
      const date = new Date(request.createdAt);
      if (!Number.isFinite(date.getTime()) || date < start || date > end) return;
      const index = Math.min(count - 1, Math.floor((date.getTime() - start.getTime()) / bucketMs));
      points[index].value += Number(request.totalCost) || 0;
      points[index].count += 1;
    });
    const totalValue = points.reduce((sum,point)=>sum+point.value,0);
    const totalCount = points.reduce((sum,point)=>sum+point.count,0);
    const maxValue = Math.max(1,...points.map(point=>point.value));
    const coords = points.map((point,index)=>Object.assign({},point,{
      x: 28 + (index / Math.max(1, count - 1)) * 624,
      y: 145 - (point.value / maxValue) * 110
    }));
    const line = coords.map((point,index)=>(index===0?'M':'L')+' '+point.x.toFixed(2)+' '+point.y.toFixed(2)).join(' ');
    const area = line+' L 652 150 L 28 150 Z';
    return {points:coords,totalValue,totalCount,line,area};
  },[requests,range]);
  return <section className="dashboard-panel chart-panel">
    <div className="panel-heading">
      <div><span className="dashboard-kicker">PROCUREMENT ACTIVITY</span><h2>Purchase request value</h2><p>Recorded request totals by creation date. This is requested value, not paid spend.</p></div>
      <div className="range-switch" aria-label="Chart date range">{[7,30,90].map(value=><button type="button" key={value} className={range===value?'selected':''} aria-pressed={range===value} onClick={()=>setRange(value)}>{value}D</button>)}</div>
    </div>
    <div className="chart-summary">
      <div><strong>{money(chart.totalValue,currency)}</strong><span>REQUESTED VALUE IN WINDOW</span></div>
      <div><strong>{chart.totalCount}</strong><span>REQUESTS CREATED</span></div>
    </div>
    {chart.totalCount === 0 ? <div className="chart-empty"><div className="chart-empty-icon">⌁</div><b>No purchase activity in this window</b><span>New purchase requests will appear here after they are created.</span></div> : <>
      <div className="request-chart" role="img" aria-label={chart.totalCount + ' purchase requests with total requested value ' + money(chart.totalValue,currency)}>
        <svg viewBox="0 0 680 180" preserveAspectRatio="none" aria-hidden="true">
          <defs><linearGradient id="request-chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#818cf8" stopOpacity=".32"/><stop offset="100%" stopColor="#818cf8" stopOpacity="0"/></linearGradient></defs>
          {[35,72,109,150].map(y=><line key={y} x1="28" x2="652" y1={y} y2={y} stroke="currentColor" strokeOpacity=".10" strokeDasharray="4 6" />)}
          <path d={chart.area} fill="url(#request-chart-fill)" />
          <path d={chart.line} fill="none" stroke="#818cf8" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          {chart.points.map((point,index)=><circle key={index} cx={point.x} cy={point.y} r="3.4" fill="#a5b4fc" stroke="#0c0c0f" strokeWidth="2"><title>{point.label.toLocaleDateString()} · {money(point.value,currency)} · {point.count} requests</title></circle>)}
        </svg>
      </div>
      <div className="chart-axis"><span>{chart.points[0]?.label.toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span><span>{chart.points[Math.floor(chart.points.length/2)]?.label.toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span><span>{chart.points[chart.points.length-1]?.label.toLocaleDateString(undefined,{month:'short',day:'numeric'})}</span></div>
    </>}
  </section>;
}
function ActionInbox({requests,inventory,currency,onPurchases,onInventory,onInsights}) {
  const pending = requests.filter((request)=>request.status==='pending');
  const lowStock = inventory.filter((item)=>item.lowStock);
  const items = [
    ...pending.slice(0,3).map((request)=>({id:request._id,type:'APPROVAL',title:request.itemName || 'Purchase request',detail:(request.supplierId?.name || 'Supplier not linked')+' · '+money(request.totalCost,request.currency || currency),action:'Review',run:onPurchases,tone:'amber'})),
    ...lowStock.slice(0,3).map((item)=>({id:item._id,type:'STOCK SIGNAL',title:item.name,detail:'On hand: '+item.onHand+' · Reorder point: '+item.reorderPoint,action:'Inspect',run:onInventory,tone:'rose'}))
  ].slice(0,5);
  return <section className="dashboard-panel action-panel">
    <div className="panel-heading"><div><span className="dashboard-kicker">OPERATOR QUEUE</span><h2>Action inbox</h2><p>Items from the current workspace that may need attention.</p></div><span className="inbox-count">{items.length}</span></div>
    {items.length === 0 ? <div className="inbox-empty"><span>✓</span><b>Nothing needs attention</b><p>No pending requests or low-stock items were found in the loaded records.</p><button className="secondary" type="button" onClick={onInsights}>View insights</button></div> : <div className="inbox-list">
      {items.map((item)=><article className="inbox-item" key={item.id}>
        <span className={'inbox-indicator ' + item.tone} />
        <div className="inbox-item-copy"><small>{item.type}</small><b>{item.title}</b><span>{item.detail}</span></div>
        <button className="inbox-action" type="button" onClick={item.run}>{item.action} <span>→</span></button>
      </article>)}
    </div>}
    <div className="inbox-footer"><span>{pending.length} pending approval{pending.length===1?'':'s'}</span><span>{lowStock.length} low-stock item{lowStock.length===1?'':'s'}</span></div>
  </section>;
}
function Field({label,value,onChange,type='text',...props}) { return <label>{label}<input type={type} value={value} onChange={e=>onChange(e.target.value)} {...props}/></label>; }
function Empty({title,text}) { return <div className="empty-state"><div className="empty-icon">↗</div><b>{title}</b><p>{text}</p></div>; }
function InventoryTable({items,currency}) { return <div className="table-scroll"><table><thead><tr><th>Item</th><th>SKU</th><th>On hand</th><th>Reorder point</th><th>Unit cost</th><th>Stock status</th></tr></thead><tbody>{items.map(i=><tr key={i._id}><td><b>{i.name}</b></td><td><code>{i.sku}</code></td><td>{i.onHand}</td><td>{i.reorderPoint}</td><td>{money(i.unitCost,currency)}</td><td><span className={`status ${i.lowStock?'status-low':'status-ok'}`}>{i.lowStock?'Reorder suggested':'In range'}</span></td></tr>)}</tbody></table></div>; }
function RequestTable({requests,currency,onReview,onTransition,role}) {
  const [receivedDrafts,setReceivedDrafts] = useState({});
  const manager = ['owner','admin'].includes(role);
  return <div className="table-scroll"><table><thead><tr><th>Request</th><th>Supplier</th><th>Qty</th><th>Total</th><th>Created</th><th>Status</th>{onReview&&<th>Review</th>}{onTransition&&<th>Fulfillment</th>}</tr></thead><tbody>{requests.map(r=>{
    const orderedQuantity = Number(r.orderedQuantity || r.quantity);
    const receivedQuantity = Number(r.receivedQuantity || 0);
    const draft = Number(receivedDrafts[r._id] ?? receivedQuantity);
    const canRecordReceipt = ['ordered','partially_received'].includes(r.status) && ['owner','admin','staff'].includes(role);
    return <tr key={r._id}><td><b>{r.itemName}</b><small className="table-sub">{r.sku}{r.rationale? ` · ${r.rationale}`:''}</small></td><td>{r.supplierId?.name || 'Supplier'}</td><td>{r.quantity}<small className="table-sub">Received {receivedQuantity} / {orderedQuantity}</small></td><td>{money(r.totalCost,r.currency||currency)}</td><td>{new Date(r.createdAt).toLocaleDateString()}</td><td><span className={`status status-${r.status}`}>{r.status.replaceAll('_',' ')}</span></td>{onReview&&<td>{r.status==='pending'&&manager?<div className="review-actions"><button type="button" onClick={()=>onReview(r._id,'approved')}>Approve</button><button type="button" onClick={()=>onReview(r._id,'rejected')}>Reject</button></div>:'—'}</td>}{onTransition&&<td>{r.status==='approved'&&manager?<button type="button" className="secondary" onClick={()=>onTransition(r._id,{status:'ordered',orderedQuantity:r.quantity,note:'Marked ordered from the workspace'})}>Mark ordered</button>:canRecordReceipt?<div className="fulfillment-actions"><label>Total received<input aria-label={`Total received for ${r.itemName}`} type="number" min={receivedQuantity+1} max={orderedQuantity} step="1" value={receivedDrafts[r._id] ?? String(receivedQuantity)} onChange={e=>setReceivedDrafts(prev=>({...prev,[r._id]:e.target.value}))}/></label><button type="button" disabled={!Number.isSafeInteger(draft)||draft<=receivedQuantity||draft>=orderedQuantity} onClick={()=>onTransition(r._id,{status:'partially_received',receivedQuantity:draft,note:'Partial receipt recorded from the workspace'})}>Record partial</button><button type="button" disabled={receivedQuantity>=orderedQuantity} onClick={()=>onTransition(r._id,{status:'received',receivedQuantity:orderedQuantity,note:'All ordered units received'})}>Receive all</button></div>:'—'}</td>}</tr>;
  })}</tbody></table></div>;
}
