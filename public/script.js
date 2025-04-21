// Globální proměnné
let currentUserId = localStorage.getItem('userId') || null;
let currentUsername = localStorage.getItem('username') || null;
let allOffers = [];
let myOffers = [];
let isEditMode = false;
let editingOfferId = null;

// Připojení k socket.io
let socket;
if (typeof io !== 'undefined') {
  socket = io('http://localhost:3000');
}

// Po přihlášení uživatele pošli jeho userId na socket
function socketLogin() {
  if (socket && currentUserId) {
    socket.emit('login', { userId: currentUserId });
  }
}

// Po přihlášení nebo registraci
function afterLogin() {
  updateAccountSection();
  socketLogin();
}

// DOM elementy
const homeSection = document.getElementById('home-section');
const accountSection = document.getElementById('account-section');
const chatSection = document.getElementById('chat-section');
const notLoggedInDiv = document.getElementById('not-logged-in');
const loggedInSection = document.getElementById('logged-in-section');

const navHome = document.getElementById('nav-home');
const navAccount = document.getElementById('nav-account');
const navChat = document.getElementById('nav-chat');

const btnAddOffer = document.getElementById('btn-add-offer');
const addOfferModalEl = document.getElementById('addOfferModal');
const addOfferForm = document.getElementById('add-offer-form');

const searchInput = document.getElementById('search-input');
const filterCondition = document.getElementById('filter-condition');
const filterSize = document.getElementById('filter-size');
const filterBrand = document.getElementById('filter-brand');
const filterBtn = document.getElementById('filter-btn');
const clearFilterBtn = document.getElementById('clear-filter-btn');

const allOffersContainer = document.getElementById('all-offers-container');
const myOffersContainer = document.getElementById('my-offers-container');

const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const usernameSpan = document.getElementById('username-span');
const logoutBtn = document.getElementById('logout-btn');

// Toggle login/register forms
const showLoginBtn = document.getElementById('show-login');
const showRegisterBtn = document.getElementById('show-register');
const loginFormWrap = document.getElementById('login-form-wrap');
const registerFormWrap = document.getElementById('register-form-wrap');

if (showLoginBtn && showRegisterBtn && loginFormWrap && registerFormWrap) {
  showLoginBtn.addEventListener('click', () => {
    showLoginBtn.classList.add('active', 'btn-primary');
    showLoginBtn.classList.remove('btn-secondary');
    showRegisterBtn.classList.remove('active', 'btn-primary');
    showRegisterBtn.classList.add('btn-secondary');
    loginFormWrap.style.display = '';
    registerFormWrap.style.display = 'none';
  });
  showRegisterBtn.addEventListener('click', () => {
    showRegisterBtn.classList.add('active', 'btn-primary');
    showRegisterBtn.classList.remove('btn-secondary');
    showLoginBtn.classList.remove('active', 'btn-primary');
    showLoginBtn.classList.add('btn-secondary');
    loginFormWrap.style.display = 'none';
    registerFormWrap.style.display = '';
  });
}

// Modern notification system
function showNotification(message, type = 'info') {
  const container = document.getElementById('notification-container');
  if (!container) return;
  const notif = document.createElement('div');
  notif.className = `notification ${type}`;
  notif.textContent = message;
  container.appendChild(notif);
  setTimeout(() => {
    notif.style.opacity = '0';
    notif.style.transform = 'translateY(-20px) scale(0.98)';
    setTimeout(() => notif.remove(), 400);
  }, 2600);
}

// Custom confirm dialog (returns a Promise)
function showConfirm(message) {
  return new Promise((resolve) => {
    const container = document.getElementById('notification-container');
    const notif = document.createElement('div');
    notif.className = 'notification info';
    notif.innerHTML = `<span>${message}</span><div style="margin-left:auto;display:flex;gap:8px"><button class='btn btn-sm btn-primary'>Ano</button><button class='btn btn-sm btn-secondary'>Ne</button></div>`;
    container.appendChild(notif);
    notif.querySelector('.btn-primary').onclick = () => { notif.remove(); resolve(true); };
    notif.querySelector('.btn-secondary').onclick = () => { notif.remove(); resolve(false); };
  });
}

// Funkce pro zobrazení sekcí
function showHomeSection() {
  homeSection.classList.remove('hidden');
  accountSection.classList.add('hidden');
  chatSection.classList.add('hidden');
}

function showAccountSection() {
  accountSection.classList.remove('hidden');
  homeSection.classList.add('hidden');
  chatSection.classList.add('hidden');
  updateAccountSection();
}

function showChatSection() {
  homeSection.classList.add('hidden');
  accountSection.classList.add('hidden');
  chatSection.classList.remove('hidden');
  fetchUserChats();
}

function updateAccountSection() {
  if (!currentUserId) {
    notLoggedInDiv.classList.remove('hidden');
    loggedInSection.classList.add('hidden');
  } else {
    notLoggedInDiv.classList.add('hidden');
    loggedInSection.classList.remove('hidden');
    usernameSpan.textContent = currentUsername || '';
    fetchMyOffers();
  }
}

// Navigace
navHome.addEventListener('click', (e) => {
  e.preventDefault();
  showHomeSection();
  fetchAllOffers();
});

navAccount.addEventListener('click', (e) => {
  e.preventDefault();
  showAccountSection();
});

if (navChat && chatSection) {
  navChat.addEventListener('click', (e) => {
    e.preventDefault();
    showChatSection();
  });
}

// Odhlášení
logoutBtn.addEventListener('click', () => {
  currentUserId = null;
  currentUsername = null;
  localStorage.removeItem('userId');
  localStorage.removeItem('username');
  // Clear login and register form fields
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('register-username').value = '';
  document.getElementById('register-password').value = '';
  document.getElementById('register-telephone').value = '';
  document.getElementById('register-email').value = '';
  updateAccountSection();
  showNotification('Byli jste odhlášeni.', 'success');
});

// Tlačítko pro přidání nabídky (otevře modál)
btnAddOffer.addEventListener('click', () => {
  if (!currentUserId) {
    showNotification('Pro přidání nabídky se musíte nejdřív přihlásit.', 'error');
  } else {
    const modal = new bootstrap.Modal(addOfferModalEl);
    modal.show();
  }
});

// Odeslání formuláře "Přidat nabídku"
addOfferForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentUserId) {
    showNotification('Nejste přihlášen.', 'error');
    return;
  }
  
  const formData = new FormData();
  formData.append('title', document.getElementById('offer-title').value);
  formData.append('price', document.getElementById('offer-price').value);
  formData.append('size', document.getElementById('offer-size').value);
  formData.append('color', document.getElementById('offer-color').value);
  formData.append('item_condition', document.getElementById('offer-condition').value);
  formData.append('brand', document.getElementById('offer-brand').value);
  formData.append('description', document.getElementById('offer-description').value);

  const fileInput = document.getElementById('offer-image');
  if (fileInput.files.length > 0) {
    formData.append('image', fileInput.files[0]);
  }

  try {
    let res, data;
    if (isEditMode && editingOfferId) {
      res = await fetch(`http://localhost:3000/api/offers/${editingOfferId}`, {
        method: 'PUT',
        headers: { 'x-user-id': currentUserId },
        body: formData
      });
      data = await res.json();
    } else {
      res = await fetch('http://localhost:3000/api/offers', {
        method: 'POST',
        headers: { 'x-user-id': currentUserId },
        body: formData
      });
      data = await res.json();
    }
    if (!res.ok) {
      showNotification(data.message || 'Chyba při ukládání nabídky.', 'error');
    } else {
      showNotification(data.message || (isEditMode ? 'Nabídka upravena.' : 'Nabídka přidána.'), 'success');
      const modalInstance = bootstrap.Modal.getInstance(addOfferModalEl);
      modalInstance.hide();
      addOfferForm.reset();
      // Reset modal title and button
      document.querySelector('#addOfferModal .modal-title').textContent = 'Přidat nabídku';
      document.querySelector('#add-offer-form button[type="submit"]').textContent = 'Přidat';
      isEditMode = false;
      editingOfferId = null;
      fetchAllOffers();
      fetchMyOffers();
    }
  } catch (error) {
    console.error('Chyba při ukládání nabídky:', error);
  }
});

// When modal is closed, reset edit mode
addOfferModalEl.addEventListener('hidden.bs.modal', () => {
  isEditMode = false;
  editingOfferId = null;
  addOfferForm.reset();
  document.querySelector('#addOfferModal .modal-title').textContent = 'Přidat nabídku';
  document.querySelector('#add-offer-form button[type="submit"]').textContent = 'Přidat';
});

// Načtení všech nabídek
async function fetchAllOffers() {
  try {
    const res = await fetch('http://localhost:3000/api/offers');
    allOffers = await res.json();
    renderAllOffers(allOffers);
  } catch (error) {
    console.error('Chyba fetchAllOffers:', error);
  }
}

function renderAllOffers(offers) {
  allOffersContainer.innerHTML = '';
  offers.forEach((offer, index) => {
    const col = document.createElement('div');
    col.className = 'col-md-3';

    const card = document.createElement('div');
    card.className = 'card offer-card';
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      document.getElementById('offer-detail-title').textContent = offer.title;
      document.getElementById('offer-detail-info').innerHTML = `
        <strong>Velikost:</strong> ${offer.size || 'neuvedeno'}<br />
        <strong>Barva:</strong> ${offer.color || 'neuvedeno'}<br />
        <strong>Stav:</strong> ${offer.item_condition}<br />
        <strong>Značka:</strong> ${offer.brand || 'neuvedeno'}<br />
        <strong>Cena:</strong> ${offer.price} Kč<br />
      `;
      document.getElementById('offer-detail-description').textContent = offer.description || '';
      document.getElementById('offer-detail-author').textContent = `Vytvořil: ${offer.username}`;
      const img = document.getElementById('offer-detail-image');
      if (offer.image) {
        img.src = offer.image;
        img.alt = offer.title;
        img.style.display = '';
      } else {
        img.style.display = 'none';
      }
      const modal = new bootstrap.Modal(document.getElementById('offerDetailModal'));
      modal.show();
    });

    if (offer.image) {
      const img = document.createElement('img');
      img.className = 'card-img-top';
      img.src = offer.image;
      img.alt = offer.title;
      card.appendChild(img);
    } else {
      const noImgDiv = document.createElement('div');
      noImgDiv.className = 'card-img-top d-flex align-items-center justify-content-center';
      noImgDiv.style.height = '180px';
      noImgDiv.style.background = '#e4e4e4';
      noImgDiv.style.color = '#888';
      noImgDiv.style.fontWeight = 'bold';
      noImgDiv.style.fontSize = '1.1rem';
      noImgDiv.textContent = 'No image';
      card.appendChild(noImgDiv);
    }

    const body = document.createElement('div');
    body.className = 'card-body';

    const title = document.createElement('h5');
    title.textContent = offer.title;
    body.appendChild(title);

    const info = document.createElement('p');
    info.innerHTML = `<span class="offer-price">${offer.price} Kč</span><br><span class="offer-size">Velikost: ${offer.size || 'neuvedeno'}</span>`;
    body.appendChild(info);

    // Přidám tlačítko Kontaktuj mě (pokud není moje nabídka)
    if (currentUserId && offer.user_id != currentUserId) {
      const chatBtn = document.createElement('button');
      chatBtn.className = 'btn btn-sm btn-success mt-2';
      chatBtn.textContent = 'Kontaktuj mě';
      chatBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openChatWithUser(offer.user_id, offer.username);
      });
      body.appendChild(chatBtn);
    }

    card.appendChild(body);
    col.appendChild(card);
    allOffersContainer.appendChild(col);
  });
  animateOnScroll();
}

// Načtení mých nabídek
async function fetchMyOffers() {
  try {
    const res = await fetch('http://localhost:3000/api/my-offers', {
      headers: { 'x-user-id': currentUserId }
    });
    myOffers = await res.json();
    renderMyOffers(myOffers);
  } catch (error) {
    console.error('Chyba fetchMyOffers:', error);
  }
}

function renderMyOffers(offers) {
  myOffersContainer.innerHTML = '';
  offers.forEach((offer) => {
    const col = document.createElement('div');
    col.className = 'col-md-3';

    const card = document.createElement('div');
    card.className = 'card offer-card';

    if (offer.image) {
      const img = document.createElement('img');
      img.className = 'card-img-top';
      img.src = offer.image;
      img.alt = offer.title;
      card.appendChild(img);
    } else {
      const noImgDiv = document.createElement('div');
      noImgDiv.className = 'card-img-top d-flex align-items-center justify-content-center';
      noImgDiv.style.height = '180px';
      noImgDiv.style.background = '#e4e4e4';
      noImgDiv.style.color = '#888';
      noImgDiv.style.fontWeight = 'bold';
      noImgDiv.style.fontSize = '1.1rem';
      noImgDiv.textContent = 'No image';
      card.appendChild(noImgDiv);
    }

    const body = document.createElement('div');
    body.className = 'card-body';

    const title = document.createElement('h5');
    title.textContent = offer.title;
    body.appendChild(title);

    const info = document.createElement('p');
    info.innerHTML = `<span class="offer-price">${offer.price} Kč</span><br><span class="offer-size">Velikost: ${offer.size || 'neuvedeno'}</span>`;
    body.appendChild(info);

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-sm btn-warning me-2';
    editBtn.textContent = 'Upravit';
    editBtn.addEventListener('click', () => {
      isEditMode = true;
      editingOfferId = offer.id;
      document.getElementById('offer-title').value = offer.title || '';
      document.getElementById('offer-price').value = offer.price || '';
      document.getElementById('offer-size').value = offer.size || '';
      document.getElementById('offer-color').value = offer.color || '';
      document.getElementById('offer-condition').value = offer.item_condition || '';
      document.getElementById('offer-brand').value = offer.brand || '';
      document.getElementById('offer-description').value = offer.description || '';
      document.getElementById('offer-image').value = '';
      document.querySelector('#addOfferModal .modal-title').textContent = 'Upravit nabídku';
      document.querySelector('#add-offer-form button[type="submit"]').textContent = 'Uložit změny';
      const modal = new bootstrap.Modal(addOfferModalEl);
      modal.show();
    });
    body.appendChild(editBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn-sm btn-danger';
    deleteBtn.textContent = 'Smazat';
    deleteBtn.addEventListener('click', () => {
      deleteMyOffer(offer.id);
    });
    body.appendChild(deleteBtn);

    card.appendChild(body);
    col.appendChild(card);
    myOffersContainer.appendChild(col);
  });
  animateOnScroll();
}

// Smazání nabídky
async function deleteMyOffer(id) {
  const confirmed = await showConfirm('Opravdu chcete smazat tuto nabídku?');
  if (!confirmed) return;
  try {
    const res = await fetch(`http://localhost:3000/api/offers/${id}`, {
      method: 'DELETE',
      headers: { 'x-user-id': currentUserId }
    });
    const data = await res.json();
    if (!res.ok) {
      showNotification(data.message || 'Chyba při mazání nabídky.', 'error');
    } else {
      showNotification('Nabídka smazána.', 'success');
      fetchMyOffers();
      fetchAllOffers();
    }
  } catch (error) {
    showNotification('Chyba při mazání nabídky.', 'error');
  }
}

// Přihlášení
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;

  try {
    const res = await fetch('http://localhost:3000/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (!res.ok) {
      showNotification(data.message || 'Chyba při přihlášení.', 'error');
    } else {
      showNotification(data.message || 'Přihlášení proběhlo úspěšně.', 'success');
      currentUserId = data.userId;
      currentUsername = data.username;
      localStorage.setItem('userId', currentUserId);
      localStorage.setItem('username', currentUsername);
      afterLogin();
    }
  } catch (error) {
    showNotification('Chyba při přihlášení.', 'error');
  }
});

// Registrace
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('register-username').value;
  const password = document.getElementById('register-password').value;
  const telephone = document.getElementById('register-telephone').value;
  const email = document.getElementById('register-email').value;

  try {
    const res = await fetch('http://localhost:3000/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, telephone, email })
    });
    const data = await res.json();
    if (!res.ok) {
      showNotification(data.message || 'Chyba při registraci.', 'error');
    } else {
      showNotification(data.message || 'Registrace proběhla úspěšně.', 'success');
      currentUserId = data.userId;
      currentUsername = data.username;
      localStorage.setItem('userId', currentUserId);
      localStorage.setItem('username', currentUsername);
      afterLogin();
    }
  } catch (error) {
    showNotification('Chyba při registraci.', 'error');
  }
});

// Filtrace nabídek
filterBtn.addEventListener('click', filterAllOffers);
clearFilterBtn.addEventListener('click', () => {
  searchInput.value = '';
  filterCondition.value = '';
  filterSize.value = '';
  filterBrand.value = '';
  renderAllOffers(allOffers);
});

function filterAllOffers() {
  const text = searchInput.value.toLowerCase().trim();
  const cond = filterCondition.value;
  const size = filterSize.value.toLowerCase().trim();
  const brand = filterBrand.value.toLowerCase().trim();

  const filtered = allOffers.filter((offer) => {
    if (text && !offer.title.toLowerCase().includes(text)) return false;
    if (cond && offer.item_condition !== cond) return false;
    if (size && (!offer.size || !offer.size.toLowerCase().includes(size))) return false;
    if (brand && (!offer.brand || !offer.brand.toLowerCase().includes(brand))) return false;
    return true;
  });

  renderAllOffers(filtered);
}

/* 
  Funkce využívající Intersection Observer pro animaci prvků (když se objeví ve viewportu, 
  přidáme jim třídu .visible a spustí se animace definovaná v CSS).
*/
function animateOnScroll() {
  const elements = document.querySelectorAll('.offer-card');
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  elements.forEach(el => {
    observer.observe(el);
  });
}

// Zobrazení kontaktu
async function showContactModal(userId) {
  try {
    const res = await fetch(`http://localhost:3000/api/user/${userId}`);
    const data = await res.json();
    document.getElementById('contact-username').textContent = data.username || '';
    document.getElementById('contact-telephone').textContent = data.telephone || 'neuvedeno';
    document.getElementById('contact-email').textContent = data.email || 'neuvedeno';
    const modal = new bootstrap.Modal(document.getElementById('contactModal'));
    modal.show();
  } catch (error) {
    showNotification('Chyba při načítání kontaktu.', 'error');
  }
}

// Přidám funkce pro chat
// Otevře chat modal s uživatelem
function openChatWithUser(userId, username) {
  if (!currentUserId) {
    showNotification('Pro chatování se musíte přihlásit.', 'error');
    return;
  }
  showChatSection();
  setActiveChatThread(userId, username);
}

// Zvýraznění aktivního chatu
let activeChatUserId = null;
function setActiveChatThread(userId, username) {
  activeChatUserId = userId;
  // Odstranit .active ze všech
  document.querySelectorAll('.chat-thread-list-item').forEach(el => {
    el.classList.remove('active');
    if (el.dataset.userid == userId) el.classList.add('active');
  });
  openChatThread(userId, username);
}

// Načtení všech chatů uživatele
async function fetchUserChats() {
  if (!currentUserId) return;
  const chatList = document.getElementById('chat-list');
  chatList.innerHTML = '<div>Načítám...</div>';
  try {
    const res = await fetch(`http://localhost:3000/api/messages/${currentUserId}`, {
      headers: { 'x-user-id': currentUserId }
    });
    const data = await res.json();
    chatList.innerHTML = '';
    // Vytvořím seznam unikátních uživatelů, se kterými mám konverzaci
    const threads = {};
    data.forEach(msg => {
      const otherId = msg.sender_id == currentUserId ? msg.recipient_id : msg.sender_id;
      if (!threads[otherId] || new Date(msg.created_at) > new Date(threads[otherId].created_at)) {
        threads[otherId] = msg;
      }
    });
    Object.values(threads).forEach(msg => {
      const otherId = msg.sender_id == currentUserId ? msg.recipient_id : msg.sender_id;
      const otherName = msg.sender_id == currentUserId ? msg.recipient_username : msg.sender_username;
      const threadDiv = document.createElement('div');
      threadDiv.className = 'chat-thread-list-item';
      threadDiv.innerHTML = `<span class="chat-user">${otherName}</span><span class="chat-last-message">${msg.content}</span>`;
      threadDiv.addEventListener('click', () => {
        setActiveChatThread(otherId, otherName);
      });
      threadDiv.dataset.userid = otherId;
      chatList.appendChild(threadDiv);
    });
    if (Object.keys(threads).length === 0) {
      chatList.innerHTML = '<div>Žádné konverzace.</div>';
    }
  } catch (e) {
    chatList.innerHTML = '<div>Chyba při načítání chatů.</div>';
  }
}

// Otevře konkrétní chat vlákno
async function openChatThread(otherUserId, otherUsername) {
  const chatThread = document.getElementById('chat-thread');
  const chatThreadHeader = document.getElementById('chat-thread-header');
  const chatInput = document.getElementById('chat-input');
  const chatSendBtn = document.getElementById('chat-send-btn');
  const chatSendContactBtn = document.getElementById('chat-send-contact-btn');
  chatThreadHeader.textContent = 'Chat s ' + otherUsername;
  chatThread.innerHTML = '<div>Načítám...</div>';
  chatInput.value = '';
  chatSendBtn.disabled = false;
  // Načti zprávy
  try {
    const res = await fetch(`http://localhost:3000/api/messages/thread/${currentUserId}/${otherUserId}`, {
      headers: { 'x-user-id': currentUserId }
    });
    const data = await res.json();
    chatThread.innerHTML = '';
    data.forEach(msg => {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'chat-message' + (msg.sender_id == currentUserId ? ' chat-message-mine' : '');
      msgDiv.innerHTML = `
        <div class="chat-message-card">
          <span class="chat-message-user">${msg.sender_username}:</span>
          <span class="chat-message-content">${(msg.content || '').replace(/\n/g, '<br>')}</span>
        </div>
      `;
      chatThread.appendChild(msgDiv);
    });
    chatThread.scrollTop = chatThread.scrollHeight;
  } catch (e) {
    chatThread.innerHTML = '<div>Chyba při načítání zpráv.</div>';
  }
  // Odeslání zprávy přes socket.io
  chatSendBtn.onclick = async () => {
    const text = chatInput.value.trim();
    if (!text) return;
    chatSendBtn.disabled = true;
    if (socket) {
      socket.emit('chatMessage', {
        senderId: currentUserId,
        recipientId: otherUserId,
        content: text,
        senderUsername: currentUsername
      });
      chatInput.value = '';
      chatSendBtn.disabled = false;
    }
  };
  // Odeslání kontaktu
  if (chatSendContactBtn) {
    chatSendContactBtn.onclick = async () => {
      chatSendContactBtn.disabled = true;
      try {
        // Načti kontakt přihlášeného uživatele
        const res = await fetch(`http://localhost:3000/api/user/${currentUserId}`);
        const data = await res.json();
        // Hezčí formát kontaktní zprávy s emoji a novými řádky
        const contactMsg =
          `📇 Moje kontaktní údaje:\n` +
          `✉️ E-mail: ${data.email || 'neuvedeno'}\n` +
          `📞 Telefon: ${data.telephone || 'neuvedeno'}`;
        const sendRes = await fetch('http://localhost:3000/api/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': currentUserId
          },
          body: JSON.stringify({ recipientId: otherUserId, content: contactMsg })
        });
        if (sendRes.ok) {
          openChatThread(otherUserId, otherUsername);
        } else {
          showNotification('Chyba při odesílání kontaktu.', 'error');
        }
      } finally {
        chatSendContactBtn.disabled = false;
      }
    };
  }
}

// Realtime příjem zpráv
if (typeof io !== 'undefined') {
  socket.on('chatMessage', (msg) => {
    // Pokud je zpráva do aktuálního vlákna, přidej ji do chatu
    const chatThread = document.getElementById('chat-thread');
    if (!chatThread) return;
    if (
      (msg.senderId == currentUserId && msg.recipientId == activeChatUserId) ||
      (msg.senderId == activeChatUserId && msg.recipientId == currentUserId)
    ) {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'chat-message' + (msg.senderId == currentUserId ? ' chat-message-mine' : '');
      msgDiv.innerHTML = `
        <div class="chat-message-card">
          <span class="chat-message-user">${msg.sender_username || ''}:</span>
          <span class="chat-message-content">${(msg.content || '').replace(/\n/g, '<br>')}</span>
        </div>
      `;
      chatThread.appendChild(msgDiv);
      chatThread.scrollTop = chatThread.scrollHeight;
    }
  });
}

// Inicializace
(function init() {
  fetchAllOffers();
  if (currentUserId) {
    // Možné načtení dalších dat
  }
})();
