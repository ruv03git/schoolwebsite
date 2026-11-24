const express = require('express');
const path = require('path');
const cors = require('cors');
const { initDB } = require('./db');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const parentRoutes = require('./routes/parent');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database
initDB();

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/parent', parentRoutes);

// Serve SPA pages
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/parent', (req, res) => res.sendFile(path.join(__dirname, 'public', 'parent.html')));

app.listen(PORT, () => {
  console.log(`\nFun N Learn Preschool Portal running at http://localhost:${PORT}`);
  console.log(`Campus: Kalbhor Wasti, Lohegaon, Pune - 411 032`);
  console.log(`Contact: +91 73292 83278 | Email: admin@funnlearnpreschool.edu.in\n`);
});
