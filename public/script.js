let selectedChar = null;
let chatHistory = [];

const charListEl = document.getElementById('charList');
const chatHeader = document.getElementById('chatHeader');
const inputArea = document.getElementById('inputArea');
const messageList = document.getElementById('messageList');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const aiLoading = document.getElementById('aiLoading');

// Fetch Character List
async function loadCharacters() {
    try {
        const res = await fetch('/api/characters');
        const data = await res.json();
        
        if (data.success) {
            charListEl.innerHTML = '';
            data.characters.forEach(char => {
                const item = document.createElement('div');
                item.className = 'char-item';
                item.innerHTML = `
                    <h3>${char.name}</h3>
                    <p>${char.description}</p>
                `;
                item.onclick = () => selectCharacter(char);
                charListEl.appendChild(item);
            });
        }
    } catch (e) {
        charListEl.innerHTML = '<div class="error">Gagal memuat karakter.</div>';
    }
}

function selectCharacter(char) {
    selectedChar = char;
    chatHistory = [];
    
    // Update UI
    document.querySelectorAll('.char-item').forEach(el => el.classList.remove('active'));
    event.currentTarget.classList.add('active');
    
    chatHeader.style.display = 'flex';
    inputArea.style.display = 'flex';
    document.getElementById('activeName').innerText = char.name;
    document.getElementById('activeAvatar').innerText = char.name[0];
    
    messageList.innerHTML = '';
    // Pesan awal ditiadakan.
}

function addMessage(role, text) {
    const div = document.createElement('div');
    div.className = `message msg-${role}`;
    div.innerText = text;
    messageList.appendChild(div);
    messageList.scrollTop = messageList.scrollHeight;
}

async function sendMessage() {
    const text = userInput.value.trim();
    if (!text || !selectedChar) return;
    
    userInput.value = '';
    addMessage('user', text);
    
    aiLoading.style.display = 'block';
    sendBtn.disabled = true;

    try {
        const payload = {
            user: { username: "Yogaa", id: "123", level: 5 },
            message: text,
            context: {
                history: chatHistory,
                problem: "Bertemu secara tidak sengaja",
                location: "Taman Sekolah",
                mood: "normal",
                time: "SORE"
            },
            system: {
                ai_name: selectedChar.id,
                request_id: Date.now().toString()
            }
        };

        const res = await fetch('/api/npc/v1/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        aiLoading.style.display = 'none';
        sendBtn.disabled = false;

        if (data.sentences) {
            // Tampilkan kalimat satu per satu (efek alami)
            for (const sentence of data.sentences) {
                addMessage('bot', sentence);
                chatHistory.push({ role: 'bot', content: sentence });
                // Small delay between sentences
                await new Promise(r => setTimeout(r, 600));
            }
            chatHistory.push({ role: 'user', content: text });
            // Batasi riwayat
            if (chatHistory.length > 10) chatHistory = chatHistory.slice(-10);
        }
    } catch (e) {
        aiLoading.style.display = 'none';
        sendBtn.disabled = false;
        addMessage('bot', 'Maaf, sepertinya ada masalah koneksi.');
    }
}

sendBtn.onclick = sendMessage;
userInput.onkeypress = (e) => {
    if (e.key === 'Enter') sendMessage();
};

loadCharacters();
