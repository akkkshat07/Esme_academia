const API = 'http://localhost:3002';
const email = localStorage.getItem('currentUserEmail') || ''; // set by your login flow 

async function addMsg(who, text) {
  const chat = document.getElementById('chat');
  const div = document.createElement('div');
  div.className = who;
  div.textContent = text;
  chat.appendChild(div);
  chat.scrollTop = chat.scrollHeight;
}

document.getElementById('chat-form').onsubmit = async (e) => {
  e.preventDefault();
  const text = document.getElementById('msg').value.trim();
  if (!text) return;
  await addMsg('user', text);
  document.getElementById('msg').value = '';
  const r = await fetch(`${API}/ai/chat`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, message: text }) });
  const j = await r.json();
  await addMsg('bot', j.reply || '…');
};
