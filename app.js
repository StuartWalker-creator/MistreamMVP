// ═══════════════════════════════════
// FIREBASE CONFIG
// ═══════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyCHBo_6-GZi4M7p77-Tk8W32i24KuD-tqg",
  authDomain: "bodaboda-9a325.firebaseapp.com",
  projectId: "bodaboda-9a325",
  storageBucket: "bodaboda-9a325.firebasestorage.app",
  messagingSenderId: "860902193571",
  appId: "1:860902193571:web:e70a25b2c967e3c7570216",
  measurementId: "G-3T4VMQQ30Y"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

//const storage = firebase.storage();

const CLOUDINARY_CLOUD = 'dvdshonhc';
const CLOUDINARY_PRESET = 'mistream_uploads';

// ═══════════════════════════════════
// STATE
// ═══════════════════════════════════
let currentUser = null;
let currentUserData = null;
let currentPage = 'feed';
let prevPage = null;
let currentFeedNiche = 'all';
let currentChalTab = 'incoming';
let selectedNiche = '';
let selectedGiftAmount = 0;
let giftTargetPost = null;
let challengeTarget = null;
let selectedChallengePost = null;
let mediaFile = null;
let feedUnsubscribe = null;
let chalUnsubscribe = null;
let notifUnsubscribe = null;

const NICHES = ['comedy','trading','music','fashion','football','fitness','travel','gaming'];
const NICHE_ICONS = {
  comedy:'fa-masks-theater', trading:'fa-chart-line', music:'fa-music',
  fashion:'fa-shirt', football:'fa-futbol', fitness:'fa-dumbbell',
  travel:'fa-plane', gaming:'fa-gamepad'
};

// ═══════════════════════════════════
// INIT
// ═══════════════════════════════════
window.addEventListener('load', () => {
  setTimeout(() => {
    document.getElementById('splash').classList.add('hidden');
    auth.onAuthStateChanged(async user => {
      if (user) {
        const snap = await db.collection('users').doc(user.uid).get();
        if (snap.exists) {
          currentUser = user;
          currentUserData = snap.data();
          initApp();
        } else {
          showView('register-view');
        }
      } else {
        showView('login-view');
      }
    });
  }, 2000);
});

// ═══════════════════════════════════
// AUTH HELPERS
// ═══════════════════════════════════
function showView(id) {
  document.querySelectorAll('.auth-view').forEach(v => v.classList.add('hidden'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function selectNiche(el) {
  document.querySelectorAll('.niche-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  selectedNiche = el.dataset.niche;
  updateUsernamePreview();
}

function updateUsernamePreview() {
  const name = document.getElementById('reg-name').value.trim().toLowerCase().replace(/\s+/g,'');
  const prev = document.getElementById('username-preview');
  const upName = document.getElementById('up-name');
  if (name && selectedNiche) {
    prev.classList.remove('hidden');
    upName.textContent = `${name}@${selectedNiche}`;
  } else {
    prev.classList.add('hidden');
  }
}

async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value;
  const err = document.getElementById('login-error');
  err.classList.add('hidden');
  if (!email || !pass) { showError(err, 'Please fill in all fields.'); return; }
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch(e) {
    showError(err, friendlyError(e.code));
  }
}

async function handleRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-password').value;
  const err = document.getElementById('reg-error');
  err.classList.add('hidden');
  if (!name) { showError(err, 'Enter your name.'); return; }
  if (!selectedNiche) { showError(err, 'Pick your niche.'); return; }
  if (!email) { showError(err, 'Enter your email.'); return; }
  if (pass.length < 6) { showError(err, 'Password must be at least 6 characters.'); return; }
  const username = `${name.toLowerCase().replace(/\s+/g,'')}@${selectedNiche}`;
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    await db.collection('users').doc(cred.user.uid).set({
      uid: cred.user.uid, displayName: name, username, niche: selectedNiche,
      email, bio: '', giftClicksReceived: 0, challengeRequestsReceived: 0,
      followers: 0, following: 0, postCount: 0, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch(e) {
    showError(err, friendlyError(e.code));
  }
}

function showError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }
function friendlyError(code) {
  const map = {
    'auth/email-already-in-use': 'That email is already registered.',
    'auth/invalid-email': 'Please enter a valid email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/user-not-found': 'No account found with that email.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Try again later.'
  };
  return map[code] || 'Something went wrong. Try again.';
}

// ═══════════════════════════════════
// APP INIT
// ═══════════════════════════════════
function initApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  const av = document.getElementById('topbar-av');
  av.textContent = currentUserData.displayName.charAt(0).toUpperCase();
  setupPostForm();
  showPage('feed');
  listenNotifications();
}

// ═══════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════
function showPage(page) {
  prevPage = currentPage;
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.bni').forEach(b => b.classList.remove('active'));
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.classList.add('active');
  const bni = document.getElementById(`bni-${page}`);
  if (bni) bni.classList.add('active');
  if (page === 'feed') loadFeed();
  if (page === 'challenges') loadChallenges();
  if (page === 'profile') loadMyProfile();
  if (page === 'explore') { document.getElementById('explore-list').innerHTML = `<div class="explore-empty"><i class="fa-solid fa-users"></i><p>Search for creators in your niche</p></div>`; }
  if (page === 'notifications') loadNotifications();
  window.scrollTo(0,0);
}

function goBack() {
  if (prevPage) showPage(prevPage);
  else showPage('feed');
}

// ═══════════════════════════════════
// FEED
// ═══════════════════════════════════
function filterFeed(el) {
  document.querySelectorAll('.nr-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  currentFeedNiche = el.dataset.niche;
  loadFeed();
}

async function loadFeed() {
  const list = document.getElementById('feed-list');
  list.innerHTML = `<div class="feed-loading"><div class="spin"></div><span>Loading your niche...</span></div>`;
  if (feedUnsubscribe) feedUnsubscribe();
  let query = db.collection('posts').orderBy('createdAt','desc').limit(30);
  if (currentFeedNiche !== 'all') query = query.where('niche','==',currentFeedNiche);
  feedUnsubscribe = query.onSnapshot(snap => {
    if (snap.empty) {
      list.innerHTML = `<div class="feed-empty"><i class="fa-solid fa-wind"></i><h3>Nothing here yet</h3><p>Be the first to post in this niche or switch to All.</p><button class="btn-primary" onclick="showPage('post')"><i class="fa-solid fa-plus"></i> Create First Post</button></div>`;
      return;
    }
    list.innerHTML = '';
    snap.forEach(doc => list.appendChild(buildPostCard(doc.id, doc.data())));
  }, () => {
    list.innerHTML = `<div class="feed-empty"><i class="fa-solid fa-wifi"></i><h3>Connection issue</h3><p>Check your internet and try again.</p></div>`;
  });
}

function buildPostCard(postId, data, compact=false) {
  const isOwn = data.authorId === currentUser.uid;
  const timeStr = data.createdAt ? timeAgo(data.createdAt.toDate()) : 'just now';
  const initials = data.authorName ? data.authorName.charAt(0).toUpperCase() : '?';
  const div = document.createElement('div');
  div.className = 'post-card';
  div.dataset.postId = postId;
  let mediaHTML = '';
  if (data.mediaURL) {
    if (data.mediaType === 'video') {
      mediaHTML = `<div class="pc-media-wrap"><video class="pc-media" src="${data.mediaURL}" playsinline onclick="this.paused?this.play():this.pause()"></video><div class="pc-play"><i class="fa-solid fa-play"></i></div></div>`;
    } else {
      mediaHTML = `<div class="pc-media-wrap"><img class="pc-media" src="${data.mediaURL}" loading="lazy"/></div>`;
    }
  }
  const caption = data.caption ? data.caption.replace(/#(\w+)/g,'<span class="htag">#$1</span>') : '';
  div.innerHTML = `
    <div class="pc-header">
      <div class="pc-av" onclick="viewProfile('${data.authorId}')">${initials}</div>
      <div class="pc-info" onclick="viewProfile('${data.authorId}')">
        <div class="pc-name">${esc(data.authorName)}</div>
        <div class="pc-meta">
          <span class="pc-user">${esc(data.authorUsername).split('@')[0]}<span>@${esc(data.authorNiche)}</span></span>
          <span class="pc-niche">${esc(data.niche)}</span>
          <span class="pc-time">${timeStr}</span>
        </div>
      </div>
    </div>
    ${mediaHTML}
    <div class="pc-caption" onclick="viewPost('${postId}')">${caption}</div>
    <div class="pc-actions">
      <button class="pca like-btn" id="like-${postId}" onclick="handleLike('${postId}','${data.authorId}',this)">
        <i class="fa-regular fa-heart"></i><span>${fmtNum(data.likes||0)}</span>
      </button>
      <button class="pca" onclick="viewPost('${postId}')">
        <i class="fa-regular fa-comment-dots"></i><span>${fmtNum(data.comments||0)}</span>
      </button>
      <button class="pca gifted" onclick="openGiftModal('${postId}','${data.authorId}','${esc(data.authorUsername)}')">
        <i class="fa-solid fa-coins"></i><span>${fmtNum(data.giftClicks||0)}</span>
      </button>
      ${!isOwn ? `<button class="pca challenge-btn" onclick="openChallengeModal('${data.authorId}','${esc(data.authorUsername)}')">
        <i class="fa-solid fa-shield-halved"></i><span>Challenge</span>
      </button>` : `<button class="pca" onclick="viewPost('${postId}')"><i class="fa-solid fa-share-nodes"></i><span>Share</span></button>`}
    </div>`;
  checkLiked(postId, div.querySelector('.like-btn'));
  return div;
}

async function checkLiked(postId, btn) {
  const snap = await db.collection('likes').doc(`${currentUser.uid}_${postId}`).get();
  if (snap.exists) { btn.classList.add('liked'); btn.querySelector('i').className = 'fa-solid fa-heart'; }
}

async function handleLike(postId, authorId, btn) {
  const likeId = `${currentUser.uid}_${postId}`;
  const likeRef = db.collection('likes').doc(likeId);
  const postRef = db.collection('posts').doc(postId);
  const snap = await likeRef.get();
  if (snap.exists) {
    await likeRef.delete();
    await postRef.update({ likes: firebase.firestore.FieldValue.increment(-1) });
    btn.classList.remove('liked');
    btn.querySelector('i').className = 'fa-regular fa-heart';
    const sp = btn.querySelector('span');
    sp.textContent = fmtNum(Math.max(0, parseInt(sp.textContent.replace(/[^0-9]/g,'')) - 1));
  } else {
    await likeRef.set({ postId, userId: currentUser.uid, authorId, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    await postRef.update({ likes: firebase.firestore.FieldValue.increment(1) });
    btn.classList.add('liked');
    btn.querySelector('i').className = 'fa-solid fa-heart';
    const sp = btn.querySelector('span');
    sp.textContent = fmtNum(parseInt(sp.textContent.replace(/[^0-9]/g,'')) + 1);
    if (authorId !== currentUser.uid) {
      await addNotification(authorId, 'like', `${currentUserData.username} liked your post.`);
    }
  }
}

// ═══════════════════════════════════
// GIFT
// ═══════════════════════════════════
function openGiftModal(postId, authorId, authorUsername) {
  giftTargetPost = { postId, authorId, authorUsername };
  selectedGiftAmount = 0;
  document.querySelectorAll('.gift-opt').forEach(o => o.classList.remove('selected'));
  document.getElementById('gift-creator-name').innerHTML = `Gifting <span>${authorUsername}</span>`;
  document.getElementById('gift-modal').classList.remove('hidden');
}

function selectGift(el, amount) {
  document.querySelectorAll('.gift-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  selectedGiftAmount = amount;
}

async function confirmGift() {
  if (!selectedGiftAmount) { showToast('Select a gift amount first.'); return; }
  if (!giftTargetPost) return;
  closeModal('gift-modal');
  await db.collection('posts').doc(giftTargetPost.postId).update({
    giftClicks: firebase.firestore.FieldValue.increment(1)
  });
  await db.collection('users').doc(giftTargetPost.authorId).update({
    giftClicksReceived: firebase.firestore.FieldValue.increment(1)
  });
  await db.collection('giftClicks').add({
    postId: giftTargetPost.postId, authorId: giftTargetPost.authorId,
    clickerUid: currentUser.uid, clickerUsername: currentUserData.username,
    amount: selectedGiftAmount, createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  if (giftTargetPost.authorId !== currentUser.uid) {
    await addNotification(giftTargetPost.authorId, 'gift',
      `${currentUserData.username} would gift you ${selectedGiftAmount} coins — real gifting coming in V1!`);
  }
  showToast(`🪙 Gift intent sent! Real Mobile Money gifting launches in V1.`);
  giftTargetPost = null;
  selectedGiftAmount = 0;
}

// ═══════════════════════════════════
// CHALLENGES
// ═══════════════════════════════════
function setChalTab(el, tab) {
  document.querySelectorAll('.ctab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  currentChalTab = tab;
  loadChallenges();
}

async function loadChallenges() {
  const list = document.getElementById('chal-list');
  list.innerHTML = `<div class="feed-loading"><div class="spin"></div><span>Loading challenges...</span></div>`;
  if (chalUnsubscribe) chalUnsubscribe();
  let query;
  if (currentChalTab === 'incoming') {
    query = db.collection('challengeRequests').where('toUid','==',currentUser.uid).orderBy('createdAt','desc');
  } else if (currentChalTab === 'sent') {
    query = db.collection('challengeRequests').where('fromUid','==',currentUser.uid).orderBy('createdAt','desc');
  } else {
    query = db.collection('challengeRequests')
      .where('status','==','accepted')
      .where('toUid','==',currentUser.uid)
      .orderBy('createdAt','desc');
  }
  chalUnsubscribe = query.onSnapshot(snap => {
    if (snap.empty) {
      list.innerHTML = `<div class="chal-empty"><i class="fa-solid fa-shield-halved"></i><p>${currentChalTab === 'incoming' ? 'No incoming challenges yet. Keep posting to attract challengers.' : currentChalTab === 'sent' ? 'No challenges sent yet. Go explore creators and challenge them!' : 'No active challenges yet.'}</p></div>`;
      return;
    }
    list.innerHTML = '';
    snap.forEach(doc => list.appendChild(buildChalCard(doc.id, doc.data())));
  });
}

function buildChalCard(id, data) {
  const isIncoming = data.toUid === currentUser.uid;
  const timeStr = data.createdAt ? timeAgo(data.createdAt.toDate()) : 'just now';
  const div = document.createElement('div');
  div.className = 'chal-card';
  div.innerHTML = `
    <div class="cc-top">
      <div class="cc-type"><i class="fa-solid fa-shield-halved"></i> 1V1 CHALLENGE</div>
      <div class="cc-status ${isIncoming ? 'incoming' : 'sent'}">${isIncoming ? '● Incoming' : data.status === 'accepted' ? '✓ Accepted' : '● Sent'}</div>
    </div>
    <div class="cc-from">${isIncoming ? `From: <span>${esc(data.fromUsername)}</span>` : `To: <span>${esc(data.toUsername)}</span>`}</div>
    <div class="cc-msg">"${esc(data.message)}"</div>
    ${data.fromPostCaption ? `<div class="cc-post-preview"><p>${esc(data.fromPostCaption)}</p><small>Their challenge post · ${timeStr}</small></div>` : ''}
    <div class="cc-coming"><i class="fa-solid fa-info-circle"></i>Live 1v1 voting launches in V1. ${isIncoming && data.status === 'pending' ? 'Accept to confirm — your fans will vote on who wins.' : 'Your fans will vote on who wins when V1 launches.'}</div>
    ${isIncoming && data.status === 'pending' ? `
    <div class="cc-actions">
      <button class="cc-accept" onclick="acceptChallenge('${id}','${data.fromUid}','${esc(data.fromUsername)}')">Accept Challenge</button>
      <button class="cc-decline" onclick="declineChallenge('${id}')">Decline</button>
    </div>` : ''}`;
  return div;
}

function showCreateChallenge() {
  document.getElementById('challenge-search').value = '';
  document.getElementById('challenge-search-results').innerHTML = '';
  document.getElementById('create-challenge-modal').classList.remove('hidden');
}

async function searchChallengee(val) {
  const res = document.getElementById('challenge-search-results');
  if (val.length < 2) { res.innerHTML = ''; return; }
  const snap = await db.collection('users').orderBy('username').startAt(val).endAt(val+'\uf8ff').limit(8).get();
  if (snap.empty) { res.innerHTML = `<div style="padding:12px;font-size:12px;color:var(--mu);text-align:center;">No creators found</div>`; return; }
  res.innerHTML = '';
  snap.forEach(doc => {
    const d = doc.data();
    if (d.uid === currentUser.uid) return;
    const item = document.createElement('div');
    item.className = 'sr-item';
    item.innerHTML = `<div class="sr-av">${d.displayName.charAt(0).toUpperCase()}</div><div><div class="sr-name">${esc(d.displayName)}</div><div class="sr-user">${esc(d.username.split('@')[0])}<span>@${esc(d.niche)}</span></div></div>`;
    item.onclick = () => {
      closeModal('create-challenge-modal');
      openChallengeModal(d.uid, d.username);
    };
    res.appendChild(item);
  });
}

async function openChallengeModal(toUid, toUsername) {
  challengeTarget = { toUid, toUsername };
  selectedChallengePost = null;
  document.getElementById('chal-to-label').innerHTML = `Challenging <span>${toUsername}</span>`;
  document.getElementById('chal-message').value = '';
  const picker = document.getElementById('my-posts-picker');
  picker.innerHTML = `<div class="feed-loading"><div class="spin"></div><span>Loading your posts...</span></div>`;
  document.getElementById('challenge-modal').classList.remove('hidden');
  const snap = await db.collection('posts').where('authorId','==',currentUser.uid).orderBy('createdAt','desc').limit(10).get();
  if (snap.empty) {
    picker.innerHTML = `<div style="font-size:12px;color:var(--mu);padding:10px 0;">You have no posts yet. Create a post first then challenge someone.</div>`;
    return;
  }
  picker.innerHTML = '';
  snap.forEach(doc => {
    const d = doc.data();
    const item = document.createElement('div');
    item.className = 'post-pick-item';
    item.dataset.postId = doc.id;
    item.innerHTML = `<div style="flex:1;min-width:0;"><p>${esc(d.caption || 'No caption')}</p><small>${d.niche} · ${d.createdAt ? timeAgo(d.createdAt.toDate()) : 'recently'}</small></div><i class="fa-regular fa-circle-check" style="font-size:16px;color:var(--mu2);flex-shrink:0;"></i>`;
    item.onclick = () => {
      document.querySelectorAll('.post-pick-item').forEach(p => { p.classList.remove('selected'); p.querySelector('i').className = 'fa-regular fa-circle-check'; p.querySelector('i').style.color = 'var(--mu2)'; });
      item.classList.add('selected');
      item.querySelector('i').className = 'fa-solid fa-circle-check';
      item.querySelector('i').style.color = 'var(--or)';
      selectedChallengePost = { postId: doc.id, caption: d.caption };
    };
    picker.appendChild(item);
  });
}

async function confirmChallenge() {
  if (!selectedChallengePost) { showToast('Pick one of your posts as your challenge entry.'); return; }
  const msg = document.getElementById('chal-message').value.trim();
  if (!msg) { showToast('Write a challenge message.'); return; }
  if (!challengeTarget) return;
  closeModal('challenge-modal');
  await db.collection('challengeRequests').add({
    fromUid: currentUser.uid, fromUsername: currentUserData.username,
    fromName: currentUserData.displayName, fromPostId: selectedChallengePost.postId,
    fromPostCaption: selectedChallengePost.caption,
    toUid: challengeTarget.toUid, toUsername: challengeTarget.toUsername,
    message: msg, status: 'pending',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await db.collection('users').doc(challengeTarget.toUid).update({
    challengeRequestsReceived: firebase.firestore.FieldValue.increment(1)
  });
  await addNotification(challengeTarget.toUid, 'challenge',
    `${currentUserData.username} challenged you to a 1v1! Accept in your challenges tab.`);
  showToast(`⚔️ Challenge sent to ${challengeTarget.toUsername}!`);
  challengeTarget = null;
  selectedChallengePost = null;
}

async function acceptChallenge(chalId, fromUid, fromUsername) {
  await db.collection('challengeRequests').doc(chalId).update({ status: 'accepted' });
  await addNotification(fromUid, 'challenge', `${currentUserData.username} accepted your challenge! Live voting comes in V1.`);
  showToast(`✓ Challenge accepted! Live voting launches in V1.`);
  loadChallenges();
}

async function declineChallenge(chalId) {
  await db.collection('challengeRequests').doc(chalId).update({ status: 'declined' });
  showToast('Challenge declined.');
  loadChallenges();
}

// ═══════════════════════════════════
// POST
// ═══════════════════════════════════
function setupPostForm() {
  const sel = document.getElementById('post-niche');
  sel.innerHTML = NICHES.map(n => `<option value="${n}" ${n === currentUserData.niche ? 'selected' : ''}>${n.charAt(0).toUpperCase()+n.slice(1)}</option>`).join('');
  const pi = document.getElementById('post-identity');
  pi.innerHTML = `<div class="pi-av">${currentUserData.displayName.charAt(0).toUpperCase()}</div><div><div class="pi-name">${esc(currentUserData.displayName)}</div><div class="pi-user">${esc(currentUserData.username)}</div></div>`;
  const cap = document.getElementById('post-caption');
  cap.addEventListener('input', () => { document.getElementById('char-count').textContent = `${cap.value.length}/300`; });
}

function previewMedia(input) {
  const file = input.files[0];
  if (!file) return;
  mediaFile = file;
  const prev = document.getElementById('media-preview');
  const reader = new FileReader();
  reader.onload = e => {
    const isVideo = file.type.startsWith('video/');
    prev.innerHTML = `${isVideo ? `<video src="${e.target.result}" controls style="width:100%;max-height:280px;object-fit:cover;display:block;border-radius:8px;"></video>` : `<img src="${e.target.result}" style="width:100%;max-height:280px;object-fit:cover;display:block;border-radius:8px;"/>`}<button class="remove-media" onclick="removeMedia()"><i class="fa-solid fa-xmark"></i></button>`;
    prev.classList.remove('hidden');
    document.getElementById('media-upload').classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

function removeMedia() {
  mediaFile = null;
  document.getElementById('media-preview').classList.add('hidden');
  document.getElementById('media-preview').innerHTML = '';
  document.getElementById('media-upload').classList.remove('hidden');
  document.getElementById('media-input').value = '';
}

/*async function handlePost() {
  const caption = document.getElementById('post-caption').value.trim();
  const niche = document.getElementById('post-niche').value;
  const err = document.getElementById('post-error');
  err.classList.add('hidden');
  if (!caption && !mediaFile) { showError(err, 'Write a caption or add media.'); return; }
  const btn = document.querySelector('#page-post .btn-primary');
  btn.innerHTML = '<div class="spin" style="width:18px;height:18px;border-color:rgba(255,255,255,0.3);border-top-color:#fff;"></div> Posting...';
  btn.disabled = true;
  try {
    let mediaURL = null; let mediaType = null;
    if (mediaFile) {
      const ref = storage.ref(`posts/${currentUser.uid}/${Date.now()}_${mediaFile.name}`);
      await ref.put(mediaFile);
      mediaURL = await ref.getDownloadURL();
      mediaType = mediaFile.type.startsWith('video/') ? 'video' : 'image';
    }
    await db.collection('posts').add({
      authorId: currentUser.uid, authorName: currentUserData.displayName,
      authorUsername: currentUserData.username, authorNiche: currentUserData.niche,
      caption, niche, mediaURL, mediaType, likes: 0, comments: 0,
      giftClicks: 0, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('users').doc(currentUser.uid).update({
      postCount: firebase.firestore.FieldValue.increment(1)
    });
    currentUserData.postCount = (currentUserData.postCount || 0) + 1;
    document.getElementById('post-caption').value = '';
    document.getElementById('char-count').textContent = '0/300';
    removeMedia();
    showToast('🔥 Post published! Your craft is out there.');
    showPage('feed');
  } catch(e) {
    showError(err, 'Upload failed. Check your connection.');
  }
  btn.innerHTML = '<span>Publish Post</span><i class="fa-solid fa-paper-plane"></i>';
  btn.disabled = false;
}*/

async function handlePost() {
  const caption = document.getElementById('post-caption').value.trim();
  const niche = document.getElementById('post-niche').value;
  const err = document.getElementById('post-error');
  err.classList.add('hidden');
  if (!caption && !mediaFile) { 
    showError(err, 'Write a caption or add media.'); 
    return; 
  }
  const btn = document.querySelector('#page-post .btn-primary');
  btn.innerHTML = '<div class="spin" style="width:18px;height:18px;border-color:rgba(255,255,255,0.3);border-top-color:#fff;"></div> Posting...';
  btn.disabled = true;
  try {
    let mediaURL = null;
    let mediaType = null;
    if (mediaFile) {
      showToast('Uploading media...');
      const formData = new FormData();
      formData.append('file', mediaFile);
      formData.append('upload_preset', CLOUDINARY_PRESET);
      formData.append('folder', `mistream/${currentUser.uid}`);
      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/auto/upload`,
        { method: 'POST', body: formData }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      mediaURL = data.secure_url;
      mediaType = mediaFile.type.startsWith('video/') ? 'video' : 'image';
    }
    await db.collection('posts').add({
      authorId: currentUser.uid,
      authorName: currentUserData.displayName,
      authorUsername: currentUserData.username,
      authorNiche: currentUserData.niche,
      caption, niche, mediaURL, mediaType,
      likes: 0, comments: 0, giftClicks: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('users').doc(currentUser.uid).update({
      postCount: firebase.firestore.FieldValue.increment(1)
    });
    currentUserData.postCount = (currentUserData.postCount || 0) + 1;
    document.getElementById('post-caption').value = '';
    document.getElementById('char-count').textContent = '0/300';
    removeMedia();
    showToast('🔥 Post published!');
    showPage('feed');
  } catch(e) {
    showError(err, `Failed to post: ${e.message}`);
  }
  btn.innerHTML = '<span>Publish Post</span><i class="fa-solid fa-paper-plane"></i>';
  btn.disabled = false;
}

// ═══════════════════════════════════
// EXPLORE
// ═══════════════════════════════════
let searchTimeout = null;
async function handleSearch(val) {
  clearTimeout(searchTimeout);
  const list = document.getElementById('explore-list');
  if (!val || val.length < 2) {
    list.innerHTML = `<div class="explore-empty"><i class="fa-solid fa-users"></i><p>Search for creators in your niche</p></div>`;
    return;
  }
  searchTimeout = setTimeout(async () => {
    list.innerHTML = `<div class="feed-loading"><div class="spin"></div><span>Searching...</span></div>`;
    const v = val.toLowerCase();
    const snap = await db.collection('users').orderBy('username').startAt(v).endAt(v+'\uf8ff').limit(20).get();
    if (snap.empty) {
      list.innerHTML = `<div class="explore-empty"><i class="fa-solid fa-search"></i><p>No creators found for "${val}"</p></div>`;
      return;
    }
    list.innerHTML = '';
    snap.forEach(doc => {
      const d = doc.data();
      const card = document.createElement('div');
      card.className = 'creator-card';
      card.innerHTML = `<div class="cr-av">${d.displayName.charAt(0).toUpperCase()}</div><div class="cr-info"><div class="cr-name">${esc(d.displayName)}</div><div class="cr-user">${esc(d.username.split('@')[0])}<span>@${esc(d.niche)}</span></div></div><div class="cr-niche">${esc(d.niche)}</div><i class="fa-solid fa-chevron-right cr-arr"></i>`;
      card.onclick = () => viewProfile(d.uid);
      list.appendChild(card);
    });
  }, 400);
}

// ═══════════════════════════════════
// PROFILE
// ═══════════════════════════════════
async function loadMyProfile() {
  const snap = await db.collection('users').doc(currentUser.uid).get();
  currentUserData = snap.data();
  renderProfile(currentUserData, true);
}

async function viewProfile(uid) {
  prevPage = currentPage;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-viewprofile').classList.add('active');
  const content = document.getElementById('viewprofile-content');
  content.innerHTML = `<div class="feed-loading" style="margin-top:40px;"><div class="spin"></div><span>Loading profile...</span></div>`;
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) { content.innerHTML = '<div class="feed-empty"><p>Profile not found.</p></div>'; return; }
  renderProfile(snap.data(), uid === currentUser.uid, content);
  currentPage = 'viewprofile';
}

async function renderProfile(data, isOwn, container=null) {
  const el = container || document.getElementById('profile-content');
  const postsSnap = await db.collection('posts').where('authorId','==',data.uid).orderBy('createdAt','desc').limit(12).get();
  const postCount = postsSnap.size;
  let postsGrid = '';
  postsSnap.forEach(doc => {
    const d = doc.data();
    postsGrid += `<div class="pg-item" onclick="viewPost('${doc.id}')">`;
    if (d.mediaURL) {
      if (d.mediaType === 'video') postsGrid += `<video src="${d.mediaURL}" style="width:100%;height:100%;object-fit:cover;"></video>`;
      else postsGrid += `<img src="${d.mediaURL}" style="width:100%;height:100%;object-fit:cover;" loading="lazy"/>`;
    } else {
      postsGrid += `<div class="pg-placeholder">${esc(d.caption||'').substring(0,60)}</div>`;
    }
    postsGrid += `<div class="pg-item-ov"><span><i class="fa-solid fa-coins"></i> ${d.giftClicks||0}</span></div></div>`;
  });
  el.innerHTML = `
    <div class="profile-cover">
      <div class="profile-cover-glow"></div>
      <div class="profile-cover-grid"></div>
      <div class="profile-av-wrap">
        <div class="profile-av">${data.displayName.charAt(0).toUpperCase()}<div class="profile-av-ring"></div></div>
      </div>
    </div>
    <div class="profile-body">
      <div class="profile-name">${esc(data.displayName)}</div>
      <div class="profile-urow">
        <span class="profile-user">${esc(data.username.split('@')[0])}<span>@${esc(data.niche)}</span></span>
        <span class="profile-niche-badge">${esc(data.niche)}</span>
      </div>
      ${data.bio ? `<div class="profile-bio">${esc(data.bio)}</div>` : ''}
      <div class="profile-stats">
        <div class="pst"><div class="pst-v">${fmtNum(postCount)}</div><div class="pst-l">Posts</div></div>
        <div class="pst"><div class="pst-v">${fmtNum(data.followers||0)}</div><div class="pst-l">Followers</div></div>
        <div class="pst"><div class="pst-v or">${fmtNum(data.challengeRequestsReceived||0)}</div><div class="pst-l">Challenges</div></div>
        <div class="pst"><div class="pst-v go">${fmtNum(data.giftClicksReceived||0)}</div><div class="pst-l">Gifts</div></div>
      </div>
      ${!isOwn ? `
      <div class="profile-actions">
        <button class="pa-follow" id="follow-btn-${data.uid}" onclick="handleFollow('${data.uid}',this)">Follow</button>
        <button class="pa-challenge-profile" onclick="openChallengeModal('${data.uid}','${esc(data.username)}')">
          <i class="fa-solid fa-shield-halved"></i> Challenge
        </button>
      </div>` : `
      <div class="profile-actions">
        <button class="pa-follow" onclick="showPage('post')"><i class="fa-solid fa-plus"></i> New Post</button>
      </div>`}
      <div class="profile-divider"></div>
      <div class="profile-section-title">Gift Intent Received</div>
      <div class="gift-intent-block">
        <div class="gib-ico"><i class="fa-solid fa-coins"></i></div>
        <div>
          <div class="gib-v">${fmtNum(data.giftClicksReceived||0)}</div>
          <div class="gib-l">Fans would have gifted this creator · Mobile Money gifting in V1</div>
        </div>
      </div>
      <div class="profile-section-title">Posts</div>
      <div class="posts-grid">${postsGrid || '<div style="grid-column:1/-1;padding:30px;text-align:center;color:var(--mu);font-size:13px;">No posts yet.</div>'}</div>
    </div>`;
  if (!isOwn) checkFollowing(data.uid, document.getElementById(`follow-btn-${data.uid}`));
}

async function checkFollowing(uid, btn) {
  if (!btn) return;
  const snap = await db.collection('follows').doc(`${currentUser.uid}_${uid}`).get();
  if (snap.exists) { btn.textContent = 'Following'; btn.classList.add('following'); }
}

async function handleFollow(uid, btn) {
  const followId = `${currentUser.uid}_${uid}`;
  const ref = db.collection('follows').doc(followId);
  const snap = await ref.get();
  if (snap.exists) {
    await ref.delete();
    await db.collection('users').doc(uid).update({ followers: firebase.firestore.FieldValue.increment(-1) });
    await db.collection('users').doc(currentUser.uid).update({ following: firebase.firestore.FieldValue.increment(-1) });
    btn.textContent = 'Follow'; btn.classList.remove('following');
  } else {
    await ref.set({ followerId: currentUser.uid, followingId: uid, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
    await db.collection('users').doc(uid).update({ followers: firebase.firestore.FieldValue.increment(1) });
    await db.collection('users').doc(currentUser.uid).update({ following: firebase.firestore.FieldValue.increment(1) });
    btn.textContent = 'Following'; btn.classList.add('following');
    await addNotification(uid, 'like', `${currentUserData.username} followed you.`);
  }
}

// ═══════════════════════════════════
// VIEW POST
// ═══════════════════════════════════
async function viewPost(postId) {
  prevPage = currentPage;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-viewpost').classList.add('active');
  currentPage = 'viewpost';
  const content = document.getElementById('viewpost-content');
  content.innerHTML = `<div class="feed-loading" style="margin-top:40px;"><div class="spin"></div></div>`;
  const snap = await db.collection('posts').doc(postId).get();
  if (!snap.exists) { content.innerHTML = '<div class="feed-empty"><p>Post not found.</p></div>'; return; }
  content.appendChild(buildPostCard(postId, snap.data()));
}

// ═══════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════
async function addNotification(toUid, type, message) {
  await db.collection('notifications').add({
    toUid, type, message, read: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
}

function listenNotifications() {
  if (notifUnsubscribe) notifUnsubscribe();
  notifUnsubscribe = db.collection('notifications')
    .where('toUid','==',currentUser.uid)
    .where('read','==',false)
    .onSnapshot(snap => {
      const badge = document.getElementById('notif-badge');
      if (snap.size > 0) { badge.classList.remove('hidden'); badge.textContent = snap.size > 9 ? '9+' : snap.size; }
      else badge.classList.add('hidden');
    });
}

async function loadNotifications() {
  const list = document.getElementById('notif-list');
  list.innerHTML = `<div class="feed-loading"><div class="spin"></div><span>Loading...</span></div>`;
  const snap = await db.collection('notifications').where('toUid','==',currentUser.uid).orderBy('createdAt','desc').limit(30).get();
  if (snap.empty) {
    list.innerHTML = `<div class="notif-empty"><i class="fa-regular fa-bell"></i><p>No notifications yet. Keep creating!</p></div>`;
    return;
  }
  list.innerHTML = '';
  const batch = db.batch();
  snap.forEach(doc => {
    const d = doc.data();
    const typeMap = { gift: 'gift', challenge: 'challenge', like: 'like' };
    const iconMap = { gift: 'fa-solid fa-coins', challenge: 'fa-solid fa-shield-halved', like: 'fa-solid fa-heart' };
    const item = document.createElement('div');
    item.className = `notif-item ${d.read ? '' : 'unread'}`;
    item.innerHTML = `<div class="ni-ico ${typeMap[d.type]||'like'}"><i class="${iconMap[d.type]||'fa-solid fa-bell'}"></i></div><div class="ni-text"><p>${esc(d.message)}</p></div><div class="ni-time">${d.createdAt ? timeAgo(d.createdAt.toDate()) : 'now'}</div>`;
    list.appendChild(item);
    if (!d.read) batch.update(doc.ref, { read: true });
  });
  await batch.commit();
  document.getElementById('notif-badge').classList.add('hidden');
}

// ═══════════════════════════════════
// MODALS & UI
// ═══════════════════════════════════
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function showToast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ═══════════════════════════════════
// UTILS
// ═══════════════════════════════════
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtNum(n) {
  n = parseInt(n)||0;
  if (n >= 1000000) return (n/1000000).toFixed(1)+'M';
  if (n >= 1000) return (n/1000).toFixed(1)+'K';
  return String(n);
}
function timeAgo(date) {
  const s = Math.floor((Date.now()-date)/1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  if (s < 604800) return `${Math.floor(s/86400)}d ago`;
  return date.toLocaleDateString();
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.add('hidden'); });
});
