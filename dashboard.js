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

            /* Switch */
            .switch { position: relative; display: inline-block; width: 36px; height: 20px; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { position: absolute; cursor: pointer; inset: 0; background-color: #cbd5e1; transition: .4s; border-radius: 20px; }
            .slider:before { position: absolute; content: ""; height: 14px; width: 14px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
            input:checked + .slider { background-color: var(--primary); }
            input:checked + .slider:before { transform: translateX(16px); }

            /* Modal */
            .modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.4); justify-content:center; align-items:center; z-index:100; }
            .modal-content { background:#fff; padding:2rem; border-radius:1rem; width:100%; max-width:600px; max-height: 90vh; overflow-y: auto; border: 1px solid var(--border); }
            .form-group { margin-bottom: 1.25rem; }
            .form-group label { display:block; margin-bottom:0.5rem; color:var(--text-muted); font-size:0.85rem; font-weight: 500; }
            .form-group input, .form-group textarea, .form-group select { width:100%; padding:0.75rem; background:#fff; border:1px solid var(--border); color:var(--text-main); border-radius:0.5rem; font-family: inherit; }
            .form-group input:focus { outline: none; border-color: var(--primary); }

            .hidden { display: none !important; }

            /* Log Bubbles */
            .log-bubble { padding: 0.75rem; border-radius: 0.5rem; font-size: 0.85rem; margin-bottom: 0.5rem; line-height: 1.4; }
            .log-user { background: #f8fafc; border-left: 3px solid #cbd5e1; }
            .log-bot { background: #fff7ed; border-left: 3px solid var(--primary); }
            
            .badge { padding: 0.2rem 0.5rem; border-radius: 0.3rem; font-size: 0.7rem; font-weight: 600; background: #f1f5f9; color: var(--text-muted); }
            .badge-orange { background: #fff7ed; color: var(--primary); border: 1px solid #ffedd5; }
        </style>
    </head>
    <body>
        <aside>
            <div class="brand">NPC SYSTEM</div>
            <nav id="sidebar-nav">
                <div class="nav-item active" onclick="showPage('dashboard', this)">Dashboard</div>
                <div class="nav-item" onclick="showPage('karakter', this)">Data Karakter</div>
                <div class="nav-item" onclick="showPage('otak', this)">Manajemen Otak</div>
                <div class="nav-item" onclick="showPage('users', this)">Daftar User</div>
                <div class="nav-item" onclick="showPage('logs', this)">Log Percakapan</div>
            </nav>
            <div style="margin-top: auto; font-size: 0.75rem; color: var(--text-muted)">
                <a href="/logout" style="color: var(--text-muted); text-decoration: none; font-weight: 600">Logout</a>
                <br>v1.8 // Active User Tracking
            </div>
        </aside>

        <main>
            <!-- DASHBOARD -->
            <div id="page-dashboard">
                <header><h1>Dashboard</h1></header>
                <div class="stats-grid">
                    <div class="stat-card"><h3>Total Requests</h3><p id="s-req">${stats.totalRequests}</p></div>
                    <div class="stat-card"><h3>Total Tokens</h3><p id="s-tok">${stats.totalTokens}</p></div>
                    <div class="stat-card"><h3>Active Otak</h3><p id="s-active">${stats.active_keys}/${stats.available_keys}</p></div>
                    <div class="stat-card"><h3>Cooldown</h3><p id="s-cooldown" style="color:#ef4444">${stats.cooldown_keys}</p></div>
                </div>
            </div>

            <!-- KARAKTER -->
            <div id="page-karakter" class="hidden">
                <header><h1>Data Karakter</h1><button class="btn" onclick="openModal()">+ Add NPC</button></header>
                <div class="card-section">
                    <table>
                        <thead><tr><th>NAMA</th><th>STATUS</th><th style="width:100px">MANUAL</th><th style="text-align:right">AKSI</th></tr></thead>
                        <tbody id="char-body"></tbody>
                    </table>
                </div>
            </div>

            <!-- OTAK -->
            <div id="page-otak" class="hidden">
                <header>
                    <h1>Manajemen Otak</h1>
                </header>
                <div id="otak-list" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:1rem"></div>
            </div>

            <!-- USERS -->
            <div id="page-users" class="hidden">
                <header><h1>Daftar User Aktif</h1><button class="btn btn-outline" onclick="loadUsers()">Refresh</button></header>
                <div class="card-section">
                    <table>
                        <thead><tr><th>USERNAME</th><th>LV HATI</th><th>TERAKHIR AKTIF</th><th style="text-align:right">LOGS</th></tr></thead>
                        <tbody id="user-body"></tbody>
                    </table>
                </div>
            </div>

            <!-- LOGS (GLOBAL) -->
            <div id="page-logs" class="hidden">
                <header><h1>Log Percakapan Global</h1><button class="btn btn-outline" onclick="loadLogs()">Refresh</button></header>
                <div class="card-section">
                    <table>
                        <thead><tr><th style="width:120px">WAKTU</th><th style="width:120px">INFO</th><th>PESAN</th><th style="width:120px">METRICS</th></tr></thead>
                        <tbody id="log-body"></tbody>
                    </table>
                </div>
            </div>
        </main>

        <!-- NPC MODAL -->
        <div id="modal" class="modal"><div class="modal-content">
            <h2 id="m-title" style="margin-bottom:1.5rem">Edit Character</h2>
            <form id="char-form">
                <input type="hidden" id="f-old-id">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem">
                    <div class="form-group"><label>Unique ID</label><input type="text" id="f-id" required></div>
                    <div class="form-group"><label>Display Name</label><input type="text" id="f-name" required></div>
                </div>
                <div class="form-group"><label>Desc</label><textarea id="f-desc" rows="2"></textarea></div>
                <div class="form-group"><label>Personality</label><textarea id="f-pers" rows="2"></textarea></div>
                <div class="form-group"><label>Speaking Style</label><textarea id="f-style" rows="2"></textarea></div>
                <div class="form-group"><label>World</label><textarea id="f-world" rows="2"></textarea></div>
                <div style="display:flex; justify-content:flex-end; gap:0.5rem">
                    <button type="button" class="btn btn-outline" onclick="closeModal()">Close</button>
                    <button type="submit" class="btn">Save</button>
                </div>
            </form>
        </div></div>

        <!-- USER DETAIL MODAL -->
        <div id="user-modal" class="modal"><div class="modal-content" style="max-width:800px">
            <h2 id="u-title" style="margin-bottom:1rem">Riwayat Percakapan User</h2>
            <div id="user-log-container" style="display:flex; flex-direction:column; gap:1rem"></div>
            <div style="margin-top:1.5rem; text-align:right">
                <button class="btn" onclick="document.getElementById('user-modal').style.display='none'">Tutup</button>
            </div>
        </div></div>

        <script>
            let characters = [];
            let currentPage = 'dashboard';

            function showPage(pageId, el) {
                currentPage = pageId;
                document.querySelectorAll('main > div').forEach(p => p.classList.add('hidden'));
                const target = document.getElementById('page-' + pageId);
                if(target) target.classList.remove('hidden');
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                if(el) el.classList.add('active');

                if(pageId === 'karakter') load();
                if(pageId === 'otak') loadModels();
                if(pageId === 'users') loadUsers();
                if(pageId === 'logs') loadLogs();
            }

            async function load() {
                try {
                    const r = await fetch('/api/characters');
                    const d = await r.json();
                    characters = d.characters;
                    const b = document.getElementById('char-body');
                    if(!b) return;
                    b.innerHTML = '';
                    characters.forEach(c => {
                        b.innerHTML += '<tr>' +
                            '<td><div style="font-weight:500">' + c.npc_name + '</div><div style="font-size:0.7rem; color:var(--text-muted)">' + c.id + '</div></td>' +
                            '<td>' + (c.is_enabled ? '<span style="color:#22c55e">● Online</span>' : '<span style="color:#94a3b8">○ Offline</span>') + '</td>' +
                            '<td><label class="switch"><input type="checkbox" ' + (c.is_enabled ? 'checked' : '') + ' onchange="toggleChar(\\''+c.id+'\\', this.checked)"><span class="slider"></span></label></td>' +
                            '<td style="text-align:right"><button class="btn btn-outline" style="padding:0.3rem 0.6rem; margin-right:0.4rem" onclick="editChar(\\''+c.id+'\\')">Edit</button><button class="btn-danger" onclick="deleteChar(\\''+c.id+'\\')">Del</button></td>' +
                        '</tr>';
                    });
                } catch(e) {}
            }

            async function loadUsers() {
                try {
                    const r = await fetch('/api/admin/users');
                    const d = await r.json();
                    const b = document.getElementById('user-body');
                    b.innerHTML = '';
                    d.users.forEach(u => {
                        b.innerHTML += '<tr>' +
                            '<td style="font-weight:600">' + u.username + '</td>' +
                            '<td><span class="badge badge-orange">Lv ' + u.heart_level + '</span></td>' +
                            '<td style="font-size:0.8rem; color:var(--text-muted)">' + new Date(u.last_seen).toLocaleString('id-ID') + '</td>' +
                            '<td style="text-align:right"><button class="btn btn-outline" onclick="viewUserDetail(\\''+u.username+'\\')">Detail Log</button></td>' +
                        '</tr>';
                    });
                } catch(e) {}
            }

            async function viewUserDetail(name) {
                document.getElementById('u-title').innerText = 'Log Percakapan: ' + name;
                document.getElementById('user-modal').style.display = 'flex';
                const cont = document.getElementById('user-log-container');
                cont.innerHTML = 'Memuat...';
                try {
                    const r = await fetch('/api/admin/user-logs/' + name);
                    const d = await r.json();
                    cont.innerHTML = '';
                    d.logs.forEach(l => {
                        cont.innerHTML += '<div style="border-bottom:1px solid #f1f5f9; padding-bottom:1rem">' +
                            '<div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:0.4rem">' + new Date(l.timestamp).toLocaleString() + ' (NPC: '+l.ai_name.toUpperCase()+')</div>' +
                            '<div class="log-bubble log-user"><b>User:</b> ' + l.user_message + '</div>' +
                            '<div class="log-bubble log-bot"><b>AI:</b> ' + l.bot_response.replace(/\\n/g, '<br>') + '</div>' +
                            '<div style="font-size:0.7rem; text-align:right; color:var(--text-muted)">' + l.tokens + ' Tokens</div>' +
                        '</div>';
                    });
                } catch(e) { cont.innerHTML = 'Gagal memuat log.'; }
            }

            async function loadLogs() {
                try {
                    const r = await fetch('/api/admin/logs');
                    const d = await r.json();
                    const b = document.getElementById('log-body');
                    b.innerHTML = '';
                    d.logs.forEach(l => {
                        b.innerHTML += '<tr>' +
                            '<td style="font-size:0.7rem; color:var(--text-muted)">' + new Date(l.timestamp).toLocaleString() + '</td>' +
                            '<td><div style="font-weight:600; color:var(--primary)">' + l.ai_name.toUpperCase() + '</div><div style="font-size:0.7rem">@' + l.username + '</div></td>' +
                            '<td><div class="log-bubble log-user" style="padding:0.3rem"><b>U:</b> ' + l.user_message + '</div><div class="log-bubble log-bot" style="padding:0.3rem"><b>A:</b> ' + l.bot_response.replace(/\\n/g, '<br>') + '</div></td>' +
                            '<td style="font-size:0.7rem">' + l.tokens + ' toks</td>' +
                        '</tr>';
                    });
                } catch(e) {}
            }

            async function loadModels() {
                try {
                    const r = await fetch('/api/admin/models');
                    const d = await r.json();
                    const list = document.getElementById('otak-list');
                    list.innerHTML = '';
                    d.otak.forEach(o => {
                        const isCd = o.isCoolingDown;
                        list.innerHTML += '<div class="otak-card">' +
                            '<div><div style="font-weight:600">Otak '+o.id+'</div><div style="font-size:0.7rem; color:'+(isCd ? '#ef4444' : (o.isEnabled ? '#22c55e' : '#94a3b8'))+'">● '+(isCd ? 'Cooldown' : (o.isEnabled ? 'Aktif' : 'Off'))+'</div></div>' +
                            '<label class="switch"><input type="checkbox" '+(o.isEnabled ? 'checked' : '')+' onchange="toggleOtak('+o.id+', this.checked)"><span class="slider"></span></label>' +
                        '</div>';
                    });
                } catch(e) {}
            }

            // NPC & Modal Utils
            function openModal(id = null) {
                document.getElementById('modal').style.display = 'flex';
                if(id) {
                    const c = characters.find(x => x.id === id);
                    document.getElementById('f-id').value = c.id;
                    document.getElementById('f-id').disabled = true;
                    document.getElementById('f-name').value = c.npc_name;
                    document.getElementById('f-desc').value = c.npc_description;
                    document.getElementById('f-pers').value = c.npc_personality;
                    document.getElementById('f-style').value = c.npc_speaking_style;
                    document.getElementById('f-world').value = c.world_setting;
                } else { document.getElementById('char-form').reset(); document.getElementById('f-id').disabled = false; }
            }
            function closeModal() { document.getElementById('modal').style.display = 'none'; }
            async function toggleChar(id, enabled) {
                const c = characters.find(x => x.id === id);
                await fetch('/api/characters/save', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, data:{...c, is_enabled:enabled}}) });
                load();
            }
            async function deleteChar(id) { if(confirm('Del?')) { await fetch('/api/characters/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id}) }); load(); } }
            document.getElementById('char-form').onsubmit = async (e) => {
                e.preventDefault();
                const id = document.getElementById('f-id').value;
                const c = characters.find(x => x.id === id);
                const data = { npc_name:document.getElementById('f-name').value, npc_description:document.getElementById('f-desc').value, npc_personality:document.getElementById('f-pers').value, npc_speaking_style:document.getElementById('f-style').value, world_setting:document.getElementById('f-world').value, is_enabled:c?c.is_enabled:true, language:'id' };
                await fetch('/api/characters/save', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, data}) });
                closeModal(); load();
            };
            function editChar(id) { openModal(id); }
            async function toggleOtak(id, enabled) { await fetch('/api/admin/models/toggle', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, enabled}) }); loadModels(); }
            async function switchModel(m) { await fetch('/api/admin/models/switch', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({primaryModel:m}) }); }

            setInterval(async () => {
                try {
                    const r = await fetch('/api/stats');
                    const d = await r.json();
                    document.getElementById('s-req').innerText = d.totalRequests;
                    document.getElementById('s-tok').innerText = d.totalTokens;
                    document.getElementById('s-active').innerText = d.active_keys + '/' + d.available_keys;
                    document.getElementById('s-cooldown').innerText = d.cooldown_keys;
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
            :root { --primary: #f97316; --bg: #f8fafc; --card: #ffffff; --border: #e2e8f0; --text: #1e293b; --text-muted: #64748b; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Outfit', sans-serif; background: var(--bg); color: var(--text); height: 100vh; display: flex; justify-content: center; align-items: center; }
            .card { background: var(--card); padding: 2.5rem; width: 100%; max-width: 400px; border: 1px solid var(--border); border-radius: 1rem; }
            .brand { size: 1.5rem; font-weight: 600; color: var(--primary); text-align: center; margin-bottom: 0.5rem; }
            .input { width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 0.5rem; margin-top: 0.5rem; outline: none; }
            .btn { width: 100%; background: var(--primary); color: #fff; border: none; padding: 0.75rem; border-radius: 0.5rem; cursor: pointer; font-weight: 600; margin-top: 1.5rem; }
            .error { background: #fef2f2; color: #ef4444; padding: 0.75rem; border-radius: 0.5rem; font-size: 0.8rem; margin-bottom: 1rem; text-align: center; }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="brand" style="font-size:1.5rem">NPC SYSTEM</div>
            <div style="text-align:center; color:var(--text-muted); font-size:0.85rem; margin-bottom:2rem">Admin Authentication</div>
            \${error ? \`<div class="error">\${error}</div>\` : ''}
            <form action="/login" method="POST">
                <label style="font-size:0.8rem; font-weight:500">Username</label><input type="text" name="username" class="input" required>
                <div style="margin-top:1rem"><label style="font-size:0.8rem; font-weight:500">Password</label><input type="password" name="password" class="input" required></div>
                <button type="submit" class="btn">Login to Dashboard</button>
            </form>
        </div>
    </body>
    </html>
    `;
}

module.exports = { getAdminDashboardHTML, getLoginPageHTML };
