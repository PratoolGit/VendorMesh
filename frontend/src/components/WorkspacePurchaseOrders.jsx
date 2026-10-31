import { useEffect, useMemo, useState } from 'react';

function money(value, currency = 'USD') {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(value || 0)); }
  catch { return `${currency} ${Number(value || 0).toFixed(2)}`; }
}
function localDateAfter(days = 7) {
  const date = new Date();
  date.setDate(date.getDate() + Math.max(0, Number(days) || 0));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function displayDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}
function makeForm(requestId, requests, suppliers) {
  const request = requests.find(row => row._id === requestId);
  const supplier = suppliers.find(row => String(row._id) === String(request?.supplierId?._id || request?.supplierId));
  return {
    purchaseRequestId: requestId || '',
    expectedDeliveryDate: localDateAfter(supplier?.leadTimeDays ?? 7),
    paymentTerms: supplier?.paymentTerms || 'Net 30',
    notes: ''
  };
}

export default function WorkspacePurchaseOrders({ api, requests = [], suppliers = [], role, currency = 'USD', initialRequestId = '', onCreated }) {
  const [orders, setOrders] = useState([]);
  const [form, setForm] = useState(() => makeForm(initialRequestId, requests, suppliers));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [printOrder, setPrintOrder] = useState(null);
  const manager = ['owner', 'admin'].includes(role);
  const approvedRequests = useMemo(() => requests.filter(row => row.status === 'approved'), [requests]);
  const selectedRequest = approvedRequests.find(row => row._id === form.purchaseRequestId) || null;
  const activeCurrency = selectedRequest?.currency || currency;

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await api('/api/workspace/purchase-orders?limit=100');
      setOrders(response.data || []);
    } catch (err) { setError(err.message || 'Unable to load purchase orders.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [api]);
  useEffect(() => {
    if (initialRequestId && approvedRequests.some(row => row._id === initialRequestId)) {
      setForm(current => current.purchaseRequestId === initialRequestId ? current : makeForm(initialRequestId, requests, suppliers));
    }
  }, [initialRequestId, requests, suppliers, approvedRequests]);

  useEffect(() => {
    if (!printOrder) return undefined;
    const finishPrint = () => {
      document.documentElement.classList.remove('vm-printing-po');
      setPrintOrder(null);
    };
    document.documentElement.classList.add('vm-printing-po');
    window.addEventListener('afterprint', finishPrint);
    const timeout = window.setTimeout(() => window.print(), 120);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('afterprint', finishPrint);
      document.documentElement.classList.remove('vm-printing-po');
    };
  }, [printOrder]);

  function selectRequest(id) {
    setForm(makeForm(id, requests, suppliers));
    setError('');
    setNotice('');
  }

  async function createOrder(event) {
    event.preventDefault();
    if (!selectedRequest) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const order = await api(`/api/workspace/purchase-orders/from-request/${selectedRequest._id}`, {
        method: 'POST',
        body: JSON.stringify({
          expectedDeliveryDate: form.expectedDeliveryDate,
          paymentTerms: form.paymentTerms,
          notes: form.notes
        })
      });
      setNotice(`Purchase order ${order.poNumber} issued. The linked request is now marked ordered.`);
      setForm({ purchaseRequestId: '', expectedDeliveryDate: '', paymentTerms: 'Net 30', notes: '' });
      await load();
      if (onCreated) await onCreated();
    } catch (err) { setError(err.message || 'Unable to issue the purchase order.'); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="loading">Loading purchase order register…</div>;
  const issuedCount = orders.filter(order => ['issued', 'acknowledged'].includes(order.status)).length;
  const receivedCount = orders.filter(order => order.status === 'received').length;

  return <section className="workspace-purchase-orders">
    <div className="section-heading">
      <div><h2>Purchase order register</h2><p>Formal supplier orders created from approved purchase requests.</p></div>
      <button type="button" className="secondary" disabled={busy} onClick={load}>Refresh</button>
    </div>
    {(error || notice) && <div className={error ? 'flash flash-error' : 'flash flash-ok'} role={error ? 'alert' : 'status'}>{error || notice}</div>}
    <div className="po-explainer"><strong>Issuing a purchase order</strong><p>Only owners and admins can issue POs. Issuing a PO records the agreed item, quantity, unit price, expected delivery date and supplier payment terms. Use the browser print dialog to save a supplier-ready PDF. No email or payment is sent automatically.</p></div>
    <div className="metric-grid po-metrics">
      <article className="metric-card"><span>Purchase orders</span><strong>{orders.length}</strong><small>Latest 100 workspace records</small></article>
      <article className="metric-card"><span>Open orders</span><strong>{issuedCount}</strong><small>Issued or awaiting supplier confirmation</small></article>
      <article className="metric-card"><span>Fully received</span><strong>{receivedCount}</strong><small>Completed receiving records</small></article>
      <article className="metric-card"><span>Approved requests</span><strong>{approvedRequests.length}</strong><small>Ready to become purchase orders</small></article>
    </div>
    {manager && <form className="form-card po-create-form" onSubmit={createOrder}>
      <h3>Issue a purchase order</h3>
      {approvedRequests.length === 0 && <p className="inline-hint">There are no approved requests waiting for a PO. Submit a purchase request and have an owner/admin approve it first.</p>}
      <div className="fields">
        <label>Approved purchase request<select required value={form.purchaseRequestId} disabled={busy || approvedRequests.length === 0} onChange={event => selectRequest(event.target.value)}>
          <option value="">Select an approved request…</option>
          {approvedRequests.map(request => <option key={request._id} value={request._id}>{request.itemName} · {request.sku} · {request.supplierId?.name || 'Supplier'} · {money(request.totalCost, request.currency || currency)}</option>)}
        </select></label>
        <label>Expected delivery date<input type="date" required min={localDateAfter(0)} value={form.expectedDeliveryDate} disabled={busy || !selectedRequest} onChange={event => setForm(current => ({ ...current, expectedDeliveryDate: event.target.value }))}/></label>
        <label>Payment terms<input required maxLength="120" value={form.paymentTerms} disabled={busy || !selectedRequest} onChange={event => setForm(current => ({ ...current, paymentTerms: event.target.value }))} placeholder="e.g. Net 30"/></label>
        <label className="po-notes-field">Supplier instructions / notes<input maxLength="2000" value={form.notes} disabled={busy || !selectedRequest} onChange={event => setForm(current => ({ ...current, notes: event.target.value }))} placeholder="Delivery location, packaging or other instructions"/></label>
      </div>
      {selectedRequest && <div className="po-order-summary">
        <div><span>SUPPLIER</span><strong>{selectedRequest.supplierId?.name || 'Supplier'}</strong></div>
        <div><span>ITEM / SKU</span><strong>{selectedRequest.itemName} · {selectedRequest.sku}</strong></div>
        <div><span>ORDER QUANTITY</span><strong>{Number(selectedRequest.quantity).toLocaleString()}</strong></div>
        <div><span>ORDER TOTAL</span><strong>{money(selectedRequest.totalCost, activeCurrency)}</strong></div>
      </div>}
      <button type="submit" className="primary" disabled={busy || !selectedRequest || !form.expectedDeliveryDate || !form.paymentTerms.trim()}>{busy ? 'Issuing…' : 'Issue purchase order'}</button>
    </form>}
    <section className="table-card">
      <div className="po-table-heading"><div><h3>Recent purchase orders</h3><p className="muted">PO records remain linked to their original purchase request.</p></div></div>
      <div className="table-scroll vm-interactive-table" role="region" aria-label="Purchase orders table" tabIndex="0">
        <table aria-label="Purchase orders"><thead><tr><th>PO number</th><th>Supplier / item</th><th>Quantity</th><th>Total</th><th>Expected delivery</th><th>Status</th><th>Issued</th><th>Document</th></tr></thead><tbody>
          {orders.map(order => <tr key={order._id}>
            <td data-label="PO number"><b>{order.poNumber}</b><small className="table-sub">{String(order.purchaseRequestId || '').slice(-8).toUpperCase()}</small></td>
            <td data-label="Supplier / item"><b>{order.supplierSnapshot?.name || 'Supplier'}</b><small className="table-sub">{order.lineItems?.[0]?.itemName || 'Purchase item'} · {order.lineItems?.[0]?.sku || ''}</small></td>
            <td data-label="Quantity">{Number(order.lineItems?.reduce((sum, line) => sum + Number(line.quantity || 0), 0) || 0).toLocaleString()}</td>
            <td data-label="Total">{money(order.total, order.currency || currency)}</td>
            <td data-label="Expected delivery">{displayDate(order.expectedDeliveryDate)}</td>
            <td data-label="Status"><span className={'status status-' + order.status}>{order.status.replaceAll('_', ' ')}</span></td>
            <td data-label="Issued">{displayDate(order.issuedAt)}</td>
            <td data-label="Document"><button type="button" className="secondary po-print-button" onClick={() => setPrintOrder(order)}>Print / Save PDF</button></td>
          </tr>)}
        </tbody></table>
      </div>
      {orders.length === 0 && <p className="muted po-empty">No purchase orders have been issued in this workspace.</p>}
    </section>
    {printOrder && <article className="vm-po-print-document" aria-label="Purchase order document">
      <header className="vm-po-print-header"><div><span>VENDORMESH PROCUREMENT</span><h1>PURCHASE ORDER</h1><p>{printOrder.buyerSnapshot?.companyName || 'Buyer workspace'}</p></div><div className="vm-po-print-number"><b>{printOrder.poNumber}</b><span>Issued {displayDate(printOrder.issuedAt)}</span><span>Expected {displayDate(printOrder.expectedDeliveryDate)}</span></div></header>
      <div className="vm-po-print-parties"><section><span>SUPPLIER</span><h2>{printOrder.supplierSnapshot?.name}</h2><p>{printOrder.supplierSnapshot?.email || 'No supplier email on file'}</p></section><section><span>BUYER</span><h2>{printOrder.buyerSnapshot?.companyName}</h2><p>VendorMesh workspace</p></section></div>
      <table><thead><tr><th>SKU</th><th>DESCRIPTION</th><th>QTY</th><th>UNIT PRICE</th><th>LINE TOTAL</th></tr></thead><tbody>{(printOrder.lineItems || []).map((line, index) => <tr key={index}><td>{line.sku}</td><td>{line.itemName}</td><td>{Number(line.quantity).toLocaleString()}</td><td>{money(line.unitCost, printOrder.currency)}</td><td>{money(line.totalCost, printOrder.currency)}</td></tr>)}</tbody></table>
      <div className="vm-po-print-total"><span>ORDER TOTAL</span><strong>{money(printOrder.total, printOrder.currency)}</strong></div>
      <section className="vm-po-print-terms"><h3>Payment terms</h3><p>{printOrder.paymentTerms}</p><h3>Delivery instructions / notes</h3><p>{printOrder.notes || 'No additional instructions.'}</p></section>
      <footer className="vm-po-print-footer"><span>Issued by {printOrder.buyerSnapshot?.companyName || 'the buyer'} through VendorMesh.</span><span>PO {printOrder.poNumber}</span></footer>
    </article>}
  </section>;
}
