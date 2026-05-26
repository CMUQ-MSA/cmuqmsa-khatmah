/**
 * Khatmah - CMU-Q MSA Premium
 * Quran reading companion. All state in appState; never read from DOM for progress.
 */

/* ============ CONSTANTS ============ */
const JUZ_PER_KHATMAH = 30;
const RAMADAN_DAYS = 30;
const PAGES_IN_QURAN = 604;
const RAMADAN_MONTH = 9;
const MIN_CUSTOM_DAYS = 1;
const MAX_CUSTOM_DAYS = 365;
const MIN_TARGET_KHATMAHS = 1;
const MAX_TARGET_KHATMAHS = 10;
const MIN_HIJRI_OFFSET = -29;
const MAX_HIJRI_OFFSET = 29;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const JUZ_PAGE_RANGES = [
    [1, 21], [22, 41], [42, 61], [62, 81], [82, 101], [102, 120], [121, 141], [142, 161], [162, 181], [182, 200],
    [201, 221], [222, 241], [242, 261], [262, 281], [282, 301], [302, 321], [322, 341], [342, 361], [362, 381], [382, 401],
    [402, 421], [422, 441], [442, 461], [462, 481], [482, 501], [502, 521], [522, 541], [542, 561], [562, 581], [582, 604],
];

const STORAGE_KEYS = {
    targetKhatmahs: 'khatmah_target_khatmahs',
    scheduleMode: 'khatmah_schedule_mode',
    planDay: 'khatmah_plan_day',
    hijriOffset: 'khatmah_hijri_offset',
    customStartDate: 'khatmah_custom_start',
    customDuration: 'khatmah_custom_duration',
    completedDaysLegacy: 'khatmah_completed_days',
};

/* ============ APP STATE (Single Source of Truth) ============ */
const appState = {
    targetKhatmahs: 1,
    scheduleMode: 'ramadan',
    planDay: 1,
    hijriOffset: 0,
    customStartDate: '',
    customDurationDays: 30,
    customDayOverride: null,
};

let completedDays = [];

// Derived (computed from appState + Hijri, never from DOM)
let currentDay = 1;
let inRamadan = false;
let viewingDay = 1;
let customBeforeStart = false;
let daysUntilCustomStart = 0;

/* ============ DOM REFERENCES ============ */
let carousel, carouselInner, progressText, progressCompleted, progressBarFill;
let dayStepperLabel, hijriDayDisplay, hijriMinus, hijriPlus;
let khatmahInput, khatmahMinus, khatmahPlus;
let outsideBanner, headerSubtitle;
let modeRamadanBtn, modeCustomBtn, customPanel, customStartInput, customFinishBy;
let dayStepperRow, controlsBar, customPlanStatus;
let customDurationDisplay, customDurationMinus, customDurationPlus;
let srAnnouncer;

/* ============ SR ANNOUNCER ============ */
let lastAnnouncedMessage = '';
let announceTimer = null;
function announce(message) {
    if (!srAnnouncer || !message) return;
    if (message === lastAnnouncedMessage) return;
    if (announceTimer) clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
        srAnnouncer.textContent = '';
        srAnnouncer.textContent = message;
        lastAnnouncedMessage = message;
    }, 250);
}

/* ============ HIJRI DATE ============ */
function getHijriDate(date = new Date()) {
    try {
        const formatter = new Intl.DateTimeFormat('en-SA-u-ca-islamic-umalqura', {
            year: 'numeric', month: 'numeric', day: 'numeric',
        });
        const parts = formatter.formatToParts(date);
        const obj = {};
        parts.forEach((p) => { obj[p.type] = parseInt(p.value, 10); });
        return { year: obj.year, month: obj.month, day: obj.day };
    } catch (e) {
        return null;
    }
}

function getFormattedHijriDate() {
    try {
        return new Intl.DateTimeFormat('en-SA-u-ca-islamic-umalqura', {
            day: 'numeric', month: 'long', year: 'numeric',
        }).format(new Date());
    } catch (e) {
        return null;
    }
}

let daysUntilRamadanCache = { iso: null, days: null };
function getDaysUntilRamadan(fromDate = new Date()) {
    const iso = toISODate(fromDate);
    if (daysUntilRamadanCache.iso === iso) return daysUntilRamadanCache.days;
    let result = null;
    for (let i = 0; i <= 365; i++) {
        const d = new Date(fromDate);
        d.setDate(d.getDate() + i);
        const h = getHijriDate(d);
        if (h?.month === RAMADAN_MONTH && h.day === 1) {
            result = i;
            break;
        }
    }
    daysUntilRamadanCache = { iso, days: result };
    return result;
}

function toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parseISODate(iso) {
    if (typeof iso !== 'string' || !ISO_DATE_RE.test(iso)) return null;
    const [y, m, d] = iso.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (Number.isNaN(date.getTime())) return null;
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return date;
}

function isValidISODate(iso) {
    return parseISODate(iso) !== null;
}

function daysBetween(startIso, endDate = new Date()) {
    const start = parseISODate(startIso);
    if (!start) return 0;
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    return Math.round((end - start) / 86400000);
}

function defaultCustomStartDate() {
    return toISODate(new Date());
}

function parseIntSafe(value, fallback) {
    if (value == null) return fallback;
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : fallback;
}

function clampInt(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
}

/* ============ MODE HELPERS ============ */
function isRamadanMode() {
    return appState.scheduleMode === 'ramadan';
}

function getScheduleLength() {
    return isRamadanMode() ? RAMADAN_DAYS : appState.customDurationDays;
}

function ramadanCompletedKey(year) {
    return `khatmah_completed_ramadan_${year}`;
}

function ramadanPreviewCompletedKey(year) {
    return `khatmah_completed_ramadan_preview_${year}`;
}

function customCompletedKey() {
    if (!isValidISODate(appState.customStartDate)) return null;
    return `khatmah_completed_custom_${appState.customStartDate}_${appState.customDurationDays}`;
}

function getCurrentHijriMonth() {
    const hijri = getHijriDate();
    return hijri?.month ?? null;
}

function getRamadanYear() {
    const hijri = getHijriDate();
    return hijri?.year ?? new Date().getFullYear();
}

function activeCompletedKey() {
    if (isRamadanMode()) {
        const inRamadanNow = getCurrentHijriMonth() === RAMADAN_MONTH;
        return inRamadanNow
            ? ramadanCompletedKey(getRamadanYear())
            : ramadanPreviewCompletedKey(getRamadanYear());
    }
    return customCompletedKey();
}

let activeCompletedKeyMemo = null;

function loadCompletedDays() {
    const len = getScheduleLength();
    activeCompletedKeyMemo = activeCompletedKey();
    try {
        const key = activeCompletedKeyMemo;
        if (!key) {
            completedDays = [];
            return;
        }
        const raw = localStorage.getItem(key);
        if (raw) {
            completedDays = JSON.parse(raw).filter((n) => Number.isInteger(n) && n >= 1 && n <= len);
            return;
        }
        if (isRamadanMode() && getCurrentHijriMonth() === RAMADAN_MONTH) {
            const legacy = localStorage.getItem(STORAGE_KEYS.completedDaysLegacy);
            if (legacy) {
                completedDays = JSON.parse(legacy).filter((n) => Number.isInteger(n) && n >= 1 && n <= RAMADAN_DAYS);
                localStorage.setItem(key, JSON.stringify(completedDays));
                localStorage.removeItem(STORAGE_KEYS.completedDaysLegacy);
                return;
            }
        }
        completedDays = [];
    } catch (e) {
        completedDays = [];
    }
}

function saveCompletedDays() {
    try {
        const key = activeCompletedKey();
        if (!key) return;
        localStorage.setItem(key, JSON.stringify(completedDays));
    } catch (e) {}
}

function updateInRamadan() {
    const hijri = getHijriDate();
    inRamadan = hijri?.month === RAMADAN_MONTH;
}

function updateCurrentDay() {
    updateInRamadan();
    const len = getScheduleLength();

    if (isRamadanMode()) {
        customBeforeStart = false;
        if (inRamadan) {
            const hijri = getHijriDate();
            currentDay = Math.max(1, Math.min(RAMADAN_DAYS, (hijri?.day ?? 1) + appState.hijriOffset));
        } else {
            currentDay = Math.max(1, Math.min(RAMADAN_DAYS, appState.planDay));
        }
        return;
    }

    const daysSince = daysBetween(appState.customStartDate);
    customBeforeStart = daysSince < 0;
    daysUntilCustomStart = customBeforeStart ? -daysSince : 0;

    if (customBeforeStart) {
        if (appState.customDayOverride != null) {
            currentDay = Math.max(1, Math.min(len, appState.customDayOverride));
        } else {
            currentDay = 1;
        }
        return;
    }

    appState.customDayOverride = null;
    currentDay = Math.max(1, Math.min(len, daysSince + 1));
}

/* ============ SCHEDULE CALCULATION ============ */
function pageToJuz(page) {
    const p = clampInt(page, 1, PAGES_IN_QURAN);
    for (let i = 0; i < JUZ_PAGE_RANGES.length; i++) {
        const [start, end] = JUZ_PAGE_RANGES[i];
        if (p >= start && p <= end) return i + 1;
    }
    return JUZ_PER_KHATMAH;
}

function buildSchedule(totalDays) {
    const totalPagesAll = PAGES_IN_QURAN * appState.targetKhatmahs;
    const schedule = [];

    let prevCumEnd = 0;
    for (let d = 1; d <= totalDays; d++) {
        let cumEnd = Math.floor(d * totalPagesAll / totalDays);
        if (cumEnd <= prevCumEnd) cumEnd = prevCumEnd + 1;
        if (cumEnd > totalPagesAll) cumEnd = totalPagesAll;

        const pageStartAbs = prevCumEnd + 1;
        const pageEndAbs = cumEnd;

        const khatmahStart = Math.ceil(pageStartAbs / PAGES_IN_QURAN);
        const khatmahEnd = Math.ceil(pageEndAbs / PAGES_IN_QURAN);
        const isMilestone = pageEndAbs % PAGES_IN_QURAN === 0;

        const pageStartWithin = ((pageStartAbs - 1) % PAGES_IN_QURAN) + 1;
        const pageEndWithin = ((pageEndAbs - 1) % PAGES_IN_QURAN) + 1;
        const juzStart = pageToJuz(pageStartWithin);
        const juzEnd = pageToJuz(pageEndWithin);

        schedule.push({
            day: d,
            pageStart: pageStartWithin,
            pageEnd: pageEndWithin,
            juzStart,
            juzEnd,
            khatmahStart,
            khatmahEnd,
            khatmahNumber: khatmahEnd,
            isMilestone,
        });
        prevCumEnd = cumEnd;
    }
    return schedule;
}

function formatJuzRange(row) {
    if (row.khatmahStart !== row.khatmahEnd) {
        return `Juz' ${row.juzStart}-${JUZ_PER_KHATMAH}, 1-${row.juzEnd}`;
    }
    return row.juzStart === row.juzEnd ? `Juz' ${row.juzStart}` : `Juz' ${row.juzStart}-${row.juzEnd}`;
}

function formatPageRange(row) {
    if (row.khatmahStart !== row.khatmahEnd) {
        return `pp.${row.pageStart}-${PAGES_IN_QURAN}, 1-${row.pageEnd}`;
    }
    return row.pageStart === row.pageEnd ? `p.${row.pageStart}` : `pp.${row.pageStart}-${row.pageEnd}`;
}

function formatKhatmahLabel(row) {
    if (row.khatmahStart !== row.khatmahEnd) {
        return `Khatmah ${row.khatmahStart}\u2192${row.khatmahEnd}`;
    }
    return `Khatmah ${row.khatmahNumber}`;
}

function formatFinishDate() {
    const start = parseISODate(appState.customStartDate);
    if (!start) return '—';
    start.setDate(start.getDate() + appState.customDurationDays - 1);
    return start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ============ PERSISTENCE ============ */
function loadState() {
    try {
        appState.targetKhatmahs = clampInt(
            parseIntSafe(localStorage.getItem(STORAGE_KEYS.targetKhatmahs), appState.targetKhatmahs),
            MIN_TARGET_KHATMAHS, MAX_TARGET_KHATMAHS,
        );

        const mode = localStorage.getItem(STORAGE_KEYS.scheduleMode);
        if (mode === 'ramadan' || mode === 'custom') appState.scheduleMode = mode;

        appState.planDay = clampInt(
            parseIntSafe(localStorage.getItem(STORAGE_KEYS.planDay), appState.planDay),
            1, RAMADAN_DAYS,
        );

        appState.hijriOffset = clampInt(
            parseIntSafe(localStorage.getItem(STORAGE_KEYS.hijriOffset), appState.hijriOffset),
            MIN_HIJRI_OFFSET, MAX_HIJRI_OFFSET,
        );

        const start = localStorage.getItem(STORAGE_KEYS.customStartDate);
        appState.customStartDate = isValidISODate(start) ? start : defaultCustomStartDate();

        appState.customDurationDays = clampCustomDuration(
            parseIntSafe(localStorage.getItem(STORAGE_KEYS.customDuration), appState.customDurationDays),
        );

        if (getCurrentHijriMonth() === RAMADAN_MONTH) appState.scheduleMode = 'ramadan';

        loadCompletedDays();
    } catch (e) {}
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEYS.targetKhatmahs, String(appState.targetKhatmahs));
        localStorage.setItem(STORAGE_KEYS.scheduleMode, appState.scheduleMode);
        localStorage.setItem(STORAGE_KEYS.planDay, String(appState.planDay));
        localStorage.setItem(STORAGE_KEYS.hijriOffset, String(appState.hijriOffset));
        localStorage.setItem(STORAGE_KEYS.customStartDate, appState.customStartDate);
        localStorage.setItem(STORAGE_KEYS.customDuration, String(appState.customDurationDays));
        saveCompletedDays();
    } catch (e) {}
}

/* ============ STATE ACTIONS ============ */
function setTargetKhatmahs(value) {
    const prev = appState.targetKhatmahs;
    appState.targetKhatmahs = clampInt(value, MIN_TARGET_KHATMAHS, MAX_TARGET_KHATMAHS);
    if (appState.targetKhatmahs !== prev) {
        announce(`${appState.targetKhatmahs} khatmah${appState.targetKhatmahs === 1 ? '' : 's'}`);
    }
    saveState();
    render();
}

function setScheduleMode(mode) {
    if (mode !== 'ramadan' && mode !== 'custom') return;
    if (appState.scheduleMode === mode) return;
    appState.scheduleMode = mode;
    appState.customDayOverride = null;
    loadCompletedDays();
    updateCurrentDay();
    viewingDay = currentDay;
    saveState();
    render();
    scrollToDay(currentDay);
    announce(mode === 'ramadan' ? 'Ramadan plan' : 'Custom schedule');
}

function adjustDayStepper(delta) {
    const len = getScheduleLength();
    const prevDay = currentDay;

    if (isRamadanMode()) {
        if (inRamadan) {
            appState.hijriOffset = clampInt(appState.hijriOffset + delta, MIN_HIJRI_OFFSET, MAX_HIJRI_OFFSET);
        } else {
            appState.planDay = clampInt(appState.planDay + delta, 1, RAMADAN_DAYS);
        }
    } else if (customBeforeStart) {
        const base = appState.customDayOverride ?? 1;
        appState.customDayOverride = clampInt(base + delta, 1, len);
    } else {
        return;
    }

    updateCurrentDay();
    viewingDay = currentDay;
    saveState();
    render();
    scrollToDay(currentDay);
    if (currentDay !== prevDay) announce(`Day ${currentDay}`);
}

function setCustomStartDate(iso) {
    const valid = isValidISODate(iso);
    appState.customStartDate = valid ? iso : defaultCustomStartDate();
    appState.customDayOverride = null;
    if (!valid && customStartInput) customStartInput.value = appState.customStartDate;
    loadCompletedDays();
    updateCurrentDay();
    viewingDay = currentDay;
    saveState();
    render();
    scrollToDay(currentDay);
    announce(valid ? `Start date set to ${appState.customStartDate}` : 'Invalid date; reset to default');
}

function clampCustomDuration(days) {
    if (!Number.isFinite(days)) return MIN_CUSTOM_DAYS;
    return clampInt(days, MIN_CUSTOM_DAYS, MAX_CUSTOM_DAYS);
}

function adjustCustomDuration(delta) {
    setCustomDuration(appState.customDurationDays + delta);
}

function setCustomDuration(days) {
    const next = clampCustomDuration(days);
    if (next === appState.customDurationDays) return;
    appState.customDurationDays = next;
    appState.customDayOverride = null;
    loadCompletedDays();
    updateCurrentDay();
    viewingDay = currentDay;
    saveState();
    render();
    scrollToDay(currentDay);
    announce(`${next} day${next === 1 ? '' : 's'}`);
}

function toggleDayComplete(day) {
    const len = getScheduleLength();
    if (day < 1 || day > len) return;

    const idx = completedDays.indexOf(day);
    const willBeComplete = idx < 0;
    if (idx >= 0) {
        completedDays.splice(idx, 1);
    } else {
        completedDays.push(day);
        completedDays.sort((a, b) => a - b);
    }
    if (navigator.vibrate) navigator.vibrate(50);
    saveState();
    render();
    announce(`Day ${day} ${willBeComplete ? 'completed' : 'uncompleted'}`);
}

function isDayStepperDisabled() {
    if (isRamadanMode()) return false;
    return !customBeforeStart;
}

/* ============ RENDER ============ */
function renderModeToggle() {
    modeRamadanBtn.classList.toggle('mode-toggle-active', isRamadanMode());
    modeCustomBtn.classList.toggle('mode-toggle-active', !isRamadanMode());
    modeRamadanBtn.setAttribute('aria-pressed', String(isRamadanMode()));
    modeCustomBtn.setAttribute('aria-pressed', String(!isRamadanMode()));
    customPanel.classList.toggle('hidden', isRamadanMode());
}

function renderProgress() {
    const len = getScheduleLength();
    const completedCount = completedDays.length;
    const pct = len > 0 ? (completedCount / len) * 100 : 0;

    progressText.textContent = `Day ${currentDay} of ${len}`;
    progressCompleted.textContent = `${completedCount} completed`;
    progressBarFill.style.width = `${pct}%`;
}

let lastHeaderSubtitle = null;

function renderControls() {
    hijriDayDisplay.textContent = currentDay;
    khatmahInput.textContent = appState.targetKhatmahs;

    khatmahMinus.disabled = appState.targetKhatmahs <= MIN_TARGET_KHATMAHS;
    khatmahPlus.disabled = appState.targetKhatmahs >= MAX_TARGET_KHATMAHS;

    if (isRamadanMode()) {
        dayStepperLabel.textContent = inRamadan ? 'Ramadan day' : 'Plan day';
    } else {
        dayStepperLabel.textContent = 'Day';
    }

    const stepperDisabled = isDayStepperDisabled();
    hijriMinus.disabled = stepperDisabled;
    hijriPlus.disabled = stepperDisabled;

    const subtitle = isRamadanMode()
        ? 'Finish the Quran this Ramadan'
        : 'Your Quran reading plan';
    if (subtitle !== lastHeaderSubtitle) {
        headerSubtitle.textContent = subtitle;
        lastHeaderSubtitle = subtitle;
    }

    dayStepperRow.classList.toggle('is-hidden', !isRamadanMode());
    controlsBar.classList.toggle('controls-bar--custom-only', !isRamadanMode());

    if (!isRamadanMode()) {
        if (customStartInput.value !== appState.customStartDate) {
            customStartInput.value = appState.customStartDate;
        }
        customFinishBy.textContent = formatFinishDate();
        customDurationDisplay.textContent = appState.customDurationDays;
        customDurationMinus.disabled = appState.customDurationDays <= MIN_CUSTOM_DAYS;
        customDurationPlus.disabled = appState.customDurationDays >= MAX_CUSTOM_DAYS;
    }

    const showRamadanBanner = isRamadanMode() && !inRamadan;
    outsideBanner.classList.toggle('hidden', !showRamadanBanner);

    if (showRamadanBanner) {
        const hijriStr = getFormattedHijriDate();
        const daysUntil = getDaysUntilRamadan();
        let msg = 'Ramadan is approaching.';
        if (daysUntil === 0) msg = 'Ramadan has begun.';
        else if (daysUntil != null) msg = `Ramadan starts in ${daysUntil} day${daysUntil === 1 ? '' : 's'}.`;
        if (hijriStr) msg = `Today: ${hijriStr}. ${msg}`;
        outsideBanner.textContent = msg;
    }

    if (!isRamadanMode()) {
        const showPlanStatus = customBeforeStart;
        customPlanStatus.classList.toggle('hidden', !showPlanStatus);
        if (showPlanStatus) {
            customPlanStatus.textContent = `Starts in ${daysUntilCustomStart} day${daysUntilCustomStart === 1 ? '' : 's'}`;
        }
    }
}

let lastStructuralKey = null;

function renderCarousel() {
    const schedule = buildSchedule(getScheduleLength());
    const structuralKey = `${appState.scheduleMode}|${schedule.length}|${appState.targetKhatmahs}`;

    if (structuralKey !== lastStructuralKey) {
        carouselInner.innerHTML = schedule.map(buildCardHTML).join('');
        lastStructuralKey = structuralKey;
    } else {
        for (const row of schedule) {
            const card = carouselInner.querySelector(`[data-day="${row.day}"]`);
            if (!card) continue;
            const isComplete = completedDays.includes(row.day);
            card.classList.toggle('current-day', row.day === currentDay);
            card.classList.toggle('completed', isComplete);
            card.setAttribute('aria-pressed', String(isComplete));
        }
    }
}

function buildCardHTML(row) {
    const juzLabel = formatJuzRange(row);
    const pageLabel = formatPageRange(row);
    const khatmahLabel = formatKhatmahLabel(row);
    const isCurrent = row.day === currentDay;
    const isComplete = completedDays.includes(row.day);
    const milestone = row.isMilestone ? ' \u2713' : '';

    const cardClasses = ['day-card carousel-card'];
    if (isCurrent) cardClasses.push('current-day');
    if (isComplete) cardClasses.push('completed');

    return [
        '<article class="', cardClasses.join(' '), '" data-day="', row.day, '" role="button" tabindex="0"',
        ' aria-pressed="', isComplete, '"',
        ' aria-label="Day ', row.day, ': ', juzLabel, ' ', pageLabel, '">',
            '<div class="day-card-header">',
                '<span class="day-card-day-num">Day ', row.day, '</span>',
                '<span class="day-card-check" aria-hidden="true">\u2713</span>',
            '</div>',
            '<div class="day-card-juz">', juzLabel, '</div>',
            '<div class="day-card-pages">', pageLabel, '</div>',
            '<div class="day-card-khatmah">', khatmahLabel, milestone, '</div>',
        '</article>',
    ].join('');
}

function setupCarouselInteractions() {
    const TAP_THRESHOLD = 10;
    let touchStartX = 0;
    let touchStartY = 0;
    let touchHandled = false;

    carouselInner.addEventListener('click', (e) => {
        if (touchHandled) {
            touchHandled = false;
            return;
        }
        if (dragState.wasDragged) {
            dragState.wasDragged = false;
            return;
        }
        const card = e.target.closest('[data-day]');
        if (!card || !carouselInner.contains(card)) return;
        const day = parseInt(card.dataset.day, 10);
        if (Number.isFinite(day)) toggleDayComplete(day);
    });

    carouselInner.addEventListener('touchstart', (e) => {
        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
    }, { passive: true });

    carouselInner.addEventListener('touchend', (e) => {
        const card = e.target.closest('[data-day]');
        if (!card || !carouselInner.contains(card)) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        if (Math.hypot(dx, dy) <= TAP_THRESHOLD) {
            touchHandled = true;
            e.preventDefault();
            const day = parseInt(card.dataset.day, 10);
            if (Number.isFinite(day)) toggleDayComplete(day);
        }
    }, { passive: false });

    carouselInner.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const card = e.target.closest('[data-day]');
        if (!card || !carouselInner.contains(card)) return;
        e.preventDefault();
        const day = parseInt(card.dataset.day, 10);
        if (Number.isFinite(day)) toggleDayComplete(day);
    });
}

function render() {
    const expectedKey = activeCompletedKey();
    if (expectedKey !== activeCompletedKeyMemo) {
        loadCompletedDays();
    }
    updateCurrentDay();
    viewingDay = clampInt(viewingDay, 1, getScheduleLength());
    renderModeToggle();
    renderProgress();
    renderControls();
    renderCarousel();
}

/* ============ SCROLL ============ */
function scrollToDay(day, { smooth = true } = {}) {
    requestAnimationFrame(() => {
        const card = carouselInner.querySelector(`[data-day="${day}"]`);
        if (card) {
            const scrollLeft = card.offsetLeft - carousel.offsetWidth / 2 + card.offsetWidth / 2;
            carousel.scrollTo({ left: scrollLeft, behavior: smooth ? 'smooth' : 'auto' });
        }
    });
}

/* ============ DRAG TO SCROLL (Desktop) ============ */
const dragState = { wasDragged: false };

function setupDragScroll() {
    let isDown = false;
    let startX;
    let scrollLeft;
    let movedPx;
    const DRAG_THRESHOLD = 5;

    carousel.addEventListener('mousedown', (e) => {
        isDown = true;
        movedPx = 0;
        dragState.wasDragged = false;
        carousel.classList.add('cursor-grabbing');
        startX = e.pageX - carousel.offsetLeft;
        scrollLeft = carousel.scrollLeft;
    });

    carousel.addEventListener('mouseleave', () => {
        if (isDown && movedPx > DRAG_THRESHOLD) {
            dragState.wasDragged = true;
            setTimeout(() => { dragState.wasDragged = false; }, 0);
        }
        isDown = false;
        carousel.classList.remove('cursor-grabbing');
    });

    carousel.addEventListener('mouseup', () => {
        isDown = false;
        carousel.classList.remove('cursor-grabbing');
        if (movedPx > DRAG_THRESHOLD) {
            dragState.wasDragged = true;
            setTimeout(() => { dragState.wasDragged = false; }, 0);
        }
    });

    carousel.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - carousel.offsetLeft;
        const walk = (x - startX) * 1.2;
        movedPx = Math.abs(x - startX);
        carousel.scrollLeft = scrollLeft - walk;
    });
}

/* ============ KEYBOARD NAV ============ */
function setupKeyboardNav() {
    carousel.addEventListener('keydown', (e) => {
        const maxDay = getScheduleLength();
        if (e.key === 'ArrowLeft') {
            viewingDay = Math.max(1, viewingDay - 1);
            scrollToDay(viewingDay);
        } else if (e.key === 'ArrowRight') {
            viewingDay = Math.min(maxDay, viewingDay + 1);
            scrollToDay(viewingDay);
        }
    });
}

/* ============ INIT ============ */
function init() {
    carousel = document.getElementById('carousel');
    carouselInner = document.getElementById('carousel-inner');
    progressText = document.getElementById('progress-text');
    progressCompleted = document.getElementById('progress-completed');
    progressBarFill = document.getElementById('progress-bar-fill');
    dayStepperLabel = document.getElementById('day-stepper-label');
    hijriDayDisplay = document.getElementById('hijri-day-display');
    hijriMinus = document.getElementById('hijri-minus');
    hijriPlus = document.getElementById('hijri-plus');
    khatmahInput = document.getElementById('khatmah-input');
    khatmahMinus = document.getElementById('khatmah-minus');
    khatmahPlus = document.getElementById('khatmah-plus');
    outsideBanner = document.getElementById('outside-ramadan-banner');
    headerSubtitle = document.getElementById('header-subtitle');
    modeRamadanBtn = document.getElementById('mode-ramadan');
    modeCustomBtn = document.getElementById('mode-custom');
    customPanel = document.getElementById('custom-panel');
    customStartInput = document.getElementById('custom-start-date');
    customFinishBy = document.getElementById('custom-finish-by');
    customPlanStatus = document.getElementById('custom-plan-status');
    dayStepperRow = document.getElementById('day-stepper-row');
    controlsBar = document.querySelector('.controls-bar');
    customDurationDisplay = document.getElementById('custom-duration-display');
    customDurationMinus = document.getElementById('custom-duration-minus');
    customDurationPlus = document.getElementById('custom-duration-plus');
    srAnnouncer = document.getElementById('sr-announcer');

    loadState();
    updateCurrentDay();
    viewingDay = currentDay;

    modeRamadanBtn.addEventListener('click', () => setScheduleMode('ramadan'));
    modeCustomBtn.addEventListener('click', () => setScheduleMode('custom'));
    hijriMinus.addEventListener('click', () => adjustDayStepper(-1));
    hijriPlus.addEventListener('click', () => adjustDayStepper(1));
    khatmahMinus.addEventListener('click', () => setTargetKhatmahs(appState.targetKhatmahs - 1));
    khatmahPlus.addEventListener('click', () => setTargetKhatmahs(appState.targetKhatmahs + 1));
    customStartInput.addEventListener('change', (e) => setCustomStartDate(e.target.value));
    customDurationMinus.addEventListener('click', () => adjustCustomDuration(-1));
    customDurationPlus.addEventListener('click', () => adjustCustomDuration(1));

    setupDragScroll();
    setupKeyboardNav();
    setupCarouselInteractions();

    render();
    scrollToDay(currentDay, { smooth: false });
}

init();
