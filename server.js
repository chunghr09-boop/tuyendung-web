const express = require('express');
const multer = require('multer');
const session = require('express-session');
const Database = require('better-sqlite3');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== CẤU HÌNH GỬI EMAIL (GMAIL SMTP) ====================
const SENDER_EMAIL = process.env.SENDER_EMAIL || 'chunghr09@gmail.com';
const SENDER_APP_PASSWORD = process.env.SENDER_APP_PASSWORD || 'dkqo odle fbks luxz'; // Mật khẩu ứng dụng Gmail của bạn
const HR_EMAIL = process.env.HR_EMAIL || 'chunghr09@gmail.com'; // Email phòng HR nhận thông báo hồ sơ

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: SENDER_EMAIL,
    pass: SENDER_APP_PASSWORD
  }
});

// Hàm gửi email bất đồng bộ
async function sendNotificationEmails({ fullname, email, jobTitle, cvOriginalName, fileSize, appliedAt }) {
  try {
    // 1. Email xác nhận gửi cho Ứng viên
    const mailToApplicant = {
      from: `"Phòng Tuyển Dụng - Tập Đoàn Đông Dương" <${SENDER_EMAIL}>`,
      to: email,
      subject: `[Xác nhận] Đã nhận hồ sơ ứng tuyển vị trí: ${jobTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
          <h2 style="color: #0b57d0; border-bottom: 2px solid #0b57d0; padding-bottom: 10px; margin-top: 0;">XÁC NHẬN TIẾP NHẬN HỒ SƠ</h2>
          <p>Xin chào <strong>${fullname}</strong>,</p>
          <p>Hệ thống tuyển dụng của <strong>Tập đoàn Đông Dương</strong> đã nhận được hồ sơ ứng tuyển của bạn cho vị trí: <strong style="color: #0b57d0;">${jobTitle}</strong>.</p>
          <div style="background: #f8fafc; padding: 14px 18px; border-radius: 6px; margin: 16px 0; border: 1px solid #f1f5f9;">
            <p style="margin: 4px 0;"><strong>Tệp đính kèm:</strong> ${cvOriginalName} (${fileSize})</p>
            <p style="margin: 4px 0;"><strong>Thời gian nộp:</strong> ${appliedAt}</p>
          </div>
          <p>Phòng Nhân sự sẽ đánh giá hồ sơ và liên hệ phỏng vấn qua email này nếu thông tin ứng tuyển phù hợp.</p>
          <p style="margin-top: 24px; color: #6b7280; font-size: 13px;">Trân trọng,<br><strong style="color: #374151;">Phòng Quản Trị Nhân Sự & Tuyển Dụng</strong></p>
        </div>
      `
    };

    // 2. Email thông báo hồ sơ mới gửi cho HR
    const mailToHR = {
      from: `"Cổng Tuyển Dụng" <${SENDER_EMAIL}>`,
      to: HR_EMAIL,
      subject: `[CV Mới] Ứng viên ${fullname} nộp vị trí ${jobTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
          <h2 style="color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 10px; margin-top: 0;">THÔNG BÁO: CÓ HỒ SƠ ỨNG TUYỂN MỚI</h2>
          <p>Hệ thống vừa ghi nhận thêm một lượt nộp CV với thông tin:</p>
          <ul style="line-height: 1.8;">
            <li><strong>Họ tên ứng viên:</strong> ${fullname}</li>
            <li><strong>Email:</strong> ${email}</li>
            <li><strong>Vị trí:</strong> ${jobTitle}</li>
            <li><strong>Tên tệp:</strong> ${cvOriginalName} (${fileSize})</li>
            <li><strong>Thời gian gửi:</strong> ${appliedAt}</li>
          </ul>
          <p style="margin-top: 18px;">Vui lòng truy cập trang Dashboard Admin để tải và duyệt CV.</p>
        </div>
      `
    };

    await Promise.all([
      transporter.sendMail(mailToApplicant),
      transporter.sendMail(mailToHR)
    ]);
    console.log(`[Email] Đã gửi thông báo cho ứng viên ${email} và HR.`);
  } catch (error) {
    console.error('[Email Error] Gửi mail không thành công:', error.message);
  }
}

// ==================== CƠ SỞ DỮ LIỆU SQLITE ====================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const db = new Database(path.join(__dirname, 'recruitment.db'));

db.exec(`
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
    applied_at TEXT NOT NULL
  );
`);

// Tạo dữ liệu việc làm mẫu nếu bảng trống
const jobCount = db.prepare('SELECT COUNT(*) as count FROM jobs').get().count;
if (jobCount === 0) {
  const insertJob = db.prepare(`
    INSERT INTO jobs (id, title, company, location, category, salary, badge, description, requirements)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertJob.run(
    'job-1',
    'Chuyên Viên C&B (Lương Thưởng & Phúc Lợi)',
    'Tập đoàn Đông Dương',
    'Hà Nội',
    'hr',
    '12.000.000 - 18.000.000 VNĐ',
    'Tuyển gấp',
    JSON.stringify([
      'Quản lý chính sách đãi ngộ, hệ thống thang bảng lương và KPIs.',
      'Thực hiện tính lương, thưởng và chế độ BHXH, BHYT, BHTN theo luật định.'
    ]),
    JSON.stringify([
      'Tốt nghiệp ĐH chuyên ngành Quản trị nhân lực, Luật hoặc liên quan.',
      'Nắm vững Bộ luật Lao động và quy định BHXH hiện hành.'
    ])
  );
}

// ==================== MULTER UPLOAD BẢO MẬT ====================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
  }
});

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx'];

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_MIME_TYPES.includes(file.mimetype) && ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file định dạng PDF, DOC, DOCX!'), false);
    }
  }
});

// Middlewares
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'dongduong-recruitment-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 2 * 60 * 60 * 1000 }
}));

const requireAuth = (req, res, next) => {
  if (req.session && req.session.isAdmin) return next();
  if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
    return res.status(401).json({ error: 'Chưa xác thực quyền quản trị!' });
  }
  res.redirect('/login.html');
};

app.use(express.static(path.join(__dirname, 'public')));

// ==================== AUTH ROUTES ====================
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'admin123') {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, message: 'Tài khoản hoặc mật khẩu không đúng!' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// ==================== PUBLIC API ====================
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

  query += ' ORDER BY rowid DESC';
  const rows = db.prepare(query).all(...params);

  const jobs = rows.map(r => ({
    ...r,
    description: r.description ? JSON.parse(r.description) : [],
    requirements: r.requirements ? JSON.parse(r.requirements) : []
  }));

  res.json(jobs);
});

// Tuyển dụng & gửi mail
app.post('/apply', (req, res) => {
  upload.single('cv')(req, res, (err) => {
    if (err) return res.status(400).send(`<h2 style="color:red; text-align:center; margin-top:50px;">Lỗi: ${err.message} <br><a href="/">Quay lại</a></h2>`);

    const { fullname, email, jobTitle } = req.body;
    const cvFile = req.file;
    if (!cvFile) return res.status(400).send('Vui lòng chọn file CV!');

    const appliedAt = new Date().toLocaleString('vi-VN');
    const fileSize = (cvFile.size / 1024).toFixed(1) + ' KB';

    // 1. Ghi vào Database
    const insertApplicant = db.prepare(`
      INSERT INTO applicants (id, fullname, email, job_title, original_name, saved_name, file_size, applied_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertApplicant.run(
      Date.now().toString(),
      fullname.trim(),
      email.trim(),
      jobTitle || 'Chuyên viên',
      cvFile.originalname,
      cvFile.filename,
      fileSize,
      appliedAt
    );

    // 2. Gửi mail tự động
    sendNotificationEmails({
      fullname: fullname.trim(),
      email: email.trim(),
      jobTitle: jobTitle || 'Chuyên viên',
      cvOriginalName: cvFile.originalname,
      fileSize: fileSize,
      appliedAt: appliedAt
    });

    // 3. Trả về giao diện thông báo
    res.send(`
      <!DOCTYPE html>
      <html lang="vi">
      <head><meta charset="UTF-8"><title>Nộp hồ sơ thành công</title><link rel="stylesheet" href="style.css"></head>
      <body style="display:flex; justify-content:center; align-items:center; min-height:100vh; background:#f0f2f5;">
        <div style="background:#fff; padding:40px; border-radius:10px; text-align:center; box-shadow:0 4px 15px rgba(0,0,0,0.08); max-width:450px;">
          <div style="font-size:48px; color:#10b981; margin-bottom:15px;">✓</div>
          <h2 style="color:#111827; margin-bottom:10px;">Ứng Tuyển Thành Công!</h2>
          <p style="color:#4b5563; font-size:14px; line-height:1.5;">Hồ sơ cho vị trí <strong>${jobTitle}</strong> đã được ghi nhận. Email xác nhận đã được gửi tới hòm thư của bạn.</p>
          <div style="margin-top:25px;"><a href="/" style="padding:10px 18px; background:#0b57d0; color:#fff; text-decoration:none; border-radius:6px; font-weight:500;">Về trang chủ</a></div>
        </div>
      </body>
      </html>
    `);
  });
});

// ==================== ADMIN API ====================
app.get('/admin', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/applicants', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT id, fullname, email, job_title as jobTitle, original_name as originalName, saved_name as savedName, file_size as fileSize, applied_at as appliedAt FROM applicants ORDER BY rowid DESC').all();
  res.json(rows);
});

app.get('/download/:filename', requireAuth, (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Không tìm thấy file!');
  
  const applicant = db.prepare('SELECT original_name FROM applicants WHERE saved_name = ?').get(req.params.filename);
  res.download(filePath, applicant ? applicant.original_name : req.params.filename);
});

app.post('/api/jobs', requireAuth, (req, res) => {
  const { title, company, location, category, salary, badge, description, requirements } = req.body;
  if (!title || !company || !salary) return res.status(400).json({ success: false, message: 'Điền thiếu dữ liệu' });

  const descArr = description ? description.split('\n').filter(line => line.trim() !== '') : [];
  const reqArr = requirements ? requirements.split('\n').filter(line => line.trim() !== '') : [];
  const id = 'job-' + Date.now();

  const insert = db.prepare(`
    INSERT INTO jobs (id, title, company, location, category, salary, badge, description, requirements)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    id,
    title.trim(),
    company.trim(),
    location || 'Hà Nội',
    category || 'hr',
    salary.trim(),
    badge || 'Mới',
    JSON.stringify(descArr),
    JSON.stringify(reqArr)
  );

  res.json({ success: true });
});

app.delete('/api/jobs/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`Hệ thống tuyển dụng sẵn sàng tại http://localhost:${PORT}`));