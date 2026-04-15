// ============================================
// FITTRACK - ACTIVITY TRACKER APP
// ============================================

(function checkAuth() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const publicPages = ['auth.html', 'offline.html'];

    if (publicPages.includes(currentPage)) return;

    const token = localStorage.getItem('fittrack_token');
    const guest = localStorage.getItem('fittrack_guest') === 'true';

    if (!token && !guest) {
        window.location.href = '/auth.html';
    }
})();

// ============================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ============================================

const App = {
    state: {
        isTracking: false,
        isPaused: false,
        steps: 0,
        calories: 0,
        distance: 0,
        startTime: null,
        pauseTime: 0,
        totalPauseTime: 0,
        timerInterval: null,
        accelerometer: null,
        lastAcceleration: { x: 0, y: 0, z: 0 },
        stepThreshold: 12,
        lastStepTime: 0,
        minStepInterval: 300,
        activityData: [],
        maxDataPoints: 50,
        currentActivity: 'walk',
        soundEnabled: true
    },

    data: {
        user: {
            name: 'Атлет',
            age: 25,
            weight: 70,
            height: 175,
            gender: 'male',
            dailyGoal: 10000,
            calorieGoal: 500,
            timeGoal: 60,
            avatar: ''
        },
        notes: [],
        tasks: [],
        sessions: [],
        settings: {
            notifications: true,
            sound: true,
            darkMode: false,
            units: 'metric'
        }
    }
};

// ============================================
// УТИЛИТЫ И ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

const Utils = {
    formatTime(seconds) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    },

    formatDate(date) {
        const options = { day: 'numeric', month: 'long' };
        return date.toLocaleDateString('ru-RU', options);
    },

    formatFullDate(date) {
        return date.toLocaleString('ru-RU');
    },

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    save(key, value) {
        localStorage.setItem(`fittrack_${key}`, JSON.stringify(value));
    },

    load(key, defaultValue = null) {
        const data = localStorage.getItem(`fittrack_${key}`);
        return data ? JSON.parse(data) : defaultValue;
    },

    playSound(type) {
        if (!App.data.settings.sound) return;

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        switch (type) {
            case 'step':
                oscillator.frequency.value = 800;
                gainNode.gain.value = 0.1;
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.05);
                break;
            case 'start':
                oscillator.frequency.value = 600;
                gainNode.gain.value = 0.2;
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.2);
                break;
            case 'stop':
                oscillator.frequency.value = 400;
                gainNode.gain.value = 0.2;
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.3);
                break;
            case 'goal':
                oscillator.frequency.value = 1200;
                gainNode.gain.value = 0.3;
                oscillator.start();
                oscillator.stop(audioContext.currentTime + 0.5);
                break;
        }
    },

    checkSensors() {
        return 'DeviceMotionEvent' in window || 'Accelerometer' in window;
    },

    async requestMotionPermission() {
        if (
            typeof DeviceMotionEvent !== 'undefined' &&
            typeof DeviceMotionEvent.requestPermission === 'function'
        ) {
            try {
                const response = await DeviceMotionEvent.requestPermission();
                return response === 'granted';
            } catch (e) {
                console.error('Permission error:', e);
                return false;
            }
        }
        return true;
    }
};

// ============================================
// ДАННЫЕ ПОЛЬЗОВАТЕЛЯ И АВАТАР
// ============================================

function applySavedUser() {
    const savedUser = JSON.parse(localStorage.getItem('fittrack_user') || 'null');
    if (!savedUser) return;

    if (savedUser.name) {
        App.data.user.name = savedUser.name;
    }

    if (savedUser.avatar) {
        App.data.user.avatar = savedUser.avatar;
    }

    updateUserNameUI();
    renderAvatar();
}

function updateUserNameUI() {
    const userNameEl = document.getElementById('userName');
    if (userNameEl) userNameEl.textContent = App.data.user.name;

    const profileNameEl = document.getElementById('profileName');
    if (profileNameEl) profileNameEl.textContent = App.data.user.name;
}

function syncUserToLocalStorage() {
    const existing = JSON.parse(localStorage.getItem('fittrack_user') || '{}');
    const updated = {
        ...existing,
        name: App.data.user.name,
        avatar: App.data.user.avatar || ''
    };
    localStorage.setItem('fittrack_user', JSON.stringify(updated));
}

function renderAvatar() {
    const avatarImg = document.getElementById('userAvatarImage');
    const avatarPlaceholder = document.getElementById('userAvatarPlaceholder');
    const avatarContainer = document.getElementById('userAvatar');

    if (avatarImg) {
        if (App.data.user.avatar) {
            avatarImg.src = App.data.user.avatar;
            avatarImg.style.display = 'block';
        } else {
            avatarImg.removeAttribute('src');
            avatarImg.style.display = 'none';
        }
    }

    if (avatarPlaceholder) {
        avatarPlaceholder.style.display = App.data.user.avatar ? 'none' : 'flex';
    }

    if (avatarContainer) {
        avatarContainer.classList.toggle('has-image', Boolean(App.data.user.avatar));
    }
}

function bindAvatarInput() {
    const avatarInput = document.getElementById('avatarInput');
    if (!avatarInput || avatarInput.dataset.bound === 'true') return;

    avatarInput.dataset.bound = 'true';

    avatarInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showNotification('Выберите изображение');
            avatarInput.value = '';
            return;
        }

        try {
            const resizedImage = await resizeAvatar(file, 512);
            App.data.user.avatar = resizedImage;
            DataManager.saveAll();
            syncUserToLocalStorage();
            renderAvatar();
            showNotification('Фото профиля обновлено');
        } catch (error) {
            console.error('Avatar upload error:', error);
            showNotification('Не удалось загрузить фото');
        }

        avatarInput.value = '';
    });
}

function changeAvatar() {
    const avatarInput = document.getElementById('avatarInput');
    if (avatarInput) avatarInput.click();
}

function removeAvatar() {
    App.data.user.avatar = '';
    DataManager.saveAll();
    syncUserToLocalStorage();
    renderAvatar();
    showNotification('Фото профиля удалено');
}

function resizeAvatar(file, size = 512) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => {
            const img = new Image();

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                canvas.width = size;
                canvas.height = size;

                const minSide = Math.min(img.width, img.height);
                const sx = (img.width - minSide) / 2;
                const sy = (img.height - minSide) / 2;

                ctx.clearRect(0, 0, size, size);
                ctx.drawImage(
                    img,
                    sx, sy, minSide, minSide,
                    0, 0, size, size
                );

                resolve(canvas.toDataURL('image/png'));
            };

            img.onerror = reject;
            img.src = event.target.result;
        };

        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function logout() {
    localStorage.removeItem('fittrack_token');
    localStorage.removeItem('fittrack_guest');
    localStorage.removeItem('fittrack_user');
    window.location.href = '/auth.html';
}

// ============================================
// УПРАВЛЕНИЕ ДАННЫМИ
// ============================================

const DataManager = {
    init() {
        const user = Utils.load('user');
        if (user) App.data.user = { ...App.data.user, ...user };

        const notes = Utils.load('notes', []);
        App.data.notes = notes;

        const tasks = Utils.load('tasks', []);
        App.data.tasks = tasks;

        const sessions = Utils.load('sessions', []);
        App.data.sessions = sessions;

        const settings = Utils.load('settings');
        if (settings) App.data.settings = { ...App.data.settings, ...settings };

        this.applyTheme();

        const currentSession = Utils.load('currentSession');
        if (currentSession && currentSession.isTracking) {
            this.restoreSession(currentSession);
        }
    },

    applyTheme() {
        const isDark = App.data.settings.darkMode;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    },

    saveAll() {
        Utils.save('user', App.data.user);
        Utils.save('notes', App.data.notes);
        Utils.save('tasks', App.data.tasks);
        Utils.save('sessions', App.data.sessions);
        Utils.save('settings', App.data.settings);
    },

    saveCurrentSession() {
        Utils.save('currentSession', {
            isTracking: App.state.isTracking,
            isPaused: App.state.isPaused,
            steps: App.state.steps,
            calories: App.state.calories,
            distance: App.state.distance,
            startTime: App.state.startTime,
            pauseTime: App.state.pauseTime,
            totalPauseTime: App.state.totalPauseTime
        });
    },

    restoreSession(session) {
        App.state.steps = session.steps || 0;
        App.state.calories = session.calories || 0;
        App.state.distance = session.distance || 0;
        App.state.startTime = session.startTime;
        App.state.pauseTime = session.pauseTime;
        App.state.totalPauseTime = session.totalPauseTime || 0;

        if (session.isTracking && !session.isPaused) {
            setTimeout(() => startTracking(true), 500);
        }
    },

    addNote(note) {
        note.id = Utils.generateId();
        note.createdAt = new Date().toISOString();
        App.data.notes.unshift(note);
        Utils.save('notes', App.data.notes);
        return note;
    },

    updateNote(id, updates) {
        const index = App.data.notes.findIndex(n => n.id === id);
        if (index !== -1) {
            App.data.notes[index] = { ...App.data.notes[index], ...updates };
            Utils.save('notes', App.data.notes);
            return true;
        }
        return false;
    },

    deleteNote(id) {
        App.data.notes = App.data.notes.filter(n => n.id !== id);
        Utils.save('notes', App.data.notes);
    },

    addTask(task) {
        task.id = Utils.generateId();
        task.createdAt = new Date().toISOString();
        task.completed = false;
        App.data.tasks.unshift(task);
        Utils.save('tasks', App.data.tasks);
        return task;
    },

    updateTask(id, updates) {
        const index = App.data.tasks.findIndex(t => t.id === id);
        if (index !== -1) {
            App.data.tasks[index] = { ...App.data.tasks[index], ...updates };
            Utils.save('tasks', App.data.tasks);
            return true;
        }
        return false;
    },

    toggleTask(id) {
        const task = App.data.tasks.find(t => t.id === id);
        if (task) {
            task.completed = !task.completed;
            task.completedAt = task.completed ? new Date().toISOString() : null;
            Utils.save('tasks', App.data.tasks);
            return task.completed;
        }
        return null;
    },

    deleteTask(id) {
        App.data.tasks = App.data.tasks.filter(t => t.id !== id);
        Utils.save('tasks', App.data.tasks);
    },

    saveSession(session) {
        session.id = Utils.generateId();
        session.date = new Date().toISOString();
        App.data.sessions.unshift(session);
        Utils.save('sessions', App.data.sessions);

        this.checkAchievements();
        localStorage.removeItem('fittrack_currentSession');
    },

    checkAchievements() {
        const totalSteps = App.data.sessions.reduce((sum, s) => sum + s.steps, 0);
        const completedTasks = App.data.tasks.filter(t => t.completed).length;

        const achievements = Utils.load('achievements', {
            firstSteps: false,
            marathon: false,
            weekStreak: false,
            master: false
        });

        if (totalSteps >= 1000) achievements.firstSteps = true;
        if (completedTasks >= 3) achievements.marathon = true;
        if (totalSteps >= 100000) achievements.master = true;

        Utils.save('achievements', achievements);
        return achievements;
    },

    getAchievements() {
        return Utils.load('achievements', {
            firstSteps: false,
            marathon: false,
            weekStreak: false,
            master: false
        });
    },

    getStats(period = 'week') {
        const now = new Date();
        const sessions = App.data.sessions;

        let startDate;
        switch (period) {
            case 'day':
                startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                break;
            case 'week':
                startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case 'month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'year':
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
            default:
                startDate = new Date(0);
        }

        const filtered = sessions.filter(s => new Date(s.date) >= startDate);

        return {
            totalSteps: filtered.reduce((sum, s) => sum + (s.steps || 0), 0),
            totalCalories: filtered.reduce((sum, s) => sum + (s.calories || 0), 0),
            totalDistance: filtered.reduce((sum, s) => sum + (s.distance || 0), 0),
            totalTime: filtered.reduce((sum, s) => sum + (s.duration || 0), 0),
            sessions: filtered
        };
    },

    getTodayStats() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todaySessions = App.data.sessions.filter(s => {
            const sessionDate = new Date(s.date);
            return sessionDate >= today;
        });

        return {
            steps: todaySessions.reduce((sum, s) => sum + s.steps, 0) + App.state.steps,
            calories: todaySessions.reduce((sum, s) => sum + s.calories, 0) + App.state.calories,
            distance: todaySessions.reduce((sum, s) => sum + s.distance, 0) + App.state.distance,
            time: todaySessions.reduce((sum, s) => sum + s.duration, 0)
        };
    }
};

// ============================================
// ТРЕКЕР АКТИВНОСТИ
// ============================================

const ActivityTracker = {
    init() {
        if ('Accelerometer' in window) {
            try {
                App.state.accelerometer = new Accelerometer({ frequency: 60 });
                App.state.accelerometer.addEventListener('reading', this.handleAccelerometer.bind(this));
                App.state.accelerometer.start();
                return true;
            } catch (e) {
                console.log('Generic Sensor API не доступен');
            }
        }

        if ('DeviceMotionEvent' in window) {
            window.addEventListener('devicemotion', this.handleDeviceMotion.bind(this));
            return true;
        }

        return false;
    },

    handleAccelerometer() {
        if (!App.state.isTracking || App.state.isPaused) return;

        const x = App.state.accelerometer.x || 0;
        const y = App.state.accelerometer.y || 0;
        const z = App.state.accelerometer.z || 0;

        this.processMotion(x, y, z);
    },

    handleDeviceMotion(event) {
        if (!App.state.isTracking || App.state.isPaused) return;

        const acc = event.accelerationIncludingGravity || event.acceleration;
        if (!acc) return;

        const x = acc.x || 0;
        const y = acc.y || 0;
        const z = acc.z || 0;

        this.processMotion(x, y, z);
    },

    processMotion(x, y, z) {
        const magnitude = Math.sqrt(x * x + y * y + z * z);

        App.state.activityData.push(magnitude);
        if (App.state.activityData.length > App.state.maxDataPoints) {
            App.state.activityData.shift();
        }

        this.updateGraph();
        this.detectActivityType(magnitude);

        const now = Date.now();
        const diff = Math.abs(magnitude - 9.8);

        if (diff > App.state.stepThreshold && (now - App.state.lastStepTime) > App.state.minStepInterval) {
            this.registerStep();
            App.state.lastStepTime = now;
        }

        App.state.lastAcceleration = { x, y, z };
    },

    registerStep() {
        App.state.steps++;

        const calorieMultiplier = App.state.currentActivity === 'run' ? 0.075 : 0.04;
        App.state.calories = Math.round(App.state.steps * calorieMultiplier * (App.data.user.weight / 70));

        const strideLength = App.data.user.height * 0.414 / 100;
        const activityMultiplier = App.state.currentActivity === 'run' ? 1.2 : 1;
        App.state.distance = parseFloat((App.state.steps * strideLength * activityMultiplier / 1000).toFixed(2));

        if (App.state.steps % 100 === 0) {
            Utils.playSound('step');
        }

        if (App.state.steps === App.data.user.dailyGoal) {
            Utils.playSound('goal');
            this.showGoalNotification();
        }

        this.updateDisplay();
        DataManager.saveCurrentSession();
    },

    detectActivityType(magnitude) {
        const diff = Math.abs(magnitude - 9.8);
        const typeEl = document.getElementById('activityType');
        if (!typeEl) return;

        let type = 'Ожидание';
        let typeClass = '';

        if (diff < 2) {
            type = 'Покой';
            typeClass = 'rest';
        } else if (diff < 8) {
            type = App.state.currentActivity === 'walk' ? 'Ходьба' : 'Активность';
            typeClass = 'walk';
        } else if (diff < 15) {
            type = 'Бег';
            typeClass = 'run';
        } else {
            type = 'Спринт';
            typeClass = 'sprint';
        }

        typeEl.textContent = type;
        typeEl.className = 'activity-type ' + typeClass;
    },

    updateGraph() {
        const canvas = document.getElementById('activityCanvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width = canvas.offsetWidth;
        const height = canvas.height = canvas.offsetHeight;

        ctx.clearRect(0, 0, width, height);

        if (App.state.activityData.length < 2) return;

        const maxVal = Math.max(...App.state.activityData, 20);
        const minVal = Math.min(...App.state.activityData, 0);
        const range = maxVal - minVal || 1;

        ctx.strokeStyle = 'rgba(128,128,128,0.2)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
            const y = (height / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, '#38ef7d');
        gradient.addColorStop(1, '#11998e');

        ctx.strokeStyle = gradient;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        App.state.activityData.forEach((val, i) => {
            const x = (width / (App.state.maxDataPoints - 1)) * i;
            const y = height - ((val - minVal) / range) * height * 0.8 - height * 0.1;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        ctx.fillStyle = 'rgba(56, 239, 125, 0.1)';
        ctx.beginPath();
        ctx.moveTo(0, height);
        App.state.activityData.forEach((val, i) => {
            const x = (width / (App.state.maxDataPoints - 1)) * i;
            const y = height - ((val - minVal) / range) * height * 0.8 - height * 0.1;
            ctx.lineTo(x, y);
        });
        ctx.lineTo(width, height);
        ctx.closePath();
        ctx.fill();
    },

    updateDisplay() {
        const stepsEl = document.getElementById('steps');
        if (stepsEl) stepsEl.textContent = App.state.steps.toLocaleString('ru-RU');

        const caloriesEl = document.getElementById('calories');
        if (caloriesEl) caloriesEl.textContent = App.state.calories;

        const distanceEl = document.getElementById('distance');
        if (distanceEl) distanceEl.textContent = App.state.distance.toFixed(2);

        if (App.state.startTime) {
            const elapsed = (Date.now() - App.state.startTime - App.state.totalPauseTime) / 1000 / 60;
            const pace = elapsed > 0 ? Math.round(App.state.steps / elapsed) : 0;
            const paceEl = document.getElementById('pace');
            if (paceEl) paceEl.textContent = pace;
        }

        const stepRing = document.getElementById('stepRing');
        if (stepRing) {
            const circumference = 565.487;
            const progress = Math.min(App.state.steps / App.data.user.dailyGoal, 1);
            const offset = circumference - (progress * circumference);
            stepRing.style.strokeDashoffset = offset;
        }
    },

    updateTimer() {
        if (!App.state.startTime || App.state.isPaused) return;

        const now = Date.now();
        const elapsed = Math.floor((now - App.state.startTime - App.state.totalPauseTime) / 1000);

        const timerEl = document.getElementById('timer');
        if (timerEl) {
            timerEl.textContent = Utils.formatTime(elapsed);
        }
    },

    showGoalNotification() {
        console.log('🎉 Цель достигнута!');
    },

    stop() {
        if (App.state.accelerometer) {
            App.state.accelerometer.stop();
            App.state.accelerometer = null;
        }
        window.removeEventListener('devicemotion', this.handleDeviceMotion);
    }
};

// ============================================
// ГЛАВНАЯ СТРАНИЦА
// ============================================

function updateDashboard() {
    const stats = DataManager.getTodayStats();

    const progressPercent = Math.min(Math.round((stats.steps / App.data.user.dailyGoal) * 100), 100);
    const progressEl = document.getElementById('progressPercent');
    if (progressEl) progressEl.textContent = progressPercent + '%';

    const todayStepsEl = document.getElementById('todaySteps');
    if (todayStepsEl) todayStepsEl.textContent = stats.steps.toLocaleString('ru-RU');

    const dailyGoalEl = document.getElementById('dailyGoal');
    if (dailyGoalEl) dailyGoalEl.textContent = App.data.user.dailyGoal.toLocaleString('ru-RU');

    const ring = document.getElementById('progressRing');
    if (ring) {
        const circumference = 339.292;
        const offset = circumference - (progressPercent / 100) * circumference;
        ring.style.strokeDashoffset = offset;
    }

    const dashSteps = document.getElementById('dashSteps');
    if (dashSteps) dashSteps.textContent = stats.steps.toLocaleString('ru-RU');

    const dashCalories = document.getElementById('dashCalories');
    if (dashCalories) dashCalories.textContent = stats.calories;

    const dashDistance = document.getElementById('dashDistance');
    if (dashDistance) dashDistance.textContent = stats.distance.toFixed(1);

    const dashTime = document.getElementById('dashTime');
    if (dashTime) dashTime.textContent = Math.floor(stats.time / 60);

    updateUserNameUI();
    updateDashboardTasks();
}

function updateDashboardTasks() {
    const container = document.getElementById('tasksPreview');
    if (!container) return;

    const today = new Date().toISOString().split('T')[0];
    const todayTasks = App.data.tasks
        .filter(t => t.date === today || !t.date)
        .slice(0, 3);

    if (todayTasks.length === 0) {
        container.innerHTML = '<p style="opacity:0.6;text-align:center;padding:20px;">Нет задач на сегодня</p>';
        return;
    }

    container.innerHTML = todayTasks.map(task => `
        <div class="task-item-mini ${task.completed ? 'completed' : ''}" onclick="toggleDashboardTask('${task.id}')">
            <span class="task-check">${task.completed ? '✓' : ''}</span>
            <span class="task-text">${escapeHtml(task.title)}</span>
        </div>
    `).join('');
}

function toggleDashboardTask(id) {
    const completed = DataManager.toggleTask(id);
    if (completed !== null) {
        updateDashboardTasks();
        Utils.playSound(completed ? 'goal' : 'step');
    }
}

function updateDate() {
    const dateEl = document.getElementById('currentDate');
    if (dateEl) {
        const options = { weekday: 'long', day: 'numeric', month: 'long' };
        dateEl.textContent = new Date().toLocaleDateString('ru-RU', options);
    }
}

// ============================================
// СТРАНИЦА АКТИВНОСТИ
// ============================================

async function initActivityPage() {
    const dateInput = document.getElementById('taskDate');
    if (dateInput) {
        dateInput.valueAsDate = new Date();
    }

    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            App.state.currentActivity = btn.dataset.type;
        });
    });

    if (
        typeof DeviceMotionEvent !== 'undefined' &&
        typeof DeviceMotionEvent.requestPermission === 'function'
    ) {
        const modal = document.getElementById('permissionModal');
        if (modal) modal.classList.add('show');
    }
}

async function requestPermission() {
    const granted = await Utils.requestMotionPermission();
    if (granted) {
        document.getElementById('permissionModal').classList.remove('show');
    } else {
        alert('Для работы трекера необходимо разрешение на доступ к датчикам');
    }
}

function closeModal() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('show'));
}

async function startTracking(resume = false) {
    if (!resume) {
        if (
            typeof DeviceMotionEvent !== 'undefined' &&
            typeof DeviceMotionEvent.requestPermission === 'function'
        ) {
            const granted = await Utils.requestMotionPermission();
            if (!granted) return;
        }
    }

    if (!ActivityTracker.init()) {
        alert('Датчики движения не поддерживаются');
        return;
    }

    App.state.isTracking = true;
    App.state.isPaused = false;

    if (!resume) {
        App.state.startTime = Date.now();
        App.state.steps = 0;
        App.state.calories = 0;
        App.state.distance = 0;
        App.state.totalPauseTime = 0;
        App.state.activityData = [];
    }

    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const stopBtn = document.getElementById('stopBtn');

    if (startBtn) startBtn.classList.add('hidden');
    if (pauseBtn) pauseBtn.classList.remove('hidden');
    if (stopBtn) stopBtn.classList.remove('hidden');

    const statusBadge = document.getElementById('statusBadge');
    if (statusBadge) {
        statusBadge.innerHTML = '<span class="status-dot" style="background: #2ecc71;"></span><span>Активно</span>';
    }

    Utils.playSound('start');

    App.state.timerInterval = setInterval(() => {
        ActivityTracker.updateTimer();
        ActivityTracker.updateDisplay();
    }, 1000);

    DataManager.saveCurrentSession();
}

function pauseTracking() {
    App.state.isPaused = !App.state.isPaused;

    const btn = document.getElementById('pauseBtn');
    if (App.state.isPaused) {
        App.state.pauseTime = Date.now();
        if (btn) {
            btn.innerHTML = '<span class="btn-icon-large">▶</span><span>ПРОДОЛЖИТЬ</span>';
            btn.classList.remove('btn-pause');
            btn.classList.add('btn-start');
        }

        const statusBadge = document.getElementById('statusBadge');
        if (statusBadge) {
            statusBadge.innerHTML = '<span class="status-dot" style="background: #f39c12;"></span><span>Пауза</span>';
        }
    } else {
        App.state.totalPauseTime += Date.now() - App.state.pauseTime;
        if (btn) {
            btn.innerHTML = '<span class="btn-icon-large">⏸</span><span>ПАУЗА</span>';
            btn.classList.remove('btn-start');
            btn.classList.add('btn-pause');
        }

        const statusBadge = document.getElementById('statusBadge');
        if (statusBadge) {
            statusBadge.innerHTML = '<span class="status-dot" style="background: #2ecc71;"></span><span>Активно</span>';
        }
    }

    DataManager.saveCurrentSession();
}

function stopTracking() {
    App.state.isTracking = false;
    App.state.isPaused = false;

    clearInterval(App.state.timerInterval);
    ActivityTracker.stop();

    const duration = Math.floor((Date.now() - App.state.startTime - App.state.totalPauseTime) / 1000);
    DataManager.saveSession({
        steps: App.state.steps,
        calories: App.state.calories,
        distance: App.state.distance,
        duration: duration,
        activity: App.state.currentActivity
    });

    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const stopBtn = document.getElementById('stopBtn');

    if (startBtn) startBtn.classList.remove('hidden');
    if (pauseBtn) pauseBtn.classList.add('hidden');
    if (stopBtn) stopBtn.classList.add('hidden');

    const statusBadge = document.getElementById('statusBadge');
    if (statusBadge) {
        statusBadge.innerHTML = '<span class="status-dot" style="background: #95a5a6;"></span><span>Завершено</span>';
    }

    Utils.playSound('stop');

    setTimeout(() => {
        if (statusBadge) {
            statusBadge.innerHTML = '<span class="status-dot"></span><span>Готов к старту</span>';
        }
        const timer = document.getElementById('timer');
        if (timer) timer.textContent = '00:00:00';
        const activityType = document.getElementById('activityType');
        if (activityType) activityType.textContent = 'Ожидание';
    }, 3000);
}

function resetTracking() {
    if (confirm('Сбросить текущий прогресс?')) {
        App.state.steps = 0;
        App.state.calories = 0;
        App.state.distance = 0;
        App.state.startTime = null;
        App.state.activityData = [];

        ActivityTracker.updateDisplay();
        ActivityTracker.updateGraph();

        const timer = document.getElementById('timer');
        if (timer) timer.textContent = '00:00:00';
        const activityType = document.getElementById('activityType');
        if (activityType) activityType.textContent = 'Ожидание';
    }
}

function toggleSound() {
    App.data.settings.sound = !App.data.settings.sound;
    Utils.save('settings', App.data.settings);
    if (window.event && window.event.target) {
        window.event.target.textContent = App.data.settings.sound ? '🔊' : '🔇';
    }
}

// ============================================
// СТРАНИЦА ЗАМЕТОК
// ============================================

let currentMood = 3;

function initNotesPage() {
    renderNotes();

    document.querySelectorAll('.tag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderNotes(btn.dataset.tag);
        });
    });

    document.querySelectorAll('.mood-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMood = parseInt(btn.dataset.mood);
        });
    });
}

function renderNotes(filter = 'all') {
    const container = document.getElementById('notesList');
    const emptyState = document.getElementById('emptyNotes');

    if (!container) return;

    let notes = App.data.notes;
    if (filter !== 'all') {
        notes = notes.filter(n => n.tag === filter);
    }

    if (notes.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    container.innerHTML = notes.map(note => `
        <div class="note-card" onclick="editNote('${note.id}')">
            <div class="note-header">
                <span class="note-title">${escapeHtml(note.title)}</span>
                <span class="note-date">${formatDateShort(note.createdAt)}</span>
            </div>
            <p class="note-preview">${escapeHtml(note.content)}</p>
            <div class="note-footer">
                <span class="note-tag">${getTagLabel(note.tag)}</span>
                <span class="note-mood">${getMoodEmoji(note.mood)}</span>
            </div>
        </div>
    `).join('');
}

function openNoteModal(noteId = null) {
    const modal = document.getElementById('noteModal');
    const title = document.getElementById('noteModalTitle');
    const form = document.getElementById('noteForm');

    if (!modal) return;

    if (noteId) {
        const note = App.data.notes.find(n => n.id === noteId);
        if (note) {
            if (title) title.textContent = 'Редактировать заметку';
            document.getElementById('noteId').value = note.id;
            document.getElementById('noteTitle').value = note.title;
            document.getElementById('noteTag').value = note.tag;
            document.getElementById('noteContent').value = note.content;
            currentMood = note.mood || 3;
        }
    } else {
        if (title) title.textContent = 'Новая заметка';
        if (form) form.reset();
        document.getElementById('noteId').value = '';
        currentMood = 3;
    }

    document.querySelectorAll('.mood-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.mood) === currentMood);
    });

    modal.classList.add('show');
}

function closeNoteModal() {
    const modal = document.getElementById('noteModal');
    if (modal) modal.classList.remove('show');
}

function saveNote(event) {
    event.preventDefault();

    const id = document.getElementById('noteId').value;
    const noteData = {
        title: document.getElementById('noteTitle').value,
        tag: document.getElementById('noteTag').value,
        content: document.getElementById('noteContent').value,
        mood: currentMood
    };

    if (id) {
        DataManager.updateNote(id, noteData);
    } else {
        DataManager.addNote(noteData);
    }

    closeNoteModal();
    renderNotes();
}

function editNote(id) {
    openNoteModal(id);
}

function deleteNote(id) {
    if (confirm('Удалить эту заметку?')) {
        DataManager.deleteNote(id);
        renderNotes();
    }
}

function searchNotes() {
    const query = document.getElementById('noteSearch').value.toLowerCase();
    const container = document.getElementById('notesList');

    if (!query) {
        renderNotes();
        return;
    }

    const filtered = App.data.notes.filter(n =>
        n.title.toLowerCase().includes(query) ||
        n.content.toLowerCase().includes(query)
    );

    container.innerHTML = filtered.map(note => `
        <div class="note-card" onclick="editNote('${note.id}')">
            <div class="note-header">
                <span class="note-title">${escapeHtml(note.title)}</span>
                <span class="note-date">${formatDateShort(note.createdAt)}</span>
            </div>
            <p class="note-preview">${escapeHtml(note.content)}</p>
            <div class="note-footer">
                <span class="note-tag">${getTagLabel(note.tag)}</span>
                <span class="note-mood">${getMoodEmoji(note.mood)}</span>
            </div>
        </div>
    `).join('');
}

// ============================================
// СТРАНИЦА ЗАДАЧ
// ============================================

let currentTaskFilter = 'all';

function initTasksPage() {
    renderTasks();
    updateTaskStats();

    const dateInput = document.getElementById('taskDate');
    if (dateInput) {
        dateInput.valueAsDate = new Date();
    }
}

function renderTasks(filter = currentTaskFilter) {
    currentTaskFilter = filter;
    const container = document.getElementById('tasksList');
    const emptyState = document.getElementById('emptyTasks');

    if (!container) return;

    let tasks = App.data.tasks;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekLater = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

    switch (filter) {
        case 'today':
            tasks = tasks.filter(t => {
                const taskDate = new Date(t.date);
                return taskDate >= today && taskDate < new Date(today.getTime() + 24 * 60 * 60 * 1000);
            });
            break;
        case 'week':
            tasks = tasks.filter(t => {
                const taskDate = new Date(t.date);
                return taskDate >= today && taskDate <= weekLater;
            });
            break;
        case 'completed':
            tasks = tasks.filter(t => t.completed);
            break;
    }

    tasks.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return new Date(a.date) - new Date(b.date);
    });

    if (tasks.length === 0) {
        container.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    container.innerHTML = tasks.map(task => `
        <div class="task-card ${task.completed ? 'completed' : ''}" data-id="${task.id}">
            <div class="task-checkbox" onclick="toggleTaskStatus('${task.id}')">
                ${task.completed ? '✓' : ''}
            </div>
            <div class="task-info" onclick="editTask('${task.id}')">
                <div class="task-title">${escapeHtml(task.title)}</div>
                <div class="task-meta">
                    <span>${formatDateShort(task.date)}</span>
                    <span class="task-priority ${task.priority}">${getPriorityLabel(task.priority)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function updateTaskStats() {
    const completed = App.data.tasks.filter(t => t.completed).length;
    const pending = App.data.tasks.filter(t => !t.completed).length;
    const total = App.data.tasks.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    const completedEl = document.getElementById('completedTasks');
    const pendingEl = document.getElementById('pendingTasks');
    const progressEl = document.getElementById('tasksProgress');
    const progressTextEl = document.getElementById('tasksProgressText');

    if (completedEl) completedEl.textContent = completed;
    if (pendingEl) pendingEl.textContent = pending;
    if (progressEl) progressEl.style.width = percent + '%';
    if (progressTextEl) progressTextEl.textContent = percent + '% выполнено';
}

function filterTasks(filter) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (window.event && window.event.target) {
        window.event.target.classList.add('active');
    }
    renderTasks(filter);
}

function openTaskModal(taskId = null) {
    const modal = document.getElementById('taskModal');
    const title = document.getElementById('taskModalTitle');
    const form = document.getElementById('taskForm');

    if (!modal) return;

    if (taskId) {
        const task = App.data.tasks.find(t => t.id === taskId);
        if (task) {
            if (title) title.textContent = 'Редактировать задачу';
            document.getElementById('taskId').value = task.id;
            document.getElementById('taskTitle').value = task.title;
            document.getElementById('taskCategory').value = task.category;
            document.getElementById('taskPriority').value = task.priority;
            document.getElementById('taskDate').value = task.date;
            document.getElementById('taskTime').value = task.time || '';
            document.getElementById('taskDescription').value = task.description || '';
        }
    } else {
        if (title) title.textContent = 'Новая задача';
        if (form) form.reset();
        document.getElementById('taskId').value = '';
        document.getElementById('taskDate').valueAsDate = new Date();
    }

    modal.classList.add('show');
}

function closeTaskModal() {
    const modal = document.getElementById('taskModal');
    if (modal) modal.classList.remove('show');
}

function saveTask(event) {
    event.preventDefault();

    const id = document.getElementById('taskId').value;
    const taskData = {
        title: document.getElementById('taskTitle').value,
        category: document.getElementById('taskCategory').value,
        priority: document.getElementById('taskPriority').value,
        date: document.getElementById('taskDate').value,
        time: document.getElementById('taskTime').value,
        description: document.getElementById('taskDescription').value
    };

    if (id) {
        DataManager.updateTask(id, taskData);
    } else {
        DataManager.addTask(taskData);
    }

    closeTaskModal();
    renderTasks();
    updateTaskStats();
    updateDashboardTasks();
}

function toggleTaskStatus(id) {
    if (window.event) window.event.stopPropagation();
    const completed = DataManager.toggleTask(id);
    if (completed !== null) {
        renderTasks();
        updateTaskStats();
        updateDashboardTasks();
        if (completed) Utils.playSound('goal');
    }
}

function editTask(id) {
    openTaskModal(id);
}

function deleteTask(id) {
    if (confirm('Удалить эту задачу?')) {
        DataManager.deleteTask(id);
        renderTasks();
        updateTaskStats();
        updateDashboardTasks();
    }
}

// ============================================
// СТРАНИЦА СТАТИСТИКИ
// ============================================

let currentPeriod = 'week';
let currentChartMetric = 'steps';

function initStatsPage() {
    updateStats();
    renderMainChart();
    renderStatsTable();
    renderAchievements();

    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPeriod = btn.dataset.period;
            updateStats();
            renderMainChart();
            renderStatsTable();
        });
    });

    const chartMetricEl = document.getElementById('chartMetric');
    if (chartMetricEl) {
        chartMetricEl.addEventListener('change', (e) => {
            currentChartMetric = e.target.value;
            renderMainChart();
        });
    }
}

function updateStats() {
    const stats = DataManager.getStats(currentPeriod);

    const totalStepsEl = document.getElementById('totalSteps');
    const totalCaloriesEl = document.getElementById('totalCalories');
    const totalDistanceEl = document.getElementById('totalDistance');
    const totalTimeEl = document.getElementById('totalTime');

    if (totalStepsEl) totalStepsEl.textContent = stats.totalSteps.toLocaleString('ru-RU');
    if (totalCaloriesEl) totalCaloriesEl.textContent = stats.totalCalories.toLocaleString('ru-RU');
    if (totalDistanceEl) totalDistanceEl.textContent = stats.totalDistance.toFixed(1);
    if (totalTimeEl) totalTimeEl.textContent = Math.floor(stats.totalTime / 3600);
}

function renderMainChart() {
    const canvas = document.getElementById('mainChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, width, height);

    const data = generateChartData();
    if (data.length === 0 || data.every(d => d.value === 0)) {
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || 'rgba(255,255,255,0.3)';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Нет данных за этот период', width / 2, height / 2);
        return;
    }

    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const maxVal = Math.max(...data.map(d => d.value), 1);

    ctx.strokeStyle = 'rgba(128,128,128,0.15)';
    ctx.lineWidth = 1;

    for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        const value = Math.round(maxVal - (maxVal / 5) * i);
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || 'rgba(255,255,255,0.5)';
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(value.toString(), padding.left - 10, y);
    }

    const barCount = data.length;
    const barSpacing = chartWidth / barCount;
    const barWidth = barSpacing * 0.7;

    data.forEach((item, i) => {
        const barHeight = (item.value / maxVal) * chartHeight;
        const x = padding.left + i * barSpacing + (barSpacing - barWidth) / 2;
        const y = padding.top + chartHeight - barHeight;

        const gradient = ctx.createLinearGradient(0, y, 0, padding.top + chartHeight);
        gradient.addColorStop(0, '#667eea');
        gradient.addColorStop(1, '#764ba2');

        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.fillRect(x + 2, y + 2, barWidth, barHeight);

        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, barWidth, barHeight);

        ctx.beginPath();
        ctx.moveTo(x + 4, y);
        ctx.lineTo(x + barWidth - 4, y);
        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + 4);
        ctx.lineTo(x + barWidth, y + barHeight);
        ctx.lineTo(x, y + barHeight);
        ctx.lineTo(x, y + 4);
        ctx.quadraticCurveTo(x, y, x + 4, y);
        ctx.fill();

        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || 'rgba(255,255,255,0.7)';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        let label = item.label;
        if (label.length > 3 && data.length > 7) {
            label = label.substring(0, 3);
        }

        ctx.fillText(label, x + barWidth / 2, padding.top + chartHeight + 10);
    });

    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();

    data.forEach((item, i) => {
        const barHeight = (item.value / maxVal) * chartHeight;
        const x = padding.left + i * barSpacing + barSpacing / 2;
        const y = padding.top + chartHeight - barHeight;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
}

function generateChartData() {
    const stats = DataManager.getStats(currentPeriod);
    const sessions = stats.sessions;
    const days = getDaysForPeriod(currentPeriod);
    const grouped = {};

    days.forEach(day => {
        grouped[day] = 0;
    });

    sessions.forEach(s => {
        const date = new Date(s.date);
        const key = formatDateKey(date, currentPeriod);
        if (grouped.hasOwnProperty(key)) {
            switch (currentChartMetric) {
                case 'steps':
                    grouped[key] += s.steps;
                    break;
                case 'calories':
                    grouped[key] += s.calories;
                    break;
                case 'distance':
                    grouped[key] += s.distance;
                    break;
            }
        }
    });

    return days.map(day => ({
        label: day,
        value: grouped[day] || 0
    }));
}

function getDaysForPeriod(period) {
    const days = [];
    const now = new Date();

    switch (period) {
        case 'day':
            for (let i = 0; i < 24; i += 4) {
                days.push(`${i}:00`);
            }
            break;
        case 'week':
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
                days.push(d.toLocaleDateString('ru-RU', { weekday: 'short' }));
            }
            break;
        case 'month':
            for (let i = 0; i < 4; i++) {
                days.push(`Нед ${i + 1}`);
            }
            break;
        case 'year':
            for (let i = 0; i < 12; i++) {
                days.push(new Date(2024, i).toLocaleDateString('ru-RU', { month: 'short' }));
            }
            break;
    }

    return days;
}

function formatDateKey(date, period) {
    if (period === 'week') {
        return date.toLocaleDateString('ru-RU', { weekday: 'short' });
    }
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function renderStatsTable() {
    const tbody = document.getElementById('statsTableBody');
    if (!tbody) return;

    const stats = DataManager.getStats(currentPeriod);
    const sessions = stats.sessions.slice(0, 7);

    if (sessions.length === 0) {
        tbody.innerHTML = '<div class="table-row"><span style="grid-column:span 4;text-align:center;opacity:0.6;padding:20px;">Нет данных</span></div>';
        return;
    }

    tbody.innerHTML = sessions.map(s => `
        <div class="table-row">
            <span>${formatDateShort(s.date)}</span>
            <span>${s.steps.toLocaleString('ru-RU')}</span>
            <span>${s.calories}</span>
            <span>${s.distance.toFixed(1)}</span>
        </div>
    `).join('');
}

function renderAchievements() {
    const totalSteps = App.data.sessions.reduce((sum, s) => sum + s.steps, 0);
    const completedTasks = App.data.tasks.filter(t => t.completed).length;

    const cards = document.querySelectorAll('.achievement-card');

    cards.forEach(card => {
        const name = card.querySelector('.achievement-name').textContent;
        let unlocked = false;

        if (name === 'Первые шаги' && totalSteps >= 1000) unlocked = true;
        if (name === 'Марафонец' && completedTasks >= 3) unlocked = true;
        if (name === 'Неделя активности' && App.data.sessions.length >= 7) unlocked = true;
        if (name === 'Мастер' && totalSteps >= 100000) unlocked = true;

        if (unlocked) {
            card.classList.add('unlocked');
        }
    });
}

function exportData() {
    const data = {
        user: App.data.user,
        sessions: App.data.sessions,
        notes: App.data.notes,
        tasks: App.data.tasks,
        exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fittrack_export_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showNotification('Данные экспортированы!');
}

// ============================================
// СТРАНИЦА ПРОФИЛЯ
// ============================================

function initProfilePage() {
    const nameEl = document.getElementById('settingsName');
    const ageEl = document.getElementById('settingsAge');
    const weightEl = document.getElementById('settingsWeight');
    const heightEl = document.getElementById('settingsHeight');
    const genderEl = document.getElementById('settingsGender');

    if (nameEl) nameEl.value = App.data.user.name;
    if (ageEl) ageEl.value = App.data.user.age;
    if (weightEl) weightEl.value = App.data.user.weight;
    if (heightEl) heightEl.value = App.data.user.height;
    if (genderEl) genderEl.value = App.data.user.gender;

    const goalStepsEl = document.getElementById('goalSteps');
    const goalCaloriesEl = document.getElementById('goalCalories');
    const goalTimeEl = document.getElementById('goalTime');

    if (goalStepsEl) goalStepsEl.value = App.data.user.dailyGoal;
    if (goalCaloriesEl) goalCaloriesEl.value = App.data.user.calorieGoal;
    if (goalTimeEl) goalTimeEl.value = App.data.user.timeGoal;

    const notifEl = document.getElementById('settingNotifications');
    const soundEl = document.getElementById('settingSound');
    const darkModeEl = document.getElementById('settingDarkMode');
    const unitsEl = document.getElementById('settingUnits');

    if (notifEl) notifEl.checked = App.data.settings.notifications;
    if (soundEl) soundEl.checked = App.data.settings.sound;
    if (darkModeEl) darkModeEl.checked = App.data.settings.darkMode;
    if (unitsEl) unitsEl.value = App.data.settings.units;

    if (darkModeEl) {
        darkModeEl.addEventListener('change', (e) => {
            App.data.settings.darkMode = e.target.checked;
            Utils.save('settings', App.data.settings);
            DataManager.applyTheme();

            setTimeout(() => {
                ActivityTracker.updateGraph();
                renderMainChart();
            }, 100);

            showNotification(e.target.checked ? 'Тёмная тема включена' : 'Светлая тема включена');
        });
    }

    updateUserNameUI();
    renderAvatar();
    bindAvatarInput();
}

function saveProfile() {
    App.data.user.name = document.getElementById('settingsName').value || 'Атлет';
    App.data.user.age = parseInt(document.getElementById('settingsAge').value) || 25;
    App.data.user.weight = parseInt(document.getElementById('settingsWeight').value) || 70;
    App.data.user.height = parseInt(document.getElementById('settingsHeight').value) || 175;
    App.data.user.gender = document.getElementById('settingsGender').value;

    App.data.user.dailyGoal = parseInt(document.getElementById('goalSteps').value) || 10000;
    App.data.user.calorieGoal = parseInt(document.getElementById('goalCalories').value) || 500;
    App.data.user.timeGoal = parseInt(document.getElementById('goalTime').value) || 60;

    App.data.settings.notifications = document.getElementById('settingNotifications').checked;
    App.data.settings.sound = document.getElementById('settingSound').checked;
    App.data.settings.units = document.getElementById('settingUnits').value;

    DataManager.saveAll();
    syncUserToLocalStorage();
    updateUserNameUI();
    showNotification('Профиль сохранен!');
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (data.user) App.data.user = { ...App.data.user, ...data.user };
                if (data.sessions) App.data.sessions = data.sessions;
                if (data.notes) App.data.notes = data.notes;
                if (data.tasks) App.data.tasks = data.tasks;
                DataManager.saveAll();
                syncUserToLocalStorage();
                showNotification('Данные импортированы!');
                location.reload();
            } catch (err) {
                alert('Ошибка импорта: неверный формат файла');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function clearAllData() {
    if (confirm('ВНИМАНИЕ: Это удалит ВСЕ данные. Продолжить?')) {
        localStorage.clear();
        location.reload();
    }
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDateShort(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    if (diff < 24 * 60 * 60 * 1000 && date.getDate() === now.getDate()) {
        return 'Сегодня';
    } else if (diff < 48 * 60 * 60 * 1000 && date.getDate() === now.getDate() - 1) {
        return 'Вчера';
    }

    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function getTagLabel(tag) {
    const labels = {
        workout: '💪 Тренировка',
        diet: '🥗 Питание',
        health: '❤️ Здоровье',
        goals: '🎯 Цели',
        other: '📝 Другое'
    };
    return labels[tag] || tag;
}

function getMoodEmoji(mood) {
    const moods = ['😢', '😕', '😐', '🙂', '😄'];
    return moods[(mood || 3) - 1] || '😐';
}

function getPriorityLabel(priority) {
    const labels = {
        high: 'Высокий',
        medium: 'Средний',
        low: 'Низкий'
    };
    return labels[priority] || priority;
}

function showNotification(message) {
    const existing = document.querySelector('.notification-toast');
    if (existing) existing.remove();

    const div = document.createElement('div');
    div.className = 'notification-toast';
    div.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--success);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        z-index: 10000;
        animation: slideDown 0.3s ease;
        font-weight: 500;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    div.textContent = message;
    document.body.appendChild(div);

    setTimeout(() => {
        div.style.animation = 'slideUp 0.3s ease';
        setTimeout(() => div.remove(), 300);
    }, 3000);
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    DataManager.init();
    applySavedUser();

    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideDown {
            from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
            to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
        @keyframes slideUp {
            from { transform: translateX(-50%) translateY(0); opacity: 1; }
            to { transform: translateX(-50%) translateY(-100%); opacity: 0; }
        }
        .hidden { display: none !important; }
        .show { display: flex !important; }

        [data-theme="light"] select,
        [data-theme="light"] input,
        [data-theme="light"] textarea {
            background: #e8ecf1;
            color: #1a1a2e;
        }

        [data-theme="light"] select option {
            background: white;
            color: #1a1a2e;
        }

        select, input, textarea {
            color: var(--text-primary);
        }

        option {
            background: var(--bg-dark);
            color: var(--text-primary);
        }

        [data-theme="light"] option {
            background: white;
            color: #1a1a2e;
        }
    `;
    document.head.appendChild(style);

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.innerHTML = `
        <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#11998e;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#38ef7d;stop-opacity:1" />
            </linearGradient>
        </defs>
    `;
    document.body.appendChild(svg);
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => {
                console.log('Service Worker зарегистрирован:', reg.scope);
            })
            .catch(err => {
                console.error('Ошибка регистрации Service Worker:', err);
            });
    });
}