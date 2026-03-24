// ===== Supabase 설정 =====
// TODO: 아래 두 값을 Supabase 프로젝트의 실제 값으로 교체하세요
// Settings → API 에서 확인 가능
const SUPABASE_URL = 'https://iojmmllqarihsowdrkwr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Csl8SxAS1Fm4KXHSpjR8OA_e3w8WiM-';

const { createClient } = window.supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== State =====
let currentUser = null;
let tasks = [];

// Modal state
let modalMode = 'create';
let currentColumn = 'todo';
let editingTaskId = null;
let deletingTaskId = null;

// Drag state
let draggingTaskId = null;

// ===== Init =====
async function init() {
  setTodayDate();

  // 현재 세션 확인
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    onLogin(session.user);
  }

  // 로그인/로그아웃 상태 변화 감지
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      onLogin(session.user);
    } else if (event === 'SIGNED_OUT') {
      onLogout();
    }
  });
}

function setTodayDate() {
  const el = document.getElementById('todayDate');
  const now = new Date();
  const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' };
  el.textContent = now.toLocaleDateString('ko-KR', options);
}

// ===== Auth =====
async function signInWithGoogle() {
  const btn = document.getElementById('btnGoogle');
  btn.textContent = '로그인 중...';
  btn.disabled = true;

  const { error } = await sb.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.href
    }
  });

  if (error) {
    alert('로그인 실패: ' + error.message);
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 48 48">...</svg> Google로 로그인`;
    btn.disabled = false;
  }
}

async function signOut() {
  await sb.auth.signOut();
}

function onLogin(user) {
  currentUser = user;

  // UI 전환
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  // 유저 정보 표시
  const avatar = user.user_metadata?.avatar_url || '';
  const name = user.user_metadata?.full_name || user.email;
  document.getElementById('userAvatar').src = avatar;
  document.getElementById('userName').textContent = name;

  loadTasks();
}

function onLogout() {
  currentUser = null;
  tasks = [];
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

// ===== DB: Tasks =====
async function loadTasks() {
  const { data, error } = await sb
    .from('tasks')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: true });

  if (error) { console.error('로드 실패:', error); return; }

  tasks = data.map(row => ({
    id: row.id,
    column: row.column_name,
    title: row.title,
    description: row.description || '',
    dueDate: row.due_date || '',
    priority: row.priority || 'medium',
    createdAt: row.created_at
  }));

  renderAll();
}

async function createTask(taskData) {
  const { data, error } = await sb.from('tasks').insert({
    id: taskData.id,
    user_id: currentUser.id,
    column_name: taskData.column,
    title: taskData.title,
    description: taskData.description || null,
    due_date: taskData.dueDate || null,
    priority: taskData.priority,
  }).select().single();

  if (error) { console.error('생성 실패:', error); throw error; }
  return data;
}

async function updateTask(taskId, fields) {
  const dbFields = {};
  if (fields.column !== undefined)      dbFields.column_name = fields.column;
  if (fields.title !== undefined)       dbFields.title = fields.title;
  if (fields.description !== undefined) dbFields.description = fields.description || null;
  if (fields.dueDate !== undefined)     dbFields.due_date = fields.dueDate || null;
  if (fields.priority !== undefined)    dbFields.priority = fields.priority;

  const { error } = await sb.from('tasks').update(dbFields).eq('id', taskId);
  if (error) { console.error('수정 실패:', error); throw error; }
}

async function deleteTask(taskId) {
  const { error } = await sb.from('tasks').delete().eq('id', taskId);
  if (error) { console.error('삭제 실패:', error); throw error; }
}

// ===== Render =====
function renderAll() {
  ['todo', 'inprogress', 'done'].forEach(col => renderColumn(col));
}

function renderColumn(col) {
  const list = document.getElementById(`list-${col}`);
  const count = document.getElementById(`count-${col}`);
  const colTasks = tasks.filter(t => t.column === col);

  count.textContent = colTasks.length;

  if (colTasks.length === 0) {
    list.innerHTML = `<div class="empty-state">태스크가 없습니다</div>`;
    return;
  }

  list.innerHTML = colTasks.map(t => renderCard(t)).join('');

  list.querySelectorAll('.card').forEach(cardEl => {
    cardEl.addEventListener('dragstart', e => onDragStart(e, cardEl.dataset.id));
    cardEl.addEventListener('dragend', () => onDragEnd());
  });
}

function renderCard(task) {
  const dateStr = task.dueDate ? formatDate(task.dueDate) : '';
  const isOverdue = task.dueDate && task.column !== 'done'
    && new Date(task.dueDate) < new Date(new Date().toDateString());

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

// ===== Modal =====
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
  const task = tasks.find(t => t.id === taskId);
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

async function saveTask() {
  const title = document.getElementById('inputTitle').value.trim();
  if (!title) {
    const input = document.getElementById('inputTitle');
    input.focus();
    input.style.borderColor = '#FF5C5C';
    setTimeout(() => input.style.borderColor = '', 1500);
    return;
  }

  const description = document.getElementById('inputDesc').value.trim();
  const dueDate = document.getElementById('inputDate').value;
  const priority = document.querySelector('input[name="priority"]:checked').value;

  const btn = document.getElementById('btnSave');
  btn.textContent = '저장 중...';
  btn.classList.add('loading');

  try {
    if (modalMode === 'create') {
      const newTask = {
        id: 'task-' + Date.now(),
        column: currentColumn,
        title,
        description,
        dueDate,
        priority,
      };
      await createTask(newTask);
      tasks.push({ ...newTask, createdAt: new Date().toISOString() });
    } else {
      await updateTask(editingTaskId, { title, description, dueDate, priority });
      const task = tasks.find(t => t.id === editingTaskId);
      if (task) Object.assign(task, { title, description, dueDate, priority });
    }

    renderAll();
    closeModal();
  } catch {
    alert('저장 중 오류가 발생했습니다. 다시 시도해주세요.');
  } finally {
    btn.textContent = '저장';
    btn.classList.remove('loading');
  }
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

async function confirmDelete() {
  if (!deletingTaskId) return;

  try {
    await deleteTask(deletingTaskId);
    tasks = tasks.filter(t => t.id !== deletingTaskId);
    renderAll();
    closeDeleteModal();
  } catch {
    alert('삭제 중 오류가 발생했습니다.');
  }
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

async function onDrop(e, targetColumn) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!draggingTaskId) return;

  const task = tasks.find(t => t.id === draggingTaskId);
  if (task && task.column !== targetColumn) {
    task.column = targetColumn;
    renderAll();
    try {
      await updateTask(task.id, { column: targetColumn });
    } catch {
      task.column = targetColumn === 'todo' ? 'inprogress' : 'todo'; // rollback
      renderAll();
    }
  }
}

// ===== Keyboard =====
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    closeDeleteModal();
  }
  if (e.key === 'Enter' && document.getElementById('modalOverlay').classList.contains('active')) {
    if (e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      saveTask();
    }
  }
});

// ===== Start =====
init();
