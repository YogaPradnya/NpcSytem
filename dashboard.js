function getAdminDashboardHTML(stats) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>NPC SYSTEM - Control Panel</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
        <style>
            :root {
                --primary: #f97316; /* Orange */
                --primary-hover: #ea580c;
                --bg: #ffffff;
                --sidebar-bg: #1e293b;
                --border: #e2e8f0;
                --text-main: #1e293b;
                --text-muted: #64748b;
                --success: #22c55e;
                --danger: #ef4444;
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
                color: #fff;
                display: flex;
                flex-direction: column;
                padding: 2rem 1.2rem;
            }
            .brand {
                font-size: 1.4rem;
                font-weight: 700;
                color: #fff;
                margin-bottom: 2.5rem;
                letter-spacing: -0.5px;
                padding-left: 0.8rem;
            }
            .brand span { color: var(--primary); }
            nav { display: flex; flex-direction: column; gap: 0.4rem; }
            .nav-item {
                padding: 0.75rem 1rem;
                border-radius: 0.5rem;
                cursor: pointer;
                color: #94a3b8;
                font-weight: 500;
                transition: all 0.2s;
                font-size: 0.9rem;
            }
            .nav-item:hover { background: rgba(255,255,255,0.05); color: #fff; }
            .nav-item.active {
                background: var(--primary);
                color: #fff;
            }

            /* Main Content */
            main {
                flex: 1;
                overflow-y: auto;
                padding: 2.5rem;
                background: #f8fafc;
            }
            header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 2rem;
            }
            h1 { font-size: 1.5rem; font-weight: 600; }

            /* Stats Grid */
            .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.25rem; margin-bottom: 2.5rem; }
            .stat-card {
                background: #fff;
                padding: 1.25rem;
                border: 1px solid var(--border);
                border-radius: 1rem;
                box-shadow: 0 1px 3px rgba(0,0,0,0.02);
            }
            .stat-card h3 { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem; letter-spacing: 0.8px; }
            .stat-card p { font-size: 1.4rem; font-weight: 700; color: var(--text-main); }

            /* Card Sections */
            .card-section {
                background: #fff;
                border: 1px solid var(--border);
                border-radius: 1rem;
                padding: 1.5rem;
                margin-bottom: 2rem;
                box-shadow: 0 1px 3px rgba(0,0,0,0.02);
            }
            table { width: 100%; border-collapse: collapse; }
            table th { text-align: left; padding: 1rem; color: var(--text-muted); font-size: 0.75rem; border-bottom: 1px solid var(--border); font-weight: 600; text-transform: uppercase; }
            table td { padding: 1rem; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; vertical-align: middle; }

            /* Otak Card (Custom UI) */
            .otak-container { display: flex; flex-direction: column; gap: 0.75rem; }
            .otak-row {
                display: flex;
                align-items: center;
                background: #fff;
                border: 1px solid var(--border);
                border-radius: 0.75rem;
                padding: 1rem 1.5rem;
                gap: 2rem;
                transition: all 0.2s;
            }
            .otak-row.active { background: #f0fdf4; border-color: #bbf7d0; }
            .otak-name { font-weight: 700; font-size: 0.85rem; min-width: 80px; }
            .otak-stats { display: flex; flex: 1; gap: 2rem; }
            .otak-stat-item { display: flex; flex-direction: column; gap: 2px; }
            .otak-stat-label { font-size: 0.6rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; }
            .otak-stat-value { font-size: 0.9rem; font-weight: 700; }

            /* Buttons */
            .btn {
                background: var(--primary);
                color: #fff;
                border: none;
                padding: 0.6rem 1.2rem;
                border-radius: 0.5rem;
                cursor: pointer;
                font-weight: 600;
                font-size: 0.85rem;
                transition: all 0.2s;
                text-decoration: none;
                display: inline-flex;
                align-items: center;
                gap: 0.5rem;
            }
            .btn:hover { background: var(--primary-hover); transform: translateY(-1px); }
            .btn-outline {
                background: #fff;
                border: 1px solid var(--border);
                color: var(--text-main);
            }
            .btn-outline:hover { background: #f8fafc; border-color: #cbd5e1; }
            .btn-danger { color: var(--danger); background: transparent; border: none; cursor:pointer; font-weight:600; font-size:0.8rem; }
            
            /* Inputs */
            .input-search {
                padding: 0.6rem 1rem;
                border: 1px solid var(--border);
                border-radius: 0.5rem;
                font-family: inherit;
                font-size: 0.85rem;
                width: 250px;
                outline: none;
            }
            .input-search:focus { border-color: var(--primary); }

            /* Switch */
            .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { position: absolute; cursor: pointer; inset: 0; background-color: #e2e8f0; transition: .4s; border-radius: 24px; }
            .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            input:checked + .slider { background-color: var(--success); }
            input:checked + .slider:before { transform: translateX(20px); }

            /* Simulator */
            .sim-container { display: flex; flex-direction: column; height: 500px; background: #fff; border-radius: 1rem; border: 1px solid var(--border); overflow: hidden; }
            .sim-header { padding: 1rem 1.5rem; border-bottom: 1px solid var(--border); background: #f8fafc; display: flex; justify-content: space-between; align-items: center; }
            #sim-messages { flex: 1; overflow-y: auto; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; background: #fff; }
            .msg { max-width: 80%; padding: 0.75rem 1rem; border-radius: 0.75rem; font-size: 0.9rem; line-height: 1.5; }
            .msg-user { align-self: flex-end; background: var(--primary); color: #fff; border-bottom-right-radius: 0.2rem; }
            .msg-bot { align-self: flex-start; background: #f1f5f9; color: var(--text-main); border-bottom-left-radius: 0.2rem; }
            .sim-input-area { padding: 1rem 1.5rem; border-top: 1px solid var(--border); display: flex; gap: 0.75rem; background: #f8fafc; }

            /* Modal */
            .modal { display:none; position:fixed; inset:0; background:rgba(15, 23, 42, 0.6); justify-content:center; align-items:center; z-index:100; backdrop-filter: blur(4px); }
            .modal-content { background:#fff; padding:2rem; border-radius:1.25rem; width:100%; max-width:600px; max-height: 90vh; overflow-y: auto; border: 1px solid var(--border); position: relative; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
            .form-group { margin-bottom: 1.25rem; }
            .form-group label { display:block; margin-bottom:0.5rem; color:var(--text-muted); font-size:0.75rem; font-weight: 600; text-transform: uppercase; }
            .form-group input, .form-group textarea, .form-group select { width:100%; padding:0.75rem; background:#fff; border:1px solid var(--border); color:var(--text-main); border-radius:0.6rem; font-family: inherit; font-size: 0.9rem; }
            .form-group input:focus { outline: none; border-color: var(--primary); }

            .hidden { display: none !important; }
            .badge-latency { font-size: 0.65rem; background: #fef9c3; color: #854d0e; padding: 2px 6px; border-radius: 4px; font-weight: 600; }
        </style>
    </head>
    <body>
        <aside>
            <div class="brand"><span>NPC</span>SYSTEM</div>
            <nav id="sidebar-nav">
                <div class="nav-item active" onclick="showPage('dashboard', this)">Dashboard</div>
                <div class="nav-item" onclick="showPage('karakter', this)">Data Karakter</div>
                <div class="nav-item" onclick="showPage('otak', this)">Manajemen Otak</div>
                <div class="nav-item" onclick="showPage('users', this)">Daftar User</div>
                <div class="nav-item" onclick="showPage('logs', this)">Log Percakapan</div>
                <div class="nav-item" onclick="showPage('simulator', this)">Live Simulator</div>
            </nav>
            <div style="margin-top: auto; padding: 1rem; background: rgba(0,0,0,0.2); border-radius: 0.75rem;">
                <div style="font-size: 0.7rem; color: #94a3b8; margin-bottom: 0.5rem">SESSION ACTIVE</div>
                <a href="/logout" style="color: #fff; text-decoration: none; font-size: 0.85rem; font-weight: 600; display: flex; align-items:center; gap: 0.5rem">Logout →</a>
            </div>
        </aside>

        <main>
            <!-- DASHBOARD -->
            <div id="page-dashboard">
                <header><h1>Dashboard Overview</h1></header>
                <div class="stats-grid">
                    <div class="stat-card"><h3>Global Requests</h3><p id="s-req">${stats.totalRequests}</p></div>
                    <div class="stat-card"><h3>Tokens Consumed</h3><p id="s-tok">${stats.totalTokens}</p></div>
                    <div class="stat-card"><h3>Healthy Cluster</h3><p id="s-active">${stats.active_keys}/${stats.available_keys}</p></div>
                    <div class="stat-card"><h3>Cluster Exhausted</h3><p id="s-cooldown" style="color:var(--danger)">${stats.cooldown_keys}</p></div>
                </div>

                <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:1.5rem">
                    <div class="card-section">
                        <h3 style="font-size:0.85rem; margin-bottom:1.25rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px">Top NPCs Usage</h3>
                        <table id="top-char-table">
                            <thead><tr><th>NPC NAME</th><th style="text-align:right">TOKENS</th></tr></thead>
                            <tbody id="top-char-body"></tbody>
                        </table>
                    </div>
                    <div class="card-section">
                        <h3 style="font-size:0.85rem; margin-bottom:1.25rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px">Infrastructure</h3>
                        <div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:0.75rem; padding-bottom:0.75rem; border-bottom:1px solid #f1f5f9">
                            <span>Engine Uptime</span><span id="s-uptime">-</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:0.9rem; margin-bottom:0.75rem; padding-bottom:0.75rem; border-bottom:1px solid #f1f5f9">
                            <span>Core DB</span><span>Turso / SQLite</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; font-size:0.9rem">
                            <span>Provider</span><span>Groq Cloud / AI</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- KARAKTER -->
            <div id="page-karakter" class="hidden">
                <header><h1>Management Karakter</h1><button class="btn" onclick="openModal()">+ Create NPC</button></header>
                <div class="card-section">
                    <table>
                        <thead><tr><th>CHARACTER</th><th>STATUS</th><th>SWITCH</th><th style="text-align:right">ACTIONS</th></tr></thead>
                        <tbody id="char-body"></tbody>
                    </table>
                </div>
            </div>

            <!-- OTAK -->
            <div id="page-otak" class="hidden">
                <header>
                    <h1>Node Clusters (Otak)</h1>
                    <div style="font-size:0.8rem; color:var(--text-muted)">Load Balancing Groq Keys</div>
                </header>
                <div class="otak-container" id="otak-list"></div>
            </div>

            <!-- USERS -->
            <div id="page-users" class="hidden">
                <header><h1>Registry User Aktif</h1><button class="btn btn-outline" onclick="loadUsers()">Sync Remote</button></header>
                <div class="card-section">
                    <table>
                        <thead><tr><th>VISITOR / USERNAME</th><th>LAST ACTIVITY</th><th style="text-align:right">ANALYTICS</th></tr></thead>
                        <tbody id="user-body"></tbody>
                    </table>
                </div>
            </div>

            <!-- LOGS -->
            <div id="page-logs" class="hidden">
                <header>
                    <h1>Global Interaction Logs</h1>
                    <div style="display:flex; gap:0.5rem">
                        <input type="text" id="log-search" class="input-search" placeholder="Search by Username or NPC..." onkeyup="filterLogs()">
                        <button class="btn btn-outline" onclick="loadLogs()">Refresh</button>
                    </div>
                </header>
                <div class="card-section">
                    <table>
                        <thead><tr><th style="width:140px">TIMESTAMP</th><th style="width:120px">ACTORS</th><th>CONVERSATION</th><th style="width:140px">TELEMETRY</th></tr></thead>
                        <tbody id="log-body"></tbody>
                    </table>
                </div>
            </div>

            <!-- SIMULATOR -->
            <div id="page-simulator" class="hidden">
                <header><h1>Live AI Simulator</h1></header>
                <div class="sim-container">
                    <div class="sim-header">
                        <select id="sim-char-select" style="padding:0.4rem; border-radius:0.4rem; border:1px solid #ddd; outline:none; font-family:inherit">
                            <option value="">Select NPC to chat...</option>
                        </select>
                        <button onclick="clearSim()" class="btn-danger">Clear Chat</button>
                    </div>
                    <div id="sim-messages">
                        <div style="text-align:center; color:#94a3b8; font-size:0.8rem; margin-top:2rem">Pilih karakter dan mulai kirim pesan untuk simulasi...</div>
                    </div>
                    <div class="sim-input-area">
                        <input type="text" id="sim-input" style="flex:1; padding:0.75rem; border-radius:0.6rem; border:1px solid #ddd; outline:none" placeholder="Tulis sesuatu..." onkeypress="if(event.key==='Enter') sendSim()">
                        <button class="btn" onclick="sendSim()">Send Message</button>
                    </div>
                </div>
            </div>
        </main>

        <!-- MODAL & SCRIPTS AS BEFORE WITH UPDATES -->
        <div id="modal" class="modal"><div class="modal-content">
            <h2 id="m-title" style="margin-bottom:1.5rem">Configure NPC</h2>
            <form id="char-form">
                <input type="hidden" id="f-old-id">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem">
                    <div class="form-group"><label>Unique ID</label><input type="text" id="f-id" required></div>
                    <div class="form-group"><label>NPC Name</label><input type="text" id="f-name" required></div>
                </div>
                <div class="form-group"><label>Description</label><textarea id="f-desc" rows="3"></textarea></div>
                <div class="form-group"><label>Personality</label><textarea id="f-pers" rows="3"></textarea></div>
                <div class="form-group"><label>Speaking Style</label><textarea id="f-style" rows="2"></textarea></div>
                <div class="form-group"><label>World Context</label><textarea id="f-world" rows="2"></textarea></div>
                <div style="display:flex; justify-content:flex-end; gap:0.5rem">
                    <button type="button" class="btn btn-outline" onclick="closeModal()">Cancel</button>
                    <button type="submit" class="btn">Apply Changes</button>
                </div>
            </form>
        </div></div>

        <div id="user-modal" class="modal"><div class="modal-content" style="max-width:800px">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem">
                <h2 id="u-title">Interaction Details</h2>
                <button class="btn-outline" style="padding:0.3rem 0.6rem" onclick="document.getElementById('user-modal').style.display='none'">✕</button>
            </div>
            <div id="user-log-container" style="display:flex; flex-direction:column; gap:1rem"></div>
        </div></div>

        <script>
            let characters = [];
            let allLogs = [];

            function showPage(pageId, el) {
                document.querySelectorAll('main > div').forEach(p => p.classList.add('hidden'));
                const target = document.getElementById('page-' + pageId);
                if(target) target.classList.remove('hidden');
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                if(el) el.classList.add('active');

                if(pageId === 'karakter') load();
                if(pageId === 'otak') loadModels();
                if(pageId === 'users') loadUsers();
                if(pageId === 'logs') loadLogs();
                if(pageId === 'simulator') loadSimSelect();
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
                            '<td><div style="font-weight:600; font-size:0.95rem">' + c.npc_name + '</div><div style="font-size:0.65rem; color:var(--text-muted)">' + c.id.toUpperCase() + '</div></td>' +
                            '<td>' + (c.is_enabled ? '<span style="color:var(--success); font-weight:600">ONLINE</span>' : '<span style="color:var(--text-muted)">OFFLINE</span>') + '</td>' +
                            '<td><label class="switch"><input type="checkbox" ' + (c.is_enabled ? 'checked' : '') + ' onchange="toggleChar(\\''+c.id+'\\', this.checked)"><span class="slider"></span></label></td>' +
                            '<td style="text-align:right"><button class="btn btn-outline" style="padding:0.4rem 0.6rem" onclick="editChar(\\''+c.id+'\\')">Settings</button> <button class="btn-danger" onclick="deleteChar(\\''+c.id+'\\')">×</button></td>' +
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
                        const s = o.stats || { requests:0, success:0, errors:0 };
                        list.innerHTML += '<div class="otak-row '+(isCd ? '' : (o.isEnabled ? 'active' : ''))+'">' +
                            '<div class="otak-name">OTAK #'+o.id+'</div>' +
                            '<div class="otak-stats">' +
                                '<div class="otak-stat-item"><div class="otak-stat-label">Requests</div><div class="otak-stat-value">'+s.requests+'</div></div>' +
                                '<div class="otak-stat-item"><div class="otak-stat-label">Success</div><div class="otak-stat-value" style="color:var(--success)">'+s.success+'</div></div>' +
                                '<div class="otak-stat-item"><div class="otak-stat-label">Errors</div><div class="otak-stat-value" style="color:var(--danger)">'+s.errors+'</div></div>' +
                                '<div class="otak-stat-item"><div class="otak-stat-label">Status</div><div class="otak-stat-value" style="font-size:0.65rem; color:'+(isCd ? 'red' : 'inherit')+'">'+(isCd ? 'COOLDOWN' : (o.isEnabled ? 'READY' : 'DISABLED'))+'</div></div>' +
                            '</div>' +
                            '<label class="switch"><input type="checkbox" '+(o.isEnabled ? 'checked' : '')+' onchange="toggleOtak('+o.id+', this.checked)"><span class="slider"></span></label>' +
                        '</div>';
                    });
                } catch(e) {}
            }

            async function loadLogs() {
                try {
                    const r = await fetch('/api/admin/logs');
                    const d = await r.json();
                    allLogs = d.logs;
                    renderLogs(allLogs);
                } catch(e) {}
            }

            function renderLogs(logs) {
                const b = document.getElementById('log-body');
                b.innerHTML = '';
                logs.forEach(l => {
                    const latency = l.latency ? '<span class="badge-latency">'+l.latency+'ms</span>' : '';
                    b.innerHTML += '<tr>' +
                        '<td style="font-size:0.75rem; color:var(--text-muted)">' + new Date(l.timestamp).toLocaleString('id-ID') + '</td>' +
                        '<td><div style="font-weight:700; color:var(--primary); font-size:0.8rem">' + l.ai_name.toUpperCase() + '</div><div style="font-size:0.7rem; color:var(--text-muted)">@' + l.username + '</div></td>' +
                        '<td><div style="font-size:0.85rem; margin-bottom:0.4rem"><b>U:</b> ' + l.user_message + '</div><div style="font-size:0.85rem; color:var(--text-muted)"><b>A:</b> ' + l.bot_response.replace(/\\n/g, ' / ') + '</div></td>' +
                        '<td><div style="font-size:0.7rem">' + l.tokens + ' toks</div>' + latency + '</td>' +
                    '</tr>';
                });
            }

            function filterLogs() {
                const q = document.getElementById('log-search').value.toLowerCase();
                const filtered = allLogs.filter(l => l.username.toLowerCase().includes(q) || l.ai_name.toLowerCase().includes(q));
                renderLogs(filtered);
            }

            async function loadUsers() {
                try {
                    const r = await fetch('/api/admin/users');
                    const d = await r.json();
                    const b = document.getElementById('user-body');
                    b.innerHTML = '';
                    d.users.forEach(u => {
                        b.innerHTML += '<tr>' +
                            '<td style="font-weight:700">' + u.username + '</td>' +
                            '<td style="font-size:0.8rem; color:var(--text-muted)">' + new Date(u.last_seen).toLocaleString() + '</td>' +
                            '<td style="text-align:right"><button class="btn btn-outline" style="padding:0.3rem 0.6rem" onclick="viewUserDetail(\\''+u.username+'\\')">Visualizer Log</button></td>' +
                        '</tr>';
                    });
                } catch(e) {}
            }

            async function viewUserDetail(name) {
                document.getElementById('u-title').innerText = 'Conversation Analytics: ' + name;
                document.getElementById('user-modal').style.display = 'flex';
                const cont = document.getElementById('user-log-container');
                cont.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted)">Fetching timeline...</div>';
                try {
                    const r = await fetch('/api/admin/user-logs/' + name);
                    const d = await r.json();
                    cont.innerHTML = '';
                    d.logs.forEach(l => {
                        cont.innerHTML += '<div style="padding:1rem; background:#f8fafc; border-radius:0.75rem; border:1px solid var(--border)">' +
                            '<div style="font-size:0.65rem; color:var(--text-muted); margin-bottom:0.6rem; display:flex; justify-content:space-between"><span>'+new Date(l.timestamp).toLocaleString()+'</span><span>NPC: '+l.ai_name.toUpperCase()+'</span></div>' +
                            '<div style="font-size:0.9rem; margin-bottom:0.5rem"><b>User:</b> ' + l.user_message + '</div>' +
                            '<div style="font-size:0.9rem; color:var(--primary)"><b>Bot:</b> ' + l.bot_response.replace(/\\n/g, '<br>') + '</div>' +
                        '</div>';
                    });
                } catch(e) { cont.innerHTML = 'Error data sync.'; }
            }

            // SIMULATOR LOGIC
            function loadSimSelect() {
                const sel = document.getElementById('sim-char-select');
                sel.innerHTML = '<option value="">Select NPC to chat...</option>';
                characters.forEach(c => {
                    if(c.is_enabled) sel.innerHTML += '<option value="'+c.id+'">'+c.npc_name+'</option>';
                });
            }
            async function sendSim() {
                const char = document.getElementById('sim-char-select').value;
                const msg = document.getElementById('sim-input').value;
                if(!char || !msg) return;

                appendMsg('user', msg);
                document.getElementById('sim-input').value = '';
                
                try {
                    const res = await fetch('/api/npc/v1/chat', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({
                            user: { username: 'AdminSim', level: 3 },
                            message: msg,
                            system: { ai_name: char },
                            context: { location: 'Simulator Room', time: 'REALTIME', history: [] }
                        })
                    });
                    const data = await res.json();
                    if(data.success !== false) {
                        appendMsg('bot', data.sentences.join('\\n'));
                    } else { appendMsg('bot', 'Error: ' + data.error); }
                } catch(e) { appendMsg('bot', 'Connection error.'); }
            }
            function appendMsg(role, text) {
                const box = document.getElementById('sim-messages');
                if(box.querySelector('div[style*="text-align:center"]')) box.innerHTML = '';
                const div = document.createElement('div');
                div.className = 'msg msg-' + role;
                div.innerHTML = text.replace(/\\n/g, '<br>');
                box.appendChild(div);
                box.scrollTop = box.scrollHeight;
            }
            function clearSim() { document.getElementById('sim-messages').innerHTML = '<div style="text-align:center; color:#94a3b8; font-size:0.8rem; margin-top:2rem">Conversation cleared. Select NPC to start.</div>'; }

            // MODAL & BUTTON FUNCS
            function openModal(id = null) {
                document.getElementById('modal').style.display = 'flex';
                const idInput = document.getElementById('f-id');
                if(id) {
                    const c = characters.find(x => x.id === id);
                    idInput.value = c.id; idInput.disabled = true;
                    document.getElementById('f-name').value = c.npc_name;
                    document.getElementById('f-desc').value = c.npc_description;
                    document.getElementById('f-pers').value = c.npc_personality;
                    document.getElementById('f-style').value = c.npc_speaking_style;
                    document.getElementById('f-world').value = c.world_setting;
                    document.getElementById('m-title').innerText = 'NPC Configuration';
                } else { 
                    document.getElementById('char-form').reset(); 
                    idInput.disabled = false; 
                    document.getElementById('m-title').innerText = 'Create New NPC';
                }
            }
            function closeModal() { document.getElementById('modal').style.display = 'none'; }
            async function toggleChar(id, enabled) {
                const c = characters.find(x => x.id === id);
                await fetch('/api/characters/save', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, data:{...c, is_enabled:enabled}}) });
                load();
            }
            async function deleteChar(id) { if(confirm('Delete Characterpermanently?')) { await fetch('/api/characters/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id}) }); load(); } }
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

            setInterval(async () => {
                try {
                    const r = await fetch('/api/stats');
                    const d = await r.json();
                    document.getElementById('s-req').innerText = d.totalRequests;
                    document.getElementById('s-tok').innerText = d.totalTokens;
                    document.getElementById('s-active').innerText = d.active_keys + '/' + d.available_keys;
                    document.getElementById('s-cooldown').innerText = d.cooldown_keys;
                    document.getElementById('s-uptime').innerText = d.uptime;

                    const tb = document.getElementById('top-char-body');
                    if (tb && d.topChars) {
                        tb.innerHTML = '';
                        d.topChars.forEach(c => { tb.innerHTML += '<tr><td>' + c.name.toUpperCase() + '</td><td style="text-align:right">' + c.toks + '</td></tr>'; });
                    }
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
        <title>Login - Control Panel</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
        <style>
            :root { --primary: #f97316; --bg: #0f172a; --card: #1e293b; --border: #334155; --text: #f8fafc; --text-muted: #94a3b8; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Outfit', sans-serif; background: var(--bg); color: var(--text); height: 100vh; display: flex; justify-content: center; align-items: center; }
            .card { background: var(--card); padding: 3rem; width: 100%; max-width: 420px; border: 1px solid var(--border); border-radius: 1.5rem; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
            .brand { size: 1.8rem; font-weight: 700; color: #fff; text-align: center; margin-bottom: 2rem; }
            .brand span { color: var(--primary); }
            .input { width: 100%; padding: 0.8rem 1rem; background: #0f172a; border: 1px solid var(--border); border-radius: 0.75rem; margin-top: 0.5rem; outline: none; color: #fff; focus: border-color: var(--primary); }
            .btn { width: 100%; background: var(--primary); color: #fff; border: none; padding: 0.85rem; border-radius: 0.75rem; cursor: pointer; font-weight: 700; margin-top: 2rem; transition: all 0.2s; }
            .btn:hover { background: #ea580c; transform: translateY(-1px); }
            .error { background: rgba(239, 68, 68, 0.1); color: #ef4444; padding: 0.75rem; border-radius: 0.5rem; font-size: 0.8rem; margin-bottom: 1.5rem; text-align: center; border: 1px solid rgba(239, 68, 68, 0.2); }
        </style>
    </head>
    <body>
        <div class="card">
            <div class="brand" style="font-size:1.8rem"><span>NPC</span>SYSTEM</div>
            \${error ? \`<div class="error">\${error}</div>\` : ''}
            <form action="/login" method="POST">
                <div style="margin-bottom:1.25rem"><label style="font-size:0.75rem; font-weight:600; color:var(--text-muted); text-transform:uppercase">Admin Username</label><input type="text" name="username" class="input" required></div>
                <div><label style="font-size:0.75rem; font-weight:600; color:var(--text-muted); text-transform:uppercase">Root Password</label><input type="password" name="password" class="input" required></div>
                <button type="submit" class="btn">Access Dashboard</button>
            </form>
            <div style="text-align:center; margin-top:1.5rem; font-size:0.7rem; color:var(--text-muted)">Secure Engine Control Panel v1.8</div>
        </div>
    </body>
    </html>
    `;
}

module.exports = { getAdminDashboardHTML, getLoginPageHTML };
