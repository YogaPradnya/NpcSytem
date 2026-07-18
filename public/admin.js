const ADMIN_CONFIG = window.NPC_ADMIN_CONFIG || { isAdmin: false, initialPage: 'karakter' };
const TZ_CONFIG = { timeZone: 'Asia/Jakarta', hour12: false };
const LOCALE_ID = 'id-ID';

let allUsers = [];
let characters = [];
let userPage = 1;
let logPage = 1;
let userSearchTimer = null;
let logSearchTimer = null;
let banSearchTimer = null;
let banPage = 1;
let usageChart = null;
let logEventSource = null;
let statsEventSource = null;
let bannedUsers = new Set();
let latestBanList = [];
let charPage = 1;
let charSearchTimer = null;
let activeAutoBanWords = [];
const CHAR_PAGE_SIZE = 30;

const HEART_LEVELS = [
    { key: 'heart_0', title: 'Heart 0', label: 'Baru pertama kali ketemu' },
    { key: 'heart_1', title: 'Heart 1', label: 'Ketemu lagi' },
    { key: 'heart_2', title: 'Heart 2', label: 'Teman' },
    { key: 'heart_3', title: 'Heart 3', label: 'Sahabat' },
    { key: 'heart_4', title: 'Heart 4', label: 'Mulai ada rasa' },
    { key: 'heart_5', title: 'Heart 5', label: 'Cinta' }
];

const sendIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>';

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[ch]));
}

function escapeAttr(value) {
    return escapeHTML(value).replace(/`/g, '&#96;');
}

function jsArg(value) {
    return escapeAttr(JSON.stringify(String(value ?? '')));
}

function normalizeHeartProfiles(raw, base = {}) {
    let source = raw;
    if (typeof source === 'string') {
        try { source = JSON.parse(source); } catch (e) { source = {}; }
    }
    source = source && typeof source === 'object' ? source : {};
    return HEART_LEVELS.reduce((acc, item) => {
        const profile = source[item.key] || {};
        acc[item.key] = {
            description: profile.description || base.npc_description || '',
            speaking_style: profile.speaking_style || base.npc_speaking_style || ''
        };
        return acc;
    }, {});
}

function renderHeartProfileFields() {
    return HEART_LEVELS.map((item, index) => `
        <article class="heart-profile-card">
            <div class="heart-card-top">
                <div class="heart-orb">${index}</div>
                <div>
                    <strong>${item.title}</strong>
                    <small>${item.label}</small>
                </div>
            </div>
            <div class="heart-card-fields">
                <div class="form-group"><label>Description ${item.title}</label><textarea id="f-${item.key}-desc" rows="3" placeholder="Deskripsi karakter saat ${item.label.toLowerCase()}..."></textarea></div>
                <div class="form-group"><label>Speaking Style ${item.title}</label><textarea id="f-${item.key}-style" rows="3" placeholder="Gaya bicara karakter saat ${item.label.toLowerCase()}..."></textarea></div>
            </div>
        </article>
    `).join('');
}

function collectHeartProfiles() {
    return HEART_LEVELS.reduce((acc, item) => {
        acc[item.key] = {
            description: document.getElementById(`f-${item.key}-desc`)?.value || '',
            speaking_style: document.getElementById(`f-${item.key}-style`)?.value || ''
        };
        return acc;
    }, {});
}

function fillHeartProfiles(c = {}) {
    const profiles = normalizeHeartProfiles(c.heart_profiles, c);
    HEART_LEVELS.forEach(item => {
        const desc = document.getElementById(`f-${item.key}-desc`);
        const style = document.getElementById(`f-${item.key}-style`);
        if (desc) desc.value = profiles[item.key].description;
        if (style) style.value = profiles[item.key].speaking_style;
    });
}

function normalizeUsername(value) {
    return String(value ?? '').trim().replace(/^@/, '').toLowerCase();
}

function normalizeAutoBanWords(value = '') {
    return String(value || '')
        .split(/[\n,]+/)
        .map(word => word.trim().toLowerCase())
        .filter(Boolean);
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findAutoBanWord(message, words = activeAutoBanWords) {
    const text = String(message || '').toLowerCase();
    return words.find(word => {
        const pattern = new RegExp(`(^|[^a-z0-9_])${escapeRegex(word)}(?=$|[^a-z0-9_])`, 'i');
        return pattern.test(text);
    }) || null;
}

function nFormatter(num) {
    const value = Number(num) || 0;
    if (value >= 1000000) return (value / 1000000).toFixed(2).replace(/\.00$/, '') + 'M';
    if (value >= 1000) return (value / 1000).toFixed(2).replace(/\.00$/, '') + 'K';
    return value.toLocaleString(LOCALE_ID);
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setTableLoading(id, colspan, label = 'Loading...') {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<tr><td colspan="${colspan}" class="table-state">${escapeHTML(label)}</td></tr>`;
}

function setTableError(id, colspan, label) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<tr><td colspan="${colspan}" class="table-state error">${escapeHTML(label)}</td></tr>`;
}

function apiError(data, fallback) {
    return data?.error || data?.message || fallback;
}

function toggleMobileMenu() {
    document.getElementById('sidebar').classList.toggle('mobile-open');
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('collapsed');
}

function formatBotMsg(msg) {
    if (!msg) return '';
    const cleanMsg = String(msg).replace(/\((.*?)\)|\s*\[(.*?)\]|\*(.*?)\*/g, '').replace(/\s{2,}/g, ' ').trim();
    if (!cleanMsg) return '...';
    return cleanMsg.split(String.fromCharCode(10)).map((s, idx) => (
        '<div style="line-height:1.4">' + (idx === 0 ? '<small style="font-weight:700">A:</small> ' : '') + escapeHTML(s) + '</div>'
    )).join('');
}

function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
    }
}

function showPage(pageId, el) {
    document.querySelectorAll('main > div').forEach(p => {
        p.classList.add('hidden');
        p.classList.remove('animate-fade');
    });
    const target = document.getElementById('page-' + pageId);
    if (target) {
        target.classList.remove('hidden');
        void target.offsetWidth;
        target.classList.add('animate-fade');
    }
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    if (el) el.classList.add('active');
    if (window.innerWidth < 768 && document.getElementById('sidebar').classList.contains('mobile-open')) toggleMobileMenu();

    if (pageId === 'karakter') load();
    if (pageId === 'otak') loadModels();
    if (pageId === 'users') loadUsers(1);
    if (pageId === 'logs') loadLogs(1);
    if (pageId === 'simulator') loadSimSelect();
    if (pageId === 'terminal') initTerminal();
    if (pageId === 'banlist') loadBanList(1);
    refreshIcons();
}

function initTerminal() {
    if (!ADMIN_CONFIG.isAdmin || logEventSource) return;

    const statusEl = document.getElementById('terminal-status');
    if (statusEl) {
        statusEl.textContent = '● CONNECTING...';
        statusEl.style.color = 'var(--info)';
    }

    logEventSource = new EventSource('/api/admin/logs/stream');

    logEventSource.onopen = () => {
        const liveStatusEl = document.getElementById('terminal-status');
        if (liveStatusEl) {
            liveStatusEl.textContent = '● LIVE CONNECTED';
            liveStatusEl.style.color = 'var(--success)';
        }
        appendTerminalLog({ message: 'Engine connection established.', type: 'system' });
    };

    logEventSource.onmessage = (e) => {
        appendTerminalLog(JSON.parse(e.data));
    };

    logEventSource.onerror = () => {
        const statusEl = document.getElementById('terminal-status');
        if (statusEl) {
            statusEl.textContent = '● DISCONNECTED';
            statusEl.style.color = 'var(--danger)';
        }
        logEventSource.close();
        logEventSource = null;
        setTimeout(initTerminal, 5000);
    };
}

function appendTerminalLog(data) {
    const term = document.getElementById('terminal-output');
    if (!term) return;
    if (term.dataset.initialized !== 'true') {
        term.innerHTML = '';
        term.dataset.initialized = 'true';
    }

    const line = document.createElement('div');
    line.className = 'term-line';

    const time = document.createElement('span');
    time.className = 'term-time';
    time.textContent = new Date(data.timestamp || Date.now()).toLocaleTimeString(LOCALE_ID, TZ_CONFIG);

    const type = document.createElement('span');
    const typeName = String(data.type || 'log').toLowerCase().replace(/[^a-z0-9_-]/g, '');
    type.className = 'term-type type-' + typeName;
    type.textContent = typeName;

    const msg = document.createElement('span');
    msg.className = 'term-msg';
    msg.textContent = data.message || '';

    line.append(time, type, msg);
    term.appendChild(line);
    term.scrollTop = term.scrollHeight;

    if (term.children.length > 300) term.removeChild(term.firstChild);
}

function clearTerminal() {
    const term = document.getElementById('terminal-output');
    if (!term) return;
    term.innerHTML = '';
    appendTerminalLog({ message: 'Terminal buffer cleared.', type: 'system' });
}

async function load() {
    setTableLoading('char-body', 4, 'Memuat karakter...');
    try {
        const r = await fetch('/api/characters');
        const d = await r.json();
        if (!r.ok) throw new Error(apiError(d, 'Gagal memuat karakter'));
        characters = d.characters || [];
        window.characters = characters;
        charPage = 1;
        renderCharacters();
    } catch (e) {
        setTableError('char-body', 4, e.message);
    }
}

function getFilteredCharacters() {
    const q = String(document.getElementById('char-search')?.value || '').trim().toLowerCase();
    if (!q) return characters;
    return characters.filter(c => [c.id, c.npc_name]
        .some(value => String(value || '').toLowerCase().includes(q)));
}

function renderCharacters(page = charPage) {
    const b = document.getElementById('char-body');
    if (!b) return;
    const filtered = getFilteredCharacters();
    const totalEl = document.getElementById('char-total');
    if (totalEl) {
        totalEl.textContent = filtered.length === characters.length
            ? `Total: ${characters.length.toLocaleString(LOCALE_ID)} karakter`
            : `Total: ${filtered.length.toLocaleString(LOCALE_ID)} dari ${characters.length.toLocaleString(LOCALE_ID)} karakter`;
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / CHAR_PAGE_SIZE));
    charPage = Math.min(Math.max(1, Number(page) || 1), totalPages);
    const start = (charPage - 1) * CHAR_PAGE_SIZE;
    const visible = filtered.slice(start, start + CHAR_PAGE_SIZE);

    if (!visible.length) {
        b.innerHTML = '<tr><td colspan="4" class="table-state">Tidak ada karakter yang cocok.</td></tr>';
        renderPagination('char-pagination', { page: 1, totalPages: 1, total: filtered.length }, renderCharacters);
        return;
    }
    b.innerHTML = visible.map(c => {
        const id = jsArg(c.id);
        return '<tr>' +
            '<td><b>' + escapeHTML(c.npc_name) + '</b><br><small>' + escapeHTML(c.id) + '</small></td>' +
            '<td>' + (c.is_enabled ? '<span style="color:var(--success); font-weight:600">ON</span>' : 'OFF') + '</td>' +
            '<td><label class="switch"><input type="checkbox" ' + (c.is_enabled ? 'checked' : '') + ' onchange="toggleChar(' + id + ', this.checked)"><span class="slider"></span></label></td>' +
            '<td style="text-align:right">' +
                '<button class="btn btn-outline" style="padding:0.3rem 0.8rem; margin-right:0.5rem" onclick="editChar(' + id + ')">Settings</button>' +
                '<button class="btn-danger" onclick="deleteChar(' + id + ')">Delete</button>' +
            '</td>' +
        '</tr>';
    }).join('');
    renderPagination('char-pagination', { page: charPage, totalPages, total: filtered.length }, renderCharacters);
}

function debouncedRenderCharacters() {
    clearTimeout(charSearchTimer);
    charSearchTimer = setTimeout(() => renderCharacters(1), 180);
}

async function loadModels() {
    const list = document.getElementById('otak-list');
    if (list) list.innerHTML = '<div class="table-state">Memuat status provider...</div>';
    try {
        const r = await fetch('/api/admin/models');
        const d = await r.json();
        if (!r.ok) throw new Error(apiError(d, 'Gagal memuat model'));
        syncModelForm(d.config || {});
        renderModelRows(d);
    } catch (e) {
        if (list) list.innerHTML = '<div class="table-state error">' + escapeHTML(e.message) + '</div>';
    }
}

function syncModelForm(config) {
    const map = {
        'model-primary': config.primaryModel,
        'model-deepinfra-fallback': config.deepinfraFallbackModel || config.primaryModel,
        'model-groq': config.groqFallbackModel,
        'model-cerebras': config.cerebrasFallbackModel,
        'model-novita': config.novitaFallbackModel,
        'model-max-tokens': config.maxTokens,
        'model-temperature': config.temperature
    };
    Object.entries(map).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el && value !== undefined) el.value = value;
    });
}

function renderModelRows(d) {
    const list = document.getElementById('otak-list');
    if (!list) return;
    list.innerHTML = providerGroup('INFRASTRUKTUR GROQ (UTAMA)', d.otak || [], 'GROQ', 'var(--success)') +
        providerGroup('INFRASTRUKTUR CEREBRAS (CADANGAN 1)', d.cerebras || [], 'CEREBRAS', 'var(--info)') +
        providerGroup('INFRASTRUKTUR DEEPINFRA (CADANGAN 2)', d.deepinfra || [], 'DEEPINFRA', 'var(--primary)') +
        providerGroup('INFRASTRUKTUR NOVITA AI (CADANGAN 3)', d.novita || [], 'NOVITA', '#8b5cf6');
}

function providerGroup(title, rows, type, color) {
    return '<h3 class="provider-title">' + escapeHTML(title) + '</h3>' + rows.map(o => {
        const s = o.stats || {};
        const cooldownUntil = o.isCoolingDown ? Date.now() + (o.cooldownRemaining * 1000) : 0;
        const statusText = o.isEnabled ? (o.isCoolingDown ? formatCooldown(o.cooldownRemaining) : 'READY') : 'DISABLED';
        const statusColor = o.isEnabled ? (o.isCoolingDown ? 'var(--warning)' : 'var(--success)') : 'var(--danger)';
        const statusId = 'status-' + type + '-' + o.id;
        return '<div class="otak-row ' + (o.isEnabled ? 'active' : '') + '" style="border-left: 4px solid ' + color + '" data-cooldown-until="' + cooldownUntil + '" data-provider-type="' + type + '" data-provider-id="' + o.id + '">' +
            '<div class="otak-name">' + escapeHTML(type) + ' #' + escapeHTML(o.id) + '</div>' +
            '<div class="otak-stats">' +
                statItem('Reqs', s.requests || 0) +
                statItem('Success', s.success || 0, 'var(--success)') +
                statItem('Errors', s.errors || 0, 'var(--danger)') +
                statItem('In', Number(s.prompt_tokens || 0).toLocaleString()) +
                statItem('Out', Number(s.completion_tokens || 0).toLocaleString()) +
                '<div class="otak-stat-item"><span class="otak-stat-label">Status</span><span id="' + statusId + '" class="otak-stat-value" style="color:' + statusColor + '">' + escapeHTML(statusText) + '</span></div>' +
            '</div>' +
            '<label class="switch"><input type="checkbox" ' + (o.isEnabled ? 'checked' : '') + ' onchange="toggleOtak(' + Number(o.id) + ', this.checked, \'' + type + '\')"><span class="slider"></span></label>' +
        '</div>';
    }).join('');
}

function formatCooldown(seconds) {
    if (seconds <= 0) return 'READY';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
}

function statItem(label, value, color = '') {
    return '<div class="otak-stat-item"><span class="otak-stat-label">' + escapeHTML(label) + '</span><span class="otak-stat-value" ' + (color ? 'style="color:' + color + '"' : '') + '>' + escapeHTML(value) + '</span></div>';
}

async function saveModelConfig() {
    const body = {
        primaryModel: document.getElementById('model-primary').value,
        deepinfraFallbackModel: document.getElementById('model-deepinfra-fallback').value,
        groqFallbackModel: document.getElementById('model-groq').value,
        cerebrasFallbackModel: document.getElementById('model-cerebras').value,
        novitaFallbackModel: document.getElementById('model-novita').value,
        maxTokens: document.getElementById('model-max-tokens').value,
        temperature: document.getElementById('model-temperature').value
    };
    try {
        const r = await fetch('/api/admin/config/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(apiError(d, 'Gagal menyimpan konfigurasi'));
        syncModelForm(d.config || {});
        showToast(d.message, 'success');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function updateModel(modelName) {
    const primary = document.getElementById('model-primary');
    if (primary) primary.value = modelName;
    return saveModelConfig();
}

async function loadLogs(page = 1, options = {}) {
    logPage = page;
    const q = document.getElementById('log-search')?.value || '';
    if (!options.silent) setTableLoading('log-body', 4, 'Memuat log...');
    try {
        const [logRes, banRes, autoBanRes] = await Promise.all([
            fetch('/api/admin/logs?page=' + page + '&q=' + encodeURIComponent(q)),
            fetch('/api/admin/banned-usernames'),
            fetch('/api/admin/auto-ban-words')
        ]);
        const d = await logRes.json();
        const banData = await banRes.json();
        const autoBanData = await autoBanRes.json();
        if (!logRes.ok) throw new Error(apiError(d, 'Gagal memuat log'));
        if (banRes.ok && banData.success) {
            bannedUsers = new Set((banData.usernames || []).map(u => normalizeUsername(u)).filter(Boolean));
        }
        if (autoBanRes.ok && autoBanData.success) {
            activeAutoBanWords = normalizeAutoBanWords(autoBanData.words || '');
        }
        renderLogs(d.logs || []);
        renderPagination('log-pagination', d.pagination, loadLogs);
    } catch (e) {
        setTableError('log-body', 4, e.message);
    }
}

function renderLogs(logs) {
    const b = document.getElementById('log-body');
    if (!b) return;
    if (!logs.length) {
        b.innerHTML = '<tr><td colspan="4" class="table-state">Tidak ada log yang cocok.</td></tr>';
        return;
    }
    b.innerHTML = logs.map(l => {
        const username = String(l.username || '').trim();
        const usernameArg = jsArg(username);
        const isBanned = bannedUsers.has(normalizeUsername(username));
        const matchedFilterWord = findAutoBanWord(l.user_message);
        const filterBadge = matchedFilterWord
            ? `<span style="display:inline-block; margin-top:0.35rem; background:#fff7ed; color:#c2410c; border:1px solid #fed7aa; padding:2px 7px; border-radius:999px; font-size:0.62rem; font-weight:900; letter-spacing:.04em;">FILTER: ${escapeHTML(matchedFilterWord)}</span>`
            : '';
        const actionButton = isBanned
            ? `<button class="btn btn-outline" style="margin-top:0.55rem; padding:0.35rem 0.75rem; font-size:0.7rem; border-radius:8px;" onclick="unbanUser(${usernameArg})">Unban</button>`
            : matchedFilterWord
                ? `<button class="btn btn-danger" style="margin-top:0.55rem; padding:0.35rem 0.75rem; font-size:0.7rem; border-radius:8px; background:#ffedd5; border-color:#fed7aa; color:#c2410c;" onclick="banUser(${usernameArg})">Ban Filter</button>`
                : `<button class="btn btn-danger" style="margin-top:0.55rem; padding:0.35rem 0.75rem; font-size:0.7rem; border-radius:8px;" onclick="banUser(${usernameArg})">Ban</button>`;
        return `<tr>
        <td style="font-size:0.7rem; color:var(--text-muted)">${escapeHTML(new Date(l.timestamp).toLocaleString(LOCALE_ID, TZ_CONFIG))}</td>
        <td>
            <strong>${escapeHTML(String(l.ai_name || '').toUpperCase())}</strong>
            <span style="background:var(--primary); color:#fff; padding:2px 6px; border-radius:4px; font-size:0.6rem; margin-left:4px">${escapeHTML(l.ai_pose || 'idle')}</span>
            <br>
            <span style="color:var(--primary); font-size:0.75rem; font-weight:600">@${escapeHTML(username)}</span>
            <span style="color:var(--text-muted); font-size:0.65rem; font-weight:700">LV.${escapeHTML(l.user_level || 0)}</span>
            <br>${filterBadge}
        </td>
        <td>
            <div class="log-user"><small>U:</small> ${escapeHTML(l.user_message)}</div>
            <div class="log-bot">${formatBotMsg(l.bot_response)}</div>
        </td>
        <td style="text-align:right; font-size:0.7rem; color:var(--text-muted)">
            <div style="font-weight:600; color:var(--text-main)">${escapeHTML(l.tokens || 0)} toks</div>
            <div>${escapeHTML(l.latency || 0)}ms</div>
            ${actionButton}
        </td>
    </tr>`;
    }).join('');
}

function debouncedLoadLogs() {
    clearTimeout(logSearchTimer);
    logSearchTimer = setTimeout(() => loadLogs(1), 250);
}

function filterLogs() {
    debouncedLoadLogs();
}

async function loadUsers(page = 1) {
    userPage = page;
    const q = document.getElementById('user-search')?.value || '';
    setTableLoading('user-body', 3, 'Memuat user...');
    try {
        const r = await fetch('/api/admin/users?page=' + page + '&q=' + encodeURIComponent(q));
        const d = await r.json();
        if (!r.ok) throw new Error(apiError(d, 'Gagal memuat user'));
        allUsers = d.users || [];
        renderUsers(allUsers);
        renderPagination('user-pagination', d.pagination, loadUsers);
    } catch (e) {
        setTableError('user-body', 3, e.message);
    }
}

function renderPagination(id, p, callback) {
    const el = document.getElementById(id);
    if (!el) return;
    if (!p || p.totalPages <= 1) {
        el.innerHTML = '';
        return;
    }

    let html = '';
    if (p.page > 1) html += '<button class="btn btn-outline" style="padding:0.3rem 0.8rem" data-page="' + (p.page - 1) + '">Prev</button>';
    html += '<span style="font-weight:700; color:var(--text-muted); font-size:0.8rem">Page ' + escapeHTML(p.page) + ' of ' + escapeHTML(p.totalPages) + ' - ' + escapeHTML(p.total) + ' rows</span>';
    if (p.page < p.totalPages) html += '<button class="btn btn-outline" style="padding:0.3rem 0.8rem" data-page="' + (p.page + 1) + '">Next</button>';
    el.innerHTML = html;
    el.querySelectorAll('button[data-page]').forEach(btn => {
        btn.addEventListener('click', () => callback(Number(btn.dataset.page)));
    });
}

function renderUsers(users) {
    const b = document.getElementById('user-body');
    if (!b) return;
    if (!users.length) {
        b.innerHTML = '<tr><td colspan="3" class="table-state">Tidak ada user yang cocok.</td></tr>';
        return;
    }
    b.innerHTML = users.map(u => {
        const username = jsArg(u.username);
        return '<tr><td><strong>' + escapeHTML(u.username) + '</strong></td><td>' + escapeHTML(new Date(u.last_seen).toLocaleString(LOCALE_ID, TZ_CONFIG)) + '</td><td style="text-align:right"><button class="btn btn-outline" onclick="viewUserDetail(' + username + ')">View Logs</button></td></tr>';
    }).join('');
}

function debouncedLoadUsers() {
    clearTimeout(userSearchTimer);
    userSearchTimer = setTimeout(() => loadUsers(1), 250);
}

function filterUsers() {
    debouncedLoadUsers();
}

async function viewUserDetail(username) {
    showToast('Fetching logs for ' + username + '...', 'success');
    try {
        const r = await fetch('/api/admin/user-logs/' + encodeURIComponent(username));
        const d = await r.json();
        if (!r.ok) throw new Error(apiError(d, 'Gagal memuat detail user'));
        const userLogs = d.logs || [];

        document.getElementById('log-popup-title').textContent = 'Logs for @' + username;
        const b = document.getElementById('log-popup-body');
        b.innerHTML = userLogs.length ? userLogs.map(l => `<tr>
            <td style="font-size:0.7rem">${escapeHTML(new Date(l.timestamp).toLocaleString(LOCALE_ID, TZ_CONFIG))}</td>
            <td><strong>${escapeHTML(l.ai_name)}</strong></td>
            <td>
                <div class="log-user">U: ${escapeHTML(l.user_message)}</div>
                <div class="log-bot">${formatBotMsg(l.bot_response)}</div>
            </td>
        </tr>`).join('') : '<tr><td colspan="3" class="table-state">No logs found for this user.</td></tr>';
        document.getElementById('modal-logs').style.display = 'flex';
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function closeLogModal() {
    document.getElementById('modal-logs').style.display = 'none';
}

function loadSimSelect() {
    const s = document.getElementById('sim-select');
    if (!s) return;
    s.innerHTML = '';
    const render = list => {
        s.innerHTML = (list || []).filter(c => c.is_enabled).map(c => `<option value="${escapeAttr(c.id)}">${escapeHTML(c.npc_name)}</option>`).join('');
    };
    if (window.characters && window.characters.length > 0) {
        render(window.characters);
    } else {
        fetch('/api/characters').then(r => r.json()).then(d => {
            window.characters = d.characters || [];
            render(window.characters);
        }).catch(() => showToast('Gagal memuat karakter simulator', 'error'));
    }
}

function appendMessage(container, text, className) {
    const msg = document.createElement('div');
    msg.className = 'msg ' + className;
    msg.textContent = text;
    container.appendChild(msg);
}

function clearSimulator() {
    const box = document.getElementById('sim-messages');
    if (box) {
        box.innerHTML = '';
        appendMessage(box, 'Silakan pilih karakter dan ketik pesan untuk mulai simulasi.', 'msg-bot');
    }
    const dbg = document.getElementById('sim-debug-content');
    if (dbg) dbg.innerHTML = '<div class="debug-item">Waiting for interaction...</div>';
    setText('sim-prompt-content', '-');
}

async function sendMessage() {
    const input = document.getElementById('sim-input');
    const text = input.value.trim();
    const heartLv = document.getElementById('sim-heart').value || 0;
    if (!text) return;

    const btn = document.getElementById('sim-send-btn');
    const box = document.getElementById('sim-messages');
    btn.disabled = true;
    btn.textContent = '...';

    appendMessage(box, text, 'msg-user');
    input.value = '';
    box.scrollTop = box.scrollHeight;

    const typingId = 'typing-' + Date.now();
    const typing = document.createElement('div');
    typing.id = typingId;
    typing.className = 'msg msg-bot msg-typing';
    typing.innerHTML = 'NPC sedang mengetik <span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    box.appendChild(typing);
    box.scrollTop = box.scrollHeight;

    try {
        const r = await fetch('/api/npc/v1/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user: { username: 'Yogaa', level: parseInt(heartLv, 10) },
                message: text,
                context: {
                    relationship: {
                        lv5_username: document.getElementById('sim-lv5-owner').value
                    }
                },
                system: { ai_name: document.getElementById('sim-select').value }
            })
        });
        const d = await r.json();
        if (!r.ok) throw new Error(apiError(d, 'Gagal mengambil balasan NPC'));

        document.getElementById(typingId)?.remove();
        appendMessage(box, d.sentences ? d.sentences.join('\n') : 'Error: No response', 'msg-bot');
        box.scrollTop = box.scrollHeight;
        renderSimDebug(d);
    } catch (e) {
        document.getElementById(typingId)?.remove();
        showToast(e.message || 'Gagal terhubung ke engine', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = sendIcon;
    }
}

function renderSimDebug(d) {
    if (!d.debug) return;
    const dbg = document.getElementById('sim-debug-content');
    dbg.innerHTML = `
        <div class="debug-item"><span class="debug-label">Otak Terpilih</span><span class="debug-value">${escapeHTML(d.debug.otak_id)} (${escapeHTML(d.debug.model)})</span></div>
        <div class="debug-item"><span class="debug-label">Total Token</span><span class="debug-value">${escapeHTML(d.debug.tokens)} toks</span></div>
        <div class="debug-item"><span class="debug-label">Kecepatan (Latency)</span><span class="debug-value">${escapeHTML(d.debug.latency)}ms</span></div>
        <div class="debug-item"><span class="debug-label">Ekspresi / Pose</span><span class="debug-value" style="color:var(--primary)">${escapeHTML(d.ai_pose || 'idle')}</span></div>
    `;
    document.getElementById('sim-prompt-content').textContent = d.debug.system_prompt || '-';
}

async function toggleChar(id, enabled) {
    const existing = characters.find(x => x.id === id);
    if (!existing) return;
    try {
        const r = await fetch('/api/characters/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, data: { ...existing, is_enabled: enabled } })
        });
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(d.error || 'Gagal toggle karakter');
        existing.is_enabled = enabled;
        showToast(existing.npc_name + ' ' + (enabled ? 'Enabled' : 'Disabled'), enabled ? 'success' : 'error');
    } catch (e) {
        showToast(e.message, 'error');
        load();
    }
}

async function deleteChar(id) {
    if (confirm('Hapus karakter ' + id + ' secara permanen?')) {
        await fetch('/api/characters/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });
        showToast('Character deleted successfully', 'error');
        load();
    }
}

async function toggleOtak(id, enabled, type = 'GROQ') {
    try {
        const r = await fetch('/api/admin/models/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, enabled, type })
        });
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error(d.error || 'Gagal toggle node');
        showToast(type + ' Node #' + id + ' ' + (enabled ? 'Enabled' : 'Disabled'), enabled ? 'success' : 'error');
    } catch (e) {
        showToast(e.message, 'error');
        loadModels();
    }
}

function openModal(id = null) {
    document.getElementById('modal').style.display = 'flex';
    const heartFields = document.getElementById('heart-profile-fields');
    if (heartFields) heartFields.innerHTML = renderHeartProfileFields();
    const idInput = document.getElementById('f-id');
    if (id) {
        const c = characters.find(x => x.id === id);
        if (c) {
            idInput.value = c.id;
            idInput.disabled = true;
            document.getElementById('f-name').value = c.npc_name || '';
            document.getElementById('f-desc').value = c.npc_description || '';
            document.getElementById('f-pers').value = c.npc_personality || '';
            document.getElementById('f-style').value = c.npc_speaking_style || '';
            document.getElementById('f-signature').value = c.signature_style || '';
            document.getElementById('f-background').value = c.character_background || '';
            fillHeartProfiles(c);
            document.getElementById('m-title').textContent = 'NPC Configuration';
        }
    } else {
        document.getElementById('char-form').reset();
        idInput.disabled = false;
        document.getElementById('m-title').textContent = 'Create New NPC';
        fillHeartProfiles({});
    }
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

function editChar(id) {
    openModal(id);
}

function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    const span = document.createElement('span');
    span.className = 'toast-msg';
    span.textContent = msg;
    t.appendChild(span);
    container.appendChild(t);
    setTimeout(() => t.classList.add('show'), 100);
    setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 500);
    }, 3000);
}

function renderBalanceBadge(account) {
    if (!account || account.limit === undefined) return '';
    const limit = account.limit || 0;
    const recent = account.recent || 0;
    
    let available;
    if (account.billing_type === 'balance' && account.stripe_balance !== undefined) {
        available = Math.max(0, -account.stripe_balance - recent);
    } else {
        available = limit - recent;
    }
    
    const color = available > 0 ? '#22c55e' : '#ef4444';
    const bg = available > 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';
    const label = available > 0 ? 'AVAILABLE' : 'OVER LIMIT';
    return '<div style="display:flex; align-items:center; gap:8px; background:' + bg + '; padding:4px 12px; border-radius:8px; border:1px solid ' + color + '">' +
        '<div style="width:6px; height:6px; border-radius:50%; background:' + color + '"></div>' +
        '<span style="font-size:11px; font-weight:800; color:' + color + '">' + label + ': $' + available.toFixed(2) + '</span>' +
    '</div>';
}

function renderBillingTable(billingData) {
    if (!billingData || !billingData.months || !billingData.months.length) return '<tr><td colspan="4" class="table-state">No billing data available.</td></tr>';
    const latestMonth = billingData.months[0];
    if (!latestMonth || !latestMonth.items) return '<tr><td colspan="4" class="table-state">No items found for current period.</td></tr>';
    const totalTokens = latestMonth.items.reduce((sum, item) => sum + (item.units || 0), 0);
    return latestMonth.items.map(item => {
        const modelName = escapeHTML(String(item.model?.model_name || '').split('/').pop());
        const type = item.pricing_type === 'input_tokens' ? 'IN' : 'OUT';
        const usage = Number(item.units || 0).toLocaleString();
        const rateValue = Number(item.rate || 0) * 10000;
        const rate = '$' + rateValue.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') + '/1M';
        const cost = '$' + (Number(item.cost || 0) / 100).toFixed(2);
        return '<tr><td style="font-weight:700; color:var(--text-main)">' + modelName + ' <span style="font-size:9px; color:var(--text-muted); margin-left:5px">' + type + '</span></td><td>' + usage + ' tokens</td><td style="color:var(--text-muted)">' + rate + '</td><td style="font-weight:800; color:var(--primary); text-align:right">' + cost + '</td></tr>';
    }).join('') + '<tr style="border-top:2px solid var(--border)"><td style="background:var(--bg);font-weight:800;color:var(--text-main);padding:12px 1rem;line-height:1">TOTAL USAGE</td><td style="background:var(--bg);font-weight:800;color:var(--text-main);padding:12px 1rem;line-height:1">' + totalTokens.toLocaleString(LOCALE_ID) + ' tokens</td><td style="background:var(--bg);font-weight:800;text-align:right;color:var(--text-main);padding:12px 1rem;line-height:1">ESTIMATED TOTAL SPEND</td><td style="background:var(--bg);font-weight:800;color:var(--primary);font-size:1.2rem;text-align:right;padding:12px 1rem;line-height:1">$' + (Number(latestMonth.total_cost || 0) / 100).toFixed(2) + '</td></tr>';
}

function initUsageChart(data) {
    const ctx = document.getElementById('usageChart');
    if (!ctx || typeof Chart === 'undefined') return;
    usageChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Groq (Utama)', 'Cerebras', 'DeepInfra', 'Novita AI'],
            datasets: [{
                label: 'Tokens Consumed',
                data: providerTokenData(data),
                backgroundColor: ['rgba(34, 197, 94, 0.6)', 'rgba(59, 130, 246, 0.6)', 'rgba(249, 115, 22, 0.6)', 'rgba(139, 92, 246, 0.6)'],
                borderColor: ['rgb(34, 197, 94)', 'rgb(59, 130, 246)', 'rgb(249, 115, 22)', 'rgb(139, 92, 246)'],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { display: false } },
                x: { grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function providerTokenData(d) {
    return [
        d.groq_stats ? d.groq_stats.total_tokens : 0,
        d.cerebras_stats ? d.cerebras_stats.total_tokens : 0,
        d.deepinfra_stats ? d.deepinfra_stats.total_tokens : 0,
        d.novita_stats ? d.novita_stats.total_tokens : 0
    ];
}

function updateStats(d) {
    setText('s-req', Number(d.totalRequests || 0).toLocaleString());
    setText('s-prompt-tok', nFormatter(d.totalPromptTokens || 0));
    setText('s-completion-tok', nFormatter(d.totalCompletionTokens || 0));
    setText('s-cached-tok', nFormatter(d.totalCachedTokens || 0));
    setText('s-active', (d.groq_stats?.active || 0) + '/' + (d.groq_stats?.available || 0));
    setText('s-groq', (d.deepinfra_stats?.active || 0) + '/' + (d.deepinfra_stats?.available || 0));
    setText('s-cerebras', (d.cerebras_stats?.active || 0) + '/' + (d.cerebras_stats?.available || 0));
    setText('s-novita', (d.novita_stats?.active || 0) + '/' + (d.novita_stats?.available || 0));
    setText('s-uptime', d.uptime || '0s');
                                              
    if (usageChart) {
        usageChart.data.datasets[0].data = providerTokenData(d);
        usageChart.update();
    } else if (document.getElementById('usageChart')) {
        initUsageChart(d);
    }

    const billingBody = document.getElementById('billing-body');
    if (billingBody && d.deepinfra_billing) billingBody.innerHTML = renderBillingTable(d.deepinfra_billing);
    const billingHeader = document.getElementById('billing-header-tools');
    if (billingHeader && d.deepinfra_account) {
        const sourceLabel = d.deepinfra_billing_source === 'local_chat_logs' ? 'LOCAL USAGE' : 'LIVE DATA';
        billingHeader.innerHTML = renderBalanceBadge(d.deepinfra_account) + '<span style="font-size:11px; font-weight:800; color:#64748b; background:#f1f5f9; padding:4px 10px; border-radius:6px; text-transform:uppercase">' + sourceLabel + '</span>';
    }

    // Update cache usage table
    const cacheBody = document.getElementById('cache-body');
    const cacheTotalEl = document.getElementById('cache-total-saved');
    if (cacheBody && d.cache_savings) {
        if (d.cache_savings.length === 0) {
            cacheBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#64748b; padding:2rem">Belum ada data cache. Menunggu request masuk...</td></tr>';
        } else {
            cacheBody.innerHTML = d.cache_savings.map(function(item) {
                var modelName = escapeHTML(String(item.model || '').split('/').pop());
                var cachedToks = Number(item.cached_tokens || 0).toLocaleString();
                var rate = '$' + Number(item.rate || 0).toFixed(2) + '/1M';
                var cost = '$' + Number(item.saved || 0).toFixed(2);
                return '<tr><td style="font-weight:700; color:var(--text-main)">' + modelName + ' <span style="font-size:9px; color:var(--text-muted); margin-left:5px">CACHED</span></td><td>' + cachedToks + ' tokens</td><td style="color:var(--text-muted)">' + rate + ' (50%)</td><td style="font-weight:800; color:var(--primary); text-align:right">' + cost + '</td></tr>';
            }).join('');
        }
    }
    if (cacheTotalEl) {
        cacheTotalEl.textContent = 'CACHE COST: $' + Number(d.cache_total_saved || 0).toFixed(2);
    }
}

function startStatsStream() {
    if (!ADMIN_CONFIG.isAdmin || statsEventSource) return;
    statsEventSource = new EventSource('/api/admin/stats/stream');
    statsEventSource.onmessage = e => updateStats(JSON.parse(e.data));
    statsEventSource.onerror = () => {
        statsEventSource.close();
        statsEventSource = null;
        fetchStatsFallback();
        setTimeout(startStatsStream, 5000);
    };
}

async function fetchStatsFallback() {
    try {
        const r = await fetch('/api/stats');
        updateStats(await r.json());
    } catch (e) {}
}

async function loadBanList(page = 1, options = {}) {
    banPage = page;
    const tbody = document.getElementById('banlist-body');
    if (!tbody) return;
    const q = document.getElementById('ban-search')?.value || '';
    if (!options.silent) setTableLoading('banlist-body', 3, 'Memuat daftar ban...');
    try {
        const res = await fetch('/api/admin/ban-list?page=' + page + '&q=' + encodeURIComponent(q));
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(apiError(data, 'Gagal memuat daftar ban'));
        const banList = data.list || [];
        latestBanList = banList;
        renderPagination('banlist-pagination', data.pagination, loadBanList);
        setText('ban-count', (data.pagination?.total || banList.length).toLocaleString(LOCALE_ID));
        tbody.innerHTML = banList.length ? banList.map(b => `
            <tr>
                <td style="font-weight:700;">${escapeHTML(b.username)}</td>
                <td style="color:var(--text-muted);">${escapeHTML(new Date(b.created_at).toLocaleString(LOCALE_ID, TZ_CONFIG))}</td>
                <td style="text-align:right;"><button class="btn btn-danger" onclick="unbanUser(${jsArg(b.username)})">Unban</button></td>
            </tr>
        `).join('') : '<tr><td colspan="3" class="table-state">Belum ada user yang diban.</td></tr>';
        document.getElementById('ban-message-input').value = data.ban_message || 'Aku malas berbicara dengan kamu.';
        const autoBanInput = document.getElementById('auto-ban-words-input');
        if (autoBanInput) autoBanInput.value = data.auto_ban_words || '';
    } catch (e) {
        setTableError('banlist-body', 3, e.message);
    }
}

function debouncedLoadBanList() {
    clearTimeout(banSearchTimer);
    banSearchTimer = setTimeout(() => loadBanList(1), 250);
}

async function banUser(targetUsername = '') {
    const input = document.getElementById('ban-username-input');
    const username = String(targetUsername || input?.value || '').trim();
    if (!username) return showToast('Username tidak boleh kosong', 'error');
    if (targetUsername && !confirm(`Ban @${username} dan masukkan ke daftar ban?`)) return;
    try {
        const res = await fetch('/api/admin/ban-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(apiError(data, 'Gagal memblokir user'));
        showToast(data.message, 'success');
        if (input && !targetUsername) input.value = '';
        await loadBanList(1, { silent: true });
        if (!document.getElementById('page-logs')?.classList.contains('hidden')) {
            loadLogs(logPage, { silent: true });
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function unbanUser(username) {
    if (!confirm(`Apakah kamu yakin ingin melepas ban untuk ${username}?`)) return;
    try {
        const res = await fetch('/api/admin/unban-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(apiError(data, 'Gagal melepas ban user'));
        showToast(data.message, 'success');
        await loadBanList(banPage, { silent: true });
        if (!document.getElementById('page-logs')?.classList.contains('hidden')) {
            loadLogs(logPage, { silent: true });
        }
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function exportBanListTxt() {
    // Note: Export still uses all-at-once approach for now by fetching without limit on a separate endpoint if needed,
    // but here we just use whatever is currently loaded in 'latestBanList' (which is now only 35).
    // Better to fetch all for export.
    if (!latestBanList.length || latestBanList.length < 35) {
        await loadBanList(1);
    }
    if (!latestBanList.length) return showToast('Daftar ban masih kosong, tidak ada yang diexport.', 'error');

    const exportedAt = new Date().toLocaleString(LOCALE_ID, TZ_CONFIG);
    const lines = [
        'DAFTAR BAN USER - NPC SYSTEM',
        `Export: ${exportedAt}`,
        `Total: ${latestBanList.length} orang`,
        '',
        ...latestBanList.map((b, idx) => {
            const date = b.created_at ? new Date(b.created_at).toLocaleString(LOCALE_ID, TZ_CONFIG) : '-';
            return `${idx + 1}. ${b.username} | ${date}`;
        })
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `daftar-ban-${stamp}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Daftar ban berhasil diexport ke TXT.', 'success');
}

async function updateBanMessage() {
    const message = document.getElementById('ban-message-input').value.trim();
    if (!message) return showToast('Pesan ban tidak boleh kosong', 'error');
    try {
        const res = await fetch('/api/admin/update-ban-message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(apiError(data, 'Gagal memperbarui pesan ban'));
        showToast(data.message, 'success');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function updateAutoBanWords() {
    const words = document.getElementById('auto-ban-words-input')?.value || '';
    try {
        const res = await fetch('/api/admin/auto-ban-words', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ words })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(apiError(data, 'Gagal memperbarui kata auto-ban'));
        const input = document.getElementById('auto-ban-words-input');
        if (input) input.value = data.words || '';
        showToast(data.message, 'success');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

async function banUsersByAutoBanWords() {
    const btn = document.getElementById('auto-ban-apply-btn');
    if (!confirm('Ban semua user dari log yang pesannya cocok dengan kata filter aktif?')) return;
    try {
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Memproses...';
        }
        await updateAutoBanWords();
        const res = await fetch('/api/admin/ban-by-auto-ban-words', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(apiError(data, 'Gagal memproses ban sesuai kata filter'));
        showToast(data.message, 'success');
        await loadBanList(1, { silent: true });
        if (!document.getElementById('page-logs')?.classList.contains('hidden')) {
            await loadLogs(logPage, { silent: true });
        }
    } catch (e) {
        showToast(e.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Ban Sesuai Kata Filter';
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('char-form');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const id = document.getElementById('f-id').value;
            const c = characters.find(x => x.id === id);
            const data = {
                npc_name: document.getElementById('f-name').value,
                npc_description: document.getElementById('f-desc').value,
                npc_personality: document.getElementById('f-pers').value,
                npc_speaking_style: document.getElementById('f-style').value,
                signature_style: document.getElementById('f-signature').value,
                character_background: document.getElementById('f-background').value,
                heart_profiles: collectHeartProfiles(),
                is_enabled: c ? c.is_enabled : true,
                language: 'id'
            };
            await fetch('/api/characters/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, data })
            });
            showToast('Character saved successfully', 'success');
            closeModal();
            load();
        };
    }

    if (ADMIN_CONFIG.isAdmin) {
        startStatsStream();
        initTerminal();
        startCooldownCountdown();
    }
    showPage(ADMIN_CONFIG.initialPage || 'karakter');
    refreshIcons();
    setTimeout(refreshIcons, 100);
    setTimeout(refreshIcons, 500);
});

function startCooldownCountdown() {
    setInterval(() => {
        const now = Date.now();
        document.querySelectorAll('.otak-row[data-cooldown-until]').forEach(row => {
            const cooldownUntil = Number(row.getAttribute('data-cooldown-until'));
            if (cooldownUntil <= 0) return;
            
            const type = row.getAttribute('data-provider-type');
            const id = row.getAttribute('data-provider-id');
            const statusEl = document.getElementById('status-' + type + '-' + id);
            if (!statusEl) return;
            
            const remaining = Math.max(0, Math.floor((cooldownUntil - now) / 1000));
            if (remaining > 0) {
                statusEl.textContent = formatCooldown(remaining);
                statusEl.style.color = 'var(--warning)';
            } else {
                statusEl.textContent = 'READY';
                statusEl.style.color = 'var(--success)';
                row.setAttribute('data-cooldown-until', '0');
            }
        });
    }, 1000);
}
