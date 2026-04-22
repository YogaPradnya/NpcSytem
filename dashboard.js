function getAdminDashboardHTML(stats) {
    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>NPC Engine Admin</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600&display=swap" rel="stylesheet">
        <style>
            :root {
                --bg: #0f172a;
                --card-bg: rgba(30, 41, 59, 0.7);
                --primary: #38bdf8;
                --accent: #818cf8;
                --text: #f1f5f9;
            }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
                font-family: 'Outfit', sans-serif;
                background: var(--bg);
                color: var(--text);
                padding: 2rem;
            }
            .container { max-width: 1200px; margin: 0 auto; }
            header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem; }
            h1 { font-weight: 600; background: linear-gradient(to right, var(--primary), var(--accent)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
            
            .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
            .stat-card { background: var(--card-bg); padding: 1.2rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,0.05); }
            .stat-card h3 { font-size: 0.8rem; color: #94a3b8; text-transform: uppercase; }
            .stat-card p { font-size: 1.4rem; font-weight: 600; color: var(--primary); }

            .char-table { width: 100%; border-collapse: collapse; background: var(--card-bg); border-radius: 1rem; overflow: hidden; margin-top: 1rem; }
            .char-table th, .char-table td { padding: 1rem; text-align: left; border-bottom: 1px solid rgba(255,255,255,0.05); }
            .char-table th { background: rgba(0,0,0,0.2); color: var(--primary); font-size: 0.9rem; }
            
            .btn { background: var(--primary); color: #000; border: none; padding: 0.5rem 1rem; border-radius: 0.5rem; cursor: pointer; font-weight: 600; font-size: 0.8rem; }
            .btn.danger { background: #ef4444; color: #fff; }
            .btn.edit { background: #475569; color: #fff; }

            .modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); justify-content:center; align-items:center; z-index:100; }
            .modal-content { background:#1e293b; padding:2rem; border-radius:1rem; width:100%; max-width:600px; max-height:90vh; overflow-y:auto; }
            .form-group { margin-bottom: 1rem; }
            .form-group label { display:block; margin-bottom:0.3rem; color:#94a3b8; font-size:0.8rem; }
            .form-group input, .form-group textarea { width:100%; padding:0.6rem; background:#0f172a; border:1px solid rgba(255,255,255,0.1); color:#fff; border-radius:0.4rem; }
        </style>
    </head>
    <body>
        <div class="container">
            <header>
                <h1>NPC ENGINE DASHBOARD</h1>
                <div>
                    <button class="btn" style="background:var(--accent); color:#fff" onclick="openModal()">+ Add character</button>
                </div>
            </header>

            <div class="stats-grid">
                <div class="stat-card"><h3>Total Requests</h3><p id="s-req">${stats.totalRequests}</p></div>
                <div class="stat-card"><h3>Total Tokens</h3><p id="s-tok">${stats.totalTokens}</p></div>
                <div class="stat-card"><h3>Active Otak</h3><p id="s-active">${stats.active_keys} / ${stats.available_keys}</p></div>
                <div class="stat-card"><h3>Cooldown</h3><p id="s-cooldown" style="color:#ef4444">${stats.cooldown_keys}</p></div>
            </div>

            <h2>Character Database</h2>
            <table class="char-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody id="char-body">
                    <!-- Dynamic -->
                </tbody>
            </table>
        </div>

        <div id="modal" class="modal">
            <div class="modal-content">
                <h2 id="m-title">Add/Edit Character</h2>
                <form id="char-form" style="margin-top:1rem">
                    <input type="hidden" id="f-old-id">
                    <div class="form-group"><label>Unique ID</label><input type="text" id="f-id" required></div>
                    <div class="form-group"><label>Display Name</label><input type="text" id="f-name" required></div>
                    <div class="form-group"><label>Description</label><textarea id="f-desc" rows="2"></textarea></div>
                    <div class="form-group"><label>Personality</label><textarea id="f-pers" rows="2"></textarea></div>
                    <div class="form-group"><label>Speaking Style</label><textarea id="f-style" rows="2"></textarea></div>
                    <div class="form-group"><label>World Setting</label><textarea id="f-world" rows="2"></textarea></div>
                    <div style="display:flex; justify-content:flex-end; gap:0.5rem">
                        <button type="button" class="btn edit" onclick="closeModal()">Cancel</button>
                        <button type="submit" class="btn">Save</button>
                    </div>
                </form>
            </div>
        </div>

        <script>
            let characters = [];
            async function load() {
                const r = await fetch('/api/characters');
                const d = await r.json();
                characters = d.characters;
                const b = document.getElementById('char-body');
                b.innerHTML = '';
                characters.forEach(c => {
                    b.innerHTML += \`
                        <tr>
                            <td>\${c.id}</td>
                            <td>\${c.npc_name}</td>
                            <td><span style="color:#22c55e">● Active</span></td>
                            <td>
                                <button class="btn edit" onclick="editChar('\${c.id}')">Edit</button>
                                <button class="btn danger" onclick="deleteChar('\${c.id}')">Del</button>
                            </td>
                        </tr>
                    \`;
                });
            }

            function openModal(id = null) {
                document.getElementById('modal').style.display = 'flex';
                const f = document.getElementById('char-form');
                if(id) {
                    const c = characters.find(x => x.id === id);
                    document.getElementById('f-id').value = c.id;
                    document.getElementById('f-name').value = c.npc_name;
                    document.getElementById('f-desc').value = c.npc_description;
                    document.getElementById('f-pers').value = c.npc_personality;
                    document.getElementById('f-style').value = c.npc_speaking_style;
                    document.getElementById('f-world').value = c.world_setting;
                } else { f.reset(); }
            }

            function closeModal() { document.getElementById('modal').style.display = 'none'; }

            async function deleteChar(id) {
                if(!confirm('Delete ' + id + '?')) return;
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
                const data = {
                    npc_name: document.getElementById('f-name').value,
                    npc_description: document.getElementById('f-desc').value,
                    npc_personality: document.getElementById('f-pers').value,
                    npc_speaking_style: document.getElementById('f-style').value,
                    world_setting: document.getElementById('f-world').value,
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
                const r = await fetch('/api/stats');
                const d = await r.json();
                document.getElementById('s-req').innerText = d.totalRequests;
                document.getElementById('s-tok').innerText = d.totalTokens;
                document.getElementById('s-active').innerText = d.active_keys + ' / ' + d.available_keys;
                document.getElementById('s-cooldown').innerText = d.cooldown_keys;
            }, 5000);

            load();
        </script>
    </body>
    </html>
    `;
}

module.exports = { getAdminDashboardHTML };
