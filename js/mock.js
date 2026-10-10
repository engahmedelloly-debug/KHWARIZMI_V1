/* بيانات تجريبية بتحاكي ردود الباكيند بنفس الشكل بالظبط. تتشال لما USE_MOCK يبقى false. */
(function(){
  const K=window.KW,D=window.KW_DATA;
  const later=v=>new Promise(r=>setTimeout(()=>r(JSON.parse(JSON.stringify(v===undefined?null:v))),100));
  const fail=(m,s)=>Promise.reject(new K.ApiError(m,s));
  const has=(t,q)=>!q||t.toLowerCase().includes(q.toLowerCase());
  const P=()=>K.get('kw_progress',{xp:0,done:{},recent:[]});
  const RES=k=>{const r=(D.res||{})[k];return r?{title:r[0],url:r[1],lang:r[2],type:r[3],desc:r[4]||''}:null};
  const resList=ks=>ks.map(RES).filter(Boolean);
  const block=b=>b[0]==='ul'||b[0]==='ol'?{type:b[0],items:b[1]}:b[0]==='code'?{type:'code',lang:b[1],text:b[2]}:{type:b[0],text:b[1]};
  K.mock={
    register:b=>later({user:{name:b.name,email:b.email},token:'mock-token'}),
    login:b=>later({user:{name:(b.email.split('@')[0]||'طالب').replace(/[._-]/g,' '),email:b.email},token:'mock-token'}),
    logout:()=>later(null),
    getPaths:(f={})=>later(D.paths.filter(p=>has(p.title+' '+p.desc+' '+p.topics.join(' '),f.q)&&(!f.level||p.level===f.level))),
    getPath:i=>{const p=D.paths.find(x=>x.id===i);if(!p)return fail('المسار غير موجود',404);
      const rm=(D.roadmaps||{})[i]||{stages:[],extra:[]},seen={},extra=[...rm.extra,...(D.hubs||[])].filter(k=>!seen[k]&&(seen[k]=1));
      return later({...p,roadmap:rm.stages.map(s=>({title:s.t,desc:s.d,duration:s.w,project:s.p,resources:resList(s.r)})),resources:resList(extra)})},
    getArticles:(f={})=>later(D.articles.filter(a=>has(a.title+' '+a.desc,f.q)&&(!f.cat||a.cat===f.cat))),
    getArticle:i=>{const a=D.articles.find(x=>x.id===i);return a?later({...a,body:(D.bodies[i]||[]).map(block),sources:(D.articleSources||{})[i]||[]}):fail('المقال غير موجود',404)},
    getQuizzes:(f={})=>later(D.quizzes.filter(x=>has(x.title+' '+x.cat,f.q))),
    getQuiz:i=>{const x=D.quizzes.find(z=>z.id===i),b=D.quizBank[i];return x&&b?later({...x,questions:b.map(r=>({text:r[0],options:r[1]}))}):fail('الكويز غير موجود',404)},
    checkAnswer:(i,q,c)=>{const r=(D.quizBank[i]||[])[q];return r?later({correct:c===r[2],correctIndex:r[2]}):fail('السؤال غير موجود',404)},
    submitQuiz:(i,picked)=>{
      const x=D.quizzes.find(z=>z.id===i),b=D.quizBank[i]; if(!x||!b)return fail('الكويز غير موجود',404);
      const score=b.filter((r,n)=>picked[n]===r[2]).length,xp=Math.round(score*x.xp/b.length),p=P();
      p.xp+=xp;p.done[i]=1;p.recent.unshift({text:'أكملت كويز '+x.title,at:new Date().toISOString()});p.recent=p.recent.slice(0,5);K.set('kw_progress',p);
      return later({score,total:b.length,xp});
    },
    getSummary:()=>{const p=P();return later({user:K.get('kw_user',{}),xp:p.xp,level:Math.floor(p.xp/200)+1,streak:p.xp?1:0,quizzesDone:Object.keys(p.done).length,currentPath:D.paths.find(x=>x.id==='web'),paths:D.paths.filter(x=>x.progress>0),recent:p.recent})},
    getLeaderboard:()=>later([['أحمد',2480],['محمد',2310],['سارة',2190],['عمر',1840],['نور',1710]].map((r,n)=>({rank:n+1,name:r[0],xp:r[1]})))
  };
})();
