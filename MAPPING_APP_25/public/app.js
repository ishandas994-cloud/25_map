const NUM_FLOORS = 4;
const BLOCKS = ['A', 'B', 'C'];

let currentFloor = 1;
let currentBlock = 'A';
let currentMode = 'record';
let floorCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
let blockCounts = { A: 0, B: 0, C: 0 };
let currentPoints = [];

// Room/point types: label, color (map fill), short badge text.
const TYPES = {
  classroom:    { label: 'Classroom',       color: '#2F6690', badge: 'CR' },
  toilet_girls: { label: 'Toilet (Girls)',  color: '#D6336C', badge: 'GIRLS' },
  toilet_boys:  { label: 'Toilet (Boys)',   color: '#1971C2', badge: 'BOYS' },
  faculty:      { label: 'Faculty Room',    color: '#9C6ADE', badge: 'FAC' },
  library:      { label: 'Library',         color: '#0CA678', badge: 'LIB' },
  lab:          { label: 'Lab',             color: '#F59F00', badge: 'LAB' },
  lift:         { label: 'Lift',            color: '#FF6B35', badge: 'LIFT' },
  stairwell:    { label: 'Stairwell',       color: '#4FD1A5', badge: 'STAIR' },
  entrance:     { label: 'Entrance',        color: '#E5484D', badge: 'ENT' },
  other:        { label: 'Other / Corridor',color: '#6B4FD1', badge: '?' },
};

// Direction relative to a fixed floor-plan orientation (not travel heading):
// Front = up on the map, Back = down, Left = left, Right = right.
const DIRECTIONS = {
  front: { label: 'Front (↑)', dx: 0, dy: -1, arrow: '↑' },
  back:  { label: 'Back (↓)',  dx: 0, dy: 1,  arrow: '↓' },
  left:  { label: 'Left (←)',  dx: -1, dy: 0, arrow: '←' },
  right: { label: 'Right (→)', dx: 1, dy: 0,  arrow: '→' },
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

async function loadBlockCounts(floor) {
  blockCounts = await api(`/api/floors/${floor}/blocks`);
}

async function loadPoints(floor, block) {
  currentPoints = await api(`/api/floors/${floor}/blocks/${block}/points`);
}

async function addPoint(floor, block, room, type, direction, steps) {
  try {
    await api(`/api/floors/${floor}/blocks/${block}/points`, {
      method: 'POST',
      body: JSON.stringify({ room, type, direction, steps }),
    });
    toast('Saved: ' + room);
    await refresh();
  } catch (e) {
    toast(e.message || 'Save failed');
  }
}

async function deletePoint(floor, block, id) {
  try {
    await api(`/api/floors/${floor}/blocks/${block}/points/${id}`, { method: 'DELETE' });
    await refresh();
  } catch (e) {
    toast(e.message || 'Delete failed');
  }
}

async function resetBlock(floor, block) {
  if (!confirm(`Clear all points on Floor ${floor}, Block ${block}? This cannot be undone.`)) return;
  try {
    await api(`/api/floors/${floor}/blocks/${block}`, { method: 'DELETE' });
    await refresh();
  } catch (e) {
    toast(e.message || 'Clear failed');
  }
}

async function eraseFloor(floor) {
  const confirmed = confirm(
    `Erase ALL data on Floor ${floor} — Blocks A, B, and C? This cannot be undone.`
  );
  if (!confirmed) return;
  try {
    const result = await api(`/api/floors/${floor}`, { method: 'DELETE' });
    toast(`Erased Floor ${floor} (${result.deletedCount} points removed)`);
    await refresh();
  } catch (e) {
    toast(e.message || 'Erase failed');
  }
}

// ---------- FLOOR + BLOCK TABS ----------
function renderFloorTabs() {
  const el = $('#floorTabs');
  el.innerHTML = '';
  for (let f = 1; f <= NUM_FLOORS; f++) {
    const b = document.createElement('button');
    b.className = f === currentFloor ? 'active' : '';
    b.innerHTML = '<span class="n">F' + f + '</span>' + (floorCounts[f] || 0) + ' pts';
    b.onclick = () => { currentFloor = f; currentBlock = 'A'; refresh(); };
    el.appendChild(b);
  }
}

function renderBlockTabs() {
  const el = $('#blockTabs');
  el.innerHTML = '';
  BLOCKS.forEach((blk) => {
    const b = document.createElement('button');
    b.className = blk === currentBlock ? 'active' : '';
    b.innerHTML = '<span class="n">Block ' + blk + '</span>' + (blockCounts[blk] || 0) + ' pts';
    b.onclick = () => { currentBlock = blk; refresh(); };
    el.appendChild(b);
  });
}

function renderEraseFloorButton() {
  const el = $('#eraseFloorRow');
  const total = floorCounts[currentFloor] || 0;
  el.innerHTML = `<button class="btn danger" id="eraseFloorBtn" ${total === 0 ? 'disabled' : ''}>🗑 Erase Entire Floor ${currentFloor} (${total} pts, all blocks)</button>`;
  const btn = $('#eraseFloorBtn');
  if (btn) btn.onclick = () => eraseFloor(currentFloor);
}

// ---------- RECORD VIEW ----------
function renderRecordView() {
  const el = $('#recordView');
  const points = currentPoints;
  const isFirstOnBlock = points.length === 0;
  const lastRoom = points.length ? points[points.length - 1].room : null;

  const typeOptions = Object.entries(TYPES)
    .map(([key, t]) => `<option value="${key}">${t.label}</option>`)
    .join('');
  const dirOptions = Object.entries(DIRECTIONS)
    .map(([key, d]) => `<option value="${key}">${d.label}</option>`)
    .join('');

  el.innerHTML = `
    <div class="card">
      <h2>Add Point — Floor ${currentFloor}, Block ${currentBlock}</h2>
      <div class="row2">
        <div>
          <label>Room / Label</label>
          <input type="text" id="roomInput" placeholder="e.g. 104" autocomplete="off">
        </div>
        <div>
          <label>Type</label>
          <select id="typeSelect">${typeOptions}</select>
        </div>
      </div>

      ${isFirstOnBlock
        ? `<div class="hint">This is the first point in Block ${currentBlock} — it's the starting reference point, so no direction/steps needed yet.</div>`
        : `
          <div class="row2">
            <div>
              <label>Direction from ${escapeHtml(lastRoom)}</label>
              <select id="dirSelect">${dirOptions}</select>
            </div>
            <div>
              <label>Steps from ${escapeHtml(lastRoom)}</label>
              <input type="number" id="stepsInput" placeholder="e.g. 8" min="0">
            </div>
          </div>
          <div class="hint">Stand at the last point, walk toward this room, and note: which way did you turn (Front/Back/Left/Right relative to the floor plan) and how many steps did it take?</div>
        `
      }
      <button class="btn" id="saveBtn">＋ Save Point</button>
    </div>

    <div class="card">
      <h2>Floor ${currentFloor} · Block ${currentBlock} Log — ${points.length} point${points.length === 1 ? '' : 's'}</h2>
      ${points.length === 0
        ? '<div class="empty">No points logged yet in this block.</div>'
        : `<ul class="log">${points.map((p, i) => `
            <li>
              <span class="idx">${i + 1}</span>
              <span class="typebadge" style="background:${(TYPES[p.type] || TYPES.other).color}">${(TYPES[p.type] || TYPES.other).badge}</span>
              <span class="room">${escapeHtml(p.room)}</span>
              <span class="steps">${i === 0 ? 'start' : `${DIRECTIONS[p.direction]?.arrow || ''} ${p.steps} steps`}</span>
              <button class="del" data-id="${p.id}" title="delete">✕</button>
            </li>`).join('')}</ul>`
      }
      ${points.length > 0 ? `<button class="btn ghost" id="resetBtn" style="margin-top:12px;">Clear Block ${currentBlock}</button>` : ''}
    </div>
  `;

  $('#saveBtn').onclick = () => {
    const room = $('#roomInput').value.trim();
    const type = $('#typeSelect').value;
    if (!room) { toast('Enter a room number first'); return; }

    if (isFirstOnBlock) {
      addPoint(currentFloor, currentBlock, room, type, null, 0);
      return;
    }

    const direction = $('#dirSelect').value;
    const stepsRaw = $('#stepsInput').value.trim();
    if (stepsRaw === '') { toast('Enter step count'); return; }
    const steps = parseInt(stepsRaw, 10) || 0;
    addPoint(currentFloor, currentBlock, room, type, direction, steps);
  };

  el.querySelectorAll('.del').forEach(btn => {
    btn.onclick = () => deletePoint(currentFloor, currentBlock, btn.dataset.id);
  });
  const resetBtn = $('#resetBtn');
  if (resetBtn) resetBtn.onclick = () => resetBlock(currentFloor, currentBlock);
}

// ---------- MAP VIEW ----------
function renderMapView() {
  const el = $('#mapView');
  const points = currentPoints;

  if (points.length === 0) {
    el.innerHTML = `<div class="card"><div class="empty">Nothing to map yet in Block ${currentBlock}. Log some points in Record mode first.</div></div>`;
    return;
  }

  const PX_PER_STEP = 11;
  const MIN_GAP = 55;
  const MAX_GAP = 300;

  // Walk the direction + step vectors to build real x/y grid coordinates,
  // so the map reflects actual rows/columns instead of a straight line.
  let coords = [{ x: 0, y: 0 }];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const dir = DIRECTIONS[p.direction] || DIRECTIONS.back;
    const dist = Math.min(MAX_GAP, Math.max(MIN_GAP, p.steps * PX_PER_STEP));
    const prev = coords[i - 1];
    coords.push({ x: prev.x + dir.dx * dist, y: prev.y + dir.dy * dist });
  }

  const xs = coords.map(c => c.x), ys = coords.map(c => c.y);
  const MARGIN = 60;
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const shifted = coords.map(c => ({ x: c.x - minX + MARGIN, y: c.y - minY + MARGIN }));
  const width = Math.max(...xs) - minX + MARGIN * 2;
  const height = Math.max(...ys) - minY + MARGIN * 2;

  let svgParts = [];
  for (let i = 1; i < points.length; i++) {
    const a = shifted[i - 1], b = shifted[i];
    const midx = (a.x + b.x) / 2, midy = (a.y + b.y) / 2;
    const dir = DIRECTIONS[points[i].direction];
    svgParts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="var(--line)" stroke-width="2" stroke-dasharray="6 5" />`);
    svgParts.push(`<rect x="${midx - 24}" y="${midy - 11}" width="48" height="20" rx="5" fill="var(--ink)" stroke="var(--grid)"/>`);
    svgParts.push(`<text x="${midx}" y="${midy + 4}" font-size="11" fill="var(--good)" text-anchor="middle">${dir ? dir.arrow : ''} ${points[i].steps}</text>`);
  }
  points.forEach((p, i) => {
    const c = shifted[i];
    const t = TYPES[p.type] || TYPES.other;
    svgParts.push(`<circle cx="${c.x}" cy="${c.y}" r="20" fill="${t.color}" stroke="var(--line)" stroke-width="2"/>`);
    svgParts.push(`<text x="${c.x}" y="${c.y + 4}" font-size="9" fill="var(--paper)" text-anchor="middle" font-weight="700">${t.badge}</text>`);
    svgParts.push(`<text x="${c.x}" y="${c.y + 34}" font-size="12" fill="var(--paper)" text-anchor="middle" font-weight="700">${escapeHtml(String(p.room))}</text>`);
  });

  const usedTypes = [...new Set(points.map(p => p.type || 'other'))];
  const legend = usedTypes.map(key => {
    const t = TYPES[key] || TYPES.other;
    return `<span class="legenditem"><span class="dot" style="background:${t.color}"></span>${t.label}</span>`;
  }).join('');

  el.innerHTML = `
    <div class="mapcard">
      <div class="maptitle">
        <h2>Floor ${currentFloor} · Block ${currentBlock} — Grid Map</h2>
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
  await loadFloorCounts();
  await loadBlockCounts(currentFloor);
  await loadPoints(currentFloor, currentBlock);
  render();
}

function render() {
  renderFloorTabs();
  renderBlockTabs();
  renderEraseFloorButton();
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
