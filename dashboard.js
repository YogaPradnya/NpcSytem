function getAdminDashboardHTML(stats, user) {
    const isAdmin = user && user.role === 'admin';
    const currentRole = user ? user.role : 'guest';
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>NPC SYSTEM - Control Panel</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
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
            @keyframes fadeIn { 
                from { opacity: 0; transform: translateY(8px); } 
                to { opacity: 1; transform: translateY(0); } 
            }
            .animate-fade { animation: fadeIn 0.4s ease-out forwards; }
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
                width: 230px;
                background: #0f172a;
                color: #fff;
                display: flex;
                flex-direction: column;
                padding: 2rem 1.2rem;
                flex-shrink: 0;
                z-index: 50;
                transition: transform 0.3s ease;
                border-right: 1px solid rgba(255,255,255,0.05);
            }
            .brand {
                text-align: center;
                margin-bottom: 3rem;
                letter-spacing: 0.5px;
            }
            .brand h1 { font-size: 1.6rem; font-weight: 800; color: #fff; margin-bottom: 4px; text-transform: uppercase; }
            .brand p { font-size: 0.8rem; color: #64748b; font-weight: 700; letter-spacing: 1px; }

            nav { display: flex; flex-direction: column; gap: 0.8rem; }
            .nav-item {
                padding: 0.75rem 1rem;
                border-radius: 0.75rem;
                cursor: pointer;
                color: #94a3b8;
                font-weight: 700;
                transition: all 0.2s;
                font-size: 1rem;
                text-align: center;
            }
            .nav-item:hover { background: rgba(255,255,255,0.05); color: #fff; transform: translateX(5px); }
            .nav-item.active {
                background: var(--primary);
                color: #fff;
                box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
            }

            main {
                flex: 1;
                overflow-y: auto;
                padding: 2rem;
                background: #f8fafc;
                width: 100%;
            }
            header h1 { font-size: 2rem; font-weight: 800; }
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
            .stat-card:hover { transform: translateY(-5px); box-shadow: 0 12px 20px -5px rgba(0,0,0,0.1); }
            .stat-card.orange { border-left-color: var(--primary); }

            .stat-card h3 { 
                font-size: 0.9rem; 
                color: var(--text-muted); 
                text-transform: uppercase; 
                margin-bottom: 0.5rem; 
                letter-spacing: 1px;
                font-weight: 800;
            }
            .stat-card p { 
                font-size: 2.8rem; 
                font-weight: 800; 
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
            table th { text-align: left; padding: 1rem; color: var(--text-muted); font-size: 0.85rem; border-bottom: 1px solid var(--border); font-weight: 700; text-transform: uppercase; }
            table td { padding: 1.2rem 1rem; border-bottom: 1px solid #f1f5f9; font-size: 1rem; vertical-align: middle; }

            /* Live Feed (Timeline) */
            .feed-container { 
                display: flex; 
                flex-direction: column; 
                gap: 1rem; 
                max-height: 450px; 
                overflow-y: auto; 
                padding-right: 10px;
            }
            .feed-container::-webkit-scrollbar { width: 5px; }
            .feed-container::-webkit-scrollbar-track { background: transparent; }
            .feed-container::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
            .feed-container::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
            .feed-item {
                display: flex;
                gap: 1.2rem;
                padding: 1.2rem;
                border-bottom: 1px solid #f1f5f9;
                animation: fadeIn 0.5s ease-out;
                transition: background 0.2s;
            }
            .feed-item:hover { background: #f8fafc; }
            .feed-avatar {
                width: 42px;
                height: 42px;
                border-radius: 10px;
                background: #e2e8f0;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.9rem;
                font-weight: 800;
                color: var(--text-muted);
                flex-shrink: 0;
            }
            .feed-content { flex: 1; }
            .feed-title { font-size: 0.85rem; font-weight: 600; margin-bottom: 2px; }
            .feed-title span { color: var(--primary); font-weight: 700; }
            .feed-msg { font-size: 1rem; color: var(--text-muted); line-height: 1.4; margin: 0.2rem 0; white-space: pre-line; }
            .feed-time { font-size: 0.75rem; color: #94a3b8; margin-top: 0.4rem; }

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

            /* Mobile Header (Hidden on Desktop) */
            .mobile-header { display: none; }

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
            .btn-danger { 
                background: transparent; 
                border: 1px solid #fee2e2; 
                color: var(--danger); 
                padding: 0.3rem 0.8rem; 
                border-radius: 8px; 
                cursor: pointer; 
                font-weight: 600; 
                font-size: 0.8rem; 
                transition: all 0.2s;
            }
            .btn-danger:hover { background: var(--danger); color: #fff; border-color: var(--danger); }

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

            /* Toast Notification */
            #toast-container { position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; }
            .toast { 
                background: #fff; border-radius: 12px; padding: 1rem 1.5rem; 
                box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); 
                display: flex; align-items: center; gap: 12px; 
                min-width: 250px; transform: translateX(120%); transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                border-left: 4px solid var(--primary);
            }
            .toast.show { transform: translateX(0); }
            .toast.success { border-left-color: var(--success); }
            .toast.error { border-left-color: var(--danger); }
            .toast-msg { font-size: 0.85rem; font-weight: 600; color: var(--text-main); }
        </style>
    </head>
    <body>
        <div id="toast-container"></div>

        <div class="mobile-header">
            <div class="brand"><span>NPC</span>SYSTEM</div>
            <button class="menu-toggle" onclick="toggleMobileMenu()" style="color:#fff">☰</button>
        </div>

        <aside id="sidebar">
            <div class="brand">
                <h1>ANIMEIN.AI</h1>
                <p>CONTROL PANEL BY YOGA</p>
            </div>
            <nav>
                ${isAdmin ? `<div class="nav-item active" onclick="showPage('dashboard', this)">Dashboard</div>` : ''}
                <div class="nav-item ${!isAdmin ? 'active' : ''}" onclick="showPage('karakter', this)">Data Karakter</div>
                ${isAdmin ? `
                    <div class="nav-item" onclick="showPage('otak', this)">Manajemen Otak</div>
                    <div class="nav-item" onclick="showPage('users', this)">Daftar User</div>
                    <div class="nav-item" onclick="showPage('logs', this)">Log Percakapan</div>
                ` : ''}
                <div class="nav-item" onclick="showPage('simulator', this)">Live Simulator</div>
            </nav>
            <div style="margin-top: auto; padding-top: 2rem; border-top: 1px solid rgba(255,255,255,0.05);">
                <div style="text-align: center; margin-bottom: 1rem;">
                    <span style="background: rgba(249, 115, 22, 0.1); color: var(--primary); padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.6rem; font-weight: 800; border: 1px solid rgba(249, 115, 22, 0.2);">VERSI 1.0.6</span>
                </div>
                <div style="color: var(--text-muted); font-size: 0.65rem; font-weight: 700; margin-bottom: 0.5rem; text-align: center; text-transform: uppercase;">Logged in as ${currentRole}</div>
                <div style="color: var(--success); font-size: 0.75rem; font-weight: 800; margin-bottom: 1rem; display: flex; align-items: center; justify-content: center; letter-spacing: 1px;">
                    ONLINE
                </div>
                <button onclick="location.href='/logout'" style="width: 100%; padding: 1rem; background: var(--primary); color: #fff; border: none; border-radius: 0.75rem; font-weight: 800; font-size: 0.95rem; cursor: pointer; transition: all 0.3s;" onmouseover="this.style.filter='brightness(1.1)'" onmouseout="this.style.filter='none'">
                    LOGOUT
                </button>
            </div>
        </aside>

        <main>
            ${isAdmin ? `
            <div id="page-dashboard">
                <header><h1>Dashboard</h1></header>
                
                <div class="stats-grid">
                    <div class="stat-card orange"><h3>Total Interaction</h3><p id="s-req">${stats.totalRequests}</p></div>
                    <div class="stat-card blue"><h3>Uptime Session</h3><p id="s-uptime" class="uptime-val">${stats.uptime}</p></div>
                    <div class="stat-card blue"><h3>Tokens Consumed</h3><p id="s-tok">${stats.totalTokens.toLocaleString()}</p></div>
                    <div class="stat-card green"><h3>Cluster Nodes</h3><p id="s-active">${stats.active_keys}/${stats.available_keys}</p></div>
                    <div class="stat-card red"><h3>Nodes Exhausted</h3><p id="s-cooldown">${stats.cooldown_keys}</p></div>
                </div>

                <div class="dashboard-bottom">
                    <div class="card-section">
                        <h3>Top NPCs Usage</h3>
                        <div class="table-container">
                            <table>
                                <thead><tr><th>NPC NAME</th><th style="text-align:right">TOKENS</th></tr></thead>
                                <tbody id="top-char-body">${stats.topChars.map(c => '<tr><td>'+c.name.toUpperCase()+'</td><td style="text-align:right">'+c.toks.toLocaleString()+'</td></tr>').join('')}</tbody>
                            </table>
                        </div>
                    </div>
                    <div class="card-section">
                        <h3>Recent Activity</h3>
                        <div id="live-feed" class="feed-container">
                             ${stats.recentLogs.map(l => `
                                <div class="feed-item">
                                    <div class="feed-avatar">${l.ai_name[0].toUpperCase()}</div>
                                    <div class="feed-content">
                                        <div class="feed-title">
                                            <span>${l.ai_name.toUpperCase()}</span> 
                                            <small style="background:var(--primary); color:#fff; padding:1px 4px; border-radius:4px; font-size:0.6rem; vertical-align:middle; margin-left:4px">${l.ai_pose || 'idle'}</small>
                                            ← @${l.username} <small style="color:var(--text-muted); font-size:0.65rem">Lv.${l.user_level || 0}</small>
                                        </div>
                                        <div class="feed-msg" style="color:var(--text-main)"><small style="font-weight:700;color:var(--text-muted)">U:</small> ${l.user_message}</div>
                                        <div style="display:flex; flex-direction:column; gap:4px; margin-top:4px;">
                                            ${l.bot_response.split('\n').map((s, idx) => 
                                                '<div class="feed-msg" style="color:var(--primary); margin:0;">' +
                                                (idx === 0 ? '<small style="font-weight:700">A:</small> ' : '') + s +
                                                '</div>'
                                            ).join('')}
                                        </div>
                                        <div class="feed-time">${new Date(l.timestamp).toLocaleTimeString()}</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}

            <div id="page-karakter" class="${isAdmin ? 'hidden' : ''}">
                <header><h1>Management Karakter</h1><button class="btn" onclick="openModal()">+ Add New NPC</button></header>
                <div class="card-section"><div class="table-container"><table>
                    <thead><tr><th>CHARACTER</th><th>STATUS</th><th>SWITCH</th><th style="text-align:right">ACTIONS</th></tr></thead>
                    <tbody id="char-body"></tbody>
                </table></div></div>
            </div>

            ${isAdmin ? `
            <div id="page-otak" class="hidden">
                <header><h1>Otak</h1></header>
                <div class="otak-container" id="otak-list"></div>
            </div>

            <div id="page-users" class="hidden">
                <header>
                    <h1>User Directory</h1>
                    <div style="display:flex; gap:1rem; align-items:center">
                        <input type="text" id="user-search" placeholder="Search username..." onkeyup="filterUsers()" style="padding:0.6rem 1rem; border-radius:10px; border:1px solid var(--border); width:250px; font-size:0.9rem">
                        <button class="btn btn-outline" onclick="loadUsers()">Refresh</button>
                    </div>
                </header>
                <div class="card-section"><div class="table-container"><table>
                    <thead><tr><th>USERNAME</th><th>LAST ACTIVITY</th><th style="text-align:right">ANALYTICS</th></tr></thead>
                    <tbody id="user-body"></tbody>
                </table></div></div>
            </div>

            <div id="page-logs" class="hidden">
                <header>
                    <h1>Interaction Logs</h1>
                    <div style="display:flex; gap:1rem; align-items:center">
                        <input type="text" id="log-search" placeholder="Search actor..." onkeyup="filterLogs()" style="padding:0.6rem 1rem; border-radius:10px; border:1px solid var(--border); width:250px; font-size:0.9rem">
                        <button class="btn btn-outline" onclick="loadLogs()">Sync</button>
                    </div>
                </header>
                <div class="card-section"><div class="table-container"><table>
                    <thead><tr><th>TIMESTAMP</th><th>ACTORS</th><th>DIALOGUE</th><th style="text-align:right">METRICS</th></tr></thead>
                    <tbody id="log-body"></tbody>
                </table></div></div>
            </div>
            ` : ''}

            <div id="page-simulator" class="hidden" style="max-width: 800px; margin: 0 auto;">
                <div class="card" style="padding: 1.5rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                        <h2 style="margin:0">Live Simulator</h2>
                        <div style="display: flex; gap: 1rem; align-items: center;">
                            <div style="display: flex; flex-direction: column;">
                                <label style="font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Pilih Karakter</label>
                                <select id="sim-select" style="padding: 0.6rem 1rem; border-radius: 8px; border: 1px solid var(--border); font-family: inherit; font-weight: 600; min-width: 150px; cursor: pointer;"></select>
                            </div>
                            <div style="display: flex; flex-direction: column;">
                                <label style="font-size: 0.65rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Heart Lv</label>
                                <input type="number" id="sim-heart" value="0" min="0" max="5" style="width: 70px; padding: 0.6rem; border-radius: 8px; border: 1px solid var(--border); font-family: inherit; font-weight: 700; text-align: center;">
                            </div>
                            <button class="btn btn-outline" style="align-self: flex-end; padding: 0.65rem 1rem;" onclick="document.getElementById('sim-messages').innerHTML=''">Clear</button>
                        </div>
                    </div>
                    
                    <div class="sim-container">
                        <div id="sim-messages">
                            <div class="msg msg-bot">Halo! Silakan pilih karakter dan ketik pesan untuk mulai simulasi.</div>
                        </div>
                        <div style="padding: 1.25rem; background: #f8fafc; border-top: 1px solid var(--border); display: flex; gap: 0.8rem;">
                            <input type="text" id="sim-input" placeholder="Ketik pesan di sini..." style="flex:1; padding: 0.8rem 1.2rem; border-radius: 12px; border: 1.5px solid var(--border); font-family: inherit; font-weight: 600; outline: none; transition: border-color 0.2s;" onkeypress="if(event.key==='Enter') sendMessage()">
                            <button onclick="sendMessage()" style="padding: 0.8rem 1.5rem; background: var(--primary); color: #fff; border: none; border-radius: 12px; font-weight: 800; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">KIRIM</button>
                        </div>
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

        <!-- MODAL: User Logs Popup -->
        <div id="modal-logs" class="modal">
            <div class="modal-content" style="max-width: 800px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem">
                    <h2 id="log-popup-title" style="margin:0">User Logs</h2>
                    <button class="btn btn-outline" onclick="closeLogModal()" style="border:none; font-size:1.4rem; padding:0">×</button>
                </div>
                <div class="card-section" style="max-height: 500px; overflow-y: auto; padding: 0.5rem; border:none; box-shadow:none">
                    <div class="table-container">
                        <table>
                            <thead><tr><th>TIMESTAMP</th><th>NPC</th><th>DIALOGUE</th></tr></thead>
                            <tbody id="log-popup-body"></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <script>
            let allLogs = []; let allUsers = []; let characters = [];
            function toggleMobileMenu() { document.getElementById('sidebar').classList.toggle('mobile-open'); }
            
            function formatBotMsg(msg) {
                if (!msg) return '';
                // Gunakan pemisah string tunggal yang aman untuk di-parse browser
                return msg.split('\\n').map((s, idx) => {
                    return '<div style="line-height:1.4">' + (idx === 0 ? '<small style="font-weight:700">A:</small> ' : '') + s + '</div>';
                }).join('');
            }

            function showPage(pageId, el) {
                document.querySelectorAll('main > div').forEach(p => {
                    p.classList.add('hidden');
                    p.classList.remove('animate-fade');
                });
                const target = document.getElementById('page-' + pageId);
                if(target) {
                    target.classList.remove('hidden');
                    void target.offsetWidth; // Force reflow for animation
                    target.classList.add('animate-fade');
                }
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
                    b.innerHTML += '<tr>' +
                        '<td><b>' + c.npc_name + '</b><br><small>' + c.id + '</small></td>' +
                        '<td>' + (c.is_enabled ? '<span style="color:var(--success); font-weight:600">ON</span>' : 'OFF') + '</td>' +
                        '<td><label class="switch"><input type="checkbox" ' + (c.is_enabled ? 'checked' : '') + ' onchange="toggleChar(\\'' + c.id + '\\', this.checked)"><span class="slider"></span></label></td>' +
                        '<td style="text-align:right">' +
                            '<button class="btn btn-outline" style="padding:0.3rem 0.8rem; margin-right:0.5rem" onclick="editChar(\\'' + c.id + '\\')">Settings</button>' +
                            '<button class="btn-danger" onclick="deleteChar(\\'' + c.id + '\\')">Delete</button>' +
                        '</td>' +
                    '</tr>';
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
                logs.forEach(l => { 
                    b.innerHTML += \`<tr>
                        <td style="font-size:0.7rem; color:var(--text-muted)">\${new Date(l.timestamp).toLocaleString()}</td>
                        <td>
                            <strong>\${l.ai_name.toUpperCase()}</strong> 
                            <span style="background:var(--primary); color:#fff; padding:2px 6px; border-radius:4px; font-size:0.6rem; margin-left:4px">\${l.ai_pose || 'idle'}</span>
                            <br>
                            <span style="color:var(--primary); font-size:0.75rem; font-weight:600">@\${l.username}</span> 
                            <span style="color:var(--text-muted); font-size:0.65rem; font-weight:700">LV.\${l.user_level || 0}</span>
                        </td>
                        <td>
                            <div style="background: #f1f5f9; padding: 0.5rem 0.8rem; border-radius: 8px; margin-bottom: 4px; font-size: 0.8rem; border-left: 3px solid #cbd5e1;">
                                <small style="color:var(--text-muted); font-weight:700">U:</small> \${l.user_message}
                            </div>
                            <div style="background: #fff7ed; padding: 0.5rem 0.8rem; border-radius: 8px; font-size: 0.8rem; border-left: 3px solid var(--primary); display:flex; flex-direction:column; gap:2px;">
                                \${formatBotMsg(l.bot_response)}
                            </div>
                        </td>
                        <td style="text-align:right; font-size:0.7rem; color:var(--text-muted)">
                            <div style="font-weight:600; color:var(--text-main)">\${l.tokens} toks</div>
                            <div>\${l.latency||0}ms</div>
                        </td>
                    </tr>\`; 
                });
            }
            function filterLogs() { const q = document.getElementById('log-search').value.toLowerCase(); renderLogs(allLogs.filter(l => l.username.toLowerCase().includes(q) || l.ai_name.toLowerCase().includes(q))); }

            async function loadUsers() {
                const r = await fetch('/api/admin/users'); const d = await r.json(); allUsers = d.users;
                renderUsers(allUsers);
            }
            function renderUsers(users) {
                const b = document.getElementById('user-body'); b.innerHTML = '';
                users.forEach(u => { b.innerHTML += '<tr><td><strong>'+u.username+'</strong></td><td>'+new Date(u.last_seen).toLocaleString()+'</td><td style="text-align:right"><button class="btn btn-outline" onclick="viewUserDetail(\\''+u.username+'\\')">View Logs</button></td></tr>'; });
            }
            function filterUsers() {
                const q = document.getElementById('user-search').value.toLowerCase();
                renderUsers(allUsers.filter(u => u.username.toLowerCase().includes(q)));
            }

            async function viewUserDetail(username) {
                showToast('Fetching logs for ' + username + '...', 'success');
                const r = await fetch('/api/admin/logs'); 
                const d = await r.json();
                const userLogs = d.logs.filter(l => l.username === username);
                
                document.getElementById('log-popup-title').innerText = 'Logs for @' + username;
                const b = document.getElementById('log-popup-body');
                b.innerHTML = '';
                
                if(userLogs.length === 0) {
                    b.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:2rem">No logs found for this user.</td></tr>';
                } else {
                    userLogs.forEach(l => {
                        b.innerHTML += \`<tr>
                            <td style="font-size:0.7rem">\${new Date(l.timestamp).toLocaleString()}</td>
                            <td><strong>\${l.ai_name}</strong></td>
                            <td>
                                <div style="background:#f1f5f9; padding:0.4rem; border-radius:5px; font-size:0.8rem; margin-bottom:2px">U: \${l.user_message}</div>
                                <div style="background:#fff7ed; padding:0.4rem; border-radius:5px; font-size:0.8rem; display:flex; flex-direction:column; gap:2px;">
                                    \${formatBotMsg(l.bot_response)}
                                </div>
                            </td>
                        </tr>\`;
                    });
                }
                document.getElementById('modal-logs').style.display = 'flex';
            }

            function closeLogModal() { document.getElementById('modal-logs').style.display = 'none'; }

            function loadSimSelect() {
                const s = document.getElementById('sim-select'); 
                s.innerHTML = '';
                if(window.characters && window.characters.length > 0) {
                    window.characters.forEach(c => { 
                        if(c.is_enabled) s.innerHTML += \`<option value="\${c.id}">\${c.npc_name}</option>\`; 
                    });
                } else {
                    fetch('/api/characters').then(r => r.json()).then(d => {
                        window.characters = d.characters;
                        window.characters.forEach(c => { 
                            if(c.is_enabled) s.innerHTML += \`<option value="\${c.id}">\${c.npc_name}</option>\`; 
                        });
                    });
                }
            }

            async function sendMessage() {
                const text = document.getElementById('sim-input').value;
                const heartLv = document.getElementById('sim-heart').value || 0;
                if(!text) return;

                const box = document.getElementById('sim-messages');
                box.innerHTML += \`<div class="msg msg-user">\${text}</div>\`;
                document.getElementById('sim-input').value = '';
                box.scrollTop = box.scrollHeight;

                try {
                    const r = await fetch('/api/npc/v1/chat', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            user: { username: 'Yogaa', level: parseInt(heartLv) }, 
                            message: text,
                            system: { ai_name: document.getElementById('sim-select').value }
                        })
                    });
                    const d = await r.json();
                    const botMsg = d.sentences ? d.sentences.join('\\n') : 'Error: No response';
                    box.innerHTML += \`<div class="msg msg-bot">\${botMsg.replace(/\\n/g, '<br>')}</div>\`;
                    box.scrollTop = box.scrollHeight;
                } catch(e) {
                    showToast('Failed to send message', 'error');
                }
            }

            async function toggleChar(id, enabled) { await fetch('/api/characters/save', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, data:{...characters.find(x=>x.id===id), is_enabled:enabled}}) }); load(); }
            async function deleteChar(id) { 
                if(confirm('Hapus karakter ' + id + ' secara permanen?')) { 
                    await fetch('/api/characters/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id}) }); 
                    showToast('Character deleted successfully', 'error');
                    load(); 
                } 
            }
            async function toggleOtak(id, enabled) { 
                await fetch('/api/admin/models/toggle', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, enabled}) }); 
                showToast('AI Node #' + id + ' ' + (enabled ? 'Enabled' : 'Disabled'), enabled ? 'success' : 'error');
                loadModels(); 
            }
            
            function openModal(id = null) {
                document.getElementById('modal').style.display = 'flex';
                const idInput = document.getElementById('f-id');
                if(id) {
                    const c = characters.find(x => x.id === id);
                    if(c) {
                        idInput.value = c.id; idInput.disabled = true;
                        document.getElementById('f-name').value = c.npc_name || '';
                        document.getElementById('f-desc').value = c.npc_description || '';
                        document.getElementById('f-pers').value = c.npc_personality || '';
                        document.getElementById('f-style').value = c.npc_speaking_style || '';
                        document.getElementById('f-world').value = c.world_setting || '';
                        document.getElementById('m-title').innerText = 'NPC Configuration';
                    }
                } else { 
                    document.getElementById('char-form').reset(); 
                    idInput.disabled = false; 
                    document.getElementById('m-title').innerText = 'Create New NPC';
                }
            }
            function closeModal() { document.getElementById('modal').style.display='none'; }
            function editChar(id) { openModal(id); }

            document.getElementById('char-form').onsubmit = async (e) => {
                e.preventDefault();
                const id = document.getElementById('f-id').value;
                const c = characters.find(x => x.id === id);
                const data = { 
                    npc_name: document.getElementById('f-name').value, 
                    npc_description: document.getElementById('f-desc').value, 
                    npc_personality: document.getElementById('f-pers').value, 
                    npc_speaking_style: document.getElementById('f-style').value, 
                    world_setting: document.getElementById('f-world').value, 
                    is_enabled: c ? c.is_enabled : true, 
                    language: 'id' 
                };
                await fetch('/api/characters/save', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, data}) });
                showToast('Character saved successfully', 'success');
                closeModal(); load();
            };

            function showToast(msg, type = 'success') {
                const container = document.getElementById('toast-container');
                const t = document.createElement('div');
                t.className = \`toast \${type}\`;
                t.innerHTML = \`<span class="toast-msg">\${msg}</span>\`;
                container.appendChild(t);
                setTimeout(() => t.classList.add('show'), 100);
                setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 500); }, 3000);
            }

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
                                    <div class="feed-title">
                                        <span>\${l.ai_name.toUpperCase()}</span> 
                                        <small style="background:var(--primary); color:#fff; padding:1px 4px; border-radius:4px; font-size:0.6rem; vertical-align:middle; margin-left:4px">\${l.ai_pose || 'idle'}</small>
                                        ← @\${l.username} <small style="color:var(--text-muted); font-size:0.65rem">Lv.\${l.user_level || 0}</small>
                                    </div>
                                    <div class="feed-msg" style="color:var(--text-main)"><small style="font-weight:700;color:var(--text-muted)">U:</small> \${l.user_message}</div>
                                    <div style="display:flex; flex-direction:column; gap:2px; margin-top:4px; color:var(--primary)">
                                        \${formatBotMsg(l.bot_response)}
                                    </div>
                                    <div class="feed-time">\${new Date(l.timestamp).toLocaleTimeString()}</div>
                                </div>
                            </div>
                        \`).join('');
                    }
                } catch(e) {}
            }, 5000);

            showPage(isAdmin ? 'dashboard' : 'karakter');
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
        <title>Login - NPC System</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Outfit', sans-serif; background: #0f172a; height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
            .login-card { background: #1e293b; padding: 2.5rem; border-radius: 1.5rem; width: 400px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); text-align: center; border: 1px solid rgba(255,255,255,0.05); }
            h1 { color: #f97316; font-weight: 800; font-size: 1.8rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 1px; }
            p { color: #64748b; font-size: 0.75rem; font-weight: 600; margin-bottom: 2rem; text-transform: uppercase; letter-spacing: 1px; }
            .form-group { text-align: left; margin-bottom: 1.25rem; }
            label { display: block; color: #94a3b8; font-size: 0.75rem; font-weight: 700; margin-bottom: 0.5rem; text-transform: uppercase; }
            input { width: 100%; padding: 0.85rem 1.2rem; background: #f8fafc; border: 2px solid transparent; border-radius: 0.75rem; font-size: 0.95rem; font-weight: 600; transition: all 0.2s; outline: none; }
            input:focus { border-color: #f97316; box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.1); }
            button { width: 100%; padding: 1rem; background: #f97316; color: #fff; border: none; border-radius: 0.75rem; font-weight: 800; font-size: 0.95rem; cursor: pointer; transition: all 0.2s; margin-top: 1rem; }
            button:hover { background: #ea580c; transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(249, 115, 22, 0.3); }
            .error { background: rgba(239, 68, 68, 0.1); color: #ef4444; padding: 0.75rem; border-radius: 0.5rem; font-size: 0.85rem; font-weight: 700; margin-bottom: 1.5rem; border: 1px solid rgba(239, 68, 68, 0.2); }
        </style>
    </head>
    <body>
        <div class="login-card">
            <h1>NPC SYSTEM</h1>
            <p>Role Authentication</p>
            
            ${error ? `<div class="error">${error}</div>` : ''}

            <form action="/login" method="POST">
                <div class="form-group">
                    <label>Username</label>
                    <input type="text" name="username" required placeholder="Enter username">
                </div>
                <div class="form-group">
                    <label>Password</label>
                    <input type="password" name="password" required placeholder="••••••••">
                </div>
                <button type="submit">Login</button>
            </form>
        </div>
    </body>
    </html>`;
}

module.exports = { getAdminDashboardHTML, getLoginPageHTML };
