import { useCallback, useEffect, useState } from 'react';
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

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('register');
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
  return <main className="auth-shell">
    <section className="auth-card">
      <div className="brand-mark">V<span>M</span></div>
      <p className="eyebrow">PROCUREMENT INTELLIGENCE</p>
      <h1>{mode === 'register' ? 'Run purchasing with clarity.' : 'Welcome back.'}</h1>
      <p className="muted">One workspace for stock, suppliers and accountable purchasing decisions.</p>
      <div className="auth-tabs"><button className={mode === 'register' ? 'selected' : ''} onClick={() => { setMode('register'); setError(''); }}>Create workspace</button><button className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setError(''); }}>Sign in</button></div>
      <form onSubmit={submit} className="form-stack">
        {mode === 'register' && <><label>Your name<input required minLength="2" maxLength="120" value={form.name} onChange={change('name')} placeholder="Alex Morgan" /></label><label>Company name<input required minLength="2" maxLength="120" value={form.companyName} onChange={change('companyName')} placeholder="Acme Supply Co." /></label></>}
        <label>Work email<input required type="email" autoComplete="email" value={form.email} onChange={change('email')} placeholder="you@company.com" /></label>
        <label>Password<input required type="password" minLength={mode === 'register' ? 10 : 1} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={form.password} onChange={change('password')} placeholder={mode === 'register' ? 'At least 10 characters' : 'Your password'} /></label>
        {error && <div className="error-box" role="alert">{error}</div>}
        <button className="primary wide" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create your workspace →' : 'Sign in →'}</button>
      </form>
      <p className="tiny muted">Your business workspace is isolated from other companies. Keep your login credentials private.</p>
    </section>
    <aside className="auth-aside"><div className="orb orb-one" /><div className="orb orb-two" /><span className="aside-kicker">VENDORMESH / WORKSPACE</span><h2>Make every purchase<br/>an informed decision.</h2><p>See stock risks, organize supplier relationships and route purchase requests through human approval.</p><div className="aside-points"><span>01 <b>Inventory visibility</b></span><span>02 <b>Supplier intelligence</b></span><span>03 <b>Approval-first purchasing</b></span></div></aside>
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
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [itemForm, setItemForm] = useState({ sku: '', name: '', onHand: '0', reorderPoint: '0', unitCost: '0', dailyDemand: '0' });
  const [supplierForm, setSupplierForm] = useState({ name: '', email: '', leadTimeDays: '7', reliabilityScore: '80', paymentTerms: 'Net 30' });
  const [requestForm, setRequestForm] = useState({ inventoryItemId: '', supplierId: '', quantity: '1', unitCost: '', rationale: '' });
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [s, i, v, p] = await Promise.all([
      api('/api/workspace/summary'), api('/api/workspace/inventory'), api('/api/workspace/suppliers'), api('/api/workspace/purchase-requests')
    ]);
    setSummary(s); setInventory(i); setSuppliers(v); setRequests(p);
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem(tokenKey);
    if (!token) { setLoading(false); return; }
    api('/api/auth/me').then(async (me) => { setSession(me); await refresh(); }).catch(() => sessionStorage.removeItem(tokenKey)).finally(() => setLoading(false));
  }, [refresh]);

  async function authenticated(result) {
    setSession({ user: result.user, company: result.company });
    setError(''); setNotice('Workspace ready. Add your inventory and suppliers to get started.');
    try { await refresh(); } catch (e) { setError(e.message); }
  }
  function signOut() { sessionStorage.removeItem(tokenKey); setSession(null); setSummary(null); setInventory([]); setSuppliers([]); setRequests([]); }
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
    await act(async () => { await api('/api/workspace/suppliers', { method: 'POST', body: JSON.stringify({ ...supplierForm, leadTimeDays: Number(supplierForm.leadTimeDays), reliabilityScore: Number(supplierForm.reliabilityScore) }) }); setSupplierForm({ name: '', email: '', leadTimeDays: '7', reliabilityScore: '80', paymentTerms: 'Net 30' }); }, 'Supplier added.');
  }
  async function createRequest(e) {
    e.preventDefault();
    await act(async () => { await api('/api/workspace/purchase-requests', { method: 'POST', body: JSON.stringify({ ...requestForm, quantity: Number(requestForm.quantity), ...(requestForm.unitCost !== '' ? { unitCost: Number(requestForm.unitCost) } : {}) }) }); setRequestForm({ inventoryItemId: '', supplierId: '', quantity: '1', unitCost: '', rationale: '' }); }, 'Purchase request submitted for review.');
  }
  async function review(id, decision) {
    await act(() => api(`/api/workspace/purchase-requests/${id}/review`, { method: 'POST', body: JSON.stringify({ decision }) }), `Request ${decision}.`);
  }
  if (loading) return <div className="loading">Loading your workspace…</div>;
  if (!session) return <AuthScreen onAuthenticated={authenticated} />;

  const lowCount = inventory.filter((i) => i.lowStock).length;
  const nav = [['overview', 'Overview', '◫'], ['inventory', 'Inventory', '▦'], ['suppliers', 'Suppliers', '⇄'], ['purchases', 'Purchasing', '↗']];
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="side-brand"><div className="brand-mark small">V<span>M</span></div><div><strong>vendormesh</strong><small>PROCUREMENT OS</small></div></div>
      <div className="workspace-label">WORKSPACE</div><div className="workspace-chip"><span className="company-avatar">{(session.company?.name || 'V').slice(0,1).toUpperCase()}</span><span><b>{session.company?.name}</b><small>{session.company?.role || 'member'}</small></span></div>
      <nav>{nav.map(([id, label, icon]) => <button key={id} className={tab === id ? 'nav-active' : ''} onClick={() => setTab(id)}><span className="nav-icon">{icon}</span>{label}{id === 'purchases' && summary?.pendingApprovals > 0 && <i>{summary.pendingApprovals}</i>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="secure-note"><span>●</span> Workspace session active</div><button className="signout" onClick={signOut}>↪ Sign out</button></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><p className="eyebrow">BUSINESS OPERATIONS / {tab.toUpperCase()}</p><h1>{({overview:'Procurement overview',inventory:'Inventory control',suppliers:'Supplier directory',purchases:'Purchase approvals'})[tab]}</h1></div><div className="top-user"><div className="user-avatar">{(session.user?.name || 'U').slice(0,1).toUpperCase()}</div><div><b>{session.user?.name}</b><small>{session.user?.email}</small></div></div></header>
      {(error || notice) && <div className={error ? 'flash flash-error' : 'flash flash-ok'} role="status">{error || notice}<button onClick={() => {setError('');setNotice('');}}>×</button></div>}
      {tab === 'overview' && <>
        <section className="welcome-panel"><div><span className="panel-tag">WORKSPACE SNAPSHOT</span><h2>Good decisions start with<br/>good visibility.</h2><p>Monitor stock exposure, supplier coverage and purchase approvals from one place.</p></div><div className="welcome-stat"><span>ESTIMATED INVENTORY VALUE</span><strong>{money(summary?.inventoryValue, session.company?.currency)}</strong><small>Based on on-hand units × unit cost</small></div></section>
        <div className="metric-grid"><Metric label="Inventory items" value={summary?.inventoryCount ?? '—'} note={`${summary?.totalUnits ?? 0} units on hand`} icon="▦"/><Metric label="Low-stock alerts" value={summary?.lowStock ?? 0} note={lowCount ? 'Replenishment may be needed' : 'No items below reorder point'} icon="⌁" tone={lowCount ? 'amber' : ''}/><Metric label="Active suppliers" value={summary?.supplierCount ?? '—'} note="Supplier records in this workspace" icon="⇄"/><Metric label="Pending approvals" value={summary?.pendingApprovals ?? 0} note="Require owner/admin review" icon="◷" tone={summary?.pendingApprovals ? 'amber' : ''}/></div>
        <div className="section-heading"><div><h2>Inventory health</h2><p>Stock levels compared with your reorder thresholds.</p></div><button className="secondary" onClick={() => setTab('inventory')}>Manage inventory →</button></div>
        <div className="table-card"><InventoryTable items={inventory.slice(0,6)} currency={session.company?.currency}/>{inventory.length === 0 && <Empty title="Your inventory starts here" text="Add SKUs, stock counts, reorder points and unit costs to get a useful stock-risk view."/>}</div>
        <div className="section-heading"><div><h2>Recent purchase requests</h2><p>Keep purchasing decisions reviewable and accountable.</p></div><button className="secondary" onClick={() => setTab('purchases')}>Open approvals →</button></div>
        <div className="table-card"><RequestTable requests={requests.slice(0,5)} currency={session.company?.currency}/>{requests.length === 0 && <Empty title="No purchase requests yet" text="Create a request when an item needs replenishment or planned buying."/>}</div>
      </>}
      {tab === 'inventory' && <><div className="section-heading"><div><h2>Inventory records</h2><p>Track quantities, reorder points, unit cost and demand.</p></div></div><form className="form-card" onSubmit={addInventory}><h3>Add inventory item</h3><div className="fields"><Field label="SKU" value={itemForm.sku} onChange={v=>setItemForm({...itemForm,sku:v})} required/><Field label="Item name" value={itemForm.name} onChange={v=>setItemForm({...itemForm,name:v})} required/><Field label="On hand" type="number" min="0" value={itemForm.onHand} onChange={v=>setItemForm({...itemForm,onHand:v})} required/><Field label="Reorder point" type="number" min="0" value={itemForm.reorderPoint} onChange={v=>setItemForm({...itemForm,reorderPoint:v})} required/><Field label="Unit cost" type="number" min="0" step="0.01" value={itemForm.unitCost} onChange={v=>setItemForm({...itemForm,unitCost:v})} required/><Field label="Daily demand" type="number" min="0" step="0.1" value={itemForm.dailyDemand} onChange={v=>setItemForm({...itemForm,dailyDemand:v})}/></div><button className="primary" disabled={busy}>{busy?'Saving…':'Save inventory item'}</button></form><div className="table-card"><InventoryTable items={inventory} currency={session.company?.currency}/>{inventory.length===0&&<Empty title="No inventory records" text="Use the form above to add your first SKU."/>}</div></>}
      {tab === 'suppliers' && <><div className="section-heading"><div><h2>Supplier directory</h2><p>Keep contact details, lead times and reliability in one place.</p></div></div><form className="form-card" onSubmit={addSupplier}><h3>Add supplier</h3><div className="fields"><Field label="Supplier name" value={supplierForm.name} onChange={v=>setSupplierForm({...supplierForm,name:v})} required/><Field label="Contact email" type="email" value={supplierForm.email} onChange={v=>setSupplierForm({...supplierForm,email:v})}/><Field label="Lead time (days)" type="number" min="0" value={supplierForm.leadTimeDays} onChange={v=>setSupplierForm({...supplierForm,leadTimeDays:v})}/><Field label="Reliability (0–100)" type="number" min="0" max="100" value={supplierForm.reliabilityScore} onChange={v=>setSupplierForm({...supplierForm,reliabilityScore:v})}/><Field label="Payment terms" value={supplierForm.paymentTerms} onChange={v=>setSupplierForm({...supplierForm,paymentTerms:v})}/></div><button className="primary" disabled={busy}>{busy?'Saving…':'Add supplier'}</button></form><div className="supplier-grid">{suppliers.map(s=><article className="supplier-card" key={s._id}><div className="supplier-avatar">{s.name.slice(0,1).toUpperCase()}</div><div className="supplier-info"><h3>{s.name}</h3><p>{s.email || 'No contact email added'}</p><div className="supplier-meta"><span>{s.leadTimeDays} day lead time</span><span>{s.reliabilityScore}% reliability</span></div><small>{s.paymentTerms}</small></div></article>)}</div>{suppliers.length===0&&<Empty title="Build your supplier network" text="Add your trusted vendors before creating purchase requests."/>}</>}
      {tab === 'purchases' && <><div className="section-heading"><div><h2>Purchase requests</h2><p>Requests remain pending until an owner or admin reviews them.</p></div></div><form className="form-card" onSubmit={createRequest}><h3>New purchase request</h3>{(!inventory.length || !suppliers.some(s=>s.active)) && <p className="inline-hint">Add at least one inventory item and one active supplier before creating a request.</p>}<div className="fields"><label>Inventory item<select required value={requestForm.inventoryItemId} onChange={e=>{const item=inventory.find(i=>i._id===e.target.value);setRequestForm({...requestForm,inventoryItemId:e.target.value,unitCost:item?String(item.unitCost):''});}}><option value="">Select item…</option>{inventory.map(i=><option key={i._id} value={i._id}>{i.sku} — {i.name}</option>)}</select></label><label>Supplier<select required value={requestForm.supplierId} onChange={e=>setRequestForm({...requestForm,supplierId:e.target.value})}><option value="">Select supplier…</option>{suppliers.filter(s=>s.active).map(s=><option key={s._id} value={s._id}>{s.name}</option>)}</select></label><Field label="Quantity" type="number" min="1" value={requestForm.quantity} onChange={v=>setRequestForm({...requestForm,quantity:v})} required/><Field label="Unit cost" type="number" min="0" step="0.01" value={requestForm.unitCost} onChange={v=>setRequestForm({...requestForm,unitCost:v})} required/><Field label="Business rationale" value={requestForm.rationale} onChange={v=>setRequestForm({...requestForm,rationale:v})}/></div>{requestForm.quantity && requestForm.unitCost!=='' && <p className="estimate">Estimated request total <b>{money(Number(requestForm.quantity)*Number(requestForm.unitCost),session.company?.currency)}</b></p>}<button className="primary" disabled={busy||!inventory.length||!suppliers.some(s=>s.active)}>{busy?'Submitting…':'Submit for approval'}</button></form><div className="table-card"><RequestTable requests={requests} currency={session.company?.currency} onReview={review} role={session.company?.role}/>{requests.length===0&&<Empty title="No requests to review" text="Purchase requests will appear here with their approval status and audit details."/>}</div></>}
      <footer className="footer"><span>VENDORMESH · PROCUREMENT WORKSPACE</span><span>Review and approve purchases before committing funds.</span></footer>
    </main>
  </div>;
}
function Metric({label,value,note,icon,tone}) { return <article className="metric-card"><div className={`metric-icon ${tone||''}`}>{icon}</div><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
function Field({label,value,onChange,type='text',...props}) { return <label>{label}<input type={type} value={value} onChange={e=>onChange(e.target.value)} {...props}/></label>; }
function Empty({title,text}) { return <div className="empty-state"><div className="empty-icon">↗</div><b>{title}</b><p>{text}</p></div>; }
function InventoryTable({items,currency}) { return <div className="table-scroll"><table><thead><tr><th>Item</th><th>SKU</th><th>On hand</th><th>Reorder point</th><th>Unit cost</th><th>Stock status</th></tr></thead><tbody>{items.map(i=><tr key={i._id}><td><b>{i.name}</b></td><td><code>{i.sku}</code></td><td>{i.onHand}</td><td>{i.reorderPoint}</td><td>{money(i.unitCost,currency)}</td><td><span className={`status ${i.lowStock?'status-low':'status-ok'}`}>{i.lowStock?'Reorder suggested':'In range'}</span></td></tr>)}</tbody></table></div>; }
function RequestTable({requests,currency,onReview,role}) { return <div className="table-scroll"><table><thead><tr><th>Request</th><th>Supplier</th><th>Qty</th><th>Total</th><th>Created</th><th>Status</th>{onReview&&<th>Review</th>}</tr></thead><tbody>{requests.map(r=><tr key={r._id}><td><b>{r.itemName}</b><small className="table-sub">{r.sku}{r.rationale? ` · ${r.rationale}`:''}</small></td><td>{r.supplierId?.name || 'Supplier'}</td><td>{r.quantity}</td><td>{money(r.totalCost,r.currency||currency)}</td><td>{new Date(r.createdAt).toLocaleDateString()}</td><td><span className={`status status-${r.status}`}>{r.status}</span></td>{onReview&&<td>{r.status==='pending'&&['owner','admin'].includes(role)?<div className="review-actions"><button onClick={()=>onReview(r._id,'approved')}>Approve</button><button onClick={()=>onReview(r._id,'rejected')}>Reject</button></div>:'—'}</td>}</tr>)}</tbody></table></div>; }
