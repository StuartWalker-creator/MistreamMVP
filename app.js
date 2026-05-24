// ═══════════════════════════════════════════
// FIREBASE CONFIG
// ═══════════════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyCHBo_6-GZi4M7p77-Tk8W32i24KuD-tqg",
  authDomain: "bodaboda-9a325.firebaseapp.com",
  projectId: "bodaboda-9a325",
  storageBucket: "bodaboda-9a325.firebasestorage.app",
  messagingSenderId: "860902193571",
  appId: "1:860902193571:web:e70a25b2c967e3c7570216"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ═══════════════════════════════════════════
// CLOUDINARY
// ═══════════════════════════════════════════
const CLD_CLOUD = 'dvdshonhc';
const CLD_PRESET = 'mistream_uploads';

async function uploadToCloudinary(file, folder) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLD_PRESET);
  fd.append('folder', `mistream/${folder}`);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLD_CLOUD}/auto/upload`, { method: 'POST', body: fd });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return { url: data.secure_url, type: file.type.startsWith('video/') ? 'video' : 'image' };
}

// ═══════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════
const NICHES = ['comedy','trading','music','fashion','football','fitness','travel','gaming','food','art','dance','business'];
const NICHE_ICONS = { comedy:'fa-masks-theater', trading:'fa-chart-line', music:'fa-music', fashion:'fa-shirt', football:'fa-futbol', fitness:'fa-dumbbell', travel:'fa-plane', gaming:'fa-gamepad', food:'fa-utensils', art:'fa-palette', dance:'fa-person-dancing', business:'fa-briefcase' };
const NICHE_EMOJIS = { comedy:'🎭', trading:'📈', music:'🎵', fashion:'👗', football:'⚽', fitness:'💪', travel:'✈️', gaming:'🎮', food:'🍽️', art:'🎨', dance:'💃', business:'💼' };
const BG_CLASSES = ['bg1','bg2','bg3','bg4'];
const LEVELS = [
  { name:'Rookie', min:0, max:100 },
  { name:'Pro', min:100, max:300 },
  { name:'Expert', min:300, max:700 },
  { name:'Elite', min:700, max:1500 },
  { name:'Master', min:1500, max:3000 },
  { name:'Ultra', min:3000, max:Infinity }
];

function getLevel(user) {
  const score = (user.postCount||0)*10 + (user.challengeWins||0)*50 + (user.giftClicksReceived||0)*3 + (user.totalVotesReceived||0)*2;
  const level = LEVELS.slice().reverse().find(l => score >= l.min) || LEVELS[0];
  const next = LEVELS[LEVELS.indexOf(level)+1];
  const pct = next ? Math.min(100, ((score - level.min)/(next.min - level.min))*100) : 100;
  return { ...level, score, next, pct };
}

// ═══════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════
let CU = null; // current user (firebase auth)
let CUD = null; // current user data (firestore)
let currentScreen = 'feed';
let prevScreen = null;
let feedNiche = 'all';
let chalTab = '1v1';
let isMuted = true;
let currentVideo = null;
let feedObserver = null;
let feedUnsub = null;
let chalUnsub = null;
let notifUnsub = null;
let commentsUnsub = null;
let currentCommentTarget = null; // {collection, docId}
let giftTarget = null;
let selectedNiche = '';
let regPhotoFile = null;
let postMediaFile = null;
let c1v1MediaFile = null;
let ccMediaFile = null;
let joinMediaFile = null;
let selectedExistingPost = null;
let selectedJoinPost = null;
let chalTarget = null; // {uid, username, photoURL, displayName}
let joinChalTarget = null; // challenge doc
let progressInterval = null;

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
window.addEventListener('load', () => {
  setTimeout(() => {
    document.getElementById('splash').classList.add('hidden');
    auth.onAuthStateChanged(async user => {
      if (user) {
        const snap = await db.collection('users').doc(user.uid).get();
        if (snap.exists) {
          CU = user;
          CUD = snap.data();
          initApp();
        } else {
          showAuthScreen();
          sv('v-register');
        }
      } else {
        showAuthScreen();
        sv('v-login');
      }
    });
  }, 2200);
});

function showAuthScreen() {
  document.getElementById('auth').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function initApp() {
  document.getElementById('auth').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  // Update topbar avatar
  //updateTopAvatar();
  // Populate selects
  populateSelects();
  // Update identity cards
  updateIdentityCards();
  // Track session
  trackSession();
  // Listen notifications
  listenNotifs();
  // Show feed
  showScreen('feed');
}
//firebase.auth().signOut()
function updateTopAvatar() {
  const av = document.getElementById('top-av');
  if (CUD.photoURL) {
    av.innerHTML = `<img src="${CUD.photoURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"/>`;
  } else {
    av.textContent = CUD.displayName.charAt(0).toUpperCase();
  }
}

function populateSelects() {
  const postNiche = document.getElementById('post-niche');
  const ccNiche = document.getElementById('cc-niche');
  if (postNiche) postNiche.innerHTML = NICHES.map(n => `<option value="${n}" ${n===CUD.niche?'selected':''}>${cap(n)}</option>`).join('');
  if (ccNiche) ccNiche.innerHTML = NICHES.map(n => `<option value="${n}" ${n===CUD.niche?'selected':''}>${cap(n)}</option>`).join('');
}

function updateIdentityCards() {
  const lv = getLevel(CUD);
  const identityHTML = `
    <div class="mid-av">${CUD.photoURL ? `<img src="${CUD.photoURL}"/>` : CUD.displayName.charAt(0).toUpperCase()}</div>
    <div class="mid-info">
      <div class="nm">${esc(CUD.displayName)}</div>
      <div class="un">${esc(CUD.username)}</div>
      <div class="lv">${lv.name}</div>
    </div>`;
  ['my-identity','post-identity'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = identityHTML;
  });
}

function trackSession() {
  db.collection('users').doc(CU.uid).update({
    lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
    sessionCount: firebase.firestore.FieldValue.increment(1)
  }).catch(() => {});
}

// ═══════════════════════════════════════════
// AUTH VIEWS
// ═══════════════════════════════════════════
function sv(id) {
  document.querySelectorAll('.auth-view').forEach(v => v.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function pickNiche(el) {
  document.querySelectorAll('.no').forEach(o => o.classList.remove('sel'));
  el.classList.add('sel');
  selectedNiche = el.dataset.n;
  updatePreview();
}

function updatePreview() {
  const name = document.getElementById('r-name').value.trim().toLowerCase().replace(/\s+/g,'');
  const prev = document.getElementById('upreview');
  const upn = document.getElementById('upn');
  if (name && selectedNiche) {
    prev.classList.remove('hidden');
    upn.textContent = `${name}@${selectedNiche}`;
  } else {
    prev.classList.add('hidden');
  }
}

function previewRegPhoto(input) {
  const file = input.files[0];
  if (!file) return;
  regPhotoFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('reg-photo-circle').innerHTML = `<img src="${e.target.result}"/>`;
  };
  reader.readAsDataURL(file);
}

async function doRegister() {
  const name = document.getElementById('r-name').value.trim();
  const email = document.getElementById('r-email').value.trim();
  const pass = document.getElementById('r-pass').value;
  const err = document.getElementById('r-err');
  err.classList.add('hidden');
  if (!name) { showErr(err,'Enter your name.'); return; }
  if (!selectedNiche) { showErr(err,'Pick your niche.'); return; }
  if (!email) { showErr(err,'Enter your email.'); return; }
  if (pass.length < 6) { showErr(err,'Password needs at least 6 characters.'); return; }
  const btn = document.getElementById('reg-btn');
  btn.innerHTML = '<div class="spin" style="width:18px;height:18px;margin:0 auto;"></div>';
  btn.disabled = true;
  try {
    const username = name.toLowerCase().replace(/\s+/g,'') + '@' + selectedNiche;
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    let photoURL = null;
    if (regPhotoFile) {
      showToast('Uploading photo...');
      const res = await uploadToCloudinary(regPhotoFile, `avatars/${cred.user.uid}`);
      photoURL = res.url;
    }
    await db.collection('users').doc(cred.user.uid).set({
      uid: cred.user.uid, displayName: name, username,
      niche: selectedNiche, email, photoURL, bio: '',
      giftClicksReceived: 0, challengeRequestsReceived: 0,
      challengeWins: 0, totalVotesReceived: 0,
      followers: 0, following: 0, postCount: 0, sessionCount: 0,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    showScreen('feed')
  } catch(e) {
    showErr(err, friendlyErr(e.code));
    btn.innerHTML = '<span>Claim My Identity</span><i class="fa-solid fa-arrow-right"></i>';
    btn.disabled = false;
  }
}

async function doLogin() {
  const email = document.getElementById('l-email').value.trim();
  const pass = document.getElementById('l-pass').value;
  const err = document.getElementById('l-err');
  err.classList.add('hidden');
  if (!email || !pass) { showErr(err,'Fill in all fields.'); return; }
  try {
    await auth.signInWithEmailAndPassword(email, pass);
    
    showScreen('feed')
  } catch(e) {
    showErr(err, friendlyErr(e.code));
  }
}

function showErr(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }
function friendlyErr(code) {
  const m = { 'auth/email-already-in-use':'Email already registered.','auth/invalid-email':'Invalid email.','auth/wrong-password':'Wrong password.','auth/user-not-found':'No account with that email.','auth/weak-password':'Password too short.','auth/too-many-requests':'Too many attempts. Try later.' };
  return m[code] || 'Something went wrong.';
}

// ═══════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════
function showScreen(name) {
  prevScreen = currentScreen;
  currentScreen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.bn').forEach(b => b.classList.remove('active'));
  const scr = document.getElementById(`scr-${name}`);
  if (scr) scr.classList.add('active');
  const bn = document.getElementById(`bn-${name}`);
  if (bn) bn.classList.add('active');
  // Screen specific init
  if (name === 'feed') initFeed();
  if (name === 'challenges') initChallenges();
  if (name === 'profile') initProfile(CU.uid, true);
  if (name === 'notifications') initNotifs();
  if (name === 'post') { updateIdentityCards(); populateSelects(); }
}

function goBack() {
  if (prevScreen) showScreen(prevScreen);
  else showScreen('feed');
}

// ═══════════════════════════════════════════
// FEED
// ═══════════════════════════════════════════
function setFeedNiche(el) {
  document.querySelectorAll('.nb').forEach(n => n.classList.remove('active'));
  el.classList.add('active');
  feedNiche = el.dataset.n;
  initFeed();
}

function initFeed() {
  const feed = document.getElementById('tk-feed');
  feed.innerHTML = `<div class="tk-post"><div class="feed-empty"><div class="spin" style="border-color:rgba(255,255,255,.2);border-top-color:var(--or);"></div><p>Loading...</p></div></div>`;
  if (feedUnsub) feedUnsub();
  if (feedObserver) feedObserver.disconnect();
  let q = db.collection('posts').orderBy('createdAt','desc').limit(20);
  if (feedNiche !== 'all') q = q.where('niche','==',feedNiche);
  feedUnsub = q.onSnapshot(snap => {
    if (snap.empty) {
      feed.innerHTML = `<div class="tk-post"><div class="feed-empty"><i class="fa-solid fa-wind"></i><h3>Nothing here yet</h3><p>Be the first to post in this niche.</p><button class="btn-or" onclick="showScreen('post')"><i class="fa-solid fa-plus"></i> Create First Post</button></div></div>`;
      return;
    }
    feed.innerHTML = '';
    snap.forEach((doc, i) => feed.appendChild(buildFeedPost(doc.id, doc.data(), i)));
    setupObserver();
  }, () => {
    feed.innerHTML = `<div class="tk-post"><div class="feed-empty"><i class="fa-solid fa-wifi"></i><h3>Connection issue</h3><p>Check your internet and try again.</p></div></div>`;
  });
  
  // Show mute hint once
if (!localStorage.getItem('ms_mute_hint')) {
  setTimeout(() => {
    showToast('🔊 Tap the speaker icon for sound');
    localStorage.setItem('ms_mute_hint', '1');
  }, 2500);
}
}

function buildFeedPost(postId, d, idx) {
  const isOwn = d.authorId === CU.uid;
  const init = (d.authorName||'?').charAt(0).toUpperCase();
  const niche = d.niche || d.authorNiche || 'comedy';
  const icon = NICHE_ICONS[niche] || 'fa-star';
  const emoji = NICHE_EMOJIS[niche] || '🎬';
  const caption = (d.caption||'').replace(/#(\w+)/g,'<span class="ht">#$1</span>');
  const div = document.createElement('div');
  div.className = 'tk-post';
  div.dataset.postId = postId;
  // Media
  let mediaHTML = '';
  if (d.mediaURL) {
    if (d.mediaType === 'video') {
      mediaHTML = `<video class="tk-video" src="${d.mediaURL}" loop playsinline muted preload="metadata" onclick="tapVideo(this,event)"></video>`;
    } else {
      mediaHTML = `<img class="tk-img" src="${d.mediaURL}" loading="lazy"/>`;
    }
  } else {
    const bgColors = ['linear-gradient(160deg,#0d0a04,#2a1508,#060608)','linear-gradient(160deg,#050a10,#091525,#060608)','linear-gradient(160deg,#0d0508,#1e0d14,#060608)','linear-gradient(160deg,#080d05,#141f08,#060608)'];
    mediaHTML = `<div class="tk-nobg" style="background:${bgColors[idx%4]}"><span class="em">${emoji}</span></div>`;
  }
  const avHTML = d.authorPhoto ? `<div class="tk-av" onclick="viewProfile('${d.authorId}')"><img src="${d.authorPhoto}"/></div>` : `<div class="tk-av" onclick="viewProfile('${d.authorId}')">${init}</div>`;
  div.innerHTML = `
    ${mediaHTML}
    <div class="tk-grad-t"></div>
    <div class="tk-grad-b"></div>
    <div class="tk-mute" onclick="toggleMute()"><i class="fa-solid ${isMuted?'fa-volume-xmark':'fa-volume-high'}"></i></div>
    <div class="tk-pause" id="pause-${postId}"><i class="fa-solid fa-pause"></i></div>
    <div class="tk-meta" id="meta-${postId}">
      ${avHTML}
      <div class="tk-meta-info">
        <div class="tk-name">${esc(d.authorName||'Creator')}</div>
        <div class="tk-urow">
          <span class="tk-user">${esc(d.authorUsername||'')}</span>
          <div class="tk-lvl"><i class="fa-solid fa-arrow-up"></i><span id="lvl-${postId}">...</span></div>
        </div>
      </div>
      ${!isOwn?`<button class="tk-follow-btn" id="fbt-${postId}" onclick="toggleFollow('${d.authorId}','${postId}',this)">Follow</button>`:''}
    </div>
    <div class="tk-acts">
      <div class="tk-act" onclick="toggleLike('${postId}','${d.authorId}',this)" id="like-act-${postId}">
        <div class="tk-ai" id="like-ai-${postId}"><i class="fa-regular fa-heart"></i></div>
        <span class="tk-ac" id="like-cnt-${postId}">${fmtN(d.likes||0)}</span>
      </div>
      <div class="tk-act" onclick="openComments('posts','${postId}')">
        <div class="tk-ai"><i class="fa-regular fa-comment-dots"></i></div>
        <span class="tk-ac">${fmtN(d.comments||0)}</span>
      </div>
      <div class="tk-act" onclick="openGiftModal('${postId}','${d.authorId}','${esc(d.authorUsername||d.authorName||'')}')">
        <div class="tk-ai gift-ai"><i class="fa-solid fa-coins"></i></div>
        <span class="tk-ac" id="gift-cnt-${postId}">${fmtN(d.giftClicks||0)}</span>
      </div>
      ${!isOwn?`<div class="tk-act" onclick="startC1v1('${d.authorId}','${esc(d.authorUsername||'')}','${esc(d.authorName||'')}','${d.authorPhoto||''}','${postId}')">
        <div class="tk-ai chal-ai"><i class="fa-solid fa-shield-halved"></i></div>
        <span class="tk-ac">1v1</span>
      </div>`:''}
    </div>
    <div class="tk-bottom">
      <div class="tk-niche-tag"><i class="fa-solid ${icon}"></i><span>${niche.toUpperCase()}</span></div>
      <div class="tk-caption">${caption}</div>
    </div>
    <div class="tk-prog"><div class="tk-prog-fill" id="prog-${postId}"></div></div>`;
  // Delayed meta reveal
  setTimeout(() => { const m = document.getElementById(`meta-${postId}`); if(m) m.classList.add('show'); }, 1800);
  // Load author level
  db.collection('users').doc(d.authorId).get().then(snap => {
    if (!snap.exists) return;
    const lv = getLevel(snap.data());
    const lvEl = document.getElementById(`lvl-${postId}`);
    if (lvEl) lvEl.textContent = lv.name.toUpperCase();
  });
  // Check liked
  checkLiked(postId);
  // Check following
  if (!isOwn) checkFollowing(d.authorId, `fbt-${postId}`);
  return div;
}

function setupObserver() {
  if (feedObserver) feedObserver.disconnect();
  feedObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const vid = e.target.querySelector('video');
      if (!vid) return;
      if (e.isIntersecting) {
        currentVideo = vid;
        vid.muted = isMuted;
        vid.play().catch(()=>{});
        startProg(e.target, vid);
      } else {
        vid.pause();
        vid.currentTime = 0;
        stopProg();
      }
    });
  }, { threshold: 0.7 });
  document.querySelectorAll('.tk-post').forEach(p => feedObserver.observe(p));
}

function startProg(post, vid) {
  stopProg();
  const fill = post.querySelector('.tk-prog-fill');
  if (!fill) return;
  progressInterval = setInterval(() => {
    if (vid.duration) fill.style.width = (vid.currentTime/vid.duration*100) + '%';
  }, 100);
}
function stopProg() { if (progressInterval) clearInterval(progressInterval); }

function tapVideo(vid, e) {
  e.stopPropagation();
  const postId = vid.closest('.tk-post').dataset.postId;
  const indicator = document.getElementById(`pause-${postId}`);
  if (vid.paused) {
    vid.play();
    if (indicator) { indicator.querySelector('i').className='fa-solid fa-play'; flash(indicator); }
  } else {
    vid.pause();
    if (indicator) { indicator.querySelector('i').className='fa-solid fa-pause'; flash(indicator); }
  }
}
function flash(el) { el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),700); }

function toggleMute() {
  isMuted = !isMuted;
  if (currentVideo) currentVideo.muted = isMuted;
  document.querySelectorAll('.tk-mute i').forEach(i => i.className=`fa-solid ${isMuted?'fa-volume-xmark':'fa-volume-high'}`);
}

// ── LIKE ──
async function toggleLike(postId, authorId, btn) {
  const lid = `${CU.uid}_${postId}`;
  const likeRef = db.collection('likes').doc(lid);
  const postRef = db.collection('posts').doc(postId);
  const ai = document.getElementById(`like-ai-${postId}`);
  const cnt = document.getElementById(`like-cnt-${postId}`);
  const snap = await likeRef.get();
  if (snap.exists) {
    await likeRef.delete();
    await postRef.update({ likes: firebase.firestore.FieldValue.increment(-1) });
    if (ai) { ai.innerHTML='<i class="fa-regular fa-heart"></i>'; ai.classList.remove('liked'); }
  } else {
    await likeRef.set({ postId, userId: CU.uid, authorId, createdAt: ts() });
    await postRef.update({ likes: firebase.firestore.FieldValue.increment(1) });
    if (ai) { ai.innerHTML='<i class="fa-solid fa-heart" style="color:#ff3060"></i>'; ai.classList.add('liked'); ai.style.transform='scale(1.3)'; setTimeout(()=>ai.style.transform='',200); }
    if (authorId !== CU.uid) addNotif(authorId,'like',`${CUD.username} liked your post.`,'posts',postId);
  }
  if (cnt) { const snap2 = await postRef.get(); if (snap2.exists) cnt.textContent = fmtN(snap2.data().likes||0); }
}

async function checkLiked(postId) {
  const snap = await db.collection('likes').doc(`${CU.uid}_${postId}`).get();
  if (snap.exists) {
    const ai = document.getElementById(`like-ai-${postId}`);
    if (ai) { ai.innerHTML='<i class="fa-solid fa-heart" style="color:#ff3060"></i>'; ai.classList.add('liked'); }
  }
}

// ── FOLLOW ──
async function toggleFollow(uid, postId, btn) {
  const fid = `${CU.uid}_${uid}`;
  const ref = db.collection('follows').doc(fid);
  const snap = await ref.get();
  if (snap.exists) {
    await ref.delete();
    await db.collection('users').doc(uid).update({ followers: firebase.firestore.FieldValue.increment(-1) });
    await db.collection('users').doc(CU.uid).update({ following: firebase.firestore.FieldValue.increment(-1) });
    if (btn) { btn.textContent='Follow'; btn.classList.remove('flw'); }
  } else {
    await ref.set({ followerId: CU.uid, followingId: uid, createdAt: ts() });
    await db.collection('users').doc(uid).update({ followers: firebase.firestore.FieldValue.increment(1) });
    await db.collection('users').doc(CU.uid).update({ following: firebase.firestore.FieldValue.increment(1) });
    if (btn) { btn.textContent='Following'; btn.classList.add('flw'); }
    addNotif(uid,'follow',`${CUD.username} followed you.`,'','');
  }
}

async function checkFollowing(uid, btnId) {
  const snap = await db.collection('follows').doc(`${CU.uid}_${uid}`).get();
  const btn = document.getElementById(btnId);
  if (snap.exists && btn) { btn.textContent='Following'; btn.classList.add('flw'); }
}

// ── VIEW PROFILE ──
async function viewProfile(uid) {
  prevScreen = currentScreen;
  currentScreen = 'viewprofile';
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('scr-viewprofile').classList.add('active');
  document.getElementById('viewprofile-content').innerHTML = '<div class="loading-state"><div class="spin dark"></div><span>Loading...</span></div>';
  initProfile(uid, uid === CU.uid, 'viewprofile-content');
}

// ═══════════════════════════════════════════
// POST CREATION
// ═══════════════════════════════════════════
function previewPostMedia(input) {
  const file = input.files[0]; if (!file) return;
  postMediaFile = file;
  showMediaPreview(file, 'post-media-preview', 'media-drop');
}
function previewC1v1Media(input) {
  const file = input.files[0]; if (!file) return;
  c1v1MediaFile = file;
  showMediaPreview(file, 'c1v1-media-preview', null);
}
function previewCCMedia(input) {
  const file = input.files[0]; if (!file) return;
  ccMediaFile = file;
  showMediaPreview(file, 'cc-media-preview', null);
}
function previewJoinMedia(input) {
  const file = input.files[0]; if (!file) return;
  joinMediaFile = file;
  showMediaPreview(file, 'join-media-preview', null);
}

function showMediaPreview(file, previewId, dropId) {
  const prev = document.getElementById(previewId);
  if (!prev) return;
  const reader = new FileReader();
  reader.onload = e => {
    const isVid = file.type.startsWith('video/');
    prev.innerHTML = `<div class="media-preview-wrap">${isVid?`<video src="${e.target.result}" controls style="width:100%;max-height:240px;object-fit:cover;display:block;"></video>`:`<img src="${e.target.result}" style="width:100%;max-height:240px;object-fit:cover;display:block;"/>`}<button class="remove-media" onclick="removeMedia('${previewId}','${dropId}')"><i class="fa-solid fa-xmark"></i></button></div>`;
    prev.classList.remove('hidden');
    if (dropId) document.getElementById(dropId).classList.add('hidden');
  };
  reader.readAsDataURL(file);
}

function removeMedia(previewId, dropId) {
  const prev = document.getElementById(previewId);
  if (prev) { prev.classList.add('hidden'); prev.innerHTML=''; }
  if (dropId) document.getElementById(dropId).classList.remove('hidden');
  postMediaFile = null; c1v1MediaFile = null; ccMediaFile = null; joinMediaFile = null;
}

async function doPost() {
  const caption = document.getElementById('post-caption').value.trim();
  const niche = document.getElementById('post-niche').value;
  const err = document.getElementById('post-err');
  err.classList.add('hidden');
  if (!caption && !postMediaFile) { showErr(err,'Write a caption or add media.'); return; }
  const btn = document.querySelector('#scr-post .btn-or');
  setBtnLoading(btn, true);
  try {
    let mediaURL = null, mediaType = null;
    if (postMediaFile) {
      showToast('Uploading...');
      const res = await uploadToCloudinary(postMediaFile, `posts/${CU.uid}`);
      mediaURL = res.url; mediaType = res.type;
    }
    const postRef = await db.collection('posts').add({
      authorId: CU.uid, authorName: CUD.displayName,
      authorUsername: CUD.username, authorNiche: CUD.niche,
      authorPhoto: CUD.photoURL||null,
      caption, niche, mediaURL, mediaType,
      likes:0, comments:0, giftClicks:0,
      createdAt: ts()
    });
    await db.collection('users').doc(CU.uid).update({ postCount: firebase.firestore.FieldValue.increment(1) });
    CUD.postCount = (CUD.postCount||0)+1;
    // Reset form
    document.getElementById('post-caption').value = '';
    document.getElementById('cap-cnt').textContent = '0/300';
    removeMedia('post-media-preview','media-drop');
    showToast('🔥 Post published!');
    showScreen('feed');
  } catch(e) { showErr(err, e.message); }
  setBtnLoading(btn, false, '<span>Publish Post</span><i class="fa-solid fa-paper-plane"></i>');
}

// ═══════════════════════════════════════════
// CHALLENGES
// ═══════════════════════════════════════════
function setChalTab(el) {
  document.querySelectorAll('.ctab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  chalTab = el.dataset.t;
  initChallenges();
}

function initChallenges() {
  const list = document.getElementById('chal-list');
  list.innerHTML = '<div class="loading-state"><div class="spin dark"></div><span>Loading challenges...</span></div>';
  if (chalUnsub) chalUnsub();
  let q;
  if (chalTab === '1v1') {
    q = db.collection('challenges').where('type','==','1v1').orderBy('createdAt','desc').limit(30);
  } else if (chalTab === 'community') {
    q = db.collection('challenges').where('type','==','community').orderBy('createdAt','desc').limit(30);
  } else {
    // Mine — challenges I created or am part of
    q = db.collection('challenges').where('participants','array-contains',CU.uid).orderBy('createdAt','desc').limit(30);
  }
  chalUnsub = q.onSnapshot(snap => {
    if (snap.empty) {
      list.innerHTML = `<div class="chal-empty"><i class="fa-solid fa-shield-halved"></i><p>${chalTab==='1v1'?'No 1v1 battles yet. Challenge someone from the feed!':chalTab==='community'?'No community challenges yet. Create the first one!':'You haven\'t joined any challenges yet.'}</p><button class="btn-or" onclick="${chalTab==='community'?'showScreen(\'create-community-challenge\')':'showScreen(\'feed\')'}">${chalTab==='community'?'<i class="fa-solid fa-plus"></i> Create Challenge':'<i class="fa-solid fa-clapperboard"></i> Go To Feed'}</button></div>`;
      return;
    }
    list.innerHTML = '';
    snap.forEach(doc => list.appendChild(buildChalCard(doc.id, doc.data())));
  }, err => {
    list.innerHTML = `<div class="chal-empty"><i class="fa-solid fa-database"></i><p>Index building... Check Firebase console for a link and click it to create the index. Takes 2 minutes.</p></div>`;
    console.error(err);
  });
}

function buildChalCard(id, d) {
  const div = document.createElement('div');
  div.className = 'cc';
  const isExpired = d.expiresAt && d.expiresAt.toDate() < new Date();
  const badgeClass = d.status==='pending' ? 'pending' : isExpired ? 'ended' : d.type==='1v1' ? 'live' : 'open';
  const badgeText = d.status==='pending' ? '● Awaiting Accept' : isExpired ? 'Ended' : d.type==='1v1' ? '● Live' : '● Open';
  let inner = `
    <div class="cc-top">
      <div class="cc-type"><i class="fa-solid fa-shield-halved"></i> ${d.type==='1v1'?'1V1 BATTLE':'COMMUNITY CHALLENGE'}</div>
      <div class="cc-badge ${badgeClass}">${badgeText}</div>
    </div>
    <div class="cc-name">${esc(d.name||'Untitled Challenge')}</div>
    <div class="cc-meta">
      <span><i class="fa-solid fa-masks-theater"></i> ${esc(d.niche||'')}</span>
      ${d.expiresAt?`<span><i class="fa-regular fa-clock"></i> ${isExpired?'Ended':timeLeft(d.expiresAt.toDate())}</span>`:''}
      <span><i class="fa-solid fa-users"></i> ${d.entryCount||0} entries</span>
      <span><i class="fa-regular fa-thumbs-up"></i> ${d.totalVotes||0} votes</span>
    </div>`;
  if (d.type==='1v1' && d.challengerUsername && d.challengeeUsername) {
    inner += `<div class="cc-vs">
      <div class="cc-vs-cr"><div class="nm">${esc(d.challengerName||'')}</div><div class="un">${esc(d.challengerUsername)}</div></div>
      <div class="cc-vs-lbl">VS</div>
      <div class="cc-vs-cr"><div class="nm">${esc(d.challengeeName||'')}</div><div class="un">${esc(d.challengeeUsername)}</div></div>
    </div>`;
  }
  div.innerHTML = inner;
  div.onclick = () => {
    if (d.type==='1v1') viewC1v1(id, d);
    else viewCommunity(id, d);
  };
  return div;
}

// ── 1V1 CHALLENGE CREATION ──
function startC1v1(uid, username, displayName, photoURL, feedPostId) {
  chalTarget = { uid, username, displayName, photoURL };
  // Set to-card
  const card = document.getElementById('chal-to-card');
  card.innerHTML = `<div class="chal-to-av">${photoURL?`<img src="${photoURL}"/>`:(displayName||'?').charAt(0).toUpperCase()}</div><div><div class="lbl">CHALLENGING</div><div class="target-name">${esc(displayName)}</div><div class="target-un">${esc(username)}</div></div>`;
  // Load my posts for picker
  loadMyPostsForPicker('existing-posts-list', feedPostId);
  prevScreen = currentScreen;
  currentScreen = 'create1v1';
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('scr-create1v1').classList.add('active');
}

async function loadMyPostsForPicker(listId, preselect) {
  const list = document.getElementById(listId);
  list.innerHTML = '<div class="loading-state" style="padding:14px;"><div class="spin dark"></div></div>';
  const snap = await db.collection('posts').where('authorId','==',CU.uid).orderBy('createdAt','desc').limit(12).get();
  if (snap.empty) {
    list.innerHTML = '<div style="font-size:12px;color:var(--mu);padding:10px 0;text-align:center;">No posts yet. Create a post first or use the New Post option above.</div>';
    return;
  }
  list.innerHTML = '';
  selectedExistingPost = null;
  snap.forEach(doc => {
    const d = doc.data();
    const item = document.createElement('div');
    item.className = 'ep-item' + (preselect===doc.id?' sel':'');
    item.dataset.postId = doc.id;
    if (preselect===doc.id) selectedExistingPost = { postId: doc.id, caption: d.caption, mediaURL: d.mediaURL, mediaType: d.mediaType };
    const thumbHTML = d.mediaURL ? (d.mediaType==='video'?`<video src="${d.mediaURL}" style="width:100%;height:100%;object-fit:cover;"></video>`:`<img src="${d.mediaURL}" style="width:100%;height:100%;object-fit:cover;"/>`):`<span>${NICHE_EMOJIS[d.niche]||'🎬'}</span>`;
    item.innerHTML = `<div class="ep-thumb">${thumbHTML}</div><div class="ep-info"><p>${esc((d.caption||'No caption').substring(0,50))}</p><small>${d.niche} · ${d.createdAt?timeAgo(d.createdAt.toDate()):'recently'}</small></div><i class="fa-${preselect===doc.id?'solid':'regular'} fa-circle-check ep-check"></i>`;
    item.onclick = () => {
      document.querySelectorAll(`#${listId} .ep-item`).forEach(i=>{i.classList.remove('sel');i.querySelector('.ep-check').className='fa-regular fa-circle-check ep-check';});
      item.classList.add('sel');
      item.querySelector('.ep-check').className = 'fa-solid fa-circle-check ep-check';
      selectedExistingPost = { postId: doc.id, caption: d.caption, mediaURL: d.mediaURL, mediaType: d.mediaType };
    };
    list.appendChild(item);
  });
}

function setPickerTab(el, tab) {
  document.querySelectorAll('.picker-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('existing-posts-list').classList.toggle('hidden', tab!=='existing');
  document.getElementById('new-post-section').classList.toggle('hidden', tab!=='new');
}

async function submitC1v1() {
  if (!chalTarget) return;
  const name = document.getElementById('c1v1-name').value.trim();
  const expiry = parseInt(document.getElementById('c1v1-expiry').value);
  const err = document.getElementById('c1v1-err');
  err.classList.add('hidden');
  if (!name) { showErr(err,'Give the challenge a name.'); return; }
  // Determine entry
  let entryPost = selectedExistingPost;
  const isNew = !document.getElementById('new-post-section').classList.contains('hidden');
  if (isNew) {
    const cap = document.getElementById('c1v1-caption').value.trim();
    if (!cap && !c1v1MediaFile) { showErr(err,'Add a caption or media for your entry.'); return; }
  }
  const btn = document.querySelector('#scr-create1v1 .btn-or');
  setBtnLoading(btn, true);
  try {
    let mediaURL = null, mediaType = null, postId = null;
    if (isNew) {
      showToast('Uploading entry...');
      if (c1v1MediaFile) {
        const res = await uploadToCloudinary(c1v1MediaFile, `posts/${CU.uid}`);
        mediaURL = res.url; mediaType = res.type;
      }
      const cap = document.getElementById('c1v1-caption').value.trim();
      const pRef = await db.collection('posts').add({
        authorId: CU.uid, authorName: CUD.displayName,
        authorUsername: CUD.username, authorNiche: CUD.niche,
        authorPhoto: CUD.photoURL||null,
        caption: cap, niche: CUD.niche, mediaURL, mediaType,
        likes:0, comments:0, giftClicks:0, createdAt: ts()
      });
      await db.collection('users').doc(CU.uid).update({ postCount: firebase.firestore.FieldValue.increment(1) });
      postId = pRef.id;
      entryPost = { postId, caption: cap, mediaURL, mediaType };
    } else {
      if (!entryPost) { showErr(err,'Select one of your posts as your entry.'); setBtnLoading(btn,false,'<i class="fa-solid fa-shield-halved"></i> <span>Send Challenge</span>'); return; }
      postId = entryPost.postId;
    }
    const expiresAt = new Date(Date.now() + expiry*24*60*60*1000);
    const chalRef = await db.collection('challenges').add({
      type: '1v1', name, niche: CUD.niche,
      challengerId: CU.uid, challengerUsername: CUD.username, challengerName: CUD.displayName, challengerPhoto: CUD.photoURL||null,
      challengerPostId: postId, challengerCaption: entryPost.caption||'', challengerMediaURL: entryPost.mediaURL||null, challengerMediaType: entryPost.mediaType||null,
      challengerVotes: 0,
      challengeeId: chalTarget.uid, challengeeUsername: chalTarget.username, challengeeName: chalTarget.displayName, challengeePhoto: chalTarget.photoURL||null,
      challengeePostId: null, challengeeCaption: null, challengeeMediaURL: null, challengeeMediaType: null,
      challengeeVotes: 0,
      status: 'pending', expiresAt, entryCount: 1, totalVotes: 0,
      participants: [CU.uid, chalTarget.uid],
      createdAt: ts()
    });
    await db.collection('users').doc(chalTarget.uid).update({ challengeRequestsReceived: firebase.firestore.FieldValue.increment(1) });
    addNotif(chalTarget.uid,'chal',`${CUD.username} challenged you to a 1v1! Check Challenges tab.`,'challenges',chalRef.id);
    showToast('⚔️ Challenge sent!');
    showScreen('challenges');
  } catch(e) { showErr(err, e.message); }
  setBtnLoading(btn,false,'<i class="fa-solid fa-shield-halved"></i> <span>Send Challenge</span>');
}

// ── VIEW 1V1 CHALLENGE ──
function viewC1v1(id, d) {
  prevScreen = currentScreen;
  currentScreen = 'view1v1';
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('scr-view1v1').classList.add('active');
  const content = document.getElementById('view1v1-content');
  const isExpired = d.expiresAt && d.expiresAt.toDate() < new Date();
  const iAmChallenger = d.challengerId === CU.uid;
  const iAmChallengee = d.challengeeId === CU.uid;
  const isPending = d.status === 'pending';
  const totalVotes = (d.challengerVotes||0) + (d.challengeeVotes||0);
  const crPct = totalVotes ? Math.round((d.challengerVotes||0)/totalVotes*100) : 50;
  const cePct = 100 - crPct;

  const crMediaHTML = d.challengerMediaURL
    ? (d.challengerMediaType==='video'
        ? `<div class="v1v1-media-wrap"><video src="${d.challengerMediaURL}" loop muted playsinline style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;" onclick="this.paused?this.play():this.pause()"></video></div>`
        : `<div class="v1v1-media-wrap"><img src="${d.challengerMediaURL}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;"/></div>`)
    : `<div class="v1v1-media-wrap" style="background:var(--deep);"><span style="font-size:40px;">${NICHE_EMOJIS[d.niche]||'🎬'}</span></div>`;

  const ceMediaHTML = d.challengeeMediaURL
    ? (d.challengeeMediaType==='video'
        ? `<div class="v1v1-media-wrap"><video src="${d.challengeeMediaURL}" loop muted playsinline style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;" onclick="this.paused?this.play():this.pause()"></video></div>`
        : `<div class="v1v1-media-wrap"><img src="${d.challengeeMediaURL}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;"/></div>`)
    : `<div class="v1v1-media-wrap" style="background:var(--deep);"><span style="font-size:28px;color:rgba(255,255,255,.3);">${isPending?'⏳ Waiting...':'No entry'}</span></div>`;

  let actionHTML = '';
  if (isPending && iAmChallengee) {
    actionHTML = `<div class="v1v1-accept-row">
      <button class="accept-btn" onclick="acceptC1v1('${id}')"><i class="fa-solid fa-check"></i> Accept Challenge</button>
      <button class="decline-btn" onclick="declineC1v1('${id}')">Decline</button>
    </div>`;
  } else if (isPending && iAmChallenger) {
    actionHTML = `<div class="v1v1-pending"><i class="fa-regular fa-clock"></i><p>Waiting for ${esc(d.challengeeName)} to accept your challenge. They've been notified.</p></div>`;
  } else if (!isPending && !isExpired) {
    actionHTML = `<div class="v1v1-vote-row">
      <button class="vbtn-a" id="vbtn-cr" onclick="vote1v1('${id}','challenger',this)">Vote ${esc(d.challengerName)}</button>
      <button class="vbtn-b" id="vbtn-ce" onclick="vote1v1('${id}','challengee',this)">Vote ${esc(d.challengeeName)}</button>
    </div>`;
  } else if (isExpired) {
    const winner = d.challengerVotes >= d.challengeeVotes ? d.challengerName : d.challengeeName;
    actionHTML = `<div class="v1v1-pending" style="background:rgba(13,176,96,.08);border-color:rgba(13,176,96,.2);"><i class="fa-solid fa-trophy" style="color:var(--gr);"></i><p style="color:rgba(255,255,255,.7);"><strong style="color:#fff;">🏆 ${esc(winner)} wins!</strong> Challenge ended.</p></div>`;
  }

  content.innerHTML = `
    <div class="v1v1-hero">
      <div class="v1v1-glow"></div>
      <div class="v1v1-name">⚔️ <span>${esc(d.name)}</span></div>
      ${d.expiresAt?`<div class="v1v1-timer"><span class="timer-chip">${isExpired?'Ended':timeLeft(d.expiresAt.toDate())}</span>${!isExpired?'remaining':''}</div>`:''}
      <div class="v1v1-posts">
        <div class="v1v1-side">
          ${crMediaHTML}
          <div class="v1v1-media-ov">
            <div class="v1v1-creator">${esc(d.challengerName)}<span>${esc(d.challengerUsername)}</span></div>
            <div class="v1v1-vote-count">${fmtN(d.challengerVotes||0)}</div>
            <div class="v1v1-pct">${crPct}%</div>
            <div class="v1v1-bar"><div class="v1v1-bar-fill" id="cr-bar" style="width:${crPct}%"></div></div>
          </div>
        </div>
       
        <div class="v1v1-side">
          ${ceMediaHTML}
          <div class="v1v1-media-ov">
            <div class="v1v1-creator">${esc(d.challengeeName||'Challenger')}<span>${esc(d.challengeeUsername||'')}</span></div>
            <div class="v1v1-vote-count">${fmtN(d.challengeeVotes||0)}</div>
            <div class="v1v1-pct">${cePct}%</div>
            <div class="v1v1-bar"><div class="v1v1-bar-fill" id="ce-bar" style="width:${cePct}%"></div></div>
          </div>
        </div>
      </div>
      ${actionHTML}
    </div>
    <div style="background:var(--bg);padding:14px 16px 80px;">
      <div style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--mu);margin-bottom:10px;">COMMENTS</div>
      <div id="v1v1-comments" class="comments-list" style="padding:0;max-height:300px;overflow-y:auto;"></div>
      <div class="comment-input-bar" style="position:relative;bottom:auto;padding:0;margin-top:10px;">
        <div class="com-av-sm">${CUD.photoURL?`<img src="${CUD.photoURL}"/>`:CUD.displayName.charAt(0).toUpperCase()}</div>
        <div class="com-input-wrap">
          <input type="text" id="v1v1-com-input" placeholder="Comment..." maxlength="300" oninput="document.getElementById('v1v1-com-send').disabled=!this.value.trim()"/>
          <button id="v1v1-com-send" class="com-send-btn" disabled onclick="submitInlineComment('challenges','${id}','v1v1-com-input','v1v1-comments')"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      </div>
    </div>`;
  loadInlineComments('challenges', id, 'v1v1-comments');
  checkVoted1v1(id);
}

async function acceptC1v1(chalId) {
  // Show select own post
  const d_snap = await db.collection('challenges').doc(chalId).get();
  const d = d_snap.data();
  // Navigate to join screen reusing it
  prevScreen = 'view1v1';
  currentScreen = 'join-community';
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('scr-join-community').classList.add('active');
  document.getElementById('joining-card').innerHTML = `<div class="jc-name">Accepting: ${esc(d.name)}</div><div class="jc-meta">1v1 vs ${esc(d.challengerUsername)} · Pick your entry post</div>`;
  joinChalTarget = { ...d, chalId, mode:'accept1v1' };
  loadMyPostsForJoin();
}

async function declineC1v1(chalId) {
  await db.collection('challenges').doc(chalId).update({ status: 'declined' });
  showToast('Challenge declined.');
  showScreen('challenges');
}

async function vote1v1(chalId, side, btn) {
  const voteId = `${CU.uid}_${chalId}`;
  const voteRef = db.collection('challengeVotes').doc(voteId);
  const snap = await voteRef.get();
  if (snap.exists) { showToast('You already voted in this challenge.'); return; }
  await voteRef.set({ chalId, userId: CU.uid, side, createdAt: ts() });
  const update = side==='challenger'
    ? { challengerVotes: firebase.firestore.FieldValue.increment(1), totalVotes: firebase.firestore.FieldValue.increment(1) }
    : { challengeeVotes: firebase.firestore.FieldValue.increment(1), totalVotes: firebase.firestore.FieldValue.increment(1) };
  await db.collection('challenges').doc(chalId).update(update);
  // Update UI
  document.querySelectorAll('.vbtn-a,.vbtn-b').forEach(b=>{b.disabled=true;});
  btn.classList.add('voted');
  btn.textContent = '✓ Voted!';
  showToast('✓ Vote counted!');
  // Refresh vote counts
  const fresh = await db.collection('challenges').doc(chalId).get();
  const fd = fresh.data();
  const tot = (fd.challengerVotes||0)+(fd.challengeeVotes||0);
  const crP = tot?Math.round((fd.challengerVotes||0)/tot*100):50;
  const crBar = document.getElementById('cr-bar');
  const ceBar = document.getElementById('ce-bar');
  if(crBar) crBar.style.width=crP+'%';
  if(ceBar) ceBar.style.width=(100-crP)+'%';
}

async function checkVoted1v1(chalId) {
  const snap = await db.collection('challengeVotes').doc(`${CU.uid}_${chalId}`).get();
  if (snap.exists) {
    const side = snap.data().side;
    const btnA = document.getElementById('vbtn-cr');
    const btnB = document.getElementById('vbtn-ce');
    if (btnA) { btnA.disabled=true; if(side==='challenger'){btnA.classList.add('voted');btnA.textContent='✓ Your Vote';} }
    if (btnB) { btnB.disabled=true; if(side==='challengee'){btnB.classList.add('voted');btnB.textContent='✓ Your Vote';} }
  }
}

// ── COMMUNITY CHALLENGE ──
async function submitCC() {
  const name = document.getElementById('cc-name').value.trim();
  const desc = document.getElementById('cc-desc').value.trim();
  const niche = document.getElementById('cc-niche').value;
  const cap = document.getElementById('cc-entry-caption').value.trim();
  const err = document.getElementById('cc-err');
  err.classList.add('hidden');
  if (!name) { showErr(err,'Give the challenge a name.'); return; }
  if (!cap && !ccMediaFile) { showErr(err,'Add your first entry post (required to start).'); return; }
  const btn = document.querySelector('#scr-create-community-challenge .btn-or');
  setBtnLoading(btn, true);
  try {
    let mediaURL=null, mediaType=null;
    if (ccMediaFile) {
      showToast('Uploading entry...');
      const res = await uploadToCloudinary(ccMediaFile, `posts/${CU.uid}`);
      mediaURL=res.url; mediaType=res.type;
    }
    // Create the post
    const pRef = await db.collection('posts').add({
      authorId: CU.uid, authorName: CUD.displayName,
      authorUsername: CUD.username, authorNiche: CUD.niche,
      authorPhoto: CUD.photoURL||null,
      caption: cap, niche, mediaURL, mediaType,
      likes:0, comments:0, giftClicks:0, createdAt: ts()
    });
    await db.collection('users').doc(CU.uid).update({ postCount: firebase.firestore.FieldValue.increment(1) });
    // Create challenge
    const chalRef = await db.collection('challenges').add({
      type: 'community', name, description: desc, niche,
      creatorId: CU.uid, creatorUsername: CUD.username, creatorName: CUD.displayName,
      entryCount: 1, totalVotes: 0,
      participants: [CU.uid],
      createdAt: ts()
    });
    // Create entry
    await db.collection('challengeEntries').add({
      chalId: chalRef.id, postId: pRef.id,
      authorId: CU.uid, authorName: CUD.displayName,
      authorUsername: CUD.username, authorPhoto: CUD.photoURL||null,
      caption: cap, mediaURL, mediaType, votes: 0, niche,
      createdAt: ts()
    });
    CUD.postCount = (CUD.postCount||0)+1;
    // Reset
    document.getElementById('cc-name').value='';
    document.getElementById('cc-desc').value='';
    document.getElementById('cc-entry-caption').value='';
    removeMedia('cc-media-preview',null);
    ccMediaFile=null;
    showToast('🏆 Community challenge launched!');
    showScreen('challenges');
  } catch(e) { showErr(err,e.message); }
  setBtnLoading(btn,false,'<i class="fa-solid fa-flag"></i> <span>Launch Challenge</span>');
}

// ── VIEW COMMUNITY CHALLENGE ──
async function viewCommunity(id, d) {
  prevScreen = currentScreen;
  currentScreen = 'viewcommunity';
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('scr-viewcommunity').classList.add('active');
  const content = document.getElementById('viewcommunity-content');
  content.innerHTML = '<div class="loading-state"><div class="spin dark"></div><span>Loading...</span></div>';
  // Load entries
  const entriesSnap = await db.collection('challengeEntries').where('chalId','==',id).orderBy('votes','desc').get();
  const entries = [];
  entriesSnap.forEach(doc => entries.push({ id:doc.id, ...doc.data() }));
  const alreadyEntered = entries.some(e=>e.authorId===CU.uid);
  const isCreator = d.creatorId===CU.uid;
  let gridHTML = '';
  entries.forEach((e,i) => {
    const thumbHTML = e.mediaURL
      ? (e.mediaType==='video'?`<video src="${e.mediaURL}" loop muted playsinline autoplay style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"></video>`:`<img src="${e.mediaURL}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"/>`)
      : `<div class="cce-no-media">${NICHE_EMOJIS[e.niche]||'🎬'}</div>`;
    const medals=['🥇','🥈','🥉'];
    gridHTML += `<div class="cce-item" onclick="viewEntry('${id}','${e.id}',${JSON.stringify(entries).replace(/'/g,"\\'")})" style="position:relative;">
      ${thumbHTML}
      <div class="cce-overlay">
        <div class="cce-rank">${medals[i]||`#${i+1}`}</div>
        <div class="cce-votes">${fmtN(e.votes)} votes</div>
        <div class="cce-un">${esc(e.authorUsername)}</div>
      </div>
    </div>`;
  });
  if (!gridHTML) gridHTML = `<div style="grid-column:1/-1;padding:40px;text-align:center;color:rgba(255,255,255,.3);font-size:13px;">No entries yet. Be the first!</div>`;
  content.innerHTML = `
    <div class="cc-hero">
      <div class="cc-hero-name">${esc(d.name)}</div>
      ${d.description?`<div class="cc-hero-desc">${esc(d.description)}</div>`:''}
      <div class="cc-hero-meta">
        <span class="cc-stat"><i class="fa-solid fa-masks-theater"></i> ${esc(d.niche)}</span>
        <span class="cc-stat"><i class="fa-solid fa-users"></i> ${d.entryCount||0} entries</span>
        <span class="cc-stat"><i class="fa-regular fa-thumbs-up"></i> ${d.totalVotes||0} votes</span>
        <span class="cc-stat"><i class="fa-solid fa-user"></i> by ${esc(d.creatorUsername)}</span>
      </div>
      ${!alreadyEntered?`<button class="join-chal-btn" onclick="joinCommunity('${id}',${JSON.stringify(d).replace(/'/g,"\\'")})"><i class="fa-solid fa-plus"></i> Submit Your Entry</button>`:'<div style="margin-top:8px;font-family:Space Mono,monospace;font-size:9px;color:var(--gr);">✓ You\'ve entered this challenge</div>'}
    </div>
    <div class="cc-entries-grid" id="cc-entries-grid">${gridHTML}</div>
    <div style="background:var(--bg);padding:14px 16px 80px;">
      <div style="font-family:'Space Mono',monospace;font-size:9px;letter-spacing:2px;color:var(--mu);margin-bottom:10px;margin-top:10px;">COMMENTS</div>
      <div id="cc-comments" class="comments-list" style="padding:0;max-height:300px;overflow-y:auto;"></div>
      <div class="comment-input-bar" style="position:relative;bottom:auto;padding:0;margin-top:10px;">
        <div class="com-av-sm">${CUD.photoURL?`<img src="${CUD.photoURL}"/>`:CUD.displayName.charAt(0).toUpperCase()}</div>
        <div class="com-input-wrap">
          <input type="text" id="cc-com-input" placeholder="Comment on challenge..." maxlength="300" oninput="document.getElementById('cc-com-send').disabled=!this.value.trim()"/>
          <button id="cc-com-send" class="com-send-btn" disabled onclick="submitInlineComment('challenges','${id}','cc-com-input','cc-comments')"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
      </div>
    </div>`;
  loadInlineComments('challenges', id, 'cc-comments');
}

// VIEW SINGLE ENTRY FULL SCREEN
async function viewEntry(chalId, entryId, entries) {
  const entry = entries.find(e=>e.id===entryId);
  if (!entry) return;
  const overlay = document.createElement('div');
  overlay.className = 'entry-fullview';
  const voteId = `${CU.uid}_${chalId}_${entryId}`;
  const voteSnap = await db.collection('challengeVotes').doc(voteId).get();
  const hasVoted = voteSnap.exists;
  let mediaHTML = '';
  if (entry.mediaURL) {
    mediaHTML = entry.mediaType==='video'
      ? `<video class="efv-media" src="${entry.mediaURL}" controls autoplay loop playsinline></video>`
      : `<img class="efv-media" src="${entry.mediaURL}"/>`;
  } else {
    mediaHTML = `<div class="efv-media" style="height:200px;background:var(--deep);display:flex;align-items:center;justify-content:center;font-size:60px;border-radius:var(--r-sm);">${NICHE_EMOJIS[entry.niche]||'🎬'}</div>`;
  }
  overlay.innerHTML = `
    <button class="efv-close" onclick="this.closest('.entry-fullview').remove()"><i class="fa-solid fa-xmark"></i></button>
    ${mediaHTML}
    <div class="efv-info">
      <div class="efv-name">${esc(entry.authorName)}</div>
      <div class="efv-un">${esc(entry.authorUsername)}</div>
      ${entry.caption?`<div style="font-size:12px;color:rgba(255,255,255,.5);margin:8px 0;line-height:1.5;">${esc(entry.caption)}</div>`:''}
      <div class="efv-votes" id="efv-v-${entryId}">${fmtN(entry.votes)}</div>
      <div class="efv-votes-lbl">VOTES</div>
      ${entry.authorId!==CU.uid?`<button class="efv-vote-btn ${hasVoted?'voted':''}" id="efv-vbtn-${entryId}" onclick="voteCommunity('${chalId}','${entryId}',this)" ${hasVoted?'disabled':''}>${hasVoted?'✓ Voted':'Vote for this entry'}</button>`:'<div style="font-family:Space Mono,monospace;font-size:10px;color:rgba(255,255,255,.3);margin-top:14px;">Your entry</div>'}
    </div>`;
  document.body.appendChild(overlay);
}

async function voteCommunity(chalId, entryId, btn) {
  const voteId = `${CU.uid}_${chalId}_${entryId}`;
  const voteRef = db.collection('challengeVotes').doc(voteId);
  const snap = await voteRef.get();
  if (snap.exists) { showToast('Already voted on this entry.'); return; }
  await voteRef.set({ chalId, entryId, userId: CU.uid, createdAt: ts() });
  await db.collection('challengeEntries').doc(entryId).update({ votes: firebase.firestore.FieldValue.increment(1) });
  await db.collection('challenges').doc(chalId).update({ totalVotes: firebase.firestore.FieldValue.increment(1) });
  btn.textContent='✓ Voted!'; btn.classList.add('voted'); btn.disabled=true;
  // Update vote count display
  const vEl = document.getElementById(`efv-v-${entryId}`);
  if (vEl) {
    const eSnap = await db.collection('challengeEntries').doc(entryId).get();
    if (eSnap.exists) vEl.textContent = fmtN(eSnap.data().votes||0);
  }
  showToast('✓ Vote counted!');
}

// JOIN COMMUNITY CHALLENGE
function joinCommunity(chalId, d) {
  joinChalTarget = { ...d, chalId, mode:'joincommunity' };
  document.getElementById('joining-card').innerHTML = `<div class="jc-name">${esc(d.name)}</div><div class="jc-meta">Community challenge · ${d.niche} · ${d.entryCount} entries</div>`;
  loadMyPostsForJoin();
  prevScreen = currentScreen;
  currentScreen = 'join-community';
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('scr-join-community').classList.add('active');
}

async function loadMyPostsForJoin() {
  const list = document.getElementById('join-existing-list');
  list.innerHTML = '<div class="loading-state" style="padding:14px;"><div class="spin dark"></div></div>';
  selectedJoinPost = null;
  const snap = await db.collection('posts').where('authorId','==',CU.uid).orderBy('createdAt','desc').limit(12).get();
  if (snap.empty) { list.innerHTML='<div style="font-size:12px;color:var(--mu);padding:10px 0;text-align:center;">No posts yet. Use New Post option above.</div>'; return; }
  list.innerHTML='';
  snap.forEach(doc=>{
    const d=doc.data();
    const item=document.createElement('div');
    item.className='ep-item';
    item.dataset.postId=doc.id;
    const thumbHTML=d.mediaURL?(d.mediaType==='video'?`<video src="${d.mediaURL}" style="width:100%;height:100%;object-fit:cover;"></video>`:`<img src="${d.mediaURL}" style="width:100%;height:100%;object-fit:cover;"/>`):`<span>${NICHE_EMOJIS[d.niche]||'🎬'}</span>`;
    item.innerHTML=`<div class="ep-thumb">${thumbHTML}</div><div class="ep-info"><p>${esc((d.caption||'No caption').substring(0,50))}</p><small>${d.niche}·${d.createdAt?timeAgo(d.createdAt.toDate()):'recently'}</small></div><i class="fa-regular fa-circle-check ep-check"></i>`;
    item.onclick=()=>{
      document.querySelectorAll('#join-existing-list .ep-item').forEach(i=>{i.classList.remove('sel');i.querySelector('.ep-check').className='fa-regular fa-circle-check ep-check';});
      item.classList.add('sel');item.querySelector('.ep-check').className='fa-solid fa-circle-check ep-check';
      selectedJoinPost={postId:doc.id,caption:d.caption,mediaURL:d.mediaURL,mediaType:d.mediaType};
    };
    list.appendChild(item);
  });
}

function setJoinTab(el,tab){
  document.querySelectorAll('#scr-join-community .picker-tab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('join-existing-list').classList.toggle('hidden',tab!=='existing');
  document.getElementById('join-new-section').classList.toggle('hidden',tab!=='new');
}

async function submitJoin() {
  if (!joinChalTarget) return;
  const isNew = !document.getElementById('join-new-section').classList.contains('hidden');
  const err = document.getElementById('join-err');
  err.classList.add('hidden');
  const btn = document.querySelector('#scr-join-community .btn-or');
  setBtnLoading(btn,true);
  try {
    let postId, caption, mediaURL, mediaType;
    if (isNew) {
      const cap = document.getElementById('join-caption').value.trim();
      if (!cap && !joinMediaFile) { showErr(err,'Add caption or media.'); setBtnLoading(btn,false,'<i class="fa-solid fa-shield-halved"></i> <span>Submit Entry</span>'); return; }
      if (joinMediaFile) {
        showToast('Uploading...');
        const res = await uploadToCloudinary(joinMediaFile,`posts/${CU.uid}`);
        mediaURL=res.url; mediaType=res.type;
      }
      caption = cap;
      const niche = joinChalTarget.niche || CUD.niche;
      const pRef = await db.collection('posts').add({
        authorId:CU.uid,authorName:CUD.displayName,authorUsername:CUD.username,
        authorNiche:CUD.niche,authorPhoto:CUD.photoURL||null,
        caption,niche,mediaURL:mediaURL||null,mediaType:mediaType||null,
        likes:0,comments:0,giftClicks:0,createdAt:ts()
      });
      await db.collection('users').doc(CU.uid).update({postCount:firebase.firestore.FieldValue.increment(1)});
      postId=pRef.id; CUD.postCount=(CUD.postCount||0)+1;
    } else {
      if (!selectedJoinPost) { showErr(err,'Select a post.'); setBtnLoading(btn,false,'<i class="fa-solid fa-shield-halved"></i> <span>Submit Entry</span>'); return; }
      postId=selectedJoinPost.postId; caption=selectedJoinPost.caption; mediaURL=selectedJoinPost.mediaURL; mediaType=selectedJoinPost.mediaType;
    }
    const chalId = joinChalTarget.chalId;
    if (joinChalTarget.mode==='accept1v1') {
      // Accept 1v1
      await db.collection('challenges').doc(chalId).update({
        challengeePostId:postId,challengeeCaption:caption||'',
        challengeeMediaURL:mediaURL||null,challengeeMediaType:mediaType||null,
        status:'active',entryCount:2,
        acceptedAt:ts()
      });
      addNotif(joinChalTarget.challengerId,'chal',`${CUD.username} accepted your 1v1 challenge! Voting is open.`,'challenges',chalId);
      showToast('✓ Challenge accepted! Voting is now open.');
    } else {
      // Join community
      await db.collection('challengeEntries').add({
        chalId,postId,authorId:CU.uid,authorName:CUD.displayName,
        authorUsername:CUD.username,authorPhoto:CUD.photoURL||null,
        caption:caption||'',mediaURL:mediaURL||null,mediaType:mediaType||null,
        votes:0,niche:joinChalTarget.niche||CUD.niche,createdAt:ts()
      });
      await db.collection('challenges').doc(chalId).update({
        entryCount:firebase.firestore.FieldValue.increment(1),
        participants:firebase.firestore.FieldValue.arrayUnion(CU.uid)
      });
      showToast('🏆 Entry submitted!');
    }
    document.getElementById('join-caption').value='';
    removeMedia('join-media-preview',null); joinMediaFile=null; selectedJoinPost=null; joinChalTarget=null;
    showScreen('challenges');
  } catch(e) { showErr(err,e.message); }
  setBtnLoading(btn,false,'<i class="fa-solid fa-shield-halved"></i> <span>Submit Entry</span>');
}

// ═══════════════════════════════════════════
// PROFILE
// ═══════════════════════════════════════════
async function initProfile(uid, isOwn, containerId) {
  const container = document.getElementById(containerId || 'profile-content');
  container.innerHTML = '<div class="loading-state"><div class="spin dark"></div><span>Loading profile...</span></div>';
  const snap = await db.collection('users').doc(uid).get();
  if (!snap.exists) { container.innerHTML='<div class="loading-state"><p>Profile not found.</p></div>'; return; }
  const u = snap.data();
  if (isOwn) { CUD = u; }
  const lv = getLevel(u);
  const postsSnap = await db.collection('posts').where('authorId','==',uid).orderBy('createdAt','desc').limit(12).get();
  let postsGrid = '';
  postsSnap.forEach(doc => {
    const d=doc.data();
    const thumbHTML=d.mediaURL?(d.mediaType==='video'?`<video src="${d.mediaURL}" style="width:100%;height:100%;object-fit:cover;display:block;"></video>`:`<img src="${d.mediaURL}" style="width:100%;height:100%;object-fit:cover;display:block;"/>`):`<div class="pg-placeholder">${esc((d.caption||'').substring(0,40))}</div>`;
    postsGrid+=`<div class="pg-item">${thumbHTML}<div class="pg-ov"><span><i class="fa-solid fa-coins"></i>${d.giftClicks||0}</span></div></div>`;
  });
  const avHTML = u.photoURL ? `<img src="${u.photoURL}"/>` : u.displayName.charAt(0).toUpperCase();
  container.innerHTML = `
    <div class="prof-cover">
      <div class="prof-cover-glow"></div>
      <div class="prof-av-wrap"><div class="prof-av">${avHTML}<div class="prof-av-ring"></div></div></div>
    </div>
    <div class="prof-body">
      <div class="prof-name">${esc(u.displayName)}</div>
      <div class="prof-urow">
        <span class="prof-user">${esc((u.username||'').split('@')[0])}<span>@${esc(u.niche||'')}</span></span>
        <div class="level-badge"><i class="fa-solid fa-arrow-up"></i>${lv.name}</div>
      </div>
      ${u.bio?`<div class="prof-bio">${esc(u.bio)}</div>`:''}
      <div class="prof-stats">
        <div class="ps"><div class="ps-v">${fmtN(u.postCount||0)}</div><div class="ps-l">Posts</div></div>
        <div class="ps"><div class="ps-v">${fmtN(u.followers||0)}</div><div class="ps-l">Followers</div></div>
        <div class="ps"><div class="ps-v or">${fmtN(u.challengeWins||0)}</div><div class="ps-l">Wins</div></div>
        <div class="ps"><div class="ps-v go">${fmtN(u.giftClicksReceived||0)}</div><div class="ps-l">Gifts</div></div>
      </div>
      ${isOwn
        ? `<div class="prof-acts"><button class="prof-edit-btn" onclick="showToast('Edit profile coming soon!')">Edit Profile</button></div>`
        : `<div class="prof-acts"><button class="prof-follow-btn" id="pf-btn-${uid}" onclick="toggleFollow('${uid}','',this)">Follow</button><button class="prof-chal-btn" onclick="startC1v1('${uid}','${esc(u.username||'')}','${esc(u.displayName)}','${u.photoURL||''}','')"><i class="fa-solid fa-shield-halved"></i> Challenge</button></div>`}
      <div class="prof-divider"></div>
      <div class="prof-sec-title">Gift Intents</div>
      <div class="gift-block">
        <div class="gb-ico"><i class="fa-solid fa-coins"></i></div>
        <div><div class="gb-v">${fmtN(u.giftClicksReceived||0)}</div><div class="gb-l">Fans would have gifted · Real Mobile Money in V1</div></div>
      </div>
      <div class="prof-sec-title">Level Progress</div>
      <div class="level-prog-block">
        <div class="lp-top"><div class="lp-name">${lv.name}</div>${lv.next?`<div class="lp-next">→ ${lv.next.name} at ${fmtN(lv.next.min)} pts</div>`:''}</div>
        <div class="lp-bar"><div class="lp-fill" style="width:${lv.pct}%"></div></div>
        <div class="lp-hint">${fmtN(lv.score)} pts · Post, win challenges & get gifts to level up</div>
      </div>
      <div class="prof-sec-title">Posts</div>
      <div class="posts-grid">${postsGrid||'<div style="grid-column:1/-1;padding:30px;text-align:center;color:var(--mu);font-size:13px;">No posts yet.</div>'}</div>
    </div>`;
  if (!isOwn) checkFollowing(uid, `pf-btn-${uid}`);
}

// ═══════════════════════════════════════════
// COMMENTS
// ═══════════════════════════════════════════
function openComments(collection, docId) {
  currentCommentTarget = { collection, docId };
  prevScreen = currentScreen;
  currentScreen = 'comments';
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('scr-comments').classList.add('active');
  const avEl = document.getElementById('com-av-sm');
  avEl.innerHTML = CUD.photoURL ? `<img src="${CUD.photoURL}"/>` : CUD.displayName.charAt(0).toUpperCase();
  document.getElementById('com-text').value='';
  document.getElementById('com-send').disabled=true;
  loadCommentsFull();
}

function closeComments() {
  currentCommentTarget=null;
  if (commentsUnsub) commentsUnsub();
  goBack();
}

function loadCommentsFull() {
  if (!currentCommentTarget) return;
  const list = document.getElementById('comments-list');
  list.innerHTML='<div class="loading-state"><div class="spin dark"></div><span>Loading...</span></div>';
  if (commentsUnsub) commentsUnsub();
  commentsUnsub = db.collection(currentCommentTarget.collection).doc(currentCommentTarget.docId)
    .collection('comments').orderBy('createdAt','asc')
    .onSnapshot(snap => {
      if (snap.empty) { list.innerHTML='<div class="com-empty"><i class="fa-regular fa-comment-dots"></i><p>No comments yet. Be the first!</p></div>'; return; }
      list.innerHTML='';
      snap.forEach(doc => list.appendChild(buildComment(doc.data())));
      list.scrollTop=list.scrollHeight;
    });
}

async function submitComment() {
  if (!currentCommentTarget) return;
  const input = document.getElementById('com-text');
  const text = input.value.trim();
  if (!text) return;
  input.value=''; document.getElementById('com-send').disabled=true;
  await postComment(currentCommentTarget.collection, currentCommentTarget.docId, text);
}

/*async function submitInlineComment(collection, docId, inputId, listId) {
  const input = document.getElementById(inputId);
  const text = input.value.trim();
  if (!text) return;
  input.value=''; document.getElementById(inputId.replace('input','send')+'-send').disabled=true;
  await postComment(collection, docId, text);
  // Reload inline
  loadInlineComments(collection, docId, listId);
}*/
async function submitInlineComment(collection, docId, inputId, listId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  const sendId = inputId.replace('com-input', 'com-send').replace('input', 'send');
  const sendBtn = document.getElementById(sendId);
  if (sendBtn) sendBtn.disabled = true;
  await postComment(collection, docId, text);
  loadInlineComments(collection, docId, listId);
}

async function postComment(collection, docId, text) {
  await db.collection(collection).doc(docId).collection('comments').add({
    authorId:CU.uid,authorName:CUD.displayName,
    authorUsername:CUD.username,authorPhoto:CUD.photoURL||null,
    text,createdAt:ts()
  });
  // Increment comment count if it's a post
  if (collection==='posts') {
    await db.collection('posts').doc(docId).update({comments:firebase.firestore.FieldValue.increment(1)});
  }
}

function loadInlineComments(collection, docId, listId) {
  const list = document.getElementById(listId);
  if (!list) return;
  db.collection(collection).doc(docId).collection('comments').orderBy('createdAt','asc').limit(20)
    .onSnapshot(snap => {
      if (snap.empty) { list.innerHTML='<div class="com-empty" style="padding:20px;"><i class="fa-regular fa-comment-dots" style="font-size:24px;"></i><p style="font-size:12px;">No comments yet.</p></div>'; return; }
      list.innerHTML=''; snap.forEach(doc=>list.appendChild(buildComment(doc.data()))); list.scrollTop=list.scrollHeight;
    });
}

function buildComment(d) {
  const div = document.createElement('div');
  div.className = 'com-item';
  const avHTML = d.authorPhoto?`<div class="com-av"><img src="${d.authorPhoto}"/></div>`:`<div class="com-av">${(d.authorName||'?').charAt(0).toUpperCase()}</div>`;
  div.innerHTML=`${avHTML}<div class="com-body"><div class="com-hdr"><span class="com-name">${esc(d.authorName)}</span><span class="com-un">${esc(d.authorUsername)}</span><span class="com-time">${d.createdAt?timeAgo(d.createdAt.toDate()):'now'}</span></div><div class="com-text">${esc(d.text)}</div></div>`;
  return div;
}

// ═══════════════════════════════════════════
// GIFT
// ═══════════════════════════════════════════
let giftAmount = 0;
function openGiftModal(postId, authorId, authorUsername) {
  giftTarget={postId,authorId,authorUsername};giftAmount=0;
  document.querySelectorAll('.gopt').forEach(o=>o.classList.remove('sel'));
  document.getElementById('gift-to').innerHTML=`Gifting <span>${esc(authorUsername)}</span>`;
  document.getElementById('gift-modal').classList.remove('hidden');
}
function pickGift(el,amt){
  document.querySelectorAll('.gopt').forEach(o=>o.classList.remove('sel'));
  el.classList.add('sel'); giftAmount=amt;
}
function closeModal(id){document.getElementById(id).classList.add('hidden');}
async function sendGift() {
  if (!giftAmount){showToast('Pick a gift amount.');return;}
  if (!giftTarget){return;}
  closeModal('gift-modal');
  await db.collection('posts').doc(giftTarget.postId).update({giftClicks:firebase.firestore.FieldValue.increment(1)});
  await db.collection('users').doc(giftTarget.authorId).update({giftClicksReceived:firebase.firestore.FieldValue.increment(1)});
  await db.collection('giftClicks').add({postId:giftTarget.postId,authorId:giftTarget.authorId,clickerUid:CU.uid,clickerUsername:CUD.username,amount:giftAmount,createdAt:ts()});
  if (giftTarget.authorId!==CU.uid) addNotif(giftTarget.authorId,'gift',`${CUD.username} would gift you ${giftAmount} coins! Real Mobile Money gifting in V1.`,'posts',giftTarget.postId);
  const el=document.getElementById(`gift-cnt-${giftTarget.postId}`);
  if(el){const n=parseInt(el.textContent.replace(/[^0-9]/g,''))||0;el.textContent=fmtN(n+1);}
  // Coin animation
  for(let i=0;i<4;i++){
    const c=document.createElement('div');
    c.style.cssText=`position:fixed;z-index:9999;font-size:22px;right:${50+Math.random()*40}px;bottom:${150+Math.random()*60}px;animation:coinPop 1.1s ease forwards;animation-delay:${i*.12}s;pointer-events:none;`;
    c.textContent='🪙';document.body.appendChild(c);setTimeout(()=>c.remove(),1500);
  }
  showToast(`🪙 ${giftAmount} coin gift intent sent! Tracked.`);
  giftTarget=null;giftAmount=0;
}

// ═══════════════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════════════
function listenNotifs() {
  if (notifUnsub) notifUnsub();
  notifUnsub = db.collection('notifications').where('toUid','==',CU.uid).where('read','==',false)
    .onSnapshot(snap => {
      const dot = document.getElementById('notif-dot');
      if (snap.size>0){dot.classList.remove('hidden');}else{dot.classList.add('hidden');}
    });
}

async function initNotifs() {
  const list = document.getElementById('notif-list');
  list.innerHTML='<div class="loading-state"><div class="spin dark"></div><span>Loading...</span></div>';
  const snap = await db.collection('notifications').where('toUid','==',CU.uid).orderBy('createdAt','desc').limit(30).get();
  if (snap.empty){list.innerHTML='<div class="notif-empty"><i class="fa-regular fa-bell"></i><p>No notifications yet.</p></div>';return;}
  list.innerHTML='';
  const batch=db.batch();
  snap.forEach(doc=>{
    const d=doc.data();
    const iconMap={gift:'fa-solid fa-coins',chal:'fa-solid fa-shield-halved',like:'fa-solid fa-heart',follow:'fa-solid fa-user-plus'};
    const item=document.createElement('div');
    item.className=`ni-item${d.read?'':' unread'}`;
    item.innerHTML=`<div class="ni-ico ${d.type||'like'}"><i class="${iconMap[d.type]||'fa-solid fa-bell'}"></i></div><div class="ni-txt"><p>${esc(d.message)}</p></div><div class="ni-time">${d.createdAt?timeAgo(d.createdAt.toDate()):'now'}</div>`;
    list.appendChild(item);
    if(!d.read)batch.update(doc.ref,{read:true});
  });
  await batch.commit();
  document.getElementById('notif-dot').classList.add('hidden');
}

async function addNotif(toUid,type,message,refCollection,refId){
  if(!toUid)return;
  await db.collection('notifications').add({toUid,type,message,refCollection,refId,read:false,createdAt:ts()});
}

// ═══════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════
function ts(){return firebase.firestore.FieldValue.serverTimestamp();}
function cap(str){return str?str.charAt(0).toUpperCase()+str.slice(1):'';}
function esc(str){if(!str)return'';return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fmtN(n){n=parseInt(n)||0;if(n>=1000000)return(n/1000000).toFixed(1)+'M';if(n>=1000)return(n/1000).toFixed(1)+'K';return String(n);}
function timeAgo(date){
  const s=Math.floor((Date.now()-date)/1000);
  if(s<60)return'just now';if(s<3600)return Math.floor(s/60)+'m';
  if(s<86400)return Math.floor(s/3600)+'h';if(s<604800)return Math.floor(s/86400)+'d';
  return date.toLocaleDateString();
}
function timeLeft(date){
  const s=Math.max(0,Math.floor((date-Date.now())/1000));
  if(s<60)return s+'s left';if(s<3600)return Math.floor(s/60)+'m left';
  if(s<86400)return Math.floor(s/3600)+'h left';return Math.floor(s/86400)+'d left';
}
function showToast(msg){
  const old=document.getElementById('toast');if(old)old.remove();
  const t=document.createElement('div');t.className='toast';t.id='toast';t.textContent=msg;
  document.body.appendChild(t);setTimeout(()=>t.remove(),3200);
}
function setBtnLoading(btn,loading,resetHTML){
  if(loading){btn.innerHTML='<div class="spin" style="width:16px;height:16px;border-color:rgba(255,255,255,.3);border-top-color:#fff;margin:0 auto;"></div>';btn.disabled=true;}
  else{btn.innerHTML=resetHTML||btn.innerHTML;btn.disabled=false;}
}
// Close modals on bg click
document.addEventListener('click',e=>{
  if(e.target.id==='gift-modal')closeModal('gift-modal');
});
// Add coinPop animation dynamically
const style=document.createElement('style');
style.textContent='@keyframes coinPop{0%{opacity:1;transform:scale(1) translateY(0);}100%{opacity:0;transform:scale(.7) translateY(-100px);}}';
document.head.appendChild(style);
