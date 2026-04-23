function getAdminDashboardHTML(stats) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>NPC SYSTEM - Control Panel</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
            :root {
                --primary: #f97316;
                --primary-hover: #ea580c;
                --bg: #f8fafc;
                --sidebar-bg: #1e293b;
                --border: #e2e8f0;
                --text-main: #1e293b;
                --text-muted: #64748b;
                --success: #22c55e;
                --danger: #ef4444;
                --info: #3b82f6;
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

            aside {
                width: 260px;
                background: var(--sidebar-bg);
                color: #fff;
                display: flex;
                flex-direction: column;
                padding: 2rem 1.2rem;
                flex-shrink: 0;
                z-index: 50;
                transition: transform 0.3s ease;
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

            main {
                flex: 1;
                overflow-y: auto;
                padding: 2rem;
                background: #f8fafc;
                width: 100%;
            }
            header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 2rem;
            }
            .menu-toggle { display: none; background: none; border: none; font-size: 1.5rem; cursor: pointer; }

            .stats-grid { 
                display: grid; 
                grid-template-columns: repeat(5, 1fr); 
                gap: 1.25rem; 
                margin-bottom: 2.5rem; 
            }
            
            .stat-card {
                background: #fff;
                padding: 1.25rem 1.5rem;
                border: 1px solid var(--border);
                border-radius: 0.75rem;
                box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
                border-left: 4px solid var(--primary);
                display: flex;
                flex-direction: column;
                justify-content: center;
                min-height: 100px;
            }
            .stat-card.blue { border-left-color: var(--info); }
            .stat-card.green { border-left-color: var(--success); }
            .stat-card.red { border-left-color: var(--danger); }
            .stat-card.orange { border-left-color: var(--primary); }

            .stat-card h3 { 
                font-size: 0.65rem; 
                color: var(--text-muted); 
                text-transform: uppercase; 
                margin-bottom: 0.75rem; 
                letter-spacing: 0.5px;
                font-weight: 700;
            }
            .stat-card p { 
                font-size: 1.75rem; 
                font-weight: 700; 
                color: #1e293b; 
                line-height: 1;
            }
            .uptime-val { color: var(--primary) !important; }

            /* 2 Column Layout at Bottom */
            .dashboard-bottom {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 1.5rem;
            }

            .card-section {
                background: #fff;
                border: 1px solid var(--border);
                border-radius: 1rem;
                padding: 1.5rem;
                margin-bottom: 2rem;
                box-shadow: 0 1px 3px rgba(0,0,0,0.02);
            }
            .card-section h3 {
                font-size: 0.8rem;
                margin-bottom: 1.5rem;
                color: var(--text-muted);
                text-transform: uppercase;
                font-weight: 700;
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .table-container { overflow-x: auto; }
            table { width: 100%; border-collapse: collapse; }
            table th { text-align: left; padding: 1rem; color: var(--text-muted); font-size: 0.75rem; border-bottom: 1px solid var(--border); font-weight: 600; text-transform: uppercase; }
            table td { padding: 1rem; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; vertical-align: middle; }

            /* Live Feed (Timeline) */
            .feed-container { display: flex; flex-direction: column; gap: 1rem; }
            .feed-item {
                display: flex;
                gap: 1rem;
                padding-bottom: 1rem;
                border-bottom: 1px solid #f1f5f9;
            }
            .feed-item:last-child { border-bottom: none; }
            .feed-avatar {
                width: 36px;
                height: 36px;
                border-radius: 50%;
                background: #e2e8f0;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.75rem;
                font-weight: 700;
                color: var(--text-muted);
                flex-shrink: 0;
            }
            .feed-content { flex: 1; }
            .feed-title { font-size: 0.85rem; font-weight: 600; margin-bottom: 2px; }
            .feed-title span { color: var(--primary); font-weight: 700; }
            .feed-msg { font-size: 0.8rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px; }
            .feed-time { font-size: 0.65rem; color: #94a3b8; }

            /* Otak Card */
            .otak-container { display: flex; flex-direction: column; gap: 0.75rem; }
            .otak-row {
                display: flex;
                align-items: center;
                background: #fff;
                border: 1px solid var(--border);
                border-radius: 0.75rem;
                padding: 1rem 1.5rem;
                gap: 1.5rem;
                transition: all 0.2s;
            }
            .otak-row.active { background: #f0fdf4; border-color: #bbf7d0; }
            .otak-name { font-weight: 700; font-size: 0.85rem; min-width: 80px; }
            .otak-stats { display: flex; flex: 1; gap: 1.5rem; flex-wrap: wrap; }
            .otak-stat-item { display: flex; flex-direction: column; gap: 2px; }
            .otak-stat-label { font-size: 0.6rem; color: var(--text-muted); font-weight: 600; text-transform: uppercase; }
            .otak-stat-value { font-size: 0.91rem; font-weight: 710; }

            /* Switch */
            .switch { position: relative; display: inline-block; width: 44px; height: 24px; }
            .switch input { opacity: 0; width: 0; height: 0; }
            .slider { position: absolute; cursor: pointer; inset: 0; background-color: #e2e8f0; transition: .4s; border-radius: 24px; }
            .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
            input:checked + .slider { background-color: var(--success); }
            input:checked + .slider:before { transform: translateX(20px); }

            /* Buttons */
            .btn { background: var(--primary); color:#fff; border:none; padding:0.6rem 1.2rem; border-radius:10px; cursor:pointer; font-weight:600; font-size:0.85rem; }
            .btn-outline { background:#fff; border:1px solid var(--border); color:var(--text-main); }
            .btn-danger { color:var(--danger); background:transparent; border:none; cursor:pointer; font-weight:600; font-size:0.8rem; }

            /* Responsive */
            @media (max-width: 1024px) {
                .stats-grid { grid-template-columns: repeat(3, 1fr); }
            }
            @media (max-width: 768px) {
                body { flex-direction: column; }
                aside {
                    width: 100%;
                    height: auto;
                    padding: 1rem;
                    position: fixed;
                    transform: translateX(-100%);
                }
                aside.mobile-open { transform: translateX(0); height: 100vh; }
                .menu-toggle { display: block; }
                main { padding: 1.5rem; margin-top: 60px; }
                .stats-grid { grid-template-columns: repeat(2, 1fr); }
                .dashboard-bottom { grid-template-columns: 1fr; }
                .mobile-header {
                    display: flex;
                    position: fixed;
                    top: 0; left: 0; right: 0;
                    height: 60px;
                    background: var(--sidebar-bg);
                    align-items: center;
                    padding: 0 1.5rem;
                    justify-content: space-between;
                    z-index: 60;
                }
                .mobile-header .brand { margin-bottom: 0; padding-left: 0; font-size: 1.1rem; }
            }
            @media (max-width: 480px) {
                .stats-grid { grid-template-columns: 1fr; }
            }

            .sim-container { display: flex; flex-direction: column; background: #fff; border-radius: 1rem; border: 1px solid var(--border); overflow: hidden; min-height: 400px; }
            #sim-messages { flex: 1; overflow-y: auto; padding: 1rem; display: flex; flex-direction: column; gap: 0.8rem; max-height: 400px; }
            .msg { max-width: 85%; padding: 0.6rem 0.9rem; border-radius: 15px; font-size: 0.85rem; }
            .msg-user { align-self: flex-end; background: var(--primary); color: #fff; border-bottom-right-radius: 2px; }
            .msg-bot { align-self: flex-start; background: #f1f5f9; color: var(--text-main); border-bottom-left-radius: 2px; }

            .modal { display:none; position:fixed; inset:0; background:rgba(15, 23, 42, 0.6); justify-content:center; align-items:center; z-index:100; backdrop-filter: blur(4px); }
            .modal-content { background:#fff; padding:2rem; border-radius:1.25rem; width:100%; max-width:600px; max-height: 90vh; overflow-y: auto; position: relative; }
            .form-group { margin-bottom: 1.25rem; }
            .form-group label { display:block; margin-bottom:0.5rem; color:var(--text-muted); font-size:0.75rem; font-weight: 700; text-transform: uppercase; }
            .form-group input, .form-group textarea, .form-group select { width:100%; padding:0.75rem; background:#fff; border:1px solid var(--border); color:var(--text-main); border-radius:0.6rem; font-family: inherit; }
            .hidden { display: none !important; }
        </style>
    </head>
    <body>
        <div class="mobile-header">
            <div class="brand"><span>NPC</span>SYSTEM</div>
            <button class="menu-toggle" onclick="toggleMobileMenu()" style="color:#fff">☰</button>
        </div>

        <aside id="sidebar">
            <div class="brand"><span>NPC</span>SYSTEM</div>
            <nav>
                <div class="nav-item active" onclick="showPage('dashboard', this)">Dashboard</div>
                <div class="nav-item" onclick="showPage('karakter', this)">Data Karakter</div>
                <div class="nav-item" onclick="showPage('otak', this)">Manajemen Otak</div>
                <div class="nav-item" onclick="showPage('users', this)">Daftar User</div>
                <div class="nav-item" onclick="showPage('logs', this)">Log Percakapan</div>
                <div class="nav-item" onclick="showPage('simulator', this)">Live Simulator</div>
            </nav>
            <div style="margin-top: auto; padding: 1rem; background: rgba(0,0,0,0.2); border-radius: 12px; margin-bottom: 1rem">
                <a href="/logout" style="color: #fff; text-decoration: none; font-size: 0.85rem; font-weight: 600;">Logout →</a>
            </div>
        </aside>

        <main>
            <div id="page-dashboard">
                <header><h1>Dashboard Overview</h1></header>
                
                <div class="stats-grid">
                    <div class="stat-card orange"><h3>Total Interaction</h3><p id="s-req">${stats.totalRequests}</p></div>
                    <div class="stat-card blue"><h3>Uptime Session</h3><p id="s-uptime" class="uptime-val">${stats.uptime}</p></div>
                    <div class="stat-card blue"><h3>Tokens Consumed</h3><p id="s-tok">${stats.totalTokens.toLocaleString()}</p></div>
                    <div class="stat-card green"><h3>Cluster Nodes</h3><p id="s-active">${stats.active_keys}/${stats.available_keys}</p></div>
                    <div class="stat-card red"><h3>Nodes Exhausted</h3><p id="s-cooldown">${stats.cooldown_keys}</p></div>
                </div>

                <div class="dashboard-bottom">
                    <!-- Top Usage Table -->
                    <div class="card-section">
                        <h3><span style="color:var(--primary)">●</span> Top NPCs Usage</h3>
                        <div class="table-container">
                            <table>
                                <thead><tr><th>NPC NAME</th><th style="text-align:right">TOKENS</th></tr></thead>
                                <tbody id="top-char-body"></tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Live Feed Section -->
                    <div class="card-section">
                        <h3><span style="color:var(--success)">●</span> Recent Activity</h3>
                        <div id="live-feed" class="feed-container">
                            <div style="text-align:center; padding:2rem; color:var(--text-muted); font-size:0.8rem">Waiting for activity...</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- OTHER PAGES (Hidden by default) -->
            <div id="page-karakter" class="hidden">
                <header><h1>Management Karakter</h1><button class="btn" onclick="openModal()">+ Add New NPC</button></header>
                <div class="card-section"><div class="table-container"><table>
                    <thead><tr><th>CHARACTER</th><th>STATUS</th><th>SWITCH</th><th style="text-align:right">ACTIONS</th></tr></thead>
                    <tbody id="char-body"></tbody>
                </table></div></div>
            </div>

            <div id="page-otak" class="hidden">
                <header><h1>Node Clusters (Otak)</h1></header>
                <div class="otak-container" id="otak-list"></div>
            </div>

            <div id="page-users" class="hidden">
                <header><h1>User Directory</h1></header>
                <div class="card-section"><div class="table-container"><table>
                    <thead><tr><th>USERNAME</th><th>LAST ACTIVITY</th><th style="text-align:right">ANALYTICS</th></tr></thead>
                    <tbody id="user-body"></tbody>
                </table></div></div>
            </div>

            <div id="page-logs" class="hidden">
                <header>
                    <h1>Interaction Logs</h1>
                    <div style="display:flex; gap:0.5rem">
                        <input type="text" id="log-search" style="padding:0.5rem; border-radius:8px; border:1px solid #ddd" placeholder="Search..." onkeyup="filterLogs()">
                        <button class="btn btn-outline" onclick="loadLogs()">Sync</button>
                    </div>
                </header>
                <div class="card-section"><div class="table-container"><table>
                    <thead><tr><th>TIMESTAMP</th><th>ACTORS</th><th>DIALOGUE</th><th style="text-align:right">METRICS</th></tr></thead>
                    <tbody id="log-body"></tbody>
                </table></div></div>
            </div>

            <div id="page-simulator" class="hidden">
                <header><h1>Simulation Room</h1></header>
                <div class="sim-container">
                    <div style="padding:1rem; border-bottom:1px solid #eee; display:flex; justify-content:space-between">
                        <select id="sim-char-select" style="padding:0.4rem; border-radius:5px"></select>
                        <button onclick="clearSim()" class="btn-danger">Reset</button>
                    </div>
                    <div id="sim-messages"></div>
                    <div style="padding:1rem; border-top:1px solid #eee; display:flex; gap:0.5rem">
                        <input type="text" id="sim-input" style="flex:1; padding:0.6rem; border-radius:8px; border:1px solid #ddd" placeholder="Say something..." onkeypress="if(event.key==='Enter') sendSim()">
                        <button class="btn" onclick="sendSim()">Send</button>
                    </div>
                </div>
            </div>
        </main>

        <div id="modal" class="modal"><div class="modal-content">
            <h2 id="m-title">NPC Setup</h2>
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
                    <button type="submit" class="btn">Save</button>
                </div>
            </form>
        </div></div>

        <script>
            let allLogs = []; let characters = [];
            function toggleMobileMenu() { document.getElementById('sidebar').classList.toggle('mobile-open'); }

            function showPage(pageId, el) {
                document.querySelectorAll('main > div').forEach(p => p.classList.add('hidden'));
                const target = document.getElementById('page-' + pageId);
                if(target) target.classList.remove('hidden');
                document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
                if(el) el.classList.add('active');
                if(window.innerWidth < 768 && document.getElementById('sidebar').classList.contains('mobile-open')) toggleMobileMenu();

                if(pageId === 'karakter') load();
                if(pageId === 'otak') loadModels();
                if(pageId === 'users') loadUsers();
                if(pageId === 'logs') loadLogs();
                if(pageId === 'simulator') loadSimSelect();
            }

            async function load() {
                const r = await fetch('/api/characters'); const d = await r.json(); (characters = d.characters);
                const b = document.getElementById('char-body'); b.innerHTML = '';
                characters.forEach(c => {
                    b.innerHTML += '<tr><td><b>'+c.npc_name+'</b><br><small>'+c.id+'</small></td><td>'+(c.is_enabled?'ON':'OFF')+'</td><td><label class="switch"><input type="checkbox" '+(c.is_enabled?'checked':'')+' onchange="toggleChar(\\''+c.id+'\\', this.checked)"><span class="slider"></span></label></td><td style="text-align:right"><button class="btn btn-outline" onclick="editChar(\\''+c.id+'\\')">Settings</button></td></tr>';
                });
            }

            async function loadModels() {
                const r = await fetch('/api/admin/models'); const d = await r.json();
                const list = document.getElementById('otak-list'); list.innerHTML = '';
                d.otak.forEach(o => {
                    const s = o.stats || {requests:0, success:0, errors:0};
                    list.innerHTML += '<div class="otak-row '+(o.isEnabled?'active':'')+'"><div class="otak-name">OTAK #'+o.id+'</div><div class="otak-stats"><div class="otak-stat-item"><span class="otak-stat-label">Requests</span><span class="otak-stat-value">'+s.requests+'</span></div><div class="otak-stat-item"><span class="otak-stat-label">Success</span><span class="otak-stat-value">'+s.success+'</span></div><div class="otak-stat-item"><span class="otak-stat-label">Errors</span><span class="otak-stat-value">'+s.errors+'</span></div></div><label class="switch"><input type="checkbox" '+(o.isEnabled?'checked':'')+' onchange="toggleOtak('+o.id+', this.checked)"><span class="slider"></span></label></div>';
                });
            }

            async function loadLogs() { const r = await fetch('/api/admin/logs'); const d = await r.json(); allLogs = d.logs; renderLogs(allLogs); }
            function renderLogs(logs) {
                const b = document.getElementById('log-body'); b.innerHTML = '';
                logs.forEach(l => { b.innerHTML += '<tr><td style="font-size:0.7rem">'+new Date(l.timestamp).toLocaleString()+'</td><td><strong>'+l.ai_name+'</strong><br>@'+l.username+'</td><td style="font-size:0.8rem">U: '+l.user_message+'<br>A: '+l.bot_response+'</td><td style="text-align:right; font-size:0.7rem">'+l.tokens+' toks<br>'+(l.latency||0)+'ms</td></tr>'; });
            }
            function filterLogs() { const q = document.getElementById('log-search').value.toLowerCase(); renderLogs(allLogs.filter(l => l.username.toLowerCase().includes(q) || l.ai_name.toLowerCase().includes(q))); }

            async function loadUsers() {
                const r = await fetch('/api/admin/users'); const d = await r.json();
                const b = document.getElementById('user-body'); b.innerHTML = '';
                d.users.forEach(u => { b.innerHTML += '<tr><td><strong>'+u.username+'</strong></td><td>'+new Date(u.last_seen).toLocaleString()+'</td><td style="text-align:right"><button class="btn btn-outline" onclick="viewUserDetail(\\''+u.username+'\\')">Details</button></td></tr>'; });
            }

            function loadSimSelect() { document.getElementById('sim-char-select').innerHTML = characters.map(c => c.is_enabled ? '<option value="'+c.id+'">'+c.npc_name+'</option>' : '').join(''); }
            async function sendSim() {
                const char = document.getElementById('sim-char-select').value; const msg = document.getElementById('sim-input').value; if(!char || !msg) return;
                appendMsg('user', msg); document.getElementById('sim-input').value = '';
                const res = await fetch('/api/npc/v1/chat', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ user: { username: 'Admin', level: 3 }, message: msg, system: { ai_name: char }, context: { history: [] } }) });
                const d = await res.json(); appendMsg('bot', d.sentences.join('\\n'));
            }
            function appendMsg(role, text) { const div=document.createElement('div'); div.className='msg msg-'+role; div.innerHTML=text.replace(/\\n/g,'<br>'); document.getElementById('sim-messages').appendChild(div); document.getElementById('sim-messages').scrollTop=9999; }
            function clearSim() { document.getElementById('sim-messages').innerHTML = ''; }

            async function toggleChar(id, enabled) { await fetch('/api/characters/save', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, data:{...characters.find(x=>x.id===id), is_enabled:enabled}}) }); load(); }
            async function toggleOtak(id, enabled) { await fetch('/api/admin/models/toggle', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, enabled}) }); loadModels(); }
            function openModal(id=null) { document.getElementById('modal').style.display='flex'; }
            function closeModal() { document.getElementById('modal').style.display='none'; }
            function editChar(id) { openModal(id); }

            setInterval(async () => {
                try {
                    const r = await fetch('/api/stats');
                    const d = await r.json();
                    document.getElementById('s-req').innerText = d.totalRequests;
                    document.getElementById('s-tok').innerText = d.totalTokens.toLocaleString();
                    document.getElementById('s-active').innerText = d.active_keys + '/' + d.available_keys;
                    document.getElementById('s-cooldown').innerText = d.cooldown_keys;
                    document.getElementById('s-uptime').innerText = d.uptime;

                    const tb = document.getElementById('top-char-body');
                    if(d.topChars) tb.innerHTML = d.topChars.map(c => '<tr><td>'+c.name.toUpperCase()+'</td><td style="text-align:right">'+c.toks.toLocaleString()+'</td></tr>').join('');

                    // Update Recent Activity
                    const feed = document.getElementById('live-feed');
                    if(d.recentLogs && d.recentLogs.length > 0) {
                        feed.innerHTML = d.recentLogs.map(l => \`
                            <div class="feed-item">
                                <div class="feed-avatar">\${l.ai_name[0].toUpperCase()}</div>
                                <div class="feed-content">
                                    <div class="feed-title"><span>\${l.ai_name.toUpperCase()}</span> ← @\${l.username}</div>
                                    <div class="feed-msg">\${l.user_message}</div>
                                    <div class="feed-time">\${new Date(l.timestamp).toLocaleTimeString()}</div>
                                </div>
                            </div>
                        \`).join('');
                    }
                } catch(e) {}
            }, 5000);

            showPage('dashboard');
        </script>
    </body>
    </html>
    `;
}

function getLoginPageHTML(error = '') {
    return \`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Login - NPC Engine</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Outfit', sans-serif; background: #0f172a; height: 100vh; display: flex; align-items:center; justify-content:center; }
            .card { background: #1e293b; padding: 2.5rem; border-radius: 1.5rem; width: 350px; color: #fff; text-align: center; }
            input { width: 100%; padding: 0.8rem; margin: 0.5rem 0; border-radius: 0.8rem; border: 1px solid #334155; background: #0f172a; color: #fff; }
            button { width: 100%; padding: 0.8rem; background: #f97316; border: none; border-radius: 0.8rem; color: #fff; font-weight: 600; margin-top: 1rem; cursor: pointer; }
        </style>
    </head>
    <body>
        <form class="card" action="/login" method="POST">
            <h1 style="color:#f97316">NPC SYSTEM</h1>
            <p style="color:#94a3b8; font-size:0.8rem; margin-bottom:1.5rem">Root Authentication</p>
            \${error ? \`<p style="color:#ef4444; font-size:0.8rem">\${error}</p>\` : ''}
            <input type="text" name="username" placeholder="Username" required>
            <input type="password" name="password" placeholder="Password" required>
            <button type="submit">Login</button>
        </form>
    </body></html>\`;
}

module.exports = { getAdminDashboardHTML, getLoginPageHTML };
