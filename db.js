const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// The database lives outside the repository. Set DB_PATH in .env to an
// absolute location (e.g. C:\school-data\school.db) so data is never
// committed to git. Falls back to the project folder for local dev.
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'school.db');

let db;

function getDB() {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA foreign_keys = ON;');
  }
  return db;
}

function initDB() {
  const db = getDB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'faculty', 'teacher', 'parent', 'student')),
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      grade TEXT NOT NULL,
      section TEXT DEFAULT 'A',
      roll_number TEXT,
      parent_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      date_of_birth TEXT,
      address TEXT
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author_id INTEGER REFERENCES users(id),
      target_role TEXT DEFAULT 'all',
      priority TEXT DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      score REAL NOT NULL,
      max_score REAL DEFAULT 100,
      term TEXT NOT NULL,
      exam_type TEXT DEFAULT 'assessment',
      remarks TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'late', 'excused')),
      remarks TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      event_date TEXT NOT NULL,
      event_type TEXT DEFAULT 'general',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      teacher_name TEXT,
      grade TEXT NOT NULL,
      section TEXT DEFAULT 'A'
    );
  `);

  // Ensure 'faculty' role is supported in existing database
  try {
    db.prepare("INSERT INTO users (username, password, role, full_name) VALUES ('__temp_check__', 'x', 'faculty', 'test')").run();
    db.prepare("DELETE FROM users WHERE username = '__temp_check__'").run();
  } catch (err) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      CREATE TABLE users_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin', 'faculty', 'teacher', 'parent', 'student')),
        full_name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO users_migrated SELECT * FROM users;
      DROP TABLE users;
      ALTER TABLE users_migrated RENAME TO users;
      PRAGMA foreign_keys = ON;
    `);
  }

  // Seed default admin if not exists
  const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!adminExists) {
    seedData(db);
  }

  // Ensure a sample faculty exists
  const facultyExists = db.prepare("SELECT id FROM users WHERE role IN ('faculty', 'teacher')").get();
  if (!facultyExists) {
    const fHash = bcrypt.hashSync('faculty123', 10);
    db.prepare('INSERT INTO users (username, password, role, full_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)').run(
      'faculty1', fHash, 'faculty', 'Ms. Sneha Joshi', 'faculty@funnlearnpreschool.edu.in', '+91 73292 83278'
    );
  }
}

function seedData(db) {
  const hash = bcrypt.hashSync('admin123', 10);
  const parentHash = bcrypt.hashSync('parent123', 10);
  const studentHash = bcrypt.hashSync('student123', 10);

  // 1. Create Admin
  db.prepare('INSERT INTO users (username, password, role, full_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)').run(
    'admin', hash, 'admin', 'Principal Admin', 'admin@funnlearnpreschool.edu.in', '+91 73292 83278'
  );

  // 2. Create Sample Parents
  const p1 = db.prepare('INSERT INTO users (username, password, role, full_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)').run(
    'parent1', parentHash, 'parent', 'Amit Sharma', 'amit.sharma@example.com', '+91 98220 12345'
  );
  const p2 = db.prepare('INSERT INTO users (username, password, role, full_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)').run(
    'parent2', parentHash, 'parent', 'Pooja Kulkarni', 'pooja.k@example.com', '+91 98220 67890'
  );

  // 3. Create Sample Students (Toddlers/Kids)
  const s1 = db.prepare('INSERT INTO users (username, password, role, full_name, email) VALUES (?, ?, ?, ?, ?)').run(
    'student1', studentHash, 'student', 'Aarav Sharma', 'aarav@funnlearnpreschool.edu.in'
  );
  const s2 = db.prepare('INSERT INTO users (username, password, role, full_name, email) VALUES (?, ?, ?, ?, ?)').run(
    'student2', studentHash, 'student', 'Ananya Kulkarni', 'ananya@funnlearnpreschool.edu.in'
  );
  const s3 = db.prepare('INSERT INTO users (username, password, role, full_name, email) VALUES (?, ?, ?, ?, ?)').run(
    'student3', studentHash, 'student', 'Rohan Deshmukh', 'rohan@funnlearnpreschool.edu.in'
  );

  const defaultAddress = 'Kalbhor Wasti, Lohegaon, Pune - 411 032';

  // 4. Link students to student table with preschool grades
  const st1 = db.prepare('INSERT INTO students (user_id, grade, section, roll_number, parent_user_id, date_of_birth, address) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    s1.lastInsertRowid, 'LKG', 'A', 'LKG-001', p1.lastInsertRowid, '2022-04-12', defaultAddress
  );
  const st2 = db.prepare('INSERT INTO students (user_id, grade, section, roll_number, parent_user_id, date_of_birth, address) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    s2.lastInsertRowid, 'UKG', 'A', 'UKG-002', p2.lastInsertRowid, '2021-08-19', defaultAddress
  );
  const st3 = db.prepare('INSERT INTO students (user_id, grade, section, roll_number, parent_user_id, date_of_birth, address) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    s3.lastInsertRowid, 'Nursery', 'B', 'NUR-005', null, '2023-01-25', defaultAddress
  );

  // 5. Seed preschool subjects & activities
  const preschoolSubjects = [
    { name: 'Phonics & Rhymes', teacher: 'Ms. Sneha Joshi', grade: 'LKG' },
    { name: 'Art & Craft', teacher: 'Ms. Meera Patil', grade: 'LKG' },
    { name: 'Numbers & Shapes', teacher: 'Ms. Sneha Joshi', grade: 'LKG' },
    { name: 'Motor Skills & Play', teacher: 'Coach Rahul More', grade: 'LKG' },
    { name: 'Reading & Phonics', teacher: 'Ms. Anjali Rao', grade: 'UKG' },
    { name: 'Basic Numeracy', teacher: 'Ms. Anjali Rao', grade: 'UKG' },
    { name: 'General Awareness', teacher: 'Ms. Meera Patil', grade: 'UKG' },
    { name: 'Sensory Play & Songs', teacher: 'Ms. Neha Kale', grade: 'Nursery' }
  ];

  for (const s of preschoolSubjects) {
    db.prepare('INSERT INTO subjects (name, teacher_name, grade, section) VALUES (?, ?, ?, ?)').run(
      s.name, s.teacher, s.grade, 'A'
    );
  }

  // 6. Seed Assessment/Milestone Scores
  const terms = ['Term 1', 'Term 2'];
  const jkgActivities = ['Phonics & Rhymes', 'Art & Craft', 'Numbers & Shapes', 'Motor Skills & Play'];
  for (const term of terms) {
    for (const subj of jkgActivities) {
      db.prepare('INSERT INTO grades (student_id, subject, score, max_score, term, exam_type, remarks) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        st1.lastInsertRowid, subj, Math.floor(Math.random() * 15) + 85, 100, term, 'Activity Assessment', 'Excellent participation and creativity'
      );
    }
  }

  const skgActivities = ['Reading & Phonics', 'Basic Numeracy', 'General Awareness', 'Art & Craft'];
  for (const term of terms) {
    for (const subj of skgActivities) {
      db.prepare('INSERT INTO grades (student_id, subject, score, max_score, term, exam_type, remarks) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        st2.lastInsertRowid, subj, Math.floor(Math.random() * 15) + 80, 100, term, 'Evaluation', 'Very observant and quick learner'
      );
    }
  }

  const nurActivities = ['Sensory Play & Songs', 'Motor Skills & Play', 'Art & Craft'];
  for (const term of terms) {
    for (const subj of nurActivities) {
      db.prepare('INSERT INTO grades (student_id, subject, score, max_score, term, exam_type, remarks) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        st3.lastInsertRowid, subj, Math.floor(Math.random() * 10) + 88, 100, term, 'Milestone Check', 'Enjoys music and group games'
      );
    }
  }

  // 7. Seed attendance (recent days)
  const statuses = ['present', 'present', 'present', 'present', 'present', 'present', 'present', 'late', 'present', 'present'];
  for (let i = 0; i < 10; i++) {
    const date = new Date();
    date.setDate(date.getDate() - (i + 1));
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    const dateStr = date.toISOString().split('T')[0];
    db.prepare('INSERT INTO attendance (student_id, date, status) VALUES (?, ?, ?)').run(st1.lastInsertRowid, dateStr, statuses[i]);
    db.prepare('INSERT INTO attendance (student_id, date, status) VALUES (?, ?, ?)').run(st2.lastInsertRowid, dateStr, statuses[(i + 1) % statuses.length]);
    db.prepare('INSERT INTO attendance (student_id, date, status) VALUES (?, ?, ?)').run(st3.lastInsertRowid, dateStr, statuses[(i + 3) % statuses.length]);
  }

  // 8. Seed Announcements for Fun N Learn
  db.prepare('INSERT INTO announcements (title, content, author_id, target_role, priority) VALUES (?, ?, ?, ?, ?)').run(
    'Welcome to Fun N Learn Preschool!',
    'We warmly welcome all our little explorers and parents to the new academic session at our Kalbhor Wasti, Lohegaon campus. We are excited for a year filled with play, laughter, and learning!',
    1, 'all', 'high'
  );
  db.prepare('INSERT INTO announcements (title, content, author_id, target_role, priority) VALUES (?, ?, ?, ?, ?)').run(
    'Parent-Teacher Interaction & Milestones Review',
    'Dear Parents, our Term 1 developmental milestone review is scheduled for next Saturday. Time slots have been shared via the portal. For queries, call +91 73292 83278.',
    1, 'parent', 'normal'
  );
  db.prepare('INSERT INTO announcements (title, content, author_id, target_role, priority) VALUES (?, ?, ?, ?, ?)').run(
    'Colors & Craft Day Notice',
    'Please dress your child in their favorite vibrant outfit this Friday for our exciting Colors & Clay Fun Workshop!',
    1, 'all', 'normal'
  );
  db.prepare('INSERT INTO announcements (title, content, author_id, target_role, priority) VALUES (?, ?, ?, ?, ?)').run(
    'Diwali & Festive Holidays Schedule',
    'Preschool will remain closed for the festive break. School reopens with regular timing: 8:30 AM to 12:30 PM.',
    1, 'all', 'high'
  );

  // 9. Seed Preschool Events
  db.prepare('INSERT INTO events (title, description, event_date, event_type) VALUES (?, ?, ?, ?)').run(
    'Annual Sports & Play Day', 'Fun races, ball balance, and obstacle tracks for all Playgroup, Nursery, and KG batches.', '2026-11-20', 'sports'
  );
  db.prepare('INSERT INTO events (title, description, event_date, event_type) VALUES (?, ?, ?, ?)').run(
    'Little Explorers Science Day', 'Interactive hands-on fun with bubbles, color mixing, and plant growth.', '2026-12-05', 'academic'
  );
  db.prepare('INSERT INTO events (title, description, event_date, event_type) VALUES (?, ?, ?, ?)').run(
    'Winter Carnival & Rhymes', 'Celebration with music, rhymes recital, dance, and parent engagement games.', '2026-12-18', 'cultural'
  );

  console.log('✅ Fun N Learn Preschool database seeded successfully.');
}

module.exports = { getDB, initDB };
