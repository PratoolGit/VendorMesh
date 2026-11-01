import { useEffect, useMemo, useState } from 'react';

const today = () => new Date().toISOString().slice(0, 10);
const methodLabels = {
  bank_transfer: 'Bank transfer', upi: 'UPI', cash: 'Cash',
  cheque: 'Cheque', card: 'Card', other: 'Other'
};
function money(value, currency = 'USD') {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0)); }
  catch { return `${currency} ${Number(value || 0).toFixed(2)}`; }
}
function statusFor(invoice) {
  const paid = Number(invoice.paidAmount || 0);
  const total = Number(invoice.total || 0);
  return invoice.paymentStatus || (paid >= total ? 'paid' : paid > 0 ? 'partially_paid' : 'unpaid');
}
function outstanding(invoice) {
  return Math.max(0, Math.round((Number(invoice.total || 0) - Number(invoice.paidAmount || 0)) * 100) / 100);
}
function dateLabel(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString();
}
function isOverdue(invoice) {
  return Boolean(invoice.dueDate && statusFor(invoice) !== 'paid' && new Date(invoice.dueDate).getTime() < new Date(today() + 'T00:00:00').getTime());
}

export default function WorkspacePayments({ api, role, currency = 'USD' }) {
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [form, setForm] = useState({ amount: '', method: 'bank_transfer', reference: '', paidAt: today(), notes: '' });
  const [filter, setFilter] = useState('outstanding');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedInvoice = invoices.find(invoice => invoice._id === invoiceId) || null;
  const balance = selectedInvoice ? outstanding(selectedInvoice) : 0;
  const paymentAmount = Number(form.amount);
  const validAmount = Number.isFinite(paymentAmount) && paymentAmount > 0 && paymentAmount <= balance;

  async function load() {
    setLoading(true); setError('');
    try {
      const [invoicePage, paymentPage] = await Promise.all([
        api('/api/workspace/invoices?limit=100&status=approved'),
        api('/api/workspace/payments?limit=200')
      ]);
      const rows = invoicePage.data || [];
      setInvoices(rows);
      setPayments(paymentPage.data || []);
      setInvoiceId(current => {
        const existing = rows.find(invoice => invoice._id === current && outstanding(invoice) > 0);
        return (existing || rows.find(invoice => outstanding(invoice) > 0))?._id || '';
      });
    } catch (err) { setError(err.message || 'Unable to load supplier payment records.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [api]);

  useEffect(() => {
    setForm(current => ({ ...current, amount: '', reference: '', paidAt: today(), notes: '' }));
  }, [invoiceId]);

  const visibleInvoices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return invoices.filter(invoice => {
      const state = statusFor(invoice);
      const matchesFilter = filter === 'all'
        || (filter === 'outstanding' && outstanding(invoice) > 0)
        || (filter === 'overdue' && isOverdue(invoice))
        || (filter === 'unpaid' && state === 'unpaid')
        || (filter === 'partial' && state === 'partially_paid')
        || (filter === 'paid' && state === 'paid');
      const matchesSearch = !needle || [invoice.invoiceNumber, invoice.supplierName, invoice.itemName, invoice.sku].some(value => String(value || '').toLowerCase().includes(needle));
      return matchesFilter && matchesSearch;
    }).sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime());
  }, [invoices, filter, query]);

  const totals = useMemo(() => {
    const sameCurrency = invoices.filter(invoice => (invoice.currency || currency) === currency);
    return sameCurrency.reduce((result, invoice) => {
      result.invoiced += Number(invoice.total || 0);
      result.paid += Number(invoice.paidAmount || 0);
      result.outstanding += outstanding(invoice);
      if (isOverdue(invoice)) result.overdue += outstanding(invoice);
      return result;
    }, { invoiced: 0, paid: 0, outstanding: 0, overdue: 0 });
  }, [invoices, currency]);

  const reversedPaymentIds = useMemo(() => new Set(payments.filter(payment => payment.reversesPaymentId).map(payment => String(payment.reversesPaymentId))), [payments]);

  const paymentRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return payments.filter(payment => !needle || [
      payment.invoiceNumber, payment.supplierName, payment.reference, payment.method
    ].some(value => String(value || '').toLowerCase().includes(needle)));
  }, [payments, query]);

  async function reversePayment(payment) {
    const reason = window.prompt('Why are you reversing payment ' + payment.invoiceNumber + '? This creates a permanent reversal entry.', '');
    if (reason === null) return;
    if (reason.trim().length < 3) { setError('Enter a short reason (at least 3 characters) to reverse this payment.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const reversal = await api(`/api/workspace/payments/${payment._id}/reverse`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() })
      });
      setNotice(`Payment reversal recorded for ${payment.invoiceNumber}. The invoice balance has been restored by ${money(reversal.amount, reversal.currency)}.`);
      await load();
    } catch (err) { setError(err.message || 'Unable to reverse this payment.'); }
    finally { setBusy(false); }
  }

  async function recordPayment(event) {
    event.preventDefault();
    if (!selectedInvoice || !validAmount) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const payment = await api(`/api/workspace/payments/invoices/${selectedInvoice._id}`, {
        method: 'POST',
        body: JSON.stringify({
          amount: paymentAmount,
          method: form.method,
          reference: form.reference,
          paidAt: form.paidAt,
          notes: form.notes
        })
      });
      setNotice(`${money(payment.amount, payment.currency)} recorded against invoice ${payment.invoiceNumber}. No money was transferred by VendorMesh.`);
      setForm(current => ({ ...current, amount: '', reference: '', paidAt: today(), notes: '' }));
      await load();
    } catch (err) { setError(err.message || 'Unable to record this payment.'); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="loading">Loading supplier payment register…</div>;
  const openCount = invoices.filter(invoice => outstanding(invoice) > 0).length;
  const overdueCount = invoices.filter(isOverdue).length;

  return <section className="workspace-payments">
    <div className="section-heading">
      <div><h2>Supplier payment register</h2><p>Track approved invoices, payment instalments, due dates and supplier balances.</p></div>
      <button type="button" className="secondary" onClick={load} disabled={busy}>Refresh</button>
    </div>
    {(error || notice) && <div className={error ? 'flash flash-error' : 'flash flash-ok'} role={error ? 'alert' : 'status'}>{error || notice}</div>}
    <div className="payment-policy"><strong>Manual payment recording</strong><p>Record bank transfers, UPI, cash, cheques or card settlements after they happen. VendorMesh does not initiate transfers or connect to a payment gateway. Payment entries are append-only. Owners/admins can reverse a mistaken entry with a reason; the original and reversal stay visible in the audit trail.</p></div>
    <div className="metric-grid payment-metrics">
      <article className="metric-card"><span>Approved invoices</span><strong>{invoices.length}</strong><small>Latest approved invoice records</small></article>
      <article className="metric-card"><span>Paid to suppliers</span><strong>{money(totals.paid, currency)}</strong><small>Recorded settlements</small></article>
      <article className="metric-card"><span>Outstanding balance</span><strong>{money(totals.outstanding, currency)}</strong><small>{openCount} invoice(s) still open</small></article>
      <article className="metric-card"><span>Overdue balance</span><strong>{money(totals.overdue, currency)}</strong><small>{overdueCount} invoice(s) past due date</small></article>
    </div>

    {['owner', 'admin', 'staff'].includes(role) && <form className="form-card payment-create-form" onSubmit={recordPayment}>
      <div className="payment-form-heading"><div><h3>Record a supplier payment</h3><p className="muted">Select an approved invoice and record the amount actually settled.</p></div></div>
      {openCount === 0 && <p className="inline-hint">There are no approved invoices with an outstanding balance.</p>}
      <div className="fields payment-fields">
        <label>Supplier invoice<select required value={invoiceId} disabled={busy || openCount === 0} onChange={event => setInvoiceId(event.target.value)}>
          <option value="">Select an open invoice…</option>
          {invoices.filter(invoice => outstanding(invoice) > 0).map(invoice => <option key={invoice._id} value={invoice._id}>{invoice.invoiceNumber} · {invoice.supplierName} · Balance {money(outstanding(invoice), invoice.currency)}</option>)}
        </select></label>
        <label>Payment amount<input type="number" required min="0.01" max={balance || undefined} step="0.01" value={form.amount} disabled={busy || !selectedInvoice} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} placeholder="0.00"/></label>
        <label>Payment method<select value={form.method} disabled={busy || !selectedInvoice} onChange={event => setForm(current => ({ ...current, method: event.target.value }))}>
          {Object.entries(methodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Payment date<input type="date" required max={today()} value={form.paidAt} disabled={busy || !selectedInvoice} onChange={event => setForm(current => ({ ...current, paidAt: event.target.value }))}/></label>
        <label>Bank / transaction reference<input maxLength="100" value={form.reference} disabled={busy || !selectedInvoice} onChange={event => setForm(current => ({ ...current, reference: event.target.value }))} placeholder="UTR, cheque no., receipt id…"/></label>
        <label className="payment-notes-field">Notes<input maxLength="500" value={form.notes} disabled={busy || !selectedInvoice} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Optional settlement details"/></label>
      </div>
      {selectedInvoice && <div className="payment-balance-summary">
        <div><span>INVOICE TOTAL</span><strong>{money(selectedInvoice.total, selectedInvoice.currency)}</strong></div>
        <div><span>ALREADY PAID</span><strong>{money(selectedInvoice.paidAmount, selectedInvoice.currency)}</strong></div>
        <div><span>REMAINING</span><strong>{money(balance, selectedInvoice.currency)}</strong></div>
        <div><span>BALANCE AFTER THIS PAYMENT</span><strong>{money(Math.max(0, balance - (Number.isFinite(paymentAmount) ? paymentAmount : 0)), selectedInvoice.currency)}</strong></div>
      </div>}
      <button type="submit" className="primary" disabled={busy || !selectedInvoice || !validAmount || !form.paidAt}>{busy ? 'Recording…' : 'Record payment'}</button>
    </form>}

    <section className="table-card payment-invoice-card">
      <div className="payment-table-heading">
        <div><h3>Approved supplier invoices</h3><p className="muted">Select a view or search supplier, invoice number, SKU or item.</p></div>
        <label className="payment-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search invoices and payments…" aria-label="Search invoices and payments"/></label>
      </div>
      <div className="payment-view-tabs" role="group" aria-label="Invoice payment status">
        {[['outstanding','Outstanding'],['overdue','Overdue'],['unpaid','Unpaid'],['partial','Partially paid'],['paid','Paid'],['all','All invoices']].map(([value,label]) => <button type="button" key={value} className={filter===value?'active':''} aria-pressed={filter===value} onClick={()=>setFilter(value)}>{label}{value==='outstanding'&&<span>{openCount}</span>}{value==='overdue'&&<span>{overdueCount}</span>}</button>)}
      </div>
      <div className="table-scroll vm-interactive-table" role="region" aria-label="Supplier invoice payment table" tabIndex="0">
        <table aria-label="Supplier invoice payment status"><thead><tr><th>Invoice</th><th>Supplier / item</th><th>Due date</th><th>Invoice total</th><th>Paid</th><th>Outstanding</th><th>Status</th><th>Action</th></tr></thead><tbody>
          {visibleInvoices.map(invoice => {
            const paid = Number(invoice.paidAmount || 0);
            const balance = outstanding(invoice);
            const status = statusFor(invoice);
            return <tr key={invoice._id}>
              <td data-label="Invoice"><b>{invoice.invoiceNumber}</b><small className="table-sub">{dateLabel(invoice.invoiceDate)}</small></td>
              <td data-label="Supplier / item"><b>{invoice.supplierName}</b><small className="table-sub">{invoice.itemName} · {invoice.sku}</small></td>
              <td data-label="Due date"><span className={isOverdue(invoice)?'payment-overdue':''}>{dateLabel(invoice.dueDate)}{isOverdue(invoice)?' · Overdue':''}</span></td>
              <td data-label="Invoice total">{money(invoice.total, invoice.currency)}</td>
              <td data-label="Paid">{money(paid, invoice.currency)}</td>
              <td data-label="Outstanding"><b>{money(balance, invoice.currency)}</b></td>
              <td data-label="Status"><span className={'status '+(status==='paid'?'status-ok':status==='partially_paid'?'status-pending':'status-low')}>{status.replaceAll('_',' ')}</span></td>
              <td data-label="Action">{balance > 0 ? <button type="button" className="secondary po-print-button" onClick={() => { setInvoiceId(invoice._id); document.querySelector('.payment-create-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>Record payment</button> : '—'}</td>
            </tr>;
          })}
        </tbody></table>
      </div>
      {visibleInvoices.length===0 && <p className="muted payment-empty">No invoices match this view. Try another status or search term.</p>}
      <div className="payment-table-foot">Showing {visibleInvoices.length} of {invoices.length} approved invoice records.</div>
    </section>

    <section className="table-card payment-history-card">
      <div className="payment-table-heading"><div><h3>Payment history</h3><p className="muted">Newest 200 settlement and reversal entries. Owners/admins can reverse a mistaken payment without deleting its history.</p></div></div>
      <div className="table-scroll vm-interactive-table" role="region" aria-label="Supplier payment history table" tabIndex="0">
        <table aria-label="Supplier payment history"><thead><tr><th>Payment date</th><th>Invoice</th><th>Supplier</th><th>Entry</th><th>Method</th><th>Reference</th><th>Amount</th><th>Recorded</th><th>Action</th></tr></thead><tbody>
          {paymentRows.map(payment => {
            const reversal = payment.recordType === 'reversal';
            const alreadyReversed = reversedPaymentIds.has(String(payment._id));
            return <tr key={payment._id}>
              <td data-label="Payment date">{dateLabel(payment.paidAt)}</td>
              <td data-label="Invoice"><b>{payment.invoiceNumber}</b></td>
              <td data-label="Supplier">{payment.supplierName}</td>
              <td data-label="Entry"><span className={'status '+(reversal?'status-rejected':'status-ok')}>{reversal?'reversal':'payment'}</span>{reversal && <small className="table-sub">{payment.reversalReason || 'Reversal recorded'}</small>}</td>
              <td data-label="Method">{methodLabels[payment.method] || payment.method}</td>
              <td data-label="Reference">{payment.reference || '—'}</td>
              <td data-label="Amount"><b className={reversal?'payment-reversal-amount':''}>{reversal?'−':''}{money(payment.amount, payment.currency)}</b></td>
              <td data-label="Recorded">{dateLabel(payment.createdAt)}</td>
              <td data-label="Action">{!reversal && !alreadyReversed && ['owner','admin'].includes(role) ? <button type="button" className="secondary po-print-button" disabled={busy} onClick={() => reversePayment(payment)}>Reverse</button> : alreadyReversed ? <span className="muted">Reversed</span> : '—'}</td>
            </tr>;
          })}
        </tbody></table>
      </div>
      {paymentRows.length===0 && <p className="muted payment-empty">No supplier payments have been recorded yet.</p>}
    </section>
  </section>;
}
