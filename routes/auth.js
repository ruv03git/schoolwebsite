const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDB } = require('../db');
const { JWT_SECRET, authenticate } = require('../middleware/auth');

const router = express.Router();

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const db = getDB();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, full_name: user.full_name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      full_name: user.full_name,
      email: user.email
    }
  });
});

// Check if email is available
router.post('/check-email', (req, res) => {
  const { email } = req.body;
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const db = getDB();
  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
  res.json({ available: !existing });
});

// Register new account
router.post('/register', (req, res) => {
  const { email, full_name, role, username, password, phone, grade } = req.body;

  if (!email || !full_name || !username || !password) {
    return res.status(400).json({ error: 'Email, full name, username, and password are required.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const allowedRoles = ['parent', 'student', 'faculty', 'teacher'];
  const userRole = allowedRoles.includes(role) ? role : 'parent';

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
  if (cleanUsername.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
  }

  const db = getDB();

  // Check email
  const existingEmail = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
  if (existingEmail) {
    return res.status(400).json({ error: 'An account with this email address already exists. Please sign in.' });
  }

  // Check username
  const existingUsername = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(cleanUsername);
  if (existingUsername) {
    return res.status(400).json({ error: 'This username is already taken. Please choose another username.' });
  }

  try {
    const hash = bcrypt.hashSync(password, 10);
    const userRes = db.prepare('INSERT INTO users (username, password, role, full_name, email, phone) VALUES (?, ?, ?, ?, ?, ?)').run(
      cleanUsername, hash, userRole, full_name.trim(), email.trim(), phone ? phone.trim() : null
    );

    const newUserId = userRes.lastInsertRowid;

    if (userRole === 'student') {
      db.prepare('INSERT INTO students (user_id, grade, section) VALUES (?, ?, ?)').run(
        newUserId, grade || 'LKG', 'A'
      );
    }

    const token = jwt.sign(
      { id: newUserId, username: cleanUsername, role: userRole, full_name: full_name.trim() },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'Account created successfully.',
      token,
      user: {
        id: newUserId,
        username: cleanUsername,
        role: userRole,
        full_name: full_name.trim(),
        email: email.trim()
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to create account. Please try again.' });
  }
});

// Get current user profile
router.get('/me', authenticate, (req, res) => {
  const db = getDB();
  const user = db.prepare('SELECT id, username, role, full_name, email, phone, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  let studentInfo = null;
  if (user.role === 'student') {
    studentInfo = db.prepare('SELECT * FROM students WHERE user_id = ?').get(user.id);
  }

  res.json({ ...user, studentInfo });
});

// Change password
router.put('/password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const db = getDB();
  const user = db.prepare('SELECT password FROM users WHERE id = ?').get(req.user.id);

  if (!bcrypt.compareSync(currentPassword, user.password)) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ message: 'Password updated successfully.' });
});

module.exports = router;
