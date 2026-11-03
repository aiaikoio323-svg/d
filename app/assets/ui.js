/* ===== ui.js — rendering & interactions ===== */
"use strict";

var UI = (function () {

  var TABS = [
    { key: "latest", label: "آخرین اخبار" },
    { key: "trending", label: "داغترینها" },
    { key: "free", label: "رایگانها" },
    { key: "spaces", label: "اسپیسها" },
    { key: "res", label: "AI رایگان" },
    { key: "assistant", label: "دستیار" }
  ];

  var NAV = [
    { key: "latest", icon: "🏠", label: "خانه" },
    { key: "trending", icon: "🔥", label: "داغها" },
    { key: "free", icon: "🎁", label: "رایگان" },
    { key: "spaces", icon: "🚀", label: "اسپیسها" },
    { key: "res", icon: "💎", label: "AI رایگان" },
    { key: "assistant", icon: "🤖", label: "دستیار" },
    { key: "about", icon: "ⓘ", label: "منابع" }
  ];

  function $(id) { return document.getElementById(id); }

  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.remove("hidden");
    clearTimeout(t._h);
    t._h = setTimeout(function () { t.classList.add("hidden"); }, 2600);
  }

  /* ---------- md mini renderer ---------- */
  function md(text) {
    var t = esc(text || "");
    t = t.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    return t.split(/\n{2,}/).map(function (p) {
      return "<p>" + p.replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }

  /* ---------- filtering ---------- */
  function visibleNews() {
    var list = state.news;
    if (state.tab === "trending") {
      list = list.slice().sort(function (a, b) { return hotScore(b) - hotScore(a); });
    } else if (state.tab === "free") {
      list = list.filter(function (it) { return it.isFree || it.category === "free"; })
        .sort(function (a, b) { return new Date(b.publishedAt) - new Date(a.publishedAt); });
    } else {
      list = list.slice().sort(function (a, b) { return new Date(b.publishedAt) - new Date(a.publishedAt); });
    }
    if (state.cat !== "all") {
      list = list.filter(function (it) { return (it.category || "industry") === state.cat; });
    }
    return list.slice(0, 40);
  }

  /* ---------- news card ---------- */
  function newsCard(it, rank) {
    var src = SRC_BY_ID[it.sourceId] || { nameFa: "", color: "#888" };
    var cat = CAT_BY_KEY[it.category] || CAT_BY_KEY.industry;
    var badges = "";
    if (rank && rank <= 3) badges += '<span class="badge b-rank">' + ["🥇", "🥈", "🥉"][rank - 1] + " " + faDigits(rank) + "</span>";
    if (it.isFree) badges += '<span class="badge b-free">رایگان</span>';
    var score = hotScore(it);
    if (score >= 7) badges += '<span class="badge b-hot">داغ</span>';

    var img = it.image
      ? '<img class="thumb" loading="lazy" src="' + esc(it.image) + '" onerror="this.style.display=\'none\'">'
      : "";
    var title = it.titleFa || it.title;
    var sumText = it.summaryFa || it.descFa || (it.desc ? it.desc.slice(0, 160) + (it.desc.length > 160 ? "…" : "") : "");
    var sumBlock = sumText
      ? '<div class="cardsumwrap" data-act="reader" data-id="' + esc(it.id) + '"><p class="cardsum">' + esc(sumText) +
        '</p><span class="morehint">متن کامل خبر + ترجمهٔ کامل ↗</span></div>'
      : "";
    var plain = it.plainFa
      ? '<div class="plain"><b>برای تو چه معنی دارد؟</b> ' + esc(it.plainFa) + "</div>"
      : "";
    var stars = "★".repeat(Math.min(3, Math.max(1, Math.round((src.weight || 5) / 3.4))));

    return '<article class="card" data-card="' + esc(it.id) + '">' +
      '<div class="imgwrap">' + img +
      '<div class="badges">' + badges + "</div></div>" +
      '<div class="body">' +
      '<div class="meta"><span class="dot" style="background:' + src.color + '"></span>' +
      "<span>" + esc(src.nameFa || src.name) + "</span><span>·</span><span>" + timeAgoFa(it.publishedAt) + "</span>" +
      '<span class="cat">' + cat.emoji + " " + cat.label + "</span><span>·</span><span>" + stars + "</span></div>" +
      "<h3>" + esc(title) + "</h3>" +
      sumBlock +
      plain +
      "</div>" +
      '<div class="foot">' +
      '<a class="prim" data-act="open" data-id="' + esc(it.id) + '" href="' + esc(it.link) + '">منبع اصلی ↗</a>' +
      '<button class="act" data-act="reader" data-id="' + esc(it.id) + '">متن کامل</button>' +
      '<button class="act" data-act="share" data-id="' + esc(it.id) + '">اشتراک</button>' +
      "</div></article>";
  }

  /* ---------- space card ---------- */
  function spaceCard(sp, rank) {
    return '<article class="card"><div class="body">' +
      '<div class="meta"><span>' + (sp.emoji || "🚀") + "</span><span>هاگینگ فیس · اسپیس</span><span>·</span>" +
      '<span>ترند ' + faDigits(rank) + "</span><span>·</span><span>❤ " + faDigits(sp.likes) + "</span>" +
      '<span class="cat">' + esc(sp.sdk) + "</span></div>" +
      "<h3>" + esc(sp.titleFa || sp.name) + "</h3>" +
      (sp.descFa ? '<p class="sum">' + esc(sp.descFa) + "</p>" : "") +
      '<p class="sum" style="font-size:11px;opacity:.7">ساخته ' + esc(sp.author) + "</p>" +
      "</div>" +
      '<div class="foot">' +
      '<button class="act" data-act="spaceai" data-id="' + esc(sp.sid) + '">🤖 قابلیتش چیه؟</button>' +
      '<button class="act" data-act="runspace" data-id="' + esc(sp.sid) + '">اجرا داخل اپ</button>' +
      "</div></article>";
  }

  /* ---------- page context (what the user is looking at) ---------- */
  var TAB_FA = { latest: "آخرین اخبار", trending: "داغترین‌ها", free: "رایگان‌ها", spaces: "اسپیس‌های هاگینگ فیس", res: "کاتالوگ AIهای رایگان", assistant: "دستیار" };

  function getPageContext() {
    var lines = [];
    var rit = state._readerId ? findNews(state._readerId) : null;
    if (rit) {
      var rsrc = SRC_BY_ID[rit.sourceId] || {};
      lines.push("متن کامل خبری که کاربر همین الان باز کرده است (اول کل این متن را بخوان و درک کن، بعد سؤال کاربر را جواب بده؛ جواب در راستای همین متن باشد):\n«" + (rit.titleFa || rit.title) + "» — " + (rsrc.nameFa || rsrc.name || "") + "\n" +
        (rit.fullFa || rit.fullEn || rit.desc || "").slice(0, 3600));
    }
    lines.push("صفحه فعلی: تب «" + (TAB_FA[state.tab] || state.tab) + "»" +
      (state.cat !== "all" && CAT_BY_KEY[state.cat] ? " دسته «" + CAT_BY_KEY[state.cat].label + "»" : ""));
    if (state.tab === "spaces") {
      var sp = state.spaces.slice(0, 8).map(function (s, i) {
        return (i + 1) + ". " + (s.titleFa || s.name) +
          (s.aiFa ? " — " + s.aiFa.replace(/\n+/g, " ").slice(0, 150) : (s.descFa ? " — " + s.descFa.slice(0, 110) : ""));
      }).join("\n");
      if (sp) lines.push("اسپیس‌های روی صفحه (ترند هاگینگ فیس):\n" + sp);
    } else if (state.tab === "res") {
      var ri = RES.items.filter(function (x) { return !x._gone && (state._resCat === "all" || x.cat === state._resCat); })
        .sort(function (a, b) { return a.rank - b.rank; }).slice(0, 12)
        .map(function (x, i) { return (i + 1) + ". " + x.name + " — " + x.fa.slice(0, 90); }).join("\n");
      if (ri) lines.push("کاتالوگ منابع رایگان AI روی صفحه (سؤالش احتمالاً دربارهٔ همین‌هاست؛ از دانش تخصصی‌ات هم کمک بگیر):\n" + ri);
    } else {
      var items = visibleNews().slice(0, 10).map(function (x, i) {
        return (i + 1) + ". " + (x.titleFa || x.title);
      }).join("\n");
      if (items) lines.push("اخبار روی صفحه:\n" + items);
    }
    return lines.join("\n");
  }

  /* ---------- full-article reader sheet ---------- */
  function readerSheet(it) {
    var src = SRC_BY_ID[it.sourceId] || { nameFa: "", name: "", color: "#888" };
    var t = it.titleFa || it.title;
    var head = '<div class="sheethead"><h2>' + esc(t.length > 64 ? t.slice(0, 64) + "…" : t) + '</h2><button class="xbtn" data-act="closesheet">✕</button></div>' +
      '<p class="rmeta"><span class="dot" style="background:' + src.color + '"></span> ' + esc(src.nameFa || src.name) + " · " + timeAgoFa(it.publishedAt) + "</p>";
    var simple = '<div class="simplebox"><h4>💡 به زبان ساده</h4><div id="simpleBox">' +
      (it.simpleFa ? md(it.simpleFa) : '<span class="muted">🤖 دستیار رایگان در حال خواندن کل خبر…</span>') + "</div></div>";
    var btns = '<div class="keyrow">' +
      (it.fullFa ? "" : '<button class="act" data-act="fullfa">🌐 ترجمهٔ کامل به فارسی</button>') +
      (it.fullEn ? '<button class="act" data-act="togglefull">' + (state._readerEn ? "نمایش ترجمهٔ فارسی" : "نمایش متن اصلی (EN)") + "</button>" : "") +
      '</div><div class="rnote" id="rnote"></div>' +
      '<div class="fulltext' + (state._readerEn ? " en" : "") + '" id="fulltext">' +
      esc(state._readerEn ? (it.fullEn || "") : (it.fullFa || it.fullEn || "")) + "</div>" +
      '<a class="bigbtn" style="text-decoration:none" data-act="open" href="' + esc(it.link) + '">منبع اصلی ↗</a>';
    return head + simple + btns;
  }

  function rNote(m) { var e = $("rnote"); if (e) e.textContent = m || ""; }
  function rSimple(html) { var e = $("simpleBox"); if (e) e.innerHTML = html; }

  function rFull() {
    var it = findNews(state._readerId);
    var e = $("fulltext");
    if (!it || !e) return;
    var showEn = state._readerEn || !it.fullFa;
    e.textContent = showEn ? (it.fullEn || "") : it.fullFa;
    e.classList.toggle("en", showEn);
  }

  function openReader(id) {
    var it = findNews(id);
    if (!it) return;
    state._readerId = id;
    state._readerEn = false;
    openSheet(readerSheet(it));
    ensureReaderContent(it);
  }

  function ensureReaderContent(it) {
    if (state._readerBusy) return;
    state._readerBusy = true;
    var p = Promise.resolve();
    if (!it.fullEn || it.fullEn.length < 200) {
      rNote("در حال دریافت متن کامل خبر…");
      p = fetchFullArticle(it).then(function () {
        // if the user opened the assistant widget meanwhile, don't yank the sheet back
        if (!state._widget) openSheet(readerSheet(it));
        rNote("");
      });
    }
    p.then(function () {
      if (it.simpleFa) { rSimple(md(it.simpleFa)); return null; }
      rSimple('<span class="muted">🤖 دستیار رایگان در حال خواندن کل خبر…</span>');
      return summarizeArticleSimple(it.fullEn, rNote).then(function (txt) {
        it.simpleFa = txt;
        persist();
        rSimple(md(txt));
      }).catch(function (e) {
        rSimple('<span class="muted">✕ ' + esc(e.message || "خلاصه‌سازی ممکن نشد") + "</span>");
      });
    }).catch(function (e) {
      rSimple('<span class="muted">✕ ' + esc(e.message || "متن کامل در دسترس نیست") + "</span>");
      rNote("");
    }).then(function () { state._readerBusy = false; });
  }

  function startFullFa() {
    var it = findNews(state._readerId);
    if (!it || !it.fullEn || it.fullFa) return;
    if (it._translatingFull) return;
    it._translatingFull = true;
    var btn = document.querySelector('[data-act="fullfa"]');
    if (btn) { btn.textContent = "در حال ترجمه…"; }
    translateFullText(it.fullEn, function (done, total, partial) {
      rNote("ترجمهٔ بخش " + faDigits(done) + " از " + faDigits(total) + "…");
      var e = $("fulltext");
      if (e && !state._readerEn) { e.textContent = partial + " …"; e.classList.remove("en"); }
    }).then(function (full) {
      it._translatingFull = false;
      it.fullFa = full;
      persist();
      rNote("");
      rFull();
      toast("ترجمهٔ کامل آماده شد");
      if (btn) btn.remove();
      var row = document.querySelector("#sheet .keyrow");
      if (row && !row.querySelector('[data-act="togglefull"]')) {
        row.insertAdjacentHTML("beforeend", '<button class="act" data-act="togglefull">نمایش متن اصلی (EN)</button>');
      }
    }).catch(function (e) {
      it._translatingFull = false;
      rNote("");
      if (btn) btn.textContent = "🌐 ترجمهٔ کامل به فارسی";
      toast(e.message || "ترجمه نشد — دوباره تلاش کن");
    });
  }

  /* ---------- lazy translation of visible cards (fix untranslated news) ---------- */
  function updateCardFa(it) {
    var card = document.querySelector('[data-card="' + CSS.escape(it.id) + '"]');
    if (!card) return;
    var h3 = card.querySelector("h3");
    if (h3) h3.textContent = it.titleFa || it.title;
    var sum = card.querySelector(".cardsum");
    if (sum) {
      var t = it.summaryFa || it.descFa || "";
      if (t) sum.textContent = t;
    }
  }

  function lazyTranslateVisible() {
    if (state._lazyBusy) return;
    var items = visibleNews().filter(function (it) {
      return (!it.titleFa || (!it.descFa && it.desc && it.desc.length > 60)) && !it._transl;
    }).slice(0, 10);
    if (!items.length) return;
    state._lazyBusy = true;
    var chain = Promise.resolve();
    items.forEach(function (it) {
      it._transl = true;
      chain = chain.then(function () {
        var p = it.titleFa ? Promise.resolve() : translateText(it.title).then(function (fa) { if (fa) it.titleFa = fa; });
        return p.then(function () {
          var p2 = (!it.desc || it.descFa || it.desc.length <= 60) ? Promise.resolve()
            : translateText(it.desc).then(function (fa) { if (fa) it.descFa = fa; });
          return p2.then(function () {
            updateCardFa(it);
            persist();
            return new Promise(function (r) { setTimeout(r, 130); });
          });
        }).catch(function () { it._transl = false; });
      });
    });
    chain.then(function () { state._lazyBusy = false; });
  }

  /* ---------- assistant tab ---------- */
  function tokFa(n) {
    if (!n) return "۰";
    if (n >= 1000) return faDigits(String(Math.round(n / 100) / 10).replace(".", "٫")) + " هزار";
    return faDigits(n);
  }
  function engRow(key, title, sub, extraHtml) {
    var e = aiEng[key];
    var invalid = !!(e && e.invalid);
    var limited = aiLimited(key);
    var chip = invalid ? '<span class="kchip k-off">⛔ نامعتبر</span>'
      : limited ? '<span class="kchip k-default">🟡 محدود</span>'
      : '<span class="kchip k-personal">🟢 فعال</span>';
    var u = aiUsageDay()[key];
    var note = aiEngineNote(key);
    return '<div class="engrow">' +
      '<div class="enghead"><b>' + title + '</b>' + chip + '</div>' +
      '<p class="engsub">' + sub + ' · امروز: ' + faDigits(u.req) + ' درخواست · ~' + tokFa(u.tok) + ' توکن</p>' +
      (note ? '<p class="engnote">⚠ ' + esc(note) + '</p>' : '') +
      (extraHtml || '') + '</div>';
  }
  function keyBoxHtml() {
    var personal = (state.key || "").trim();
    var glmKey = (Store.get("pulse_glm_key", "") || "").trim();
    var html = '<div class="keybox">' +
      "<h3 style='margin:0 0 6px;font-size:14px'>🧠 موتورهای هوش مصنوعی اپ</h3>" +
      '<p style="margin:4px 0 10px">زنجیرهٔ هوش مصنوعی: اول <b>جمینی</b> با کلید پیشفرض داخلی؛ هر وقت سهمیه‌اش تمام یا نامعتبر شد، خودکار سراغ <b>GLM-4</b> و بعد موتور <b>رایگان</b> می‌رود. مصرف امروز هر موتور همین‌جا دیده می‌شود.</p>' +
      engRow("gemini", "۱. جمینی — موتور اصلی", personal ? "کلید شخصی تو" : "کلید پیشفرض داخلی",
        '<div class="keyrow"><button class="act" data-act="testkey">تست اتصال</button>' +
        (personal ? '<button class="act" data-act="forgetkey">حذف کلید شخصی</button>' : "") + '</div>' +
        (personal ? "" : '<details class="keydetail"><summary>کلید شخصی داری؟ وارد کن (اختیاری)</summary>' +
          '<input id="keyInput" type="password" placeholder="AIza… یا AQ…" autocomplete="off">' +
          '<button class="bigbtn" data-act="savekey" style="margin-top:6px">ذخیره کلید شخصی</button></details>')) +
      engRow("glm", "۲. GLM-4 — پشتیبان", glmKey ? "کلید شخصی تو (glm-4-flash)" : "بی‌کلید — بعد از جمینی فعال می‌شود؛ کلید رایگان از open.bigmodel.cn",
        '<div class="keyrow"><button class="act" data-act="testglmkey">بررسی اتصال</button>' +
        (glmKey ? '<button class="act" data-act="forgetglmkey">حذف کلید</button>' : "") + '</div>' +
        '<details class="keydetail"><summary>افزودن / تغییر کلید GLM-4</summary>' +
        '<input id="glmKeyInput" type="password" dir="ltr" placeholder="کلید bigmodel.cn را وارد کن" autocomplete="off">' +
        '<div class="keyrow" style="margin-top:6px"><button class="bigbtn" data-act="saveglmkey" style="margin-top:0">ذخیره کلید GLM-4</button>' +
        '<a class="act" data-act="extkey" href="https://open.bigmodel.cn/usercenter/apikeys">دریافت کلید رایگان ↗</a></div></details>') +
      engRow("free", "۳. موتور رایگان (Pollinations)", "بدون کلید — همیشه در دسترس · محدودیت: ۱ پاسخ در ۳۰ ثانیه", "") +
      '<div class="testResult" id="testResult">' + (state._testMsg ? esc(state._testMsg) : "") + "</div>" +
      "</div>";
    return html;
  }

  /* ---------- Bale auto-news panel ---------- */
  function baleStatusHtml() {
    var chats = bale.chats.length
      ? bale.chats.map(function (c) { return esc(c.title); }).join('، ')
      : 'چت خصوصی تو (حسین) از قبل وصل است — برای چت جدید یک پیام به ربات بده یا از تنظیمات پیشرفته اضافه کن';
    var rows = [
      '👥 چت‌های متصل: ' + chats,
      '📤 خبرهای ارسالی‌شده: ' + faDigits(bale.sends),
      '⏱ آخرین بررسی: ' + (bale.lastCheck ? timeAgoFa(new Date(bale.lastCheck).toISOString()) : 'هنوز — به‌محض باز شدن اپ شروع می‌شود')
    ];
    if (bale.lastErr) rows.push('⚠ ' + esc(bale.lastErr));
    return rows.map(function (r) { return '<p class="bstat">' + r + '</p>'; }).join('');
  }

  function renderBaleStatus() {
    var e = $('baleStatus');
    if (e) e.innerHTML = baleStatusHtml();
  }

  function baleBoxHtml() {
    var html = '<div class="keybox balebox">' +
      '<h3 style="margin:0 0 6px;font-size:14px">📡 ربات خبری بله — @aiautonewsbot</h3>' +
      '<p class="keystatus"><span class="kchip ' + (bale.on ? 'k-personal' : 'k-default') + '">' +
      (bale.on ? 'ارسال خودکار روشن است' : 'ارسال خودکار خاموش است') + '</span></p>' +
      '<p style="margin:4px 0 10px">تا وقتی اپ باز است، هر ' + faDigits(30) +
      ' ثانیه منابع خبری بررسی می‌شود و هر خبرِ جدید — با همان پست حرفه‌ای اپ (ترجمهٔ روان و خلاصه به سبک ادمین کانال‌های پرمخاطب)، لینک خبر برای مطالعهٔ کامل و عکس خبر — بدون زدن هیچ دکمه‌ای به ربات بله ارسال می‌شود.</p>' +
      '<div class="balestat" id="baleStatus">' + baleStatusHtml() + '</div>' +
      '<p class="bstat" id="autoStatus">' + autoStatusFa() + '</p>' +
      '<div class="keyrow">' +
      '<button class="act" data-act="baletoggle">' + (bale.on ? '⏸ خاموش کردن' : '▶ روشن کردن') + '</button>' +
      '<button class="act" data-act="autotoggle">' + (autoCyc.on ? '⏸ چرخهٔ نیم‌ساعت: روشن' : '▶ چرخهٔ نیم‌ساعت: خاموش') + '</button>' +
      '<button class="act" data-act="baledisc">👥 بررسی چت‌ها</button>' +
      '<button class="act" data-act="baletest">🧪 پیام آزمایشی</button>' +
      '</div>' +
      '<details class="keydetail"><summary>📺 راهنمای گام‌به‌گام: راه‌اندازی کانال بله با این ربات</summary>' +
      '<div class="guide">' +
      '<p class="gstep"><b>۱) کانال بساز:</b> در بله منوی جدید (+ یا قلم) → «کانال» را انتخاب کن؛ نام و توضیح بده. بعد در تنظیمات کانال گزینهٔ «نام کاربری» را فعال کن و یک آدرس عمومی بگذار (مثلاً @my_daily_ai). کانال عمومی باشد تا ربات و دنبال‌کننده‌ها راحت پیدایش کنند.</p>' +
      '<p class="gstep"><b>۲) ربات را ادمین کن:</b> وارد کانال → تنظیمات → «مدیران» → «افزودن مدیر» → در جست‌وجو بنویس <b dir="ltr">@aiautonewsbot</b> → حداقل دسترسی «ارسال پیام» (ترجیحاً «ویرایش پیام‌ها» هم) را تیک بزن و تأیید کن.</p>' +
      '<p class="gstep"><b>۳) کانال را به ربات معرفی کن:</b> در همین پنل، بخش «تنظیمات پیشرفتهٔ ربات» پایین، شناسهٔ کانال را وارد کن (<span dir="ltr">@my_daily_ai</span> یا عددی) و «➕ افزودن چت» را بزن. اگر موفق بود پیام «✓ چت اضافه شد» می‌بینی.</p>' +
      '<p class="gstep"><b>۴) کانال خصوصی است؟</b> شناسهٔ عددی لازم داری: یک پست از کانال را به <span dir="ltr">@aiautonewsbot</span> فوروارد کن، بعد «👥 بررسی چت‌ها» را بزن — شناسهٔ کانال خودکار پیدا و ذخیره می‌شود.</p>' +
      '<p class="gstep"><b>۵) تست نهایی:</b> «🧪 پیام آزمایشی» را بزن. اگر خلاصهٔ خبر با عکس در کانال منتشر شد، تمام است — از این به بعد هر ۳۰ ثانیه اخبار چک می‌شود و هر خبر جدید، بدون زدن هیچ دکمه‌ای، با خلاصهٔ کامل فارسی + لینک + عکس همان‌جا پست می‌شود.</p>' +
      '<p class="gnote">نکته: ربات فقط وقتی می‌تواند در کانال بنویسد که ادمین با دسترسی «ارسال پیام» باشد. برای اینکه کانال اسپم نشود، هر تیک حداکثر ۲ خبر و هر چرخهٔ نیم‌ساعت حداکثر ۶ خبر ارسال می‌شود.</p>' +
      '</div></details>' +
      '<details class="keydetail"><summary>تنظیمات پیشرفتهٔ ربات (کانال/گروه و توکن)</summary>' +
      '<p style="font-size:11.5px;margin:4px 0 6px">چت خصوصی تو از قبل وصل است. برای کانال یا گروه، ربات را ادمین کن و شناسهٔ آن را اینجا بده (عدد یا @نام‌کانال):</p>' +
      '<input id="baleChatId" type="text" dir="ltr" placeholder="@mychannel یا -100123456" autocomplete="off">' +
      '<div class="keyrow" style="margin-top:6px"><button class="act" data-act="baleadd">➕ افزودن چت</button>' +
      '<button class="act" data-act="balechatsreset">بازنشانی چت‌ها</button></div>' +
      '<input id="baleToken" type="password" style="margin-top:8px" placeholder="توکن فعلی ذخیره شده — برای تغییر، توکن جدید را بگذار" autocomplete="off">' +
      '<div class="keyrow" style="margin-top:6px"><button class="bigbtn" data-act="balesave" style="margin-top:0">ذخیره توکن جدید</button>' +
      '<button class="act" data-act="baleclear">پاک کردن تاریخچهٔ ارسال</button></div>' +
      '<p style="font-size:11px;opacity:.65;margin:6px 0 0">«پاک کردن تاریخچه» باعث می‌شود آخرین اخبار موجود دوباره ارسال شوند (هر تیک حداکثر ۲ خبر).</p>' +
      '</details>' +
      '<div class="testResult" id="baleTestResult">' + (state._baleTestMsg ? esc(state._baleTestMsg) : '') + '</div>' +
      '</div>';
    return html;
  }

  function runBaleDiscover(btn) {
    if (btn) { btn.textContent = 'در حال بررسی…'; btn.disabled = true; }
    baleDiscover().then(function (r) {
      if (r.added) toast('✓ ' + faDigits(r.added) + ' چت جدید به ربات وصل شد');
      else if (r.updates) toast('چت جدیدی نبود — چت‌های قبلی فعال‌اند');
      else toast('پیامی از کسی به ربات نرسیده — در بله به @aiautonewsbot پیام بده');
    }).catch(function (e) {
      toast(e.message || 'بررسی چت‌ها ممکن نشد');
    }).then(function () { render(); });
  }

  function baleTestMsg(m) {
    // keep the message in state so re-renders (auto ticks) don't wipe it
    state._baleTestMsg = m;
    var e = $('baleTestResult');
    if (e) e.textContent = m;
  }

  /* ---------- v3.9: engine + auto-cycle live status ---------- */
  function renderAutoStatus() {
    var e = $('autoStatus');
    if (e) e.textContent = autoStatusFa();
  }
  function renderEngineStatus() {
    // live chip refresh after engine cooldowns — only when safe to re-render
    if (state.tab !== "assistant" || state._widget || state._readerId) return;
    var a = document.activeElement;
    if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA")) return;
    render();
  }
  function runGlmTest() {
    state._testMsg = "در حال بررسی GLM-4…";
    var e = $('testResult');
    if (e) e.textContent = state._testMsg;
    glmTest().then(function (r) {
      state._testMsg = (r.ok ? "✓ " : "✕ ") + r.message;
      var e2 = $('testResult');
      if (e2) e2.textContent = state._testMsg;
      if (r.ok) aiClearEngine("glm");
    });
  }

  function runBaleTest() {
    baleTestMsg('…');
    var it = state.news[0];
    if (!it) { baleTestMsg('✕ هنوز خبری برای ارسال نیست — اول صبر کن اخبار بیاید'); return; }
    var prep = bale.chats.length ? Promise.resolve() : baleDiscover();
    prep.then(function () {
      if (!bale.chats.length) throw new Error('هیچ چتی ربات را استارت نزده — در بله به @aiautonewsbot پیام /start بده و دوباره امتحان کن');
      baleTestMsg('🤖 هوش مصنوعی در حال آماده‌سازی پست حرفه‌ای خبر (ترجمهٔ روان + خلاصهٔ ادمین‌گونه)…');
      return ensureBaleSummary(it).catch(function () { return ''; });
    }).then(function () {
      return baleSendItem(it, bale.chats);
    }).then(function (results) {
      var oks = results.filter(function (r) { return r.ok; });
      if (oks.length) {
        bale.sent[it.id] = Date.now();
        bale.sends++;
        persistBale();
        baleTestMsg('✓ پیام آزمایشی ارسال شد به: ' + oks.map(function (r) { return r.chat.title; }).join('، ') +
          (it.image ? ' — همراه عکس خبر ✓' : ' — بدون عکس (منبع عکس نداشت)'));
        renderBaleStatus();
        toast('✓ پیام آزمایشی به بله رفت');
      } else {
        baleTestMsg('✕ ' + ((results[0] && results[0].err) || 'ارسال آزمایشی نشد'));
      }
    }).catch(function (e) {
      baleTestMsg('✕ ' + (e.message || 'ارسال آزمایشی نشد'));
    });
  }

  function assistantView() {
    var html = keyBoxHtml();
    html += baleBoxHtml();
    var today = todayKey();
    var d = state.digests[today];
    html += '<div class="digest"><h4>خلاصهٔ امروز (' + faDigits(today.replace(/-/g, "/")) + ")</h4>";
    html += d
      ? '<div class="md">' + md(d.text) + "</div>"
      : '<p style="font-size:12.5px;color:var(--tx2)">هنوز خلاصهٔ امروز ساخته نشده. دستیار کل اخبار امروز را می‌خواند و خلاصه می‌سازد.</p>' +
        '<button class="bigbtn" data-act="makedigest" style="margin-top:6px">ساختن خلاصهٔ امروز</button>';
    html += "</div>";

    var dates = Object.keys(state.digests).sort().reverse().filter(function (k) { return k !== today; }).slice(0, 7);
    if (dates.length) {
      html += "<h3 style='font-size:13px;font-weight:800;margin:14px 0 8px'>خلاصهٔ روزهای قبل (حافظهٔ دستیار)</h3>";
      dates.forEach(function (k) {
        html += '<details class="old-digest"><summary><span>روز ' + faDigits(k.replace(/-/g, "/")) + "</span><span>▾</span></summary>" +
          '<div class="md">' + md(state.digests[k].text) + "</div></details>";
      });
    }

    html += chatHtml("");
    return html;
  }

  function chatHtml(suffix) {
    var html = '<h3 style="font-size:13px;font-weight:800;margin:16px 0 8px">پرسش از اخبار' + (suffix ? " (ویجت)" : "") + '</h3><div class="chatwrap">';
    html += '<div class="chatlist" id="chatlist' + suffix + '">';
    if (!state.chat.length) {
      html += '<div class="empty" style="padding:24px"><div class="big">💬</div>هر سؤالی از اخبار امروز و روزهای قبل داری بپرس — دستیار صفحهٔ فعلی را هم می‌بیند</div>';
    } else {
      state.chat.forEach(function (m) {
        html += '<div class="bub ' + (m.role === "user" ? "me" : "ai") + '">' + esc(m.text) + "</div>";
      });
    }
    html += "</div>";
    html += '<div class="sugg">' +
      '<button data-act="ask' + suffix + '" data-q="مهم‌ترین اخبار امروز چی بود؟">مهم‌ترین خبرهای امروز</button>' +
      '<button data-act="ask' + suffix + '" data-q="چه مدل یا ابزار رایگان جدیدی معرفی شده؟">مدل یا ابزار رایگان جدید</button>' +
      (state._readerId ? '<button data-act="ask' + suffix + '" data-q="این خبری که باز کردم را کامل و ساده‌تر برایم تحلیل کن">تحلیل خبرِ باز</button>' : '') +
      '<button data-act="ask' + suffix + '" data-q="درباره خبری که باز کردم بیشتر توضیح بده">دربارهٔ خبر باز‌شده توضیح بده</button>' +
      "</div>";
    html += '<div class="chatinput"><input id="chatInput' + suffix + '" placeholder="سؤالت را بنویس…"><button data-act="send' + suffix + '">ارسال</button></div></div>';
    return html;
  }

  /* ---------- floating widget (all pages) ---------- */
  function widgetChatHtml() {
    var rit = state._readerId ? findNews(state._readerId) : null;
    var sub = rit
      ? "متن کامل خبری که باز کرده‌ای («" + esc((rit.titleFa || rit.title).slice(0, 40)) + "…») همراه سؤالت به متخصص هوش مصنوعی ارسال می‌شود."
      : "زمینهٔ صفحهٔ فعلی («" + esc(TAB_FA[state.tab] || state.tab) + "») با هر سؤال ارسال می‌شود.";
    return '<div class="sheethead"><h2>🤖 دستیار هوشمند</h2><button class="xbtn" data-act="closesheet">✕</button></div>' +
      '<p style="font-size:11.5px;color:var(--tx2);margin:0 0 8px">' + sub + "</p>" +
      '<div class="testResult" id="wtestResult">' + (state._testMsg ? esc(state._testMsg) : "") + "</div>" +
      chatHtml("w");
  }

  /* ---------- about sheet ---------- */
  function aboutSheet() {
    var srcs = SOURCES.map(function (s) {
      return '<div class="srcitem"><span class="dot" style="background:' + s.color + '"></span>' + esc(s.name) + "</div>";
    }).join("");
    return '<div class="sheethead"><h2>درباره پالس هوش مصنوعی</h2><button class="xbtn" data-act="closesheet">✕</button></div>' +
      "<p>اپ کاملاً مستقل اندروید — اخبار هوش مصنوعی را مستقیماً از " + faDigits(SOURCES.length) + " منبع معتبر دنیا روی خود گوشی می‌گیرد و با ترجمهٔ گوگل به زبان ساده فارسی ارائه می‌کند.</p>" +
      "<h3>امکانات</h3>" +
      "<ol><li>خلاصهٔ چندسطریِ فارسی و روان روی هر کارت خبر — با لمس آن، متن اصلی انگلیسی و ترجمهٔ کامل فارسی</li>" +
      "<li>ترجمهٔ گوگل همهٔ اخبار به فارسی — اسم مدل‌ها، سایت‌ها و اصطلاحات تخصصی لاتین می‌ماند</li>" +
      "<li>«بازنشر حرفه‌ای»: هوش مصنوعی با نقش ادمین کانال‌های پرمخاطب، کل خبر را می‌خواند و پست آمادهٔ انتشار با ترجمهٔ روان فارسی می‌نویسد</li>" +
      "<li>دستیارِ متخصص هوش مصنوعی در همهٔ صفحات — حین خواندن متن کامل، سؤالت همراه همان متن برای متخصص ارسال و تحلیل می‌شود</li>" +
      "<li>ربات خبری بله: هر " + faDigits(30) + " ثانیه اخبار بررسی و هر خبر جدید با فرمت حرفه‌ای «منبع ← لب کلام ← لینک» و عکس، خودکار به @aiautonewsbot ارسال می‌شود + راهنمای کامل راه‌اندازی کانال بله داخل اپ</li>" +
      "<li>کاتالوگ AIهای رایگان: معتبرترین APIها، سایت‌ها و ابزارهای رایگان دنیای هوش مصنوعی — دسته‌بندی‌شده و رتبه‌بندی‌شده با توضیح قابلیت‌ها</li>" +
      "<li>بروزرسانی هوشمند روزانهٔ کاتالوگ: هر روز هوش مصنوعی لیست را با تازه‌ترین وضعیت دنیای AI چک می‌کند — منبع تازه اضافه، اطلاعات کهنه اصلاح و منبع غیرفعال جدا می‌شود</li>" +
      "<li>اسپیس‌های ترند هاگینگ فیس: اجرای مستقیم داخل اپ + راهنمای کامل هوش مصنوعی (چیست، قابلیت‌ها، چطور استفاده کنم، محدودیت‌ها) + متن اصلی README</li>" +
      "<li>فیلترهای اسپیس‌ها: ترندترین اسپیس‌های بدون سانسور، تولید ویدیو، تولید تصویر، صدا و موسیقی، چت و LLM</li>" +
      "<li>ذخیرهٔ خروجی‌های اسپیس: هر عکس، ویدیو یا صدایی که داخل اسپیس ساخته شود را می‌توانی بدون لاگین مستقیم در Downloads گوشی ذخیره کنی</li>" +
      "<li>آموزش سادهٔ هر منبع کاتالوگ AI رایگان: چیست، شروع سریع، چه چیزهایی رایگان است، محدودیت‌ها و ترفند</li>" +
      "<li>زنجیرهٔ موتورهای هوش مصنوعی: جمینی با کلید پیشفرض داخلی ← GLM-4 ← موتور رایگان؛ مدیریت کلید و نمایش مصرف امروز در تب دستیار</li>" +
      "<li>چرخهٔ خودکار نیم‌ساعت: دریافت آخرین اخبار، ترجمه، لب کلام و ارسال به ربات بله — دقیقاً با همان فرمت ربات ابری نسخهٔ ۴.۰</li></ol>" +
      "<h3>منابع خبری</h3>" +
      '<div class="srcgrid">' + srcs + "</div>" +
      '<p style="margin-top:14px;opacity:.6">نسخه ' + faDigits("4.0") + " · داده‌ها فقط روی گوشی شما ذخیره می‌شود</p>";
  }

  /* ---------- space AI sheet ---------- */
  function spaceAiSheet(sp) {
    var head = '<div class="sheethead"><h2>' + (sp.emoji || "🚀") + " " + esc((sp.titleFa || sp.name).length > 44 ? (sp.titleFa || sp.name).slice(0, 44) + "…" : (sp.titleFa || sp.name)) + '</h2><button class="xbtn" data-act="closesheet">✕</button></div>' +
      '<p class="rmeta">🤗 هاگینگ فیس · ساخته ' + esc(sp.author) + " · ❤ " + faDigits(sp.likes) + " · " + esc(sp.sdk) + "</p>";
    var ai = '<div class="simplebox"><h4>🤖 این اسپیس چیست و چه قابلیت‌هایی دارد؟</h4><div id="spaceAiBox">' +
      (sp.aiFa ? md(sp.aiFa) : '<span class="muted">🤖 هوش مصنوعی در حال خواندن متن اسپیس…</span>') + "</div></div>";
    var btns = '<div class="keyrow">' +
      '<button class="act" data-act="spaceraw">📄 متن اصلی اسپیس (EN)</button>' +
      '<button class="act" data-act="runspace" data-id="' + esc(sp.sid) + '">🚀 اجرا داخل اپ</button>' +
      '<button class="act" data-act="spaceaifresh">🔄 راهنمای تازه</button>' +
      '</div><div class="rnote" id="spaceAiNote"></div>' +
      '<div class="fulltext en' + (state._spaceRaw ? "" : " hidden") + '" id="spaceRaw">' + esc(sp.readme || "") + "</div>" +
      '<a class="bigbtn" style="text-decoration:none" data-act="open" href="' + esc(sp.url) + '">صفحهٔ اسپیس در هاگینگ فیس ↗</a>';
    return head + ai + btns;
  }

  function sAiNote(m) { var e = $("spaceAiNote"); if (e) e.textContent = m || ""; }
  function sAiBox(html) { var e = $("spaceAiBox"); if (e) e.innerHTML = html; }

  function openSpaceAi(id) {
    var sp = findSpace(id);
    if (!sp) return;
    state._spaceAiId = id;
    state._spaceRaw = false;
    openSheet(spaceAiSheet(sp));
    ensureSpaceAi(sp, false);
  }

  function ensureSpaceAi(sp, force) {
    if (state._spaceAiBusy === sp.sid) return;
    state._spaceAiBusy = sp.sid;
    var sidAtStart = sp.sid;
    if (sp.aiFa && !force) { sAiBox(md(sp.aiFa)); state._spaceAiBusy = ""; return; }
    sAiBox('<span class="muted">🤖 هوش مصنوعی در حال خواندن متن اسپیس…</span>');
    spaceAiExplain(sp, sAiNote).then(function (txt) {
      if (state._spaceAiId !== sidAtStart) return; // sheet switched — don't write foreign text
      sAiBox(md(txt));
      sAiNote("");
      state._spaceAiBusy = "";
    }).catch(function (e) {
      if (state._spaceAiId !== sidAtStart) return;
      sAiBox('<span class="muted">✕ ' + esc(e.message || "توضیح این اسپیس ممکن نشد") + "</span>" +
        '<button class="act" data-act="spaceretry" style="margin-top:8px">تلاش دوباره</button>');
      sAiNote("");
      state._spaceAiBusy = "";
    });
  }

  function toggleSpaceRaw() {
    var sp = findSpace(state._spaceAiId);
    var e = $("spaceRaw");
    var btn = document.querySelector('[data-act="spaceraw"]');
    if (!sp || !e) return;
    if (!state._spaceRaw && !(sp.readme && sp.readme.length > 60)) {
      if (btn) { btn.textContent = "در حال دریافت متن…"; btn.disabled = true; }
      fetchSpaceReadme(sp).then(function () {
        if (btn) { btn.textContent = "نمایش توضیح هوش مصنوعی"; btn.disabled = false; }
        state._spaceRaw = true;
        e.textContent = sp.readme;
        e.classList.remove("hidden");
      }).catch(function (err) {
        if (btn) { btn.textContent = "📄 متن اصلی اسپیس (EN)"; btn.disabled = false; }
        sAiNote(err.message || "متن اصلی در دسترس نیست");
      });
      return;
    }
    state._spaceRaw = !state._spaceRaw;
    if (btn) btn.textContent = state._spaceRaw ? "نمایش توضیح هوش مصنوعی" : "📄 متن اصلی اسپیس (EN)";
    if (state._spaceRaw) e.textContent = sp.readme || "";
    e.classList.toggle("hidden", !state._spaceRaw);
  }

  /* ---------- space runner sheet ---------- */
  function runSpaceSheet(sp) {
    var aiLine = sp.aiFa
      ? '<div class="simplebox" style="margin:0 0 10px"><h4>🤖 این اسپیس چه می‌کند؟</h4><div class="md">' + md(sp.aiFa) + "</div></div>"
      : "";
    return '<div class="sheethead"><h2>' + (sp.emoji || "🚀") + " " + esc(sp.titleFa || sp.name) + "</h2>" +
      '<button class="xbtn" data-act="closesheet">✕</button></div>' +
      aiLine +
      '<p>اسپیس زندهٔ هاگینگ فیس — ممکن است بار اول چند ثانیه طول بکشد.</p>' +
      '<div class="spacerun"><iframe src="' + esc(sp.embed) + '" allow="clipboard-write; microphone" sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"></iframe></div>' +
      '<div class="keyrow"><button class="act" data-act="resmedia">💾 خروجی‌های ساخته‌شده در این اسپیس</button>' +
      '<button class="act" data-act="spaceai" data-id="' + esc(sp.sid) + '">🤖 آموزش و قابلیت‌ها</button></div>' +
      '<div id="mediaBox"></div>' +
      '<a class="bigbtn" href="' + esc(sp.embed || sp.url) + '" style="text-decoration:none">باز کردن تمام‌صفحه در مرورگر ↗</a>';
  }

  /* ---------- free AI resources tab (v3.5) + smart daily update (v3.6) ---------- */
  var RES_BADGE_MS = 3 * 86400000;
  function resCard(x, gone) {
    var now = Date.now();
    var medal = !gone && x.rank <= 3 ? '<span class="rankmedal">' + ["🥇", "🥈", "🥉"][x.rank - 1] + "</span>" : "";
    var bNew = x._new && now - x._new < RES_BADGE_MS ? '<span class="resb rb-new">جدید</span>' : "";
    var bUpd = !bNew && x._upd && now - x._upd < RES_BADGE_MS ? '<span class="resb rb-upd">بروزرسانی شد</span>' : "";
    var tag = x.tag ? '<span class="restag">' + esc(x.tag) + "</span>" : "";
    return '<article class="card rescard' + (gone ? " resgone" : "") + '">' +
      '<div class="reshead"><span class="reslogo" style="background:' + x.color + '26;border-color:' + x.color + '66">' + x.emoji + "</span>" +
      '<div class="restitle"><h4>' + medal + esc(x.name) + bNew + bUpd + "</h4>" +
      '<span class="reshost" dir="ltr">' + esc(x.host) + "</span></div>" + tag + "</div>" +
      '<p class="resdesc">' + esc(x.fa) + "</p>" +
      '<div class="reslinks">' +
      '<a href="' + esc(x.site) + '">وب‌سایت ↗</a>' +
      (x.api ? '<a class="resprim" href="' + esc(x.api) + '">' + esc(x.apilabel || "کلید رایگان") + " ↗</a>" : "") +
      '<button class="act" data-act="resguide" data-key="' + esc(x.key) + '">📘 آموزش و محدودیت‌ها</button>' +
      "</div></article>";
  }

  function resAliveCount() { return RES.items.filter(function (x) { return !x._gone; }).length; }
  function resNewCount() {
    var now = Date.now();
    return RES.items.filter(function (x) { return x._new && now - x._new < RES_BADGE_MS && !x._gone; }).length;
  }

  function resStatusHtml() {
    var line;
    if (RES.busy) line = RES.note || "هوش مصنوعی دارد کاتالوگ را با تازه‌ترین وضعیت دنیای AI مقایسه می‌کند…";
    else if (RES.err) line = "⚠ " + RES.err + " — دوباره تلاش کن";
    else if (RES.t) {
      line = "آخرین بررسی هوشمند: " + timeAgoFa(new Date(RES.t).toISOString()) +
        " · " + faDigits(resAliveCount()) + " منبع فعال" +
        (resNewCount() ? " · " + faDigits(resNewCount()) + " منبع تازه 🌱" : "");
    } else line = "کاتالوگ پایهٔ سردبیری — از اولین بروزرسانی به بعد، هر روز هوش مصنوعی این لیست را چک و تازه می‌کند؛ همین حالا هم می‌توانی امتحان کنی";
    return '<div class="resstatus"><div class="resstat"><b>🤖 بروزرسانی هوشمند روزانه</b>' +
      '<span id="resStatLine">' + esc(line) + "</span></div>" +
      '<button class="resupd' + (RES.busy ? " busy" : "") + '" data-act="resupdate">' +
      (RES.busy ? "⏳ در حال بروزرسانی…" : "🔄 بروزرسانی هوشمند") + "</button></div>";
  }

  /* نمایش زندهٔ پیشرفت بدون رندر کامل */
  function resTick(m) {
    var el = $("resStatLine");
    if (el) el.textContent = m || RES.note || "…";
    var btn = document.querySelector(".resupd");
    if (btn && RES.busy) { btn.classList.add("busy"); btn.textContent = "⏳ در حال بروزرسانی…"; }
  }

  function resFinished(err, added) {
    if (state.tab === "res") render();
    if (err) toast("⚠ بروزرسانی کاتالوگ: " + err);
    else toast("💎 کاتالوگ AIهای رایگان تازه شد" + (added ? " — " + faDigits(added) + " منبع تازه" : ""));
  }

  /* محرک خودکار روزانه: یک‌بار در هر روز تقویمی (تهران) */
  function maybeAutoRes() {
    if (!resDue()) return;
    RES._triggered = true;
    resUpdate(false).catch(function () {});
  }

  /* ---------- v3.7: راهنمای آموزشی هر منبع کاتالوگ ---------- */
  function resGuideSheet(x) {
    var cached = Store.get("pulse_res_guide_" + x.key, "");
    return '<div class="sheethead"><h2>📘 آموزش ' + esc(x.name) + '</h2><button class="xbtn" data-act="closesheet">✕</button></div>' +
      '<p class="rmeta" dir="ltr">' + esc(x.host) + "</p>" +
      '<div class="simplebox"><h4>🎓 آموزش کامل و مختصر به زبان ساده</h4><div id="resGuideBox">' +
      (cached ? md(cached) : '<span class="muted">🤖 در حال ساختن آموزش سادهٔ فارسی… (تا یک دقیقه)</span>') + "</div></div>" +
      '<div class="rnote" id="resGuideNote"></div>';
  }

  function openResGuide(key) {
    var x = RES.byKey[key];
    if (!x) return;
    state._resGuideId = key;
    openSheet(resGuideSheet(x));
    if (Store.get("pulse_res_guide_" + key, "")) return;
    ensureResGuide(x);
  }

  function ensureResGuide(x) {
    if (state._resGuideBusy === x.key) return;
    state._resGuideBusy = x.key;
    function note(m) { var e = $("resGuideNote"); if (e) e.textContent = m || ""; }
    resGuideText(x.key).then(function (t) {
      if (state._resGuideId !== x.key) return;
      var b = $("resGuideBox");
      if (b) b.innerHTML = md(t);
      note("");
      state._resGuideBusy = "";
    }).catch(function (err) {
      if (state._resGuideId !== x.key) return;
      var b = $("resGuideBox");
      if (b) b.innerHTML = '<span class="muted">✕ ' + esc(err.message || "ساخت آموزش ممکن نشد") + "</span>" +
        '<button class="act" data-act="resguideretry" style="margin-top:8px">تلاش دوباره</button>';
      note("");
      state._resGuideBusy = "";
    });
  }

  /* ---------- v3.7: فیلترهای اسپیس‌ها ---------- */
  function setSpaceFilter(key) {
    if (state.spaceFilter === key && (state.spaces.length || state.spacesCache[key])) return;
    state.spaceFilter = key;
    state.spaces = state.spacesCache[key] || [];
    Store.set("pulse_space_filter", key);
    render();
    window.scrollTo({ top: 0 });
    if (!state.spacesCache[key]) {
      refreshSpaces(key).then(function () { render(); }).catch(function () {
        toast("دریافت اسپیس‌ها ممکن نشد — دوباره تلاش کن");
        render();
      });
    }
  }

  /* ---------- v3.7: گالری خروجی‌های اسپیس + ذخیره بدون لاگین ---------- */
  function showSpaceMedia() {
    var sp = findSpace(state._runId);
    var box = $("mediaBox");
    if (!sp || !box) return;
    var embedHost = "";
    try { embedHost = new URL(sp.embed || sp.url || "").host; } catch (e) {}
    var mine = MediaSaver.recent().filter(function (m) {
      try {
        var h = new URL(m.url).host;
        return embedHost ? h === embedHost : h.indexOf("hf.space") >= 0;
      } catch (e) { return false; }
    }).reverse();
    if (!mine.length) {
      box.innerHTML = '<div class="mediasempty">هنوز خروجی‌ای ثبت نشده — داخل اسپیس یک عکس، ویدیو یا صدا بساز و دوباره این دکمه را بزن. خروجی‌ها بدون لاگین و مستقیم در گوشی ذخیره می‌شوند.</div>';
      return;
    }
    var slug = String(sp.name || "space").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 28) || "space";
    box.innerHTML = '<div class="mediagrid">' + mine.map(function (m, i) {
      var u = esc(m.url);
      var em = (m.url.match(/\.(png|jpe?g|webp|gif|mp4|webm|mov|m4a|wav|mp3|ogg|flac)(\?|$)/i) || [])[1] || "";
      var name = "AIPulse-" + slug + "-" + (i + 1);
      var prev;
      if (/^(png|jpe?g|webp|gif)$/i.test(em)) prev = '<img class="mthumb" loading="lazy" src="' + u + '" onerror="this.style.display=\'none\'">';
      else if (/^(mp4|webm|mov)$/i.test(em)) prev = '<video class="mthumb" controls preload="metadata" src="' + u + '"></video>';
      else if (/^(m4a|wav|mp3|ogg|flac)$/i.test(em)) prev = '<audio controls preload="metadata" src="' + u + '" style="width:100%"></audio>';
      else prev = '<div class="mthumb mfile">📎 فایل رسانه‌ای</div>';
      return '<div class="mcard">' + prev +
        '<button class="act msave" data-act="savemedia" data-url="' + u + '" data-name="' + esc(name) + '">⬇ ذخیره</button></div>';
    }).join("") + '</div><div class="mediahint">فایل‌ها در پوشهٔ Downloads گوشی ذخیره می‌شوند — بدون نیاز به لاگین.</div>';
  }

  function resView() {
    var intro = '<div class="keybox resintro"><h3 style="margin:0 0 6px;font-size:14px">💎 منابع رایگان و قدرتمند هوش مصنوعی</h3>' +
      '<p style="margin:4px 0 0">معتبرترین سایت‌ها، APIها و ابزارهای رایگان دنیای AI — دسته‌بندی‌شده و در هر دسته از قدرتمندترین به پایین مرتب شده. لینک‌ها در مرورگر باز می‌شوند؛ سهمیه‌های رایگان ممکن است به‌مرور تغییر کنند.</p></div>';
    var strip = '<div class="toppicks"><span class="tplabel">🏆 برترین‌ها</span>' +
      RES.top.map(function (k) {
        var it = RES.byKey[k];
        return it ? '<a class="pick" href="' + esc(it.site) + '">' + it.emoji + " " + esc(it.name) + "</a>" : "";
      }).join("") + "</div>";
    var chips = '<div class="reschips">' +
      '<button class="chip' + (state._resCat === "all" ? " on" : "") + '" data-act="rescat" data-key="all">همه</button>' +
      FREE_AI_CATS.map(function (c) {
        return '<button class="chip' + (state._resCat === c.key ? " on" : "") + '" data-act="rescat" data-key="' + c.key + '">' + c.emoji + " " + c.label + "</button>";
      }).join("") + "</div>";
    var sections = "";
    FREE_AI_CATS.forEach(function (c) {
      if (state._resCat !== "all" && state._resCat !== c.key) return;
      var items = RES.items.filter(function (x) { return x.cat === c.key && !x._gone; })
        .sort(function (a, b) { return a.rank - b.rank; });
      sections += '<h3 class="rescat" style="color:' + c.color + '">' + c.emoji + " " + c.label + "</h3>" +
        '<p class="resnote">' + c.note + "</p>" +
        items.map(function (x) { return resCard(x, false); }).join("");
    });
    var gone = RES.items.filter(function (x) { return x._gone; });
    if (gone.length) {
      sections += '<h3 class="rescatgone">⚠ ممکن است دیگر رایگان یا فعال نباشند</h3>' +
        '<p class="resnote">در آخرین بررسی هوشمند پیدا نشدند — اگر دوباره تأیید شوند به لیست اصلی برمی‌گردند.</p>' +
        gone.map(function (x) { return resCard(x, true); }).join("");
    }
    return intro + resStatusHtml() + strip + chips + sections;
  }

  /* ---------- render ---------- */
  function render() {
    // tabs
    $("tabs").innerHTML = TABS.map(function (t) {
      return '<button class="tab' + (state.tab === t.key ? " on" : "") + '" data-act="tab" data-key="' + t.key + '">' + t.label + "</button>";
    }).join("");
    // chips
    var chipsBox = $("chips");
    if (state.tab === "latest" || state.tab === "trending" || state.tab === "free") {
      chipsBox.classList.remove("hidden");
      chipsBox.innerHTML = '<button class="chip' + (state.cat === "all" ? " on" : "") + '" data-act="cat" data-key="all">همه</button>' +
        CATEGORIES.map(function (c) {
          return '<button class="chip' + (state.cat === c.key ? " on" : "") + '" data-act="cat" data-key="' + c.key + '">' + c.emoji + " " + c.label + "</button>";
        }).join("");
    } else {
      chipsBox.classList.add("hidden");
    }
    // nav
    $("bottomnav").innerHTML = NAV.map(function (n) {
      return '<button class="navbtn' + (state.tab === n.key ? " on" : "") + '" data-act="nav" data-key="' + n.key + '">' +
        '<span class="ni">' + n.icon + "</span>" + n.label + "</button>";
    }).join("");
    // list
    var fab = $("fab");
    if (fab) fab.classList.toggle("hidden", state.tab === "assistant");
    var box = $("list");
    if (state.tab === "assistant") {
      box.innerHTML = assistantView();
      scrollChat();
      return;
    }
    if (state.tab === "spaces") {
      var sf = SPACE_FILTERS.find(function (x) { return x.key === state.spaceFilter; }) || SPACE_FILTERS[0];
      var chips = '<div class="reschips spchips">' + SPACE_FILTERS.map(function (f) {
        return '<button class="chip' + (state.spaceFilter === f.key ? " on" : "") + '" data-act="spfilter" data-key="' + f.key + '">' + f.emoji + " " + f.label + "</button>";
      }).join("") + "</div>";
      if (!state.spaces.length) {
        box.innerHTML = chips + (state.refreshing ? skeletons(4)
          : emptyBox("🚀", state.spaceFilter !== "all"
            ? "برای فیلتر «" + sf.label + "» فعلاً اسپیس ترندی پیدا نشد — فیلتر دیگری را امتحان کن"
            : "هنوز اسپیس‌ها را نگرفته‌ایم — با اتصال اینترنت دوباره تلاش می‌کنیم"));
      } else {
        box.innerHTML = chips + state.spaces.map(function (sp, i) { return spaceCard(sp, i + 1); }).join("");
      }
      return;
    }
    if (state.tab === "res") {
      box.innerHTML = resView();
      return;
    }
    var items = visibleNews();
    if (!items.length) {
      box.innerHTML = state.refreshing ? skeletons(4)
        : emptyBox("📰", state.news.length ? "در این دسته خبری نیست" : "برای اولین بار به اینترنت وصل باش تا اخبار بیاید");
      return;
    }
    var rankBase = state.tab === "trending";
    box.innerHTML = items.map(function (it, i) { return newsCard(it, rankBase ? i + 1 : 0); }).join("");
    lazyTranslateVisible();
  }

  function skeletons(n) {
    var s = "";
    for (var i = 0; i < n; i++) s += '<div class="skeleton"></div>';
    return s;
  }

  function emptyBox(icon, msg) {
    return '<div class="empty"><div class="big">' + icon + "</div>" + esc(msg) + "</div>";
  }

  function scrollChat() {
    var c = $("chatlist");
    if (c) c.scrollTop = c.scrollHeight;
  }

  /* ---------- refresh bar ---------- */
  function refreshOn() { $("refreshbar").classList.remove("hidden"); refreshMsg("در حال دریافت تازه‌ها…"); }
  function refreshOff() { $("refreshbar").classList.add("hidden"); }
  function refreshMsg(m) { var e = $("refreshmsg"); if (e) e.textContent = m; }

  /* ---------- sheet ---------- */
  function openSheet(html) {
    $("sheet").innerHTML = html;
    $("sheetwrap").classList.remove("hidden");
  }
  function closeSheet() {
    var wasWidget = state._widget;
    $("sheetwrap").classList.add("hidden");
    state._widget = false;
    if (wasWidget && state._readerId) {
      // the assistant was opened over the full-text reader — give the article back
      var rit = findNews(state._readerId);
      if (rit) {
        openSheet(readerSheet(rit));
        if (rit.fullEn && rit.fullEn.length > 200) rFull();
        ensureReaderContent(rit);
        return;
      }
    }
    state._readerId = "";
  }

  /* ---------- actions ---------- */
  function findNews(id) { return state.news.find(function (x) { return x.id === id; }); }
  function findSpace(id) { return state.spaces.find(function (x) { return x.sid === id; }); }

  function makeDigest() {
    var today = todayKey();
    var recent = state.news.filter(function (it) {
      return (Date.now() - new Date(it.publishedAt).getTime()) < 48 * 3600000;
    }).slice(0, 40);
    if (!recent.length) { toast("خبری برای خلاصه‌سازی نیست — اول بروزرسانی کن"); return; }
    toast("دستیار در حال خواندن " + faDigits(recent.length) + " خبر…");
    var input = recent.map(function (it, i) {
      return (i + 1) + ". " + (it.titleFa || it.title) + (it.summaryFa ? " | " + it.summaryFa : "");
    }).join("\n");
    var sys = "تو دستیار خبری اپ «پالس هوش مصنوعی» هستی. خلاصهٔ روز اخبار را با این قالب بده: ابتدا «تصویر کلی» (۲-۳ جمله)، سپس «مهمترین خبرها» (۴-۶ مورد با بولد)، در پایان «برای تو چه معنی دارد» (۲-۳ جمله کاربردی). حداکثر ۲۵۰ کلمه، زبان ساده و محاوره‌ای فارسی. فقط بر اساس اخبار داده‌شده — هیچ خبری از خودت نساز.";
    return aiText(sys, input, function (m) { toast(m); }).then(function (text) {
      state.digests[today] = { date: today, text: text, count: recent.length };
      persist();
      render();
      toast("خلاصهٔ امروز آماده شد");
    }).catch(function (e) { toast(e.message || "ساخت خلاصه ناموفق بود"); });
  }

  function sendChat(q, from) {
    q = (q || "").trim();
    if (!q) return;
    var suffix = from === "widget" ? "w" : "";
    state.chat.push({ role: "user", text: q });
    state.chat.push({ role: "ai", text: "…" });
    render();
    if (from === "widget") refreshWidget(); else scrollChat();

    var mem = Object.keys(state.digests).sort().reverse().slice(0, 5)
      .map(function (k) { return "خلاصه روز " + k + ": " + state.digests[k].text; }).join("\n\n");
    var items = state.news.slice(0, 30).map(function (it, i) {
      return (i + 1) + ". " + (it.titleFa || it.title) + (it.summaryFa ? " — " + it.summaryFa : "");
    }).join("\n");
    var hist = state.chat.slice(-15, -1).map(function (m) { return (m.role === "user" ? "کاربر: " : "دستیار: ") + m.text; }).join("\n");
    var pageCtx = getPageContext();
    var sys = "تو «متخصص هوش مصنوعی» اپ «پالس هوش مصنوعی» هستی — کارشناسی حرفه‌ای و باتجربه در حوزهٔ AI که اخبار آن را دنبال می‌کند؛ لحن متخصصانه، دقیق و مطمئن، اما ساده و قابل فهم. فقط بر اساس داده‌های زیر جواب می‌دهی و اگر چیزی در داده‌ها نبود صادقانه می‌گویی. برای هر خبری که به آن ارجاع می‌دهی شماره‌اش را مثل [۳] بیاور. زبان فارسی روان؛ اسم مدل‌ها، شرکت‌ها و اصطلاحات تخصصی لاتین بماند.\n" +
      "اگر «متن کامل خبرِ باز» برایت فرستاده شده: اول کل آن متن را بخوان و درک کن، بعد سؤال کاربر را جواب بده؛ جواب در راستای همان متن باشد — توضیح، تحلیل و نکته‌هایی که از متن برمی‌آید — حداکثر ۲۵۰ کلمه. اگر سؤال کمی خارج از متن بود، به‌عنوان متخصص از دانش تخصصی‌ات کمک بگیر ولی مشخص کن چه چیزی از متن است و چه چیزی دانش عمومی. در غیر این صورت حداکثر ۱۲۰ کلمه.\n\n" +
      "صفحهٔ فعلی کاربر (سؤالش دربارهٔ همین زمینه است):\n" + pageCtx + "\n\nخلاصهٔ روزهای قبل:\n" + (mem || "ندارم") + "\n\nاخبار اخیر:\n" + items + (hist ? "\n\nگفتگوی قبلی:\n" + hist : "");
    state.chat.pop();
    var bubNote = function (m) {
      var list = $(from === "widget" ? "chatlistw" : "chatlist");
      if (!list) return;
      var last = list.querySelector(".bub.ai:last-child");
      if (last && last.textContent === "…") last.textContent = m;
    };
    aiText(sys, q, bubNote).then(function (ans) {
      state.chat.push({ role: "ai", text: ans });
      persist();
      if (from === "widget") { refreshWidget(); } else { render(); scrollChat(); }
    }).catch(function (e) {
      state.chat.push({ role: "ai", text: e.message || "اتصال به جمینی ممکن نشد" });
      persist();
      if (from === "widget") { refreshWidget(); } else { render(); scrollChat(); }
    });
  }

  function refreshWidget() {
    if (!state._widget) return;
    openSheet(widgetChatHtml());
    var c = $("chatlistw");
    if (c) c.scrollTop = c.scrollHeight;
  }

  function runKeyTest() {
    document.querySelectorAll(".testResult").forEach(function (b) { b.textContent = "در حال تست اتصال…"; });
    geminiTest().then(function (r) {
      state._testMsg = (r.ok ? "✓ " : "✕ ") + r.message;
      document.querySelectorAll(".testResult").forEach(function (b) {
        b.textContent = state._testMsg;
        b.classList.toggle("tok", r.ok);
        b.classList.toggle("tfail", !r.ok);
      });
      if (!r.ok && usingDefaultKey()) toast("کلید پیشفرض منقضی شده — کلید شخصی رایگان بگیر");
    });
  }

  function shareItem(id) {
    var it = findNews(id);
    if (!it) return;
    var text = (it.titleFa || it.title) + "\n" + it.link;
    if (navigator.share) {
      navigator.share({ title: it.titleFa || it.title, text: text }).catch(function () {});
    } else {
      var ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast("کپی شد"); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  function bindActions() {
    document.body.addEventListener("click", function (ev) {
      var el = ev.target.closest("[data-act]");
      if (!el) return;
      var act = el.getAttribute("data-act");
      var id = el.getAttribute("data-id");
      if (act === "tab" || act === "nav") {
        var key = el.getAttribute("data-key");
        if (key === "about") { openSheet(aboutSheet()); return; }
        state.tab = key;
        if (key === "assistant" && !state.digests[todayKey()] && state.news.length) makeDigest();
        if (key === "res") maybeAutoRes();
        render();
        window.scrollTo({ top: 0 });
      } else if (act === "cat") {
        state.cat = el.getAttribute("data-key");
        render();
      } else if (act === "rescat") {
        state._resCat = el.getAttribute("data-key");
        render();
        window.scrollTo({ top: 0 });
      } else if (act === "resupdate") {
        if (RES.busy) return;
        resUpdate(true).catch(function () {});
      } else if (act === "share") {
        shareItem(id);
      } else if (act === "runspace") {
        var sp = findSpace(id);
        if (sp) { state._runId = sp.sid; openSheet(runSpaceSheet(sp)); }
      } else if (act === "spfilter") {
        setSpaceFilter(el.getAttribute("data-key"));
      } else if (act === "resguide") {
        openResGuide(el.getAttribute("data-key"));
      } else if (act === "resguideretry") {
        var gx = RES.byKey[state._resGuideId];
        if (gx) ensureResGuide(gx);
      } else if (act === "resmedia") {
        showSpaceMedia();
      } else if (act === "savemedia") {
        var murl = el.getAttribute("data-url"), mname = el.getAttribute("data-name");
        el.disabled = true;
        el.textContent = "در حال ذخیره…";
        MediaSaver.save(murl, mname).then(function (path) {
          toast("✓ ذخیره شد: " + path);
          el.textContent = "✓ ذخیره شد";
        }).catch(function (e) {
          toast("✕ " + (e.message || "ذخیره ممکن نشد"));
          el.disabled = false;
          el.textContent = "⬇ ذخیره";
        });
      } else if (act === "spaceaifresh") {
        var fs = findSpace(state._spaceAiId);
        if (fs) {
          var sbx = $("spaceAiBox");
          if (sbx) sbx.innerHTML = '<span class="muted">🤖 در حال ساخت راهنمای تازه با بخش‌های آموزش و محدودیت‌ها…</span>';
          ensureSpaceAi(fs, true);
        }
      } else if (act === "spaceai") {
        openSpaceAi(id);
      } else if (act === "spaceretry") {
        var srp = findSpace(state._spaceAiId);
        if (srp) ensureSpaceAi(srp, false);
      } else if (act === "spaceraw") {
        toggleSpaceRaw();
      } else if (act === "reader") {
        openReader(id);
      } else if (act === "fullfa") {
        startFullFa();
      } else if (act === "togglefull") {
        state._readerEn = !state._readerEn;
        el.textContent = state._readerEn ? "نمایش ترجمهٔ فارسی" : "نمایش متن اصلی (EN)";
        rFull();
      } else if (act === "closesheet") {
        closeSheet();
      } else if (act === "savekey") {
        var v = ($("keyInput") || {}).value || "";
        if (v.trim().length < 20) { toast("کلید را کامل وارد کنید"); return; }
        state.key = v.trim();
        aiClearEngine("gemini");
        persist();
        toast("کلید شخصی ذخیره شد");
        makeDigest();
        render();
      } else if (act === "forgetkey") {
        state.key = "";
        aiClearEngine("gemini");
        persist();
        toast("کلید شخصی حذف شد — کلید پیشفرض فعال است");
        render();
      } else if (act === "testkey") {
        runKeyTest();
      } else if (act === "saveglmkey") {
        var gv = ($("glmKeyInput") || {}).value || "";
        if (gv.trim().length < 10) { toast("کلید GLM را کامل وارد کن"); return; }
        Store.set("pulse_glm_key", gv.trim());
        aiClearEngine("glm");
        toast("کلید GLM-4 ذخیره شد — پشتیبان جمینی فعال شد");
        render();
      } else if (act === "forgetglmkey") {
        Store.del("pulse_glm_key");
        aiClearEngine("glm");
        toast("کلید GLM-4 حذف شد");
        render();
      } else if (act === "testglmkey") {
        runGlmTest();
      } else if (act === "autotoggle") {
        autoCyc.on = !autoCyc.on;
        Store.set("pulse_auto_on", autoCyc.on);
        toast(autoCyc.on ? "▶ چرخهٔ خودکار نیم‌ساعت روشن شد" : "⏸ چرخهٔ خودکار خاموش شد");
        render();
        if (autoCyc.on) setTimeout(autoCycle, 800);
      } else if (act === "baletoggle") {
        bale.on = !bale.on;
        persistBale();
        toast(bale.on ? "▶ ارسال خودکار روشن شد" : "⏸ ارسال خودکار خاموش شد");
        render();
        if (bale.on) setTimeout(function () { if (!bale.busy) baleTick(); }, 800);
      } else if (act === "baledisc") {
        runBaleDiscover(el);
      } else if (act === "baletest") {
        runBaleTest();
      } else if (act === "balesave") {
        var bt = ($("baleToken") || {}).value || "";
        if (bt.trim().length < 20) { toast("توکن را کامل وارد کن"); return; }
        bale.token = bt.trim();
        persistBale();
        toast("توکن ذخیره شد — در حال تست ربات…");
        baleApi("getMe").then(function (me) {
          toast("✓ ربات وصل است: @" + (me.username || me.first_name || ""));
          render();
        }).catch(function (e) { toast("✕ " + e.message); });
      } else if (act === "baleadd") {
        var cid = ($("baleChatId") || {}).value || "";
        baleAddChat(cid).then(function (r) {
          toast(r.added ? "✓ چت «" + r.chat.title + "» اضافه شد" : "این چت از قبل در لیست است");
          render();
        }).catch(function (e) {
          toast("✕ " + (e.message || "افزودن چت ممکن نشد"));
        });
      } else if (act === "balechatsreset") {
        bale.chats = BALE_DEFAULT_CHATS.slice();
        persistBale();
        toast("چت‌ها به حالت اول بازگشت");
        render();
      } else if (act === "baleclear") {
        bale.sent = {};
        bale.sends = 0;
        Store.set("pulse_bale_baseline", { count: 0, t: Date.now() }); // stay disarmed — let the feed flow
        persistBale();
        toast("تاریخچه پاک شد — اخبار تازه در چرخه‌های بعدی ارسال می‌شوند");
        render();
      } else if (act === "openwidget") {
        state._widget = true;
        openSheet(widgetChatHtml());
        var wl = $("chatlistw");
        if (wl) wl.scrollTop = wl.scrollHeight;
      } else if (act === "makedigest") {
        makeDigest();
      } else if (act === "ask") {
        sendChat(el.getAttribute("data-q"), "tab");
      } else if (act === "askw") {
        sendChat(el.getAttribute("data-q"), "widget");
      } else if (act === "send") {
        var inp = $("chatInput");
        if (inp && inp.value.trim()) { sendChat(inp.value, "tab"); }
      } else if (act === "sendw") {
        var winp = $("chatInputw");
        if (winp && winp.value.trim()) { sendChat(winp.value, "widget"); }
      } else if (act === "extkey") {
        ev.preventDefault();
        Http.openExternal(el.getAttribute("href"));
      }
    });
    document.body.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closeSheet();
      if (ev.key === "Enter" && ev.target && ev.target.id === "chatInput") sendChat(ev.target.value, "tab");
      if (ev.key === "Enter" && ev.target && ev.target.id === "chatInputw") sendChat(ev.target.value, "widget");
    });
    $("sheetback").addEventListener("click", closeSheet);
    $("btnTheme").addEventListener("click", function () {
      document.body.classList.toggle("light");
      Store.set("pulse_theme", document.body.classList.contains("light") ? "light" : "dark");
    });
    $("btnAbout").addEventListener("click", function () { openSheet(aboutSheet()); });
  }

  function init() {
    if (Store.get("pulse_theme", "dark") === "light") document.body.classList.add("light");
    state._open = {}; // (legacy, unused)
    state._widget = false;
    state._resCat = "all";
    state._runId = "";
    state._resGuideId = "";
    bindActions();
    render();
    var stale = Date.now() - state.lastRefresh > STALE_MS;
    if (!state.news.length && !state.refreshing) {
      $("list").innerHTML = skeletons(4);
      setTimeout(function () { refreshAll(); }, 300);
    } else if (stale && !state.refreshing) {
      setTimeout(function () { refreshAll(); }, 800);
    }
    startBaleLoop(); // بله — چرخهٔ ۳۰ ثانیه‌ای خبرخوان خودکار
    startAutoCycle(); // v3.9 — چرخهٔ نیم‌ساعت: دریافت → ترجمه → خلاصه → بله
    setInterval(renderAutoStatus, 30000); // شمارندهٔ معکوس چرخه
    setTimeout(maybeAutoRes, 15000); // بروزرسانی هوشمند روزانهٔ کاتالوگ — پس از آرام‌شدن راه‌اندازی
  }

  return {
    init: init,
    render: render,
    toast: toast,
    openSheet: openSheet,
    closeSheet: closeSheet,
    refreshOn: refreshOn,
    refreshOff: refreshOff,
    refreshMsg: refreshMsg,
    renderBaleStatus: renderBaleStatus,
    renderAutoStatus: renderAutoStatus,
    renderEngineStatus: renderEngineStatus,
    resTick: resTick,
    resFinished: resFinished
  };
})();

document.addEventListener("DOMContentLoaded", UI.init);
