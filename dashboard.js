function getAdminDashboardHTML(stats) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Minimal NPC Dashboard</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
        <style>
            :root {
                --primary: #f97316; /* Orange */
                --primary-hover: #ea580c;
                --bg: #ffffff;
                --sidebar-bg: #f8fafc;
                --border: #e2e8f0;
                --text-main: #1e293b;
                --text-muted: #64748b;
            }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
                font-family: 'Outfit', sans-serif;
                background: var(--bg);
                color: var(--text-main);
                height: 100vh;
                display: flex;
                overflow: hidden;
            }

            /* Sidebar */
            aside {
                width: 260px;
                background: var(--sidebar-bg);
                border-right: 1px solid var(--border);
                display: flex;
                flex-direction: column;
                padding: 2rem 1.5rem;
            }
            .brand {
                font-size: 1.25rem;
                font-weight: 600;
                color: var(--primary);
                margin-bottom: 2.5rem;
                letter-spacing: -0.5px;
            }
            nav { display: flex; flex-direction: column; gap: 0.3rem; }
            .nav-item {
                padding: 0.75rem 1rem;
                border-radius: 0.5rem;
                cursor: pointer;
                color: var(--text-muted);
                font-weight: 500;
                transition: all 0.2s;
                border: 1px solid transparent;
            }
            .nav-item:hover { background: #f1f5f9; color: var(--text-main); }
            .nav-item.active {
                background: #fff;
                color: var(--primary);
                border-color: var(--border);
            }

            /* Main Content */
            main {
                flex: 1;
                overflow-y: auto;
                padding: 2.5rem;
            }
            header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 2rem;
            }
            h1 { font-size: 1.5rem; font-weight: 600; }

            /* Stats Grid */
            .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 3rem; }
            .stat-card {
                background: #fff;
                padding: 1.5rem;
                border: 1px solid var(--border);
                border-radius: 0.75rem;
            }
            .stat-card h3 { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem; letter-spacing: 0.5px; }
            .stat-card p { font-size: 1.5rem; font-weight: 600; color: var(--text-main); }

            /* Table & Lists */
            .card-section {
                background: #fff;
                border: 1px solid var(--border);
                border-radius: 1rem;
                padding: 1.5rem;
                margin-bottom: 2rem;
            }
            table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
            table th { text-align: left; padding: 1rem; color: var(--text-muted); font-size: 0.85rem; border-bottom: 1px solid var(--border); font-weight: 500; }
            table td { padding: 1rem; border-bottom: 1px solid #f1f5f9; font-size: 0.95rem; vertical-align: top; }

            /* Buttons */
            .btn {
                background: var(--primary);
                color: #fff;
                border: none;
                padding: 0.6rem 1.2rem;
                border-radius: 0.5rem;
                cursor: pointer;
                font-weight: 500;
                font-size: 0.875rem;
                transition: background 0.2s;
            }
            .btn:hover { background: var(--primary-hover); }
            .btn-outline {
                background: transparent;
                border: 1px solid var(--border);
                color: var(--text-main);
            }
            .btn-outline:hover { background: #f8fafc; }
            .btn-danger { color: #ef4444; border: 1px solid transparent; background: transparent; padding: 0.4rem; font-size: 0.8rem; }
            .btn-danger:hover { color: #dc2626; }

            /* Otak List */
            .otak-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
            .otak-card {
                padding: 1.25rem;
                border: 1px solid var(--border);
                border-radius: 0.75rem;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            /* Custom Switches */
            .switch { position: relative; display: inline-block; width: 36px; height: 20px; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { position: absolute; cursor: pointer; inset: 0; background-color: #cbd5e1; transition: .4s; border-radius: 20px; }
            .slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
            input:checked + .slider { background-color: var(--primary); }
            input:checked + .slider:before { transform: translateX(16px); }

            /* Modal */
            .modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.4); justify-content:center; align-items:center; z-index:100; }
            .modal-content { background:#fff; padding:2rem; border-radius:1rem; width:100%; max-width:550px; border: 1px solid var(--border); }
            .form-group { margin-bottom: 1.25rem; }
            .form-group label { display:block; margin-bottom:0.5rem; color:var(--text-muted); font-size:0.85rem; font-weight: 500; }
            .form-group input, .form-group textarea, .form-group select { width:100%; padding:0.75rem; background:#fff; border:1px solid var(--border); color:var(--text-main); border-radius:0.5rem; font-family: inherit; }
            .form-group input:focus { outline: none; border-color: var(--primary); }

            .hidden { display: none !important; }

            /* Logs Specific */
            .log-bubble { padding: 0.5rem; border-radius: 0.5rem; font-size: 0.85rem; margin-bottom: 0.5rem; }
            .log-user { background: #f8fafc; border-left: 3px solid #cbd5e1; }
            .log-bot { background: #fff7ed; border-left: 3px solid var(--primary); }
        </style>
    </head>
    <body>
        <aside>
            <div class="brand">NPC SYSTEM</div>
            <nav>
                <div class="nav-item active" onclick="showPage('dashboard', this)">Dashboard</div>
                <div class="nav-item" onclick="showPage('karakter', this)">Data Karakter</div>
                <div class="nav-item" onclick="showPage('otak', this)">Manajemen Otak</div>
                <div class="nav-item" onclick="showPage('logs', this)">Log Percakapan</div>
            </nav>
            <div style="margin-top: auto; font-size: 0.75rem; color: var(--text-muted)">
                <a href="/logout" style="color: var(--text-muted); text-decoration: none">Logout</a>
                <br>v1.5 // Turso Logging Active
            </div>
        </aside>

        <main>
            <!-- PAGE: DASHBOARD -->
            <div id="page-dashboard">
                <header>
                    <h1>Dashboard Overview</h1>
                </header>
                <div class="stats-grid">
                    <div class="stat-card"><h3>Requests</h3><p id="s-req">${stats.totalRequests}</p></div>
                    <div class="stat-card"><h3>Tokens Total</h3><p id="s-tok">${stats.totalTokens}</p></div>
                    <div class="stat-card"><h3>Otak Aktif</h3><p id="s-active">${stats.active_keys} / ${stats.available_keys}</p></div>
                    <div class="stat-card"><h3>Cooldown</h3><p id="s-cooldown">${stats.cooldown_keys}</p></div>
                </div>
            </div>

            <!-- PAGE: KARAKTER -->
            <div id="page-karakter" class="hidden">
                <header>
                    <h1>Daftar Karakter</h1>
                    <button class="btn" onclick="openModal()">+ Buat Karakter</button>
                </header>
                <div class="card-section">
                    <table>
                        <thead>
                            <tr>
                                <th>NAMA</th>
                                <th>STATUS</th>
                                <th style="width: 100px">MANUAL</th>
                                <th style="text-align: right">AKSI</th>
                            </tr>
                        </thead>
                        <tbody id="char-body"></tbody>
                    </table>
                </div>
            </div>

            <!-- PAGE: OTAK -->
            <div id="page-otak" class="hidden">
                <header>
                    <h1>Kunci API (Otak)</h1>
                    <div class="form-group" style="margin:0; display:flex; align-items:center; gap:0.5rem">
                        <label style="margin:0">Model Utama:</label>
                        <select id="m-primary" onchange="switchModel(this.value)" style="width: auto; padding: 0.4rem">
                            <option value="llama-3.3-70b-versatile">Llama 3.3 70B</option>
                            <option value="llama-3.1-8b-instant">Llama 3.1 8B</option>
                            <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
                            <option value="gemma2-9b-it">Gemma 2 9B</option>
                        </select>
                    </div>
                </header>
                <div id="otak-list" class="otak-grid"></div>
            </div>

            <!-- PAGE: LOGS -->
            <div id="page-logs" class="hidden">
                <header>
                    <h1>Log Percakapan Terakhir</h1>
                    <button class="btn btn-outline" onclick="loadLogs()">Refresh Log</button>
                </header>
                <div class="card-section">
                    <table>
                        <thead>
                            <tr>
                                <th style="width: 150px">WAKTU</th>
                                <th style="width: 100px">NPC / USER</th>
                                <th>ISI PERCAKAPAN</th>
                                <th style="width: 150px">MODEL / TOKEN</th>
                            </tr>
                        </thead>
                        <tbody id="log-body"></tbody>
                    </table>
                </div>
            </div>
        </main>

        <!-- FORM MODAL -->
        <div id="modal" class="modal">
            <div class="modal-content">
                <h2 id="m-title" style="margin-bottom: 1.5rem">Detail Karakter</h2>
                <form id="char-form">
                    <input type="hidden" id="f-old-id">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem">
                        <div class="form-group"><label>Unique ID</label><input type="text" id="f-id" placeholder="misal: alya" required></div>
                        <div class="form-group"><label>Display Name</label><input type="text" id="f-name" placeholder="Nama NPC" required></div>
                    </div>
                    <div class="form-group"><label>Description</label><textarea id="f-desc" rows="2"></textarea></div>
                    <div class="form-group"><label>Personality</label><textarea id="f-pers" rows="2"></textarea></div>
                    <div class="form-group"><label>Speaking Style</label><textarea id="f-style" rows="2"></textarea></div>
                    <div class="form-group"><label>World Setting</label><textarea id="f-world" rows="2"></textarea></div>
                    <div style="display:flex; justify-content:flex-end; gap:0.75rem; margin-top: 1rem">
                        <button type="button" class="btn btn-outline" onclick="closeModal()">Batal</button>
                        <button type="submit" class="btn">Simpan Perubahan</button>
                    </div>
                </form>
            </div>
        </div>

        <script>
            let characters = [];
            let currentPage = 'dashboard';

            function showPage(pageId, el) {
                currentPage = pageId;
                document.querySelectorAll('main > div').forEach(p => p.classList.add('hidden'));
                const p = document.getElementById('page-' + pageId);
                if(p) p.classList.remove('hidden');
                
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                if(el) el.classList.add('active');

                if(pageId === 'logs') loadLogs();
                if(pageId === 'karakter') load();
                if(pageId === 'otak') loadModels();
            }

            async function load() {
                try {
                    const r = await fetch('/api/characters');
                    const d = await r.json();
                    characters = d.characters;
                    renderCharacters();
                    loadModels();
                } catch(e) {}
            }

            function renderCharacters() {
                const b = document.getElementById('char-body');
                if(!b) return;
                b.innerHTML = '';
                characters.forEach(c => {
                    b.innerHTML += '<tr>' +
                        '<td>' +
                            '<div style="font-weight: 500">' + c.npc_name + '</div>' +
                            '<div style="font-size: 0.75rem; color: var(--text-muted)">' + c.id + '</div>' +
                        '</td>' +
                        '<td>' + (c.is_enabled ? '<span style="color:#22c55e">● Online</span>' : '<span style="color:#94a3b8">● Offline</span>') + '</td>' +
                        '<td>' +
                            '<label class="switch">' +
                                '<input type="checkbox" ' + (c.is_enabled ? 'checked' : '') + ' onchange="toggleCharStatus(\\''+c.id+'\\', this.checked)">' +
                                '<span class="slider"></span>' +
                            '</label>' +
                        '</td>' +
                        '<td style="text-align: right">' +
                            '<button class="btn btn-outline" style="padding: 0.3rem 0.6rem; margin-right: 0.5rem" onclick="editChar(\\'' + c.id + '\\')">Edit</button>' +
                            '<button class="btn-danger" onclick="deleteChar(\\'' + c.id + '\\')">Hapus</button>' +
                        '</td>' +
                    '</tr>';
                });
            }

            async function loadModels() {
                try {
                    const r = await fetch('/api/admin/models');
                    const d = await r.json();
                    const m = document.getElementById('m-primary');
                    if(m) m.value = d.config.primaryModel;
                    
                    const list = document.getElementById('otak-list');
                    if(!list) return;
                    list.innerHTML = '';
                    d.otak.forEach(o => {
                        const isCd = o.isCoolingDown;
                        const statusColor = isCd ? '#ef4444' : (o.isEnabled ? '#22c55e' : '#94a3b8');
                        const statusLabel = isCd ? 'Cooldown' : (o.isEnabled ? 'Aktif' : 'Nonaktif');

                        list.innerHTML += '<div class="otak-card">' +
                            '<div>' +
                                '<div style="font-weight: 600; font-size: 0.9rem">Otak ' + o.id + '</div>' +
                                '<div style="font-size: 0.7rem; color:' + statusColor + '">● ' + statusLabel + '</div>' +
                            '</div>' +
                            '<label class="switch">' +
                                '<input type="checkbox" ' + (o.isEnabled ? 'checked' : '') + ' onchange="toggleOtak(' + o.id + ', this.checked)">' +
                                '<span class="slider"></span>' +
                            '</label>' +
                        '</div>';
                    });
                } catch(e) {}
            }

            async function loadLogs() {
                try {
                    const r = await fetch('/api/admin/logs');
                    const d = await r.json();
                    const b = document.getElementById('log-body');
                    if(!b) return;
                    b.innerHTML = '';
                    d.logs.forEach(l => {
                        const date = new Date(l.timestamp).toLocaleString('id-ID');
                        b.innerHTML += '<tr>' +
                            '<td style="font-size: 0.75rem; color: var(--text-muted)">' + date + '</td>' +
                            '<td>' +
                                '<div style="font-weight:600; color:var(--primary)">' + l.ai_name.toUpperCase() + '</div>' +
                                '<div style="font-size: 0.8rem; color:var(--text-muted)">@' + l.username + '</div>' +
                            '</td>' +
                            '<td>' +
                                '<div class="log-bubble log-user"><b>User:</b> ' + l.user_message + '</div>' +
                                '<div class="log-bubble log-bot"><b>AI:</b> ' + l.bot_response.replace(/\\n/g, '<br>') + '</div>' +
                            '</td>' +
                            '<td>' +
                                '<div style="font-size: 0.8rem; font-weight:500">' + l.model + '</div>' +
                                '<div style="font-size: 0.75rem; color:var(--text-muted)">' + l.tokens + ' tokens</div>' +
                            '</td>' +
                        '</tr>';
                    });
                } catch(e) {}
            }

            async function toggleCharStatus(id, enabled) {
                const char = characters.find(x => x.id === id);
                if(!char) return;
                const data = { ...char, is_enabled: enabled };
                delete data.id;
                await fetch('/api/characters/save', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({id, data})
                });
                load();
            }

            async function toggleOtak(id, enabled) {
                await fetch('/api/admin/models/toggle', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({id, enabled})
                });
                loadModels();
            }

            async function switchModel(model) {
                await fetch('/api/admin/models/switch', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({primaryModel: model})
                });
            }

            function openModal(id = null) {
                document.getElementById('modal').style.display = 'flex';
                const f = document.getElementById('char-form');
                if(id) {
                    const c = characters.find(x => x.id === id);
                    document.getElementById('f-id').value = c.id;
                    document.getElementById('f-id').disabled = true;
                    document.getElementById('f-name').value = c.npc_name;
                    document.getElementById('f-desc').value = c.npc_description;
                    document.getElementById('f-pers').value = c.npc_personality;
                    document.getElementById('f-style').value = c.npc_speaking_style;
                    document.getElementById('f-world').value = c.world_setting;
                } else { 
                    f.reset(); 
                    document.getElementById('f-id').disabled = false;
                }
            }

            function closeModal() { document.getElementById('modal').style.display = 'none'; }

            async function deleteChar(id) {
                if(!confirm('Hapus karakter ' + id + '?')) return;
                await fetch('/api/characters/delete', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({id})
                });
                load();
            }

            document.getElementById('char-form').onsubmit = async (e) => {
                e.preventDefault();
                const id = document.getElementById('f-id').value;
                const char = characters.find(x => x.id === id);
                const data = {
                    npc_name: document.getElementById('f-name').value,
                    npc_description: document.getElementById('f-desc').value,
                    npc_personality: document.getElementById('f-pers').value,
                    npc_speaking_style: document.getElementById('f-style').value,
                    world_setting: document.getElementById('f-world').value,
                    is_enabled: char ? char.is_enabled : true,
                    language: 'id'
                };
                await fetch('/api/characters/save', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({id, data})
                });
                closeModal();
                load();
            };

            function editChar(id) { openModal(id); }

            setInterval(async () => {
                try {
                    const r = await fetch('/api/stats');
                    const d = await r.json();
                    const reqEl = document.getElementById('s-req');
                    if(reqEl) {
                        reqEl.innerText = d.totalRequests;
                        document.getElementById('s-tok').innerText = d.totalTokens;
                        document.getElementById('s-active').innerText = d.active_keys + ' / ' + d.available_keys;
                        document.getElementById('s-cooldown').innerText = d.cooldown_keys;
                    }
                    if(currentPage === 'otak') loadModels();
                } catch(e) {}
            }, 5000);

            load();
        </script>
    </body>
    </html>
    `;
}

function getLoginPageHTML(error = '') {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login - NPC Engine</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
        <style>
            :root {
                --primary: #f97316;
                --primary-hover: #ea580c;
                --bg: #f8fafc;
                --card: #ffffff;
                --border: #e2e8f0;
                --text: #1e293b;
                --text-muted: #64748b;
            }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
                font-family: 'Outfit', sans-serif;
                background: var(--bg);
                color: var(--text);
                height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                padding: 1rem;
            }
            .login-card {
                background: var(--card);
                padding: 2.5rem;
                width: 100%;
                max-width: 400px;
                border: 1px solid var(--border);
                border-radius: 1rem;
            }
            .brand {
                font-size: 1.5rem;
                font-weight: 600;
                color: var(--primary);
                margin-bottom: 0.5rem;
                text-align: center;
            }
            .subtitle {
                font-size: 0.85rem;
                color: var(--text-muted);
                text-align: center;
                margin-bottom: 2rem;
            }
            .form-group { margin-bottom: 1.25rem; }
            .form-group label { display: block; margin-bottom: 0.5rem; font-size: 0.85rem; font-weight: 500; color: var(--text-muted); }
            .form-group input {
                width: 100%;
                padding: 0.75rem;
                border: 1px solid var(--border);
                border-radius: 0.5rem;
                font-family: inherit;
                outline: none;
            }
            .form-group input:focus { border-color: var(--primary); }
            .btn {
                width: 100%;
                background: var(--primary);
                color: #fff;
                border: none;
                padding: 0.75rem;
                border-radius: 0.5rem;
                cursor: pointer;
                font-weight: 600;
                transition: background 0.2s;
                margin-top: 0.5rem;
            }
            .btn:hover { background: var(--primary-hover); }
            .error {
                background: #fef2f2;
                color: #ef4444;
                padding: 0.75rem;
                border-radius: 0.5rem;
                font-size: 0.8rem;
                margin-bottom: 1rem;
                border: 1px solid #fee2e2;
                text-align: center;
            }
        </style>
    </head>
    <body>
        <div class="login-card">
            <div class="brand">NPC SYSTEM</div>
            <div class="subtitle">Silakan login untuk mengelola engine</div>
            
            \${error ? \`<div class="error">\${error}</div>\` : ''}

            <form action="/login" method="POST">
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" name="username" required autocomplete="username">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" name="password" required autocomplete="current-password">
                </div>
                <button type="submit" class="btn">Masuk ke Dashboard</button>
            </form>
        </div>
    </body>
    </html>
    `;
}

module.exports = { getAdminDashboardHTML, getLoginPageHTML };
