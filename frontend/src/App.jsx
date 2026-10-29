// File: frontend/src/App.jsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import AISettings from './components/AISettings.jsx';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

// Empty in Docker/dev (same-origin proxy); set VITE_API_URL for split hosting such as Render.
const API = import.meta.env.VITE_API_URL || '';
const POLL_MS = 4000;

async function api(path, options = {}) {
  const adminToken = sessionStorage.getItem('vendormesh.adminToken') || '';
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
    ...(adminToken ? { 'X-Admin-Token': adminToken } : {}),
  };
  const res = await fetch(`${API}${path}`, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

const usd = (v, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 2 }).format(v ?? 0);

const ACTION_LABEL = {
  ORDER_PAYMENT: 'Created PayPal order',
  BULK_PAYOUT: 'Sent PayPal payout',
  HOLD: 'Held reorder',
};

const STATUS_LABEL = { pending: 'Pending', completed: 'Completed', failed: 'Failed', held: 'No spend' };

/* ------------------------------ Grid renderers ------------------------------ */

// Status pill. A pending order carries the PayPal approval link so a person can release the funds.
function StatusCell({ value, data }) {
  return (
    <span className="status-cell">
      <span className={`pill pill-${value}`}>{STATUS_LABEL[value] || value}</span>
      {value === 'pending' && data.approval_url && (
        <a href={data.approval_url} target="_blank" rel="noopener noreferrer" className="approve">
          Approve in PayPal
        </a>
      )}
    </span>
  );
}

function VendorCell({ value, data }) {
  return (
    <span className="vendor-cell">
      <strong>{value}</strong>
      {data.sku && (
        <small>
          {data.quantity} × {data.sku}
        </small>
      )}
    </span>
  );
}

// AG Grid's JS theme API: styling lives in one typed object instead of a global CSS override.
const gridTheme = themeQuartz.withParams({
  fontFamily: 'Public Sans, system-ui, sans-serif',
  fontSize: 13,
  backgroundColor: '#ffffff',
  foregroundColor: '#0e1a3a',
  headerBackgroundColor: '#e4e9f3',
  headerTextColor: '#0e1a3a',
  headerFontWeight: 600,
  borderColor: '#d5dceb',
  rowHoverColor: '#f3f6fc',
  accentColor: '#0b63ce',
  spacing: 9,
});

/* ------------------------------- Page sections ------------------------------ */

// The memorable element: one bar that shows where every dollar of working capital sits right now.
function LiquidityBar({ t }) {
  if (!t) return <div className="bar bar-empty" aria-busy="true" />;
  const pct = (v) => `${Math.max(0, Math.min(100, (v / t.initial) * 100))}%`;
  const parts = [
    { key: 'committed', label: 'Committed to suppliers', value: t.committed, cls: 'seg-committed' },
    { key: 'reserve', label: 'Protected reserve', value: Math.min(t.reserve, Math.max(0, t.available)), cls: 'seg-reserve' },
    { key: 'spendable', label: 'Spendable by the agent', value: t.spendable, cls: 'seg-spendable' },
  ];
  return (
    <>
      <div className="bar" role="img" aria-label={`Spendable ${usd(t.spendable)}, reserve ${usd(t.reserve)}, committed ${usd(t.committed)}`}>
        {parts.map((p) => (
          <div key={p.key} className={`seg ${p.cls}`} style={{ width: pct(p.value) }} />
        ))}
      </div>
      <dl className="legend">
        {parts.map((p) => (
          <div key={p.key}>
            <dt>
              <i className={`dot ${p.cls}`} />
              {p.label}
            </dt>
            <dd>{usd(p.value, t.currency)}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

function InventoryList({ items, busySku, onAlert }) {
  return (
    <ul className="inventory">
      {items.map((i) => (
        <li key={i.sku} className={i.below_reorder_point ? 'low' : ''}>
          <div>
            <strong>{i.name}</strong>
            <span className="sub">
              {i.on_hand} on hand · {i.days_of_cover} days of cover · reorder at {i.reorder_point}
            </span>
          </div>
          <button type="button" className={i.below_reorder_point ? 'btn btn-primary' : 'btn'} disabled={!!busySku} onClick={() => onAlert(i.sku)}>
            {busySku === i.sku ? 'Agent is working…' : 'Send low-stock alert'}
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------- App ------------------------------------ */

export default function App() {
  const [txs, setTxs] = useState([]);
  const [treasury, setTreasury] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [busySku, setBusySku] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [showAISettings, setShowAISettings] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [t, tr, inv] = await Promise.all([api('/api/transactions'), api('/api/treasury'), api('/api/inventory')]);
      setTxs(t);
      setTreasury(tr);
      setInventory(inv);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  // Live view: poll the ledger (paused while the tab is hidden) so webhook-driven status changes appear on their own.
  useEffect(() => {
    refresh();
    const id = setInterval(() => !document.hidden && refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  // Surface the result of the PayPal redirect (?paypal=captured etc.), then clean the URL.
  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get('paypal');
    if (!flag) return;
    const text = {
      captured: 'Payment approved and captured. The status turns Completed once PayPal confirms it.',
      cancelled: 'Approval cancelled. The order stays pending.',
      capture_failed: 'PayPal could not capture the order. Check the error in the ledger.',
      unknown_order: 'That PayPal order is not in the ledger.',
    }[flag];
    if (text) setNotice({ kind: flag === 'captured' ? 'ok' : 'error', text });
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const sendAlert = async (sku) => {
    setBusySku(sku);
    setNotice(null);
    try {
      const { transaction: tx, steps } = await api('/api/agent/trigger', { method: 'POST', body: JSON.stringify({ sku }) });
      setNotice({
        kind: tx.status === 'failed' ? 'error' : 'ok',
        text: `${ACTION_LABEL[tx.action_taken]}${tx.amount ? ` for ${usd(tx.amount, tx.currency)} with ${tx.vendor_name}` : ''} after ${steps} reasoning steps.`,
        link: tx.approval_url,
      });
      await refresh();
    } catch (err) {
      setNotice({ kind: 'error', text: `The agent could not finish: ${err.message}` });
    } finally {
      setBusySku(null);
    }
  };

  const columnDefs = useMemo(
    () => [
      {
        headerName: 'Date',
        field: 'timestamp',
        width: 170,
        sort: 'desc',
        valueFormatter: (p) => (p.value ? new Date(p.value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''),
      },
      { headerName: 'Vendor', field: 'vendor_name', width: 210, cellRenderer: VendorCell },
      { headerName: 'Action Taken', field: 'action_taken', width: 190, valueFormatter: (p) => ACTION_LABEL[p.value] || p.value },
      {
        headerName: 'Agent Reasoning',
        field: 'agent_reasoning',
        flex: 1,
        minWidth: 340,
        wrapText: true,
        autoHeight: true,
        tooltipField: 'agent_reasoning',
        cellClass: 'reasoning',
      },
      {
        headerName: 'Amount',
        field: 'amount',
        width: 130,
        type: 'rightAligned',
        cellClass: 'amount',
        valueFormatter: (p) => (p.data?.status === 'held' ? '—' : usd(p.value, p.data?.currency)),
      },
      { headerName: 'PayPal Status', field: 'status', width: 230, cellRenderer: StatusCell },
    ],
    []
  );

  const completed = txs.filter((t) => t.status === 'completed').length;
  const pending = txs.filter((t) => t.status === 'pending').length;

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>VendorMesh</h1>
          <p className="tagline">An AI agent that restocks inventory and pays suppliers from live cash, within limits you set.</p>
        </div>
        <div className="header-actions">
          <p className="credit">
            Built by Pratool Kumar Ray and Ishan Roy
            <br />
            for the PayPal AI Hackathon
          </p>
          <button type="button" className="btn btn-primary" onClick={() => setShowAISettings(true)}>AI Settings ↗</button>
        </div>
      </header>

      <section className="hero" aria-labelledby="liq">
        <h2 id="liq">Working capital right now</h2>
        <LiquidityBar t={treasury} />
        <p className="stats">
          {txs.length} agent decisions logged. {completed} paid, {pending} waiting on PayPal approval.
        </p>
      </section>

      {showAISettings && <AISettings api={api} onClose={() => setShowAISettings(false)} />}

      {notice && (
        <div className={`notice notice-${notice.kind}`} role="status">
          <span>{notice.text}</span>
          {notice.link && (
            <a href={notice.link} target="_blank" rel="noopener noreferrer">
              Approve in PayPal
            </a>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}
      {loadError && (
        <div className="notice notice-error" role="alert">
          Cannot reach the API ({loadError}). Check that the backend is running and VITE_API_URL is correct.
        </div>
      )}

      <section aria-labelledby="inv">
        <h2 id="inv">Inventory</h2>
        <InventoryList items={inventory} busySku={busySku} onAlert={sendAlert} />
      </section>

      <section aria-labelledby="ledger">
        <h2 id="ledger">Autonomous transaction log</h2>
        <div className="grid-wrap">
          <AgGridReact
            theme={gridTheme}
            rowData={txs}
            columnDefs={columnDefs}
            defaultColDef={{ sortable: true, resizable: true, filter: true }}
            getRowId={(p) => p.data._id}
            domLayout="autoHeight"
            pagination
            paginationPageSize={15}
            paginationPageSizeSelector={false}
            overlayNoRowsTemplate="No decisions yet. Send a low-stock alert and the agent will log its first one here."
          />
        </div>
      </section>
    </div>
  );
}
