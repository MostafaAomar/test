/* ==========================================
   1. المتغيرات وإدارة الحالة (State Management)
   ========================================== */
const USE_LOCAL_TEST_FILE = false;
const VALID_YEARS = ["First Year", "Second Year", "Third Year", "Fourth Year"];
const PROGRESS_SCHEMA_VERSION = 2;
const SCORE_CHECKPOINT_SIZE = 50;
const YEAR_DATA_KEY_PREFIX = 'year_data_';
const YEAR_META_KEY_PREFIX = 'year_meta_';

let quizData = [];
let currentSubject = null;
let currentIndex = 0;
let userAnswers = [];
let mode = '';
let currentSpeed = 0.8;
let activeYear = null;
let pendingDownloadYear = null;
let downloadInProgress = false;
let globalSearchSourcesCache = null;

const DEFAULT_REPO_URL = 'https://github.com/MostafaAomar/uni';

const screens = {
    setup: document.getElementById('setup-screen'),
    vocabulary: document.getElementById('vocabulary-screen'),
    mode: document.getElementById('mode-screen'),
    quiz: document.getElementById('quiz-screen'),
    study: document.getElementById('study-screen'),
    result: document.getElementById('result-screen')
};

/* ==========================================
   2. إدارة التنقل، الترتيب وحفظ التقدم
   ========================================== */
function showScreen(name) {
    Object.values(screens).forEach(screen => {
        if (screen) screen.classList.add('hidden');
    });
    if (screens[name]) {
        screens[name].classList.remove('hidden');
        window.scrollTo(0, 0);
    }
}

function normaliseQuestionText(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

function legacyQuestionId(question) {
    const combined = String(question.q ?? '')
        + (Array.isArray(question.options) ? question.options.join('') : '')
        + (question.correct !== undefined ? question.correct : '');
    return 'id_' + simpleHash(combined);
}

function defineHiddenValue(target, name, value) {
    Object.defineProperty(target, name, {
        value,
        writable: true,
        configurable: true,
        enumerable: false
    });
}

/*
 * A question's position in a JSON array is not its identity.  The stable ID
 * below survives insertions and option reordering.  Explicit IDs in JSON are
 * always preferred; generated IDs from the previous app are retained as
 * migration aliases so existing students do not lose their saved answers.
 */
function ensureStableQuestionIds(questions) {
    const duplicateCounts = new Map();

    (questions || []).forEach(question => {
        const suppliedId = question.id !== undefined && question.id !== null
            ? String(question.id)
            : '';
        const looksLikeOldGeneratedId = /^id_[0-9a-f]+$/i.test(suppliedId);
        const questionFingerprint = normaliseQuestionText(question.q)
            || normaliseQuestionText((question.options || []).join('|'));
        const baseId = suppliedId && !looksLikeOldGeneratedId
            ? suppliedId
            : `qid_${simpleHash(questionFingerprint)}`;
        const duplicateNumber = duplicateCounts.get(baseId) || 0;
        duplicateCounts.set(baseId, duplicateNumber + 1);
        const stableId = duplicateNumber === 0 ? baseId : `${baseId}__${duplicateNumber + 1}`;

        const aliases = new Set([stableId, baseId, suppliedId, legacyQuestionId(question)]);
        aliases.delete('');
        question.id = stableId;
        defineHiddenValue(question, '_progressAliases', [...aliases]);
    });

    return questions || [];
}

function setSubjectSourceQuestions(subject, questions) {
    const prepared = ensureStableQuestionIds(questions || []);
    defineHiddenValue(subject, '_sourceQuestions', [...prepared]);
    subject.questions = [...prepared];
    return subject;
}

function getSubjectSourceQuestions(subject) {
    if (!subject._sourceQuestions) {
        setSubjectSourceQuestions(subject, subject.questions || []);
    }
    return subject._sourceQuestions;
}

function getProgressKey(subjectId, selectedMode) {
    return `progress_${subjectId}_${selectedMode}`;
}

function buildQuestionLookup(questions) {
    const lookup = new Map();
    questions.forEach(question => {
        lookup.set(String(question.id), question.id);
        (question._progressAliases || []).forEach(alias => {
            if (!lookup.has(String(alias))) lookup.set(String(alias), question.id);
        });
    });
    return lookup;
}

function mapSavedQuestionId(savedId, lookup) {
    if (savedId === undefined || savedId === null) return null;
    return lookup.get(String(savedId)) || null;
}

function encodeAnswer(question, selectedIndex) {
    return {
        selectedIndex,
        selectedOption: Array.isArray(question.options)
            ? question.options[selectedIndex] ?? null
            : null
    };
}

function decodeAnswer(question, savedAnswer) {
    if (savedAnswer === undefined || savedAnswer === null) return undefined;

    if (typeof savedAnswer === 'object') {
        if (savedAnswer.selectedOption !== undefined && savedAnswer.selectedOption !== null) {
            const optionIndex = (question.options || []).findIndex(option => option === savedAnswer.selectedOption);
            if (optionIndex !== -1) return optionIndex;
        }
        savedAnswer = savedAnswer.selectedIndex;
    }

    const numericAnswer = Number(savedAnswer);
    return Number.isInteger(numericAnswer) && numericAnswer >= 0
        && numericAnswer < (question.options || []).length
        ? numericAnswer
        : undefined;
}

function readSubjectProgress(subject, selectedMode) {
    const sourceQuestions = getSubjectSourceQuestions(subject);
    const lookup = buildQuestionLookup(sourceQuestions);
    const sourceIds = sourceQuestions.map(question => question.id);
    const key = getProgressKey(subject.id, selectedMode);
    const saved = localStorage.getItem(key);

    if (!saved) {
        return {
            exists: false,
            answers: {},
            questionOrder: sourceIds,
            lastQuestionId: sourceIds[0] || null,
            index: 0
        };
    }

    try {
        const parsed = JSON.parse(saved);
        const rawAnswers = parsed.answers || {};
        const answers = {};
        const knownLegacyOrder = [];

        if (Array.isArray(rawAnswers)) {
            rawAnswers.forEach((answer, index) => {
                const question = sourceQuestions[index];
                if (!question || answer === undefined || answer === null) return;
                answers[question.id] = answer;
                knownLegacyOrder.push(question.id);
            });
        } else {
            Object.entries(rawAnswers).forEach(([savedId, answer]) => {
                const currentId = mapSavedQuestionId(savedId, lookup);
                if (!currentId || answer === undefined || answer === null) return;
                answers[currentId] = answer;
                if (!knownLegacyOrder.includes(currentId)) knownLegacyOrder.push(currentId);
            });
        }

        let lastQuestionId = mapSavedQuestionId(parsed.lastQuestionId, lookup);
        let savedOrder = Array.isArray(parsed.questionOrder) ? parsed.questionOrder : [];
        savedOrder = savedOrder
            .map(id => mapSavedQuestionId(id, lookup))
            .filter((id, index, all) => id && all.indexOf(id) === index);

        // Version-1 progress did not store the complete order.  Put its known
        // answered/current prefix first, then append all unseen questions.  If
        // new JSON questions were inserted at the top, this places them after
        // the student's current point instead of in front of it.
        if (savedOrder.length === 0) {
            savedOrder = [...knownLegacyOrder];
            if (lastQuestionId && !savedOrder.includes(lastQuestionId)) savedOrder.push(lastQuestionId);
            sourceIds.forEach(id => {
                if (!savedOrder.includes(id)) savedOrder.push(id);
            });
        }

        savedOrder = savedOrder.filter(id => sourceIds.includes(id));
        const newQuestionIds = sourceIds.filter(id => !savedOrder.includes(id));

        let anchorIndex = lastQuestionId ? savedOrder.indexOf(lastQuestionId) : -1;
        if (anchorIndex === -1) {
            anchorIndex = Math.min(Math.max(Number(parsed.index) || 0, 0), Math.max(savedOrder.length - 1, 0));
            lastQuestionId = savedOrder[anchorIndex] || sourceIds[0] || null;
        }

        if (newQuestionIds.length > 0) {
            savedOrder.splice(anchorIndex + 1, 0, ...newQuestionIds);
        }

        sourceIds.forEach(id => {
            if (!savedOrder.includes(id)) savedOrder.push(id);
        });

        return {
            exists: true,
            answers,
            questionOrder: savedOrder,
            lastQuestionId,
            index: Math.max(savedOrder.indexOf(lastQuestionId), 0)
        };
    } catch (error) {
        console.warn('Could not read saved progress:', error);
        return {
            exists: false,
            answers: {},
            questionOrder: sourceIds,
            lastQuestionId: sourceIds[0] || null,
            index: 0
        };
    }
}

function writeSubjectProgress(subject, selectedMode, progress) {
    const questions = getSubjectSourceQuestions(subject);
    const questionById = new Map(questions.map(question => [question.id, question]));
    const encodedAnswers = {};

    Object.entries(progress.answers || {}).forEach(([questionId, answer]) => {
        const question = questionById.get(questionId);
        if (!question || answer === undefined || answer === null) return;
        encodedAnswers[questionId] = typeof answer === 'object'
            ? answer
            : encodeAnswer(question, answer);
    });

    const payload = {
        schemaVersion: PROGRESS_SCHEMA_VERSION,
        updatedAt: new Date().toISOString(),
        lastQuestionId: progress.lastQuestionId || null,
        index: Math.max(Number(progress.index) || 0, 0),
        answers: encodedAnswers,
        questionOrder: [...(progress.questionOrder || questions.map(question => question.id))]
    };

    localStorage.setItem(getProgressKey(subject.id, selectedMode), JSON.stringify(payload));
    return payload;
}

function restoreCurrentSubjectProgress(preferredQuestionId = null) {
    const progress = readSubjectProgress(currentSubject, mode);
    const sourceQuestions = getSubjectSourceQuestions(currentSubject);
    const questionById = new Map(sourceQuestions.map(question => [question.id, question]));
    currentSubject.questions = progress.questionOrder
        .map(id => questionById.get(id))
        .filter(Boolean);

    const lookup = buildQuestionLookup(currentSubject.questions);
    const preferredId = mapSavedQuestionId(preferredQuestionId, lookup);
    const restoredId = preferredId || progress.lastQuestionId;
    const restoredIndex = currentSubject.questions.findIndex(question => question.id === restoredId);
    currentIndex = restoredIndex === -1
        ? Math.min(progress.index || 0, Math.max(currentSubject.questions.length - 1, 0))
        : restoredIndex;
    userAnswers = currentSubject.questions.map(question => decodeAnswer(question, progress.answers[question.id]));
    return progress;
}

function upgradeStoredProgress(subject, selectedMode) {
    const progress = readSubjectProgress(subject, selectedMode);
    if (!progress.exists) return;
    writeSubjectProgress(subject, selectedMode, progress);
}

function saveDetailedProgress() {
    if (!currentSubject || !currentSubject.questions.length) return;

    const subjectId = currentSubject.id;
    const lastQuestionId = currentSubject.questions[currentIndex]?.id || null;

    const lastState = { subjectId: subjectId, mode: mode, lastQuestionId: lastQuestionId };
    localStorage.setItem('app_last_position', JSON.stringify(lastState));

    const progressToSave = {};
    userAnswers.forEach((answer, index) => {
        const question = currentSubject.questions[index];
        if (question && answer !== undefined && answer !== null) {
            progressToSave[question.id] = encodeAnswer(question, answer);
        }
    });

    writeSubjectProgress(currentSubject, mode, {
        lastQuestionId: lastQuestionId,
        index: currentIndex,
        answers: progressToSave,
        questionOrder: currentSubject.questions.map(question => question.id)
    });
}




/* ==========================================
   3. التحميل والتهيئة التلقائية (Initialization)
   ========================================== */
async function init() {
    loadThemePreference();
    showWelcomeMessage();
    registerOfflineWorker();
    bindConnectionStatus();

    if (USE_LOCAL_TEST_FILE) {
        await fetchLocalTestFile();
    } else {
        renderDynamicYears();
    }

    if (restoreLastDownloadedSession()) return;

    showScreen('setup');
}

function registerOfflineWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    navigator.serviceWorker.register('./service-worker.js')
        .catch(error => console.warn('Offline worker registration failed:', error));
}

function bindConnectionStatus() {
    const update = () => {
        const status = document.getElementById('connection-status');
        if (!status) return;
        status.textContent = navigator.onLine
            ? 'متصل — يمكنك تنزيل أو تحديث سنة'
            : 'وضع عدم الاتصال — البيانات المحمّلة متاحة';
        status.classList.toggle('is-offline', !navigator.onLine);
    };

    window.addEventListener('online', () => {
        update();
        renderDynamicYears();
    });
    window.addEventListener('offline', () => {
        update();
        renderDynamicYears();
    });
    update();
}

function restoreLastDownloadedSession() {
    const savedPosition = localStorage.getItem('app_last_position');
    if (!savedPosition) return false;

    try {
        const position = JSON.parse(savedPosition);
        for (const year of VALID_YEARS) {
            const subjects = readDownloadedYear(year);
            const foundSubject = subjects.find(subject => subject.id === position.subjectId);
            if (!foundSubject) continue;

            quizData = subjects;
            activeYear = year;
            currentSubject = foundSubject;
            mode = position.mode;
            restoreCurrentSubjectProgress(position.lastQuestionId);
            renderStep();
            return true;
        }
    } catch (error) {
        console.warn('Could not restore the last offline session:', error);
    }

    return false;
}

function showWelcomeMessage() {
    if (localStorage.getItem('welcome_message_seen') === '1') return;
    localStorage.setItem('welcome_message_seen', '1');

    const welcomeDiv = document.createElement('div');
    welcomeDiv.id = 'welcome-message';
    welcomeDiv.innerHTML = `
        <p>هذا العمل صدقة جارية<br><br>ادعوا لي ولأهلي بالرحمة والمغفرة</p>
    `;

    const style = document.createElement('style');
    style.innerHTML = `
        #welcome-message {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: #4e4e4e;
            color: #fff;
            padding: 15px 25px;
            border-radius: 12px;
            z-index: 9999;
            text-align: center;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            cursor: pointer;
            border: 1px solid #3f3f46;
        }
        #welcome-message p { margin: 0 0 10px 0; font-weight: bold; line-height: 1.6; font-size: 1.25rem; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(welcomeDiv);

    const removeMessage = () => {
        if (document.body.contains(welcomeDiv)) {
            document.body.removeChild(welcomeDiv);
        }
    };

    welcomeDiv.addEventListener('click', removeMessage);
    setTimeout(removeMessage, 1600);
}

function toggleTheme() {
    const body = document.body;
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (body.classList.contains('light-theme')) {
        body.classList.remove('light-theme');
        localStorage.setItem('theme', 'dark');
        if (themeBtn) themeBtn.innerHTML = '☀️';
    } else {
        body.classList.add('light-theme');
        localStorage.setItem('theme', 'light');
        if (themeBtn) themeBtn.innerHTML = '🌙';
    }
}

function loadThemePreference() {
    const savedTheme = localStorage.getItem('theme');
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        if (themeBtn) themeBtn.innerHTML = '🌙';
    } else {
        if (themeBtn) themeBtn.innerHTML = '☀️';
    }
}

async function fetchRepoAndAddSubjects(repoUrl) {
    let cleanUrl = repoUrl.replace('https://github.com/', '').split('/tree/')[0];
    if (cleanUrl.endsWith('.git')) cleanUrl = cleanUrl.slice(0, -4);
    const parts = cleanUrl.split('/');
    if (parts.length < 2) return;

    const owner = parts[0];
    const repo = parts[1];

    const cachedTree = localStorage.getItem('app_repo_tree');
    let treeData = null;

    try {
        if (navigator.onLine) {
            const api = `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`;
            const resp = await fetch(api);
            if (!resp.ok) throw new Error("فشل الاتصال بـ GitHub API.");
            const tree = await resp.json();
            treeData = tree.tree;
            localStorage.setItem('app_repo_tree', JSON.stringify(treeData));
        } else if (cachedTree) {
            treeData = JSON.parse(cachedTree);
        } else {
            throw new Error("لا يوجد اتصال بالإنترنت ولا توجد بيانات محفوظة.");
        }

        const jsonFiles = treeData.filter(t => t.path.endsWith('.json') && !t.path.includes('myOwnDic.json'));
        renderDynamicYears(jsonFiles, owner, repo);
    } catch (e) {
        console.error("Load Error:", e);
        document.getElementById('years-container').innerHTML = `<p style="text-align:center; color:var(--error);">❌ تعذر تحميل البيانات: ${e.message}</p>`;
    }
}

async function fetchLocalTestFile() {
    try {
        const response = await fetch(`test.json?t=${Date.now()}`);
        if (!response.ok) throw new Error('Could not find test.json.');

        const content = await response.json();
        const fileObject = { name: 'test.json', content: JSON.stringify(content) };
        processJsonFiles([fileObject], 'local');
    } catch (e) {
        console.error("Load Error:", e);
        alert(`❌ تعذر تحميل ملف الاختبار المحلي:\n${e.message}`);
    }
}

function getSubjectProgress(subjectName, totalQuestions) {
    if (!totalQuestions || totalQuestions === 0) return 0;
    const modes = ['study', 'quiz'];
    let maxProgress = 0;

    modes.forEach(m => {
        const key = `progress_${subjectName}_${m}`;
        const savedData = localStorage.getItem(key);
        if (savedData) {
            try {
                const parsed = JSON.parse(savedData);
                let reached = 0;

                if (Array.isArray(parsed.answers)) {
                    reached = parsed.answers.filter(a => a !== null && a !== undefined).length;
                } else {
                    reached = Object.keys(parsed.answers || {}).length;
                }

                const indexReached = parsed.index !== undefined ? parsed.index + 1 : 0;
                const actualProgress = Math.max(reached, indexReached);

                if (actualProgress > maxProgress) maxProgress = actualProgress;
            } catch (e) { console.error(e); }
        }
    });

    const percentage = (maxProgress / totalQuestions) * 100;
    return Math.round(Math.min(100, Math.max(0, percentage)));
}

function renderSubjectList() {
    const list = document.getElementById('subject-list');
    if (!list) return;
    list.innerHTML = '<div id="search-results-container"></div>';
    const resultsContainer = document.getElementById('search-results-container');
    renderAllSubjects(resultsContainer);
}

function getSearchResultsContainer() {
    const list = document.getElementById('subject-list');
    if (!list) return null;

    let container = document.getElementById('search-results-container');
    if (!container) {
        list.innerHTML = '<div id="search-results-container"></div>';
        container = document.getElementById('search-results-container');
    }
    return container;
}

function setSubjectDashboardState(state) {
    const view = document.getElementById('view-subjects');
    const homeContent = document.getElementById('dashboard-home-content');
    const subjectList = document.getElementById('subject-list');
    const focused = state === 'year' || state === 'search';

    view?.classList.toggle('year-view-active', state === 'year');
    view?.classList.toggle('search-view-active', state === 'search');

    if (homeContent) homeContent.hidden = focused;
    if (subjectList) {
        subjectList.hidden = !focused;
        subjectList.classList.toggle('hidden', !focused);
    }
}

function getSearchableSubjectSources() {
    if (activeYear) {
        return quizData.map((subject, subjectIndex) => ({
            subject,
            subjectIndex,
            yearName: activeYear,
            yearSubjects: quizData
        }));
    }

    if (globalSearchSourcesCache) return globalSearchSourcesCache;

    const downloadedSources = [];
    VALID_YEARS.forEach(yearName => {
        const yearSubjects = readDownloadedYear(yearName);
        yearSubjects.forEach((subject, subjectIndex) => {
            downloadedSources.push({ subject, subjectIndex, yearName, yearSubjects });
        });
    });

    // Keep the local-test/import workflow working when no downloaded year exists.
    if (downloadedSources.length === 0 && quizData.length > 0) {
        quizData.forEach((subject, subjectIndex) => {
            downloadedSources.push({ subject, subjectIndex, yearName: null, yearSubjects: quizData });
        });
    }

    globalSearchSourcesCache = downloadedSources;
    return downloadedSources;
}

function handleGlobalSearchInput(event) {
    const term = String(event?.target?.value ?? '').trim().toLowerCase();
    const resultsContainer = getSearchResultsContainer();
    if (!resultsContainer) return;

    if (!term) {
        if (activeYear) {
            setSubjectDashboardState('year');
            renderAllSubjects(resultsContainer);
        } else {
            resultsContainer.innerHTML = '';
            setSubjectDashboardState('home');
        }
        return;
    }

    setSubjectDashboardState(activeYear ? 'year' : 'search');
    performSearch(term, resultsContainer, getSearchableSubjectSources());
}

async function processJsonFiles(files, type, githubInfo = {}) {
    quizData = [];

    for (const file of files) {
        try {
            let content;
            let fileName;

            if (type === 'github') {
                fileName = file.path;
                const rawUrl = `https://raw.githubusercontent.com/${githubInfo.owner}/${githubInfo.repo}/main/${fileName}?t=${Date.now()}`;
                const r = await fetch(rawUrl);
                if (!r.ok) continue;
                content = await r.json();
            } else {
                fileName = file.name;
                content = JSON.parse(file.content);
            }

            const data = Array.isArray(content) ? content[0] : content;

            if (data && data.questions) {
                const subject = {
                    id: fileName,
                    subject: (data.subject || fileName.replace('.json', '').split('/').pop()).trim(),
                    description: typeof data.description === 'string' ? data.description.trim() : '',
                    lang: data.lang || 'en',
                    questions: []
                };
                setSubjectSourceQuestions(subject, data.questions);
                quizData.push(subject);
            }
        } catch (fileErr) {
            console.warn(`⚠️ تم تخطي الملف ${file.path || file.name} لوجود خطأ في صيغة الـ JSON داخله.`, fileErr);
        }
    }
    renderSubjectList();
}

function performSearch(term, container, subjectSources = getSearchableSubjectSources()) {
    container.innerHTML = '';
    const results = [];
    subjectSources.forEach(source => {
        const subject = source.subject;
        (subject.questions || []).forEach((question, questionIndex) => {
            if (String(question.q ?? '').toLowerCase().includes(term)) {
                results.push({ ...source, question, questionIndex });
            }
        });
    });

    if (results.length === 0) {
        container.innerHTML = "<p style='text-align:center; color:#94a3b8;'>لا توجد نتائج مطابقة.</p>";
        return;
    }

    results.forEach(result => {
        const btn = document.createElement('div');
        btn.className = 'subject-btn search-result-item';
        btn.setAttribute('role', 'button');
        btn.tabIndex = 0;
        const yearLabel = result.yearName
            ? ` · السنة: ${escapeCardHTML(result.yearName)}`
            : '';
        btn.innerHTML = `
            <span style="z-index:2; position:relative; display:block;">${escapeCardHTML(result.question.q)}</span>
            <small style="z-index:2; position:relative; color: #a1a1aa; display:block; margin-top: 5px;">المادة: ${escapeCardHTML(result.subject.subject)}${yearLabel}</small>
        `;
        const openResult = () => {
            quizData = result.yearSubjects;
            if (result.yearName) activeYear = result.yearName;
            currentSubject = result.yearSubjects[result.subjectIndex];
            mode = 'quiz';
            restoreCurrentSubjectProgress();
            currentIndex = currentSubject.questions.findIndex(q => q.id === result.question.id);
            if (currentIndex === -1) currentIndex = 0;
            renderStep();
        };
        btn.addEventListener('click', openResult);
        btn.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openResult();
            }
        });
        container.appendChild(btn);
    });
}

function escapeCardHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[character]);
}

function renderAllSubjects(container) {
    container.innerHTML = "";
    if (quizData.length === 0) {
        container.innerHTML = "<p style='text-align:center; color:#94a3b8;'>لا توجد مواد متاحة حالياً.</p>";
        return;
    }

    quizData.forEach((data, index) => {
        const btn = document.createElement('div');
        btn.className = 'subject-btn';
        btn.dir = data.lang === 'ar' ? 'rtl' : 'ltr';
        const progressPercent = getSubjectProgress(data.id, data.questions.length);
        const description = data.description || (data.lang === 'ar'
            ? 'لا يوجد وصف متاح لهذه المادة.'
            : 'No description is available for this subject.');
        const questionCount = data.lang === 'ar'
            ? `${data.questions.length} سؤال`
            : `${data.questions.length} Questions`;
        btn.innerHTML = `
        <div onclick="switchView('view-modes')"
                        class="glass-card rounded-3xl p-md flex flex-col gap-sm shadow-sm hover:shadow-lg transition-all cursor-pointer group active:scale-95">
                        <div class="text-center-of-years">
                            <h3 class="font-title-lg text-title-lg mb-1 leading-tight">${escapeCardHTML(data.subject)}</h3>
                            <p class="subject-card-description font-caption text-caption text-on-surface-variant">${escapeCardHTML(description)}</p>
                            <small class="subject-card-question-count">${escapeCardHTML(questionCount)}</small>
                        </div>
                        <div class="subject-card-progress mt-auto" dir="ltr">
                            <div class="flex justify-end font-label-md text-label-md mb-2">
                                <span class="text-primary">${progressPercent}%</span>
                            </div>
                            <div class="w-full h-2 bg-surface-container-highest rounded-full overflow-hidden">
                                <div class="h-full bg-primary rounded-full" style="width: ${progressPercent}%"></div>
                            </div>
                        </div>
                    </div>
        `;
        btn.onclick = () => {
            currentSubject = quizData[index];
            document.getElementById('selected-subject-name').innerText = currentSubject.subject;
            showScreen('mode');
        };
        container.appendChild(btn);
    });
}
function openDownloadModal(year) {
    if (!VALID_YEARS.includes(year)) return;
    pendingDownloadYear = year;
    const hasExistingDownload = Boolean(localStorage.getItem(getYearDataKey(year)));
    const modal = document.getElementById('download-modal');
    const title = document.getElementById('download-modal-title');
    const confirmButton = document.getElementById('download-confirm-btn');
    document.getElementById('target-year').textContent = year;
    if (title) title.textContent = hasExistingDownload ? 'Update offline data?' : 'هل ترغب في التنزيل للاستخدام دون اتصال بالإنترنت؟';
    if (confirmButton) confirmButton.textContent = hasExistingDownload ? 'Update' : 'Download';
    updateDownloadStatus(hasExistingDownload
        ? 'Only this selected year will use internet data. Your progress will be preserved.'
        : 'This downloads only the selected year and stores it on this device.');
    modal?.classList.remove('hidden');
}

async function confirmYearDownload() {
    if (!pendingDownloadYear) return;
    await downloadYearData(pendingDownloadYear);
}

function closeDownloadModal() {
    if (downloadInProgress) return;
    document.getElementById('download-modal')?.classList.add('hidden');
    pendingDownloadYear = null;
}
function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return Math.abs(hash).toString(16);
}

/* ==========================================
   4. المنطق الأساسي (Study & Quiz Logic)
   ========================================== */
function renderStep() {
    if (!currentSubject) return;

    const lang = currentSubject.lang || 'en';
    document.documentElement.setAttribute('lang', lang);
    document.documentElement.setAttribute('dir', 'ltr');

    const quizScreen = document.getElementById('quiz-screen');
    const studyScreen = document.getElementById('study-screen');
    if (quizScreen) quizScreen.setAttribute('dir', 'ltr');
    if (studyScreen) studyScreen.setAttribute('dir', 'ltr');

    updateProgress();
    displayNotes();
    saveDetailedProgress();

    const studyArea = document.getElementById('study-displayArea');
    const quizArea = document.getElementById('quiz-displayArea');
    if (studyArea) studyArea.innerHTML = "";
    if (quizArea) quizArea.innerHTML = "";

    if (mode === 'quiz') {
        showScreen('quiz');
        renderQuizQuestion();
    } else {
        showScreen('study');
        renderStudyCard();
    }
}

function renderStudyCard() {
    const qData = currentSubject.questions[currentIndex];
    document.getElementById('study-question').innerText = qData.q;
    document.getElementById('study-answer').innerText = qData.options[qData.correct];
    document.getElementById('study-count').innerText = `${currentIndex + 1} / ${currentSubject.questions.length}`;
    document.getElementById('card-inner').classList.remove('is-flipped');
}

function renderQuizQuestion() {
    const qData = currentSubject.questions[currentIndex];
    document.getElementById('question-text').innerText = qData.q;
    document.getElementById('quiz-count-display').innerText = `${currentIndex + 1} / ${currentSubject.questions.length}`;

    const container = document.getElementById('options-container');
    const feedbackBox = document.getElementById('quiz-feedback');
    container.innerHTML = '';
    feedbackBox.classList.add('hidden');

    qData.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerText = opt;

        if (userAnswers[currentIndex] !== undefined && userAnswers[currentIndex] !== null) {
            applyFeedbackStyles(btn, i, qData.correct);
            btn.disabled = true;
        } else {
            btn.onclick = () => handleAnswer(i, btn, qData);
        }
        container.appendChild(btn);
    });

    if (userAnswers[currentIndex] !== undefined && userAnswers[currentIndex] !== null) {
        showFeedbackMessage(qData, userAnswers[currentIndex]);
    }

    updateInterimResultButton();
}

function updateInterimResultButton() {
    const interimBtn = document.getElementById('interim-result-btn');
    if (!interimBtn || mode !== 'quiz') return;

    const questionNumber = currentIndex + 1;
    const answeredCurrentQuestion = userAnswers[currentIndex] !== undefined
        && userAnswers[currentIndex] !== null;
    const isCheckpoint = questionNumber > 0
        && questionNumber % SCORE_CHECKPOINT_SIZE === 0
        && answeredCurrentQuestion;

    interimBtn.classList.toggle('hidden', !isCheckpoint);
    if (isCheckpoint) {
        interimBtn.textContent = `نتيجتي بعد ${questionNumber}`;
        interimBtn.setAttribute('aria-label', `عرض النتيجة بعد ${questionNumber} سؤال`);
    }
}

function calculateQuizStats(lastIndex = currentSubject.questions.length - 1) {
    let correct = 0;
    let answered = 0;

    currentSubject.questions.forEach((question, index) => {
        const answer = userAnswers[index];
        if (index > lastIndex || answer === undefined || answer === null) return;
        answered++;
        if (answer === question.correct) correct++;
    });

    return {
        correct,
        answered,
        percentage: answered ? Math.round((correct / answered) * 100) : 0
    };
}

function showInterimResult() {
    const modal = document.getElementById('interim-modal');
    const statsBox = document.getElementById('interim-stats');
    if (!modal || !statsBox) return;

    const stats = calculateQuizStats(currentIndex);
    const nextMessage = currentIndex < currentSubject.questions.length - 1
        ? `يمكنك المتابعة للسؤال ${currentIndex + 2}.`
        : 'لقد وصلت إلى نهاية الأسئلة.';
    statsBox.innerHTML = `
        <div style="font-size:3rem; font-weight:800; color:${stats.percentage >= 50 ? '#10b981' : '#ef4444'}">${stats.percentage}%</div>
        <p>أجبت على ${stats.correct} بشكل صحيح من أصل ${stats.answered} سؤال قمت بحله حتى الآن.</p>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 10px;">تم حفظ تقدمك تلقائياً. ${nextMessage}</p>
    `;

    modal.classList.remove('hidden');
}

function handleAnswer(selectedIndex, clickedBtn, qData) {
    userAnswers[currentIndex] = selectedIndex;
    saveDetailedProgress();
    const container = document.getElementById('options-container');
    const buttons = container.querySelectorAll('.option-btn');
    buttons.forEach((btn, index) => {
        btn.disabled = true;
        applyFeedbackStyles(btn, index, qData.correct);
    });
    showFeedbackMessage(qData, selectedIndex);
    updateInterimResultButton();
}

function applyFeedbackStyles(btn, index, correctIndex) {
    const selectedIndex = userAnswers[currentIndex];
    if (index === correctIndex) {
        btn.style.backgroundColor = "rgba(16, 185, 129, 0.2)";
        btn.style.borderColor = "#10b981";
        btn.style.color = "#058754";
    } else if (index === selectedIndex && selectedIndex !== correctIndex) {
        btn.style.backgroundColor = "rgba(239, 68, 68, 0.2)";
        btn.style.borderColor = "#ef4444";
        btn.style.color = "#d37676";
    }
}

function showFeedbackMessage(qData, selectedIndex) {
    const feedbackBox = document.getElementById('quiz-feedback');
    const isCorrect = selectedIndex === qData.correct;
    const isAr = (currentSubject.lang || 'ar') === 'ar';

    feedbackBox.classList.remove('hidden');
    feedbackBox.className = isCorrect ? "feedback-toast feedback-success" : "feedback-toast feedback-error";

    const title = isCorrect ? (isAr ? "✅ ممتاز!" : "✅ Correct!") : (isAr ? "❌ خطأ" : "❌ Incorrect");
    const explanation = qData.feedback || (isCorrect ? "" : (isAr ? `الإجابة الصحيحة هي: ${qData.options[qData.correct]}` : `Correct answer: ${qData.options[qData.correct]}`));

    feedbackBox.innerHTML = `<strong>${title}</strong><br><span>${explanation}</span>`;
}

/* ==========================================
   5. أدوات مساعدة ونطق وأزرار الصوت
   ========================================== */
function updateProgress() {
    const pct = ((currentIndex + 1) / currentSubject.questions.length) * 100;
    const barId = (mode === 'quiz') ? 'quiz-progress-bar' : 'study-progress-bar';
    const bar = document.getElementById(barId);
    if (bar) bar.style.width = pct + "%";
}

function syncSpeed(val) {
    currentSpeed = val;
    document.querySelectorAll('.slider').forEach(el => el.value = val);
}

function speakCurrent() {
    if (!window.speechSynthesis || !currentSubject) return;
    window.speechSynthesis.cancel();
    const qData = currentSubject.questions[currentIndex];

    const utter = new SpeechSynthesisUtterance(qData.q);
    utter.lang = currentSubject.lang || 'en';
    utter.rate = parseFloat(currentSpeed);
    window.speechSynthesis.speak(utter);

    if (mode === 'study') {
        const inner = document.getElementById('card-inner');
        if (inner.classList.contains('is-flipped')) {
            const utterAns = new SpeechSynthesisUtterance(qData.options[qData.correct]);
            utterAns.lang = currentSubject.lang || 'en';
            utterAns.rate = parseFloat(currentSpeed);
            window.speechSynthesis.speak(utterAns);
        }
    }
}

function saveUserNote() {
    const isQuiz = mode === 'quiz';
    const inputId = isQuiz ? 'quiz-note-input' : 'note-input';
    const input = document.getElementById(inputId);
    if (input && input.value.trim()) {
        const key = `note_${currentSubject.id}_${currentSubject.questions[currentIndex].id}`;
        localStorage.setItem(key, input.value.trim());
        input.value = "";
        displayNotes();
    }
}

function displayNotes() {
    const questionId = currentSubject?.questions[currentIndex]?.id;
    const saved = localStorage.getItem(`note_${currentSubject.id}_${questionId}`);
    const displayId = (mode === 'quiz') ? 'quiz-note-display' : 'user-note-display';
    const box = document.getElementById(displayId);
    if (box) {
        if (saved) {
            box.innerText = `📝 ${saved}`;
            box.classList.remove('hidden');
        } else {
            box.classList.add('hidden');
        }
    }
}

/* ==========================================
   6. معالجة ومختبر الصوتيات المتطور للـ IPA
   ========================================== */
function playFullSentence(text) {
    if (!text) return;
    const cleanText = text.replace(/["']/g, "");
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=en&client=tw-ob`;
    const audio = new Audio(url);
    audio.rate = parseFloat(currentSpeed || 0.8);
    audio.play().catch(e => console.error("Playback error:", e));
}

async function analyzeCurrentQuestion(currentMode) {
    const qData = currentSubject.questions[currentIndex];
    const text = qData.q;
    const displayAreaId = currentMode === 'quiz' ? 'quiz-displayArea' : 'study-displayArea';
    const displayArea = document.getElementById(displayAreaId);

    if (!displayArea) return;

    displayArea.innerHTML = '<div style="text-align:center; padding:20px; color:var(--primary);">جاري معالجة النطق المتصل...</div>';

    playFullSentence(text);

    const words = text.split(/\s+/);
    let ipaParts = [];

    for (let word of words) {
        const clean = word.replace(/[^\w]/g, '');
        if (clean) {
            try {
                const params = new URLSearchParams({
                    sp: clean,
                    qe: 'sp',
                    md: 'r',
                    ipa: '1',
                    max: '1'
                });
                const resp = await fetch(`https://api.datamuse.com/words?${params}`, {
                    mode: 'cors',
                    credentials: 'omit'
                });
                if (!resp.ok) throw new Error(`Pronunciation lookup failed (${resp.status})`);

                const data = await resp.json();
                const tags = data[0]?.tags || [];
                const ipaTag = tags.find(tag => tag.startsWith('ipa_pron:'));
                const phonetic = ipaTag ? ipaTag.slice('ipa_pron:'.length).trim() : clean;
                ipaParts.push(phonetic.replace(/\//g, ''));
            } catch (e) {
                ipaParts.push(clean);
            }
        }
    }

    const fullIpa = `/${ipaParts.join(" ")}/`;

    displayArea.innerHTML = `
        <div class="word-pill" style="display: block; text-align: left; direction: ltr;">
            <div style="margin-bottom: 15px;">
                <span style="font-size: 0.7rem; color: var(--accent); font-weight: 800; text-transform: uppercase;">Full Sentence Flow</span>
                <h3 style="margin: 5px 0; line-height: 1.4; color: #bf8686;">${text}</h3>
                <div class="ipa" style="color: #6366f1; font-size: 1.1rem; margin-top: 10px; background: rgba(99,102,241,0.1); padding: 8px; border-radius: 8px; border-left: 3px solid var(--primary);">
                    ${fullIpa}
                </div>
            </div>
        </div>
    `;
}

/* ==========================================
   7. التحكم في التدفق
   ========================================== */
function toggleFlip() {
    const inner = document.getElementById('card-inner');
    if (inner) inner.classList.toggle('is-flipped');
}

function nextQuestion() {
    if (currentIndex < currentSubject.questions.length - 1) {
        currentIndex++;
        renderStep();
    } else {
        showResults();
    }
}

function prevQuestion() {
    if (currentIndex > 0) {
        currentIndex--;
        renderStep();
    }
}

function showResults() {
    showScreen('result');
    const statsBox = document.getElementById('final-stats');
    if (!statsBox) return;

    if (mode === 'quiz') {
        const stats = calculateQuizStats();
        statsBox.innerHTML = `
            <div style="font-size:3rem; font-weight:800; color:${stats.percentage >= 50 ? '#10b981' : '#ef4444'}">${stats.percentage}%</div>
            <p>أجبت على ${stats.correct} من أصل ${stats.answered} سؤال تم حله بشكل صحيح</p>
        `;
    } else {
        statsBox.innerHTML = `<p>أتممت مراجعة جميع البطاقات بنجاح!</p>`;
    }
}

function setMode(m) {
    if (!currentSubject || !currentSubject.questions) {
        console.error("No subject selected.");
        showScreen('setup');
        return;
    }
    mode = m;
    restoreCurrentSubjectProgress();
    renderStep();
}

function goBackToSubjects() {
    if (currentSubject) {
        saveDetailedProgress();
    }
    currentSubject = null;
    document.documentElement.setAttribute('dir', 'rtl');
    document.documentElement.setAttribute('lang', 'ar');

    // Reset internal view containers for setup-screen
    const yearsContainer = document.getElementById('years-container');
    const subjectList = document.getElementById('subject-list');
    if (yearsContainer) {
        yearsContainer.classList.remove('hidden');
        yearsContainer.querySelectorAll('.year-btn').forEach(button => {
            button.classList.remove('active-year');
        });
    }
    if (subjectList) {
        subjectList.classList.add('hidden');
        subjectList.hidden = true;
        subjectList.innerHTML = '';
    }

    activeYear = null;
    quizData = [];
    const globalSearch = document.getElementById('global-subject-search');
    if (globalSearch) globalSearch.value = '';
    setSubjectDashboardState('home');
    renderDynamicYears();
    showScreen('setup');
}

function restartSubject() {
    if (confirm("هل تريد إعادة هذه المادة من البداية؟")) {
        currentIndex = 0;
        userAnswers = [];
        const subjectProgressKey = `progress_${currentSubject.id}_${mode}`;
        localStorage.removeItem(subjectProgressKey);
        currentSubject.questions.forEach((q, i) => {
            localStorage.removeItem(`note_${currentSubject.id}_${q.id}`);
        });
        renderStep();
    }
}

function fullReset() {
    if (confirm("⚠️ تحذير: سيتم حذف كافة الملاحظات والتقدم المخزن. هل أنت متأكد؟")) {
        localStorage.clear();
        location.reload();
    }
}

/* ==========================================
   8. مدير المفردات المحفوظة محلياً
   ========================================== */
const VOCABULARY_STORAGE_KEY = 'uniquiz_vocabulary_entries_v1';
let vocabularyEditingId = null;

function getVocabularyEntries() {
    try {
        const storedEntries = JSON.parse(localStorage.getItem(VOCABULARY_STORAGE_KEY) || '[]');
        if (!Array.isArray(storedEntries)) return [];

        return storedEntries.filter(entry =>
            entry &&
            typeof entry.id === 'string' &&
            typeof entry.word === 'string' &&
            typeof entry.meaning === 'string'
        );
    } catch (error) {
        console.warn('Could not read saved vocabulary:', error);
        return [];
    }
}

function setVocabularyStatus(message, type = '') {
    const status = document.getElementById('vocabulary-form-status');
    if (!status) return;
    status.textContent = message;
    status.className = `vocabulary-form-status ${type}`.trim();
}

function persistVocabularyEntries(entries) {
    try {
        localStorage.setItem(VOCABULARY_STORAGE_KEY, JSON.stringify(entries));
        return true;
    } catch (error) {
        console.error('Could not save vocabulary:', error);
        setVocabularyStatus('The word could not be saved. Please check your browser storage settings.', 'error');
        return false;
    }
}

function resetVocabularyForm(clearStatus = true) {
    vocabularyEditingId = null;
    const form = document.getElementById('vocabulary-form');
    const submitButton = document.getElementById('vocabulary-submit');
    const cancelButton = document.getElementById('vocabulary-cancel');

    if (form) form.reset();
    if (submitButton) {
        submitButton.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">💾</span><span>حفظ الكلمة</span>';
    }
    if (cancelButton) cancelButton.classList.add('hidden');
    if (clearStatus) setVocabularyStatus('');
}

function createVocabularyActionButton(label, icon, className, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `vocabulary-row-action ${className}`;
    button.setAttribute('aria-label', label);
    button.title = label;

    const iconElement = document.createElement('span');
    iconElement.className = 'material-symbols-outlined';
    iconElement.textContent = icon === 'edit' ? '✎' : '🗑';
    iconElement.setAttribute('aria-hidden', 'true');

    const labelElement = document.createElement('span');
    labelElement.className = 'vocabulary-action-label';
    labelElement.textContent = label;

    button.append(iconElement, labelElement);
    button.addEventListener('click', handler);
    return button;
}

function renderVocabularyTable() {
    const tableBody = document.getElementById('vocabulary-table-body');
    const tableWrapper = document.getElementById('vocabulary-table-wrapper');
    const emptyState = document.getElementById('vocabulary-empty');
    const count = document.getElementById('vocabulary-count');
    if (!tableBody || !tableWrapper || !emptyState) return;

    const entries = getVocabularyEntries();
    tableBody.replaceChildren();

    if (count) count.textContent = `${entries.length} ${entries.length === 1 ? 'word' : 'words'}`;
    tableWrapper.classList.toggle('hidden', entries.length === 0);
    emptyState.classList.toggle('hidden', entries.length > 0);

    entries.forEach(entry => {
        const row = document.createElement('tr');

        const wordCell = document.createElement('td');
        wordCell.className = 'vocabulary-word-cell';
        wordCell.textContent = entry.word;

        const meaningCell = document.createElement('td');
        meaningCell.className = 'vocabulary-meaning-cell';
        meaningCell.textContent = entry.meaning;

        const actionCell = document.createElement('td');
        actionCell.className = 'vocabulary-row-actions';
        actionCell.append(
            createVocabularyActionButton('Edit', 'edit', 'edit', () => editVocabularyEntry(entry.id)),
            createVocabularyActionButton('Delete', 'delete', 'delete', () => deleteVocabularyEntry(entry.id))
        );

        row.append(wordCell, meaningCell, actionCell);
        tableBody.appendChild(row);
    });
}

function retrieveData() {
    resetVocabularyForm();
    renderVocabularyTable();
    showScreen('vocabulary');
}

function saveVocabularyEntry(event) {
    event?.preventDefault();
    const wordInput = document.getElementById('vocabulary-word');
    const meaningInput = document.getElementById('vocabulary-meaning');
    const word = wordInput?.value.trim() || '';
    const meaning = meaningInput?.value.trim() || '';

    if (!word || !meaning) {
        setVocabularyStatus('Please enter both the word and its meaning.', 'error');
        (!word ? wordInput : meaningInput)?.focus();
        return;
    }

    const entries = getVocabularyEntries();
    const wasEditing = Boolean(vocabularyEditingId);

    if (wasEditing) {
        const entryIndex = entries.findIndex(entry => entry.id === vocabularyEditingId);
        if (entryIndex === -1) {
            resetVocabularyForm(false);
            setVocabularyStatus('This entry no longer exists.', 'error');
            renderVocabularyTable();
            return;
        }
        entries[entryIndex] = {
            ...entries[entryIndex],
            word,
            meaning,
            updatedAt: new Date().toISOString()
        };
    } else {
        const id = window.crypto?.randomUUID
            ? window.crypto.randomUUID()
            : `word_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        entries.unshift({
            id,
            word,
            meaning,
            createdAt: new Date().toISOString()
        });
    }

    if (!persistVocabularyEntries(entries)) return;
    resetVocabularyForm(false);
    renderVocabularyTable();
    setVocabularyStatus(wasEditing ? 'Entry updated successfully.' : 'Word saved successfully.', 'success');
    wordInput?.focus();
}

function editVocabularyEntry(id) {
    const entry = getVocabularyEntries().find(item => item.id === id);
    if (!entry) {
        setVocabularyStatus('This entry no longer exists.', 'error');
        renderVocabularyTable();
        return;
    }

    vocabularyEditingId = id;
    const wordInput = document.getElementById('vocabulary-word');
    const meaningInput = document.getElementById('vocabulary-meaning');
    const submitButton = document.getElementById('vocabulary-submit');
    const cancelButton = document.getElementById('vocabulary-cancel');

    if (wordInput) wordInput.value = entry.word;
    if (meaningInput) meaningInput.value = entry.meaning;
    if (submitButton) {
        submitButton.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">✓</span><span>Update entry</span>';
    }
    if (cancelButton) cancelButton.classList.remove('hidden');
    setVocabularyStatus(`Editing “${entry.word}”.`, 'editing');
    wordInput?.focus();
    document.getElementById('vocabulary-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cancelVocabularyEdit() {
    resetVocabularyForm();
    document.getElementById('vocabulary-word')?.focus();
}

function deleteVocabularyEntry(id) {
    const entries = getVocabularyEntries();
    const entry = entries.find(item => item.id === id);
    if (!entry) {
        setVocabularyStatus('This entry no longer exists.', 'error');
        renderVocabularyTable();
        return;
    }

    if (!confirm(`Delete “${entry.word}”?`)) return;
    const remainingEntries = entries.filter(item => item.id !== id);
    if (!persistVocabularyEntries(remainingEntries)) return;

    if (vocabularyEditingId === id) resetVocabularyForm(false);
    renderVocabularyTable();
    setVocabularyStatus('Entry deleted.', 'success');
}

window.onload = init;

/* ==========================================
   9. القاموس المدمج الذكي - (English-English Dictionary)
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
    const wordInput = document.getElementById('wordInput');
    const dictionaryOutput = document.getElementById('dictionaryOutput');

    const localDictionaryPaths = [
        './myOwnDic.json',
        'https://raw.githubusercontent.com/MostafaAomar/uni/main/myOwnDic.json'
    ];
    // Datamuse supplies definitions and IPA metadata and permits browser CORS requests.
    const apiEndpoint = 'https://api.datamuse.com/words';

    let dictionaryData = [];
    let isDictionaryLoaded = false;
    let isLoadingDictionary = false;
    let dictionaryLoadPromise = null;
    let latestSearchId = 0;

    async function loadLocalDictionary() {
        if (isDictionaryLoaded) return dictionaryData;
        if (dictionaryLoadPromise) return dictionaryLoadPromise;

        isLoadingDictionary = true;
        dictionaryLoadPromise = (async () => {
            for (const path of localDictionaryPaths) {
                try {
                    const response = await fetch(`${path}${path.includes('?') ? '&' : '?'}t=${Date.now()}`);
                    if (!response.ok) continue;

                    const data = await response.json();
                    if (Array.isArray(data)) return data;
                } catch (error) {
                    console.warn(`Dictionary source unavailable: ${path}`, error);
                }
            }
            return [];
        })();

        try {
            dictionaryData = await dictionaryLoadPromise;
            return dictionaryData;
        } finally {
            isDictionaryLoaded = true;
            isLoadingDictionary = false;
            dictionaryLoadPromise = null;
        }
    }

    function searchLocalDictionary(word) {
        if (dictionaryData.length === 0) return undefined;
        const searchTerm = word.trim().toLowerCase();
        return dictionaryData.find(entry => entry.word?.trim().toLowerCase() === searchTerm);
    }

    function convertDatamuseEntry(entry, searchTerm) {
        if (!entry || !Array.isArray(entry.defs) || entry.defs.length === 0) return null;

        const partOfSpeechNames = {
            n: 'noun',
            v: 'verb',
            adj: 'adjective',
            adv: 'adverb',
            u: 'other'
        };
        const definitionsByPartOfSpeech = new Map();

        entry.defs.forEach(rawDefinition => {
            if (typeof rawDefinition !== 'string') return;
            const separatorIndex = rawDefinition.indexOf('\t');
            const code = separatorIndex >= 0 ? rawDefinition.slice(0, separatorIndex).trim() : 'u';
            const definition = (separatorIndex >= 0
                ? rawDefinition.slice(separatorIndex + 1)
                : rawDefinition).trim();

            if (!definition) return;
            const partOfSpeech = partOfSpeechNames[code] || code || 'other';
            if (!definitionsByPartOfSpeech.has(partOfSpeech)) {
                definitionsByPartOfSpeech.set(partOfSpeech, []);
            }
            definitionsByPartOfSpeech.get(partOfSpeech).push({ definition });
        });

        if (definitionsByPartOfSpeech.size === 0) return null;

        const tags = Array.isArray(entry.tags) ? entry.tags : [];
        const ipaTag = tags.find(tag => tag.startsWith('ipa_pron:'));
        const arpabetTag = tags.find(tag => tag.startsWith('pron:'));
        const phonetic = ipaTag
            ? `/${ipaTag.slice('ipa_pron:'.length).trim()}/`
            : (arpabetTag ? arpabetTag.slice('pron:'.length).trim() : '');

        return {
            word: entry.word || searchTerm,
            phonetic,
            phonetics: [],
            meanings: Array.from(definitionsByPartOfSpeech, ([partOfSpeech, definitions]) => ({
                partOfSpeech,
                definitions
            }))
        };
    }

    async function searchApiDictionary(word) {
        const searchTerm = word.trim();
        if (!searchTerm) return null;
        dictionaryOutput.innerHTML = '<p class="text-muted" style="text-align:center;">لم يتم العثور عليه محليًا، جار البحث عبر الإنترنت...</p>';

        try {
            const params = new URLSearchParams({
                sp: searchTerm,
                qe: 'sp',
                md: 'dpr',
                ipa: '1',
                max: '1'
            });
            const response = await fetch(`${apiEndpoint}?${params}`, {
                mode: 'cors',
                credentials: 'omit'
            });
            if (!response.ok) return null;
            const data = await response.json();
            if (!Array.isArray(data) || data.length === 0) return null;

            const exactMatch = data.find(entry =>
                entry.word?.trim().toLowerCase() === searchTerm.toLowerCase()
            ) || data[0];
            return convertDatamuseEntry(exactMatch, searchTerm);
        } catch (error) {
            console.warn('Online dictionary lookup failed:', error);
            return null;
        }
    }

    function normalizeAudioUrl(url) {
        if (!url || typeof url !== 'string') return '';
        const trimmedUrl = url.trim();
        if (trimmedUrl.startsWith('//')) return `https:${trimmedUrl}`;

        try {
            return new URL(trimmedUrl, window.location.href).href;
        } catch (error) {
            return '';
        }
    }

    async function playDictionaryPronunciation(word, audioUrl) {
        if (audioUrl) {
            try {
                const audio = new Audio(audioUrl);
                audio.preload = 'auto';
                await audio.play();
                return;
            } catch (error) {
                console.warn('Dictionary MP3 playback failed; using browser speech instead.', error);
            }
        }

        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(word);
            utterance.lang = 'en-US';
            utterance.rate = 0.9;
            window.speechSynthesis.speak(utterance);
        }
    }

    function displayDefinition(entryData, searchTerm) {
        if (!dictionaryOutput) return;

        if (!entryData) {
            dictionaryOutput.innerHTML = `<p class="text-warning" style="text-align:center;">لم يتم العثور على تعريف للكلمة "${escapeHTML(searchTerm)}".</p>`;
            return;
        }

        const word = entryData.word || searchTerm;
        const phoneticText = entryData.phonetic || entryData.phonetics?.find(p => p.text)?.text;
        const rawAudioUrl = entryData.phonetics?.find(p => typeof p.audio === 'string' && p.audio.trim())?.audio;
        const audioUrl = normalizeAudioUrl(rawAudioUrl);

        let html = `<h4 class="mb-2" style="text-align:left; direction:ltr;">${escapeHTML(word)} ${phoneticText ? `<span class="text-muted fs-6">${escapeHTML(phoneticText)}</span>` : ''}</h4>`;

        if (audioUrl) {
            html += `<div class="audio mb-3"><audio  preload="none" src="${escapeHTML(audioUrl)}">متصفحك لا يدعم الصوت.</audio></div>`;
        }

        html += `<button type="button" class="small-btn dictionary-audio-btn">🔊 Play pronunciation</button>`;

        if (entryData.meanings && Array.isArray(entryData.meanings)) {
            entryData.meanings.forEach(meaning => {
                html += `<div class="definition mb-3 border-bottom pb-2" style="text-align:left; direction:ltr;">`;
                html += `<h5 style="color:var(--success);"><em>${escapeHTML(meaning.partOfSpeech)}</em></h5>`;

                if (meaning.definitions && Array.isArray(meaning.definitions)) {
                    meaning.definitions.forEach((def, index) => {
                        html += `<p class="mb-1"><strong>${index + 1}.</strong> ${escapeHTML(def.definition)}</p>`;
                        if (def.example) {
                            html += `<p class="ms-3 text-muted fst-italic" style="border-left:2px solid var(--primary); padding-left:10px;">"${escapeHTML(def.example)}"</p>`;
                        }
                    });
                }
                html += `</div>`;
            });
        }
        dictionaryOutput.innerHTML = html;

        const audioButton = dictionaryOutput.querySelector('.dictionary-audio-btn');
        if (audioButton) {
            audioButton.addEventListener('click', () => playDictionaryPronunciation(word, audioUrl));
        }
    }

    async function handleWordSearch() {
        if (!wordInput || !dictionaryOutput) return;
        const word = wordInput.value.trim();
        const searchId = ++latestSearchId;

        if (word.length < 1) {
            dictionaryOutput.innerHTML = '<p class="text-muted" style="text-align:center;">أدخل كلمة للبحث.</p>';
            return;
        }

        await loadLocalDictionary();
        if (searchId !== latestSearchId) return;

        const localResult = searchLocalDictionary(word);
        if (localResult) {
            displayDefinition(localResult, word);
        } else {
            const apiResult = await searchApiDictionary(word);
            if (searchId !== latestSearchId) return;
            displayDefinition(apiResult, word);
        }
    }

    if (wordInput && dictionaryOutput) {
        wordInput.addEventListener('input', debounce(handleWordSearch, 350));
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => { clearTimeout(timeout); func(...args); };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function escapeHTML(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
});

/* ==========================================
   9. ميزة التحديد الذكي للبحث التلقائي (Smart Highlight Search)
   ========================================== */
function performSmartSearch() {
    setTimeout(() => {
        const selectedText = window.getSelection().toString().trim();

        if (selectedText && selectedText.length > 0 && selectedText.length <= 30) {

            const wordInput = document.getElementById('wordInput');
            const dictionarySection = document.getElementById('dictionary');

            if (wordInput && dictionarySection) {
                if (wordInput.value !== selectedText) {
                    wordInput.value = selectedText;
                    wordInput.dispatchEvent(new Event('input'));
                    dictionarySection.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }
        }
    }, 150);
}

function getYearDataKey(yearName) {
    return `${YEAR_DATA_KEY_PREFIX}${yearName}`;
}

function getYearMetaKey(yearName) {
    return `${YEAR_META_KEY_PREFIX}${yearName}`;
}

function getDownloadedYearMeta(yearName) {
    try {
        return JSON.parse(localStorage.getItem(getYearMetaKey(yearName)) || 'null');
    } catch (error) {
        return null;
    }
}

function readDownloadedYear(yearName) {
    const savedData = localStorage.getItem(getYearDataKey(yearName));
    if (!savedData) return [];

    try {
        const subjects = JSON.parse(savedData);
        if (!Array.isArray(subjects)) return [];
        return subjects.map(subject => {
            setSubjectSourceQuestions(subject, subject.questions || []);
            ['study', 'quiz'].forEach(savedMode => upgradeStoredProgress(subject, savedMode));
            return subject;
        });
    } catch (error) {
        console.warn(`Could not read downloaded data for ${yearName}:`, error);
        return [];
    }
}

function formatStoredBytes(bytes) {
    const amount = Number(bytes) || 0;
    if (amount < 1024) return `${amount} B`;
    if (amount < 1024 * 1024) return `${Math.round(amount / 1024)} KB`;
    return `${(amount / (1024 * 1024)).toFixed(1)} MB`;
}

function renderDynamicYears() {
    const yearsContainer = document.getElementById('years-container');
    if (!yearsContainer) return;
    globalSearchSourcesCache = null;
    yearsContainer.innerHTML = '';

    VALID_YEARS.forEach(yearName => {
        const storedYear = localStorage.getItem(getYearDataKey(yearName));
        const hasDownload = Boolean(storedYear);
        let meta = getDownloadedYearMeta(yearName);
        if (hasDownload && !meta) {
            try {
                const legacySubjects = JSON.parse(storedYear);
                meta = {
                    downloadedAt: null,
                    subjectCount: legacySubjects.length,
                    questionCount: legacySubjects.reduce((total, subject) => total + (subject.questions?.length || 0), 0),
                    sizeBytes: new Blob([storedYear]).size
                };
                localStorage.setItem(getYearMetaKey(yearName), JSON.stringify(meta));
            } catch (error) {
                meta = null;
            }
        }
        const card = document.createElement('div');
        card.className = `subject-btn year-btn offline-year-card${hasDownload ? ' downloaded-year' : ''}${activeYear === yearName ? ' active-year' : ''}`;
        card.dir = 'ltr';

        const storedSummary = hasDownload
            ? `${meta?.subjectCount || 0} subjects · ${meta?.questionCount || 0} questions · ${formatStoredBytes(meta?.sizeBytes)}`
            : (navigator.onLine ? 'Not downloaded' : 'Not available offline');

        card.innerHTML = `
            <div class="year-card-main">
                <strong>${escapeCardHTML(yearName)}</strong>
                <small>${escapeCardHTML(storedSummary)}</small>
            </div>
            <div class="year-card-actions">
                <button type="button" class="year-download-btn" ${navigator.onLine ? '' : 'disabled'}>
                    ${hasDownload ? 'Update' : 'Download'}
                </button>
                ${hasDownload ? '<button type="button" class="year-remove-btn">Remove</button>' : ''}
            </div>
        `;

        card.addEventListener('click', event => {
            if (event.target.closest('button')) return;
            if (hasDownload) loadYearData(yearName);
            else openDownloadModal(yearName);
        });
        card.querySelector('.year-open-btn')?.addEventListener('click', () => loadYearData(yearName));
        card.querySelector('.year-download-btn')?.addEventListener('click', () => openDownloadModal(yearName));
        card.querySelector('.year-remove-btn')?.addEventListener('click', () => removeDownloadedYear(yearName));
        yearsContainer.appendChild(card);
    });
}

function loadYearData(yearName) {
    const downloadedSubjects = readDownloadedYear(yearName);
    if (downloadedSubjects.length === 0) {
        if (navigator.onLine) openDownloadModal(yearName);
        else alert('هذه السنة غير محمّلة. اتصل بالإنترنت واضغط Download مرة واحدة.');
        return;
    }

    quizData = downloadedSubjects;
    activeYear = yearName;
    const globalSearch = document.getElementById('global-subject-search');
    if (globalSearch) globalSearch.value = '';
    renderDynamicYears();
    renderSubjectListWithSync(yearName);
    setSubjectDashboardState('year');
    showScreen('setup');
    window.scrollTo(0, 0);
}

function renderSubjectListWithSync(yearName) {
    renderSubjectList();
    const list = document.getElementById('subject-list');
    if (!list) return;

    const header = document.createElement('div');
    header.className = 'year-header';
    header.innerHTML = `
        <div>
            <h3>${escapeCardHTML(yearName)}</h3>
            <small>Saved on this device and available offline</small>
        </div>
        <button type="button" class="small-btn ghost-btn">العودة</button>
    `;
    header.querySelector('button').addEventListener('click', backToYears);
    list.insertBefore(header, list.firstChild);

    const updateButton = document.createElement('button');
    updateButton.type = 'button';
    updateButton.className = 'subject-btn sync-btn';
    updateButton.disabled = !navigator.onLine;
    updateButton.innerHTML = navigator.onLine
        ? '<span>Check for updates ↻</span>'
        : '<span>Offline — using saved data ✓</span>';
    updateButton.addEventListener('click', () => openDownloadModal(yearName));
    list.insertBefore(updateButton, header.nextSibling);
}

function backToYears() {
    const subjectList = document.getElementById('subject-list');
    if (subjectList) {
        subjectList.classList.add('hidden');
        subjectList.hidden = true;
        subjectList.innerHTML = '';
    }
    activeYear = null;
    quizData = [];
    const globalSearch = document.getElementById('global-subject-search');
    if (globalSearch) globalSearch.value = '';
    setSubjectDashboardState('home');
    renderDynamicYears();
    showScreen('setup');
    window.scrollTo(0, 0);
}

function getRepositoryParts() {
    const cleanUrl = DEFAULT_REPO_URL.replace('https://github.com/', '').replace(/\.git$/, '');
    const [owner, repo] = cleanUrl.split('/');
    return { owner, repo };
}

async function fetchGitHubJson(url) {
    const response = await fetch(url, {
        cache: 'no-cache',
        headers: { Accept: 'application/vnd.github+json' }
    });
    if (!response.ok) throw new Error(`GitHub request failed (${response.status})`);
    return response.json();
}

async function findYearFolder(yearName) {
    const { owner, repo } = getRepositoryParts();
    const rootItems = await fetchGitHubJson(`https://api.github.com/repos/${owner}/${repo}/contents?ref=main`);
    const normalisedYear = yearName.replace(/\s/g, '').toLowerCase();
    return rootItems.find(item => item.type === 'dir'
        && item.name.replace(/\s/g, '').toLowerCase() === normalisedYear) || null;
}

async function collectJsonFiles(apiUrl) {
    const items = await fetchGitHubJson(apiUrl);
    const files = [];
    const directories = [];

    (Array.isArray(items) ? items : [items]).forEach(item => {
        if (item.type === 'file' && item.name.endsWith('.json') && item.name !== 'myOwnDic.json') {
            files.push({
                path: item.path,
                downloadUrl: item.download_url,
                sha: item.sha || null,
                size: item.size || 0
            });
        } else if (item.type === 'dir') {
            directories.push(item.url);
        }
    });

    for (const directoryUrl of directories) {
        files.push(...await collectJsonFiles(directoryUrl));
    }
    return files;
}

async function fetchYearFileList(yearName) {
    const folder = await findYearFolder(yearName);
    if (!folder) throw new Error(`لا توجد بيانات جاهزة في ${yearName}`);
    const files = await collectJsonFiles(folder.url);
    if (files.length === 0) throw new Error(`No JSON subjects were found in ${yearName}.`);
    return files;
}

function updateDownloadStatus(message, isError = false) {
    const status = document.getElementById('download-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('download-error', isError);
}

function setDownloadBusy(isBusy) {
    downloadInProgress = isBusy;
    const confirmButton = document.getElementById('download-confirm-btn');
    const cancelButton = document.getElementById('download-cancel-btn');
    if (confirmButton) {
        confirmButton.disabled = isBusy;
        confirmButton.textContent = isBusy ? 'Downloading…' : 'Download';
    }
    if (cancelButton) cancelButton.disabled = isBusy;
}

async function downloadYearData(yearName) {
    if (!navigator.onLine) {
        updateDownloadStatus('No internet connection. Your existing downloads are still available.', true);
        return false;
    }

    setDownloadBusy(true);
    updateDownloadStatus('Finding the subjects for this year…');

    try {
        const files = await fetchYearFileList(yearName);
        const freshSubjects = [];
        const existingSubjects = readDownloadedYear(yearName);
        const existingById = new Map(existingSubjects.map(subject => [subject.id, subject]));
        const previousMeta = getDownloadedYearMeta(yearName);
        const previousFileShas = previousMeta?.fileShas || {};
        let changedFileCount = 0;

        for (let index = 0; index < files.length; index++) {
            const file = files[index];
            const existingSubject = existingById.get(file.path);
            if (existingSubject && file.sha && previousFileShas[file.path] === file.sha) {
                freshSubjects.push(existingSubject);
                updateDownloadStatus(`Checked subject ${index + 1} of ${files.length} — already current.`);
                continue;
            }

            changedFileCount++;
            updateDownloadStatus(`Downloading changed subject ${index + 1} of ${files.length}…`);
            const response = await fetch(file.downloadUrl, { cache: 'no-cache' });
            if (!response.ok) throw new Error(`Could not download ${file.path}.`);
            const content = await response.json();
            const data = Array.isArray(content) ? content[0] : content;
            if (!data || !Array.isArray(data.questions)) continue;

            const subject = {
                id: file.path,
                subject: (data.subject || file.path.replace('.json', '').split('/').pop()).trim(),
                description: typeof data.description === 'string' ? data.description.trim() : '',
                lang: data.lang || 'en',
                questions: []
            };
            setSubjectSourceQuestions(subject, data.questions);
            freshSubjects.push(subject);
        }

        if (freshSubjects.length === 0) throw new Error('The downloaded files did not contain any subjects.');

        quizData = freshSubjects.map(freshSubject => {
            const existingSubject = existingById.get(freshSubject.id);
            if (!existingSubject) return freshSubject;

            ['study', 'quiz'].forEach(savedMode => upgradeStoredProgress(existingSubject, savedMode));
            setSubjectSourceQuestions(existingSubject, getSubjectSourceQuestions(freshSubject));
            existingSubject.subject = freshSubject.subject;
            existingSubject.description = freshSubject.description;
            existingSubject.lang = freshSubject.lang;
            return existingSubject;
        });

        quizData.forEach(subject => {
            ['study', 'quiz'].forEach(savedMode => upgradeStoredProgress(subject, savedMode));
        });

        const cacheableData = quizData.map(subject => ({
            id: subject.id,
            subject: subject.subject,
            description: subject.description || '',
            lang: subject.lang,
            questions: getSubjectSourceQuestions(subject)
        }));
        const serialisedData = JSON.stringify(cacheableData);
        const questionCount = cacheableData.reduce((total, subject) => total + subject.questions.length, 0);
        const metadata = {
            downloadedAt: new Date().toISOString(),
            subjectCount: cacheableData.length,
            questionCount,
            sizeBytes: new Blob([serialisedData]).size,
            fileShas: Object.fromEntries(files.map(file => [file.path, file.sha]))
        };

        try {
            localStorage.setItem(getYearDataKey(yearName), serialisedData);
            localStorage.setItem(getYearMetaKey(yearName), JSON.stringify(metadata));
        } catch (storageError) {
            throw new Error('There is not enough browser storage. Remove another downloaded year and try again.');
        }

        activeYear = yearName;
        updateDownloadStatus(changedFileCount > 0
            ? `Saved ${metadata.subjectCount} subjects and ${metadata.questionCount} questions offline.`
            : `Everything is already current. No subject files needed downloading.`);
        renderDynamicYears();
        setTimeout(() => {
            closeDownloadModal();
            loadYearData(yearName);
        }, 650);
        return true;
    } catch (error) {
        console.error('Year download failed:', error);
        updateDownloadStatus(error.message || 'The download failed. Please try again.', true);
        return false;
    } finally {
        setDownloadBusy(false);
    }
}

function removeDownloadedYear(yearName) {
    if (!confirm(`هل تريد إزالة البيانات التي تم تنزيلها للسنة ${yearName}? ستفقد ما أنجزته في الاختبار.`)) return;
    localStorage.removeItem(getYearDataKey(yearName));
    localStorage.removeItem(getYearMetaKey(yearName));
    if (activeYear === yearName) backToYears();
    else renderDynamicYears();
}

function toggleSyncSettings() {
    const container = document.getElementById('sync-settings-container');
    if (container) {
        container.classList.toggle('hidden');
    }
}

function saveSyncConfig() {
    const enabled = document.getElementById('sync-enabled').checked;
    const username = document.getElementById('sync-username').value.trim();
    const repo = document.getElementById('sync-repo').value.trim();
    const token = document.getElementById('sync-token').value.trim();

    localStorage.setItem('sync_enabled', enabled);
    if (username) localStorage.setItem('sync_username', username);
    if (repo) localStorage.setItem('sync_repo', repo);
    if (token) localStorage.setItem('sync_token', token);

    alert("تم حفظ إعدادات المزامنة بنجاح!");
    toggleSyncSettings();
}

document.addEventListener('mouseup', performSmartSearch);
document.addEventListener('touchend', performSmartSearch);
