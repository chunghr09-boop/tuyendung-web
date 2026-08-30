const express = require('express');
const multer = require('multer');
const session = require('express-session');
const Database = require('better-sqlite3');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CẤU HÌNH GỬI EMAIL SMTP SSL ====================
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'chunghr09@gmail.com';
const SENDER_APP_PASSWORD = process.env.SENDER_APP_PASSWORD || 'dkqoodlefbksluxz';
const ADMIN_FALLBACK_EMAIL = 'chunghr09@gmail.com';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: SENDER_EMAIL,
    pass: SENDER_APP_PASSWORD
  }
});

async function sendNotificationEmails({ fullname, email, jobTitle, hrEmail, cvOriginalName, fileSize, appliedAt }) {
  try {
    const mailToApplicant = {
      from: `"Phòng Tuyển Dụng" <${SENDER_EMAIL}>`,
      to: email,
      subject: `[Xác nhận] Đã nhận hồ sơ ứng tuyển vị trí: ${jobTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
          <h2 style="color: #0b57d0; border-bottom: 2px solid #0b57d0; padding-bottom: 10px; margin-top: 0;">XÁC NHẬN TIẾP NHẬN HỒ SƠ</h2>
          <p>Xin chào <strong>${fullname}</strong>,</p>
          <p>Hệ thống đã ghi nhận hồ sơ ứng tuyển của bạn cho vị trí: <strong style="color: #0b57d0;">${jobTitle}</strong>.</p>
          <div style="background: #f8fafc; padding: 14px 18px; border-radius: 6px; margin: 16px 0; border: 1px solid #f1f5f9;">
            <p style="margin: 4px 0;"><strong>Tệp đính kèm:</strong> ${cvOriginalName} (${fileSize})</p>
            <p style="margin: 4px 0;"><strong>Thời gian nộp:</strong> ${appliedAt}</p>
          </div>
          <p>Nhà tuyển dụng sẽ liên hệ trực tiếp nếu hồ sơ của bạn phù hợp.</p>
        </div>
      `
    };

    // Gửi CV về email riêng của Nhà tuyển dụng đã đăng bài (hoặc fallback về admin)
    const targetHREmail = hrEmail || ADMIN_FALLBACK_EMAIL;
    const mailToHR = {
      from: `"Cổng Tuyển Dụng" <${SENDER_EMAIL}>`,
      to: targetHREmail,
      subject: `[CV Mới] Ứng viên ${fullname} nộp vị trí ${jobTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
          <h2 style="color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 10px; margin-top: 0;">THÔNG BÁO: CÓ HỒ SƠ ỨNG TUYỂN MỚI</h2>
          <p>Hệ thống vừa ghi nhận lượt nộp CV cho bài đăng của bạn:</p>
          <ul style="line-height: 1.8;">
            <li><strong>Họ tên ứng viên:</strong> ${fullname}</li>
            <li><strong>Email ứng viên:</strong> ${email}</li>
            <li><strong>Vị trí ứng tuyển:</strong> ${jobTitle}</li>
            <li><strong>Tên tệp CV:</strong> ${cvOriginalName} (${fileSize})</li>
            <li><strong>Thời gian gửi:</strong> ${appliedAt}</li>
          </ul>
          <p style="margin-top: 18px;">Vui lòng truy cập trang Quản Trị / Dashboard để tải CV.</p>
        </div>
      `
    };

    await Promise.all([
      transporter.sendMail(mailToApplicant),
      transporter.sendMail(mailToHR)
    ]);
  } catch (error) {
    console.error('[Email Error]:', error.message);
  }
}

// ==================== DATABASE SQLITE ====================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(path.join(__dirname, 'recruitment.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    fullname TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT NOT NULL,
    category TEXT NOT NULL,
    salary TEXT NOT NULL,
    badge TEXT DEFAULT 'Mới',
    description TEXT,
    requirements TEXT,
    employer_email TEXT DEFAULT 'chunghr09@gmail.com',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS applicants (
    id TEXT PRIMARY KEY,
    fullname TEXT NOT NULL,
    email TEXT NOT NULL,
    job_title TEXT NOT NULL,
    original_name TEXT NOT NULL,
    saved_name TEXT NOT NULL,
    file_size TEXT NOT NULL,
    applied_at TEXT NOT NULL,
    status TEXT DEFAULT 'pending'
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    email TEXT NOT NULL,
    token TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );
`);

// Tạo tài khoản Admin mặc định
const existingAdmin = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
if (!existingAdmin) {
  const hashedAdminPass = bcrypt.hashSync('admin123', 10);
  db.prepare(`
    INSERT INTO users (id, fullname, email, username, password, role, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('user-admin-root', 'Quản Trị Viên Hệ Thống', 'chunghr09@gmail.com', 'admin', hashedAdminPass, 'admin', 'active');
}

// Middleware kiểm tra quyền truy cập (Admin hoặc Nhà tuyển dụng)
const requireStaffOrAdmin = (req, res, next) => {
  if (req.session && req.session.user && (req.session.user.role === 'admin' || req.session.user.role === 'employer')) {
    return next();
  }
  if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
    return res.status(401).json({ error: 'Chưa xác thực quyền Nhà tuyển dụng!' });
  }
  res.redirect('/login.html');
};

const requireAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
    return res.status(401).json({ error: 'Chưa xác thực quyền Admin!' });
  }
  res.redirect('/login.html');
};

// ==================== AUTH APIS ====================
app.post('/api/register', (req, res) => {
  const { fullname, email, username, password, role } = req.body;
  if (!fullname || !email || !username || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ các mục bắt buộc!' });
  }

  const existing = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username.trim(), email.trim());
  if (existing) {
    return res.status(400).json({ success: false, message: 'Tên đăng nhập hoặc Email này đã tồn tại!' });
  }

  const assignedRole = (role === 'employer') ? 'employer' : 'user';
  const hashedPassword = bcrypt.hashSync(password.trim(), 10);
  const id = 'user-' + Date.now();

  db.prepare(`
    INSERT INTO users (id, fullname, email, username, password, role, status)
    VALUES (?, ?, ?, ?, ?, ?, 'active')
  `).run(id, fullname.trim(), email.trim(), username.trim(), hashedPassword, assignedRole);

  res.json({ success: true, message: 'Đăng ký tài khoản thành công!' });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());

  if (!user) {
    return res.status(401).json({ success: false, message: 'Tài khoản hoặc mật khẩu không chính xác!' });
  }

  let isMatch = false;
  if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
    isMatch = bcrypt.compareSync(password.trim(), user.password);
  } else {
    isMatch = (user.password === password.trim());
  }

  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Tài khoản hoặc mật khẩu không chính xác!' });
  }

  if (user.status === 'blocked') {
    return res.status(403).json({ success: false, message: 'Tài khoản của bạn đã bị khóa bởi Quản trị viên!' });
  }

  req.session.user = {
    id: user.id,
    fullname: user.fullname,
    email: user.email,
    username: user.username,
    role: user.role
  };

  res.json({ success: true, user: req.session.user });
});

// API Quên mật khẩu & OTP
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Vui lòng nhập email!' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim());
  if (!user) {
    return res.json({ success: true, message: 'Nếu email tồn tại, hệ thống đã gửi mã xác nhận!' });
  }

  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 15 * 60 * 1000;

  db.prepare('DELETE FROM password_resets WHERE email = ?').run(email.trim());
  db.prepare('INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)').run(email.trim(), otpCode, expiresAt);

  try {
    await transporter.sendMail({
      from: `"Hỗ Trợ Hệ Thống" <${SENDER_EMAIL}>`,
      to: email.trim(),
      subject: '[Khôi phục tài khoản] Mã OTP & Tên đăng nhập',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
          <h2 style="color: #0b57d0; border-bottom: 2px solid #0b57d0; padding-bottom: 10px; margin-top: 0;">KHÔI PHỤC TÀI KHOẢN</h2>
          <p>Xin chào <strong>${user.fullname}</strong>,</p>
          <p>Tên đăng nhập của bạn: <strong style="color: #dc2626; font-size: 16px;">${user.username}</strong></p>
          <p>Mã OTP đặt lại mật khẩu:</p>
          <div style="background: #f8fafc; padding: 16px; text-align: center; border-radius: 6px; margin: 20px 0;">
            <span style="font-size: 28px; font-weight: bold; color: #0b57d0; letter-spacing: 4px;">${otpCode}</span>
          </div>
        </div>
      `
    });
    res.json({ success: true, message: 'Đã gửi thông tin tới email của bạn!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Lỗi gửi email!' });
  }
});

app.post('/api/reset-password', (req, res) => {
  const { email, token, newPassword } = req.body;
  const record = db.prepare('SELECT * FROM password_resets WHERE email = ? AND token = ?').get(email.trim(), token.trim());
  
  if (!record || Date.now() > record.expires_at) {
    return res.status(400).json({ success: false, message: 'Mã OTP không chính xác hoặc đã hết hạn!' });
  }

  const hashedPass = bcrypt.hashSync(newPassword.trim(), 10);
  db.prepare('UPDATE users SET password = ? WHERE email = ?').run(hashedPass, email.trim());
  db.prepare('DELETE FROM password_resets WHERE email = ?').run(email.trim());

  res.json({ success: true, message: 'Đặt lại mật khẩu thành công!' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ==================== ADMIN USERS API ====================
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, fullname, email, username, role, status, created_at FROM users ORDER BY rowid DESC').all();
  res.json(rows);
});

app.patch('/api/admin/users/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (targetUser && targetUser.username === 'admin') {
    return res.status(400).json({ success: false, message: 'Không thể khóa tài khoản Admin tối cao!' });
  }
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (targetUser && targetUser.username === 'admin') {
    return res.status(400).json({ success: false, message: 'Không thể xóa tài khoản Admin tối cao!' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ==================== PUBLIC JOBS & APPLY ====================
app.get('/api/jobs', (req, res) => {
  const { keyword, location, category } = req.query;
  let query = 'SELECT * FROM jobs WHERE 1=1';
  const params = [];

  if (category && category !== 'all') {
    query += ' AND category = ?';
    params.push(category);
  }
  if (location && location !== 'all') {
    query += ' AND LOWER(location) = LOWER(?)';
    params.push(location);
  }
  if (keyword) {
    query += ' AND (LOWER(title) LIKE ? OR LOWER(company) LIKE ?)';
    const kw = `%${keyword.toLowerCase().trim()}%`;
    params.push(kw, kw);
  }

  query += ' ORDER BY rowid ASC';
  const rows = db.prepare(query).all(...params);
  const jobs = rows.map(r => ({
    ...r,
    description: r.description ? JSON.parse(r.description) : [],
    requirements: r.requirements ? JSON.parse(r.requirements) : []
  }));
  res.json(jobs);
});

// Nộp CV ứng tuyển
const uploadDir = path.join(__dirname, 'uploads');
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 }
});

app.post('/apply', (req, res) => {
  upload.single('cv')(req, res, (err) => {
    if (err) return res.status(400).send(`Lỗi upload file: ${err.message}`);

    const { fullname, email, jobTitle } = req.body;
    const cvFile = req.file;
    if (!cvFile) return res.status(400).send('Vui lòng chọn file CV!');

    // Lấy email nhà tuyển dụng đã đăng bài này để gửi CV về đúng email đó
    const jobRecord = db.prepare('SELECT employer_email FROM jobs WHERE title = ?').get(jobTitle);
    const employerEmail = jobRecord ? jobRecord.employer_email : ADMIN_FALLBACK_EMAIL;

    const appliedAt = new Date().toLocaleString('vi-VN');
    const fileSize = (cvFile.size / 1024).toFixed(1) + ' KB';

    db.prepare(`
      INSERT INTO applicants (id, fullname, email, job_title, original_name, saved_name, file_size, applied_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(Date.now().toString(), fullname.trim(), email.trim(), jobTitle || 'Chuyên viên', cvFile.originalname, cvFile.filename, fileSize, appliedAt);

    sendNotificationEmails({
      fullname: fullname.trim(),
      email: email.trim(),
      jobTitle: jobTitle || 'Chuyên viên',
      hrEmail: employerEmail,
      cvOriginalName: cvFile.originalname,
      fileSize: fileSize,
      appliedAt: appliedAt
    });

    res.send(`
      <!DOCTYPE html>
      <html lang="vi">
      <head><meta charset="UTF-8"><title>Nộp hồ sơ thành công</title><link rel="stylesheet" href="style.css"></head>
      <body style="display:flex; justify-content:center; align-items:center; min-height:100vh; background:#f0f2f5;">
        <div style="background:#fff; padding:40px; border-radius:10px; text-align:center; box-shadow:0 4px 15px rgba(0,0,0,0.08); max-width:450px;">
          <div style="font-size:48px; color:#10b981; margin-bottom:15px;">✓</div>
          <h2 style="color:#111827; margin-bottom:10px;">Ứng Tuyển Thành Công!</h2>
          <p style="color:#4b5563; font-size:14px; line-height:1.5;">Hồ sơ cho vị trí <strong>${jobTitle}</strong> đã được ghi nhận và gửi đến Nhà tuyển dụng.</p>
          <div style="margin-top:25px;"><a href="/" style="padding:10px 18px; background:#0b57d0; color:#fff; text-decoration:none; border-radius:6px;">Về trang chủ</a></div>
        </div>
      </body>
      </html>
    `);
  });
});

// ==================== DASHBOARD ADMIN / NHÀ TUYỂN DỤNG ====================
app.get('/admin', requireStaffOrAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API phân quyền thông tin người dùng đang đăng nhập
app.get('/api/current-user', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
});

// Lấy danh sách hồ sơ ứng viên (Admin xem tất cả, Employer có thể xem hoặc quản lý bài đăng của mình)
app.get('/api/applicants', requireStaffOrAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, fullname, email, job_title as jobTitle, original_name as originalName, saved_name as savedName, file_size as fileSize, applied_at as appliedAt, status FROM applicants ORDER BY rowid DESC').all();
  res.json(rows);
});

app.patch('/api/applicants/:id/status', requireStaffOrAdmin, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE applicants SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

app.delete('/api/applicants/:id', requireStaffOrAdmin, (req, res) => {
  const appRecord = db.prepare('SELECT saved_name FROM applicants WHERE id = ?').get(req.params.id);
  if (appRecord) {
    const filePath = path.join(uploadDir, appRecord.saved_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  db.prepare('DELETE FROM applicants WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/download/:filename', requireStaffOrAdmin, (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Không tìm thấy file!');
  const applicant = db.prepare('SELECT original_name FROM applicants WHERE saved_name = ?').get(req.params.filename);
  res.download(filePath, applicant ? applicant.original_name : req.params.filename);
});

// Quản lý Tin Tuyển Dụng (Nhà tuyển dụng & Admin đều đăng/sửa được bài)
app.post('/api/jobs', requireStaffOrAdmin, (req, res) => {
  const { title, company, location, category, salary, badge, description, requirements } = req.body;
  if (!title || !company || !salary) return res.status(400).json({ success: false, message: 'Điền thiếu dữ liệu' });

  const descArr = description ? description.split('\n').map(s => s.trim()).filter(Boolean) : [];
  const reqArr = requirements ? requirements.split('\n').map(s => s.trim()).filter(Boolean) : [];
  const id = 'job-' + Date.now();
  const employerEmail = req.session.user ? req.session.user.email : ADMIN_FALLBACK_EMAIL;

  db.prepare(`
    INSERT INTO jobs (id, title, company, location, category, salary, badge, description, requirements, employer_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title.trim(), company.trim(), location || 'Hà Nội', category || 'hr', salary.trim(), badge || 'Mới', JSON.stringify(descArr), JSON.stringify(reqArr), employerEmail);

  res.json({ success: true });
});

app.put('/api/jobs/:id', requireStaffOrAdmin, (req, res) => {
  const { title, company, location, category, salary, badge, description, requirements } = req.body;
  const descArr = description ? (Array.isArray(description) ? description : description.split('\n').map(s => s.trim()).filter(Boolean)) : [];
  const reqArr = requirements ? (Array.isArray(requirements) ? requirements : requirements.split('\n').map(s => s.trim()).filter(Boolean)) : [];

  db.prepare(`
    UPDATE jobs SET title = ?, company = ?, location = ?, category = ?, salary = ?, badge = ?, description = ?, requirements = ?
    WHERE id = ?
  `).run(title.trim(), company.trim(), location || 'Hà Nội', category || 'hr', salary.trim(), badge || 'Mới', JSON.stringify(descArr), JSON.stringify(reqArr), req.params.id);

  res.json({ success: true });
});

app.delete('/api/jobs/:id', requireStaffOrAdmin, (req, res) => {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.use(express.static(path.join(__dirname, 'public')));
app.listen(PORT, () => console.log(`Hệ thống đang chạy tại http://localhost:${PORT}`));