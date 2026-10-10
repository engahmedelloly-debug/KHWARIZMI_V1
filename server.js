const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { URL } = require('node:url');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'kharazmi-local-development-secret-only');
const DB_FILE = process.env.DB_FILE || path.join(ROOT, 'kharazmi.sqlite');
const CORS_ORIGIN = process.env.CORS_ORIGIN || `http://localhost:${PORT}`;
const TOKEN_DAYS = 7;
const STAGE_XP = 20;
const MAX_BODY = 100 * 1024;
const rateBuckets = new Map();

if (process.env.NODE_ENV === 'production' && Buffer.byteLength(JWT_SECRET) < 32) {
  throw new Error('Production requires a JWT_SECRET of at least 32 characters. Set it in the hosting environment.');
}

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'backend-seed.json'), 'utf8'));

const now = () => new Date().toISOString();
const normalizeEmail = v => String(v || '').trim().toLowerCase();
const parseJson = (v, fallback) => { try { return JSON.parse(v); } catch { return fallback; } };
// Article body blocks are stored as tuples (["h2","text"], ["ul",[...]], ["code","js","..."]) in the seed,
// but the frontend expects objects ({type,text|items,lang}). Normalize on read so old and new rows both work.
const normalizeBlock = b => {
  if (Array.isArray(b)) {
    const t = String(b[0] || '');
    if (t === 'ul' || t === 'ol') return { type: t, items: (Array.isArray(b[1]) ? b[1] : []).map(String) };
    if (t === 'code') return { type: 'code', lang: String(b[1] || ''), text: String(b[2] == null ? '' : b[2]) };
    return { type: t, text: String(b[1] == null ? '' : b[1]) };
  }
  if (b && typeof b === 'object') {
    const t = String(b.type || (b.items ? 'ul' : 'p'));
    return (t === 'ul' || t === 'ol') ? { type: t, items: (Array.isArray(b.items) ? b.items : []).map(String) } : { ...b, type: t, text: String(b.text == null ? '' : b.text) };
  }
  return b == null ? null : { type: 'p', text: String(b) };
};
const normalizeBody = v => {
  if (typeof v === 'string') { const t = v.trim(); if (!t) return []; try { return normalizeBody(JSON.parse(t)); } catch { return t.split(/\n{2,}/).map(x => ({ type: 'p', text: x.trim() })).filter(x => x.text); } }
  return Array.isArray(v) ? v.map(normalizeBlock).filter(Boolean) : [];
};
const b64 = v => Buffer.from(v).toString('base64url');
const unb64 = v => Buffer.from(v, 'base64url').toString('utf8');
const json = (res, status, body, extra={}) => { const data = body == null ? '' : JSON.stringify(body); res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra}); res.end(data); };
const apiError = (message, status=400) => Object.assign(new Error(message), {status});
function transaction(fn){db.exec('BEGIN');try{const out=fn();db.exec('COMMIT');return out;}catch(e){try{db.exec('ROLLBACK');}catch{}throw e;}}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      jti TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL, revoked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS paths (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, icon TEXT NOT NULL, level TEXT NOT NULL,
      description TEXT NOT NULL, topics_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT, path_id TEXT NOT NULL REFERENCES paths(id) ON DELETE CASCADE,
      position INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, duration TEXT NOT NULL, project TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_stages_path_position ON stages(path_id, position);
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, url TEXT NOT NULL UNIQUE,
      lang TEXT NOT NULL, type TEXT NOT NULL, description TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS stage_resources (
      stage_id INTEGER NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
      resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE, PRIMARY KEY(stage_id, resource_id)
    );
    CREATE TABLE IF NOT EXISTS path_resources (
      path_id TEXT NOT NULL REFERENCES paths(id) ON DELETE CASCADE,
      resource_id INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE, PRIMARY KEY(path_id, resource_id)
    );
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, reading_time TEXT NOT NULL,
      icon TEXT NOT NULL, description TEXT NOT NULL, body_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS article_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT, article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      title TEXT NOT NULL, url TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, difficulty TEXT NOT NULL,
      question_count INTEGER NOT NULL, xp INTEGER NOT NULL, icon TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      position INTEGER NOT NULL, text TEXT NOT NULL, options_json TEXT NOT NULL, correct_index INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_quiz_position ON quiz_questions(quiz_id, position);
    CREATE TABLE IF NOT EXISTS stage_progress (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, path_id TEXT NOT NULL REFERENCES paths(id) ON DELETE CASCADE,
      stage_id INTEGER NOT NULL REFERENCES stages(id) ON DELETE CASCADE, completed_at TEXT NOT NULL,
      PRIMARY KEY(user_id, stage_id)
    );
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE, score INTEGER NOT NULL, total INTEGER NOT NULL,
      xp INTEGER NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL, at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activity_user_at ON activity(user_id, at DESC);
  `);
}

function seedDatabase() {
  if (db.prepare('SELECT COUNT(*) n FROM paths').get().n) return;
  const tx = () => transaction(() => {
    const resourceIds = new Map();
    const ir = db.prepare('INSERT INTO resources(title,url,lang,type,description) VALUES(?,?,?,?,?)');
    for (const [key,r] of Object.entries(seed.res || {})) resourceIds.set(key, Number(ir.run(r[0],r[1],r[2],r[3],r[4]||'').lastInsertRowid));
    const ip = db.prepare('INSERT INTO paths(id,title,icon,level,description,topics_json) VALUES(?,?,?,?,?,?)');
    const is = db.prepare('INSERT INTO stages(path_id,position,title,description,duration,project) VALUES(?,?,?,?,?,?)');
    const isr = db.prepare('INSERT INTO stage_resources(stage_id,resource_id) VALUES(?,?)');
    const ipr = db.prepare('INSERT INTO path_resources(path_id,resource_id) VALUES(?,?)');
    for (const p of seed.paths) ip.run(p.id,p.title,p.icon,p.level,p.desc,JSON.stringify(p.topics));
    for (const p of seed.paths) {
      const rm=seed.roadmaps[p.id]||{stages:[],extra:[]};
      rm.stages.forEach((s,i)=>{const stageId=Number(is.run(p.id,i,s.t,s.d,s.w,s.p||null).lastInsertRowid);for(const k of s.r||[]){const rid=resourceIds.get(k);if(rid)isr.run(stageId,rid);}});
      const seen=new Set(); for(const k of [...(rm.extra||[]),...(seed.hubs||[])]){if(seen.has(k))continue;seen.add(k);const rid=resourceIds.get(k);if(rid)ipr.run(p.id,rid);}
    }
    const ia=db.prepare('INSERT INTO articles(id,title,category,reading_time,icon,description,body_json) VALUES(?,?,?,?,?,?,?)');
    const ias=db.prepare('INSERT INTO article_sources(article_id,title,url) VALUES(?,?,?)');
    for(const a of seed.articles){ia.run(a.id,a.title,a.cat,a.time,a.icon,a.desc,JSON.stringify((seed.bodies||{})[a.id]||[]));for(const s of (seed.articleSources||{})[a.id]||[])ias.run(a.id,s.title,s.url);}
    const iq=db.prepare('INSERT INTO quizzes(id,title,category,difficulty,question_count,xp,icon) VALUES(?,?,?,?,?,?,?)');
    const iqq=db.prepare('INSERT INTO quiz_questions(quiz_id,position,text,options_json,correct_index) VALUES(?,?,?,?,?)');
    for(const q of seed.quizzes){iq.run(q.id,q.title,q.cat,q.difficulty,q.questions,q.xp,q.icon);(seed.quizBank[q.id]||[]).forEach((r,i)=>iqq.run(q.id,i,r[0],JSON.stringify(r[1]),r[2]));}
  });
  tx();
}

migrate(); seedDatabase();

// Repair older databases that already had paths but were created before article seeding.
// The original seedDatabase() returns early when paths exist, which could leave articles empty.
function seedMissingArticles() {
  const insertArticle = db.prepare('INSERT OR IGNORE INTO articles(id,title,category,reading_time,icon,description,body_json) VALUES(?,?,?,?,?,?,?)');
  // Repair articles that already exist in an older database but have empty body_json.
  // Do not overwrite non-empty user/database content, and do not delete user accounts/progress.
  const repairBody = db.prepare("UPDATE articles SET title=?, category=?, reading_time=?, icon=?, description=?, body_json=? WHERE id=? AND (body_json IS NULL OR body_json='' OR body_json='[]')");
  const insertSource = db.prepare('INSERT INTO article_sources(article_id,title,url) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM article_sources WHERE article_id=? AND url=?)');
  transaction(() => {
    for (const a of (seed.articles || [])) {
      const body = JSON.stringify((seed.bodies || {})[a.id] || []);
      insertArticle.run(a.id, a.title, a.cat, a.time, a.icon, a.desc, body);
      repairBody.run(a.title, a.cat, a.time, a.icon, a.desc, body, a.id);
      for (const s of ((seed.articleSources || {})[a.id] || [])) {
        insertSource.run(a.id, s.title, s.url, a.id, s.url);
      }
    }
  });
}
seedMissingArticles();

function scryptHash(password) { const salt=crypto.randomBytes(16).toString('hex'); const hash=crypto.scryptSync(password,salt,64).toString('hex'); return `scrypt$${salt}$${hash}`; }
function scryptVerify(password, stored) { const [,salt,hex]=String(stored).split('$'); if(!salt||!hex)return false; const actual=crypto.scryptSync(password,salt,64); const expected=Buffer.from(hex,'hex'); return expected.length===actual.length && crypto.timingSafeEqual(actual,expected); }
function makeToken(userId) {
  const header=b64(JSON.stringify({alg:'HS256',typ:'JWT'})); const jti=crypto.randomUUID(); const exp=Math.floor(Date.now()/1000)+TOKEN_DAYS*86400;
  const payload=b64(JSON.stringify({sub:String(userId),jti,exp})); const sig=b64(crypto.createHmac('sha256',JWT_SECRET).update(`${header}.${payload}`).digest());
  db.prepare('INSERT INTO sessions(jti,user_id,expires_at) VALUES(?,?,?)').run(jti,userId,new Date(exp*1000).toISOString()); return `${header}.${payload}.${sig}`;
}
function verifyToken(token) {
  const parts=String(token||'').split('.'); if(parts.length!==3)throw apiError('الجلسة انتهت، سجّل دخول تاني.',401);
  const [h,p,s]=parts; const expected=b64(crypto.createHmac('sha256',JWT_SECRET).update(`${h}.${p}`).digest());
  const got=Buffer.from(s); const want=Buffer.from(expected);
  if(got.length!==want.length || !crypto.timingSafeEqual(got,want))throw apiError('الجلسة انتهت، سجّل دخول تاني.',401);
  let data; try { data=JSON.parse(unb64(p)); } catch { throw apiError('الجلسة انتهت، سجّل دخول تاني.',401); }
  if(!data.exp||data.exp<Math.floor(Date.now()/1000))throw apiError('الجلسة انتهت، سجّل دخول تاني.',401);
  const session=db.prepare('SELECT * FROM sessions WHERE jti=? AND user_id=?').get(data.jti,Number(data.sub)); if(!session||session.revoked_at)throw apiError('الجلسة انتهت، سجّل دخول تاني.',401);
  const user=db.prepare('SELECT * FROM users WHERE id=?').get(Number(data.sub)); if(!user)throw apiError('الحساب غير موجود.',401); return {user,data};
}
function bearer(req){const h=req.headers.authorization||'';return h.startsWith('Bearer ')?h.slice(7):'';}
function optionalUser(req){try{return bearer(req)?verifyToken(bearer(req)).user:null}catch{return null;}}
function requireUser(req){const t=bearer(req);if(!t)throw apiError('محتاج تسجّل دخول الأول.',401);return verifyToken(t).user;}
function addActivity(uid,text){db.prepare('INSERT INTO activity(user_id,text,at) VALUES(?,?,?)').run(uid,text,now());}
function addXp(uid,xp){db.prepare('UPDATE users SET xp=xp+?,updated_at=? WHERE id=?').run(xp,now(),uid);}
function progress(uid,pid){const total=db.prepare('SELECT COUNT(*) n FROM stages WHERE path_id=?').get(pid).n;if(!uid||!total)return 0;const done=db.prepare('SELECT COUNT(*) n FROM stage_progress WHERE user_id=? AND path_id=?').get(uid,pid).n;return Math.round(done*100/total);}
function pathCard(p,uid){return{id:p.id,title:p.title,icon:p.icon,level:p.level,desc:p.description,topics:parseJson(p.topics_json,[]),progress:progress(uid,p.id)};}
function resources(rows){return rows.map(r=>({title:r.title,url:r.url,lang:r.lang,type:r.type,desc:r.description}));}
function pathDetail(id,uid){const p=db.prepare('SELECT * FROM paths WHERE id=?').get(id);if(!p)throw apiError('المسار غير موجود',404);const rawStages=db.prepare('SELECT * FROM stages WHERE path_id=? ORDER BY position').all(id);const stages=rawStages.map((s,i)=>{const completed=!!(uid && db.prepare('SELECT 1 FROM stage_progress WHERE user_id=? AND stage_id=?').get(uid,s.id));const previousDone=i===0||!!(uid && db.prepare('SELECT 1 FROM stage_progress WHERE user_id=? AND stage_id=?').get(uid,rawStages[i-1].id));return{title:s.title,desc:s.description,duration:s.duration,project:s.project,resources:resources(db.prepare('SELECT r.* FROM resources r JOIN stage_resources sr ON sr.resource_id=r.id WHERE sr.stage_id=? ORDER BY r.id').all(s.id)),completed,available:previousDone};});const extra=resources(db.prepare('SELECT r.* FROM resources r JOIN path_resources pr ON pr.resource_id=r.id WHERE pr.path_id=? ORDER BY r.id').all(id));return{...pathCard(p,uid),roadmap:stages,resources:extra};}
function streak(uid){const days=db.prepare("SELECT DISTINCT substr(at,1,10) d FROM activity WHERE user_id=? ORDER BY d DESC LIMIT 60").all(uid).map(x=>x.d);if(!days.length)return 0;const set=new Set(days);let d=new Date(`${days[0]}T00:00:00Z`),n=0;while(set.has(d.toISOString().slice(0,10))){n++;d.setUTCDate(d.getUTCDate()-1);}return n;}
function body(req){return new Promise((resolve,reject)=>{let size=0,data='';req.on('data',c=>{size+=c.length;if(size>MAX_BODY){reject(apiError('البيانات كبيرة جدًا.',413));req.destroy();}else data+=c;});req.on('end',()=>{if(!data)return resolve({});try{resolve(JSON.parse(data));}catch{reject(apiError('JSON غير صحيح.',400));}});req.on('error',reject);});}
function rateLimit(req){
  const ip=req.socket.remoteAddress||'unknown', nowMs=Date.now(), windowMs=60*60*1000;
  let b=rateBuckets.get(ip); if(!b || nowMs>=b.resetAt) b={count:0,resetAt:nowMs+windowMs};
  b.count++; rateBuckets.set(ip,b);
  if(rateBuckets.size>5000){for(const [k,v] of rateBuckets)if(nowMs>=v.resetAt)rateBuckets.delete(k);}
  if(b.count>20)throw apiError('محاولات كتير، استنى شوية.',429);
}
function safeFile(urlPath){
  let clean; try { clean=decodeURIComponent(urlPath).split('?')[0]; } catch { return null; }
  const file=path.resolve(ROOT, '.' + (clean.startsWith('/') ? clean : '/' + clean));
  if(file!==ROOT && !file.startsWith(ROOT + path.sep))return null;
  return file;
}
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.json':'application/json; charset=utf-8'};

async function handle(req,res){
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`); const p=u.pathname; const method=req.method;
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Access-Control-Allow-Origin',CORS_ORIGIN==='*'?'*':CORS_ORIGIN);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  if(method==='OPTIONS'){res.writeHead(204);return res.end();}
  try{
    if(p==='/api/health'&&method==='GET')return json(res,200,{ok:true,service:'kharazmi-api',time:now()});
    if(p.startsWith('/api/auth/'))rateLimit(req);

    if(p==='/api/auth/register'&&method==='POST'){const b=await body(req),name=String(b.name||'').trim(),email=normalizeEmail(b.email),password=String(b.password||'');if(name.length<2||name.length>60)throw apiError('اكتب اسم صحيح.');if(!/^\S+@\S+\.\S+$/.test(email))throw apiError('البريد الإلكتروني غير صحيح.');if(password.length<6||password.length>128)throw apiError('كلمة المرور لازم تكون 6 حروف على الأقل.');if(db.prepare('SELECT id FROM users WHERE email=?').get(email))throw apiError('الإيميل موجود بالفعل.',409);const t=now(),r=db.prepare('INSERT INTO users(name,email,password_hash,created_at,updated_at) VALUES(?,?,?,?,?)').run(name,email,scryptHash(password),t,t),user=db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);return json(res,201,{user:{name:user.name,email:user.email},token:makeToken(user.id)});}
    if(p==='/api/auth/login'&&method==='POST'){const b=await body(req),email=normalizeEmail(b.email),password=String(b.password||''),user=db.prepare('SELECT * FROM users WHERE email=?').get(email);if(!user||!scryptVerify(password,user.password_hash))throw apiError('البريد الإلكتروني أو كلمة المرور غير صحيحة.',401);return json(res,200,{user:{name:user.name,email:user.email},token:makeToken(user.id)});}
    if(p==='/api/auth/logout'&&method==='POST'){const {data}=verifyToken(bearer(req));db.prepare('UPDATE sessions SET revoked_at=? WHERE jti=?').run(now(),data.jti);res.writeHead(204);return res.end();}

    if(p==='/api/paths'&&method==='GET'){const user=optionalUser(req),q=String(u.searchParams.get('q')||'').toLowerCase(),level=String(u.searchParams.get('level')||''),rows=db.prepare('SELECT * FROM paths ORDER BY rowid').all();return json(res,200,rows.filter(x=>(!q||`${x.title} ${x.description} ${parseJson(x.topics_json,[]).join(' ')}`.toLowerCase().includes(q))&&(!level||x.level===level)).map(x=>pathCard(x,user?.id)));}
    const pm=p.match(/^\/api\/paths\/([^/]+)$/);if(pm&&method==='GET'){const user=optionalUser(req);return json(res,200,pathDetail(decodeURIComponent(pm[1]),user?.id));}
    const scm=p.match(/^\/api\/paths\/([^/]+)\/stages\/(\d+)\/complete$/);if(scm&&method==='POST'){const user=requireUser(req),pid=decodeURIComponent(scm[1]),pos=Number(scm[2]),stage=db.prepare('SELECT * FROM stages WHERE path_id=? AND position=?').get(pid,pos);if(!stage)throw apiError('المرحلة غير موجودة.',404);const tx=()=>transaction(()=>{if(db.prepare('SELECT 1 FROM stage_progress WHERE user_id=? AND stage_id=?').get(user.id,stage.id))return{completed:true,already:true,xp:0,progress:progress(user.id,pid)};if(pos>0){const prev=db.prepare('SELECT id FROM stages WHERE path_id=? AND position=?').get(pid,pos-1);if(prev&&!db.prepare('SELECT 1 FROM stage_progress WHERE user_id=? AND stage_id=?').get(user.id,prev.id))throw apiError('خلص المرحلة السابقة الأول.',409);}db.prepare('INSERT INTO stage_progress(user_id,path_id,stage_id,completed_at) VALUES(?,?,?,?)').run(user.id,pid,stage.id,now());addXp(user.id,STAGE_XP);addActivity(user.id,`أكملت مرحلة ${stage.title}`);return{completed:true,already:false,xp:STAGE_XP,progress:progress(user.id,pid)};});return json(res,200,tx());}

    if(p==='/api/articles'&&method==='GET'){const q=String(u.searchParams.get('q')||'').toLowerCase(),cat=String(u.searchParams.get('cat')||''),rows=db.prepare('SELECT * FROM articles ORDER BY rowid').all();return json(res,200,rows.filter(x=>(!q||`${x.title} ${x.description}`.toLowerCase().includes(q))&&(!cat||x.category===cat)).map(a=>({id:a.id,title:a.title,cat:a.category,time:a.reading_time,icon:a.icon,desc:a.description})));}
    const am=p.match(/^\/api\/articles\/([^/]+)$/);if(am&&method==='GET'){const a=db.prepare('SELECT * FROM articles WHERE id=?').get(decodeURIComponent(am[1]));if(!a)throw apiError('المقال غير موجود',404);return json(res,200,{id:a.id,title:a.title,cat:a.category,time:a.reading_time,icon:a.icon,desc:a.description,body:normalizeBody(parseJson(a.body_json,[])),sources:db.prepare('SELECT title,url FROM article_sources WHERE article_id=? ORDER BY id').all(a.id)});}

    if(p==='/api/quizzes'&&method==='GET'){const q=String(u.searchParams.get('q')||'').toLowerCase(),rows=db.prepare('SELECT * FROM quizzes ORDER BY rowid').all();return json(res,200,rows.filter(x=>!q||`${x.title} ${x.category}`.toLowerCase().includes(q)).map(x=>({id:x.id,title:x.title,cat:x.category,difficulty:x.difficulty,questions:x.question_count,xp:x.xp,icon:x.icon})));}
    const qm=p.match(/^\/api\/quizzes\/([^/]+)$/);if(qm&&method==='GET'){const q=db.prepare('SELECT * FROM quizzes WHERE id=?').get(decodeURIComponent(qm[1]));if(!q)throw apiError('الكويز غير موجود',404);const questions=db.prepare('SELECT position,text,options_json FROM quiz_questions WHERE quiz_id=? ORDER BY position').all(q.id).map(x=>({text:x.text,options:parseJson(x.options_json,[])}));return json(res,200,{id:q.id,title:q.title,cat:q.category,difficulty:q.difficulty,questions,xp:q.xp,icon:q.icon});}
    const qs=p.match(/^\/api\/quizzes\/([^/]+)\/submit$/);if(qs&&method==='POST'){const user=requireUser(req),b=await body(req),q=db.prepare('SELECT * FROM quizzes WHERE id=?').get(decodeURIComponent(qs[1]));if(!q)throw apiError('الكويز غير موجود.',404);const rows=db.prepare('SELECT position,correct_index FROM quiz_questions WHERE quiz_id=? ORDER BY position').all(q.id),answers=Array.isArray(b.answers)?b.answers:[];if(answers.length!==rows.length)throw apiError('لازم تجاوب كل الأسئلة.');const score=rows.reduce((n,r,i)=>n+(Number(answers[i])===r.correct_index?1:0),0),rawXp=Math.round(score*q.xp/rows.length),best=db.prepare('SELECT COALESCE(MAX(xp),0) xp FROM quiz_attempts WHERE user_id=? AND quiz_id=?').get(user.id,q.id).xp,xp=Math.max(0,rawXp-best),tx=()=>transaction(()=>{db.prepare('INSERT INTO quiz_attempts(user_id,quiz_id,score,total,xp,created_at) VALUES(?,?,?,?,?,?)').run(user.id,q.id,score,rows.length,xp,now());if(xp)addXp(user.id,xp);addActivity(user.id,`أكملت كويز ${q.title} (${score}/${rows.length})`);});tx();return json(res,200,{score,total:rows.length,xp});}

    if(p==='/api/me/summary'&&method==='GET'){const user=requireUser(req),u=db.prepare('SELECT * FROM users WHERE id=?').get(user.id),paths=db.prepare('SELECT * FROM paths ORDER BY rowid').all().map(x=>pathCard(x,u.id)),currentPath=paths.filter(x=>x.progress>0).sort((a,b)=>b.progress-a.progress)[0]||null,recent=db.prepare('SELECT text,at FROM activity WHERE user_id=? ORDER BY at DESC LIMIT 5').all(u.id),quizzesDone=db.prepare('SELECT COUNT(DISTINCT quiz_id) n FROM quiz_attempts WHERE user_id=?').get(u.id).n;return json(res,200,{user:{name:u.name,email:u.email},xp:u.xp,level:Math.floor(u.xp/200)+1,streak:streak(u.id),quizzesDone,currentPath,paths,recent});}
    if(p==='/api/leaderboard'&&method==='GET'){return json(res,200,db.prepare('SELECT name,xp FROM users ORDER BY xp DESC,created_at ASC LIMIT 50').all().map((x,i)=>({rank:i+1,name:x.name,xp:x.xp})));}

    if(p.startsWith('/api/'))return json(res,404,{message:'المسار غير موجود.'});
    let file=safeFile(p==='/'?'/index.html':p);if(file&&fs.existsSync(file)&&fs.statSync(file).isFile()){const ext=path.extname(file);res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream'});return fs.createReadStream(file).pipe(res);}
    const notFound=path.join(ROOT,'404.html');res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});return fs.createReadStream(notFound).pipe(res);
  }catch(e){return json(res,e.status||500,{message:e.status?e.message:'حصل خطأ غير متوقع.'});}
}

http.createServer(handle).listen(PORT,()=>console.log(`Kharazmi V1 running at http://localhost:${PORT}`));
