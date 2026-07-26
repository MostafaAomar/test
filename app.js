/* ==========================================
   1. المتغيرات وإدارة الحالة (State Management)
   ========================================== */
const USE_LOCAL_TEST_FILE = false;

let quizData = [];
let currentSubject = null;
let currentIndex = 0;
let userAnswers = [];
let mode = ''; 
let currentSpeed = 0.8;

const DEFAULT_REPO_URL = 'https://github.com/MostafaAomar/test';

const screens = {
    setup: document.getElementById('setup-screen'),
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
        if(screen) screen.classList.add('hidden');
    });
    if (screens[name]) {
        screens[name].classList.remove('hidden');
        window.scrollTo(0, 0); 
    }
}

// دالة المحافظة على ترتيب الأسئلة وإضافة الأسئلة الجديدة للنهاية
function applyUserQuestionOrder(subject, currentMode) {
    if (!subject || !subject.questions) return;
    const subProgKey = `progress_${subject.id}_${currentMode}`;
    const savedProg = localStorage.getItem(subProgKey);
    if (!savedProg) return;

    try {
        const parsed = JSON.parse(savedProg);
        const savedOrder = parsed.questionOrder || [];

        if (savedOrder.length > 0) {
            const knownQuestionsMap = {};
            const newQuestions = [];

            // فرز الأسئلة إلى "معروفة تاريخياً" و "جديدة مضافة"
            subject.questions.forEach(q => {
                if (savedOrder.includes(q.id)) {
                    knownQuestionsMap[q.id] = q;
                } else {
                    newQuestions.push(q);
                }
            });

            // إعادة بناء القائمة بحيث تحافظ على الترتيب القديم بدقة
            const reconstructedQuestions = [];
            savedOrder.forEach(id => {
                if (knownQuestionsMap[id]) {
                    reconstructedQuestions.push(knownQuestionsMap[id]);
                }
            });

            // وضع الأسئلة الجديدة في ذيل القائمة لكي لا تقطع استمرارية المستخدم
            subject.questions = [...reconstructedQuestions, ...newQuestions];
        }
    } catch (e) {
        console.error("Error applying user question order:", e);
    }
}

function saveDetailedProgress() {
    if (!currentSubject) return;

    const subjectId = currentSubject.id;
    const lastQuestionId = currentSubject.questions[currentIndex]?.id || null;
    
    // حفظ مكان التوقف العام
    const lastState = { subjectId: subjectId, mode: mode, lastQuestionId: lastQuestionId };
    localStorage.setItem('app_last_position', JSON.stringify(lastState));

    const subjectProgressKey = `progress_${subjectId}_${mode}`;
    
    // حفظ الإجابات باستخدام المعرفات بدلاً من الخانات
    const progressToSave = {};
    userAnswers.forEach((answer, index) => {
        const questionId = currentSubject.questions[index]?.id;
        if (questionId !== undefined && answer !== undefined && answer !== null) {
            progressToSave[questionId] = answer;
        }
    });

    // التقاط الترتيب الحالي للأسئلة لحفظه (هذا ما كان مفقوداً في النسخة السابقة)
    const currentOrder = currentSubject.questions.map(q => q.id);

    const progressData = { 
        lastQuestionId: lastQuestionId, 
        index: currentIndex, // For backward compatibility
        answers: progressToSave,
        questionOrder: currentOrder // حفظ الترتيب ضروري لمنع القفزات
    };
    localStorage.setItem(subjectProgressKey, JSON.stringify(progressData));
}

/* ==========================================
   3. التحميل والتهيئة التلقائية (Initialization)
   ========================================== */
async function init() {
    showWelcomeMessage();

    const loadingDiv = document.querySelector('.loader');

    if (USE_LOCAL_TEST_FILE) {
        console.log("--- وضع الاختبار المحلي مفعل ---");
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

                // تطبيق ترتيب المستخدم أولاً قبل البحث عن مكان التوقف
                applyUserQuestionOrder(currentSubject, mode);

                let restoredIndex = 0;
                if (pos.lastQuestionId) {
                    const newIndex = currentSubject.questions.findIndex(q => q.id === pos.lastQuestionId);
                    if (newIndex !== -1) {
                        restoredIndex = newIndex;
                    }
                }
                currentIndex = restoredIndex;
                
                const subProgKey = `progress_${currentSubject.id}_${mode}`;
                const savedProg = localStorage.getItem(subProgKey);
                if (savedProg) {
                    const parsedProg = JSON.parse(savedProg);
                    const savedAnswers = parsedProg.answers || {};
                    
                    // توافقية رجعية (Backward compatibility) لاستعادة التقدم القديم
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
        #welcome-message small { font-size: 0.8em; opacity: 0.7; display: block; }
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

// Replace the existing fetchRepoAndAddSubjects in app.js
async function fetchRepoAndAddSubjects(repoUrl) {
    let cleanUrl = repoUrl.replace('https://github.com/', '').split('/tree/')[0]; 
    if (cleanUrl.endsWith('.git')) cleanUrl = cleanUrl.slice(0, -4); 
    const parts = cleanUrl.split('/');
    if (parts.length < 2) return;

    const owner = parts[0];
    const repo = parts[1];
    
    // Check if we have cached tree for offline support
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
        // معامل إلغاء الكاش لضمان تحديث الملف فور تعديله
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

    let percentage = (maxProgress / totalQuestions) * 100;
    return Math.min(100, Math.max(0, percentage));
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
                    // الاعتماد على محتوى السؤال في الـ ID
                    // إذا تغير المحتوى (نص السؤال أو الخيارات)، سيتغير الـ ID وسيصبح سؤالاً جديداً
                    const combinedStr = q.q + (q.options ? q.options.join('') : '') + (q.correct !== undefined ? q.correct : '');
q.id = q.id || 'id_' + simpleHash(combinedStr);
                });

                quizData.push({
                    id: fileName, 
                    subject: (data.subject || fileName.replace('.json', '').split('/').pop()).trim(),
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
            
            // تطبيق ترتيب المستخدم أولاً
            applyUserQuestionOrder(currentSubject, mode);
            
            // إيجاد مكان السؤال بعد إعادة الترتيب
            currentIndex = currentSubject.questions.findIndex(q => q.id === result.question.id);
            if(currentIndex === -1) currentIndex = 0;

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

function renderAllSubjects(container) {
    container.innerHTML = "";
    if (quizData.length === 0) {
        container.innerHTML = "<p style='text-align:center; color:#94a3b8;'>لا توجد مواد متاحة حالياً.</p>";
        return;
    }
    
    quizData.forEach((data, index) => {
        const btn = document.createElement('div');
        btn.className = 'subject-btn';
        const progressPercent = getSubjectProgress(data.id, data.questions.length);
        btn.innerHTML = `
            <span style="z-index:2; position:relative;">${data.subject}</span>
            <div class="subject-progress-line" style="width: ${progressPercent}%"></div>
        `;
        btn.onclick = () => {
            currentSubject = quizData[index];
            document.getElementById('selected-subject-name').innerText = currentSubject.subject;
            showScreen('mode');
        };
        container.appendChild(btn);
    });
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
    document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

    updateProgress();
    displayNotes();
    saveDetailedProgress();

    const studyArea = document.getElementById('study-displayArea');
    const quizArea = document.getElementById('quiz-displayArea');
    if(studyArea) studyArea.innerHTML = "";
    if(quizArea) quizArea.innerHTML = "";

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

    // NEW LOGIC: Milestone button every 50 questions
    const interimBtn = document.getElementById('interim-result-btn');
    if (interimBtn) {
        const questionNumber = currentIndex + 1;
        // Show if multiple of 50, OR if we previously passed 50 and want to keep it visible on the 50th index
        if (questionNumber % 50 === 0 && questionNumber !== currentSubject.questions.length) {
            interimBtn.classList.remove('hidden');
        } else {
            interimBtn.classList.add('hidden');
        }
    }
}

// Add this new function to handle the milestone click
function showInterimResult() {
    const modal = document.getElementById('interim-modal');
    const statsBox = document.getElementById('interim-stats');
    
    // Calculate score up to current point
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
        btn.style.color = "#6ee7b7";
    } else if (index === selectedIndex && selectedIndex !== correctIndex) {
        btn.style.backgroundColor = "rgba(239, 68, 68, 0.2)";
        btn.style.borderColor = "#ef4444";
        btn.style.color = "#fca5a5";
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
    
    if(!displayArea) return;

    displayArea.innerHTML = '<div style="text-align:center; padding:20px; color:var(--primary);">جاري معالجة النطق المتصل...</div>';
    
    playFullSentence(text);

    const words = text.split(/\s+/);
    let ipaParts = [];

    for(let word of words) {
        const clean = word.replace(/[^\w]/g, '');
        if(clean) {
            try {
                const resp = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${clean}`);
                const data = await resp.json();
                let phonetic = data[0]?.phonetic || (data[0]?.phonetics?.find(p => p.text)?.text) || clean;
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
    if(inner) inner.classList.toggle('is-flipped');
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
    if(!statsBox) return;
    
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
    mode = m;
    
    // تطبيق الترتيب وتثبيته فور اختيار النمط وقبل حساب الاندكس
    applyUserQuestionOrder(currentSubject, mode);

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
    saveDetailedProgress(); 
    currentSubject = null;
    showScreen('setup');
}

function restartSubject() {
    if(confirm("هل تريد إعادة هذه المادة من البداية؟")) {
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
    if(confirm("⚠️ تحذير: سيتم حذف كافة الملاحظات والتقدم المخزن. هل أنت متأكد؟")) {
        localStorage.clear();
        location.reload();
    }
}

window.onload = init;

/* ==========================================
   8. القاموس المدمج الذكي - (English-English Dictionary)
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
    const wordInput = document.getElementById('wordInput');
    const dictionaryOutput = document.getElementById('dictionaryOutput');

    const localDictionaryPath = 'hhttps://raw.githubusercontent.com/MostafaAomar/school_project/refs/heads/main/data/subdata/myOwnDic.json'; 
    const apiEndpoint = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

    let dictionaryData = []; 
    let isDictionaryLoaded = false;
    let isLoadingDictionary = false;

    async function loadLocalDictionary() {
        try {
            const res = await fetch(localDictionaryPath);
            if (!res.ok) return []; // Silently skip if file doesn't exist
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        } catch (error) {
            console.warn('Dictionary skipped:', error);
            return []; // Return empty array so the app keeps running
        }
    }

    function searchLocalDictionary(word) {
        if (!isDictionaryLoaded || dictionaryData.length === 0) return undefined; 
        const searchTerm = word.trim().toLowerCase();
        return dictionaryData.find(entry => entry.word.toLowerCase() === searchTerm);
    }

    async function searchApiDictionary(word) {
        const searchTerm = word.trim();
        if (!searchTerm) return null;
        dictionaryOutput.innerHTML = '<p class="text-muted" style="text-align:center;">لم يتم العثور عليه محليًا، جار البحث عبر الإنترنت...</p>';

        try {
            const response = await fetch(`${apiEndpoint}${encodeURIComponent(searchTerm)}`);
            if (!response.ok) return null;
            const data = await response.json();
            return (data && data.length > 0) ? data[0] : null;
        } catch (error) {
            return null; 
        }
    }

    function displayDefinition(entryData, searchTerm) {
         if (!dictionaryOutput) return; 

         if (!entryData) {
            dictionaryOutput.innerHTML = `<p class="text-warning" style="text-align:center;">لم يتم العثور على تعريف للكلمة "${escapeHTML(searchTerm)}".</p>`;
            return;
        }

        const word = entryData.word;
        const phoneticText = entryData.phonetics?.find(p => p.text)?.text;
        const audioUrl = entryData.phonetics?.find(p => p.audio)?.audio;

        let html = `<h4 class="mb-2" style="text-align:left; direction:ltr;">${escapeHTML(word)} ${phoneticText ? `<span class="text-muted fs-6">${escapeHTML(phoneticText)}</span>` : ''}</h4>`;

        if (audioUrl) {
            html += `<div class="audio mb-3"><audio controls src="${escapeHTML(audioUrl)}">متصفحك لا يدعم الصوت.</audio></div>`;
        }

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
    }

    async function handleWordSearch() {
        if (!wordInput || !dictionaryOutput) return; 
        const word = wordInput.value.trim();

        if (word.length < 1) { 
            dictionaryOutput.innerHTML = '<p class="text-muted" style="text-align:center;">أدخل كلمة للبحث.</p>';
            return;
        }

        if (!isDictionaryLoaded && !isLoadingDictionary) {
            await loadLocalDictionary(); 
        }

        const localResult = searchLocalDictionary(word);
        if (localResult) {
            displayDefinition(localResult, word);
        } else {
            const apiResult = await searchApiDictionary(word); 
            displayDefinition(apiResult, word); 
        }
    }

    if (wordInput && dictionaryOutput) {
        (async () => {
            dictionaryData = await loadLocalDictionary();
            isDictionaryLoaded = true;
        })();
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



// New Functions for Lazy Loading and Syncing
const VALID_YEARS = ["First Year", "Second Year", "Third Year", "Fourth Year"];

function renderDynamicYears(files, owner, repo) {
    const yearsContainer = document.getElementById('years-container');
    yearsContainer.innerHTML = '';
    
    // Group files by Year folder
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
        // Match standard folder names (e.g., "First Year" or "FirstYear")
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
    document.getElementById('years-container').classList.add('hidden');
    const subjectList = document.getElementById('subject-list');
    subjectList.classList.remove('hidden');
    
    const localKey = `year_data_${yearName}`;
    const savedData = localStorage.getItem(localKey);
    
    if (savedData) {
        quizData = JSON.parse(savedData);
        renderSubjectListWithSync(yearName, files, owner, repo);
    } else {
        // First time downloading this year
        subjectList.innerHTML = '<div class="loader" style="text-align: center;">جاري تحميل بيانات السنة لأول مرة...</div>';
        await fetchAndMergeYearData(yearName, files, owner, repo, true);
    }
}

function renderSubjectListWithSync(yearName, files, owner, repo) {
    renderSubjectList(); // Calls your existing function
    
    const list = document.getElementById('subject-list');
    
    // Inject Year Header and Back Button
    const header = document.createElement('div');
    header.className = 'year-header';
    header.innerHTML = `
        <h3 style="margin:0;">${yearName}</h3>
        <button onclick="backToYears()" class="small-btn ghost-btn" style="margin:0;">العودة</button>
    `;
    list.insertBefore(header, list.firstChild);

    // Inject Sync Button
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
    document.getElementById('subject-list').classList.add('hidden');
    document.getElementById('years-container').classList.remove('hidden');
    quizData = []; // Clear RAM to optimize performance
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
                    lang: data.lang || 'en',
                    questions: data.questions
                });
            }
        } catch (e) { console.warn("Error fetching file", e); }
    }

    if (isFirstTime) {
        quizData = freshData;
    } else {
        // Advanced Merge Mechanism: Preserve local progress completely
        freshData.forEach(newSub => {
            const existingSub = quizData.find(oldSub => oldSub.id === newSub.id);
            if (existingSub) {
                // Merge questions, keeping old ones intact to preserve IDs and progress mapping
                const existingQuestionIds = existingSub.questions.map(q => q.id);
                const newQuestions = newSub.questions.filter(q => !existingQuestionIds.includes(q.id));
                existingSub.questions = [...existingSub.questions, ...newQuestions];
                existingSub.lang = newSub.lang; // Update language if needed
                existingSub.subject = newSub.subject; // Update subject name if needed
            } else {
                quizData.push(newSub); // Entirely new subject added
            }
        });
    }

    // CRITICAL: Restore all saved progress data for each mode (study & quiz)
    quizData.forEach(subject => {
        ['study', 'quiz'].forEach(m => {
            const progressKey = `progress_${subject.id}_${m}`;
            const savedProgress = localStorage.getItem(progressKey);
            if (savedProgress) {
                try {
                    const prog = JSON.parse(savedProgress);
                    // Keep saved progress intact - do NOT overwrite
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
    if(username) localStorage.setItem('sync_username', username);
    if(repo) localStorage.setItem('sync_repo', repo);
    if(token) localStorage.setItem('sync_token', token);

    alert("تم حفظ إعدادات المزامنة بنجاح!");
    toggleSyncSettings();
}


document.addEventListener('mouseup', performSmartSearch);
document.addEventListener('touchend', performSmartSearch);
