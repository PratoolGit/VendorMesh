import { useEffect, useState } from 'react';
function money(value,currency='USD') {
  try { return new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(Number(value||0)); }
  catch { return `${currency} ${Number(value||0).toFixed(2)}`; }
}
export default function WorkspaceReconciliation({ api }) {
  const [result,setResult] = useState(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  async function load() {
    setLoading(true); setError('');
    try { setResult(await api('/api/workspace/reconciliation')); }
    catch (err) { setError(err.message || 'Unable to load reconciliation.'); }
    finally { setLoading(false); }
  }
  useEffect(()=>{load();},[api]);
  if (loading) return <div className="loading">Reconciling workspace records…</div>;
  const counts=result?.counts || {};
  return <section className="workspace-reconciliation">
    <div className="section-heading"><div><h2>Invoice and purchase reconciliation</h2><p>Read-only comparisons between purchase requests and manually entered invoices.</p></div><button type="button" className="secondary" onClick={load}>Refresh</button></div>
    {error && <div className="flash flash-error" role="alert">{error}</div>}
    {result && <>
      <div className="invoice-limits-note">{result.warning} The report is bounded to the recent-record windows shown by the API.</div>
      <div className="metric-grid">
        <Tile label="Purchase requests" value={counts.purchaseRequests ?? 0} note="In current window"/>
        <Tile label="Invoices" value={counts.invoices ?? 0} note="In current window"/>
        <Tile label="High-priority flags" value={counts.highPriority ?? 0} note="Human review required"/>
        <Tile label="Review recommended" value={counts.reviewRecommended ?? 0} note="Verify record details"/>
      </div>
      <section className="table-card">
        <div className="invoice-table-heading"><div><h3>Reconciliation signals</h3><p className="muted">These are discrepancy checks, not fraud conclusions. No records are changed.</p></div></div>
        <div className="table-scroll" role="region" aria-label="Reconciliation signals table" tabIndex="0"><table aria-label="Reconciliation signals"><thead><tr><th>Priority</th><th>Signal</th><th>Purchase request</th><th>Invoice</th><th>Evidence</th><th>Next step</th></tr></thead><tbody>
          {(result.signals||[]).map(signal=>{
            const evidence=signal.evidence||[];
            const details=[];
            if(evidence.invoiceTotal!==undefined) details.push(`Invoices ${money(evidence.invoiceTotal,evidence.currency||'USD')}`);
            if(evidence.purchaseTotal!==undefined) details.push(`Order ${money(evidence.purchaseTotal,evidence.currency||'USD')}`);
            if(evidence.invoiceCurrency||evidence.requestCurrency) details.push(`Currency ${evidence.invoiceCurrency||'—'} / ${evidence.requestCurrency||'—'}`);
            if(evidence.invoiceIds?.length) details.push(`Records ${evidence.invoiceIds.join(', ')}`);
            if(evidence.invoiceNumber) details.push(evidence.invoiceNumber);
            if(evidence.supplierName) details.push(evidence.supplierName);
            return <tr key={signal.id}>
              <td><span className={'status '+(signal.severity==='high_priority_review'?'status-rejected':'status-pending')}>{signal.severity.replaceAll('_',' ')}</span></td>
              <td><b>{signal.title}</b><small className="table-sub">{signal.type.replaceAll('_',' ')}</small></td>
              <td><code>{signal.requestId||'—'}</code><small className="table-sub">{evidence.itemName||'—'}</small></td>
              <td><code>{signal.invoiceId||'—'}</code></td>
              <td>{details.length?details.join(' · '):'Additional record review required'}</td>
              <td>{signal.nextStep}</td>
            </tr>;
          })}
        </tbody></table></div>
        {(!result.signals || result.signals.length===0) && <p className="muted invoice-empty">No review signals found in this window. This does not guarantee that all records reconcile.</p>}
      </section>
    </>}
  </section>;
}
function Tile({label,value,note}) { return <article className="metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></article>; }
