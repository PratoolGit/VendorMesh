import { useEffect, useMemo, useState } from 'react';

const eligibleStatuses = new Set(['approved', 'ordered', 'partially_received', 'received']);
const today = () => new Date().toISOString().slice(0, 10);
function money(value, currency = 'USD') {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0)); }
  catch { return `${currency} ${Number(value || 0).toFixed(2)}`; }
}
function Tile({ label, value, note }) { return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }

export default function WorkspaceInvoices({ api, role, currency: defaultCurrency = 'USD' }) {
  const [requests, setRequests] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [form, setForm] = useState({ purchaseRequestId: '', invoiceNumber: '', invoiceDate: today(), dueDate: '', currency: defaultCurrency, subtotal: '', taxTotal: '0' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const manager = ['owner', 'admin'].includes(role);
  const eligible = useMemo(() => requests.filter(item => eligibleStatuses.has(item.status)), [requests]);
  const selected = eligible.find(item => item._id === form.purchaseRequestId) || null;
  const subtotal = Number(form.subtotal);
  const taxTotal = Number(form.taxTotal);
  const total = Number.isFinite(subtotal) && subtotal > 0 && Number.isFinite(taxTotal) && taxTotal >= 0
    ? Math.round((subtotal + taxTotal) * 100) / 100 : 0;

  async function load() {
    setLoading(true); setError('');
    try {
      const [requestRows, invoicePage] = await Promise.all([
        api('/api/workspace/purchase-requests'),
        api('/api/workspace/invoices?limit=100')
      ]);
      setRequests(requestRows || []);
      setInvoices(invoicePage.data || []);
      const available = requestRows.filter(item => eligibleStatuses.has(item.status));
      setForm(current => {
        const request = available.find(item => item._id === current.purchaseRequestId) || available[0];
        return { ...current, purchaseRequestId: request?._id || '', currency: request?.currency || defaultCurrency };
      });
    } catch (err) { setError(err.message || 'Unable to load invoices.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [api, defaultCurrency]);

  async function createInvoice(event) {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (!selected) throw new Error('Choose an approved or fulfilled purchase request.');
      const result = await api('/api/workspace/invoices', { method: 'POST', body: JSON.stringify({
        ...form,
        invoiceNumber: form.invoiceNumber.trim(),
        subtotal: Number(form.subtotal),
        taxTotal: Number(form.taxTotal),
        total
      }) });
      setNotice(`Invoice ${result.invoiceNumber} recorded for review. No payment was initiated.`);
      setForm(current => ({ ...current, invoiceNumber: '', invoiceDate: today(), dueDate: '', subtotal: '', taxTotal: '0' }));
      await load();
    } catch (err) { setError(err.message || 'Unable to record invoice.'); }
    finally { setBusy(false); }
  }

  async function review(invoice, decision) {
    const note = window.prompt(decision === 'rejected'
      ? 'Reason for rejecting this invoice:'
      : 'Review note (required if invoice total differs from the order):', '');
    if (note === null) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/workspace/invoices/${invoice._id}/review`, { method: 'POST', body: JSON.stringify({ decision, note }) });
      setNotice(`Invoice ${invoice.invoiceNumber} marked ${decision}. No payment was initiated.`);
      await load();
    } catch (err) { setError(err.message || 'Unable to review invoice.'); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="loading">Loading invoice register…</div>;
  const pendingCount = invoices.filter(item => item.status === 'pending_review').length;
  return <section className="workspace-invoices">
    <div className="section-heading"><div><h2>Invoice register</h2><p>Record supplier invoices against approved purchases and review the totals.</p></div><button type="button" className="secondary" onClick={load} disabled={busy}>Refresh</button></div>
    {(error || notice) && <div className={error ? 'flash flash-error' : 'flash flash-ok'} role={error ? 'alert' : 'status'}>{error || notice}</div>}
    <div className="invoice-limits-note"><strong>Manual invoice entry</strong><p>Enter values from the supplier document. File upload and OCR are not enabled, and recording an invoice never initiates payment.</p></div>
    <div className="metric-grid">
      <Tile label="Invoices listed" value={invoices.length} note="Newest 100 records"/>
      <Tile label="Awaiting review" value={pendingCount} note="Owner/admin action required"/>
      <Tile label="Eligible purchases" value={eligible.length} note="Approved or fulfilled requests"/>
    </div>
    <form className="form-card invoice-create-form" onSubmit={createInvoice}>
      <h3>Record an invoice</h3>
      {eligible.length === 0 && <p className="inline-hint">No approved or fulfilled purchase requests are available. Submit and approve a purchase request first.</p>}
      <div className="fields invoice-fields">
        <label>Purchase request<select required value={form.purchaseRequestId} disabled={busy || eligible.length===0} onChange={event => {
          const request = eligible.find(item => item._id === event.target.value);
          setForm(current => ({ ...current, purchaseRequestId: event.target.value, currency: request?.currency || defaultCurrency }));
        }}><option value="">Select a request…</option>{eligible.map(item => <option value={item._id} key={item._id}>{item.itemName} · {item.sku} · {item.status}</option>)}</select></label>
        <label>Invoice number<input required minLength="2" maxLength="100" value={form.invoiceNumber} onChange={event=>setForm(current=>({...current,invoiceNumber:event.target.value}))} placeholder="INV-2026-001" disabled={busy}/></label>
        <label>Invoice date<input type="date" required value={form.invoiceDate} onChange={event=>setForm(current=>({...current,invoiceDate:event.target.value}))} disabled={busy}/></label>
        <label>Due date (optional)<input type="date" value={form.dueDate} min={form.invoiceDate || undefined} onChange={event=>setForm(current=>({...current,dueDate:event.target.value}))} disabled={busy}/></label>
        <label>Currency<input readOnly value={form.currency} aria-readonly="true"/></label>
        <label>Subtotal<input type="number" required min="0.01" max="100000000" step="0.01" value={form.subtotal} onChange={event=>setForm(current=>({...current,subtotal:event.target.value}))} disabled={busy}/></label>
        <label>Tax total<input type="number" required min="0" max="100000000" step="0.01" value={form.taxTotal} onChange={event=>setForm(current=>({...current,taxTotal:event.target.value}))} disabled={busy}/></label>
        <label>Calculated total<input readOnly value={money(total,form.currency)} aria-readonly="true"/></label>
      </div>
      {selected && <p className="invoice-order-comparison">Purchase request total: <strong>{money(selected.totalCost,selected.currency || defaultCurrency)}</strong>. Differences are flagged for review.</p>}
      <button type="submit" className="primary" disabled={busy || !selected || form.invoiceNumber.trim().length<2 || !form.invoiceDate || !Number.isFinite(subtotal) || subtotal<=0 || !Number.isFinite(taxTotal) || taxTotal<0}>{busy?'Saving…':'Record for review'}</button>
    </form>
    <section className="table-card">
      <div className="invoice-table-heading"><div><h3>Recent invoices</h3><p className="muted">Owner/admins can approve or reject pending records.</p></div></div>
      <div className="table-scroll" role="region" aria-label="Invoice records table" tabIndex="0"><table aria-label="Invoice records"><thead><tr><th>Invoice</th><th>Supplier / item</th><th>Invoice date</th><th>Order total</th><th>Invoice total</th><th>Difference</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {invoices.map(invoice => {
          const difference = Math.round((Number(invoice.total)-Number(invoice.purchaseRequestTotal))*100)/100;
          const mismatch = Math.abs(difference)>0.01;
          return <tr key={invoice._id}>
            <td><b>{invoice.invoiceNumber}</b><small className="table-sub">Due {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'not set'}</small></td>
            <td><b>{invoice.supplierName}</b><small className="table-sub">{invoice.itemName} · {invoice.sku}</small></td>
            <td>{new Date(invoice.invoiceDate).toLocaleDateString()}</td>
            <td>{money(invoice.purchaseRequestTotal,invoice.currency)}</td>
            <td>{money(invoice.total,invoice.currency)}</td>
            <td><span className={'status '+(mismatch?'status-pending':'status-ok')}>{difference>0?'+':''}{money(difference,invoice.currency)}</span></td>
            <td><span className={'status '+(invoice.status==='approved'?'status-ok':invoice.status==='rejected'?'status-rejected':'status-pending')}>{invoice.status.replaceAll('_',' ')}</span></td>
            <td>{manager && invoice.status==='pending_review' ? <div className="review-actions"><button type="button" disabled={busy} onClick={()=>review(invoice,'approved')}>Approve</button><button type="button" disabled={busy} onClick={()=>review(invoice,'rejected')}>Reject</button></div> : '—'}</td>
          </tr>;
        })}
      </tbody></table></div>
      {invoices.length===0 && <p className="muted invoice-empty">No invoices have been recorded for this workspace.</p>}
    </section>
  </section>;
}
