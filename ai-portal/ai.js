const API = ''; // Relative path because frontend-server proxies requests
const email = localStorage.getItem('currentUserEmail') || 'guest@company.com'; 
const sessionId = Date.now().toString(); // Simple session tracking

const chatContainer = document.getElementById('chat-container');
const messagesArea = document.getElementById('chat-messages');
const typingIndicator = document.getElementById('typing-indicator');

// Scroll to bottom helper
function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Add Message to UI
function addMsg(role, text) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  
  // Avatar
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = role === 'user' ? 'U' : 'E';
  
  // Bubble
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  
  // Render Markdown for bot, plain text for user (safer)
  if (role === 'bot' && typeof marked !== 'undefined') {
    bubble.innerHTML = marked.parse(text);
  } else {
    bubble.textContent = text;
  }
  
  div.appendChild(avatar);
  div.appendChild(bubble);
  
  messagesArea.appendChild(div);
  scrollToBottom();
}

// Form Submit
document.getElementById('chat-form').onsubmit = async (e) => {
  e.preventDefault();
  const input = document.getElementById('msg');
  const text = input.value.trim();
  if (!text) return;
  
  // 1. Show User Message
  addMsg('user', text);
  input.value = '';
  
  // 2. Show Typing Indicator
  typingIndicator.classList.remove('hidden');
  scrollToBottom();

  try {
    const r = await fetch(`${API}/api/ai/chat`, { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ email, sessionId, message: text }) 
    });
    const j = await r.json();
    
    // 3. Hide Indicator & Show Bot Reply
    typingIndicator.classList.add('hidden');
    addMsg('bot', j.reply || 'Sorry, I missed that.');
    
  } catch (err) {
    console.error(err);
    typingIndicator.classList.add('hidden');
    addMsg('bot', "I'm having trouble connecting to the server. Please try again later.");
  }
};

// Initial scroll
scrollToBottom();
