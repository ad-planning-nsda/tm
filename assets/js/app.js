// ==== SERVER CALL HELPER (calls the Apps Script Web App via fetch) ====
function runServer(actionName, payload) {
  return Api.call(actionName, payload);
}

let officer = Session.get();
let allTasksPublic = [];
let allTasksDash = [];
let SITE = { officeName: 'NSDA', sectionName: 'Task Tracker', statuses: [] };

function statusClass(status) { return 'status-' + status.replace(/\s+/g, ''); }
function priorityClass(priority) { return 'priority-' + String(priority || '').replace(/\s+/g, ''); }

function statusIcon(status) {
  const map = {
    'Pending': 'bi-hourglass-split',
    'Put Up Complete': 'bi-folder-check',
    'Completed': 'bi-check-circle-fill',
    'Awaiting Approval': 'bi-clock-history'
  };
  return map[status] || 'bi-question-circle';
}

function priorityIcon(priority) {
  const map = {
    'Emergency': 'bi-exclamation-octagon-fill',
    'High': 'bi-arrow-up-circle-fill',
    'Medium': 'bi-dash-circle-fill',
    'Low': 'bi-arrow-down-circle-fill'
  };
  return map[priority] || 'bi-flag';
}
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}
function extractDriveFileId(url) {
  if (!url) return null;
  const m = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// ==== VIEW SWITCHING ====================================================

function showView(name) {
  document.getElementById('viewPublic').classList.toggle('d-none', name !== 'public');
  document.getElementById('viewLogin').classList.toggle('d-none', name !== 'login');
  document.getElementById('viewDashboard').classList.toggle('d-none', name !== 'dashboard');

  if (name === 'public') {
    document.getElementById('heroTitle').textContent = SITE.officeName;
    document.getElementById('heroSubtitle').textContent = 'Public view of task status — read only';
    loadPublicTasks();
  } else if (name === 'login') {
    document.getElementById('heroTitle').textContent = 'Officer Login';
    document.getElementById('heroSubtitle').textContent = 'Sign in to manage tasks';
  } else if (name === 'dashboard') {
    if (!officer) { showView('login'); return; }
    document.getElementById('heroTitle').textContent = 'Welcome, ' + officer.name;
    document.getElementById('heroSubtitle').textContent = officer.designation;
    loadDashTasks();
  }
  window.location.hash = name;
}

function refreshNav() {
  const loggedIn = !!officer;
  document.getElementById('navLoginItem').classList.toggle('d-none', loggedIn);
  document.getElementById('navDashboardItem').classList.toggle('d-none', !loggedIn);
  document.getElementById('navLogoutItem').classList.toggle('d-none', !loggedIn);

  if (loggedIn) {
    document.getElementById('accName').textContent = officer.name;
    document.getElementById('accDesignation').textContent = officer.designation;
    document.getElementById('accEmail').textContent = officer.email;
    document.getElementById('adminTabItem').classList.toggle('d-none', officer.role !== 'SuperAdmin');
    if (officer.role === 'SuperAdmin') loadOfficers();
  }
}

// Generic show/hide toggle for every password field on the page
document.querySelectorAll('.toggle-pw-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const icon = btn.querySelector('i');
    if (input.type === 'password') {
      input.type = 'text';
      icon.className = 'bi bi-eye-slash';
    } else {
      input.type = 'password';
      icon.className = 'bi bi-eye';
    }
  });
});

// ==== DOCUMENT PREVIEW MODAL ====
const docModal = new bootstrap.Modal(document.getElementById('docModal'));
function openDocModal(url) {
  const frame = document.getElementById('docModalFrame');
  const loading = document.getElementById('docModalLoading');
  const openNewTab = document.getElementById('docModalOpenNewTab');
  openNewTab.href = url;
  frame.classList.add('d-none');
  loading.classList.remove('d-none');
  frame.src = '';
  docModal.show();

  const fileId = extractDriveFileId(url);
  const previewUrl = fileId ? `https://drive.google.com/file/d/${fileId}/preview` : url;
  frame.onload = () => { loading.classList.add('d-none'); frame.classList.remove('d-none'); };
  frame.src = previewUrl;
}
document.getElementById('docModal').addEventListener('hidden.bs.modal', () => {
  document.getElementById('docModalFrame').src = '';
});

document.getElementById('brandLink').addEventListener('click', () => showView('public'));
document.getElementById('navPublic').addEventListener('click', () => showView('public'));
document.getElementById('navLogin').addEventListener('click', () => showView('login'));
document.getElementById('navDashboard').addEventListener('click', () => showView('dashboard'));
document.getElementById('navLogout').addEventListener('click', () => {
  Session.clear();
  officer = null;
  refreshNav();
  showView('public');
});

// ==== INIT ====================================================

(async function init() {
  try {
    const siteRes = await runServer('getSiteInfo');
    if (siteRes.ok) SITE = siteRes.site;
    document.getElementById('sectionNameNav').textContent = SITE.sectionName;
    document.getElementById('footerText').textContent = `© ${new Date().getFullYear()} ${SITE.officeName} — ${SITE.sectionName}`;
  } catch (e) { /* non-fatal */ }

  refreshNav();
  const hash = window.location.hash.replace('#', '');
  if (hash === 'dashboard' && officer) showView('dashboard');
  else if (hash === 'login') showView('login');
  else showView('public');
})();

// ==== PUBLIC TASK LIST ====================================================

function renderPublicTasks() {
  const search = document.getElementById('searchInput').value.trim().toLowerCase();
  const status = document.getElementById('statusFilter').value;
  const sort = document.getElementById('sortSelect').value;

  let list = allTasksPublic.filter(t => {
    const matchesStatus = !status || t.status === status;
    const haystack = `${t.taskName} ${t.relatedAgency} ${t.receivedFrom}`.toLowerCase();
    const matchesSearch = !search || haystack.includes(search);
    return matchesStatus && matchesSearch;
  });
  list.sort((a, b) => sort === 'sl_asc' ? a.sl - b.sl : b.sl - a.sl);

  const tbody = document.getElementById('taskTableBodyPublic');
  tbody.innerHTML = '';
  document.getElementById('taskCountPublic').textContent = `(${list.length} of ${allTasksPublic.length})`;
  document.getElementById('emptyStatePublic').classList.toggle('d-none', list.length !== 0);

  list.forEach(t => {
    const docLink = t.documentUrl
      ? `<button type="button" class="btn btn-sm btn-link p-0 view-doc-btn" data-url="${escapeHtml(t.documentUrl)}"><i class="bi bi-paperclip"></i> View</button>`
      : '<span class="text-muted">—</span>';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="SL">${escapeHtml(t.sl)}</td>
      <td data-label="Task Name">${escapeHtml(t.taskName)}</td>
      <td data-label="Received At">${formatDate(t.receivedAt)}</td>
      <td data-label="Received From">${escapeHtml(t.receivedFrom)}</td>
      <td data-label="Related Agency">${escapeHtml(t.relatedAgency)}</td>
      <td data-label="Document">${docLink}</td>
      <td data-label="Priority"><span class="badge-status ${priorityClass(t.priority)}"><i class="bi ${priorityIcon(t.priority)}"></i> ${escapeHtml(t.priority)}</span></td>
      <td data-label="Status"><span class="badge-status ${statusClass(t.status)}"><i class="bi ${statusIcon(t.status)}"></i> ${escapeHtml(t.status)}</span></td>
      <td data-label="Remarks">${escapeHtml(t.remarks)}</td>
      <td data-label="Instruction">${escapeHtml(t.instruction)}</td>
      <td data-label="Updated By">${escapeHtml(t.statusUpdatedBy)}</td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.view-doc-btn').forEach(btn => {
    btn.addEventListener('click', () => openDocModal(btn.dataset.url));
  });
}

async function loadPublicTasks() {
  document.getElementById('loadingBoxPublic').classList.remove('d-none');
  document.getElementById('taskCardPublic').classList.add('d-none');
  document.getElementById('errorBoxPublic').classList.add('d-none');
  try {
    const res = await runServer('apiListTasks');
    if (!res.ok) throw new Error(res.error || 'Failed to load tasks.');
    allTasksPublic = res.tasks || [];
    renderPublicTasks();
    document.getElementById('taskCardPublic').classList.remove('d-none');
  } catch (err) {
    document.getElementById('errorBoxPublic').textContent = 'Could not load tasks: ' + err.message;
    document.getElementById('errorBoxPublic').classList.remove('d-none');
  } finally {
    document.getElementById('loadingBoxPublic').classList.add('d-none');
  }
}
document.getElementById('searchInput').addEventListener('input', renderPublicTasks);
document.getElementById('statusFilter').addEventListener('change', renderPublicTasks);
document.getElementById('sortSelect').addEventListener('change', renderPublicTasks);
document.getElementById('refreshPublicBtn').addEventListener('click', loadPublicTasks);

// ==== LOGIN ====================================================

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errBox = document.getElementById('loginError');
  errBox.classList.add('d-none');

  document.getElementById('loginBtn').disabled = true;
  document.getElementById('loginSpinner').classList.remove('d-none');

  try {
    const res = await runServer('apiLogin', { email, password });
    if (!res.ok) throw new Error(res.error || 'Login failed.');
    officer = { ...res.officer, _pw: password };
    Session.save(officer, password);
    refreshNav();
    showView('dashboard');
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('d-none');
  } finally {
    document.getElementById('loginBtn').disabled = false;
    document.getElementById('loginSpinner').classList.add('d-none');
  }
});

// ==== DASHBOARD: TASK LIST ====================================================

function renderDashTasks() {
  const search = document.getElementById('dashSearchInput').value.trim().toLowerCase();
  const status = document.getElementById('dashStatusFilter').value;

  let list = allTasksDash.filter(t => {
    const matchesStatus = !status || t.status === status;
    const haystack = `${t.taskName} ${t.relatedAgency} ${t.receivedFrom}`.toLowerCase();
    const matchesSearch = !search || haystack.includes(search);
    return matchesStatus && matchesSearch;
  });
  list.sort((a, b) => b.sl - a.sl);

  const tbody = document.getElementById('taskTableBodyDash');
  tbody.innerHTML = '';
  document.getElementById('emptyStateDash').classList.toggle('d-none', list.length !== 0);

  list.forEach(t => {
    const docLink = t.documentUrl
      ? `<button type="button" class="btn btn-sm btn-link p-0 view-doc-btn" data-url="${escapeHtml(t.documentUrl)}"><i class="bi bi-paperclip"></i> View</button>`
      : '<span class="text-muted">—</span>';

    // Only the officer who originally added the task may edit or delete it.
    // Tasks added before this feature existed have no recorded creator email, so they
    // remain view-only for everyone until manually backfilled in the sheet.
    const isOwner = t.createdByEmail && officer && t.createdByEmail.toLowerCase() === officer.email.toLowerCase();
    const actionHtml = isOwner
      ? `<div class="d-flex gap-1 flex-wrap">
           <button class="btn btn-sm btn-outline-nsda edit-task-btn" data-sl="${t.sl}"><i class="bi bi-pencil-square"></i> Edit</button>
           <button class="btn btn-sm btn-outline-danger delete-task-btn" data-sl="${t.sl}" data-name="${escapeHtml(t.taskName)}">Delete</button>
         </div>`
      : `<span class="text-muted small"><i class="bi bi-eye"></i> View only</span>`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="SL">${escapeHtml(t.sl)}</td>
      <td data-label="Task Name">${escapeHtml(t.taskName)}</td>
      <td data-label="Received At">${formatDate(t.receivedAt)}</td>
      <td data-label="From">${escapeHtml(t.receivedFrom)}</td>
      <td data-label="Agency">${escapeHtml(t.relatedAgency)}</td>
      <td data-label="Document">${docLink}</td>
      <td data-label="Priority"><span class="badge-status ${priorityClass(t.priority)}"><i class="bi ${priorityIcon(t.priority)}"></i> ${escapeHtml(t.priority)}</span></td>
      <td data-label="Status"><span class="badge-status ${statusClass(t.status)}"><i class="bi ${statusIcon(t.status)}"></i> ${escapeHtml(t.status)}</span></td>
      <td data-label="Remarks">${escapeHtml(t.remarks)}</td>
      <td data-label="Instruction">${escapeHtml(t.instruction)}</td>
      <td data-label="Updated By">${escapeHtml(t.statusUpdatedBy)}</td>
      <td data-label="Action">${actionHtml}</td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.view-doc-btn').forEach(btn => {
    btn.addEventListener('click', () => openDocModal(btn.dataset.url));
  });
  tbody.querySelectorAll('.edit-task-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const task = allTasksDash.find(t => String(t.sl) === String(btn.dataset.sl));
      if (task) openEditModal(task);
    });
  });
  tbody.querySelectorAll('.delete-task-btn').forEach(btn => {
    btn.addEventListener('click', () => openDeleteModal(btn.dataset));
  });
}

async function loadDashTasks() {
  document.getElementById('loadingBoxDash').classList.remove('d-none');
  document.getElementById('taskCardDash').classList.add('d-none');
  document.getElementById('errorBoxDash').classList.add('d-none');
  try {
    const res = await runServer('apiListTasks');
    if (!res.ok) throw new Error(res.error || 'Failed to load tasks.');
    allTasksDash = res.tasks || [];
    renderDashTasks();
    document.getElementById('taskCardDash').classList.remove('d-none');
  } catch (err) {
    document.getElementById('errorBoxDash').textContent = 'Could not load tasks: ' + err.message;
    document.getElementById('errorBoxDash').classList.remove('d-none');
  } finally {
    document.getElementById('loadingBoxDash').classList.add('d-none');
  }
}
document.getElementById('dashSearchInput').addEventListener('input', renderDashTasks);
document.getElementById('dashStatusFilter').addEventListener('change', renderDashTasks);
document.getElementById('refreshDashBtn').addEventListener('click', loadDashTasks);

// ==== RECEIVED FROM "OTHER" TOGGLE (shared helper for Add + Edit forms) ====

function wireReceivedFromToggle(selectId, otherId) {
  const select = document.getElementById(selectId);
  const other = document.getElementById(otherId);
  select.addEventListener('change', () => {
    other.classList.toggle('d-none', select.value !== 'Other (write)');
  });
}
wireReceivedFromToggle('receivedFrom', 'receivedFromOther');
wireReceivedFromToggle('editReceivedFrom', 'editReceivedFromOther');

function resolveReceivedFrom(selectId, otherId) {
  const select = document.getElementById(selectId);
  const other = document.getElementById(otherId);
  if (select.value === 'Other (write)') return other.value.trim();
  return select.value;
}

function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ==== EDIT TASK (creator only) ====================================================

const editModal = new bootstrap.Modal(document.getElementById('editModal'));
let editingTask = null;

function openEditModal(task) {
  editingTask = task;
  document.getElementById('editModalSl').textContent = task.sl;
  document.getElementById('editTaskName').value = task.taskName || '';
  document.getElementById('editReceivedAt').value = isoToDatetimeLocal(task.receivedAt);
  document.getElementById('editRelatedAgency').value = task.relatedAgency || '';
  document.getElementById('editPriority').value = task.priority || 'Medium';
  document.getElementById('editStatus').value = task.status || 'Pending';
  document.getElementById('editInstruction').value = task.instruction || '';
  document.getElementById('editRemarks').value = task.remarks || '';
  document.getElementById('editDocument').value = '';

  const receivedFromSelect = document.getElementById('editReceivedFrom');
  const knownOptions = ['Director (Planning and Industry Linkage)', 'Director (Skills Standard and Curriculum)', 'DD (SS)', 'DD (Pl)'];
  if (knownOptions.includes(task.receivedFrom)) {
    receivedFromSelect.value = task.receivedFrom;
    document.getElementById('editReceivedFromOther').classList.add('d-none');
  } else {
    receivedFromSelect.value = 'Other (write)';
    document.getElementById('editReceivedFromOther').value = task.receivedFrom || '';
    document.getElementById('editReceivedFromOther').classList.remove('d-none');
  }

  document.getElementById('editModalError').classList.add('d-none');
  editModal.show();
}

document.getElementById('confirmEditBtn').addEventListener('click', async () => {
  if (!editingTask) return;
  const errBox = document.getElementById('editModalError');
  errBox.classList.add('d-none');

  const receivedFrom = resolveReceivedFrom('editReceivedFrom', 'editReceivedFromOther');
  if (!receivedFrom) {
    errBox.textContent = 'Please specify who the task was received from.';
    errBox.classList.remove('d-none');
    return;
  }

  document.getElementById('confirmEditBtn').disabled = true;
  document.getElementById('confirmEditSpinner').classList.remove('d-none');

  try {
    let documentUrl = '';
    const fileInput = document.getElementById('editDocument');
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      const base64 = await fileToBase64(file);
      const uploadRes = await runServer('apiUploadFile', {
        email: officer.email, password: officer._pw,
        fileName: file.name, mimeType: file.type, fileData: base64
      });
      if (!uploadRes.ok) throw new Error(uploadRes.error || 'File upload failed.');
      documentUrl = uploadRes.url;
    }

    const res = await runServer('apiUpdateTask', {
      email: officer.email, password: officer._pw,
      sl: editingTask.sl,
      taskName: document.getElementById('editTaskName').value,
      receivedAt: document.getElementById('editReceivedAt').value,
      receivedFrom,
      relatedAgency: document.getElementById('editRelatedAgency').value,
      priority: document.getElementById('editPriority').value,
      status: document.getElementById('editStatus').value,
      instruction: document.getElementById('editInstruction').value,
      remarks: document.getElementById('editRemarks').value,
      documentUrl
    });
    if (!res.ok) throw new Error(res.error || 'Update failed.');
    editModal.hide();
    loadDashTasks();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('d-none');
  } finally {
    document.getElementById('confirmEditBtn').disabled = false;
    document.getElementById('confirmEditSpinner').classList.add('d-none');
  }
});

// ==== DELETE TASK (with confirmation modal) ====================================================

const deleteModal = new bootstrap.Modal(document.getElementById('deleteModal'));
let pendingDelete = null;

function openDeleteModal(data) {
  pendingDelete = { sl: data.sl };
  document.getElementById('deleteModalTaskName').textContent = data.name;
  document.getElementById('deleteModalSl').textContent = data.sl;
  document.getElementById('deleteModalError').classList.add('d-none');
  deleteModal.show();
}

document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
  if (!pendingDelete) return;
  const errBox = document.getElementById('deleteModalError');
  errBox.classList.add('d-none');

  document.getElementById('confirmDeleteBtn').disabled = true;
  document.getElementById('confirmDeleteSpinner').classList.remove('d-none');

  try {
    const res = await runServer('apiDeleteTask', {
      email: officer.email, password: officer._pw, sl: pendingDelete.sl
    });
    if (!res.ok) throw new Error(res.error || 'Delete failed.');
    deleteModal.hide();
    loadDashTasks();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('d-none');
  } finally {
    document.getElementById('confirmDeleteBtn').disabled = false;
    document.getElementById('confirmDeleteSpinner').classList.add('d-none');
  }
});

// ==== ADD TASK ====================================================

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

document.getElementById('addTaskForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = document.getElementById('addTaskForm');
  if (!form.checkValidity()) { form.reportValidity(); return; }

  const receivedFrom = resolveReceivedFrom('receivedFrom', 'receivedFromOther');
  if (!receivedFrom) {
    document.getElementById('receivedFromOther').classList.remove('d-none');
    document.getElementById('receivedFromOther').focus();
    return;
  }

  // Show the "are you sure" popup with a summary before actually saving.
  document.getElementById('addConfirmTaskName').textContent = document.getElementById('taskName').value;
  document.getElementById('addConfirmReceivedFrom').textContent = receivedFrom;
  document.getElementById('addConfirmPriority').textContent = document.getElementById('priority').value;
  document.getElementById('addConfirmStatus').textContent = document.getElementById('initialStatus').value;
  document.getElementById('addConfirmInstruction').textContent = document.getElementById('instruction').value || '—';
  document.getElementById('addConfirmError').classList.add('d-none');
  addConfirmModal.show();
});

const addConfirmModal = new bootstrap.Modal(document.getElementById('addConfirmModal'));

document.getElementById('confirmAddTaskBtn').addEventListener('click', async () => {
  const errBox = document.getElementById('addConfirmError');
  const formErrBox = document.getElementById('addTaskError');
  const okBox = document.getElementById('addTaskSuccess');
  errBox.classList.add('d-none');
  formErrBox.classList.add('d-none');
  okBox.classList.add('d-none');

  document.getElementById('confirmAddTaskBtn').disabled = true;
  document.getElementById('confirmAddTaskSpinner').classList.remove('d-none');

  try {
    let documentUrl = '';
    const fileInput = document.getElementById('taskDocument');
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];
      const base64 = await fileToBase64(file);
      const uploadRes = await runServer('apiUploadFile', {
        email: officer.email, password: officer._pw,
        fileName: file.name, mimeType: file.type, fileData: base64
      });
      if (!uploadRes.ok) throw new Error(uploadRes.error || 'File upload failed.');
      documentUrl = uploadRes.url;
    }

    const receivedFrom = resolveReceivedFrom('receivedFrom', 'receivedFromOther');

    const res = await runServer('apiAddTask', {
      email: officer.email, password: officer._pw,
      taskName: document.getElementById('taskName').value,
      receivedAt: document.getElementById('receivedAt').value,
      receivedFrom,
      relatedAgency: document.getElementById('relatedAgency').value,
      priority: document.getElementById('priority').value,
      status: document.getElementById('initialStatus').value,
      instruction: document.getElementById('instruction').value,
      remarks: document.getElementById('remarks').value,
      documentUrl
    });
    if (!res.ok) throw new Error(res.error || 'Failed to add task.');

    addConfirmModal.hide();
    okBox.textContent = `Task added successfully (SL #${res.sl}).`;
    okBox.classList.remove('d-none');
    document.getElementById('addTaskForm').reset();
    document.getElementById('receivedFromOther').classList.add('d-none');
    loadDashTasks();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('d-none');
  } finally {
    document.getElementById('confirmAddTaskBtn').disabled = false;
    document.getElementById('confirmAddTaskSpinner').classList.add('d-none');
  }
});

// ==== MY ACCOUNT: CHANGE PASSWORD ====================================================

document.getElementById('changePwForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = document.getElementById('pwError');
  const okBox = document.getElementById('pwSuccess');
  errBox.classList.add('d-none');
  okBox.classList.add('d-none');

  const curPassword = document.getElementById('curPassword').value;
  const newPassword = document.getElementById('newPassword').value;

  try {
    const res = await runServer('apiChangePassword', { email: officer.email, password: curPassword, newPassword });
    if (!res.ok) throw new Error(res.error || 'Failed to update password.');
    okBox.textContent = 'Password updated. Please use it next time you log in.';
    okBox.classList.remove('d-none');
    document.getElementById('changePwForm').reset();
    officer._pw = newPassword;
    Session.save(officer, newPassword);
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('d-none');
  }
});

// ==== ADMIN: OFFICER MANAGEMENT ====================================================

async function loadOfficers() {
  try {
    const res = await runServer('apiListOfficers', { email: officer.email, password: officer._pw });
    if (!res.ok) throw new Error(res.error || 'Failed to load officers.');
    const tbody = document.getElementById('officerTableBody');
    tbody.innerHTML = '';
    res.officers.forEach(o => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(o.name)}</td>
        <td>${escapeHtml(o.designation)}</td>
        <td>${escapeHtml(o.email)}</td>
        <td>${escapeHtml(o.role)}</td>
        <td><button class="btn btn-sm btn-outline-nsda reset-pw-btn" data-email="${escapeHtml(o.email)}" data-name="${escapeHtml(o.name)}">Reset</button></td>
      `;
      tbody.appendChild(tr);
    });
    document.querySelectorAll('.reset-pw-btn').forEach(btn => {
      btn.addEventListener('click', () => openResetPwModal(btn.dataset.email, btn.dataset.name));
    });
  } catch (err) {
    console.error(err);
  }
}

document.getElementById('createOfficerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = document.getElementById('createOfficerError');
  const okBox = document.getElementById('createOfficerSuccess');
  errBox.classList.add('d-none');
  okBox.classList.add('d-none');

  try {
    const res = await runServer('apiCreateOfficer', {
      email: officer.email, password: officer._pw,
      newName: document.getElementById('newName').value,
      newDesignation: document.getElementById('newDesignation').value,
      newEmail: document.getElementById('newEmail').value,
      newPassword: document.getElementById('newPasswordField').value,
      newRole: document.getElementById('newRole').value
    });
    if (!res.ok) throw new Error(res.error || 'Failed to create officer.');
    okBox.textContent = 'Officer account created successfully.';
    okBox.classList.remove('d-none');
    document.getElementById('createOfficerForm').reset();
    loadOfficers();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('d-none');
  }
});

const resetPwModal = new bootstrap.Modal(document.getElementById('resetPwModal'));
let resetPwTarget = null;

function openResetPwModal(email, name) {
  resetPwTarget = email;
  document.getElementById('resetPwTargetName').textContent = name;
  document.getElementById('resetPwNewValue').value = '';
  document.getElementById('resetPwError').classList.add('d-none');
  resetPwModal.show();
}

document.getElementById('confirmResetPwBtn').addEventListener('click', async () => {
  const newPassword = document.getElementById('resetPwNewValue').value;
  const errBox = document.getElementById('resetPwError');
  try {
    const res = await runServer('apiResetPassword', {
      email: officer.email, password: officer._pw,
      targetEmail: resetPwTarget, newPassword
    });
    if (!res.ok) throw new Error(res.error || 'Failed to reset password.');
    resetPwModal.hide();
    alert('Password reset successfully. Please share the new password with the officer securely.');
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('d-none');
  }
});
