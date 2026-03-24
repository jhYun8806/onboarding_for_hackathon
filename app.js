// ===== State =====
const STORAGE_KEY = 'daily-todolist';

let state = {
  tasks: []
};

// Modal state
let modalMode = 'create'; // 'create' | 'edit'
let currentColumn = 'todo';
let editingTaskId = null;
let deletingTaskId = null;

// Drag state
let draggingTaskId = null;

// ===== Init =====
function init() {
  loadFromStorage();
  renderAll();
  setTodayDate();
}

function setTodayDate() {
  const el = document.getElementById('todayDate');
  const now = new Date();
  const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
  el.textContent = now.toLocaleDateString('ko-KR', options);
}

// ===== Storage =====
function loadFromStorage() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { state = JSON.parse(saved); }
    catch { state = { tasks: [] }; }
  }
}

function saveToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ===== Render =====
function renderAll() {
  ['todo', 'inprogress', 'done'].forEach(col => renderColumn(col));
}

function renderColumn(col) {
  const list = document.getElementById(`list-${col}`);
  const count = document.getElementById(`count-${col}`);
  const tasks = state.tasks.filter(t => t.column === col);

  count.textContent = tasks.length;

  if (tasks.length === 0) {
    list.innerHTML = `<div class="empty-state">태스크가 없습니다</div>`;
    return;
  }

  list.innerHTML = tasks.map(t => renderCard(t)).join('');

  // Attach drag events
  list.querySelectorAll('.card').forEach(cardEl => {
    cardEl.addEventListener('dragstart', e => onDragStart(e, cardEl.dataset.id));
    cardEl.addEventListener('dragend', () => onDragEnd());
  });
}

function renderCard(task) {
  const dateStr = task.dueDate ? formatDate(task.dueDate) : '';
  const isOverdue = task.dueDate && task.column !== 'done' && new Date(task.dueDate) < new Date(new Date().toDateString());

  return `
    <div class="card priority-${task.priority}" draggable="true" data-id="${task.id}">
      <div class="card-top">
        <span class="card-title" onclick="openEditModal('${task.id}')">${escapeHtml(task.title)}</span>
        <div class="card-actions">
          <button class="action-btn" onclick="openEditModal('${task.id}')" title="수정">✏️</button>
          <button class="action-btn delete" onclick="openDeleteModal('${task.id}')" title="삭제">🗑️</button>
        </div>
      </div>
      ${task.description ? `<div class="card-desc">${escapeHtml(task.description)}</div>` : ''}
      <div class="card-footer">
        <span class="card-date ${isOverdue ? 'overdue' : ''}">
          ${dateStr ? `📅 ${dateStr}${isOverdue ? ' (기한 초과)' : ''}` : ''}
        </span>
        <span class="priority-badge ${task.priority}">${priorityLabel(task.priority)}</span>
      </div>
    </div>
  `;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
}

function priorityLabel(p) {
  return { high: '높음', medium: '보통', low: '낮음' }[p] || '보통';
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===== Modal (Create / Edit) =====
function openModal(column) {
  modalMode = 'create';
  currentColumn = column;
  editingTaskId = null;

  document.getElementById('modalTitle').textContent = '태스크 추가';
  document.getElementById('inputTitle').value = '';
  document.getElementById('inputDesc').value = '';
  document.getElementById('inputDate').value = '';
  document.querySelector('input[name="priority"][value="medium"]').checked = true;

  document.getElementById('modalOverlay').classList.add('active');
  setTimeout(() => document.getElementById('inputTitle').focus(), 100);
}

function openEditModal(taskId) {
  const task = state.tasks.find(t => t.id === taskId);
  if (!task) return;

  modalMode = 'edit';
  editingTaskId = taskId;
  currentColumn = task.column;

  document.getElementById('modalTitle').textContent = '태스크 수정';
  document.getElementById('inputTitle').value = task.title;
  document.getElementById('inputDesc').value = task.description || '';
  document.getElementById('inputDate').value = task.dueDate || '';
  document.querySelector(`input[name="priority"][value="${task.priority}"]`).checked = true;

  document.getElementById('modalOverlay').classList.add('active');
  setTimeout(() => document.getElementById('inputTitle').focus(), 100);
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
}

function closeModalOutside(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

function saveTask() {
  const title = document.getElementById('inputTitle').value.trim();
  if (!title) {
    document.getElementById('inputTitle').focus();
    document.getElementById('inputTitle').style.borderColor = '#FF5C5C';
    setTimeout(() => document.getElementById('inputTitle').style.borderColor = '', 1500);
    return;
  }

  const description = document.getElementById('inputDesc').value.trim();
  const dueDate = document.getElementById('inputDate').value;
  const priority = document.querySelector('input[name="priority"]:checked').value;

  if (modalMode === 'create') {
    const newTask = {
      id: 'task-' + Date.now(),
      column: currentColumn,
      title,
      description,
      dueDate,
      priority,
      createdAt: new Date().toISOString()
    };
    state.tasks.push(newTask);
  } else {
    const task = state.tasks.find(t => t.id === editingTaskId);
    if (task) {
      task.title = title;
      task.description = description;
      task.dueDate = dueDate;
      task.priority = priority;
    }
  }

  saveToStorage();
  renderAll();
  closeModal();
}

// ===== Delete Modal =====
function openDeleteModal(taskId) {
  deletingTaskId = taskId;
  document.getElementById('deleteOverlay').classList.add('active');
}

function closeDeleteModal() {
  deletingTaskId = null;
  document.getElementById('deleteOverlay').classList.remove('active');
}

function confirmDelete() {
  if (!deletingTaskId) return;
  state.tasks = state.tasks.filter(t => t.id !== deletingTaskId);
  saveToStorage();
  renderAll();
  closeDeleteModal();
}

// ===== Drag & Drop =====
function onDragStart(e, taskId) {
  draggingTaskId = taskId;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function onDragEnd() {
  document.querySelectorAll('.card').forEach(c => c.classList.remove('dragging'));
  document.querySelectorAll('.card-list').forEach(l => l.classList.remove('drag-over'));
  draggingTaskId = null;
}

function onDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
  e.dataTransfer.dropEffect = 'move';
}

function onDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    e.currentTarget.classList.remove('drag-over');
  }
}

function onDrop(e, targetColumn) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  if (!draggingTaskId) return;

  const task = state.tasks.find(t => t.id === draggingTaskId);
  if (task && task.column !== targetColumn) {
    task.column = targetColumn;
    saveToStorage();
    renderAll();
  }
}

// ===== Keyboard shortcut =====
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeDeleteModal();
  }
  if ((e.key === 'Enter') && document.getElementById('modalOverlay').classList.contains('active')) {
    if (e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      saveTask();
    }
  }
});

// ===== Start =====
init();
