(function(){
  const root=document.documentElement;
  const $=(s,p=document)=>p.querySelector(s), $$=(s,p=document)=>[...p.querySelectorAll(s)];
  const get=(k,d)=>{try{const v=localStorage.getItem(k);return v===null?d:JSON.parse(v)}catch{return d}};
  const set=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
  const user=get('kw_user',null);
  const theme=get('kw_theme','light'); root.dataset.theme=theme;
  let lang=get('kw_lang','ar'); root.lang=lang; root.dir=lang==='ar'?'rtl':'ltr';
  const path=location.pathname.split('/').pop()||'index.html';
  const page=path.replace('.html','')||'index';const i18nOK=page==='index';if(!i18nOK)lang='ar';

  const T={
    ar:{
      'nav.home':'الرئيسية','nav.paths':'التخصصات','nav.articles':'المقالات','nav.quizzes':'الكويزات','nav.leaderboard':'المتصدرين','nav.login':'دخول','nav.account':'حسابي','nav.logout':'تسجيل الخروج',
      'footer.tagline':'مجتمع طلاب علوم الحاسب والبيانات.','footer.by':'بواسطة',
      'home.eyebrow':'مجتمع علوم الحاسب والبيانات','home.title':'من هنا يبدأ فهمك الحقيقي للكمبيوتر والبيانات','home.desc':'خوارزمي مجتمع للطلاب يساعدك تفهم المجال، تختار تخصصك، تبني مسارك، وتتعلم خطوة بخطوة من غير تشتت.','home.start':'ابدأ رحلتك','home.explore':'استكشف التخصصات','home.why':'ليه خوارزمي؟','home.whyText':'أدوات ومحتوى مترتبين عشان تختصر الطريق بدل ما تضيع بين عشرات المصادر.','home.paths':'تخصصات ومسارات','home.pathsText':'اختار المجال اللي حابب تبدأ منه، وخوارزمي يرتبلك الطريق.','home.articles':'مقالات تقنية','home.articlesText':'محتوى بسيط وعملي يساعدك تفهم الفكرة قبل ما تدخل في التفاصيل.','home.all':'عرض الكل','home.platform1':'مسارات واضحة','home.platform1Text':'Roadmaps مترتبة من الأساسيات لحد المستوى المتقدم.','home.platform2':'تعلم تفاعلي','home.platform2Text':'كويزات وتحديات ونظام XP يخلي التعلم فيه حركة.','home.platform3':'محتوى مستمر','home.platform3Text':'مقالات ومصادر جديدة تتضاف واحدة واحدة مع نمو المنصة.',
      'home.footerTitle':'خوارزمي — خطوة أوضح في طريقك','home.footerText':'مش لازم تعرف هتتخصص في إيه من أول يوم. ابدأ، جرّب، واتعلم.','lang.switch':'العربية'
    },
    en:{
      'nav.home':'Home','nav.paths':'Specializations','nav.articles':'Articles','nav.quizzes':'Quizzes','nav.leaderboard':'Leaderboard','nav.login':'Login','nav.account':'Account','nav.logout':'Log out',
      'footer.tagline':'A community for computer science and data students.','footer.by':'By',
      'home.eyebrow':'Computer Science & Data Community','home.title':'This is where your real understanding of computers and data begins','home.desc':'Kharazmi is a student community that helps you understand the field, choose a specialization, build your path, and learn step by step without the noise.','home.start':'Start your journey','home.explore':'Explore specializations','home.why':'Why Kharazmi?','home.whyText':'Organized tools and content that shorten the path instead of leaving you lost between dozens of resources.','home.paths':'Specializations & paths','home.pathsText':'Choose the field you want to start with, and Kharazmi helps structure the journey.','home.articles':'Technical articles','home.articlesText':'Simple, practical content that helps you understand the idea before diving deeper.','home.all':'View all','home.platform1':'Clear paths','home.platform1Text':'Structured roadmaps from fundamentals to advanced topics.','home.platform2':'Interactive learning','home.platform2Text':'Quizzes, challenges and XP that keep learning active.','home.platform3':'Growing content','home.platform3Text':'New articles and resources added as the platform grows.',
      'home.footerTitle':'Kharazmi — a clearer step forward','home.footerText':'You do not need to know your specialization on day one. Start, try, and learn.','lang.switch':'English'
    }
  };
  function applyLanguage(){
    root.lang=lang; root.dir=lang==='ar'?'rtl':'ltr';
    $$('[data-i18n]').forEach(el=>{const key=el.dataset.i18n;if(T[lang][key])el.textContent=T[lang][key]});
    const lb=$('#langToggle'); if(lb)lb.textContent=lang==='ar'?'EN':'عربي';
    const auth=$('#authLink'); if(auth&&user)auth.textContent=T[lang]['nav.logout'];
    if(page==='index') document.title=lang==='ar'?'خوارزمي — مجتمع علوم الحاسب والبيانات':'Kharazmi — Computer Science & Data Community';
    window.dispatchEvent(new CustomEvent('kw:language',{detail:{lang}}));
  }
  const nav=$('.main-nav'),menu=$('#menuBtn');
  if(menu)menu.onclick=()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',open?'true':'false')};
  $$('[data-page]').forEach(a=>{if(a.dataset.page===page)a.classList.add('active')});
  const themeBtn=$('#themeToggle'); if(themeBtn)themeBtn.onclick=()=>{const n=root.dataset.theme==='dark'?'light':'dark';root.dataset.theme=n;set('kw_theme',n)};
  const langBtn=$('#langToggle'); if(langBtn&&!i18nOK)langBtn.style.display='none';if(langBtn)langBtn.onclick=()=>{lang=lang==='ar'?'en':'ar';set('kw_lang',lang);applyLanguage()};
  const avatar=$('#userAvatar'),userName=$('#userName'); if(user){if(avatar)avatar.textContent=(user.name||'أ')[0];if(userName)userName.textContent=user.name}else if(userName)userName.textContent=T[lang]['nav.account'];
  const authLink=$('#authLink'); if(authLink&&user){authLink.textContent=T[lang]['nav.logout'];authLink.href='#';authLink.onclick=e=>{e.preventDefault();KW.logout()}}
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  class ApiError extends Error{constructor(m,status){super(m);this.status=status}}
  const safeNext=n=>/^[a-z0-9-]+\.html(\?[\w=&%.-]*)?$/i.test(n||'')?n:'dashboard.html';
  const clearSession=()=>['kw_user','kw_token'].forEach(k=>localStorage.removeItem(k));
  const expire=()=>{clearSession();location.replace('login.html?next='+encodeURIComponent(path+location.search))};
  const requireAuth=()=>{if(!user){expire();return false}return true};
  const logout=()=>{try{window.KW.api.logout().catch(()=>{})}catch{}clearSession();location.href='login.html'};
  const ago=iso=>{const m=Math.round((Date.now()-new Date(iso))/6e4);return m<1?'الآن':m<60?'منذ '+m+' دقيقة':m<1440?'منذ '+Math.round(m/60)+' ساعة':'منذ '+Math.round(m/1440)+' يوم'};
  const view=async(el,fn,render)=>{const n=el._r=(el._r||0)+1;el.innerHTML='<div class="card"><p class="muted">جاري التحميل…</p></div>';try{const d=await fn();if(n===el._r)el.innerHTML=render(d)}catch(e){if(n!==el._r)return;el.innerHTML='<div class="card"><p>'+esc(e.message||'حصل خطأ')+'</p><button class="btn btn-soft small" type="button">إعادة المحاولة</button></div>';el.querySelector('button').onclick=()=>view(el,fn,render)}};
  window.KW={get,set,user,$,$$,page,getLang:()=>lang,T,esc,ApiError,safeNext,expire,requireAuth,logout,ago,view};
  applyLanguage();
})();
