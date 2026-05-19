/**
 * Khatmah - CMU-Q MSA Premium
 * Quran reading companion. All state in appState; never read from DOM for progress.
 */

/* ============ CONSTANTS ============ */
const JUZ_PER_KHATMAH = 30;
const RAMADAN_DAYS = 30;
const PAGES_IN_QURAN = 604;
const RAMADAN_MONTH = 9;
const CUSTOM_DURATIONS = [30, 60, 90];

const JUZ_PAGE_START = [
    1, 22, 42, 62, 82, 102, 121, 142, 162, 182,
    201, 222, 242, 262, 282, 302, 322, 342, 362, 382,
    402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
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
let dayStepperRow, controlsBar, durationPills, customPlanStatus;

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

function getDaysUntilRamadan(fromDate = new Date()) {
    for (let i = 0; i <= 400; i++) {
        const d = new Date(fromDate);
        d.setDate(d.getDate() + i);
        const h = getHijriDate(d);
        if (h?.month === RAMADAN_MONTH && h.day === 1) return i;
    }
    return null;
}

function toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function parseISODate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function daysBetween(startIso, endDate = new Date()) {
    const start = parseISODate(startIso);
    start.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    return Math.floor((end - start) / 86400000);
}

function defaultCustomStartDate() {
    return toISODate(new Date());
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

function customCompletedKey() {
    return `khatmah_completed_custom_${appState.customStartDate}_${appState.customDurationDays}`;
}

function getRamadanYear() {
    const hijri = getHijriDate();
    return hijri?.year ?? new Date().getFullYear();
}

function loadCompletedDays() {
    try {
        if (isRamadanMode()) {
            const key = ramadanCompletedKey(getRamadanYear());
            const raw = localStorage.getItem(key);
            if (raw) {
                completedDays = JSON.parse(raw).filter((n) => n >= 1 && n <= RAMADAN_DAYS);
                return;
            }
            const legacy = localStorage.getItem(STORAGE_KEYS.completedDaysLegacy);
            if (legacy) {
                completedDays = JSON.parse(legacy).filter((n) => n >= 1 && n <= RAMADAN_DAYS);
                localStorage.setItem(key, JSON.stringify(completedDays));
                localStorage.removeItem(STORAGE_KEYS.completedDaysLegacy);
                return;
            }
        } else {
            const raw = localStorage.getItem(customCompletedKey());
            completedDays = raw
                ? JSON.parse(raw).filter((n) => n >= 1 && n <= getScheduleLength())
                : [];
            return;
        }
        completedDays = [];
    } catch (e) {
        completedDays = [];
    }
}

function saveCompletedDays() {
    try {
        if (isRamadanMode()) {
            localStorage.setItem(ramadanCompletedKey(getRamadanYear()), JSON.stringify(completedDays));
        } else {
            localStorage.setItem(customCompletedKey(), JSON.stringify(completedDays));
        }
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
function buildSchedule(totalDays) {
    const totalJuz = JUZ_PER_KHATMAH * appState.targetKhatmahs;
    const schedule = [];

    for (let d = 1; d <= totalDays; d++) {
        const juzStart = Math.floor((d - 1) * totalJuz / totalDays) + 1;
        const juzEnd = Math.max(juzStart, Math.floor(d * totalJuz / totalDays));
        const khatmahNum = Math.ceil(juzEnd / JUZ_PER_KHATMAH);
        const isMilestone = juzEnd % JUZ_PER_KHATMAH === 0;

        schedule.push({
            day: d,
            juzStart,
            juzEnd,
            juzCount: juzEnd - juzStart + 1,
            khatmahNumber: khatmahNum,
            isMilestone,
        });
    }
    return schedule;
}

function juzNum(cumulative) {
    return ((cumulative - 1) % JUZ_PER_KHATMAH) + 1;
}

function formatJuzRange(juzStart, juzEnd) {
    const s = juzNum(juzStart);
    const e = juzNum(juzEnd);
    return s === e ? `Juz' ${s}` : `Juz' ${s}-${e}`;
}

function juzToPageRange(juz) {
    const idx = juz - 1;
    const start = JUZ_PAGE_START[idx];
    const end = juz < 30 ? JUZ_PAGE_START[idx + 1] - 1 : PAGES_IN_QURAN;
    return [start, end];
}

function formatPageRange(juzStart, juzEnd) {
    const s = juzNum(juzStart);
    const e = juzNum(juzEnd);
    const [pStart] = juzToPageRange(s);
    const [, pEnd] = juzToPageRange(e);
    return pStart === pEnd ? `p.${pStart}` : `pp.${pStart}-${pEnd}`;
}

function formatFinishDate() {
    const start = parseISODate(appState.customStartDate);
    start.setDate(start.getDate() + appState.customDurationDays - 1);
    return start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ============ PERSISTENCE ============ */
function loadState() {
    try {
        const k = localStorage.getItem(STORAGE_KEYS.targetKhatmahs);
        if (k != null) appState.targetKhatmahs = Math.max(1, Math.min(10, parseInt(k, 10)));

        const mode = localStorage.getItem(STORAGE_KEYS.scheduleMode);
        if (mode === 'ramadan' || mode === 'custom') appState.scheduleMode = mode;

        const plan = localStorage.getItem(STORAGE_KEYS.planDay);
        if (plan != null) appState.planDay = Math.max(1, Math.min(30, parseInt(plan, 10)));

        const off = localStorage.getItem(STORAGE_KEYS.hijriOffset);
        if (off != null) appState.hijriOffset = Math.max(-29, Math.min(29, parseInt(off, 10)));

        const start = localStorage.getItem(STORAGE_KEYS.customStartDate);
        appState.customStartDate = start || defaultCustomStartDate();

        const dur = localStorage.getItem(STORAGE_KEYS.customDuration);
        if (dur != null) {
            const d = parseInt(dur, 10);
            if (CUSTOM_DURATIONS.includes(d)) appState.customDurationDays = d;
        }

        const hijri = getHijriDate();
        if (hijri?.month === RAMADAN_MONTH) appState.scheduleMode = 'ramadan';

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
    appState.targetKhatmahs = Math.max(1, Math.min(10, value));
    saveState();
    render();
}

function setScheduleMode(mode) {
    if (mode !== 'ramadan' && mode !== 'custom') return;
    appState.scheduleMode = mode;
    appState.customDayOverride = null;
    loadCompletedDays();
    updateCurrentDay();
    viewingDay = currentDay;
    saveState();
    render();
    scrollToDay(currentDay);
}

function adjustDayStepper(delta) {
    const len = getScheduleLength();

    if (isRamadanMode()) {
        if (inRamadan) {
            appState.hijriOffset = Math.max(-29, Math.min(29, appState.hijriOffset + delta));
        } else {
            appState.planDay = Math.max(1, Math.min(RAMADAN_DAYS, appState.planDay + delta));
        }
    } else if (customBeforeStart) {
        const base = appState.customDayOverride ?? 1;
        appState.customDayOverride = Math.max(1, Math.min(len, base + delta));
    } else {
        return;
    }

    updateCurrentDay();
    viewingDay = currentDay;
    saveState();
    render();
    scrollToDay(currentDay);
}

function setCustomStartDate(iso) {
    appState.customStartDate = iso;
    appState.customDayOverride = null;
    loadCompletedDays();
    updateCurrentDay();
    viewingDay = currentDay;
    saveState();
    render();
    scrollToDay(currentDay);
}

function setCustomDuration(days) {
    if (!CUSTOM_DURATIONS.includes(days)) return;
    appState.customDurationDays = days;
    appState.customDayOverride = null;
    loadCompletedDays();
    updateCurrentDay();
    viewingDay = currentDay;
    saveState();
    render();
    scrollToDay(currentDay);
}

function toggleDayComplete(day) {
    const len = getScheduleLength();
    if (day < 1 || day > len) return;

    const idx = completedDays.indexOf(day);
    if (idx >= 0) {
        completedDays.splice(idx, 1);
    } else {
        completedDays.push(day);
        completedDays.sort((a, b) => a - b);
    }
    if (navigator.vibrate) navigator.vibrate(50);
    saveState();
    render();
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

function renderControls() {
    hijriDayDisplay.textContent = currentDay;
    khatmahInput.textContent = appState.targetKhatmahs;

    if (isRamadanMode()) {
        if (inRamadan) {
            dayStepperLabel.textContent = 'Ramadan day';
        } else {
            dayStepperLabel.textContent = 'Plan day';
        }
    } else {
        dayStepperLabel.textContent = 'Day';
    }

    const stepperDisabled = isDayStepperDisabled();
    hijriMinus.disabled = stepperDisabled;
    hijriPlus.disabled = stepperDisabled;
    hijriMinus.classList.toggle('opacity-40', stepperDisabled);
    hijriPlus.classList.toggle('opacity-40', stepperDisabled);

    headerSubtitle.textContent = isRamadanMode()
        ? 'Finish the Quran this Ramadan'
        : 'Your Quran reading plan';
    carousel.setAttribute('aria-label', 'Daily reading schedule');

    renderModeToggle();

    dayStepperRow.classList.toggle('is-hidden', !isRamadanMode());
    controlsBar.classList.toggle('controls-bar--custom-only', !isRamadanMode());

    if (!isRamadanMode()) {
        customStartInput.value = appState.customStartDate;
        customFinishBy.textContent = formatFinishDate();
        durationPills.forEach((pill) => {
            const d = parseInt(pill.dataset.duration, 10);
            const active = d === appState.customDurationDays;
            pill.classList.toggle('duration-pill-active', active);
            pill.setAttribute('aria-pressed', String(active));
        });
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

function renderCarousel() {
    const schedule = buildSchedule(getScheduleLength());
    carouselInner.innerHTML = schedule
        .map((row) => {
            const juzLabel = formatJuzRange(row.juzStart, row.juzEnd);
            const pageLabel = formatPageRange(row.juzStart, row.juzEnd);
            const isCurrent = row.day === currentDay;
            const isComplete = completedDays.includes(row.day);

            const cardClasses = [
                'day-card carousel-card',
                isCurrent ? 'current-day' : '',
                isComplete ? 'completed' : '',
            ]
                .filter(Boolean)
                .join(' ');

            const check = isComplete ? '<span class="text-green-400 text-xl" aria-hidden="true">✓</span>' : '';
            const dayClass = isCurrent ? 'text-cmu-red' : 'text-slate-300';
            const milestone = row.isMilestone ? ' ✓' : '';

            return [
                '<article class="', cardClasses, '" data-day="', row.day, '" role="button" tabindex="0"',
                ' aria-label="Day ', row.day, ': ', juzLabel, ' ', pageLabel, '">',
                '<div class="flex justify-between items-start mb-3">',
                '<span class="text-lg font-bold ', dayClass, '">Day ', row.day, '</span>', check,
                '</div>',
                '',
                '<div class="text-cmu-red font-semibold mb-1">', juzLabel, '</div>',
                '<div class="text-sm text-slate-500">', pageLabel, '</div>',
                '<div class="mt-2 text-xs text-slate-500">Khatmah ', row.khatmahNumber, milestone, '</div>',
                '</article>',
            ].join('');
        })
        .join('');

    const TAP_THRESHOLD = 10;

    carouselInner.querySelectorAll('[data-day]').forEach((el) => {
        const day = parseInt(el.dataset.day, 10);
        let touchHandled = false;

        const handleTap = () => toggleDayComplete(day);

        el.addEventListener('click', () => {
            if (touchHandled) {
                touchHandled = false;
                return;
            }
            handleTap();
        });

        let touchStartX = 0;
        el.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
        }, { passive: true });
        el.addEventListener('touchend', (e) => {
            const touchEndX = e.changedTouches[0].clientX;
            if (Math.abs(touchEndX - touchStartX) <= TAP_THRESHOLD) {
                touchHandled = true;
                e.preventDefault();
                handleTap();
            }
        }, { passive: false });

        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleTap();
            }
        });
    });
}

function render() {
    updateCurrentDay();
    renderProgress();
    renderControls();
    renderCarousel();
}

/* ============ SCROLL ============ */
function scrollToDay(day) {
    requestAnimationFrame(() => {
        const card = carouselInner.querySelector(`[data-day="${day}"]`);
        if (card) {
            const scrollLeft = card.offsetLeft - carousel.offsetWidth / 2 + card.offsetWidth / 2;
            carousel.scrollTo({ left: scrollLeft, behavior: 'smooth' });
        }
    });
}

/* ============ DRAG TO SCROLL (Desktop) ============ */
function setupDragScroll() {
    let isDown = false;
    let startX;
    let scrollLeft;

    carousel.addEventListener('mousedown', (e) => {
        isDown = true;
        carousel.classList.add('cursor-grabbing');
        startX = e.pageX - carousel.offsetLeft;
        scrollLeft = carousel.scrollLeft;
    });

    carousel.addEventListener('mouseleave', () => {
        isDown = false;
        carousel.classList.remove('cursor-grabbing');
    });

    carousel.addEventListener('mouseup', () => {
        isDown = false;
        carousel.classList.remove('cursor-grabbing');
    });

    carousel.addEventListener('mousemove', (e) => {
        if (!isDown) return;
        e.preventDefault();
        const x = e.pageX - carousel.offsetLeft;
        const walk = (x - startX) * 1.2;
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
    durationPills = document.querySelectorAll('.duration-pill');

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
    durationPills.forEach((pill) => {
        pill.addEventListener('click', () => {
            setCustomDuration(parseInt(pill.dataset.duration, 10));
        });
    });

    setupDragScroll();
    setupKeyboardNav();

    render();
    scrollToDay(currentDay);
}

document.addEventListener('DOMContentLoaded', init);
