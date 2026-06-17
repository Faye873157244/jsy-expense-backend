const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'jsy-expense-monitor-secret-2026';
const DB_FILE = path.join(__dirname, 'db.json');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

// ========== MIDDLEWARE ==========
app.use(express.json({ limit: '50mb' }));

// CORS (allow all origins for now; restrict in production)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Serve static files (JS, CSS, etc.)
app.use(express.static(FRONTEND_DIR));

// ========== AUTH MIDDLEWARE ==========
function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'No token' });
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ========== AUTH ROUTES ==========
app.post('/api/auth/admin-login', (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.username === username && u.role === 'admin');
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: 'admin' }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { username: user.username, role: 'admin' } });
});

app.post('/api/auth/dept-login', (req, res) => {
  const { dept1, dept2, password } = req.body;
  const db = readDB();
  const user = db.users.find(u =>
    u.role === 'dept' &&
    u.dept1 === dept1 &&
    (dept2 ? u.dept2 === dept2 : (!u.dept2 || u.dept2 === ''))
  );
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '部门或密码错误' });
  }
  const token = jwt.sign({
    id: user.id, username: user.username, role: 'dept',
    dept1: user.dept1, dept2: user.dept2
  }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { username: user.username, role: 'dept', dept1: user.dept1, dept2: user.dept2 } });
});

app.get('/api/auth/dept-list', (req, res) => {
  const db = readDB();
  const depts = {};
  db.users.filter(u => u.role === 'dept').forEach(u => {
    if (!depts[u.dept1]) depts[u.dept1] = [];
    if (u.dept2) depts[u.dept1].push(u.dept2);
  });
  res.json({ deptList: Object.keys(depts).map(d1 => ({
    dept1: d1, dept2: depts[d1].length > 0 ? depts[d1] : null
  })) });
});

// ========== USERS ROUTES (Admin only) ==========
app.get('/api/users', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const db = readDB();
  res.json({ users: db.users || [] });
});

app.post('/api/users', authMiddleware, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const db = readDB();
  const { username, password, role, dept1, dept2, email } = req.body;
  if (db.users.find(u => u.username === username)) {
    return res.status(400).json({ error: '用户名已存在' });
  }
  const maxId = db.users.reduce((max, u) => Math.max(max, u.id), 0);
  db.users.push({
    id: maxId + 1,
    username, password: bcrypt.hashSync(password, 10), role: role || 'dept',
    dept1: dept1 || '', dept2: dept2 || '', email: email || '',
    createdAt: new Date().toISOString()
  });
  writeDB(db);
  res.json({ success: true });
});

app.delete('/api/users/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const db = readDB();
  db.users = db.users.filter(u => u.id !== parseInt(req.params.id));
  writeDB(db);
  res.json({ success: true });
});

// ========== ACTUALS ROUTES ==========
app.get('/api/actuals', authMiddleware, (req, res) => {
  const db = readDB();
  let data = db.actuals || [];
  if (req.user.role === 'dept') {
    data = data.filter(r => r.dept1 === req.user.dept1);
    if (req.user.dept2) data = data.filter(r => r.dept2 === req.user.dept2);
  }
  const { month } = req.query;
  if (month) data = data.filter(r => r.month === parseInt(month));
  res.json({ actuals: data });
});

app.post('/api/actuals/import', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { data, clearMonths } = req.body;
  const db = readDB();
  if (!db.actuals) db.actuals = [];
  if (clearMonths && Array.isArray(clearMonths)) {
    db.actuals = db.actuals.filter(r => !clearMonths.includes(r.month));
  }
  const maxId = db.actuals.reduce((max, r) => Math.max(max, r.id || 0), 0);
  data.forEach((r, idx) => {
    r.id = maxId + idx + 1;
    if (r.subj1 && !r.subject1) { r.subject1 = r.subj1; delete r.subj1; }
    if (r.subj2 && !r.subject2) { r.subject2 = r.subj2; delete r.subj2; }
    db.actuals.push(r);
  });
  writeDB(db);
  res.json({ success: true, count: data.length });
});

app.delete('/api/actuals', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { months } = req.body;
  const db = readDB();
  if (months && Array.isArray(months) && months.length > 0) {
    db.actuals = db.actuals.filter(r => !months.includes(r.month));
  } else {
    db.actuals = [];
  }
  writeDB(db);
  res.json({ success: true });
});

// ========== BUDGETS ROUTES ==========
app.get('/api/budgets', authMiddleware, (req, res) => {
  const db = readDB();
  let data = db.budgets || [];
  if (req.user.role === 'dept') {
    data = data.filter(r => r.dept1 === req.user.dept1);
    if (req.user.dept2) data = data.filter(r => r.dept2 === req.user.dept2);
  }
  const { month } = req.query;
  if (month) data = data.filter(r => r.month === parseInt(month));
  res.json({ budgets: data });
});

app.post('/api/budgets/import', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const { data, clearMonths } = req.body;
  const db = readDB();
  if (!db.budgets) db.budgets = [];
  if (clearMonths && Array.isArray(clearMonths)) {
    db.budgets = db.budgets.filter(r => !clearMonths.includes(r.month));
  }
  const maxId = db.budgets.reduce((max, r) => Math.max(max, r.id || 0), 0);
  data.forEach((r, idx) => {
    r.id = maxId + idx + 1;
    if (r.subj1 && !r.subject1) { r.subject1 = r.subj1; delete r.subj1; }
    if (r.subj2 && !r.subject2) { r.subject2 = r.subj2; delete r.subj2; }
    db.budgets.push(r);
  });
  writeDB(db);
  res.json({ success: true, count: data.length });
});

// ========== SETTINGS ROUTES ==========
app.get('/api/settings', authMiddleware, (req, res) => {
  const db = readDB();
  res.json({ settings: db.settings || {} });
});

app.post('/api/settings', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  const db = readDB();
  db.settings = { ...db.settings, ...req.body.settings };
  writeDB(db);
  res.json({ success: true });
});

// ========== SERVE FRONTEND (SPA mode) ==========
app.get('*', (req, res) => {
  const htmlPath = path.join(FRONTEND_DIR, 'index.html');
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.status(404).send('Frontend not found. Please run generate-frontend.js first.');
  }
});

// ========== DB HELPERS ==========
function readDB() {
  if (!fs.existsSync(DB_FILE)) {
    return {
      users: [{ id: 1, username: 'admin', password: bcrypt.hashSync('jsy2026', 10), role: 'admin', dept1: '', dept2: '', email: '', createdAt: new Date().toISOString() }],
      actuals: [],
      budgets: [],
      remarks: {},
      settings: { cumMonth: 5, currencySymbol: '¥', companyName: '杰西亚', fiscalYearStartMonth: 2 }
    };
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`  Expense Monitor Server`);
  console.log(`${'='.repeat(50)}`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Frontend: ${FRONTEND_DIR}`);
  console.log(`  Admin: admin / jsy2026`);
  console.log(`${'='.repeat(50)}\n`);
});
