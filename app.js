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

const CLD_CLOUD  = 'dvdshonhc';
const CLD_PRESET = 'mistream_uploads';

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
let CU=null, CUD=null;
let curScr='arena', prevScr=null;
let arenaUnsub=null, notifUnsub=null, comUnsub=null;
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
        if(snap && snap.exists){ CU=user; CUD=snap.data(); initApp(); }
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
  setTopAv();
  setMyId();
  trackSession();
  listenNotifs();
  requestNotifPermission();
  showScr('arena');
}

function setTopAv(){
  const av=document.getElementById('top-av');
  if(!av)return;
  if(CUD.photoURL) av.innerHTML=`<img src="${CUD.photoURL}"/>`;
  else av.textContent=(CUD.displayName||'?').charAt(0).toUpperCase();
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
  document.getElementById('upn').textContent=name?`${name}@comedy`:'name@comedy';
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
    const username=name.toLowerCase().replace(/\s+/g,'')+'@comedy';
    const cred=await auth.createUserWithEmailAndPassword(email,pass);
    let photoURL=null;
    if(regPhoto){
      showToast('Uploading photo...');
      const res=await uploadCLD(regPhoto,`avatars/${cred.user.uid}`);
      photoURL=res.url;
    }
    await db.collection('users').doc(cred.user.uid).set({
      uid:cred.user.uid, displayName:name, username, niche:'comedy',
      email, photoURL, bio:'', challengeWins:0, challengeLosses:0,
      challengesCreated:0, challengesJoined:0, totalVotesReceived:0,
      profileViews:0, followers:0, following:0, sessionCount:0,
      createdAt:ts()
    });
    // Set CU and CUD directly — don't wait for onAuthStateChanged
    CU = cred.user;
    CUD = {
      uid:cred.user.uid, displayName:name, username, niche:'comedy',
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
        feed.innerHTML=`<div class="arena-card"><div class="empty"><i class="fa-solid fa-trophy"></i><h3>No challenges yet</h3><p>Be the first to create one and start the arena.</p><button class="btn-or" onclick="showScr('create')"><i class="fa-solid fa-plus"></i> Create Challenge</button></div></div>`;
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
  const obs=new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(!e.isIntersecting){
        // Card left view — pause all videos
        e.target.querySelectorAll('video').forEach(v=>{v.pause();});
      } else {
        // Card came back into view — resume the video that was playing
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
  const isExpired=d.expiresAt&&d.expiresAt.toDate()<new Date();
  const isEnded=d.status==='ended'||isExpired;
  const tot=(d.entryCount||0);
  const votes=(d.totalVotes||0);

  // CREATOR avatar html
  const crAvHTML=d.creatorPhoto
    ?`<div class="ac-cr-av"><img src="${d.creatorPhoto}"/></div>`
    :`<div class="ac-cr-av">${(d.creatorName||'?').charAt(0).toUpperCase()}</div>`;

  const badgeHTML=isEnded
    ?`<div class="ac-ended-badge"><span class="ac-ended-txt">ENDED</span></div>`
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
        <div class="ac-meta-chip timer"><i class="fa-regular fa-clock"></i>${isEnded?'Ended':timeLeft(d.expiresAt?.toDate())}</div>
        <div class="ac-meta-chip"><i class="fa-solid fa-users"></i>${fmtN(tot)} entries</div>
        <div class="ac-meta-chip"><i class="fa-regular fa-thumbs-up"></i>${fmtN(votes)} votes</div>
         <div class="vba-btn" onclick="openComments('challenges','${chalId}')">
            <i class="fa-regular fa-comment-dots"></i>
            <span id="com-cnt-${chalId}">${fmtN(d.commentCount||0)}</span>
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
    // Odd entry slot — show join prompt
    div.innerHTML=`<div class="bs-empty"><i class="fa-solid fa-shield-halved" style="color:var(--or);"></i><p style="color:rgba(255,255,255,.4);">Your entry could be here</p><button class="btn-or" style="padding:8px 16px;font-size:11px;margin-top:6px;" onclick="openJoin('${chalId}','','')">Submit Entry</button></div>`;
    return div;
  }
  const isVideo=entry.mediaType==='video';
  const thumb=entry.thumbURL||entry.mediaURL;
  const sideId=`${chalId}-${side}-${pairIdx}`;
  const avHTML=entry.authorPhoto
    ?`<div class="bs-av"><img src="${entry.authorPhoto}"/></div>`
    :`<div class="bs-av">${(entry.authorName||'?').charAt(0).toUpperCase()}</div>`;

  let mediaHTML='';
  if(entry.mediaURL){
    if(isVideo){
mediaHTML = `
        ${thumb?`<img class="bs-thumb" id="thumb-${sideId}" src="${thumb}"/>`:''}
        <video class="bs-video" id="vid-${sideId}" src="${entry.mediaURL}"
          playsinline muted preload="auto"
          style="display:none;"
          "
          onended="onVidEnded('${chalId}','${side}',${pairIdx})">
        </video>
        <div class="bs-play-btn" id="play-${sideId}"><i class="fa-solid fa-play"></i></div>
        <div class="bs-mute" onclick="toggleArenaMute(event,'${sideId}')"><i class="fa-solid ${isMuted?'fa-volume-xmark':'fa-volume-high'}"></i></div>`;
    } else {
      mediaHTML=`<img class="bs-img" src="${entry.mediaURL}"/>`;
    }
  } else {
    mediaHTML=`<div class="bs-empty"><i class="fa-solid fa-film"></i></div>`;
  }

  div.innerHTML=`
    ${mediaHTML}
    <div class="bs-grad"></div>
    <div class="bs-info">
      <div class="bs-author" onclick="viewProfile('${entry.authorId}')">
        ${avHTML}
        <div class="bs-name">${esc(entry.authorUsername||entry.authorName||'')}</div>
      </div>
      ${entry.caption?`<div class="bs-caption">${esc(entry.caption)}</div>`:''}
      <div class="bs-actions">
        <div class="bs-act" id="like-act-${sideId}" onclick="likeEntry('${entry.id}','${entry.authorId}','${sideId}',this)">
          <i class="fa-regular fa-heart" id="like-ico-${sideId}"></i>
          <span id="like-cnt-${sideId}">${fmtN(entry.likes||0)}</span>
        </div>
        <div class="bs-act" onclick="openComments('entries','${entry.id}')">
          <i class="fa-regular fa-comment-dots"></i>
          <span>${fmtN(entry.commentCount||0)}</span>
        </div>
      </div>
    </div>`;

  // If video: tap the side (not just the video element) to play
  div.addEventListener('click',e=>{
    if(e.target.closest('.bs-mute,.bs-actions,.bs-author'))return;
    if(isVideo) playVid(sideId, side, chalId, pairIdx);
  });

  // Check liked
  db.collection('entryLikes').doc(`${CU.uid}_${entry.id}`).get().then(s=>{
    if(s.exists){
      const ico=document.getElementById(`like-ico-${sideId}`);
      if(ico){ico.className='fa-solid fa-heart';ico.style.color='var(--re)';}
      document.getElementById(`like-act-${sideId}`)?.classList.add('liked');
    }
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
  const sideId = `${chalId}-a-${pairIdx}`;
  const vid = document.getElementById(`vid-${sideId}`);
  const thumb = document.getElementById(`thumb-${sideId}`);
  const playBtn = document.getElementById(`play-${sideId}`);
  if (!vid) return;
  setTimeout(() => {
    // Show video, hide thumbnail
    if (thumb) thumb.style.display = 'none';
    vid.style.display = 'block';
    vid.muted = isMuted;
    // Use play() directly — don't go through playVid to avoid the paused check
    vid.play().catch(() => {});
    if (playBtn) playBtn.classList.add('gone');
    // Show actions on left side
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
  // Check voted on new pair
  if(pairs[idx]) checkPairVoted(chalId,pairs[idx],idx);
  // Update vote button labels
  const pa=pairs[idx];
  const btnA=document.getElementById(`va-${chalId}`);
  const btnB=document.getElementById(`vb2-${chalId}`);
  if(pa&&btnA&&btnB){
    const nameA=pa[0]?esc(pa[0].authorName||'Left'):'Left';
    const nameB=pa[1]?esc(pa[1].authorName||'Right'):'Right';
    btnA.textContent=pa[0]?`Vote ${nameA}`:'Vote Left';
    btnB.textContent=pa[1]?`Vote ${nameB}`:'Vote Right';
    btnA.disabled=!pa[0]; btnB.disabled=!pa[1];
  }
}

async function checkPairVoted(chalId,pair,pairIdx){
  if(!pair||!pair[0]) return;
  const voteRef=db.collection('challengeVotes').doc(`${CU.uid}_${chalId}_${pairIdx}`);
  const snap=await voteRef.get();
  const btnA=document.getElementById(`va-${chalId}`);
  const btnB=document.getElementById(`vb2-${chalId}`);
  if(!snap.exists) return;
  const {votedEntryId,entryAId,entryBId} = snap.data();
  // Determine which button to mark based on which entry is currently on which side
  // pair[0] is current left entry, pair[1] is current right entry
  const votedSide = pair[0]?.id===votedEntryId ? 'a' : 'b';
  if(btnA){
    btnA.disabled=true;
    if(votedSide==='a'){btnA.className='vbtn voted';btnA.textContent='✓ Your Vote';}
  }
  if(btnB){
    btnB.disabled=true;
    if(votedSide==='b'){btnB.className='vbtn voted';btnB.textContent='✓ Your Vote';}
  }
  if(pair[0]&&pair[1]) loadPairProgress(chalId,pair[0].id,pair[1].id);
}

async function castVote(chalId,side,btn){
  // Find current visible pair index
  const swiper=document.getElementById(`bs-${chalId}`);
  if(!swiper)return;
  const pairIdx=Math.round(swiper.scrollLeft/swiper.offsetWidth);
  const voteRef=db.collection('challengeVotes').doc(`${CU.uid}_${chalId}_${pairIdx}`);
  const existing=await voteRef.get();
  if(existing.exists){showToast('Already voted on this pair!');return;}
  // Find the two entries in this pair
  const pairs=swiper.querySelectorAll('.battle-pair');
  const pair=pairs[pairIdx];
  if(!pair)return;
  const sides=pair.querySelectorAll('.battle-side');
  // Get entry IDs from the like button IDs
  /*const getEntryId=(sideEl)=>{
    const likeBtn=sideEl.querySelector('[id^="like-act-"]');
    if(!likeBtn)return null;
    const sideId=likeBtn.id.replace('like-act-','');
    // sideId format: chalId-side-pairIdx
    return null; // We'll use data attribute instead
  };*/
  // Store entry IDs in pair div as data attributes when building
  const entryAId=pair.dataset.entryA;
  const entryBId=pair.dataset.entryB;
const votedEntryId = side === 'a' ? entryAId : entryBId;
await voteRef.set({ chalId, pairIdx, side, entryAId, entryBId, votedEntryId, userId: CU.uid, createdAt: ts() });
await db.collection('challenges').doc(chalId).update({totalVotes:firebase.firestore.FieldValue.increment(1)});
  // Increment voted entry's vote count
  if(side==='a'&&entryAId) await db.collection('entries').doc(entryAId).update({votes:firebase.firestore.FieldValue.increment(1)});
  if(side==='b'&&entryBId) await db.collection('entries').doc(entryBId).update({votes:firebase.firestore.FieldValue.increment(1)});
  btn.className='vbtn voted'; btn.textContent='✓ Voted!'; btn.disabled=true;
  document.getElementById(side==='a'?`vb2-${chalId}`:`va-${chalId}`)?.setAttribute('disabled','true');
  showToast('✓ Vote counted!');
  if(entryAId&&entryBId) loadPairProgress(chalId,entryAId,entryBId);
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
  ['chal-title','chal-desc','entry-cap'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  clearMPrev('entry-media-prev','entry-drop');
  createMediaFile=null;
  document.getElementById('create-err')?.classList.add('hidden');
}
function useChip(el){
  const input=document.getElementById('chal-title');
  if(input) input.value=el.textContent+' ';
  input?.focus();
}
function prevEntryMedia(input){
  const f=input.files[0]; if(!f)return;
  createMediaFile=f;
  showMPrev(f,'entry-media-prev','entry-drop');
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
async function submitChallenge(){
  const title=document.getElementById('chal-title').value.trim();
  const desc=document.getElementById('chal-desc').value.trim();
  const cap=document.getElementById('entry-cap').value.trim();
  const expiry=parseInt(document.getElementById('chal-expiry').value);
  const err=document.getElementById('create-err'); err.classList.add('hidden');
  if(!title){showErr(err,'Give your challenge a title.');return;}
  if(!createMediaFile&&!cap){showErr(err,'Add your entry video/photo or at least a caption.');return;}
  const btn=document.querySelector('#scr-create .btn-or'); setBtnLoad(btn,true);
  try{
    let mediaURL=null,mediaType=null,thumbURL=null;
    if(createMediaFile){
      showToast('Uploading entry...');
      const res=await uploadWithThumb(createMediaFile,`entries/${CU.uid}`);
      mediaURL=res.url; mediaType=res.type; thumbURL=res.thumbURL;
    }
    const expiresAt=new Date(Date.now()+expiry*24*60*60*1000);
    // Create challenge doc
    const chalRef=await db.collection('challenges').add({
      title, description:desc, niche:'comedy',
      creatorId:CU.uid, creatorUsername:CUD.username||'',
      creatorName:CUD.displayName||'', creatorPhoto:CUD.photoURL||null,
      entryCount:1, totalVotes:0, commentCount:0,
      status:'active', expiresAt, createdAt:ts()
    });
    // Create first entry
    const entRef=await db.collection('entries').add({
      chalId:chalRef.id, authorId:CU.uid,
      authorName:CUD.displayName||'', authorUsername:CUD.username||'',
      authorPhoto:CUD.photoURL||null,
      caption:cap, mediaURL, mediaType, thumbURL,
      votes:0, likes:0, commentCount:0,
      isCreatorEntry:true, createdAt:ts()
    });
    // Update user stats
    await db.collection('users').doc(CU.uid).update({
      challengesCreated:firebase.firestore.FieldValue.increment(1),
      challengesJoined:firebase.firestore.FieldValue.increment(1)
    });
    CUD.challengesCreated=(CUD.challengesCreated||0)+1;
    CUD.challengesJoined=(CUD.challengesJoined||0)+1;
    resetCreateForm();
    showToast('🏆 Challenge launched!');
    showScr('arena');
  }catch(e){showErr(err,e.message);}
  setBtnLoad(btn,false,'<i class="fa-solid fa-flag"></i> <span>Launch Challenge</span>');
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
    await db.collection('challenges').doc(joinTarget.chalId).update({
      entryCount:firebase.firestore.FieldValue.increment(1)
    });
    await db.collection('users').doc(CU.uid).update({
      challengesJoined:firebase.firestore.FieldValue.increment(1)
    });
    CUD.challengesJoined=(CUD.challengesJoined||0)+1;
    // Notify challenge creator
    addNotif(joinTarget.chalCreatorId||'','join',`${CUD.username} submitted an entry to your challenge "${joinTarget.chalTitle}"!`,'challenges',joinTarget.chalId);
    closeJoin();
    showToast('🎭 Entry submitted!');
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
        <span class="prof-user">${esc((u.username||'').split('@')[0])}<span>@comedy</span></span>
        <div class="lvl-badge"><i class="fa-solid fa-arrow-up"></i>${lv}</div>
      </div>
      <div class="prof-stats">
        <div class="ps"><div class="ps-v or">${fmtN(u.challengeWins||0)}</div><div class="ps-l">Wins</div></div>
        <div class="ps"><div class="ps-v">${fmtN(u.challengesCreated||0)}</div><div class="ps-l">Created</div></div>
        <div class="ps"><div class="ps-v go">${fmtN(u.challengesJoined||0)}</div><div class="ps-l">Entered</div></div>
      </div>
      ${isOwn
        ?`<div class="profile-actions"><div class="prof-acts"><button class="prof-edit-btn" onclick="showToast('Edit profile coming soon!')">Edit Profile</button></div>
           <div class="prof-acts" style="margin-top:-8px;"><button class="btn-ghost w" onclick="auth.signOut()"><i class="fa-solid fa-right-from-bracket"></i> Sign Out</button></div> </div>
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
  const snap=await ref.get();
  if(snap.exists){
    await ref.delete();
    await db.collection('users').doc(uid).update({followers:firebase.firestore.FieldValue.increment(-1)});
    await db.collection('users').doc(CU.uid).update({following:firebase.firestore.FieldValue.increment(-1)});
    if(btn){btn.textContent='Support';btn.classList.remove('flw');}
  } else {
    await ref.set({followerId:CU.uid,followingId:uid,createdAt:ts()});
    await db.collection('users').doc(uid).update({followers:firebase.firestore.FieldValue.increment(1)});
    await db.collection('users').doc(CU.uid).update({following:firebase.firestore.FieldValue.increment(1)});
    if(btn){btn.textContent='Supporting';btn.classList.add('flw');}
    addNotif(uid,'join',`${CUD.username} Supported you.`,'','');
  }
}

// ═══════════════════════════════════
// COMMENTS
// ═══════════════════════════════════
function openComments(collection,docId){
  comTarget={collection,docId};
  document.getElementById('cs-overlay').classList.remove('hidden');
  document.body.style.overflow='hidden';
  const av=document.getElementById('cs-av');
  if(av) av.innerHTML=CUD.photoURL?`<img src="${CUD.photoURL}"/>`:(CUD.displayName||'?').charAt(0).toUpperCase();
  document.getElementById('cs-text').value='';
  document.getElementById('cs-send').disabled=true;
  loadComments();
}
function closeComments(){
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
  const lid=`${CU.uid}_${commentId}`;
  const ref=db.collection('commentLikes').doc(lid);
  const snap=await ref.get();
  const comRef=db.collection(comTarget.collection).doc(comTarget.docId).collection('comments').doc(commentId);
  const cnt=btn.querySelector('span');
  if(snap.exists){
    await ref.delete(); await comRef.update({likes:firebase.firestore.FieldValue.increment(-1)});
    btn.classList.remove('liked'); if(cnt) cnt.textContent=Math.max(0,(parseInt(cnt.textContent)||0)-1);
  } else {
    await ref.set({commentId,userId:CU.uid,createdAt:ts()});
    await comRef.update({likes:firebase.firestore.FieldValue.increment(1)});
    btn.classList.add('liked'); if(cnt) cnt.textContent=(parseInt(cnt.textContent)||0)+1;
  }
}

// ═══════════════════════════════════
// NOTIFICATIONS
// ═══════════════════════════════════
function listenNotifs(){
  if(notifUnsub) notifUnsub();
  notifUnsub=db.collection('notifications').where('toUid','==',CU.uid).where('read','==',false)
    .onSnapshot(snap=>{
      document.getElementById('notif-dot').classList.toggle('hidden',snap.size===0);
    });
}
async function initNotifs(){
  const body=document.getElementById('notif-body');
  body.innerHTML='<div class="loading"><div class="spin dark"></div></div>';
  const snap=await db.collection('notifications').where('toUid','==',CU.uid).orderBy('createdAt','desc').limit(30).get();
  if(snap.empty){body.innerHTML='<div class="notif-empty"><i class="fa-regular fa-bell"></i><p>No notifications yet.<br/>Win a challenge to get recognized.</p></div>';return;}
  body.innerHTML='';
  const batch=db.batch();
  const iconMap={win:'fa-solid fa-trophy',join:'fa-solid fa-shield-halved',vote:'fa-solid fa-thumbs-up'};
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

async function addNotif(toUid,type,message,refCollection,refId){
  if(!toUid||toUid===CU.uid)return;
  await db.collection('notifications').add({toUid,type,message,refCollection,refId,read:false,createdAt:ts()});
}
async function requestNotifPermission(){
  if(!('Notification' in window))return;
  if(Notification.permission==='default'){
    setTimeout(async()=>{
      const p=await Notification.requestPermission();
      if(p==='granted') showToast('🔔 Notifications on!');
    },5000);
  }
}

// ═══════════════════════════════════
// WINNER ANNOUNCEMENT
// ═══════════════════════════════════
async function checkAndAnnounceWinners(){
  // Called periodically — check ended challenges that haven't been announced
  // Query only by status, filter expiry client-side
  const snap=await db.collection('challenges')
    .where('status','==','active')
    .limit(20).get();
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
    // Notify all participants
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
      addNotif(uid,'win',msg,'challenges',doc.id);
    });
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