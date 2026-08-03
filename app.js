/* ==========================================
   1. المتغيرات وإدارة الحالة (State Management)
   ========================================== */
const USE_LOCAL_TEST_FILE = false;
const VALID_YEARS = ["First Year", "Second Year", "Third Year", "Fourth Year"];

let quizData = [];
let currentSubject = null;
let currentIndex = 0;
let userAnswers = [];
let mode = '';
let currentSpeed = 0.8;

const DEFAULT_REPO_URL = 'https://github.com/MostafaAomar/test';

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

function saveDetailedProgress() {
    if (!currentSubject) return;

    const subjectId = currentSubject.id;
    const lastQuestionId = currentSubject.questions[currentIndex]?.id || null;

    const lastState = { subjectId: subjectId, mode: mode, lastQuestionId: lastQuestionId };
    localStorage.setItem('app_last_position', JSON.stringify(lastState));

    const subjectProgressKey = `progress_${subjectId}_${mode}`;

    const progressToSave = {};
    userAnswers.forEach((answer, index) => {
        const questionId = currentSubject.questions[index]?.id;
        if (questionId !== undefined && answer !== undefined && answer !== null) {
            progressToSave[questionId] = answer;
        }
    });

    const progressData = {
        lastQuestionId: lastQuestionId,
        index: currentIndex,
        answers: progressToSave
    };
    localStorage.setItem(subjectProgressKey, JSON.stringify(progressData));
}




/* ==========================================
   3. التحميل والتهيئة التلقائية (Initialization)
   ========================================== */
async function init() {
    loadThemePreference(); // Moved to top so theme always applies immediately
    showWelcomeMessage();

    const loadingDiv = document.querySelector('.loader');

    if (USE_LOCAL_TEST_FILE) {
        if (loadingDiv) loadingDiv.classList.remove('hidden');
        await fetchLocalTestFile();
        if (loadingDiv) loadingDiv.classList.add('hidden');
    } else {
        if (loadingDiv) loadingDiv.classList.remove('hidden');
        await fetchRepoAndAddSubjects(DEFAULT_REPO_URL);
        if (loadingDiv) loadingDiv.classList.add('hidden');
    }

    const savedPos = localStorage.getItem('app_last_position');
    if (savedPos) {
        try {
            const pos = JSON.parse(savedPos);
            const foundSub = quizData.find(s => s.id === pos.subjectId);
            if (foundSub) {
                currentSubject = foundSub;
                mode = pos.mode;



                let restoredIndex = 0;
                if (pos.lastQuestionId) {
                    const newIndex = currentSubject.questions.findIndex(q => q.id === pos.lastQuestionId);
                    if (newIndex !== -1) restoredIndex = newIndex;
                }
                currentIndex = restoredIndex;

                const subProgKey = `progress_${currentSubject.id}_${mode}`;
                const savedProg = localStorage.getItem(subProgKey);
                if (savedProg) {
                    const parsedProg = JSON.parse(savedProg);
                    const savedAnswers = parsedProg.answers || {};

                    if (Array.isArray(savedAnswers)) {
                        userAnswers = [...savedAnswers];
                        saveDetailedProgress();
                    } else {
                        userAnswers = currentSubject.questions.map(q => savedAnswers[q.id]);
                    }
                }

                renderStep();
                return;
            }
        } catch (e) { console.log("Error restoring session", e); }
    }

    showScreen('setup');
}

function showWelcomeMessage() {
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
    setTimeout(removeMessage, 3000);
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
    list.innerHTML = `
        <div class="search-container">
            <input type="text" id="question-search-input" placeholder="ابحث عن سؤال في جميع المواد..." />
        </div>
    `;

    const searchInput = document.getElementById('question-search-input');
    const resultsContainer = document.createElement('div');
    resultsContainer.id = 'search-results-container';
    list.appendChild(resultsContainer);

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.trim().toLowerCase();
        if (searchTerm.length > 2) {
            performSearch(searchTerm, resultsContainer);
        } else {
            renderAllSubjects(resultsContainer);
        }
    });

    renderAllSubjects(resultsContainer);
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
                data.questions.forEach(q => {
                    const combinedStr = q.q + (q.options ? q.options.join('') : '') + (q.correct !== undefined ? q.correct : '');
                    q.id = q.id || 'id_' + simpleHash(combinedStr);
                });

                quizData.push({
                    id: fileName,
                    subject: (data.subject || fileName.replace('.json', '').split('/').pop()).trim(),
                    description: typeof data.description === 'string' ? data.description.trim() : '',
                    lang: data.lang || 'en',
                    questions: data.questions
                });
            }
        } catch (fileErr) {
            console.warn(`⚠️ تم تخطي الملف ${file.path || file.name} لوجود خطأ في صيغة الـ JSON داخله.`, fileErr);
        }
    }
    renderSubjectList();
}

function performSearch(term, container) {
    container.innerHTML = '';
    let results = [];
    quizData.forEach((subject, subjectIndex) => {
        subject.questions.forEach((question, questionIndex) => {
            if (question.q.toLowerCase().includes(term)) {
                results.push({ subject, subjectIndex, question, questionIndex });
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
        btn.innerHTML = `
            <span style="z-index:2; position:relative; display:block;">${result.question.q}</span>
            <small style="z-index:2; position:relative; color: #a1a1aa; display:block; margin-top: 5px;">المادة: ${result.subject.subject}</small>
        `;
        btn.onclick = () => {
            currentSubject = quizData[result.subjectIndex];
            mode = 'quiz';

            currentIndex = currentSubject.questions.findIndex(q => q.id === result.question.id);
            if (currentIndex === -1) currentIndex = 0;

            const subProgKey = `progress_${currentSubject.id}_${mode}`;
            const savedProg = localStorage.getItem(subProgKey);

            let savedAnswers = {};
            if (savedProg) {
                const progObj = JSON.parse(savedProg);
                savedAnswers = progObj.answers || {};

                if (Array.isArray(savedAnswers)) {
                    userAnswers = [...savedAnswers];
                } else {
                    userAnswers = currentSubject.questions.map(q => savedAnswers[q.id]);
                }
            } else {
                userAnswers = [];
            }

            if (userAnswers[currentIndex] === undefined || userAnswers[currentIndex] === null) {
                userAnswers[currentIndex] = result.question.correct;
            }

            renderStep();
        };
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
                        <div>
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
    document.getElementById('target-year').textContent = year;
    document.getElementById('download-modal').classList.remove('hidden');
}
document.querySelectorAll('.year-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.year-btn').forEach(b => {
            b.className = "year-btn whitespace-nowrap px-6 py-2 rounded-full bg-surface-container text-on-surface-variant font-label-md text-label-md border border-outline-variant hover:border-primary transition-all active:scale-95";
        });
        btn.className = "year-btn whitespace-nowrap px-6 py-2 rounded-full bg-primary text-on-primary font-label-md text-label-md shadow-md active:scale-95 transition-transform";
        openDownloadModal(btn.getAttribute('data-year'));
    });
});

function closeDownloadModal() {
    document.getElementById('download-modal').classList.add('hidden');
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

    const interimBtn = document.getElementById('interim-result-btn');
    if (interimBtn) {
        const questionNumber = currentIndex + 1;
        if (questionNumber % 50 === 0 && questionNumber !== currentSubject.questions.length) {
            interimBtn.classList.remove('hidden');
        } else {
            interimBtn.classList.add('hidden');
        }
    }
}

function showInterimResult() {
    const modal = document.getElementById('interim-modal');
    const statsBox = document.getElementById('interim-stats');

    let score = 0;
    let answered = 0;

    userAnswers.forEach((ans, idx) => {
        if (idx <= currentIndex && ans !== undefined && ans !== null) {
            answered++;
            if (ans === currentSubject.questions[idx].correct) score++;
        }
    });

    const pct = Math.round((score / answered) * 100) || 0;
    statsBox.innerHTML = `
        <div style="font-size:3rem; font-weight:800; color:${pct >= 50 ? '#10b981' : '#ef4444'}">${pct}%</div>
        <p>أجبت على ${score} بشكل صحيح من أصل ${answered} سؤال قمت بحله حتى الآن.</p>
        <p style="font-size: 0.85rem; color: var(--text-muted); margin-top: 10px;">لن يتم مسح أي بيانات. يمكنك المتابعة للسؤال ${currentIndex + 2}.</p>
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
                <h3 style="margin: 5px 0; line-height: 1.4; color: #fff;">${text}</h3>
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
        let score = 0;
        userAnswers.forEach((ans, idx) => {
            if (ans === currentSubject.questions[idx].correct) score++;
        });
        const pct = Math.round((score / currentSubject.questions.length) * 100);
        statsBox.innerHTML = `
            <div style="font-size:3rem; font-weight:800; color:${pct >= 50 ? '#10b981' : '#ef4444'}">${pct}%</div>
            <p>أجبت على ${score} من أصل ${currentSubject.questions.length} بشكل صحيح</p>
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

    const subProgKey = `progress_${currentSubject.id}_${mode}`;
    const savedProg = localStorage.getItem(subProgKey);

    if (savedProg) {
        const prog = JSON.parse(savedProg);
        const savedAnswers = prog.answers || {};

        if (Array.isArray(savedAnswers)) {
            userAnswers = [...savedAnswers];
        } else {
            userAnswers = currentSubject.questions.map(q => savedAnswers[q.id]);
        }

        let restoredIndex = 0;
        if (prog.lastQuestionId) {
            const newIndex = currentSubject.questions.findIndex(q => q.id === prog.lastQuestionId);
            if (newIndex !== -1) restoredIndex = newIndex;
        } else if (prog.index !== undefined) {
            restoredIndex = prog.index;
        }

        currentIndex = restoredIndex;
    } else {
        currentIndex = 0;
        userAnswers = new Array(currentSubject.questions.length).fill(undefined);
    }
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
        subjectList.innerHTML = '';
    }

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
        submitButton.innerHTML = '<span class="material-symbols-outlined"></span><span>حفظ الكلمة</span>';
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
    iconElement.textContent = icon;

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
        submitButton.innerHTML = '<span class="material-symbols-outlined">check</span><span>Update entry</span>';
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
        'https://raw.githubusercontent.com/MostafaAomar/test/main/myOwnDic.json'
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
        loadLocalDictionary();
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

function renderDynamicYears(files, owner, repo) {
    const yearsContainer = document.getElementById('years-container');
    yearsContainer.innerHTML = '';

    const yearGroups = {};
    files.forEach(file => {
        const parts = file.path.split('/');
        if (parts.length > 1) {
            const yearFolder = parts[0];
            if (!yearGroups[yearFolder]) yearGroups[yearFolder] = [];
            yearGroups[yearFolder].push(file);
        }
    });

    let hasData = false;
    VALID_YEARS.forEach(year => {
        const folderName = Object.keys(yearGroups).find(k => k.replace(/\s/g, '').toLowerCase() === year.replace(/\s/g, '').toLowerCase());

        if (folderName && yearGroups[folderName].length > 0) {
            hasData = true;
            const btn = document.createElement('div');
            btn.className = 'subject-btn year-btn';
            btn.innerHTML = `<span style="z-index:2; position:relative;">${year}</span>`;
            btn.onclick = () => loadYearData(year, yearGroups[folderName], owner, repo);
            yearsContainer.appendChild(btn);
        }
    });

    if (!hasData) {
        yearsContainer.innerHTML = "<p style='text-align:center; color:#94a3b8;'>لا توجد بيانات متاحة لأي سنة دراسية حالياً.</p>";
    }
}

async function loadYearData(yearName, files, owner, repo) {
    const subjectList = document.getElementById('subject-list');
    subjectList.classList.remove('hidden');

    const localKey = `year_data_${yearName}`;
    const savedData = localStorage.getItem(localKey);

    if (savedData) {
        quizData = JSON.parse(savedData);
        renderSubjectListWithSync(yearName, files, owner, repo);
    } else {
        subjectList.innerHTML = '<div class="loader" style="text-align: center;">جاري تحميل بيانات السنة لأول مرة...</div>';
        await fetchAndMergeYearData(yearName, files, owner, repo, true);
    }
}

function renderSubjectListWithSync(yearName, files, owner, repo) {
    renderSubjectList();

    const list = document.getElementById('subject-list');

    const header = document.createElement('div');
    header.className = 'year-header';
    header.innerHTML = `
        <h3 style="margin:0;">${yearName}</h3>
        <button onclick="backToYears()" class="small-btn ghost-btn" style="margin:0;">العودة</button>
    `;
    list.insertBefore(header, list.firstChild);

    const syncBtn = document.createElement('div');
    syncBtn.className = 'subject-btn sync-btn';
    syncBtn.innerHTML = `<span>مزامنة وتحديث المواد (Sync) 🔄</span>`;
    syncBtn.onclick = () => {
        syncBtn.innerHTML = `<span>جاري المزامنة... ⏳</span>`;
        fetchAndMergeYearData(yearName, files, owner, repo, false).then(() => {
            syncBtn.innerHTML = `<span>تمت المزامنة بنجاح ✅</span>`;
            setTimeout(() => renderSubjectListWithSync(yearName, files, owner, repo), 1500);
        });
    };
    list.insertBefore(syncBtn, header.nextSibling);
}

function backToYears() {
    const subjectList = document.getElementById('subject-list');
    const yearsContainer = document.getElementById('years-container');

    subjectList.classList.add('hidden');
    subjectList.innerHTML = '';
    yearsContainer.classList.remove('hidden');
    yearsContainer.querySelectorAll('.year-btn').forEach(button => {
        button.classList.remove('active-year');
    });
    quizData = [];
}

async function fetchAndMergeYearData(yearName, files, owner, repo, isFirstTime) {
    let freshData = [];
    for (const file of files) {
        try {
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${file.path}?t=${Date.now()}`;
            const r = await fetch(rawUrl);
            if (!r.ok) continue;
            let content = await r.json();
            const data = Array.isArray(content) ? content[0] : content;

            if (data && data.questions) {
                data.questions.forEach(q => {
                    const combinedStr = q.q + (q.options ? q.options.join('') : '') + (q.correct !== undefined ? q.correct : '');
                    q.id = q.id || 'id_' + simpleHash(combinedStr);
                });
                freshData.push({
                    id: file.path,
                    subject: (data.subject || file.path.replace('.json', '').split('/').pop()).trim(),
                    description: typeof data.description === 'string' ? data.description.trim() : '',
                    lang: data.lang || 'en',
                    questions: data.questions
                });
            }
        } catch (e) { console.warn("Error fetching file", e); }
    }

    if (isFirstTime) {
        quizData = freshData;
    } else {
        freshData.forEach(newSub => {
            const existingSubIndex = quizData.findIndex(oldSub => oldSub.id === newSub.id);
            if (existingSubIndex !== -1) {
                // Replace the existing subject's questions and metadata with the fresh data
                // to ensure the file's order and content are fully respected.
                quizData[existingSubIndex].questions = newSub.questions;
                quizData[existingSubIndex].lang = newSub.lang;
                quizData[existingSubIndex].subject = newSub.subject;
            } else {
                quizData.push(newSub);
            }
        });
    }

    quizData.forEach(subject => {
        ['study', 'quiz'].forEach(m => {
            const progressKey = `progress_${subject.id}_${m}`;
            const savedProgress = localStorage.getItem(progressKey);
            if (savedProgress) {
                try {
                    const prog = JSON.parse(savedProgress);
                    localStorage.setItem(progressKey, JSON.stringify(prog));
                } catch (e) {
                    console.warn("Error restoring progress:", e);
                }
            }
        });
    });

    localStorage.setItem(`year_data_${yearName}`, JSON.stringify(quizData));
    if (isFirstTime) renderSubjectListWithSync(yearName, files, owner, repo);
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

function renderDynamicYears(files, owner, repo) {
    const yearsContainer = document.getElementById('years-container');
    yearsContainer.innerHTML = '';

    const yearGroups = {};
    files.forEach(file => {
        const parts = file.path.split('/');
        if (parts.length > 1) {
            const yearFolder = parts[0];
            if (!yearGroups[yearFolder]) yearGroups[yearFolder] = [];
            yearGroups[yearFolder].push(file);
        }
    });

    let hasData = false;
    VALID_YEARS.forEach(year => {
        const folderName = Object.keys(yearGroups).find(k => k.replace(/\s/g, '').toLowerCase() === year.replace(/\s/g, '').toLowerCase());

        if (folderName && yearGroups[folderName].length > 0) {
            hasData = true;
            const btn = document.createElement('div');
            btn.className = 'subject-btn year-btn';
            btn.innerHTML = `<span style="z-index:2; position:relative;">${year}</span>`;
            btn.onclick = () => loadYearData(year, yearGroups[folderName], owner, repo);
            yearsContainer.appendChild(btn);
        }
    });

    if (!hasData) {
        yearsContainer.innerHTML = "<p style='text-align:center; color:#94a3b8;'>لا توجد بيانات متاحة لأي سنة دراسية حالياً.</p>";
    }
}

async function loadYearData(yearName, files, owner, repo) {
    const subjectList = document.getElementById('subject-list');
    subjectList.classList.remove('hidden');

    const localKey = `year_data_${yearName}`;
    const savedData = localStorage.getItem(localKey);

    if (savedData) {
        quizData = JSON.parse(savedData);
        renderSubjectListWithSync(yearName, files, owner, repo); // عرض المواد مباشرة من الذاكرة
    } else {
        subjectList.innerHTML = '<div class="loader" style="text-align: center;">جاري تحميل بيانات السنة لأول مرة...</div>';
        await fetchAndMergeYearData(yearName, files, owner, repo, true);
    }
}

function renderSubjectListWithSync(yearName, files, owner, repo) {
    renderSubjectList();

    const list = document.getElementById('subject-list');

    const header = document.createElement('div');
    header.className = 'year-header';
    header.innerHTML = `
        <h3 style="margin:0;">${yearName}</h3>
        <button onclick="backToYears()" class="small-btn ghost-btn" style="margin:0;">العودة</button>
    `;
    list.insertBefore(header, list.firstChild);

    const syncBtn = document.createElement('div');
    syncBtn.className = 'subject-btn sync-btn';
    syncBtn.innerHTML = `<span>مزامنة وتحديث المواد (Sync) 🔄</span>`;
    syncBtn.onclick = () => {
        syncBtn.innerHTML = `<span>جاري المزامنة... ⏳</span>`;
        fetchAndMergeYearData(yearName, files, owner, repo, false).then(() => {
            syncBtn.innerHTML = `<span>تمت المزامنة بنجاح ✅</span>`;
            setTimeout(() => renderSubjectListWithSync(yearName, files, owner, repo), 1500);
        });
    };
    list.insertBefore(syncBtn, header.nextSibling);
}

function backToYears() {
    const subjectList = document.getElementById('subject-list');
    const yearsContainer = document.getElementById('years-container');

    subjectList.classList.add('hidden');
    subjectList.innerHTML = '';
    yearsContainer.classList.remove('hidden');
    yearsContainer.querySelectorAll('.year-btn').forEach(button => {
        button.classList.remove('active-year');
    });
    quizData = [];
}

async function fetchAndMergeYearData(yearName, files, owner, repo, isFirstTime) {
    let freshData = [];
    for (const file of files) {
        try {
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${file.path}?t=${Date.now()}`;
            const r = await fetch(rawUrl);
            if (!r.ok) continue;
            let content = await r.json();
            const data = Array.isArray(content) ? content[0] : content;

            if (data && data.questions) {
                data.questions.forEach(q => {
                    const combinedStr = q.q + (q.options ? q.options.join('') : '') + (q.correct !== undefined ? q.correct : '');
                    q.id = q.id || 'id_' + simpleHash(combinedStr);
                });
                freshData.push({
                    id: file.path,
                    subject: (data.subject || file.path.replace('.json', '').split('/').pop()).trim(),
                    description: typeof data.description === 'string' ? data.description.trim() : '',
                    lang: data.lang || 'en',
                    questions: data.questions
                });
            }
        } catch (e) { console.warn("Error fetching file", e); }
    }

    if (isFirstTime) {
        quizData = freshData;
    } else {
        freshData.forEach(newSub => {
            const existingSubIndex = quizData.findIndex(oldSub => oldSub.id === newSub.id);
            if (existingSubIndex !== -1) {
                // Replace the existing subject's questions and metadata with the fresh data
                // to ensure the file's order and content are fully respected.
                quizData[existingSubIndex].questions = newSub.questions;
                quizData[existingSubIndex].lang = newSub.lang;
                quizData[existingSubIndex].subject = newSub.subject;
            } else {
                quizData.push(newSub);
            }
        });
    }

    quizData.forEach(subject => {
        ['study', 'quiz'].forEach(m => {
            const progressKey = `progress_${subject.id}_${m}`;
            const savedProgress = localStorage.getItem(progressKey);
            if (savedProgress) {
                try {
                    const prog = JSON.parse(savedProgress);
                    localStorage.setItem(progressKey, JSON.stringify(prog));
                } catch (e) {
                    console.warn("Error restoring progress:", e);
                }
            }
        });
    });

    localStorage.setItem(`year_data_${yearName}`, JSON.stringify(quizData));
    if (isFirstTime) renderSubjectListWithSync(yearName, files, owner, repo);
}
