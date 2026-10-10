(function(){
  const h=document.getElementById('siteHeader'),f=document.getElementById('siteFooter');
  if(h)h.innerHTML=`
  <header class="topbar">
    <div class="wrap topbar-inner">
      <a class="brand" href="index.html" aria-label="خوارزمي" dir="ltr">
        <img class="brand-mark" src="assets/logo-mark.svg" alt="">
        <span class="brand-word"><span class="brand-main">خوارز</span><span class="brand-gold">مي</span></span>
      </a>
      <button id="menuBtn" class="icon-btn menu-btn" aria-label="فتح القائمة" aria-expanded="false">☰</button>
      <nav class="main-nav" aria-label="التنقل الرئيسي">
        <a data-page="index" href="index.html" data-i18n="nav.home">الرئيسية</a>
        <a data-page="paths" href="paths.html" data-i18n="nav.paths">التخصصات</a>
        <a data-page="articles" href="articles.html" data-i18n="nav.articles">المقالات</a>
        <a data-page="quizzes" href="quizzes.html" data-i18n="nav.quizzes">الكويزات</a>
        <a data-page="leaderboard" href="leaderboard.html" data-i18n="nav.leaderboard">المتصدرين</a>
      </nav>
      <div class="top-actions">
        <button id="langToggle" class="lang-btn" type="button" aria-label="تغيير اللغة">EN</button>
        <button id="themeToggle" class="icon-btn" type="button" title="تغيير المظهر" aria-label="تغيير المظهر">◐</button>
        <a id="authLink" class="btn btn-soft small" href="login.html" data-i18n="nav.login">دخول</a>
        <a class="user-chip" href="profile.html"><span class="avatar" id="userAvatar">خ</span><span id="userName">حسابي</span></a>
      </div>
    </div>
  </header>`;
  if(f)f.innerHTML=`<footer class="footer"><div class="wrap footer-inner"><div><strong>خوارزمي</strong> — <span data-i18n="footer.tagline">مجتمع طلاب علوم الحاسب والبيانات.</span></div><div class="footer-credit"><span data-i18n="footer.by">بواسطة</span> <strong>Ahmed Elloly</strong></div><div class="mono">© 2026 KHWARIZMI</div></div></footer>`;
})();
