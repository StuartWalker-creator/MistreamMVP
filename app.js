// ═══════════════════════════════════
// CONFIG
// ═══════════════════════════════════
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
const CLD_CLOUD = 'dvdshonhc';
const CLD_PRESET = 'mistream_uploads';
const VAPID_KEY = '';

// ═══════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════
const LEVELS = [
  {name:'Rookie',min:0,max:100},
  {name:'Pro',min:100,max:300},
  {name:'Expert',min:300,max:700},
  {name:'Elite',min:700,max:1500},
  {name:'Master',min:1500,max:3000},
  {name:'Ultra',min:3000,max:Infinity}
];
const BADGE_DEFS = {
  unbeaten:{label:'UNBEATEN',cls:'badge-unbeaten',icon:'fa-shield',desc:'Won 3+ challenges without a loss'},
  defender:{label:'DEFENDER',cls:'badge-defender',icon:'fa-shield-halved',desc:'Active and won last challenge'},
  challenger:{label:'CHALLENGER',cls:'badge-challenger',icon:'fa-sword',desc:'Issued 3+ challenges this week'},
  veteran:{label:'VETERAN',cls:'badge-veteran',icon:'fa-medal',desc:'10+ challenges completed'},
  rising:{label:'RISING',cls:'badge-rising',icon:'fa-arrow-trend-up',desc:'Won last 2 challenges'},
  fallen:{label:'FALLEN',cls:'badge-fallen',icon:'fa-arrow-trend-down',desc:'Lost last 3 challenges'}
};

// ═══════════════════════════════════
// STATE
// ═══════════════════════════════════
let CU = null, CUD = null;
let curScr = 'feed', prevScr = null;
let chalTab = 'battles';
let isMuted = true, curVideo = null, feedObserver = null;
let feedUnsub = null, chalUnsub = null, notifUnsub = null, comUnsub = null;
let comTarget = null;
let giftTarget = null, giftAmt = 0;
let c1PostTarget = null, c1SelPost = null, c1MediaFile = null;
let ccMediaFile = null, postMediaFile = null, joinMediaFile = null;
let joinChalTarget = null, joinSelPost = null;
let respondChalData = null;
let progInterval = null;
let tipIndex = 0;
const TIPS = [
  {id:'scroll',title:'Scroll to discover',body:'Swipe up to see more comedy posts from creators around you.',anchor:'tk-feed',side:'bottom',x:'50%',y:'55%'},
  {id:'sound',title:'Toggle sound',body:'Tap the speaker icon to unmute videos.',anchor:'tk-mute',side:'left',x:'85%',y:'35%'},
  {id:'gift',title:'Gift creators',body:'Tap the coin icon to show a creator you\'d reward them. Every tap is tracked — real Mobile Money gifting comes in V1.',anchor:'gift-act',side:'left',x:'80%',y:'55%'},
  {id:'challenge',title:'Challenge or vote',body:'Tap the shield icon to challenge a creator or vote in an active battle.',anchor:'chal-act',side:'left',x:'85%',y:'70%'},
  {id:'battles',title:'See all battles',body:'Tap Battles below to watch ongoing 1v1 competitions and vote.',anchor:'bn-challenges',side:'top',x:'28%',y:'88%'}
];

// ═══════════════════════════════════
// INIT
// ═══════════════════════════════════
window.addEventListener('load', () => {
  registerSW();
  setTimeout(() => {
    document.getElementById('splash').classList.add('hidden');
    auth.onAuthStateChanged(async user => {
      if (user) {
        const snap = await db.collection('users').doc(user.uid).get();
        if (snap.exists) { CU = user; CUD = snap.data(); initApp(); }
        else { showAuth(); sv('v-register'); }
      } else { showAuth(); sv('v-login'); }
    });
  }, 2400);
});

function showAuth() {
  document.getElementById('auth').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function initApp() {
  document.getElementById('auth').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  //setTopAv();
  setMyId();
  trackSession();
  listenNotifs();
  requestPushPermission();
  showScr('feed');
  setTimeout(() => startTips(), 12000);
}

function setTopAv() {
  const av = document.getElementById('top-av');
  if (CUD.photoURL) av.innerHTML = `<img src="${CUD.photoURL}"/>`;
  else av.textContent = (CUD.displayName||'?').charAt(0).toUpperCase();
}

function setMyId() {
  const lv = getLevel(CUD);
  const html = `<div class="my-id-av">${CUD.photoURL?`<img src="${CUD.photoURL}"/>`:(CUD.displayName||'?').charAt(0).toUpperCase()}</div><div class="my-id-info"><div class="nm">${esc(CUD.displayName)}</div><div class="un">${esc(CUD.username||'')}</div><div class="lv">${lv.name} · Comedy</div></div>`;
  ['my-id','my-id-2'].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = html; });
}

async function trackSession() {
  await db.collection('users').doc(CU.uid).update({
    lastSeen: ts(), sessionCount: firebase.firestore.FieldValue.increment(1)
  }).catch(()=>{});
}

// ═══════════════════════════════════
// AUTH
// ═══════════════════════════════════
function sv(id) {
  document.querySelectorAll('.auth-view').forEach(v => v.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

let regPhoto = null;
function previewRegPhoto(input) {
  const file = input.files[0]; if (!file) return;
  regPhoto = file;
  const reader = new FileReader();
  reader.onload = e => {
    const el = document.getElementById('reg-photo-prev');
    el.innerHTML = `<img src="${e.target.result}"/>`;
  };
  reader.readAsDataURL(file);
}

function updateUsernamePreview() {
  const name = document.getElementById('r-name').value.trim().toLowerCase().replace(/\s+/g,'');
  const prev = document.getElementById('upreview');
  document.getElementById('upn').textContent = name ? `${name}@comedy` : 'name@comedy';
  prev.classList.toggle('hidden', !name);
}

async function doRegister() {
  const name = document.getElementById('r-name').value.trim();
  const email = document.getElementById('r-email').value.trim();
  const pass = document.getElementById('r-pass').value;
  const err = document.getElementById('r-err');
  err.classList.add('hidden');
  if (!name) { showErr(err,'Enter your name.'); return; }
  if (!email) { showErr(err,'Enter your email.'); return; }
  if (pass.length < 6) { showErr(err,'Password needs 6+ characters.'); return; }
  const btn = document.getElementById('reg-btn');
  setBtnLoad(btn, true);
  try {
    const username = name.toLowerCase().replace(/\s+/g,'') + '@comedy';
    const cred = await auth.createUserWithEmailAndPassword(email, pass);
    let photoURL = null;
    if (regPhoto) {
      showToast('Uploading photo...');
      const res = await uploadCLD(regPhoto, `avatars/${cred.user.uid}`);
      photoURL = res.url;
    }
    await db.collection('users').doc(cred.user.uid).set({
      uid: cred.user.uid, displayName: name, username, niche: 'comedy',
      email, photoURL, bio: '', giftClicksReceived: 0,
      challengeWins: 0, challengeLosses: 0, challengeCount: 0,
      totalVotesReceived: 0, followers: 0, following: 0,
      postCount: 0, sessionCount: 0, badges: [],
      createdAt: ts()
    });
  } catch(e) { showErr(err, friendlyErr(e.code)); setBtnLoad(btn, false, '<span>Claim My Identity</span><i class="fa-solid fa-arrow-right"></i>'); }
}

async function doLogin() {
  const email = document.getElementById('l-email').value.trim();
  const pass = document.getElementById('l-pass').value;
  const err = document.getElementById('l-err');
  err.classList.add('hidden');
  if (!email || !pass) { showErr(err,'Fill in all fields.'); return; }
  const btn = document.getElementById('l-btn');
  setBtnLoad(btn, true);
  try { await auth.signInWithEmailAndPassword(email, pass); }
  catch(e) { showErr(err, friendlyErr(e.code)); setBtnLoad(btn, false, '<span>Sign In</span><i class="fa-solid fa-arrow-right"></i>'); }
}

function showErr(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }
function friendlyErr(code) {
  const m = {'auth/email-already-in-use':'Email already registered.','auth/invalid-email':'Invalid email.','auth/wrong-password':'Wrong password.','auth/user-not-found':'No account found.','auth/weak-password':'Password too short.','auth/too-many-requests':'Too many attempts. Try later.'};
  return m[code] || 'Something went wrong.';
}

// ═══════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════
function showScr(name) {
  prevScr = curScr; curScr = name;
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.bn').forEach(b => b.classList.remove('active'));
  const scr = document.getElementById(`scr-${name}`);
  if (scr) scr.classList.add('active');
  const bn = document.getElementById(`bn-${name}`);
  if (bn) bn.classList.add('active');
  if (name === 'feed') initFeed();
  if (name === 'challenges') initChallenges();
  if (name === 'profile') initProfile(CU.uid, true);
  if (name === 'notifications') initNotifs();
  if (name === 'post') setMyId();
}

function goBack() {
  if (prevScr) showScr(prevScr);
  else showScr('feed');
}

// ═══════════════════════════════════
// CLOUDINARY + THUMBNAIL
// ═══════════════════════════════════
async function uploadCLD(file, folder) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', CLD_PRESET);
  fd.append('folder', `mistream/${folder}`);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLD_CLOUD}/auto/upload`, {method:'POST',body:fd});
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return {url: data.secure_url, type: file.type.startsWith('video/') ? 'video' : 'image'};
}

async function genThumb(videoFile) {
  return new Promise(resolve => {
    const vid = document.createElement('video');
    vid.preload = 'metadata'; vid.muted = true; vid.playsInline = true;
    const url = URL.createObjectURL(videoFile);
    vid.src = url;
    vid.addEventListener('loadeddata', () => { vid.currentTime = 1; });
    vid.addEventListener('seeked', () => {
      const c = document.createElement('canvas');
      c.width = vid.videoWidth || 480; c.height = vid.videoHeight || 854;
      c.getContext('2d').drawImage(vid, 0, 0, c.width, c.height);
      c.toBlob(blob => { URL.revokeObjectURL(url); resolve(blob); }, 'image/jpeg', 0.8);
    });
    vid.addEventListener('error', () => { URL.revokeObjectURL(url); resolve(null); });
    vid.load();
  });
}

async function uploadWithThumb(file, folder) {
  const res = await uploadCLD(file, folder);
  let thumbURL = null;
  if (res.type === 'video') {
    const blob = await genThumb(file);
    if (blob) {
      const tf = new File([blob], 'thumb.jpg', {type:'image/jpeg'});
      const tr = await uploadCLD(tf, `thumbs/${CU.uid}`);
      thumbURL = tr.url;
    }
  }
  return {...res, thumbURL};
}

// ═══════════════════════════════════
// LEVELS & BADGES
// ═══════════════════════════════════
function getLevel(u) {
  const score = (u.postCount||0)*10 + (u.challengeWins||0)*50 + (u.giftClicksReceived||0)*3 + (u.totalVotesReceived||0)*2;
  const lvl = LEVELS.slice().reverse().find(l => score >= l.min) || LEVELS[0];
  const next = LEVELS[LEVELS.indexOf(lvl)+1];
  const pct = next ? Math.min(100,((score-lvl.min)/(next.min-lvl.min))*100) : 100;
  return {...lvl, score, next, pct};
}

function computeBadges(u) {
  const badges = [];
  const w = u.challengeWins||0, l = u.challengeLosses||0, total = (u.challengeCount||0);
  if (w >= 3 && l === 0) badges.push('unbeaten');
  if (w >= 1 && total >= 1) badges.push('defender');
  if (total >= 10) badges.push('veteran');
  if (w >= 2 && l === 0) badges.push('rising');
  if (l >= 3) badges.push('fallen');
  return badges;
}

function renderBadges(badges) {
  return (badges||[]).map(b => {
    const def = BADGE_DEFS[b];
    if (!def) return '';
    return `<span class="badge-pill ${def.cls}"><i class="fa-solid ${def.icon}"></i>${def.label}</span>`;
  }).join('');
}

// ═══════════════════════════════════
// FEED
// ═══════════════════════════════════
function initFeed() {
  const feed = document.getElementById('tk-feed');
  feed.innerHTML = `<div class="tk-post"><div style="height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px;color:rgba(255,255,255,.4);"><div class="spin"></div><p style="font-family:Space Mono,monospace;font-size:11px;letter-spacing:1px;">Loading...</p></div></div>`;
  if (feedUnsub) feedUnsub();
  if (feedObserver) feedObserver.disconnect();
  loadPersonalizedFeed();
}

async function loadPersonalizedFeed() {
  const feed = document.getElementById('tk-feed');
  // Get followed users
  let followedIds = [];
  try {
    const fSnap = await db.collection('follows').where('followerId','==',CU.uid).limit(30).get();
    followedIds = fSnap.docs.map(d => d.data().followingId);
  } catch(e) {}
  // Get posts — mix of followed + recent + challenges
  const allPosts = [];
  try {
    // Followed posts
    if (followedIds.length > 0) {
      const fPosts = await db.collection('posts').where('authorId','in',followedIds.slice(0,10)).orderBy('createdAt','desc').limit(10).get();
      fPosts.forEach(d => allPosts.push({...d.data(), id:d.id, weight: 3}));
    }
    // Recent posts
    const rPosts = await db.collection('posts').orderBy('createdAt','desc').limit(20).get();
    rPosts.forEach(d => { if (!allPosts.find(p=>p.id===d.id)) allPosts.push({...d.data(), id:d.id, weight:1}); });
  } catch(e) {
    const rPosts = await db.collection('posts').orderBy('createdAt','desc').limit(20).get();
    rPosts.forEach(d => allPosts.push({...d.data(), id:d.id, weight:1}));
  }
  // Weighted shuffle
  const shuffled = weightedShuffle(allPosts);
  // Get active challenges for inline cards
  let activeChallenges = [];
  try {
    const cSnap = await db.collection('challenges').where('type','==','1v1').where('status','==','active').orderBy('createdAt','desc').limit(5).get();
    cSnap.forEach(d => activeChallenges.push({...d.data(), id:d.id}));
  } catch(e) {}
  feed.innerHTML = '';
  let chalIdx = 0;
  shuffled.forEach((post, i) => {
    feed.appendChild(buildTkPostSync(post.id, post, i));
    // Insert challenge card every 5 posts
    if ((i+1) % 5 === 0 && chalIdx < activeChallenges.length) {
      feed.appendChild(buildFeedChalCard(activeChallenges[chalIdx].id, activeChallenges[chalIdx]));
      chalIdx++;
    }
  });
  if (feed.children.length === 0) {
    feed.innerHTML = `<div class="tk-post"><div style="height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;padding:40px;text-align:center;"><i class="fa-solid fa-wind" style="font-size:44px;color:rgba(255,255,255,.2);"></i><h3 style="color:#fff;font-size:17px;">No posts yet</h3><p style="color:rgba(255,255,255,.4);font-size:13px;line-height:1.6;">Be the first to post and start the comedy battle.</p><button class="btn-or" onclick="showScr('post')"><i class="fa-solid fa-plus"></i> Create First Post</button></div></div>`;
  }
  setupObserver();
  // Tag first tip anchor elements
  setTimeout(() => { document.querySelector('.tk-mute')?.setAttribute('id','tk-mute'); }, 500);
}

function weightedShuffle(arr) {
  const pool = [];
  arr.forEach(item => { for (let i=0;i<(item.weight||1);i++) pool.push(item); });
  const seen = new Set(), result = [];
  for (let i=pool.length-1;i>=0;i--) {
    const j = Math.floor(Math.random()*(i+1));
    [pool[i],pool[j]] = [pool[j],pool[i]];
    if (!seen.has(pool[i].id)) { seen.add(pool[i].id); result.push(pool[i]); }
  }
  return result;
}

async function buildTkPost(postId, d, idx) {
  const isOwn = d.authorId === CU.uid;
  const init = (d.authorName||'?').charAt(0).toUpperCase();
  const div = document.createElement('div');
  div.className = 'tk-post';
  div.dataset.postId = postId;
  // Media
  const bgs = ['linear-gradient(160deg,#0d0a04,#2a1508,#060608)','linear-gradient(160deg,#050a10,#091525,#060608)','linear-gradient(160deg,#0d0508,#1e0d14,#060608)','linear-gradient(160deg,#080d05,#141f08,#060608)'];
  let mediaHTML = '';
  if (d.mediaURL) {
    if (d.mediaType === 'video') {
      mediaHTML = `<video class="tk-video" src="${d.mediaURL}" ${d.thumbURL?`poster="${d.thumbURL}"`:''}  loop playsinline muted preload="metadata" onclick="tapVid(this,event)"></video>`;
    } else {
      mediaHTML = `<img class="tk-img" src="${d.mediaURL}" loading="lazy"/>`;
    }
  } else {
    mediaHTML = `<div class="tk-nobg" style="background:${bgs[idx%4]}"><span style="font-size:90px;filter:drop-shadow(0 0 30px rgba(255,180,50,.3));">🎭</span></div>`;
  }
  // Check post challenges
  let chalCount = 0, hasLive = false;
  try {
    const pcSnap = await db.collection('challenges').where('type','==','1v1').where('challengerPostId','==',postId).get();
    const pcSnap2 = await db.collection('challenges').where('type','==','1v1').where('challengeePostId','==',postId).get();
    chalCount = pcSnap.size + pcSnap2.size;
    [...pcSnap.docs,...pcSnap2.docs].forEach(doc => {
      const dd = doc.data();
      if (dd.status === 'active' && (!dd.expiresAt || dd.expiresAt.toDate() > new Date())) hasLive = true;
    });
  } catch(e) {}
  // Dynamic state
  let stateHTML = '';
  if (hasLive && chalCount > 0) {
    stateHTML = `<div class="live-capsule"><div class="live-dot"></div><span class="live-text">LIVE VOTING · ${chalCount} CHALLENGE${chalCount>1?'S':''}</span></div>`;
  } else if (chalCount > 0) {
    stateHTML = `<div class="chal-capsule"><i class="fa-solid fa-shield-halved" style="font-size:9px;color:var(--go);"></i><span class="chal-capsule-txt">IN ${chalCount} CHALLENGE${chalCount>1?'S':''}</span></div>`;
  }
  // Shield icon state
  const shieldLabel = chalCount > 0 ? 'Vote' : (isOwn ? 'Chals' : 'Challenge');
  const shieldClass = chalCount > 0 ? 'chal-ai-active' : '';
  const shieldOnClick = chalCount > 0
    ? `openChalVoteModal('${postId}','${esc(d.authorName||'')}',this)`
    : (isOwn ? `showToast('Go to Challenges tab to see yours.')` : `openC1v1Modal('${postId}','${d.authorId}','${esc(d.authorName||'')}','${d.authorUsername||''}','${d.thumbURL||d.mediaURL||''}')`);
  const avHTML = d.authorPhoto ? `<div class="tk-av" onclick="viewProfile('${d.authorId}')"><img src="${d.authorPhoto}"/></div>` : `<div class="tk-av" onclick="viewProfile('${d.authorId}')">${init}</div>`;
  div.innerHTML = `
    ${mediaHTML}
    <div class="tk-grad-t"></div><div class="tk-grad-b"></div>
    <div class="tk-mute" id="tk-mute-${postId}" onclick="toggleMute()"><i class="fa-solid ${isMuted?'fa-volume-xmark':'fa-volume-high'}"></i></div>
    <div class="tk-pause-ind" id="tk-pi-${postId}"><i class="fa-solid fa-pause"></i></div>
    <div class="tk-meta" id="tk-meta-${postId}">
      ${avHTML}
      <div class="tk-meta-info">
        <div class="tk-name" onclick="viewProfile('${d.authorId}')">${esc(d.authorName||'Creator')}</div>
        <div class="tk-urow" onclick="viewProfile('${d.authorId}')">
          <span class="tk-user">${esc(d.authorUsername||'')}</span>
          <div class="tk-lvl" id="tk-lvl-${postId}"><i class="fa-solid fa-arrow-up"></i><span>...</span></div>
        </div>
      </div>
      ${!isOwn?`<button class="tk-follow-btn" id="tk-fb-${postId}" onclick="toggleFollow('${d.authorId}','${postId}',this)">Follow</button>`:''}
    </div>
    <div class="tk-acts">
      <div class="tk-act tk-search" onclick="openSearch()"><div class="tk-ai"><i class="fa-solid fa-magnifying-glass"></i></div><span class="tk-ac">Search</span></div>
      <div class="tk-act" onclick="toggleLike('${postId}','${d.authorId}',this)" id="tk-like-${postId}">
        <div class="tk-ai" id="tk-like-ai-${postId}"><i class="fa-regular fa-heart"></i></div>
        <span class="tk-ac" id="tk-like-cnt-${postId}">${fmtN(d.likes||0)}</span>
      </div>
      <div class="tk-act" onclick="openComments('posts','${postId}')">
        <div class="tk-ai"><i class="fa-regular fa-comment-dots"></i></div>
        <span class="tk-ac" id="tk-com-cnt-${postId}">${fmtN(d.comments||0)}</span>
      </div>
      <div class="tk-act" id="gift-act" onclick="openGiftModal('${postId}','${d.authorId}','${esc(d.authorUsername||d.authorName||'')}')">
        <div class="tk-ai gift-ai"><i class="fa-solid fa-coins"></i></div>
        <span class="tk-ac" id="tk-gift-cnt-${postId}">${fmtN(d.giftClicks||0)}</span>
      </div>
      <div class="tk-act" id="chal-act" onclick="${shieldOnClick}">
        <div class="tk-ai ${shieldClass}"><i class="fa-solid fa-shield-halved"></i></div>
        <span class="tk-ac">${shieldLabel}</span>
      </div>
    </div>
    <div class="tk-bottom">
      <div class="tk-state">${stateHTML}</div>
      <div class="tk-caption">${(d.caption||'').replace(/#(\w+)/g,'<span class="ht">#$1</span>')}</div>
    </div>
    <div class="tk-prog"><div class="tk-prog-fill" id="tk-prog-${postId}"></div></div>`;
  // Async: load author level
  db.collection('users').doc(d.authorId).get().then(s => {
    if (!s.exists) return;
    const lv = getLevel(s.data());
    const lvEl = div.querySelector(`#tk-lvl-${postId} span`);
    if (lvEl) lvEl.textContent = lv.name.toUpperCase();
  });
  // Check liked
  db.collection('likes').doc(`${CU.uid}_${postId}`).get().then(s => {
    if (s.exists) {
      const ai = div.querySelector(`#tk-like-ai-${postId}`);
      if (ai) { ai.innerHTML = '<i class="fa-solid fa-heart" style="color:#ff3060"></i>'; ai.classList.add('liked'); }
    }
  });
  // Check following
  if (!isOwn) {
    db.collection('follows').doc(`${CU.uid}_${d.authorId}`).get().then(s => {
      const btn = div.querySelector(`#tk-fb-${postId}`);
      if (s.exists && btn) { btn.textContent='Following'; btn.classList.add('flw'); }
    });
  }
  // Delayed meta reveal
  setTimeout(() => { const m = div.querySelector(`#tk-meta-${postId}`); if(m) m.classList.add('show'); }, 1800);
  return div;
}

// Override buildTkPost since it became async — wrap in a sync shell
function buildTkPostSync(postId, d, idx) {
  // Return a placeholder div that gets populated
  const div = document.createElement('div');
  div.className = 'tk-post loading-post';
  div.dataset.postId = postId;
  div.innerHTML = `<div style="height:100%;display:flex;align-items:center;justify-content:center;"><div class="spin"></div></div>`;
  buildTkPost(postId, d, idx).then(fullDiv => {
    div.replaceWith(fullDiv);
    setupObserver();
  });
  return div;
}

function buildFeedChalCard(chalId, d) {
  const div = document.createElement('div');
  div.className = 'feed-chal-card';
  div.dataset.chalId = chalId;
  const isExpired = d.expiresAt && d.expiresAt.toDate() < new Date();
  const tot = (d.challengerVotes||0)+(d.challengeeVotes||0);
  const crPct = tot ? Math.round((d.challengerVotes||0)/tot*100) : 50;
  const cePct = 100-crPct;
  function sideHTML(sideId, mediaURL, mediaType, thumbURL, name, username, votes, pct, onTap) {
    let media = '';
    if (mediaURL) {
      if (mediaType==='video') {
        media = `${thumbURL?`<img id="${sideId}-thumb" src="${thumbURL}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;z-index:2;"/>`:''}
        <video id="${sideId}-fvid" src="${mediaURL}" playsinline muted loop preload="auto" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none;"></video>
        <div class="fcc-play-icon" id="${sideId}-fpi"><i class="fa-solid fa-play"></i></div>
        <div class="fcc-chal-mute" onclick="toggleFccMute(event)"><i class="fa-solid ${isMuted?'fa-volume-xmark':'fa-volume-high'}"></i></div>`;
      } else {
        media = `<img src="${mediaURL}" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;"/>`;
      }
    } else {
      media = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:36px;color:rgba(255,255,255,.3);">⏳</div>`;
    }
    return `<div class="fcc-side" onclick="${onTap}"><div class="fcc-media-wrap">${media}<div class="fcc-ov"><div class="fcc-cr-name">${esc(name||'')}<span>${esc(username||'')}</span></div><div class="fcc-votes">${fmtN(votes||0)}</div><div class="fcc-pct">${pct}%</div><div class="fcc-bar"><div class="fcc-bar-fill" style="width:${pct}%"></div></div></div></div></div>`;
  }
  const crHTML = sideHTML('fcc-cr',d.challengerMediaURL,d.challengerMediaType,d.challengerThumbURL,d.challengerName,d.challengerUsername,d.challengerVotes,crPct,`playFccVid('fcc-cr','fcc-ce','${chalId}')`);
  const ceHTML = sideHTML('fcc-ce',d.challengeeMediaURL,d.challengeeMediaType,d.challengeeThumbURL,d.challengeeName,d.challengeeUsername,d.challengeeVotes,cePct,`playFccVid('fcc-ce','fcc-cr','${chalId}')`);
  div.innerHTML = `
    <div class="fcc-glow"></div><div class="fcc-grid"></div>
    <div class="fcc-label"><span class="fcc-dot"></span>LIVE BATTLE · COMEDY</div>
    <div class="fcc-name">⚔️ <span>${esc(d.name||'Untitled')}</span></div>
    ${d.expiresAt?`<div class="fcc-timer"><span class="timer-chip">${isExpired?'Ended':timeLeft(d.expiresAt.toDate())}</span></div>`:''}
    <div class="fcc-posts" id="fcc-grid-${chalId}">
      ${crHTML}<div class="fcc-vs">VS</div>${ceHTML}
    </div>
    ${!isExpired?`<div class="fcc-vote-row">
      <button class="fcc-vbtn-a" id="fcc-va-${chalId}" onclick="voteFeed('${chalId}','challenger',this)">Vote ${esc(d.challengerName||'')}</button>
      <button class="fcc-vbtn-b" id="fcc-vb-${chalId}" onclick="voteFeed('${chalId}','challengee',this)">Vote ${esc(d.challengeeName||'')}</button>
    </div>`:`<div style="background:rgba(13,176,96,.08);border:1px solid rgba(13,176,96,.2);border-radius:8px;padding:10px 14px;display:flex;align-items:center;gap:8px;margin-bottom:10px;"><i class="fa-solid fa-trophy" style="color:var(--gr);"></i><p style="font-size:12px;color:rgba(255,255,255,.7);">🏆 ${(d.challengerVotes||0)>=(d.challengeeVotes||0)?esc(d.challengerName):esc(d.challengeeName)} wins!</p></div>`}
    <div class="fcc-com-bar">
      <div class="fcc-com-input-row">
        <div class="com-av-sm" style="border:1px solid rgba(255,255,255,.15);">${CUD.photoURL?`<img src="${CUD.photoURL}"/>`:(CUD.displayName||'?').charAt(0).toUpperCase()}</div>
        <div class="fcc-com-wrap"><input type="text" id="fcc-ci-${chalId}" placeholder="Comment on this battle..." maxlength="200" oninput="document.getElementById('fcc-cs-${chalId}').disabled=!this.value.trim()"/><button id="fcc-cs-${chalId}" class="fcc-com-send" disabled onclick="submitFccComment('${chalId}','fcc-ci-${chalId}','fcc-cp-${chalId}')"><i class="fa-solid fa-paper-plane"></i></button></div>
      </div>
      <div class="fcc-com-preview" id="fcc-cp-${chalId}"></div>
      <div class="fcc-see-all" onclick="viewBattle('${chalId}')">See full battle →</div>
    </div>
    <div class="fcc-skip" onclick="skipFeedCard(this)">↓ Continue scrolling</div>`;
  // Check voted
  db.collection('challengeVotes').doc(`${CU.uid}_${chalId}`).get().then(s => {
    if (!s.exists) return;
    const side = s.data().side;
    const btnA = document.getElementById(`fcc-va-${chalId}`);
    const btnB = document.getElementById(`fcc-vb-${chalId}`);
    if (btnA) { btnA.disabled=true; if(side==='challenger'){btnA.classList.add('voted');btnA.textContent='✓ Your Vote';} }
    if (btnB) { btnB.disabled=true; if(side==='challengee'){btnB.classList.add('voted');btnB.textContent='✓ Your Vote';} }
  });
  // Load preview comments
  loadFccComments(chalId);
  return div;
}

function skipFeedCard(el) {
  const card = el.closest('.feed-chal-card');
  card.scrollIntoView({block:'end',behavior:'smooth'});
}

let fccMuted = true;
function playFccVid(playId, pauseId, chalId) {
  const playVid = document.getElementById(playId+'-fvid');
  const pauseVid = document.getElementById(pauseId+'-fvid');
  const playThumb = document.getElementById(playId+'-thumb');
  const playIcon = document.getElementById(playId+'-fpi');
  if (!playVid) return;
  if (playVid.style.display==='none'||!playVid.style.display) {
    if (playThumb) playThumb.style.display='none';
    playVid.style.display='block';
    playVid.muted=fccMuted;
    playVid.play().catch(()=>{});
    if (playIcon) playIcon.classList.add('hidden-icon');
    if (pauseVid&&!pauseVid.paused) pauseVid.pause();
    const grid=document.getElementById(`fcc-grid-${chalId}`);
    if (grid){grid.classList.remove('cr-big','ce-big');grid.classList.add(playId==='fcc-cr'?'cr-big':'ce-big');}
  } else {
    if (playVid.paused) { playVid.play().catch(()=>{}); if(playIcon)playIcon.classList.add('hidden-icon'); }
    else { playVid.pause(); if(playIcon){playIcon.classList.remove('hidden-icon');} }
    if (pauseVid&&!pauseVid.paused) pauseVid.pause();
  }
}
function toggleFccMute(e) {
  e.stopPropagation();
  fccMuted=!fccMuted;
  document.querySelectorAll('[id$="-fvid"]').forEach(v=>{if(v.tagName==='VIDEO')v.muted=fccMuted;});
  document.querySelectorAll('.fcc-chal-mute i').forEach(i=>i.className=`fa-solid ${fccMuted?'fa-volume-xmark':'fa-volume-high'}`);
}

async function voteFeed(chalId, side, btn) {
  const voteRef = db.collection('challengeVotes').doc(`${CU.uid}_${chalId}`);
  const snap = await voteRef.get();
  if (snap.exists) { showToast('Already voted!'); return; }
  await voteRef.set({chalId,userId:CU.uid,side,createdAt:ts()});
  const upd = side==='challenger'?{challengerVotes:firebase.firestore.FieldValue.increment(1),totalVotes:firebase.firestore.FieldValue.increment(1)}:{challengeeVotes:firebase.firestore.FieldValue.increment(1),totalVotes:firebase.firestore.FieldValue.increment(1)};
  await db.collection('challenges').doc(chalId).update(upd);
  btn.classList.add('voted'); btn.textContent='✓ Voted!'; btn.disabled=true;
  document.querySelectorAll(`#fcc-va-${chalId},#fcc-vb-${chalId}`).forEach(b=>b.disabled=true);
  showToast('✓ Vote counted!');
}

async function submitFccComment(chalId, inputId, previewId) {
  const input=document.getElementById(inputId); if(!input)return;
  const text=input.value.trim(); if(!text)return;
  input.value=''; document.getElementById(`fcc-cs-${chalId}`).disabled=true;
  await db.collection('challenges').doc(chalId).collection('comments').add({
    authorId:CU.uid,authorName:CUD.displayName,authorUsername:CUD.username,
    authorPhoto:CUD.photoURL||null,text,createdAt:ts()
  });
  await db.collection('challenges').doc(chalId).update({comments:firebase.firestore.FieldValue.increment(1)});
  loadFccComments(chalId);
}

function loadFccComments(chalId) {
  const preview=document.getElementById(`fcc-cp-${chalId}`); if(!preview)return;
  db.collection('challenges').doc(chalId).collection('comments').orderBy('createdAt','desc').limit(2).onSnapshot(snap=>{
    preview.innerHTML='';
    snap.forEach(doc=>{
      const d=doc.data();
      const item=document.createElement('div');
      item.className='bc-com-item';
      const av=d.authorPhoto?`<div class="bc-com-item-av"><img src="${d.authorPhoto}"/></div>`:`<div class="bc-com-item-av">${(d.authorName||'?').charAt(0).toUpperCase()}</div>`;
      item.innerHTML=`${av}<div><div class="bc-com-item-un">${esc(d.authorUsername||'')}</div><div class="bc-com-item-txt">${esc(d.text)}</div></div>`;
      preview.appendChild(item);
    });
  });
}

// ── VIDEO OBSERVER ──
function setupObserver() {
  if (feedObserver) feedObserver.disconnect();
  feedObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
      const vid = e.target.querySelector('video.tk-video');
      if (!vid) return;
      if (e.isIntersecting) {
        curVideo=vid; vid.muted=isMuted; vid.play().catch(()=>{});
        startProg(e.target,vid);
      } else { vid.pause(); vid.currentTime=0; stopProg(); }
    });
  },{threshold:0.7});
  document.querySelectorAll('.tk-post').forEach(p=>feedObserver.observe(p));
}

function startProg(post,vid){
  stopProg();
  const fill=post.querySelector('.tk-prog-fill'); if(!fill)return;
  progInterval=setInterval(()=>{if(vid.duration)fill.style.width=(vid.currentTime/vid.duration*100)+'%';},100);
}
function stopProg(){if(progInterval)clearInterval(progInterval);}

function tapVid(vid,e){
  e.stopPropagation();
  const pid=vid.closest('.tk-post')?.dataset.postId;
  const pi=document.getElementById(`tk-pi-${pid}`);
  if(vid.paused){vid.play().catch(()=>{});if(pi){pi.querySelector('i').className='fa-solid fa-play';flashEl(pi);}}
  else{vid.pause();if(pi){pi.querySelector('i').className='fa-solid fa-pause';flashEl(pi);}}
}
function flashEl(el){el.classList.add('show');setTimeout(()=>el.classList.remove('show'),700);}
function toggleMute(){
  isMuted=!isMuted;
  if(curVideo)curVideo.muted=isMuted;
  document.querySelectorAll('[id^="tk-mute-"] i').forEach(i=>i.className=`fa-solid ${isMuted?'fa-volume-xmark':'fa-volume-high'}`);
}

// ── LIKE ──
async function toggleLike(postId, authorId, btn) {
  const lid=`${CU.uid}_${postId}`;
  const ref=db.collection('likes').doc(lid);
  const ai=document.getElementById(`tk-like-ai-${postId}`);
  const cnt=document.getElementById(`tk-like-cnt-${postId}`);
  const snap=await ref.get();
  if(snap.exists){
    await ref.delete();
    await db.collection('posts').doc(postId).update({likes:firebase.firestore.FieldValue.increment(-1)});
    if(ai){ai.innerHTML='<i class="fa-regular fa-heart"></i>';ai.classList.remove('liked');}
  }else{
    await ref.set({postId,userId:CU.uid,authorId,createdAt:ts()});
    await db.collection('posts').doc(postId).update({likes:firebase.firestore.FieldValue.increment(1)});
    if(ai){ai.innerHTML='<i class="fa-solid fa-heart" style="color:#ff3060"></i>';ai.classList.add('liked');ai.style.transform='scale(1.3)';setTimeout(()=>ai.style.transform='',200);}
    if(authorId!==CU.uid)addNotif(authorId,'like',`${CUD.username} liked your post.`,'posts',postId);
  }
  // Refresh count
  const fresh=await db.collection('posts').doc(postId).get();
  if(fresh.exists&&cnt)cnt.textContent=fmtN(fresh.data().likes||0);
}

// ── FOLLOW ──
async function toggleFollow(uid,postId,btn){
  const fid=`${CU.uid}_${uid}`;
  const ref=db.collection('follows').doc(fid);
  const snap=await ref.get();
  if(snap.exists){
    await ref.delete();
    await db.collection('users').doc(uid).update({followers:firebase.firestore.FieldValue.increment(-1)});
    await db.collection('users').doc(CU.uid).update({following:firebase.firestore.FieldValue.increment(-1)});
    if(btn){btn.textContent='Follow';btn.classList.remove('flw');}
  }else{
    await ref.set({followerId:CU.uid,followingId:uid,createdAt:ts()});
    await db.collection('users').doc(uid).update({followers:firebase.firestore.FieldValue.increment(1)});
    await db.collection('users').doc(CU.uid).update({following:firebase.firestore.FieldValue.increment(1)});
    if(btn){btn.textContent='Following';btn.classList.add('flw');}
    addNotif(uid,'follow',`${CUD.username} followed you.`,'','');
  }
}

// ─────────────────────────────────────────────
// CHALLENGE VOTE MODAL (from post shield)
// ─────────────────────────────────────────────
async function openChalVoteModal(postId, authorName, btn) {
  document.getElementById('chal-vote-modal').classList.remove('hidden');
  document.getElementById('cvm-subtitle').textContent = `${authorName}'s post is in these active challenges. Tap to vote.`;
  const list = document.getElementById('chal-vote-list');
  list.innerHTML = '<div class="loading"><div class="spin dark"></div></div>';
  // Fetch challenges this post is in
  const snaps = await Promise.all([
    db.collection('challenges').where('challengerPostId','==',postId).where('type','==','1v1').get(),
    db.collection('challenges').where('challengeePostId','==',postId).where('type','==','1v1').get()
  ]);
  const chals = [];
  [...snaps[0].docs,...snaps[1].docs].forEach(doc=>{
    if(!chals.find(c=>c.id===doc.id))chals.push({id:doc.id,...doc.data()});
  });
  if(chals.length===0){list.innerHTML='<div class="empty"><i class="fa-solid fa-shield-halved"></i><p>No active challenges for this post yet.</p></div>';return;}
  list.innerHTML='';
  chals.forEach(d=>{
    const isExpired=d.expiresAt&&d.expiresAt.toDate()<new Date();
    const row=document.createElement('div');
    row.className='cvm-row';
    const crThumb=d.challengerThumbURL||d.challengerMediaURL;
    const ceThumb=d.challengeeThumbURL||d.challengeeMediaURL;
    const tot=(d.challengerVotes||0)+(d.challengeeVotes||0);
    const crP=tot?Math.round((d.challengerVotes||0)/tot*100):50;
  row.innerHTML = `
      <div class="cvm-top"><div class="cvm-name">${esc(d.name||'Battle')}</div><div class="cvm-timer">${isExpired?'Ended':timeLeft(d.expiresAt?.toDate())}</div></div>
      <div class="cvm-thumbs">
        <div class="cvm-thumb">${crThumb?`<img src="${crThumb}"/>`:'<div class="cvm-thumb-placeholder">🎭</div>'}</div>
        <div style="flex:1;min-width:0;">
          <div class="cvm-cr-name">${esc(d.challengerName||'')}<span>${esc(d.challengerUsername||'')}</span></div>
          <div class="cvm-votes">${fmtN(d.challengerVotes||0)} <span style="font-family:Space Mono,monospace;font-size:8px;color:var(--mu);font-weight:400;">votes</span></div>
        </div>
        <div class="cvm-vs-lbl">VS</div>
        <div style="flex:1;min-width:0;text-align:right;">
          <div class="cvm-cr-name">${esc(d.challengeeName||'')}<span>${esc(d.challengeeUsername||'')}</span></div>
          <div class="cvm-votes">${fmtN(d.challengeeVotes||0)} <span style="font-family:Space Mono,monospace;font-size:8px;color:var(--mu);font-weight:400;">votes</span></div>
        </div>
        <div class="cvm-thumb">${ceThumb?`<img src="${ceThumb}"/>`:'<div class="cvm-thumb-placeholder">⏳</div>'}</div>
      </div>
      <div class="cvm-footer"><div class="cvm-footer-lbl">${tot} votes · ${isExpired?'Ended':timeLeft(d.expiresAt?.toDate())}</div><div class="cvm-go" onclick="closeModal('chal-vote-modal');goToBattle('${d.id}')">View Battle →</div></div>`;
    list.appendChild(row);
  });
}

// ─────────────────────────────────────────────
// CREATE 1V1 MODAL
// ─────────────────────────────────────────────
async function openC1v1Modal(targetPostId, targetAuthorId, targetName, targetUsername, targetThumb) {
  c1PostTarget={postId:targetPostId,authorId:targetAuthorId,name:targetName,username:targetUsername,thumb:targetThumb};
  c1SelPost=null; c1MediaFile=null;
  // Set target card
  const tc=document.getElementById('c1-target');
  tc.innerHTML=`<div class="c1t-thumb">${targetThumb?`<img src="${targetThumb}"/>`:'<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:24px;">🎭</div>'}</div><div class="c1t-info"><div class="lbl">CHALLENGING THIS POST BY</div><div class="nm">${esc(targetName)}</div><div class="un">${esc(targetUsername)}</div></div>`;
  document.getElementById('c1-name').value='';
  document.getElementById('c1-err').classList.add('hidden');
  document.getElementById('create-1v1-modal').classList.remove('hidden');
  // Load my posts
  loadMyPostsForPicker('c1-existing','c1Sel');
}

async function loadMyPostsForPicker(listId, selKey) {
  const list=document.getElementById(listId); if(!list)return;
  list.innerHTML='<div class="loading" style="padding:14px;"><div class="spin dark"></div></div>';
  const snap=await db.collection('posts').where('authorId','==',CU.uid).orderBy('createdAt','desc').limit(12).get();
  if(snap.empty){list.innerHTML='<div style="font-size:12px;color:var(--mu);padding:10px;text-align:center;">No posts yet. Create a post first or use New Post.</div>';return;}
  list.innerHTML='';
  if(selKey==='c1Sel')c1SelPost=null;
  else if(selKey==='joinSel')joinSelPost=null;
  snap.forEach(doc=>{
    const d=doc.data();
    const item=document.createElement('div');
    item.className='ep-item';
    const thumb=d.thumbURL||d.mediaURL;
    const thumbHTML=thumb?(d.mediaType==='video'?`<img src="${d.thumbURL||d.mediaURL}" style="width:100%;height:100%;object-fit:cover;"/>`:`<img src="${d.mediaURL}" style="width:100%;height:100%;object-fit:cover;"/>`):`<span>🎭</span>`;
    item.innerHTML=`<div class="ep-thumb">${thumbHTML}</div><div class="ep-info" style="flex:1;min-width:0;"><p>${esc((d.caption||'No caption').substring(0,50))}</p><small>${d.createdAt?timeAgo(d.createdAt.toDate()):'recently'}</small></div><i class="fa-regular fa-circle-check ep-check"></i>`;
    item.onclick=()=>{
      document.querySelectorAll(`#${listId} .ep-item`).forEach(i=>{i.classList.remove('sel');i.querySelector('.ep-check').className='fa-regular fa-circle-check ep-check';});
      item.classList.add('sel');item.querySelector('.ep-check').className='fa-solid fa-circle-check ep-check';
      const post={postId:doc.id,caption:d.caption,mediaURL:d.mediaURL,mediaType:d.mediaType,thumbURL:d.thumbURL||null};
      if(selKey==='c1Sel')c1SelPost=post;
      else if(selKey==='joinSel')joinSelPost=post;
    };
    list.appendChild(item);
  });
}

function setPickTab(el, tab) {
  const parent=el.closest('.post-form,.modal-sheet');
  if(!parent)return;
  parent.querySelectorAll('.ptab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  // Determine which sections to toggle
  const existing=parent.querySelector('[id$="-existing"],[id="c1-existing"],[id="join-existing"]');
  const newSec=parent.querySelector('[id$="-new"],[id="c1-new"],[id="join-new"]');
  if(existing)existing.classList.toggle('hidden',tab!=='existing'&&tab!=='c1-existing'&&tab!=='join-existing'&&tab==='new'&&tab==='c1-new'&&tab==='join-new');
  if(newSec)newSec.classList.toggle('hidden',tab!=='new'&&tab!=='c1-new'&&tab!=='join-new');
  // Simpler: just check last segment
  const t=tab.split('-').pop();
  if(existing)existing.classList.toggle('hidden',t!=='existing');
  if(newSec)newSec.classList.toggle('hidden',t!=='new');
}

let prevC1MediaFile=null;
function prevC1Media(input){const f=input.files[0];if(!f)return;c1MediaFile=f;showMPrev(f,'c1-media-prev',null);}

async function submitC1v1() {
  if(!c1PostTarget){closeModal('create-1v1-modal');return;}
  const name=document.getElementById('c1-name').value.trim();
  const expiry=parseInt(document.getElementById('c1-expiry').value);
  const err=document.getElementById('c1-err');
  err.classList.add('hidden');
  if(!name){showErr(err,'Give the challenge a name.');return;}
  const isNew=!document.getElementById('c1-new').classList.contains('hidden');
  if(isNew&&!c1MediaFile&&!document.getElementById('c1-cap').value.trim()){showErr(err,'Add a caption or media.');return;}
  if(!isNew&&!c1SelPost){showErr(err,'Select one of your posts.');return;}
  const btn=document.querySelector('#create-1v1-modal .btn-or');
  setBtnLoad(btn,true);
  try{
    let entryPostId,cap,mURL,mType,tURL;
    if(isNew){
      cap=document.getElementById('c1-cap').value.trim();
      if(c1MediaFile){showToast('Uploading...');const res=await uploadWithThumb(c1MediaFile,`posts/${CU.uid}`);mURL=res.url;mType=res.type;tURL=res.thumbURL;}
      const pRef=await db.collection('posts').add({authorId:CU.uid,authorName:CUD.displayName,authorUsername:CUD.username,authorPhoto:CUD.photoURL||null,caption:cap,niche:'comedy',mediaURL:mURL||null,mediaType:mType||null,thumbURL:tURL||null,likes:0,comments:0,giftClicks:0,createdAt:ts()});
      await db.collection('users').doc(CU.uid).update({postCount:firebase.firestore.FieldValue.increment(1)});
      CUD.postCount=(CUD.postCount||0)+1;
      entryPostId=pRef.id;
    }else{
      entryPostId=c1SelPost.postId;cap=c1SelPost.caption;mURL=c1SelPost.mediaURL;mType=c1SelPost.mediaType;tURL=c1SelPost.thumbURL;
    }
    const expiresAt=new Date(Date.now()+expiry*24*60*60*1000);
    const chalRef=await db.collection('challenges').add({
      type:'1v1',name,niche:'comedy',
      challengerId:CU.uid,challengerUsername:CUD.username,challengerName:CUD.displayName,challengerPhoto:CUD.photoURL||null,
      challengerPostId:entryPostId,challengerCaption:cap||'',challengerMediaURL:mURL||null,challengerMediaType:mType||null,challengerThumbURL:tURL||null,challengerVotes:0,
      challengeeId:c1PostTarget.authorId,challengeeUsername:c1PostTarget.username,challengeeName:c1PostTarget.name,challengeePhoto:null,
      challengeePostId:c1PostTarget.postId,challengeeCaption:'',challengeeMediaURL:null,challengeeMediaType:null,challengeeThumbURL:c1PostTarget.thumb||null,challengeeVotes:0,
      status:'pending',expiresAt,entryCount:2,totalVotes:0,comments:0,
      participants:[CU.uid,c1PostTarget.authorId],createdAt:ts()
    });
    await db.collection('users').doc(c1PostTarget.authorId).update({challengeRequestsReceived:firebase.firestore.FieldValue.increment(1)});
    addNotif(c1PostTarget.authorId,'chal',`${CUD.username} challenged your post to a 1v1! Tap to respond.`,'challenges',chalRef.id);
    closeModal('create-1v1-modal');
    showToast('⚔️ Challenge sent!');
    // Update badge
    await updateBadges(CU.uid);
  }catch(e){showErr(err,e.message);}
  setBtnLoad(btn,false,'<i class="fa-solid fa-shield-halved"></i> <span>Send Challenge</span>');
}

// ─────────────────────────────────────────────
// RESPOND TO CHALLENGE
// ─────────────────────────────────────────────
async function showRespondChallenge(chalId) {
  const snap=await db.collection('challenges').doc(chalId).get();
  if(!snap.exists)return;
  respondChalData={...snap.data(),chalId};
  const d=respondChalData;
  const body=document.getElementById('respond-body');
  const crThumb=d.challengerThumbURL||d.challengerMediaURL;
  const ceThumb=d.challengeeThumbURL||d.challengeeMediaURL;
  body.innerHTML=`
    <div class="respond-hero">
      <div class="respond-hero-name">⚔️ ${esc(d.name||'Challenge Request')}</div>
      <div class="respond-hero-meta">
        <span><i class="fa-regular fa-clock"></i> ${d.expiresAt?timeLeft(d.expiresAt.toDate()):'No expiry'}</span>
        <span><i class="fa-solid fa-masks-theater"></i> Comedy</span>
      </div>
      <div class="respond-posts">
        <div class="respond-side">
          <div class="respond-side-label">CHALLENGER'S POST</div>
          <div class="respond-side-name">${esc(d.challengerName||'')}</div>
          <div class="respond-side-un">${esc(d.challengerUsername||'')}</div>
          ${crThumb?`<img class="respond-media" src="${crThumb}"/>`:'<div class="respond-media" style="background:var(--deep);display:flex;align-items:center;justify-content:center;font-size:36px;">🎭</div>'}
        </div>
        <div class="respond-side">
          <div class="respond-side-label">YOUR POST (BEING CHALLENGED)</div>
          <div class="respond-side-name">${esc(CUD.displayName)}</div>
          <div class="respond-side-un">${esc(CUD.username||'')}</div>
          ${ceThumb?`<img class="respond-media" src="${ceThumb}"/>`:'<div class="respond-media" style="background:var(--deep);display:flex;align-items:center;justify-content:center;font-size:36px;">🎭</div>'}
        </div>
      </div>
    </div>
    <div class="respond-body">
      <div class="respond-note"><i class="fa-solid fa-info-circle"></i><p>Your specific post is already selected as the challenged post. You just need to accept or decline. If you accept, voting opens immediately and fans decide the winner.</p></div>
      <div class="respond-btns">
        <button class="resp-accept" onclick="acceptChallenge('${chalId}')"><i class="fa-solid fa-check"></i> Accept Challenge</button>
        <button class="resp-decline" onclick="declineChallenge('${chalId}')">Decline</button>
      </div>
    </div>`;
  prevScr=curScr; curScr='respond-challenge';
  document.querySelectorAll('.scr').forEach(s=>s.classList.remove('active'));
  document.getElementById('scr-respond-challenge').classList.add('active');
}

async function acceptChallenge(chalId) {
  await db.collection('challenges').doc(chalId).update({status:'active',acceptedAt:ts()});
  await db.collection('users').doc(respondChalData?.challengerId).update({challengeCount:firebase.firestore.FieldValue.increment(1)}).catch(()=>{});
  await db.collection('users').doc(CU.uid).update({challengeCount:firebase.firestore.FieldValue.increment(1)}).catch(()=>{});
  if(respondChalData?.challengerId) addNotif(respondChalData.challengerId,'chal',`${CUD.username} accepted your challenge! Voting is now open.`,'challenges',chalId);
  showToast('✓ Challenge accepted! Voting is open.');
  showScr('challenges');
}

async function declineChallenge(chalId) {
  await db.collection('challenges').doc(chalId).update({status:'declined'});
  showToast('Challenge declined.');
  showScr('challenges');
}

// ─────────────────────────────────────────────
// CHALLENGES PAGE
// ─────────────────────────────────────────────
function setChalTab(el) {
  document.querySelectorAll('.ctab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  chalTab=el.dataset.t;
  initChallenges();
}

function initChallenges() {
  const body=document.getElementById('chal-body');
  body.innerHTML='<div class="loading"><div class="spin dark"></div><span>Loading...</span></div>';
  if(chalUnsub)chalUnsub();
  if(chalTab==='battles') initBattles();
  else if(chalTab==='community') initCommunity();
  else if(chalTab==='leaderboard') initLeaderboard();
}

function initBattles() {
  const body=document.getElementById('chal-body');
  const feed=document.createElement('div');
  feed.className='battles-feed';
  body.innerHTML='';
  body.appendChild(feed);
  const q=db.collection('challenges').where('type','==','1v1').orderBy('createdAt','desc').limit(20);
  chalUnsub=q.onSnapshot(snap=>{
    feed.innerHTML='';
    if(snap.empty){
      feed.innerHTML=`<div style="height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:16px;padding:40px;text-align:center;color:rgba(255,255,255,.5);"><i class="fa-solid fa-shield-halved" style="font-size:44px;opacity:.3;"></i><h3 style="color:#fff;font-size:17px;font-family:Bebas Neue,sans-serif;letter-spacing:1px;">No battles yet</h3><p style="font-size:13px;line-height:1.6;">Challenge someone from the feed to start the first battle!</p><button class="btn-or" onclick="showScr('feed')"><i class="fa-solid fa-clapperboard"></i> Go To Feed</button></div>`;
      return;
    }
    snap.forEach(doc=>feed.appendChild(buildBattleCard(doc.id,doc.data())));
  },err=>{
    body.innerHTML='<div class="empty"><i class="fa-solid fa-database"></i><p>Index building... Check Firebase console for a link and click Create Index.</p></div>';
  });
}

function buildBattleCard(chalId, d) {
  const div = document.createElement('div');
div.className = 'battle-card';
div.dataset.chalId = chalId;
  const isExpired=d.expiresAt&&d.expiresAt.toDate()<new Date();
  const isPending=d.status==='pending';
  const isActive=d.status==='active';
  const tot=(d.challengerVotes||0)+(d.challengeeVotes||0);
  const crPct=tot?Math.round((d.challengerVotes||0)/tot*100):50;
  const cePct=100-crPct;
  const iAmChallengee=d.challengeeId===CU.uid;
  const iAmChallenger=d.challengerId===CU.uid;
  function bSide(sideId,mURL,mType,tURL,name,uname,votes,pct){
    if(!mURL)return`<div class="bc-mwrap" style="display:flex;align-items:center;justify-content:center;"><span style="font-size:${isPending?'20px':'36px'};color:rgba(255,255,255,.3);">${isPending&&iAmChallengee?'Your post':'⏳'}</span></div>`;
    if(mType==='video')return`<div class="bc-mwrap">${tURL?`<img id="${sideId}-thumb" src="${tURL}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:2;"/>`:''}
      <video id="${sideId}-vid" src="${mURL}" playsinline muted loop preload="auto" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none;"></video>
      <div class="bc-play-icon" id="${sideId}-pi"><i class="fa-solid fa-play"></i></div>
      <div class="bc-pause-ind" id="${sideId}-pause"><i class="fa-solid fa-pause"></i></div>
      <div class="bc-mute-btn" onclick="toggleBcMute(event)"><i class="fa-solid ${isMuted?'fa-volume-xmark':'fa-volume-high'}"></i></div>
      <div class="bc-ov"><div class="bc-cr-name">${esc(name||'')}<span>${esc(uname||'')}</span></div><div class="bc-votes">${fmtN(votes||0)}</div><div class="bc-pct">${pct}%</div><div class="bc-bar"><div class="bc-bar-fill" style="width:${pct}%"></div></div></div></div>`;
    return`<div class="bc-mwrap"><img src="${mURL}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;"/><div class="bc-ov"><div class="bc-cr-name">${esc(name||'')}<span>${esc(uname||'')}</span></div><div class="bc-votes">${fmtN(votes||0)}</div><div class="bc-pct">${pct}%</div><div class="bc-bar"><div class="bc-bar-fill" style="width:${pct}%"></div></div></div></div>`;
  }
  let actionHTML='';
  if(isPending&&iAmChallengee){
    actionHTML=`<div class="bc-accept-row"><button class="bc-accept" onclick="showRespondChallenge('${chalId}')"><i class="fa-solid fa-check"></i> Accept Challenge</button><button class="bc-decline" onclick="declineChallenge('${chalId}')">Decline</button></div>`;
  }else if(isPending){
    actionHTML=`<div class="bc-pending"><i class="fa-regular fa-clock"></i><p>Waiting for ${esc(d.challengeeName||'')} to accept your challenge.</p></div>`;
  }else if(isActive&&!isExpired){
    actionHTML=`<div class="bc-vote-row"><button class="bc-vbtn-a" id="bc-va-${chalId}" onclick="voteBattle('${chalId}','challenger',this)">Vote ${esc(d.challengerName||'')}</button><button class="bc-vbtn-b" id="bc-vb-${chalId}" onclick="voteBattle('${chalId}','challengee',this)">Vote ${esc(d.challengeeName||'')}</button></div>`;
  }else if(isExpired){
    const winner=(d.challengerVotes||0)>=(d.challengeeVotes||0)?d.challengerName:d.challengeeName;
    actionHTML=`<div class="bc-won"><i class="fa-solid fa-trophy"></i><p>🏆 <strong>${esc(winner)}</strong> wins this battle!</p></div>`;
  }
  div.innerHTML=`
    <div class="bc-glow"></div><div class="bc-grid"></div>
    <div class="bc-top">
      <div class="bc-name">⚔️ <span>${esc(d.name||'Untitled')}</span></div>
      ${d.expiresAt?`<div class="bc-timer-chip">${isExpired?'Ended':timeLeft(d.expiresAt.toDate())}</div>`:''}
    </div>
    <div class="bc-posts" id="bc-grid-${chalId}">
      <div class="bc-side" onclick="playBcVid('bc-cr','bc-ce','${chalId}')">${bSide('bc-cr',d.challengerMediaURL,d.challengerMediaType,d.challengerThumbURL,d.challengerName,d.challengerUsername,d.challengerVotes,crPct)}</div>
      <div class="bc-vs">VS</div>
      <div class="bc-side" onclick="playBcVid('bc-ce','bc-cr','${chalId}')">${bSide('bc-ce',d.challengeeMediaURL,d.challengeeMediaType,d.challengeeThumbURL,d.challengeeName,d.challengeeUsername,d.challengeeVotes,cePct)}</div>
    </div>
    ${actionHTML}
    <div class="bc-inline-comments">
      <div class="bc-com-hdr"><div class="bc-com-title">COMMENTS</div><div class="bc-com-count" id="bc-cc-${chalId}">${fmtN(d.comments||0)}</div></div>
      <div class="bc-com-input-row">
        <div class="bc-com-av">${CUD.photoURL?`<img src="${CUD.photoURL}"/>`:(CUD.displayName||'?').charAt(0).toUpperCase()}</div>
        <div class="bc-com-wrap"><input type="text" id="bc-ci-${chalId}" placeholder="Comment on this battle..." maxlength="200" oninput="document.getElementById('bc-cs-${chalId}').disabled=!this.value.trim()"/><button id="bc-cs-${chalId}" class="bc-com-send" disabled onclick="submitBcComment('${chalId}','bc-ci-${chalId}','bc-cp-${chalId}')"><i class="fa-solid fa-paper-plane"></i></button></div>
      </div>
      <div class="bc-com-preview" id="bc-cp-${chalId}"></div>
      <div class="bc-see-all" onclick="openComments('challenges','${chalId}')">See all comments →</div>
    </div>`;
  // Check voted, load comments
  setTimeout(()=>{
    checkBattleVoted(chalId);
    loadBcComments(chalId);
  },100);
  return div;
}

let bcMuted=true;
function playBcVid(playId,pauseId,chalId){
  const pv=document.getElementById(playId+'-vid'),pav=document.getElementById(pauseId+'-vid');
  const pt=document.getElementById(playId+'-thumb'),pi=document.getElementById(playId+'-pi'),pause=document.getElementById(playId+'-pause');
  if(!pv)return;
  if(pv.style.display!=='block'){
    if(pt)pt.style.display='none';
    pv.style.display='block';pv.muted=bcMuted;pv.play().catch(()=>{});
    if(pi)pi.classList.add('gone');
    if(pav)pav.pause();
    const grid=document.getElementById(`bc-grid-${chalId}`);
    if(grid){grid.classList.remove('cr-big','ce-big');grid.classList.add(playId==='bc-cr'?'cr-big':'ce-big');}
  }else{
    if(pv.paused){pv.play().catch(()=>{});if(pi)pi.classList.add('gone');if(pause)flashEl(pause);}
    else{pv.pause();if(pi)pi.classList.remove('gone');if(pause)flashEl(pause);}
    if(pav&&!pav.paused)pav.pause();
  }
}
function toggleBcMute(e){
  e.stopPropagation();bcMuted=!bcMuted;
  document.querySelectorAll('[id$="-vid"]').forEach(v=>{if(v.tagName==='VIDEO')v.muted=bcMuted;});
  document.querySelectorAll('.bc-mute-btn i').forEach(i=>i.className=`fa-solid ${bcMuted?'fa-volume-xmark':'fa-volume-high'}`);
}

async function voteBattle(chalId,side,btn){
  const ref=db.collection('challengeVotes').doc(`${CU.uid}_${chalId}`);
  const snap=await ref.get();
  if(snap.exists){showToast('Already voted!');return;}
  await ref.set({chalId,userId:CU.uid,side,createdAt:ts()});
  const upd=side==='challenger'?{challengerVotes:firebase.firestore.FieldValue.increment(1),totalVotes:firebase.firestore.FieldValue.increment(1)}:{challengeeVotes:firebase.firestore.FieldValue.increment(1),totalVotes:firebase.firestore.FieldValue.increment(1)};
  await db.collection('challenges').doc(chalId).update(upd);
  btn.classList.add('voted');btn.textContent='✓ Voted!';btn.disabled=true;
  document.querySelectorAll(`#bc-va-${chalId},#bc-vb-${chalId}`).forEach(b=>b.disabled=true);
  showToast('✓ Vote counted!');
}
async function checkBattleVoted(chalId){
  const snap=await db.collection('challengeVotes').doc(`${CU.uid}_${chalId}`).get();
  if(!snap.exists)return;
  const side=snap.data().side;
  const btnA=document.getElementById(`bc-va-${chalId}`),btnB=document.getElementById(`bc-vb-${chalId}`);
  if(btnA){btnA.disabled=true;if(side==='challenger'){btnA.classList.add('voted');btnA.textContent='✓ Your Vote';}}
  if(btnB){btnB.disabled=true;if(side==='challengee'){btnB.classList.add('voted');btnB.textContent='✓ Your Vote';}}
}
async function submitBcComment(chalId,inputId,previewId){
  const input=document.getElementById(inputId);if(!input)return;
  const text=input.value.trim();if(!text)return;
  input.value='';document.getElementById(`bc-cs-${chalId}`).disabled=true;
  await db.collection('challenges').doc(chalId).collection('comments').add({authorId:CU.uid,authorName:CUD.displayName,authorUsername:CUD.username,authorPhoto:CUD.photoURL||null,text,createdAt:ts()});
  await db.collection('challenges').doc(chalId).update({comments:firebase.firestore.FieldValue.increment(1)});
  loadBcComments(chalId);
}
function loadBcComments(chalId){
  const el=document.getElementById(`bc-cp-${chalId}`);if(!el)return;
  db.collection('challenges').doc(chalId).collection('comments').orderBy('createdAt','desc').limit(2).onSnapshot(snap=>{
    el.innerHTML='';
    snap.forEach(doc=>{const d=doc.data();const item=document.createElement('div');item.className='bc-com-item';const av=d.authorPhoto?`<div class="bc-com-item-av"><img src="${d.authorPhoto}"/></div>`:`<div class="bc-com-item-av">${(d.authorName||'?').charAt(0).toUpperCase()}</div>`;item.innerHTML=`${av}<div><div class="bc-com-item-un">${esc(d.authorUsername||'')}</div><div class="bc-com-item-txt">${esc(d.text)}</div></div>`;el.appendChild(item);});
  });
}

function viewBattle(chalId){
  closeModal('chal-vote-modal');
  showScr('challenges');
  // Switch to battles tab and scroll to that challenge
  document.querySelectorAll('.ctab').forEach(t=>{if(t.dataset.t==='battles'){t.click();}});
  setTimeout(()=>{
    const card=document.querySelector(`[data-chal-id="${chalId}"],.battle-card`);
    if(card)card.scrollIntoView({behavior:'smooth'});
  },500);
}

// ── COMMUNITY ──
function initCommunity(){
  const body=document.getElementById('chal-body');
  const wrap=document.createElement('div');wrap.className='community-list';body.innerHTML='';body.appendChild(wrap);
  const q=db.collection('challenges').where('type','==','community').orderBy('createdAt','desc').limit(30);
  chalUnsub=q.onSnapshot(snap=>{
    wrap.innerHTML='';
    if(snap.empty){wrap.innerHTML=`<div class="empty"><i class="fa-solid fa-trophy"></i><p>No community challenges yet.</p><button class="btn-or" onclick="showScr('create-community')"><i class="fa-solid fa-plus"></i> Create First Challenge</button></div>`;return;}
    snap.forEach(doc=>{wrap.appendChild(buildCCCard(doc.id,doc.data()));});
  });
}
function buildCCCard(id,d){
  const div=document.createElement('div');div.className='cc-card';
  div.innerHTML=`<div class="cc-card-top"><div class="cc-card-type"><i class="fa-solid fa-trophy"></i> COMMUNITY</div><div class="cc-card-badge">OPEN</div></div><div class="cc-card-name">${esc(d.name||'Challenge')}</div><div class="cc-card-meta"><span><i class="fa-solid fa-users"></i>${d.entryCount||0} entries</span><span><i class="fa-regular fa-thumbs-up"></i>${d.totalVotes||0} votes</span><span>by ${esc(d.creatorUsername||'')}</span></div>`;
  div.onclick=()=>viewCommunityChallenge(id,d);
  return div;
}
async function viewCommunityChallenge(id,d){
  prevScr=curScr;curScr='join-community';
  document.querySelectorAll('.scr').forEach(s=>s.classList.remove('active'));
  document.getElementById('scr-join-community').classList.add('active');
  joinChalTarget={...d,chalId:id};
  document.getElementById('joining-info').innerHTML=`<div class="jt">${esc(d.name)}</div><div class="jm">${d.entryCount||0} entries · by ${esc(d.creatorUsername||'')}</div>`;
  loadMyPostsForPicker('join-existing','joinSel');
}

// ── LEADERBOARD ──
async function initLeaderboard(){
  const body=document.getElementById('chal-body');
  const wrap=document.createElement('div');wrap.className='leaderboard-wrap';body.innerHTML='';body.appendChild(wrap);
  wrap.innerHTML='<div class="loading"><div class="spin dark"></div><span>Loading leaderboard...</span></div>';
  try{
    const snap=await db.collection('users').orderBy('challengeWins','desc').limit(50).get();
    if(snap.empty){wrap.innerHTML='<div class="empty"><i class="fa-solid fa-chart-bar"></i><p>No rankings yet. Win a challenge to appear here.</p></div>';return;}
    wrap.innerHTML=`<div class="lb-header"><h3>🏆 Comedy Leaderboard</h3><p>RANKED BY CHALLENGE WINS</p></div>`;
    snap.docs.forEach((doc,i)=>{
      const u=doc.data();const lv=getLevel(u);
      const badges=computeBadges(u);
      const rankClass=i===0?'top1':i===1?'top2':i===2?'top3':'';
      const rankLabel=i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1).toString();
      const row=document.createElement('div');row.className=`lb-row ${rankClass}`;
      const avHTML=u.photoURL?`<div class="lb-av"><img src="${u.photoURL}"/></div>`:`<div class="lb-av">${(u.displayName||'?').charAt(0).toUpperCase()}</div>`;
      const trend=u.challengeWins>u.challengeLosses?'up':u.challengeWins<u.challengeLosses?'dn':'sm';
      const trendIcon=trend==='up'?'↑':trend==='dn'?'↓':'—';
      row.innerHTML=`<div class="lb-rank ${i<3?['rk1','rk2','rk3'][i]:'rkn'}">${rankLabel}</div>${avHTML}<div class="lb-info"><div class="lb-name">${esc(u.displayName||'')}</div><div class="lb-user">${esc((u.username||'').split('@')[0])}<span>@comedy</span></div><div class="lb-badges">${renderBadges(badges)}<span class="badge-pill ${i<3?['badge-unbeaten','badge-defender','badge-rising'][i]:'badge-veteran'}" style="font-size:7px;">${lv.name.toUpperCase()}</span></div></div><div class="lb-right"><div class="lb-wins">${u.challengeWins||0}</div><div class="lb-wins-lbl">WINS</div><div class="lb-trend ${trend}">${trendIcon} ${Math.abs((u.challengeWins||0)-(u.challengeLosses||0))}</div></div>`;
      row.onclick=()=>viewProfile(u.uid);
      wrap.appendChild(row);
    });
  }catch(e){wrap.innerHTML='<div class="empty"><i class="fa-solid fa-database"></i><p>Setting up leaderboard index... Check Firebase console.</p></div>';}
}

// ─────────────────────────────────────────────
// COMMUNITY CHALLENGE CREATION
// ─────────────────────────────────────────────
function prevCCMedia(input){const f=input.files[0];if(!f)return;ccMediaFile=f;showMPrev(f,'cc-media-prev',null);}
async function submitCC(){
  const name=document.getElementById('cc-name').value.trim();
  const desc=document.getElementById('cc-desc').value.trim();
  const cap=document.getElementById('cc-cap').value.trim();
  const err=document.getElementById('cc-err');
  err.classList.add('hidden');
  if(!name){showErr(err,'Give the challenge a name.');return;}
  if(!cap&&!ccMediaFile){showErr(err,'Add your first entry post.');return;}
  const btn=document.querySelector('#scr-create-community .btn-or');
  setBtnLoad(btn,true);
  try{
    let mURL=null,mType=null,tURL=null;
    if(ccMediaFile){showToast('Uploading...');const res=await uploadWithThumb(ccMediaFile,`posts/${CU.uid}`);mURL=res.url;mType=res.type;tURL=res.thumbURL;}
    const pRef=await db.collection('posts').add({authorId:CU.uid,authorName:CUD.displayName,authorUsername:CUD.username,authorPhoto:CUD.photoURL||null,caption:cap,niche:'comedy',mediaURL:mURL,mediaType:mType,thumbURL:tURL,likes:0,comments:0,giftClicks:0,createdAt:ts()});
    await db.collection('users').doc(CU.uid).update({postCount:firebase.firestore.FieldValue.increment(1)});
    CUD.postCount=(CUD.postCount||0)+1;
    const cRef=await db.collection('challenges').add({type:'community',name,description:desc,niche:'comedy',creatorId:CU.uid,creatorUsername:CUD.username,creatorName:CUD.displayName,entryCount:1,totalVotes:0,comments:0,participants:[CU.uid],createdAt:ts()});
    await db.collection('challengeEntries').add({chalId:cRef.id,postId:pRef.id,authorId:CU.uid,authorName:CUD.displayName,authorUsername:CUD.username,authorPhoto:CUD.photoURL||null,caption:cap,mediaURL:mURL,mediaType:mType,thumbURL:tURL,votes:0,createdAt:ts()});
    document.getElementById('cc-name').value='';document.getElementById('cc-desc').value='';document.getElementById('cc-cap').value='';
    clearMPrev('cc-media-prev',null);ccMediaFile=null;
    showToast('🏆 Challenge launched!');showScr('challenges');
  }catch(e){showErr(err,e.message);}
  setBtnLoad(btn,false,'<i class="fa-solid fa-flag"></i> <span>Launch Challenge</span>');
}

// Join community challenge
function prevJoinMedia(input){const f=input.files[0];if(!f)return;joinMediaFile=f;showMPrev(f,'jn-media-prev',null);}
async function submitJoin(){
  if(!joinChalTarget)return;
  const isNew=!document.getElementById('join-new').classList.contains('hidden');
  const err=document.getElementById('join-err');
  err.classList.add('hidden');
  if(!isNew&&!joinSelPost){showErr(err,'Select a post or create a new one.');return;}
  const btn=document.querySelector('#scr-join-community .btn-or');
  setBtnLoad(btn,true);
  try{
    let postId,cap,mURL,mType,tURL;
    if(isNew){
      cap=document.getElementById('jn-cap').value.trim();
      if(!cap&&!joinMediaFile){showErr(err,'Add caption or media.');setBtnLoad(btn,false,'<i class="fa-solid fa-shield-halved"></i> <span>Submit Entry</span>');return;}
      if(joinMediaFile){showToast('Uploading...');const res=await uploadWithThumb(joinMediaFile,`posts/${CU.uid}`);mURL=res.url;mType=res.type;tURL=res.thumbURL;}
      const pRef=await db.collection('posts').add({authorId:CU.uid,authorName:CUD.displayName,authorUsername:CUD.username,authorPhoto:CUD.photoURL||null,caption:cap,niche:'comedy',mediaURL:mURL||null,mediaType:mType||null,thumbURL:tURL||null,likes:0,comments:0,giftClicks:0,createdAt:ts()});
      await db.collection('users').doc(CU.uid).update({postCount:firebase.firestore.FieldValue.increment(1)});
      CUD.postCount=(CUD.postCount||0)+1;postId=pRef.id;
    }else{postId=joinSelPost.postId;cap=joinSelPost.caption;mURL=joinSelPost.mediaURL;mType=joinSelPost.mediaType;tURL=joinSelPost.thumbURL;}
    await db.collection('challengeEntries').add({chalId:joinChalTarget.chalId,postId,authorId:CU.uid,authorName:CUD.displayName,authorUsername:CUD.username,authorPhoto:CUD.photoURL||null,caption:cap||'',mediaURL:mURL||null,mediaType:mType||null,thumbURL:tURL||null,votes:0,createdAt:ts()});
    await db.collection('challenges').doc(joinChalTarget.chalId).update({entryCount:firebase.firestore.FieldValue.increment(1),participants:firebase.firestore.FieldValue.arrayUnion(CU.uid)});
    showToast('Entry submitted!');joinChalTarget=null;joinSelPost=null;joinMediaFile=null;showScr('challenges');
  }catch(e){showErr(err,e.message);}
  setBtnLoad(btn,false,'<i class="fa-solid fa-shield-halved"></i> <span>Submit Entry</span>');
}

// ─────────────────────────────────────────────
// POST CREATION
// ─────────────────────────────────────────────
function prevPostMedia(input){const f=input.files[0];if(!f)return;postMediaFile=f;showMPrev(f,'pmedia-prev','mdrop');}
function showMPrev(file,prevId,dropId){
  const prev=document.getElementById(prevId);if(!prev)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const isVid=file.type.startsWith('video/');
    prev.innerHTML=`<div class="mprev">${isVid?`<video src="${e.target.result}" controls style="width:100%;max-height:230px;object-fit:cover;display:block;"></video>`:`<img src="${e.target.result}" style="width:100%;max-height:230px;object-fit:cover;display:block;"/>`}<button class="rm-media" onclick="clearMPrev('${prevId}','${dropId}')"><i class="fa-solid fa-xmark"></i></button></div>`;
    prev.classList.remove('hidden');if(dropId)document.getElementById(dropId)?.classList.add('hidden');
  };reader.readAsDataURL(file);
}
function clearMPrev(prevId,dropId){
  const prev=document.getElementById(prevId);if(prev){prev.classList.add('hidden');prev.innerHTML='';}
  if(dropId)document.getElementById(dropId)?.classList.remove('hidden');
  postMediaFile=null;c1MediaFile=null;ccMediaFile=null;joinMediaFile=null;
}
async function doPost(){
  const cap=document.getElementById('pcap').value.trim();
  const err=document.getElementById('post-err');err.classList.add('hidden');
  if(!cap&&!postMediaFile){showErr(err,'Write something or add media.');return;}
  const btn=document.querySelector('#scr-post .btn-or');setBtnLoad(btn,true);
  try{
    let mURL=null,mType=null,tURL=null;
    if(postMediaFile){showToast('Uploading...');const res=await uploadWithThumb(postMediaFile,`posts/${CU.uid}`);mURL=res.url;mType=res.type;tURL=res.thumbURL;}
    await db.collection('posts').add({authorId:CU.uid,authorName:CUD.displayName,authorUsername:CUD.username,authorPhoto:CUD.photoURL||null,caption:cap,niche:'comedy',mediaURL:mURL,mediaType:mType,thumbURL:tURL,likes:0,comments:0,giftClicks:0,createdAt:ts()});
    await db.collection('users').doc(CU.uid).update({postCount:firebase.firestore.FieldValue.increment(1)});
    CUD.postCount=(CUD.postCount||0)+1;
    document.getElementById('pcap').value='';document.getElementById('pcnt').textContent='0/300';
    clearMPrev('pmedia-prev','mdrop');postMediaFile=null;
    showToast('🔥 Post published!');showScr('feed');
  }catch(e){showErr(err,e.message);}
  setBtnLoad(btn,false,'<span>Publish</span><i class="fa-solid fa-paper-plane"></i>');
}

// ─────────────────────────────────────────────
// GIFT
// ─────────────────────────────────────────────
function openGiftModal(postId,authorId,authorUsername){
  giftTarget={postId,authorId,authorUsername};giftAmt=0;
  document.querySelectorAll('.gopt').forEach(o=>o.classList.remove('sel'));
  document.getElementById('gift-to').innerHTML=`Gifting <span>${esc(authorUsername)}</span>`;
  document.getElementById('gift-modal').classList.remove('hidden');
}
function pickGift(el,amt){document.querySelectorAll('.gopt').forEach(o=>o.classList.remove('sel'));el.classList.add('sel');giftAmt=amt;}
async function sendGift(){
  if(!giftAmt){showToast('Pick an amount first.');return;}
  if(!giftTarget)return;
  closeModal('gift-modal');
  await db.collection('posts').doc(giftTarget.postId).update({giftClicks:firebase.firestore.FieldValue.increment(1)});
  await db.collection('users').doc(giftTarget.authorId).update({giftClicksReceived:firebase.firestore.FieldValue.increment(1)});
  await db.collection('giftClicks').add({postId:giftTarget.postId,authorId:giftTarget.authorId,clickerUid:CU.uid,clickerUsername:CUD.username,amount:giftAmt,createdAt:ts()});
  if(giftTarget.authorId!==CU.uid)addNotif(giftTarget.authorId,'gift',`${CUD.username} would gift you ${giftAmt} coins — Mobile Money gifting in V1!`,'posts',giftTarget.postId);
  for(let i=0;i<4;i++){const c=document.createElement('div');c.style.cssText=`position:fixed;z-index:9999;font-size:22px;right:${50+Math.random()*40}px;bottom:${150+Math.random()*60}px;animation:coinPop 1.1s ease forwards;animation-delay:${i*.12}s;pointer-events:none;`;c.textContent='🪙';document.body.appendChild(c);setTimeout(()=>c.remove(),1500);}
  const el=document.getElementById(`tk-gift-cnt-${giftTarget.postId}`);if(el){const n=parseInt(el.textContent.replace(/[^0-9]/g,''))||0;el.textContent=fmtN(n+1);}
  showToast(`🪙 ${giftAmt} coin gift intent sent!`);
  giftTarget=null;giftAmt=0;
}

// ─────────────────────────────────────────────
// COMMENTS SHEET
// ─────────────────────────────────────────────
function openComments(collection,docId){
  comTarget={collection,docId};
  const overlay=document.getElementById('cs-overlay');overlay.classList.remove('hidden');
  document.body.style.overflow='hidden';
  const av=document.getElementById('cs-av');
  av.innerHTML=CUD.photoURL?`<img src="${CUD.photoURL}"/>`:(CUD.displayName||'?').charAt(0).toUpperCase();
  document.getElementById('cs-text').value='';
  document.getElementById('cs-send').disabled=true;
  loadComments();
}
function closeComments(){
  comTarget=null;if(comUnsub){comUnsub();comUnsub=null;}
  document.getElementById('cs-overlay').classList.add('hidden');
  document.body.style.overflow='';
}
function loadComments(){
  const list=document.getElementById('cs-list');
  list.innerHTML='<div class="loading"><div class="spin dark"></div></div>';
  if(comUnsub)comUnsub();
  if(!comTarget)return;
  comUnsub=db.collection(comTarget.collection).doc(comTarget.docId).collection('comments').orderBy('createdAt','asc').onSnapshot(snap=>{
    const count=document.getElementById('cs-count');if(count)count.textContent=snap.size>0?`(${snap.size})`:'';
    if(snap.empty){list.innerHTML='<div class="empty" style="padding:30px;"><i class="fa-regular fa-comment-dots"></i><p>No comments yet. Be first!</p></div>';return;}
    list.innerHTML='';
    snap.forEach(doc=>list.appendChild(buildComment(doc.data(),doc.id,comTarget.collection,comTarget.docId)));
    list.scrollTop=list.scrollHeight;
  });
}
async function submitComment(){
  const input=document.getElementById('cs-text');const text=input.value.trim();if(!text||!comTarget)return;
  input.value='';document.getElementById('cs-send').disabled=true;
  await db.collection(comTarget.collection).doc(comTarget.docId).collection('comments').add({authorId:CU.uid,authorName:CUD.displayName,authorUsername:CUD.username,authorPhoto:CUD.photoURL||null,text,createdAt:ts()});
  if(comTarget.collection==='posts')await db.collection('posts').doc(comTarget.docId).update({comments:firebase.firestore.FieldValue.increment(1)});
}
function buildComment(d,commentId,collection,docId){
  const div=document.createElement('div');div.className='com-item';
  const av=d.authorPhoto?`<div class="com-av"><img src="${d.authorPhoto}"/></div>`:`<div class="com-av">${(d.authorName||'?').charAt(0).toUpperCase()}</div>`;
  div.innerHTML=`${av}<div class="com-body"><div class="com-hdr"><span class="com-name">${esc(d.authorName)}</span><span class="com-un">${esc(d.authorUsername||'')}</span><span class="com-time">${d.createdAt?timeAgo(d.createdAt.toDate()):'now'}</span></div><div class="com-text">${esc(d.text)}</div><div class="com-foot"><button class="com-like-btn" id="cl-${commentId}" onclick="likeComment('${collection}','${docId}','${commentId}',this)"><i class="fa-regular fa-heart"></i><span id="clc-${commentId}">${d.likes||0}</span></button><button class="com-reply-btn" onclick="toggleReply('${commentId}','${esc(d.authorUsername||'')}','${collection}','${docId}')"><i class="fa-solid fa-reply"></i> Reply</button></div><div class="reply-input-wrap hidden" id="ri-${commentId}"><div class="reply-input-row"><div class="com-av-sm" style="width:22px;height:22px;">${CUD.photoURL?`<img src="${CUD.photoURL}"/>`:(CUD.displayName||'?').charAt(0).toUpperCase()}</div><div class="com-iw"><input type="text" id="rit-${commentId}" placeholder="Reply to ${esc(d.authorUsername||'')}..." maxlength="200" oninput="document.getElementById('rsb-${commentId}').disabled=!this.value.trim()"/><button id="rsb-${commentId}" class="cs-send-btn" disabled onclick="submitReply('${collection}','${docId}','${commentId}','rit-${commentId}')"><i class="fa-solid fa-paper-plane"></i></button></div></div></div><div class="replies-list" id="rpl-${commentId}"></div></div>`;
  // Check if user liked this comment
  db.collection('commentLikes').doc(`${CU.uid}_${commentId}`).get().then(s=>{const btn=document.getElementById(`cl-${commentId}`);if(s.exists&&btn)btn.classList.add('liked');});
  setTimeout(()=>loadReplies(collection,docId,commentId),100);
  return div;
}
async function likeComment(collection,docId,commentId,btn){
  const lid=`${CU.uid}_${commentId}`;const ref=db.collection('commentLikes').doc(lid);
  const snap=await ref.get();const cnt=document.getElementById(`clc-${commentId}`);
  if(snap.exists){await ref.delete();await db.collection(collection).doc(docId).collection('comments').doc(commentId).update({likes:firebase.firestore.FieldValue.increment(-1)});btn.classList.remove('liked');if(cnt)cnt.textContent=Math.max(0,parseInt(cnt.textContent||0)-1);}
  else{await ref.set({commentId,userId:CU.uid,createdAt:ts()});await db.collection(collection).doc(docId).collection('comments').doc(commentId).update({likes:firebase.firestore.FieldValue.increment(1)});btn.classList.add('liked');if(cnt)cnt.textContent=parseInt(cnt.textContent||0)+1;}
}
function toggleReply(commentId,username,collection,docId){
  document.querySelectorAll('.reply-input-wrap').forEach(w=>w.classList.add('hidden'));
  const wrap=document.getElementById(`ri-${commentId}`);if(wrap){wrap.classList.remove('hidden');document.getElementById(`rit-${commentId}`)?.focus();}
}
async function submitReply(collection,docId,commentId,inputId){
  const input=document.getElementById(inputId);if(!input)return;
  const text=input.value.trim();if(!text)return;input.value='';
  const btn=document.getElementById(inputId.replace('rit-','rsb-'));if(btn)btn.disabled=true;
  await db.collection(collection).doc(docId).collection('comments').doc(commentId).collection('replies').add({authorId:CU.uid,authorName:CUD.displayName,authorUsername:CUD.username,authorPhoto:CUD.photoURL||null,text,createdAt:ts()});
  await db.collection(collection).doc(docId).collection('comments').doc(commentId).update({replyCount:firebase.firestore.FieldValue.increment(1)});
  if(collection==='posts')await db.collection('posts').doc(docId).update({comments:firebase.firestore.FieldValue.increment(1)});
  document.getElementById(`ri-${commentId}`)?.classList.add('hidden');
  loadReplies(collection,docId,commentId);
}
function loadReplies(collection,docId,commentId){
  const list=document.getElementById(`rpl-${commentId}`);if(!list)return;
  db.collection(collection).doc(docId).collection('comments').doc(commentId).collection('replies').orderBy('createdAt','asc').onSnapshot(snap=>{
    if(snap.empty){list.innerHTML='';return;}list.innerHTML='';
    snap.forEach(doc=>{const d=doc.data();const item=document.createElement('div');item.className='reply-item';const av=d.authorPhoto?`<div class="reply-av"><img src="${d.authorPhoto}"/></div>`:`<div class="reply-av">${(d.authorName||'?').charAt(0).toUpperCase()}</div>`;item.innerHTML=`${av}<div class="reply-body"><div class="com-hdr"><span class="com-name">${esc(d.authorName)}</span><span class="com-un">${esc(d.authorUsername||'')}</span><span class="com-time">${d.createdAt?timeAgo(d.createdAt.toDate()):'now'}</span></div><div class="com-text">${esc(d.text)}</div></div>`;list.appendChild(item);});
  });
}

// ─────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────
function openSearch(){document.getElementById('search-modal').classList.remove('hidden');setTimeout(()=>document.getElementById('search-input')?.focus(),100);}
let searchTimeout=null;
async function doSearch(val){
  clearTimeout(searchTimeout);const list=document.getElementById('search-results');
  if(!val||val.length<2){list.innerHTML='<div class="search-empty"><i class="fa-solid fa-magnifying-glass"></i><p>Search creators or captions...</p></div>';return;}
  list.innerHTML='<div class="loading"><div class="spin dark"></div></div>';
  searchTimeout=setTimeout(async()=>{
    list.innerHTML='';const v=val.toLowerCase();const results=[];
    // Search users
    try{const uSnap=await db.collection('users').orderBy('username').startAt(v).endAt(v+'\uf8ff').limit(5).get();uSnap.forEach(doc=>{const d=doc.data();const item=document.createElement('div');item.className='sr-item';const av=d.photoURL?`<div class="sr-av"><img src="${d.photoURL}"/></div>`:`<div class="sr-av">${(d.displayName||'?').charAt(0).toUpperCase()}</div>`;item.innerHTML=`${av}<div class="sr-info"><div class="nm">${esc(d.displayName)}</div><div class="un">${esc(d.username||'')}</div></div><div class="sr-type">Creator</div>`;item.onclick=()=>{closeModal('search-modal');viewProfile(d.uid);};list.appendChild(item);});}catch(e){}
    // Search posts by caption
    try{const pSnap=await db.collection('posts').orderBy('caption').startAt(val).endAt(val+'\uf8ff').limit(5).get();pSnap.forEach(doc=>{const d=doc.data();const item=document.createElement('div');item.className='sr-item';const av=d.authorPhoto?`<div class="sr-av"><img src="${d.authorPhoto}"/></div>`:`<div class="sr-av">${(d.authorName||'?').charAt(0).toUpperCase()}</div>`;item.innerHTML=`${av}<div class="sr-info"><div class="nm">${esc(d.authorName||'')}</div><div class="un">${esc(d.authorUsername||'')}</div><div class="cap">${esc((d.caption||'').substring(0,60))}</div></div><div class="sr-type">Post</div>`;item.onclick=()=>closeModal('search-modal');list.appendChild(item);});}catch(e){}
    if(!list.children.length)list.innerHTML='<div class="search-empty"><i class="fa-solid fa-magnifying-glass"></i><p>No results found.</p></div>';
  },400);
}

// ─────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────
async function initProfile(uid,isOwn,containerId){
  const container=document.getElementById(containerId||'profile-body');
  container.innerHTML='<div class="loading"><div class="spin dark"></div><span>Loading profile...</span></div>';
  const snap=await db.collection('users').doc(uid).get();
  if(!snap.exists){container.innerHTML='<div class="empty"><p>Profile not found.</p></div>';return;}
  const u=snap.data();if(isOwn)CUD=u;
  const lv=getLevel(u);const badges=computeBadges(u);
  const postsSnap=await db.collection('posts').where('authorId','==',uid).orderBy('createdAt','desc').limit(12).get();
  let gridHTML='';
  postsSnap.forEach(doc=>{
    const d=doc.data();
    const thumb=d.thumbURL||d.mediaURL;
    const mediaHTML=thumb?(d.mediaType==='video'?`<img src="${thumb}" style="width:100%;height:100%;object-fit:cover;"/><div class="pg-vid-badge"><i class="fa-solid fa-play"></i></div>`:`<img src="${d.mediaURL}" style="width:100%;height:100%;object-fit:cover;"/>`):`<div class="pg-placeholder">${esc((d.caption||'').substring(0,40))}</div>`;
    gridHTML+=`<div class="pg-item" onclick="openPostFromProfile('${doc.id}','${uid}')">${mediaHTML}<div class="pg-ov"><span><i class="fa-solid fa-coins"></i>${d.giftClicks||0}</span></div></div>`;
  });
  const avHTML=u.photoURL?`<img src="${u.photoURL}"/>`:(u.displayName||'?').charAt(0).toUpperCase();
  container.innerHTML=`
    <div class="prof-cover"><div class="prof-cover-glow"></div><div class="prof-cover-grid"></div><div class="prof-av-wrap"><div class="prof-av">${avHTML}<div class="prof-av-ring"></div></div></div></div>
    <div class="prof-body">
      <div class="prof-name">${esc(u.displayName||'')}</div>
      <div class="prof-urow"><span class="prof-user">${esc((u.username||'').split('@')[0])}<span>@comedy</span></span><div class="lvl-badge"><i class="fa-solid fa-arrow-up"></i>${lv.name}</div></div>
      ${badges.length?`<div class="prof-badges">${renderBadges(badges)}</div>`:''}
      ${u.bio?`<div class="prof-bio">${esc(u.bio)}</div>`:''}
      <div class="prof-stats"><div class="ps"><div class="ps-v">${fmtN(u.postCount||0)}</div><div class="ps-l">Posts</div></div><div class="ps"><div class="ps-v">${fmtN(u.followers||0)}</div><div class="ps-l">Followers</div></div><div class="ps"><div class="ps-v or">${fmtN(u.challengeWins||0)}</div><div class="ps-l">Wins</div></div><div class="ps"><div class="ps-v go">${fmtN(u.giftClicksReceived||0)}</div><div class="ps-l">Gifts</div></div></div>
      ${isOwn?`<div class="prof-acts"><button class="prof-edit-btn" onclick="showToast('Edit profile coming soon!')">Edit Profile</button></div>`:`<div class="prof-acts"><button class="prof-follow-btn" id="pf-btn-${uid}" onclick="toggleFollow('${uid}','',this)">Follow</button><button class="prof-chal-btn"><i class="fa-solid fa-shield-halved"></i> Challenge</button></div>`}
      ${!isOwn?'':`<div class="prof-acts" style="margin-top:-8px;"><button class="btn-ghost w" onclick="auth.signOut()"><i class="fa-solid fa-right-from-bracket"></i> Sign Out</button></div>`}
      <div class="prof-divider"></div>
      <div class="prof-sec">Gift Intents</div>
      <div class="gift-block"><div class="gb-ico"><i class="fa-solid fa-coins"></i></div><div><div class="gb-v">${fmtN(u.giftClicksReceived||0)}</div><div class="gb-l">Fans would have gifted · Mobile Money in V1</div></div></div>
      <div class="prof-sec">Level Progress</div>
      <div class="lvl-prog"><div class="lp-top"><div class="lp-name">${lv.name}</div>${lv.next?`<div class="lp-next">→ ${lv.next.name} at ${fmtN(lv.next.min)} pts</div>`:''}</div><div class="lp-bar"><div class="lp-fill" style="width:${lv.pct}%"></div></div><div class="lp-hint">${fmtN(lv.score)} pts · Post, win challenges and get gifts to level up</div></div>
      <div class="prof-sec">Posts</div>
      <div class="posts-grid">${gridHTML||'<div style="grid-column:1/-1;padding:30px;text-align:center;color:var(--mu);font-size:13px;">No posts yet.</div>'}</div>
    </div>`;
  if(!isOwn){
    db.collection('follows').doc(`${CU.uid}_${uid}`).get().then(s=>{const btn=document.getElementById(`pf-btn-${uid}`);if(s.exists&&btn){btn.textContent='Following';btn.classList.add('flw');}});
  }
}

async function viewProfile(uid){
  if(uid===CU.uid){showScr('profile');return;}
  prevScr=curScr;curScr='viewprofile';
  document.querySelectorAll('.scr').forEach(s=>s.classList.remove('active'));
  document.getElementById('scr-viewprofile').classList.add('active');
  await initProfile(uid,false,'viewprofile-body');
}

function openPostFromProfile(postId,authorId){
  showScr('feed');
  loadFeedFromAuthor(postId,authorId);
}
async function loadFeedFromAuthor(targetPostId,authorId){
  const feed=document.getElementById('tk-feed');
  feed.innerHTML=`<div class="tk-post"><div style="height:100%;display:flex;align-items:center;justify-content:center;"><div class="spin"></div></div></div>`;
  if(feedUnsub)feedUnsub();if(feedObserver)feedObserver.disconnect();
  const snap=await db.collection('posts').where('authorId','==',authorId).orderBy('createdAt','desc').limit(15).get();
  const others=await db.collection('posts').orderBy('createdAt','desc').limit(10).get();
  feed.innerHTML='';
  let idx=0,targetEl=null;
  const seen=new Set();
  snap.forEach(doc=>{const el=buildTkPostSync(doc.id,doc.data(),idx);feed.appendChild(el);if(doc.id===targetPostId)targetEl=el;seen.add(doc.id);idx++;});
  others.forEach(doc=>{if(!seen.has(doc.id)){feed.appendChild(buildTkPostSync(doc.id,doc.data(),idx));idx++;}});
setTimeout(() => {
  setupObserver();
  // Find the post by its data-post-id attribute instead of stale reference
  const target = feed.querySelector(`[data-post-id="${targetPostId}"]`);
  if (target) target.scrollIntoView({ block: 'start' });
}, 1200);}

// ─────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────
function listenNotifs(){
  if(notifUnsub)notifUnsub();
  notifUnsub=db.collection('notifications').where('toUid','==',CU.uid).where('read','==',false).onSnapshot(snap=>{
    document.getElementById('notif-dot').classList.toggle('hidden',snap.size===0);
  });
}
async function initNotifs(){
  const body=document.getElementById('notif-body');
  body.innerHTML='<div class="loading"><div class="spin dark"></div></div>';
  const snap=await db.collection('notifications').where('toUid','==',CU.uid).orderBy('createdAt','desc').limit(30).get();
  if(snap.empty){body.innerHTML='<div class="notif-empty"><i class="fa-regular fa-bell"></i><p>No notifications yet.</p></div>';return;}
  body.innerHTML='';const batch=db.batch();
  const iconMap={gift:'fa-solid fa-coins',chal:'fa-solid fa-shield-halved',like:'fa-solid fa-heart',follow:'fa-solid fa-user-plus'};
  snap.forEach(doc=>{
    const d=doc.data();const item=document.createElement('div');item.className=`ni${d.read?'':' unread'}`;
    const ico=d.type||'like';
    item.innerHTML=`<div class="ni-ico ${ico}"><i class="${iconMap[ico]||'fa-solid fa-bell'}"></i></div><div class="ni-txt"><p>${esc(d.message||'')}</p></div><div class="ni-time">${d.createdAt?timeAgo(d.createdAt.toDate()):'now'}</div>`;
    // If it's a challenge notification, navigate to respond
    if(d.type==='chal'&&d.refId){item.onclick=()=>showRespondChallenge(d.refId);}
    body.appendChild(item);if(!d.read)batch.update(doc.ref,{read:true});
  });
  await batch.commit();document.getElementById('notif-dot').classList.add('hidden');
}
async function addNotif(toUid,type,message,refCollection,refId){
  if(!toUid)return;
  await db.collection('notifications').add({toUid,type,message,refCollection,refId,read:false,createdAt:ts()});
  // Try web push
  sendPushNotif(toUid,message,type);
}
async function sendPushNotif(toUid,message,type){
  // Store push token — in real implementation call your backend
  // For now just a placeholder
  console.log('Push would send to',toUid,':',message);
}

// ─────────────────────────────────────────────
// PUSH NOTIFICATIONS
// ─────────────────────────────────────────────
async function registerSW(){
  if('serviceWorker' in navigator){
    try{await navigator.serviceWorker.register('sw.js');}catch(e){console.log('SW registration failed:',e);}
  }
}
async function requestPushPermission(){
  if(!('Notification' in window))return;
  if(Notification.permission==='default'){
    const perm=await Notification.requestPermission();
    if(perm==='granted'){showToast('🔔 Notifications enabled!');}
  }
}

// ─────────────────────────────────────────────
// TOOLTIPS
// ─────────────────────────────────────────────
function startTips(){
  const seen=localStorage.getItem('ms_tips_done');
  if(seen)return;
  tipIndex=0;showTip();
}
function showTip(){
  if(tipIndex>=TIPS.length){endTips();return;}
  const tip=TIPS[tipIndex];
  const overlay=document.getElementById('tooltip-overlay');
  const bubble=document.getElementById('tooltip-bubble');
  const content=document.getElementById('tt-content');
  const step=document.getElementById('tt-step');
  overlay.classList.remove('hidden');
  content.innerHTML=`<h4>${tip.title}</h4><p>${tip.body}</p>`;
  step.textContent=`${tipIndex+1} of ${TIPS.length}`;
  // Position bubble
  bubble.style.left=tip.x;bubble.style.top=tip.y;bubble.style.transform='translate(-50%,-50%)';
  // Arrow direction
  const arrow=document.getElementById('tt-arrow');
  arrow.style.cssText='position:absolute;width:12px;height:12px;background:var(--wh);transform:rotate(45deg);';
  if(tip.side==='left'){arrow.style.right='-6px';arrow.style.top='50%';arrow.style.marginTop='-6px';}
  else if(tip.side==='top'){arrow.style.bottom='-6px';arrow.style.left='50%';arrow.style.marginLeft='-6px';}
  else{arrow.style.top='-6px';arrow.style.left='50%';arrow.style.marginLeft='-6px';}
}
function nextTip(){tipIndex++;showTip();}
function endTips(){document.getElementById('tooltip-overlay').classList.add('hidden');localStorage.setItem('ms_tips_done','1');}

// ─────────────────────────────────────────────
// BADGES UPDATE
// ─────────────────────────────────────────────
async function updateBadges(uid){
  const snap=await db.collection('users').doc(uid).get();
  if(!snap.exists)return;
  const badges=computeBadges(snap.data());
  await db.collection('users').doc(uid).update({badges});
}

// ─────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────
function closeModal(id){const el=document.getElementById(id);if(el)el.classList.add('hidden');}
document.addEventListener('click',e=>{if(e.target.classList.contains('modal-overlay')||e.target.classList.contains('cs-backdrop')){e.target.closest('.modal-overlay,.cs-overlay')?.classList.add('hidden');document.body.style.overflow='';comTarget=null;}});

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
function ts(){return firebase.firestore.FieldValue.serverTimestamp();}
function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fmtN(n){n=parseInt(n)||0;if(n>=1000000)return(n/1000000).toFixed(1)+'M';if(n>=1000)return(n/1000).toFixed(1)+'K';return String(n);}
function timeAgo(d){const s=Math.floor((Date.now()-d)/1000);if(s<60)return'just now';if(s<3600)return Math.floor(s/60)+'m';if(s<86400)return Math.floor(s/3600)+'h';if(s<604800)return Math.floor(s/86400)+'d';return d.toLocaleDateString();}
function timeLeft(d){if(!d)return'';const s=Math.max(0,Math.floor((d-Date.now())/1000));if(s<60)return s+'s left';if(s<3600)return Math.floor(s/60)+'m left';if(s<86400)return Math.floor(s/3600)+'h left';return Math.floor(s/86400)+'d left';}
function showToast(msg){const old=document.getElementById('toast');if(old)old.remove();const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),3200);}
function setBtnLoad(btn,loading,reset){if(!btn)return;if(loading){btn.innerHTML='<div class="spin" style="width:16px;height:16px;border-color:rgba(255,255,255,.3);border-top-color:#fff;margin:0 auto;"></div>';btn.disabled=true;}else{if(reset)btn.innerHTML=reset;btn.disabled=false;}}
const coinPopStyle=document.createElement('style');
coinPopStyle.textContent='@keyframes coinPop{0%{opacity:1;transform:scale(1) translateY(0)}100%{opacity:0;transform:scale(.7) translateY(-90px)}}';
document.head.appendChild(coinPopStyle);
function goToBattle(chalId) {
  closeModal('chal-vote-modal');
  // Switch to challenges, battles tab
  showScr('challenges');
  chalTab = 'battles';
  document.querySelectorAll('.ctab').forEach(t => {
    t.classList.toggle('active', t.dataset.t === 'battles');
  });
  initChallenges();
  // Scroll to the specific battle after it loads
  setTimeout(() => {
    const feed = document.querySelector('.battles-feed');
    if (!feed) return;
    const cards = feed.querySelectorAll('.battle-card');
    // Find by chalId stored on card — add data attr when building
    cards.forEach(card => {
      if (card.dataset.chalId === chalId) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }, 800);
}