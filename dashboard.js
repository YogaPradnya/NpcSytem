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
    return latestMonth.items.map(item => {
        const modelName = item.model.model_name.split('/').pop();
        const type = item.pricing_type === 'input_tokens' ? 'IN' : 'OUT';
        const usage = (item.units).toLocaleString();
        const rate = '$' + (item.rate * 10000).toFixed(4) + '/1M';
        const cost = '$' + (item.cost / 100).toFixed(2);
        return '<tr><td style="font-weight:700; color:#1e293b">' + modelName + ' <span style="font-size:9px; color:#94a3b8; margin-left:5px">' + type + '</span></td><td>' + usage + ' tokens</td><td style="color:#64748b">' + rate + '</td><td style="font-weight:800; color:var(--primary); text-align:right">' + cost + '</td></tr>';
    }).join('') + '<tr style="background:#f8fafc"><td colspan="3" style="font-weight:800; text-align:right; color:#1e293b">ESTIMATED TOTAL SPEND</td><td style="font-weight:900; color:var(--primary); font-size:1.1rem; text-align:right">$' + (latestMonth.total_cost / 100).toFixed(2) + '</td></tr>';
}

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
        <link rel="icon" type="image/png" href="/favicon.png?v=2">
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <script src="https://unpkg.com/lucide@latest"></script>
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
                --radius: 1rem;
                --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
            }
            
            @keyframes fadeIn { 
                from { opacity: 0; transform: translateY(4px); } 
                to { opacity: 1; transform: translateY(0); } 
            }
            .animate-fade { animation: fadeIn 0.3s ease-out forwards; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            
            body {
                font-family: 'Montserrat', sans-serif;
                background: var(--bg);
                color: var(--text-main);
                height: 100vh;
                display: flex;
                overflow: hidden;
                font-size: 14px;
            }

            aside {
                width: 280px;
                background: #0f172a;
                color: #fff;
                display: flex;
                flex-direction: column;
                padding: 2rem 1.25rem;
                flex-shrink: 0;
                z-index: 50;
                position: relative;
                overflow: hidden;
            }
            aside::before {
                content: '';
                position: absolute;
                top: -50%;
                left: -50%;
                width: 200%;
                height: 200%;
                background: radial-gradient(circle, rgba(249, 115, 22, 0.05) 0%, transparent 70%);
                pointer-events: none;
            }
            .brand {
                text-align: center;
                margin-bottom: 3.5rem;
                position: relative;
            }
            .brand img {
                filter: drop-shadow(0 0 15px rgba(249, 115, 22, 0.3));
                transition: transform 0.3s ease;
            }
            .brand:hover img { transform: scale(1.05) rotate(5deg); }
            .brand h1 { font-size: 20px; font-weight: 900; color: #fff; margin-top: 1rem; text-transform: uppercase; letter-spacing: 2px; }
            .brand p { font-size: 9px; color: #64748b; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px; }

            nav { display: flex; flex-direction: column; gap: 0.6rem; position: relative; }
            .nav-item {
                padding: 0.9rem 1.25rem;
                border-radius: 0.85rem;
                cursor: pointer;
                color: #94a3b8;
                font-weight: 600;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 14px;
                border: 1px solid transparent;
            }
            .nav-item i { width: 18px; height: 18px; opacity: 0.7; transition: all 0.3s; }
            .nav-item:hover { 
                background: rgba(255,255,255,0.03); 
                color: #fff; 
                padding-left: 1.5rem;
                border-color: rgba(255,255,255,0.05);
            }
            .nav-item:hover i { opacity: 1; transform: scale(1.1); color: var(--primary); }
            
            .nav-item.active {
                background: linear-gradient(135deg, var(--primary) 0%, #ea580c 100%);
                color: #fff;
                box-shadow: 0 10px 20px -5px rgba(249, 115, 22, 0.4);
                font-weight: 700;
            }
            .nav-item.active i { opacity: 1; color: #fff; }

            .sidebar-footer {
                margin-top: auto;
                padding-top: 2rem;
                border-top: 1px solid rgba(255,255,255,0.05);
                position: relative;
            }
            .user-info-card {
                background: rgba(255,255,255,0.03);
                padding: 1rem;
                border-radius: 1rem;
                margin-bottom: 1.5rem;
                border: 1px solid rgba(255,255,255,0.05);
                text-align: center;
            }
            .status-badge {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                font-size: 10px;
                font-weight: 800;
                color: var(--success);
                text-transform: uppercase;
                letter-spacing: 1px;
            }
            .status-dot {
                width: 8px;
                height: 8px;
                background: var(--success);
                border-radius: 50%;
                box-shadow: 0 0 10px var(--success);
                animation: pulse 2s infinite;
            }
            @keyframes pulse {
                0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
                70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
                100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
            }

            .btn-logout {
                width: 100%;
                background: rgba(239, 68, 68, 0.1);
                color: #ef4444;
                border: 1px solid rgba(239, 68, 68, 0.2);
                padding: 0.9rem;
                border-radius: 0.85rem;
                font-weight: 700;
                font-size: 13px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                transition: all 0.3s;
                cursor: pointer;
            }
            .btn-logout:hover {
                background: #ef4444;
                color: #fff;
                box-shadow: 0 8px 16px -4px rgba(239, 68, 68, 0.4);
            }

            main {
                flex: 1;
                overflow-y: auto;
                padding: 3rem;
                background: var(--bg);
            }
            header h1 { font-size: 24px; font-weight: 900; letter-spacing: -1px; }
            header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 3rem;
            }

            .stats-grid { 
                display: grid; 
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
                gap: 1.5rem; 
                margin-bottom: 3.5rem; 
            }
            
            .stat-card {
                background: #fff;
                padding: 1.5rem;
                border: 1px solid var(--border);
                border-radius: 1.25rem;
                box-shadow: 0 4px 15px -3px rgba(0,0,0,0.03);
                display: flex;
                flex-direction: column;
                justify-content: center;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                border-left: 5px solid var(--primary);
                min-height: 110px;
                position: relative;
                overflow: hidden;
            }
            .stat-card:hover { transform: translateY(-5px); box-shadow: 0 20px 25px -5px rgba(0,0,0,0.05); }
            
            .stat-card.blue { border-left-color: var(--info); }
            .stat-card.green { border-left-color: var(--success); }
            .stat-card.orange { border-left-color: var(--primary); }
            .stat-card.purple { border-left-color: #a855f7; }
            .stat-card.red { border-left-color: var(--danger); }

            .stat-card h3 { 
                font-size: 10px; 
                color: #94a3b8; 
                text-transform: uppercase; 
                margin-bottom: 0.75rem; 
                letter-spacing: 1.5px;
                font-weight: 800;
            }
            .stat-card p { 
                font-size: 26px; 
                font-weight: 800; 
                color: #1e293b; 
                line-height: 1;
                letter-spacing: -1px;
            }
            .uptime-val { color: var(--primary) !important; font-size: 18px !important; }

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
                padding: 1.25rem;
                margin-bottom: 1.5rem;
                box-shadow: 0 1px 3px rgba(0,0,0,0.02);
            }
            .card-section h3 { font-size: 16px; margin-bottom: 1.25rem; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 0.5rem; }

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
            /* Live Simulator Chat Styles */
            .sim-container {
                background: #fff;
                border: 1px solid var(--border);
                border-radius: 1.25rem;
                display: flex;
                flex-direction: column;
                height: 550px;
                overflow: hidden;
                box-shadow: 0 4px 20px rgba(0,0,0,0.05);
            }
            #sim-messages {
                flex: 1;
                overflow-y: auto;
                padding: 1.5rem;
                display: flex;
                flex-direction: column;
                gap: 1.25rem;
                background: #fdfdfd;
            }
            .msg {
                max-width: 80%;
                padding: 1rem 1.25rem;
                border-radius: 1.25rem;
                font-size: 14px;
                line-height: 1.5;
                position: relative;
                animation: fadeIn 0.3s ease-out forwards;
                box-shadow: 0 2px 5px rgba(0,0,0,0.02);
            }
            .msg-user {
                align-self: flex-end;
                background: var(--primary);
                color: #fff;
                border-bottom-right-radius: 4px;
            }
            .msg-bot {
                align-self: flex-start;
                background: #fff;
                color: #1e293b;
                border: 1px solid #e2e8f0;
                border-bottom-left-radius: 4px;
            }
            .msg-typing {
                font-style: italic;
                font-size: 12px;
                color: #94a3b8;
                background: transparent !important;
                border: none !important;
                box-shadow: none !important;
            }
            .dot { display: inline-block; width: 4px; height: 4px; background: #94a3b8; border-radius: 50%; margin: 0 2px; animation: bounce 1.4s infinite ease-in-out; }
            .dot:nth-child(1) { animation-delay: -0.32s; }
            .dot:nth-child(2) { animation-delay: -0.16s; }
            @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1.0); } }

            /* Responsive Design */
            @media (max-width: 1024px) {
                .stats-grid { grid-template-columns: repeat(3, 1fr); }
            }
            @media (max-width: 768px) {
                body { overflow-y: auto; }
                aside { display: none; } /* Mobile menu logic usually handles this */
                main { padding: 1.5rem; }
                .stats-grid { grid-template-columns: repeat(2, 1fr); }
                .dashboard-bottom { grid-template-columns: 1fr !important; }
                header h1 { font-size: 20px; }
                .stat-card p { font-size: 22px; }
            }
            @media (max-width: 480px) {
                .stats-grid { grid-template-columns: 1fr; }
                .stat-card { min-height: auto; padding: 1.25rem; }
            }

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

            /* Terminal Page Styles */
            #page-terminal { display: flex; flex-direction: column; height: 100%; }
            .terminal-container {
                background: #0f172a;
                color: #fff;
                padding: 1.5rem;
                border: 1px solid var(--border);
                border-radius: 1.25rem;
                flex: 1;
                display: flex;
                flex-direction: column;
                box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);
                overflow: hidden;
            }
            .terminal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 1rem;
                padding-bottom: 0.75rem;
                border-bottom: 1px solid rgba(255,255,255,0.05);
            }
            .terminal-status { font-size: 11px; font-weight: 800; text-transform: uppercase; display: flex; align-items: center; gap: 8px; color: var(--success); }
            .terminal-output {
                flex: 1;
                overflow-y: auto;
                font-family: 'JetBrains Mono', monospace;
                font-size: 12px;
                line-height: 1.6;
                padding-right: 10px;
            }
            .terminal-output::-webkit-scrollbar { width: 6px; }
            .terminal-output::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
            
            .term-line {
                display: grid;
                grid-template-columns: 110px 80px 1fr;
                gap: 1rem;
                padding: 6px 0;
                border-bottom: 1px solid rgba(255,255,255,0.03);
            }
            .term-time { color: #64748b; font-size: 11px; }
            .term-type { font-weight: 800; text-transform: uppercase; font-size: 10px; text-align: center; }
            .term-type.type-log { color: #22c55e; }
            .term-type.type-system { color: #a855f7; }
            .term-type.type-error { color: #ef4444; }
            .term-msg { color: #e2e8f0; word-break: break-word; }
            
            .term-btn-clear {
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.1);
                color: #fff;
                padding: 6px 16px;
                font-size: 11px;
                font-weight: 700;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.2s;
            }
            .term-btn-clear:hover { background: var(--primary); border-color: var(--primary); }

            /* Simulator Specific */
            .sim-container {
                background: #fff;
                border: 1px solid var(--border);
                border-radius: 1.25rem;
                overflow: hidden;
                box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);
                display: flex;
                flex-direction: column;
                height: calc(100vh - 180px);
                min-height: 500px;
                max-height: 700px;
            }
            #sim-messages {
                flex: 1;
                overflow-y: auto;
                padding: 1.5rem;
                display: flex;
                flex-direction: column;
                gap: 1rem;
                background-color: #fcfcfc;
                background-image: radial-gradient(#e2e8f0 0.5px, transparent 0.5px);
                background-size: 20px 20px;
            }
            .msg {
                max-width: 85%;
                padding: 0.9rem 1.25rem;
                border-radius: 1.25rem;
                font-size: 14px;
                line-height: 1.6;
                position: relative;
                animation: msgSlide 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
            }
            @keyframes msgSlide { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
            .msg-user {
                align-self: flex-end;
                background: var(--primary);
                color: #fff;
                border-bottom-right-radius: 0.2rem;
                box-shadow: 0 4px 12px rgba(249, 115, 22, 0.2);
            }
            .msg-bot {
                align-self: flex-start;
                background: #fff;
                color: var(--text-main);
                border-bottom-left-radius: 0.2rem;
                border: 1px solid var(--border);
                box-shadow: 0 2px 4px rgba(0,0,0,0.02);
            }
            .msg-typing {
                font-style: italic;
                color: var(--text-muted);
                font-size: 0.75rem;
                display: flex;
                align-items: center;
                gap: 5px;
            }
            .dot { width: 4px; height: 4px; background: #94a3b8; border-radius: 50%; animation: dotBounce 1.4s infinite ease-in-out; }
            .dot:nth-child(2) { animation-delay: 0.2s; }
            .dot:nth-child(3) { animation-delay: 0.4s; }
            @keyframes dotBounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }

            /* Debug Panel Enhancement */
            .debug-panel {
                background: #fff;
                border: 1px solid var(--border);
                border-radius: 1.25rem;
                padding: 1.25rem;
                font-size: 13px;
                height: calc(100vh - 180px);
                min-height: 500px;
                max-height: 700px;
                display: flex;
                flex-direction: column;
                box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);
            }
            .debug-header { font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 8px; font-size: 11px; }
            .debug-header i { color: var(--primary); }
            .debug-content { flex: 1; overflow-y: auto; }
            .debug-item { margin-bottom: 0.75rem; background: #f8fafc; padding: 0.75rem; border-radius: 0.75rem; border: 1px solid #f1f5f9; }
            .debug-label { color: var(--text-muted); font-weight: 700; display: block; margin-bottom: 2px; font-size: 11px; }
            .debug-value { color: var(--text-main); font-weight: 700; font-family: 'JetBrains Mono', monospace; font-size: 13px; }
        </style>
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
                    <div class="stat-card blue"><h3>Tokens Consumed</h3><p id="s-tok">${(stats.totalTokens || 0).toLocaleString()}</p></div>
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
                    <div style="display:flex; gap:1rem; align-items:center; background:#fff; padding:0.5rem 1rem; border-radius:12px; border:1px solid var(--border)">
                        <label style="font-size:0.7rem; font-weight:800; color:var(--text-muted); text-transform:uppercase">DeepInfra Model</label>
                        <select id="model-switcher" onchange="updateModel(this.value)" style="border:none; font-weight:700; outline:none; cursor:pointer; color:var(--primary); font-size:0.85rem">
                            <option value="meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo">Llama 3.1 8B Turbo</option>
                            <option value="meta-llama/Meta-Llama-3.1-8B-Instruct">Llama 3.1 8B Regular</option>
                        </select>
                    </div>
                </header>
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
                        <input type="text" id="log-search" placeholder="Search actor or chat..." onkeyup="filterLogs()" style="padding:0.6rem 1rem; border-radius:10px; border:1px solid var(--border); width:250px; font-size:0.9rem">
                        <button class="btn btn-outline" onclick="loadLogs()">Sync</button>
                    </div>
                </header>
                <div class="card-section"><div class="table-container"><table>
                    <thead><tr><th>TIMESTAMP</th><th>ACTORS</th><th>DIALOGUE</th><th style="text-align:right">METRICS</th></tr></thead>
                    <tbody id="log-body"></tbody>
                </table></div></div>
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
                        <button class="btn btn-outline" style="padding: 0.65rem 1rem; border-radius: 12px;" onclick="document.getElementById('sim-messages').innerHTML='<div class=\'msg msg-bot\'>Silakan pilih karakter dan ketik pesan untuk mulai simulasi.</div>'; document.getElementById('sim-debug-content').innerHTML='<div class=\'debug-item\'>Waiting for interaction...</div>'">Clear</button>
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
                        <div class="debug-header"><span>Chain of Thought & Metrics</span></div>
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

        <script>
            let allLogs = []; let allUsers = []; let characters = [];
            let userPage = 1;
            function toggleMobileMenu() { document.getElementById('sidebar').classList.toggle('mobile-open'); }
            
            function formatBotMsg(msg) {
                if (!msg) return '';
                // Filter tambahan di frontend untuk menghapus (ekspresi), *aksi*, atau [teks]
                const cleanMsg = msg.replace(/\\((.*?)\\)|\\s*\\[(.*?)\\]|\\*(.*?)\\*/g, '').replace(/\\s{2,}/g, ' ').trim();
                if (!cleanMsg) return '...';

                return cleanMsg.split(String.fromCharCode(10)).map((s, idx) => {
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
                if(pageId === 'users') loadUsers(1);
                if(pageId === 'logs') loadLogs();
                if(pageId === 'simulator') loadSimSelect();
                if(pageId === 'terminal') initTerminal();
            }

            let logEventSource = null;
            function initTerminal() {
                if (logEventSource) return;
                
                const statusEl = document.getElementById('terminal-status');
                statusEl.innerText = '● CONNECTING...';
                statusEl.style.color = 'var(--info)';

                logEventSource = new EventSource('/api/admin/logs/stream');
                
                logEventSource.onopen = () => {
                    statusEl.innerText = '● LIVE CONNECTED';
                    statusEl.style.color = 'var(--success)';
                    appendTerminalLog({ message: 'Engine connection established.', type: 'system' });
                };

                logEventSource.onmessage = (e) => {
                    const data = JSON.parse(e.data);
                    appendTerminalLog(data);
                };

                logEventSource.onerror = (e) => {
                    console.error('SSE Error:', e);
                    statusEl.innerText = '● DISCONNECTED';
                    statusEl.style.color = 'var(--danger)';
                    logEventSource.close();
                    logEventSource = null;
                    setTimeout(initTerminal, 5000); // Reconnect
                };
            }

            function appendTerminalLog(data) {
                const term = document.getElementById('terminal-output');
                if (!term) return;
                
                const line = document.createElement('div');
                line.className = 'term-line';
                
                const timeStr = new Date(data.timestamp || Date.now()).toLocaleTimeString();
                const type = (data.type || 'log').toLowerCase();
                
                line.innerHTML = 
                    '<span class="term-time">' + timeStr + '</span>' +
                    '<span class="term-type type-' + type + '">' + type + '</span>' +
                    '<span class="term-msg">' + data.message + '</span>';
                
                term.appendChild(line);
                term.scrollTop = term.scrollHeight;
                
                if (term.children.length > 300) term.removeChild(term.firstChild);
            }

            function clearTerminal() {
                const term = document.getElementById('terminal-output');
                if (term) term.innerHTML = '<div class="term-line"><span class="term-time"></span><span class="term-type type-system">SYSTEM</span><span class="term-msg">Terminal buffer cleared.</span></div>';
            }

            async function load() {
                const r = await fetch('/api/characters'); const d = await r.json(); (characters = d.characters);
                const b = document.getElementById('char-body'); if(b) b.innerHTML = '';
                if(b) characters.forEach(c => {
                    b.innerHTML += '<tr>' +
                        '<td><b>' + c.npc_name + '</b><br><small>' + c.id + '</small></td>' +
                        '<td>' + (c.is_enabled ? '<span style="color:var(--success); font-weight:600">ON</span>' : 'OFF') + '</td>' +
                        '<td><label class="switch"><input type="checkbox" ' + (c.is_enabled ? 'checked' : '') + ' onchange="toggleChar(&apos;' + c.id + '&apos;, this.checked)"><span class="slider"></span></label></td>' +
                        '<td style="text-align:right">' +
                            '<button class="btn btn-outline" style="padding:0.3rem 0.8rem; margin-right:0.5rem" onclick="editChar(&apos;' + c.id + '&apos;)">Settings</button>' +
                            '<button class="btn-danger" onclick="deleteChar(&apos;' + c.id + '&apos;)">Delete</button>' +
                        '</td>' +
                    '</tr>';
                });
            }

            async function loadModels() {
                const r = await fetch('/api/admin/models'); const d = await r.json();
                const list = document.getElementById('otak-list'); list.innerHTML = '';
                
                // Sync Model Switcher
                if (document.getElementById('model-switcher')) {
                    document.getElementById('model-switcher').value = d.config.primaryModel;
                }

                // Render DeepInfra (Utama)
                list.innerHTML += '<h3 style="margin:1rem 0 0.5rem; font-size:0.7rem; color:var(--text-muted)">INFRASTRUKTUR DEEPINFRA (UTAMA)</h3>';
                d.deepinfra.forEach(o => {
                    const s = o.stats || {requests:0, success:0, errors:0, tokens:0};
                    list.innerHTML += '<div class="otak-row '+(o.isEnabled?"active":"")+'" style="border-left: 4px solid var(--success)">' +
                        '<div class="otak-name">DEEPINFRA #'+o.id+'</div>' +
                        '<div class="otak-stats">' +
                            '<div class="otak-stat-item"><span class="otak-stat-label">Reqs</span><span class="otak-stat-value">'+s.requests+'</span></div>' +
                            '<div class="otak-stat-item"><span class="otak-stat-label">Success</span><span class="otak-stat-value" style="color:var(--success)">'+s.success+'</span></div>' +
                            '<div class="otak-stat-item"><span class="otak-stat-label">Errors</span><span class="otak-stat-value" style="color:var(--danger)">'+s.errors+'</span></div>' +
                            '<div class="otak-stat-item"><span class="otak-stat-label">Tokens</span><span class="otak-stat-value">'+(s.tokens || 0).toLocaleString()+'</span></div>' +
                            '<div class="otak-stat-item"><span class="otak-stat-label">Status</span><span class="otak-stat-value" style="color:'+(o.isEnabled?'var(--success)':'var(--danger)')+'">'+(o.isEnabled ? (o.isCoolingDown ? 'COOLDOWN' : 'READY') : 'DISABLED')+'</span></div>' +
                        '</div>' +
                        '<label class="switch"><input type="checkbox" '+(o.isEnabled?"checked":"")+' onchange="toggleOtak('+o.id+', this.checked, &apos;DEEPINFRA&apos;)"><span class="slider"></span></label>' +
                    '</div>';
                });

                // Render Groq
                list.innerHTML += '<h3 style="margin:2rem 0 0.5rem; font-size:0.7rem; color:var(--text-muted)">INFRASTRUKTUR GROQ (CADANGAN 1)</h3>';
                d.otak.forEach(o => {
                    const s = o.stats || {requests:0, success:0, errors:0, tokens:0};
                    list.innerHTML += '<div class="otak-row '+(o.isEnabled?"active":"")+'">' +
                        '<div class="otak-name">GROQ #'+o.id+'</div>' +
                        '<div class="otak-stats">' +
                            '<div class="otak-stat-item"><span class="otak-stat-label">Reqs</span><span class="otak-stat-value">'+s.requests+'</span></div>' +
                            '<div class="otak-stat-item"><span class="otak-stat-label">Success</span><span class="otak-stat-value" style="color:var(--success)">'+s.success+'</span></div>' +
                            '<div class="otak-stat-item"><span class="otak-stat-label">Errors</span><span class="otak-stat-value" style="color:var(--danger)">'+s.errors+'</span></div>' +
                            '<div class="otak-stat-item"><span class="otak-stat-label">Tokens</span><span class="otak-stat-value">'+(s.tokens || 0).toLocaleString()+'</span></div>' +
                            '<div class="otak-stat-item"><span class="otak-stat-label">Status</span><span class="otak-stat-value" style="color:'+(o.isEnabled?'var(--success)':'var(--danger)')+'">'+(o.isEnabled ? (o.isCoolingDown ? 'COOLDOWN' : 'READY') : 'DISABLED')+'</span></div>' +
                        '</div>' +
                        '<label class="switch"><input type="checkbox" '+(o.isEnabled?"checked":"")+' onchange="toggleOtak('+o.id+', this.checked, &apos;GROQ&apos;)"><span class="slider"></span></label>' +
                    '</div>';
                });

                // Render Cerebras
                list.innerHTML += '<h3 style="margin:2rem 0 0.5rem; font-size:0.7rem; color:var(--text-muted)">INFRASTRUKTUR CEREBRAS (CADANGAN 2)</h3>';
                d.cerebras.forEach(o => {
                    const s = o.stats || {requests:0, success:0, errors:0, tokens:0};
                    list.innerHTML += '<div class="otak-row '+(o.isEnabled?"active":"")+'" style="border-left: 4px solid var(--info)">' +
                        '<div class="otak-name">CEREBRAS #'+o.id+'</div>' +
                        '<div class="otak-stats">' +
                            '<div class="otak-stat-item"><span class="otak-stat-label">Reqs</span><span class="otak-stat-value">'+s.requests+'</span></div>' +
                            '<div class="otak-stat-item"><span class="otak-stat-label">Success</span><span class="otak-stat-value" style="color:var(--success)">'+s.success+'</span></div>' +
                            '<div class="otak-stat-item"><span class="otak-stat-label">Errors</span><span class="otak-stat-value" style="color:var(--danger)">'+s.errors+'</span></div>' +
                            '<div class="otak-stat-item"><span class="otak-stat-label">Tokens</span><span class="otak-stat-value">'+(s.tokens || 0).toLocaleString()+'</span></div>' +
                            '<div class="otak-stat-item"><span class="otak-stat-label">Status</span><span class="otak-stat-value" style="color:'+(o.isEnabled?'var(--success)':'var(--danger)')+'">'+(o.isEnabled ? (o.isCoolingDown ? 'COOLDOWN' : 'READY') : 'DISABLED')+'</span></div>' +
                        '</div>' +
                        '<label class="switch"><input type="checkbox" '+(o.isEnabled?"checked":"")+' onchange="toggleOtak('+o.id+', this.checked, &apos;CEREBRAS&apos;)"><span class="slider"></span></label>' +
                    '</div>';
                });
            }

            async function loadLogs() { 
                const r = await fetch('/api/admin/logs'); 
                const d = await r.json(); 
                allLogs = d.logs; 
                filterLogs(); 
            }
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
            function filterLogs() { 
                const q = document.getElementById('log-search').value.toLowerCase(); 
                renderLogs(allLogs.filter(l => 
                    (l.username && l.username.toLowerCase().includes(q)) || 
                    (l.ai_name && l.ai_name.toLowerCase().includes(q)) ||
                    (l.user_message && l.user_message.toLowerCase().includes(q)) ||
                    (l.bot_response && l.bot_response.toLowerCase().includes(q))
                )); 
            }

            async function loadUsers(page = 1) {
                userPage = page;
                const r = await fetch('/api/admin/users?page=' + page); 
                const d = await r.json(); 
                allUsers = d.users;
                renderUsers(allUsers);
                renderUserPagination(d.pagination);
            }
            function renderUserPagination(p) {
                const el = document.getElementById('user-pagination');
                if(!el) return;
                if(!p || p.totalPages <= 1) { el.innerHTML = ''; return; }

                let html = '';
                if(p.page > 1) html += '<button class="btn btn-outline" style="padding:0.3rem 0.8rem" onclick="loadUsers(' + (p.page - 1) + ')">Prev</button>';
                html += '<span style="font-weight:700; color:var(--text-muted); font-size:0.8rem">Page ' + p.page + ' of ' + p.totalPages + '</span>';
                if(p.page < p.totalPages) html += '<button class="btn btn-outline" style="padding:0.3rem 0.8rem" onclick="loadUsers(' + (p.page + 1) + ')">Next</button>';
                el.innerHTML = html;
            }
            function renderUsers(users) {
                const b = document.getElementById('user-body'); b.innerHTML = '';
                users.forEach(u => { b.innerHTML += '<tr><td><strong>'+u.username+'</strong></td><td>'+new Date(u.last_seen).toLocaleString()+'</td><td style="text-align:right"><button class="btn btn-outline" onclick="viewUserDetail(&apos;'+u.username+'&apos;)">View Logs</button></td></tr>'; });
            }
            function filterUsers() {
                const q = document.getElementById('user-search').value.toLowerCase();
                renderUsers(allUsers.filter(u => u.username.toLowerCase().includes(q)));
            }

            async function viewUserDetail(username) {
                showToast('Fetching logs for ' + username + '...', 'success');
                const r = await fetch('/api/admin/user-logs/' + encodeURIComponent(username));
                const d = await r.json();
                const userLogs = d.logs || [];
                
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

                const btn = document.getElementById('sim-send-btn');
                const box = document.getElementById('sim-messages');
                
                btn.disabled = true;
                btn.innerHTML = '...';

                // User message
                box.innerHTML += '<div class="msg msg-user">' + text + '</div>';
                document.getElementById('sim-input').value = '';
                box.scrollTop = box.scrollHeight;

                // Typing indicator
                const typingId = 'typing-' + Date.now();
                box.innerHTML += '<div id="' + typingId + '" class="msg msg-bot msg-typing">' +
                    'NPC sedang mengetik <span class="dot"></span><span class="dot"></span><span class="dot"></span>' +
                    '</div>';
                box.scrollTop = box.scrollHeight;

                try {
                    const r = await fetch('/api/npc/v1/chat', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            user: { username: 'Yogaa', level: parseInt(heartLv) }, 
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
                    
                    // Remove typing indicator
                    const typingEl = document.getElementById(typingId);
                    if(typingEl) typingEl.remove();

                    const botMsg = d.sentences ? d.sentences.join('<br>') : 'Error: No response';
                    box.innerHTML += \`<div class="msg msg-bot">\${botMsg}</div>\`;
                    box.scrollTop = box.scrollHeight;

                    // Update Debug Info
                    if (d.debug) {
                        const dbg = document.getElementById('sim-debug-content');
                        dbg.innerHTML = \`
                            <div class="debug-item"><span class="debug-label">Otak Terpilih</span><span class="debug-value">\${d.debug.otak_id} (\${d.debug.model})</span></div>
                            <div class="debug-item"><span class="debug-label">Total Token</span><span class="debug-value">\${d.debug.tokens} toks</span></div>
                            <div class="debug-item"><span class="debug-label">Kecepatan (Latency)</span><span class="debug-value">\${d.debug.latency}ms</span></div>
                            <div class="debug-item"><span class="debug-label">Ekspresi / Pose</span><span class="debug-value" style="color:var(--primary)">\${d.ai_pose || 'idle'}</span></div>
                        \`;
                        document.getElementById('sim-prompt-content').innerText = d.debug.system_prompt;
                    }
                } catch(e) {
                    const typingEl = document.getElementById(typingId);
                    if(typingEl) typingEl.remove();
                    showToast('Gagal terhubung ke engine', 'error');
                } finally {
                    btn.disabled = false;
                    btn.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>\`;
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
            async function toggleOtak(id, enabled, type = 'GROQ') { 
                await fetch('/api/admin/models/toggle', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id, enabled, type}) }); 
                showToast(type + ' Node #' + id + ' ' + (enabled ? 'Enabled' : 'Disabled'), enabled ? 'success' : 'error');
                loadModels(); 
            }
            
            async function updateModel(modelName) {
                try {
                    const r = await fetch('/api/admin/config/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ primaryModel: modelName })
                    });
                    const d = await r.json();
                    if (d.success) {
                        showToast(d.message, 'success');
                    }
                } catch (e) {
                    showToast("Error: " + e.message, 'error');
                }
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
                t.className = "toast " + type;
                t.innerHTML = '<span class="toast-msg">' + msg + '</span>';
                container.appendChild(t);
                setTimeout(() => t.classList.add('show'), 100);
                setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 500); }, 3000);
            }
            
            function renderBalanceBadge(account) {
                if (!account || account.limit === undefined) return '';
                const limit = account.limit || 0;
                const recent = account.recent || 0;
                const available = limit - recent;
                
                const color = available > 0 ? '#22c55e' : '#ef4444';
                const bg = available > 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';
                const label = available > 0 ? 'AVAILABLE' : 'OVER LIMIT';
                return '<div style="display:flex; align-items:center; gap:8px; background:'+bg+'; padding:4px 12px; border-radius:8px; border:1px solid '+color+'">' +
                    '<div style="width:6px; height:6px; border-radius:50%; background:'+color+'"></div>' +
                    '<span style="font-size:11px; font-weight:800; color:'+color+'">'+label+': $'+available.toFixed(2)+'</span>' +
                '</div>';
            }

            function renderBillingTable(billingData) {
                if (!billingData || !billingData.months || !billingData.months.length) return '<tr><td colspan="4" style="text-align:center; color:#64748b; padding:2rem">No billing data available.</td></tr>';
                const latestMonth = billingData.months[0];
                if (!latestMonth || !latestMonth.items) return '<tr><td colspan="4" style="text-align:center; color:#64748b; padding:2rem">No items found for current period.</td></tr>';
                return latestMonth.items.map(item => {
                    const modelName = item.model.model_name.split('/').pop();
                    const type = item.pricing_type === 'input_tokens' ? 'IN' : 'OUT';
                    const usage = (item.units).toLocaleString();
                    const rate = '$' + (item.rate * 10000).toFixed(4) + '/1M';
                    const cost = '$' + (item.cost / 100).toFixed(2);
                    return '<tr><td style="font-weight:700; color:#1e293b">' + modelName + ' <span style="font-size:9px; color:#94a3b8; margin-left:5px">' + type + '</span></td><td>' + usage + ' tokens</td><td style="color:#64748b">' + rate + '</td><td style="font-weight:800; color:var(--primary); text-align:right">' + cost + '</td></tr>';
                }).join('') + '<tr style="background:#f8fafc"><td colspan="3" style="font-weight:800; text-align:right; color:#1e293b">ESTIMATED TOTAL SPEND</td><td style="font-weight:900; color:var(--primary); font-size:1.1rem; text-align:right">$' + (latestMonth.total_cost / 100).toFixed(2) + '</td></tr>';
            }

            let usageChart = null;
            function initUsageChart(data) {
                const ctx = document.getElementById('usageChart');
                if (!ctx) return;
                
                const chartData = {
                    labels: ['DeepInfra (Utama)', 'Groq', 'Cerebras'],
                    datasets: [{
                        label: 'Tokens Consumed',
                        data: [
                            data.deepinfra_stats ? data.deepinfra_stats.total_tokens : 0,
                            data.groq_stats ? data.groq_stats.total_tokens : 0,
                            data.cerebras_stats ? data.cerebras_stats.total_tokens : 0
                        ],
                        backgroundColor: [
                            'rgba(34, 197, 94, 0.6)',
                            'rgba(249, 115, 22, 0.6)',
                            'rgba(59, 130, 246, 0.6)'
                        ],
                        borderColor: [
                            'rgb(34, 197, 94)',
                            'rgb(249, 115, 22)',
                            'rgb(59, 130, 246)'
                        ],
                        borderWidth: 2
                    }]
                };

                usageChart = new Chart(ctx, {
                    type: 'bar',
                    data: chartData,
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: { beginAtZero: true, grid: { display: false } },
                            x: { grid: { display: false } }
                        },
                        plugins: {
                            legend: { display: false }
                        }
                    }
                });
            }

            setInterval(async () => {
                try {
                    const r = await fetch('/api/stats');
                    const d = await r.json();
                    document.getElementById('s-req').innerText = d.totalRequests;
                    document.getElementById('s-tok').innerText = (d.totalTokens || 0).toLocaleString();
                    document.getElementById('s-active').innerText = (d.deepinfra_stats ? d.deepinfra_stats.active : 0) + '/' + (d.deepinfra_stats ? d.deepinfra_stats.available : 0);
                    if(d.groq_stats) document.getElementById('s-groq').innerText = (d.groq_stats.active || 0) + '/' + (d.groq_stats.available || 0);
                    if(d.cerebras_stats) document.getElementById('s-cerebras').innerText = (d.cerebras_stats.active || 0) + '/' + (d.cerebras_stats.available || 0);
                    document.getElementById('s-uptime').innerText = d.uptime || '0s';

                    // Update Chart
                    if (usageChart) {
                        usageChart.data.datasets[0].data = [
                            d.deepinfra_stats ? d.deepinfra_stats.total_tokens : 0,
                            d.groq_stats ? d.groq_stats.total_tokens : 0,
                            d.cerebras_stats ? d.cerebras_stats.total_tokens : 0
                        ];
                        usageChart.update();
                    } else if (document.getElementById('usageChart')) {
                        initUsageChart(d);
                    }

                    // Update Billing Table
                    const billingBody = document.getElementById('billing-body');
                    if (billingBody && d.deepinfra_billing) {
                        billingBody.innerHTML = renderBillingTable(d.deepinfra_billing);
                    }
                    const billingHeader = document.getElementById('billing-header-tools');
                    if (billingHeader && d.deepinfra_account) {
                        const badgeHtml = renderBalanceBadge(d.deepinfra_account);
                        const realtimeSpan = '<span style="font-size:11px; font-weight:800; color:#64748b; background:#f1f5f9; padding:4px 10px; border-radius:6px; text-transform:uppercase">REALTIME DATA</span>';
                        billingHeader.innerHTML = badgeHtml + realtimeSpan;
                    }
                } catch(e) {}
            }, 3000);

            // --- BAN LIST MANAGEMENT ---
            async function loadBanList() {
                try {
                    const res = await fetch('/api/admin/ban-list');
                    const data = await res.json();    
                    if (data.success) {
                        const tbody = document.getElementById('banlist-body');
                        tbody.innerHTML = data.list.map(b => \`
                            <tr>
                                <td style="font-weight: 700;">\${b.username}</td>
                                <td style="color: var(--text-muted);">\${new Date(b.created_at).toLocaleString('id-ID')}</td>
                                <td style="text-align: right;">
                                    <button class="btn btn-danger" onclick="unbanUser('\${b.username}')">Unban</button>
                                </td>
                            </tr>
                        \`).join('');
                        document.getElementById('ban-message-input').value = data.ban_message || 'Aku malas berbicara dengan kamu.';
                    }
                } catch (e) {
                    console.error("Failed to load ban list", e);
                }
            }

            async function banUser() {
                const username = document.getElementById('ban-username-input').value.trim();
                if (!username) return showToast('Username tidak boleh kosong', 'error');
                
                try {
                    const res = await fetch('/api/admin/ban-user', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username })
                    });
                    const data = await res.json();
                    if (data.success) {
                        showToast(data.message, 'success');
                        document.getElementById('ban-username-input').value = '';
                        loadBanList();
                    } else {
                        showToast(data.error, 'error');
                    }
                } catch (e) {
                    showToast('Gagal memblokir user', 'error');
                }
            }

            async function unbanUser(username) {
                if (!confirm(\`Apakah kamu yakin ingin melepas ban untuk \${username}?\`)) return;
                
                try {
                    const res = await fetch('/api/admin/unban-user', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username })
                    });
                    const data = await res.json();
                    if (data.success) {
                        showToast(data.message, 'success');
                        loadBanList();
                    } else {
                        showToast(data.error, 'error');
                    }
                } catch (e) {
                    showToast('Gagal melepas ban user', 'error');
                }
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
                    if (data.success) {
                        showToast(data.message, 'success');
                    } else {
                        showToast(data.error, 'error');
                    }
                } catch (e) {
                    showToast('Gagal memperbarui pesan ban', 'error');
                }
            }

            // Hook loadBanList to be called on start or when page is shown
            document.addEventListener('DOMContentLoaded', () => {
                if (${isAdmin}) loadBanList();
                lucide.createIcons();
            });

            showPage(${isAdmin} ? 'dashboard' : 'karakter');

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
