/* ===== طبقة الـAPI — الملف الوحيد اللي بيتكلم مع الباكيند =====
   USE_MOCK:true  → بيانات تجريبية محلية (js/mock.js)
   USE_MOCK:false → طلبات fetch حقيقية على BASE_URL (العقد الكامل في BACKEND.md) */
(function(){
  const LOCAL_MODE=location.protocol==='file:';
  const CONFIG={USE_MOCK:false,BASE_URL:'/api'};
  const K=window.KW;
  const MSG={0:'تعذر الاتصال بالخادم. تأكد من الإنترنت وحاول تاني.',400:'البيانات غير صحيحة.',401:'البريد الإلكتروني أو كلمة المرور غير صحيحة.',403:'غير مسموح.',404:'غير موجود.',409:'موجود بالفعل.',429:'محاولات كتير، استنى شوية.',x:'حصل خطأ غير متوقع.'};
  const qs=o=>{const p=new URLSearchParams();for(const k in o||{})if(o[k])p.set(k,o[k]);const s=p.toString();return s?'?'+s:''};
  async function http(method,url,body){
    const h={'Content-Type':'application/json'},t=K.get('kw_token',null);
    if(t)h.Authorization='Bearer '+t; // لو الباكيند بيستخدم Cookies: شيل السطر ده وخلي الباكيند يبعت Set-Cookie
    let r;
    try{r=await fetch(CONFIG.BASE_URL+url,{method,headers:h,body:body?JSON.stringify(body):undefined,keepalive:url==='/auth/logout'})}
    catch{throw new K.ApiError(MSG[0],0)}
    const d=r.status===204?null:await r.json().catch(()=>null);
    if(r.status===401&&!url.startsWith('/auth/'))K.expire(); // الجلسة انتهت
    if(!r.ok)throw new K.ApiError((d&&d.message)||MSG[r.status]||MSG.x,r.status);
    return d;
  }
  const id=encodeURIComponent;
  const real={
    register:b=>http('POST','/auth/register',b),
    login:b=>http('POST','/auth/login',b),
    logout:()=>http('POST','/auth/logout'),
    getPaths:f=>http('GET','/paths'+qs(f)),
    getPath:i=>http('GET','/paths/'+id(i)),
    completeStage:(pathId,position)=>http('POST','/paths/'+id(pathId)+'/stages/'+encodeURIComponent(position)+'/complete'),
    getArticles:f=>http('GET','/articles'+qs(f)),
    getArticle:i=>http('GET','/articles/'+id(i)),
    getQuizzes:f=>http('GET','/quizzes'+qs(f)),
    getQuiz:i=>http('GET','/quizzes/'+id(i)),
    checkAnswer:(i,question,choice)=>http('POST','/quizzes/'+id(i)+'/answer',{question,choice}),
    submitQuiz:(i,answers)=>http('POST','/quizzes/'+id(i)+'/submit',{answers}),
    getSummary:()=>http('GET','/me/summary'),
    getLeaderboard:()=>http('GET','/leaderboard')
  };
  const impl=(CONFIG.USE_MOCK||LOCAL_MODE)?K.mock:real;
  const local=K.mock;
  // نسخة واحدة للمشروع: الباكيند هو المصدر الأساسي، ولو الموقع اتفتح محليًا
  // من TrebEdit أو حصل انقطاع اتصال، المحتوى والمزايا المحلية لا تختفي.
  const fallback=(primary,backup)=>async(...args)=>{
    try{return await primary(...args)}
    catch(e){
      if(e&&e.status===0&&backup)return backup(...args);
      throw e;
    }
  };
  // للمحتوى العام: لا نخلي خطأ API أو فتح الصفحة من معاينة محلية يخفي المحتوى.
  const contentFallback=(primary,backup)=>async(...args)=>{
    try{return await primary(...args)}
    catch(e){if(backup)return backup(...args);throw e}
  };
  const api=(CONFIG.USE_MOCK||LOCAL_MODE)?local:{
    ...real,
    getPaths:contentFallback(real.getPaths,local.getPaths),
    getPath:contentFallback(real.getPath,local.getPath),
    completeStage:fallback(real.completeStage,local.completeStage),
    getArticles:contentFallback(real.getArticles,local.getArticles),
    getArticle:contentFallback(real.getArticle,local.getArticle),
    getQuizzes:contentFallback(real.getQuizzes,local.getQuizzes),
    getQuiz:contentFallback(real.getQuiz,local.getQuiz),
    checkAnswer:fallback(real.checkAnswer,local.checkAnswer),
    submitQuiz:fallback(real.submitQuiz,local.submitQuiz),
    getSummary:contentFallback(real.getSummary,local.getSummary),
    getLeaderboard:contentFallback(real.getLeaderboard,local.getLeaderboard)
  };
  const save=r=>{K.set('kw_user',r.user);K.set('kw_token',r.token||null);return r};
  K.CONFIG={...CONFIG,LOCAL_MODE};
  K.api={...api,login:async b=>save(await fallback(api.login,local.login)(b)),register:async b=>save(await fallback(api.register,local.register)(b)),logout:async()=>{try{const r=await api.logout();K.expire();return r}catch(e){if(e&&e.status===0){K.expire();return local.logout()}throw e;}}};
})();
