const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Helper to parse cookies from request header
function parseCookies(req) {
  const list = {};
  const rc = req.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      if (parts.length >= 2) {
        list[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('='));
      }
    });
  }
  return list;
}

// Authentication check middleware for Admin routes
function requireAdminAuth(req, res, next) {
  const cookies = parseCookies(req);
  const authHeader = req.headers.authorization;
  let token = cookies.admin_session;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  if (token && db.isValidSession(token)) {
    req.adminToken = token;
    return next();
  }

  // API calls return 401 JSON
  if (req.originalUrl.startsWith('/api/') || req.baseUrl.startsWith('/api/') || req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please log in as administrator.' });
  }

  // Page visits redirect to /login
  return res.redirect('/login');
}

// Serve public static assets (CSS, JS, images) without auto-serving index.html at /
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Admin Login Page
app.get('/login', (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.admin_session && db.isValidSession(cookies.admin_session)) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Admin Root (Protected)
app.get('/', requireAdminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Intercept direct /index.html requests
app.get('/index.html', requireAdminAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Helper to construct UPI URI and QR Data URL
async function generatePaymentQr(upiId, payeeName, amount, note) {
  try {
    const cleanUpi = (upiId || 'himanshu1461@ptyes').trim();
    // Official bank registration name with verified spacing (matches YES Bank records)
    const cleanPayee = (payeeName || 'HIMANSHU  WALIA').trim();
    const cleanAmount = Number(amount || 0).toFixed(2);
    const cleanNote = (note || 'School Bus Fee').replace(/[^a-zA-Z0-9 -]/g, ' ').substring(0, 50);

    // 1. Official Verified Bank URI (Matches original bank scanner exactly - zero risk alerts in GPay/PhonePe)
    const cleanBankUri = `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent(cleanPayee)}`;

    // 2. Dynamic URI with pre-filled amount
    const dynamicUri = `upi://pay?pa=${encodeURIComponent(cleanUpi)}&pn=${encodeURIComponent(cleanPayee)}&am=${cleanAmount}&cu=INR&tn=${encodeURIComponent(cleanNote)}`;

    // Generate Official Clean QR code
    const cleanQrDataUrl = await QRCode.toDataURL(cleanBankUri, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'M'
    });

    // Generate Dynamic QR code
    const dynamicQrDataUrl = await QRCode.toDataURL(dynamicUri, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      },
      errorCorrectionLevel: 'M'
    });

    return {
      upiUri: cleanBankUri,
      cleanBankUri,
      dynamicUri,
      qrDataUrl: cleanQrDataUrl,
      cleanQrDataUrl,
      dynamicQrDataUrl,
      officialScannerImage: '/scanner.png'
    };
  } catch (err) {
    console.error('QR generation error:', err);
    return { upiUri: '', qrDataUrl: '' };
  }
}

// ==========================================
// ADMIN AUTHENTICATION API
// ==========================================

// Login
app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required.' });
    }
    const isValid = db.verifyAdminCredentials(username, password);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid username or password.' });
    }
    const session = db.createAdminSession(username);
    const maxAgeSeconds = 30 * 24 * 60 * 60; // 30 days
    res.setHeader('Set-Cookie', `admin_session=${session.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`);
    return res.json({
      success: true,
      message: 'Login successful',
      token: session.token,
      username: session.username
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Check Session Status
app.get('/api/auth/check', (req, res) => {
  const cookies = parseCookies(req);
  const authHeader = req.headers.authorization;
  let token = cookies.admin_session;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (token && db.isValidSession(token)) {
    return res.json({ success: true, authenticated: true });
  }
  return res.json({ success: true, authenticated: false });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const cookies = parseCookies(req);
  const authHeader = req.headers.authorization;
  let token = cookies.admin_session;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }
  if (token) {
    db.destroySession(token);
  }
  res.setHeader('Set-Cookie', 'admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return res.json({ success: true, message: 'Logged out successfully' });
});

// Change Admin Credentials (Protected)
app.post('/api/auth/change-credentials', requireAdminAuth, (req, res) => {
  try {
    const { currentPassword, newUsername, newPassword } = req.body;
    const creds = db.getAdminCredentials();
    if (!currentPassword || currentPassword !== creds.password) {
      return res.status(400).json({ success: false, error: 'Current password does not match.' });
    }
    if (newPassword && newPassword.length < 4) {
      return res.status(400).json({ success: false, error: 'New password must be at least 4 characters long.' });
    }
    const updated = db.updateAdminCredentials(newUsername, newPassword);
    return res.json({
      success: true,
      message: 'Admin credentials updated successfully!',
      data: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// PUBLIC PARENT-FACING API
// ==========================================

// 1. Public list of Buses for parent selection
app.get('/api/public/buses', (req, res) => {
  try {
    const { school } = req.query;
    const buses = db.getBuses({ school });
    const publicList = buses.map(b => ({
      id: b.id,
      busNumber: b.busNumber,
      route: b.route,
      schoolName: b.schoolName || '',
      schoolId: b.schoolId || '',
      studentCount: b.studentCount || 0
    }));
    res.json({ success: true, data: publicList });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1b. Public list of schools for parent filter
app.get('/api/public/schools', (req, res) => {
  try {
    const schools = db.getSchools().map(s => ({
      id: s.id,
      name: s.name,
      code: s.code
    }));
    res.json({ success: true, data: schools });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Public list of students in a selected Bus (strictly requires school and bus selection)
app.get('/api/public/students', (req, res) => {
  try {
    const { busNumber, search, school } = req.query;

    // Do not return any student records if school and bus are not both selected (unless searching)
    if ((!school || !busNumber) && !search) {
      return res.json({ success: true, data: [] });
    }

    let students = db.getStudents({ busNumber, search, school });
    const settings = db.getSettings();

    // Sanitize to only what parents need to identify their child (fee amount is not exposed in public list)
    const publicStudents = students.map(s => {
      let maskedPhone = '';
      if (s.parentPhone && s.parentPhone.length >= 4) {
        maskedPhone = '*'.repeat(Math.max(0, s.parentPhone.length - 4)) + s.parentPhone.slice(-4);
      }

      const dueDetails = db.getStudentDueDetails(s, settings);

      return {
        token: s.token,
        name: s.name,
        busNumber: s.busNumber,
        routeStop: s.routeStop,
        classGrade: s.classGrade,
        schoolName: s.schoolName,
        dueDetails,
        billingPeriod: (dueDetails && dueDetails.targetMonth) || s.billingPeriod,
        dueMonth: (dueDetails && dueDetails.targetMonth) || s.billingPeriod,
        hasPastDue: Boolean(dueDetails && dueDetails.hasPastDue),
        dueTitle: dueDetails ? dueDetails.dueTitle : `Due: ${s.billingPeriod}`,
        status: s.status,
        serviceStatus: s.serviceStatus || 'active',
        isServiceStopped: Boolean(dueDetails && dueDetails.isServiceStopped),
        leftFromMonth: s.leftFromMonth || null,
        maskedPhone
      };
    });

    res.json({ success: true, data: publicStudents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Get individual student bill details & QR code (Supports Sibling Clubbing & Due Fees)
app.get('/api/pay/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const student = db.getStudentByToken(token);

    if (!student) {
      return res.status(404).json({
        success: false,
        error: 'Student payment record not found. Please verify the child details.'
      });
    }

    const settings = db.getSettings();
    const isClubbed = req.query.clubSiblings === 'true';
    const siblings = db.getSiblingsByToken(token) || [];
    const dueDetails = db.getStudentDueDetails(student, settings);

    // Determine target month:
    // 1. Explicitly requested month (?month=...)
    // 2. Or month awaiting verification
    // 3. Or oldest due month from dueDetails
    // 4. Or active billing period
    const submittedMonth = Object.keys(student.monthlyHistory || {}).find(m => student.monthlyHistory[m]?.status === 'submitted');
    const requestedMonth = req.query.month;
    const targetMonth = requestedMonth || submittedMonth || (dueDetails && dueDetails.targetMonth) || student.billingPeriod || "September 2026";

    const monthRecord = (student.monthlyHistory && student.monthlyHistory[targetMonth]) || null;
    const monthStatus = monthRecord ? monthRecord.status : (student.status || 'pending');
    const activeBillingMonth = settings.activeMonth || "September 2026";
    const isCurrentOrUpcoming = db.FY_MONTHS.indexOf(targetMonth) >= db.FY_MONTHS.indexOf(activeBillingMonth);
    const monthAmount = (monthStatus === 'paid' && monthRecord) 
      ? Number(monthRecord.amount) 
      : (isCurrentOrUpcoming 
          ? (Number(student.amount) || (dueDetails ? dueDetails.targetAmount : 2310)) 
          : ((monthRecord && Number(monthRecord.amount)) || (dueDetails ? dueDetails.targetAmount : (Number(student.amount) || 0))));
    const monthPaidAt = monthRecord?.paidAt || (monthStatus === 'paid' ? student.paidAt : null);
    const monthPaymentRef = monthRecord?.voucher || (monthStatus === 'paid' || monthStatus === 'submitted' ? student.paymentRef : '');
    const monthPaymentApp = monthRecord?.method || student.paymentApp || '';
    const monthPayerInfo = monthRecord?.payerInfo || student.payerInfo || '';

    // Calculate payment amount & list of students in this payment
    const targetAmount = monthAmount;
    let totalAmount = targetAmount;
    let combinedNames = student.name;
    let studentsInPayment = [{
      token: student.token,
      id: student.id,
      name: student.name,
      busNumber: student.busNumber,
      amount: targetAmount,
      status: monthStatus,
      classGrade: student.classGrade
    }];

    if (isClubbed && siblings.length > 0) {
      siblings.forEach(sib => {
        const sibDue = db.getStudentDueDetails(sib, settings);
        const sibAmt = sibDue ? sibDue.targetAmount : (Number(sib.amount) || 0);
        totalAmount += sibAmt;
        studentsInPayment.push({
          token: sib.token,
          id: sib.id,
          name: sib.name,
          busNumber: sib.busNumber,
          amount: sibAmt,
          status: sib.status,
          classGrade: sib.classGrade
        });
      });
      combinedNames = studentsInPayment.map(s => s.name).join(' & ');
    }

    // Prepare payment note (includes exact target month being cleared!)
    const note = `Bus Fee ${combinedNames} ${student.busNumber} ${targetMonth}`.replace(/[^a-zA-Z0-9 -]/g, ' ').substring(0, 50);
    const qrInfo = await generatePaymentQr(
      settings.upiId,
      settings.upiPayeeName || 'HIMANSHU  WALIA',
      totalAmount,
      note
    );

    const parentView = {
      token: student.token,
      id: student.id,
      name: student.name,
      busNumber: student.busNumber,
      routeStop: student.routeStop,
      classGrade: student.classGrade,
      schoolName: student.schoolName,
      rollNo: student.rollNo,
      parentName: student.parentName,
      parentPhone: student.parentPhone,
      amount: targetAmount,
      totalAmount,
      isClubbed,
      studentsInPayment,
      siblings: siblings.map(s => ({
        token: s.token,
        id: s.id,
        name: s.name,
        busNumber: s.busNumber,
        amount: s.amount,
        status: s.status,
        classGrade: s.classGrade
      })),
      siblingGroupId: student.siblingGroupId || null,
      siblingGroupName: student.siblingGroupName || null,
      serviceStatus: student.serviceStatus || 'active',
      isServiceStopped: Boolean(dueDetails && dueDetails.isServiceStopped),
      leftFromMonth: student.leftFromMonth || null,
      leftReason: student.leftReason || '',
      dueDetails,
      billingPeriod: targetMonth,
      monthToPay: targetMonth,
      paidMonth: monthStatus === 'paid' ? targetMonth : null,
      paidTill: student.paidTill || "August 2026",
      financialYear: settings.financialYear || "2026–2027",
      monthlyHistory: student.monthlyHistory || {},
      status: monthStatus,
      hasSubmittedPayment: Boolean(submittedMonth),
      submittedMonth: submittedMonth || null,
      paidAt: monthPaidAt,
      paymentRef: monthPaymentRef,
      paymentApp: monthPaymentApp,
      payerInfo: monthPayerInfo,
      isClubbedPayment: student.isClubbedPayment,
      settings: {
        businessName: settings.businessName,
        proprietorName: settings.proprietorName || 'LALIT KUMAR WALIA',
        ownerPhone: settings.ownerPhone,
        upiId: settings.upiId,
        upiPayeeName: settings.upiPayeeName,
        bankName: settings.bankName || 'YES Bank',
        bankAccountName: settings.bankAccountName || 'HIMANSHU WALIA',
        bankAccountNumber: settings.bankAccountNumber || '14610100012345',
        bankIfsc: settings.bankIfsc || 'YESB0000146',
        bankAccountType: settings.bankAccountType || 'Current Account',
        bankBranch: settings.bankBranch || 'Civil Lines / City Branch',
        currencySymbol: settings.currencySymbol || '₹',
        scannerImage: settings.scannerImage || '/scanner.png'
      },
      payment: {
        upiUri: qrInfo.cleanBankUri,
        cleanBankUri: qrInfo.cleanBankUri,
        dynamicUri: qrInfo.dynamicUri,
        qrDataUrl: qrInfo.cleanQrDataUrl,
        cleanQrDataUrl: qrInfo.cleanQrDataUrl,
        dynamicQrDataUrl: qrInfo.dynamicQrDataUrl,
        scannerImage: settings.scannerImage || '/scanner.png',
        useCustomQr: !!settings.useCustomQr,
        payeeName: settings.upiPayeeName || 'HIMANSHU  WALIA',
        upiId: settings.upiId || 'himanshu1461@ptyes',
        bankName: settings.bankName || 'YES Bank',
        bankAccountName: settings.bankAccountName || 'HIMANSHU WALIA',
        bankAccountNumber: settings.bankAccountNumber || '14610100012345',
        bankIfsc: settings.bankIfsc || 'YESB0000146',
        bankAccountType: settings.bankAccountType || 'Current Account',
        bankBranch: settings.bankBranch || 'Civil Lines / City Branch'
      }
    };

    return res.json({ success: true, data: parentView });
  } catch (err) {
    console.error('Error fetching parent view:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

// Dedicated Public Endpoint: Get Official Fee Receipt (JSON)
app.get('/api/receipt/:token/:month', (req, res) => {
  try {
    const { token, month } = req.params;
    const student = db.getStudentByToken(token);
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student record not found' });
    }

    const settings = db.getSettings();
    const targetMonth = decodeURIComponent(month);
    const hist = (student.monthlyHistory && student.monthlyHistory[targetMonth]) || null;
    const isPaid = hist ? hist.status === 'paid' : (student.paidTill && db.FY_MONTHS.indexOf(student.paidTill) >= db.FY_MONTHS.indexOf(targetMonth) && db.FY_MONTHS.indexOf(targetMonth) <= 4);

    const amount = (hist && hist.amount) ? Number(hist.amount) : (Number(student.amount) || 2310);
    const voucher = (hist && hist.voucher) || (hist && hist.ref) || `CLEARED-${targetMonth.replace(/\s+/g, '-').toUpperCase()}`;
    const method = (hist && hist.method) || (isPaid ? 'Pre-cleared in School Transport Ledger' : 'Pending');
    const paidAt = (hist && hist.paidAt) || (isPaid ? '2026-08-31T00:00:00.000Z' : null);

    res.json({
      success: true,
      data: {
        token: student.token,
        studentName: student.name,
        schoolName: student.schoolName || 'Police DAV Public School',
        busNumber: student.busNumber || 'S3',
        routeStop: student.routeStop || 'Main Route',
        classGrade: student.classGrade || '',
        rollNo: student.rollNo || '',
        parentName: student.parentName || '',
        parentPhone: student.parentPhone || '',
        month: targetMonth,
        amount,
        status: isPaid ? 'paid' : (hist ? hist.status : 'pending'),
        voucher,
        method,
        paidAt,
        businessName: settings.businessName || 'RAM RAM JI TRANSPORT',
        proprietorName: settings.proprietorName || 'LALIT KUMAR WALIA',
        ownerName: settings.ownerName || 'Himanshu Walia',
        ownerPhone: settings.ownerPhone || '+91 98141 24392'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper: Indian Rupee Number to Words Converter for Receipts
function numberToWordsINR(num) {
  const n = Math.floor(Number(num) || 0);
  if (n === 0) return 'Zero Rupees';

  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertLessThousand(val) {
    if (val === 0) return '';
    if (val < 20) return a[val] + ' ';
    if (val < 100) return b[Math.floor(val / 10)] + ' ' + (val % 10 !== 0 ? a[val % 10] + ' ' : '');
    return a[Math.floor(val / 100)] + ' Hundred ' + (val % 100 !== 0 ? 'and ' + convertLessThousand(val % 100) : '');
  }

  let words = '';
  const thousands = Math.floor(n / 1000);
  const remainder = n % 1000;

  if (thousands > 0) {
    words += convertLessThousand(thousands).trim() + ' Thousand ';
  }
  if (remainder > 0) {
    words += convertLessThousand(remainder).trim();
  }

  return (words.trim() + ' Rupees').trim();
}

// PDFKit Receipt Document Builder
function generateReceiptPdf(data, outStream) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    compress: false,
    info: {
      Title: `Transport Fee Receipt - ${data.studentName} - ${data.month}`,
      Author: data.businessName || 'RAM RAM JI TRANSPORT',
      Subject: `School Bus Fee Receipt for ${data.month}`
    }
  });

  doc.pipe(outStream);

  const primaryColor = '#047857'; // Emerald 700
  const darkColor = '#0f172a';    // Slate 900
  const grayColor = '#475569';    // Slate 600
  const lightBg = '#f8fafc';      // Slate 50
  const borderColor = '#cbd5e1';  // Slate 300

  // Top Accent bar
  doc.rect(40, 40, 515, 6).fill(primaryColor);

  // Header
  let y = 58;
  doc.fillColor(darkColor).font('Helvetica-Bold').fontSize(17).text(data.businessName || 'RAM RAM JI TRANSPORT', 40, y);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#065f46').text(`Proprietor: ${data.proprietorName || 'LALIT KUMAR WALIA'}`, 40, y + 21);
  doc.font('Helvetica').fontSize(8.5).fillColor(grayColor).text('School Bus Fleet & Monthly Transport Services', 40, y + 33);
  doc.font('Helvetica').fontSize(8).fillColor(grayColor).text(`Support: ${data.ownerName || 'Himanshu Walia'} (${data.ownerPhone || '+91 98141 24392'})`, 40, y + 45);

  // Right side of header: Verified badge + Voucher + Date
  doc.roundedRect(425, y, 130, 20, 4).fillAndStroke('#d1fae5', '#10b981');
  doc.fillColor('#065f46').font('Helvetica-Bold').fontSize(9).text('VERIFIED RECEIPT', 425, y + 5, { width: 130, align: 'center' });
  doc.fillColor(grayColor).font('Helvetica').fontSize(8.5).text(`Voucher: ${data.voucher}`, 410, y + 26, { width: 145, align: 'right' });
  doc.text(`Date: ${data.paidDate}`, 410, y + 38, { width: 145, align: 'right' });

  // Divider
  y = 118;
  doc.moveTo(40, y).lineTo(555, y).strokeColor(primaryColor).lineWidth(1.5).stroke();

  // Student & Route Details Box
  y = 132;
  const boxHeight = 115;
  doc.roundedRect(40, y, 515, boxHeight, 8).fillAndStroke(lightBg, borderColor);

  // Box Title
  doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(9).text('STUDENT & TRANSPORT DETAILS', 55, y + 10);
  doc.moveTo(55, y + 23).lineTo(540, y + 23).strokeColor('#e2e8f0').lineWidth(1).stroke();

  // Grid of details
  const leftX = 55;
  const midX = 290;
  let rowY = y + 32;

  // Row 1
  doc.fillColor(grayColor).font('Helvetica').fontSize(9).text('Student Name:', leftX, rowY);
  doc.fillColor(darkColor).font('Helvetica-Bold').fontSize(11).text(data.studentName, leftX + 85, rowY - 1);

  doc.fillColor(grayColor).font('Helvetica').fontSize(9).text('Enrolled School:', midX, rowY);
  doc.fillColor(darkColor).font('Helvetica-Bold').fontSize(9.5).text(data.schoolName, midX + 90, rowY);

  // Row 2
  rowY += 24;
  doc.fillColor(grayColor).font('Helvetica').fontSize(9).text('Assigned Bus:', leftX, rowY);
  // Bus Pill
  doc.roundedRect(leftX + 85, rowY - 2, 60, 16, 3).fillAndStroke('#fef3c7', '#f59e0b');
  doc.fillColor('#78350f').font('Helvetica-Bold').fontSize(9).text(data.busNumber, leftX + 85, rowY + 1, { width: 60, align: 'center' });

  doc.fillColor(grayColor).font('Helvetica').fontSize(9).text('Designated Stop:', midX, rowY);
  doc.fillColor(darkColor).font('Helvetica').fontSize(9).text(data.routeStop, midX + 90, rowY);

  // Row 3
  rowY += 24;
  doc.fillColor(grayColor).font('Helvetica').fontSize(9).text('Class / Roll No:', leftX, rowY);
  doc.fillColor(darkColor).font('Helvetica').fontSize(9).text(data.classRoll, leftX + 85, rowY);

  doc.fillColor(grayColor).font('Helvetica').fontSize(9).text('Parent Name:', midX, rowY);
  doc.fillColor(darkColor).font('Helvetica').fontSize(9).text(data.payer, midX + 90, rowY);

  // Amount & Month Card
  y = 260;
  doc.roundedRect(40, y, 515, 80, 8).fillAndStroke('#ecfdf5', '#10b981');

  // Month
  doc.fillColor('#065f46').font('Helvetica-Bold').fontSize(9).text('TRANSPORT FEE MONTH', 55, y + 14);
  doc.fillColor('#064e3b').font('Helvetica-Bold').fontSize(16).text(data.month, 55, y + 28);

  // Amount
  doc.fillColor('#065f46').font('Helvetica-Bold').fontSize(8.5).text('FIXED AMOUNT PAID', 400, y + 14, { width: 140, align: 'right' });
  doc.fillColor('#047857').font('Helvetica-Bold').fontSize(22).text(`Rs. ${data.amount.toLocaleString()}`, 380, y + 26, { width: 160, align: 'right' });

  // Amount in words
  doc.moveTo(55, y + 54).lineTo(540, y + 54).strokeColor('#a7f3d0').lineWidth(0.8).stroke();
  doc.fillColor('#065f46').font('Helvetica-Oblique').fontSize(8.5).text(`Amount in words: ${data.amountWords}`, 55, y + 60);

  // Transaction Particulars Card
  y = 352;
  doc.roundedRect(40, y, 515, 66, 6).fillAndStroke(lightBg, borderColor);
  rowY = y + 12;
  doc.fillColor(grayColor).font('Helvetica').fontSize(8.5).text('Payment Method:', 55, rowY);
  doc.fillColor(darkColor).font('Helvetica-Bold').fontSize(8.5).text(data.method, 160, rowY);

  rowY += 18;
  doc.fillColor(grayColor).font('Helvetica').fontSize(8.5).text('Transaction Ref / Voucher:', 55, rowY);
  doc.fillColor(darkColor).font('Helvetica-Bold').fontSize(8.5).text(data.voucher, 160, rowY);

  rowY += 18;
  doc.fillColor(grayColor).font('Helvetica').fontSize(8.5).text('Payer Particulars:', 55, rowY);
  doc.fillColor(darkColor).font('Helvetica').fontSize(8.5).text(data.payer, 160, rowY);

  // Official Stamp & Signatory
  y = 432;
  // Stamp Box
  doc.roundedRect(40, y, 185, 58, 6).fillAndStroke('#ecfdf5', '#059669');
  doc.rect(43, y + 3, 179, 52).strokeColor('#10b981').lineWidth(0.5).stroke();
  doc.fillColor('#065f46').font('Helvetica-Bold').fontSize(7.5).text('OFFICIAL STAMP', 40, y + 6, { width: 185, align: 'center' });
  doc.fillColor('#047857').font('Helvetica-Bold').fontSize(8.5).text(data.businessName || 'RAM RAM JI TRANSPORT', 40, y + 17, { width: 185, align: 'center' });
  doc.fillColor('#065f46').font('Helvetica-Bold').fontSize(7.5).text(`Prop. ${data.proprietorName || 'LALIT KUMAR WALIA'}`, 40, y + 29, { width: 185, align: 'center' });
  doc.fillColor('#059669').font('Helvetica-Bold').fontSize(7.5).text('VERIFIED & CLEARED', 40, y + 41, { width: 185, align: 'center' });

  // Signatory
  doc.fillColor(darkColor).font('Helvetica-Bold').fontSize(9.5).text(data.proprietorName || 'LALIT KUMAR WALIA', 360, y + 6, { width: 180, align: 'right' });
  doc.fillColor(primaryColor).font('Helvetica-Bold').fontSize(8).text('Proprietor', 360, y + 18, { width: 180, align: 'right' });
  doc.fillColor(darkColor).font('Helvetica-Bold').fontSize(8.5).text(data.ownerName || 'Himanshu Walia', 360, y + 29, { width: 180, align: 'right' });
  doc.fillColor(grayColor).font('Helvetica').fontSize(7.5).text('Fleet Incharge / Auth. Signatory', 360, y + 41, { width: 180, align: 'right' });

  // Footer Note
  y = 508;
  doc.moveTo(40, y).lineTo(555, y).strokeColor('#e2e8f0').lineWidth(0.8).stroke();
  doc.fillColor('#94a3b8').font('Helvetica').fontSize(7.5).text(
    `This is an official computer-generated fee receipt issued by ${data.businessName || 'RAM RAM JI TRANSPORT'} (Prop. ${data.proprietorName || 'LALIT KUMAR WALIA'}). All bus fees are non-refundable and subject to transport terms.`,
    40, y + 8, { width: 515, align: 'center' }
  );

  doc.end();
}

// Dedicated Public Endpoint: Direct PDF File Download
app.get('/api/receipt/:token/:month/pdf', (req, res) => {
  try {
    const { token, month } = req.params;
    const student = db.getStudentByToken(token);
    if (!student) {
      return res.status(404).send('Student payment record not found.');
    }

    const settings = db.getSettings();
    const targetMonth = decodeURIComponent(month);
    const hist = (student.monthlyHistory && student.monthlyHistory[targetMonth]) || null;
    const isPaid = hist ? hist.status === 'paid' : (student.paidTill && db.FY_MONTHS.indexOf(student.paidTill) >= db.FY_MONTHS.indexOf(targetMonth) && db.FY_MONTHS.indexOf(targetMonth) <= 4);

    const amount = (hist && hist.amount) ? Number(hist.amount) : (Number(student.amount) || 2310);
    const voucher = (hist && hist.voucher) || (hist && hist.ref) || `CLEARED-${targetMonth.replace(/\s+/g, '-').toUpperCase()}`;
    const method = (hist && hist.method) || (isPaid ? 'Pre-cleared Transport Ledger' : 'Online UPI / Bank');
    const payer = (hist && hist.payerInfo) || student.parentName || 'Parent';
    const paidDate = (hist && hist.paidAt) ? new Date(hist.paidAt).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }) : '31 Aug 2026';

    const safeFilename = `Receipt_${(student.name || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_')}_${targetMonth.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);

    generateReceiptPdf({
      businessName: settings.businessName || 'RAM RAM JI TRANSPORT',
      proprietorName: settings.proprietorName || 'LALIT KUMAR WALIA',
      ownerName: settings.ownerName || 'Himanshu Walia',
      ownerPhone: settings.ownerPhone || '+91 98141 24392',
      voucher,
      paidDate,
      studentName: student.name || 'Student',
      schoolName: student.schoolName || 'Police DAV Public School',
      busNumber: `Bus ${student.busNumber || 'S3'}`,
      routeStop: student.routeStop || 'Designated Route',
      classRoll: `${student.classGrade || 'Class -'}${student.rollNo ? ` | Roll No: #${student.rollNo}` : ''}`,
      payer,
      month: targetMonth,
      amount,
      amountWords: `${numberToWordsINR(amount)} Only`,
      method
    }, res);
  } catch (err) {
    console.error('Error generating PDF receipt:', err);
    res.status(500).send('Error generating PDF receipt: ' + err.message);
  }
});

// Dedicated Public Endpoint: Standalone Printable Receipt Page (HTML)
app.get('/receipt/:token/:month', (req, res) => {
  try {
    const { token, month } = req.params;
    const student = db.getStudentByToken(token);
    if (!student) {
      return res.status(404).send('<h2>Student record not found. Please verify link.</h2>');
    }

    const settings = db.getSettings();
    const targetMonth = decodeURIComponent(month);
    const hist = (student.monthlyHistory && student.monthlyHistory[targetMonth]) || null;
    const isPaid = hist ? hist.status === 'paid' : (student.paidTill && db.FY_MONTHS.indexOf(student.paidTill) >= db.FY_MONTHS.indexOf(targetMonth) && db.FY_MONTHS.indexOf(targetMonth) <= 4);

    const amount = (hist && hist.amount) ? Number(hist.amount) : (Number(student.amount) || 2310);
    const voucher = (hist && hist.voucher) || (hist && hist.ref) || `CLEARED-${targetMonth.replace(/\s+/g, '-').toUpperCase()}`;
    const method = (hist && hist.method) || (isPaid ? 'Pre-cleared Transport Ledger' : 'Online UPI / Bank');
    const payer = (hist && hist.payerInfo) || student.parentName || 'Parent';
    const paidDate = (hist && hist.paidAt) ? new Date(hist.paidAt).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }) : '31 Aug 2026';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt - ${student.name} (${targetMonth}) - RAM RAM JI TRANSPORT</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @media print {
      .no-print { display: none !important; }
      body { background: white !important; padding: 0 !important; }
      .print-card { box-shadow: none !important; border: 2px solid #059669 !important; }
    }
  </style>
</head>
<body class="bg-slate-100 text-slate-900 min-h-screen p-3 sm:p-6 flex flex-col items-center justify-center">
  <div class="max-w-lg w-full bg-white rounded-3xl shadow-xl border border-slate-200 p-6 sm:p-8 space-y-4 print-card">
    <div class="border-b-2 border-emerald-500 pb-3 flex items-start justify-between">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-3xl">🚌</span>
          <div class="font-black text-xl text-slate-900">${settings.businessName || 'RAM RAM JI TRANSPORT'}</div>
        </div>
        <div class="text-xs font-bold text-emerald-800 mt-0.5">Proprietor: ${settings.proprietorName || 'LALIT KUMAR WALIA'}</div>
        <p class="text-[11px] font-medium text-slate-600">School Bus Fleet & Monthly Transport Services</p>
        <p class="text-[10px] text-slate-400">Support: ${settings.ownerName || 'Himanshu Walia'} (${settings.ownerPhone || '+91 98141 24392'})</p>
      </div>
      <div class="text-right">
        <span class="inline-block px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-900 text-xs font-black uppercase border border-emerald-300">
          Verified Receipt
        </span>
        <div class="font-mono text-[11px] text-slate-500 mt-1">${voucher}</div>
        <div class="text-[11px] text-slate-400 mt-0.5">Date: ${paidDate}</div>
      </div>
    </div>

    <div class="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2 text-xs">
      <div class="flex justify-between items-center pb-2 border-b border-slate-200">
        <span class="text-slate-500 font-semibold">Student Name:</span>
        <span class="text-slate-900 font-black text-base">${student.name}</span>
      </div>
      <div class="flex justify-between items-center">
        <span class="text-slate-500 font-semibold">School:</span>
        <span class="text-slate-800 font-bold">${student.schoolName || 'Police DAV Public School'}</span>
      </div>
      <div class="flex justify-between items-center">
        <span class="text-slate-500 font-semibold">Assigned Bus:</span>
        <span class="text-amber-900 font-black bg-amber-100 px-2 py-0.5 rounded-md border border-amber-300">Bus ${student.busNumber || 'S3'}</span>
      </div>
      <div class="flex justify-between items-center">
        <span class="text-slate-500 font-semibold">Designated Stop:</span>
        <span class="text-slate-800 font-medium">${student.routeStop || 'Route Not Set'}</span>
      </div>
      <div class="flex justify-between items-center">
        <span class="text-slate-500 font-semibold">Class / Roll No:</span>
        <span class="text-slate-800 font-medium">${student.classGrade || 'Class Not Set'} • Roll: #${student.rollNo || '-'}</span>
      </div>
    </div>

    <div class="border-2 border-dashed border-emerald-300 bg-emerald-50/60 rounded-2xl p-4 space-y-2">
      <div class="flex justify-between items-center">
        <div>
          <div class="text-[10px] uppercase tracking-wider font-bold text-emerald-800">Transport Fee Month</div>
          <div class="text-lg font-black text-emerald-950 flex items-center gap-1.5">
            <span>📅</span> <span>${targetMonth}</span>
          </div>
        </div>
        <div class="text-right">
          <div class="text-[10px] uppercase tracking-wider font-bold text-slate-500">Amount Paid</div>
          <div class="text-3xl font-black text-emerald-700">₹${amount.toLocaleString()}</div>
        </div>
      </div>
    </div>

    <div class="space-y-1 text-xs text-slate-600 bg-white p-3 rounded-xl border border-slate-200">
      <div class="flex justify-between"><span class="text-slate-500">Payment Method:</span><span class="font-bold text-slate-800">${method}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">Transaction Ref / Voucher:</span><span class="font-mono font-bold text-slate-800">${voucher}</span></div>
      <div class="flex justify-between"><span class="text-slate-500">Payer Details:</span><span class="font-medium text-slate-700">${payer}</span></div>
    </div>

    <div class="pt-2 flex items-center justify-between border-t border-slate-200">
      <div class="inline-flex items-center gap-2 border-2 border-emerald-600 rounded-xl px-3 py-1.5 bg-emerald-50 text-emerald-950">
        <span class="text-2xl">🛡️</span>
        <div>
          <div class="text-[9px] font-black uppercase text-emerald-900">Official Stamp</div>
          <div class="text-[10px] font-extrabold text-emerald-800">${settings.businessName || 'RAM RAM JI TRANSPORT'}</div>
          <div class="text-[9px] font-bold text-emerald-900">Prop. ${settings.proprietorName || 'LALIT KUMAR WALIA'}</div>
          <div class="text-[8px] text-emerald-700 font-bold">✓ Verified & Cleared</div>
        </div>
      </div>
      <div class="text-right text-[10px] space-y-0.5">
        <div class="font-black text-slate-900">${settings.proprietorName || 'LALIT KUMAR WALIA'}</div>
        <div class="text-[9px] font-bold text-emerald-800 uppercase">Proprietor</div>
        <div class="font-bold text-slate-700 pt-0.5">${settings.ownerName || 'Himanshu Walia'}</div>
        <div class="text-slate-500 text-[9px]">Fleet Incharge / Auth. Signatory</div>
      </div>
    </div>

    <div class="pt-3 flex gap-2">
      <a href="/api/receipt/${student.token}/${encodeURIComponent(targetMonth)}/pdf" download class="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs sm:text-sm rounded-xl shadow transition flex items-center justify-center gap-2 cursor-pointer text-center">
        <svg class="w-4 h-4 text-emerald-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
        <span>Download Receipt (PDF)</span>
      </a>
      <a href="/pay/${student.token}" class="px-4 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center justify-center">
        Back to Portal
      </a>
    </div>
  </div>
</body>
</html>`;

    res.send(html);
  } catch (err) {
    res.status(500).send('<h2>Error loading receipt: ' + err.message + '</h2>');
  }
});

// 4. Parent confirms payment (1-tap with app & payer details, UTR optional)
app.post('/api/pay/:token/confirm', (req, res) => {
  try {
    const { token } = req.params;
    const { appName, payerInfo, reference, isClubbed, targetMonth } = req.body;

    const student = db.getStudentByToken(token);
    if (!student) {
      return res.status(404).json({ success: false, error: 'Invalid child record' });
    }

    const updated = db.submitParentPayment(token, {
      appName,
      payerInfo,
      reference,
      isClubbed: Boolean(isClubbed),
      targetMonth
    });

    return res.json({
      success: true,
      message: 'Payment submission received! The transport owner will verify bank credit to unlock your official receipt.',
      data: updated
    });
  } catch (err) {
    console.error('Error confirming payment:', err);
    res.status(500).json({ success: false, error: 'Failed to record payment' });
  }
});

// ==========================================
// ADMIN API (Owner Dashboard Management - Protected)
// ==========================================
app.use('/api/stats', requireAdminAuth);
app.use('/api/buses', requireAdminAuth);
app.use('/api/schools', requireAdminAuth);
app.use('/api/students', requireAdminAuth);
app.use('/api/settings', requireAdminAuth);
app.use('/api/reports', requireAdminAuth);

// Dashboard stats
app.get('/api/stats', (req, res) => {
  try {
    const month = req.query.month || (db.getSettings().activeMonth || 'September 2026');
    const school = req.query.school || req.query.schoolName || 'all';
    const stats = db.getStats(month, school);
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Monthly Transport & Fee Report Export (CSV / Excel)
app.get('/api/reports/monthly/csv', (req, res) => {
  try {
    const settings = db.getSettings();
    const targetMonth = req.query.month || (settings.activeMonth || 'September 2026');
    const filters = {
      busNumber: req.query.busNumber,
      school: req.query.school || req.query.schoolName,
      schoolName: req.query.schoolName || req.query.school,
      status: req.query.status,
      search: req.query.search,
      month: targetMonth
    };

    let students = db.getStudents(filters);

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = [
      'S.No',
      'Roll No',
      'Student Name',
      'School Name',
      'Assigned Bus',
      'Designated Stop',
      'Class / Grade',
      'Parent Name',
      'Parent Phone',
      'Fixed Monthly Fee (INR)',
      'Fee in Selected Month (INR)',
      'Payment Status',
      'Payment Mode',
      'Transaction Ref / Voucher',
      'Payment Date',
      'Remarks / Payer Details'
    ];

    let totalFixed = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let countPaid = 0;
    let countPending = 0;
    let countStopped = 0;

    const rows = students.map((st, idx) => {
      const fixedFee = Number(st.fixedFee) || Number(st.amount) || 0;
      const monthFee = Number(st.amount) !== undefined && !isNaN(Number(st.amount)) ? Number(st.amount) : fixedFee;
      const status = st.status || 'pending';

      totalFixed += fixedFee;
      if (status === 'paid') {
        totalPaid += monthFee;
        countPaid++;
      } else if (status === 'stopped') {
        countStopped++;
      } else {
        totalPending += monthFee;
        countPending++;
      }

      let statusDisplay = 'Pending / Unpaid';
      if (status === 'paid') statusDisplay = 'Paid / Verified';
      else if (status === 'submitted') statusDisplay = 'Awaiting Verification';
      else if (status === 'stopped') statusDisplay = 'Left / Discontinued';

      let paidDateStr = '';
      if (st.paidAt) {
        try {
          paidDateStr = new Date(st.paidAt).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
          });
        } catch (e) {
          paidDateStr = String(st.paidAt);
        }
      }

      return [
        idx + 1,
        st.rollNo || '-',
        st.name || '',
        st.schoolName || '',
        st.busNumber ? `Bus ${st.busNumber}` : '',
        st.routeStop || '',
        st.classGrade || '',
        st.parentName || '',
        st.parentPhone || '',
        fixedFee,
        monthFee,
        statusDisplay,
        st.paymentApp || (status === 'paid' ? 'Pre-cleared Ledger' : '-'),
        st.paymentRef || (status === 'paid' ? `CLEARED-${targetMonth.replace(/\s+/g, '-').toUpperCase()}` : '-'),
        paidDateStr || '-',
        st.payerInfo || '-'
      ].map(escapeCsv).join(',');
    });

    const safeMonth = targetMonth.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeDate = new Date().toISOString().slice(0, 10);
    const filename = `RAM_RAM_JI_Transport_Report_${safeMonth}_${safeDate}.csv`;

    // Add UTF-8 BOM (\uFEFF) for immediate Excel compatibility
    const csvContent = '\uFEFF' + [
      escapeCsv(`${settings.businessName || 'RAM RAM JI TRANSPORT'} - Monthly Transport & Fee Report`),
      escapeCsv(`Proprietor: ${settings.proprietorName || 'LALIT KUMAR WALIA'} | Support: ${settings.ownerName || 'Himanshu Walia'} (${settings.ownerPhone || '+91 98141 24392'})`),
      escapeCsv(`Report Month: ${targetMonth} | Generated: ${new Date().toLocaleString('en-IN')} | Total Students: ${students.length}`),
      escapeCsv(`Summary: Total Expected: Rs. ${totalFixed} | Collected: Rs. ${totalPaid} (${countPaid} paid) | Pending: Rs. ${totalPending} (${countPending} unpaid) | Left: ${countStopped}`),
      '',
      headers.map(escapeCsv).join(','),
      ...rows,
      '',
      ['TOTALS', '', '', '', '', '', '', '', '', totalFixed, totalPaid, `${countPaid} Paid / ${countPending} Pending`, '', '', '', ''].map(escapeCsv).join(',')
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csvContent);
  } catch (err) {
    console.error('Error generating monthly CSV report:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// SCHOOLS MANAGEMENT (Multi-School Fleet Operations)
app.get('/api/schools', (req, res) => {
  try {
    res.json({ success: true, data: db.getSchools() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/schools', (req, res) => {
  try {
    const { name, code, contactPerson, phone, address } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'School Name is required' });
    }
    const newSchool = db.addSchool({ name, code, contactPerson, phone, address });
    res.json({ success: true, data: newSchool, message: `School "${newSchool.name}" added successfully` });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/schools/:id', (req, res) => {
  try {
    const updated = db.updateSchool(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'School not found' });
    }
    res.json({ success: true, data: updated, message: `School "${updated.name}" updated successfully` });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.delete('/api/schools/:id', (req, res) => {
  try {
    db.deleteSchool(req.params.id);
    res.json({ success: true, message: 'School removed successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// BUS FLEET MANAGEMENT (Primary Entity)
app.get('/api/buses', (req, res) => {
  try {
    const { school } = req.query;
    const buses = db.getBuses({ school });
    res.json({ success: true, data: buses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/buses', (req, res) => {
  try {
    const { busNumber, schoolName, route, driverName, driverPhone, notes } = req.body;
    if (!busNumber || !busNumber.trim()) {
      return res.status(400).json({ success: false, error: 'Bus Number is required' });
    }
    const newBus = db.addBus({ busNumber, schoolName, route, driverName, driverPhone, notes });
    res.status(201).json({ success: true, data: newBus });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Bulk Import Bus List
app.post('/api/buses/bulk', (req, res) => {
  try {
    const { buses, schoolName } = req.body;
    if (!buses || !Array.isArray(buses) || buses.length === 0) {
      return res.status(400).json({ success: false, error: 'Please provide an array of buses to import' });
    }
    const result = db.addBusesBulk(buses, schoolName);
    res.json({
      success: true,
      message: `Successfully added ${result.added.length} bus(es). ${result.skipped.length > 0 ? `${result.skipped.length} skipped (already exist).` : ''}`,
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/buses/:id', (req, res) => {
  try {
    const updated = db.updateBus(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Bus not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/buses/:id', (req, res) => {
  try {
    db.deleteBus(req.params.id);
    res.json({ success: true, message: 'Bus removed successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Students
app.get('/api/students', (req, res) => {
  try {
    const settings = db.getSettings();
    const filters = {
      busNumber: req.query.busNumber,
      school: req.query.school || req.query.schoolName,
      schoolName: req.query.schoolName || req.query.school,
      status: req.query.status,
      search: req.query.search,
      month: req.query.month || (settings.activeMonth || 'September 2026')
    };
    let students = db.getStudents(filters);
    students = students.map(s => ({
      ...s,
      dueDetails: db.getStudentDueDetails(s, settings)
    }));
    res.json({ success: true, data: students });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/students', (req, res) => {
  try {
    const { name, busNumber, routeStop, classGrade, schoolName, rollNo, parentName, parentPhone, amount, billingPeriod, status, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Student Name is required' });
    }

    const student = db.addStudent({
      name,
      busNumber,
      routeStop,
      classGrade,
      schoolName,
      rollNo,
      parentName,
      parentPhone,
      amount,
      billingPeriod,
      status,
      notes
    });

    res.status(201).json({ success: true, data: student });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/students/:id', (req, res) => {
  try {
    const updated = db.updateStudent(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/students/:id', (req, res) => {
  try {
    const ok = db.deleteStudent(req.params.id);
    if (!ok) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    res.json({ success: true, message: 'Student removed successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Quick status toggle
app.post('/api/students/:id/toggle-status', (req, res) => {
  try {
    const student = db.getStudentById(req.params.id);
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    const newStatus = student.status === 'paid' ? 'pending' : 'paid';
    const updated = db.updateStudent(req.params.id, {
      status: newStatus,
      paymentRef: newStatus === 'paid' ? (student.paymentRef || 'ADMIN-VERIFIED') : ''
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Quick Fee Update (1-Click Change)
app.post('/api/students/:id/fee', (req, res) => {
  try {
    const { amount } = req.body;
    if (amount === undefined || isNaN(amount) || Number(amount) < 0) {
      return res.status(400).json({ success: false, error: 'Valid numeric fee amount is required' });
    }
    const updated = db.updateStudentFee(req.params.id, amount);
    if (!updated) return res.status(404).json({ success: false, error: 'Student not found' });
    res.json({ success: true, message: `Fee updated to ₹${amount}`, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Mark student left / stop upcoming fee obligations
app.post('/api/students/:id/stop-service', (req, res) => {
  try {
    const { leftFromMonth, reason } = req.body;
    const updated = db.markStudentLeft(req.params.id, leftFromMonth, reason);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    res.json({
      success: true,
      message: `Transport fees stopped starting from ${updated.leftFromMonth}`,
      data: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reactivate student back to active bus service
app.post('/api/students/:id/reactivate-service', (req, res) => {
  try {
    const updated = db.reactivateStudent(req.params.id);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }
    res.json({
      success: true,
      message: 'Student transport service reactivated successfully',
      data: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Sibling Clubbing Management
app.post('/api/students/club', (req, res) => {
  try {
    const { studentIds, groupName } = req.body;
    if (!Array.isArray(studentIds) || studentIds.length < 2) {
      return res.status(400).json({ success: false, error: 'Select at least 2 students to club together' });
    }
    const result = db.clubStudents(studentIds, groupName);
    res.json({ success: true, message: `Successfully clubbed ${result.students.length} siblings`, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.post('/api/students/:id/unclub', (req, res) => {
  try {
    const result = db.unclubStudent(req.params.id);
    if (!result) return res.status(404).json({ success: false, error: 'Student is not part of a sibling group' });
    res.json({ success: true, message: 'Student removed from sibling group', data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/students/:id/siblings', (req, res) => {
  try {
    const siblings = db.getSiblings(req.params.id);
    res.json({ success: true, data: siblings });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Owner Approves Submitted Payment (After checking bank credit)
app.post('/api/students/:id/approve', (req, res) => {
  try {
    const result = db.approveStudentPayment(req.params.id, req.body?.month);
    if (!result || !result.student) return res.status(404).json({ success: false, error: 'Student not found' });
    const count = result.approvedStudents ? result.approvedStudents.length : 1;
    const msg = count > 1 
      ? `Payment verified & approved for ${count} clubbed siblings!`
      : `Payment for ${result.student.name} verified & approved!`;
    res.json({ success: true, message: msg, data: result.student, approvedStudents: result.approvedStudents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Owner Rejects Unverified Payment
app.post('/api/students/:id/reject', (req, res) => {
  try {
    const { reason, month } = req.body || {};
    const result = db.rejectStudentPayment(req.params.id, reason, month);
    if (!result || !result.student) return res.status(404).json({ success: false, error: 'Student not found' });
    res.json({ success: true, message: `Payment for ${result.student.name} marked unverified.`, data: result.student, rejectedStudents: result.rejectedStudents });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Edits Student Payment Status
app.post('/api/students/:id/status', (req, res) => {
  try {
    const { status, paymentMethod, paymentRef, payerInfo, notes, updateSiblings, month } = req.body;
    if (!status || !['paid', 'pending', 'submitted'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status. Must be "paid", "pending", or "submitted".' });
    }

    const result = db.updatePaymentStatus(req.params.id, {
      status,
      paymentMethod,
      paymentRef,
      payerInfo,
      notes,
      updateSiblings: Boolean(updateSiblings),
      month: month || 'September 2026'
    });

    if (!result || !result.student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const count = result.affectedStudents ? result.affectedStudents.length : 1;
    let msg = `Payment status for ${result.student.name} updated to ${status.toUpperCase()}`;
    if (count > 1) {
      msg = `Payment status updated to ${status.toUpperCase()} for ${count} siblings`;
    }

    res.json({
      success: true,
      message: msg,
      data: result.student,
      affectedStudents: result.affectedStudents
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Marks All Students Paid Till August 2026
app.post('/api/students/mark-paid-till-august', (req, res) => {
  try {
    const result = db.markAllPaidTillAugust();
    res.json({
      success: true,
      message: `All ${result.updatedCount} students marked PAID till August 2026! Current billing period is September 2026.`,
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin Records Direct Cash Payment
app.post('/api/students/:id/cash-payment', (req, res) => {
  try {
    const { amount, month, collector, voucherNo, notes, payerInfo, updateSiblings } = req.body;
    const result = db.recordCashPayment(req.params.id, {
      amount,
      month: month || 'September 2026',
      collector: collector || 'Admin (Himanshu Walia)',
      voucherNo,
      notes,
      payerInfo,
      updateSiblings: Boolean(updateSiblings)
    });

    if (!result || !result.student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const count = result.affectedStudents ? result.affectedStudents.length : 1;
    let msg = `Cash payment of ₹${Number(result.student.amount).toLocaleString()} recorded for ${result.student.name}!`;
    if (count > 1) {
      msg = `Combined Cash payment of ₹${result.totalCollected.toLocaleString()} recorded for ${count} siblings!`;
    }

    res.json({
      success: true,
      message: msg,
      data: result.student,
      affectedStudents: result.affectedStudents
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Settings
app.get('/api/settings', (req, res) => {
  try {
    res.json({ success: true, data: db.getSettings() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/settings', (req, res) => {
  try {
    const updated = db.updateSettings(req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Upload and change QR code image
app.post('/api/settings/upload-qr', (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'No image data provided' });
    }

    const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ success: false, error: 'Invalid image format' });
    }

    const mimeType = matches[1];
    let ext = 'png';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
    else if (mimeType.includes('webp')) ext = 'webp';

    const buffer = Buffer.from(matches[2], 'base64');
    const uploadsDir = path.join(__dirname, 'public', 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filename = `custom-qr-${Date.now()}.${ext}`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, buffer);

    const relativeUrl = `/uploads/${filename}`;
    const updated = db.updateSettings({ scannerImage: relativeUrl, useCustomQr: true });

    res.json({ success: true, scannerImage: relativeUrl, data: updated });
  } catch (err) {
    console.error('Error uploading QR code:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Reset QR code to auto-generated official UPI
app.post('/api/settings/reset-qr', (req, res) => {
  try {
    const updated = db.updateSettings({ scannerImage: '/scanner.png', useCustomQr: false });
    res.json({ success: true, scannerImage: '/scanner.png', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Universal Parent Payment Portal
app.get('/pay', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pay.html'));
});

// Direct link with token
app.get('/pay/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pay.html'));
});

// Helper to detect Wi-Fi / Local IPv4 address
function getWifiIp() {
  const interfaces = os.networkInterfaces();
  // Check Wi-Fi or Wireless adapters first
  for (const name of Object.keys(interfaces)) {
    if (/wi-?fi|wireless/i.test(name)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
  }
  // Check Ethernet adapters
  for (const name of Object.keys(interfaces)) {
    if (/ethernet|lan/i.test(name)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
  }
  // Fallback to any non-internal IPv4
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Helper to get active HTTPS Tunnel URL (e.g. Cloudflare trycloudflare.com)
function getHttpsTunnelUrl() {
  try {
    const tunnelPath = path.join(__dirname, 'data', 'tunnel.json');
    if (fs.existsSync(tunnelPath)) {
      const data = JSON.parse(fs.readFileSync(tunnelPath, 'utf8'));
      if (data && data.httpsUrl) {
        return data.httpsUrl.trim().replace(/\/+$/, '');
      }
    }
  } catch (e) {}
  return null;
}

// Endpoint for admin and clients to get Wi-Fi & HTTPS network details & QR code
app.get('/api/network-info', async (req, res) => {
  try {
    const wifiIp = getWifiIp();
    const httpsTunnel = getHttpsTunnelUrl();

    const wifiParentUrl = `http://${wifiIp}:${PORT}/pay`;
    const wifiAdminUrl = `http://${wifiIp}:${PORT}`;
    const secureParentUrl = httpsTunnel ? `${httpsTunnel}/pay` : wifiParentUrl;
    const secureAdminUrl = httpsTunnel ? `${httpsTunnel}` : wifiAdminUrl;

    // Use official HTTPS URL for QR Code when available (zero mobile browser security warnings!)
    const qrTargetUrl = secureParentUrl;
    const qrDataUrl = await QRCode.toDataURL(qrTargetUrl, {
      margin: 2,
      width: 280,
      color: { dark: '#064E3B', light: '#FFFFFF' }
    });

    res.json({
      success: true,
      wifiIp,
      port: PORT,
      httpsUrl: httpsTunnel,
      isHttpsAvailable: Boolean(httpsTunnel),
      parentUrl: secureParentUrl,
      adminUrl: secureAdminUrl,
      wifiParentUrl,
      wifiAdminUrl,
      secureParentUrl,
      secureAdminUrl,
      qrTargetUrl,
      qrDataUrl
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update / set tunnel URL
app.post('/api/tunnel', (req, res) => {
  try {
    const { httpsUrl } = req.body;
    const tunnelPath = path.join(__dirname, 'data', 'tunnel.json');
    fs.writeFileSync(tunnelPath, JSON.stringify({
      httpsUrl: (httpsUrl || '').trim().replace(/\/+$/, ''),
      active: true,
      updatedAt: new Date().toISOString()
    }, null, 2), 'utf8');
    res.json({ success: true, httpsUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start Server listening on 0.0.0.0 (all network interfaces)
app.listen(PORT, '0.0.0.0', () => {
  const wifiIp = getWifiIp();
  const httpsTunnel = getHttpsTunnelUrl();
  console.log(`====================================================`);
  console.log(`🚌 School Bus Transport Portal running at:`);
  console.log(`- Local PC:             http://localhost:${PORT}`);
  console.log(`- Same Wi-Fi Admin:     http://${wifiIp}:${PORT}`);
  console.log(`- Same Wi-Fi Parent:    http://${wifiIp}:${PORT}/pay`);
  if (httpsTunnel) {
    console.log(`- 🔒 SSL Secure Parent: ${httpsTunnel}/pay`);
    console.log(`- 🔒 SSL Secure Admin:  ${httpsTunnel}`);
  }
  console.log(`====================================================`);
});
