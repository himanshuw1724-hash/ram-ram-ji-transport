let currentBuses = [];
let currentSchools = [];
let selectedSchool = '';
let busStudents = [];
let activeToken = null;
let activeStudentData = null;
let isClubbedPayment = false;
let selectedPayingApp = 'Google Pay';

document.addEventListener('DOMContentLoaded', () => {
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.get('token')) {
    activeToken = urlParams.get('token');
  } else if (pathParts.length >= 2 && pathParts[0] === 'pay' && pathParts[1] !== 'pay.html') {
    activeToken = pathParts[1];
  } else if (pathParts.length === 1 && pathParts[0].startsWith('pay-')) {
    activeToken = pathParts[0];
  }

  if (activeToken) {
    loadDirectStudent(activeToken);
  } else {
    initBusPortal();
  }
});

// App Chip Selection
function selectPayingApp(appName) {
  selectedPayingApp = appName;
  const hiddenInput = document.getElementById('selectedPayingApp');
  if (hiddenInput) hiddenInput.value = appName;

  document.querySelectorAll('#appSelectorChips .app-chip').forEach(btn => {
    if (btn.getAttribute('data-app') === appName) {
      btn.classList.add('active-chip');
    } else {
      btn.classList.remove('active-chip');
    }
  });
}

function toggleOptionalUtr() {
  const container = document.getElementById('optionalUtrContainer');
  const icon = document.getElementById('utrToggleIcon');
  if (container.classList.contains('hidden')) {
    container.classList.remove('hidden');
    icon.textContent = '－';
    const input = document.getElementById('parentUtrInput');
    if (input) input.focus();
  } else {
    container.classList.add('hidden');
    icon.textContent = '＋';
  }
}

// Sibling Toggle
async function handleClubToggle(isChecked) {
  isClubbedPayment = Boolean(isChecked);
  if (!activeToken) return;
  await loadDirectStudent(activeToken, 2, isClubbedPayment);
}

// ==========================================
// BUS & SCHOOL SELECTION FLOW: STEP 1
// ==========================================

async function initBusPortal() {
  updateStepIndicator(1);
  showView('viewSelectChild');

  try {
    const [resBuses, resSchools] = await Promise.all([
      fetch('/api/public/buses'),
      fetch('/api/public/schools').catch(() => null)
    ]);
    const jsonBuses = await resBuses.json();
    if (jsonBuses.success) {
      currentBuses = jsonBuses.data || [];
      renderBusDropdown();
    }
    if (resSchools) {
      const jsonSchools = await resSchools.json();
      if (jsonSchools.success) {
        currentSchools = jsonSchools.data || [];
        renderSchoolDropdown();
      }
    }
    // Load initial student list
    fetchPortalStudents();
  } catch (err) {
    console.error('Error initializing portal data:', err);
  }
}

function renderSchoolDropdown() {
  const select = document.getElementById('selectSchoolDropdown');
  if (!select) return;
  select.innerHTML = '<option value="">-- Choose Your School First --</option>';
  currentSchools.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.name;
    opt.textContent = `🏫 ${s.name}${s.code ? ` (${s.code})` : ''}`;
    select.appendChild(opt);
  });
}

function handleSchoolSelect() {
  selectedSchool = document.getElementById('selectSchoolDropdown')?.value || '';

  const busSelect = document.getElementById('selectBusDropdown');
  if (busSelect) {
    busSelect.value = '';
  }

  renderBusDropdown();
  fetchPortalStudents();
}

function renderBusDropdown() {
  const select = document.getElementById('selectBusDropdown');
  if (!select) return;

  // If no school selected yet, lock the bus dropdown and prompt user
  if (!selectedSchool) {
    select.disabled = true;
    select.className = "w-full px-3.5 py-3 bg-slate-100 border-2 border-slate-300 rounded-2xl text-xs sm:text-sm font-semibold text-slate-400 cursor-not-allowed";
    select.innerHTML = '<option value="">👈 Step 1: Select School first to see buses</option>';
    return;
  }

  // School is selected! Enable the dropdown
  select.disabled = false;
  select.className = "w-full px-3.5 py-3 bg-amber-50/60 border-2 border-amber-400 rounded-2xl text-xs sm:text-sm font-extrabold text-slate-800 focus:outline-none focus:border-amber-500 focus:bg-white transition shadow-xs cursor-pointer";

  select.innerHTML = '';

  // Filter strictly for this school
  const schoolBuses = currentBuses.filter(b => 
    (b.schoolName || '').toLowerCase().trim() === selectedSchool.toLowerCase().trim()
  );

  const optPrompt = document.createElement('option');
  optPrompt.value = '';
  optPrompt.textContent = `-- Select Bus for ${selectedSchool} --`;
  select.appendChild(optPrompt);

  schoolBuses.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.busNumber;
    opt.textContent = `🚌 Bus ${b.busNumber} ${b.route ? `(${b.route})` : ''}`;
    select.appendChild(opt);
  });
}

async function handleBusSelect() {
  fetchPortalStudents();
}

async function fetchPortalStudents() {
  const busNumber = document.getElementById('selectBusDropdown')?.value || '';
  const searchInput = document.getElementById('childSearchInput');
  if (searchInput) searchInput.value = '';

  const container = document.getElementById('studentCardsList');

  // Do not show students before selecting school AND bus name
  if (!selectedSchool || !busNumber) {
    busStudents = [];
    if (container) {
      container.innerHTML = `
        <div class="col-span-full text-center py-12 px-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 shadow-2xs">
          <div class="text-4xl mb-2">🚌</div>
          <div class="font-extrabold text-slate-800 text-sm sm:text-base">
            ${!selectedSchool ? "Please select your child's School first" : "Please select your child's Bus Number"}
          </div>
          <p class="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            ${!selectedSchool 
              ? "Choose your school from Step 1 above to reveal assigned bus routes." 
              : `Choose the assigned bus for <strong>${escapeHtml(selectedSchool)}</strong> from Step 2 above to view student names and payment passes.`}
          </p>
        </div>
      `;
    }
    return;
  }

  const params = new URLSearchParams();
  params.append('busNumber', busNumber);
  params.append('school', selectedSchool);

  try {
    const res = await fetch(`/api/public/students?${params.toString()}`);
    const json = await res.json();
    if (json.success) {
      busStudents = json.data || [];
      renderStudentList(busStudents);
    }
  } catch (err) {
    console.error('Error fetching portal students:', err);
  }
}

function filterChildList() {
  const query = (document.getElementById('childSearchInput')?.value || '').toLowerCase().trim();
  if (!query) {
    renderStudentList(busStudents);
    return;
  }

  const filtered = busStudents.filter(s => 
    (s.name && s.name.toLowerCase().includes(query)) ||
    (s.schoolName && s.schoolName.toLowerCase().includes(query)) ||
    (s.classGrade && s.classGrade.toLowerCase().includes(query)) ||
    (s.routeStop && s.routeStop.toLowerCase().includes(query)) ||
    (s.maskedPhone && s.maskedPhone.includes(query))
  );

  renderStudentList(filtered);
}

function renderStudentList(students) {
  const container = document.getElementById('studentCardsList');

  if (students.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-8 text-slate-400 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
        <p class="text-xs font-semibold">No students found matching your search.</p>
        <p class="text-[11px] text-slate-400 mt-0.5">Please check spelling or choose another bus.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = students.map(st => {
    const isPaid = st.status === 'paid';
    const isSubmitted = st.status === 'submitted' || st.hasSubmittedPayment;
    const isLeft = st.serviceStatus === 'left';
    const hasPastDue = Boolean(st.hasPastDue);
    const dueMonth = st.dueMonth || st.billingPeriod || 'September 2026';

    return `
      <button onclick="selectStudent('${st.token}')" class="w-full text-left p-3.5 bg-slate-50 hover:bg-amber-50/70 border-2 border-slate-200 hover:border-amber-400 rounded-2xl transition flex items-center justify-between group shadow-xs cursor-pointer">
        <div class="space-y-1 min-w-0 pr-2">
          <div class="font-extrabold text-slate-900 group-hover:text-amber-950 text-sm flex items-center gap-1.5 flex-wrap">
            <span class="truncate">${escapeHtml(st.name)}</span>
            ${isLeft ? `<span class="text-[10px] font-black text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-300 shrink-0">🛑 Left (${escapeHtml(st.leftFromMonth || 'Stopped')})</span>` : ''}
            ${st.classGrade ? `<span class="text-[10px] font-semibold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200 shrink-0">${escapeHtml(st.classGrade)}</span>` : ''}
          </div>
          <div class="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap">
            <span class="font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded text-[10px] shrink-0">🚌 ${escapeHtml(st.busNumber)}</span>
            <span class="font-bold text-sky-800 bg-sky-100 px-1.5 py-0.5 rounded text-[10px] shrink-0">🏫 ${escapeHtml(st.schoolName || 'RAM RAM JI TRANSPORT')}</span>
            ${st.routeStop ? `<span class="truncate max-w-[130px] text-[11px]">📍 ${escapeHtml(st.routeStop)}</span>` : ''}
          </div>
        </div>

        <div class="text-right shrink-0">
          ${
            isLeft && !hasPastDue
              ? `<div class="space-y-1 text-right">
                   <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200 text-slate-700">
                     🛑 Discontinued
                   </span>
                   <div>
                     <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-xl bg-slate-100 text-slate-700 border border-slate-300">
                       <span>Receipts</span> <span>→</span>
                     </span>
                   </div>
                 </div>`
              : isSubmitted
              ? `<div class="space-y-1 text-right">
                   <span class="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-100 text-blue-900 border border-blue-300 animate-pulse">
                     <span>⏳</span> Verification Pending
                   </span>
                   <div>
                     <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-xl bg-blue-600 text-white shadow-xs">
                       <span>Check Status</span> <span>→</span>
                     </span>
                   </div>
                 </div>`
              : isPaid
              ? `<span class="inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <span>✓</span> <span>Paid</span>
                 </span>`
              : hasPastDue
              ? `<div class="space-y-1 text-right">
                   <span class="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 border border-rose-300">
                     ⚠️ Prior Due: ${escapeHtml(dueMonth)}
                   </span>
                   <div>
                     <span class="inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-xl bg-rose-600 text-white shadow-xs">
                       <span>Pay Due</span> <span>→</span>
                     </span>
                   </div>
                 </div>`
              : `<div class="space-y-1 text-right">
                   <span class="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-700">
                     Due: ${escapeHtml(dueMonth)}
                   </span>
                   <div>
                     <span class="inline-flex items-center gap-1 text-[11px] font-black px-3 py-1 rounded-xl bg-amber-200/90 text-amber-950 border border-amber-400 group-hover:bg-amber-500 group-hover:text-white transition shadow-xs">
                       <span>Select</span> <span>→</span>
                     </span>
                   </div>
                 </div>`
          }
        </div>
      </button>
    `;
  }).join('');
}

// ==========================================
// STEP 2: REVIEW CHILD & BUS DETAILS
// ==========================================

let verificationPollTimer = null;

function startVerificationPolling(targetMonth) {
  stopVerificationPolling();
  verificationPollTimer = setInterval(async () => {
    if (!activeToken) {
      stopVerificationPolling();
      return;
    }
    try {
      let url = `/api/pay/${activeToken}?clubSiblings=${isClubbedPayment ? 'true' : 'false'}`;
      if (targetMonth) url += `&month=${encodeURIComponent(targetMonth)}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success && json.data) {
        if (json.data.status === 'paid') {
          stopVerificationPolling();
          activeStudentData = json.data;
          try {
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          } catch(e) {}
          populatePaymentStep(json.data);
          updateStepIndicator(3);
          showView('viewPaymentStep');
        }
      }
    } catch (e) {
      // Ignore background poll errors
    }
  }, 3000);
}

function stopVerificationPolling() {
  if (verificationPollTimer) {
    clearInterval(verificationPollTimer);
    verificationPollTimer = null;
  }
}

let selectedParentBillingMonth = null;

async function selectStudent(token) {
  activeToken = token;
  isClubbedPayment = false;
  selectedParentBillingMonth = null;
  await loadDirectStudent(token, 2, false);
}

async function loadDirectStudent(token, targetStep = 2, clubSiblings = isClubbedPayment, specificMonth = null) {
  try {
    let url = `/api/pay/${token}?clubSiblings=${clubSiblings ? 'true' : 'false'}`;
    if (specificMonth) url += `&month=${encodeURIComponent(specificMonth)}`;
    const res = await fetch(url);
    const json = await res.json();

    if (!json.success) {
      alert(json.error || 'Student record could not be loaded.');
      initBusPortal();
      return;
    }

    activeStudentData = json.data;
    isClubbedPayment = Boolean(json.data.isClubbed);

    populateReviewCard(json.data, specificMonth);

    if (json.data.status === 'submitted') {
      const pendingMonth = specificMonth || json.data.billingPeriod || json.data.submittedMonth || json.data.dueDetails?.targetMonth;
      startVerificationPolling(pendingMonth);
    } else {
      stopVerificationPolling();
    }

    if (targetStep === 3) {
      populatePaymentStep(json.data);
      updateStepIndicator(3);
      showView('viewPaymentStep');
    } else {
      updateStepIndicator(2);
      showView('viewReviewDetails');
    }
  } catch (err) {
    console.error('Error loading student record:', err);
    alert('Network error while loading student details.');
  }
}

async function handleParentMonthSelect(newMonth) {
  if (!activeToken || !newMonth) return;
  selectedParentBillingMonth = newMonth;
  await loadDirectStudent(activeToken, 2, isClubbedPayment, newMonth);
}

function handleMainActionClick() {
  if (!activeStudentData) return;
  const targetMonth = selectedParentBillingMonth || document.getElementById('parentMonthSelect')?.value || activeStudentData.billingPeriod || 'September 2026';
  
  if (activeStudentData.status === 'paid') {
    downloadCurrentReceiptPdf(targetMonth);
    openReceiptModal(targetMonth);
  } else {
    goToPaymentStep();
  }
}

function downloadSelectedReceipt() {
  const select = document.getElementById('receiptQuickMonthSelect');
  const chosenMonth = select ? select.value : '';
  if (!chosenMonth) {
    alert('No cleared month receipt available to download yet.');
    return;
  }
  downloadCurrentReceiptPdf(chosenMonth);
  openReceiptModal(chosenMonth);
}

function populateReviewCard(data, chosenMonth = null) {
  const sym = data.settings?.currencySymbol || '₹';

  // Branding
  const bizTitle = document.getElementById('portalBusinessTitle');
  if (bizTitle) bizTitle.textContent = data.settings?.businessName || 'RAM RAM JI TRANSPORT';
  const propEl = document.getElementById('portalProprietor');
  if (propEl) propEl.textContent = data.settings?.proprietorName || 'LALIT KUMAR WALIA';
  const supPhone = document.getElementById('portalSupportPhone');
  if (supPhone) supPhone.textContent = `Support: ${data.settings?.ownerName || 'Himanshu Walia'} (${data.settings?.ownerPhone || '+91 98141 24392'})`;

  // Student details
  const schName = document.getElementById('cardSchoolName');
  if (schName) schName.textContent = data.schoolName || 'RAM RAM JI TRANSPORT';

  const isClubbed = data.isClubbed && data.studentsInPayment && data.studentsInPayment.length > 1;
  const displayNames = isClubbed 
    ? data.studentsInPayment.map(s => s.name).join(' & ') 
    : data.name;

  const stName = document.getElementById('cardStudentName');
  if (stName) stName.textContent = displayNames;

  const clsGrade = document.getElementById('cardClassGrade');
  if (clsGrade) {
    clsGrade.textContent = isClubbed
      ? `${data.studentsInPayment.length} Siblings • Combined Transport Pass`
      : `${data.classGrade || 'Class Not Set'}${data.rollNo ? ` • Roll No: #${data.rollNo}` : ''}`;
  }

  const busNo = document.getElementById('cardBusNumber');
  if (busNo) busNo.textContent = data.busNumber || 'S3';
  const rStop = document.getElementById('cardRouteStop');
  if (rStop) rStop.textContent = data.routeStop || 'Main Stop';

  const finalAmount = isClubbed ? data.totalAmount : data.amount;
  const cardAmt = document.getElementById('cardAmount');
  if (cardAmt) cardAmt.textContent = `${sym}${Number(finalAmount).toLocaleString()}`;

  const targetMonth = chosenMonth || selectedParentBillingMonth || (data.dueDetails && data.dueDetails.targetMonth) || data.billingPeriod || 'September 2026';
  selectedParentBillingMonth = targetMonth;

  const cardBillingPeriod = document.getElementById('cardBillingPeriod');
  if (cardBillingPeriod) cardBillingPeriod.textContent = targetMonth;

  // Prior Due Notice Card
  const pastDueCard = document.getElementById('pastDueAlertCard');
  const pastDueNoticeText = document.getElementById('pastDueNoticeText');
  const subtext = document.getElementById('cardDueStatusSubtext');
  const hasPastDue = Boolean(data.dueDetails && data.dueDetails.hasPastDue && data.status !== 'paid');

  if (hasPastDue && pastDueCard) {
    pastDueCard.classList.remove('hidden');
    if (pastDueNoticeText) {
      const dueAmt = data.dueDetails.targetAmount || data.amount;
      pastDueNoticeText.textContent = `Outstanding fee due for ${targetMonth} (${sym}${Number(dueAmt).toLocaleString()}) must be cleared first.`;
    }
    if (subtext) {
      subtext.textContent = `⚠️ Overdue Fee for ${targetMonth} (Must Clear First)`;
      subtext.className = 'text-[11px] text-rose-700 font-bold mt-0.5';
    }
  } else if (pastDueCard) {
    pastDueCard.classList.add('hidden');
    if (subtext) {
      if (data.status === 'paid') {
        subtext.textContent = `✓ Official stamped receipt ready to download in PDF format.`;
        subtext.className = 'text-[11px] text-emerald-800 font-medium mt-0.5';
      } else if (data.status === 'submitted') {
        subtext.textContent = `⏳ Payment submitted. Awaiting bank verification.`;
        subtext.className = 'text-[11px] text-blue-800 font-medium mt-0.5';
      } else {
        subtext.textContent = `Current Month Fee for ${targetMonth}`;
        subtext.className = 'text-[11px] text-slate-500 font-medium mt-0.5';
      }
    }
  }

  // Sibling Notice Banner
  const sibCard = document.getElementById('siblingNoticeCard');
  const sibCheck = document.getElementById('clubSiblingsCheckbox');
  if (data.siblings && data.siblings.length > 0) {
    if (sibCard) sibCard.classList.remove('hidden');
    const siblingNames = data.siblings.map(s => s.name).join(', ');
    const combinedTotal = (Number(data.amount) || 0) + data.siblings.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);

    const sText = document.getElementById('siblingNoticeText');
    if (sText) sText.textContent = `${siblingNames} (${data.busNumber}) is also registered in transport.`;
    const cLabel = document.getElementById('clubCheckboxLabel');
    if (cLabel) cLabel.textContent = `✓ Pay Together for ${data.name} & ${siblingNames}`;
    const cSumm = document.getElementById('clubbedTotalSummary');
    if (cSumm) cSumm.textContent = `Combined Fee: ${sym}${Number(combinedTotal).toLocaleString()} (${sym}${data.amount} + ${sym}${data.siblings.map(s => s.amount).join(' + ' + sym)})`;
    if (sibCheck) sibCheck.checked = isClubbed;
  } else if (sibCard) {
    sibCard.classList.add('hidden');
  }

  // Populate Month Selector Dropdown
  populateMonthSelectors(data, targetMonth);

  // Status pill & button
  const pill = document.getElementById('cardStatusPill');
  const monthStatusBadge = document.getElementById('selectedMonthStatusBadge');
  const btnPay = document.getElementById('btnProceedToPay');
  const paidNote = document.getElementById('alreadyPaidNote');
  const stoppedCard = document.getElementById('serviceStoppedCard');
  const stoppedDesc = document.getElementById('serviceStoppedDesc');

  const isLeft = data.serviceStatus === 'left';
  const isServiceStopped = Boolean(data.dueDetails && data.dueDetails.isServiceStopped);

  if (isServiceStopped) {
    if (pill) {
      pill.className = 'text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-800 border border-slate-300';
      pill.textContent = `🛑 SERVICE DISCONTINUED`;
    }
    if (monthStatusBadge) {
      monthStatusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-slate-200 text-slate-800 border border-slate-300 shadow-2xs';
      monthStatusBadge.innerHTML = `<span>🛑</span> <span>SERVICE DISCONTINUED</span>`;
    }
    if (btnPay) btnPay.classList.add('hidden');
    if (paidNote) paidNote.classList.add('hidden');
    if (stoppedCard) {
      stoppedCard.classList.remove('hidden');
      if (stoppedDesc) {
        stoppedDesc.textContent = `Student discontinued school bus transport starting from ${data.leftFromMonth || 'departure'}. All previous dues are cleared, and upcoming monthly fees are stopped.`;
      }
    }
  } else {
    if (stoppedCard) stoppedCard.classList.add('hidden');
    if (btnPay) btnPay.classList.remove('hidden');

    if (data.status === 'paid') {
      if (pill) {
        pill.className = 'text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300';
        pill.textContent = `✓ PAID FOR ${targetMonth.toUpperCase()}`;
      }
      if (monthStatusBadge) {
        monthStatusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-2xs';
        monthStatusBadge.innerHTML = `<span>✓</span> <span>PAID & VERIFIED (${escapeHtml(targetMonth)})</span>`;
      }
      if (btnPay) {
        btnPay.innerHTML = `<span>Download PDF Receipt (${escapeHtml(targetMonth)})</span> <svg class="w-5 h-5 text-emerald-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>`;
        btnPay.className = 'w-full py-4 bg-emerald-700 hover:bg-emerald-800 active:scale-[0.98] text-white font-black text-sm sm:text-base rounded-2xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer';
      }
      if (paidNote) {
        paidNote.classList.remove('hidden');
        paidNote.className = 'text-center text-xs font-bold text-emerald-700 bg-emerald-50 py-2.5 rounded-xl border border-emerald-200';
        paidNote.textContent = `✓ Fee for ${targetMonth} has been verified and cleared by the transport office.`;
      }
    } else if (data.status === 'submitted') {
      if (pill) {
        pill.className = 'text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-300';
        pill.textContent = `⏳ Awaiting Verification (${targetMonth})`;
      }
      if (monthStatusBadge) {
        monthStatusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-900 border border-blue-300 shadow-2xs animate-pulse';
        monthStatusBadge.innerHTML = `<span>⏳</span> <span>VERIFICATION PENDING (${escapeHtml(targetMonth)})</span>`;
      }
      if (btnPay) {
        btnPay.innerHTML = `<span>Check Verification Status (${escapeHtml(targetMonth)})</span> <span class="animate-pulse">⏳</span>`;
        btnPay.className = 'w-full py-4 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-black text-sm sm:text-base rounded-2xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer';
      }
      if (paidNote) {
        paidNote.classList.remove('hidden');
        paidNote.className = 'text-center text-xs font-bold text-blue-700 bg-blue-50 py-2.5 rounded-xl border border-blue-200';
        paidNote.textContent = `⏳ Payment for ${targetMonth} submitted. Awaiting bank check by Himanshu Walia.`;
      }
    } else {
      if (pill) {
        pill.className = hasPastDue
          ? 'text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300'
          : 'text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-300';
        pill.textContent = hasPastDue
          ? (isLeft ? `⚠️ PRIOR DUE BEFORE DEPARTURE (${targetMonth})` : `⚠️ PAST DUE (${targetMonth})`)
          : `⚠️ UNPAID (${targetMonth})`;
      }
      if (monthStatusBadge) {
        monthStatusBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-900 border border-rose-300 shadow-2xs';
        monthStatusBadge.innerHTML = `<span>⚠️</span> <span>${hasPastDue ? 'OVERDUE FEE' : 'PAYMENT DUE'} (${escapeHtml(targetMonth)})</span>`;
      }
      if (btnPay) {
        const payActionLabel = hasPastDue ? `Clear Prior Due for ${targetMonth}` : `Proceed to Pay for ${targetMonth}`;
        btnPay.innerHTML = `<span>${payActionLabel} (${sym}${finalAmount})</span> <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>`;
        btnPay.className = 'w-full py-4 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-black text-sm sm:text-base rounded-2xl shadow-lg shadow-emerald-600/20 transition flex items-center justify-center gap-2 cursor-pointer';
      }
      if (paidNote) paidNote.classList.add('hidden');
    }
  }

  // Populate Quick Receipt Download dropdown
  populateReceiptQuickSelect(data);
}

function populateMonthSelectors(data, currentSelectedMonth) {
  const select = document.getElementById('parentMonthSelect');
  if (!select) return;

  const sym = data.settings?.currencySymbol || '₹';
  const fyMonths = [
    "April 2026", "May 2026", "June 2026", "July 2026", "August 2026",
    "September 2026", "October 2026", "November 2026", "December 2026",
    "January 2027", "February 2027", "March 2027"
  ];
  const history = data.monthlyHistory || {};

  select.innerHTML = fyMonths.map(m => {
    const hist = history[m];
    const isPaid = (hist && hist.status === 'paid') || (data.paidTill && fyMonths.indexOf(data.paidTill) >= fyMonths.indexOf(m) && fyMonths.indexOf(m) <= 4);
    const isSubmitted = (data.hasSubmittedPayment && (data.submittedMonth === m || (data.status === 'submitted' && data.billingPeriod === m)));
    const isDue = (data.dueDetails && data.dueDetails.targetMonth === m && !isPaid);
    const amt = (hist && hist.amount) ? Number(hist.amount) : (Number(data.amount) || 2310);

    let statusText = `(${sym}${amt.toLocaleString()})`;
    if (isPaid) {
      statusText = `✓ Paid (${sym}${amt.toLocaleString()})`;
    } else if (isSubmitted) {
      statusText = `⏳ Pending Verification (${sym}${amt.toLocaleString()})`;
    } else if (isDue) {
      statusText = `⚠️ Current Due (${sym}${amt.toLocaleString()})`;
    } else {
      statusText = `📅 Upcoming (${sym}${amt.toLocaleString()})`;
    }

    const isSel = m === currentSelectedMonth;
    return `<option value="${escapeHtml(m)}"${isSel ? ' selected' : ''}>${escapeHtml(m)} — ${escapeHtml(statusText)}</option>`;
  }).join('');

  select.value = currentSelectedMonth;
}

function populateReceiptQuickSelect(data) {
  const select = document.getElementById('receiptQuickMonthSelect');
  const badge = document.getElementById('previousReceiptsCountBadge');
  if (!select) return;

  const sym = data.settings?.currencySymbol || '₹';
  const history = data.monthlyHistory || {};
  const fyMonths = [
    "April 2026", "May 2026", "June 2026", "July 2026", "August 2026",
    "September 2026", "October 2026", "November 2026", "December 2026",
    "January 2027", "February 2027", "March 2027"
  ];

  const paidMonths = [];
  fyMonths.forEach(m => {
    const h = history[m];
    const isPaid = (h && h.status === 'paid') || (data.paidTill && fyMonths.indexOf(data.paidTill) >= fyMonths.indexOf(m) && fyMonths.indexOf(m) <= 4);
    if (isPaid) {
      paidMonths.push({
        month: m,
        amount: Number(h?.amount) || Number(data.amount) || 2310,
        paidAt: h?.paidAt
      });
    }
  });

  // Reverse so latest cleared month (August) appears first
  paidMonths.reverse();

  if (badge) {
    badge.textContent = `${paidMonths.length} Cleared Month${paidMonths.length === 1 ? '' : 's'}`;
  }

  if (paidMonths.length === 0) {
    select.innerHTML = `<option value="">No cleared receipts on record yet</option>`;
    select.disabled = true;
  } else {
    select.disabled = false;
    select.innerHTML = paidMonths.map((pm, idx) => `
      <option value="${escapeHtml(pm.month)}"${idx === 0 ? ' selected' : ''}>
        ✓ ${escapeHtml(pm.month)} — Verified Stamped Receipt (${sym}${pm.amount.toLocaleString()})
      </option>
    `).join('');
  }
}

function renderPreviousReceipts(data) {
  populateReceiptQuickSelect(data);
}

function goToSelectChild() {
  stopVerificationPolling();
  updateStepIndicator(1);
  showView('viewSelectChild');
}

function goToPaymentStep() {
  if (!activeStudentData) return;
  populatePaymentStep(activeStudentData);
  updateStepIndicator(3);
  showView('viewPaymentStep');
}

// ==========================================
// STEP 3: USER'S EXACT SCANNER QR & UPI APPS
// ==========================================

function populatePaymentStep(data) {
  const sym = data.settings.currencySymbol || '₹';
  const isClubbed = data.isClubbed && data.studentsInPayment && data.studentsInPayment.length > 1;
  const currentTotal = isClubbed ? data.totalAmount : data.amount;
  const formattedAmount = `${sym}${Number(currentTotal).toLocaleString()}`;
  const displayNames = isClubbed 
    ? data.studentsInPayment.map(s => s.name).join(' & ') 
    : data.name;

  const unpaidSec = document.getElementById('unpaidPaymentSection');
  const submittedSec = document.getElementById('submittedPaymentSection');
  const confirmedSec = document.getElementById('confirmedPaymentSection');

  const targetMonth = (data.dueDetails && data.dueDetails.targetMonth) || data.billingPeriod || 'September 2026';
  const hasPastDue = Boolean(data.dueDetails && data.dueDetails.hasPastDue);

  if (data.status === 'paid') {
    unpaidSec.classList.add('hidden');
    submittedSec.classList.add('hidden');
    confirmedSec.classList.remove('hidden');

    document.getElementById('rcptStudentLabel').textContent = isClubbed ? 'Students Paid For:' : 'Student Name:';
    document.getElementById('rcptStudentName').textContent = displayNames;

    const breakdownBox = document.getElementById('rcptSiblingBreakdownContainer');
    if (isClubbed && breakdownBox) {
      breakdownBox.classList.remove('hidden');
      breakdownBox.innerHTML = `
        <div class="font-bold text-slate-700 pb-1 border-b border-slate-200">👨‍👩‍👧 Combined Family Payment Breakdown:</div>
        ${data.studentsInPayment.map(st => `
          <div class="flex justify-between text-slate-600">
            <span>• ${escapeHtml(st.name)} (Bus ${escapeHtml(st.busNumber)})</span>
            <span class="font-bold">${sym}${st.amount}</span>
          </div>
        `).join('')}
      `;
    } else if (breakdownBox) {
      breakdownBox.classList.add('hidden');
    }

    document.getElementById('rcptSchoolName').textContent = data.schoolName || 'RAM RAM JI TRANSPORT';
    document.getElementById('rcptBusNumber').textContent = data.busNumber || 'S3';
    
    // Explicit month name on receipt
    const rcptFeeMonthEl = document.getElementById('rcptFeeMonth');
    if (rcptFeeMonthEl) {
      rcptFeeMonthEl.textContent = data.paidMonth || data.billingPeriod || targetMonth;
    }

    document.getElementById('rcptAmount').textContent = formattedAmount;
    document.getElementById('rcptPayer').textContent = data.payerInfo 
      ? `${data.payerInfo} (${data.paymentApp || 'UPI'})` 
      : (data.paymentApp || 'Online UPI');
    document.getElementById('rcptRef').textContent = data.paymentRef || 'VERIFIED-BY-ADMIN';
    document.getElementById('rcptToken').textContent = data.token;
    const paidDate = data.paidAt ? new Date(data.paidAt).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }) : 'Recently';
    document.getElementById('verifiedDateText').textContent = `Verified by Transport Office on ${paidDate}`;

    const nextUnpaid = data.dueDetails?.unpaidMonths?.find(u => u.month !== (data.paidMonth || targetMonth));
    let nextDueBanner = document.getElementById('rcptNextDueBanner');
    if (!nextDueBanner) {
      nextDueBanner = document.createElement('div');
      nextDueBanner.id = 'rcptNextDueBanner';
      confirmedSec.appendChild(nextDueBanner);
    }
    if (nextUnpaid) {
      nextDueBanner.className = 'mt-4 p-3.5 bg-amber-50 border-2 border-amber-300 rounded-2xl text-center space-y-2 no-print';
      nextDueBanner.innerHTML = `
        <div class="text-xs font-bold text-amber-900">
          <span>📅</span> Next Month Due: <strong>${escapeHtml(nextUnpaid.month)}</strong> (${sym}${Number(nextUnpaid.amount).toLocaleString()})
        </div>
        <button onclick="loadDirectStudent('${data.token}', 2, false, '${escapeHtml(nextUnpaid.month)}')" class="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-black text-xs rounded-xl shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer">
          <span>Proceed to Pay for ${escapeHtml(nextUnpaid.month)}</span> <span>→</span>
        </button>
      `;
    } else {
      nextDueBanner.innerHTML = '';
      nextDueBanner.className = 'hidden';
    }
  } else if (data.status === 'submitted') {
    unpaidSec.classList.add('hidden');
    submittedSec.classList.remove('hidden');
    confirmedSec.classList.add('hidden');

    if (document.getElementById('submittedHeaderTitle')) {
      document.getElementById('submittedHeaderTitle').textContent = isClubbed
        ? `Payment Submitted for ${data.studentsInPayment.length} Children`
        : 'Payment Details Submitted';
    }
    const submittedMonthEl = document.getElementById('submittedMonthName');
    if (submittedMonthEl) {
      submittedMonthEl.textContent = data.billingPeriod || targetMonth;
    }
    if (document.getElementById('submittedPayerName')) {
      document.getElementById('submittedPayerName').textContent = data.payerInfo 
        ? `${data.payerInfo} (${data.paymentApp || 'UPI'})`
        : (data.paymentApp || 'UPI App');
    }
    document.getElementById('submittedUtrDisplay').textContent = data.paymentRef || 'Pending Bank Verification';
  } else {
    unpaidSec.classList.remove('hidden');
    submittedSec.classList.add('hidden');
    confirmedSec.classList.add('hidden');

    document.getElementById('payStepAmount').textContent = formattedAmount;
    
    // Month name display in Scan & Pay step
    const payStepMonthNameEl = document.getElementById('payStepMonthName');
    if (payStepMonthNameEl) {
      payStepMonthNameEl.textContent = targetMonth;
    }

    const dueBadge = document.getElementById('payStepDueBadge');
    if (dueBadge) {
      if (hasPastDue) {
        dueBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-900 border border-rose-300 text-xs font-black';
        dueBadge.innerHTML = `⚠️ Prior Due: ${escapeHtml(targetMonth)} (Clear First) • <span id="lockedAmountBadge">${formattedAmount}</span>`;
      } else {
        dueBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-xs font-black';
        dueBadge.innerHTML = `⚠️ Payment Due • <span id="lockedAmountBadge">${formattedAmount}</span>`;
      }
    } else if (document.getElementById('lockedAmountBadge')) {
      document.getElementById('lockedAmountBadge').textContent = formattedAmount;
    }

    document.getElementById('payStepChildName').textContent = displayNames;
    document.getElementById('payStepBusNumber').textContent = data.busNumber;

    if (document.getElementById('confirmBtnMonth')) {
      document.getElementById('confirmBtnMonth').textContent = targetMonth;
    }
    if (document.getElementById('confirmBtnAmount')) {
      document.getElementById('confirmBtnAmount').textContent = formattedAmount;
    }
    if (document.getElementById('btnCopyFeeAmount')) {
      document.getElementById('btnCopyFeeAmount').textContent = formattedAmount;
    }
    if (document.getElementById('fixedNoticeAmountDisplay')) {
      document.getElementById('fixedNoticeAmountDisplay').textContent = formattedAmount;
    }
    if (document.getElementById('formLockedAmountDisplay')) {
      document.getElementById('formLockedAmountDisplay').textContent = formattedAmount;
    }

    // Populate Official Bank Account Details
    const bName = data.settings?.bankName || 'YES Bank';
    const bHolder = data.settings?.bankAccountName || data.settings?.upiPayeeName || 'HIMANSHU WALIA';
    const bAcc = data.settings?.bankAccountNumber || '14610100012345';
    const bIfsc = data.settings?.bankIfsc || 'YESB0000146';
    const bType = data.settings?.bankAccountType || 'Current Account';
    const bBranch = data.settings?.bankBranch || 'Civil Lines / City Branch';

    if (document.getElementById('bankBeneficiaryDisplay')) document.getElementById('bankBeneficiaryDisplay').textContent = bHolder;
    if (document.getElementById('bankNameDisplay')) document.getElementById('bankNameDisplay').textContent = bName;
    if (document.getElementById('bankTypeDisplay')) document.getElementById('bankTypeDisplay').textContent = bType;
    if (document.getElementById('bankAccNoDisplay')) document.getElementById('bankAccNoDisplay').textContent = bAcc;
    if (document.getElementById('bankIfscDisplay')) document.getElementById('bankIfscDisplay').textContent = bIfsc;
    if (document.getElementById('bankTransferAmountDisplay')) document.getElementById('bankTransferAmountDisplay').textContent = formattedAmount;
    if (document.getElementById('bankBranchDisplay')) document.getElementById('bankBranchDisplay').textContent = `Branch: ${bBranch}`;

    // Default to clean zero-risk official bank scanner & UPI mode
    switchPaymentMode('upi');
    switchQrMode('clean');
  }
}

let currentPaymentMode = 'upi';

function switchPaymentMode(mode) {
  currentPaymentMode = mode;
  const upiBox = document.getElementById('paymentModeUpiContainer');
  const bankBox = document.getElementById('paymentModeBankContainer');
  const tabUpi = document.getElementById('tabModeUpi');
  const tabBank = document.getElementById('tabModeBank');

  if (mode === 'bank') {
    if (upiBox) upiBox.classList.add('hidden');
    if (bankBox) bankBox.classList.remove('hidden');
    if (tabBank) tabBank.className = 'flex-1 py-2 px-2.5 rounded-xl bg-white text-indigo-950 font-black shadow-xs border border-indigo-300 transition flex items-center justify-center gap-1.5 cursor-pointer';
    if (tabUpi) tabUpi.className = 'flex-1 py-2 px-2.5 rounded-xl text-slate-600 hover:text-slate-900 font-bold transition flex items-center justify-center gap-1.5 cursor-pointer';
    selectPayingApp('Bank Transfer / NEFT');
  } else {
    if (bankBox) bankBox.classList.add('hidden');
    if (upiBox) upiBox.classList.remove('hidden');
    if (tabUpi) tabUpi.className = 'flex-1 py-2 px-2.5 rounded-xl bg-white text-emerald-950 font-black shadow-xs border border-emerald-300 transition flex items-center justify-center gap-1.5 cursor-pointer';
    if (tabBank) tabBank.className = 'flex-1 py-2 px-2.5 rounded-xl text-slate-600 hover:text-slate-900 font-bold transition flex items-center justify-center gap-1.5 cursor-pointer';
  }
}

function copyText(text, successMsg = 'Copied to clipboard!') {
  if (!text) return;
  const clean = String(text).trim();
  navigator.clipboard.writeText(clean).then(() => {
    alert(successMsg);
  }).catch(() => {
    prompt('Copy:', clean);
  });
}

function copyMobileNumber() {
  const phone = '9814124392';
  navigator.clipboard.writeText(phone).then(() => {
    const btn = document.getElementById('btnCopyMobile');
    if (btn) {
      btn.innerHTML = `<span>✓ Copied!</span>`;
      btn.classList.add('bg-emerald-600');
      setTimeout(() => {
        btn.innerHTML = `<span>📋 Copy Mobile</span>`;
        btn.classList.remove('bg-emerald-600');
      }, 2500);
    }
  }).catch(() => {
    prompt('Copy Mobile Number:', phone);
  });
}

let currentQrMode = 'clean';

function switchQrMode(mode = 'clean') {
  currentQrMode = mode;
  const qrImg = document.getElementById('qrImageElement');
  const qrHint = document.getElementById('qrAmountHint');

  if (!activeStudentData || !activeStudentData.payment) return;

  const payment = activeStudentData.payment;
  const settings = activeStudentData.settings || {};
  const customScanner = settings.scannerImage || payment.scannerImage;
  const hasCustomScanner = payment.useCustomQr || (customScanner && customScanner !== '/scanner.png');

  if (qrImg) {
    if (hasCustomScanner && customScanner) {
      qrImg.src = customScanner;
    } else {
      qrImg.src = payment.cleanQrDataUrl || customScanner || '/scanner.png';
    }
  }
  if (qrHint) {
    qrHint.textContent = hasCustomScanner
      ? '✓ Official Payment Scanner. Scan with Google Pay, PhonePe, Paytm, or BHIM.'
      : '✓ Official Bank Scanner. Zero risk flags in Paytm / PhonePe / GPay.';
  }
  updateMobileAppLinks();
}

function updateMobileAppLinks() {
  if (!activeStudentData || !activeStudentData.payment) return;
  const upiId = activeStudentData.payment.upiId || 'himanshu1461@ptyes';
  const payee = activeStudentData.payment.payeeName || 'HIMANSHU  WALIA';

  // Always pass clean verified VPA and Payee Name without external amount query string,
  // preventing Paytm Protect from triggering "UPI Risk Policy" alert.
  const uri = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payee)}`;

  const linkPhonePe = document.getElementById('linkPhonePe');
  const linkGPay = document.getElementById('linkGPay');
  const linkPaytm = document.getElementById('linkPaytm');
  const linkGeneric = document.getElementById('mobileUpiLink');

  if (linkGeneric) linkGeneric.href = uri;
  if (linkPhonePe) linkPhonePe.href = uri.replace('upi://pay', 'phonepe://pay');
  if (linkGPay) linkGPay.href = uri.replace('upi://pay', 'gpay://upi/pay');
  if (linkPaytm) linkPaytm.href = uri.replace('upi://pay', 'paytmmp://pay');
}

function copyAmount() {
  if (!activeStudentData) return;
  const isClubbed = activeStudentData.isClubbed && activeStudentData.studentsInPayment && activeStudentData.studentsInPayment.length > 1;
  const amt = isClubbed ? activeStudentData.totalAmount : activeStudentData.amount;
  navigator.clipboard.writeText(String(amt)).then(() => {
    const btn = document.getElementById('btnCopyAmount');
    if (btn) {
      btn.innerHTML = `<span>✓ Copied ₹${amt}!</span>`;
      btn.classList.add('bg-emerald-200');
      setTimeout(() => {
        btn.innerHTML = `<span>📋 Copy Fee (<span id="btnCopyFeeAmount">₹${amt}</span>)</span>`;
        btn.classList.remove('bg-emerald-200');
      }, 2500);
    }
  }).catch(() => {
    prompt('Copy Fee Amount:', amt);
  });
}

function copyUpiVpa() {
  const upiId = (activeStudentData && activeStudentData.payment && activeStudentData.payment.upiId) 
    || (activeStudentData && activeStudentData.settings && activeStudentData.settings.upiId) 
    || 'himanshu1461@ptyes';
  navigator.clipboard.writeText(upiId).then(() => {
    const btn = document.getElementById('btnCopyUpi');
    if (btn) {
      btn.innerHTML = `<span>✓ Copied UPI ID!</span>`;
      btn.classList.add('bg-slate-200');
      setTimeout(() => {
        btn.innerHTML = `<span>📋 Copy UPI</span>`;
        btn.classList.remove('bg-slate-200');
      }, 2500);
    }
  }).catch(() => {
    prompt('Copy UPI ID:', upiId);
  });
}

function goToReviewDetails() {
  updateStepIndicator(2);
  showView('viewReviewDetails');
}

// Parent-Friendly Confirmation Handler
async function handleParentConfirm(e) {
  e.preventDefault();
  const payerInfo = document.getElementById('parentPayerInfoInput').value.trim();
  const utr = document.getElementById('parentUtrInput').value.trim();
  const btn = document.getElementById('btnParentConfirm');

  if (!payerInfo) {
    alert('Please enter your mobile number or name so we can match your payment.');
    document.getElementById('parentPayerInfoInput').focus();
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Submitting...';

  try {
    const res = await fetch(`/api/pay/${activeToken}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appName: selectedPayingApp,
        payerInfo,
        reference: utr || undefined,
        isClubbed: isClubbedPayment,
        targetMonth: activeStudentData?.dueDetails?.targetMonth || activeStudentData?.billingPeriod
      })
    });
    const json = await res.json();

    if (json.success) {
      alert('Thank you! Your payment details have been submitted to Himanshu Walia for verification.');
      const pendingMonth = activeStudentData?.dueDetails?.targetMonth || activeStudentData?.billingPeriod;
      await loadDirectStudent(activeToken, 3, isClubbedPayment, pendingMonth);
    } else {
      alert(json.error || 'Could not record payment. Please try again.');
      btn.disabled = false;
      btn.textContent = '✓ I Have Completed Payment';
    }
  } catch (err) {
    alert('Network error. Please check connection and try again.');
    btn.disabled = false;
    btn.textContent = '✓ I Have Completed Payment';
  }
}

async function refreshPaymentStatus() {
  if (!activeToken) return;
  const btn = document.getElementById('btnRefreshStatus');
  if (btn) btn.textContent = 'Checking...';
  const pendingMonth = activeStudentData?.dueDetails?.targetMonth || activeStudentData?.billingPeriod;
  await loadDirectStudent(activeToken, 3, isClubbedPayment, pendingMonth);
  if (btn) btn.textContent = '🔄 Refresh Status';
}

// ==========================================
// UI HELPERS
// ==========================================

function showView(viewId) {
  ['viewSelectChild', 'viewReviewDetails', 'viewPaymentStep'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === viewId) el.classList.remove('hidden');
      else el.classList.add('hidden');
    }
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateStepIndicator(stepNumber) {
  const tabs = [
    { el: document.getElementById('stepTab1'), step: 1 },
    { el: document.getElementById('stepTab2'), step: 2 },
    { el: document.getElementById('stepTab3'), step: 3 }
  ];

  tabs.forEach(t => {
    if (!t.el) return;
    const badge = t.el.querySelector('span:first-child');
    if (t.step === stepNumber) {
      t.el.className = 'flex items-center gap-1.5 text-amber-700 font-extrabold';
      if (badge) badge.className = 'w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center text-[10px] shadow-sm';
    } else if (t.step < stepNumber) {
      t.el.className = 'flex items-center gap-1.5 text-emerald-700 font-bold';
      if (badge) badge.className = 'w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px]';
    } else {
      t.el.className = 'flex items-center gap-1.5 text-slate-400 font-medium';
      if (badge) badge.className = 'w-5 h-5 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-[10px]';
    }
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Automatically check if running on HTTP and show 1-tap switch to secure HTTPS
if (window.location.protocol === 'http:') {
  fetch('/api/network-info')
    .then(r => r.json())
    .then(data => {
      if (data && data.isHttpsAvailable && data.httpsUrl) {
        const banner = document.getElementById('httpSecurityNotice');
        const btn = document.getElementById('httpSwitchBtn');
        if (banner && btn) {
          const targetHttps = data.httpsUrl + window.location.pathname + window.location.search;
          btn.href = targetHttps;
          banner.classList.remove('hidden');
        }
      }
    })
    .catch(() => {});
}

// ====================================================================
// PREVIOUS MONTH RECEIPTS LOGIC & MODAL VIEWER
// ====================================================================

function openReceiptModal(targetMonth) {
  if (!activeStudentData) return;

  const data = activeStudentData;
  const sym = data.settings?.currencySymbol || '₹';
  const history = data.monthlyHistory || {};
  const hist = history[targetMonth] || {};

  const paidAmount = Number(hist.amount) || Number(data.amount) || 2310;
  const voucherNo = hist.voucher || hist.ref || `CLEARED-${targetMonth.replace(/\s+/g, '-').toUpperCase()}`;
  const method = hist.method || 'Pre-cleared Transport Ledger';
  const payer = hist.payerInfo || data.parentName || 'Parent';
  const paidDate = hist.paidAt ? new Date(hist.paidAt).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }) : '31 Aug 2026';

  const mBiz = document.getElementById('mRcptBusinessName');
  if (mBiz) mBiz.textContent = data.settings?.businessName || 'RAM RAM JI TRANSPORT';
  const mProp = document.getElementById('mRcptProprietor');
  if (mProp) mProp.textContent = `Proprietor: ${data.settings?.proprietorName || 'LALIT KUMAR WALIA'}`;
  const mSup = document.getElementById('mRcptContactPhone');
  if (mSup) mSup.textContent = `Support: ${data.settings?.ownerName || 'Himanshu Walia'} (${data.settings?.ownerPhone || '+91 98141 24392'})`;
  const mStampBiz = document.getElementById('mRcptStampBiz');
  if (mStampBiz) mStampBiz.textContent = data.settings?.businessName || 'RAM RAM JI TRANSPORT';
  const mStampProp = document.getElementById('mRcptStampProp');
  if (mStampProp) mStampProp.textContent = `Prop. ${data.settings?.proprietorName || 'LALIT KUMAR WALIA'}`;
  const mSignProp = document.getElementById('mRcptSignProp');
  if (mSignProp) mSignProp.textContent = data.settings?.proprietorName || 'LALIT KUMAR WALIA';
  const mSignOwner = document.getElementById('mRcptSignOwner');
  if (mSignOwner) mSignOwner.textContent = data.settings?.ownerName || 'Himanshu Walia';
  const mVouch = document.getElementById('mRcptVoucherNo');
  if (mVouch) mVouch.textContent = voucherNo;
  const mDt = document.getElementById('mRcptDate');
  if (mDt) mDt.textContent = `Date: ${paidDate}`;
  const mSt = document.getElementById('mRcptStudentName');
  if (mSt) mSt.textContent = data.name || '-';
  const mSch = document.getElementById('mRcptSchoolName');
  if (mSch) mSch.textContent = data.schoolName || 'Police DAV Public School';
  const mBus = document.getElementById('mRcptBusNumber');
  if (mBus) mBus.textContent = `Bus ${data.busNumber || 'S3'}`;
  const mStp = document.getElementById('mRcptRouteStop');
  if (mStp) mStp.textContent = data.routeStop || 'Designated Route';
  const mCls = document.getElementById('mRcptClassRoll');
  if (mCls) mCls.textContent = `${data.classGrade || 'Class -'}${data.rollNo ? ` • Roll No: #${data.rollNo}` : ''}`;
  const mMth = document.getElementById('mRcptMonth');
  if (mMth) mMth.innerHTML = `<span>📅</span> <span>${escapeHtml(targetMonth)}</span>`;
  const mAmt = document.getElementById('mRcptAmount');
  if (mAmt) mAmt.textContent = `${sym}${paidAmount.toLocaleString()}`;
  const mWrds = document.getElementById('mRcptAmountWords');
  if (mWrds) mWrds.textContent = `Amount in words: ${numberToWordsINR(paidAmount)} Only`;
  const mMthd = document.getElementById('mRcptMethod');
  if (mMthd) mMthd.textContent = method;
  const mRef = document.getElementById('mRcptRef');
  if (mRef) mRef.textContent = voucherNo;
  const mPyr = document.getElementById('mRcptPayerInfo');
  if (mPyr) mPyr.textContent = payer;

  // Direct standalone link
  const directLink = document.getElementById('mRcptDirectLink');
  if (directLink && data.token) {
    directLink.href = `/receipt/${encodeURIComponent(data.token)}/${encodeURIComponent(targetMonth)}`;
  }

  const modal = document.getElementById('receiptViewModal');
  if (modal) modal.classList.remove('hidden');
}

function closeReceiptModal() {
  const modal = document.getElementById('receiptViewModal');
  if (modal) modal.classList.add('hidden');
}

function downloadCurrentReceiptPdf(specificMonth = null) {
  if (!activeStudentData) return;
  const month = specificMonth || selectedParentBillingMonth || activeStudentData.billingPeriod || 'September 2026';
  const downloadUrl = `/api/receipt/${encodeURIComponent(activeStudentData.token)}/${encodeURIComponent(month)}/pdf`;
  
  // Direct browser download of official PDF receipt
  const a = document.createElement('a');
  a.href = downloadUrl;
  const safeName = (activeStudentData.name || 'Student').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeMonth = month.replace(/[^a-zA-Z0-9_-]/g, '_');
  a.download = `Receipt_${safeName}_${safeMonth}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Helper: Indian Rupee Number to Words Converter
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
