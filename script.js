const KEY = 'kanban-board-v1';
const THEME = 'kanban-theme';
const setTheme = t => { document.documentElement.dataset.theme = t; try { localStorage.setItem(THEME, t); } catch { /* storage blocked */ } };
let savedTheme; try { savedTheme = localStorage.getItem(THEME); } catch { /* storage blocked */ }
setTheme(savedTheme === 'light' ? 'light' : 'dark');
const $ = s => document.querySelector(s);
const board = $('#board');
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hue = s => [...s].reduce((a, c) => a + c.charCodeAt(0), 0) * 47 % 360;
const today = () => new Date().toLocaleDateString('en-CA');
const fmt = d => new Date(d + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const defaults = () => ({
  members: [{ id: 'm1', name: 'Ujjwal' }, { id: 'm2', name: 'Aarav' }, { id: 'm3', name: 'Riya' }],
  columns: [
    { id: 'c1', title: 'To Do', tasks: [{ id: uid(), title: 'Design the board layout', due: today(), members: ['m1'] }] },
    { id: 'c2', title: 'In Progress', tasks: [{ id: uid(), title: 'Add drag and drop', due: '', members: ['m1', 'm2'] }] },
    { id: 'c3', title: 'Done', tasks: [] }
  ]
});

const filter = { q: '', m: '' };
const PRI = { low: 'Low', med: 'Medium', high: 'High' };
let landed = null;
let state;
try { state = JSON.parse(localStorage.getItem(KEY)) || defaults(); } catch { state = defaults(); }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage blocked */ } };
const member = id => state.members.find(m => m.id === id);
const avatar = m => `<span class="av" style="--h:${hue(m.name)}" title="${esc(m.name)}">${esc(m.name[0].toUpperCase())}</span>`;

function findTask(id) {
  for (const col of state.columns) {
    const idx = col.tasks.findIndex(t => t.id === id);
    if (idx > -1) return { col, idx, task: col.tasks[idx] };
  }
}

function taskHTML(t, ci) {
  const late = t.due && t.due < today() && ci < state.columns.length - 1;
  const people = t.members.map(member).filter(Boolean).map(avatar).join('');
  const pri = PRI[t.pri] ? t.pri : 'med';
  const show = (!filter.q || (t.title + ' ' + (t.desc || '')).toLowerCase().includes(filter.q)) && (!filter.m || t.members.includes(filter.m));
  return `<article class="task${t.id === landed ? ' landed' : ''}" draggable="true" data-id="${t.id}" tabindex="0"${show ? '' : ' hidden'} aria-label="Edit task ${esc(t.title)}">
    <span class="pri p-${pri}">${PRI[pri]}</span>
    <p>${esc(t.title)}</p>
    ${t.desc ? `<p class="desc">${esc(t.desc)}</p>` : ''}
    <div class="meta">${t.due ? `<span class="due${late ? ' late' : ''}">${late ? 'Overdue ' : 'Due '}${fmt(t.due)}</span>` : '<span></span>'}<span class="avs">${people}</span></div></article>`;
}

function render() {
  board.innerHTML = state.columns.map((c, ci) => `
    <section class="col" data-id="${c.id}" aria-label="${esc(c.title)}">
      <header class="col-head">
        <span class="grip" draggable="true" title="Drag to reorder column">⋮⋮</span>
        <input class="col-title" value="${esc(c.title)}" aria-label="Column title" maxlength="24">
        <span class="count">${c.tasks.length}</span>
        <button class="icon" data-act="delcol" aria-label="Delete column ${esc(c.title)}">×</button>
      </header>
      <div class="tasks">${c.tasks.map(t => taskHTML(t, ci)).join('') || '<p class="empty">No tasks yet. Drag one here or click Add task.</p>'}</div>
      <button class="add" data-act="addtask">Add task</button>
    </section>`).join('') +
    `<form class="col newcol" id="colForm"><input name="t" placeholder="New column name" maxlength="24" required aria-label="New column name" autocomplete="off"><button class="btn ghost">Add column</button></form>`;
  const all = state.columns.flatMap(c => c.tasks);
  const done = state.columns.length ? state.columns[state.columns.length - 1].tasks.length : 0;
  const overdue = state.columns.slice(0, -1).flatMap(c => c.tasks).filter(t => t.due && t.due < today()).length;
  const pct = all.length ? Math.round(done / all.length * 100) : 0;
  $('#stats').innerHTML = [['Total', all.length], ['Open', all.length - done], ['Overdue', overdue], ['Completed', done]]
    .map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');
  $('#progFill').style.width = pct + '%';
  $('#prog').setAttribute('aria-valuenow', pct);
  $('#progTxt').textContent = `${pct}% complete, ${state.members.length} team members`;
  if (!member(filter.m)) filter.m = '';
  $('#fMember').innerHTML = '<option value="">All members</option>' + state.members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
  $('#fMember').value = filter.m;
}

/* Toast with optional undo */
let toastTimer, undoFn = null;
function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>` + (undo ? '<button type="button">Undo</button>' : '');
  undoFn = undo || null;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 5000);
}
$('#toast').addEventListener('click', e => {
  if (e.target.tagName === 'BUTTON' && undoFn) { undoFn(); undoFn = null; $('#toast').classList.remove('show'); }
});

/* Task dialog */
const taskDlg = $('#taskDlg'), taskForm = $('#taskForm');
let editingId = null;
function openTask(id, colId) {
  editingId = id || null;
  const found = id && findTask(id);
  $('#taskDlgTitle').textContent = found ? 'Edit task' : 'New task';
  $('#delTask').hidden = !found;
  const f = taskForm.elements;
  f.title.value = found ? found.task.title : '';
  f.due.value = found ? found.task.due : '';
  f.pri.value = found ? (found.task.pri || 'med') : 'med';
  f.desc.value = found ? (found.task.desc || '') : '';
  f.col.innerHTML = state.columns.map(c => `<option value="${c.id}">${esc(c.title)}</option>`).join('');
  f.col.value = found ? found.col.id : (colId || state.columns[0]?.id);
  $('#memberChecks').innerHTML = state.members.length ? state.members.map(m =>
    `<label><input type="checkbox" value="${m.id}" ${found?.task.members.includes(m.id) ? 'checked' : ''}>${esc(m.name)}</label>`).join('')
    : '<span class="muted">No members yet. Add some from Team.</span>';
  taskDlg.showModal();
  f.title.focus();
}
taskForm.addEventListener('submit', e => {
  e.preventDefault();
  const f = taskForm.elements;
  const members = [...taskForm.querySelectorAll('#memberChecks input:checked')].map(i => i.value);
  const data = { title: f.title.value.trim(), due: f.due.value, pri: f.pri.value, desc: f.desc.value.trim(), members };
  if (!data.title) return;
  const target = state.columns.find(c => c.id === f.col.value);
  if (!target) return;
  const found = editingId && findTask(editingId);
  if (found && found.col === target) Object.assign(found.task, data);
  else {
    const t = found ? found.col.tasks.splice(found.idx, 1)[0] : { id: uid() };
    Object.assign(t, data);
    target.tasks.push(t);
  }
  save(); render(); taskDlg.close();
});
$('#delTask').addEventListener('click', () => {
  const found = findTask(editingId);
  if (found) {
    const { col, idx, task } = found;
    col.tasks.splice(idx, 1);
    toast('Task deleted', () => { if (state.columns.includes(col)) { col.tasks.splice(idx, 0, task); save(); render(); } });
  }
  save(); render(); taskDlg.close();
});

/* Team dialog */
const teamDlg = $('#teamDlg');
function renderTeam() {
  $('#teamList').innerHTML = state.members.map(m =>
    `<li>${avatar(m)}<span class="n">${esc(m.name)}</span><button class="icon" data-id="${m.id}" aria-label="Remove ${esc(m.name)}">×</button></li>`).join('');
}
$('#teamBtn').onclick = () => { renderTeam(); teamDlg.showModal(); };
$('#teamList').addEventListener('click', e => {
  const id = e.target.dataset.id;
  if (!id) return;
  state.members = state.members.filter(m => m.id !== id);
  state.columns.forEach(c => c.tasks.forEach(t => { t.members = t.members.filter(x => x !== id); }));
  save(); renderTeam(); render();
});
$('#memberForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = e.target.name.value.trim();
  if (!name || state.members.some(m => m.name.toLowerCase() === name.toLowerCase())) return;
  state.members.push({ id: uid(), name });
  e.target.reset(); save(); renderTeam(); render();
});
document.addEventListener('click', e => { if (e.target.matches('[data-close]')) e.target.closest('dialog').close(); });
[taskDlg, teamDlg].forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
$('#addTaskBtn').onclick = () => openTask();

/* Board events */
board.addEventListener('click', e => {
  const col = e.target.closest('.col[data-id]');
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'addtask') return openTask(null, col.dataset.id);
  if (act === 'delcol') {
    const c = state.columns.find(x => x.id === col.dataset.id);
    if (c.tasks.length && !confirm(`Delete "${c.title}" and its ${c.tasks.length} tasks?`)) return;
    const at = state.columns.indexOf(c);
    state.columns = state.columns.filter(x => x !== c);
    save(); render();
    return toast(`Deleted "${c.title}"`, () => { state.columns.splice(Math.min(at, state.columns.length), 0, c); save(); render(); });
  }
  const task = e.target.closest('.task');
  if (task) openTask(task.dataset.id);
});
board.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.classList.contains('task')) openTask(e.target.dataset.id);
  if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target.classList.contains('task')) {
    const f = findTask(e.target.dataset.id);
    const to = state.columns[state.columns.indexOf(f.col) + (e.key === 'ArrowRight' ? 1 : -1)];
    if (!to) return;
    e.preventDefault();
    to.tasks.push(f.col.tasks.splice(f.idx, 1)[0]);
    landed = f.task.id; save(); render(); landed = null;
    board.querySelector(`.task[data-id="${f.task.id}"]`)?.focus();
  }
});
board.addEventListener('change', e => {
  if (!e.target.classList.contains('col-title')) return;
  const c = state.columns.find(x => x.id === e.target.closest('.col').dataset.id);
  c.title = e.target.value.trim() || c.title;
  save(); render();
});
board.addEventListener('submit', e => {
  e.preventDefault();
  const title = e.target.t.value.trim();
  if (!title) return;
  state.columns.push({ id: uid(), title, tasks: [] });
  save(); render();
});

/* Drag and drop: tasks move between columns, columns reorder by their grip */
let drag = null;
board.addEventListener('dragstart', e => {
  const task = e.target.closest?.('.task'), grip = e.target.closest?.('.grip');
  if (task) drag = { type: 'task', el: task };
  else if (grip) {
    const col = grip.closest('.col');
    drag = { type: 'col', el: col };
    e.dataTransfer.setDragImage(col, 20, 20);
  } else return;
  e.dataTransfer.setData('text/plain', drag.el.dataset.id);
  e.dataTransfer.effectAllowed = 'move';
  requestAnimationFrame(() => drag?.el.classList.add('dragging'));
});
board.addEventListener('dragover', e => {
  const col = drag && e.target.closest('.col[data-id]');
  if (!col) return;
  e.preventDefault();
  board.querySelectorAll('.over').forEach(x => x.classList.remove('over'));
  col.classList.add('over');
});
board.addEventListener('drop', e => {
  const col = drag && e.target.closest('.col[data-id]');
  if (!col) return;
  e.preventDefault();
  const id = drag.el.dataset.id;
  if (drag.type === 'task') landed = id;
  if (drag.type === 'task') {
    const from = findTask(id);
    const [t] = from.col.tasks.splice(from.idx, 1);
    const to = state.columns.find(c => c.id === col.dataset.id);
    const cards = [...col.querySelectorAll('.task:not(.dragging)')];
    let i = cards.findIndex(c => { if (c.hidden) return false; const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    if (i < 0) i = cards.length;
    to.tasks.splice(i, 0, t);
  } else if (col.dataset.id !== id) {
    const [moved] = state.columns.splice(state.columns.findIndex(c => c.id === id), 1);
    const ti = state.columns.findIndex(c => c.id === col.dataset.id);
    const r = col.getBoundingClientRect();
    const after = innerWidth <= 700 ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
    state.columns.splice(ti + (after ? 1 : 0), 0, moved);
  }
  save();
});
board.addEventListener('dragend', () => { drag = null; render(); landed = null; });

/* Export, import and reset */
$('#exportBtn').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  a.download = 'kanban-board.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Board exported');
};
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.members) || !Array.isArray(data.columns) || !data.columns.every(c => c && typeof c.title === 'string' && Array.isArray(c.tasks))) throw new Error('bad shape');
    data.members = data.members.filter(m => m && typeof m.name === 'string').map(m => ({ id: m.id || uid(), name: m.name }));
    data.columns = data.columns.map(c => ({ id: c.id || uid(), title: c.title, tasks: c.tasks.filter(t => t && typeof t.title === 'string').map(t => ({ id: t.id || uid(), title: t.title, due: t.due || '', pri: t.pri, desc: t.desc || '', members: Array.isArray(t.members) ? t.members : [] })) }));
    const prev = state;
    state = { members: data.members, columns: data.columns };
    save(); render();
    toast('Board imported', () => { state = prev; save(); render(); });
  } catch { toast('That file is not a valid board export.'); }
});
$('#resetBtn').onclick = () => {
  if (!confirm('Reset the board to the demo data? This replaces all your tasks.')) return;
  const prev = state;
  state = defaults();
  save(); render();
  toast('Board reset', () => { state = prev; save(); render(); });
};

/* Search, filter and theme */
$('#q').addEventListener('input', e => { filter.q = e.target.value.trim().toLowerCase(); render(); });
$('#fMember').addEventListener('change', e => { filter.m = e.target.value; render(); });
$('#themeBtn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

render();
