const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'data', 'db.json');

// Default Seed Data
const defaultData = {
  settings: {
    businessName: "RAM RAM JI TRANSPORT",
    proprietorName: "LALIT KUMAR WALIA",
    ownerName: "Himanshu Walia",
    ownerPhone: "+91 98765 43210",
    upiId: "himanshu1461@ptyes",
    upiPayeeName: "HIMANSHU  WALIA",
    bankName: "YES Bank",
    bankAccountName: "HIMANSHU WALIA",
    bankAccountNumber: "14610100012345",
    bankIfsc: "YESB0000146",
    bankAccountType: "Current Account",
    bankBranch: "Civil Lines / City Branch",
    currencySymbol: "₹",
    currencyCode: "INR",
    scannerImage: "/scanner.png",
    accountType: "merchant",
    merchantProvider: "Paytm for Business",
    merchantUpiId: "paytmqr2810050501011@paytm",
    merchantBusinessName: "RAM RAM JI TRANSPORT",
    merchantMcc: "4111",
    merchantMid: "",
    merchantVerified: true,
    adminPin: "1234",
    adminUsername: "admin",
    adminPassword: "admin123",
    whatsappTemplate: "Dear Parent, please find the school bus transport fee link for {student_name} ({bus_number}). Total fee: {amount}. Kindly pay securely here: {pay_link}"
  },
  sessions: [],
  buses: [
    {
      id: "BUS-1",
      busNumber: "Bus #01",
      route: "Sector 14 - Model Town - City Center",
      driverName: "Ramesh Kumar",
      driverPhone: "+91 98765 11111",
      notes: "Morning 7:00 AM / Afternoon 2:00 PM",
      createdAt: new Date().toISOString()
    },
    {
      id: "BUS-4",
      busNumber: "Bus #04",
      route: "Sector 15 Market - Green Valley",
      driverName: "Suresh Pal",
      driverPhone: "+91 98765 22222",
      notes: "Main City Route",
      createdAt: new Date().toISOString()
    },
    {
      id: "BUS-8",
      busNumber: "Bus #08",
      route: "Rosewood Enclave - Sunshine Heights",
      driverName: "Manoj Singh",
      driverPhone: "+91 98765 33333",
      notes: "North Campus Route",
      createdAt: new Date().toISOString()
    },
    {
      id: "BUS-9",
      busNumber: "Bus #09",
      route: "Palm Greens - Sector 2",
      driverName: "Vikram Rathore",
      driverPhone: "+91 98765 44444",
      notes: "Express Route",
      createdAt: new Date().toISOString()
    },
    {
      id: "BUS-12",
      busNumber: "Bus #12",
      route: "Lotus Boulevard - Expressway",
      driverName: "Dharmendra",
      driverPhone: "+91 98765 55555",
      notes: "Highway Route",
      createdAt: new Date().toISOString()
    }
  ],
  schools: [
    {
      id: "SCH-1",
      name: "Delhi Public School (DPS)",
      contactPerson: "Mr. Saxena (Transport Head)",
      phone: "+91 98111 22334",
      address: "Sector 12, Main City",
      createdAt: new Date().toISOString()
    },
    {
      id: "SCH-2",
      name: "St. Xavier's Senior Secondary School",
      contactPerson: "Sister Agnes",
      phone: "+91 98222 33445",
      address: "Civil Lines, North Campus",
      createdAt: new Date().toISOString()
    },
    {
      id: "SCH-3",
      name: "Ryan International Academy",
      contactPerson: "Admin Office",
      phone: "+91 98333 44556",
      address: "Golf Course Road",
      createdAt: new Date().toISOString()
    }
  ],
  students: [
    {
      id: "STU-1001",
      token: "pay-arv78a",
      name: "Aarav Sharma",
      schoolName: "Delhi Public School (DPS)",
      classGrade: "Class 7 - A",
      rollNo: "24",
      parentName: "Sanjay Sharma",
      parentPhone: "9876500001",
      busNumber: "Bus #04",
      routeStop: "Block C, Sector 15 Market",
      amount: 2500,
      billingPeriod: "September 2026",
      status: "pending",
      paidAt: null,
      paymentRef: "",
      notes: "Morning shift 7:15 AM",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "STU-1002",
      token: "pay-pri92b",
      name: "Priya Patel",
      schoolName: "Delhi Public School (DPS)",
      classGrade: "Class 5 - B",
      rollNo: "12",
      parentName: "Ketan Patel",
      parentPhone: "9876500002",
      busNumber: "Bus #04",
      routeStop: "Green Valley Apartments Gate 2",
      amount: 2500,
      billingPeriod: "September 2026",
      status: "paid",
      paidAt: new Date().toISOString(),
      paymentRef: "UPI-UTR-90182471289",
      notes: "Drop off at 2:30 PM",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "STU-1003",
      token: "pay-roh44c",
      name: "Rohan Verma",
      schoolName: "St. Xavier's Senior Secondary School",
      classGrade: "Class 9 - C",
      rollNo: "09",
      parentName: "Sunil Verma",
      parentPhone: "9876500003",
      busNumber: "Bus #08",
      routeStop: "Rosewood Enclave, Pillar 45",
      amount: 2800,
      billingPeriod: "September 2026",
      status: "pending",
      paidAt: null,
      paymentRef: "",
      notes: "Driver: Ramesh (9876511111)",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "STU-1004",
      token: "pay-anx51d",
      name: "Ananya Gupta",
      schoolName: "St. Xavier's Senior Secondary School",
      classGrade: "Class 4 - A",
      rollNo: "18",
      parentName: "Amit Gupta",
      parentPhone: "9876500004",
      busNumber: "Bus #08",
      routeStop: "Sunshine Heights",
      amount: 2800,
      billingPeriod: "September 2026",
      status: "paid",
      paidAt: new Date().toISOString(),
      paymentRef: "GPay-TXN-481920",
      notes: "Sister travels together",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "STU-1005",
      token: "pay-kab33e",
      name: "Kabir Mehta",
      schoolName: "Ryan International Academy",
      classGrade: "Class 8 - D",
      rollNo: "31",
      parentName: "Deepak Mehta",
      parentPhone: "9876500005",
      busNumber: "Bus #12",
      routeStop: "Lotus Boulevard Tower 3",
      amount: 3200,
      billingPeriod: "September 2026",
      status: "pending",
      paidAt: null,
      paymentRef: "",
      notes: "Express highway route",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: "STU-7192",
      token: "pay-b5bf704f",
      name: "Vihaan Kapoor",
      schoolName: "Heritage Valley International",
      classGrade: "Class 3 - C",
      rollNo: "15",
      parentName: "Rajesh Kapoor",
      parentPhone: "9812345678",
      busNumber: "Bus #09",
      routeStop: "Palm Greens Sector 2",
      amount: 2200,
      billingPeriod: "September 2026",
      status: "pending",
      paidAt: null,
      paymentRef: "",
      notes: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  ]
};

function generateAvailableYears(currentFy = "2026–2027") {
  // Only current and future financial years starting from 2026–2027 (no past financial years)
  const startYear = 2026;
  const match = (currentFy || "2026–2027").match(/(\d{4})/);
  const baseYear = match ? parseInt(match[1], 10) : 2026;
  const endYear = Math.max(baseYear + 35, 2060);
  const years = [];
  for (let y = startYear; y <= endYear; y++) {
    years.push(`${y}–${y + 1}`);
  }
  if (!years.includes(currentFy)) {
    const m = (currentFy || '').match(/(\d{4})/);
    if (m && parseInt(m[1], 10) >= 2026) {
      years.push(currentFy);
      years.sort();
    }
  }
  return years;
}

const AVAILABLE_YEARS = generateAvailableYears("2026–2027");

function getMonthsForFinancialYear(fyString) {
  let y1 = null;
  let y2 = null;
  const match = (fyString || "2026–2027").match(/(\d{4})[^\d]+(\d{4})/);
  if (match) {
    y1 = parseInt(match[1], 10);
    y2 = parseInt(match[2], 10);
  } else {
    const singleMatch = (fyString || "2026").match(/(\d{4})/);
    if (singleMatch) {
      y1 = parseInt(singleMatch[1], 10);
      y2 = y1 + 1;
    }
  }

  if (!y1 || !y2) return FY_MONTHS;

  return [
    `April ${y1}`,
    `May ${y1}`,
    `June ${y1}`,
    `July ${y1}`,
    `August ${y1}`,
    `September ${y1}`,
    `October ${y1}`,
    `November ${y1}`,
    `December ${y1}`,
    `January ${y2}`,
    `February ${y2}`,
    `March ${y2}`
  ];
}

const FY_MONTHS = [
  "April 2026",
  "May 2026",
  "June 2026",
  "July 2026",
  "August 2026",
  "September 2026",
  "October 2026",
  "November 2026",
  "December 2026",
  "January 2027",
  "February 2027",
  "March 2027"
];

const PAST_CLEARED_MONTHS = [
  "April 2026",
  "May 2026",
  "June 2026",
  "July 2026",
  "August 2026"
];

function isClearedMonth(month) {
  return PAST_CLEARED_MONTHS.includes(month);
}

// Due Fee System: Evaluates all months from start of FY up to active billing month
// Enforces "Clear Oldest Due First" rule
function getStudentDueDetails(student, settings = null) {
  if (!student) return null;
  const dbSettings = settings || getSettings();
  const currentFy = (dbSettings && dbSettings.financialYear) || '2026–2027';
  const fyMonths = (dbSettings && dbSettings.fyMonths && dbSettings.fyMonths.length) ? dbSettings.fyMonths : getMonthsForFinancialYear(currentFy);
  const activeMonth = (dbSettings && dbSettings.activeMonth) || fyMonths[5] || 'September 2026';
  const monthlyHistory = student.monthlyHistory || {};
  const feeAmount = Number(student.amount) || 2310;
  const isLeft = student.serviceStatus === 'left';
  const leftFromMonth = student.leftFromMonth || activeMonth;
  const leftMonthIndex = fyMonths.indexOf(leftFromMonth);

  // We inspect FY months up to active billing month
  const activeMonthIndex = fyMonths.indexOf(activeMonth);
  const relevantMonths = activeMonthIndex !== -1 
    ? fyMonths.slice(0, activeMonthIndex + 1)
    : fyMonths.slice(0, 6);

  const unpaidMonths = [];
  let lastPaidMonth = null;

  for (const m of fyMonths) {
    const record = monthlyHistory[m];
    const isPaid = record && record.status === 'paid';
    if (isPaid) {
      lastPaidMonth = m;
    }
  }

  for (const m of relevantMonths) {
    const mIdx = fyMonths.indexOf(m);
    // If student left transport service, do NOT charge any month on or after leftFromMonth!
    if (isLeft && leftMonthIndex !== -1 && mIdx >= leftMonthIndex) {
      continue; // Skip upcoming months - fee is stopped!
    }

    const record = monthlyHistory[m];
    const isPaid = record && record.status === 'paid';
    const isSubmitted = record && record.status === 'submitted';
    if (!isPaid) {
      const isPast = m !== activeMonth;
      unpaidMonths.push({
        month: m,
        amount: feeAmount,
        status: isSubmitted ? 'submitted' : 'pending',
        isPastDue: isPast,
        voucher: record && record.voucher,
        method: record && record.method
      });
    }
  }

  // Oldest due month MUST be cleared first!
  const hasPastDue = unpaidMonths.some(u => u.isPastDue);
  const oldestDueMonth = unpaidMonths.length > 0 ? unpaidMonths[0].month : activeMonth;
  const targetMonth = oldestDueMonth;
  const targetAmount = unpaidMonths.length > 0 ? unpaidMonths[0].amount : feeAmount;
  const totalDueAmount = unpaidMonths.reduce((sum, u) => sum + (Number(u.amount) || feeAmount), 0);
  const isFullyPaid = unpaidMonths.length === 0;

  let dueTitle = `Due: ${activeMonth}`;
  let dueDescription = `Fee for ${activeMonth}`;

  if (isLeft) {
    if (unpaidMonths.length > 0) {
      dueTitle = `⚠️ Prior Due Before Departure: ${oldestDueMonth}`;
      dueDescription = `Student discontinued transport service from ${leftFromMonth}. Pending fee of ₹${targetAmount.toLocaleString()} for ${oldestDueMonth} must be cleared. Upcoming months are stopped.`;
    } else {
      dueTitle = `🛑 Bus Service Discontinued / Left`;
      dueDescription = `Student discontinued transport service from ${leftFromMonth}. Prior dues are cleared. Upcoming fees are permanently stopped.`;
    }
  } else if (hasPastDue) {
    dueTitle = `⚠️ Past Due: ${oldestDueMonth} (Must Clear First)`;
    dueDescription = `Student has pending fee of ₹${targetAmount.toLocaleString()} for ${oldestDueMonth}. Under transport rules, past dues must be cleared first.`;
  } else if (isFullyPaid) {
    dueTitle = `✓ Paid up to ${lastPaidMonth || activeMonth}`;
    dueDescription = `All fees cleared up to ${lastPaidMonth || activeMonth}.`;
  }

  return {
    studentId: student.id,
    studentName: student.name,
    activeMonth,
    serviceStatus: student.serviceStatus || 'active',
    isLeft,
    leftFromMonth: isLeft ? leftFromMonth : null,
    leftReason: student.leftReason || '',
    leftAt: student.leftAt || null,
    hasPastDue,
    oldestDueMonth,
    targetMonth,
    targetAmount: unpaidMonths.length > 0 ? targetAmount : (isLeft ? 0 : feeAmount),
    totalDueAmount: unpaidMonths.length > 0 ? totalDueAmount : (isLeft ? 0 : feeAmount),
    unpaidCount: unpaidMonths.length,
    unpaidMonths,
    pastDueMonths: unpaidMonths.filter(u => u.isPastDue),
    isFullyPaid,
    isServiceStopped: isLeft && unpaidMonths.length === 0,
    lastPaidMonth: lastPaidMonth || student.paidTill || 'None',
    dueTitle,
    dueDescription
  };
}

function readDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      writeDb(defaultData);
      return defaultData;
    }
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const data = JSON.parse(raw);
    
    // Ensure buses array exists
    if (!data.buses || data.buses.length === 0) {
      data.buses = defaultData.buses;
      writeDb(data);
    }
    // Update scanner image & upi in settings if not set
    if (!data.settings.scannerImage || data.settings.upiId === 'transportservices@upi') {
      data.settings.upiId = "himanshu1461@ptyes";
      data.settings.upiPayeeName = "HIMANSHU WALIA";
      data.settings.scannerImage = "/scanner.png";
      data.settings.currencySymbol = "₹";
      writeDb(data);
    }
    // Initialize Bank Account in settings if missing
    if (!data.settings.bankAccountNumber) {
      data.settings.bankName = "YES Bank";
      data.settings.bankAccountName = "HIMANSHU WALIA";
      data.settings.bankAccountNumber = "14610100012345";
      data.settings.bankIfsc = "YESB0000146";
      data.settings.bankAccountType = "Current Account";
      data.settings.bankBranch = "Civil Lines / City Branch";
      writeDb(data);
    }

    // Ensure all students have monthly history initialized with cleared past months, active month and upcoming months
    let needsSave = false;
    if (data.students && Array.isArray(data.students)) {
      const activeMonth = (data.settings && data.settings.activeMonth) || "September 2026";
      const activeMonthIdx = FY_MONTHS.indexOf(activeMonth);
      const startIdx = activeMonthIdx !== -1 ? activeMonthIdx : 5;

      data.students.forEach(s => {
        if (!s.monthlyHistory) {
          s.monthlyHistory = {};
          needsSave = true;
        }
        PAST_CLEARED_MONTHS.forEach(m => {
          if (!s.monthlyHistory[m]) {
            const mIndex = FY_MONTHS.indexOf(m);
            const paidTillIndex = s.paidTill ? FY_MONTHS.indexOf(s.paidTill) : FY_MONTHS.indexOf("August 2026");
            const isCleared = paidTillIndex >= mIndex;
            s.monthlyHistory[m] = {
              status: isCleared ? "paid" : "pending",
              amount: Number(s.amount) || 2310,
              method: isCleared ? "Pre-cleared (Till Aug)" : "",
              paidAt: isCleared ? "2026-08-31T00:00:00.000Z" : null
            };
            needsSave = true;
          }
        });
        // Ensure current month and all upcoming months are initialized with the student's fixed fee
        for (let i = startIdx; i < FY_MONTHS.length; i++) {
          const m = FY_MONTHS[i];
          if (!s.monthlyHistory[m]) {
            s.monthlyHistory[m] = {
              status: (m === activeMonth && s.status) ? s.status : "pending",
              amount: Number(s.amount) || 2310
            };
            needsSave = true;
          }
        }
        if (!s.paidTill) {
          s.paidTill = "August 2026";
          needsSave = true;
        }
      });
    }
    if (needsSave) {
      writeDb(data);
    }

    return data;
  } catch (err) {
    console.error("Error reading database, using defaults:", err);
    return defaultData;
  }
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error("Error writing database:", err);
  }
}

function generateToken() {
  return 'pay-' + crypto.randomBytes(4).toString('hex');
}

function generateId(prefix = 'STU') {
  return `${prefix}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// ==========================================
// BUS MANAGEMENT (PRIMARY ORGANIZING ENTITY)
// ==========================================

function getBuses(filter = {}) {
  const db = readDb();
  let buses = db.buses || [];
  const students = db.students || [];

  if (filter && filter.school && filter.school !== 'all') {
    const filterSchool = filter.school.toLowerCase().trim();
    buses = buses.filter(b => (b.schoolName || '').toLowerCase().trim() === filterSchool);
  }

  // Calculate student count per bus
  return buses.map(bus => {
    const busNumLower = (bus.busNumber || '').toLowerCase().trim();
    const busSchoolLower = (bus.schoolName || '').toLowerCase().trim();
    const studentCount = students.filter(s => {
      const sBusLower = (s.busNumber || '').toLowerCase().trim();
      const sSchoolLower = (s.schoolName || '').toLowerCase().trim();
      return sBusLower === busNumLower && (!busSchoolLower || sSchoolLower === busSchoolLower);
    }).length;

    return {
      ...bus,
      studentCount
    };
  });
}

function addBus(busData) {
  const db = readDb();
  const cleanNumber = (busData.busNumber || '').trim();
  if (!cleanNumber) throw new Error('Bus Number is required');

  const schoolName = (busData.schoolName || 'Police DAV Public School').trim();
  const matchedSchool = (db.schools || []).find(s => s.name.toLowerCase() === schoolName.toLowerCase());
  const schoolId = busData.schoolId || (matchedSchool ? matchedSchool.id : '');

  // Check duplicate under the same school
  const exists = (db.buses || []).some(b => 
    b.busNumber.toLowerCase() === cleanNumber.toLowerCase() &&
    (b.schoolName || '').toLowerCase() === schoolName.toLowerCase()
  );
  if (exists) throw new Error(`Bus "${cleanNumber}" already exists under ${schoolName}`);

  const newBus = {
    id: `BUS-${Date.now().toString().slice(-4)}`,
    busNumber: cleanNumber,
    schoolName,
    schoolId,
    route: (busData.route || '').trim(),
    driverName: (busData.driverName || '').trim(),
    driverPhone: (busData.driverPhone || '').trim(),
    notes: (busData.notes || '').trim(),
    createdAt: new Date().toISOString()
  };

  if (!db.buses) db.buses = [];
  db.buses.push(newBus);
  writeDb(db);
  return newBus;
}

function updateBus(id, busData) {
  const db = readDb();
  const idx = (db.buses || []).findIndex(b => b.id === id);
  if (idx === -1) return null;

  const oldNumber = db.buses[idx].busNumber;
  const newNumber = busData.busNumber ? busData.busNumber.trim() : oldNumber;
  const oldSchool = db.buses[idx].schoolName || '';
  const newSchool = busData.schoolName ? busData.schoolName.trim() : oldSchool;
  const matchedSchool = (db.schools || []).find(s => s.name.toLowerCase() === newSchool.toLowerCase());
  const schoolId = busData.schoolId || (matchedSchool ? matchedSchool.id : (db.buses[idx].schoolId || ''));

  db.buses[idx] = {
    ...db.buses[idx],
    ...busData,
    busNumber: newNumber,
    schoolName: newSchool,
    schoolId,
    updatedAt: new Date().toISOString()
  };

  // If bus number or school changed, automatically update students assigned to this bus under this school
  if (newNumber.toLowerCase() !== oldNumber.toLowerCase() || newSchool.toLowerCase() !== oldSchool.toLowerCase()) {
    (db.students || []).forEach(st => {
      const matchBus = st.busNumber && st.busNumber.toLowerCase() === oldNumber.toLowerCase();
      const matchSchool = !oldSchool || (st.schoolName && st.schoolName.toLowerCase() === oldSchool.toLowerCase());
      if (matchBus && matchSchool) {
        st.busNumber = newNumber;
        if (newSchool) st.schoolName = newSchool;
        st.updatedAt = new Date().toISOString();
      }
    });
  }

  writeDb(db);
  return db.buses[idx];
}

function deleteBus(id) {
  const db = readDb();
  const bus = (db.buses || []).find(b => b.id === id);
  if (!bus) return false;

  const busNumLower = (bus.busNumber || '').toLowerCase();
  const busSchoolLower = (bus.schoolName || '').toLowerCase();
  const assignedStudents = (db.students || []).filter(s => {
    const sBus = (s.busNumber || '').toLowerCase();
    const sSchool = (s.schoolName || '').toLowerCase();
    return sBus === busNumLower && (!busSchoolLower || sSchool === busSchoolLower);
  }).length;

  if (assignedStudents > 0) {
    throw new Error(`Cannot delete "${bus.busNumber}" because ${assignedStudents} student(s) from ${bus.schoolName || 'school'} are assigned to it. Please reassign them first.`);
  }

  db.buses = db.buses.filter(b => b.id !== id);
  writeDb(db);
  return true;
}

function addBusesBulk(busesList, defaultSchoolName = 'Police DAV Public School') {
  const db = readDb();
  if (!db.buses) db.buses = [];
  const added = [];
  const skipped = [];

  busesList.forEach(item => {
    const cleanNumber = (item.busNumber || '').trim();
    if (!cleanNumber) return;

    const schoolName = (item.schoolName || defaultSchoolName || 'Police DAV Public School').trim();
    const matchedSchool = (db.schools || []).find(s => s.name.toLowerCase() === schoolName.toLowerCase());
    const schoolId = item.schoolId || (matchedSchool ? matchedSchool.id : '');

    const exists = db.buses.some(b => 
      b.busNumber.toLowerCase() === cleanNumber.toLowerCase() &&
      (b.schoolName || '').toLowerCase() === schoolName.toLowerCase()
    );
    if (exists) {
      skipped.push(`${cleanNumber} (${schoolName})`);
      return;
    }

    const newBus = {
      id: `BUS-${Date.now().toString().slice(-4)}-${Math.floor(100 + Math.random() * 900)}`,
      busNumber: cleanNumber,
      schoolName,
      schoolId,
      route: (item.route || '').trim(),
      driverName: (item.driverName || '').trim(),
      driverPhone: (item.driverPhone || '').trim(),
      notes: (item.notes || '').trim(),
      createdAt: new Date().toISOString()
    };

    db.buses.push(newBus);
    added.push(newBus);
  });

  writeDb(db);
  return { added, skipped, totalBuses: db.buses.length };
}

// ==========================================
// STUDENT OPERATIONS
// ==========================================

function getStudents(filters = {}) {
  const db = readDb();
  let students = db.students || [];

  const settings = db.settings || defaultData.settings;
  const currentFy = settings.financialYear || '2026–2027';
  const fyMonths = (settings.fyMonths && settings.fyMonths.length) ? settings.fyMonths : getMonthsForFinancialYear(currentFy);
  const activeMonth = settings.activeMonth || fyMonths[5] || 'September 2026';
  const selectedMonth = filters.month || activeMonth;
  const isPastCleared = isClearedMonth(selectedMonth);
  const activeMonthIdx = fyMonths.indexOf(activeMonth);
  const selectedMonthIdx = fyMonths.indexOf(selectedMonth);
  const isCurrentOrUpcoming = selectedMonthIdx >= activeMonthIdx;

  students = students.map(s => {
    let monthStatus = 'pending';
    const fixedFee = Number(s.amount) || 2310;
    let monthAmount = fixedFee;
    let monthPaidAt = null;
    let monthPaymentApp = '';
    let monthPaymentRef = '';
    let monthPayerInfo = '';
    let monthVerifiedBy = '';

    const isLeft = s.serviceStatus === 'left';
    const leftFromMonth = s.leftFromMonth || selectedMonth;
    const isStoppedForMonth = isLeft && fyMonths.indexOf(selectedMonth) >= fyMonths.indexOf(leftFromMonth);

    if (isStoppedForMonth) {
      monthStatus = 'stopped';
      monthAmount = 0;
      monthPaymentApp = 'Service Discontinued';
    } else if (s.monthlyHistory && s.monthlyHistory[selectedMonth]) {
      const hist = s.monthlyHistory[selectedMonth];
      monthStatus = hist.status || 'pending';
      if (isCurrentOrUpcoming) {
        monthAmount = (hist.status === 'paid' && hist.amount) ? Number(hist.amount) : fixedFee;
      } else {
        monthAmount = Number(hist.amount) || fixedFee;
      }
      monthPaidAt = hist.paidAt || (hist.status === 'paid' ? '2026-08-31T00:00:00.000Z' : null);
      monthPaymentApp = hist.method || (hist.status === 'paid' ? 'Pre-cleared (Till Aug)' : '');
      monthPaymentRef = hist.voucher || (hist.status === 'paid' ? 'CLEARED-AUG-2026' : '');
      monthPayerInfo = hist.payerInfo || hist.collector || (hist.status === 'paid' ? 'Pre-cleared Transport Ledger' : '');
      monthVerifiedBy = hist.collector || (hist.status === 'paid' ? 'School Transport Admin' : '');
    } else if (isPastCleared) {
      monthStatus = 'paid';
      monthPaidAt = '2026-08-31T00:00:00.000Z';
      monthPaymentApp = 'Pre-cleared (Till Aug)';
      monthPaymentRef = 'CLEARED-AUG-2026';
      monthPayerInfo = 'Pre-cleared Transport Ledger';
      monthVerifiedBy = 'School Transport Admin';
    } else if (isCurrentOrUpcoming) {
      monthStatus = (selectedMonth === activeMonth && s.status) ? s.status : 'pending';
      monthAmount = fixedFee;
      monthPaidAt = (selectedMonth === activeMonth && s.status === 'paid') ? s.paidAt : null;
      monthPaymentApp = (selectedMonth === activeMonth && s.status === 'paid') ? (s.paymentApp || '') : '';
      monthPaymentRef = (selectedMonth === activeMonth && s.status === 'paid') ? (s.paymentRef || '') : '';
      monthPayerInfo = (selectedMonth === activeMonth && s.status === 'paid') ? (s.payerInfo || '') : '';
      monthVerifiedBy = (selectedMonth === activeMonth && s.status === 'paid') ? (s.verifiedBy || '') : '';
    }

    let awaitingVerificationMonth = null;
    if (s.monthlyHistory) {
      for (const [m, h] of Object.entries(s.monthlyHistory)) {
        if (h && h.status === 'submitted') {
          awaitingVerificationMonth = m;
          break;
        }
      }
    }
    if (!awaitingVerificationMonth && s.status === 'submitted') {
      awaitingVerificationMonth = s.billingPeriod || selectedMonth;
    }

    return {
      ...s,
      fixedFee,
      selectedMonth,
      serviceStatus: s.serviceStatus || 'active',
      leftFromMonth: s.leftFromMonth || null,
      leftReason: s.leftReason || '',
      isStoppedForMonth,
      status: monthStatus,
      amount: isStoppedForMonth ? 0 : monthAmount,
      paidAt: monthPaidAt,
      paymentApp: monthPaymentApp,
      paymentRef: monthPaymentRef,
      payerInfo: monthPayerInfo,
      verifiedBy: monthVerifiedBy,
      billingPeriod: selectedMonth,
      isClearedTillAugust: isPastCleared || (s.paidTill === "August 2026"),
      hasSubmittedPayment: Boolean(awaitingVerificationMonth),
      awaitingVerificationMonth
    };
  });

  if (filters.busNumber) {
    const qBus = filters.busNumber.toLowerCase().trim();
    students = students.filter(s => s.busNumber && s.busNumber.toLowerCase().trim() === qBus);
  }
  if (filters.school && filters.school !== 'all' && filters.school.trim()) {
    const qSch = filters.school.toLowerCase().trim();
    students = students.filter(s => (s.schoolName || '').toLowerCase().trim() === qSch);
  } else if (filters.schoolName) {
    const qSchName = filters.schoolName.toLowerCase().trim();
    students = students.filter(s => (s.schoolName || '').toLowerCase().trim() === qSchName);
  }
  if (filters.status) {
    if (filters.status === 'cash') {
      students = students.filter(s => s.status === 'paid' && s.paymentApp === 'Cash / Offline');
    } else if (filters.status === 'online') {
      students = students.filter(s => s.status === 'paid' && s.paymentApp && s.paymentApp !== 'Cash / Offline' && !s.paymentApp.includes('Pre-cleared'));
    } else if (filters.status === 'active') {
      students = students.filter(s => s.serviceStatus !== 'left');
    } else if (filters.status === 'left') {
      students = students.filter(s => s.serviceStatus === 'left');
    } else if (filters.status === 'submitted') {
      students = students.filter(s => s.status === 'submitted' || s.hasSubmittedPayment);
    } else {
      students = students.filter(s => s.status === filters.status);
    }
  }
  if (filters.search) {
    const q = filters.search.toLowerCase().trim();
    students = students.filter(s => 
      s.name.toLowerCase().includes(q) ||
      (s.parentPhone && s.parentPhone.includes(q)) ||
      (s.busNumber && s.busNumber.toLowerCase().includes(q)) ||
      (s.classGrade && s.classGrade.toLowerCase().includes(q)) ||
      (s.routeStop && s.routeStop.toLowerCase().includes(q)) ||
      (s.schoolName && s.schoolName.toLowerCase().includes(q))
    );
  }

  return students;
}

function getStudentById(id) {
  const db = readDb();
  return (db.students || []).find(s => s.id === id) || null;
}

function getStudentByToken(token) {
  const db = readDb();
  return (db.students || []).find(s => s.token === token) || null;
}

function addStudent(data) {
  const db = readDb();
  const cleanBus = (data.busNumber || 'Bus #01').trim();

  const newStudent = {
    id: generateId('STU'),
    token: generateToken(),
    name: (data.name || '').trim(),
    busNumber: cleanBus,
    routeStop: (data.routeStop || '').trim(),
    classGrade: (data.classGrade || '').trim(),
    schoolName: (data.schoolName || '').trim(),
    rollNo: (data.rollNo || '').trim(),
    parentName: (data.parentName || '').trim(),
    parentPhone: (data.parentPhone || '').trim(),
    amount: Number(data.amount) || 0,
    billingPeriod: data.billingPeriod || "Current Month",
    status: data.status || "pending",
    paidAt: data.status === 'paid' ? new Date().toISOString() : null,
    paymentRef: data.paymentRef || "",
    notes: (data.notes || '').trim(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (!db.students) db.students = [];
  db.students.push(newStudent);

  // Auto add bus to buses array if not existing
  if (cleanBus && db.buses) {
    const busExists = db.buses.some(b => b.busNumber.toLowerCase() === cleanBus.toLowerCase());
    if (!busExists) {
      db.buses.push({
        id: `BUS-${Date.now().toString().slice(-4)}`,
        busNumber: cleanBus,
        route: newStudent.routeStop || 'Route Not Specified',
        driverName: '',
        driverPhone: '',
        notes: '',
        createdAt: new Date().toISOString()
      });
    }
  }

  writeDb(db);
  return newStudent;
}

function updateStudent(id, data) {
  const db = readDb();
  const idx = (db.students || []).findIndex(s => s.id === id);
  if (idx === -1) return null;

  const existing = db.students[idx];
  const newAmount = data.amount !== undefined ? Number(data.amount) : (Number(existing.amount) || 0);

  const updated = {
    ...existing,
    ...data,
    name: data.name !== undefined ? data.name.trim() : existing.name,
    busNumber: data.busNumber !== undefined ? data.busNumber.trim() : existing.busNumber,
    routeStop: data.routeStop !== undefined ? data.routeStop.trim() : existing.routeStop,
    classGrade: data.classGrade !== undefined ? data.classGrade.trim() : existing.classGrade,
    schoolName: data.schoolName !== undefined ? data.schoolName.trim() : existing.schoolName,
    rollNo: data.rollNo !== undefined ? data.rollNo.trim() : existing.rollNo,
    parentName: data.parentName !== undefined ? data.parentName.trim() : existing.parentName,
    parentPhone: data.parentPhone !== undefined ? data.parentPhone.trim() : existing.parentPhone,
    amount: newAmount,
    fixedFee: newAmount,
    billingPeriod: data.billingPeriod !== undefined ? data.billingPeriod : existing.billingPeriod,
    status: data.status !== undefined ? data.status : existing.status,
    serviceStatus: data.serviceStatus !== undefined ? data.serviceStatus : (existing.serviceStatus || 'active'),
    leftFromMonth: data.leftFromMonth !== undefined ? data.leftFromMonth : (existing.leftFromMonth || null),
    leftReason: data.leftReason !== undefined ? data.leftReason : (existing.leftReason || ''),
    leftAt: data.leftAt !== undefined ? data.leftAt : (existing.leftAt || null),
    notes: data.notes !== undefined ? data.notes.trim() : existing.notes,
    updatedAt: new Date().toISOString()
  };

  if (data.status === 'paid' && !existing.paidAt) {
    updated.paidAt = new Date().toISOString();
  } else if (data.status === 'pending') {
    updated.paidAt = null;
  }

  // Propagate new fixed fee to current month AND ALL upcoming months in FY 2026-27
  if (data.amount !== undefined) {
    if (!updated.monthlyHistory) updated.monthlyHistory = {};
    const activeMonth = (db.settings && db.settings.activeMonth) || 'September 2026';
    const activeMonthIdx = FY_MONTHS.indexOf(activeMonth);
    const startIdx = activeMonthIdx !== -1 ? activeMonthIdx : 5;

    for (let i = startIdx; i < FY_MONTHS.length; i++) {
      const m = FY_MONTHS[i];
      if (!updated.monthlyHistory[m]) {
        updated.monthlyHistory[m] = {
          status: (m === activeMonth && updated.status) ? updated.status : "pending",
          amount: newAmount
        };
      } else if (updated.monthlyHistory[m].status !== 'paid') {
        updated.monthlyHistory[m].amount = newAmount;
      }
    }
  }

  db.students[idx] = updated;
  writeDb(db);
  return updated;
}

function deleteStudent(id) {
  const db = readDb();
  const initialLen = (db.students || []).length;
  db.students = (db.students || []).filter(s => s.id !== id);
  writeDb(db);
  return db.students.length < initialLen;
}

function confirmParentPayment(token, refData = {}) {
  const db = readDb();
  const idx = (db.students || []).findIndex(s => s.token === token);
  if (idx === -1) return null;

  db.students[idx].status = 'paid';
  db.students[idx].paidAt = new Date().toISOString();
  db.students[idx].paymentRef = refData.reference || `UTR-${Date.now().toString().slice(-6)}`;
  db.students[idx].updatedAt = new Date().toISOString();

  writeDb(db);
  return db.students[idx];
}

function updateStudentFee(id, amount) {
  const db = readDb();
  const idx = (db.students || []).findIndex(s => s.id === id);
  if (idx === -1) return null;

  const newAmount = Number(amount) || 0;
  const student = db.students[idx];
  student.amount = newAmount;
  student.fixedFee = newAmount;
  student.updatedAt = new Date().toISOString();

  if (!student.monthlyHistory) student.monthlyHistory = {};

  const activeMonth = (db.settings && db.settings.activeMonth) || 'September 2026';
  const activeMonthIdx = FY_MONTHS.indexOf(activeMonth);
  const startIdx = activeMonthIdx !== -1 ? activeMonthIdx : 5;

  // Propagate to current month AND ALL upcoming months in FY 2026-27!
  for (let i = startIdx; i < FY_MONTHS.length; i++) {
    const m = FY_MONTHS[i];
    if (!student.monthlyHistory[m]) {
      student.monthlyHistory[m] = {
        status: (m === activeMonth && student.status) ? student.status : "pending",
        amount: newAmount
      };
    } else if (student.monthlyHistory[m].status !== 'paid') {
      student.monthlyHistory[m].amount = newAmount;
    }
  }

  writeDb(db);
  return student;
}

// Stop upcoming transport fee obligations starting from a chosen departure month
function markStudentLeft(id, leftFromMonth, reason = '') {
  const db = readDb();
  const idx = (db.students || []).findIndex(s => s.id === id);
  if (idx === -1) return null;

  const validMonth = FY_MONTHS.includes(leftFromMonth) ? leftFromMonth : (db.settings?.activeMonth || 'September 2026');

  db.students[idx].serviceStatus = 'left';
  db.students[idx].leftFromMonth = validMonth;
  db.students[idx].leftReason = (reason || '').trim();
  db.students[idx].leftAt = new Date().toISOString();
  db.students[idx].updatedAt = new Date().toISOString();

  writeDb(db);
  return db.students[idx];
}

// Restore a previously discontinued student back to active bus service
function reactivateStudent(id) {
  const db = readDb();
  const idx = (db.students || []).findIndex(s => s.id === id);
  if (idx === -1) return null;

  db.students[idx].serviceStatus = 'active';
  db.students[idx].leftFromMonth = null;
  db.students[idx].leftReason = '';
  db.students[idx].leftAt = null;
  db.students[idx].updatedAt = new Date().toISOString();

  writeDb(db);
  return db.students[idx];
}

// ==========================================
// SIBLING GROUPING / CLUBBING
// ==========================================

function clubStudents(studentIds, customGroupName = '') {
  if (!Array.isArray(studentIds) || studentIds.length < 2) {
    throw new Error('At least 2 students are required to club siblings together.');
  }

  const db = readDb();
  const existingGroupIds = studentIds
    .map(id => (db.students || []).find(s => s.id === id)?.siblingGroupId)
    .filter(Boolean);

  const groupId = existingGroupIds[0] || `SIB-${Date.now().toString().slice(-4)}`;
  const groupName = customGroupName.trim() || `Sibling Family (${groupId})`;

  const updatedStudents = [];
  db.students = (db.students || []).map(st => {
    if (studentIds.includes(st.id)) {
      st.siblingGroupId = groupId;
      st.siblingGroupName = groupName;
      st.updatedAt = new Date().toISOString();
      updatedStudents.push(st);
    }
    return st;
  });

  writeDb(db);
  return { groupId, groupName, students: updatedStudents };
}

function unclubStudent(studentId) {
  const db = readDb();
  const student = (db.students || []).find(s => s.id === studentId);
  if (!student || !student.siblingGroupId) return null;

  const oldGroupId = student.siblingGroupId;
  student.siblingGroupId = null;
  student.siblingGroupName = null;
  student.updatedAt = new Date().toISOString();

  // Check how many students remain in the old group
  const remainingInGroup = (db.students || []).filter(s => s.siblingGroupId === oldGroupId);
  if (remainingInGroup.length <= 1) {
    remainingInGroup.forEach(s => {
      s.siblingGroupId = null;
      s.siblingGroupName = null;
      s.updatedAt = new Date().toISOString();
    });
  }

  writeDb(db);
  return student;
}

function getSiblings(studentId) {
  const db = readDb();
  const student = (db.students || []).find(s => s.id === studentId);
  if (!student || !student.siblingGroupId) return [];

  return (db.students || []).filter(s => s.siblingGroupId === student.siblingGroupId && s.id !== studentId);
}

function getSiblingsByToken(token) {
  const db = readDb();
  const student = (db.students || []).find(s => s.token === token);
  if (!student || !student.siblingGroupId) return [];

  return (db.students || []).filter(s => s.siblingGroupId === student.siblingGroupId && s.token !== token);
}

function submitParentPayment(token, paymentData = {}) {
  const db = readDb();
  const idx = (db.students || []).findIndex(s => s.token === token);
  if (idx === -1) return null;

  const primaryStudent = db.students[idx];
  const now = new Date().toISOString();
  const activeMonth = (db.settings && db.settings.activeMonth) || primaryStudent.billingPeriod || 'September 2026';

  const dueDetails = getStudentDueDetails(primaryStudent, db.settings);
  const targetMonth = paymentData.targetMonth || (dueDetails && dueDetails.targetMonth) || activeMonth;

  const appName = paymentData.appName || 'UPI App';
  const payerInfo = paymentData.payerInfo || paymentData.parentPhone || '';
  const ref = paymentData.reference || '';
  const isClubbed = Boolean(paymentData.isClubbed);

  // Set status to submitted (awaiting owner verification)
  primaryStudent.status = 'submitted';
  primaryStudent.billingPeriod = targetMonth;
  primaryStudent.submittedAt = now;
  primaryStudent.paymentApp = appName;
  primaryStudent.payerInfo = payerInfo;
  primaryStudent.paymentRef = ref || `REF-${Date.now().toString().slice(-6)}`;
  primaryStudent.isClubbedPayment = isClubbed;
  primaryStudent.updatedAt = now;

  const studentFixedFee = Number(primaryStudent.fixedFee !== undefined ? primaryStudent.fixedFee : primaryStudent.amount) || 2310;

  if (!primaryStudent.monthlyHistory) primaryStudent.monthlyHistory = {};
  primaryStudent.monthlyHistory[targetMonth] = {
    status: 'submitted',
    amount: studentFixedFee,
    method: appName,
    voucher: primaryStudent.paymentRef,
    payerInfo: payerInfo,
    submittedAt: now,
    targetMonth
  };

  const updatedStudents = [primaryStudent];

  // If clubbed payment, also update all siblings sharing the group
  if (isClubbed && primaryStudent.siblingGroupId) {
    const siblings = (db.students || []).filter(s => s.siblingGroupId === primaryStudent.siblingGroupId && s.token !== token);
    siblings.forEach(sib => {
      const sibDue = getStudentDueDetails(sib, db.settings);
      const sibTargetMonth = (sibDue && sibDue.targetMonth) || targetMonth;
      const sibFixedFee = Number(sib.fixedFee !== undefined ? sib.fixedFee : sib.amount) || 2310;
      sib.status = 'submitted';
      sib.billingPeriod = sibTargetMonth;
      sib.submittedAt = now;
      sib.paymentApp = appName;
      sib.payerInfo = payerInfo;
      sib.paymentRef = primaryStudent.paymentRef;
      sib.isClubbedPayment = true;
      sib.updatedAt = now;

      if (!sib.monthlyHistory) sib.monthlyHistory = {};
      sib.monthlyHistory[sibTargetMonth] = {
        status: 'submitted',
        amount: sibFixedFee,
        method: appName,
        voucher: primaryStudent.paymentRef,
        payerInfo: payerInfo,
        submittedAt: now,
        targetMonth: sibTargetMonth
      };

      updatedStudents.push(sib);
    });
  }

  writeDb(db);
  return {
    student: primaryStudent,
    updatedStudents,
    isClubbed,
    targetMonth
  };
}

function approveStudentPayment(id, specificMonth = null) {
  const db = readDb();
  const idx = (db.students || []).findIndex(s => s.id === id);
  if (idx === -1) return null;

  const now = new Date().toISOString();
  const student = db.students[idx];
  const dueDetails = getStudentDueDetails(student, db.settings);
  const submittedMonth = Object.keys(student.monthlyHistory || {}).find(m => student.monthlyHistory[m]?.status === 'submitted');
  const targetMonth = specificMonth || submittedMonth || student.billingPeriod || (dueDetails && dueDetails.targetMonth) || 'September 2026';

  const submittedRecord = student.monthlyHistory && student.monthlyHistory[targetMonth];
  const approvedAmount = (submittedRecord && Number(submittedRecord.amount)) || Number(student.amount) || 2310;
  const approvedMethod = (submittedRecord && submittedRecord.method) || student.paymentApp || 'Online UPI';
  const approvedVoucher = (submittedRecord && submittedRecord.voucher) || student.paymentRef || 'VERIFIED-BY-ADMIN';
  const approvedPayer = (submittedRecord && submittedRecord.payerInfo) || student.payerInfo || '';

  student.paidAt = now;
  student.billingPeriod = targetMonth;
  student.paidTill = targetMonth;
  student.paymentApp = approvedMethod;
  student.paymentRef = approvedVoucher;
  student.payerInfo = approvedPayer;
  student.verifiedBy = 'Admin (Himanshu Walia)';
  student.rejectionReason = '';
  student.updatedAt = now;

  if (!student.monthlyHistory) student.monthlyHistory = {};
  student.monthlyHistory[targetMonth] = {
    status: 'paid',
    amount: approvedAmount,
    method: approvedMethod,
    voucher: approvedVoucher,
    payerInfo: approvedPayer,
    collector: 'Admin (Himanshu Walia)',
    paidAt: now
  };

  // If any other month is still submitted, remain submitted; otherwise set status to paid
  const remainingSubmitted = Object.values(student.monthlyHistory).some(h => h && h.status === 'submitted');
  student.status = remainingSubmitted ? 'submitted' : 'paid';

  const approvedStudents = [student];

  // If this student was part of a clubbed payment, also approve their siblings!
  if (student.siblingGroupId && student.isClubbedPayment) {
    const siblings = (db.students || []).filter(s => s.siblingGroupId === student.siblingGroupId && s.id !== id);
    siblings.forEach(sib => {
      const sibDue = getStudentDueDetails(sib, db.settings);
      const sibSubmittedMonth = Object.keys(sib.monthlyHistory || {}).find(m => sib.monthlyHistory[m]?.status === 'submitted');
      const sibTargetMonth = sibSubmittedMonth || sib.billingPeriod || (sibDue && sibDue.targetMonth) || targetMonth;
      
      const sibSubmittedRecord = sib.monthlyHistory && sib.monthlyHistory[sibTargetMonth];
      const sibApprovedAmount = (sibSubmittedRecord && Number(sibSubmittedRecord.amount)) || Number(sib.amount) || 2310;
      const sibApprovedMethod = (sibSubmittedRecord && sibSubmittedRecord.method) || approvedMethod || 'Online UPI';
      const sibApprovedVoucher = (sibSubmittedRecord && sibSubmittedRecord.voucher) || approvedVoucher || 'VERIFIED-BY-ADMIN';
      const sibApprovedPayer = (sibSubmittedRecord && sibSubmittedRecord.payerInfo) || approvedPayer || '';

      sib.paidAt = now;
      sib.billingPeriod = sibTargetMonth;
      sib.paidTill = sibTargetMonth;
      sib.paymentApp = sibApprovedMethod;
      sib.paymentRef = sibApprovedVoucher;
      sib.payerInfo = sibApprovedPayer;
      sib.verifiedBy = 'Admin (Himanshu Walia)';
      sib.rejectionReason = '';
      sib.updatedAt = now;

      if (!sib.monthlyHistory) sib.monthlyHistory = {};
      sib.monthlyHistory[sibTargetMonth] = {
        status: 'paid',
        amount: sibApprovedAmount,
        method: sibApprovedMethod,
        voucher: sibApprovedVoucher,
        payerInfo: sibApprovedPayer,
        collector: 'Admin (Himanshu Walia)',
        paidAt: now
      };

      const sibRemainingSubmitted = Object.values(sib.monthlyHistory).some(h => h && h.status === 'submitted');
      sib.status = sibRemainingSubmitted ? 'submitted' : 'paid';

      approvedStudents.push(sib);
    });
  }

  writeDb(db);
  return { student, approvedStudents, approvedMonth: targetMonth };
}

function rejectStudentPayment(id, reason = '', specificMonth = null) {
  const db = readDb();
  const idx = (db.students || []).findIndex(s => s.id === id);
  if (idx === -1) return null;

  const now = new Date().toISOString();
  const student = db.students[idx];
  const submittedMonth = Object.keys(student.monthlyHistory || {}).find(m => student.monthlyHistory[m]?.status === 'submitted');
  const targetMonth = specificMonth || submittedMonth || student.billingPeriod || (db.settings && db.settings.activeMonth) || 'September 2026';

  student.status = 'pending';
  student.paidAt = null;
  student.rejectionReason = reason || 'Payment not detected in bank account';
  student.updatedAt = now;

  if (!student.monthlyHistory) student.monthlyHistory = {};
  student.monthlyHistory[targetMonth] = {
    status: 'pending',
    amount: Number(student.amount) || 2310,
    rejectionReason: student.rejectionReason,
    rejectedAt: now
  };

  const rejectedStudents = [student];

  if (student.siblingGroupId && student.isClubbedPayment) {
    const siblings = (db.students || []).filter(s => s.siblingGroupId === student.siblingGroupId && s.id !== id);
    siblings.forEach(sib => {
      sib.status = 'pending';
      sib.paidAt = null;
      sib.rejectionReason = reason || 'Payment not detected in bank account';
      sib.updatedAt = now;

      if (!sib.monthlyHistory) sib.monthlyHistory = {};
      sib.monthlyHistory[targetMonth] = {
        status: 'pending',
        amount: Number(sib.amount) || 2310,
        rejectionReason: sib.rejectionReason,
        rejectedAt: now
      };

      rejectedStudents.push(sib);
    });
  }

  writeDb(db);
  return { student, rejectedStudents, targetMonth };
}

function updatePaymentStatus(id, { status, paymentMethod, paymentRef, payerInfo, notes, updateSiblings = false, month = 'September 2026' }) {
  const db = readDb();
  const idx = (db.students || []).findIndex(s => s.id === id);
  if (idx === -1) return null;

  const now = new Date().toISOString();
  const student = db.students[idx];
  const oldStatus = student.status;

  student.status = status;
  student.updatedAt = now;

  if (status === 'paid') {
    student.paidAt = student.paidAt || now;
    student.verifiedBy = 'Transport Owner';
    student.rejectionReason = '';
    student.billingPeriod = month;
    student.paidTill = month;
    if (paymentMethod) student.paymentApp = paymentMethod;
    if (paymentRef !== undefined && paymentRef.trim()) student.paymentRef = paymentRef.trim();
    if (payerInfo !== undefined && payerInfo.trim()) student.payerInfo = payerInfo.trim();
  } else if (status === 'pending') {
    student.paidAt = null;
    student.verifiedBy = '';
    student.rejectionReason = '';
  } else if (status === 'submitted') {
    student.paidAt = null;
    if (paymentMethod) student.paymentApp = paymentMethod;
    if (paymentRef !== undefined && paymentRef.trim()) student.paymentRef = paymentRef.trim();
    if (payerInfo !== undefined && payerInfo.trim()) student.payerInfo = payerInfo.trim();
  }

  if (notes !== undefined && notes !== null) {
    student.notes = notes.trim();
  }

  if (!student.monthlyHistory) student.monthlyHistory = {};
  student.monthlyHistory[month] = {
    status,
    amount: Number(student.amount) || 2310,
    method: paymentMethod || student.paymentApp || (status === 'paid' ? 'Manual Edit' : ''),
    voucher: paymentRef !== undefined ? paymentRef : (student.paymentRef || ''),
    payerInfo: payerInfo !== undefined ? payerInfo : (student.payerInfo || ''),
    paidAt: status === 'paid' ? (student.paidAt || now) : null
  };

  const affectedStudents = [student];

  if (updateSiblings && student.siblingGroupId) {
    const siblings = (db.students || []).filter(s => s.siblingGroupId === student.siblingGroupId && s.id !== id);
    siblings.forEach(sib => {
      sib.status = status;
      sib.updatedAt = now;
      if (status === 'paid') {
        sib.paidAt = sib.paidAt || now;
        sib.verifiedBy = 'Transport Owner';
        sib.rejectionReason = '';
        sib.billingPeriod = month;
        sib.paidTill = month;
        if (paymentMethod) sib.paymentApp = paymentMethod;
        if (paymentRef !== undefined && paymentRef.trim()) sib.paymentRef = paymentRef.trim();
        if (payerInfo !== undefined && payerInfo.trim()) sib.payerInfo = payerInfo.trim();
      } else if (status === 'pending') {
        sib.paidAt = null;
        sib.verifiedBy = '';
        sib.rejectionReason = '';
      } else if (status === 'submitted') {
        sib.paidAt = null;
        if (paymentMethod) sib.paymentApp = paymentMethod;
        if (paymentRef !== undefined && paymentRef.trim()) sib.paymentRef = paymentRef.trim();
        if (payerInfo !== undefined && payerInfo.trim()) sib.payerInfo = payerInfo.trim();
      }

      if (!sib.monthlyHistory) sib.monthlyHistory = {};
      sib.monthlyHistory[month] = {
        status,
        amount: Number(sib.amount) || 2310,
        method: paymentMethod || sib.paymentApp || (status === 'paid' ? 'Manual Edit' : ''),
        voucher: paymentRef !== undefined ? paymentRef : (sib.paymentRef || ''),
        payerInfo: payerInfo !== undefined ? payerInfo : (sib.payerInfo || ''),
        paidAt: status === 'paid' ? (sib.paidAt || now) : null
      };

      affectedStudents.push(sib);
    });
  }

  writeDb(db);
  return { student, affectedStudents, previousStatus: oldStatus };
}

function markAllPaidTillAugust() {
  const db = readDb();
  const students = db.students || [];
  const now = new Date().toISOString();

  students.forEach(s => {
    s.billingPeriod = "September 2026";
    s.paidTill = "August 2026";
    s.status = "pending";
    s.paidAt = null;
    s.paymentRef = "";
    s.paymentApp = "";
    s.payerInfo = "";
    s.updatedAt = now;

    if (!s.monthlyHistory) s.monthlyHistory = {};
    const monthsCleared = ["April 2026", "May 2026", "June 2026", "July 2026", "August 2026"];
    monthsCleared.forEach(m => {
      s.monthlyHistory[m] = {
        status: "paid",
        amount: Number(s.amount) || 2310,
        method: "Pre-cleared (Till Aug)",
        paidAt: "2026-08-31T00:00:00.000Z"
      };
    });

    s.monthlyHistory["September 2026"] = {
      status: "pending",
      amount: Number(s.amount) || 2310
    };
  });

  if (!db.settings) db.settings = {};
  db.settings.activeMonth = "September 2026";
  db.settings.financialYear = "2026–2027";
  db.settings.allPaidTillAugust = true;

  writeDb(db);
  return { updatedCount: students.length, activeMonth: "September 2026", paidTill: "August 2026" };
}

function recordCashPayment(id, { amount, month = null, collector = 'Admin (Himanshu Walia)', voucherNo, notes = '', payerInfo = '', updateSiblings = false }) {
  const db = readDb();
  const idx = (db.students || []).findIndex(s => s.id === id);
  if (idx === -1) return null;

  const now = new Date().toISOString();
  const student = db.students[idx];
  const dueDetails = getStudentDueDetails(student, db.settings);
  const targetMonth = month || (dueDetails && dueDetails.targetMonth) || 'September 2026';
  const cashVoucher = voucherNo && voucherNo.trim() ? voucherNo.trim() : `CASH-${Date.now().toString().slice(-6)}`;
  const payAmount = Number(amount) || Number(student.amount) || 2310;
  const parentName = student.parentName ? student.parentName.trim() : 'Parent';
  const cleanCollector = collector && collector.trim() ? collector.trim() : 'Admin (Himanshu Walia)';
  const cleanPayerInfo = payerInfo && payerInfo.trim() 
    ? payerInfo.trim() 
    : `Handed by ${parentName} (Received by ${cleanCollector})`;

  student.status = 'paid';
  student.paidAt = now;
  student.paymentApp = 'Cash / Offline';
  student.paymentRef = cashVoucher;
  student.payerInfo = cleanPayerInfo;
  student.verifiedBy = cleanCollector;
  student.billingPeriod = targetMonth;
  student.paidTill = targetMonth;
  if (notes && notes.trim()) student.notes = notes.trim();
  student.updatedAt = now;

  if (!student.monthlyHistory) student.monthlyHistory = {};
  student.monthlyHistory[targetMonth] = {
    status: 'paid',
    amount: payAmount,
    method: 'Cash / Offline',
    collector: cleanCollector,
    payerInfo: cleanPayerInfo,
    voucher: cashVoucher,
    paidAt: now
  };

  const affectedStudents = [student];

  if (updateSiblings && student.siblingGroupId) {
    const siblings = (db.students || []).filter(s => s.siblingGroupId === student.siblingGroupId && s.id !== id);
    siblings.forEach(sib => {
      const sibDue = getStudentDueDetails(sib, db.settings);
      const sibTargetMonth = sib.billingPeriod || (sibDue && sibDue.targetMonth) || targetMonth;
      const sibParent = sib.parentName ? sib.parentName.trim() : parentName;
      const sibPayerInfo = `Handed by ${sibParent} (Sibling Group - Received by ${cleanCollector})`;
      sib.status = 'paid';
      sib.paidAt = now;
      sib.paymentApp = 'Cash / Offline';
      sib.paymentRef = cashVoucher;
      sib.payerInfo = sibPayerInfo;
      sib.verifiedBy = cleanCollector;
      sib.billingPeriod = sibTargetMonth;
      sib.paidTill = sibTargetMonth;
      if (notes && notes.trim()) sib.notes = notes.trim();
      sib.updatedAt = now;

      if (!sib.monthlyHistory) sib.monthlyHistory = {};
      sib.monthlyHistory[sibTargetMonth] = {
        status: 'paid',
        amount: Number(sib.amount) || payAmount,
        method: 'Cash / Offline',
        collector: cleanCollector,
        payerInfo: sibPayerInfo,
        voucher: cashVoucher,
        paidAt: now
      };

      affectedStudents.push(sib);
    });
  }

  writeDb(db);
  return { student, affectedStudents, paidMonth: targetMonth, totalCollected: affectedStudents.reduce((sum, s) => sum + (Number(s.amount) || 0), 0) };
}

// ==========================================
// SCHOOL OPERATIONS
// ==========================================

function getSchools() {
  const db = readDb();
  const schools = db.schools || [];
  const students = db.students || [];
  const buses = db.buses || [];
  return schools.map(sch => {
    const schLower = (sch.name || '').toLowerCase().trim();
    const studentCount = students.filter(st => 
      (st.schoolName || '').toLowerCase().trim() === schLower
    ).length;
    const schBuses = buses.filter(b => 
      (b.schoolName || '').toLowerCase().trim() === schLower
    );
    return {
      ...sch,
      studentCount,
      busCount: schBuses.length,
      buses: schBuses.map(b => b.busNumber)
    };
  });
}

function addSchool(data) {
  const db = readDb();
  if (!db.schools) db.schools = [];
  const cleanName = (data.name || '').trim();
  if (!cleanName) throw new Error('School name is required');

  const exists = db.schools.some(s => s.name.toLowerCase() === cleanName.toLowerCase());
  if (exists) throw new Error(`School "${cleanName}" already exists`);

  const newSchool = {
    id: `SCH-${Date.now().toString().slice(-4)}-${Math.floor(100 + Math.random() * 900)}`,
    name: cleanName,
    code: (data.code || '').trim().toUpperCase(),
    contactPerson: (data.contactPerson || '').trim(),
    phone: (data.phone || '').trim(),
    address: (data.address || '').trim(),
    createdAt: new Date().toISOString()
  };

  db.schools.push(newSchool);
  writeDb(db);
  return newSchool;
}

function updateSchool(id, data) {
  const db = readDb();
  const idx = (db.schools || []).findIndex(s => s.id === id);
  if (idx === -1) return null;

  const oldName = db.schools[idx].name;
  const newName = data.name ? data.name.trim() : oldName;

  db.schools[idx] = {
    ...db.schools[idx],
    ...data,
    name: newName,
    updatedAt: new Date().toISOString()
  };

  // If school name changed, update all assigned students automatically
  if (newName.toLowerCase() !== oldName.toLowerCase()) {
    (db.students || []).forEach(st => {
      if (st.schoolName && st.schoolName.toLowerCase() === oldName.toLowerCase()) {
        st.schoolName = newName;
        st.updatedAt = new Date().toISOString();
      }
    });
  }

  writeDb(db);
  return db.schools[idx];
}

function deleteSchool(id) {
  const db = readDb();
  const school = (db.schools || []).find(s => s.id === id);
  if (!school) return false;

  const assignedCount = (db.students || []).filter(s => 
    s.schoolName && s.schoolName.toLowerCase() === school.name.toLowerCase()
  ).length;

  if (assignedCount > 0) {
    throw new Error(`Cannot delete "${school.name}" because ${assignedCount} student(s) belong to this school. Please reassign them first.`);
  }

  db.schools = db.schools.filter(s => s.id !== id);
  writeDb(db);
  return true;
}

// Settings
function getSettings() {
  const db = readDb();
  const settings = db.settings || defaultData.settings;
  const currentFy = settings.financialYear || "2026–2027";
  const fyMonths = getMonthsForFinancialYear(currentFy);
  return {
    ...settings,
    proprietorName: settings.proprietorName || "LALIT KUMAR WALIA",
    accountType: settings.accountType || "merchant",
    merchantProvider: settings.merchantProvider || "Paytm for Business",
    merchantUpiId: settings.merchantUpiId || "paytmqr2810050501011@paytm",
    merchantBusinessName: settings.merchantBusinessName || settings.businessName || "RAM RAM JI TRANSPORT",
    merchantMcc: settings.merchantMcc || "4111",
    merchantMid: settings.merchantMid || "",
    merchantVerified: settings.merchantVerified !== undefined ? settings.merchantVerified : true,
    financialYear: currentFy,
    availableYears: generateAvailableYears(currentFy),
    activeMonth: settings.activeMonth || "September 2026",
    fyMonths: fyMonths
  };
}

function updateSettings(newSettings) {
  const db = readDb();
  const currentFy = newSettings.financialYear || (db.settings && db.settings.financialYear) || "2026–2027";
  const fyMonths = getMonthsForFinancialYear(currentFy);
  db.settings = {
    ...db.settings,
    ...newSettings,
    financialYear: currentFy,
    fyMonths: fyMonths
  };
  writeDb(db);
  return getSettings();
}

// Summary Statistics
function getStats(month, school = 'all') {
  const db = readDb();
  const selectedMonth = month || (db.settings && db.settings.activeMonth) || 'September 2026';
  const students = getStudents({ month: selectedMonth, school });
  const buses = db.buses || [];
  const schools = getSchools();

  const totalStudents = students.length;
  // Students who have left on or before this month have their upcoming fee stopped
  const activeStudents = students.filter(s => !s.isStoppedForMonth);
  const leftStudents = students.filter(s => s.isStoppedForMonth);

  const paidStudents = activeStudents.filter(s => s.status === 'paid');
  const submittedStudents = activeStudents.filter(s => s.status === 'submitted');
  const pendingStudents = activeStudents.filter(s => s.status === 'pending');

  const totalRevenue = activeStudents.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const collectedRevenue = paidStudents.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const pendingRevenue = pendingStudents.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const allSubmittedStudents = students.filter(s => s.status === 'submitted' || s.hasSubmittedPayment);
  let totalSubmittedRevenue = 0;
  allSubmittedStudents.forEach(s => {
    let sAmt = 0;
    if (s.monthlyHistory) {
      Object.entries(s.monthlyHistory).forEach(([m, h]) => {
        if (h && h.status === 'submitted') {
          sAmt += (Number(h.amount) || Number(s.amount) || 2310);
        }
      });
    }
    if (sAmt === 0) {
      sAmt = Number(s.amount) || 2310;
    }
    totalSubmittedRevenue += sAmt;
  });

  const busesList = buses.map(b => b.busNumber);

  return {
    month: selectedMonth,
    school: school || 'all',
    isPastCleared: isClearedMonth(selectedMonth),
    totalStudents,
    activeStudentsCount: activeStudents.length,
    leftStudentsCount: leftStudents.length,
    activeBusesCount: buses.length,
    totalSchoolsCount: schools.length,
    busesList,
    totalRevenue,
    collectedRevenue,
    pendingRevenue,
    submittedRevenue: totalSubmittedRevenue,
    paidCount: paidStudents.length,
    submittedCount: allSubmittedStudents.length,
    pendingCount: pendingStudents.length
  };
}

// ==========================================
// ADMIN AUTHENTICATION & SESSIONS
// ==========================================

function getAdminCredentials() {
  const db = readDb();
  const settings = db.settings || defaultData.settings;
  return {
    username: settings.adminUsername || 'admin',
    password: settings.adminPassword || 'admin123'
  };
}

function verifyAdminCredentials(username, password) {
  const creds = getAdminCredentials();
  if (!username || !password) return false;
  return (
    username.trim().toLowerCase() === creds.username.trim().toLowerCase() &&
    password === creds.password
  );
}

function updateAdminCredentials(newUsername, newPassword) {
  const db = readDb();
  if (!db.settings) db.settings = { ...defaultData.settings };
  if (newUsername && newUsername.trim()) {
    db.settings.adminUsername = newUsername.trim();
  }
  if (newPassword && newPassword.trim()) {
    db.settings.adminPassword = newPassword.trim();
  }
  writeDb(db);
  return {
    username: db.settings.adminUsername,
    success: true
  };
}

function createAdminSession(username) {
  const db = readDb();
  if (!db.sessions) db.sessions = [];
  
  const token = crypto.randomBytes(32).toString('hex');
  // 30 days expiration
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  
  const session = {
    token,
    username: username || 'admin',
    createdAt: new Date().toISOString(),
    expiresAt
  };
  
  // Clean up expired sessions
  const now = new Date().toISOString();
  db.sessions = db.sessions.filter(s => s.expiresAt > now);
  db.sessions.push(session);
  writeDb(db);
  return session;
}

function isValidSession(token) {
  if (!token) return false;
  const db = readDb();
  if (!db.sessions || !Array.isArray(db.sessions)) return false;
  const now = new Date().toISOString();
  const session = db.sessions.find(s => s.token === token && s.expiresAt > now);
  return Boolean(session);
}

function destroySession(token) {
  if (!token) return;
  const db = readDb();
  if (db.sessions) {
    db.sessions = db.sessions.filter(s => s.token !== token);
    writeDb(db);
  }
}

module.exports = {
  getBuses,
  addBus,
  addBusesBulk,
  updateBus,
  deleteBus,
  getSchools,
  addSchool,
  updateSchool,
  deleteSchool,
  getStudents,
  getStudentById,
  getStudentByToken,
  addStudent,
  updateStudent,
  updateStudentFee,
  deleteStudent,
  clubStudents,
  unclubStudent,
  getSiblings,
  getSiblingsByToken,
  submitParentPayment,
  approveStudentPayment,
  rejectStudentPayment,
  updatePaymentStatus,
  markAllPaidTillAugust,
  recordCashPayment,
  getStudentDueDetails,
  markStudentLeft,
  reactivateStudent,
  FY_MONTHS,
  AVAILABLE_YEARS,
  generateAvailableYears,
  getMonthsForFinancialYear,
  confirmParentPayment,
  getSettings,
  updateSettings,
  getStats,
  getAdminCredentials,
  verifyAdminCredentials,
  updateAdminCredentials,
  createAdminSession,
  isValidSession,
  destroySession
};
