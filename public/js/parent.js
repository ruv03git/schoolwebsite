// Parent & Student Dashboard Logic

const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || 'null');

if (!token || !user || (user.role !== 'parent' && user.role !== 'student')) {
  window.location.href = '/login';
}

let activeStudentId = null;
let dashboardData = null;

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('userName').textContent = user.full_name || user.username;
  const badge = document.getElementById('userBadge');
  if (badge) {
    badge.textContent = user.role === 'parent' ? 'Parent' : 'Student';
    badge.className = user.role === 'parent' ? 'badge badge-parent' : 'badge badge-student';
  }

  loadDashboard();
  loadProfile();
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
    grades: 'Academic Grades',
    attendance: 'Attendance Record',
    announcements: 'Announcements',
    profile: 'Profile & Account'
  };
  const titleEl = document.getElementById('pageTitle');
  if (titleEl && titles[sectionId]) titleEl.textContent = titles[sectionId];

  // Specific section triggers
  if (sectionId === 'grades' && activeStudentId) {
    loadStudentGrades();
  } else if (sectionId === 'attendance' && activeStudentId) {
    loadStudentAttendance();
  } else if (sectionId === 'announcements') {
    loadAllAnnouncements();
  }

  const sidebar = document.getElementById('sidebar');
  if (sidebar && window.innerWidth <= 768) {
    sidebar.classList.remove('open');
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
    const res = await fetch(`/api/parent${endpoint}`, { ...options, headers });
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

// Load Dashboard data
async function loadDashboard() {
  try {
    const data = await apiFetch('/dashboard');
    if (!data) return;
    dashboardData = data;

    // Handle children selector for parents
    const childrenCardsEl = document.getElementById('childrenCards');
    const gradesPickerEl = document.getElementById('gradesSelectStudent');
    const attPickerEl = document.getElementById('attendanceSelectStudent');
    const gradesPicker = document.getElementById('gradesStudentPicker');
    const attPicker = document.getElementById('attendanceStudentPicker');

    if (data.children && data.children.length > 0) {
      activeStudentId = data.children[0].student_id;

      if (user.role === 'parent') {
        childrenCardsEl.style.display = 'flex';
        childrenCardsEl.innerHTML = data.children.map((child, idx) => `
          <div class="child-card ${idx === 0 ? 'active' : ''}" onclick="selectChild(${child.student_id}, this)">
            <h3>${escapeHtml(child.full_name)}</h3>
            <p>Grade ${escapeHtml(child.grade)} - Section ${escapeHtml(child.section || 'A')}</p>
            <p style="font-size:0.75rem; margin-top:0.25rem;">Roll: ${escapeHtml(child.roll_number || 'N/A')}</p>
          </div>
        `).join('');

        if (data.children.length > 1) {
          gradesPickerEl.style.display = 'block';
          attPickerEl.style.display = 'block';

          const options = data.children.map(c => `
            <option value="${c.student_id}">${escapeHtml(c.full_name)}</option>
          `).join('');

          gradesPicker.innerHTML = options;
          attPicker.innerHTML = options;
        }
      }
    }

    // Update Attendance Stats for active child
    updateAttendanceStats();

    // Upcoming Events
    document.getElementById('statUpcoming').textContent = data.events?.length || 0;
    renderEvents(data.events || []);

    // Recent Grades
    renderRecentGrades(data.recentGrades || []);

    // Latest Announcements
    renderLatestAnnouncements(data.announcements || []);
  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

function selectChild(studentId, el) {
  activeStudentId = studentId;
  document.querySelectorAll('.child-card').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');

  const gSelect = document.getElementById('gradesStudentPicker');
  const aSelect = document.getElementById('attendanceStudentPicker');
  if (gSelect) gSelect.value = studentId;
  if (aSelect) aSelect.value = studentId;

  updateAttendanceStats();
  if (document.getElementById('section-grades').classList.contains('active')) {
    loadStudentGrades();
  }
  if (document.getElementById('section-attendance').classList.contains('active')) {
    loadStudentAttendance();
  }
}

function updateAttendanceStats() {
  if (!dashboardData || !activeStudentId) return;
  const stats = dashboardData.attendanceSummary?.[activeStudentId] || { rate: 0, present: 0, absent: 0 };
  document.getElementById('statAttRate').textContent = `${stats.rate}%`;
  document.getElementById('statPresent').textContent = stats.present;
  document.getElementById('statAbsent').textContent = stats.absent;
}

function renderRecentGrades(grades) {
  const container = document.getElementById('recentGrades');
  if (!grades || grades.length === 0) {
    container.innerHTML = '<p class="text-muted">No recent grades available.</p>';
    return;
  }

  container.innerHTML = grades.slice(0, 5).map(g => {
    const pct = Math.round((g.score / (g.max_score || 100)) * 100);
    return `
      <div class="list-item">
        <div>
          <div class="list-item-title">${escapeHtml(g.subject)} <span class="text-muted">(${escapeHtml(g.term)})</span></div>
          <div class="list-item-subtitle">${escapeHtml(g.student_name)} • ${escapeHtml(g.exam_type || 'Exam')}</div>
        </div>
        <div style="text-align:right;">
          <strong style="font-size:1.1rem; color:${pct >= 75 ? 'var(--success)' : (pct >= 50 ? 'var(--warning)' : 'var(--danger)')};">
            ${g.score}/${g.max_score}
          </strong>
          <div style="font-size:0.75rem; color:var(--text-muted);">${pct}%</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderLatestAnnouncements(list) {
  const container = document.getElementById('latestAnnouncements');
  if (!list || list.length === 0) {
    container.innerHTML = '<p class="text-muted">No announcements posted.</p>';
    return;
  }

  container.innerHTML = list.slice(0, 4).map(a => `
    <div class="list-item">
      <div>
        <div class="list-item-title">${escapeHtml(a.title)}</div>
        <div class="list-item-subtitle">${escapeHtml(a.content.substring(0, 80))}${a.content.length > 80 ? '...' : ''}</div>
      </div>
      <div class="list-item-meta">
        <span class="badge badge-${a.priority}">${a.priority}</span>
      </div>
    </div>
  `).join('');
}

function renderEvents(events) {
  const container = document.getElementById('upcomingEvents');
  if (!events || events.length === 0) {
    container.innerHTML = '<p class="text-muted">No upcoming events scheduled.</p>';
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
        <div>
          <h3 style="font-size:1rem; margin:0;">${escapeHtml(ev.title)}</h3>
          <p style="color:var(--text-light); font-size:0.85rem; margin-top:0.25rem;">${escapeHtml(ev.description || '')}</p>
        </div>
      </div>
    `;
  }).join('');
}

// Load Grades Detail
async function loadStudentGrades() {
  const picker = document.getElementById('gradesStudentPicker');
  const studentId = picker?.value || activeStudentId;
  if (!studentId) return;

  const container = document.getElementById('gradesContent');
  container.innerHTML = '<p class="text-muted">Loading grades...</p>';

  try {
    const grades = await apiFetch(`/grades/${studentId}`);
    if (!grades || grades.length === 0) {
      container.innerHTML = '<p class="text-muted">No grades recorded yet.</p>';
      return;
    }

    // Group by term
    const terms = {};
    grades.forEach(g => {
      if (!terms[g.term]) terms[g.term] = [];
      terms[g.term].push(g);
    });

    let html = '';
    for (const [term, termGrades] of Object.entries(terms)) {
      let totalScore = 0;
      let totalMax = 0;

      const rows = termGrades.map(g => {
        totalScore += g.score;
        totalMax += g.max_score || 100;
        const pct = Math.round((g.score / (g.max_score || 100)) * 100);
        let barClass = 'grade-excellent';
        if (pct < 60) barClass = 'grade-poor';
        else if (pct < 75) barClass = 'grade-average';
        else if (pct < 85) barClass = 'grade-good';

        return `
          <tr>
            <td><strong>${escapeHtml(g.subject)}</strong></td>
            <td>${escapeHtml(g.exam_type || 'Exam')}</td>
            <td><strong>${g.score}</strong></td>
            <td>${g.max_score}</td>
            <td>
              <div style="display:flex; align-items:center; gap:0.5rem;">
                <span style="font-weight:600;">${pct}%</span>
                <div class="grade-bar" style="width:70px;">
                  <div class="grade-bar-fill ${barClass}" style="width: ${Math.min(pct, 100)}%;"></div>
                </div>
              </div>
            </td>
            <td>${escapeHtml(g.remarks || '-')}</td>
          </tr>
        `;
      }).join('');

      const overallPct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

      html += `
        <div class="grades-by-term card" style="margin-bottom:1.5rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem;">
            <h3 style="margin:0;">${escapeHtml(term)}</h3>
            <span class="badge ${overallPct >= 75 ? 'badge-present' : 'badge-normal'}">
              Term Average: ${overallPct}%
            </span>
          </div>
          <div class="table-container">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Assessment</th>
                  <th>Score</th>
                  <th>Max</th>
                  <th>Percentage</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  } catch (err) {
    console.error('Error loading grades:', err);
    container.innerHTML = '<p class="text-danger">Failed to load grades.</p>';
  }
}

// Load Attendance Detail
async function loadStudentAttendance() {
  const picker = document.getElementById('attendanceStudentPicker');
  const studentId = picker?.value || activeStudentId;
  if (!studentId) return;

  const container = document.getElementById('attendanceContent');
  container.innerHTML = '<p class="text-muted">Loading attendance...</p>';

  try {
    const records = await apiFetch(`/attendance/${studentId}`);
    if (!records || records.length === 0) {
      container.innerHTML = '<p class="text-muted">No attendance records found.</p>';
      return;
    }

    // Summary calculation
    const total = records.length;
    const present = records.filter(r => r.status === 'present').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const late = records.filter(r => r.status === 'late').length;
    const excused = records.filter(r => r.status === 'excused').length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;

    const rows = records.map(r => `
      <tr>
        <td><strong>${escapeHtml(r.date)}</strong></td>
        <td><span class="badge badge-${r.status}">${r.status}</span></td>
        <td>${escapeHtml(r.remarks || '-')}</td>
      </tr>
    `).join('');

    container.innerHTML = `
      <div class="card" style="margin-bottom:1.5rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
          <div>
            <h3 style="margin:0;">Attendance Summary</h3>
            <span class="text-muted">Total Days Recorded: ${total}</span>
          </div>
          <div style="display:flex; gap:1rem; font-size:0.9rem;">
            <span class="att-present">● Present: <strong>${present}</strong></span>
            <span class="att-absent">● Absent: <strong>${absent}</strong></span>
            <span class="att-late">● Late: <strong>${late}</strong></span>
            <span style="color:var(--secondary)">● Excused: <strong>${excused}</strong></span>
          </div>
        </div>
        <div class="attendance-summary-bar">
          <div class="att-bar-present" style="width:${(present/total)*100}%;" title="Present: ${present}"></div>
          <div class="att-bar-late" style="width:${(late/total)*100}%;" title="Late: ${late}"></div>
          <div class="att-bar-excused" style="width:${(excused/total)*100}%;" title="Excused: ${excused}"></div>
          <div class="att-bar-absent" style="width:${(absent/total)*100}%;" title="Absent: ${absent}"></div>
        </div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Status</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    console.error('Error loading attendance:', err);
    container.innerHTML = '<p class="text-danger">Failed to load attendance.</p>';
  }
}

// Announcements
async function loadAllAnnouncements() {
  try {
    const list = await apiFetch('/announcements');
    if (!list) return;

    const container = document.getElementById('allAnnouncements');
    if (list.length === 0) {
      container.innerHTML = '<p class="text-muted">No announcements available.</p>';
      return;
    }

    container.innerHTML = list.map(a => `
      <div class="announcement-card">
        <div class="announcement-header">
          <h3>${escapeHtml(a.title)}</h3>
          <span class="badge badge-${a.priority}">${a.priority}</span>
        </div>
        <div class="announcement-body">${escapeHtml(a.content)}</div>
        <div class="announcement-footer">
          <span>By ${escapeHtml(a.author_name || 'Administration')}</span>
          <span>${new Date(a.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error loading announcements:', err);
  }
}

// Profile & Password
async function loadProfile() {
  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return;
    const profile = await res.json();

    const infoEl = document.getElementById('profileInfo');
    infoEl.innerHTML = `
      <div class="profile-field">
        <label>Full Name</label>
        <span>${escapeHtml(profile.full_name)}</span>
      </div>
      <div class="profile-field">
        <label>Username</label>
        <span>${escapeHtml(profile.username)}</span>
      </div>
      <div class="profile-field">
        <label>Account Role</label>
        <span class="badge badge-${profile.role}">${profile.role}</span>
      </div>
      <div class="profile-field">
        <label>Email Address</label>
        <span>${escapeHtml(profile.email || 'Not provided')}</span>
      </div>
      <div class="profile-field">
        <label>Phone Number</label>
        <span>${escapeHtml(profile.phone || 'Not provided')}</span>
      </div>
      ${profile.studentInfo ? `
        <div class="profile-field">
          <label>Grade & Section</label>
          <span>Grade ${escapeHtml(profile.studentInfo.grade)} - ${escapeHtml(profile.studentInfo.section || 'A')}</span>
        </div>
        <div class="profile-field">
          <label>Roll Number</label>
          <span>${escapeHtml(profile.studentInfo.roll_number || 'N/A')}</span>
        </div>
        <div class="profile-field">
          <label>Date of Birth</label>
          <span>${escapeHtml(profile.studentInfo.date_of_birth || 'N/A')}</span>
        </div>
      ` : ''}
    `;
  } catch (err) {
    console.error('Error loading profile:', err);
  }
}

async function handleChangePassword(e) {
  e.preventDefault();
  const currentPassword = document.getElementById('currentPwd').value;
  const newPassword = document.getElementById('newPwd').value;
  const confirmPassword = document.getElementById('confirmPwd').value;
  const errDiv = document.getElementById('pwdError');
  const succDiv = document.getElementById('pwdSuccess');

  errDiv.style.display = 'none';
  succDiv.style.display = 'none';

  if (newPassword !== confirmPassword) {
    errDiv.textContent = 'New passwords do not match.';
    errDiv.style.display = 'block';
    return;
  }

  try {
    const res = await fetch('/api/auth/password', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Failed to update password');
    }

    succDiv.textContent = 'Password updated successfully!';
    succDiv.style.display = 'block';
    e.target.reset();
  } catch (err) {
    errDiv.textContent = err.message;
    errDiv.style.display = 'block';
  }
}

// Helpers
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
