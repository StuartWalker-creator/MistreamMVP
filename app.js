// ═══════════════════════════════════
// CONFIG
// ═══════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyCHBo_6-GZi4M7p77-Tk8W32i24KuD-tqg",
  authDomain: "bodaboda-9a325.firebaseapp.com",
  projectId: "bodaboda-9a325",
  storageBucket: "bodaboda-9a325.firebasestorage.app",
  messagingSenderId: "860902193551",
  appId: "1:860902193571:web:e70a25b2c967e3c7570216"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();
const messaging = firebase.messaging();

const CLD_CLOUD  = 'dvdshonhc';
const CLD_PRESET = 'mistream_uploads';

// ── OneSignal background push ─────────────────────
// Replace YOUR_ONESIGNAL_APP_ID with your real App ID from
// OneSignal dashboard → Settings → Keys & IDs
const ONESIGNAL_APP_ID = 'aef85f69-0133-4b36-865c-064264353814';

function initOneSignal(){
  // OneSignal SDK loaded via defer — wait for it
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  OneSignalDeferred.push(async function(OneSignal){
    await OneSignal.init({
      appId: ONESIGNAL_APP_ID,
      // Soft prompt — asks user permission with a native browser dialog
      // only after they interact with the page, not immediately on load
      promptOptions:{
        slidedown:{
          prompts:[{
            type:'push',
            autoPrompt:false, // we control when to ask
            text:{
              actionMessage:"Get notified when new challenges drop and when you win.",
              acceptButton:"Yes, notify me",
              cancelButton:"Maybe later"
            }
          }]
        }
      },
      // Service worker files — OneSignal needs its own SW file
      // We merge it into the existing sw.js (see sw.js)
      serviceWorkerParam:{ scope:'/' },
      serviceWorkerPath:'sw.js',
      allowLocalhostAsSecureOrigin:true // for local dev testing
    });

    // Tag user with their uid so we can target them specifically
    if(CU){
      await OneSignal.login(CU.uid).catch(()=>{});
    }
  });
}

// Ask for push permission — call this after user has had a moment
// to understand the platform (called after first successful login)
function askPushPermission(){
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  OneSignalDeferred.push(async function(OneSignal){
    const permission = await OneSignal.Notifications.permission;
    if(!permission){
      // Slight delay so it doesn't fire the instant they log in
      setTimeout(()=>{ OneSignal.Slidedown.promptPush(); }, 3000);
    }
  });
}

// ── Push helpers — route through Netlify Function proxy ──
// REST key lives only in Netlify env vars, never in this file.
// Proxy: POST /.netlify/functions/push

async function pushToUser(toUid, title, message){
  if(!toUid||toUid===CU?.uid)return; // never push to yourself
  try{
    await fetch('/.netlify/functions/push',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ mode:'user', toUid, title, message,
        url: window.location.origin })
    });
  }catch(e){ console.warn('pushToUser failed',e); }
}

async function pushToAll(title, message){
  try{
    await fetch('/.netlify/functions/push',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ mode:'all', title, message,
        url: window.location.origin })
    });
  }catch(e){ console.warn('pushToAll failed',e); }
}

// ═══════════════════════════════════
// LEVELS
// ═══════════════════════════════════
const LEVELS = [
  {name:'Rookie',min:0},{name:'Pro',min:100},{name:'Expert',min:300},
  {name:'Elite',min:700},{name:'Master',min:1500},{name:'Ultra',min:3000}
];
function getLevel(u){
  const score=(u.challengeWins||0)*50+(u.challengesJoined||0)*10+(u.totalVotesReceived||0)*2;
  return (LEVELS.slice().reverse().find(l=>score>=l.min)||LEVELS[0]).name;
}

// ═══════════════════════════════════
// STATE
// ═══════════════════════════════════
let CU=null, CUD=null, isAdmin=false;
let curScr='arena', prevScr=null;
let arenaUnsub=null, notifUnsub=null, comUnsub=null, lbUnsub=null;
let comTarget=null;
let joinTarget=null, joinSelEntry=null, joinMediaFile=null;
let createMediaFile=null;
let regPhotoFile=null;
let isMuted=true;
let curPairVids=[];

// ═══════════════════════════════════
// INIT
// ═══════════════════════════════════
let authHandled = false; // prevents race condition

window.addEventListener('load',()=>{
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
  setTimeout(()=>{
    document.getElementById('splash').classList.add('hidden');
    auth.onAuthStateChanged(async user=>{
      // If doRegister/doLogin already handled this auth event, skip
      if(authHandled){ authHandled=false; return; }
      if(user){
        // Retry up to 3 times — Firestore write may not be committed yet
        let snap = null;
        for(let i=0;i<3;i++){
          snap = await db.collection('users').doc(user.uid).get();
          if(snap.exists) break;
          await new Promise(r=>setTimeout(r,800));
        }
        if(snap && snap.exists){ CU=user;
        CUD=snap.data(); initApp(); }
        else{ showAuth(); sv('v-register'); }
      } else { showAuth(); sv('v-login'); }
    });
  },2400);
});


function showAuth(){
  document.getElementById('auth').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function initApp(){
  document.getElementById('auth-success-overlay')?.remove();
  document.getElementById('auth').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  // Check admin role from Firestore user doc
  isAdmin = (CUD.role === 'admin');
  setTopAv();
  setMyId();
  trackSession();
  listenNotifs();
  // OneSignal handles all push permission — requestNotifPermission removed
  // to avoid double permission prompts competing with OneSignal
  initOneSignal();
  askPushPermission();
  showScr('arena');
}

function setTopAv(){
  ['top-av','top-av-lb'].forEach(id=>{
    const av=document.getElementById(id);
    if(!av)return;
    if(CUD.photoURL) av.innerHTML=`<img src="${CUD.photoURL}"/>`;
    else av.textContent=(CUD.displayName||'?').charAt(0).toUpperCase();
  });
}

function setMyId(){
  const el=document.getElementById('my-id'); if(!el)return;
  const lv=getLevel(CUD);
  el.innerHTML=`<div class="my-id-av">${CUD.photoURL?`<img src="${CUD.photoURL}"/>`:(CUD.displayName||'?').charAt(0).toUpperCase()}</div><div class="my-id-info"><div class="nm">${esc(CUD.displayName||'')}</div><div class="un">${esc(CUD.username||'')} · ${lv}</div></div>`;
}

async function trackSession(){
  await db.collection('users').doc(CU.uid).update({
    lastSeen:ts(), sessionCount:firebase.firestore.FieldValue.increment(1)
  }).catch(()=>{});
}
// ═══════════════════════════════════
// AUTH
// ═══════════════════════════════════
function sv(id){
  document.querySelectorAll('.auth-view').forEach(v=>v.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}
let regPhoto=null;
function prevRegPhoto(input){
  const f=input.files[0]; if(!f)return; regPhoto=f;
  const r=new FileReader(); r.onload=e=>{
    const el=document.getElementById('reg-photo-prev');
    el.innerHTML=`<img src="${e.target.result}"/>`;
  }; r.readAsDataURL(f);
}
function updateUPrev(){
  const name=document.getElementById('r-name').value.trim().toLowerCase().replace(/\s+/g,'');
  const prev=document.getElementById('upreview');
  document.getElementById('upn').textContent=name?`${name}@pics`:'name@pics';
  prev.classList.toggle('hidden',!name);
}
async function doRegister(){
  const name=document.getElementById('r-name').value.trim();
  const email=document.getElementById('r-email').value.trim();
  const pass=document.getElementById('r-pass').value;
  const err=document.getElementById('r-err'); err.classList.add('hidden');
  if(!name){showErr(err,'Enter your name.');return;}
  if(!email){showErr(err,'Enter your email.');return;}
  if(pass.length<6){showErr(err,'Password needs 6+ characters.');return;}
  const btn=document.getElementById('reg-btn'); setBtnLoad(btn,true);
  try{
    const username=name.toLowerCase().replace(/\s+/g,'')+'@pics';
    const cred=await auth.createUserWithEmailAndPassword(email,pass);
    let photoURL=null;
    if(regPhoto){
      showToast('Uploading photo...');
      const res=await uploadCLD(regPhoto,`avatars/${cred.user.uid}`);
      photoURL=res.url;
    }
    await db.collection('users').doc(cred.user.uid).set({
      uid:cred.user.uid, displayName:name, username, niche:'pics',
      email, photoURL, bio:'', challengeWins:0, challengeLosses:0,
      challengesCreated:0, challengesJoined:0, totalVotesReceived:0,
      profileViews:0, followers:0, following:0, sessionCount:0,
      createdAt:ts()
    });
    // Set CU and CUD directly — don't wait for onAuthStateChanged
    CU = cred.user;
    CUD = {
      uid:cred.user.uid, displayName:name, username, niche:'pics',
      email, photoURL, bio:'', challengeWins:0, challengeLosses:0,
      challengesCreated:0, challengesJoined:0, totalVotesReceived:0,
      profileViews:0, followers:0, following:0, sessionCount:0
    };
    authHandled = true; // block onAuthStateChanged from redirecting to register
    showAuthSuccess(`Welcome, ${name}!`,`Your identity ${username} is live.`);
    setTimeout(()=>initApp(), 1200);
  }catch(e){
    showErr(err,friendlyErr(e.code));
    setBtnLoad(btn,false,'<span>Claim My Identity</span><i class="fa-solid fa-arrow-right"></i>');
  }
}
async function doLogin(){
  const email=document.getElementById('l-email').value.trim();
  const pass=document.getElementById('l-pass').value;
  const err=document.getElementById('l-err'); err.classList.add('hidden');
  if(!email||!pass){showErr(err,'Fill in all fields.');return;}
  const btn=document.getElementById('l-btn'); setBtnLoad(btn,true);
  try{
    const cred = await auth.signInWithEmailAndPassword(email,pass);
    const snap = await db.collection('users').doc(cred.user.uid).get();
    if(!snap.exists){ showErr(err,'Account data not found. Try signing up.'); setBtnLoad(btn,false,'<span>Sign In</span><i class="fa-solid fa-arrow-right"></i>'); return; }
    CU = cred.user;
    CUD = snap.data();
    authHandled = true; // block onAuthStateChanged
    showAuthSuccess('Welcome back!','Taking you to the arena...');
    setTimeout(()=>initApp(), 1200);
  }catch(e){
    showErr(err,friendlyErr(e.code));
    setBtnLoad(btn,false,'<span>Sign In</span><i class="fa-solid fa-arrow-right"></i>');
  }
}
function showAuthSuccess(title,sub){
  const el=document.createElement('div');
  el.id='auth-success-overlay';
  el.style.cssText='position:fixed;inset:0;z-index:9999;background:var(--black);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;animation:fadeIn .3s ease;';
  el.innerHTML=`<div style="width:70px;height:70px;border-radius:50%;background:linear-gradient(135deg,var(--or),var(--go));display:flex;align-items:center;justify-content:center;"><i class="fa-solid fa-check" style="font-size:28px;color:#fff;"></i></div><div style="text-align:center;padding:0 32px;"><div style="font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:2px;color:#fff;margin-bottom:6px;">${title}</div><p style="font-family:'Space Mono',monospace;font-size:10px;color:rgba(255,255,255,.45);letter-spacing:1px;line-height:1.7;">${sub}</p></div><div style="display:flex;gap:6px;"><div style="width:7px;height:7px;border-radius:50%;background:var(--or);animation:pulse 1s ease infinite;"></div><div style="width:7px;height:7px;border-radius:50%;background:var(--or);animation:pulse 1s .2s ease infinite;"></div><div style="width:7px;height:7px;border-radius:50%;background:var(--or);animation:pulse 1s .4s ease infinite;"></div></div>`;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),5000);
}
function showErr(el,msg){el.textContent=msg;el.classList.remove('hidden');}
function friendlyErr(code){
  const m={'auth/email-already-in-use':'Email already registered.','auth/invalid-email':'Invalid email.','auth/wrong-password':'Wrong password.','auth/user-not-found':'No account found.','auth/weak-password':'Password too short.','auth/too-many-requests':'Too many attempts. Try later.'};
  return m[code]||'Something went wrong.';
}
// ═══════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════ 
function showScr(name){
  // Block non-admins from accessing create screen
  if(name==='create' && !isAdmin){ showToast('Admin access only.'); return; }
  history.pushState({screen:name},'','');
  prevScr=curScr; curScr=name;
  document.querySelectorAll('.scr').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('.bn').forEach(b=>b.classList.remove('active'));
  const scr=document.getElementById(`scr-${name}`);
  if(scr) scr.classList.add('active');
  const bn=document.getElementById(`bn-${name}`);
  if(bn) bn.classList.add('active');
  if(name==='arena') initArena();
  if(name==='profile') initProfile(CU.uid,true);
  if(name==='notifications') initNotifs();
  if(name==='leaderboard') initLeaderboard();
  if(name==='create'){setMyId();resetCreateForm();}
}
function goBack(){
  if(prevScr) showScr(prevScr);
  else showScr('arena');
}

// ═══════════════════════════════════
// CLOUDINARY + THUMBNAIL
// ═══════════════════════════════════
async function uploadCLD(file,folder){
  const isVideo = file.type.startsWith('video/');
  // Use specific endpoint — video or image, not auto
  // auto endpoint rejects large video files on free tier
  const resourceType = isVideo ? 'video' : 'image';
  const fd=new FormData();
  fd.append('file',file);
  fd.append('upload_preset',CLD_PRESET);
  fd.append('folder',`mistream/${folder}`);
  // Cloudinary free tier has 10MB limit on unsigned uploads for video
  // Check size and warn
  if(isVideo && file.size > 100*1024*1024){
    throw new Error('Video too large. Please use a video under 100MB.');
  }
  const res=await fetch(
    `https://api.cloudinary.com/v1_1/${CLD_CLOUD}/${resourceType}/upload`,
    {method:'POST',body:fd}
  );
  if(!res.ok){
    const text=await res.text();
    throw new Error(`Upload failed (${res.status}): ${text.substring(0,100)}`);
  }
  const data=await res.json();
  if(data.error) throw new Error(data.error.message);
  return {url:data.secure_url, type:isVideo?'video':'image'};
}
async function genThumb(videoFile){
  return new Promise(resolve=>{
    const vid=document.createElement('video');
    vid.preload='metadata'; vid.muted=true; vid.playsInline=true;
    const url=URL.createObjectURL(videoFile);
    vid.src=url;
    vid.addEventListener('loadeddata',()=>{vid.currentTime=1;});
    vid.addEventListener('seeked',()=>{
      const c=document.createElement('canvas');
      c.width=vid.videoWidth||480; c.height=vid.videoHeight||854;
      c.getContext('2d').drawImage(vid,0,0,c.width,c.height);
      c.toBlob(blob=>{URL.revokeObjectURL(url);resolve(blob);},'image/jpeg',0.8);
    });
    vid.addEventListener('error',()=>{URL.revokeObjectURL(url);resolve(null);});
    vid.load();
  });
}
async function uploadWithThumb(file,folder){
  const isVideo=file.type.startsWith('video/');
  if(isVideo){
    // Generate thumbnail first (client-side, fast)
    showUploadProgress('Preparing video...',10);
    const blob=await genThumb(file);
    showUploadProgress('Uploading video (this may take a minute)...',30);
    const res=await uploadCLD(file,folder);
    showUploadProgress('Saving thumbnail...',85);
    let thumbURL=null;
    if(blob){
      const tf=new File([blob],'thumb.jpg',{type:'image/jpeg'});
      const tr=await uploadCLD(tf,`thumbs/${CU.uid}`);
      thumbURL=tr.url;
    }
    hideUploadProgress();
    return {...res,thumbURL};
  } else {
    showUploadProgress('Uploading image...',50);
    const res=await uploadCLD(file,folder);
    hideUploadProgress();
    return {...res,thumbURL:null};
  }
}

function showUploadProgress(msg,pct){
  let bar=document.getElementById('upload-progress-bar');
  if(!bar){
    bar=document.createElement('div');
    bar.id='upload-progress-bar';
    bar.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9999;background:rgba(6,6,8,.95);padding:12px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--bord);';
    bar.innerHTML=`<div class="spin" style="width:16px;height:16px;flex-shrink:0;"></div><div style="flex:1;"><div id="upg-msg" style="font-family:Space Mono,monospace;font-size:10px;color:rgba(255,255,255,.7);margin-bottom:5px;"></div><div style="height:3px;background:rgba(255,255,255,.1);border-radius:2px;overflow:hidden;"><div id="upg-fill" style="height:100%;background:linear-gradient(90deg,var(--or),var(--go));border-radius:2px;transition:width .4s ease;"></div></div></div>`;
    document.body.appendChild(bar);
  }
  document.getElementById('upg-msg').textContent=msg;
  document.getElementById('upg-fill').style.width=pct+'%';
}

function hideUploadProgress(){
  const bar=document.getElementById('upload-progress-bar');
  if(bar){ bar.style.opacity='0'; bar.style.transition='opacity .3s'; setTimeout(()=>bar.remove(),400); }
}

// ═══════════════════════════════════
// ARENA FEED
// ═══════════════════════════════════
function initArena(){
  const feed=document.getElementById('arena-feed');
  feed.innerHTML=`<div class="arena-card"><div class="empty"><div class="spin"></div></div></div>`;
  if(arenaUnsub) arenaUnsub();
  // Load challenges ordered by a weighted score: entryCount + voteCount
  // We fetch recent challenges and sort client-side by recency + activity
  arenaUnsub=db.collection('challenges')
    .orderBy('createdAt','desc')
    .limit(30)
    .onSnapshot(snap=>{
      if(snap.empty){
        feed.innerHTML=`<div class="arena-card"><div class="empty"><i class="fa-solid fa-trophy"></i><h3>No challenges yet</h3><p>The arena is quiet. Check back soon — challenges are coming.</p></div></div>`;
        return;
      }
      // Weighted sort: active first, then by entryCount+votes
      const docs=[];
      snap.forEach(doc=>docs.push({id:doc.id,...doc.data()}));
      const now=Date.now();
      docs.sort((a,b)=>{
        const aActive=a.expiresAt&&a.expiresAt.toDate()>new Date()&&a.status!=='ended';
        const bActive=b.expiresAt&&b.expiresAt.toDate()>new Date()&&b.status!=='ended';
        if(aActive&&!bActive) return -1;
        if(!aActive&&bActive) return 1;
        const aScore=(a.entryCount||0)*3+(a.totalVotes||0)*2;
        const bScore=(b.entryCount||0)*3+(b.totalVotes||0)*2;
        return bScore-aScore;
      });
      feed.innerHTML='';
      docs.forEach(d=>feed.appendChild(buildArenaCard(d.id,d)));
      setupArenaObserver();
    },err=>console.error(err));
}

/*function setupArenaObserver(){
  // Autoplay video for the visible arena card
  const obs=new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      // Pause all videos in cards going out of view
      if(!e.isIntersecting){
        e.target.querySelectorAll('video').forEach(v=>{v.pause();v.currentTime=0;});
      }
    });
  },{threshold:0.6});
  document.querySelectorAll('.arena-card').forEach(c=>obs.observe(c));
}*/

function setupArenaObserver(){
  // Images only — no video autoplay logic needed
  // Observer kept for future use
  const obs=new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(!e.isIntersecting){
        // no-op for images
      } else {
        // no-op for images
        // Find whichever video is visible (not display:none) and was playing
        e.target.querySelectorAll('video').forEach(v=>{
          if(v.style.display !== 'none' && v.readyState >= 2){
            v.play().catch(()=>{});
          }
        });
      }
    });
  },{threshold:0.6});
  document.querySelectorAll('.arena-card').forEach(c=>obs.observe(c));
}

function buildArenaCard(chalId,d){
  const div=document.createElement('div');
  div.className='arena-card';
  div.dataset.chalId=chalId;
  const isPending=d.status==='pending'||(!d.expiresAt&&d.status!=='ended');
  const isExpired=d.expiresAt&&d.expiresAt.toDate()<new Date();
  const isEnded=d.status==='ended'||isExpired;
  const tot=(d.entryCount||0);
  const votes=(d.totalVotes||0);

  // CREATOR avatar html
  const crAvHTML=d.creatorPhoto
    ?`<div class="ac-cr-av"><img src="${d.creatorPhoto}"/></div>`
    :`<div class="ac-cr-av">${(d.creatorName||'?').charAt(0).toUpperCase()}</div>`;

  const badgeHTML=isEnded
    ?``
    :`<div class="ac-badge"><div class="ac-badge-dot"></div><span class="ac-badge-txt">LIVE</span></div>`;

  div.innerHTML=`
    <div class="ac-top">
      <div class="ac-hdr">
        <div class="ac-title">${esc(d.title||'Untitled')}</div>
      </div>
      ${d.description?`<div class="ac-desc">${esc(d.description)}</div>`:''}
      <div class="ac-top-actions">
      <div class="ac-creator" onclick="viewProfile('${d.creatorId}')">
        ${crAvHTML}
        <div class="ac-cr-name">by <span>${esc(d.creatorUsername||'')}</span></div>
      </div>
       ${!isEnded?` <div class="vba-btn join-chal" id="join-btn-${chalId}" onclick="openJoin('${chalId}','${esc(d.title||'')}','${esc(d.creatorUsername||'')}','${d.creatorId||''}')">
            <i class="fa-solid fa-shield-halved"></i>
            <span>Join Challenge</span>
          </div>`:''} </div>
          
      <div class="ac-meta">
        <div class="ac-meta-chip timer"><i class="fa-regular fa-clock"></i>${isEnded?'Ended':isPending?'⏳ Waiting for first entry':timeLeft(d.expiresAt?.toDate())}</div>
        <div class="ac-meta-chip"><i class="fa-solid fa-users"></i>${fmtN(tot)} entries</div>
        <div class="ac-meta-chip"><i class="fa-regular fa-thumbs-up"></i>${fmtN(votes)} votes</div>
         <div class="vba-btn" onclick="openComments('challenges','${chalId}')">
            <i class="fa-regular fa-comment-dots"></i>
            <span id="com-cnt-${chalId}">${fmtN(d.commentCount||0)}</span>
          </div>
          <div class="vba-btn" onclick="showResults('${chalId}')">
            <i class="fa-regular fa-chart-bar"></i>
          </div>
        ${badgeHTML}
      </div>
    </div>
    <div class="battleground" id="bg-${chalId}">
      <div class="battle-swiper" id="bs-${chalId}"></div>
    </div>
    <div class="vote-bar" id="vb-${chalId}">
      <div class="vb-swipe-hint" id="vsh-${chalId}">← swipe to compare more entries →</div>
      ${!isEnded?`<div class="vb-row">
       <button class="vbtn vbtn-a" id="va-${chalId}" onclick="castVote('${chalId}','a',this)">Vote Left</button>
        <button class="vbtn vbtn-b" id="vb2-${chalId}" onclick="castVote('${chalId}','b',this)">Vote Right</button>
      </div>`:`<button class="results-btn" onclick="showResults('${chalId}')">View Results</button>`}
      <div class="vb-progress" id="vbp-${chalId}"></div>
      <div class="vb-actions">
        <div class="vba-left">
       
        </div>
        <div class="pair-indicator" id="pi-${chalId}"></div>
      </div>
    </div>`;

  // Load entries into the battleground
  setTimeout(()=>loadBattleground(chalId,d),100);
  return div;
}

async function loadBattleground(chalId,d){
  const swiper=document.getElementById(`bs-${chalId}`); if(!swiper)return;
  // Fetch entries with personalized ordering:
  // - New entries (last 2h) get a grace window and appear
  // - Then sort by likes desc (virality signal)
  // Simple query — no composite index needed
  // Sort client-side to avoid Firestore index requirement
  const snap=await db.collection('entries')
    .where('chalId','==',chalId)
    .limit(20)
    .get();

  if(snap.empty){
    swiper.innerHTML=`<div class="battle-pair" style="display:flex;align-items:center;justify-content:center;"><div class="bs-empty" style="grid-column:1/-1;"><i class="fa-solid fa-film"></i><p>No entries yet. Be the first!</p></div></div>`;
    // Hide vote buttons if no entries
    const vb=document.getElementById(`vb-${chalId}`);
    if(vb){
      document.getElementById(`va-${chalId}`)?.setAttribute('disabled','true');
      document.getElementById(`vb2-${chalId}`)?.setAttribute('disabled','true');
    }
    return;
  }

  const entries=[];
  snap.forEach(doc=>entries.push({id:doc.id,...doc.data()}));

  // Personalized sort: new entries (< 2h) first, then by likes
  const twoHoursAgo=Date.now()-2*60*60*1000;
  entries.sort((a,b)=>{
    const aNew=a.createdAt&&a.createdAt.toDate()>twoHoursAgo;
    const bNew=b.createdAt&&b.createdAt.toDate()>twoHoursAgo;
    if(aNew&&!bNew) return -1;
    if(!aNew&&bNew) return 1;
    return (b.likes||0)-(a.likes||0);
  });

  // Shuffle slightly so different users see different pairs
  const shuffled=softShuffle(entries);

  // Build pairs
  const pairs=[];
  for(let i=0;i<shuffled.length;i+=2){
    if(i+1<shuffled.length) pairs.push([shuffled[i],shuffled[i+1]]);
    else pairs.push([shuffled[i],null]); // odd entry
  }

  swiper.innerHTML='';
  pairs.forEach((pair,idx)=>swiper.appendChild(buildPair(chalId,pair[0],pair[1],idx)));

  // Pair indicators
  buildPairIndicator(chalId,pairs.length);

  // Track swipe to update indicator + vote buttons
  swiper.addEventListener('scroll',()=>onSwiperScroll(chalId,swiper,pairs));

  // Check if user already voted on current pair
  await checkPairVoted(chalId,pairs[0],0);
  // Autoplay first video when battleground first loads
setTimeout(() => autoplayFirstVid(chalId, 0), 500);
// Update vote button labels for first pair immediately
setTimeout(() => {
  if (pairs[0]) onSwiperScroll(chalId, document.getElementById(`bs-${chalId}`), pairs);
}, 600);}

function softShuffle(arr){
  // Soft shuffle — not fully random, preserves some weight order
  const out=[...arr];
  for(let i=out.length-1;i>0;i--){
    if(Math.random()>0.4){
      const j=Math.floor(Math.random()*(i+1));
      [out[i],out[j]]=[out[j],out[i]];
    }
  }
  return out;
}

function buildPair(chalId,entA,entB,pairIdx){
  const div=document.createElement('div');
  div.className='battle-pair';
  div.dataset.pairIdx=pairIdx;
  div.dataset.entryA=entA?.id||'';
  div.dataset.entryB=entB?.id||'';
  div.appendChild(buildSide(chalId,entA,'a',pairIdx));
  
  div.appendChild(buildSide(chalId,entB,'b',pairIdx));
  return div;
}

function buildSide(chalId,entry,side,pairIdx){
  const div=document.createElement('div');
  div.className='battle-side';
  if(!entry){
    div.innerHTML=`<div class="bs-empty"><i class="fa-solid fa-image" style="color:var(--or);"></i><p style="color:rgba(255,255,255,.4);">Your photo could be here</p><button class="btn-or" style="padding:8px 16px;font-size:11px;margin-top:6px;" onclick="openJoin('${chalId}','','')">Submit Photo</button></div>`;
    return div;
  }
  const sideId=`${chalId}-${side}-${pairIdx}`;
  const avHTML=entry.authorPhoto
    ?`<div class="bs-av"><img src="${entry.authorPhoto}"/></div>`
    :`<div class="bs-av">${(entry.authorName||'?').charAt(0).toUpperCase()}</div>`;

  // Images only — no video logic
  const mediaHTML=entry.mediaURL
    ?`<img class="bs-img" src="${entry.mediaURL}" loading="lazy"/>`
    :`<div class="bs-empty"><i class="fa-solid fa-image"></i></div>`;

  div.innerHTML=`
    ${mediaHTML}
    <div class="bs-grad"></div>
    <div class="bs-info">
      <div class="bs-author" onclick="viewProfile('${entry.authorId}')">
        ${avHTML}
        <div class="bs-name">${esc(entry.authorUsername||entry.authorName||'')}</div>
      </div>
      ${entry.caption?`<div class="bs-caption">${esc(entry.caption)}</div>`:''}
      <div class="bs-actions" style="opacity:1;">
        <div class="bs-act" id="like-act-${sideId}" onclick="likeEntry('${entry.id}','${entry.authorId}','${sideId}',this)">
          <i class="fa-regular fa-heart" id="like-ico-${sideId}"></i>
          <span id="like-cnt-${sideId}">${fmtN(entry.likes||0)}</span>
        </div>
        <div class="bs-act" onclick="openComments('entries','${entry.id}','${esc(entry.authorName||'')}','${entry.mediaURL||''}')">
          <i class="fa-regular fa-comment-dots"></i>
          <span>${fmtN(entry.commentCount||0)}</span>
        </div>
        <div class="bs-act">
          <button class="bs-support-btn" id="support-${entry.id}" onclick="toggleFollow('${entry.authorId}',this)">Support</button>
        </div>
      </div>
    </div>`;

  // Check liked
  db.collection('entryLikes').doc(`${CU.uid}_${entry.id}`).get().then(s=>{
    if(s.exists){
      const ico=document.getElementById(`like-ico-${sideId}`);
      if(ico){ico.className='fa-solid fa-heart';ico.style.color='var(--re)';}
      document.getElementById(`like-act-${sideId}`)?.classList.add('liked');
    }
  });
  db.collection('follows').doc(`${CU.uid}_${entry.authorId}`).get().then(s=>{
    const btn=document.getElementById(`support-${entry.id}`);
    if(s.exists&&btn){btn.textContent='Supporting';btn.classList.add('flw');}
  });
  return div;
}

function playVid(sideId, side, chalId, pairIdx) {
  const vid = document.getElementById(`vid-${sideId}`);
  const thumb = document.getElementById(`thumb-${sideId}`);
  const playBtn = document.getElementById(`play-${sideId}`);
  if (!vid) return;
  
  // Always show video, hide thumbnail
  if (thumb) thumb.style.display = 'none';
  vid.style.display = 'block';
  vid.muted = isMuted;
  
  // Pause other video in this pair
  const pair = vid.closest('.battle-pair');
  if (pair) {
    pair.querySelectorAll('.bs-video').forEach(v => {
      if (v !== vid && !v.paused) {
        v.pause();
        const otherPlay = v.closest('.battle-side')?.querySelector('.bs-play-btn');
        if (otherPlay) otherPlay.classList.remove('gone');
      }
    });
  }
  
  // Play and update button
  vid.play().catch(() => {});
  if (playBtn) playBtn.classList.add('gone');
  
  // Show actions on this side
  if (pair) {
    pair.querySelectorAll('.battle-side').forEach(s => {
      const acts = s.querySelector('.bs-actions');
      if (acts) acts.style.opacity = s.contains(vid) ? '1' : '0';
    });
  }
}

function onVidEnded(chalId, side, pairIdx) {
  const nextSide = side === 'a' ? 'b' : 'a';
  const nextSideId = `${chalId}-${nextSide}-${pairIdx}`;
  const vid = document.getElementById(`vid-${nextSideId}`);
  const thumb = document.getElementById(`thumb-${nextSideId}`);
  const playBtn = document.getElementById(`play-${nextSideId}`);
  if (!vid) return;
  if (thumb) thumb.style.display = 'none';
  vid.style.display = 'block';
  vid.muted = isMuted;
  vid.play().catch(() => {});
  if (playBtn) playBtn.classList.add('gone');
  const pair = vid.closest('.battle-pair');
  
    if (pair) {
    pair.querySelectorAll('.battle-side').forEach(s => {
      const acts = s.querySelector('.bs-actions');
      if (acts) acts.style.opacity = s.contains(vid) ? '1' : '0';
    });
  }


}

function autoplayFirstVid(chalId, pairIdx) {
  // No-op for image-only platform — images are always visible
  return;
  // ── dead code below preserved for reference ──
  const sideId = `${chalId}-a-${pairIdx}`;
  const vid = document.getElementById(`vid-${sideId}`);
  const thumb = document.getElementById(`thumb-${sideId}`);
  const playBtn = document.getElementById(`play-${sideId}`);
  if (!vid) return;
  setTimeout(() => {
    if (thumb) thumb.style.display = 'none';
    vid.style.display = 'block';
    vid.muted = isMuted;
    vid.play().catch(() => {});
    if (playBtn) playBtn.classList.add('gone');
    const pair = vid.closest('.battle-pair');
    if (pair) {
      pair.querySelectorAll('.battle-side').forEach(s => {
        const acts = s.querySelector('.bs-actions');
        if (acts) acts.style.opacity = s.contains(vid) ? '1' : '0';
      });
    }
  }, 400);
}
function toggleVidPlay(sideId) {
  const vid = document.getElementById(`vid-${sideId}`);
  const playBtn = document.getElementById(`play-${sideId}`);
  if (!vid) return;
  // Stop event reaching the side div
  if (vid.paused) {
    vid.play().catch(() => {});
    if (playBtn) playBtn.classList.add('gone');
  } else {
    vid.pause();
    if (playBtn) playBtn.classList.remove('gone');
  }
}
function toggleArenaMute(e,sideId){
  e.stopPropagation();
  isMuted=!isMuted;
  document.querySelectorAll('.bs-video').forEach(v=>v.muted=isMuted);
  document.querySelectorAll('.bs-mute i').forEach(i=>i.className=`fa-solid ${isMuted?'fa-volume-xmark':'fa-volume-high'}`);
}

function buildPairIndicator(chalId,total){
  const pi=document.getElementById(`pi-${chalId}`); if(!pi)return;
  pi.innerHTML='';
  for(let i=0;i<Math.min(total,8);i++){
    const dot=document.createElement('div');
    dot.className='pi-dot'+(i===0?' active':'');
    dot.id=`pid-${chalId}-${i}`;
    pi.appendChild(dot);
  }
}

function onSwiperScroll(chalId,swiper,pairs){
  const idx=Math.round(swiper.scrollLeft/swiper.offsetWidth);
  // Autoplay first video of newly visible pair
autoplayFirstVid(chalId, idx);
  // Update dots
  document.querySelectorAll(`[id^="pid-${chalId}-"]`).forEach((d,i)=>d.classList.toggle('active',i===idx));
  // Update swipe hint
  const hint=document.getElementById(`vsh-${chalId}`);
  if(hint){
    if(pairs.length<=1) hint.style.display='none';
    else hint.textContent=`Pair ${idx+1} of ${pairs.length} · swipe to compare`;
  }
  // checkPairVoted resets buttons to clean state synchronously,
  // then checks Firestore and marks voted state if needed.
  // No separate button update needed here.
  if(pairs[idx]) checkPairVoted(chalId,pairs[idx],idx);
}

async function checkPairVoted(chalId,pair,pairIdx){
  if(!pair||!pair[0]) return;
  const btnA=document.getElementById(`va-${chalId}`);
  const btnB=document.getElementById(`vb2-${chalId}`);

  // ── Reset buttons to clean active state immediately ──
  // This MUST happen synchronously before the async Firestore check
  // so the user never sees stale voted state from a previous pair
  const nameA=pair[0]?esc(pair[0].authorName||'Left'):'Left';
  const nameB=pair[1]?esc(pair[1].authorName||'Right'):'Right';
  if(btnA){
    btnA.className='vbtn vbtn-a';
    btnA.textContent=`Vote ${nameA}`;
    btnA.disabled=!pair[0];
    btnA.removeAttribute('disabled');
    if(!pair[0]) btnA.disabled=true;
  }
  if(btnB){
    btnB.className='vbtn vbtn-b';
    btnB.textContent=`Vote ${nameB}`;
    btnB.disabled=!pair[1];
    btnB.removeAttribute('disabled');
    if(!pair[1]) btnB.disabled=true;
  }

  // ── Key vote by the specific matchup (sorted entry IDs) not slot position ──
  // This means: voting entry2 vs entry3 is always a separate vote from
  // entry1 vs entry2, even if they appear in the same slot at different times
  const idA=pair[0]?.id||'';
  const idB=pair[1]?.id||'';
  // Sort so the key is the same regardless of which side each entry is on
  const [sortedA,sortedB]=[idA,idB].sort();
  const voteKey=`${CU.uid}_${chalId}_${sortedA}_${sortedB}`;
  const voteRef=db.collection('challengeVotes').doc(voteKey);
  const snap=await voteRef.get();
  if(!snap.exists) return; // fresh matchup — buttons already reset above

  // Already voted on this exact matchup — show which side they picked
  const {votedEntryId} = snap.data();
  const votedSide = idA===votedEntryId ? 'a' : 'b';
  if(btnA){
    btnA.disabled=true;
    if(votedSide==='a'){btnA.className='vbtn voted';btnA.textContent='✓ Your Vote';}
    else btnA.disabled=true;
  }
  if(btnB){
    btnB.disabled=true;
    if(votedSide==='b'){btnB.className='vbtn voted';btnB.textContent='✓ Your Vote';}
    else btnB.disabled=true;
  }
  if(pair[0]&&pair[1]) loadPairProgress(chalId,idA,idB);
}

async function castVote(chalId,side,btn){
  const swiper=document.getElementById(`bs-${chalId}`);
  if(!swiper)return;
  const pairIdx=Math.round(swiper.scrollLeft/swiper.offsetWidth);
  const pairs=swiper.querySelectorAll('.battle-pair');
  const pair=pairs[pairIdx];
  if(!pair)return;

  const entryAId=pair.dataset.entryA;
  const entryBId=pair.dataset.entryB;
  if(!entryAId||!entryBId){showToast('Invalid pair — cannot vote.');return;}

  // Key by sorted entry IDs so A-vs-B and B-vs-A are the same matchup
  const [sortedA,sortedB]=[entryAId,entryBId].sort();
  const voteKey=`${CU.uid}_${chalId}_${sortedA}_${sortedB}`;
  const voteRef=db.collection('challengeVotes').doc(voteKey);

  const existing=await voteRef.get();
  if(existing.exists){showToast('Already voted on this matchup!');return;}

  const votedEntryId=side==='a'?entryAId:entryBId;

  // Write vote — store both original-order and sorted IDs for querying
  await voteRef.set({
    chalId, pairIdx, side,
    entryAId, entryBId,
    sortedA, sortedB,
    votedEntryId,
    userId:CU.uid, createdAt:ts()
  });

  // Increment totals
  await db.collection('challenges').doc(chalId).update({
    totalVotes:firebase.firestore.FieldValue.increment(1)
  });
  if(side==='a') await db.collection('entries').doc(entryAId).update({votes:firebase.firestore.FieldValue.increment(1)});
  if(side==='b') await db.collection('entries').doc(entryBId).update({votes:firebase.firestore.FieldValue.increment(1)});

  // Mark voted button, disable both
  btn.className='vbtn voted';
  btn.textContent='✓ Your Vote';
  btn.disabled=true;
  const otherBtnId=side==='a'?`vb2-${chalId}`:`va-${chalId}`;
  const otherBtn=document.getElementById(otherBtnId);
  if(otherBtn) otherBtn.disabled=true;

  showToast('✓ Vote counted!');
  loadPairProgress(chalId,entryAId,entryBId);
  // Notify the author of the voted entry
  const votedEntry = side==='a' ? votedEntryId : votedEntryId;
  // Get author of the entry that was voted for
  db.collection('entries').doc(votedEntryId).get().then(snap=>{
    if(!snap.exists)return;
    const authorId=snap.data().authorId;
    if(authorId&&authorId!==CU.uid){
      addNotif(authorId,'vote',
        `${CUD.username||'Someone'} voted for your photo in a challenge!`,
        'entries', votedEntryId);
    }
  }).catch(()=>{});
}

async function loadPairProgress(chalId,entryAId,entryBId){
  const el=document.getElementById(`vbp-${chalId}`); if(!el)return;
  const [snapA,snapB]=await Promise.all([
    db.collection('entries').doc(entryAId).get(),
    db.collection('entries').doc(entryBId).get()
  ]);
  const vA=snapA.exists?(snapA.data().votes||0):0;
  const vB=snapB.exists?(snapB.data().votes||0):0;
  const tot=vA+vB||1;
  const pA=Math.round(vA/tot*100), pB=100-pA;
  el.innerHTML=`
    <div class="vbp-side">
      <div class="vbp-bar-wrap"><div class="vbp-bar" style="width:${pA}%"></div></div>
      <div class="vbp-lbl">${pA}% · ${fmtN(vA)} votes</div>
    </div>
    <div class="vbp-side" style="text-align:right;">
      <div class="vbp-bar-wrap"><div class="vbp-bar" style="width:${pB}%"></div></div>
      <div class="vbp-lbl">${pB}% · ${fmtN(vB)} votes</div>
    </div>`;
}

// entry IDs now set directly in buildPair

// ═══════════════════════════════════
// ENTRY LIKES
// ═══════════════════════════════════
async function likeEntry(entryId,authorId,sideId,btn){
  if(!entryId){return;}
  const lid=`${CU.uid}_${entryId}`;
  const ref=db.collection('entryLikes').doc(lid);
  const ico=document.getElementById(`like-ico-${sideId}`);
  const cnt=document.getElementById(`like-cnt-${sideId}`);
  const snap=await ref.get();
  if(snap.exists){
    await ref.delete();
    await db.collection('entries').doc(entryId).update({likes:firebase.firestore.FieldValue.increment(-1)});
    if(ico){ico.className='fa-regular fa-heart';ico.style.color='';}
    btn.classList.remove('liked');
  } else {
    await ref.set({entryId,userId:CU.uid,authorId,createdAt:ts()});
    await db.collection('entries').doc(entryId).update({likes:firebase.firestore.FieldValue.increment(1)});
    if(ico){ico.className='fa-solid fa-heart';ico.style.color='var(--re)';}
    btn.classList.add('liked');
    ico.style.transform='scale(1.4)'; setTimeout(()=>ico.style.transform='',200);
    if(authorId!==CU.uid) addNotif(authorId,'vote',`${CUD.username} liked your entry!`,'entries',entryId);
  }
  // Refresh count
  const fresh=await db.collection('entries').doc(entryId).get();
  if(fresh.exists&&cnt) cnt.textContent=fmtN(fresh.data().likes||0);
}

// ═══════════════════════════════════
// CREATE CHALLENGE
// ═══════════════════════════════════
function resetCreateForm(){
  ['chal-title','chal-desc'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  createMediaFile=null;
  document.getElementById('create-err')?.classList.add('hidden');
}
function useChip(el){
  const input=document.getElementById('chal-title');
  if(input) input.value=el.textContent+' ';
  input?.focus();
}
function prevEntryMedia(input){
  // No longer used — admin create has no media
}
function showMPrev(file,prevId,dropId){
  const prev=document.getElementById(prevId); if(!prev)return;
  const r=new FileReader(); r.onload=e=>{
    const isVid=file.type.startsWith('video/');
    prev.innerHTML=`<div class="mprev">${isVid?`<video src="${e.target.result}" controls style="width:100%;max-height:220px;object-fit:cover;display:block;border-radius:8px;"></video>`:`<img src="${e.target.result}" style="width:100%;max-height:220px;object-fit:cover;display:block;border-radius:8px;"/>`}<button class="rm-media" onclick="clearMPrev('${prevId}','${dropId}')"><i class="fa-solid fa-xmark"></i></button></div>`;
    prev.classList.remove('hidden');
    if(dropId) document.getElementById(dropId)?.classList.add('hidden');
  }; r.readAsDataURL(file);
}
function clearMPrev(prevId,dropId){
  const prev=document.getElementById(prevId);
  if(prev){prev.classList.add('hidden');prev.innerHTML='';}
  if(dropId) document.getElementById(dropId)?.classList.remove('hidden');
  createMediaFile=null; joinMediaFile=null;
}
// ═══════════════════════════════════
// CREATE CHALLENGE (admin only)
// ═══════════════════════════════════
async function submitChallenge(){
  if(!isAdmin){ showToast('Admin access only.'); return; }
  const title=document.getElementById('chal-title').value.trim();
  const desc=document.getElementById('chal-desc').value.trim();
  const expiry=parseInt(document.getElementById('chal-expiry').value);
  const err=document.getElementById('create-err'); err.classList.add('hidden');
  if(!title){showErr(err,'Give your challenge a title.');return;}
  const btn=document.querySelector('#scr-create .btn-or'); setBtnLoad(btn,true);
  try{
    // Create challenge — no expiresAt yet, timer starts when first entry submitted
    const chalRef=await db.collection('challenges').add({
      title, description:desc, niche:'pics',
      creatorId:CU.uid, creatorUsername:CUD.username||'',
      creatorName:CUD.displayName||'', creatorPhoto:CUD.photoURL||null,
      entryCount:0, totalVotes:0, commentCount:0,
      durationDays:expiry,
      status:'pending',
      expiresAt:null,
      createdAt:ts()
    });
    // Update admin stats
    await db.collection('users').doc(CU.uid).update({
      challengesCreated:firebase.firestore.FieldValue.increment(1)
    }).catch(()=>{});
    CUD.challengesCreated=(CUD.challengesCreated||0)+1;
    // Notify all @pics users
    notifyAllUsersNewChallenge(title, chalRef.id);
    resetCreateForm();
    showToast('🏆 Challenge launched! Timer starts on first photo entry.');
    showScr('arena');
  }catch(e){
    showErr(err,e.message);
  }
  setBtnLoad(btn,false,'<i class="fa-solid fa-flag"></i> <span>Launch Challenge</span>');
}

async function notifyAllUsersNewChallenge(title, chalId){
  // Background push to ALL subscribed users via OneSignal
  await pushToAll(
    '📸 New Challenge: ' + title,
    'A new challenge just dropped — submit your best photo now!'
  );
  // In-app notification for when they open the app
  try{
    const snap=await db.collection('users').limit(50).get();
    const batch=db.batch();
    snap.forEach(doc=>{
      if(doc.id===CU.uid)return;
      const nRef=db.collection('notifications').doc();
      batch.set(nRef,{
        toUid:doc.id, type:'new_challenge',
        message:`📸 New challenge: "${title}" — submit your best photo now!`,
        refCollection:'challenges', refId:chalId, read:false, createdAt:ts()
      });
    });
    await batch.commit();
  }catch(e){ console.warn('Notify all failed',e); }
}

// ═══════════════════════════════════
// JOIN CHALLENGE
// ═══════════════════════════════════
function openJoin(chalId,chalTitle,chalCreator,chalCreatorId){
  joinTarget={chalId,chalTitle,chalCreator,chalCreatorId:chalCreatorId||''};
  joinSelEntry=null; joinMediaFile=null;
  document.getElementById('join-chal-info').innerHTML=`<div class="jt">${esc(chalTitle||'Challenge')}</div><div class="jm">by ${esc(chalCreator||'')} · Submit your entry to compete</div>`;
  document.getElementById('join-err')?.classList.add('hidden');
  clearMPrev('join-media-prev',null);
  document.getElementById('join-overlay').classList.remove('hidden');
  document.body.style.overflow='hidden';
  loadMyEntriesForPicker();
}
function closeJoin(){
  document.getElementById('join-overlay').classList.add('hidden');
  document.body.style.overflow='';
  joinTarget=null; joinSelEntry=null; joinMediaFile=null;
}
async function loadMyEntriesForPicker(){
  const list=document.getElementById('join-existing'); if(!list)return;
  list.innerHTML='<div class="loading" style="padding:14px;"><div class="spin dark"></div></div>';
  // Get user's existing entries from other challenges
  const snap=await db.collection('entries').where('authorId','==',CU.uid).orderBy('createdAt','desc').limit(12).get();
  if(snap.empty){
    list.innerHTML='<div style="font-size:12px;color:var(--mu);padding:10px;text-align:center;">No previous entries. Create a new one below.</div>';
    return;
  }
  list.innerHTML='';
  snap.forEach(doc=>{
    const d=doc.data();
    const item=document.createElement('div');
    item.className='ep-item';
    const thumb=d.thumbURL||d.mediaURL;
    const thumbHTML=thumb
      ?(d.mediaType==='video'?`<img src="${d.thumbURL||d.mediaURL}" style="width:100%;height:100%;object-fit:cover;"/>`:`<img src="${d.mediaURL}" style="width:100%;height:100%;object-fit:cover;"/>`)
      :`<span>🎭</span>`;
    item.innerHTML=`<div class="ep-thumb">${thumbHTML}</div><div class="ep-info"><p>${esc((d.caption||'No caption').substring(0,50))}</p><small>${d.createdAt?timeAgo(d.createdAt.toDate()):'recently'}</small></div><i class="fa-regular fa-circle-check ep-check"></i>`;
    item.onclick=()=>{
      document.querySelectorAll('#join-existing .ep-item').forEach(i=>{i.classList.remove('sel');i.querySelector('.ep-check').className='fa-regular fa-circle-check ep-check';});
      item.classList.add('sel'); item.querySelector('.ep-check').className='fa-solid fa-circle-check ep-check';
      joinSelEntry={mediaURL:d.mediaURL,mediaType:d.mediaType,thumbURL:d.thumbURL||null,caption:d.caption||''};
    };
    list.appendChild(item);
  });
}
function setJoinTab(el,tab){
  document.querySelectorAll('#join-overlay .ptab').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('join-existing').classList.toggle('hidden',tab!=='existing');
  document.getElementById('join-new').classList.toggle('hidden',tab!=='new');
}
function prevJoinMedia(input){
  const f=input.files[0]; if(!f)return;
  if(!f.type.startsWith('image/')){showToast('Images only — please choose a photo.');input.value='';return;}
  joinMediaFile=f;
  showMPrev(f,'join-media-prev',null);
}
async function submitJoin(){
  if(!joinTarget)return;
  const isNew=!document.getElementById('join-new').classList.contains('hidden');
  const err=document.getElementById('join-err'); err.classList.add('hidden');
  if(!isNew&&!joinSelEntry){showErr(err,'Select an entry or create a new one.');return;}
  const cap=document.getElementById('join-cap')?.value.trim()||'';
  if(isNew&&!cap&&!joinMediaFile){showErr(err,'Add a caption or media for your entry.');return;}
  const btn=document.querySelector('#join-overlay .btn-or'); setBtnLoad(btn,true);
  try{
    let mediaURL=null,mediaType=null,thumbURL=null,caption=cap;
    if(isNew){
      if(joinMediaFile){
        showToast('Uploading...');
        const res=await uploadWithThumb(joinMediaFile,`entries/${CU.uid}`);
        mediaURL=res.url; mediaType=res.type; thumbURL=res.thumbURL;
      }
    } else {
      mediaURL=joinSelEntry.mediaURL; mediaType=joinSelEntry.mediaType;
      thumbURL=joinSelEntry.thumbURL; caption=joinSelEntry.caption;
    }
    // Check not already entered
    const existing=await db.collection('entries').where('chalId','==',joinTarget.chalId).where('authorId','==',CU.uid).limit(1).get();
    if(!existing.empty){showErr(err,'You already entered this challenge.');setBtnLoad(btn,false,'<i class="fa-solid fa-shield-halved"></i> <span>Submit Entry</span>');return;}
    await db.collection('entries').add({
      chalId:joinTarget.chalId, authorId:CU.uid,
      authorName:CUD.displayName||'', authorUsername:CUD.username||'',
      authorPhoto:CUD.photoURL||null,
      caption, mediaURL, mediaType, thumbURL,
      votes:0, likes:0, commentCount:0,
      isCreatorEntry:false, createdAt:ts()
    });
    // Check if this is the first entry — if so, start the timer
    const chalSnap=await db.collection('challenges').doc(joinTarget.chalId).get();
    const chalData=chalSnap.data();
    const updateData={entryCount:firebase.firestore.FieldValue.increment(1)};
    if(chalData.status==='pending'&&chalData.entryCount===0){
      const durationDays=chalData.durationDays||3;
      updateData.expiresAt=new Date(Date.now()+durationDays*24*60*60*1000);
      updateData.status='active';
    }
    await db.collection('challenges').doc(joinTarget.chalId).update(updateData);
    await db.collection('users').doc(CU.uid).update({
      challengesJoined:firebase.firestore.FieldValue.increment(1)
    });
    CUD.challengesJoined=(CUD.challengesJoined||0)+1;
    // Notify challenge creator
    addNotif(joinTarget.chalCreatorId||'','entry',`${CUD.username} submitted an entry to your challenge "${joinTarget.chalTitle}"!`,'challenges',joinTarget.chalId);
    closeJoin();
    showToast('📸 Photo submitted!');
    initArena();
  }catch(e){showErr(err,e.message);}
  setBtnLoad(btn,false,'<i class="fa-solid fa-shield-halved"></i> <span>Submit Entry</span>');
}

// ═══════════════════════════════════
// PROFILE
// ═══════════════════════════════════
async function initProfile(uid,isOwn,container){
  const el=document.getElementById(container||'profile-body');
  el.innerHTML='<div class="loading"><div class="spin dark"></div><span>Loading...</span></div>';
  const snap=await db.collection('users').doc(uid).get();
  if(!snap.exists){el.innerHTML='<div class="loading"><p>Profile not found.</p></div>';return;}
  const u=snap.data();
  if(isOwn) CUD=u;
  // Track profile view (only for other users' profiles)
  if(!isOwn&&uid!==CU.uid){
    db.collection('users').doc(uid).update({profileViews:firebase.firestore.FieldValue.increment(1)}).catch(()=>{});
    db.collection('profileViews').add({viewerUid:CU.uid,viewedUid:uid,createdAt:ts()}).catch(()=>{});
  }
  const lv=getLevel(u);
  const avHTML=u.photoURL?`<img src="${u.photoURL}"/>`:(u.displayName||'?').charAt(0).toUpperCase();
  el.innerHTML=`
    <div class="prof-cover"><div class="prof-glow"></div><div class="prof-grid"></div>
      <div class="prof-av-wrap"><div class="prof-av">${avHTML}<div class="prof-av-ring"></div></div></div>
    </div>
    <div class="prof-body">
      <div class="prof-name">${esc(u.displayName||'')}</div>
      <div class="prof-urow">
        <span class="prof-user">${esc((u.username||'').split('@')[0])}<span>@pics</span></span>
        <div class="lvl-badge"><i class="fa-solid fa-arrow-up"></i>${lv}</div>
      </div>
      <div class="prof-stats">
        <div class="ps"><div class="ps-v or">${fmtN(u.challengeWins||0)}</div><div class="ps-l">Wins</div></div>
        <div class="ps"><div class="ps-v">${fmtN(u.followers||0)}</div><div class="ps-l">Supporters</div></div>
        <div class="ps"><div class="ps-v go">${fmtN(u.totalVotesReceived||0)}</div><div class="ps-l">Votes</div></div>
      </div>
      ${isOwn
        ?`<div class="profile-actions"><div class="prof-acts"><button class="prof-edit-btn" onclick="showToast('Edit profile coming soon!')">Edit Profile</button></div>
           <div class="prof-acts" style="margin-top:-8px;"><button class="btn-ghost w" onclick="auth.signOut()"><i class="fa-solid fa-right-from-bracket"></i> Sign Out</button></div></div>
           ${isAdmin?`<div style="padding:0 8px 8px;"><button onclick="showScr('create')" style="width:100%;background:rgba(255,92,26,0.1);border:1px solid rgba(255,92,26,0.3);border-radius:8px;padding:14px;display:flex;align-items:center;gap:10px;cursor:pointer;"><div style="width:36px;height:36px;border-radius:50%;background:rgba(255,92,26,0.15);border:1px solid rgba(255,92,26,0.3);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fa-solid fa-shield-halved" style="font-size:15px;color:var(--or);"></i></div><div style="text-align:left;"><div style="font-size:13px;font-weight:700;color:var(--tx);">Create Challenge</div><div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--mu);margin-top:2px;">Admin · Launch a new challenge</div></div><i class="fa-solid fa-chevron-right" style="font-size:12px;color:var(--mu2);margin-left:auto;"></i></button></div>`:''}
           <div style="padding:0 8px 8px;">
  <button onclick="openFeedback()"
    style="width:100%;background:rgba(245,180,50,0.06);border:1px solid rgba(245,180,50,0.2);border-radius:8px;padding:14px;display:flex;align-items:center;gap:10px;cursor:pointer;">
    <div style="width:36px;height:36px;border-radius:50%;background:rgba(245,180,50,0.1);border:1px solid rgba(245,180,50,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
      <i class="fa-regular fa-comment-dots" style="font-size:15px;color:var(--go);"></i>
    </div>
    <div style="text-align:left;">
      <div style="font-size:13px;font-weight:700;color:var(--tx);">Give Feedback</div>
      <div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--mu);margin-top:2px;">Help us build MiStream better</div>
    </div>
    <i class="fa-solid fa-chevron-right" style="font-size:12px;color:var(--mu2);margin-left:auto;"></i>
  </button>
</div>`
        :`<div class="prof-acts"><button class="prof-follow-btn" id="pfb-${uid}" onclick="toggleFollow('${uid}',this)">Support</button></div>`
      }
      ${isOwn?`<div style="font-family:'Space Mono',monospace;font-size:9px;color:var(--mu);margin-bottom:14px;">${fmtN(u.profileViews||0)} profile views</div>`:''}
      <div class="prof-tabs">
        <button class="ptab-btn active" onclick="setProfTab(this,'created','${uid}')">Challenges Created</button>
        <button class="ptab-btn" onclick="setProfTab(this,'joined','${uid}')">Challenges Joined</button>
      </div>
      <div class="chal-grid" id="prof-grid-${uid}"></div>
    </div>`;
  loadProfTab('created',uid);
  if(!isOwn){
    db.collection('follows').doc(`${CU.uid}_${uid}`).get().then(s=>{
      const btn=document.getElementById(`pfb-${uid}`);
      if(s.exists&&btn){btn.textContent='Supporting';btn.classList.add('flw');}
    });
  }
}

function setProfTab(el,tab,uid){
  el.closest('.prof-body').querySelectorAll('.ptab-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  loadProfTab(tab,uid);
}

async function loadProfTab(tab,uid){
  const grid=document.getElementById(`prof-grid-${uid}`); if(!grid)return;
  grid.innerHTML='<div class="loading" style="padding:20px;"><div class="spin dark"></div></div>';
  let snap;
  if(tab==='created'){
    snap=await db.collection('challenges').where('creatorId','==',uid).orderBy('createdAt','desc').limit(20).get();
  } else {
    snap=await db.collection('entries').where('authorId','==',uid).orderBy('createdAt','desc').limit(20).get();
  }
  if(snap.empty){grid.innerHTML='<div style="padding:30px;text-align:center;color:var(--mu);font-size:13px;">Nothing here yet.</div>';return;}
  grid.innerHTML='';
  if(tab==='created'){
    snap.forEach(doc=>{
      const d=doc.data();
      const isEnded=d.expiresAt&&d.expiresAt.toDate()<new Date()||d.status==='ended';
      const item=document.createElement('div');
      item.className='cg-item';
      item.innerHTML=`<div class="cg-title">${esc(d.title||'Untitled')}</div><div class="cg-meta ${isEnded?'winner':''}"><span><i class="fa-solid fa-users"></i>${fmtN(d.entryCount||0)} entries</span><span><i class="fa-regular fa-thumbs-up"></i>${fmtN(d.totalVotes||0)} votes</span><span>${isEnded?'Ended':timeLeft(d.expiresAt?.toDate())}</span></div>`;
      item.onclick=()=>scrollToChallenge(doc.id);
      grid.appendChild(item);
    });
  } else {
    // Show challenges these entries belong to
    const chalIds=[...new Set(snap.docs.map(d=>d.data().chalId))];
    for(const chalId of chalIds.slice(0,10)){
      const chalSnap=await db.collection('challenges').doc(chalId).get();
      if(!chalSnap.exists) continue;
      const d=chalSnap.data();
      const myEntry=snap.docs.find(e=>e.data().chalId===chalId);
      const item=document.createElement('div');
      item.className='cg-item';
      item.innerHTML=`<div class="cg-title">${esc(d.title||'Untitled')}</div><div class="cg-meta"><span><i class="fa-solid fa-user"></i>by ${esc(d.creatorUsername||'')}</span><span><i class="fa-solid fa-users"></i>${fmtN(d.entryCount||0)} entries</span><span>${d.expiresAt&&d.expiresAt.toDate()<new Date()?'Ended':timeLeft(d.expiresAt?.toDate())}</span></div>`;
      item.onclick=()=>scrollToChallenge(chalId);
      grid.appendChild(item);
    }
  }
}

function scrollToChallenge(chalId){
  showScr('arena');
  setTimeout(()=>{
    const card=document.querySelector(`[data-chal-id="${chalId}"]`);
    if(card) card.scrollIntoView({behavior:'smooth',block:'start'});
  },400);
}

async function viewProfile(uid){
  if(uid===CU.uid){showScr('profile');return;}
    history.pushState({screen:'viewprofile'},'','');

  prevScr=curScr; curScr='viewprofile';
  document.querySelectorAll('.scr').forEach(s=>s.classList.remove('active'));
  document.getElementById('scr-viewprofile').classList.add('active');
  await initProfile(uid,false,'viewprofile-body');
}

async function toggleFollow(uid,btn){
  const fid=`${CU.uid}_${uid}`;
  const ref=db.collection('follows').doc(fid);
  if (btn.textContent=='Support') {
    btn.textContent='Supporting'
    btn.classList.add('flw');
  } else {
        btn.textContent='Support'
        btn.classList.remove('flw');
  }
  const snap=await ref.get();
  if(snap.exists){
    await ref.delete();
    await db.collection('users').doc(uid).update({followers:firebase.firestore.FieldValue.increment(-1)});
    await db.collection('users').doc(CU.uid).update({following:firebase.firestore.FieldValue.increment(-1)});
   /* if(btn){btn.textContent='Support';btn.classList.remove('flw');}*/
  } else {
    await ref.set({followerId:CU.uid,followingId:uid,createdAt:ts()});
    await db.collection('users').doc(uid).update({followers:firebase.firestore.FieldValue.increment(1)});
    await db.collection('users').doc(CU.uid).update({following:firebase.firestore.FieldValue.increment(1)});
   /* if(btn){btn.textContent='Supporting';btn.classList.add('flw');}*/
    addNotif(uid,'support',`${CUD.username} started supporting you.`,'users',CU.uid);
  }
}

// ═══════════════════════════════════
// COMMENTS
// ═══════════════════════════════════
function openComments(collection, docId, authorName, thumbURL){
  comTarget={collection,docId};
  document.getElementById('cs-overlay').classList.remove('hidden');
  document.body.style.overflow='hidden';
  const av=document.getElementById('cs-av');
  if(av) av.innerHTML=CUD.photoURL?`<img src="${CUD.photoURL}"/>`:(CUD.displayName||'?').charAt(0).toUpperCase();
  document.getElementById('cs-text').value='';
  document.getElementById('cs-send').disabled=true;
  // Update header with entry context
  const hdr=document.getElementById('cs-entry-context');
  if(hdr){
    if(authorName||thumbURL){
      hdr.innerHTML=`${authorName?`<span style="font-family:'Space Mono',monospace;font-size:12px;color:var(--or);font-weight:700;">${esc(authorName)}</span>`:''}${thumbURL?`<img src="${thumbURL}" style="width:32px;height:40px;object-fit:cover;border-radius:4px;margin-left:8px;flex-shrink:0;"/>`:''}`;
      hdr.classList.remove('hidden');
    } else {
      hdr.classList.add('hidden');
    }
  }
  loadComments();
}function closeComments(){
  comTarget=null;
  if(comUnsub){comUnsub();comUnsub=null;}
  document.getElementById('cs-overlay').classList.add('hidden');
  document.body.style.overflow='';
}
function loadComments(){
  const list=document.getElementById('cs-list');
  list.innerHTML='<div class="loading"><div class="spin dark"></div></div>';
  if(comUnsub) comUnsub();
  if(!comTarget)return;
  comUnsub=db.collection(comTarget.collection).doc(comTarget.docId)
    .collection('comments').orderBy('createdAt','asc')
    .onSnapshot(snap=>{
      const countEl=document.getElementById('cs-count');
      if(countEl) countEl.textContent=snap.size>0?`(${snap.size})`:'';
      if(snap.empty){list.innerHTML='<div class="com-empty"><i class="fa-regular fa-comment-dots"></i><p>No comments yet. Be first!</p></div>';return;}
      list.innerHTML='';
      snap.forEach(doc=>list.appendChild(buildComment(doc.data(),doc.id)));
      list.scrollTop=list.scrollHeight;
    });
}
async function submitComment(){
  const input=document.getElementById('cs-text');
  const text=input.value.trim(); if(!text||!comTarget)return;
  input.value=''; document.getElementById('cs-send').disabled=true;
  await db.collection(comTarget.collection).doc(comTarget.docId)
    .collection('comments').add({
      authorId:CU.uid, authorName:CUD.displayName||'',
      authorUsername:CUD.username||'', authorPhoto:CUD.photoURL||null,
      text, likes:0, createdAt:ts()
    });
  // Increment comment count
  const countField=comTarget.collection==='challenges'?'commentCount':'commentCount';
  await db.collection(comTarget.collection).doc(comTarget.docId).update({
    [countField]:firebase.firestore.FieldValue.increment(1)
  }).catch(()=>{});
  // Update counter in UI
  const cnt=document.getElementById(`com-cnt-${comTarget.docId}`);
  if(cnt) cnt.textContent=fmtN((parseInt(cnt.textContent.replace(/[^0-9]/g,''))||0)+1);
  // Notify the author of the post being commented on
  db.collection(comTarget.collection).doc(comTarget.docId).get().then(snap=>{
    if(!snap.exists)return;
    const d=snap.data();
    const authorId=d.authorId||d.creatorId;
    if(authorId&&authorId!==CU.uid){
      const label=comTarget.collection==='challenges'?'your challenge':'your photo';
      addNotif(authorId,'comment',
        `${CUD.username||'Someone'} commented on ${label}: "${text.slice(0,60)}${text.length>60?'…':''}"`,
        comTarget.collection, comTarget.docId);
    }
  }).catch(()=>{});
}
function buildComment(d,commentId){
  const div=document.createElement('div'); div.className='com-item';
  const av=d.authorPhoto?`<div class="com-av"><img src="${d.authorPhoto}"/></div>`:`<div class="com-av">${(d.authorName||'?').charAt(0).toUpperCase()}</div>`;
  div.innerHTML=`${av}<div class="com-body"><div class="com-hdr"><span class="com-name">${esc(d.authorName||'')}</span><span class="com-un">${esc(d.authorUsername||'')}</span><span class="com-time">${d.createdAt?timeAgo(d.createdAt.toDate()):'now'}</span></div><div class="com-text">${esc(d.text)}</div><button class="com-like-btn" id="cl-${commentId}" onclick="likeComment('${commentId}',this)"><i class="fa-regular fa-heart"></i> <span>${d.likes||0}</span></button></div>`;
  db.collection('commentLikes').doc(`${CU.uid}_${commentId}`).get().then(s=>{
    if(s.exists){const btn=document.getElementById(`cl-${commentId}`);if(btn)btn.classList.add('liked');}
  });
  return div;
}
async function likeComment(commentId,btn){
  if(!comTarget)return;
  // Prevent double-tap race condition
  if(btn.dataset.pending==='1')return;
  btn.dataset.pending='1';
  const lid=`${CU.uid}_${commentId}`;
  const likeRef=db.collection('commentLikes').doc(lid);
  const comRef=db.collection(comTarget.collection).doc(comTarget.docId).collection('comments').doc(commentId);
  const cnt=btn.querySelector('span');
  try{
    const snap=await likeRef.get();
    if(snap.exists){
      // Unlike — use transaction so count never goes below 0
      await db.runTransaction(async t=>{
        const doc=await t.get(comRef);
        const cur=doc.data()?.likes||0;
        t.update(comRef,{likes:Math.max(0,cur-1)});
        t.delete(likeRef);
      });
      btn.classList.remove('liked');
      const fresh=await comRef.get();
      if(cnt) cnt.textContent=Math.max(0,fresh.data()?.likes||0);
    } else {
      await db.runTransaction(async t=>{
        const doc=await t.get(comRef);
        const cur=doc.data()?.likes||0;
        t.update(comRef,{likes:cur+1});
        t.set(likeRef,{commentId,userId:CU.uid,createdAt:ts()});
      });
      btn.classList.add('liked');
      const fresh=await comRef.get();
      if(cnt) cnt.textContent=Math.max(0,fresh.data()?.likes||0);
      // Notify comment author
      const comSnap=await comRef.get();
      const comAuthor=comSnap.data()?.authorId;
      if(comAuthor&&comAuthor!==CU.uid){
        addNotif(comAuthor,'comment_like',
          `${CUD.username||'Someone'} liked your comment.`,
          comTarget?.collection||'', comTarget?.docId||'');
      }
    }
  }catch(e){ console.warn('likeComment error',e); }
  btn.dataset.pending='0';
}

// ═══════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════
let notifListenerReady = false;

function listenNotifs() {
  
  if (notifUnsub) notifUnsub();
  
  notifUnsub = db.collection('notifications')
    .where('toUid', '==', CU.uid)
    .where('read', '==', false)
    .onSnapshot(snap => {
      
      document.getElementById('notif-dot')
        .classList.toggle('hidden', snap.size === 0);
      
      if (!notifListenerReady) {
        notifListenerReady = true;
        return;
      }
      
      snap.docChanges().forEach(change => {
        
        if (change.type !== 'added') return;
        
        const d = change.doc.data();
        
        if (Notification.permission === 'granted') {
          
          navigator.serviceWorker.ready.then(reg => {

    reg.showNotification('MiStream', {
      body: d.message || 'New notification',
      icon: '/icon-192.png',
      tag: change.doc.id
    });

  });
        }
        
      });
      
    });
  
}

async function initNotifs(){
  const body=document.getElementById('notif-body');
  body.innerHTML='<div class="loading"><div class="spin dark"></div></div>';
  const snap=await db.collection('notifications').where('toUid','==',CU.uid).orderBy('createdAt','desc').limit(30).get();
  if(snap.empty){body.innerHTML='<div class="notif-empty"><i class="fa-regular fa-bell"></i><p>No notifications yet.<br/>Win a challenge to get recognized.</p></div>';return;}
  body.innerHTML='';
  const batch=db.batch();
  const iconMap={
    win:'fa-solid fa-trophy',
    challenge:'fa-solid fa-flag',
    entry:'fa-solid fa-shield-halved',
    vote:'fa-solid fa-thumbs-up',
    comment:'fa-regular fa-comment-dots',
    comment_like:'fa-solid fa-heart',
    support:'fa-solid fa-people-arrows',
    leaderboard:'fa-solid fa-ranking-star',
    mention:'fa-solid fa-at',
    join:'fa-solid fa-shield-halved', // legacy
  };
  snap.forEach(doc=>{
    const d=doc.data();
    const type=d.type||'join';
    const item=document.createElement('div');
    item.className=`ni${d.read?'':' unread'}`;
    item.innerHTML=`<div class="ni-ico ${type}"><i class="${iconMap[type]||'fa-solid fa-bell'}"></i></div><div class="ni-txt"><p>${esc(d.message||'')}</p></div><div class="ni-time">${d.createdAt?timeAgo(d.createdAt.toDate()):'now'}</div>`;
if(d.refId) item.onclick=()=>showResults(d.refId); 
body.appendChild(item);
    if(!d.read) batch.update(doc.ref,{read:true});
  });
  await batch.commit();
  document.getElementById('notif-dot').classList.add('hidden');
}

async function showResults(chalId) {
  // Navigate to results screen
  history.pushState({screen:'results'}, '', '');
  prevScr = curScr; curScr = 'results';
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.bn').forEach(b => b.classList.remove('active'));
  document.getElementById('scr-results').classList.add('active');
  const body = document.getElementById('results-body');
  body.innerHTML = '<div class="loading"><div class="spin dark"></div><span>Loading results...</span></div>';

  // Fetch challenge
  const chalSnap = await db.collection('challenges').doc(chalId).get();
  if (!chalSnap.exists) { body.innerHTML = '<div class="loading"><p>Challenge not found.</p></div>'; return; }
  const d = chalSnap.data();
  const isEnded = d.status === 'ended' || (d.expiresAt && d.expiresAt.toDate() < new Date());

  // Fetch all entries sorted by votes
  const entriesSnap = await db.collection('entries')
    .where('chalId', '==', chalId)
    .limit(30)
    .get();
  const entries = entriesSnap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (b.votes || 0) - (a.votes || 0));

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  // Build hero section
  const heroClass = isEnded ? 'ended' : 'active';
  let heroHTML = '';

  if (isEnded && top3.length > 0) {
    // JUBILANT winner design
    const winner = top3[0];
    const second = top3[1];
    const third = top3[2];

    function podiumAv(entry, size) {
      const init = (entry.authorName || '?').charAt(0).toUpperCase();
      const bg = size === 'first'
        ? 'linear-gradient(135deg,var(--go),#e09020)'
        : size === 'second'
          ? 'linear-gradient(135deg,#a0a0c0,#808090)'
          : 'linear-gradient(135deg,#c07040,#a05030)';
      return entry.authorPhoto
        ? `<div class="podium-av" style="background:none;"><img src="${entry.authorPhoto}"/></div>`
        : `<div class="podium-av" style="background:${bg};">${init}</div>`;
    }

    const winnerSlot = `
      <div class="podium-slot first" onclick="viewProfile('${winner.authorId}')">
        <div class="podium-av-wrap">
          <div class="podium-crown">👑</div>
          ${podiumAv(winner, 'first')}
        </div>
        <div class="podium-name">${esc(winner.authorName || '')}</div>
        <div class="podium-un">${esc(winner.authorUsername || '')}</div>
        <div class="podium-votes">${fmtN(winner.votes || 0)} votes</div>
        <div class="podium-rank rk-1">🥇</div>
        <div class="podium-base"></div>
      </div>`;

    const secondSlot = second ? `
      <div class="podium-slot second" onclick="viewProfile('${second.authorId}')">
        <div class="podium-av-wrap" >${podiumAv(second, 'second')}</div>
        <div class="podium-name">${esc(second.authorName || '')}</div>
        <div class="podium-un">${esc(second.authorUsername || '')}</div>
        <div class="podium-votes">${fmtN(second.votes || 0)} votes</div>
        <div class="podium-rank rk-2">🥈</div>
        <div class="podium-base"></div>
      </div>` : '';

    const thirdSlot = third ? `
      <div class="podium-slot third" onclick="viewProfile('${third.authorId}')">
        <div class="podium-av-wrap" >${podiumAv(third, 'third')}</div>
        <div class="podium-name">${esc(third.authorName || '')}</div>
        <div class="podium-un">${esc(third.authorUsername || '')}</div>
        <div class="podium-votes">${fmtN(third.votes || 0)} votes</div>
        <div class="podium-rank rk-3">🥉</div>
        <div class="podium-base"></div>
      </div>` : '';

    heroHTML = `
      <div class="results-hero ${heroClass}">
        <div class="results-hero-glow"></div>
        <div class="winner-label">🏆 WINNER</div>
        <div class="winner-chal-name">${esc(d.title || '')}</div>
        <div class="podium">${secondSlot}${winnerSlot}${thirdSlot}</div>
        <div class="results-meta">
          <div class="results-meta-chip go"><i class="fa-regular fa-thumbs-up"></i>${fmtN(d.totalVotes || 0)} total votes</div>
          <div class="results-meta-chip"><i class="fa-solid fa-users"></i>${fmtN(d.entryCount || 0)} entries</div>
          <div class="results-meta-chip"><i class="fa-solid fa-flag"></i>by ${esc(d.creatorUsername || '')}</div>
        </div>
      </div>`;
  } else {
    // ACTIVE challenge — clean meta only, no winner design
    heroHTML = `
      <div class="results-hero ${heroClass}" style="background:var(--bg);border-bottom:1px solid var(--bd);">
        <div style="text-align:left;">
          <div class="results-chal-name" style="color:var(--tx);">${esc(d.title || '')}</div>
          ${d.description ? `<div class="results-chal-desc" style="color:var(--mu);">${esc(d.description)}</div>` : ''}
          <div class="results-meta" style="justify-content:flex-start;">
            <div class="results-meta-chip" style="color:var(--mu);"><i class="fa-regular fa-clock" style="color:var(--or);"></i>${d.expiresAt ? timeLeft(d.expiresAt.toDate()) : 'No deadline'}</div>
            <div class="results-meta-chip" style="color:var(--mu);"><i class="fa-regular fa-thumbs-up" style="color:var(--or);"></i>${fmtN(d.totalVotes || 0)} votes</div>
            <div class="results-meta-chip" style="color:var(--mu);"><i class="fa-solid fa-users" style="color:var(--or);"></i>${fmtN(d.entryCount || 0)} entries</div>
          </div>
          <div class="results-active-note">
            <i class="fa-solid fa-shield-halved"></i>
            <p>Challenge still running. Rankings update live as votes come in.</p>
          </div>
        </div>
      </div>`;
  }

  // Build table for all entries
  const medals = ['🥇', '🥈', '🥉'];
  const rankClasses = ['top1', 'top2', 'top3'];
  let tableRows = '';
  entries.forEach((e, i) => {
    const rankLabel = i < 3 ? medals[i] : (i + 1).toString();
    const rankClass = i < 3 ? rankClasses[i] : '';
    const rankColor = i === 0 ? 'rk-1' : i === 1 ? 'rk-2' : i === 2 ? 'rk-3' : 'rk-n';
    const avHTML = e.authorPhoto
      ? `<div class="rt-av"><img src="${e.authorPhoto}"/></div>`
      : `<div class="rt-av">${(e.authorName || '?').charAt(0).toUpperCase()}</div>`;
    tableRows += `
      <div class="rt-row ${rankClass}" onclick="viewProfile('${e.authorId}')">
        <div class="rt-rank ${rankColor}">${rankLabel}</div>
        ${avHTML}
        <div class="rt-info">
          <div class="rt-name">${esc(e.authorName || '')}</div>
          <div class="rt-un">${esc(e.authorUsername || '')}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div class="rt-votes">${fmtN(e.votes || 0)}</div>
          <div class="rt-votes-lbl">VOTES</div>
        </div>
      </div>`;
  });

  const tableSection = entries.length > 0 ? `
    <div class="results-table">
      <div class="results-table-hdr">${isEnded ? 'FINAL RANKINGS' : 'CURRENT STANDINGS'} · ${entries.length} ENTRIES</div>
      ${tableRows}
    </div>` : `<div class="loading" style="padding:40px;color:var(--mu);"><p>No entries yet.</p></div>`;

  body.innerHTML = heroHTML + tableSection;
  document.getElementById('results-title').textContent = isEnded ? 'Challenge Results' : 'Live Standings';
}

// Notification type → push title + icon map
const NOTIF_META = {
  win:        { icon:'🏆', title:'You won!'              },
  challenge:  { icon:'📸', title:'New challenge!'        },
  entry:      { icon:'⚔️',  title:'New challenger!'      },
  vote:       { icon:'👍', title:'Someone liked you!'   },
  comment:    { icon:'💬', title:'New comment!'          },
  comment_like:{ icon:'❤️', title:'Comment liked!'       },
  support:    { icon:'💪', title:'New supporter!'        },
  leaderboard:{ icon:'📈', title:'Rank update!'          },
  mention:    { icon:'@',  title:'You were mentioned!'   },
};

// Single function: writes in-app Firestore notification
// AND fires background push via Netlify proxy
async function addNotif(toUid, type, message, refCollection, refId, skipPush=false){
  if(!toUid||toUid===CU.uid)return;
  // Write in-app notification to Firestore
  await db.collection('notifications').add({
    toUid, type, message, refCollection, refId:refId||'',
    read:false, createdAt:ts()
  });
  // Fire background push (won't spam — addNotif is called for meaningful events)
  if(!skipPush){
    const meta=NOTIF_META[type]||{ icon:'🔔', title:'MiStream' };
    const pushTitle=`${meta.icon} ${meta.title}`;
    pushToUser(toUid, pushTitle, message);
  }
}
// requestNotifPermission removed — OneSignal's askPushPermission
// handles all browser push permission prompts. Having both caused
// double prompts and competing service worker registrations.

// ═══════════════════════════════════
// WINNER ANNOUNCEMENT
// ═══════════════════════════════════
async function checkAndAnnounceWinners(){
  // Called periodically — check ended challenges that haven't been announced
  // Query only by status, filter expiry client-side
  const snap=await db.collection('challenges')
    .where('status','==','active')
    .limit(20).get();
  // Note: 'pending' challenges are not checked — they have no expiresAt yet
  snap.forEach(async doc=>{
    const d=doc.data();
    // Skip if not actually expired yet
    if(!d.expiresAt || d.expiresAt.toDate() > new Date()) return;
    // Get top 3 entries — sort client-side, no index needed
    const entries=await db.collection('entries').where('chalId','==',doc.id).limit(20).get();
    const top3=entries.docs.map(e=>({id:e.id,...e.data()})).sort((a,b)=>(b.votes||0)-(a.votes||0)).slice(0,3);
    const winner=top3[0];
    if(!winner)return;
    // Update challenge as ended with winner
    await db.collection('challenges').doc(doc.id).update({
      status:'ended', winnerId:winner.authorId,
      winnerUsername:winner.authorUsername, winnerName:winner.authorName,
      top3:top3.map(e=>({id:e.id,authorId:e.authorId,authorUsername:e.authorUsername,votes:e.votes||0}))
    });
    // Update winner stats
    await db.collection('users').doc(winner.authorId).update({
      challengeWins:firebase.firestore.FieldValue.increment(1)
    }).catch(()=>{});
    // Notify all participants — in-app + background push
    const participants=await db.collection('entries').where('chalId','==',doc.id).get();
    const notified=new Set();
    participants.forEach(async e=>{
      const uid=e.data().authorId;
      if(notified.has(uid))return;
      notified.add(uid);
      const isWinner=uid===winner.authorId;
      const msg=isWinner
        ?`🏆 You won the challenge "${d.title}"! Congratulations.`
        :`Challenge "${d.title}" ended. Winner: ${winner.authorUsername}. Check the results!`;
      // In-app notification (Firestore)
      addNotif(uid,'win',msg,'challenges',doc.id);
      // Background push — fires even when browser is closed
      const pushTitle=isWinner?'🏆 You won!':'Challenge ended';
      pushToUser(uid, pushTitle, msg);
    });
    // Also record win event with timestamp for aged scoring
    await recordWinEvent(winner.authorId).catch(()=>{});
  });
}
// Run winner check on load and every 5 minutes
checkAndAnnounceWinners().catch(()=>{});
setInterval(()=>checkAndAnnounceWinners().catch(()=>{}), 5*60*1000);

// ═══════════════════════════════════
// UTILS
// ═══════════════════════════════════
function ts(){return firebase.firestore.FieldValue.serverTimestamp();}
function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function fmtN(n){n=parseInt(n)||0;if(n>=1000000)return(n/1000000).toFixed(1)+'M';if(n>=1000)return(n/1000).toFixed(1)+'K';return String(n);}
function timeAgo(d){const s=Math.floor((Date.now()-d)/1000);if(s<60)return'just now';if(s<3600)return Math.floor(s/60)+'m';if(s<86400)return Math.floor(s/3600)+'h';if(s<604800)return Math.floor(s/86400)+'d';return d.toLocaleDateString();}
function timeLeft(d){if(!d)return'';const s=Math.max(0,Math.floor((d-Date.now())/1000));if(s<60)return s+'s left';if(s<3600)return Math.floor(s/60)+'m left';if(s<86400)return Math.floor(s/3600)+'h left';return Math.floor(s/86400)+'d left';}
function showToast(msg){const old=document.getElementById('toast');if(old)old.remove();const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),3200);}
window.addEventListener('popstate', (e) => {
  const target = e.state?.screen || prevScr || 'arena';
  // Directly activate the screen without pushing more history
  prevScr = curScr;
  curScr = target;
  document.querySelectorAll('.scr').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.bn').forEach(b => b.classList.remove('active'));
  const scr = document.getElementById(`scr-${target}`);
  if (scr) scr.classList.add('active');
  const bn = document.getElementById(`bn-${target}`);
  if (bn) bn.classList.add('active');
  // Run screen init if needed
  if (target === 'arena') initArena();
  if (target === 'profile') initProfile(CU?.uid, true);
  if (target === 'notifications') initNotifs();
  if (target === 'leaderboard') initLeaderboard();
});

function setBtnLoad(btn, loading, reset) {
  if (!btn) return;
  if (loading) {
    btn.innerHTML = '<div class="spin" style="width:16px;height:16px;border-color:rgba(255,255,255,.3);border-top-color:#fff;margin:0 auto;"></div>';
    btn.disabled = true;
  } else {
    if (reset) btn.innerHTML = reset;
    btn.disabled = false;
  }
}

function openFeedback() {
  document.getElementById('feedback-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  document.getElementById('feedback-text').value = '';
  document.getElementById('feedback-send').disabled = true;
  document.getElementById('feedback-err')?.classList.add('hidden');
  // Character counter
  document.getElementById('feedback-text').oninput = function() {
    document.getElementById('feedback-char').textContent = this.value.length + '/500';
    document.getElementById('feedback-send').disabled = !this.value.trim();
  };
}

function closeFeedback() {
  document.getElementById('feedback-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

async function submitFeedback() {
  const text = document.getElementById('feedback-text').value.trim();
  if (!text) return;
  const btn = document.getElementById('feedback-send');
  btn.innerHTML = '<div class="spin" style="width:16px;height:16px;border-color:rgba(255,255,255,.3);border-top-color:#fff;margin:0 auto;"></div>';
  btn.disabled = true;
  try {
    await db.collection('feedback').add({
      text,
      username: CUD?.username || null,
      uid: CU?.uid || null,
      createdAt: ts()
    });
    closeFeedback();
    showToast('🙏 Thank you! We read every single one.');
  } catch(e) {
    document.getElementById('feedback-err').textContent = 'Failed to send. Check your connection.';
    document.getElementById('feedback-err').classList.remove('hidden');
    btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> <span>Send Feedback</span>';
    btn.disabled = false;
  }
}
// ═══════════════════════════════════
// LEADERBOARD (real-time top 100)
// ═══════════════════════════════════

// ═══════════════════════════════════════════════════
// LEADERBOARD — scoring, badges, real-time top 100
// ═══════════════════════════════════════════════════

// ── Timed win score ──────────────────────────────
// Each win event ages: <7d=×5, 7–14d=×3, 14–30d=×2, >30d=×1
// winEvents stored as array of Firestore Timestamps on user doc
// Falls back gracefully if winEvents not present (uses raw win count ×1)
function calcWinScore(u){
  const now=Date.now();
  const events=u.winEvents||[];
  if(events.length===0){
    // Legacy: no winEvents stored yet — count raw wins at ×1
    return (u.challengeWins||0)*1;
  }
  let score=0;
  events.forEach(ev=>{
    const ts=ev&&ev.toDate?ev.toDate().getTime():(typeof ev==='number'?ev:0);
    const ageDays=(now-ts)/(1000*60*60*24);
    if(ageDays<7)        score+=5;
    else if(ageDays<14)  score+=3;
    else if(ageDays<30)  score+=2;
    else                 score+=1;
  });
  return score;
}

// ── Main leaderboard score ────────────────────────
// Win score (aged) + entries submitted + votes received
function calcScore(u){
  const winScore  = calcWinScore(u) * 10;
  const entryScore= (u.challengesJoined||0) * 8;   // every submission counts
  const voteScore = (u.totalVotesReceived||0) * 1;  // quality signal
  return winScore + entryScore + voteScore;
}

// ── Badge definitions ─────────────────────────────
// Each badge has: id, label, icon, cls, condition fn
// Badges are computed per-user at render time — no separate Firestore writes needed
const BADGE_DEFS = [
  {
    id:'master',
    label:'Master',
    icon:'👑',
    cls:'badge-master-crown',
    tip:'#1 ranked player',
    // Assigned by initLeaderboard after sorting — not a condition fn
  },
  {
    id:'demon_slayer',
    label:'Demon Slayer',
    icon:'🔥',
    cls:'badge-demon',
    tip:'Beat a player ranked 10+ positions above them',
    cond:(u)=> (u.demonSlays||0)>=1,
  },
  {
    id:'unbeaten',
    label:'Unbeaten',
    icon:'🛡️',
    cls:'badge-unbeaten',
    tip:'5+ wins, zero losses',
    cond:(u)=> (u.challengeWins||0)>=5 && (u.challengeLosses||0)===0,
  },
  {
    id:'hot_streak',
    label:'Hot Streak',
    icon:'⚡',
    cls:'badge-streak',
    tip:'3 wins in a row',
    cond:(u)=> (u.currentStreak||0)>=3,
  },
  {
    id:'crowd_fav',
    label:'Crowd Fav',
    icon:'💜',
    cls:'badge-crowd',
    tip:'Most votes received in last 30 days',
    // Assigned by initLeaderboard — not a condition fn
  },
  {
    id:'veteran',
    label:'Veteran',
    icon:'⚔️',
    cls:'badge-veteran',
    tip:'20+ challenge entries submitted',
    cond:(u)=> (u.challengesJoined||0)>=20,
  },
  {
    id:'relentless',
    label:'Relentless',
    icon:'🔄',
    cls:'badge-relentless',
    tip:'Entered 3+ challenges in one week',
    cond:(u)=> (u.weeklyEntries||0)>=3,
  },
  {
    id:'challenger',
    label:'Challenger',
    icon:'🎯',
    cls:'badge-challenger',
    tip:'Submitted first challenge entry',
    cond:(u)=> (u.challengesJoined||0)>=1,
  },
];

function getUserBadges(u, rank, isCrowdFav){
  const earned=[];
  // Special positional badges
  if(rank===1) earned.push(BADGE_DEFS.find(b=>b.id==='master'));
  if(isCrowdFav) earned.push(BADGE_DEFS.find(b=>b.id==='crowd_fav'));
  // Condition-based badges
  BADGE_DEFS.forEach(b=>{
    if(!b.cond)return; // positional — handled above
    if(b.cond(u)) earned.push(b);
  });
  // Deduplicate
  const seen=new Set();
  return earned.filter(b=>{ if(seen.has(b.id))return false; seen.add(b.id); return true; });
}

function renderBadges(badges){
  if(!badges.length)return'';
  return '<div class="lb-badges">'+badges.map(b=>
    `<span class="lb-badge ${b.cls}" title="${b.tip||''}">${b.icon} ${b.label}</span>`
  ).join('')+'</div>';
}

// ── Record a win event on user doc ────────────────
// Call this whenever a challenge winner is determined
async function recordWinEvent(uid){
  try{
    await db.collection('users').doc(uid).update({
      challengeWins: firebase.firestore.FieldValue.increment(1),
      winEvents: firebase.firestore.FieldValue.arrayUnion(ts()),
      currentStreak: firebase.firestore.FieldValue.increment(1),
    });
  }catch(e){ console.warn('recordWinEvent failed',e); }
}

// Reset streak on loss
async function recordLossEvent(uid){
  try{
    await db.collection('users').doc(uid).update({
      challengeLosses: firebase.firestore.FieldValue.increment(1),
      currentStreak: 0,
    });
  }catch(e){ console.warn('recordLossEvent failed',e); }
}

// ── Detect demon slayer ───────────────────────────
// Call after a 1v1 result — pass winner uid, loser uid, and sorted users array
async function checkDemonSlay(winnerUid, loserUid, sortedUsers){
  try{
    const wIdx=sortedUsers.findIndex(u=>u.uid===winnerUid);
    const lIdx=sortedUsers.findIndex(u=>u.uid===loserUid);
    if(wIdx===-1||lIdx===-1)return;
    // Winner ranked lower (higher number) beat someone ranked 10+ spots above
    if(lIdx-wIdx<=-10){
      await db.collection('users').doc(winnerUid).update({
        demonSlays: firebase.firestore.FieldValue.increment(1),
      });
    }
  }catch(e){ console.warn('checkDemonSlay failed',e); }
}

// ── Init leaderboard ──────────────────────────────
function initLeaderboard(){
  const body=document.getElementById('leaderboard-body');
  if(!body)return;
  body.innerHTML=`<div class="lb-loading"><div class="spin"></div><span>Loading rankings...</span></div>`;
  if(lbUnsub){ lbUnsub(); lbUnsub=null; }

  // Fetch top 100 by challengeWins — then re-sort client-side by full score
  // (Firestore index: challengeWins desc)
  lbUnsub=db.collection('users')
    .orderBy('challengeWins','desc')
    .limit(100)
    .onSnapshot(snap=>{
      if(snap.empty){
        body.innerHTML=`
          <div class="lb-hero">
            <div class="lb-hero-title">RANKINGS</div>
            <div class="lb-hero-sub">@PICS NICHE · TOP 100</div>
          </div>
          <div class="lb-empty">
            <i class="fa-solid fa-ranking-star"></i>
            <h3>No rankings yet</h3>
            <p>Enter challenges, win votes, climb the board.</p>
          </div>`;
        return;
      }

      // Build array and sort by full composite score
      let users=[];
      snap.forEach(doc=>users.push({id:doc.id,...doc.data()}));
      users.sort((a,b)=>calcScore(b)-calcScore(a));

      // Determine crowd favourite — user with most totalVotesReceived in last 30 days
      // (approximate: use totalVotesReceived as proxy — exact 30-day needs subcollection)
      const crowdFavUid=users.reduce((best,u)=>
        (u.totalVotesReceived||0)>(best.totalVotesReceived||0)?u:best
      , users[0]).uid;

      // Hero HTML
      const heroHTML=`
        <div class="lb-hero">
          <div class="lb-hero-title">RANKINGS</div>
          <div class="lb-hero-sub">@PICS NICHE · TOP 100</div>
          <div class="lb-live-chip">
            <div class="lb-live-dot"></div>
            <span class="lb-live-txt">LIVE · UPDATES IN REAL TIME</span>
          </div>
        </div>`;

      // Podium for top 3
      const podiumHTML=buildLBPodium(users.slice(0,3), crowdFavUid);

      // My position banner if I'm in the list
      const myIdx=users.findIndex(u=>u.uid===CU.uid);
      const myRank=myIdx+1;

      // Rows 4–100
      let rowsHTML='';
      users.forEach((u,i)=>{
        if(i<3)return;
        rowsHTML+=buildLBRow(u,i+1,u.uid===CU.uid,crowdFavUid);
      });

      // My sticky row shown above the list if I'm outside top 3
      let myRowHTML='';
      if(myRank>3){
        myRowHTML=`
          <div class="lb-my-pos-banner">
            <span class="lb-my-pos-label">YOUR POSITION</span>
            ${buildLBRow(users[myIdx],myRank,true,crowdFavUid)}
          </div>`;
      }

      body.innerHTML=heroHTML+podiumHTML+`
        <div class="lb-list">
          <div class="lb-section-hdr">FULL RANKINGS</div>
          ${myRowHTML}
          ${rowsHTML||'<div style="padding:24px;text-align:center;color:rgba(255,255,255,.25);font-size:13px;">More players coming soon</div>'}
        </div>`;

    // Check if current user's rank improved since last visit
    if(myRank>0){
      const lastRank=parseInt(localStorage.getItem(`ms_rank_${CU.uid}`)||'9999');
      if(myRank<lastRank&&lastRank!==9999){
        showToast(`📈 You moved up to #${myRank} on the leaderboard!`);
      }
      localStorage.setItem(`ms_rank_${CU.uid}`,myRank);
    }

    }, err=>{
      body.innerHTML=`<div class="lb-empty"><i class="fa-solid fa-triangle-exclamation"></i><h3>Error loading</h3><p>${err.message}</p></div>`;
    });
}

// ── Podium ────────────────────────────────────────
function buildLBPodium(top3, crowdFavUid){
  if(!top3.length)return'';

  function podSlot(u, rank){
    if(!u)return'<div class="podium-slot"></div>';
    const badges=getUserBadges(u,rank,u.uid===crowdFavUid);
    const avClass=rank===1?'gold':rank===2?'silver':'bronze';
    const sz=rank===1?72:54;
    const avHTML=u.photoURL
      ?`<div class="lb-av ${avClass}" style="width:${sz}px;height:${sz}px;"><img src="${u.photoURL}"/></div>`
      :`<div class="lb-av ${avClass}" style="width:${sz}px;height:${sz}px;font-size:${rank===1?28:20}px;">${(u.displayName||'?').charAt(0).toUpperCase()}</div>`;
    const medals=['','🥇','🥈','🥉'];
    const baseH=rank===1?64:rank===2?42:28;
    const score=calcScore(u);
    const topBadge=badges[0];
    return `
      <div class="podium-slot ${rank===1?'first':rank===2?'second':'third'}" onclick="viewProfile('${u.uid}')">
        <div class="podium-av-wrap">
          ${rank===1?'<div class="podium-crown">👑</div>':''}
          ${avHTML}
        </div>
        ${topBadge?`<div class="podium-badge-chip ${topBadge.cls}">${topBadge.icon} ${topBadge.label}</div>`:''}
        <div class="podium-name">${esc(u.displayName||'')}</div>
        <div class="podium-un">${esc(u.username||'')}</div>
        <div class="podium-score">${fmtN(score)} pts</div>
        <div class="podium-wins">${fmtN(u.challengeWins||0)}W · ${fmtN(u.challengesJoined||0)} entries</div>
        <div class="podium-base" style="height:${baseH}px;"></div>
      </div>`;
  }

  return `
    <div class="podium-wrap">
      <div class="podium">
        ${podSlot(top3[1]||null,2)}
        ${podSlot(top3[0],1)}
        ${podSlot(top3[2]||null,3)}
      </div>
    </div>`;
}

// ── Row ───────────────────────────────────────────
function buildLBRow(u, rank, isMe=false, crowdFavUid=''){
  const score=calcScore(u);
  const badges=getUserBadges(u,rank,u.uid===crowdFavUid);
  const rankClass=rank===1?'lbr-1':rank===2?'lbr-2':rank===3?'lbr-3':'lbr-n';
  const avHTML=u.photoURL
    ?`<div class="lb-av${rank===1?' gold':rank===2?' silver':rank===3?' bronze':''}" style="width:38px;height:38px;"><img src="${u.photoURL}"/></div>`
    :`<div class="lb-av${rank===1?' gold':rank===2?' silver':rank===3?' bronze':''}" style="width:38px;height:38px;font-size:14px;">${(u.displayName||'?').charAt(0).toUpperCase()}</div>`;

  return `
    <div class="lb-row${isMe?' lb-me':''}" onclick="viewProfile('${u.uid}')">
      <div class="lb-rank ${rankClass}">${rank}</div>
      ${avHTML}
      <div>
      <div class="lb-info">
        <div class="lb-name">${esc(u.displayName||'')}${isMe?' <span class="lb-you-tag">(You)</span>':''}</div>
        <div class="lb-username">${esc(u.username||'')}</div>
        ${badges.length?renderBadges(badges):''}
      </div>
       <div class="lb-stats-col">
        <div class="lb-stat-row">
          <span class="lb-stat-val">${fmtN(u.challengeWins||0)}</span>
          <span class="lb-stat-lbl">WINS</span>
        </div>
        <div class="lb-stat-row">
          <span class="lb-stat-val lb-stat-entries">${fmtN(u.challengesJoined||0)}</span>
          <span class="lb-stat-lbl">ENTRIES</span>
        </div>
        <div class="lb-stat-row">
          <span class="lb-stat-val lb-stat-votes">${fmtN(u.totalVotesReceived||0)}</span>
          <span class="lb-stat-lbl">VOTES</span>
        </div>
      </div>
      </div>
     
    </div>`;
}
