const express = require('express');
const { getDB } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('parent', 'student'));

// Get dashboard data
router.get('/dashboard', (req, res) => {
  const db = getDB();
  const user = req.user;
  let studentIds = [];

  if (user.role === 'student') {
    const student = db.prepare('SELECT id FROM students WHERE user_id = ?').get(user.id);
    if (student) studentIds = [student.id];
  } else if (user.role === 'parent') {
    const children = db.prepare('SELECT id FROM students WHERE parent_user_id = ?').all(user.id);
    studentIds = children.map(c => c.id);
  }

  if (studentIds.length === 0) {
    return res.json({ children: [], announcements: [], events: [], recentGrades: [], attendanceSummary: {} });
  }

  const placeholders = studentIds.map(() => '?').join(',');

  // Get children info
  const children = db.prepare(`
    SELECT s.id as student_id, u.full_name, s.grade, s.section, s.roll_number
    FROM students s JOIN users u ON s.user_id = u.id
    WHERE s.id IN (${placeholders})
  `).all(...studentIds);

  // Get announcements for this role
  const announcements = db.prepare(`
    SELECT a.*, u.full_name as author_name FROM announcements a
    LEFT JOIN users u ON a.author_id = u.id
    WHERE a.target_role IN ('all', ?)
    ORDER BY a.created_at DESC LIMIT 10
  `).all(user.role);

  // Get upcoming events
  const events = db.prepare("SELECT * FROM events WHERE event_date >= date('now') ORDER BY event_date ASC LIMIT 5").all();

  // Get recent grades
  const recentGrades = db.prepare(`
    SELECT g.*, u.full_name as student_name
    FROM grades g JOIN students s ON g.student_id = s.id JOIN users u ON s.user_id = u.id
    WHERE g.student_id IN (${placeholders})
    ORDER BY g.created_at DESC LIMIT 10
  `).all(...studentIds);

  // Attendance summary
  const attendanceSummary = {};
  for (const sid of studentIds) {
    const total = db.prepare('SELECT COUNT(*) as count FROM attendance WHERE student_id = ?').get(sid).count;
    const present = db.prepare("SELECT COUNT(*) as count FROM attendance WHERE student_id = ? AND status = 'present'").get(sid).count;
    const absent = db.prepare("SELECT COUNT(*) as count FROM attendance WHERE student_id = ? AND status = 'absent'").get(sid).count;
    const late = db.prepare("SELECT COUNT(*) as count FROM attendance WHERE student_id = ? AND status = 'late'").get(sid).count;
    attendanceSummary[sid] = { total, present, absent, late, rate: total > 0 ? Math.round((present / total) * 100) : 0 };
  }

  res.json({ children, announcements, events, recentGrades, attendanceSummary });
});

// Get grades for specific student
router.get('/grades/:studentId', (req, res) => {
  const db = getDB();
  const user = req.user;
  const studentId = parseInt(req.params.studentId);

  // Verify access
  if (user.role === 'student') {
    const student = db.prepare('SELECT id FROM students WHERE user_id = ? AND id = ?').get(user.id, studentId);
    if (!student) return res.status(403).json({ error: 'Access denied.' });
  } else if (user.role === 'parent') {
    const child = db.prepare('SELECT id FROM students WHERE parent_user_id = ? AND id = ?').get(user.id, studentId);
    if (!child) return res.status(403).json({ error: 'Access denied.' });
  }

  const grades = db.prepare(`
    SELECT g.*, u.full_name as student_name
    FROM grades g JOIN students s ON g.student_id = s.id JOIN users u ON s.user_id = u.id
    WHERE g.student_id = ?
    ORDER BY g.term, g.subject
  `).all(studentId);

  res.json(grades);
});

// Get attendance for specific student
router.get('/attendance/:studentId', (req, res) => {
  const db = getDB();
  const user = req.user;
  const studentId = parseInt(req.params.studentId);

  // Verify access
  if (user.role === 'student') {
    const student = db.prepare('SELECT id FROM students WHERE user_id = ? AND id = ?').get(user.id, studentId);
    if (!student) return res.status(403).json({ error: 'Access denied.' });
  } else if (user.role === 'parent') {
    const child = db.prepare('SELECT id FROM students WHERE parent_user_id = ? AND id = ?').get(user.id, studentId);
    if (!child) return res.status(403).json({ error: 'Access denied.' });
  }

  const attendance = db.prepare('SELECT * FROM attendance WHERE student_id = ? ORDER BY date DESC').all(studentId);
  res.json(attendance);
});

// Get all announcements
router.get('/announcements', (req, res) => {
  const db = getDB();
  const announcements = db.prepare(`
    SELECT a.*, u.full_name as author_name FROM announcements a
    LEFT JOIN users u ON a.author_id = u.id
    WHERE a.target_role IN ('all', ?)
    ORDER BY a.created_at DESC
  `).all(req.user.role);
  res.json(announcements);
});

module.exports = router;
