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
const HR_EMAIL = process.env.HR_EMAIL || 'chunghr09@gmail.com';

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: SENDER_EMAIL,
    pass: SENDER_APP_PASSWORD
  }
});

async function sendNotificationEmails({ fullname, email, jobTitle, cvOriginalName, fileSize, appliedAt }) {
  try {
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
          <p>Phòng Nhân sự sẽ đánh giá hồ sơ và liên hệ phỏng vấn qua email này nếu thông tin phù hợp.</p>
          <p style="margin-top: 24px; color: #6b7280; font-size: 13px;">Trân trọng,<br><strong style="color: #374151;">Phòng Quản Trị Nhân Sự & Tuyển Dụng</strong></p>
        </div>
      `
    };

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
  `).run('user-admin-root', 'Quản Trị Viên HR', 'chunghr09@gmail.com', 'admin', hashedAdminPass, 'admin', 'active');
}

// Dữ liệu mẫu 5 vị trí việc làm
const initialJobs = [
  {
    id: 'job-1',
    title: 'Chuyên Viên C&B (Lương Thưởng & Phúc Lợi)',
    company: 'Tập đoàn Đông Dương',
    location: 'Hà Nội',
    category: 'hr',
    salary: '12.000.000 - 18.000.000 VNĐ',
    badge: 'Tuyển gấp',
    description: [
      'Thực hiện tính lương, thưởng, phụ cấp và chế độ đãi ngộ hàng tháng cho CBNV.',
      'Quản lý hồ sơ trích nộp BHXH, BHYT, BHTN và quyết toán Thuế TNCN theo luật định.',
      'Tham mưu hoàn thiện hệ thống thang bảng lương, quy chế đánh giá KPIs doanh nghiệp.'
    ],
    requirements: [
      'Tốt nghiệp ĐH chuyên ngành Quản trị nhân lực, Luật, Kinh tế lao động hoặc liên quan.',
      'Nắm vững Bộ luật Lao động 2019, Luật BHXH và các quy định pháp luật tiền lương.',
      'Sử dụng thành thạo Microsoft Excel nâng cao và phần mềm quản trị nhân sự.'
    ]
  },
  {
    id: 'job-2',
    title: 'Chuyên Viên Tuyển Dụng & Thu Hút Nhân Tài (Talent Acquisition)',
    company: 'Tập đoàn Đông Dương',
    location: 'Hà Nội',
    category: 'hr',
    salary: '10.000.000 - 16.000.000 VNĐ',
    badge: 'Hot',
    description: [
      'Tiếp nhận nhu cầu nhân sự, lập kế hoạch và triển khai các chiến dịch tuyển dụng.',
      'Tìm kiếm, sàng lọc hồ sơ ứng viên và trực tiếp tổ chức các buổi phỏng vấn chuyên môn.',
      'Phát triển thương hiệu tuyển dụng (Employer Branding) qua mạng xã hội và ngày hội việc làm.'
    ],
    requirements: [
      'Tốt nghiệp Đại học chuyên ngành Quản trị nhân lực, Quản trị kinh doanh hoặc Ngoại ngữ.',
      'Kỹ năng giao tiếp, đàm phán và thuyết phục ứng viên xuất sắc.',
      'Có tư duy nhạy bén về thị trường lao động và nguồn cung ứng viên.'
    ]
  },
  {
    id: 'job-3',
    title: 'Chuyên Viên Đào Tạo & Phát Triển Năng Lực (L&D Specialist)',
    company: 'Tập đoàn Đông Dương',
    location: 'Đà Nẵng',
    category: 'hr',
    salary: '11.000.000 - 17.000.000 VNĐ',
    badge: 'Mới',
    description: [
      'Khảo sát và phân tích nhu cầu đào tạo (TNA) định kỳ cho các phòng ban.',
      'Thiết kế khung chương trình hội nhập cho nhân viên mới và đào tạo nâng cao nghiệp vụ.',
      'Đo lường, đánh giá hiệu quả sau đào tạo và quản lý ngân sách đào tạo năm.'
    ],
    requirements: [
      'Cử nhân ngành Quản trị nhân lực, Sư phạm, Tâm lý học tổ chức hoặc liên quan.',
      'Kỹ năng đứng lớp, truyền đạt thông tin và biên soạn tài liệu giảng dạy tốt.',
      'Sáng tạo, chủ động và có tinh thần trách nhiệm cao.'
    ]
  },
  {
    id: 'job-4',
    title: 'Chuyên Viên Quan Hệ Lao Động & Truyền Thông Nội Bộ',
    company: 'Tập đoàn Đông Dương',
    location: 'TP. Hồ Chí Minh',
    category: 'hr',
    salary: '10.000.000 - 15.000.000 VNĐ',
    badge: 'Mới',
    description: [
      'Xây dựng, duy trì văn hóa doanh nghiệp và tổ chức các sự kiện gắn kết nội bộ.',
      'Quản lý hợp đồng lao động, giải quyết khiếu nại, tranh chấp lao động và kỷ luật.',
      'Tổ chức đối thoại tại nơi làm việc và hội nghị người lao động định kỳ.'
    ],
    requirements: [
      'Tốt nghiệp ĐH chuyên ngành Quản trị nhân sự, Luật Lao động hoặc Báo chí - Truyền thông.',
      'Am hiểu sâu sắc về quan hệ lao động, kỷ luật lao động và an toàn vệ sinh lao động.',
      'Năng động, nhiệt huyết và có khả năng kết nối tập thể.'
    ]
  },
  {
    id: 'job-5',
    title: 'Trưởng Nhóm Nhân Sự Tổng Hợp (HR Generalist Lead)',
    company: 'Tập đoàn Đông Dương',
    location: 'TP. Hồ Chí Minh',
    category: 'hr',
    salary: '18.000.000 - 25.000.000 VNĐ',
    badge: 'Lương cao',
    description: [
      'Quản lý và điều phối toàn diện các mảng: Tuyển dụng, C&B, Đào tạo và Quan hệ lao động.',
      'Tư vấn cho Ban Giám đốc về cơ cấu tổ chức và định biên nhân sự tối ưu.',
      'Giám sát việc tuân thủ nội quy lao động và chính sách nhân sự toàn tập đoàn.'
    ],
    requirements: [
      'Tối thiểu 3 năm kinh nghiệm trong ngành Quản trị Nhân sự (từng làm HR Generalist).',
      'Tư duy quản trị chiến lược, khả năng phân tích số liệu nhân sự (HR Analytics).',
      'Kỹ năng lãnh đạo, giải quyết vấn đề và chịu được áp lực cao.'
    ]
  }
];

const currentCount = db.prepare('SELECT COUNT(*) as count FROM jobs').get().count;
if (currentCount < 5) {
  db.prepare('DELETE FROM jobs').run();
  const insertStmt = db.prepare(`
    INSERT INTO jobs (id, title, company, location, category, salary, badge, description, requirements)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const j of initialJobs) {
    insertStmt.run(j.id, j.title, j.company, j.location, j.category, j.salary, j.badge, JSON.stringify(j.description), JSON.stringify(j.requirements));
  }
}

// ==================== MULTER UPLOAD ====================
const uploadDir = path.join(__dirname, 'uploads');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.pdf', '.doc', '.docx'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận file định dạng PDF, DOC, DOCX!'), false);
    }
  }
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'dongduong-recruitment-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 2 * 60 * 60 * 1000 }
}));

const requireAdmin = (req, res, next) => {
  if (req.session && req.session.user && req.session.user.role === 'admin') return next();
  if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
    return res.status(401).json({ error: 'Chưa xác thực quyền quản trị!' });
  }
  res.redirect('/login.html');
};

app.use(express.static(path.join(__dirname, 'public')));

// ==================== AUTH APIS ====================
app.post('/api/register', (req, res) => {
  const { fullname, email, username, password } = req.body;
  if (!fullname || !email || !username || !password) {
    return res.status(400).json({ success: false, message: 'Vui lòng điền đầy đủ các mục bắt buộc!' });
  }

  const existing = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username.trim(), email.trim());
  if (existing) {
    return res.status(400).json({ success: false, message: 'Tên đăng nhập hoặc Email này đã tồn tại!' });
  }

  const hashedPassword = bcrypt.hashSync(password.trim(), 10);
  const id = 'user-' + Date.now();

  db.prepare(`
    INSERT INTO users (id, fullname, email, username, password, role, status)
    VALUES (?, ?, ?, ?, ?, 'user', 'active')
  `).run(id, fullname.trim(), email.trim(), username.trim(), hashedPassword);

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

// API Gửi OTP Quên Mật Khẩu & Lấy Lại Tên Đăng Nhập
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Vui lòng nhập địa chỉ Email!' });

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
      from: `"Hỗ Trợ Tuyển Dụng" <${SENDER_EMAIL}>`,
      to: email.trim(),
      subject: '[Khôi phục tài khoản] Thông tin Tên đăng nhập & Mã OTP',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px;">
          <h2 style="color: #0b57d0; border-bottom: 2px solid #0b57d0; padding-bottom: 10px; margin-top: 0;">KHÔI PHỤC TÀI KHOẢN</h2>
          <p>Xin chào <strong>${user.fullname}</strong>,</p>
          <p>Tên đăng nhập hệ thống của bạn là: <strong style="color: #dc2626; font-size: 16px;">${user.username}</strong></p>
          <p>Mã xác nhận (OTP) để đặt lại mật khẩu mới:</p>
          <div style="background: #f8fafc; padding: 16px; text-align: center; border-radius: 6px; margin: 20px 0; border: 1px solid #f1f5f9;">
            <span style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #0b57d0;">${otpCode}</span>
          </div>
          <p style="color: #6b7280; font-size: 13px;">Mã này có hiệu lực trong vòng 15 phút.</p>
        </div>
      `
    });
    res.json({ success: true, message: 'Tên đăng nhập và mã OTP đã được gửi tới email của bạn!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Không thể gửi email xác nhận!' });
  }
});

// API Xác thực OTP và Đặt lại mật khẩu
app.post('/api/reset-password', (req, res) => {
  const { email, token, newPassword } = req.body;
  const record = db.prepare('SELECT * FROM password_resets WHERE email = ? AND token = ?').get(email.trim(), token.trim());
  
  if (!record || Date.now() > record.expires_at) {
    return res.status(400).json({ success: false, message: 'Mã xác nhận không chính xác hoặc đã hết hạn!' });
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

app.post('/apply', (req, res) => {
  upload.single('cv')(req, res, (err) => {
    if (err) return res.status(400).send(`<h2 style="color:red; text-align:center; margin-top:50px;">Lỗi: ${err.message} <br><a href="/">Quay lại</a></h2>`);

    const { fullname, email, jobTitle } = req.body;
    const cvFile = req.file;
    if (!cvFile) return res.status(400).send('Vui lòng chọn file CV!');

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
          <p style="color:#4b5563; font-size:14px; line-height:1.5;">Hồ sơ cho vị trí <strong>${jobTitle}</strong> đã được ghi nhận. Email xác nhận đã được gửi tới hòm thư của bạn.</p>
          <div style="margin-top:25px;"><a href="/" style="padding:10px 18px; background:#0b57d0; color:#fff; text-decoration:none; border-radius:6px; font-weight:500;">Về trang chủ</a></div>
        </div>
      </body>
      </html>
    `);
  });
});

// ==================== ADMIN ATS ====================
app.get('/admin', requireAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/applicants', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, fullname, email, job_title as jobTitle, original_name as originalName, saved_name as savedName, file_size as fileSize, applied_at as appliedAt, status FROM applicants ORDER BY rowid DESC').all();
  res.json(rows);
});

app.patch('/api/applicants/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE applicants SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

app.delete('/api/applicants/:id', requireAdmin, (req, res) => {
  const appRecord = db.prepare('SELECT saved_name FROM applicants WHERE id = ?').get(req.params.id);
  if (appRecord) {
    const filePath = path.join(uploadDir, appRecord.saved_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  db.prepare('DELETE FROM applicants WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.get('/download/:filename', requireAdmin, (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).send('Không tìm thấy file!');
  const applicant = db.prepare('SELECT original_name FROM applicants WHERE saved_name = ?').get(req.params.filename);
  res.download(filePath, applicant ? applicant.original_name : req.params.filename);
});

app.post('/api/jobs', requireAdmin, (req, res) => {
  const { title, company, location, category, salary, badge, description, requirements } = req.body;
  if (!title || !company || !salary) return res.status(400).json({ success: false, message: 'Điền thiếu dữ liệu' });

  const descArr = description ? description.split('\n').map(s => s.trim()).filter(Boolean) : [];
  const reqArr = requirements ? requirements.split('\n').map(s => s.trim()).filter(Boolean) : [];
  const id = 'job-' + Date.now();

  db.prepare(`
    INSERT INTO jobs (id, title, company, location, category, salary, badge, description, requirements)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title.trim(), company.trim(), location || 'Hà Nội', category || 'hr', salary.trim(), badge || 'Mới', JSON.stringify(descArr), JSON.stringify(reqArr));

  res.json({ success: true });
});

app.put('/api/jobs/:id', requireAdmin, (req, res) => {
  const { title, company, location, category, salary, badge, description, requirements } = req.body;
  const descArr = description ? (Array.isArray(description) ? description : description.split('\n').map(s => s.trim()).filter(Boolean)) : [];
  const reqArr = requirements ? (Array.isArray(requirements) ? requirements : requirements.split('\n').map(s => s.trim()).filter(Boolean)) : [];

  db.prepare(`
    UPDATE jobs SET title = ?, company = ?, location = ?, category = ?, salary = ?, badge = ?, description = ?, requirements = ?
    WHERE id = ?
  `).run(title.trim(), company.trim(), location || 'Hà Nội', category || 'hr', salary.trim(), badge || 'Mới', JSON.stringify(descArr), JSON.stringify(reqArr), req.params.id);

  res.json({ success: true });
});

app.delete('/api/jobs/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.listen(PORT, () => console.log(`Hệ thống đang chạy tại http://localhost:${PORT}`));