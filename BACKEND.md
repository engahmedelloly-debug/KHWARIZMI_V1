# Backend V1 — خوارزمي

النسخة دي نقلت البيانات الأساسية من Mock إلى Backend حقيقي، مع الحفاظ على الواجهة الحالية وعدم تغيير الهوية.

## Stack
- Node.js 22+
- HTTP server مدمج في Node (من غير Express أو dependencies خارجية)
- SQLite مدمج في Node 22 عبر `node:sqlite`
- `crypto.scrypt` لتخزين كلمات المرور كـhash
- Bearer tokens موقعة بـHMAC-SHA256 + sessions محفوظة في SQLite

> ملاحظة: `node:sqlite` متاح في Node 22، وقد يظهر تحذير Experimental في بعض إصدارات Node 22.

## تشغيل محلي
```bash
node server.js
```
ثم افتح:
`http://localhost:3000`

متغيرات اختيارية:
```text
PORT=3000
JWT_SECRET=ضع_سر_عشوائي_طويل_هنا
DB_FILE=./kharazmi.sqlite
CORS_ORIGIN=http://localhost:3000
```

في الإنتاج لازم تغيّر `JWT_SECRET`، والأفضل تخلي قاعدة البيانات خارج Git.

## إيه اللي بقى حقيقي؟
- إنشاء حساب وتسجيل الدخول والخروج.
- كلمات المرور لا تُخزن كنص؛ يتم تخزينها باستخدام scrypt + salt.
- Sessions حقيقية محفوظة في SQLite وقابلة للإلغاء عند Logout.
- التخصصات والـRoadmaps والمصادر والمقالات ومصادر المقالات والكويزات والأسئلة كلها Seeded داخل قاعدة البيانات.
- الكويز لا يرسل الإجابة الصحيحة في `GET /quizzes/:id`.
- تصحيح الإجابة يتم من السيرفر.
- نتيجة الكويز والـXP تُحفظ في الحساب.
- إكمال مراحل الـRoadmap يُحفظ لكل مستخدم ويحسب التقدم الحقيقي.
- Dashboard/Profile يقرآن XP والتقدم والنشاط من السيرفر.
- Leaderboard يقرأ المستخدمين الحقيقيين من قاعدة البيانات.

## الـAPI
كل الردود JSON، والأخطاء بالشكل:
```json
{ "message": "رسالة عربية للمستخدم" }
```

`🔒` = يحتاج تسجيل دخول، عبر:
`Authorization: Bearer <token>`

| Method | Path | Auth | الرد |
|---|---|---|---|
| GET | `/api/health` | — | حالة السيرفر |
| POST | `/api/auth/register` | — | `{user, token}` |
| POST | `/api/auth/login` | — | `{user, token}` |
| POST | `/api/auth/logout` | 🔒 | `204` |
| GET | `/api/paths?q=&level=` | اختياري | المسارات + تقدم المستخدم |
| GET | `/api/paths/:id` | اختياري | المسار + roadmap + resources + حالة كل مرحلة |
| POST | `/api/paths/:id/stages/:position/complete` | 🔒 | حفظ المرحلة + XP + progress |
| GET | `/api/articles?q=&cat=` | — | قائمة المقالات |
| GET | `/api/articles/:id` | — | المقال + body + sources |
| GET | `/api/quizzes?q=` | — | قائمة الكويزات |
| GET | `/api/quizzes/:id` | — | الأسئلة والاختيارات **من غير الإجابات** |
| POST | `/api/quizzes/:id/answer` | — | هل الإجابة صح + `correctIndex` للسؤال الحالي |
| POST | `/api/quizzes/:id/submit` | 🔒 | `{score,total,xp}` |
| GET | `/api/me/summary` | 🔒 | الحساب + XP + المستوى + streak + التقدم + النشاط |
| GET | `/api/leaderboard` | — | المتصدرون |

## التقدم والـXP
- كل مرحلة Roadmap مكتملة = `20 XP` في V1.
- الـXP الخاص بالكويز يُحسب على السيرفر حسب نسبة الإجابات الصحيحة، ولا يمكن تكرار نفس الـXP لنفس الكويز؛ المحاولة الجديدة تضيف فقط الزيادة عن أفضل نتيجة سابقة.
- التقدم في المسار = عدد المراحل المكتملة / إجمالي مراحل المسار.
- لا يمكن إنهاء مرحلة قبل المرحلة السابقة؛ السيرفر يفرض ترتيب الـRoadmap.
- الزائر يرى `0%`، أما المستخدم المسجل فيرى تقدمه الحقيقي.
- كل نشاط محفوظ في جدول `activity` ويساهم في حساب الـstreak.

## ملاحظات أمان مهمة
- لا نرسل `correct_index` مع `GET /quizzes/:id`.
- لا نعتمد على JavaScript في المتصفح لحساب XP النهائي.
- هناك rate limit بسيط على `/api/auth/*`.
- في وضع الإنتاج يجب تعيين `JWT_SECRET` عشوائيًا بطول 32 بايت/حرف على الأقل من إعدادات الاستضافة.
- لم يعد السيرفر يكشف صحة كل إجابة عبر endpoint منفصل؛ تُرسل الإجابات مجتمعة عند التسليم وتُصحح على السيرفر.
- لا تضع `JWT_SECRET` الحقيقي داخل الملفات أو GitHub؛ يجب ضبطه كمتغير بيئة في الاستضافة.
- عند فصل الـFrontend عن الـAPI على دومين مختلف، اضبط `CORS_ORIGIN` على دومين الموقع بدل `*`.

## Frontend
`js/api.js` أصبح:
```js
const CONFIG={USE_MOCK:false,BASE_URL:'/api'};
```
وبالتالي الصفحات تستعمل الـAPI الحقيقي تلقائيًا عند تشغيل `server.js`.

زر **«أنجزت المرحلة»** تمت إضافته داخل صفحات الـRoadmap للمستخدم المسجل، ويحفظ الحالة في قاعدة البيانات.

## Seed
`backend-seed.json` تم توليده من بيانات V1 الحالية، ويحتوي على:
- 10 مسارات
- 120 مصدرًا
- 12 مقالًا
- مصادر المقالات
- 6 كويزات وأسئلتها
- كل الـRoadmaps والمراحل الحالية

عند أول تشغيل يتم إنشاء `kharazmi.sqlite` وملؤها تلقائيًا.
