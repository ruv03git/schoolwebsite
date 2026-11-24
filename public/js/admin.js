// Admin Dashboard Logic

const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || 'null');

if (!token || !user || !['admin', 'faculty', 'teacher'].includes(user.role)) {
  window.location.href = '/login';
}

// Global cached data
let studentsList = [];
let parentsList = [];
let gradesList = [];

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('userName').textContent = user.full_name || user.username;
  const roleBadge = document.getElementById('userRoleBadge');
  if (roleBadge) {
    roleBadge.textContent = user.role === 'admin' ? 'Admin' : 'Faculty';
    roleBadge.className = user.role === 'admin' ? 'badge badge-admin' : 'badge badge-student';
  }
  
  // Set default attendance date to today
  const today = new Date().toISOString().split('T')[0];
  const dateInput = document.getElementById('attendanceDate');
  if (dateInput) dateInput.value = today;
  const aDateInput = document.getElementById('aDate');
  if (aDateInput) aDateInput.value = today;

  loadOverviewStats();
  loadStudents();
  loadParents();
  loadAnnouncements();
  loadEvents();
  loadGrades();
  loadAttendance();
});

// Navigation
function showSection(sectionId, el) {
  document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

  const target = document.getElementById(`section-${sectionId}`);
  if (target) target.classList.add('active');
  if (el) el.classList.add('active');

  const titles = {
    overview: 'Dashboard Overview',
    students: 'Student Management',
    parents: 'Parent Management',
    grades: 'Grade Management',
    attendance: 'Attendance Management',
    announcements: 'School Announcements',
    events: 'Events & Calendar'
  };
  const titleEl = document.getElementById('pageTitle');
  if (titleEl && titles[sectionId]) titleEl.textContent = titles[sectionId];

  // Close sidebar on mobile
  const sidebar = document.getElementById('sidebar');
  if (sidebar && window.innerWidth <= 768) {
    sidebar.classList.remove('open');
  }
}

// Modal handling
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add('active');
  }
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.remove('active');
    const form = modal.querySelector('form');
    if (form) form.reset();
  }
}

// API Helper
async function apiFetch(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {})
  };

  try {
    const res = await fetch(`/api/admin${endpoint}`, { ...options, headers });
    if (res.status === 401 || res.status === 403) {
      logout();
      return null;
    }
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  } catch (err) {
    alert(err.message);
    throw err;
  }
}

// Load stats & recent announcements
async function loadOverviewStats() {
  try {
    const data = await apiFetch('/stats');
    if (!data) return;

    document.getElementById('statStudents').textContent = data.totalStudents ?? 0;
    document.getElementById('statParents').textContent = data.totalParents ?? 0;
    document.getElementById('statAttendance').textContent = `${data.attendanceRate ?? 0}%`;
    document.getElementById('statEvents').textContent = data.upcomingEvents ?? 0;

    const recentEl = document.getElementById('recentAnnouncements');
    if (!data.recentAnnouncements || data.recentAnnouncements.length === 0) {
      recentEl.innerHTML = '<p class="text-muted">No announcements posted yet.</p>';
      return;
    }

    recentEl.innerHTML = data.recentAnnouncements.map(a => `
      <div class="list-item">
        <div>
          <div class="list-item-title">${escapeHtml(a.title)}</div>
          <div class="list-item-subtitle">${escapeHtml(a.content.substring(0, 90))}${a.content.length > 90 ? '...' : ''}</div>
        </div>
        <div class="list-item-meta">
          <span class="badge badge-${a.priority}">${a.priority}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

// Students Management
async function loadStudents() {
  try {
    const students = await apiFetch('/students');
    if (!students) return;
    studentsList = students;

    const tbody = document.getElementById('studentsTable');
    if (students.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No students enrolled yet.</td></tr>';
    } else {
      tbody.innerHTML = students.map(s => `
        <tr>
          <td><strong>${escapeHtml(s.full_name)}</strong></td>
          <td>${escapeHtml(s.roll_number || '-')}</td>
          <td>${escapeHtml(s.grade)}</td>
          <td>${escapeHtml(s.section || 'A')}</td>
          <td>${escapeHtml(s.parent_name || 'Unassigned')}</td>
          <td>${escapeHtml(s.email || '-')}</td>
          <td>
            <div style="display:flex; gap:0.35rem;">
              <button class="btn btn-sm btn-secondary" onclick="openEditStudentModal(${s.student_id})">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="deleteStudent(${s.student_id})">Delete</button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    // Populate student dropdowns in Grade, Attendance & Filter
    populateStudentSelects(students);
  } catch (err) {
    console.error('Error loading students:', err);
  }
}

function populateStudentSelects(students) {
  const selects = ['gStudent', 'editGStudent', 'aStudent', 'gradeFilterStudent', 'attendanceFilterStudent'];
  selects.forEach(id => {
    const select = document.getElementById(id);
    if (!select) return;
    const isFilter = id.includes('Filter');
    const firstOption = isFilter ? '<option value="">All Students</option>' : '<option value="">Select Student</option>';
    select.innerHTML = firstOption + students.map(s => `
      <option value="${s.student_id}">${escapeHtml(s.full_name)} (${s.grade}-${s.section || 'A'})</option>
    `).join('');
  });
}

async function handleAddStudent(e) {
  e.preventDefault();
  const payload = {
    full_name: document.getElementById('sFullName').value.trim(),
    username: document.getElementById('sUsername').value.trim(),
    password: document.getElementById('sPassword').value,
    email: document.getElementById('sEmail').value.trim() || null,
    grade: document.getElementById('sGrade').value,
    section: document.getElementById('sSection').value,
    roll_number: document.getElementById('sRollNumber').value.trim() || null,
    date_of_birth: document.getElementById('sDOB').value || null,
    parent_user_id: document.getElementById('sParent').value ? parseInt(document.getElementById('sParent').value) : null
  };

  try {
    await apiFetch('/students', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    closeModal('studentModal');
    loadStudents();
    loadOverviewStats();
  } catch (err) {
    console.error('Error adding student:', err);
  }
}

// Edit Student Handling
function openEditStudentModal(studentId) {
  const student = studentsList.find(s => s.student_id === studentId);
  if (!student) return;

  document.getElementById('editStudentId').value = student.student_id;
  document.getElementById('editFullName').value = student.full_name || '';
  document.getElementById('editUsername').value = student.username || '';
  document.getElementById('editEmail').value = student.email || '';
  document.getElementById('editPhone').value = student.phone || '';
  document.getElementById('editGrade').value = student.grade || 'LKG';
  document.getElementById('editSection').value = student.section || 'A';
  document.getElementById('editRollNumber').value = student.roll_number || '';
  document.getElementById('editDOB').value = student.date_of_birth || '';
  document.getElementById('editParent').value = student.parent_id || '';

  openModal('editStudentModal');
}

async function handleEditStudent(e) {
  e.preventDefault();
  const id = document.getElementById('editStudentId').value;
  const payload = {
    full_name: document.getElementById('editFullName').value.trim(),
    email: document.getElementById('editEmail').value.trim() || null,
    phone: document.getElementById('editPhone').value.trim() || null,
    grade: document.getElementById('editGrade').value,
    section: document.getElementById('editSection').value,
    roll_number: document.getElementById('editRollNumber').value.trim() || null,
    date_of_birth: document.getElementById('editDOB').value || null,
    parent_user_id: document.getElementById('editParent').value ? parseInt(document.getElementById('editParent').value) : null
  };

  try {
    await apiFetch(`/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    closeModal('editStudentModal');
    loadStudents();
    loadGrades();
    loadAttendance();
  } catch (err) {
    console.error('Error updating student:', err);
  }
}

// CSV Bulk Upload Handling (Append to existing data)
let parsedCsvStudents = [];

function downloadCsvTemplate() {
  const headers = ['full_name', 'grade', 'section', 'roll_number', 'username', 'password', 'email', 'phone', 'date_of_birth', 'parent_username'];
  const sample1 = ['Vihaan Sharma', 'LKG', 'A', 'LKG-101', 'vihaan.s', 'student123', 'vihaan@example.com', '+91 98220 11111', '2022-03-15', 'parent1'];
  const sample2 = ['Ira Joshi', 'Nursery', 'A', 'NUR-102', 'ira.j', 'student123', 'ira@example.com', '+91 98220 22222', '2023-01-20', 'parent2'];
  const sample3 = ['Kabir Patil', 'Playgroup', 'A', 'PG-103', 'kabir.p', 'student123', 'kabir@example.com', '+91 98220 33333', '2024-02-10', ''];

  const rows = [headers.join(','), sample1.join(','), sample2.join(','), sample3.join(',')];
  const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', 'fun_n_learn_students_template.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function parseCsvText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^["']|["']$/g, ''));
    if (values.length === 0 || values.every(v => v === '')) continue;

    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = values[idx] || '';
    });

    if (rowObj.full_name || rowObj.name) {
      if (!rowObj.full_name) rowObj.full_name = rowObj.name;
      rows.push(rowObj);
    }
  }
  return rows;
}

function handleCsvFileSelected(event) {
  const file = event.target.files[0];
  const statusEl = document.getElementById('csvStatus');
  const previewArea = document.getElementById('csvPreviewArea');
  const btnImport = document.getElementById('btnImportCsv');
  const table = document.getElementById('csvPreviewTable');
  const countEl = document.getElementById('csvCount');

  statusEl.style.display = 'none';
  previewArea.style.display = 'none';
  btnImport.disabled = true;
  parsedCsvStudents = [];

  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const text = e.target.result;
      const records = parseCsvText(text);

      if (records.length === 0) {
        statusEl.className = 'alert alert-error';
        statusEl.textContent = 'No valid student rows found. Please ensure the CSV contains full_name and grade headers.';
        statusEl.style.display = 'block';
        return;
      }

      parsedCsvStudents = records;
      countEl.textContent = records.length;

      table.innerHTML = records.slice(0, 15).map((r, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${escapeHtml(r.full_name)}</strong></td>
          <td>${escapeHtml(r.grade || 'LKG')}</td>
          <td>${escapeHtml(r.section || 'A')}</td>
          <td>${escapeHtml(r.roll_number || '-')}</td>
          <td>${escapeHtml(r.parent_username || '-')}</td>
        </tr>
      `).join('');

      previewArea.style.display = 'block';
      btnImport.disabled = false;
      statusEl.className = 'alert alert-success';
      statusEl.textContent = `Parsed ${records.length} student(s) successfully. Ready to append to existing list.`;
      statusEl.style.display = 'block';
    } catch (err) {
      statusEl.className = 'alert alert-error';
      statusEl.textContent = 'Error parsing CSV file: ' + err.message;
      statusEl.style.display = 'block';
    }
  };
  reader.readAsText(file);
}

async function submitCsvImport() {
  if (!parsedCsvStudents || parsedCsvStudents.length === 0) return;

  const btnImport = document.getElementById('btnImportCsv');
  const statusEl = document.getElementById('csvStatus');
  btnImport.disabled = true;
  btnImport.textContent = 'Importing...';

  try {
    const res = await apiFetch('/students/upload-csv', {
      method: 'POST',
      body: JSON.stringify({ students: parsedCsvStudents })
    });

    if (res) {
      statusEl.className = 'alert alert-success';
      let msg = res.message;
      if (res.errors && res.errors.length > 0) {
        msg += ' (' + res.errors.length + ' skipped rows)';
      }
      statusEl.textContent = msg;
      statusEl.style.display = 'block';

      loadStudents();
      loadOverviewStats();

      setTimeout(() => {
        closeModal('csvModal');
        btnImport.textContent = 'Append to Student List';
        parsedCsvStudents = [];
        const fileInput = document.getElementById('csvFileInput');
        if (fileInput) fileInput.value = '';
      }, 1400);
    }
  } catch (err) {
    statusEl.className = 'alert alert-error';
    statusEl.textContent = 'Failed to import students: ' + err.message;
    statusEl.style.display = 'block';
    btnImport.disabled = false;
    btnImport.textContent = 'Append to Student List';
  }
}

async function deleteStudent(id) {
  if (!confirm('Are you sure you want to delete this student and their records?')) return;
  try {
    await apiFetch(`/students/${id}`, { method: 'DELETE' });
    loadStudents();
    loadOverviewStats();
    loadGrades();
    loadAttendance();
  } catch (err) {
    console.error('Error deleting student:', err);
  }
}

// Parents Management
async function loadParents() {
  try {
    const parents = await apiFetch('/parents');
    if (!parents) return;
    parentsList = parents;

    const tbody = document.getElementById('parentsTable');
    if (parents.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No parents registered yet.</td></tr>';
    } else {
      tbody.innerHTML = parents.map(p => `
        <tr>
          <td><strong>${escapeHtml(p.full_name)}</strong></td>
          <td><code>${escapeHtml(p.username)}</code></td>
          <td>${escapeHtml(p.email || '-')}</td>
          <td>${escapeHtml(p.phone || '-')}</td>
          <td>${escapeHtml(p.children || 'None')}</td>
          <td>
            <button class="btn btn-sm btn-danger" onclick="deleteParent(${p.id})">Delete</button>
          </td>
        </tr>
      `).join('');
    }

    // Update parent select in add student and edit student modals
    const sParent = document.getElementById('sParent');
    const editParent = document.getElementById('editParent');
    const parentOptions = '<option value="">No Parent Linked</option>' + parents.map(p => `
      <option value="${p.id}">${escapeHtml(p.full_name)} (${escapeHtml(p.username)})</option>
    `).join('');

    if (sParent) sParent.innerHTML = parentOptions;
    if (editParent) editParent.innerHTML = parentOptions;
  } catch (err) {
    console.error('Error loading parents:', err);
  }
}

async function handleAddParent(e) {
  e.preventDefault();
  const payload = {
    full_name: document.getElementById('pFullName').value.trim(),
    username: document.getElementById('pUsername').value.trim(),
    password: document.getElementById('pPassword').value,
    email: document.getElementById('pEmail').value.trim() || null,
    phone: document.getElementById('pPhone').value.trim() || null
  };

  try {
    await apiFetch('/parents', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    closeModal('parentModal');
    loadParents();
    loadOverviewStats();
  } catch (err) {
    console.error('Error adding parent:', err);
  }
}

async function deleteParent(id) {
  if (!confirm('Are you sure you want to delete this parent account?')) return;
  try {
    await apiFetch(`/parents/${id}`, { method: 'DELETE' });
    loadParents();
    loadOverviewStats();
    loadStudents();
  } catch (err) {
    console.error('Error deleting parent:', err);
  }
}

// Grades Management
async function loadGrades() {
  const studentId = document.getElementById('gradeFilterStudent')?.value || '';
  const term = document.getElementById('gradeFilterTerm')?.value || '';

  const params = new URLSearchParams();
  if (studentId) params.append('student_id', studentId);
  if (term) params.append('term', term);

  try {
    const grades = await apiFetch(`/grades?${params.toString()}`);
    if (!grades) return;
    gradesList = grades;

    const tbody = document.getElementById('gradesTable');
    if (grades.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">No grades recorded.</td></tr>';
      return;
    }

    tbody.innerHTML = grades.map(g => {
      const pct = Math.round((g.score / (g.max_score || 100)) * 100);
      let badgeClass = 'grade-excellent';
      if (pct < 60) badgeClass = 'grade-poor';
      else if (pct < 75) badgeClass = 'grade-average';
      else if (pct < 85) badgeClass = 'grade-good';

      return `
        <tr>
          <td><strong>${escapeHtml(g.student_name)}</strong> <span class="text-muted">(${g.student_grade}-${g.section})</span></td>
          <td>${escapeHtml(g.subject)}</td>
          <td><strong>${g.score}</strong></td>
          <td>${g.max_score}</td>
          <td>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <span>${pct}%</span>
              <div class="grade-bar" style="width:60px;">
                <div class="grade-bar-fill ${badgeClass}" style="width: ${Math.min(pct, 100)}%;"></div>
              </div>
            </div>
          </td>
          <td>${escapeHtml(g.term)}</td>
          <td><span class="badge badge-normal">${escapeHtml(g.exam_type || 'Exam')}</span></td>
          <td>
            <div style="display:flex; gap:0.35rem;">
              <button class="btn btn-sm btn-secondary" onclick="openEditGradeModal(${g.id})">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="deleteGrade(${g.id})">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading grades:', err);
  }
}

function openEditGradeModal(gradeId) {
  const g = gradesList.find(item => item.id === gradeId);
  if (!g) return;

  document.getElementById('editGradeId').value = g.id;
  document.getElementById('editGStudent').value = g.student_id;
  document.getElementById('editGSubject').value = g.subject || '';
  document.getElementById('editGScore').value = g.score ?? '';
  document.getElementById('editGMaxScore').value = g.max_score ?? 100;
  document.getElementById('editGTerm').value = g.term || 'Term 1';
  document.getElementById('editGExamType').value = g.exam_type || 'Evaluation';
  document.getElementById('editGRemarks').value = g.remarks || '';

  openModal('editGradeModal');
}

async function handleEditGrade(e) {
  e.preventDefault();
  const id = document.getElementById('editGradeId').value;
  const payload = {
    student_id: parseInt(document.getElementById('editGStudent').value),
    subject: document.getElementById('editGSubject').value.trim(),
    score: parseFloat(document.getElementById('editGScore').value),
    max_score: parseFloat(document.getElementById('editGMaxScore').value) || 100,
    term: document.getElementById('editGTerm').value,
    exam_type: document.getElementById('editGExamType').value,
    remarks: document.getElementById('editGRemarks').value.trim() || null
  };

  try {
    await apiFetch(`/grades/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    closeModal('editGradeModal');
    loadGrades();
    loadOverviewStats();
  } catch (err) {
    console.error('Error updating grade:', err);
  }
}

async function handleAddGrade(e) {
  e.preventDefault();
  const payload = {
    student_id: parseInt(document.getElementById('gStudent').value),
    subject: document.getElementById('gSubject').value.trim(),
    score: parseFloat(document.getElementById('gScore').value),
    max_score: parseFloat(document.getElementById('gMaxScore').value) || 100,
    term: document.getElementById('gTerm').value,
    exam_type: document.getElementById('gExamType').value,
    remarks: document.getElementById('gRemarks').value.trim() || null
  };

  try {
    await apiFetch('/grades', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    closeModal('gradeModal');
    loadGrades();
  } catch (err) {
    console.error('Error adding grade:', err);
  }
}

async function deleteGrade(id) {
  if (!confirm('Are you sure you want to delete this grade record?')) return;
  try {
    await apiFetch(`/grades/${id}`, { method: 'DELETE' });
    loadGrades();
  } catch (err) {
    console.error('Error deleting grade:', err);
  }
}

// Attendance Management
async function loadAttendance() {
  const date = document.getElementById('attendanceDate')?.value || '';
  const studentId = document.getElementById('attendanceFilterStudent')?.value || '';

  const params = new URLSearchParams();
  if (date) params.append('date', date);
  if (studentId) params.append('student_id', studentId);

  try {
    const records = await apiFetch(`/attendance?${params.toString()}`);
    if (!records) return;

    const tbody = document.getElementById('attendanceTable');
    if (records.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No attendance marked for this selection.</td></tr>';
      return;
    }

    tbody.innerHTML = records.map(r => `
      <tr>
        <td><strong>${escapeHtml(r.student_name)}</strong></td>
        <td>Grade ${escapeHtml(r.grade)}-${escapeHtml(r.section)}</td>
        <td>${escapeHtml(r.date)}</td>
        <td><span class="badge badge-${r.status}">${r.status}</span></td>
        <td>${escapeHtml(r.remarks || '-')}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Error loading attendance:', err);
  }
}

async function handleAddAttendance(e) {
  e.preventDefault();
  const payload = {
    student_id: parseInt(document.getElementById('aStudent').value),
    date: document.getElementById('aDate').value,
    status: document.getElementById('aStatus').value,
    remarks: document.getElementById('aRemarks').value.trim() || null
  };

  try {
    await apiFetch('/attendance', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    closeModal('attendanceModal');
    loadAttendance();
    loadOverviewStats();
  } catch (err) {
    console.error('Error marking attendance:', err);
  }
}

// Announcements Management
async function loadAnnouncements() {
  try {
    const list = await apiFetch('/announcements');
    if (!list) return;

    const container = document.getElementById('announcementsList');
    if (list.length === 0) {
      container.innerHTML = '<p class="text-muted">No announcements found.</p>';
      return;
    }

    container.innerHTML = list.map(a => `
      <div class="announcement-card">
        <div class="announcement-header">
          <h3>${escapeHtml(a.title)}</h3>
          <div class="announcement-meta">
            <span class="badge badge-${a.priority}">${a.priority}</span>
            <span class="badge badge-normal">For: ${a.target_role}</span>
          </div>
        </div>
        <div class="announcement-body">${escapeHtml(a.content)}</div>
        <div class="announcement-footer">
          <span>By ${escapeHtml(a.author_name || 'Admin')} • ${new Date(a.created_at).toLocaleDateString()}</span>
          <button class="btn btn-sm btn-danger" onclick="deleteAnnouncement(${a.id})">Delete</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading announcements:', err);
  }
}

async function handleAddAnnouncement(e) {
  e.preventDefault();
  const payload = {
    title: document.getElementById('annTitle').value.trim(),
    content: document.getElementById('annContent').value.trim(),
    target_role: document.getElementById('annTarget').value,
    priority: document.getElementById('annPriority').value
  };

  try {
    await apiFetch('/announcements', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    closeModal('announcementModal');
    loadAnnouncements();
    loadOverviewStats();
  } catch (err) {
    console.error('Error posting announcement:', err);
  }
}

async function deleteAnnouncement(id) {
  if (!confirm('Are you sure you want to delete this announcement?')) return;
  try {
    await apiFetch(`/announcements/${id}`, { method: 'DELETE' });
    loadAnnouncements();
    loadOverviewStats();
  } catch (err) {
    console.error('Error deleting announcement:', err);
  }
}

// Events Management
async function loadEvents() {
  try {
    const events = await apiFetch('/events');
    if (!events) return;

    const container = document.getElementById('eventsList');
    if (events.length === 0) {
      container.innerHTML = '<p class="text-muted">No events scheduled.</p>';
      return;
    }

    container.innerHTML = events.map(ev => {
      const d = new Date(ev.event_date);
      const day = d.getDate();
      const month = d.toLocaleString('default', { month: 'short' }).toUpperCase();

      return `
        <div class="event-list-item">
          <div class="event-date" style="padding: 0.5rem 0.8rem; min-width: 60px;">
            <span class="event-day" style="font-size: 1.3rem;">${day}</span>
            <span class="event-month" style="font-size: 0.7rem;">${month}</span>
          </div>
          <div style="flex:1;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h3 style="font-size:1rem; margin:0;">${escapeHtml(ev.title)}</h3>
              <span class="badge badge-normal">${escapeHtml(ev.event_type || 'General')}</span>
            </div>
            <p style="color:var(--text-light); font-size:0.85rem; margin-top:0.25rem;">${escapeHtml(ev.description || '')}</p>
          </div>
          <div>
            <button class="btn btn-sm btn-danger" onclick="deleteEvent(${ev.id})">Delete</button>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading events:', err);
  }
}

async function handleAddEvent(e) {
  e.preventDefault();
  const payload = {
    title: document.getElementById('evTitle').value.trim(),
    description: document.getElementById('evDescription').value.trim(),
    event_date: document.getElementById('evDate').value,
    event_type: document.getElementById('evType').value
  };

  try {
    await apiFetch('/events', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    closeModal('eventModal');
    loadEvents();
    loadOverviewStats();
  } catch (err) {
    console.error('Error adding event:', err);
  }
}

async function deleteEvent(id) {
  if (!confirm('Are you sure you want to delete this event?')) return;
  try {
    await apiFetch(`/events/${id}`, { method: 'DELETE' });
    loadEvents();
    loadOverviewStats();
  } catch (err) {
    console.error('Error deleting event:', err);
  }
}

// Auth helpers
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '/login';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
