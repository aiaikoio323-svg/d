/* ===== core.js — HTTP bridge, storage, feeds, translate, gemini ===== */
"use strict";

/* ---------- native HTTP bridge ---------- */
var Http = (function () {
  var seq = 0;
  var pending = {};
  window.__onHttp = function (id, status, body) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    if (status >= 200 && status < 400) p.ok(body);
    else p.fail({ status: status, body: body });
  };
  function request(url, body, headers) {
    return new Promise(function (resolve, reject) {
      var id = "r" + (++seq);
      pending[id] = { ok: resolve, fail: reject };
      setTimeout(function () {
        if (pending[id]) { delete pending[id]; reject(new Error("timeout")); }
      }, 32000);
      try {
        if (body == null) PulseAndroid.get(id, url);
        else if (headers) PulseAndroid.postH(id, url, JSON.stringify(headers), body);
        else PulseAndroid.post(id, url, body);
      } catch (e) {
        delete pending[id];
        reject(e);
      }
    });
  }
  return {
    get: function (u) { return request(u, null); },
    post: function (u, b) { return request(u, b); },
    postH: function (u, h, b) { return request(u, b, h); },
    getJSON: function (u) { return request(u, null).then(JSON.parse); },
    openExternal: function (u) { try { PulseAndroid.openExternal(u); } catch (e) {} },
    toast: function (m) { try { PulseAndroid.toast(m); } catch (e) {} }
  };
})();

/* ---------- storage ---------- */
var Store = {
  get: function (k, d) {
    try {
      var v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch (e) { return d; }
  },
  set: function (k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  },
  del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
};

var state = {
  news: Store.get("pulse_news", []),
  spaces: Store.get("pulse_spaces", []),
  digests: Store.get("pulse_digests", {}),
  chat: Store.get("pulse_chat", []),
  key: Store.get("pulse_key", ""),
  lastRefresh: Store.get("pulse_last_refresh", 0),
  tab: "latest",
  cat: "all",
  refreshing: false,
  spaceFilter: Store.get("pulse_space_filter", "all"),
  spacesCache: {}
};

function persist() {
  var news = state.news.slice(0, 200);
  // reader texts are heavy — keep them only for the 60 newest items
  for (var i = 60; i < news.length; i++) {
    if (news[i].fullEn) { news[i] = Object.assign({}, news[i]); news[i].fullEn = ""; news[i].fullFa = ""; }
  }
  Store.set("pulse_news", news);
  // raw README is re-fetchable and heavy — strip it; keep the cached AI text for the top 12
  var spaces = state.spaces.slice(0, 40).map(function (s, i) {
    if (!s.readme && (!s.aiFa || i >= 12)) return s;
    var c = Object.assign({}, s);
    c.readme = "";
    if (i >= 12) c.aiFa = "";
    return c;
  });
  Store.set("pulse_spaces", spaces);
  Store.set("pulse_digests", state.digests);
  Store.set("pulse_chat", state.chat.slice(-40));
  Store.set("pulse_key", state.key);
  Store.set("pulse_last_refresh", state.lastRefresh);
  Store.set("pulse_space_filter", state.spaceFilter);
}

/* ---------- feed parsing ---------- */
function elByLocal(root, locals) {
  var all = root.getElementsByTagName("*");
  for (var i = 0; i < all.length; i++) {
    var ln = (all[i].localName || all[i].nodeName || "").toLowerCase();
    for (var j = 0; j < locals.length; j++) {
      if (ln === locals[j]) return all[i];
    }
  }
  return null;
}

function tagText(node, names) {
  var el = elByLocal(node, names);
  return el ? (el.textContent || "").trim() : "";
}

function extractImage(node, rawHtml) {
  var all = node.getElementsByTagName("*");
  for (var i = 0; i < all.length; i++) {
    var ln = (all[i].localName || "").toLowerCase();
    if (ln === "thumbnail" || ln === "enclosure" || (ln === "content" && all[i].getAttribute && /^image\//.test(all[i].getAttribute("type") || ""))) {
      var u = safeUrl(all[i].getAttribute("url") || all[i].getAttribute("href") || "");
      if (u) return u;
    }
  }
  var m = /<img[^>]+src=["']([^"']+)["']/i.exec(rawHtml || "");
  return m ? safeUrl(m[1]) : "";
}

function parseFeed(xmlText, source) {
  var doc = new DOMParser().parseFromString(xmlText, "text/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("badxml");
  var nodes = Array.prototype.slice.call(doc.getElementsByTagName("item"));
  var atom = false;
  if (!nodes.length) { nodes = Array.prototype.slice.call(doc.getElementsByTagName("entry")); atom = true; }
  return nodes.slice(0, 15).map(function (n) {
    var title = tagText(n, ["title"]);
    var link = "";
    if (atom) {
      var lel = null, all = n.getElementsByTagName("link");
      for (var i = 0; i < all.length; i++) {
        var rel = all[i].getAttribute("rel");
        if (!rel || rel === "alternate") { lel = all[i]; break; }
      }
      link = lel ? safeUrl(lel.getAttribute("href")) : "";
    } else {
      link = safeUrl(tagText(n, ["link"]));
    }
    var rawDesc = tagText(n, ["description"]) || tagText(n, ["summary"]) || tagText(n, ["encoded", "content"]);
    var desc = stripHtml(rawDesc).slice(0, 700);
    var dateStr = tagText(n, ["pubdate", "pubDate"]) || tagText(n, ["published"]) || tagText(n, ["updated"]);
    var t = dateStr ? new Date(dateStr).getTime() : NaN;
    if (isNaN(t)) t = Date.now();
    return {
      id: link || (source.id + "-" + title.slice(0, 40)),
      link: link,
      title: title,
      desc: desc,
      image: extractImage(n, rawDesc),
      sourceId: source.id,
      publishedAt: new Date(t).toISOString(),
      // enrichment slots
      titleFa: "", descFa: "", summaryFa: "", plainFa: "", detailFa: "",
      category: "", isFree: false, aiDone: false, hotness: 0
    };
  }).filter(function (it) {
    if (!it.title || !it.link) return false;
    /* v4.0 — منابع عمومی فقط خبرهای مرتبط با هوش مصنوعی را عبور می‌دهند (همان ربات ابری) */
    if (source.mustMatch && !AI_KW.test(it.title + " " + it.desc)) return false;
    return true;
  });
}

/* ---------- scoring & categorization ---------- */
function heuristicCategory(it) {
  var t = (it.titleFa || it.title) + " " + (it.desc || "");
  if (RE_FREE.test(t)) return "free";
  if (RE_RESEARCH.test(t)) return "research";
  if (RE_MODELS.test(t)) return "models";
  if (RE_TOOLS.test(t)) return "tools";
  if (RE_FEATURES.test(t)) return "features";
  return "industry";
}

function hotScore(it) {
  var src = SRC_BY_ID[it.sourceId] || { weight: 5 };
  var ageH = (Date.now() - new Date(it.publishedAt).getTime()) / 3600000;
  var recency = Math.max(0.35, 1 - ageH / 96);
  var hot = it.aiDone && it.hotness ? (it.hotness / 10) : 0.7;
  var freeBoost = it.isFree ? 1.25 : 1;
  return Math.round(hot * (src.weight / 10) * recency * freeBoost * 100) / 10;
}

/* ---------- translation (keyless) ---------- */
function gtx(text) {
  var u = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fa&dt=t&q=" + encodeURIComponent(text.slice(0, 1800));
  return Http.get(u).then(function (body) {
    var data = JSON.parse(body);
    if (!data || !data[0]) throw new Error("gtx");
    return data[0].map(function (seg) { return seg[0] || ""; }).join("").trim();
  });
}

function mymem(text) {
  var u = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text.slice(0, 480)) + "&langpair=en|fa&de=pulse%40aipulse.app";
  return Http.get(u).then(function (body) {
    var data = JSON.parse(body);
    var t = data && data.responseData && data.responseData.translatedText;
    if (!t || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(t)) throw new Error("mymem");
    return t.trim();
  });
}

function translateText(text) {
  if (!text || /[\u0600-\u06FF]/.test(text.slice(0, 30))) return Promise.resolve(text || "");
  var mask = protectTerms(text);
  if (!mask.terms.length) {
    return gtx(text).catch(function () { return mymem(text); }).catch(function () { return ""; });
  }
  var masked = mask.masked.slice(0, 1700);
  return gtx(masked)
    .catch(function () { return mymem(masked); })
    .then(function (out) { return out ? unmaskAfterTranslate(out, mask.terms) : ""; })
    .catch(function () { return ""; });
}

function translateQueue(items, delayMs) {
  delayMs = delayMs || 200;
  var chain = Promise.resolve();
  items.forEach(function (it) {
    chain = chain.then(function () {
      if (it.titleFa) return null;
      return translateText(it.title).then(function (fa) {
        it.titleFa = fa || it.title;
        return new Promise(function (r) { setTimeout(r, delayMs); });
      });
    });
  });
  return chain;
}

/* ---------- gemini (default key embedded + dual-auth) ---------- */
var DEFAULT_KEY = ""; // ⚠️ کلید پیشفرض در نسخهٔ پابلیک حذف شده — کلید رایگان خودت را از aistudio.google.com/apikey در تب «دستیار» وارد کن
var GEMINI_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"];

function resolveKey() { return (state.key || "").trim() || DEFAULT_KEY; }
function usingDefaultKey() { return !(state.key || "").trim(); }

/* ---------- free keyless AI (Pollinations — OpenAI-compatible) ---------- */
var FREE_AI_RETRY_MS = 33000;

function freeAIOnce(system, userText) {
  var body = {
    model: "openai",
    messages: [
      system ? { role: "system", content: system } : null,
      { role: "user", content: userText }
    ].filter(function (m) { return m; }),
    referrer: "aipulse"
  };
  return norm(Http.post("https://text.pollinations.ai/openai", JSON.stringify(body))).then(function (res) {
    if (res.status === 200) {
      try {
        var data = JSON.parse(res.body);
        var txt = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (txt && String(txt).trim()) {
          aiUsageAdd("free", Math.round((userText.length + String(txt).length) / 4));
          return String(txt).trim();
        }
        throw new Error("empty");
      } catch (e) { throw new Error("__free_bad"); }
    }
    var err = new Error("__free_limited");
    err.limited = res.status === 402 || res.status === 429;
    throw err;
  });
}

function freeAIGet(system, userText) {
  var u = "https://text.pollinations.ai/" + encodeURIComponent(userText.slice(0, 3000)) +
    "?model=openai" + (system ? "&system=" + encodeURIComponent(system.slice(0, 1500)) : "");
  return norm(Http.get(u)).then(function (res) {
    if (res.status === 200 && res.body && String(res.body).trim()) {
      var t = String(res.body).trim();
      if (!/^\{"status":40\d/.test(t)) return t;
    }
    throw new Error("__free_limited");
  });
}

/* free engine: 3 attempts (POST → GET → POST) with 33s patient waits between —
   the free tier allows 1 reply/30s per IP, so an immediate second call is
   guaranteed to fail; waiting gives it a fresh slot */
function freeAI(system, userText, onNote) {
  var tries = [
    function () { return freeAIOnce(system, userText); },
    function () { return freeAIGet(system, userText); },
    function () { return freeAIOnce(system, userText); }
  ];
  var i = 0;
  function attempt() {
    var fn = tries[i++];
    return fn().catch(function (e) {
      if (i >= tries.length) throw e;
      if (onNote) onNote("سرور رایگان شلوغ است — " + faDigits(33) + " ثانیه دیگر خودکار دوباره تلاش می‌کنم (" + faDigits(i) + "/" + faDigits(2) + ")…");
      return new Promise(function (resolve, reject) {
        setTimeout(function () { attempt().then(resolve, reject); }, FREE_AI_RETRY_MS);
      });
    });
  }
  return attempt();
}

/* main AI entry — v3.9 chain:
     ۱) Gemini (کلید شخصی یا کلید پیشفرض داخلی جدید)
     ۲) GLM-4 (وقتی کاربر کلید bigmodel.cn داده)
     ۳) Pollinations رایگان
   An engine that fails (rate/quota/invalid/network) gets a cooldown and the
   chain slides to the next one automatically — «هر وقت تموم شد برو سراغ بعدی».
   Usage (requests + tokens) is tracked per engine per day for the panel. */
function aiText(system, userText, onNote) {
  var chain = [
    { name: "gemini", run: function () { return geminiText(system, userText); } },
    { name: "glm", run: function () { return glmText(system, userText); } },
    { name: "free", run: function () { return freeAI(system, userText, onNote); } }
  ].filter(function (step) {
    if (step.name === "glm" && !((Store.get("pulse_glm_key", "") || "").trim())) return false;
    return !aiBlocked(step.name);
  });
  if (!chain.length) {
    // every engine is cooling down — still try gemini rather than dead-ending
    chain = [{ name: "gemini", run: function () { return geminiText(system, userText); } }];
  }
  var i = 0;
  function next() {
    var step = chain[i++];
    return step.run().catch(function (e) {
      engineFailFromErr(step.name, e);
      if (typeof UI !== "undefined" && UI.renderEngineStatus) UI.renderEngineStatus();
      if (i >= chain.length) throw (e && e.message) ? e : new Error("هوش مصنوعی در دسترس نیست — کمی بعد دوباره تلاش کن");
      return next();
    });
  }
  return next();
}

/* ---------- full article reader ---------- */
var JUNK_P = /(subscribe|newsletter|sign in|log in|sign up|register|advertisement|all rights reserved|read more|accept cookies|cookie policy|privacy policy|terms of service|click here|share this|follow us|advertisement|skip to content|©)/i;

function extractArticleText(html) {
  var doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style,nav,footer,header,aside,form,noscript").forEach(function (n) { n.remove(); });
  var ps = [];
  var scope = doc.querySelector("article") || doc.body;
  var nodes = scope ? scope.querySelectorAll("p") : [];
  for (var i = 0; i < nodes.length; i++) {
    var t = (nodes[i].textContent || "").replace(/\s+/g, " ").trim();
    if (t.length < 60 || t.length > 2000) continue;
    var letters = t.replace(/[^a-zA-Z]/g, "");
    if (letters.length > 12 && (t.match(/[A-Z]/g) || []).length / letters.length > 0.45) continue;
    if (JUNK_P.test(t) && t.length < 220) continue;
    if (/^(photo|image|caption|getty|reuters\/|ap photo)/i.test(t)) continue;
    ps.push(t);
  }
  return ps.join("\n\n");
}

function fetchFullArticle(it) {
  if (it.fullEn && it.fullEn.length > 200) return Promise.resolve(it.fullEn);
  if (!it.link) return Promise.reject(new Error("لینک خبر پیدا نشد"));
  return norm(Http.get(it.link)).then(function (res) {
    if (res.status !== 200) throw new Error("باز شدن مقاله ممکن نشد (کد " + faDigits(res.status) + ")");
    var text = extractArticleText(res.body || "");
    if (text.length < 250) throw new Error("متن کامل این خبر در دسترس نیست — از «منبع اصلی» بخوان");
    text = text.slice(0, 6500);
    it.fullEn = text;
    persist();
    return text;
  });
}

function translateFullText(text, onProgress) {
  var chunks = [];
  var parts = text.split(/(?<=[.!?])\s+/);
  var cur = "";
  for (var i = 0; i < parts.length; i++) {
    if ((cur + " " + parts[i]).length > 850 && cur) { chunks.push(cur); cur = parts[i]; }
    else cur = cur ? cur + " " + parts[i] : parts[i];
  }
  if (cur) chunks.push(cur);
  var out = [];
  var chain = Promise.resolve();
  chunks.forEach(function (c, idx) {
    chain = chain.then(function () {
      return translateText(c).then(function (fa) {
        out.push(fa || c);
        if (onProgress) onProgress(idx + 1, chunks.length, out.join(" "));
        return new Promise(function (r) { setTimeout(r, 140); });
      });
    });
  });
  return chain.then(function () { return out.join(" "); });
}

/* ================================================================
   v3.9 — پرامپت سوپر حرفه‌ای بازنشر (به سفارش کاربر):
   هوش مصنوعی نقش «متخصص ارشد شبکه‌های اجتماعی و ادمین کانال‌های
   پرمخاطب» را دارد؛ خبر را به فارسی روان ترجمه و مثل یک ادمین
   حرفه‌ای خلاصه و آمادهٔ انتشار می‌کند. همین یک پرامپت هم پست بله
   و هم باکس «به زبان ساده»ٔ اپ را می‌سازد تا هر دو یکسان بمانند.
   ================================================================ */
var CHANNEL_PROMPT =
  "تو «استودیو محتوای پالس» هستی؛ متخصص ارشد شبکه‌های اجتماعی، کارشناس رسانه و ادمین کانال‌های خبری پرمخاطب با سال‌ها تجربهٔ بازنشر حرفه‌ای اخبار فناوری و هوش مصنوعی در پیام‌رسان بله.\n" +
  "وظیفه: خبرِ ورودی را به یک پست آمادهٔ انتشار تبدیل کن — ترجمهٔ روان فارسی + خلاصه‌گیری حرفه‌ای در سبک کانال.\n" +
  "قواعد طلایی:\n" +
  "۱) فقط بر اساس همین متن بنویس؛ هیچ عدد، نام، نقل‌قول یا جزئیاتی از خودت اضافه نکن و ماجرا را تحریف نکن.\n" +
  "۲) فارسی روان، سلیس و رسا بنویس — انگار برای مخاطب عام ایرانی می‌نویسی؛ از ترجمهٔ تحت‌اللفظی، جملات بلند و کلمات نامأنوس پرهیز کن.\n" +
  "۳) ساختار پست کانال: با یک لیدِ جذاب و کوتاه شروع کن (گوشهٔ اصلی خبر، بدون تکرار خشک عنوان)، سپس ۲ تا ۴ جملهٔ روایتِ روان با حفظ دقیق اعداد و آمار مهم، و در پایان اگر لازم شد یک جمله: این خبر چرا مهم است یا برای کاربر عادی چه معنایی دارد.\n" +
  "۴) نام مدل‌ها، شرکت‌ها و ابزارها را لاتین نگه‌دار (مثل GPT-5، Nvidia، Google)؛ بقیهٔ متن کاملاً فارسی باشد.\n" +
  "۵) لحن خبری، مطمئن و بی‌طرف؛ بدون اغراق، بدون کلیک‌بیت دروغ، بدون تحلیل شخصی و بدون سؤال‌بازی.\n" +
  "۶) حداکثر ۲ ایموجی مرتبط و حرفه‌ای در جای درست استفاده کن (مثل 📌 ⚡ 🚀 🧠).\n" +
  "۷) پاراگراف‌بندی با خطِ جدید نگه‌دار. خروجی فقط متنِ آمادهٔ انتشار باشد؛ بدون مقدمه، بدون «این خلاصه است»، بدون توضیح اضافه و بدون هشتگ.\n" +
  "۸) طول مناسب پست کانال: حدود ۳۰۰ تا ۵۵۰ کاراکتر.";

function summarizeArticleSimple(fullText, onNote) {
  return aiText(CHANNEL_PROMPT, "متن کامل خبر:\n\n" + fullText.slice(0, 6000), onNote)
    .then(function (txt) { return txt.trim(); });
}

/* normalize bridge results: success resolves the body STRING, failure rejects
   {status, body} — shape both into {status, body} so callers are uniform */
function norm(p) {
  return p.then(function (v) {
      return typeof v === "string" ? { status: 200, body: v } : v;
    }, function (e) {
      if (e && typeof e.status === "number") return { status: e.status, body: e.body || "" };
      throw e;
    });
}

function geminiError(status, body) {
  var msg = "";
  try { msg = JSON.parse(body).error.message || ""; } catch (e) {}
  if (status === 401) {
    if (usingDefaultKey()) return "کلید پیشفرض جمینی منقضی شده — یک کلید شخصیِ رایگان از aistudio.google.com/apikey بگیر و در تب دستیار وارد کن";
    return "کلید جمینی پذیرفته نشد — کلید شخصی معتبر (AIza…) وارد کن";
  }
  if (status === 400 && /API key not valid/i.test(msg)) {
    return usingDefaultKey()
      ? "کلید پیشفرض جمینی دیگر معتبر نیست — کلید رایگان شخصی از aistudio.google.com/apikey بگیر"
      : "کلید جمینی معتبر نیست — آن را دوباره بررسی کنید";
  }
  if (status === 429) return "سهمیه رایگان جمینی فعلاً تمام شده — کمی بعد دوباره تلاش کنید";
  if (status === 403) return "دسترسی به جمینی رد شد — کلید یا منطقه شما مجاز نیست";
  if (msg) return "خطای جمینی: " + msg.slice(0, 140);
  return "اتصال به جمینی برقرار نشد";
}

function geminiCall(model, body, key) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";
  // the bridge rejects {status, body} for HTTP>=400 — normalize to a resolved
  // response so the Persian error mapping in geminiError() actually runs
  function fin(p) {
    return p.then(function (v) {
      return typeof v === "string" ? { status: 200, body: v } : v;
    }, function (e) {
      if (e && typeof e.status === "number" && e.status > 0) return { status: e.status, body: e.body || "" };
      throw e;
    });
  }
  if (key.indexOf("AQ.") === 0) {
    return fin(Http.postH(url, { "x-goog-api-key": key }, JSON.stringify(body))).then(function (res) {
      if (res.status === 401 || res.status === 403) {
        return fin(Http.postH(url, { "Authorization": "Bearer " + key }, JSON.stringify(body)));
      }
      return res;
    });
  }
  return fin(Http.post(url + "?key=" + encodeURIComponent(key), JSON.stringify(body)));
}

function geminiText(system, userText) {
  var key = resolveKey();
  var idx = 0;
  function attempt() {
    if (idx >= GEMINI_MODELS.length) return Promise.reject(new Error("اتصال به جمینی برقرار نشد"));
    var model = GEMINI_MODELS[idx++];
    var body = {
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
    };
    if (model.indexOf("2.5") >= 0) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    return geminiCall(model, body, key).then(function (res) {
      if (res.status !== 200) {
        if (res.status === 400 || res.status === 401 || res.status === 403 || res.status === 429) {
          var ee = new Error(geminiError(res.status, res.body));
          ee.status = res.status; // engine registry needs the raw code
          throw ee;
        }
        return attempt();
      }
      var data = JSON.parse(res.body);
      var parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
      var text = parts ? parts.map(function (p) { return p.text || ""; }).join("") : "";
      if (!text) throw new Error("پاسخ خالی از جمینی");
      aiUsageAdd("gemini", (data.usageMetadata && data.usageMetadata.totalTokenCount) || 0);
      return text;
    }).catch(function (e) {
      if (e && e.message && (e.message.indexOf("کلید") === 0 || e.message.indexOf("سهمیه") === 0 || e.message.indexOf("دسترسی") === 0 || e.message.indexOf("خطای جمینی") === 0 || e.message.indexOf("اتصال") === 0)) throw e;
      return attempt();
    });
  }
  return attempt();
}

/* lightweight probe for the «تست اتصال جمینای» button */
function geminiTest() {
  var t0 = Date.now();
  var key = resolveKey();
  return geminiCall("gemini-2.0-flash", {
    contents: [{ role: "user", parts: [{ text: "سلام — فقط بنویس: OK" }] }],
    generationConfig: { maxOutputTokens: 200, temperature: 0 }
  }, key).then(function (res) {
    var ms = Date.now() - t0;
    if (res.status !== 200) return { ok: false, message: geminiError(res.status, res.body) };
    try {
      var data = JSON.parse(res.body);
      var parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
      var txt = parts ? parts.map(function (p) { return p.text || ""; }).join("") : "";
      if (!txt) return { ok: false, message: "جمینی وصل است اما پاسخ خالی داد" };
      return { ok: true, message: "اتصال برقرار است ✓ پاسخ در " + faDigits(Math.round(ms / 100) / 10) + " ثانیه (gemini-2.0-flash، " + (usingDefaultKey() ? "کلید پیشفرض" : "کلید شخصی") + ")" };
    } catch (e) { return { ok: false, message: "پاسخ جمینی قابل خواندن نبود" }; }
  }).catch(function (e) {
    return { ok: false, message: (e && e.message) ? e.message : "اتصال به جمینی برقرار نشد — اینترنت را بررسی کن" };
  });
}

/* ================================================================
   v3.9 — رجیستری موتورهای هوش مصنوعی + ردیابی مصرف
   کلید پیشفرض جمینی موتور اول اپ است؛ بعد از اتمام سهمیه‌اش زنجیره
   خودکار به GLM-4 (کلید کاربر) و بعد به موتور رایگان میرسد.
   ================================================================ */
var GLM_MODEL = "glm-4-flash";   // free tier of open.bigmodel.cn
var GLM_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

var aiEng = Store.get("pulse_ai_eng", {});     // {gemini:{until,reason,invalid}, glm:{...}}
var aiUsage = Store.get("pulse_ai_usage", {}); // {day, gemini:{req,tok}, glm:{...}, free:{...}}

function aiUsageDay() {
  var d = todayKey();
  if (aiUsage.day !== d) {
    aiUsage = { day: d, gemini: { req: 0, tok: 0 }, glm: { req: 0, tok: 0 }, free: { req: 0, tok: 0 } };
    Store.set("pulse_ai_usage", aiUsage);
  }
  ["gemini", "glm", "free"].forEach(function (k) { if (!aiUsage[k]) aiUsage[k] = { req: 0, tok: 0 }; });
  return aiUsage;
}
function aiUsageAdd(engine, tok) {
  var u = aiUsageDay()[engine];
  u.req++; u.tok += tok || 0;
  Store.set("pulse_ai_usage", aiUsage);
}
function aiMarkLimited(engine, ms, reason) {
  aiEng[engine] = { until: Date.now() + ms, reason: reason || "" };
  Store.set("pulse_ai_eng", aiEng);
}
function aiMarkInvalid(engine) {
  aiEng[engine] = { invalid: true, reason: "کلید نامعتبر" };
  Store.set("pulse_ai_eng", aiEng);
}
function aiLimited(engine) {
  var e = aiEng[engine];
  return !!(e && !e.invalid && e.until > Date.now());
}
function aiBlocked(engine) {
  var e = aiEng[engine];
  return !!(e && ((e.until || 0) > Date.now() || e.invalid));
}
function aiClearEngine(engine) { delete aiEng[engine]; Store.set("pulse_ai_eng", aiEng); }
function aiEngineNote(engine) {
  var e = aiEng[engine];
  if (!e) return "";
  if (e.invalid) return "کلید نامعتبر است — کلید جدید وارد کن";
  if (e.until > Date.now()) {
    var min = Math.ceil((e.until - Date.now()) / 60000);
    return (min > 90
      ? "سهمیه تموم شد — " + faDigits(Math.ceil(min / 60)) + " ساعت دیگر خودکار امتحان می‌شود"
      : "محدود موقت — " + faDigits(min) + " دقیقه دیگر") + (e.reason ? " (" + e.reason + ")" : "");
  }
  return "";
}
/* map one failed call to engine cooldown policy */
function engineFailFromErr(engine, e) {
  var st = e && e.status;
  if (st === 429) { aiMarkLimited(engine, 10 * 60000, "محدودیت نرخ"); return; }
  if (st === 403) { aiMarkLimited(engine, 6 * 3600000, "سهمیه/دسترسی"); return; }
  if (st === 401 || st === 400) { aiMarkInvalid(engine); return; }
  if (!st) aiMarkLimited(engine, 3 * 60000, "شبکه");
}

/* ---------- GLM-4 engine (open.bigmodel.cn — OpenAI-compatible) ---------- */
function glmError(status, body) {
  var msg = "";
  try { msg = JSON.parse(body).error.message || ""; } catch (e) {}
  if (status === 401) return "کلید GLM-4 پذیرفته نشد — کلید را از open.bigmodel.cn بررسی کن";
  if (status === 429) return "سهمیه GLM-4 فعلاً پر است — کمی بعد دوباره";
  if (status === 400) return "درخواست GLM-4 نامعتبر بود";
  if (msg) return "خطای GLM: " + msg.slice(0, 140);
  return "اتصال به GLM-4 برقرار نشد";
}
function glmText(system, userText) {
  var key = (Store.get("pulse_glm_key", "") || "").trim();
  if (!key) return Promise.reject(new Error("کلید GLM-4 تنظیم نشده است"));
  var body = {
    model: GLM_MODEL,
    messages: [
      system ? { role: "system", content: system } : null,
      { role: "user", content: userText }
    ].filter(function (m) { return m; }),
    temperature: 0.7
  };
  return norm(Http.postH(GLM_URL, { "Authorization": "Bearer " + key }, JSON.stringify(body))).then(function (res) {
    if (res.status !== 200) {
      var err = new Error(glmError(res.status, res.body));
      err.status = res.status;
      throw err;
    }
    var data = JSON.parse(res.body);
    var txt = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!txt || !String(txt).trim()) throw new Error("پاسخ خالی از GLM-4");
    aiUsageAdd("glm", (data.usage && data.usage.total_tokens) || Math.round((userText.length + String(txt).length) / 4));
    return String(txt).trim();
  });
}
/* probe for the «بررسی GLM-4» button */
function glmTest() {
  var t0 = Date.now();
  return glmText("فقط کلمه OK را بنویس.", "سلام").then(function (txt) {
    return { ok: true, message: "اتصال برقرار است ✓ (" + GLM_MODEL + "، پاسخ در " + faDigits(Math.round((Date.now() - t0) / 100) / 10) + " ثانیه)" };
  }).catch(function (e) {
    return { ok: false, message: (e && e.message) ? e.message : "اتصال به GLM-4 برقرار نشد" };
  });
}

function extractJsonArray(text) {
  var t = String(text).replace(/```json|```/g, "").trim();
  var a = t.indexOf("["), b = t.lastIndexOf("]");
  if (a < 0 || b < 0) throw new Error("nojson");
  return JSON.parse(t.slice(a, b + 1));
}

var SUM_SYSTEM = "تو ویرایشگر خبری فارسی‌زبان اپ «پالس هوش مصنوعی» هستی. برای هر خبر ورودی این فیلدها را بده: titleFa (تیتر کاملاً فارسی و جذاب؛ فقط اسم محصولات می‌تواند لاتین بماند)، summaryFa (خلاصه حداکثر ۵۰ کلمه به فارسی روان و ساده)، plainFa (یک جمله: برای کاربر عادی چه معنی دارد و چه کمکی می‌کند)، category یکی از این‌ها: models, tools, free, features, industry, research)، isFree (true فقط اگر واقعاً رایگان یا متن‌باز باشد)، hotness عدد 1 تا 10 (چقدر داغ/مهم است). خروجی فقط و فقط یک آرایه JSON باشد: [{\"i\":شماره, \"titleFa\":\"...\", \"summaryFa\":\"...\", \"plainFa\":\"...\", \"category\":\"...\", \"isFree\":bool, \"hotness\":ن}] — بدون هیچ توضیح اضافه.";

function summarizeWithGemini(items) {
  var todo = items.filter(function (it) { return !it.aiDone; }).slice(0, 45);
  // v3.9: the embedded default key IS the primary engine — no need for a personal key
  if (!todo.length) return Promise.resolve(0);
  var batches = [];
  for (var i = 0; i < todo.length; i += 5) batches.push(todo.slice(i, i + 5));
  var done = 0;
  var chain = Promise.resolve();
  batches.forEach(function (batch) {
    chain = chain.then(function () {
      var input = batch.map(function (it, j) {
        return { i: j + 1, title: it.title, source: (SRC_BY_ID[it.sourceId] || {}).name || "", desc: (it.desc || "").slice(0, 320) };
      });
      return geminiText(SUM_SYSTEM, JSON.stringify(input)).then(function (raw) {
        var arr = extractJsonArray(raw);
        batch.forEach(function (it, j) {
          var o = arr.find(function (x) { return +x.i === j + 1; }) || arr[j];
          if (!o) return;
          if (o.titleFa && persianRatio(o.titleFa) >= 0.35) it.titleFa = o.titleFa;
          if (o.summaryFa) it.summaryFa = o.summaryFa;
          if (o.plainFa) it.plainFa = o.plainFa;
          if (o.category && CAT_BY_KEY[o.category]) it.category = o.category;
          it.isFree = !!o.isFree || RE_FREE.test(it.title);
          it.hotness = +o.hotness || 5;
          it.aiDone = true;
          done++;
        });
      }).catch(function () {});
    });
  });
  return chain.then(function () { return done; });
}

/* ---------- HF spaces ---------- */
/* v3.7 — multi-filter trending: هر فیلتر یک جست‌وجوی مستقل در API هاگینگ فیس
   (بدون سانسور، ویدیو، تصویر، صدا، چت) با حافظهٔ مستقل در همان نشست */
var SPACE_FILTERS = [
  { key: "all",        label: "همه",           emoji: "🔥", q: "" },
  { key: "uncensored", label: "بدون سانسور",   emoji: "🔓", q: "uncensored" },
  { key: "video",      label: "ویدیو",          emoji: "🎬", q: "video" },
  { key: "image",      label: "تصویر",          emoji: "🖼", q: "text-to-image" },
  { key: "audio",      label: "صدا و موسیقی",   emoji: "🎵", q: "audio" },
  { key: "chat",       label: "چت و LLM",       emoji: "💬", q: "llm" }
];

function refreshSpaces(filterKey) {
  var fk = filterKey || state.spaceFilter || "all";
  var f = SPACE_FILTERS.find(function (x) { return x.key === fk; }) || SPACE_FILTERS[0];
  var u = "https://huggingface.co/api/spaces?sort=trendingScore&direction=-1&limit=40&runtime=true" +
    (f.q ? "&search=" + encodeURIComponent(f.q) : "");
  return Http.getJSON(u).then(function (list) {
    var ok = (list || []).filter(function (x) {
      return x.runtime && x.runtime.stage === "RUNNING" && ["gradio", "streamlit", "docker", "static"].indexOf(x.sdk) >= 0;
    }).slice(0, 24).map(function (x) {
      var parts = (x.id || "").split("/");
      var embed = x.runtime.domains && x.runtime.domains[0] && x.runtime.domains[0].domain
        ? "https://" + x.runtime.domains[0].domain + "/" : "";
      var old = state.spaces.find(function (s) { return s.sid === x.id; });
      if (!old) {
        for (var ck in state.spacesCache) {
          old = state.spacesCache[ck].find(function (s) { return s.sid === x.id; });
          if (old) break;
        }
      }
      return {
        sid: x.id,
        author: parts[0] || "",
        name: parts[1] || x.id,
        title: (parts[1] || x.id).replace(/[-_.]/g, " "),
        likes: x.likes || 0,
        ts: x.trendingScore || 0,
        sdk: x.sdk || "",
        url: "https://huggingface.co/spaces/" + x.id,
        embed: embed,
        titleFa: old && old.titleFa || "",
        descFa: old && old.descFa || "",
        aiFa: old && old.aiFa || "",
        emoji: (old && old.emoji) || "🚀"
      };
    });
    state.spacesCache[fk] = ok;
    state.spaces = ok;
    return ok;
  });
}

function spaceReadme(sid) {
  return Http.get("https://huggingface.co/spaces/" + sid + "/raw/main/README.md").then(function (md) {
    var t = String(md || "");
    if (/^---/.test(t)) {
      var end = t.indexOf("---", 3);
      if (end > 0) t = t.slice(end + 3);
    }
    t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[#>*`_|]/g, " ").replace(/\s+/g, " ").trim();
    var para = "";
    var chunks = t.split(/(?<=\.)\s+/);
    for (var i = 0; i < chunks.length; i++) {
      if (chunks[i].length > 60) { para = chunks.slice(i, i + 3).join(" ").slice(0, 300); break; }
    }
    return para || t.slice(0, 300);
  }).catch(function () { return ""; });
}

/* full cleaned README for the AI + the «متن اصلی» view in the space sheet */
function cleanSpaceReadme(raw) {
  var t = String(raw || "");
  if (/^---/.test(t)) {
    var end = t.indexOf("---", 3);
    if (end > 0) t = t.slice(end + 3);
  }
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*`|]/g, " ")
    .replace(/^\s*[-=]{3,}\s*$/gm, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t.slice(0, 5500);
}

function fetchSpaceReadme(sp) {
  if (sp.readme && sp.readme.length > 60) return Promise.resolve(sp.readme);
  function once() {
    return norm(Http.get("https://huggingface.co/spaces/" + sp.sid + "/raw/main/README.md")).then(function (res) {
      if (res.status !== 200) throw new Error("متن معرفی این اسپیس در دسترس نیست (کد " + faDigits(res.status) + ")");
      var t = cleanSpaceReadme(res.body);
      if (t.length < 60) throw new Error("سازنده برای این اسپیس متن معرفی‌ای ننوشته است");
      sp.readme = t;
      return t;
    });
  }
  return once().catch(function () {
    // one patient retry — flaky networks / reset connections shouldn't kill the feature
    return new Promise(function (r) { setTimeout(r, 900); }).then(once);
  });
}

var SPACE_AI_PROMPT = "تو راهنمای فارسی‌زبان اپ «پالس هوش مصنوعی» هستی. متن معرفی (README) یک اسپیس هاگینگ فیس برایت داده می‌شود. آن را بخوان و خروجی را دقیقاً با این پنج بخش بده:\n" +
  "«خلاصه» — ۲ تا ۴ جملهٔ کاملاً ساده و محاوره‌ای: این اسپیس چیست و چه کاری می‌کند.\n" +
  "«قابلیت‌ها» — ۳ تا ۶ مورد کوتاه با خط تیره: کاربر دقیقاً چه کارهایی می‌تواند بکند.\n" +
  "«چطور استفاده کنم؟» — ۳ تا ۵ قدم ساده و شماره‌دار برای کار با رابط همین اسپیس، از باز کردن تا گرفتن خروجی.\n" +
  "«محدودیت‌ها» — ۳ تا ۵ مورد کوتاه با خط تیره: صف و زمان انتظار، سهمیهٔ GPU یا سهمیهٔ روزانه، نیاز به لاگین یا توکن، سانسور یا فیلترهای محتوایی، پشتیبانی از زبان فارسی، کیفیت خروجی. چیزی که مطمئن نیستی را با «ممکن است تغییر کرده باشد» بگو.\n" +
  "«برای چه کسی مفید است» — ۱ جمله.\n" +
  "زبان ساده فارسی، بدون مقدمه و تعارف؛ اسم مدل‌ها، ابزارها و اصطلاحات تخصصی را لاتین نگه دار. اگر README کم بود، از اسم و توضیح موجود همان حدس منطقی و صادقانه را بگو و از خودت چیز غیرواقعی نساز.";

function spaceAiExplain(sp, onNote, force) {
  if (sp.aiFa && !force) return Promise.resolve(sp.aiFa);
  return fetchSpaceReadme(sp).then(function (txt) {
    if (onNote) onNote("متن اسپیس خوانده شد — هوش مصنوعی در حال ساخت راهنمای کامل…");
    return aiText(SPACE_AI_PROMPT, "اسم اسپیس: " + sp.name + "\nسازنده: " + sp.author + "\n\nمتن معرفی:\n" + txt, onNote)
      .then(function (out) {
        sp.aiFa = String(out).trim();
        persist();
        return sp.aiFa;
      });
  });
}

/* ---------- main refresh ---------- */
function fetchAllSources(onProgress) {
  var results = [];
  var done = 0;
  var batches = [];
  var CONC = 6;
  for (var i = 0; i < SOURCES.length; i += CONC) batches.push(SOURCES.slice(i, i + CONC));
  var chain = Promise.resolve();
  batches.forEach(function (batch) {
    chain = chain.then(function () {
      return Promise.all(batch.map(function (src) {
        return Http.get(src.url)
          .then(function (body) { return parseFeed(body, src); })
          .then(function (items) { results = results.concat(items); })
          .catch(function () {});
      })).then(function () {
        done += batch.length;
        if (onProgress) onProgress(done, SOURCES.length);
      });
    });
  });
  return chain.then(function () { return results; });
}

function mergeNews(existing, fresh) {
  var map = {};
  existing.forEach(function (it) { map[it.id] = it; });
  fresh.forEach(function (it) {
    var old = map[it.id];
    if (old) {
      ["titleFa", "descFa", "summaryFa", "plainFa", "detailFa", "baleFa", "gistFa", "category", "image", "fullEn", "fullFa", "simpleFa"].forEach(function (k) {
        if (old[k]) it[k] = old[k];
      });
      it.aiDone = !!old.aiDone;
      it.hotness = old.hotness || 0;
      it.isFree = old.isFree || false;
    }
    map[it.id] = it;
  });
  var all = Object.keys(map).map(function (k) { return map[k]; });
  all.sort(function (a, b) { return new Date(b.publishedAt) - new Date(a.publishedAt); });
  return all.slice(0, 200);
}

function refreshAll(onDone) {
  if (state.refreshing) return;
  state.refreshing = true;
  UI.refreshOn();
  var step = 0;

  fetchAllSources(function (d, total) {
    step++;
    UI.refreshMsg("دریافت از منابع خبری… " + faDigits(d) + "/" + faDigits(total));
  })
  .then(function (fresh) {
    UI.refreshMsg("چیدن و رتبه‌بندی…");
    state.news = mergeNews(state.news, fresh);
    persist();
    UI.render();
    return summarizeWithGemini(state.news).then(function (n) {
      if (n > 0) UI.refreshMsg("تحلیل هوشمند " + faDigits(n) + " خبر…");
      var needFa = state.news.filter(function (it) { return !it.titleFa; }).slice(0, 80);
      return translateQueue(needFa, 120).then(function () {
        state.news.forEach(function (it) {
          if (!it.category) it.category = heuristicCategory(it);
          if (RE_FREE.test(it.title) && it.aiDone !== true) it.isFree = it.isFree || true;
        });
      });
    });
  })
  .then(function () {
    UI.refreshMsg("اسپیس‌های ترند هاگینگ فیس…");
    return refreshSpaces().then(function () {
      var chain = translateQueue(state.spaces.filter(function (s) { return !s.titleFa; }).slice(0, 16), 150);
      state.spaces.filter(function (s) { return !s.descFa; }).slice(0, 10).forEach(function (s) {
        chain = chain.then(function () {
          return spaceReadme(s.sid).then(function (en) {
            if (!en) return null;
            return translateText(en.slice(0, 280)).then(function (fa) { s.descFa = fa; });
          });
        });
      });
      return chain;
    });
  })
  .then(function () {
    state.lastRefresh = Date.now();
    persist();
    UI.refreshOff();
    UI.render();
    Http.toast("اخبار به‌روز شد");
  })
  .catch(function () {
    UI.refreshOff();
    UI.render();
    Http.toast("بروزرسانی کامل نشد — اتصال را بررسی کنید");
  })
  .then(function () { state.refreshing = false; if (onDone) onDone(); });
}

/* ================================================================
   بله — عامل خبرخوان خودکار (ربات @aiautonewsbot)
   Telegram-compatible API: https://tapi.bale.ai/bot<TOKEN>/<method>
   All calls go through the native bridge (no CORS restrictions).
   ================================================================ */
var BALE_DEFAULT_TOKEN = ""; // ⚠️ توکن ربات در نسخهٔ پابلیک حذف شده — توکن ربات خودت را از @BotFather بله بگیر و اینجا یا در تب «دستیار» بگذار
/* the owner's private chat with the bot — seeded so the bot works out of the
   box; getUpdates discovery adds any new chat (channel/group) automatically */
var BALE_DEFAULT_CHATS = [{ id: 1663835599, type: "private", title: "حسین" }];
var BALE_TICK_MS = 30000;      // user requirement: check for fresh news every 30s
var BALE_MAX_PER_TICK = 2;     // gentle pacing — never burst
var BALE_MAX_AGE_H = 36;       // items older than this are silently marked, not sent
var BALE_CAPTION_MAX = 1000;   // Bale caption limit is 1024 — stay under it

var bale = {
  token: Store.get("pulse_bale_token", BALE_DEFAULT_TOKEN),
  on: Store.get("pulse_bale_on", true),
  chats: Store.get("pulse_bale_chats", BALE_DEFAULT_CHATS.slice()),
  sent: Store.get("pulse_bale_sent", {}),
  offset: Store.get("pulse_bale_off", 0),
  sends: Store.get("pulse_bale_sends", 0),
  lastOk: Store.get("pulse_bale_lastok", 0),
  lastCheck: Store.get("pulse_bale_lastcheck", 0),
  lastErr: "",
  busy: false
};

function persistBale() {
  Store.set("pulse_bale_token", bale.token);
  Store.set("pulse_bale_on", bale.on);
  Store.set("pulse_bale_chats", bale.chats);
  Store.set("pulse_bale_sends", bale.sends);
  Store.set("pulse_bale_off", bale.offset);
  Store.set("pulse_bale_lastok", bale.lastOk);
  Store.set("pulse_bale_lastcheck", bale.lastCheck);
  // bound the sent map: keep the newest 400 ids by timestamp
  var keys = Object.keys(bale.sent);
  if (keys.length > 400) {
    keys.sort(function (a, c) { return bale.sent[a] - bale.sent[c]; });
    for (var i = 0; i < keys.length - 400; i++) delete bale.sent[keys[i]];
  }
  Store.set("pulse_bale_sent", bale.sent);
}

function baleEsc(s) {
  // Bale HTML only reliably supports &lt; &gt; &amp; — never send attribute entities
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function baleErrFa(status, data) {
  var d = (data && data.description) || "";
  if (status === 401) return "توکن ربات بله نامعتبر است — از BotFather بله توکن جدید بگیر";
  if (status === 404) return "ربات با این توکن در بله پیدا نشد — توکن را بررسی کن";
  if (status === 409) return "یک برنامهٔ دیگر همین الآن با این ربات در ارتباط است";
  if (status === 429) return "بله محدودیت ارسال فعال کرده — کمی بعد خودکار دوباره تلاش می‌شود";
  if (d.indexOf("chat not found") >= 0) return "چت پیدا نشد — اول در بله به @aiautonewsbot پیام /start بده";
  if (d.indexOf("blocked") >= 0) return "ربات بله بلاک شده است — آن را از بلاک خارج کن";
  if (d.indexOf("parse entities") >= 0 || d.indexOf("can't parse") >= 0) return "قالب پیام قابل خواندن نبود";
  if (d) return "بله: " + d.slice(0, 120);
  return "اتصال به سرور بله برقرار نشد (کد " + faDigits(status) + ")";
}

function baleApi(method, payload) {
  var token = (bale.token || "").trim();
  if (!token) return Promise.reject(new Error("توکن ربات بله تنظیم نشده است"));
  return norm(Http.post("https://tapi.bale.ai/bot" + token + "/" + method, JSON.stringify(payload || {})))
    .then(function (res) {
      var data = null;
      try { data = JSON.parse(res.body); } catch (e) {}
      if (res.status === 200 && data && data.ok) return data.result;
      var err = new Error(baleErrFa(res.status, data));
      err.status = res.status;
      throw err;
    });
}

/* find every chat that talked to the bot (private) or has it as admin
   (channel/group) — getUpdates is consumed with an offset like Telegram */
function baleDiscover() {
  return baleApi("getUpdates", { offset: bale.offset + 1, timeout: 0 }).then(function (ups) {
    var found = {};
    (ups || []).forEach(function (u) {
      if (u && typeof u.update_id === "number" && u.update_id > bale.offset) bale.offset = u.update_id;
      var m = u.message || u.channel_post || u.edited_message || u.edited_channel_post;
      if (m && m.chat && m.chat.id != null) {
        found[String(m.chat.id)] = {
          id: m.chat.id,
          type: m.chat.type || "private",
          title: m.chat.title || m.chat.first_name || m.chat.username || ("چت " + m.chat.id)
        };
      }
      if (u.my_chat_member && u.my_chat_member.chat && u.my_chat_member.chat.id != null) {
        var c = u.my_chat_member.chat;
        found[String(c.id)] = { id: c.id, type: c.type || "channel", title: c.title || c.username || ("چت " + c.id) };
      }
    });
    var added = 0;
    Object.keys(found).forEach(function (k) {
      var exists = bale.chats.some(function (c) { return String(c.id) === k; });
      if (!exists) { bale.chats.push(found[k]); added++; }
    });
    if (added || (ups || []).length) persistBale();
    return { added: added, updates: (ups || []).length };
  });
}

/* manual add: a numeric chat id or @public-channel — verified via getChat
   (useful when the /start update is already consumed or the bot is admin of
   a channel that never posts) */
function baleAddChat(raw) {
  var t = String(raw || "").trim();
  if (!t) return Promise.reject(new Error("شناسهٔ چت را وارد کن"));
  var chatId = /^@/.test(t) ? t : (/^-?\d+$/.test(t) ? Number(t) : null);
  if (chatId === null) return Promise.reject(new Error("شناسهٔ چت نامعتبر است — عدد یا @نام کانال بده"));
  return baleApi("getChat", { chat_id: chatId }).then(function (ch) {
    if (!ch || ch.id == null) throw new Error("چت پیدا نشد");
    var entry = {
      id: ch.id,
      type: ch.type || "private",
      title: ch.title || ch.first_name || ch.username || ("چت " + ch.id)
    };
    var exists = bale.chats.some(function (c) { return String(c.id) === String(entry.id); });
    if (!exists) { bale.chats.push(entry); persistBale(); }
    return { added: !exists, chat: entry };
  });
}

/* ================================================================
   v4.0 — «لب کلام» خبر (همان پرامپت ربات ابری نسخهٔ ۴.۰):
   گویندهٔ خبری که هر خبر فناوری را در چند ثانیه کاملاً جا می‌اندازد؛
   همین متن در پست بله زیر خط «منبع» می‌نشیند.
   ================================================================ */
var GIST_PROMPT = [
  "تو «سردبیر لب کلام» رسانهٔ «پالس هوش مصنوعی» هستی؛ گویندهٔ خبری که هر خبر فناوری را در چند ثانیه برای مخاطب عام ایرانی کاملاً جا می‌اندازد.",
  "وظیفه: لب کلام همین خبر را به فارسی روان و ساده بنویس.",
  "قواعد طلایی:",
  "۱) فقط بر اساس همین متن بنویس؛ هیچ نام، عدد، جزئیات یا ادعایی از خودت اضافه نکن، حاشیه نرو و ماجرا را تحریف نکن.",
  "۲) لب کلام یعنی: چه اتفاقی افتاده، به دست چه کسی یا چه شرکتی، عدد یا تاریخ مهم، و چرا مهم است — فقط همین‌ها؛ نه توضیح اضافه، نه مقدمه، نه جمع‌بندی تکراری.",
  "۳) فارسی کاملاً روان و ساده بنویس؛ از اصطلاح فنی پرهیز کن و اگر اصلاحی لازم شد همان لحظه در دل جمله با یک مقایسهٔ ساده توضیحش بده.",
  "۴) ۲ تا ۳ جملهٔ کوتاه و مستقیم؛ حدود ۱۲۰ تا ۳۰۰ کاراکتر؛ بدون «طبق گزارش»، بدون سؤال، بدون ایموجی، بدون هشتگ، بدون عنوان.",
  "۵) اسم مدل‌ها، شرکت‌ها و ابزارها را لاتین نگه‌دار (مثل GPT-5، Nvidia، Gemini).",
  "۶) خروجی فقط متن لب کلام باشد؛ بدون هیچ توضیح اضافه."
].join("\n");

/* لب کلام را می‌سازد و در gistFa کش می‌کند — اولویت متریال: پست حرفه‌ایِ
   آماده (simpleFa) ← متن کامل خبر ← توضیح کوتاه. اگر موتور جواب نداد
   رشتهٔ خالی برمی‌گردد تا پست بدون لب کلام (فقط منبع+لینک) نرود. */
function ensureGist(it) {
  if (it.gistFa) return Promise.resolve(it.gistFa);
  var material = (it.simpleFa || "").trim();
  var prep;
  if (material.length > 80) {
    prep = Promise.resolve("خلاصهٔ حرفه‌ای آمادهٔ همین خبر:\n\n" + material);
  } else {
    prep = Promise.resolve()
      .then(function () {
        if (it.fullEn && it.fullEn.length > 250) return it.fullEn;
        return fetchFullArticle(it).catch(function () { return ""; });
      })
      .then(function (full) {
        if (full && full.length > 250) return "متن کامل خبر:\n\n" + full.slice(0, 6000);
        if ((it.desc || "").length > 60) {
          return "متن کامل خبر در دسترس نیست؛ فقط این توضیح کوتاه را داری:\nعنوان: " + it.title + "\nتوضیح: " + it.desc +
            "\n\nبر اساس همین توضیح، لب کلام را بنویس — ۲ تا ۳ جملهٔ روان — و چیزی از خودت اضافه نکن.";
        }
        return ""; // چیزی برای ساختن لب کلام نداریم
      });
  }
  return prep.then(function (userTxt) {
    if (!userTxt) return "";
    return aiText(GIST_PROMPT, userTxt).then(function (out) {
      var t = String(out).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n").trim().slice(0, 320);
      if (t && persianRatio(t) >= 0.35) { it.gistFa = t; persist(); return t; }
      return "";
    });
  }).catch(function () { return ""; });
}

/* v3.9 — the Bale body IS the app's own professional channel post (simpleFa):
   the exact same CHANNEL_PROMPT the reader uses, cached into the same field,
   so what the channel subscriber reads is word-for-word what the app shows.
   Paragraph breaks are preserved — the expert post keeps its channel shape.
   The raw news text is NEVER sent. Legacy baleFa stays as a fallback body. */
function ensureBaleSummary(it) {
  if (it.simpleFa) return Promise.resolve(it.simpleFa);
  if (it._baleP) return it._baleP;
  it._baleP = Promise.resolve()
    .then(function () {
      if (it.fullEn && it.fullEn.length > 250) return it.fullEn;
      return fetchFullArticle(it).catch(function () { return ""; });
    })
    .then(function (full) {
      var userTxt;
      if (full && full.length > 250) {
        userTxt = "متن کامل خبر:\n\n" + full.slice(0, 6000);
      } else if ((it.desc || "").length > 60) {
        userTxt = "متن کامل خبر در دسترس نیست؛ فقط این توضیح کوتاه را داری:\nعنوان: " + it.title + "\nتوضیح: " + it.desc +
          "\n\nبر اساس همین توضیح، پست کانال را بساز — ۲ تا ۳ جملهٔ روان — و چیزی از خودت اضافه نکن.";
      } else {
        return ""; // nothing beyond the title — send a title+link message
      }
      return aiText(CHANNEL_PROMPT, userTxt).then(function (out) {
        // پاراگراف‌بندی پست حفظ شود — فقط فاصله‌های اضافی تمیز می‌شود
        it.simpleFa = String(out).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 850);
        it.baleFa = it.simpleFa; // legacy mirror so old code/UI keeps working
        persist();
        return it.simpleFa;
      });
    })
    .then(function (r) { it._baleP = null; return r; }, function (e) { it._baleP = null; throw e; });
  return it._baleP;
}

/* ================================================================
   v4.0 — فرمت جدید پست بله (دقیقاً همان ربات ابری نسخهٔ ۴.۰):
   منبع: نام‌منبع
   لب کلام خبر (gistFa ← simpleFa ← summaryFa)
   🔗 لینک   (لینک داخل کلمهٔ «لینک» پنهان است)
   ================================================================ */
function hrefBale(u) { return String(u || "").replace(/&/g, "&amp;").replace(/"/g, "%22"); }
function baleSrcName(it) {
  var src = SRC_BY_ID[it.sourceId] || {};
  return src.nameFa || src.name || "پالس هوش مصنوعی";
}
function baleCaption(it, html) {
  var srcLine = "منبع: " + baleSrcName(it);
  var body = String(it.gistFa || it.simpleFa || it.baleFa || it.summaryFa || "").trim();
  var link = it.link || "";
  var linkLine = html
    ? '🔗 <a href="' + hrefBale(link) + '">لینک</a>'
    : "🔗 لینک:\n" + link;
  var budget = Math.max(80, BALE_CAPTION_MAX - (srcLine.length + linkLine.length + 30));
  var out = html ? "<b>" + baleEsc(srcLine) + "</b>" : baleEsc(srcLine);
  if (body) {
    out += "\n\n" + baleEsc(body.slice(0, budget)) + (body.length > budget ? "…" : "");
  } else {
    out += "\n\n⏳ خلاصهٔ این خبر هنوز آماده نشده — متن کامل را از لینک بخوان";
  }
  out += "\n\n" + linkLine;
  return out;
}

/* one chat: photo first, and if the HTML caption fails to parse retry the
   SAME photo with a plain caption — a markup hiccup must never cost us the
   image or the message; plain captions keep the raw URL which Bale
   auto-links, so the link stays clickable in every path */
function baleSendOne(ch, it) {
  var attempts = [];
  if (it.image) {
    attempts.push(function () {
      return baleApi("sendPhoto", { chat_id: ch.id, photo: it.image, caption: baleCaption(it, true), parse_mode: "HTML" });
    });
    attempts.push(function () {
      return baleApi("sendPhoto", { chat_id: ch.id, photo: it.image, caption: baleCaption(it, false) });
    });
  }
  attempts.push(function () { return baleApi("sendMessage", { chat_id: ch.id, text: baleCaption(it, true), parse_mode: "HTML" }); });
  attempts.push(function () { return baleApi("sendMessage", { chat_id: ch.id, text: baleCaption(it, false) }); });
  var i = 0;
  function go() {
    if (i >= attempts.length) return Promise.reject(new Error("ارسال به «" + ch.title + "» ممکن نشد"));
    return attempts[i++]().catch(function (e) {
      if (e && e.message && e.message.indexOf("چت پیدا نشد") >= 0) throw e;
      return go();
    });
  }
  return go();
}

function baleSendItem(it, chats) {
  var out = [];
  var chain = Promise.resolve();
  chats.forEach(function (ch) {
    chain = chain.then(function () {
      return baleSendOne(ch, it).then(function (r) {
        out.push({ chat: ch, ok: true, mid: r && r.message_id });
      }, function (e) {
        out.push({ chat: ch, ok: false, err: e.message });
      });
    });
  });
  return chain.then(function () { return out; });
}

/* first run / first update: mark everything already in the feed as baseline
   so the bot never floods the chat with the historical backlog.
   NEVER arm on an empty feed — on a cold start the first tick (4s) races the
   initial refresh; arming then would leave the whole first feed unsent.
   SELF-HEAL: the flag stores the marked count — if the sent map is ever lost
   (storage quota, corruption) while the flag says it had entries, re-mark the
   current feed instead of letting everything float as "new". */
function baleBaseline() {
  if (!state.news.length) return;
  var meta = Store.get("pulse_bale_baseline", null);
  var sentCount = Object.keys(bale.sent).length;
  var armed = meta && (sentCount > 0 || meta.count === 0);
  if (armed) return;
  state.news.forEach(function (it) { if (!bale.sent[it.id]) bale.sent[it.id] = Date.now(); });
  Store.set("pulse_bale_baseline", { count: Object.keys(bale.sent).length, t: Date.now() });
  persistBale();
}

/* the 30s heartbeat: discover chats → pull all feeds → merge → render →
   push every not-yet-sent fresh item (oldest first, max 2 per cycle) */
function baleTick() {
  if (!bale.on || !(bale.token || "").trim() || bale.busy) return;
  bale.busy = true;
  baleDiscover().catch(function () {})
  .then(function () {
    if (state.refreshing) return null; // manual refresh is already pulling feeds
    var prevIds = {};
    state.news.forEach(function (it) { prevIds[it.id] = 1; });
    return fetchAllSources().catch(function () { return []; }).then(function (fresh) {
      var added = 0;
      fresh.forEach(function (it) { if (!prevIds[it.id]) added++; });
      state.news = mergeNews(state.news, fresh);
      persist();
      if (added && typeof UI !== "undefined") { UI.render(); if (UI.renderBaleStatus) UI.renderBaleStatus(); }
      return null;
    });
  })
  .then(function () {
    baleBaseline();
    if (!bale.chats.length) return null; // nobody /started the bot yet — keep waiting
    var now = Date.now();
    var pending = state.news.filter(function (it) {
      if (bale.sent[it.id] || it._baleGo) return false;
      var age = (now - new Date(it.publishedAt).getTime()) / 3600000;
      if (age > BALE_MAX_AGE_H || age < -2) { bale.sent[it.id] = now; return false; }
      return true;
    });
    pending.reverse(); // oldest first — chronological delivery
    var batch = pending.slice(0, BALE_MAX_PER_TICK);
    var sub = Promise.resolve();
    batch.forEach(function (it) {
      sub = sub.then(function () {
        it._baleGo = true; // shared with autoCycle — never double-send one item
        it._baleTries = (it._baleTries || 0) + 1;
        // automatic pipeline v4.0: ترجمهٔ عنوان → لب کلام → ارسال با عکس
        return (it.titleFa ? Promise.resolve() : translateText(it.title).then(function (fa) {
          if (fa) { it.titleFa = fa; persist(); }
        }).catch(function () {})).then(function () {
          return ensureBaleSummary(it).catch(function () { return ""; }).then(function () {
            return ensureGist(it).then(function () {
              return baleSendItem(it, bale.chats);
            });
          });
        }).then(function (results) {
          var oks = results.filter(function (r) { return r.ok; });
          if (oks.length) {
            bale.sent[it.id] = Date.now();
            bale.sends++;
            bale.lastOk = Date.now();
            bale.lastErr = "";
            Http.toast("✓ خبر جدید به بله ارسال شد");
          } else {
            bale.lastErr = (results[0] && results[0].err) || "ارسال ناموفق بود";
            if (it._baleTries >= 3) bale.sent[it.id] = Date.now(); // poison guard
          }
          if (!oks.length && it._baleTries < 3) it._baleGo = false; // release for retry
          persistBale();
          persist();
          return new Promise(function (r) { setTimeout(r, 1500); });
        });
      });
    });
    return sub;
  })
  .catch(function (e) { bale.lastErr = (e && e.message) || "خطای نامشخص در چرخهٔ بله"; })
  .then(function () {
    bale.busy = false;
    bale.lastCheck = Date.now();
    persistBale();
    if (typeof UI !== "undefined" && UI.renderBaleStatus) UI.renderBaleStatus();
  });
}

function startBaleLoop() {
  setInterval(baleTick, BALE_TICK_MS);
  setTimeout(baleTick, 4000);
  document.addEventListener("visibilitychange", function () {
    // catch up immediately when the user comes back to the app
    if (!document.hidden) setTimeout(function () { if (!bale.busy) baleTick(); }, 1500);
  });
}

/* ================================================================
   v3.9 — چرخهٔ خودکار نیم‌ساعت:
   هر ۳۰ دقیقه: آخرین اخبار → ترجمهٔ عنوان‌ها → خلاصهٔ ساده → بله
   (همگام با baleTick از طریق bale.sent و نشانگر _baleGo — هیچ خبری
   دوبار ارسال نمی‌شود)
   ================================================================ */
var AUTO_CYCLE_MS = 30 * 60 * 1000;
var AUTO_BATCH = 6;        // حداکثر ارسال در هر چرخه
var AUTO_TRANSLATE = 24;   // حداکثر ترجمهٔ عنوان در هر چرخه

var autoCyc = {
  on: Store.get("pulse_auto_on", true),
  busy: false,
  last: Store.get("pulse_auto_last", 0),
  lastMsg: Store.get("pulse_auto_msg", ""),
  count: 0
};

function autoStatusFa() {
  if (!autoCyc.on) return "چرخهٔ خودکار نیم‌ساعت خاموش است";
  var nextMin = autoCyc.last
    ? Math.max(0, Math.round((autoCyc.last + AUTO_CYCLE_MS - Date.now()) / 60000))
    : 25;
  var base = autoCyc.last
    ? "آخرین چرخه: " + timeAgoFa(new Date(autoCyc.last).toISOString())
    : "اولین چرخه به‌زودی";
  return "🔄 " + base + (autoCyc.lastMsg ? " — " + autoCyc.lastMsg : "") +
    " · بعدی: ~" + faDigits(nextMin) + " دقیقه" + (autoCyc.busy ? " — در حال اجرا…" : "");
}

function autoCycle() {
  if (!autoCyc.on || autoCyc.busy || state.refreshing) return;
  autoCyc.busy = true;
  if (typeof UI !== "undefined" && UI.renderAutoStatus) UI.renderAutoStatus();
  fetchAllSources().catch(function () { return []; })
  .then(function (fresh) {
    state.news = mergeNews(state.news, fresh);
    persist();
    if (typeof UI !== "undefined") UI.render();
    // گام ۱ — ترجمهٔ خودکار عنوان‌های تازه
    var needFa = state.news.filter(function (it) { return !it.titleFa; }).slice(0, AUTO_TRANSLATE);
    return translateQueue(needFa, 60).then(function () {
      state.news.forEach(function (it) { if (!it.category) it.category = heuristicCategory(it); });
      persist();
    });
  })
  .then(function () {
    // گام ۲ — خلاصهٔ ساده + ارسال به بله (قدیمی‌ترین اول)
    if (!bale.on || !(bale.token || "").trim() || !bale.chats.length) return null;
    var now = Date.now();
    var pending = state.news.filter(function (it) {
      if (bale.sent[it.id] || it._baleGo) return false;
      var age = (now - new Date(it.publishedAt).getTime()) / 3600000;
      if (age > BALE_MAX_AGE_H || age < -2) { bale.sent[it.id] = now; return false; }
      return true;
    });
    pending.reverse();
    var batch = pending.slice(0, AUTO_BATCH);
    var sent = 0;
    var chain = Promise.resolve();
    batch.forEach(function (it) {
      chain = chain.then(function () {
        it._baleGo = true;
        return ensureBaleSummary(it).catch(function () { return ""; }).then(function () {
          return ensureGist(it).then(function () {
            return baleSendItem(it, bale.chats);
          });
        }).then(function (results) {
          if (results.some(function (r) { return r.ok; })) {
            bale.sent[it.id] = Date.now();
            bale.sends++;
            sent++;
            bale.lastOk = Date.now();
            bale.lastErr = "";
          } else {
            bale.lastErr = (results[0] && results[0].err) || "ارسال ناموفق بود";
            it._baleGo = false; // released for the next cycle / tick
          }
          persistBale();
          return new Promise(function (r) { setTimeout(r, 1200); });
        });
      });
    });
    return chain.then(function () {
      autoCyc.count = sent;
      autoCyc.lastMsg = sent
        ? faDigits(sent) + " خبر جدید ترجمه/خلاصه و به بله ارسال شد"
        : "خبر جدیدی برای ارسال نبود";
      if (sent && typeof Http !== "undefined" && Http.toast) Http.toast("✓ چرخهٔ خودکار: " + autoCyc.lastMsg);
      if (typeof UI !== "undefined" && UI.renderBaleStatus) UI.renderBaleStatus();
    });
  })
  .catch(function (e) { autoCyc.lastMsg = "خطا: " + ((e && e.message) || "نامشخص"); })
  .then(function () {
    autoCyc.busy = false;
    autoCyc.last = Date.now();
    Store.set("pulse_auto_last", autoCyc.last);
    Store.set("pulse_auto_msg", autoCyc.lastMsg);
    if (typeof UI !== "undefined" && UI.renderAutoStatus) UI.renderAutoStatus();
  });
}

function startAutoCycle() {
  setInterval(autoCycle, AUTO_CYCLE_MS);
  setTimeout(autoCycle, 25000); // اولین چرخه کمی بعد از راه‌اندازی
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && autoCyc.on && !autoCyc.busy && Date.now() - autoCyc.last > AUTO_CYCLE_MS) {
      setTimeout(autoCycle, 2000);
    }
  });
}

/* ================================================================
   v3.6 — بروزرسانی هوشمند روزانهٔ کاتالوگ منابع رایگان
   هر روز یک‌بار هوش مصنوعی، کاتالوگ را با تازه‌ترین وضعیت دنیای AI
   مقایسه می‌کند: منبع تازه اضافه، اطلاعات کهنه اصلاح، و منبعی که
   در بررسی پیدا نشود با نشان «ممکن است دیگر فعال نباشد» جدا می‌شود.
   ================================================================ */
var RES_STORE_ITEMS = "pulse_res_items";
var RES_STORE_T = "pulse_res_t";
var RES_STORE_DAY = "pulse_res_day";
var RES_BADGE_MS = 3 * 86400000; // نشان «جدید/بروزرسانی شد» تا ۳ روز می‌ماند

var RES = {
  cats: FREE_AI_CATS,
  items: [],
  byKey: {},
  top: FREE_AI_TOP,
  t: Store.get(RES_STORE_T, 0),
  day: Store.get(RES_STORE_DAY, ""),
  busy: false,
  err: "",
  note: "",
  added: 0,
  _triggered: false
};

function resLoad() {
  var saved = Store.get(RES_STORE_ITEMS, null);
  if (Object.prototype.toString.call(saved) === "[object Array]" && saved.length >= 10) {
    RES.items = saved;
  } else {
    RES.items = FREE_AI_ITEMS.map(function (x) { return Object.assign({}, x); });
  }
  resIndex();
}

function resIndex() {
  RES.byKey = {};
  RES.items.forEach(function (x) { RES.byKey[x.key] = x; });
  var alive = RES.items.filter(function (x) { return !x._gone; });
  var withG = alive.filter(function (x) { return x.grank; });
  if (withG.length >= 5) {
    withG.sort(function (a, b) { return a.grank - b.grank; });
    RES.top = withG.slice(0, 5).map(function (x) { return x.key; });
  }
}

function resSave() {
  Store.set(RES_STORE_ITEMS, RES.items);
  Store.set(RES_STORE_T, RES.t);
  Store.set(RES_STORE_DAY, RES.day);
}

function resSaveItems() { Store.set(RES_STORE_ITEMS, RES.items); }

/* ---------- ① پرامپت سردبیر ارشد کاتالوگ ---------- */
var RES_SYSTEM = [
  "ROLE — You are the Senior Catalog Curator of the Persian AI-news app «پالس هوش مصنوعی». You maintain its flagship catalog: the world's most powerful and genuinely FREE AI resources (model APIs & chatbots, image/video/audio tools, search & data APIs, agent & automation platforms, AI coding tools).",
  "",
  "TASK — Today is {date}. Audit the CURRENT CATALOG given in the user message against your latest knowledge, then return the UPDATED catalog.",
  "",
  "HARD RULES",
  "1. Only real, currently active, well-known services with a genuinely free tier (free plan, free daily/monthly quota, or keyless free API). No trials-only services, no credit-card-required ones, no dead or deprecated services, no rumors, no invented names.",
  "2. If a listed service has shut down, gone paid-only, or become untrustworthy — OMIT it from your output (omission = removal).",
  "3. If a stronger free resource emerged recently (new model releases, new free tiers, new free tools) — ADD it.",
  "4. Fix stale facts: updated model names/versions, changed quotas, renamed products. Keep product/model/company names in Latin exactly (Gemini 2.5 Flash, Llama 4, GLM-4.6, Groq, z.ai ...).",
  "5. Categories stay fixed: \"chat\" = LLM APIs & chatbots, \"media\" = image/video/audio generation, \"search\" = search & data APIs, \"agents\" = agent & automation platforms, \"code\" = AI coding tools & editors.",
  "6. Keep the \"key\" field of existing items unchanged. For brand-new items choose a short latin slug as key.",
  "7. grank = global value ranking across the whole catalog, 1 = the most valuable free AI resource in the world right now. Be opinionated, current and strict.",
  "",
  "OUTPUT FORMAT — STRICT",
  "Return ONLY one valid JSON array. No markdown fences, no comments, no text before or after it. One object per resource, exactly this schema with keys in this order:",
  "{\"key\":\"groq\",\"cat\":\"chat\",\"grank\":1,\"emoji\":\"⚡\",\"name\":\"Groq\",\"host\":\"groq.com\",\"tag\":\"\",\"fa\":\"...\",\"site\":\"https://groq.com\",\"api\":\"https://console.groq.com/keys\",\"apilabel\":\"کلید رایگان\"}",
  "",
  "FIELD RULES",
  "- 24 to 30 items total; every category covered (at least 3 items each).",
  "- fa: fluent, simple, friendly conversational Persian (زبان ساده و روان فارسی), 25-45 words: what it is + what exactly is free + who benefits. No hype, no exact quota numbers unless 100% certain. Keep tool/model names Latin inside the Persian text.",
  "- tag: optional short Persian label, max 4 words (like «در این اپ فعال» or «سریع‌ترین اینفرنس»), else empty string.",
  "- emoji: one fitting emoji character.",
  "- api: URL of the free API-key page when one exists, else empty string. apilabel: «کلید رایگان» or «مستندات» or «توکن رایگان» accordingly, else empty string.",
  "- host: bare domain like \"groq.com\".",
  "- Do not change a service's category unless it truly belongs elsewhere now."
].join("\n");

function resCompact(x) {
  var o = { key: x.key, cat: x.cat, grank: x.grank || undefined, emoji: x.emoji, name: x.name, host: x.host || "", fa: x.fa, site: x.site };
  if (x.tag) o.tag = x.tag;
  if (x.api) { o.api = x.api; o.apilabel = x.apilabel || ""; }
  return o;
}

function resSlug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "res-" + Date.now();
}

function resCatColor(cat) {
  var c = FREE_AI_CATS.find(function (x) { return x.key === cat; });
  return c ? c.color : "#2563EB";
}

/* ---------- ② اعتبارسنجی سخت‌گیرانهٔ خروجی AI ---------- */
function resValidate(raw) {
  var arr = extractJsonArray(raw);
  if (Object.prototype.toString.call(arr) !== "[object Array]") throw new Error("nojson");
  var out = [], seen = {};
  arr.forEach(function (o, i) {
    try {
      if (!o || typeof o.name !== "string" || typeof o.fa !== "string") return;
      var name = o.name.trim(), fa = o.fa.trim();
      if (name.length < 2 || name.length > 70 || fa.length < 40 || fa.length > 500) return;
      if (persianRatio(fa) < 0.25) return; // توضیح باید فارسی باشد
      var site = safeUrl(o.site);
      if (!site) return;
      var cat = (typeof o.cat === "string" && FREE_AI_CATS.some(function (c) { return c.key === o.cat; })) ? o.cat : "";
      if (!cat) {
        var blob = (name + " " + fa + " " + (o.host || "")).toLowerCase();
        if (/تصویر|ویدیو|صدا|عکس|image|video|photo|audio|music/.test(blob)) cat = "media";
        else if (/جست|search|jina|tavily|serper|brave|داده/.test(blob)) cat = "search";
        else if (/عامل|اتوماسیون|agent|automat|colab|langflow|n8n|gradio|workflow/.test(blob)) cat = "agents";
        else if (/کد|ادیتور|terminal|code|editor|copilot|cursor|cli/.test(blob)) cat = "code";
        else cat = "chat";
      }
      var key = (typeof o.key === "string" && /^[a-z0-9][a-z0-9-]{1,39}$/.test(o.key)) ? o.key : resSlug(name);
      if (seen[key]) return;
      seen[key] = 1;
      var host = (typeof o.host === "string" && o.host) ? o.host.slice(0, 80) : site.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
      out.push({
        key: key, cat: cat, grank: (+o.grank || i + 1), emoji: (typeof o.emoji === "string" && o.emoji && o.emoji.length <= 8) ? o.emoji : "✨",
        name: name, host: host,
        tag: (typeof o.tag === "string" && o.tag && o.tag.length <= 40) ? o.tag : "",
        fa: fa, color: resCatColor(cat),
        site: site, api: safeUrl(o.api),
        apilabel: (typeof o.apilabel === "string" && o.apilabel && o.apilabel.length <= 30) ? o.apilabel : (safeUrl(o.api) ? "کلید رایگان" : "")
      });
    } catch (e) {}
  });
  if (out.length < 8) throw new Error("پاسخ هوش مصنوعی قابل اعتماد نبود — کاتالوگ قبلی حفظ شد");
  return out.slice(0, 34);
}

/* ---------- ③ ادغام: تازه‌ها اضافه، تغییرها نشان، غایب‌ها جدا ---------- */
function resMerge(list) {
  var now = Date.now();
  var pool = list.slice();
  var aliveCount = RES.items.filter(function (x) { return !x._gone; }).length;
  RES.coverage = aliveCount ? Math.min(1, list.length / aliveCount) : 1;
  var result = [], added = 0;
  RES.items.forEach(function (cur0) {
    var cur = Object.assign({}, cur0);
    var hit = -1;
    for (var i = 0; i < pool.length; i++) {
      var a = pool[i];
      if (!a) continue;
      var nA = a.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
      var nC = cur.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
      var sameName = nA === nC || (nA.length > 5 && nC.length > 5 && (nA.indexOf(nC) >= 0 || nC.indexOf(nA) >= 0));
      var sameHost = !!cur.host && !!a.host && a.host.toLowerCase().replace(/^www\./, "") === cur.host.toLowerCase().replace(/^www\./, "");
      if (a.key === cur.key || sameName || sameHost) { hit = i; break; }
    }
    if (hit < 0) {
      // هوش مصنوعی این منبع را در فهرست تازه نیاورد
      if (!cur._gone && RES.coverage >= 0.65) cur._gone = now;
      result.push(cur);
      return;
    }
    var up = pool[hit];
    pool[hit] = null;
    var changed = up.fa !== cur.fa || up.name !== cur.name || (up.tag || "") !== (cur.tag || "") ||
      (up.api || "") !== (cur.api || "") || up.site !== cur.site;
    cur.cat = up.cat; cur.grank = up.grank; cur.emoji = up.emoji; cur.name = up.name;
    cur.host = up.host || cur.host; cur.tag = up.tag; cur.fa = up.fa;
    cur.site = up.site; cur.color = cur.color || up.color;
    if (up.api) { cur.api = up.api; cur.apilabel = up.apilabel || cur.apilabel || ""; }
    else { cur.api = cur.api || ""; }
    cur._gone = 0;
    if (changed && !cur._upd) cur._upd = now;
    if (changed && cur._upd && now - cur._upd > RES_BADGE_MS) cur._upd = now;
    cur._fresh = true;
    result.push(cur);
  });
  pool.forEach(function (a) {
    if (!a) return;
    a._new = now; a._upd = 0; a._gone = 0; a._fresh = true;
    result.push(a);
    added++;
  });
  // مرتب‌سازی: اول طبق رتبهٔ جهانی AI، بعد بازتولید rank داخلی هر دسته
  result.forEach(function (x) { if (!x.grank) x.grank = 999; });
  result.sort(function (a, b) { return (a.grank - b.grank) || String(a.name).localeCompare(String(b.name)); });
  var counters = {};
  result.forEach(function (x) {
    counters[x.cat] = (counters[x.cat] || 0) + 1;
    x.rank = counters[x.cat];
  });
  RES.items = result;
  resIndex();
  resSaveItems();
  return { added: added };
}

/* ---------- ④ اجرای بروزرسانی هوشمند ---------- */
function resDue() {
  if (RES.busy || RES._triggered) return false;
  if (!RES.t) return false; // بار اول دکمهٔ دستی — کاتالوگ پایه تازهٔ سردبیری است
  return RES.day !== todayKey();
}

function resUpdate(manual) {
  if (RES.busy) return Promise.reject(new Error("بروزرسانی در حال اجراست"));
  RES.busy = true;
  RES.err = "";
  RES.note = "در حال آماده‌سازی…";
  RES.added = 0;
  if (typeof UI !== "undefined" && UI.resTick) UI.resTick();
  var current = RES.items.filter(function (x) { return !x._gone; }).map(resCompact);
  var sys = RES_SYSTEM.replace("{date}", todayKey());
  var user = "CURRENT CATALOG (" + current.length + " items, JSON):\n" + JSON.stringify(current);
  return aiText(sys, user, function (m) {
    RES.note = m || "";
    if (typeof UI !== "undefined" && UI.resTick) UI.resTick(m);
  }).then(function (raw) {
    var list = resValidate(raw);
    var r = resMerge(list);
    RES.t = Date.now();
    RES.day = todayKey();
    RES.added = r.added;
    resSave();
    RES.busy = false;
    RES.note = "";
    if (typeof UI !== "undefined" && UI.resFinished) UI.resFinished(null, r.added);
    return r;
  }).catch(function (e) {
    RES.busy = false;
    RES.note = "";
    RES.err = (e && e.message && e.message.indexOf("__free") !== 0)
      ? (e.message || "") : "سرور هوش مصنوعی رایگان موقتاً شلوغ است — کمی بعد دوباره تلاش کن";
    if (typeof UI !== "undefined" && UI.resFinished) UI.resFinished(RES.err, 0);
    throw e;
  });
}

/* هوک کوچک برای کنترل کیفیت (بدون اثر جانبی در کار عادی) */
window.__resDebug = {
  validate: resValidate,
  merge: resMerge,
  update: resUpdate,
  state: function () { return { t: RES.t, day: RES.day, busy: RES.busy, n: RES.items.length, err: RES.err, added: RES.added }; },
  list: function () { return RES.items.map(function (x) { return x.key + (x._gone ? "*" : "") + (x._new ? "+" : "") + (x._upd ? "~" : ""); }).join(","); }
};

/* ================================================================
   v3.7 — آموزش مختصر و ساده برای هر منبع کاتالوگ (با محدودیت‌ها)
   یک‌بار با AI ساخته و در حافظهٔ گوشی کش می‌شود.
   ================================================================ */
var RES_GUIDE_PROMPT = "تو مدرس فارسی‌زبان اپ «پالس هوش مصنوعی» هستی. برای سرویس/ابزار معرفی‌شده یک آموزش کامل ولی مختصر به زبان ساده و محاوره‌ای فارسی بنویس، دقیقاً با این پنج بخش:\n" +
  "«چیست؟» — ۲ تا ۳ جمله.\n" +
  "«شروع سریع» — ۳ تا ۵ قدم شماره‌دار: از ثبت‌نام تا اولین استفاده.\n" +
  "«چه چیزهایی رایگان است؟» — ۲ تا ۴ مورد کوتاه با خط تیره.\n" +
  "«محدودیت‌ها» — ۳ تا ۵ مورد کوتاه با خط تیره: سهمیه‌های رایگان، نیاز به ثبت‌نام یا شماره، تحریم یا فیلترینگ احتمالی برای کاربران ایران، سانسور محتوایی، سرعت، پشتیبانی از فارسی. چیزی که مطمئن نیستی را با «ممکن است تغییر کرده باشد» بگو.\n" +
  "«ترفند» — یک نکتهٔ کاربردی در یک جمله.\n" +
  "بدون مقدمه و تعارف؛ اسم ابزارها، مدل‌ها و اصطلاحات تخصصی لاتین بماند؛ چیزی که مطمئن نیستی از خودت نساز.";

function resGuideText(key) {
  var x = RES.byKey[key];
  if (!x) return Promise.reject(new Error("منبع پیدا نشد"));
  var ck = "pulse_res_guide_" + key;
  var saved = Store.get(ck, "");
  if (saved) return Promise.resolve(saved);
  var user = "نام: " + x.name + "\nدامنه: " + (x.host || "") + "\nسایت: " + x.site +
    (x.api ? "\nصفحهٔ کلید/API: " + x.api : "") + "\nتوضیح فعلی اپ: " + x.fa;
  return aiText(RES_GUIDE_PROMPT, user, null).then(function (out) {
    var t = String(out).trim();
    if (t.length < 80) throw new Error("راهنمای قابل اعتماد ساخته نشد — دوباره تلاش کن");
    Store.set(ck, t);
    return t;
  });
}

/* ================================================================
   v3.7 — ذخیرهٔ خروجی‌های اسپیس (عکس/ویدیو/صدا) بدون لاگین
   WebView به‌صورت منفعلانه هر فایل رسانه‌ای که اسپیس‌ها می‌سازند
   ردیابی می‌کند (shouldInterceptRequest در MainActivity) و اینجا
   لیست آن‌ها + ذخیرهٔ مستقیم در Downloads گوشی فراهم است.
   ================================================================ */
var MediaSaver = (function () {
  var seq = 0;
  var pending = {};
  window.__onSaved = function (id, ok, info) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    if (ok) p.ok(info);
    else p.fail(new Error(info || "ذخیره ممکن نشد"));
  };
  function save(url, name) {
    return new Promise(function (resolve, reject) {
      var id = "s" + (++seq);
      pending[id] = { ok: resolve, fail: reject };
      setTimeout(function () {
        if (pending[id]) { delete pending[id]; reject(new Error("زمان ذخیره به پایان رسید")); }
      }, 90000);
      try {
        PulseAndroid.saveMedia(id, url, name || "");
      } catch (e) { delete pending[id]; reject(new Error("ذخیره در این دستگاه پشتیبانی نمی‌شود")); }
    });
  }
  function recent() {
    try { return JSON.parse(PulseAndroid.recentMedia()) || []; } catch (e) { return []; }
  }
  return { save: save, recent: recent };
})();

/* بارگذاری کاتالوگ (ذخیره‌شده یا پایه) قبل از اولین رندر */
resLoad();
