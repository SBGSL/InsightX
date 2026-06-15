/* ── Navigation ── */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('view-' + btn.dataset.view).classList.add('active');
    if (btn.dataset.view === 'report') { loadAvailableDates(); }
    if (btn.dataset.view === 'history') loadHistory();
  });
});

/* ── State ── */
let state = {
  sessionId: null,
  uploadDate: null,
  classifiedRows: [],
  unclassifiedRows: [],
};

/* ── File input ── */
const fileInput = document.getElementById('fileInput');
const dropZone  = document.getElementById('dropZone');
const uploadBtn = document.getElementById('uploadBtn');
const fileNameEl = document.getElementById('fileName');

function setFile(file) {
  if (!file || !file.name.endsWith('.xlsx')) {
    alert('Please select an .xlsx file.');
    return;
  }
  fileNameEl.textContent = file.name;
  uploadBtn.disabled = false;
  uploadBtn._file = file;
}

fileInput.addEventListener('change', () => setFile(fileInput.files[0]));
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  setFile(e.dataTransfer.files[0]);
});

/* ── Progress helpers ── */
function setStep(stepId, state) {
  const icon = document.querySelector(`#${stepId} .step-icon`);
  if (!icon) return;
  icon.className = 'step-icon ' + (state === 'active' ? 'step-active' : state === 'done' ? 'step-done' : 'step-waiting');
  if (state === 'done') icon.textContent = '✓';
}
function setProgress(pct, label) {
  document.getElementById('progressBarFill').style.width = pct + '%';
  document.getElementById('progressBarLabel').textContent = label;
}
function resetProgress() {
  ['step-upload','step-parse','step-classify','step-done'].forEach((s,i) => setStep(s, 'waiting'));
  document.querySelector('#step-upload .step-icon').textContent = '1';
  document.querySelector('#step-parse .step-icon').textContent  = '2';
  document.querySelector('#step-classify .step-icon').textContent = '3';
  document.querySelector('#step-done .step-icon').textContent   = '4';
  setProgress(0, '');
}

/* ── Upload ── */
uploadBtn.addEventListener('click', async () => {
  const file = uploadBtn._file;
  if (!file) return;

  hide('autoClassifiedCard');
  hide('manualCard');
  hide('commitCard');
  hide('successBanner');
  hide('replaceBanner');
  hide('detectedDatesSummary');
  resetProgress();
  show('processing');

  setStep('step-upload', 'active');
  setProgress(10, 'Uploading file…');

  const fd = new FormData();
  fd.append('file', file);
  fd.append('session_id', Date.now().toString());

  // Simulate intermediate steps while waiting for server
  setTimeout(() => { setStep('step-upload','done'); setStep('step-parse','active'); setProgress(35,'Parsing Excel…'); }, 800);
  setTimeout(() => { setStep('step-parse','done'); setStep('step-classify','active'); setProgress(65,'Classifying resources…'); }, 1800);

  try {
    const res = await fetch('/upload', { method: 'POST', body: fd });
    const data = await res.json();

    setStep('step-classify','done'); setStep('step-done','active');
    setProgress(95, 'Finalising…');
    await new Promise(r => setTimeout(r, 400));
    setStep('step-done','done'); setProgress(100, 'Complete!');
    await new Promise(r => setTimeout(r, 300));

    hide('processing');
    if (data.error) { alert(data.error); return; }

    state.sessionId = data.session_id;
    state.classifiedRows = data.classified;
    state.unclassifiedRows = data.unclassified;

    // Show replace warning for any dates that already have data
    const replaceDates = Object.entries(data.existing_by_date || {})
      .filter(([, cnt]) => cnt > 0).map(([d]) => d);
    if (replaceDates.length > 0) {
      const warn = document.getElementById('replaceBanner');
      warn.textContent = `⚠ Existing data for ${replaceDates.join(', ')} will be replaced when you commit.`;
      warn.classList.remove('hidden');
    }

    // Show detected dates summary
    const datesSummary = document.getElementById('detectedDatesSummary');
    datesSummary.textContent = `Detected ${data.dates.length} date(s) in file: ${data.dates.join(', ')}`;
    datesSummary.classList.remove('hidden');

    renderAutoClassified(data.classified);
    if (data.unclassified.length > 0) {
      renderManual(data.unclassified);
    } else {
      show('commitCard');
    }
  } catch (e) {
    hide('processing');
    alert('Upload failed: ' + e.message);
  }
});

/* ── Render classification summary (per date × per type) ── */
function renderAutoClassified(rows) {
  if (!rows.length) return;

  // Group by date → type → {count, cost}
  const byDate = {};
  for (const r of rows) {
    const d = r.upload_date;
    const t = r.type;
    if (!byDate[d]) byDate[d] = {};
    if (!byDate[d][t]) byDate[d][t] = { count: 0, cost: 0 };
    byDate[d][t].count++;
    byDate[d][t].cost += r.cost_inr;
  }

  const TYPE_ORDER = [
    'Customer Attributed (Compute)',
    'Customer Specific (Storage,Read/write)',
    'Platform',
  ];

  const html = Object.keys(byDate).sort().map(d => {
    const types = byDate[d];
    const dateTotal = Object.values(types).reduce((s, v) => s + v.cost, 0);
    const dateCount = Object.values(types).reduce((s, v) => s + v.count, 0);
    const rows = TYPE_ORDER.filter(t => types[t]).map(t => `
      <tr>
        <td>${typeChip(t)}</td>
        <td class="num">${types[t].count}</td>
        <td class="num">₹${fmt(types[t].cost)}</td>
      </tr>`).join('');
    return `
      <div class="summary-date-block">
        <div class="summary-date-header">
          <span class="summary-date-label">${d}</span>
          <span class="muted small">${dateCount} resources &nbsp;·&nbsp; ₹${fmt(dateTotal)}</span>
        </div>
        <table class="summary-table">
          <thead><tr><th>Type</th><th>Resources</th><th>Cost (INR)</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('');

  document.getElementById('summaryByDate').innerHTML = html;
  document.getElementById('autoCount').textContent = rows.length + ' resources across ' + Object.keys(byDate).length + ' date(s)';
  show('autoClassifiedCard');
}

/* ── Render manual ── */
function renderManual(rows) {
  const tbody = document.querySelector('#manualTable tbody');
  tbody.innerHTML = rows.map((r, i) => `
    <tr>
      <td>${esc(r.resource)}</td>
      <td>${esc(r.resource_type)}</td>
      <td>${esc(r.resource_group)}</td>
      <td class="num">${fmt(r.cost_inr)}</td>
      <td>
        <select class="type-select unset" data-idx="${i}" onchange="this.classList.remove('unset')">
          <option value="">— Select Type —</option>
          <option value="Customer Attributed (Compute)">Customer Attributed (Compute)</option>
          <option value="Customer Specific (Storage,Read/write)">Customer Specific (Storage,Read/write)</option>
          <option value="Platform">Platform</option>
        </select>
      </td>
    </tr>`).join('');
  document.getElementById('manualCount').textContent = rows.length + ' resources need review';
  show('manualCard');
}

/* ── Save manual classifications ── */
document.getElementById('saveClassBtn').addEventListener('click', async () => {
  const selects = document.querySelectorAll('#manualTable .type-select');
  const selections = [];
  let missing = false;

  selects.forEach((sel, i) => {
    if (!sel.value) { missing = true; sel.classList.add('unset'); }
    else selections.push({ resource: state.unclassifiedRows[i].resource, type: sel.value });
  });

  if (missing) { alert('Please classify all resources before saving.'); return; }

  // Build manually classified rows using same structure as auto rows
  const manualRows = state.unclassifiedRows.map((r, i) => ({
    ...r, type: selections[i].type
  }));

  // Single commit of ALL rows (auto + manual) for the date — one atomic replace
  const allRows = [...state.classifiedRows, ...manualRows];

  // Save learned type mappings to DB (for future auto-classification)
  await fetch('/classify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: state.sessionId, selections }),
  });

  const ok = await commitRows(allRows);
  if (!ok) return;

  show('successBanner');
  hide('manualCard');
  hide('autoClassifiedCard');
  hide('commitCard');
  resetUpload();
});

/* ── Commit auto-only ── */
document.getElementById('commitOnlyBtn').addEventListener('click', async () => {
  const ok = await commitRows(state.classifiedRows);
  if (!ok) return;
  show('successBanner');
  hide('commitCard');
  hide('autoClassifiedCard');
  resetUpload();
});

async function commitRows(rows) {
  if (!rows.length) { alert('No rows to commit.'); return false; }

  show('processing');
  resetProgress();
  setStep('step-upload', 'done');
  setStep('step-parse', 'done');
  setStep('step-classify', 'active');
  setProgress(50, 'Saving to database…');

  try {
    const res = await fetch('/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    });
    const data = await res.json();

    setStep('step-classify','done'); setStep('step-done','active');
    setProgress(100, 'Saved!');
    await new Promise(r => setTimeout(r, 500));
    hide('processing');

    if (!res.ok) {
      alert('Commit failed: ' + (data.error || res.statusText));
      return false;
    }
    return true;
  } catch (e) {
    hide('processing');
    alert('Commit failed: ' + e.message);
    return false;
  }
}

function resetUpload() {
  fileInput.value = '';
  fileNameEl.textContent = '';
  uploadBtn.disabled = true;
  uploadBtn._file = null;
  state = { sessionId: null, uploadDate: null, classifiedRows: [], unclassifiedRows: [] };
}

/* ── Available Dates ── */
async function loadAvailableDates() {
  const chips = document.getElementById('dateChips');
  const empty = document.getElementById('datesEmpty');
  const count = document.getElementById('datesCount');
  chips.innerHTML = '<span class="muted small">Loading…</span>';

  try {
    const res  = await fetch('/available-dates');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    if (!data.length) {
      chips.innerHTML = '';
      count.textContent = '0 dates';
      show('datesEmpty');
      return;
    }
    hide('datesEmpty');
    count.textContent = data.length + ' date' + (data.length > 1 ? 's' : '');

    // Group by Month-YY
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const groups = {};
    for (const d of data) {
      const [y, m] = d.upload_date.split('-');
      const key = MONTHS[parseInt(m)-1] + '-' + y.slice(2);
      if (!groups[key]) groups[key] = { dates: [], total: 0, key };
      groups[key].dates.push(d);
      groups[key].total += d.total;
    }

    chips.innerHTML = Object.values(groups).map(g => `
      <div class="month-group">
        <div class="month-label">
          <span class="month-name">${g.key}</span>
          <span class="month-meta">${g.dates.length} day${g.dates.length>1?'s':''} · ₹${fmt(g.total)}</span>
        </div>
        <div class="month-chips">
          ${g.dates.map(d => `
            <div class="date-chip">
              <span class="date-chip-date">${d.upload_date}</span>
              <span class="date-chip-rows">${d.rows} resources</span>
              <span class="date-chip-cost">₹${fmt(d.total)}</span>
            </div>`).join('')}
        </div>
      </div>`).join('');
  } catch (e) {
    chips.innerHTML = `<span class="muted small">Error loading dates: ${e.message}</span>`;
  }
}

/* ── Report date controls ── */
(function initDateControls() {
  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt8601 = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  const toInput   = document.getElementById('toDate');
  const fromInput = document.getElementById('fromDate');
  toInput.value   = fmt8601(today);
  const d15 = new Date(today); d15.setDate(today.getDate() - 14);
  fromInput.value = fmt8601(d15);

  document.querySelectorAll('.qbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.qbtn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const days = parseInt(btn.dataset.days);
      const from = new Date(today); from.setDate(today.getDate() - days + 1);
      fromInput.value = fmt8601(from);
      toInput.value   = fmt8601(today);
    });
  });
  // Mark default active
  document.querySelector('.qbtn[data-days="15"]').classList.add('active');
})();

/* ── Chart instance ── */
let _chart = null;
let _lastDailyChart = [];

function renderChart(dailyChart) {
  _lastDailyChart = dailyChart;
  const wrap = document.getElementById('chartWrap');
  if (!dailyChart.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  _buildChart();
}

function _buildChart() {
  const dailyChart = _lastDailyChart;
  const showA = document.getElementById('chkStorage').checked;
  const showB = document.getElementById('chkCompute').checked;
  const showC = document.getElementById('chkPlatform').checked;

  const labels   = dailyChart.map(d => d.date);
  const datasets = [];
  if (showA) datasets.push({ label: 'A — Storage (INR)',  data: dailyChart.map(d => d.storage),  backgroundColor: 'rgba(251,146,60,0.85)',  borderRadius: 4 });
  if (showB) datasets.push({ label: 'B — Compute (INR)',  data: dailyChart.map(d => d.compute),  backgroundColor: 'rgba(79,142,247,0.85)',  borderRadius: 4 });
  if (showC) datasets.push({ label: 'C — Platform (INR)', data: dailyChart.map(d => d.platform), backgroundColor: 'rgba(139,92,246,0.85)', borderRadius: 4 });

  if (_chart) _chart.destroy();
  _chart = new Chart(document.getElementById('costChart'), {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ₹${ctx.parsed.y.toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2})}`,
          }
        }
      },
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, ticks: { callback: v => '₹' + (v >= 1000 ? (v/1000).toFixed(1)+'k' : v) } },
      },
    },
  });
}

['chkStorage','chkCompute','chkPlatform'].forEach(id => {
  document.getElementById(id)?.addEventListener('change', () => { if (_lastDailyChart.length) _buildChart(); });
});

/* ── Customer filter ── */
let _allCustomers    = [];
let _selectedCustomers = new Set();

function updateFilterBtn() {
  const btn = document.getElementById('customerFilterBtn');
  if (!btn) return;
  const isFiltered = _selectedCustomers.size < _allCustomers.length;
  btn.classList.toggle('active', isFiltered);
  btn.title = isFiltered ? `${_selectedCustomers.size} of ${_allCustomers.length} customers shown` : 'Filter customers';
}

function buildCustomerFilter(customers) {
  _allCustomers = customers;
  _selectedCustomers = new Set(customers);
  updateFilterBtn();

  const dropdown = document.getElementById('customerDropdown');
  dropdown.innerHTML = `
    <div class="cust-select-all">
      <label><input type="checkbox" id="chkAllCustomers" checked> Select All (${customers.length})</label>
    </div>
    <div class="cust-list">
      ${customers.map((c, i) => `
        <label class="cust-item">
          <input type="checkbox" class="cust-chk" data-idx="${i}" checked>
          ${esc(c)}
        </label>`).join('')}
    </div>`;

  dropdown.querySelector('#chkAllCustomers').addEventListener('change', e => {
    _selectedCustomers = e.target.checked ? new Set(_allCustomers) : new Set();
    dropdown.querySelectorAll('.cust-chk').forEach(chk => { chk.checked = e.target.checked; });
    updateFilterBtn();
    renderReportTable();
  });

  dropdown.querySelectorAll('.cust-chk').forEach((chk, i) => {
    chk.addEventListener('change', () => {
      if (chk.checked) _selectedCustomers.add(_allCustomers[i]);
      else             _selectedCustomers.delete(_allCustomers[i]);
      dropdown.querySelector('#chkAllCustomers').checked = (_selectedCustomers.size === _allCustomers.length);
      updateFilterBtn();
      renderReportTable();
    });
  });
}

document.addEventListener('click', e => {
  const btn = document.getElementById('customerFilterBtn');
  const dd  = document.getElementById('customerDropdown');
  if (!btn || !dd) return;
  if (btn.contains(e.target)) {
    e.stopPropagation();
    const isHidden = dd.classList.contains('hidden');
    if (isHidden) {
      const rect = btn.getBoundingClientRect();
      dd.style.top  = (rect.bottom + 6) + 'px';
      dd.style.left = rect.left + 'px';
    }
    dd.classList.toggle('hidden');
  } else if (!dd.contains(e.target)) {
    dd.classList.add('hidden');
  }
});

function renderReportTable() {
  const data = window._reportData;
  if (!data) return;
  const allRows  = data.table;
  const selected = allRows.filter(r => _selectedCustomers.has(r.customer));
  const others   = allRows.filter(r => !_selectedCustomers.has(r.customer));

  const grandD = data.totals.total_cost;

  const tableRows = selected.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${esc(r.customer)}</strong></td>
      <td class="num">${fmt(r.storage_cost)}</td>
      <td class="num pct">${r.pct_storage}%</td>
      <td class="num">${fmt(r.compute_cost)}</td>
      <td class="num pct">${r.pct_compute}%</td>
      <td class="num">${fmt(r.platform_cost)}</td>
      <td class="num pct">${r.pct_platform}%</td>
      <td class="num"><strong>${fmt(r.total_cost)}</strong></td>
    </tr>`);

  if (others.length) {
    const oa = others.reduce((s,r) => s + r.storage_cost,  0);
    const ob = others.reduce((s,r) => s + r.compute_cost,  0);
    const oc = others.reduce((s,r) => s + r.platform_cost, 0);
    const od = oa + ob + oc;
    tableRows.push(`
      <tr class="other-row">
        <td>—</td>
        <td><em>Other Customers (${others.length})</em></td>
        <td class="num">${fmt(oa)}</td>
        <td class="num pct">${grandD ? (oa/grandD*100).toFixed(1) : 0}%</td>
        <td class="num">${fmt(ob)}</td>
        <td class="num pct">${grandD ? (ob/grandD*100).toFixed(1) : 0}%</td>
        <td class="num">${fmt(oc)}</td>
        <td class="num pct">${grandD ? (oc/grandD*100).toFixed(1) : 0}%</td>
        <td class="num"><strong>${fmt(od)}</strong></td>
      </tr>`);
  }

  document.querySelector('#reportTable tbody').innerHTML = tableRows.join('');

  const t = data.totals;
  document.querySelector('#reportTable tfoot').innerHTML = `<tr>
    <td colspan="2">TOTAL</td>
    <td class="num">${fmt(t.storage_cost)}</td>
    <td class="num pct">${t.pct_storage}%</td>
    <td class="num">${fmt(t.compute_cost)}</td>
    <td class="num pct">${t.pct_compute}%</td>
    <td class="num">${fmt(t.platform_cost)}</td>
    <td class="num pct">${t.pct_platform}%</td>
    <td class="num">${fmt(t.total_cost)}</td>
  </tr>`;
}

/* ── Load report ── */
document.getElementById('loadReportBtn').addEventListener('click', loadReport);

async function loadReport() {
  const from = document.getElementById('fromDate').value;
  const to   = document.getElementById('toDate').value;
  if (!from || !to) { alert('Please select a date range.'); return; }

  const res  = await fetch(`/report?from_date=${from}&to_date=${to}`);
  const data = await res.json();

  const meta = document.getElementById('reportMeta');
  if (!data.dates.length) {
    meta.textContent = '';
    document.getElementById('chartWrap').style.display = 'none';
    document.getElementById('reportTableWrap').style.display = 'none';
    show('reportEmpty');
    return;
  }
  hide('reportEmpty');
  meta.textContent = `${data.dates.length} day${data.dates.length>1?'s':''} of data  (${data.dates[0]} → ${data.dates[data.dates.length-1]})`;

  renderChart(data.daily_chart);
  window._reportData = data;

  buildCustomerFilter(data.table.map(r => r.customer));
  document.getElementById('reportTableWrap').style.display = 'block';
  renderReportTable();
}

/* ── Export CSV ── */
document.getElementById('exportCsvBtn').addEventListener('click', () => {
  if (!window._reportData) { alert('Load report first.'); return; }
  const d = window._reportData;
  const selected = d.table.filter(r => _selectedCustomers.has(r.customer));
  const others   = d.table.filter(r => !_selectedCustomers.has(r.customer));
  const csvRows  = [...selected];
  if (others.length) {
    const oa = others.reduce((s,r) => s+r.storage_cost, 0);
    const ob = others.reduce((s,r) => s+r.compute_cost, 0);
    const oc = others.reduce((s,r) => s+r.platform_cost, 0);
    const od = oa+ob+oc;
    const gd = d.totals.total_cost;
    csvRows.push({ customer: `Other Customers (${others.length})`, storage_cost: oa, pct_storage: gd?(oa/gd*100).toFixed(1):0, compute_cost: ob, pct_compute: gd?(ob/gd*100).toFixed(1):0, platform_cost: oc, pct_platform: gd?(oc/gd*100).toFixed(1):0, total_cost: od });
  }
  const rows = [
    ['Customer Name', 'A - Storage Cost (INR)', 'A %', 'B - Compute Cost (INR)', 'B %', 'C - Platform Cost (INR)', 'C %', 'D - Total Cost (INR)'],
    ...csvRows.map(r => [r.customer, r.storage_cost, r.pct_storage+'%', r.compute_cost, r.pct_compute+'%', r.platform_cost, r.pct_platform+'%', r.total_cost]),
    ['TOTAL', d.totals.storage_cost, d.totals.pct_storage+'%', d.totals.compute_cost, d.totals.pct_compute+'%', d.totals.platform_cost, d.totals.pct_platform+'%', d.totals.total_cost],
  ];
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `insightx_report_${d.dates[0]}_to_${d.dates[d.dates.length-1]}.csv`;
  a.click();
});

/* ── History ── */
async function loadHistory() {
  const res  = await fetch('/history');
  const data = await res.json();
  const tbody = document.querySelector('#historyTable tbody');
  if (!data.length) { show('historyEmpty'); tbody.innerHTML = ''; return; }
  hide('historyEmpty');
  tbody.innerHTML = data.map(r => `
    <tr>
      <td>${r.upload_date}</td>
      <td>${r.rows}</td>
      <td class="num">${fmt(r.total)}</td>
    </tr>`).join('');
}

/* ── Helpers ── */
function show(id) { document.getElementById(id).classList.remove('hidden'); }
function hide(id) { document.getElementById(id).classList.add('hidden'); }
function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmt(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function typeChip(t) {
  if (!t) return '';
  if (t.includes('Compute'))  return `<span class="chip chip-compute">${esc(t)}</span>`;
  if (t.includes('Storage'))  return `<span class="chip chip-storage">${esc(t)}</span>`;
  return `<span class="chip chip-platform">${esc(t)}</span>`;
}
