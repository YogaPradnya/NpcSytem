function nFormatter(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(2).replace(/\.00$/, '') + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(2).replace(/\.00$/, '') + 'K';
    }
    return num.toLocaleString();
}

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[ch]));
}

function renderBalanceBadge(account) {
    if (!account || account.limit === undefined) return '';
    const limit = account.limit || 0;
    const recent = account.recent || 0;
    const available = limit - recent;
    
    const color = available > 0 ? '#22c55e' : '#ef4444';
    const bg = available > 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';
    const label = available > 0 ? 'AVAILABLE' : 'OVER LIMIT';
    return `<div style="display:flex; align-items:center; gap:8px; background:${bg}; padding:4px 12px; border-radius:8px; border:1px solid ${color}">
        <div style="width:6px; height:6px; border-radius:50%; background:${color}"></div>
        <span style="font-size:11px; font-weight:800; color:${color}">${label}: $${available.toFixed(2)}</span>
    </div>`;
}

function renderBillingTable(billingData) {
    if (!billingData || !billingData.months || !billingData.months.length) return '<tr><td colspan="4" style="text-align:center; color:#64748b; padding:2rem">No billing data available.</td></tr>';
    const latestMonth = billingData.months[0];
    if (!latestMonth || !latestMonth.items) return '<tr><td colspan="4" style="text-align:center; color:#64748b; padding:2rem">No items found for current period.</td></tr>';
    
    const totalTokens = latestMonth.items.reduce((sum, item) => sum + (item.units || 0), 0);
    
    return latestMonth.items.map(item => {
        const modelName = escapeHTML(item.model.model_name.split('/').pop());
        const type = item.pricing_type === 'input_tokens' ? 'IN' : 'OUT';
        const usage = (item.units).toLocaleString();
        const rate = '$' + (item.rate * 10000).toFixed(4) + '/1M';
        const cost = '$' + (item.cost / 100).toFixed(2);
        return '<tr><td style="font-weight:700; color:#1e293b">' + modelName + ' <span style="font-size:9px; color:#94a3b8; margin-left:5px">' + type + '</span></td><td>' + usage + ' tokens</td><td style="color:#64748b">' + rate + '</td><td style="font-weight:800; color:var(--primary); text-align:right">' + cost + '</td></tr>';
    }).join('') + `
        <tr style="background:#f8fafc">
            <td style="font-weight:800; color:#64748b; padding-bottom: 4px">TOTAL USAGE</td>
            <td style="font-weight:800; color:#1e293b; padding-bottom: 4px">${totalTokens.toLocaleString()} tokens</td>
            <td colspan="2"></td>
        </tr>
        <tr style="background:#f8fafc">
            <td colspan="3" style="font-weight:800; text-align:right; color:#1e293b; padding-top: 0">ESTIMATED TOTAL SPEND</td>
            <td style="font-weight:900; color:var(--primary); font-size:1.1rem; text-align:right; padding-top: 0">$${(latestMonth.total_cost / 100).toFixed(2)}</td>
        </tr>`;
}

function getAdminDashboardHTML(stats, user) {
    const isAdmin = user && user.role === 'admin';
    const currentRole = escapeHTML(user ? user.role : 'guest');
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>NPC SYSTEM - Control Panel</title>
        <link rel="icon" type="image/png" href="/favicon.png?v=2">
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <script src="https://unpkg.com/lucide@latest"></script>
        <link rel="stylesheet" href="/admin.css?v=2">
    </head>
    <body>
        <div id="toast-container"></div>

        <div class="mobile-header">
            <div class="brand" style="display:flex; align-items:center; gap:8px"><img src="/logo.png" style="width:30px; height:30px; border-radius:6px"><span>NPC</span>SYSTEM</div>
            <button class="menu-toggle" onclick="toggleMobileMenu()" style="color:#fff">☰</button>
        </div>

        <aside id="sidebar">
            <div class="brand">
                <img src="/logo.png" style="width:70px; height:70px; border-radius:18px; box-shadow: 0 8px 25px rgba(0,0,0,0.5)">
                <h1>ANIMEIN.AI</h1>
                <p>SYSTEM ENGINE V1</p>
            </div>
            <nav>
                ${isAdmin ? `<div class="nav-item active" onclick="showPage('dashboard', this)"><i data-lucide="layout-dashboard"></i> Dashboard</div>` : ''}
                <div class="nav-item ${!isAdmin ? 'active' : ''}" onclick="showPage('karakter', this)"><i data-lucide="users"></i> Data Karakter</div>
                ${isAdmin ? `
                    <div class="nav-item" onclick="showPage('otak', this)"><i data-lucide="cpu"></i> Manajemen Otak</div>
                    <div class="nav-item" onclick="showPage('users', this)"><i data-lucide="user-cog"></i> Daftar User</div>
                    <div class="nav-item" onclick="showPage('banlist', this)"><i data-lucide="ban"></i> Daftar Ban</div>
                ` : ''}
                <div class="nav-item" onclick="showPage('simulator', this)"><i data-lucide="play-circle"></i> Live Simulator</div>
                ${isAdmin ? `
                    <div class="nav-item" onclick="showPage('logs', this)"><i data-lucide="message-square"></i> Log Percakapan</div>
                    <div class="nav-item" onclick="showPage('terminal', this)"><i data-lucide="terminal"></i> Logs</div>
                ` : ''}
            </nav>
            
            <div class="sidebar-footer">
                <div class="user-info-card">
                    <div style="font-size: 9px; color: #64748b; font-weight: 800; margin-bottom: 8px; text-transform: uppercase;">Logged in as ${currentRole}</div>
                    <div class="status-badge">
                        <span class="status-dot"></span>
                        ONLINE
                    </div>
                </div>
                <button class="btn-logout" onclick="window.location.href='/logout'">
                    <i data-lucide="log-out"></i> LOGOUT
                </button>
                <div style="text-align: center; margin-top: 1.5rem;">
                    <span style="color: rgba(255,255,255,0.2); font-size: 10px; font-weight: 700;">VERSI 1.0.6</span>
                </div>
            </div>
        </aside>

        <main>
            ${isAdmin ? `
            <div id="page-dashboard">
                <header><h1>Dashboard</h1></header>
                
                <div class="stats-grid">
                    <div class="stat-card orange"><h3>Total Interaction</h3><p id="s-req">${stats.totalRequests.toLocaleString()}</p></div>
                    <div class="stat-card blue"><h3>Uptime Session</h3><p id="s-uptime" class="uptime-val">${stats.uptime}</p></div>
                    <div class="stat-card blue"><h3>Input Tokens</h3><p id="s-prompt-tok">${nFormatter(stats.totalPromptTokens || 0)}</p></div>
                    <div class="stat-card blue"><h3>Output Tokens</h3><p id="s-completion-tok">${nFormatter(stats.totalCompletionTokens || 0)}</p></div>
                    <div class="stat-card green"><h3>DeepInfra (Utama)</h3><p id="s-active">${(stats.deepinfra_stats && stats.deepinfra_stats.active) || 0}/${(stats.deepinfra_stats && stats.deepinfra_stats.available) || 0}</p></div>
                    <div class="stat-card purple"><h3>Node Groq</h3><p id="s-groq">${(stats.groq_stats && stats.groq_stats.active) || 0}/${(stats.groq_stats && stats.groq_stats.available) || 0}</p></div>
                    <div class="stat-card orange"><h3>Node Cerebras</h3><p id="s-cerebras">${(stats.cerebras_stats && stats.cerebras_stats.active) || 0}/${(stats.cerebras_stats && stats.cerebras_stats.available) || 0}</p></div>
                </div>

                <div class="dashboard-bottom" style="grid-template-columns: 1fr;">
                    <div class="card-section">
                        <h3>Statistik Penggunaan Provider</h3>
                        <div style="height: 550px; position: relative;">
                            <canvas id="usageChart"></canvas>
                        </div>
                    </div>

                    <div class="card-section">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem">
                            <h3 style="margin-bottom:0">DeepInfra Billing & Usage</h3>
                            <div style="display:flex; gap:0.75rem; align-items:center" id="billing-header-tools">
                                ${renderBalanceBadge(stats.deepinfra_account)}
                                <span style="font-size:11px; font-weight:800; color:#64748b; background:#f1f5f9; padding:4px 10px; border-radius:6px; text-transform:uppercase">REALTIME DATA</span>
                            </div>
                        </div>
                        <div class="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th>MODEL</th>
                                        <th>USAGE</th>
                                        <th>RATE</th>
                                        <th style="text-align:right">SPEND (EST)</th>
                                    </tr>
                                </thead>
                                <tbody id="billing-body">
                                    ${renderBillingTable(stats.deepinfra_billing)}
                                </tbody>
                            </table>
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
                <header>
                    <h1>Otak</h1>
                </header>
                <div class="model-config-panel">
                    <div class="form-group">
                        <label>DeepInfra Primary</label>
                        <input id="model-primary" list="deepinfra-models" placeholder="meta-llama/Meta-Llama-3.1-8B-Instruct">
                        <datalist id="deepinfra-models">
                            <option value="meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo"></option>
                            <option value="meta-llama/Meta-Llama-3.1-8B-Instruct"></option>
                            <option value="meta-llama/Llama-3.3-70B-Instruct-Turbo"></option>
                        </datalist>
                    </div>
                    <div class="form-group">
                        <label>Groq Fallback</label>
                        <input id="model-groq" placeholder="llama-3.1-8b-instant">
                    </div>
                    <div class="form-group">
                        <label>Cerebras Fallback</label>
                        <input id="model-cerebras" placeholder="llama3.1-8b">
                    </div>
                    <div class="form-group compact">
                        <label>Max Token Output</label>
                        <input id="model-max-tokens" type="number" min="32" max="2048" step="1">
                    </div>
                    <div class="form-group compact">
                        <label>Temperature</label>
                        <input id="model-temperature" type="number" min="0" max="2" step="0.05">
                    </div>
                    <button class="btn" onclick="saveModelConfig()">Save Config</button>
                </div>
                <div class="otak-container" id="otak-list"></div>
            </div>

            <div id="page-users" class="hidden">
                <header>
                    <h1>User Directory</h1>
                    <div style="display:flex; gap:1rem; align-items:center">
                        <input type="text" id="user-search" placeholder="Search username..." onkeyup="debouncedLoadUsers()" style="padding:0.6rem 1rem; border-radius:10px; border:1px solid var(--border); width:250px; font-size:0.9rem">
                        <button class="btn btn-outline" onclick="loadUsers(1)">Refresh</button>
                    </div>
                </header>
                <div class="card-section">
                    <div class="table-container"><table>
                        <thead><tr><th>USERNAME</th><th>LAST ACTIVITY</th><th style="text-align:right">ANALYTICS</th></tr></thead>
                        <tbody id="user-body"></tbody>
                    </table></div>
                    <div id="user-pagination" style="margin-top:1.5rem; display:flex; justify-content:center; gap:0.5rem; align-items:center"></div>
                </div>
            </div>

            <div id="page-banlist" class="hidden">
                <header>
                    <h1>Daftar Ban User</h1>
                </header>
                <div style="display: grid; grid-template-columns: 350px 1fr; gap: 2rem;">
                    <!-- Bagian Kiri: Form & Setting -->
                    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                        <div class="card-section" style="padding: 1.5rem;">
                            <h2 style="font-size: 1rem; margin-bottom: 1rem; color: var(--danger);">Ban User Baru</h2>
                            <div style="display: flex; gap: 0.5rem;">
                                <input type="text" id="ban-username-input" placeholder="Username..." style="flex: 1; padding: 0.6rem 1rem; border-radius: 8px; border: 1px solid var(--border); outline: none;">
                                <button class="btn btn-danger" onclick="banUser()" style="border-radius: 8px;">Ban</button>
                            </div>
                        </div>
                        
                        <div class="card-section" style="padding: 1.5rem;">
                            <h2 style="font-size: 1rem; margin-bottom: 1rem;">Pengaturan Pesan Ban</h2>
                            <textarea id="ban-message-input" rows="3" style="width: 100%; padding: 0.8rem; border-radius: 8px; border: 1px solid var(--border); outline: none; margin-bottom: 0.8rem; resize: vertical;"></textarea>
                            <button class="btn" style="width: 100%;" onclick="updateBanMessage()">Simpan Pesan</button>
                        </div>
                    </div>

                    <!-- Bagian Kanan: List Banned Users -->
                    <div class="card-section" style="height: fit-content;">
                        <div class="table-container">
                            <table>
                                <thead><tr><th>BANNED USERNAME</th><th>TANGGAL BAN</th><th style="text-align:right">AKSI</th></tr></thead>
                                <tbody id="banlist-body"></tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            <div id="page-logs" class="hidden">
                <header>
                    <h1>Interaction Logs</h1>
                    <div style="display:flex; gap:1rem; align-items:center">
                        <input type="text" id="log-search" placeholder="Search actor or chat..." onkeyup="debouncedLoadLogs()" style="padding:0.6rem 1rem; border-radius:10px; border:1px solid var(--border); width:250px; font-size:0.9rem">
                        <button class="btn btn-outline" onclick="loadLogs(1)">Sync</button>
                    </div>
                </header>
                <div class="card-section"><div class="table-container"><table>
                    <thead><tr><th>TIMESTAMP</th><th>ACTORS</th><th>DIALOGUE</th><th style="text-align:right">METRICS</th></tr></thead>
                    <tbody id="log-body"></tbody>
                </table></div>
                <div id="log-pagination" style="margin-top:1.5rem; display:flex; justify-content:center; gap:0.5rem; align-items:center"></div></div>
            </div>
            
            <div id="page-terminal" class="hidden">
                <header>
                    <h1>Engine Monitor</h1>
                    <div class="terminal-status" id="terminal-status">● DISCONNECTED</div>
                </header>
                
                <div class="terminal-container">
                    <div class="terminal-header">
                        <span style="font-weight: 800; font-size: 11px; color: #666;">RAW SYSTEM LOGS</span>
                        <button class="term-btn-clear" onclick="clearTerminal()">Purge Logs</button>
                    </div>
                    <div id="terminal-output" class="terminal-output">
                        <div class="term-line">
                            <span class="term-time">[00:00:00]</span>
                            <span class="term-type type-system">SYSTEM</span>
                            <span class="term-msg">Waiting for incoming logs...</span>
                        </div>
                    </div>
                </div>
            </div>
            ` : ''}

            <div id="page-simulator" class="hidden" style="max-width: 1200px; margin: 0 auto;">
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 1.5rem; padding: 0 0.5rem;">
                    <div>
                        <h1 style="font-size: 20px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">Live Simulator</h1>
                        <p style="font-size: 13px; color: var(--text-muted); font-weight: 500;">Uji coba karakter secara realtime dengan data simulasi.</p>
                    </div>
                    <div style="display: flex; gap: 0.75rem;">
                        <div style="background: #fff; padding: 0.5rem 1rem; border-radius: 12px; border: 1px solid var(--border); display: flex; align-items: center; gap: 10px;">
                            <label style="font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Karakter</label>
                            <select id="sim-select" style="border: none; font-weight: 700; outline: none; cursor: pointer; color: var(--primary); background: transparent; padding-right: 5px; font-size: 14px; -webkit-appearance: none; -moz-appearance: none; appearance: none;"></select>
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="pointer-events: none; margin-left: -5px;"><path d="m6 9 6 6 6-6"/></svg>
                        </div>
                        <div style="background: #fff; padding: 0.5rem 1rem; border-radius: 12px; border: 1px solid var(--border); display: flex; align-items: center; gap: 10px;">
                            <label style="font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Heart</label>
                            <input type="number" id="sim-heart" value="0" min="0" max="5" style="border: none; width: 35px; font-weight: 800; outline: none; text-align: center;">
                        </div>
                        <div style="background: #fff; padding: 0.5rem 1rem; border-radius: 12px; border: 1px solid var(--border); display: flex; align-items: center; gap: 10px;">
                            <label style="font-size: 11px; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Lv5 Owner</label>
                            <input type="text" id="sim-lv5-owner" placeholder="Username..." style="border: none; width: 100px; font-weight: 700; outline: none; color: var(--info);">
                        </div>
                        <button class="btn btn-outline" style="padding: 0.65rem 1rem; border-radius: 12px;" onclick="clearSimulator()">Clear</button>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 350px; gap: 1.5rem;">
                    <div class="sim-container">
                        <div id="sim-messages">
                            <div class="msg msg-bot">Halo! Silakan pilih karakter dan ketik pesan untuk mulai simulasi.</div>
                        </div>
                        <div style="padding: 1.25rem; background: #fff; border-top: 1px solid #f1f5f9; display: flex; gap: 0.75rem; align-items: center;">
                            <input type="text" id="sim-input" placeholder="Tulis sesuatu untuk NPC..." style="flex:1; padding: 0.85rem 1.25rem; border-radius: 15px; border: 1.5px solid var(--border); font-weight: 600; outline: none; transition: all 0.2s;" onkeypress="if(event.key==='Enter') sendMessage()">
                            <button id="sim-send-btn" onclick="sendMessage()" style="height: 45px; width: 45px; background: var(--primary); color: #fff; border: none; border-radius: 15px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; font-weight: 800;">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                            </button>
                        </div>
                    </div>

                    <div class="debug-panel">
                        <div class="debug-header"><span>Debug & Metrics</span></div>
                        <div id="sim-debug-content" class="debug-content">
                            <div class="debug-item">Waiting for interaction...</div>
                        </div>
                        
                        <div style="margin-top: 1.25rem; flex-shrink: 0;">
                            <div class="debug-header"><span>Active System Prompt</span></div>
                            <div id="sim-prompt-content" style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #64748b; background: #f8fafc; padding: 1rem; border-radius: 12px; border: 1px solid #f1f5f9; max-height: 250px; overflow-y: auto; white-space: pre-wrap; line-height: 1.5;">-</div>
                        </div>
                    </div>
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

        <script>window.NPC_ADMIN_CONFIG = { isAdmin: ${isAdmin}, initialPage: ${isAdmin} ? 'dashboard' : 'karakter' };</script>
        <script src="/admin.js?v=2"></script>
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
        <link rel="icon" type="image/png" href="/favicon.png?v=2">
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
            <img src="/logo.png" style="width:80px; height:80px; border-radius:16px; margin-bottom:1.5rem; box-shadow: 0 8px 16px rgba(0,0,0,0.4)">
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
