const NUM_FLOORS = 4;
let currentFloor = 1;
let currentMode = 'record';
let floorCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
let currentPoints = [];

// Point types: label, color (fill on the map), and short badge text.
const TYPES = {
  room:      { label: 'Room',      color: '#0F2740', badge: null },
  toilet:    { label: 'Toilet',    color: '#2F6690', badge: 'WC' },
  lift:      { label: 'Lift',      color: '#FF6B35', badge: 'LIFT' },
  stairwell: { label: 'Stairwell', color: '#4FD1A5', badge: 'STAIR' },
  entrance:  { label: 'Entrance',  color: '#E5484D', badge: 'ENT' },
  other:     { label: 'Other',     color: '#6B4FD1', badge: '?' },
};

const $ = (sel) => document.querySelector(sel);

function toast(msg) {
  const t = $('#statusToast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1400);
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- API calls ----------
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

async function loadFloorCounts() {
  floorCounts = await api('/api/floors');
}

async function loadPoints(floor) {
  currentPoints = await api(`/api/floors/${floor}/points`);
}

async function addPoint(floor, room, type, steps) {
  try {
    await api(`/api/floors/${floor}/points`, {
      method: 'POST',
      body: JSON.stringify({ room, type, steps }),
    });
    toast('Saved: Room ' + room);
    await refresh();
  } catch (e) {
    toast(e.message || 'Save failed');
  }
}

async function deletePoint(floor, id) {
  try {
    await api(`/api/floors/${floor}/points/${id}`, { method: 'DELETE' });
    await refresh();
  } catch (e) {
    toast(e.message || 'Delete failed');
  }
}

async function resetFloor(floor) {
  if (!confirm('Clear all points on Floor ' + floor + '? This cannot be undone.')) return;
  try {
    await api(`/api/floors/${floor}`, { method: 'DELETE' });
    await refresh();
  } catch (e) {
    toast(e.message || 'Clear failed');
  }
}

// ---------- FLOOR TABS ----------
function renderFloorTabs() {
  const el = $('#floorTabs');
  el.innerHTML = '';
  for (let f = 1; f <= NUM_FLOORS; f++) {
    const b = document.createElement('button');
    b.className = f === currentFloor ? 'active' : '';
    b.innerHTML = '<span class="n">F' + f + '</span>' + (floorCounts[f] || 0) + ' pts';
    b.onclick = () => { currentFloor = f; render(); };
    el.appendChild(b);
  }
}

// ---------- RECORD VIEW ----------
function renderRecordView() {
  const el = $('#recordView');
  const points = currentPoints;
  const lastRoom = points.length ? points[points.length - 1].room : null;

  const typeOptions = Object.entries(TYPES)
    .map(([key, t]) => `<option value="${key}">${t.label}</option>`)
    .join('');

  el.innerHTML = `
    <div class="card">
      <h2>Add Point — Floor ${currentFloor}</h2>
      <div class="row2">
        <div>
          <label>Room / Label</label>
          <input type="text" id="roomInput" placeholder="e.g. 104 / Lift A" autocomplete="off">
        </div>
        <div>
          <label>Type</label>
          <select id="typeSelect">${typeOptions}</select>
        </div>
      </div>
      <label>Steps ${lastRoom ? 'from ' + escapeHtml(lastRoom) : '(start point)'}</label>
      <input type="number" id="stepsInput" placeholder="${lastRoom ? 'e.g. 14' : '0'}" min="0">
      <div class="hint">Walk from the last point to here, counting steps as you go, then pick the correct type (Room, Toilet, Lift, Stairwell, Entrance) so the map marks it precisely.</div>
      <button class="btn" id="saveBtn">＋ Save Point</button>
    </div>

    <div class="card">
      <h2>Floor ${currentFloor} Log — ${points.length} point${points.length === 1 ? '' : 's'}</h2>
      ${points.length === 0
        ? '<div class="empty">No points logged yet on this floor.</div>'
        : `<ul class="log">${points.map((p, i) => `
            <li>
              <span class="idx">${i + 1}</span>
              <span class="typebadge" style="background:${(TYPES[p.type] || TYPES.other).color}">${(TYPES[p.type] || TYPES.other).badge || 'RM'}</span>
              <span class="room">${escapeHtml(p.room)}</span>
              <span class="steps">${i === 0 ? 'start' : p.steps + ' steps'}</span>
              <button class="del" data-id="${p.id}" title="delete">✕</button>
            </li>`).join('')}</ul>`
      }
      ${points.length > 0 ? `<button class="btn ghost" id="resetBtn" style="margin-top:12px;">Clear Floor ${currentFloor}</button>` : ''}
    </div>
  `;

  $('#saveBtn').onclick = () => {
    const room = $('#roomInput').value.trim();
    const type = $('#typeSelect').value;
    const stepsRaw = $('#stepsInput').value.trim();
    if (!room) { toast('Enter a room number first'); return; }
    if (points.length > 0 && stepsRaw === '') { toast('Enter step count'); return; }
    const steps = points.length === 0 ? 0 : (parseInt(stepsRaw, 10) || 0);
    addPoint(currentFloor, room, type, steps);
  };

  el.querySelectorAll('.del').forEach(btn => {
    btn.onclick = () => deletePoint(currentFloor, btn.dataset.id);
  });
  const resetBtn = $('#resetBtn');
  if (resetBtn) resetBtn.onclick = () => resetFloor(currentFloor);
}

// ---------- MAP VIEW ----------
function renderMapView() {
  const el = $('#mapView');
  const points = currentPoints;

  if (points.length === 0) {
    el.innerHTML = `<div class="card"><div class="empty">Nothing to map yet. Log some points in Record mode first.</div></div>`;
    return;
  }

  const PX_PER_STEP = 9;
  const MIN_GAP = 90;
  const MAX_GAP = 340;
  const ROW_WRAP = 5;
  const MARGIN = 50;
  const ROW_HEIGHT = 130;

  let coords = [];
  let x = MARGIN, y = MARGIN, row = 0, dir = 1;
  points.forEach((p, i) => {
    if (i === 0) {
      coords.push({ x, y });
    } else {
      const gap = Math.min(MAX_GAP, Math.max(MIN_GAP, p.steps * PX_PER_STEP));
      const posInRow = i % ROW_WRAP;
      if (posInRow === 0) {
        row++;
        y = MARGIN + row * ROW_HEIGHT;
        dir *= -1;
        coords.push({ x, y });
      } else {
        x += dir * gap;
        coords.push({ x, y });
      }
    }
  });

  const xs = coords.map(c => c.x), ys = coords.map(c => c.y);
  const width = Math.max(...xs) + MARGIN + 40;
  const height = Math.max(...ys) + MARGIN + 40;

  let svgParts = [];
  for (let i = 1; i < points.length; i++) {
    const a = coords[i - 1], b = coords[i];
    const midx = (a.x + b.x) / 2, midy = (a.y + b.y) / 2;
    svgParts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--line)" stroke-width="2" stroke-dasharray="6 5" />`);
    svgParts.push(`<rect x="${midx - 22}" y="${midy - 11}" width="44" height="20" rx="5" fill="var(--ink)" stroke="var(--grid)"/>`);
    svgParts.push(`<text x="${midx}" y="${midy + 4}" font-size="11" fill="var(--good)" text-anchor="middle">${points[i].steps}</text>`);
  }
  points.forEach((p, i) => {
    const c = coords[i];
    const t = TYPES[p.type] || TYPES.other;
    const badge = t.badge; // null for plain rooms -> show sequence number instead
    svgParts.push(`<circle cx="${c.x}" cy="${c.y}" r="20" fill="${t.color}" stroke="var(--line)" stroke-width="2"/>`);
    svgParts.push(`<text x="${c.x}" y="${c.y + 4}" font-size="${badge ? 9 : 11}" fill="var(--paper)" text-anchor="middle" font-weight="700">${badge || (i + 1)}</text>`);
    svgParts.push(`<text x="${c.x}" y="${c.y + 34}" font-size="12" fill="var(--paper)" text-anchor="middle" font-weight="700">${escapeHtml(String(p.room))}</text>`);
  });

  const usedTypes = [...new Set(points.map(p => p.type || 'room'))];
  const legend = usedTypes.map(key => {
    const t = TYPES[key] || TYPES.other;
    return `<span class="legenditem"><span class="dot" style="background:${t.color}"></span>${t.label}</span>`;
  }).join('');

  el.innerHTML = `
    <div class="mapcard">
      <div class="maptitle">
        <h2>Floor ${currentFloor} — Path Map</h2>
        <span>${points.length} points · ${points.reduce((s, p) => s + p.steps, 0)} total steps</span>
      </div>
      <div class="legend">${legend}</div>
      <div style="overflow-x:auto; padding:10px;">
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="min-width:${width}px;">
          ${svgParts.join('')}
        </svg>
      </div>
    </div>
  `;
}

// ---------- RENDER / REFRESH ----------
async function refresh() {
  await Promise.all([loadFloorCounts(), loadPoints(currentFloor)]);
  render();
}

function render() {
  renderFloorTabs();
  if (currentMode === 'record') {
    $('#recordView').style.display = 'block';
    $('#mapView').style.display = 'none';
    renderRecordView();
  } else {
    $('#recordView').style.display = 'none';
    $('#mapView').style.display = 'block';
    renderMapView();
  }
}

$('#tabRecord').onclick = () => { currentMode = 'record'; $('#tabRecord').classList.add('active'); $('#tabMap').classList.remove('active'); render(); };
$('#tabMap').onclick = () => { currentMode = 'map'; $('#tabMap').classList.add('active'); $('#tabRecord').classList.remove('active'); render(); };

refresh().catch(e => toast(e.message || 'Failed to load data'));
