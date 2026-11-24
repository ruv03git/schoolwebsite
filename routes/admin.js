const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, requireRole('admin', 'faculty', 'teacher'));

// Dashboard stats
router.get('/stats', (req, res) => {
  const db = getDB();
  const totalStudents = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('student').count;
  const totalParents = db.prepare('SELECT COUNT(*) as count FROM users WHERE role = ?').get('parent').count;
  const totalAnnouncements = db.prepare('SELECT COUNT(*) as count FROM announcements').get().count;
  const todayAttendance = db.prepare("SELECT COUNT(*) as count FROM attendance WHERE date = date('now') AND status = 'present'").get().count;
  const totalToday = db.prepare("SELECT COUNT(*) as count FROM attendance WHERE date = date('now')").get().count;
  const upcomingEvents = db.prepare("SELECT COUNT(*) as count FROM events WHERE event_date >= date('now')").get().count;
  const recentAnnouncements = db.prepare('SELECT a.*, u.full_name as author_name FROM announcements a LEFT JOIN users u ON a.author_id = u.id ORDER BY a.created_at DESC LIMIT 5').all();

  res.json({
    totalStudents,
    totalParents,
    totalAnnouncements,
    attendanceRate: totalToday > 0 ? Math.round((todayAttendance / totalToday) * 100) : 0,
    upcomingEvents,
    recentAnnouncements
  });
});

// Students CRUD
router.get('/students', (req, res) => {
  const db = getDB();
  const students = db.prepare(`
    SELECT u.id as user_id, u.full_name, u.email, u.phone, u.username,
           s.id as student_id, s.grade, s.section, s.roll_number, s.date_of_birth,
           p.full_name as parent_name, p.id as parent_id
    FROM users u
    JOIN students s ON u.id = s.user_id
    LEFT JOIN users p ON s.parent_user_id = p.id
    WHERE u.role = 'student'
    ORDER BY s.grade, s.section, s.roll_number
  `).all();
  res.json(students);
});

router.post('/students', (req, res) => {
  const { full_name, email, phone, grade, section, roll_number, date_of_birth, parent_user_id, username, password } = req.body;
  if (!full_name || !grade || !username || !password) {
    return res.status(400).json({ error: 'Full name, grade, username, and password are required.' });
  }

  const db = getDB();
  try {
    const hash = bcrypt.hashSync(password, 10);
    const userResult = db.prepare('INSERT INTO users (username, password, role, full_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)').run(
      username, hash, 'student', full_name, email || null, phone || null
    );
    db.prepare('INSERT INTO students (user_id, grade, section, roll_number, parent_user_id, date_of_birth) VALUES (?, ?, ?, ?, ?, ?)').run(
      userResult.lastInsertRowid, grade, section || 'A', roll_number || null, parent_user_id || null, date_of_birth || null
    );
    res.status(201).json({ message: 'Student created successfully.', userId: userResult.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username already exists.' });
    }
    res.status(500).json({ error: 'Failed to create student.' });
  }
});

// Bulk upload students from CSV (Appends to existing data)
router.post('/students/upload-csv', (req, res) => {
  const { students } = req.body;
  if (!Array.isArray(students) || students.length === 0) {
    return res.status(400).json({ error: 'No student records provided.' });
  }

  const db = getDB();
  const insertUser = db.prepare('INSERT INTO users (username, password, role, full_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)');
  const insertStudent = db.prepare('INSERT INTO students (user_id, grade, section, roll_number, parent_user_id, date_of_birth) VALUES (?, ?, ?, ?, ?, ?)');
  const findParent = db.prepare('SELECT id FROM users WHERE username = ? AND role = "parent"');
  const checkUsername = db.prepare('SELECT id FROM users WHERE username = ?');

  let inserted = 0;
  const errors = [];

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const rowNum = i + 1;

    const full_name = (s.full_name || '').trim();
    const grade = (s.grade || '').trim();

    if (!full_name || !grade) {
      errors.push(`Row ${rowNum}: Full name and Grade are required.`);
      continue;
    }

    // Auto-generate username if omitted
    let username = (s.username || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!username) {
      username = full_name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 10) + Math.floor(100 + Math.random() * 900);
    }

    // If username already exists, append suffix to guarantee clean appending
    let originalUsername = username;
    let counter = 1;
    while (checkUsername.get(username)) {
      username = `${originalUsername}${counter++}`;
    }

    const password = s.password || 'student123';
    const hash = bcrypt.hashSync(password, 10);
    const section = (s.section || 'A').trim();
    const roll_number = s.roll_number ? String(s.roll_number).trim() : null;
    const email = s.email ? String(s.email).trim() : null;
    const phone = s.phone ? String(s.phone).trim() : null;
    const date_of_birth = s.date_of_birth ? String(s.date_of_birth).trim() : null;

    let parent_user_id = null;
    if (s.parent_username) {
      const p = findParent.get(String(s.parent_username).trim());
      if (p) parent_user_id = p.id;
    } else if (s.parent_user_id) {
      parent_user_id = parseInt(s.parent_user_id) || null;
    }

    try {
      const userRes = insertUser.run(username, hash, 'student', full_name, email, phone);
      insertStudent.run(userRes.lastInsertRowid, grade, section, roll_number, parent_user_id, date_of_birth);
      inserted++;
    } catch (err) {
      errors.push(`Row ${rowNum} (${full_name}): ${err.message}`);
    }
  }

  res.json({
    message: `Successfully appended ${inserted} student(s) to the existing list.`,
    inserted,
    errors
  });
});

router.put('/students/:id', (req, res) => {
  const { full_name, email, phone, grade, section, roll_number, date_of_birth, parent_user_id } = req.body;
  const db = getDB();

  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  db.prepare('UPDATE users SET full_name = ?, email = ?, phone = ? WHERE id = ?').run(
    full_name, email || null, phone || null, student.user_id
  );
  db.prepare('UPDATE students SET grade = ?, section = ?, roll_number = ?, date_of_birth = ?, parent_user_id = ? WHERE id = ?').run(
    grade, section || 'A', roll_number || null, date_of_birth || null, parent_user_id || null, req.params.id
  );
  res.json({ message: 'Student updated successfully.' });
});

router.delete('/students/:id', (req, res) => {
  const db = getDB();
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  db.prepare('DELETE FROM students WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(student.user_id);
  res.json({ message: 'Student deleted successfully.' });
});

// Parents CRUD
router.get('/parents', (req, res) => {
  const db = getDB();
  const parents = db.prepare(`
    SELECT u.id, u.full_name, u.email, u.phone, u.username,
    (SELECT GROUP_CONCAT(u2.full_name, ', ') FROM students s JOIN users u2 ON s.user_id = u2.id WHERE s.parent_user_id = u.id) as children
    FROM users u WHERE u.role = 'parent'
    ORDER BY u.full_name
  `).all();
  res.json(parents);
});

router.post('/parents', (req, res) => {
  const { full_name, email, phone, username, password } = req.body;
  if (!full_name || !username || !password) {
    return res.status(400).json({ error: 'Full name, username, and password are required.' });
  }

  const db = getDB();
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO users (username, password, role, full_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)').run(
      username, hash, 'parent', full_name, email || null, phone || null
    );
    res.status(201).json({ message: 'Parent created successfully.', userId: result.lastInsertRowid });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username already exists.' });
    }
    res.status(500).json({ error: 'Failed to create parent.' });
  }
});

router.delete('/parents/:id', (req, res) => {
  const db = getDB();
  db.prepare('UPDATE students SET parent_user_id = NULL WHERE parent_user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ? AND role = ?').run(req.params.id, 'parent');
  res.json({ message: 'Parent deleted successfully.' });
});

// Announcements
router.get('/announcements', (req, res) => {
  const db = getDB();
  const announcements = db.prepare('SELECT a.*, u.full_name as author_name FROM announcements a LEFT JOIN users u ON a.author_id = u.id ORDER BY a.created_at DESC').all();
  res.json(announcements);
});

router.post('/announcements', (req, res) => {
  const { title, content, target_role, priority } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title and content are required.' });

  const db = getDB();
  db.prepare('INSERT INTO announcements (title, content, author_id, target_role, priority) VALUES (?, ?, ?, ?, ?)').run(
    title, content, req.user.id, target_role || 'all', priority || 'normal'
  );
  res.status(201).json({ message: 'Announcement posted.' });
});

router.delete('/announcements/:id', (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM announcements WHERE id = ?').run(req.params.id);
  res.json({ message: 'Announcement deleted.' });
});

// Grades
router.get('/grades', (req, res) => {
  const db = getDB();
  const { student_id, term } = req.query;
  let query = `SELECT g.*, s.grade as student_grade, s.section, u.full_name as student_name
    FROM grades g JOIN students s ON g.student_id = s.id JOIN users u ON s.user_id = u.id`;
  const params = [];
  const conditions = [];

  if (student_id) { conditions.push('g.student_id = ?'); params.push(student_id); }
  if (term) { conditions.push('g.term = ?'); params.push(term); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY u.full_name, g.subject';

  res.json(db.prepare(query).all(...params));
});

router.post('/grades', (req, res) => {
  const { student_id, subject, score, max_score, term, exam_type, remarks } = req.body;
  if (!student_id || !subject || score === undefined || !term) {
    return res.status(400).json({ error: 'Student, subject, score, and term are required.' });
  }

  const db = getDB();
  db.prepare('INSERT INTO grades (student_id, subject, score, max_score, term, exam_type, remarks) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    student_id, subject, score, max_score || 100, term, exam_type || 'exam', remarks || null
  );
  res.status(201).json({ message: 'Grade recorded.' });
});

router.put('/grades/:id', (req, res) => {
  const { student_id, subject, score, max_score, term, exam_type, remarks } = req.body;
  if (!subject || score === undefined || !term) {
    return res.status(400).json({ error: 'Subject, score, and term are required.' });
  }

  const db = getDB();
  const existing = db.prepare('SELECT id FROM grades WHERE id = ?').get(req.params.id);
  if (!existing) {
    return res.status(404).json({ error: 'Grade record not found.' });
  }

  db.prepare(`
    UPDATE grades
    SET student_id = COALESCE(?, student_id),
        subject = ?,
        score = ?,
        max_score = ?,
        term = ?,
        exam_type = ?,
        remarks = ?
    WHERE id = ?
  `).run(
    student_id || null,
    subject.trim(),
    parseFloat(score),
    parseFloat(max_score) || 100,
    term.trim(),
    exam_type || 'Evaluation',
    remarks ? remarks.trim() : null,
    req.params.id
  );

  res.json({ message: 'Academic record updated successfully.' });
});

router.delete('/grades/:id', (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM grades WHERE id = ?').run(req.params.id);
  res.json({ message: 'Grade deleted.' });
});

// Attendance
router.get('/attendance', (req, res) => {
  const db = getDB();
  const { student_id, date } = req.query;
  let query = `SELECT a.*, u.full_name as student_name, s.grade, s.section
    FROM attendance a JOIN students s ON a.student_id = s.id JOIN users u ON s.user_id = u.id`;
  const params = [];
  const conditions = [];

  if (student_id) { conditions.push('a.student_id = ?'); params.push(student_id); }
  if (date) { conditions.push('a.date = ?'); params.push(date); }
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY a.date DESC, u.full_name';

  res.json(db.prepare(query).all(...params));
});

router.post('/attendance', (req, res) => {
  const { student_id, date, status, remarks } = req.body;
  if (!student_id || !date || !status) {
    return res.status(400).json({ error: 'Student, date, and status are required.' });
  }

  const db = getDB();
  // Upsert: update if exists for that student+date
  const existing = db.prepare('SELECT id FROM attendance WHERE student_id = ? AND date = ?').get(student_id, date);
  if (existing) {
    db.prepare('UPDATE attendance SET status = ?, remarks = ? WHERE id = ?').run(status, remarks || null, existing.id);
  } else {
    db.prepare('INSERT INTO attendance (student_id, date, status, remarks) VALUES (?, ?, ?, ?)').run(student_id, date, status, remarks || null);
  }
  res.status(201).json({ message: 'Attendance recorded.' });
});

// Events
router.get('/events', (req, res) => {
  const db = getDB();
  const events = db.prepare("SELECT * FROM events ORDER BY event_date ASC").all();
  res.json(events);
});

router.post('/events', (req, res) => {
  const { title, description, event_date, event_type } = req.body;
  if (!title || !event_date) return res.status(400).json({ error: 'Title and date are required.' });

  const db = getDB();
  db.prepare('INSERT INTO events (title, description, event_date, event_type) VALUES (?, ?, ?, ?)').run(
    title, description || '', event_date, event_type || 'general'
  );
  res.status(201).json({ message: 'Event created.' });
});

router.delete('/events/:id', (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  res.json({ message: 'Event deleted.' });
});

module.exports = router;
