import { useEffect, useMemo, useState } from 'react';

function localDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString();
}
function outstanding(order) {
  const ordered = Number(order?.lineItems?.[0]?.quantity || 0);
  return Math.max(0, ordered - Number(order?.receivedQuantity || 0));
}
function receiptForm(order) {
  const remaining = outstanding(order);
  return {
    expectedQuantity: String(remaining),
    deliveredQuantity: String(remaining),
    acceptedQuantity: String(remaining),
    damagedQuantity: '0',
    discrepancyNotes: ''
  };
}
function whole(value) {
  return value !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
}

export default function WorkspaceGoodsReceipts({ api, initialOrderId = '', onRecorded }) {
  const [orders, setOrders] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [orderId, setOrderId] = useState(initialOrderId);
  const [form, setForm] = useState({ expectedQuantity: '', deliveredQuantity: '', acceptedQuantity: '', damagedQuantity: '0', discrepancyNotes: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [printReceipt, setPrintReceipt] = useState(null);

  const openOrders = useMemo(() => orders.filter(order => ['issued', 'acknowledged', 'partially_received'].includes(order.status) && outstanding(order) > 0), [orders]);
  const selectedOrder = openOrders.find(order => order._id === orderId) || null;
  const remaining = selectedOrder ? outstanding(selectedOrder) : 0;
  const expected = Number(form.expectedQuantity);
  const delivered = Number(form.deliveredQuantity);
  const accepted = Number(form.acceptedQuantity);
  const damaged = Number(form.damagedQuantity);
  const missing = expected - delivered;
  const quantitiesValid = [form.expectedQuantity, form.deliveredQuantity, form.acceptedQuantity, form.damagedQuantity].every(whole)
    && expected >= 1 && expected <= remaining
    && delivered <= expected
    && accepted + damaged === delivered
    && (damaged === 0 && missing === 0 || form.discrepancyNotes.trim().length >= 3);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [orderPage, receiptPage] = await Promise.all([
        api('/api/workspace/purchase-orders?limit=100'),
        api('/api/workspace/goods-receipts?limit=100')
      ]);
      const nextOrders = orderPage.data || [];
      setOrders(nextOrders);
      setReceipts(receiptPage.data || []);
      setOrderId(current => {
        const preferred = initialOrderId || current;
        const matched = nextOrders.find(order => order._id === preferred && ['issued', 'acknowledged', 'partially_received'].includes(order.status) && outstanding(order) > 0);
        const firstOpen = nextOrders.find(order => ['issued', 'acknowledged', 'partially_received'].includes(order.status) && outstanding(order) > 0);
        return (matched || firstOpen)?._id || '';
      });
    } catch (err) { setError(err.message || 'Unable to load goods receipt records.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [api]);
  useEffect(() => {
    if (!orderId) {
      setForm({ expectedQuantity: '', deliveredQuantity: '', acceptedQuantity: '', damagedQuantity: '0', discrepancyNotes: '' });
      return;
    }
    const order = openOrders.find(row => row._id === orderId);
    if (order) setForm(receiptForm(order));
  }, [orderId, openOrders]);

  useEffect(() => {
    if (!printReceipt) return undefined;
    const finishPrint = () => {
      document.documentElement.classList.remove('vm-printing-grn');
      setPrintReceipt(null);
    };
    document.documentElement.classList.add('vm-printing-grn');
    window.addEventListener('afterprint', finishPrint);
    const timeout = window.setTimeout(() => window.print(), 120);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('afterprint', finishPrint);
      document.documentElement.classList.remove('vm-printing-grn');
    };
  }, [printReceipt]);

  async function recordReceipt(event) {
    event.preventDefault();
    if (!selectedOrder || !quantitiesValid) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const receipt = await api(`/api/workspace/goods-receipts/${selectedOrder._id}`, {
        method: 'POST',
        body: JSON.stringify({
          expectedQuantity: expected,
          deliveredQuantity: delivered,
          acceptedQuantity: accepted,
          damagedQuantity: damaged,
          discrepancyNotes: form.discrepancyNotes
        })
      });
      const stockAdded = Number(receipt.acceptedQuantity || 0) + Number(receipt.legacyAcceptedQuantity || 0);
      const legacyNote = Number(receipt.legacyAcceptedQuantity || 0) > 0 ? ` Plus ${receipt.legacyAcceptedQuantity} previously recorded unit(s) reconciled into stock.` : '';
      setNotice(`Goods Receipt Note ${receipt.receiptNumber} saved. ${stockAdded} unit(s) added to inventory.${legacyNote}`);
      await load();
      if (onRecorded) await onRecorded();
    } catch (err) { setError(err.message || 'Unable to record goods receipt.'); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="loading">Loading goods receipt register…</div>;
  const acceptedTotal = receipts.reduce((sum, receipt) => sum + Number(receipt.acceptedQuantity || 0) + Number(receipt.legacyAcceptedQuantity || 0), 0);
  const damagedTotal = receipts.reduce((sum, receipt) => sum + Number(receipt.damagedQuantity || 0), 0);
  const missingTotal = receipts.reduce((sum, receipt) => sum + Number(receipt.missingQuantity || 0), 0);

  return <section className="workspace-goods-receipts">
    <div className="section-heading">
      <div><h2>Goods Receipt Notes</h2><p>Inspect supplier deliveries, document discrepancies and update stock for accepted units.</p></div>
      <button type="button" className="secondary" onClick={load} disabled={busy}>Refresh</button>
    </div>
    {(error || notice) && <div className={error ? 'flash flash-error' : 'flash flash-ok'} role={error ? 'alert' : 'status'}>{error || notice}</div>}
    <div className="grn-policy"><strong>Stock control rule</strong><p>Only accepted units are added to available inventory. Damaged goods and short deliveries are recorded as discrepancies and do not increase stock. Every GRN is linked to its purchase order and request.</p></div>
    <div className="metric-grid grn-metrics">
      <article className="metric-card"><span>Open purchase orders</span><strong>{openOrders.length}</strong><small>Still have quantity outstanding</small></article>
      <article className="metric-card"><span>Accepted units</span><strong>{acceptedTotal.toLocaleString()}</strong><small>Added to inventory through these GRNs</small></article>
      <article className="metric-card"><span>Damaged units</span><strong>{damagedTotal.toLocaleString()}</strong><small>Quarantined in the receipt record</small></article>
      <article className="metric-card"><span>Missing units</span><strong>{missingTotal.toLocaleString()}</strong><small>Expected but not delivered</small></article>
    </div>
    <form className="form-card grn-create-form" onSubmit={recordReceipt}>
      <h3>Record a goods receipt</h3>
      {openOrders.length === 0 && <p className="inline-hint">There are no open purchase orders with outstanding quantities. Issue a purchase order first.</p>}
      <div className="fields grn-fields">
        <label>Purchase order<select required value={orderId} disabled={busy || openOrders.length === 0} onChange={event => setOrderId(event.target.value)}>
          <option value="">Select an open purchase order…</option>
          {openOrders.map(order => <option key={order._id} value={order._id}>{order.poNumber} · {order.supplierSnapshot?.name || 'Supplier'} · {order.lineItems?.[0]?.itemName || 'Item'}</option>)}
        </select></label>
        <label>Expected in this delivery<input type="number" required min="1" max={remaining || undefined} step="1" value={form.expectedQuantity} disabled={busy || !selectedOrder} onChange={event => setForm(current => ({ ...current, expectedQuantity: event.target.value }))}/></label>
        <label>Actually delivered<input type="number" required min="0" max={Number.isFinite(expected) ? expected : undefined} step="1" value={form.deliveredQuantity} disabled={busy || !selectedOrder} onChange={event => setForm(current => ({ ...current, deliveredQuantity: event.target.value }))}/></label>
        <label>Accepted after inspection<input type="number" required min="0" max={Number.isFinite(delivered) ? delivered : undefined} step="1" value={form.acceptedQuantity} disabled={busy || !selectedOrder} onChange={event => setForm(current => ({ ...current, acceptedQuantity: event.target.value }))}/></label>
        <label>Damaged / rejected<input type="number" required min="0" max={Number.isFinite(delivered) ? delivered : undefined} step="1" value={form.damagedQuantity} disabled={busy || !selectedOrder} onChange={event => setForm(current => ({ ...current, damagedQuantity: event.target.value }))}/></label>
        <label>Missing from this delivery<input type="number" readOnly value={whole(form.expectedQuantity) && whole(form.deliveredQuantity) && expected >= delivered ? missing : ''} aria-readonly="true"/></label>
        <label className="grn-notes-field">Discrepancy / inspection notes<input maxLength="1000" value={form.discrepancyNotes} disabled={busy || !selectedOrder} onChange={event => setForm(current => ({ ...current, discrepancyNotes: event.target.value }))} placeholder="Required when units are damaged or missing"/></label>
      </div>
      {selectedOrder && <div className="grn-order-summary">
        <div><span>SUPPLIER</span><strong>{selectedOrder.supplierSnapshot?.name || 'Supplier'}</strong></div>
        <div><span>ITEM / SKU</span><strong>{selectedOrder.lineItems?.[0]?.itemName} · {selectedOrder.lineItems?.[0]?.sku}</strong></div>
        <div><span>ORDERED</span><strong>{Number(selectedOrder.lineItems?.[0]?.quantity || 0).toLocaleString()}</strong></div>
        <div><span>OUTSTANDING</span><strong>{remaining.toLocaleString()}</strong></div>
      </div>}
      {selectedOrder && <p className="grn-stock-preview">Inventory increase on save: <strong>{quantitiesValid ? accepted.toLocaleString() : 'Check quantities'}</strong> accepted unit(s). Damaged and missing units are excluded.</p>}
      <button type="submit" className="primary" disabled={busy || !selectedOrder || !quantitiesValid}>{busy ? 'Saving GRN…' : 'Save Goods Receipt Note'}</button>
      {!quantitiesValid && selectedOrder && <p className="grn-validation-hint">Check that expected, delivered, accepted and damaged quantities are whole numbers; accepted + damaged must equal delivered. Add a note for any discrepancy.</p>}
    </form>
    <section className="table-card">
      <div className="grn-table-heading"><div><h3>Goods receipt history</h3><p className="muted">Newest 100 GRNs from this workspace.</p></div></div>
      <div className="table-scroll vm-interactive-table" role="region" aria-label="Goods receipt history table" tabIndex="0">
        <table aria-label="Goods receipt history"><thead><tr><th>GRN number</th><th>Purchase order</th><th>Supplier / item</th><th>Expected</th><th>Delivered</th><th>Accepted</th><th>Damaged</th><th>Missing</th><th>Received</th><th>Document</th></tr></thead><tbody>
          {receipts.map(receipt => <tr key={receipt._id}>
            <td data-label="GRN number"><b>{receipt.receiptNumber}</b></td>
            <td data-label="Purchase order">{receipt.poNumber}</td>
            <td data-label="Supplier / item"><b>{receipt.supplierName}</b><small className="table-sub">{receipt.itemName} · {receipt.sku}</small></td>
            <td data-label="Expected">{receipt.expectedQuantity}</td>
            <td data-label="Delivered">{receipt.deliveredQuantity}</td>
            <td data-label="Accepted"><span className="status status-ok">{receipt.acceptedQuantity}</span>{Number(receipt.legacyAcceptedQuantity || 0) > 0 && <small className="table-sub">+{receipt.legacyAcceptedQuantity} legacy reconciled</small>}</td>
            <td data-label="Damaged"><span className={receipt.damagedQuantity ? 'status status-rejected' : 'status'}>{receipt.damagedQuantity}</span></td>
            <td data-label="Missing"><span className={receipt.missingQuantity ? 'status status-pending' : 'status'}>{receipt.missingQuantity}</span></td>
            <td data-label="Received">{localDate(receipt.receivedAt)}</td>
            <td data-label="Document"><button type="button" className="secondary po-print-button" onClick={() => setPrintReceipt(receipt)}>Print / Save PDF</button></td>
          </tr>)}
        </tbody></table>
      </div>
      {receipts.length === 0 && <p className="muted grn-empty">No goods receipt notes have been recorded yet.</p>}
    </section>
    {printReceipt && <article className="vm-grn-print-document" aria-label="Goods receipt note document">
      <header className="vm-grn-print-header"><div><span>VENDORMESH PROCUREMENT</span><h1>GOODS RECEIPT NOTE</h1><p>{printReceipt.supplierName}</p></div><div><b>{printReceipt.receiptNumber}</b><span>Received {localDate(printReceipt.receivedAt)}</span><span>PO {printReceipt.poNumber}</span></div></header>
      <div className="vm-grn-print-item"><span>ITEM</span><strong>{printReceipt.itemName}</strong><span>SKU</span><strong>{printReceipt.sku}</strong></div>
      <table><thead><tr><th>EXPECTED</th><th>DELIVERED</th><th>ACCEPTED</th><th>LEGACY ACCEPTED</th><th>DAMAGED / REJECTED</th><th>MISSING</th></tr></thead><tbody><tr><td>{printReceipt.expectedQuantity}</td><td>{printReceipt.deliveredQuantity}</td><td>{printReceipt.acceptedQuantity}</td><td>{Number(printReceipt.legacyAcceptedQuantity || 0)}</td><td>{printReceipt.damagedQuantity}</td><td>{printReceipt.missingQuantity}</td></tr></tbody></table>
      <section className="vm-grn-print-notes"><h3>Inspection / discrepancy notes</h3><p>{printReceipt.discrepancyNotes || 'No discrepancy recorded.'}</p></section>
      <footer className="vm-grn-print-footer"><span>Accepted quantity is the amount added to available inventory.</span><span>GRN {printReceipt.receiptNumber}</span></footer>
    </article>}
  </section>;
}
