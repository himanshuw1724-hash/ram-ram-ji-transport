// Auto-attach admin authorization token & gracefully handle auth expiration
const _originalFetch = window.fetch;
window.fetch = async function (resource, init = {}) {
  const token = localStorage.getItem('admin_token');
  if (token && typeof resource === 'string' && resource.startsWith('/api/')) {
    init = init || {};
    init.headers = init.headers || {};
    if (init.headers instanceof Headers) {
      if (!init.headers.has('Authorization')) {
        init.headers.set('Authorization', `Bearer ${token}`);
      }
    } else if (Array.isArray(init.headers)) {
      init.headers.push(['Authorization', `Bearer ${token}`]);
    } else {
      if (!init.headers['Authorization']) {
        init.headers['Authorization'] = `Bearer ${token}`;
      }
    }
  }
  const response = await _originalFetch(resource, init);
  if (response.status === 401 && typeof resource === 'string' && resource.startsWith('/api/') && !resource.includes('/api/auth/check')) {
    console.warn('Session expired or unauthorized. Redirecting to login...');
    window.location.href = '/login';
  }
  return response;
};

let currentStudents = [];
let currentBuses = [];
let currentSchools = [];
let selectedSchool = '';
let currentSettings = {};
let currentStats = {};
let selectedActiveMonth = "September 2026";
let studentRowSelectedMonth = {};
let previousSubmittedCount = null;
let backgroundPoller = null;
let currentRosterView = (typeof window !== 'undefined' && window.innerWidth < 768) ? 'cards' : 'table';

function updateRosterViewUI() {
  const cardsContainer = document.getElementById('studentCardsContainer');
  const tableContainer = document.getElementById('studentTableContainer');
  const btnCards = document.getElementById('btnViewCards');
  const btnTable = document.getElementById('btnViewTable');

  if (currentRosterView === 'cards') {
    if (cardsContainer) cardsContainer.style.display = 'block';
    if (tableContainer) tableContainer.style.display = 'none';
    if (btnCards) {
      btnCards.className = 'px-2.5 py-1 rounded-md transition flex items-center gap-1 cursor-pointer bg-white text-indigo-900 shadow-xs font-black';
    }
    if (btnTable) {
      btnTable.className = 'px-2.5 py-1 rounded-md transition flex items-center gap-1 cursor-pointer text-slate-500 hover:text-slate-900 font-bold';
    }
  } else {
    if (cardsContainer) cardsContainer.style.display = 'none';
    if (tableContainer) tableContainer.style.display = 'block';
    if (btnCards) {
      btnCards.className = 'px-2.5 py-1 rounded-md transition flex items-center gap-1 cursor-pointer text-slate-500 hover:text-slate-900 font-bold';
    }
    if (btnTable) {
      btnTable.className = 'px-2.5 py-1 rounded-md transition flex items-center gap-1 cursor-pointer bg-white text-indigo-900 shadow-xs font-black';
    }
  }
}

function switchRosterView(view) {
  currentRosterView = view;
  updateRosterViewUI();
}

function toggleHeaderMenu(event) {
  if (event) {
    event.stopPropagation();
  }
  const dropdown = document.getElementById('headerMenuDropdown');
  const chevron = document.getElementById('headerMenuChevron');
  const btn = document.getElementById('headerMenuBtn');
  if (!dropdown) return;

  const isHidden = dropdown.classList.contains('hidden');
  if (isHidden) {
    dropdown.classList.remove('hidden');
    if (chevron) chevron.classList.add('rotate-180');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  } else {
    dropdown.classList.add('hidden');
    if (chevron) chevron.classList.remove('rotate-180');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
}

function closeHeaderMenu() {
  const dropdown = document.getElementById('headerMenuDropdown');
  const chevron = document.getElementById('headerMenuChevron');
  const btn = document.getElementById('headerMenuBtn');
  if (dropdown && !dropdown.classList.contains('hidden')) {
    dropdown.classList.add('hidden');
    if (chevron) chevron.classList.remove('rotate-180');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
}

// Global click-outside listener to close menu
document.addEventListener('click', (event) => {
  const dropdown = document.getElementById('headerMenuDropdown');
  const btn = document.getElementById('headerMenuBtn');
  if (dropdown && !dropdown.classList.contains('hidden')) {
    if (!dropdown.contains(event.target) && !btn?.contains(event.target)) {
      closeHeaderMenu();
    }
  }
});

// Also close menu on Escape key
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeHeaderMenu();
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  // Check admin session authentication
  try {
    const checkRes = await fetch('/api/auth/check');
    const checkJson = await checkRes.json();
    if (!checkJson.authenticated) {
      window.location.href = '/login';
      return;
    }
  } catch (e) {
    window.location.href = '/login';
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const m = urlParams.get('month');
  if (m) {
    selectedActiveMonth = m;
  }
  loadAllData();
  setupFilterListeners();
  startBackgroundPoller();
});

function startBackgroundPoller() {
  if (backgroundPoller) clearInterval(backgroundPoller);
  // Check every 5 seconds for new parent payments
  backgroundPoller = setInterval(async () => {
    try {
      await fetchStats(true);
    } catch (e) {}
  }, 5000);
}

async function loadAllData() {
  await fetchSettings();
  await Promise.all([
    fetchSchools(),
    fetchBuses(),
    fetchStats(),
    fetchStudents()
  ]);
}

let activeSecureParentUrl = null;

async function fetchSettings() {
  try {
    const [resSettings, resNet] = await Promise.all([
      fetch('/api/settings'),
      fetch('/api/network-info').catch(() => null)
    ]);
    const json = await resSettings.json();
    let netJson = null;
    if (resNet) {
      try { netJson = await resNet.json(); } catch(e){}
    }

    if (json.success) {
      currentSettings = json.data;
      const urlParams = new URLSearchParams(window.location.search);
      if (!urlParams.get('month') && currentSettings.activeMonth) {
        selectedActiveMonth = currentSettings.activeMonth;
      }
      if (document.getElementById('brandTitle')) {
        document.getElementById('brandTitle').textContent = currentSettings.businessName || 'School Bus Transport Portal';
      }

      // Universal Link: Use Secure HTTPS if available, otherwise local origin
      if (netJson && netJson.success && netJson.secureParentUrl) {
        activeSecureParentUrl = netJson.secureParentUrl;
      } else {
        activeSecureParentUrl = `${window.location.origin}/pay`;
      }

      if (document.getElementById('universalLinkDisplay')) {
        document.getElementById('universalLinkDisplay').textContent = activeSecureParentUrl;
      }
      if (netJson && netJson.isHttpsAvailable && document.getElementById('secureHttpsBadge')) {
        document.getElementById('secureHttpsBadge').classList.remove('hidden');
      }

      if (document.getElementById('settingsPayeeDisplay')) {
        document.getElementById('settingsPayeeDisplay').textContent = currentSettings.upiPayeeName || 'HIMANSHU WALIA';
      }
      if (document.getElementById('settingsUpiDisplay')) {
        document.getElementById('settingsUpiDisplay').textContent = currentSettings.upiId || 'himanshu1461@ptyes';
      }
      if (document.getElementById('settingsBankSummary')) {
        const bName = currentSettings.bankName || 'YES Bank';
        const bAcc = currentSettings.bankAccountNumber || '14610100012345';
        const bHolder = currentSettings.bankAccountName || 'HIMANSHU WALIA';
        document.getElementById('settingsBankSummary').textContent = `${bName} • ${bAcc} (${bHolder})`;
      }
      renderFinancialYearMonthSelector();
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

async function fetchSchools() {
  try {
    const res = await fetch('/api/schools');
    const json = await res.json();
    if (json.success) {
      currentSchools = json.data || [];
      renderSchoolDropdowns();
      renderSchoolsList();
    }
  } catch (err) {
    console.error('Failed to load schools:', err);
  }
}

function handleSchoolFilterChange(val) {
  selectedSchool = val || '';
  const busFilter = document.getElementById('busFilter');
  if (busFilter) busFilter.value = '';
  renderBusDropdowns();
  fetchStats();
  fetchStudents();
}

async function fetchBuses() {
  try {
    const res = await fetch('/api/buses');
    const json = await res.json();
    if (json.success) {
      currentBuses = json.data;
      renderBusDropdowns();
      renderBusesList();
    }
  } catch (err) {
    console.error('Failed to load buses:', err);
  }
}

async function fetchStats(isBackground = false) {
  try {
    const schoolParam = selectedSchool ? `&school=${encodeURIComponent(selectedSchool)}` : '';
    const res = await fetch(`/api/stats?month=${encodeURIComponent(selectedActiveMonth)}${schoolParam}`);
    const json = await res.json();
    if (json.success) {
      const stats = json.data;
      const newSubmittedCount = stats.submittedCount || 0;

      // Real-time alert if new payments arrived while admin is viewing
      if (isBackground && previousSubmittedCount !== null && newSubmittedCount > previousSubmittedCount) {
        const diff = newSubmittedCount - previousSubmittedCount;
        playNotificationChime();
        showToast(`🔔 ${diff} new payment${diff > 1 ? 's' : ''} submitted by parents awaiting your verification!`, 'warning');
        fetchStudents(); // Refresh table automatically
      }

      previousSubmittedCount = newSubmittedCount;
      currentStats = stats;
      renderStats(stats);
    }
  } catch (err) {
    if (!isBackground) console.error('Failed to load stats:', err);
  }
}

async function fetchStudents() {
  try {
    const busNumber = document.getElementById('busFilter').value;
    const status = document.getElementById('statusFilter').value;
    const search = document.getElementById('searchInput').value;

    const params = new URLSearchParams();
    if (busNumber) params.append('busNumber', busNumber);
    if (status) params.append('status', status);
    if (search) params.append('search', search);
    if (selectedSchool) params.append('school', selectedSchool);
    params.append('month', selectedActiveMonth);

    const res = await fetch(`/api/students?${params.toString()}`);
    const json = await res.json();
    if (json.success) {
      currentStudents = json.data || [];
      renderStudentsTable(currentStudents);
    }
  } catch (err) {
    console.error('Failed to load students:', err);
    showToast('Failed to load student data', 'error');
  }
}

function renderStats(stats) {
  const sym = currentSettings.currencySymbol || '₹';
  document.getElementById('statActiveBuses').textContent = stats.activeBusesCount;
  document.getElementById('statTotalStudents').textContent = stats.totalStudents;
  document.getElementById('statTotalRevenue').textContent = `${sym}${stats.totalRevenue.toLocaleString()}`;
  document.getElementById('statCollectedRevenue').textContent = `${sym}${stats.collectedRevenue.toLocaleString()}`;
  
  if (stats.isPastCleared || stats.pendingCount === 0) {
    document.getElementById('statPaidCount').textContent = `${stats.paidCount} verified (100% Cleared)`;
    document.getElementById('statPendingCount').textContent = `0 unpaid (All Cleared)`;
  } else {
    document.getElementById('statPaidCount').textContent = `${stats.paidCount} verified`;
    document.getElementById('statPendingCount').textContent = `${stats.pendingCount} unpaid`;
  }

  const submittedCount = stats.submittedCount || 0;
  if (document.getElementById('statSubmittedCount')) {
    document.getElementById('statSubmittedCount').textContent = submittedCount;
  }
  if (document.getElementById('statSubmittedRevenue')) {
    document.getElementById('statSubmittedRevenue').textContent = `${sym}${(stats.submittedRevenue || 0).toLocaleString()} to verify`;
  }
  document.getElementById('statPendingRevenue').textContent = `${sym}${stats.pendingRevenue.toLocaleString()}`;

  const leftCount = stats.leftStudentsCount || 0;
  if (document.getElementById('statLeftStudentsCount')) {
    document.getElementById('statLeftStudentsCount').textContent = leftCount;
  }
  if (document.getElementById('quickCountActive')) {
    document.getElementById('quickCountActive').textContent = stats.activeStudentsCount || (stats.totalStudents - leftCount);
  }
  if (document.getElementById('quickCountLeft')) {
    document.getElementById('quickCountLeft').textContent = leftCount;
  }
  if (document.getElementById('quickCountSubmitted')) {
    document.getElementById('quickCountSubmitted').textContent = submittedCount;
  }
  if (document.getElementById('stopModalLeftBadge')) {
    document.getElementById('stopModalLeftBadge').textContent = leftCount;
  }

  const expectedLabel = document.getElementById('expectedFeeMonthLabel');
  if (expectedLabel) {
    expectedLabel.textContent = `Fee for ${selectedActiveMonth}`;
  }

  // Visual Alert Banner & Pulse Badge when payments are waiting for verification
  const alertBanner = document.getElementById('awaitingAlertBanner');
  const alertPulse = document.getElementById('awaitingCheckPulse');
  const cardAwaiting = document.getElementById('cardAwaitingCheck');

  if (submittedCount > 0) {
    if (alertBanner) {
      alertBanner.classList.remove('hidden');
      const titleEl = document.getElementById('awaitingAlertTitle');
      if (titleEl) {
        titleEl.textContent = `${submittedCount} Payment${submittedCount > 1 ? 's' : ''} Awaiting Your Verification! (${sym}${(stats.submittedRevenue || 0).toLocaleString()})`;
      }
    }
    if (alertPulse) alertPulse.classList.remove('hidden');
    if (cardAwaiting) {
      cardAwaiting.classList.add('ring-2', 'ring-blue-500', 'bg-blue-100/70');
      cardAwaiting.classList.remove('bg-blue-50/40');
    }
  } else {
    if (alertBanner) alertBanner.classList.add('hidden');
    if (alertPulse) alertPulse.classList.add('hidden');
    if (cardAwaiting) {
      cardAwaiting.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-100/70');
      cardAwaiting.classList.add('bg-blue-50/40');
    }
  }
}

// 1-Click filter to instantly view awaiting payments
function filterAwaitingPayments() {
  setStatusFilterValue('submitted');
  const rosterHeading = document.getElementById('rosterMonthHeading');
  if (rosterHeading) {
    rosterHeading.scrollIntoView({ behavior: 'smooth' });
  }
  showToast('Filtered: Showing payments awaiting verification', 'info');
}

// 1-Click filter to instantly view students who left
function filterLeftStudents() {
  setStatusFilterValue('left');
  const rosterHeading = document.getElementById('rosterMonthHeading');
  if (rosterHeading) {
    rosterHeading.scrollIntoView({ behavior: 'smooth' });
  }
  showToast('Filtered: Showing students who left / discontinued transport', 'info');
}

// Quick filter pill switcher
function setStatusFilterValue(val) {
  const select = document.getElementById('statusFilter');
  if (select) {
    select.value = val;
    fetchStudents();
  }
  updateQuickFilterButtons(val);
}

function updateQuickFilterButtons(activeVal) {
  const map = {
    '': 'quickFilterAll',
    'active': 'quickFilterActive',
    'left': 'quickFilterLeft',
    'submitted': 'quickFilterSubmitted',
    'cash': 'quickFilterCash',
    'pending': 'quickFilterPending'
  };

  Object.entries(map).forEach(([val, btnId]) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (val === activeVal) {
      if (val === '') {
        btn.className = 'px-3 py-1 text-xs font-black rounded-lg border bg-slate-900 text-white border-slate-900 ring-2 ring-indigo-500 transition cursor-pointer';
      } else if (val === 'left') {
        btn.className = 'px-3 py-1 text-xs font-black rounded-lg border bg-rose-600 text-white border-rose-700 ring-2 ring-rose-400 transition cursor-pointer';
      } else if (val === 'active') {
        btn.className = 'px-3 py-1 text-xs font-black rounded-lg border bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-400 transition cursor-pointer';
      } else if (val === 'submitted') {
        btn.className = 'px-3 py-1 text-xs font-black rounded-lg border bg-blue-600 text-white border-blue-700 ring-2 ring-blue-400 transition cursor-pointer';
      } else if (val === 'cash') {
        btn.className = 'px-3 py-1 text-xs font-black rounded-lg border bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-400 transition cursor-pointer';
      } else if (val === 'pending') {
        btn.className = 'px-3 py-1 text-xs font-black rounded-lg border bg-rose-600 text-white border-rose-700 ring-2 ring-rose-400 transition cursor-pointer';
      }
    } else {
      if (val === '') {
        btn.className = 'px-3 py-1 text-xs font-bold rounded-lg border bg-white text-slate-700 border-slate-300 hover:bg-slate-100 transition cursor-pointer';
      } else if (val === 'left') {
        btn.className = 'px-3 py-1 text-xs font-black rounded-lg border bg-rose-50 text-rose-800 border-rose-300 hover:bg-rose-100 transition cursor-pointer';
      } else if (val === 'active') {
        btn.className = 'px-3 py-1 text-xs font-bold rounded-lg border bg-white text-slate-700 border-slate-300 hover:bg-emerald-50 hover:text-emerald-900 transition cursor-pointer';
      } else if (val === 'submitted') {
        btn.className = 'px-3 py-1 text-xs font-bold rounded-lg border bg-white text-blue-900 border-blue-200 hover:bg-blue-50 transition cursor-pointer';
      } else if (val === 'cash') {
        btn.className = 'px-3 py-1 text-xs font-bold rounded-lg border bg-white text-emerald-900 border-emerald-200 hover:bg-emerald-50 transition cursor-pointer';
      } else if (val === 'pending') {
        btn.className = 'px-3 py-1 text-xs font-bold rounded-lg border bg-white text-rose-700 border-rose-200 hover:bg-rose-50 transition cursor-pointer';
      }
    }
  });
}

// Synthesized audio notification alerts (zero external audio file needed)
function playNotificationChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.45);
  } catch (e) {}
}

function playSuccessChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
    osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {}
}

function renderBusDropdowns() {
  const filter = document.getElementById('busFilter');
  if (!filter) return;

  const currentFilterVal = filter.value;
  filter.innerHTML = '';

  if (selectedSchool) {
    const schoolBuses = currentBuses.filter(b => 
      (b.schoolName || '').toLowerCase().trim() === selectedSchool.toLowerCase().trim()
    );
    filter.innerHTML = `<option value="">All Buses under ${escapeHtml(selectedSchool)} (${schoolBuses.length})</option>`;
    schoolBuses.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.busNumber;
      opt.textContent = `🚌 Bus ${b.busNumber} (${b.studentCount || 0} students)`;
      filter.appendChild(opt);
    });
  } else {
    filter.innerHTML = '<option value="">All Buses (Select School to filter)</option>';
    
    // Group buses by school using <optgroup>
    const grouped = {};
    currentSchools.forEach(s => { grouped[s.name] = []; });
    currentBuses.forEach(b => {
      const sch = b.schoolName || 'Police DAV Public School';
      if (!grouped[sch]) grouped[sch] = [];
      grouped[sch].push(b);
    });

    Object.entries(grouped).forEach(([schName, buses]) => {
      if (buses.length > 0) {
        const group = document.createElement('optgroup');
        group.label = `🏫 ${schName} (${buses.length} buses)`;
        buses.forEach(b => {
          const opt = document.createElement('option');
          opt.value = b.busNumber;
          opt.textContent = `🚌 Bus ${b.busNumber} (${b.studentCount || 0} students)`;
          group.appendChild(opt);
        });
        filter.appendChild(group);
      }
    });
  }

  if (currentFilterVal) {
    const exists = Array.from(filter.options).some(o => o.value === currentFilterVal);
    if (exists) filter.value = currentFilterVal;
  }
}

function updateModalBusSelectForSchool(schoolName, targetBusNumber = '') {
  const busSelect = document.getElementById('modalBusSelect');
  const busInput = document.getElementById('modalBusNumber');
  const helperText = document.getElementById('modalSchoolBusHelperText');
  if (!busSelect) return;

  const cleanSchool = (schoolName || '').trim();
  const schoolBuses = currentBuses.filter(b => 
    (b.schoolName || '').toLowerCase().trim() === cleanSchool.toLowerCase()
  );

  busSelect.innerHTML = '';

  if (schoolBuses.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = `⚠️ No buses registered under ${cleanSchool || 'this school'}`;
    busSelect.appendChild(opt);
    if (busInput) busInput.value = '';
    if (helperText) {
      helperText.textContent = `⚠️ No buses registered under ${cleanSchool || 'this school'}. Add a bus in Fleet Manager or type custom number.`;
      helperText.className = 'text-[11px] text-amber-700 font-bold';
    }
  } else {
    schoolBuses.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.busNumber;
      opt.textContent = `🚌 Bus ${b.busNumber} (${b.route || 'Route'} • ${b.studentCount || 0} students)`;
      busSelect.appendChild(opt);
    });

    const hasTarget = targetBusNumber && schoolBuses.some(b => b.busNumber.toLowerCase() === targetBusNumber.toLowerCase());
    if (hasTarget) {
      busSelect.value = targetBusNumber;
      if (busInput) busInput.value = targetBusNumber;
    } else {
      busSelect.value = schoolBuses[0].busNumber;
      if (busInput) busInput.value = schoolBuses[0].busNumber;
    }

    if (helperText) {
      helperText.textContent = `✓ Showing ${schoolBuses.length} bus${schoolBuses.length === 1 ? '' : 'es'} assigned strictly under ${cleanSchool}.`;
      helperText.className = 'text-[11px] text-emerald-800 font-semibold';
    }
  }
}

function handleModalBusSelect() {
  const selected = document.getElementById('modalBusSelect').value;
  if (selected) {
    document.getElementById('modalBusNumber').value = selected;
  }
}

function renderSchoolDropdowns() {
  const filter = document.getElementById('schoolFilter');
  const modalSelect = document.getElementById('modalSchoolSelect');
  const newBusSchool = document.getElementById('newBusSchool');
  const bulkBusSchool = document.getElementById('bulkBusSchool');

  if (filter) {
    const curVal = filter.value;
    filter.innerHTML = `<option value="">All Schools (${currentSchools.length})</option>`;
    currentSchools.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.name;
      opt.textContent = `🏫 ${s.name} (${s.studentCount || 0} students • ${s.busCount || 0} buses)`;
      filter.appendChild(opt);
    });
    if (curVal) filter.value = curVal;
  }

  if (modalSelect) {
    const curVal = modalSelect.value;
    modalSelect.innerHTML = currentSchools.map(s => `
      <option value="${escapeHtml(s.name)}">🏫 ${escapeHtml(s.name)}${s.code ? ` (${escapeHtml(s.code)})` : ''}</option>
    `).join('') + `<option value="__custom__">➕ + Add / Type Custom School</option>`;
    if (curVal) modalSelect.value = curVal;
  }

  if (newBusSchool) {
    const curVal = newBusSchool.value;
    newBusSchool.innerHTML = currentSchools.map(s => `
      <option value="${escapeHtml(s.name)}">🏫 ${escapeHtml(s.name)}</option>
    `).join('');
    if (curVal) newBusSchool.value = curVal;
    else if (currentSchools.length > 0) newBusSchool.value = currentSchools[0].name;
  }

  if (bulkBusSchool) {
    const curVal = bulkBusSchool.value;
    bulkBusSchool.innerHTML = currentSchools.map(s => `
      <option value="${escapeHtml(s.name)}">🏫 ${escapeHtml(s.name)}</option>
    `).join('');
    if (curVal) bulkBusSchool.value = curVal;
    else if (currentSchools.length > 0) bulkBusSchool.value = currentSchools[0].name;
  }
}

function handleModalSchoolSelectChange() {
  const sel = document.getElementById('modalSchoolSelect');
  const customInput = document.getElementById('modalSchoolName');
  if (!sel) return;
  let schoolName = sel.value;
  if (sel.value === '__custom__') {
    if (customInput) {
      customInput.classList.remove('hidden');
      customInput.focus();
      schoolName = customInput.value;
    }
  } else {
    if (customInput) {
      customInput.classList.add('hidden');
      customInput.value = sel.value;
    }
  }
  updateModalBusSelectForSchool(schoolName);
}

function setupFilterListeners() {
  let debounceTimeout;
  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => fetchStudents(), 300);
  });

  document.getElementById('busFilter').addEventListener('change', () => fetchStudents());
  document.getElementById('statusFilter').addEventListener('change', () => fetchStudents());
}

function resetFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('busFilter').value = '';
  document.getElementById('statusFilter').value = '';
  selectedSchool = '';
  const sSelect = document.getElementById('schoolFilter');
  if (sSelect) sSelect.value = '';
  selectedActiveMonth = 'September 2026';
  const mSelect = document.getElementById('monthFilterSelect');
  if (mSelect) mSelect.value = 'September 2026';
  renderFinancialYearMonthSelector();
  fetchStats();
  fetchStudents();
}

// RENDER STUDENT TABLE (With Leading Bus Column & Quick Fee Edit)
function renderStudentsTable(students) {
  const sortedStudents = students || [];
  const tbody = document.getElementById('studentTableBody');
  document.getElementById('studentCountBadge').textContent = `${sortedStudents.length} students`;

  const rosterHeading = document.getElementById('rosterMonthHeading');
  if (rosterHeading) {
    rosterHeading.textContent = `Student Transport & Payment Roster — ${selectedActiveMonth}`;
  }

  if (sortedStudents.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-12 text-center text-slate-400">
          <div class="text-4xl mb-2">🚌</div>
          <div class="font-bold text-slate-600">No students found</div>
          <div class="text-xs text-slate-400 mt-1">Try another filter or click "+ Add Student".</div>
        </td>
      </tr>
    `;
    const cardsContainer = document.getElementById('studentCardsContainer');
    if (cardsContainer) {
      cardsContainer.innerHTML = `
        <div class="py-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div class="text-4xl mb-2">🚌</div>
          <div class="font-bold text-slate-600">No students found</div>
          <div class="text-xs text-slate-400 mt-1">Try another filter or click "+ Add Student".</div>
        </div>
      `;
    }
    updateRosterViewUI();
    return;
  }

  const sym = currentSettings.currencySymbol || '₹';
  const isPastCleared = ["April 2026", "May 2026", "June 2026", "July 2026", "August 2026"].includes(selectedActiveMonth);
  const fyMonths = (currentSettings.fyMonths && currentSettings.fyMonths.length) ? currentSettings.fyMonths : [
    "April 2026", "May 2026", "June 2026", "July 2026", "August 2026",
    "September 2026", "October 2026", "November 2026", "December 2026",
    "January 2027", "February 2027", "March 2027"
  ];

  const tableRows = [];
  const cardsList = [];

  sortedStudents.forEach(st => {
    const parentPayLink = `${window.location.origin}/pay/${st.token}`;

    const isLeft = st.serviceStatus === 'left';
    const leftFromMonth = st.leftFromMonth || selectedActiveMonth;
    const isStudentStopped = st.isStoppedForMonth || (isLeft && fyMonths.indexOf(selectedActiveMonth) >= fyMonths.indexOf(leftFromMonth));

    const rowMonth = studentRowSelectedMonth[st.id] || selectedActiveMonth;
    const hist = st.monthlyHistory && st.monthlyHistory[rowMonth];
    const mIdx = fyMonths.indexOf(rowMonth);
    const pIdx = st.paidTill ? fyMonths.indexOf(st.paidTill) : fyMonths.indexOf("August 2026");
    const isRowMonthPastCleared = !hist && pIdx >= mIdx && mIdx <= 4;
    const isRowStopped = isLeft && mIdx >= fyMonths.indexOf(leftFromMonth);
    
    let rowStatus = 'pending';
    let rowPaymentApp = '';
    let rowPayerInfo = '';
    let rowPaymentRef = '';
    let rowAmount = Number(st.amount) || 2310;
    const fixedRecurringFee = st.fixedFee !== undefined ? Number(st.fixedFee) : (Number(st.amount) || 2310);

    if (isRowStopped) {
      rowStatus = 'stopped';
      rowAmount = 0;
      rowPaymentApp = 'Service Discontinued';
    } else if (hist && hist.status) {
      rowStatus = hist.status;
      rowPaymentApp = hist.method || '';
      rowPayerInfo = hist.payerInfo || '';
      rowPaymentRef = hist.voucher || '';
      rowAmount = Number(hist.amount) || rowAmount;
    } else if (isRowMonthPastCleared) {
      rowStatus = 'paid';
      rowPaymentApp = 'Pre-cleared in school records';
      rowPayerInfo = 'Previous Records';
      rowPaymentRef = 'CLEARED-TILL-AUG';
    } else if (rowMonth === (st.billingPeriod || selectedActiveMonth)) {
      rowStatus = st.status || 'pending';
      rowPaymentApp = st.paymentApp || '';
      rowPayerInfo = st.payerInfo || '';
      rowPaymentRef = st.paymentRef || '';
    }

    const isRowMonthPastDue = rowStatus === 'pending' && mIdx < fyMonths.indexOf(selectedActiveMonth);

    tableRows.push(`
      <tr class="hover:bg-slate-50/80 transition group ${isLeft ? 'bg-rose-50/20' : ''}">
        <!-- ASSIGNED BUS (PRIMARY LEADING COLUMN) -->
        <td class="py-2.5 px-4 whitespace-nowrap">
          <button onclick="editStudent('${st.id}')" title="Click to edit bus assignment" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black badge-bus hover:border-amber-400 transition shadow-xs cursor-pointer">
            <span>🚌</span> <span>${escapeHtml(st.busNumber || 'Unassigned')}</span>
            <svg class="w-3 h-3 text-amber-700 ml-0.5 opacity-60 group-hover:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
          </button>
        </td>

        <!-- Student Details & Payment Method Badge -->
        <td class="py-2.5 px-4 min-w-[220px]">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-extrabold text-slate-900 text-sm">${escapeHtml(st.name)}</span>
            
            <!-- Left / Discontinued Badge -->
            ${
              isLeft
                ? `<span class="inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-300 shadow-xs whitespace-nowrap" title="${st.leftReason ? escapeHtml(st.leftReason) : 'Transport Service Discontinued'}">
                    <span>🛑</span> <span>Left from ${escapeHtml(leftFromMonth)}</span>
                   </span>`
                : ''
            }

            <!-- Payment Method Badge near the Student Name -->
            ${
              st.status === 'paid' && (st.paymentApp === 'Cash / Offline' || st.method === 'Cash / Offline')
                ? `<span class="inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-xs whitespace-nowrap" title="Paid via Cash">
                    <span>💵</span> <span>Cash Paid</span>
                   </span>`
                : st.status === 'paid' && st.paymentApp && !st.paymentApp.includes('Pre-cleared')
                ? `<span class="inline-flex items-center gap-1 text-[11px] font-black px-2 py-0.5 rounded-md bg-blue-100 text-blue-900 border border-blue-200 shadow-xs whitespace-nowrap" title="Paid via ${escapeHtml(st.paymentApp)}">
                    <span>📱</span> <span>${escapeHtml(st.paymentApp)}</span>
                   </span>`
                : isPastCleared || (st.status === 'paid' && st.paymentApp && st.paymentApp.includes('Pre-cleared'))
                ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap" title="Pre-cleared in school records">
                    <span>✓</span> <span>Pre-cleared</span>
                   </span>`
                : st.status === 'submitted'
                ? `<span class="inline-flex items-center gap-1.5 text-[11px] font-black px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-950 border-2 border-blue-400 shadow-xs whitespace-nowrap animate-pulse" title="Payment Submitted - Awaiting Admin Verification">
                    <span class="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span>
                    <span>⏳ Awaiting Verification</span>
                   </span>`
                : isLeft && !st.hasPastDue
                ? `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-300 whitespace-nowrap">
                    <span>✓</span> <span>Dues Cleared</span>
                   </span>`
                : isLeft && st.hasPastDue
                ? `<span class="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
                    <span>⚠️</span> <span>Prior Due Pending</span>
                   </span>`
                : `<span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                    <span>⚠️</span> <span>Pending Due</span>
                   </span>`
            }
          </div>

          <div class="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
            ${st.rollNo ? `<span class="font-semibold text-slate-700">Roll: #${escapeHtml(st.rollNo)}</span> • ` : ''}
            <span class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-sky-50 text-sky-900 border border-sky-200" title="Enrolled School">
              <span>🏫</span> <span>${escapeHtml(st.schoolName || 'Police DAV Public School')}</span>
            </span>
          </div>

          ${isLeft && st.leftReason ? `<div class="text-[10px] text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200 mt-1 inline-block">Reason: ${escapeHtml(st.leftReason)}</div>` : ''}

          <!-- Quick Stop Fee / Reactivate Service Action directly in Student Name column -->
          <div class="mt-1 flex items-center gap-1.5 flex-wrap">
            ${
              isLeft
                ? `<button onclick="reactivateStudent('${st.id}', '${escapeHtml(st.name)}')" title="Restore active bus service" class="text-[10px] font-black text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 px-2 py-0.5 rounded-lg inline-flex items-center gap-1 transition cursor-pointer shadow-2xs">
                    <span>✓</span> Reactivate Transport
                   </button>`
                : `<button onclick="openStopServiceModal('${st.id}')" title="Stop upcoming fees for student who left school/bus" class="text-[10px] font-bold text-rose-700 hover:text-rose-950 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-0.5 rounded-lg inline-flex items-center gap-1 transition cursor-pointer">
                    <span>🛑</span> Stop Fee (Left)
                   </button>`
            }
          </div>
          ${
            st.status === 'paid' && (st.paymentApp === 'Cash / Offline' || st.method === 'Cash / Offline')
              ? `<div class="mt-1 text-[11px] font-semibold text-emerald-950 bg-emerald-50/90 border border-emerald-200 px-2.5 py-1 rounded-lg block max-w-xs shadow-2xs">
                  <div class="flex items-center gap-1 font-bold text-emerald-900">
                    <span>💵 Cash Entry:</span>
                  </div>
                  <div class="text-emerald-800 text-[11px] truncate">
                    ${escapeHtml(st.payerInfo || `Handed by ${st.parentName || 'Parent'}`)}
                  </div>
                  <div class="text-emerald-700 text-[10px] font-normal">
                    • ${escapeHtml(st.verifiedBy || 'Recorded by Admin (Himanshu Walia)')}
                  </div>
                 </div>`
              : st.status === 'paid' && st.paymentApp && !st.paymentApp.includes('Pre-cleared')
              ? `<div class="mt-1 text-[11px] font-semibold text-blue-950 bg-blue-50/90 border border-blue-200 px-2.5 py-1 rounded-lg block max-w-xs shadow-2xs">
                  <div class="flex items-center gap-1 font-bold text-blue-900">
                    <span>📱 Online UPI:</span>
                  </div>
                  <div class="text-blue-800 text-[11px] truncate">
                    ${escapeHtml(st.payerInfo || st.parentName || 'Parent')}
                  </div>
                  ${st.paymentRef ? `<div class="font-mono text-[10px] text-blue-600 font-normal truncate">Ref: ${escapeHtml(st.paymentRef)}</div>` : ''}
                 </div>`
              : st.status === 'submitted'
              ? `<div class="mt-1 text-[11px] font-semibold text-blue-950 bg-blue-50/90 border border-blue-300 px-2.5 py-1 rounded-lg block max-w-xs shadow-2xs">
                  <div class="flex items-center gap-1.5 font-bold text-blue-900">
                    <span class="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span>
                    <span>⏳ Submitted for Verification:</span>
                  </div>
                  <div class="text-blue-900 text-[11px] truncate">
                    📱 ${escapeHtml(st.paymentApp || 'Online UPI')} by <strong>${escapeHtml(st.payerInfo || st.parentName || 'Parent')}</strong>
                  </div>
                  ${st.paymentRef ? `<div class="font-mono text-[10px] text-blue-700 font-normal truncate">Ref / UTR: ${escapeHtml(st.paymentRef)}</div>` : ''}
                 </div>`
              : ''
          }
          ${st.siblingGroupId ? `
            <div class="mt-1 flex items-center gap-1.5 flex-wrap">
              <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200" title="Clubbed Sibling Group">
                <span>👨‍👩‍👧</span> ${escapeHtml(st.siblingGroupName || 'Sibling Group')}
              </span>
              <button onclick="unclubStudentAction('${st.id}', '${escapeHtml(st.name)}')" title="Unlink from sibling group" class="text-[10px] text-rose-500 hover:text-rose-700 font-bold hover:underline">
                Unlink
              </button>
            </div>
          ` : `
            <div class="mt-1">
              <button onclick="openClubModalForSingleStudent('${st.id}')" title="Club with another student to pay together" class="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-indigo-600 transition">
                <span>+</span> Club Sibling
              </button>
            </div>
          `}
          ${st.notes ? `<div class="text-[11px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded mt-1 inline-block">Note: ${escapeHtml(st.notes)}</div>` : ''}
        </td>

        <!-- Pickup / Route Stop -->
        <td class="py-2.5 px-4">
          <div class="text-xs font-semibold text-slate-800 max-w-[170px] truncate" title="${escapeHtml(st.routeStop || '')}">
            📍 ${escapeHtml(st.routeStop || 'Route Not Set')}
          </div>
        </td>

        <!-- Parent Info -->
        <td class="py-2.5 px-4">
          <div class="font-semibold text-slate-800 text-xs">${escapeHtml(st.parentName || 'Parent')}</div>
          <div class="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
            <a href="tel:${escapeHtml(st.parentPhone)}" class="hover:text-emerald-600 font-mono">${escapeHtml(st.parentPhone || 'No Phone')}</a>
          </div>
        </td>

        <!-- Fee in Month (Actual Paid for Paid Month / Fixed Fee Due for Upcoming) -->
        <td class="py-2.5 px-4 whitespace-nowrap">
          ${(() => {
            const fixedRecurringFee = st.fixedFee !== undefined ? Number(st.fixedFee) : (Number(st.amount) || 2310);
            
            if (isStudentStopped || isRowStopped) {
              return `<div class="px-2 py-1 rounded-xl bg-slate-100 border border-slate-200">
                  <span class="text-xs text-slate-400 line-through mr-1">${sym}${fixedRecurringFee.toLocaleString()}</span>
                  <span class="font-black text-rose-700 text-xs bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">₹0 (Stopped)</span>
                  <div class="text-[9px] text-rose-600 font-semibold mt-0.5">Discontinued service</div>
                 </div>`;
            }

            // If this month is PAID: show the ACTUAL FEE PAID in this month!
            if (rowStatus === 'paid') {
              const actualPaid = rowAmount;
              return `<div class="inline-flex flex-col">
                  <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-300 shadow-2xs">
                    <span class="font-black text-emerald-950 text-xs sm:text-sm">${sym}${actualPaid.toLocaleString()}</span>
                    <span class="text-[9px] font-black text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-200">PAID</span>
                  </div>
                  <div class="text-[10px] text-emerald-800 font-bold mt-0.5 flex items-center gap-0.5">
                    <span>✓</span> <span>Actual Paid (${escapeHtml(rowMonth.split(' ')[0])})</span>
                  </div>
                  ${fixedRecurringFee !== actualPaid ? `
                    <div class="text-[10px] text-slate-500 mt-0.5 flex items-center gap-1">
                      <span>Fixed: ${sym}${fixedRecurringFee.toLocaleString()}</span>
                      <button onclick="quickEditFee('${st.id}', '${escapeHtml(st.name)}', ${fixedRecurringFee})" class="text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer text-[10px]" title="Edit recurring fixed fee for upcoming months">✎ Edit</button>
                    </div>
                  ` : ''}
                </div>`;
            }

            // If pending / submitted (unpaid in current or upcoming month)
            return `<div>
                <button onclick="quickEditFee('${st.id}', '${escapeHtml(st.name)}', ${fixedRecurringFee})" title="Click to Change Fee Amount for Current & Upcoming Months" class="group/fee flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-emerald-50 hover:border-emerald-300 border border-slate-200 transition cursor-pointer">
                  <span class="font-black text-slate-900 group-hover/fee:text-emerald-700">${sym}${fixedRecurringFee.toLocaleString()}</span>
                  <svg class="w-3.5 h-3.5 text-slate-400 group-hover/fee:text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                </button>
                <div class="text-[10px] text-emerald-700 font-semibold mt-0.5">${rowStatus === 'submitted' ? 'To Verify' : 'Fixed Fee (Due)'}</div>
               </div>`;
          })()}
        </td>

        <!-- Fee Month & Payment Status (Clubbed into Single Column) -->
        <td class="py-2.5 px-4 whitespace-nowrap min-w-[220px]">
          <div class="space-y-2">
            <!-- Row Month Selector + Set Primary Link -->
            <div class="flex items-center gap-2">
              <select onchange="handleStudentRowMonthChange('${st.id}', this.value)" 
                      title="Select month to view or manage status for ${escapeHtml(st.name)}"
                      class="text-xs font-black px-2.5 py-1.5 rounded-xl border ${
                        isRowStopped
                          ? 'border-rose-300 bg-rose-50/80 text-rose-950 focus:ring-rose-500'
                          : rowStatus === 'paid'
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-950 focus:ring-emerald-500'
                          : rowStatus === 'submitted'
                          ? 'border-blue-300 bg-blue-50 text-blue-950 focus:ring-blue-500'
                          : isRowMonthPastDue
                          ? 'border-rose-300 bg-rose-50 text-rose-950 focus:ring-rose-500'
                          : 'border-slate-300 bg-white text-slate-800 focus:ring-emerald-500'
                      } focus:ring-2 focus:outline-none transition shadow-2xs cursor-pointer">
                ${fyMonths.map(m => {
                  const hist = st.monthlyHistory && st.monthlyHistory[m];
                  const mIdx = fyMonths.indexOf(m);
                  const pIdx = st.paidTill ? fyMonths.indexOf(st.paidTill) : fyMonths.indexOf("August 2026");
                  const isPaid = hist ? hist.status === 'paid' : (pIdx >= mIdx && mIdx <= 4);
                  const isSub = hist && hist.status === 'submitted';
                  const isDue = m === (st.dueDetails && st.dueDetails.targetMonth);
                  const isStopped = isLeft && mIdx >= fyMonths.indexOf(leftFromMonth);
                  const isSel = m === rowMonth;
                  
                  return `<option value="${m}" ${isSel ? 'selected' : ''}>
                    ${isStopped ? '🛑 ' : isPaid ? '✓ ' : isSub ? '⏳ ' : isDue ? '⚠️ ' : ''}${m} ${isStopped ? '(Stopped)' : isPaid ? '(Paid)' : isSub ? '(Check)' : isDue ? '(Due)' : ''}
                  </option>`;
                }).join('')}
              </select>

              <button onclick="setStudentTargetMonth('${st.id}', '${escapeHtml(rowMonth)}')" title="Set ${escapeHtml(rowMonth)} as the primary billing month for this student" class="text-[11px] text-indigo-600 hover:text-indigo-900 font-bold hover:underline cursor-pointer whitespace-nowrap">
                Set Primary
              </button>
            </div>

            <!-- Status Badge (Clickable) + Edit & Cash Buttons -->
            <div class="flex items-center gap-1.5 flex-wrap">
              ${
                isRowStopped
                  ? `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black bg-rose-100 text-rose-800 border border-rose-300">
                      <span>🛑</span> STOPPED (₹0)
                     </span>`
                  : `<button onclick="openStatusModal('${st.id}', '${escapeHtml(rowMonth)}')" title="Click to Change Payment Status for ${escapeHtml(rowMonth)}" class="transition hover:opacity-85 cursor-pointer">
                      ${
                        rowStatus === 'paid'
                          ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> ✓ PAID
                             </span>`
                          : rowStatus === 'submitted'
                          ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-900 border border-blue-200">
                              <span class="w-1.5 h-1.5 rounded-full bg-blue-600"></span> ⏳ AWAITING CHECK
                             </span>`
                          : `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> ⚠️ UNPAID
                             </span>`
                      }
                     </button>

                     <!-- Direct Cash Button -->
                     <button onclick="openCashModal('${st.id}', '${escapeHtml(rowMonth)}')" title="Record Direct Cash Payment for ${escapeHtml(rowMonth)}" class="px-2 py-1 text-[11px] font-black text-emerald-900 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg transition inline-flex items-center gap-0.5 cursor-pointer">
                       <span>💵</span> Cash
                     </button>`
              }
            </div>

            <!-- Month Clearance Badge -->
            ${
              isRowStopped
                ? `<div class="flex items-center gap-1 text-[10px] text-rose-800 font-bold bg-rose-100/80 px-2 py-0.5 rounded-md border border-rose-300 inline-flex">
                    <span>🛑</span> Service Stopped from ${escapeHtml(leftFromMonth)}
                   </div>
                   <div class="text-[11px] text-slate-500 font-medium">
                     Monthly fee obligation set to ₹0.
                   </div>`
                : rowStatus === 'paid'
                ? `<div class="flex items-center gap-1 text-[10px] text-emerald-800 font-bold bg-emerald-100/80 px-2 py-0.5 rounded-md border border-emerald-300 inline-flex">
                    <span>✓</span> Paid for ${escapeHtml(rowMonth)}
                   </div>
                   <div class="text-[11px] text-slate-600 font-medium">
                     Record: <strong class="text-emerald-700 font-semibold">${escapeHtml(rowPaymentApp || 'Pre-cleared / Verified')}</strong>
                   </div>`
                : isRowMonthPastDue
                ? `<div class="flex items-center gap-1 text-[10px] text-rose-800 font-black bg-rose-100 px-2 py-0.5 rounded-md border border-rose-300 inline-flex">
                    <span>⚠️</span> Prior Due: ${escapeHtml(rowMonth)}
                   </div>
                   <div class="text-[11px] text-rose-700 font-bold">
                     Clear First: <strong class="text-rose-950">${escapeHtml(rowMonth)}</strong>
                   </div>`
                : rowStatus === 'submitted'
                ? `<div class="flex items-center gap-1 text-[10px] text-blue-800 font-bold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 inline-flex">
                    <span>⏳</span> Submitted for ${escapeHtml(rowMonth)}
                   </div>
                   <div class="text-[11px] text-slate-500 font-medium">
                     Awaiting check for: <strong class="text-slate-800">${escapeHtml(rowMonth)}</strong>
                   </div>`
                : `<div class="flex items-center gap-1 text-[10px] text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 inline-flex">
                    <span>📅</span> Due: ${escapeHtml(rowMonth)}
                   </div>
                   <div class="text-[11px] text-slate-500 font-medium">
                     Cycle: <strong class="text-slate-800">${escapeHtml(selectedActiveMonth)}</strong>
                   </div>`
            }

            <!-- Payment details (App / Payer / Cash / Notes) -->
            ${
              (rowPaymentApp || rowPayerInfo) && !isRowStopped
                ? `<div class="text-[11px] text-slate-600 flex items-center gap-1 font-semibold">
                    <span>${rowPaymentApp === 'Cash / Offline' ? '💵' : '📱'}</span>
                    <span>${escapeHtml(rowPaymentApp || 'Payment')}:</span>
                    <span class="text-slate-900 font-bold">${escapeHtml(rowPayerInfo || 'Verified')}</span>
                   </div>`
                : ''
            }
            ${rowPaymentRef && !rowPaymentRef.startsWith('REF-') && !isRowStopped ? `<div class="text-[10px] text-slate-400 font-mono">Ref: ${escapeHtml(rowPaymentRef)}</div>` : ''}
            ${st.isClubbedPayment ? `<div class="text-[9px] font-black bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded inline-block">👨‍👩‍👧 Clubbed Family</div>` : ''}

            <!-- Quick Action Row for Submitted (Approve / Reject) -->
            ${
              rowStatus === 'submitted'
                ? `<div class="mt-2 p-2.5 bg-blue-50/90 border-2 border-blue-400 rounded-xl space-y-1.5 shadow-xs max-w-xs">
                    <div class="flex items-center justify-between text-[11px]">
                      <span class="font-black text-blue-950 flex items-center gap-1.5">
                        <span class="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span>
                        <span>Bank Check Needed</span>
                      </span>
                      <span class="font-black text-blue-800">${sym}${Number(rowAmount || st.amount || 0).toLocaleString()}</span>
                    </div>
                    <div class="text-[10px] text-blue-900 font-semibold truncate">
                      📱 ${escapeHtml(rowPaymentApp || 'UPI')} • ${escapeHtml(rowPayerInfo || 'Parent')}
                    </div>
                    ${rowPaymentRef ? `<div class="text-[9px] font-mono text-blue-700 truncate">Ref: ${escapeHtml(rowPaymentRef)}</div>` : ''}
                    <div class="flex items-center gap-1.5 pt-1">
                      <button onclick="approvePayment('${st.id}', '${escapeHtml(st.name)}', '${escapeHtml(rowMonth)}')" class="flex-1 px-3 py-1.5 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-lg shadow-xs transition flex items-center justify-center gap-1 cursor-pointer" title="Verify bank credit & issue official receipt to parent for ${escapeHtml(rowMonth)}">
                        <span>✓ Verify & Issue Receipt</span>
                      </button>
                      <button onclick="rejectPayment('${st.id}', '${escapeHtml(st.name)}', '${escapeHtml(rowMonth)}')" class="px-2 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 bg-white border border-rose-300 rounded-lg transition cursor-pointer" title="Mark payment as not received in bank">
                        <span>✕</span>
                      </button>
                    </div>
                   </div>`
                : ''
            }
          </div>
        </td>

        <!-- Actions / Options (Sticky Right with Elevated Separation) -->
        <td class="py-2.5 px-3 text-center whitespace-nowrap md:sticky md:right-0 bg-white group-hover:bg-slate-50/90 z-10 md:border-l md:border-slate-200 md:shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
          <div class="inline-flex items-center justify-center gap-1">
            <!-- WhatsApp Button -->
            <button onclick="sendWhatsApp('${st.id}')" title="Send Link via WhatsApp" class="p-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition inline-flex items-center justify-center cursor-pointer active:scale-95 shadow-2xs">
              <span class="text-sm leading-none">💬</span>
            </button>

            <!-- Copy Link -->
            <button onclick="copyPaymentLink('${parentPayLink}')" title="Copy Parent Payment Link" class="p-1.5 text-slate-700 bg-slate-50 hover:bg-slate-200 border border-slate-200 rounded-lg transition inline-flex items-center justify-center cursor-pointer active:scale-95 shadow-2xs">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
            </button>

            <!-- Edit -->
            <button onclick="editStudent('${st.id}')" title="Edit Student & Bus Number" class="p-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition inline-flex items-center justify-center cursor-pointer active:scale-95 shadow-2xs">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>

            <!-- Delete -->
            <button onclick="deleteStudent('${st.id}', '${escapeHtml(st.name)}')" title="Delete Student" class="p-1.5 text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition inline-flex items-center justify-center cursor-pointer active:scale-95 shadow-2xs">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </td>
      </tr>
    `);

    // Mobile Card View (Shows every detail clearly on mobile phones without squishing)
    cardsList.push(`
      <div class="bg-white rounded-2xl border-2 ${
        isLeft
          ? 'border-rose-300 bg-rose-50/20'
          : rowStatus === 'paid'
          ? 'border-emerald-200'
          : rowStatus === 'submitted'
          ? 'border-blue-300 shadow-sm'
          : 'border-slate-200'
      } p-3.5 sm:p-4 shadow-xs space-y-3">
        <!-- Card Top Bar: Bus Badge, Name, Roll & Status -->
        <div class="flex items-start justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div class="flex items-start gap-2.5">
            <!-- Clickable Bus Badge -->
            <button onclick="editStudent('${st.id}')" title="Click to edit bus assignment" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-black badge-bus shadow-2xs cursor-pointer shrink-0 mt-0.5">
              <span>🚌</span> <span>${escapeHtml(st.busNumber || 'Unassigned')}</span>
              <svg class="w-3 h-3 text-amber-700 ml-0.5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
            </button>

            <div>
              <div class="flex items-center gap-1.5 flex-wrap">
                <h3 class="font-black text-slate-900 text-base leading-tight">${escapeHtml(st.name)}</h3>
                ${st.rollNo ? `<span class="bg-slate-100 text-slate-700 font-bold px-1.5 py-0.5 rounded text-[11px]">Roll: #${escapeHtml(st.rollNo)}</span>` : ''}
              </div>
              <div class="text-xs text-slate-600 font-semibold flex items-center gap-1.5 mt-0.5 flex-wrap">
                ${st.classGrade ? `<span class="text-indigo-900 font-bold">${escapeHtml(st.classGrade)}</span> • ` : ''}
                <span class="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded bg-sky-50 text-sky-900 border border-sky-200">
                  <span>🏫</span> <span>${escapeHtml(st.schoolName || 'Police DAV Public School')}</span>
                </span>
              </div>
            </div>
          </div>

          <!-- Top Status Badge -->
          <div class="shrink-0">
            ${
              isRowStopped
                ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                    <span>🛑</span> STOPPED
                   </span>`
                : rowStatus === 'paid'
                ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <span>✓</span> PAID
                   </span>`
                : rowStatus === 'submitted'
                ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-blue-100 text-blue-900 border border-blue-200">
                    <span class="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping"></span> CHECK
                   </span>`
                : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    <span>⚠️</span> DUE
                   </span>`
            }
          </div>
        </div>

        <!-- Extra Tags (Left / Sibling / Notes) -->
        ${
          (isLeft || st.siblingGroupId || st.notes) ? `
            <div class="flex items-center gap-1.5 flex-wrap text-[11px]">
              ${isLeft ? `<span class="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-300">🛑 Left from ${escapeHtml(leftFromMonth)}${st.leftReason ? `: ${escapeHtml(st.leftReason)}` : ''}</span>` : ''}
              ${st.siblingGroupId ? `
                <span class="inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200">
                  <span>👨‍👩‍👧</span> ${escapeHtml(st.siblingGroupName || 'Sibling Group')}
                  <button onclick="unclubStudentAction('${st.id}', '${escapeHtml(st.name)}')" class="text-rose-500 hover:text-rose-700 underline ml-1 cursor-pointer">Unlink</button>
                </span>
              ` : `
                <button onclick="openClubModalForSingleStudent('${st.id}')" class="text-[10px] font-semibold text-slate-400 hover:text-indigo-600 cursor-pointer">
                  + Club Sibling
                </button>
              `}
              ${st.notes ? `<span class="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-medium">Note: ${escapeHtml(st.notes)}</span>` : ''}
            </div>
          ` : ''
        }

        <!-- Details Grid (Pickup Stop, Parent Phone, Fee in Month) -->
        <div class="bg-slate-50 rounded-xl p-3 border border-slate-200/80 space-y-2 text-xs">
          <!-- Row 1: Pickup Stop -->
          <div class="flex items-start justify-between gap-2 border-b border-slate-200/60 pb-1.5">
            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wide shrink-0">📍 Route / Stop:</span>
            <span class="font-bold text-slate-900 text-right text-xs">${escapeHtml(st.routeStop || 'Route Not Set')}</span>
          </div>

          <!-- Row 2: Parent Contact & Phone Call Link -->
          <div class="flex items-center justify-between gap-2 border-b border-slate-200/60 pb-1.5">
            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wide shrink-0">📞 Parent:</span>
            <div class="text-right flex items-center gap-1.5 flex-wrap justify-end">
              <span class="font-bold text-slate-900">${escapeHtml(st.parentName || 'Parent')}</span>
              ${st.parentPhone ? `
                <a href="tel:${escapeHtml(st.parentPhone)}" class="text-emerald-700 font-mono font-black underline bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 hover:bg-emerald-100 inline-flex items-center gap-0.5">
                  <span>📞</span> <span>${escapeHtml(st.parentPhone)}</span>
                </a>
              ` : '<span class="text-slate-400">No Phone</span>'}
            </div>
          </div>

          <!-- Row 3: Fee for Month + Quick Fee Edit -->
          <div class="flex items-center justify-between gap-2 pt-0.5">
            <span class="text-[11px] font-bold text-slate-400 uppercase tracking-wide shrink-0">💵 Fee (${escapeHtml(rowMonth.split(' ')[0])}):</span>
            <div class="text-right">
              ${
                isStudentStopped || isRowStopped
                  ? `<span class="font-black text-rose-700 text-xs bg-rose-50 px-2 py-0.5 rounded border border-rose-200">₹0 (Discontinued)</span>`
                  : rowStatus === 'paid'
                  ? `<div class="inline-flex items-center gap-1.5">
                      <span class="font-black text-emerald-950 text-sm">${sym}${rowAmount.toLocaleString()}</span>
                      <span class="text-[10px] font-black text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-200">PAID</span>
                      ${fixedRecurringFee !== rowAmount ? `<span class="text-[10px] text-slate-500">(Fixed: ${sym}${fixedRecurringFee.toLocaleString()})</span>` : ''}
                     </div>`
                  : `<div class="inline-flex items-center gap-1.5">
                      <span class="font-black text-slate-900 text-sm">${sym}${fixedRecurringFee.toLocaleString()}</span>
                      <button onclick="quickEditFee('${st.id}', '${escapeHtml(st.name)}', ${fixedRecurringFee})" class="text-indigo-600 hover:text-indigo-800 text-[11px] font-black underline cursor-pointer bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200" title="Edit fixed recurring fee">
                        ✎ Edit Fee
                      </button>
                     </div>`
              }
            </div>
          </div>
        </div>

        <!-- Month Selector & Verification / Cash Bar -->
        <div class="p-2.5 rounded-xl border ${
          isRowStopped
            ? 'bg-rose-50/70 border-rose-200'
            : rowStatus === 'paid'
            ? 'bg-emerald-50/60 border-emerald-200'
            : rowStatus === 'submitted'
            ? 'bg-blue-50/70 border-blue-200'
            : 'bg-amber-50/40 border-amber-200'
        } space-y-2">
          <!-- Month Dropdown & Set Primary -->
          <div class="flex items-center justify-between gap-1.5 flex-wrap sm:flex-nowrap">
            <div class="flex items-center gap-1.5 flex-1 min-w-[190px]">
              <span class="text-xs font-black text-slate-700 shrink-0">📅 Month:</span>
              <select onchange="handleStudentRowMonthChange('${st.id}', this.value)" class="text-xs font-black px-2 py-1 rounded-lg border border-slate-300 bg-white text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none w-full cursor-pointer">
                ${fyMonths.map(m => {
                  const h = st.monthlyHistory && st.monthlyHistory[m];
                  const mI = fyMonths.indexOf(m);
                  const pI = st.paidTill ? fyMonths.indexOf(st.paidTill) : fyMonths.indexOf("August 2026");
                  const isP = h ? h.status === 'paid' : (pI >= mI && mI <= 4);
                  const isS = h && h.status === 'submitted';
                  const isD = m === (st.dueDetails && st.dueDetails.targetMonth);
                  const isSt = isLeft && mI >= fyMonths.indexOf(leftFromMonth);
                  const isSel = m === rowMonth;
                  return `<option value="${m}" ${isSel ? 'selected' : ''}>
                    ${isSt ? '🛑 ' : isP ? '✓ ' : isS ? '⏳ ' : isD ? '⚠️ ' : ''}${m} ${isSt ? '(Stopped)' : isP ? '(Paid)' : isS ? '(Check)' : isD ? '(Due)' : ''}
                  </option>`;
                }).join('')}
              </select>
            </div>
            <button onclick="setStudentTargetMonth('${st.id}', '${escapeHtml(rowMonth)}')" class="text-[11px] text-indigo-700 hover:text-indigo-950 font-black underline shrink-0 cursor-pointer bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg border border-indigo-200">
              Set Primary
            </button>
          </div>

          <!-- Status Modal Trigger & Cash Entry Button -->
          <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/60">
            <div>
              ${
                isRowStopped
                  ? `<span class="text-xs font-black text-rose-700">🛑 Obligation ₹0</span>`
                  : `<button onclick="openStatusModal('${st.id}', '${escapeHtml(rowMonth)}')" class="inline-flex items-center gap-1 cursor-pointer" title="Change payment status">
                      ${
                        rowStatus === 'paid'
                          ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <span>✓</span> Paid (${escapeHtml(rowPaymentApp || 'Verified')})
                             </span>`
                          : rowStatus === 'submitted'
                          ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-black bg-blue-100 text-blue-900 border border-blue-200">
                              <span class="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping"></span> Awaiting Check
                             </span>`
                          : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                              <span>⚠️</span> Unpaid (Tap to change)
                             </span>`
                      }
                     </button>`
              }
            </div>

            ${
              !isRowStopped ? `
                <button onclick="openCashModal('${st.id}', '${escapeHtml(rowMonth)}')" title="Record Direct Cash Payment" class="px-2.5 py-1 text-xs font-black text-emerald-900 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg transition inline-flex items-center gap-1 cursor-pointer shadow-2xs">
                  <span>💵</span> <span>Cash Entry</span>
                </button>
              ` : ''
            }
          </div>

          <!-- If Submitted: Bank Check Needed with Approve / Reject -->
          ${
            rowStatus === 'submitted' ? `
              <div class="mt-2 p-2.5 bg-blue-50/90 border-2 border-blue-400 rounded-xl space-y-1.5 shadow-xs">
                <div class="flex items-center justify-between text-xs">
                  <span class="font-black text-blue-950 flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span>
                    <span>Bank Check Needed</span>
                  </span>
                  <span class="font-black text-blue-800">${sym}${Number(rowAmount || st.amount || 0).toLocaleString()}</span>
                </div>
                <div class="text-[11px] text-blue-900 font-semibold truncate">
                  📱 ${escapeHtml(rowPaymentApp || 'UPI')} • ${escapeHtml(rowPayerInfo || 'Parent')}
                </div>
                ${rowPaymentRef ? `<div class="text-[10px] font-mono text-blue-700 truncate">Ref: ${escapeHtml(rowPaymentRef)}</div>` : ''}
                <div class="flex items-center gap-1.5 pt-1">
                  <button onclick="approvePayment('${st.id}', '${escapeHtml(st.name)}', '${escapeHtml(rowMonth)}')" class="flex-1 px-3 py-2 text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 active:scale-95 rounded-lg shadow-xs transition flex items-center justify-center gap-1 cursor-pointer">
                    <span>✓ Verify & Issue Receipt</span>
                  </button>
                  <button onclick="rejectPayment('${st.id}', '${escapeHtml(st.name)}', '${escapeHtml(rowMonth)}')" class="px-2.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-100 bg-white border border-rose-300 rounded-lg transition cursor-pointer">
                    <span>✕</span>
                  </button>
                </div>
              </div>
            ` : ''
          }
        </div>

        <!-- Card Footer: Service Status (Left/Reactivate) + Action Buttons (WhatsApp, Copy, Edit, Delete) -->
        <div class="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 flex-wrap">
          <!-- Left Button: Stop Fee / Reactivate -->
          <div>
            ${
              isLeft
                ? `<button onclick="reactivateStudent('${st.id}', '${escapeHtml(st.name)}')" class="text-[11px] font-black text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 px-2.5 py-1 rounded-lg inline-flex items-center gap-1 transition cursor-pointer">
                    <span>✓</span> Reactivate Transport
                   </button>`
                : `<button onclick="openStopServiceModal('${st.id}')" class="text-[11px] font-bold text-rose-700 hover:text-rose-950 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2.5 py-1 rounded-lg inline-flex items-center gap-1 transition cursor-pointer">
                    <span>🛑</span> Stop Fee (Left)
                   </button>`
            }
          </div>

          <!-- Action Buttons Row (WhatsApp, Copy, Edit, Delete) -->
          <div class="inline-flex items-center gap-1.5">
            <!-- WhatsApp -->
            <button onclick="sendWhatsApp('${st.id}')" title="Send Link via WhatsApp" class="px-2 py-1 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer active:scale-95 shadow-2xs">
              <span class="text-sm leading-none">💬</span> <span>WhatsApp</span>
            </button>

            <!-- Copy Link -->
            <button onclick="copyPaymentLink('${parentPayLink}')" title="Copy Payment Link" class="p-1.5 text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition inline-flex items-center justify-center cursor-pointer active:scale-95 shadow-2xs">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/></svg>
            </button>

            <!-- Edit -->
            <button onclick="editStudent('${st.id}')" title="Edit Student" class="p-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition inline-flex items-center justify-center cursor-pointer active:scale-95 shadow-2xs">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>

            <!-- Delete -->
            <button onclick="deleteStudent('${st.id}', '${escapeHtml(st.name)}')" title="Delete Student" class="p-1.5 text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition inline-flex items-center justify-center cursor-pointer active:scale-95 shadow-2xs">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </div>
      </div>
    `);
  });

  tbody.innerHTML = tableRows.join('');
  const cardsContainer = document.getElementById('studentCardsContainer');
  if (cardsContainer) {
    cardsContainer.innerHTML = cardsList.join('');
  }
  updateRosterViewUI();
}

// Fee Month Selector inside Student Table Row
function handleStudentRowMonthChange(studentId, newMonth) {
  studentRowSelectedMonth[studentId] = newMonth;
  renderStudentsTable(currentStudents);
}

// Admin sets student's primary active billing period directly
async function setStudentTargetMonth(studentId, month) {
  try {
    const res = await fetch(`/api/students/${studentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ billingPeriod: month })
    });
    const json = await res.json();
    if (json.success) {
      showToast(`Primary billing month set to ${month}`, 'success');
      studentRowSelectedMonth[studentId] = month;
      await Promise.all([fetchStats(), fetchStudents()]);
    } else {
      showToast(json.error || 'Failed to update billing period', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Network error setting target month', 'error');
  }
}

// Copy link to clipboard
function copyPaymentLink(link) {
  navigator.clipboard.writeText(link).then(() => {
    showToast('Payment link copied!', 'success');
  }).catch(() => {
    prompt('Copy this link:', link);
  });
}

function copyUniversalLink() {
  const link = activeSecureParentUrl || `${window.location.origin}/pay`;
  navigator.clipboard.writeText(link).then(() => {
    showToast('Universal Parent Link copied to clipboard!', 'success');
  }).catch(() => {
    prompt('Copy this link:', link);
  });
}

function shareUniversalWhatsApp() {
  const link = activeSecureParentUrl || `${window.location.origin}/pay`;
  const bizName = currentSettings.businessName || 'School Bus Transport';
  const msg = `Dear Parents,\n\nPlease use our official transport portal to view your assigned bus number and pay this month's fee:\n👉 ${link}\n\n1. Open the link\n2. Select your Bus Number\n3. Tap your child's name & scan the QR code to pay\n\nThank you,\n${bizName}`;

  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
}

function sendWhatsApp(studentId) {
  const st = currentStudents.find(s => s.id === studentId);
  if (!st) return;

  const payLink = `${window.location.origin}/pay/${st.token}`;
  const sym = currentSettings.currencySymbol || '₹';
  const amountStr = `${sym}${st.amount}`;

  const msg = `Dear Parent, please find the bus fee link for ${st.name} (${st.busNumber}). Amount: ${amountStr}. Kindly pay securely here: ${payLink}`;
  const cleanPhone = (st.parentPhone || '').replace(/[^0-9]/g, '');
  const phoneParam = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

  const waUrl = `https://api.whatsapp.com/send?phone=${phoneParam}&text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
}

// ==========================================
// PAYMENT STATUS MODAL & ACTIONS
// ==========================================

function updateStatusModalFieldsForMonth(st, month) {
  const modal = document.getElementById('statusModal');
  if (!modal || !st) return;

  const months = (currentSettings.fyMonths && currentSettings.fyMonths.length) ? currentSettings.fyMonths : [
    "April 2026", "May 2026", "June 2026", "July 2026", "August 2026",
    "September 2026", "October 2026", "November 2026", "December 2026",
    "January 2027", "February 2027", "March 2027"
  ];
  const hist = st.monthlyHistory && st.monthlyHistory[month];
  const mIdx = months.indexOf(month);
  const pIdx = st.paidTill ? months.indexOf(st.paidTill) : months.indexOf("August 2026");
  const isPastCleared = !hist && pIdx >= mIdx && mIdx <= 4;

  let currentStatus = 'pending';
  if (hist && hist.status) {
    currentStatus = hist.status;
  } else if (isPastCleared) {
    currentStatus = 'paid';
  } else if (month === (st.billingPeriod || selectedActiveMonth)) {
    currentStatus = st.status || 'pending';
  }

  const radio = modal.querySelector(`input[name="paymentStatusOption"][value="${currentStatus}"]`);
  if (radio) {
    radio.checked = true;
  } else {
    const defaultRadio = modal.querySelector(`input[name="paymentStatusOption"][value="pending"]`);
    if (defaultRadio) defaultRadio.checked = true;
  }

  // Pre-fill payment method
  const methodSelect = document.getElementById('statusPaymentMethod');
  if (hist && hist.method) {
    methodSelect.value = hist.method;
  } else if (st.paymentApp) {
    methodSelect.value = st.paymentApp;
  } else if (currentStatus === 'paid') {
    methodSelect.value = 'Cash / Offline';
  } else {
    methodSelect.value = 'Google Pay';
  }

  document.getElementById('statusPayerInfo').value = (hist && hist.payerInfo) || st.payerInfo || st.parentName || '';
  document.getElementById('statusPaymentRef').value = (hist && hist.voucher) || st.paymentRef || '';
}

function handleStatusModalMonthChange() {
  const studentId = document.getElementById('statusModalStudentId').value;
  const month = document.getElementById('statusModalMonthSelect').value;
  const st = currentStudents.find(s => s.id === studentId);
  if (st && month) {
    updateStatusModalFieldsForMonth(st, month);
  }
}

function openStatusModal(id, defaultMonth = null) {
  const st = currentStudents.find(s => s.id === id);
  if (!st) return;

  const modal = document.getElementById('statusModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  document.getElementById('statusModalStudentId').value = st.id;
  document.getElementById('statusModalStudentName').textContent = st.name;
  document.getElementById('statusModalStudentSubtitle').textContent = `Bus ${st.busNumber || 'S3'} • ${st.routeStop || 'Route Stop'}`;
  document.getElementById('statusModalStudentMeta').textContent = `Class: ${st.classGrade || 'N/A'} • Bus: ${st.busNumber || 'S3'}`;

  const sym = currentSettings.currencySymbol || '₹';
  document.getElementById('statusModalStudentFee').textContent = `${sym}${Number(st.amount || 0).toLocaleString()}`;

  // Populate Month select
  const monthSelect = document.getElementById('statusModalMonthSelect');
  const pastDueHint = document.getElementById('statusModalPastDueHint');
  const months = (currentSettings.fyMonths && currentSettings.fyMonths.length) ? currentSettings.fyMonths : [
    "April 2026", "May 2026", "June 2026", "July 2026", "August 2026",
    "September 2026", "October 2026", "November 2026", "December 2026",
    "January 2027", "February 2027", "March 2027"
  ];
  const targetMonth = defaultMonth || (id && studentRowSelectedMonth[id]) || (st.dueDetails && st.dueDetails.targetMonth) || st.billingPeriod || selectedActiveMonth;
  if (monthSelect) {
    monthSelect.innerHTML = months.map(m => {
      const isTarget = m === targetMonth;
      return `<option value="${m}" ${isTarget ? 'selected' : ''}>${m} ${isTarget ? '(Selected)' : ''}</option>`;
    }).join('');
    monthSelect.value = targetMonth;
  }
  if (pastDueHint) {
    if (st.dueDetails && st.dueDetails.hasPastDue) {
      pastDueHint.classList.remove('hidden');
    } else {
      pastDueHint.classList.add('hidden');
    }
  }

  updateStatusModalFieldsForMonth(st, targetMonth);

  // Check for siblings
  const siblingBox = document.getElementById('statusSiblingBox');
  const siblingCheckbox = document.getElementById('statusUpdateSiblings');
  const siblingText = document.getElementById('statusSiblingText');

  if (st.siblingGroupId) {
    const siblings = currentStudents.filter(s => s.siblingGroupId === st.siblingGroupId && s.id !== st.id);
    if (siblings.length > 0) {
      siblingBox.classList.remove('hidden');
      siblingCheckbox.checked = true;
      siblingText.textContent = siblings.map(s => `${s.name} (${s.busNumber}) - Fee: ${sym}${Number(s.amount || 0).toLocaleString()}`).join(', ');
    } else {
      siblingBox.classList.add('hidden');
      siblingCheckbox.checked = false;
    }
  } else {
    siblingBox.classList.add('hidden');
    siblingCheckbox.checked = false;
  }
}

function closeStatusModal() {
  const modal = document.getElementById('statusModal');
  if (modal) modal.classList.add('hidden');
}

async function handleStatusSubmit(event) {
  event.preventDefault();
  const id = document.getElementById('statusModalStudentId').value;
  if (!id) return;

  const modal = document.getElementById('statusModal');
  const selectedRadio = modal.querySelector('input[name="paymentStatusOption"]:checked');
  const status = selectedRadio ? selectedRadio.value : 'pending';
  const paymentMethod = document.getElementById('statusPaymentMethod').value;
  const payerInfo = document.getElementById('statusPayerInfo').value.trim();
  const paymentRef = document.getElementById('statusPaymentRef').value.trim();
  const updateSiblings = document.getElementById('statusUpdateSiblings').checked;
  const monthSelect = document.getElementById('statusModalMonthSelect');
  const targetMonth = monthSelect ? monthSelect.value : selectedActiveMonth;

  const btn = document.getElementById('saveStatusBtn');
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const res = await fetch(`/api/students/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        paymentMethod: status === 'paid' ? paymentMethod : (status === 'submitted' ? paymentMethod : ''),
        payerInfo,
        paymentRef,
        updateSiblings,
        month: targetMonth
      })
    });

    const json = await res.json();
    if (json.success) {
      showToast(json.message || 'Payment status updated successfully!', 'success');
      closeStatusModal();
      await Promise.all([fetchStats(), fetchStudents()]);
    } else {
      showToast(json.error || 'Failed to update status', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Network error while updating status', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

// ==========================================
// FINANCIAL YEAR MONTH SELECTION
// ==========================================

function generateClientYears(currentFy) {
  // Only current and future financial years starting from 2026–2027 (no past financial years)
  const startYear = 2026;
  const match = (currentFy || "2026–2027").match(/(\d{4})/);
  const baseYear = match ? parseInt(match[1], 10) : 2026;
  const endYear = Math.max(baseYear + 35, 2060);
  const years = [];
  for (let y = startYear; y <= endYear; y++) {
    years.push(`${y}–${y + 1}`);
  }
  if (currentFy && !years.includes(currentFy)) {
    const m = (currentFy || '').match(/(\d{4})/);
    if (m && parseInt(m[1], 10) >= 2026) {
      years.push(currentFy);
      years.sort();
    }
  }
  return years;
}

function renderFinancialYearMonthSelector() {
  const fySelect = document.getElementById('financialYearSelect');
  if (fySelect) {
    const activeFy = currentSettings.financialYear || "2026–2027";
    const rawYears = (currentSettings.availableYears && currentSettings.availableYears.length)
      ? currentSettings.availableYears
      : generateClientYears(activeFy);

    // Strictly exclude any past financial years before 2026–2027
    const years = rawYears.filter(y => {
      const m = y.match(/(\d{4})/);
      return m && parseInt(m[1], 10) >= 2026;
    });

    if (!years.includes(activeFy)) {
      years.push(activeFy);
      years.sort();
    }

    const yearOptions = years.map(y => {
      return `<option value="${y}" ${y === activeFy ? 'selected' : ''}>${y}${y === "2026–2027" ? ' (Current)' : ''}</option>`;
    }).join('');

    fySelect.innerHTML = yearOptions + `
      <option value="__custom__" class="font-black text-indigo-700 bg-indigo-50">➕ Custom / Any Other Future Year...</option>
    `;
    fySelect.value = activeFy;
  }

  const months = (currentSettings.fyMonths && currentSettings.fyMonths.length) ? currentSettings.fyMonths : [
    "April 2026", "May 2026", "June 2026", "July 2026", "August 2026",
    "September 2026", "October 2026", "November 2026", "December 2026",
    "January 2027", "February 2027", "March 2027"
  ];

  const activeBillingSelect = document.getElementById('activeBillingMonthSelect');
  if (activeBillingSelect) {
    const currActive = currentSettings.activeMonth || selectedActiveMonth;
    activeBillingSelect.innerHTML = months.map(m => {
      return `<option value="${m}" ${m === currActive ? 'selected' : ''}>${m}</option>`;
    }).join('');
    activeBillingSelect.value = currActive;
  }

  const select = document.getElementById('monthFilterSelect');
  if (select) {
    select.innerHTML = months.map(m => {
      const isCurrent = m === selectedActiveMonth;
      return `<option value="${m}" ${isCurrent ? 'selected' : ''}>
        📅 ${m}${isCurrent ? ' (Viewing)' : ''}
      </option>`;
    }).join('');
    select.value = selectedActiveMonth;
  }

  const container = document.getElementById('fyMonthSelectorBar');
  if (container) {
    container.innerHTML = months.map(m => {
      const isCurrent = m === selectedActiveMonth;
      const parts = m.split(' ');
      const shortName = parts[0].substring(0, 3);
      const yr = parts[1] ? parts[1].slice(-2) : '';

      let badgeClass = "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200";
      if (isCurrent) {
        badgeClass = "bg-indigo-600 text-white font-black shadow-md ring-2 ring-indigo-400 border-indigo-600 scale-105";
      }

      return `
        <button type="button" onclick="selectMonthTab('${m}')" class="px-3 py-1.5 rounded-xl text-xs whitespace-nowrap border transition-all duration-150 flex items-center gap-1.5 ${badgeClass}">
          <span>${shortName}'${yr}</span>
          ${isCurrent ? `<span class="text-[10px] bg-white/30 px-1.5 py-0.5 rounded font-black">Active View</span>` : ''}
        </button>
      `;
    }).join('');
  }

  if (document.getElementById('currentActiveMonthDisplay')) {
    document.getElementById('currentActiveMonthDisplay').textContent = selectedActiveMonth;
  }
}

async function changeFinancialYear(newYear) {
  try {
    if (newYear === '__custom__') {
      const input = prompt("Enter any Financial / Academic Year (e.g. 2035–2036, 2035, or 2012–2013):", "");
      if (!input || !input.trim()) {
        renderFinancialYearMonthSelector();
        return;
      }
      const raw = input.trim();
      const matchRange = raw.match(/(\d{4})[^\d]+(\d{4})/);
      if (matchRange) {
        newYear = `${matchRange[1]}–${matchRange[2]}`;
      } else {
        const matchSingle = raw.match(/(\d{4})/);
        if (matchSingle) {
          const y1 = parseInt(matchSingle[1], 10);
          newYear = `${y1}–${y1 + 1}`;
        } else {
          alert("Please enter a valid 4-digit year (e.g. 2035 or 2035–2036)");
          renderFinancialYearMonthSelector();
          return;
        }
      }

      const yrCheck = newYear.match(/(\d{4})/);
      if (yrCheck && parseInt(yrCheck[1], 10) < 2026) {
        alert("Past financial years (before 2026–2027) are not allowed. Please enter 2026–2027 or a future year.");
        renderFinancialYearMonthSelector();
        return;
      }
    }

    const match = (newYear || "2026–2027").match(/(\d{4})[^\d]+(\d{4})/);
    let newActiveMonth = selectedActiveMonth;
    if (match) {
      const y1 = parseInt(match[1], 10);
      const y2 = parseInt(match[2], 10);
      const newMonths = [
        `April ${y1}`, `May ${y1}`, `June ${y1}`, `July ${y1}`, `August ${y1}`,
        `September ${y1}`, `October ${y1}`, `November ${y1}`, `December ${y1}`,
        `January ${y2}`, `February ${y2}`, `March ${y2}`
      ];
      if (!newMonths.includes(selectedActiveMonth)) {
        newActiveMonth = newMonths.includes(`September ${y1}`) ? `September ${y1}` : newMonths[0];
      }
    }
    showToast(`Switching Financial Year to ${newYear}...`, 'info');
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        financialYear: newYear,
        activeMonth: newActiveMonth
      })
    });
    const json = await res.json();
    if (json.success) {
      currentSettings = json.data;
      selectedActiveMonth = currentSettings.activeMonth || newActiveMonth;
      try {
        const url = new URL(window.location);
        url.searchParams.set('month', selectedActiveMonth);
        window.history.replaceState({}, '', url);
      } catch (e) {}
      renderFinancialYearMonthSelector();
      showToast(`Financial Year updated to ${newYear}`, 'success');
      await Promise.all([fetchStats(), fetchStudents()]);
    } else {
      showToast(json.error || 'Failed to update Financial Year', 'error');
    }
  } catch (err) {
    console.error('Failed to change financial year:', err);
    showToast('Failed to switch Financial Year', 'error');
  }
}
window.changeFinancialYear = changeFinancialYear;

async function changeActiveBillingMonth(newMonth) {
  try {
    showToast(`Setting Active Billing Month to ${newMonth}...`, 'info');
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeMonth: newMonth
      })
    });
    const json = await res.json();
    if (json.success) {
      currentSettings = json.data;
      selectedActiveMonth = newMonth;
      try {
        const url = new URL(window.location);
        url.searchParams.set('month', newMonth);
        window.history.replaceState({}, '', url);
      } catch (e) {}
      renderFinancialYearMonthSelector();
      showToast(`Active Billing Month set to ${newMonth}`, 'success');
      await Promise.all([fetchStats(), fetchStudents()]);
    } else {
      showToast(json.error || 'Failed to update Active Month', 'error');
    }
  } catch (err) {
    console.error('Failed to change active billing month:', err);
    showToast('Failed to change Active Billing Month', 'error');
  }
}
window.changeActiveBillingMonth = changeActiveBillingMonth;

async function selectMonthFilter(month) {
  await selectMonthTab(month);
}

async function selectMonthTab(month) {
  selectedActiveMonth = month;
  try {
    const url = new URL(window.location);
    url.searchParams.set('month', month);
    window.history.replaceState({}, '', url);
  } catch (e) {}
  renderFinancialYearMonthSelector();
  showToast(`Viewing fee roster for: ${month}`, 'info');
  await Promise.all([fetchStats(), fetchStudents()]);
}

// 1-Click "Mark All Paid Till August"
async function triggerMarkAllPaidTillAugust() {
  if (!confirm('Mark all students as PAID for all previous months (April to August 2026)?\n\nSeptember 2026 will remain the active due month.')) return;

  try {
    const res = await fetch('/api/students/mark-paid-till-august', { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showToast(json.message, 'success');
      await Promise.all([fetchStats(), fetchStudents()]);
    } else {
      showToast(json.error || 'Failed to update', 'error');
    }
  } catch (err) {
    showToast('Error marking past months as paid', 'error');
  }
}

// ==========================================
// CASH PAYMENT MODAL & ACTIONS
// ==========================================

function openCashModal(studentId = null, defaultMonth = null) {
  const modal = document.getElementById('cashModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  // Populate student dropdown
  const studentSelect = document.getElementById('cashStudentSelect');
  studentSelect.innerHTML = currentStudents.map(s => {
    return `<option value="${s.id}" ${studentId === s.id ? 'selected' : ''}>
      ${escapeHtml(s.name)} (Bus ${escapeHtml(s.busNumber || 'S3')}) - Fee: ₹${Number(s.amount || 0).toLocaleString()}
    </option>`;
  }).join('');

  // If specific student clicked, pre-select it
  if (studentId) {
    studentSelect.value = studentId;
  }

  const chosenMonth = defaultMonth || (studentId && studentRowSelectedMonth[studentId]) || null;

  // Populate FY months in cash month select
  const monthSelect = document.getElementById('cashMonthSelect');
  const months = (currentSettings.fyMonths && currentSettings.fyMonths.length) ? currentSettings.fyMonths : [
    "April 2026", "May 2026", "June 2026", "July 2026", "August 2026",
    "September 2026", "October 2026", "November 2026", "December 2026",
    "January 2027", "February 2027", "March 2027"
  ];
  monthSelect.innerHTML = months.map(m => {
    const isCurrent = chosenMonth ? m === chosenMonth : m === selectedActiveMonth;
    return `<option value="${m}" ${isCurrent ? 'selected' : ''}>${m} ${isCurrent ? '(Selected)' : ''}</option>`;
  }).join('');

  handleCashStudentChange(chosenMonth);
}

function closeCashModal() {
  const modal = document.getElementById('cashModal');
  if (!modal) return;
  modal.classList.add('hidden');
}

function handleCashStudentChange(defaultMonth = null) {
  const select = document.getElementById('cashStudentSelect');
  const studentId = select.value;
  const st = currentStudents.find(s => s.id === studentId);
  if (!st) return;

  const sym = currentSettings.currencySymbol || '₹';
  const feeAmount = Number(st.amount) || 2310;
  document.getElementById('cashAmountInput').value = feeAmount;

  // Auto-select target due month or passed defaultMonth in cash month select
  const targetMonth = defaultMonth || (studentId && studentRowSelectedMonth[studentId]) || (st.dueDetails && st.dueDetails.targetMonth) || st.billingPeriod || selectedActiveMonth;
  const monthSelect = document.getElementById('cashMonthSelect');
  if (monthSelect && targetMonth) {
    monthSelect.value = targetMonth;
  }

  // Handle prior due alert card in cash modal
  const cashDueAlert = document.getElementById('cashDueAlertCard');
  const cashDueAlertMonth = document.getElementById('cashDueAlertMonth');
  if (cashDueAlert && cashDueAlertMonth) {
    if (st.dueDetails && st.dueDetails.hasPastDue) {
      cashDueAlert.classList.remove('hidden');
      cashDueAlertMonth.textContent = st.dueDetails.targetMonth;
    } else {
      cashDueAlert.classList.add('hidden');
    }
  }

  // Update Student & Parent Info Card in Cash Modal
  const infoCard = document.getElementById('cashStudentInfoCard');
  if (infoCard) {
    const nameElem = document.getElementById('cashInfoStudentName');
    if (nameElem) nameElem.textContent = `${st.name} ${st.rollNo ? `(Roll #${st.rollNo})` : ''}`;
    const amountElem = document.getElementById('cashInfoAmountBadge');
    if (amountElem) amountElem.textContent = `${sym}${feeAmount.toLocaleString()}`;
    const parentElem = document.getElementById('cashInfoParentName');
    if (parentElem) parentElem.textContent = st.parentName || 'Parent / Guardian';
    const phoneElem = document.getElementById('cashInfoParentPhone');
    if (phoneElem) phoneElem.textContent = st.parentPhone || 'No phone recorded';
    const busElem = document.getElementById('cashInfoBusRoute');
    if (busElem) busElem.textContent = `Bus: ${st.busNumber || 'S3'} • Stop: ${st.routeStop || 'Main Gate'}`;
  }

  // Pre-fill parent payer info automatically
  const parentName = st.parentName ? st.parentName.trim() : 'Parent';
  document.getElementById('cashPayerNameInput').value = `Handed by ${parentName} (Parent)`;

  // Generate dynamic cash voucher
  const cleanMonth = (targetMonth || selectedActiveMonth || 'SEP').split(' ')[0].substring(0, 3).toUpperCase();
  document.getElementById('cashVoucherInput').value = `CASH-${cleanMonth}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Default collector to Admin
  const collectorSelect = document.getElementById('cashCollectorSelect');
  if (collectorSelect) {
    collectorSelect.value = 'Admin (Himanshu Walia)';
  }

  // Siblings
  const siblingBox = document.getElementById('cashSiblingBox');
  const siblingText = document.getElementById('cashSiblingText');
  const siblingCheckbox = document.getElementById('cashUpdateSiblings');

  if (st.siblingGroupId) {
    const siblings = currentStudents.filter(s => s.siblingGroupId === st.siblingGroupId && s.id !== st.id);
    if (siblings.length > 0) {
      siblingBox.classList.remove('hidden');
      siblingCheckbox.checked = true;
      const combinedTotal = (Number(st.amount) || 0) + siblings.reduce((sum, sib) => sum + (Number(sib.amount) || 0), 0);
      siblingText.textContent = `${siblings.map(s => s.name).join(', ')} (Family Total: ${sym}${combinedTotal.toLocaleString()})`;
    } else {
      siblingBox.classList.add('hidden');
      siblingCheckbox.checked = false;
    }
  } else {
    siblingBox.classList.add('hidden');
    siblingCheckbox.checked = false;
  }
}

async function handleCashSubmit(event) {
  event.preventDefault();
  const select = document.getElementById('cashStudentSelect');
  const studentId = select.value;
  if (!studentId) return;

  const amount = parseInt(document.getElementById('cashAmountInput').value, 10);
  const month = document.getElementById('cashMonthSelect').value;
  const collector = document.getElementById('cashCollectorSelect').value;
  const payerInfo = document.getElementById('cashPayerNameInput').value;
  const voucherNo = document.getElementById('cashVoucherInput').value;
  const updateSiblings = document.getElementById('cashUpdateSiblings').checked;

  const btn = document.getElementById('confirmCashBtn');
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const res = await fetch(`/api/students/${studentId}/cash-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        month,
        collector,
        payerInfo,
        voucherNo,
        updateSiblings
      })
    });

    const json = await res.json();
    if (json.success) {
      showToast(json.message || 'Cash payment recorded successfully!', 'success');
      closeCashModal();
      await Promise.all([fetchStats(), fetchStudents()]);
    } else {
      showToast(json.error || 'Failed to record cash payment', 'error');
    }
  } catch (err) {
    showToast('Network error recording cash payment', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

async function togglePaymentStatus(id) {
  try {
    const res = await fetch(`/api/students/${id}/toggle-status`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showToast(`Status updated to: ${json.data.status.toUpperCase()}`, 'success');
      fetchStats();
      fetchStudents();
    }
  } catch (err) {
    showToast('Failed to toggle status', 'error');
  }
}

// Dedicated Fixed Fee Editor Modal
function openFeeModal(id, name, currentAmount) {
  const modal = document.getElementById('feeModal');
  if (!modal) return;

  const st = currentStudents.find(s => s.id === id);
  const fee = Number(currentAmount !== undefined ? currentAmount : (st ? (st.fixedFee || st.amount) : 2310));

  document.getElementById('feeModalStudentId').value = id;
  document.getElementById('feeModalStudentName').textContent = name || (st ? st.name : 'Student');
  document.getElementById('feeModalStudentMeta').textContent = st 
    ? `Bus ${st.busNumber || 'S3'} • ${st.schoolName || 'Police DAV Public School'}`
    : 'School Bus Transportation';
  document.getElementById('feeModalCurrentFeeDisplay').textContent = `₹${fee.toLocaleString()}`;
  document.getElementById('feeModalAmountInput').value = fee;

  modal.classList.remove('hidden');
  setTimeout(() => {
    const input = document.getElementById('feeModalAmountInput');
    if (input) {
      input.focus();
      input.select();
    }
  }, 100);
}

function closeFeeModal() {
  const modal = document.getElementById('feeModal');
  if (modal) modal.classList.add('hidden');
}

function setFeePreset(val) {
  const input = document.getElementById('feeModalAmountInput');
  if (input) {
    input.value = val;
    input.focus();
  }
}

async function handleFeeModalSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('feeModalStudentId').value;
  const name = document.getElementById('feeModalStudentName').textContent;
  const raw = document.getElementById('feeModalAmountInput').value;
  const parsed = parseInt(raw.trim(), 10);

  if (isNaN(parsed) || parsed < 0) {
    showToast('Please enter a valid numeric fee amount', 'error');
    return;
  }

  const btn = document.getElementById('feeModalSaveBtn');
  const oldHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span>Saving...</span>';
  }

  try {
    const res = await fetch(`/api/students/${id}/fee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parsed })
    });
    const json = await res.json();
    if (json.success) {
      closeFeeModal();
      showToast(`Fixed fee for ${name} updated to ₹${parsed.toLocaleString()} for current & upcoming months!`, 'success');
      await Promise.all([fetchStats(), fetchStudents()]);
    } else {
      showToast(json.error || 'Failed to update fee', 'error');
    }
  } catch (err) {
    showToast('Error updating fee', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
    }
  }
}

// 1-Click Quick Fee Editor triggers the modal
function quickEditFee(id, name, currentAmount) {
  openFeeModal(id, name, currentAmount);
}

// ==========================================
// BUS FLEET MODAL (Primary Entity)
// ==========================================

function switchBusTab(tab) {
  const singleBtn = document.getElementById('tabBusSingleBtn');
  const bulkBtn = document.getElementById('tabBusBulkBtn');
  const singleSec = document.getElementById('busSingleTabSection');
  const bulkSec = document.getElementById('busBulkTabSection');

  if (tab === 'single') {
    singleBtn.className = 'py-2.5 px-4 border-b-2 font-bold text-xs border-amber-600 text-amber-900 flex items-center gap-1.5 transition';
    bulkBtn.className = 'py-2.5 px-4 border-b-2 font-bold text-xs border-transparent text-slate-500 hover:text-slate-700 flex items-center gap-1.5 transition';
    singleSec.classList.remove('hidden');
    bulkSec.classList.add('hidden');
  } else {
    bulkBtn.className = 'py-2.5 px-4 border-b-2 font-bold text-xs border-amber-600 text-amber-900 flex items-center gap-1.5 transition';
    singleBtn.className = 'py-2.5 px-4 border-b-2 font-bold text-xs border-transparent text-slate-500 hover:text-slate-700 flex items-center gap-1.5 transition';
    bulkSec.classList.remove('hidden');
    singleSec.classList.add('hidden');
  }
}

function openBusesModal() {
  const modal = document.getElementById('busesModal');
  if (modal) modal.classList.remove('hidden');
  renderBusesList();
}

function closeBusesModal() {
  const modal = document.getElementById('busesModal');
  if (modal) modal.classList.add('hidden');
}

function renderBusesList() {
  const container = document.getElementById('busesListContainer');
  if (!container) return;

  const countBadge = document.getElementById('busesModalFleetCount');
  if (countBadge) {
    countBadge.textContent = `${currentBuses.length} active bus${currentBuses.length === 1 ? '' : 'es'}`;
  }

  if (currentBuses.length === 0) {
    container.innerHTML = `<div class="text-xs text-slate-400 p-4 text-center">No buses in fleet yet. Add a single bus or import a bus list above.</div>`;
    return;
  }

  // Group buses by School Name
  const schoolsMap = new Map();
  // Ensure registered schools appear in order
  currentSchools.forEach(sch => {
    schoolsMap.set(sch.name, { school: sch, buses: [] });
  });

  currentBuses.forEach(b => {
    const schName = b.schoolName || 'Police DAV Public School';
    if (!schoolsMap.has(schName)) {
      schoolsMap.set(schName, { school: { name: schName }, buses: [] });
    }
    schoolsMap.get(schName).buses.push(b);
  });

  let html = '';
  schoolsMap.forEach(({ school, buses }, schName) => {
    const totalStudentsInSchool = buses.reduce((sum, b) => sum + (b.studentCount || 0), 0);
    html += `
      <div class="bg-slate-50/90 border-2 border-slate-200 rounded-2xl overflow-hidden shadow-xs mb-3">
        <!-- School Primary Head Header -->
        <div class="bg-gradient-to-r from-sky-100/90 via-blue-50 to-slate-100 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-xl">🏫</span>
            <div>
              <div class="text-xs font-black text-slate-900 tracking-wide flex items-center gap-1.5">
                <span>${escapeHtml(schName)}</span>
                ${school.code ? `<span class="text-[10px] font-mono font-bold bg-sky-200 text-sky-950 px-1.5 py-0.2 rounded">${escapeHtml(school.code)}</span>` : ''}
              </div>
              <div class="text-[10px] text-slate-500">School Head Organization</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
              🚌 ${buses.length} Bus${buses.length === 1 ? '' : 'es'}
            </span>
            <span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
              👥 ${totalStudentsInSchool} Students
            </span>
          </div>
        </div>

        <!-- Subordinate Buses List (Sub-heads) -->
        <div class="p-3 space-y-2">
          ${buses.length === 0 ? `
            <div class="text-[11px] text-slate-400 italic py-2.5 px-3 text-center bg-white rounded-xl border border-dashed border-slate-200">
              No buses registered under ${escapeHtml(schName)} yet. Use form above to add a bus under this school.
            </div>
          ` : buses.map(bus => `
            <div class="p-3 bg-white border border-slate-200 rounded-xl flex items-center justify-between shadow-2xs hover:border-amber-300 transition pl-3.5 relative overflow-hidden">
              <div class="absolute left-0 top-0 bottom-0 w-1 bg-amber-400"></div>
              <div>
                <div class="font-black text-amber-950 text-xs sm:text-sm flex items-center gap-2">
                  <span class="text-slate-400 text-xs font-mono">└──</span>
                  <span>🚌 Bus ${escapeHtml(bus.busNumber)}</span>
                  <span class="font-bold text-[11px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-200">
                    ${bus.studentCount || 0} students
                  </span>
                </div>
                <div class="text-xs text-slate-600 mt-1 pl-4 flex items-center gap-2 flex-wrap">
                  ${bus.route ? `<span>📍 Route: <strong>${escapeHtml(bus.route)}</strong></span>` : '<span class="text-slate-400 italic">No route specified</span>'}
                  ${bus.driverName ? `<span class="text-slate-400">•</span><span>👨‍✈️ Driver: <strong>${escapeHtml(bus.driverName)}</strong> (${escapeHtml(bus.driverPhone || 'No phone')})</span>` : ''}
                </div>
              </div>

              <div class="flex items-center gap-1.5 shrink-0">
                <button onclick="handleEditBus('${bus.id}', '${escapeHtml(bus.busNumber)}', '${escapeHtml(bus.route || '')}', '${escapeHtml(bus.schoolName || schName)}')" class="text-xs font-bold text-slate-700 hover:text-slate-950 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 transition cursor-pointer">
                  Edit
                </button>
                <button onclick="handleDeleteBus('${bus.id}', '${escapeHtml(bus.busNumber)}', ${bus.studentCount || 0})" class="text-xs font-bold text-rose-500 hover:text-rose-700 px-2 py-1 rounded-lg hover:bg-rose-50 transition cursor-pointer">
                  Delete
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

async function handleBulkAddBuses() {
  const schoolName = document.getElementById('bulkBusSchool')?.value.trim() || 'Police DAV Public School';
  const raw = document.getElementById('bulkBusesInput').value.trim();
  if (!raw) {
    showToast('Please enter or paste at least one bus in the box', 'error');
    return;
  }

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) {
    showToast('No valid bus lines found', 'error');
    return;
  }

  const busesToImport = [];
  lines.forEach(line => {
    // Format: BusNumber, Route, DriverName, Phone
    const parts = line.split(/[,;\t]/).map(p => p.trim());
    if (parts[0]) {
      busesToImport.push({
        busNumber: parts[0],
        schoolName,
        route: parts[1] || '',
        driverName: parts[2] || '',
        driverPhone: parts[3] || ''
      });
    }
  });

  if (busesToImport.length === 0) {
    showToast('Could not parse any buses from your list', 'error');
    return;
  }

  try {
    const res = await fetch('/api/buses/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buses: busesToImport, schoolName })
    });
    const json = await res.json();
    if (json.success) {
      showToast(json.message || `Successfully imported ${json.data.added.length} buses under ${schoolName}!`, 'success');
      document.getElementById('bulkBusesInput').value = '';
      await Promise.all([fetchBuses(), fetchSchools(), fetchStats(), fetchStudents()]);
      switchBusTab('single');
    } else {
      showToast(json.error || 'Failed to import bus list', 'error');
    }
  } catch (err) {
    console.error('Error importing buses:', err);
    showToast('Network error while importing bus list', 'error');
  }
}

async function handleAddBus() {
  const schoolName = document.getElementById('newBusSchool')?.value.trim() || 'Police DAV Public School';
  const busNumber = document.getElementById('newBusNumber').value.trim();
  const route = document.getElementById('newBusRoute').value.trim();
  const driverName = document.getElementById('newBusDriver').value.trim();
  const driverPhone = document.getElementById('newBusPhone').value.trim();

  if (!busNumber) {
    showToast('Please enter Bus Number', 'error');
    return;
  }

  try {
    const res = await fetch('/api/buses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ busNumber, schoolName, route, driverName, driverPhone })
    });
    const json = await res.json();
    if (json.success) {
      showToast(`Bus ${busNumber} added under ${schoolName}!`, 'success');
      document.getElementById('newBusNumber').value = '';
      document.getElementById('newBusRoute').value = '';
      document.getElementById('newBusDriver').value = '';
      document.getElementById('newBusPhone').value = '';
      await Promise.all([fetchBuses(), fetchSchools(), fetchStats(), fetchStudents()]);
    } else {
      showToast(json.error || 'Failed to add bus', 'error');
    }
  } catch (err) {
    showToast('Error adding bus', 'error');
  }
}

async function handleEditBus(id, currentNumber, currentRoute, currentSchool) {
  const newNumber = prompt(`Edit Bus Number:`, currentNumber);
  if (!newNumber || newNumber.trim() === '') return;

  const newRoute = prompt(`Edit Route / Stops:`, currentRoute);
  const newSchool = prompt(`Edit Parent School:`, currentSchool || 'Police DAV Public School');

  try {
    const res = await fetch(`/api/buses/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        busNumber: newNumber.trim(),
        route: newRoute !== null ? newRoute.trim() : currentRoute,
        schoolName: newSchool !== null ? newSchool.trim() : currentSchool
      })
    });
    const json = await res.json();
    if (json.success) {
      showToast(`Bus updated to ${newNumber}!`, 'success');
      await Promise.all([fetchBuses(), fetchSchools(), fetchStats(), fetchStudents()]);
    } else {
      showToast(json.error || 'Failed to update bus', 'error');
    }
  } catch (err) {
    showToast('Error updating bus', 'error');
  }
}

async function handleDeleteBus(id, busNumber, studentCount) {
  if (studentCount > 0) {
    alert(`Cannot delete "${busNumber}" because it currently has ${studentCount} student(s) assigned. Please reassign the students first.`);
    return;
  }

  if (!confirm(`Delete bus "${busNumber}"?`)) return;

  try {
    const res = await fetch(`/api/buses/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      showToast('Bus removed', 'success');
      await Promise.all([fetchBuses(), fetchSchools(), fetchStats(), fetchStudents()]);
    } else {
      showToast(json.error || 'Failed to delete bus', 'error');
    }
  } catch (err) {
    showToast('Error deleting bus', 'error');
  }
}

// ==========================================
// SCHOOLS MANAGEMENT MODAL
// ==========================================

function openSchoolsModal() {
  document.getElementById('schoolsModal').classList.remove('hidden');
  resetSchoolForm();
  renderSchoolsList();
}

function closeSchoolsModal() {
  document.getElementById('schoolsModal').classList.add('hidden');
}

function renderSchoolsList() {
  const container = document.getElementById('schoolsListContainer');
  const countBadge = document.getElementById('schoolsModalCount');
  if (!container) return;

  if (countBadge) countBadge.textContent = `${currentSchools.length} school${currentSchools.length !== 1 ? 's' : ''}`;

  if (!currentSchools || currentSchools.length === 0) {
    container.innerHTML = `<div class="text-xs text-slate-400 py-4 text-center">No schools added yet. Add your first school above.</div>`;
    return;
  }

  container.innerHTML = currentSchools.map(s => {
    const count = s.studentCount || 0;
    return `
      <div class="p-3 bg-white border border-slate-200 rounded-xl hover:border-sky-300 transition flex items-center justify-between gap-3 shadow-2xs">
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-extrabold text-slate-800 text-xs">${escapeHtml(s.name)}</span>
            ${s.code ? `<span class="px-1.5 py-0.2 rounded bg-sky-100 text-sky-800 font-mono text-[10px] font-black border border-sky-200">${escapeHtml(s.code)}</span>` : ''}
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${count > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}">
              ${count} student${count !== 1 ? 's' : ''}
            </span>
          </div>
          <div class="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
            ${s.address ? `<span>📍 ${escapeHtml(s.address)}</span>` : ''}
            ${s.phone ? `<span>📞 ${escapeHtml(s.phone)}</span>` : ''}
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button type="button" onclick="editSchool('${s.id}')" class="px-2.5 py-1 text-xs font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition cursor-pointer">
            Edit
          </button>
          <button type="button" onclick="deleteSchoolAction('${s.id}', '${escapeHtml(s.name).replace(/'/g, "\\'")}', ${count})" class="px-2.5 py-1 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition cursor-pointer">
            Delete
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function resetSchoolForm() {
  document.getElementById('schoolEditId').value = '';
  document.getElementById('newSchoolName').value = '';
  document.getElementById('newSchoolCode').value = '';
  document.getElementById('newSchoolAddress').value = '';
  document.getElementById('newSchoolPhone').value = '';
  document.getElementById('schoolFormTitle').textContent = 'Add New School';
  document.getElementById('saveSchoolBtnText').textContent = 'Add School';
  const cancelBtn = document.getElementById('cancelSchoolEditBtn');
  if (cancelBtn) cancelBtn.classList.add('hidden');
}

function editSchool(id) {
  const s = currentSchools.find(sch => sch.id === id);
  if (!s) return;
  document.getElementById('schoolEditId').value = s.id;
  document.getElementById('newSchoolName').value = s.name || '';
  document.getElementById('newSchoolCode').value = s.code || '';
  document.getElementById('newSchoolAddress').value = s.address || '';
  document.getElementById('newSchoolPhone').value = s.phone || '';
  document.getElementById('schoolFormTitle').textContent = `Edit School: ${s.name}`;
  document.getElementById('saveSchoolBtnText').textContent = 'Update School';
  const cancelBtn = document.getElementById('cancelSchoolEditBtn');
  if (cancelBtn) cancelBtn.classList.remove('hidden');
  document.getElementById('newSchoolName').focus();
}

async function handleSchoolSubmit() {
  const editId = document.getElementById('schoolEditId').value;
  const name = document.getElementById('newSchoolName').value.trim();
  const code = document.getElementById('newSchoolCode').value.trim().toUpperCase();
  const address = document.getElementById('newSchoolAddress').value.trim();
  const phone = document.getElementById('newSchoolPhone').value.trim();

  if (!name) {
    showToast('School name is required', 'error');
    return;
  }

  const isEdit = !!editId;
  const url = isEdit ? `/api/schools/${editId}` : '/api/schools';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code, address, phone })
    });
    const json = await res.json();
    if (json.success) {
      showToast(isEdit ? `School "${name}" updated!` : `School "${name}" added!`, 'success');
      resetSchoolForm();
      await fetchSchools();
      await Promise.all([fetchStats(), fetchStudents()]);
    } else {
      showToast(json.error || 'Failed to save school', 'error');
    }
  } catch (err) {
    showToast('Error saving school', 'error');
  }
}

async function deleteSchoolAction(id, name, studentCount) {
  if (studentCount > 0) {
    alert(`Cannot delete "${name}" because it currently has ${studentCount} student(s) enrolled. Please reassign the students to another school first.`);
    return;
  }

  if (!confirm(`Are you sure you want to remove school "${name}"?`)) return;

  try {
    const res = await fetch(`/api/schools/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      showToast(`School "${name}" deleted`, 'success');
      await fetchSchools();
      await Promise.all([fetchStats(), fetchStudents()]);
    } else {
      showToast(json.error || 'Failed to delete school', 'error');
    }
  } catch (err) {
    showToast('Error deleting school', 'error');
  }
}

// ==========================================
// STUDENT MODAL: ADD / EDIT
// ==========================================

function openStudentModal(isEdit = false) {
  document.getElementById('studentModal').classList.remove('hidden');
  if (!isEdit) {
    document.getElementById('modalStudentTitle').textContent = 'Add New Student';
    document.getElementById('modalSaveBtn').textContent = 'Save Student';
    document.getElementById('studentId').value = '';
    document.getElementById('studentForm').reset();
    document.getElementById('modalBusNumber').value = 'Bus #01';
    document.getElementById('modalBillingPeriod').value = 'September 2026';
    document.getElementById('modalStatus').value = 'pending';
    if (document.getElementById('modalSchoolSelect') && currentSchools.length > 0) {
      const defaultSchool = selectedSchool || currentSchools[0].name;
      document.getElementById('modalSchoolSelect').value = defaultSchool;
      handleModalSchoolSelectChange();
    }
    if (document.getElementById('modalServiceStatus')) {
      document.getElementById('modalServiceStatus').value = 'active';
      handleModalServiceStatusChange('active');
    }
  }
}

function closeStudentModal() {
  document.getElementById('studentModal').classList.add('hidden');
}

function handleModalServiceStatusChange(val) {
  const details = document.getElementById('modalDepartureDetails');
  const monthSelect = document.getElementById('modalLeftFromMonth');
  if (!details) return;

  if (val === 'left') {
    details.classList.remove('hidden');
    if (monthSelect && (!monthSelect.children || monthSelect.children.length === 0)) {
      const fyMonths = (currentSettings.fyMonths && currentSettings.fyMonths.length) ? currentSettings.fyMonths : [
        "April 2026", "May 2026", "June 2026", "July 2026", "August 2026",
        "September 2026", "October 2026", "November 2026", "December 2026",
        "January 2027", "February 2027", "March 2027"
      ];
      monthSelect.innerHTML = fyMonths.map(m => `
        <option value="${m}" ${m === selectedActiveMonth ? 'selected' : ''}>📅 ${m}</option>
      `).join('');
    }
  } else {
    details.classList.add('hidden');
  }
}

function editStudent(id) {
  const st = currentStudents.find(s => s.id === id);
  if (!st) return;

  openStudentModal(true);
  document.getElementById('modalStudentTitle').textContent = `Edit Student: ${st.name}`;
  document.getElementById('modalSaveBtn').textContent = 'Update Student & Bus';
  document.getElementById('studentId').value = st.id;

  document.getElementById('modalStudentName').value = st.name || '';
  document.getElementById('modalRouteStop').value = st.routeStop || '';
  document.getElementById('modalClassGrade').value = st.classGrade || '';
  
  const schSelect = document.getElementById('modalSchoolSelect');
  const schInput = document.getElementById('modalSchoolName');
  const targetSchool = st.schoolName || 'Police DAV Public School';
  if (schSelect) {
    const hasOpt = Array.from(schSelect.options).some(o => o.value === targetSchool);
    if (hasOpt) {
      schSelect.value = targetSchool;
      if (schInput) {
        schInput.value = targetSchool;
        schInput.classList.add('hidden');
      }
    } else {
      schSelect.value = '__custom__';
      if (schInput) {
        schInput.value = targetSchool;
        schInput.classList.remove('hidden');
      }
    }
  }

  // Populate buses strictly for this school and select current bus
  updateModalBusSelectForSchool(targetSchool, st.busNumber || 'S3');

  document.getElementById('modalAmount').value = st.fixedFee !== undefined ? st.fixedFee : (st.amount || 2310);
  document.getElementById('modalBillingPeriod').value = st.billingPeriod || 'September 2026';
  document.getElementById('modalParentName').value = st.parentName || '';
  document.getElementById('modalParentPhone').value = st.parentPhone || '';
  document.getElementById('modalStatus').value = st.status || 'pending';
  
  if (document.getElementById('modalServiceStatus')) {
    document.getElementById('modalServiceStatus').value = st.serviceStatus || 'active';
    handleModalServiceStatusChange(st.serviceStatus || 'active');
    if (document.getElementById('modalLeftFromMonth')) {
      document.getElementById('modalLeftFromMonth').value = st.leftFromMonth || selectedActiveMonth;
    }
    if (document.getElementById('modalLeftReason')) {
      document.getElementById('modalLeftReason').value = st.leftReason || '';
    }
  }
  document.getElementById('modalNotes').value = st.notes || '';
}

async function handleStudentSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('studentId').value;
  const isEdit = !!id;

  const busNumber = document.getElementById('modalBusNumber').value.trim() || document.getElementById('modalBusSelect').value || 'S3';
  const name = document.getElementById('modalStudentName').value.trim();
  const amount = parseInt(document.getElementById('modalAmount').value, 10);
  const isLeftChoice = document.getElementById('modalServiceStatus')?.value === 'left';

  if (!name) {
    showToast('Student name is required', 'error');
    return;
  }

  const schoolChoice = document.getElementById('modalSchoolSelect')?.value;
  const customSchool = document.getElementById('modalSchoolName')?.value.trim();
  const schoolName = (schoolChoice === '__custom__' ? customSchool : schoolChoice) || customSchool || 'Police DAV Public School';

  const payload = {
    name,
    busNumber,
    routeStop: document.getElementById('modalRouteStop').value.trim(),
    classGrade: document.getElementById('modalClassGrade').value.trim(),
    schoolName,
    amount: isNaN(amount) ? 2310 : amount,
    billingPeriod: document.getElementById('modalBillingPeriod').value || 'September 2026',
    parentName: document.getElementById('modalParentName').value.trim(),
    parentPhone: document.getElementById('modalParentPhone').value.trim(),
    status: document.getElementById('modalStatus').value || 'pending',
    serviceStatus: isLeftChoice ? 'left' : 'active',
    leftFromMonth: isLeftChoice ? (document.getElementById('modalLeftFromMonth')?.value || selectedActiveMonth) : null,
    leftReason: isLeftChoice ? (document.getElementById('modalLeftReason')?.value.trim() || 'Discontinued service') : '',
    notes: document.getElementById('modalNotes').value.trim()
  };

  const btn = document.getElementById('modalSaveBtn');
  const oldText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const url = isEdit ? `/api/students/${id}` : '/api/students';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();

    if (json.success) {
      closeStudentModal();
      showToast(isEdit ? `Student "${name}" updated successfully!` : `Student "${name}" added successfully!`, 'success');
      await Promise.all([fetchBuses(), fetchStats(), fetchStudents()]);
    } else {
      showToast(json.error || 'Failed to save student', 'error');
    }
  } catch (err) {
    console.error('Error saving student:', err);
    showToast('Network error while saving student', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = oldText;
  }
}

async function deleteStudent(id, name) {
  if (!confirm(`Are you sure you want to remove student "${name}"?`)) return;

  try {
    const res = await fetch(`/api/students/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      showToast('Student deleted', 'success');
      await Promise.all([fetchBuses(), fetchStats(), fetchStudents()]);
    } else {
      showToast(json.error || 'Failed to delete student', 'error');
    }
  } catch (err) {
    showToast('Error deleting student', 'error');
  }
}

// ==========================================
// STOP BUS SERVICE / STUDENT LEFT MODAL
// ==========================================

function openStopFeeManagerModal(preselectedStudentId = null) {
  const modal = document.getElementById('stopServiceModal');
  if (!modal) return;

  // Always reset to action tab
  switchStopModalTab('action');

  // Populate active students in stopStudentSelect dropdown
  const select = document.getElementById('stopStudentSelect');
  if (select) {
    const activeStudents = currentStudents
      .filter(s => s.serviceStatus !== 'left')
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    select.innerHTML = '<option value="">-- Choose a student from roster --</option>' +
      activeStudents.map(st => {
        return `<option value="${st.id}">${escapeHtml(st.name)} (Class: ${escapeHtml(st.classGrade || 'N/A')}, Bus: ${escapeHtml(st.busNumber || 'N/A')})</option>`;
      }).join('');

    if (preselectedStudentId) {
      if (activeStudents.some(s => s.id === preselectedStudentId)) {
        select.value = preselectedStudentId;
      } else {
        const anySt = currentStudents.find(s => s.id === preselectedStudentId);
        if (anySt) {
          select.innerHTML = `<option value="${anySt.id}">${escapeHtml(anySt.name)}</option>` + select.innerHTML;
          select.value = anySt.id;
        }
      }
    }
  }

  // Populate FY departure months
  const monthSelect = document.getElementById('stopFromMonthSelect');
  if (monthSelect) {
    const fyMonths = (currentSettings.fyMonths && currentSettings.fyMonths.length) ? currentSettings.fyMonths : [
      "April 2026", "May 2026", "June 2026", "July 2026", "August 2026",
      "September 2026", "October 2026", "November 2026", "December 2026",
      "January 2027", "February 2027", "March 2027"
    ];

    const activeIdx = fyMonths.indexOf(selectedActiveMonth);
    const defaultStopMonth = (activeIdx !== -1 && activeIdx + 1 < fyMonths.length)
      ? fyMonths[activeIdx + 1]
      : selectedActiveMonth;

    monthSelect.innerHTML = fyMonths.map(m => {
      const isSelected = m === defaultStopMonth;
      return `<option value="${m}" ${isSelected ? 'selected' : ''}>📅 ${m}</option>`;
    }).join('');
  }

  const reasonPreset = document.getElementById('stopReasonPreset');
  if (reasonPreset) reasonPreset.value = '';
  const reasonInput = document.getElementById('stopReasonInput');
  if (reasonInput) reasonInput.value = '';

  // Trigger preview card update
  handleStopStudentSelectChange();

  // Update left students count & list tab
  updateLeftStudentsModalList();

  modal.classList.remove('hidden');
}

function openStopServiceModal(studentId) {
  openStopFeeManagerModal(studentId);
}

function closeStopServiceModal() {
  const modal = document.getElementById('stopServiceModal');
  if (modal) modal.classList.add('hidden');
}

function switchStopModalTab(tab) {
  const btnAction = document.getElementById('stopTabBtnAction');
  const btnList = document.getElementById('stopTabBtnList');
  const formAction = document.getElementById('stopServiceForm');
  const listView = document.getElementById('stopModalListView');

  if (tab === 'list') {
    if (btnList) btnList.className = 'px-4 py-2 text-xs font-black border-b-2 border-rose-600 text-rose-700 transition flex items-center gap-1.5 cursor-pointer';
    if (btnAction) btnAction.className = 'px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition flex items-center gap-1.5 cursor-pointer';
    if (formAction) formAction.classList.add('hidden');
    if (listView) listView.classList.remove('hidden');
    updateLeftStudentsModalList();
  } else {
    if (btnAction) btnAction.className = 'px-4 py-2 text-xs font-black border-b-2 border-rose-600 text-rose-700 transition flex items-center gap-1.5 cursor-pointer';
    if (btnList) btnList.className = 'px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition flex items-center gap-1.5 cursor-pointer';
    if (formAction) formAction.classList.remove('hidden');
    if (listView) listView.classList.add('hidden');
  }
}

function handleStopStudentSelectChange() {
  const select = document.getElementById('stopStudentSelect');
  const studentId = select ? select.value : '';
  const st = currentStudents.find(s => s.id === studentId);

  const hiddenId = document.getElementById('stopStudentId');
  const nameEl = document.getElementById('stopInfoStudentName');
  const feeEl = document.getElementById('stopInfoMonthlyFee');
  const parentNameEl = document.getElementById('stopInfoParentName');
  const parentPhoneEl = document.getElementById('stopInfoParentPhone');
  const busRouteEl = document.getElementById('stopInfoBusRoute');
  const alertCard = document.getElementById('stopPriorDuesAlert');
  const alertText = document.getElementById('stopPriorDuesText');

  if (!st) {
    resetStopStudentCard();
    return;
  }

  if (hiddenId) hiddenId.value = st.id;
  if (nameEl) nameEl.textContent = `${st.name} ${st.classGrade ? `(Class ${st.classGrade})` : ''}`;
  if (feeEl) feeEl.textContent = `₹${Number(st.amount || 0).toLocaleString()}/mo`;
  if (parentNameEl) parentNameEl.textContent = st.parentName || 'Parent';
  if (parentPhoneEl) parentPhoneEl.textContent = st.parentPhone || 'No Phone';
  if (busRouteEl) busRouteEl.textContent = `${st.busNumber || 'Bus'} • ${st.routeStop || 'Stop'}`;

  // Prior dues alert check
  if (alertCard && alertText) {
    const hasDues = st.hasPastDue || (st.dueDetails && st.dueDetails.hasPastDue);
    if (hasDues) {
      const oldestMonth = (st.dueDetails && st.dueDetails.oldestDueMonth) || 'earlier month';
      alertText.textContent = `Student has unpaid dues for ${oldestMonth} prior to departure. Under transport ledger rules, unpaid prior dues remain collectible until paid. Upcoming months from your selected departure month will have zero fee obligation.`;
      alertCard.classList.remove('hidden');
    } else {
      alertCard.classList.add('hidden');
    }
  }
}

function resetStopStudentCard() {
  const hiddenId = document.getElementById('stopStudentId');
  if (hiddenId) hiddenId.value = '';
  const nameEl = document.getElementById('stopInfoStudentName');
  if (nameEl) nameEl.textContent = 'Please select a student above';
  const feeEl = document.getElementById('stopInfoMonthlyFee');
  if (feeEl) feeEl.textContent = '₹0/mo';
  const parentNameEl = document.getElementById('stopInfoParentName');
  if (parentNameEl) parentNameEl.textContent = '-';
  const parentPhoneEl = document.getElementById('stopInfoParentPhone');
  if (parentPhoneEl) parentPhoneEl.textContent = '-';
  const busRouteEl = document.getElementById('stopInfoBusRoute');
  if (busRouteEl) busRouteEl.textContent = '-';
  const alertCard = document.getElementById('stopPriorDuesAlert');
  if (alertCard) alertCard.classList.add('hidden');
}

function updateLeftStudentsModalList() {
  const leftStudents = currentStudents.filter(s => s.serviceStatus === 'left');

  const badge = document.getElementById('stopModalLeftBadge');
  if (badge) badge.textContent = leftStudents.length;

  const container = document.getElementById('modalLeftStudentsContainer');
  if (!container) return;

  if (leftStudents.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
        <span class="text-3xl block mb-1">🚌</span>
        <p class="text-xs font-bold text-slate-600">All registered students are currently active bus users.</p>
        <p class="text-[11px] text-slate-400 mt-0.5">When you stop fees for any student, they will appear here with an instant 1-click reactivate option.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = leftStudents.map(st => {
    return `
      <div class="p-3.5 bg-slate-50 border border-slate-200 hover:border-rose-300 rounded-2xl flex items-center justify-between transition gap-3">
        <div class="space-y-0.5 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-extrabold text-slate-900 text-xs sm:text-sm">${escapeHtml(st.name)}</span>
            <span class="text-[10px] font-black text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-300">🛑 Left from ${escapeHtml(st.leftFromMonth || 'N/A')}</span>
            ${st.classGrade ? `<span class="text-[10px] font-semibold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">${escapeHtml(st.classGrade)}</span>` : ''}
          </div>
          <div class="text-[11px] text-slate-500 flex items-center gap-2 flex-wrap">
            <span>🚌 ${escapeHtml(st.busNumber || 'Bus')}</span>
            <span>• 📍 ${escapeHtml(st.routeStop || 'Stop')}</span>
            <span>• 👨‍👩‍👧 ${escapeHtml(st.parentPhone || '')}</span>
          </div>
          ${st.leftReason ? `<div class="text-[10px] text-slate-500 italic">Reason: ${escapeHtml(st.leftReason)}</div>` : ''}
          ${st.hasPastDue ? `<div class="text-[10px] font-black text-amber-700">⚠️ Prior unpaid dues remain in ledger</div>` : ''}
        </div>

        <button onclick="reactivateStudent('${st.id}', '${escapeHtml(st.name)}')" class="shrink-0 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-xs transition flex items-center gap-1 cursor-pointer" title="Reactivate bus transport service">
          <span>✓</span> Reactivate
        </button>
      </div>
    `;
  }).join('');
}

function handleStopReasonPreset(val) {
  const input = document.getElementById('stopReasonInput');
  if (val && !input.value) {
    input.value = val;
  }
}

async function handleStopServiceSubmit(event) {
  event.preventDefault();
  const id = document.getElementById('stopStudentId').value;
  if (!id) {
    showToast('Please select a student from the dropdown first', 'warning');
    return;
  }

  const leftFromMonth = document.getElementById('stopFromMonthSelect').value;
  const reasonPreset = document.getElementById('stopReasonPreset').value;
  const reasonInput = document.getElementById('stopReasonInput').value.trim();
  const reason = reasonInput || reasonPreset || 'Left transport service';

  const btn = document.getElementById('confirmStopBtn');
  const oldHtml = btn.innerHTML;
  btn.disabled = true;
  btn.textContent = 'Stopping Fee...';

  try {
    const res = await fetch(`/api/students/${id}/stop-service`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leftFromMonth, reason })
    });
    const json = await res.json();
    if (json.success) {
      showToast(json.message || `Transport fees stopped starting from ${leftFromMonth}`, 'success');
      closeStopServiceModal();
      await Promise.all([fetchStats(), fetchStudents()]);
    } else {
      showToast(json.error || 'Failed to stop fees', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Network error while stopping fees', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = oldHtml;
  }
}

async function reactivateStudent(studentId, studentName) {
  if (!confirm(`Reactivate bus transport service for "${studentName}"?\n\nThis will resume active transport status and restore standard monthly fee obligations.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/students/${studentId}/reactivate-service`, {
      method: 'POST'
    });
    const json = await res.json();
    if (json.success) {
      showToast(`Student "${studentName}" reactivated successfully!`, 'success');
      await Promise.all([fetchStats(), fetchStudents()]);
      updateLeftStudentsModalList();
    } else {
      showToast(json.error || 'Failed to reactivate student', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('Network error while reactivating student', 'error');
  }
}

// ==========================================
// BANK ACCOUNT SETTINGS MODAL
// ==========================================

function openBankModal() {
  const modal = document.getElementById('bankModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  const bName = currentSettings.bankName || 'YES Bank';
  const bHolder = currentSettings.bankAccountName || currentSettings.upiPayeeName || 'HIMANSHU WALIA';
  const bAcc = currentSettings.bankAccountNumber || '14610100012345';
  const bIfsc = currentSettings.bankIfsc || 'YESB0000146';
  const bType = currentSettings.bankAccountType || 'Current Account';
  const bBranch = currentSettings.bankBranch || 'Civil Lines / City Branch';

  if (document.getElementById('bankNameInput')) document.getElementById('bankNameInput').value = bName;
  if (document.getElementById('bankAccountNameInput')) document.getElementById('bankAccountNameInput').value = bHolder;
  if (document.getElementById('bankAccountNumberInput')) document.getElementById('bankAccountNumberInput').value = bAcc;
  if (document.getElementById('bankIfscInput')) document.getElementById('bankIfscInput').value = bIfsc;
  if (document.getElementById('bankAccountTypeInput')) document.getElementById('bankAccountTypeInput').value = bType;
  if (document.getElementById('bankBranchInput')) document.getElementById('bankBranchInput').value = bBranch;

  updateBankModalPreview();
}

function closeBankModal() {
  const modal = document.getElementById('bankModal');
  if (modal) modal.classList.add('hidden');
}

function updateBankModalPreview() {
  const name = document.getElementById('bankNameInput')?.value || currentSettings.bankName || 'YES Bank';
  const holder = document.getElementById('bankAccountNameInput')?.value || currentSettings.bankAccountName || 'HIMANSHU WALIA';
  const acc = document.getElementById('bankAccountNumberInput')?.value || currentSettings.bankAccountNumber || '14610100012345';
  const ifsc = (document.getElementById('bankIfscInput')?.value || currentSettings.bankIfsc || 'YESB0000146').toUpperCase();
  const type = document.getElementById('bankAccountTypeInput')?.value || currentSettings.bankAccountType || 'Current Account';
  const branch = document.getElementById('bankBranchInput')?.value || currentSettings.bankBranch || 'Civil Lines / City Branch';

  if (document.getElementById('bankPreviewName')) document.getElementById('bankPreviewName').textContent = name;
  if (document.getElementById('bankPreviewHolder')) document.getElementById('bankPreviewHolder').textContent = holder;
  if (document.getElementById('bankPreviewAcc')) document.getElementById('bankPreviewAcc').textContent = acc;
  if (document.getElementById('bankPreviewIfsc')) document.getElementById('bankPreviewIfsc').textContent = ifsc;
  if (document.getElementById('bankPreviewType')) document.getElementById('bankPreviewType').textContent = `${type} • ${branch}`;
}

async function handleBankSubmit(e) {
  e.preventDefault();
  const bankName = document.getElementById('bankNameInput')?.value?.trim();
  const bankAccountName = document.getElementById('bankAccountNameInput')?.value?.trim();
  const bankAccountNumber = document.getElementById('bankAccountNumberInput')?.value?.trim();
  const bankIfsc = document.getElementById('bankIfscInput')?.value?.trim()?.toUpperCase();
  const bankAccountType = document.getElementById('bankAccountTypeInput')?.value?.trim() || 'Current Account';
  const bankBranch = document.getElementById('bankBranchInput')?.value?.trim() || '';

  if (!bankName || !bankAccountName || !bankAccountNumber || !bankIfsc) {
    showToast('Please fill all mandatory bank fields (Bank, Name, A/C No, IFSC)', 'warning');
    return;
  }

  const payload = {
    bankName,
    bankAccountName,
    bankAccountNumber,
    bankIfsc,
    bankAccountType,
    bankBranch
  };

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.success) {
      currentSettings = json.data;
      closeBankModal();
      showToast('Official School Transport Bank Account updated successfully!', 'success');
      fetchSettings();
    } else {
      showToast(json.error || 'Failed to update bank details', 'error');
    }
  } catch (err) {
    console.error('Error saving bank details:', err);
    showToast('Network error saving bank details', 'error');
  }
}

// ==========================================
// SETTINGS MODAL
// ==========================================

function openSettingsModal() {
  document.getElementById('settingsModal').classList.remove('hidden');
  document.getElementById('settingsUpiId').value = currentSettings.upiId || 'himanshu1461@ptyes';
  document.getElementById('settingsBusinessName').value = currentSettings.businessName || 'RAM RAM JI TRANSPORT';
  const propInput = document.getElementById('settingsProprietorName');
  if (propInput) propInput.value = currentSettings.proprietorName || 'LALIT KUMAR WALIA';
  document.getElementById('settingsOwnerPhone').value = currentSettings.ownerPhone || '';

  // Update QR Scanner display
  const qrImg = document.getElementById('settingsQrPreview');
  if (qrImg) {
    qrImg.src = (currentSettings.scannerImage || '/scanner.png') + '?t=' + Date.now();
  }
  const qrBadge = document.getElementById('qrTypeBadge');
  if (qrBadge) {
    const isCustom = currentSettings.scannerImage && currentSettings.scannerImage !== '/scanner.png';
    qrBadge.textContent = isCustom ? 'Custom QR Active' : 'Official QR';
    qrBadge.className = isCustom 
      ? 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 border border-indigo-300'
      : 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300';
  }
  const statusSpan = document.getElementById('qrUploadStatus');
  if (statusSpan) statusSpan.textContent = '';

  // Admin Credentials
  const usernameInput = document.getElementById('settingsAdminUsername');
  const newPasswordInput = document.getElementById('settingsAdminNewPassword');
  if (usernameInput) usernameInput.value = currentSettings.adminUsername || 'admin';
  if (newPasswordInput) newPasswordInput.value = '';
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
}

async function handleQrUpload(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    showToast('Please select a valid image file (PNG, JPG, WEBP)', 'error');
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    showToast('Image file size must be less than 10MB', 'error');
    return;
  }

  const statusSpan = document.getElementById('qrUploadStatus');
  if (statusSpan) statusSpan.textContent = 'Uploading QR code...';

  const reader = new FileReader();
  reader.onload = async function(e) {
    const base64Data = e.target.result;
    try {
      showToast('Uploading new QR code image...', 'info');
      const res = await fetch('/api/settings/upload-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Data })
      });
      const json = await res.json();
      if (json.success) {
        currentSettings = json.data;
        const newImgUrl = json.scannerImage + '?t=' + Date.now();
        if (document.getElementById('settingsQrPreview')) {
          document.getElementById('settingsQrPreview').src = newImgUrl;
        }
        const qrBadge = document.getElementById('qrTypeBadge');
        if (qrBadge) {
          qrBadge.textContent = 'Custom QR Active';
          qrBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 border border-indigo-300';
        }
        if (statusSpan) statusSpan.textContent = '✓ Updated';
        showToast('QR Code updated successfully! Active on Parent Portal.', 'success');
      } else {
        showToast(json.error || 'Failed to upload QR code', 'error');
        if (statusSpan) statusSpan.textContent = 'Upload failed';
      }
    } catch (err) {
      console.error('QR upload error:', err);
      showToast('Error uploading QR code', 'error');
      if (statusSpan) statusSpan.textContent = 'Upload error';
    }
  };
  reader.readAsDataURL(file);
}
window.handleQrUpload = handleQrUpload;

async function resetQrToGenerated() {
  if (!confirm('Reset QR code back to standard official QR code?')) return;
  try {
    showToast('Resetting QR code...', 'info');
    const res = await fetch('/api/settings/reset-qr', { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      currentSettings = json.data;
      if (document.getElementById('settingsQrPreview')) {
        document.getElementById('settingsQrPreview').src = '/scanner.png?t=' + Date.now();
      }
      const qrBadge = document.getElementById('qrTypeBadge');
      if (qrBadge) {
        qrBadge.textContent = 'Official QR';
        qrBadge.className = 'text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300';
      }
      const statusSpan = document.getElementById('qrUploadStatus');
      if (statusSpan) statusSpan.textContent = '✓ Default QR active';
      showToast('QR Code reset to default official scanner', 'success');
    } else {
      showToast(json.error || 'Failed to reset QR code', 'error');
    }
  } catch (err) {
    showToast('Error resetting QR code', 'error');
  }
}
window.resetQrToGenerated = resetQrToGenerated;

async function handleSettingsSubmit(e) {
  e.preventDefault();
  const payload = {
    upiId: document.getElementById('settingsUpiId').value.trim(),
    businessName: document.getElementById('settingsBusinessName').value.trim(),
    proprietorName: document.getElementById('settingsProprietorName') ? document.getElementById('settingsProprietorName').value.trim() : (currentSettings.proprietorName || 'LALIT KUMAR WALIA'),
    upiPayeeName: currentSettings.upiPayeeName || 'HIMANSHU  WALIA',
    ownerPhone: document.getElementById('settingsOwnerPhone').value.trim()
  };

  const adminUsername = document.getElementById('settingsAdminUsername') ? document.getElementById('settingsAdminUsername').value.trim() : '';
  const adminNewPassword = document.getElementById('settingsAdminNewPassword') ? document.getElementById('settingsAdminNewPassword').value.trim() : '';

  if (adminUsername) {
    payload.adminUsername = adminUsername;
  }
  if (adminNewPassword) {
    payload.adminPassword = adminNewPassword;
  }

  try {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.success) {
      currentSettings = json.data;
      document.getElementById('brandTitle').textContent = currentSettings.businessName;
      closeSettingsModal();
      showToast('Settings & Credentials saved successfully!', 'success');
      fetchSettings();
    } else {
      showToast(json.error || 'Failed to save settings', 'error');
    }
  } catch (err) {
    showToast('Error saving settings', 'error');
  }
}

async function handleLogout() {
  if (!confirm('Are you sure you want to sign out of the Admin Portal?')) return;
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {}
  localStorage.removeItem('admin_token');
  window.location.href = '/login';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `pointer-events-auto px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold flex items-center gap-2 transform transition-all duration-300 translate-y-2 opacity-0 ${
    type === 'success' ? 'bg-emerald-800 text-white shadow-emerald-900/20' :
    type === 'error' ? 'bg-rose-800 text-white shadow-rose-900/20' :
    'bg-slate-800 text-white shadow-slate-900/20'
  }`;

  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `<span class="w-5 h-5 rounded-full bg-white/20 inline-flex items-center justify-center text-xs font-bold">${icon}</span> ${escapeHtml(message)}`;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
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

// ==========================================
// SIBLING CLUBBING MODAL & ACTIONS
// ==========================================

let clubModalPreselectedId = null;

function openClubSiblingsModal(preselectedStudentId = null) {
  clubModalPreselectedId = preselectedStudentId;
  const modal = document.getElementById('clubSiblingsModal');
  if (!modal) return;

  document.getElementById('clubGroupNameInput').value = '';
  document.getElementById('clubSearchStudentInput').value = '';
  modal.classList.remove('hidden');

  renderClubStudentsList();
}

function openClubModalForSingleStudent(studentId) {
  openClubSiblingsModal(studentId);
}

function closeClubSiblingsModal() {
  const modal = document.getElementById('clubSiblingsModal');
  if (modal) modal.classList.add('hidden');
  clubModalPreselectedId = null;
}

function renderClubStudentsList() {
  const container = document.getElementById('clubStudentsCheckboxList');
  if (!container) return;

  const query = (document.getElementById('clubSearchStudentInput').value || '').toLowerCase().trim();

  const filtered = currentStudents.filter(s => {
    if (!query) return true;
    return s.name.toLowerCase().includes(query) || (s.busNumber && s.busNumber.toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-400 p-3 text-center">No students matching search</div>';
    updateClubSelectedCount();
    return;
  }

  container.innerHTML = filtered.map(st => {
    const isChecked = clubModalPreselectedId === st.id;
    return `
      <label class="flex items-center justify-between p-2 rounded-lg hover:bg-indigo-50/50 cursor-pointer border border-transparent hover:border-indigo-200 transition">
        <div class="flex items-center gap-2.5">
          <input type="checkbox" name="clubStudentCheckbox" value="${st.id}" ${isChecked ? 'checked' : ''} onchange="updateClubSelectedCount()" class="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500">
          <div>
            <div class="text-xs font-bold text-slate-800">${escapeHtml(st.name)}</div>
            <div class="text-[10px] text-slate-500">🚌 ${escapeHtml(st.busNumber)} • ₹${st.amount} ${st.siblingGroupId ? `• <span class="text-indigo-600 font-semibold">${escapeHtml(st.siblingGroupName || 'Clubbed')}</span>` : ''}</div>
          </div>
        </div>
        <span class="text-xs font-black text-slate-700">₹${st.amount}</span>
      </label>
    `;
  }).join('');

  updateClubSelectedCount();
}

function filterClubStudentsList() {
  renderClubStudentsList();
}

function updateClubSelectedCount() {
  const checkboxes = document.querySelectorAll('input[name="clubStudentCheckbox"]:checked');
  const badge = document.getElementById('clubSelectedCount');
  if (badge) {
    badge.textContent = `${checkboxes.length} selected`;
  }
}

async function executeClubSiblings() {
  const checked = Array.from(document.querySelectorAll('input[name="clubStudentCheckbox"]:checked')).map(cb => cb.value);
  if (checked.length < 2) {
    alert('Please select at least 2 students to club together.');
    return;
  }

  const groupName = document.getElementById('clubGroupNameInput').value.trim();

  try {
    const res = await fetch('/api/students/club', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentIds: checked,
        groupName: groupName || undefined
      })
    });
    const json = await res.json();

    if (json.success) {
      showToast(`✓ Successfully clubbed ${json.data.students.length} siblings!`, 'success');
      closeClubSiblingsModal();
      await fetchStudents();
    } else {
      showToast(json.error || 'Failed to club siblings', 'error');
    }
  } catch (err) {
    showToast('Network error while clubbing siblings', 'error');
  }
}

async function unclubStudentAction(studentId, name) {
  if (!confirm(`Remove ${name} from their sibling group?`)) return;

  try {
    const res = await fetch(`/api/students/${studentId}/unclub`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showToast(`Removed ${name} from sibling group`, 'info');
      await fetchStudents();
    } else {
      showToast(json.error || 'Failed to unclub student', 'error');
    }
  } catch (err) {
    showToast('Network error while unclubbing student', 'error');
  }
}

// ==========================================
// AWAITING PAYMENT APPROVAL / REJECTION
// ==========================================

async function approvePayment(studentId, studentName, specificMonth = null) {
  const st = currentStudents.find(s => s.id === studentId);
  const targetMonth = specificMonth || (studentId && studentRowSelectedMonth[studentId]) || st?.awaitingVerificationMonth || st?.billingPeriod || (st?.dueDetails && st?.dueDetails.targetMonth) || selectedActiveMonth;

  if (!confirm(`Verify and approve payment for ${studentName} for ${targetMonth}?\n\n✓ This will mark the fee as PAID for ${targetMonth} and unlock the official stamped receipt on the parent's phone.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/students/${studentId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: targetMonth })
    });
    const json = await res.json();
    if (json.success) {
      delete studentRowSelectedMonth[studentId];
      playSuccessChime();
      showToast(json.message || `✓ Payment for ${studentName} (${targetMonth}) verified & approved!`, 'success');
      await Promise.all([fetchStats(), fetchStudents()]);
    } else {
      showToast(json.error || 'Failed to approve payment', 'error');
    }
  } catch (err) {
    console.error('Error approving payment:', err);
    showToast('Network error while approving payment', 'error');
  }
}

async function rejectPayment(studentId, studentName, specificMonth = null) {
  const st = currentStudents.find(s => s.id === studentId);
  const targetMonth = specificMonth || (studentId && studentRowSelectedMonth[studentId]) || st?.awaitingVerificationMonth || st?.billingPeriod || selectedActiveMonth;
  const reason = prompt(
    `Reject unverified payment for ${studentName} (${targetMonth})?\n\nEnter explanation (will be shown to parent):`,
    'Payment not detected in bank account. Please re-check UPI transaction or contact transport office.'
  );
  if (reason === null) return; // Cancelled

  try {
    const res = await fetch(`/api/students/${studentId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, month: targetMonth })
    });
    const json = await res.json();
    if (json.success) {
      delete studentRowSelectedMonth[studentId];
      showToast(json.message || `Payment for ${studentName} marked unverified.`, 'warning');
      await Promise.all([fetchStats(), fetchStudents()]);
    } else {
      showToast(json.error || 'Failed to reject payment', 'error');
    }
  } catch (err) {
    console.error('Error rejecting payment:', err);
    showToast('Network error while rejecting payment', 'error');
  }
}

// ==========================================
// MOBILE PHONE & WI-FI ACCESS MODAL HANDLERS
// ==========================================
let cachedNetworkInfo = null;

async function openWifiModal() {
  const modal = document.getElementById('wifiModal');
  if (!modal) return;
  modal.classList.remove('hidden');

  try {
    const res = await fetch('/api/network-info');
    cachedNetworkInfo = await res.json();
    if (cachedNetworkInfo && cachedNetworkInfo.success) {
      const qrImg = document.getElementById('wifiQrImage');
      const secureParentEl = document.getElementById('secureParentUrlText');
      const wifiParentEl = document.getElementById('wifiParentUrlText');

      if (qrImg) qrImg.src = cachedNetworkInfo.qrDataUrl;
      if (secureParentEl) {
        secureParentEl.textContent = cachedNetworkInfo.secureParentUrl || cachedNetworkInfo.parentUrl;
      }
      if (wifiParentEl) {
        wifiParentEl.textContent = cachedNetworkInfo.wifiParentUrl;
      }
      const wifiAdminEl = document.getElementById('wifiAdminUrlText');
      if (wifiAdminEl) {
        wifiAdminEl.textContent = cachedNetworkInfo.wifiAdminUrl || (window.location.origin + '/');
      }
      activeSecureParentUrl = cachedNetworkInfo.secureParentUrl;
    }
  } catch (err) {
    console.error('Error loading mobile network info:', err);
  }
}

function closeWifiModal() {
  const modal = document.getElementById('wifiModal');
  if (modal) modal.classList.add('hidden');
}

function copySecureParentLink() {
  const text = document.getElementById('secureParentUrlText')?.textContent;
  if (text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('🔒 Official Secure HTTPS Parent Link copied! Zero mobile warnings.', 'success');
    }).catch(() => {
      showToast(text, 'info');
    });
  }
}

function copyWifiParentLink() {
  const text = document.getElementById('wifiParentUrlText')?.textContent;
  if (text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Parent Local Wi-Fi Link copied!');
    }).catch(() => {
      showToast(text, 'info');
    });
  }
}

function copyWifiAdminLink() {
  const text = document.getElementById('wifiAdminUrlText')?.textContent;
  if (text) {
    navigator.clipboard.writeText(text).then(() => {
      showToast('Admin Link copied to clipboard!');
    }).catch(() => {
      showToast(text, 'info');
    });
  }
}

// ==========================================
// MONTHLY REPORT EXPORT (CSV / EXCEL)
// ==========================================

async function downloadMonthlyReportCsv() {
  try {
    const month = selectedActiveMonth || 'September 2026';
    showToast(`Preparing ${month} report...`, 'info');

    const busNumber = document.getElementById('busFilter') ? document.getElementById('busFilter').value : '';
    const status = document.getElementById('statusFilter') ? document.getElementById('statusFilter').value : '';
    const search = document.getElementById('searchInput') ? document.getElementById('searchInput').value.trim() : '';

    const params = new URLSearchParams();
    params.append('month', month);
    if (busNumber) params.append('busNumber', busNumber);
    if (status) params.append('status', status);
    if (search) params.append('search', search);
    if (selectedSchool) params.append('school', selectedSchool);

    const token = localStorage.getItem('admin_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api/reports/monthly/csv?${params.toString()}`, { headers });
    if (!res.ok) {
      throw new Error(`Server status ${res.status}`);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeMonth = month.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeDate = new Date().toISOString().slice(0, 10);
    a.download = `RAM_RAM_JI_Transport_Report_${safeMonth}_${safeDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showToast(`Monthly report for ${month} downloaded successfully!`, 'success');
  } catch (err) {
    console.warn('Falling back to client-side CSV export:', err);
    downloadMonthlyReportCsvClientFallback();
  }
}

function downloadMonthlyReportCsvClientFallback() {
  try {
    const month = selectedActiveMonth || 'September 2026';
    const students = [...(currentStudents || [])];
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
        st.paymentRef || (status === 'paid' ? `CLEARED-${month.replace(/\s+/g, '-').toUpperCase()}` : '-'),
        paidDateStr || '-',
        st.payerInfo || '-'
      ].map(escapeCsv).join(',');
    });

    const csvContent = '\uFEFF' + [
      escapeCsv(`RAM RAM JI TRANSPORT - Monthly School Bus Transport & Fee Report`),
      escapeCsv(`Proprietor: ${currentSettings.proprietorName || 'LALIT KUMAR WALIA'} | Support: ${currentSettings.ownerName || 'Himanshu Walia'} (${currentSettings.ownerPhone || '+91 98141 24392'})`),
      escapeCsv(`Report Month: ${month} | Generated: ${new Date().toLocaleString('en-IN')} | Total Students: ${students.length}`),
      escapeCsv(`Summary: Total Expected: Rs. ${totalFixed} | Collected: Rs. ${totalPaid} (${countPaid} paid) | Pending: Rs. ${totalPending} (${countPending} unpaid)`),
      '',
      headers.map(escapeCsv).join(','),
      ...rows,
      '',
      ['TOTALS', '', '', '', '', '', '', '', '', totalFixed, totalPaid, `${countPaid} Paid / ${countPending} Pending`, '', '', '', ''].map(escapeCsv).join(',')
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeMonth = month.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeDate = new Date().toISOString().slice(0, 10);
    a.download = `RAM_RAM_JI_Transport_Report_${safeMonth}_${safeDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    showToast(`Monthly report for ${month} downloaded!`, 'success');
  } catch (e) {
    showToast('Failed to export CSV: ' + e.message, 'error');
  }
}
