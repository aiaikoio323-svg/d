/* ================================================================
   AI Pulse — Cloud Bale Bot (v3.9 pipeline)
   همان خط لولهٔ اپ «پالس هوش مصنوعی» روی سرور گیت‌هاب:
     منابع خبری → ترجمهٔ عنوان (با اصطلاحات محافظت‌شده)
     → پست حرفه‌ای کانال (CHANNEL_PROMPT v3.9) → ارسال با عکس به بله
   بدون هیچ وابستگی — فقط Node 18+ (fetch داخلی).
   تنظیمات با Environment:
     BALE_TOKEN  (اجباری)  توکن ربات بله
     BALE_CHATS  (اختیاری) شناسه‌ها با کاما: 1663835599,@mychannel
     GEMINI_KEY  (اختیاری) کلید جمینی — پیشنهاد می‌شود
     GLM_KEY     (اختیاری) کلید GLM-4 از open.bigmodel.cn
     MAX_POSTS   (اختیاری) حداکثر ارسال در هر اجرا (پیشفرض ۶)
     MAX_AGE_H   (اختیاری) حداکثر عمر خبر (پیشفرض ۳۶ ساعت)
   اجرا:  node bot.js          → عادی (ارسال واقعی + ذخیرهٔ state)
          node bot.js --dry    → آزمایشی (فقط چاپ، بدون ارسال/ذخیره)
   ================================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const DRY = process.argv.includes("--dry");
const ROOT = __dirname;
const STATE_FILE = path.join(ROOT, "state.json");

const BALE_TOKEN = (process.env.BALE_TOKEN || "").trim();
const BALE_CHATS = (process.env.BALE_CHATS || "1663835599").split(",").map(s => s.trim()).filter(Boolean);
const GEMINI_KEY = (process.env.GEMINI_KEY || "").trim();
const GLM_KEY = (process.env.GLM_KEY || "").trim();
const MAX_POSTS = parseInt(process.env.MAX_POSTS || "6", 10);
const MAX_AGE_H = parseInt(process.env.MAX_AGE_H || "36", 10);
const FIRST_RUN_KEEP = 2;   // اولین اجرا فقط ۲ خبر تازه می‌فرستد تا کانال شلوغ نشود
const FOOTER = " | ربات @aiautonewsbot";
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36";

/* ---------- منابع خبری (همان اپ — data.js) ---------- */
const SOURCES = [
  { id: "techcrunch", name: "TechCrunch AI", nameFa: "تک‌کرانچ", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { id: "theverge", name: "The Verge AI", nameFa: "ورج", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { id: "arstechnica", name: "Ars Technica AI", nameFa: "آرس‌تکنیکا", url: "https://arstechnica.com/ai/feed/" },
  { id: "mittr", name: "MIT Technology Review", nameFa: "ام‌آی‌تی", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed" },
  { id: "wired", name: "Wired AI", nameFa: "وایرد", url: "https://www.wired.com/feed/tag/ai/latest/rss" },
  { id: "venturebeat", name: "VentureBeat AI", nameFa: "ونچربیت", url: "https://venturebeat.com/category/ai/feed/" },
  { id: "zdnet", name: "ZDNet AI", nameFa: "زد‌دنت", url: "https://www.zdnet.com/topic/artificial-intelligence/rss.xml" },
  { id: "openai", name: "OpenAI News", nameFa: "اوپن‌ای‌آی", url: "https://openai.com/news/rss.xml" },
  { id: "deepmind", name: "Google DeepMind", nameFa: "دیپ‌مایند", url: "https://deepmind.google/blog/rss.xml" },
  { id: "googleai", name: "Google AI Blog", nameFa: "وبلاگ گوگل", url: "https://blog.google/technology/ai/rss/" },
  { id: "huggingface", name: "Hugging Face Blog", nameFa: "هاگینگ فیس", url: "https://huggingface.co/blog/feed.xml" },
  { id: "simonw", name: "Simon Willison", nameFa: "سایمون ویلیسون", url: "https://simonwillison.net/atom/everything/" },
  { id: "ieeespectrum", name: "IEEE Spectrum AI", nameFa: "آی‌تریپل‌ای", url: "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss" },
  { id: "marktechpost", name: "MarkTechPost", nameFa: "مارک‌تک‌پست", url: "https://www.marktechpost.com/feed/" },
  { id: "sciencedaily", name: "ScienceDaily AI", nameFa: "ساینس‌دیلی", url: "https://www.sciencedaily.com/rss/computers_math/artificial_intelligence.xml" },
  { id: "siliconangle", name: "SiliconANGLE AI", nameFa: "سیلیکون‌انگل", url: "https://siliconangle.com/category/ai/feed/" },
  { id: "nvidia", name: "NVIDIA Blog", nameFa: "انویدیا", url: "https://blogs.nvidia.com/feed/" },
  { id: "googleres", name: "Google Research", nameFa: "تحقیقات گوگل", url: "https://research.google/blog/rss/" },
  { id: "guardian", name: "The Guardian AI", nameFa: "گاردین", url: "https://www.theguardian.com/technology/artificialintelligenceai/rss" },
  { id: "awsml", name: "AWS ML Blog", nameFa: "آمازون AWS", url: "https://aws.amazon.com/blogs/machine-learning/feed/" },
  { id: "mlmastery", name: "ML Mastery", nameFa: "ماشین‌لرنینگ مستری", url: "https://machinelearningmastery.com/blog/feed/" },
  { id: "uniteai", name: "Unite.AI", nameFa: "یونایت‌ای‌آی", url: "https://www.unite.ai/feed/" },
  { id: "singularityhub", name: "Singularity Hub", nameFa: "سینگولاریتی هاب", url: "https://singularityhub.com/feed/" },
  { id: "aitrends", name: "AI Trends", nameFa: "ای‌آی ترندز", url: "https://www.aitrends.com/feed/" },
  { id: "thenewstack", name: "The New Stack AI", nameFa: "نیو استک", url: "https://thenewstack.io/category/ai/feed/" }
];

/* ---------- پرامپت حرفه‌ای (دقیقاً همان CHANNEL_PROMPT اپ v3.9) ---------- */
const CHANNEL_PROMPT =
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

/* ---------- اصطلاحات محافظت‌شده برای مترجم (همان data.js) ---------- */
const PROTECTED_PHRASES = [
  "ChatGPT", "Copilot", "NotebookLM", "Midjourney", "Perplexity", "Runway", "Cursor",
  "DeepSeek", "Qwen", "Grok", "Mistral", "Mixtral", "Llama", "Claude", "Gemini",
  "Whisper", "Imagen", "Sora", "Veo", "Gemma", "Kimi", "Hunyuan", "Devin",
  "Stable Diffusion", "DALL-E", "DALL·E", "LoRA", "RLHF", "CoT", "MCP",
  "Blackwell", "Hopper", "CUDA", "TensorRT",
  "OpenAI", "Anthropic", "DeepMind", "Microsoft", "NVIDIA", "Nvidia", "Tesla",
  "Meta", "Apple", "Amazon", "Samsung", "xAI", "Hugging Face", "HuggingFace",
  "GitHub", "GitLab", "AWS", "Google Cloud", "Vertex", "Playground",
  "TechCrunch", "The Verge", "Ars Technica", "Wired", "MIT Technology Review",
  "VentureBeat", "ZDNet", "Reuters", "Bloomberg", "IEEE Spectrum", "MarkTechPost",
  "ScienceDaily", "SiliconANGLE", "Machine Learning Mastery", "Unite.AI",
  "Singularity Hub", "AI Trends", "The New Stack", "The Guardian", "Tom's Hardware",
  "CNBC", "Forbes", "Business Insider", "Financial Times", "The Information",
  "API", "APIs", "LLM", "LLMs", "GPU", "GPUs", "TPU", "TPUs", "CPU", "RAM",
  "RAG", "SDK", "SaaS", "token", "tokens", "prompt", "prompts",
  "prompt engineering", "fine-tuning", "fine-tuned", "fine-tune",
  "open source", "open-source", "open-weight", "open weights",
  "benchmark", "benchmarks", "AGI", "chatbot", "chatbots", "chat bot",
  "agentic", "agent", "agents", "multimodal", "transformer", "Transformers",
  "embedding", "embeddings", "context window", "inference", "tokenizer",
  "dataset", "datasets", "diffusion", "chain-of-thought", "reasoning model",
  "reasoning models", "world model", "world models", "GPU cluster", "datacenter",
  "data center", "startup", "startups", "app store", "web app", "cloud",
  "framework", "plugin", "plugins", "dashboard", "workflow", "workflows"
];
const PROTECTED_PATTERNS = [
  "GPT[-\\s]?\\d(?:\\.\\d+)?[a-z]{0,2}(?:[-\\s]?(?:mini|nano|turbo|preview|pro|ultra|flash|thinking))?",
  "\\bo[134](?:[-\\s]?(?:mini|preview|pro|high|low))?(?:\\b|$)",
  "(?:Opus|Sonnet|Haiku)[-\\s]?\\d(?:\\.\\d+)?",
  "\\b(?:H1?0{2}|A100|B200|GB200|RTX\\s?\\d{3,4})\\b",
  "(?:Llama|Gemma|Qwen|Phi|DeepSeek|Mixtral|Mistral)[-\\s]?\\d(?:\\.\\d+)?[a-z]{0,2}",
  "\\bPhi[-\\s]?\\d(?:\\.\\d+)?\\b",
  "\\bWan[-\\s]?\\d(?:\\.\\d+)?\\b",
  "(?:Pro|Flash|Ultra|Nano)[-\\s]?\\d(?:\\.\\d+)?(?:[-\\s]?(?:mini|preview|thinking|lite))?",
  "(?:R1|R2|V3|V4)\\b"
];
const PROT_RE = new RegExp("(" +
  PROTECTED_PHRASES.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length)
    .concat(PROTECTED_PATTERNS).join("|") + ")", "gi");

const POST_FIX_FA = [
  [/رابط\s*(?:برنامه[\u200c\s]*نویسی(?:\s*کاربردی)?|کاربردی)\s*/g, "API "],
  [/ای[\u200c\s]*پی[\u200c\s]*ای/g, "API"],
  [/ال[\u200c\s]*ال[\u200c\s]*ام/g, "LLM"],
  [/جی[\u200c\s]*پی[\u200c\s]*تی/g, "GPT"],
  [/جی[\u200c\s]*پی[\u200c\s]*یو/g, "GPU"],
  [/چت[\u200c\s]*بات/g, "chatbot"],
  [/چت[\u200c\s]*جی[\u200c\s]*پی[\u200c\s]*تی/g, "ChatGPT"],
  [/توکِ?ن/g, "token"],
  [/پرامپت/g, "prompt"]
];

/* ---------- ابزارهای عمومی ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchT(url, opts = {}, ms = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ac.signal, headers: { "User-Agent": UA, ...(opts.headers || {}) } });
  } finally { clearTimeout(t); }
}

function decodeEntities(s) {
  const map = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", middot: "·" };
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, k) => map[k.toLowerCase()] != null ? map[k.toLowerCase()] : m);
}

function stripHtml(html) {
  return decodeEntities(String(html || "")
    .replace(/<img[^>]*>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ").trim();
}

function safeUrl(u) {
  const t = String(u || "").trim();
  if (/^https:\/\//i.test(t)) return t;
  if (/^http:\/\//i.test(t)) return t.replace(/^http:/i, "https:");
  return "";
}

function persianRatio(s) {
  const t = String(s || "").replace(/[^\u0600-\u06FF a-zA-Z]/g, "");
  if (!t) return 0;
  return (t.match(/[\u0600-\u06FF]/g) || []).length / t.length;
}

/* ---------- پارسر فید (جایگزین DOMParser در Node) ---------- */
function tagText(block, names) {
  for (const name of names) {
    const re = new RegExp("<(?:[a-z0-9]+:)?" + name + "(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-z0-9]+:)?" + name + ">", "i");
    const m = re.exec(block);
    if (m && m[1].trim()) return decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).trim();
  }
  return "";
}

function extractImage(block, rawDesc) {
  const tags = block.match(/<(media:thumbnail|media:content|enclosure)\b[^>]*>/gi) || [];
  for (const tg of tags) {
    const url = safeUrl((tg.match(/url="([^"]+)"/i) || [])[1] || (tg.match(/href="([^"]+)"/i) || [])[1] || "");
    if (!url) continue;
    const type = (tg.match(/type="([^"]+)"/i) || [])[1] || "";
    if (/^image\//i.test(type) || /thumbnail/i.test(tg) || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url)) return url;
  }
  const img = /<img[^>]+src=["']([^"']+)["']/i.exec(rawDesc || "");
  return img ? safeUrl(decodeEntities(img[1])) : "";
}

function parseFeed(xml, source) {
  const blocks = [];
  const re = /<(item|entry)\b[\s\S]*?<\/\1>/gi;
  let m;
  while ((m = re.exec(xml)) && blocks.length < 15) blocks.push(m[0]);
  const isAtom = /<feed[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  const out = [];
  for (const b of blocks) {
    const title = stripHtml(tagText(b, ["title"]));
    let link = "";
    if (isAtom) {
      const links = b.match(/<link\b[^>]*>/gi) || [];
      for (const l of links) {
        const rel = (l.match(/rel="([^"]*)"/i) || [])[1] || "";
        const href = safeUrl((l.match(/href="([^"]+)"/i) || [])[1]);
        if (href && (!rel || rel === "alternate")) { link = href; break; }
      }
    } else {
      link = safeUrl(tagText(b, ["link"]));
    }
    if (!link) continue;
    const rawDesc = tagText(b, ["description"]) || tagText(b, ["summary"]) || tagText(b, ["encoded", "content"]);
    const dateStr = tagText(b, ["pubdate", "pubDate"]) || tagText(b, ["published"]) || tagText(b, ["updated"]);
    let t = dateStr ? new Date(dateStr).getTime() : NaN;
    if (isNaN(t)) t = Date.now();
    out.push({
      id: link, link, title,
      desc: stripHtml(rawDesc).slice(0, 700),
      image: extractImage(b, rawDesc),
      sourceId: source.id,
      publishedAt: new Date(t).toISOString()
    });
  }
  return out.filter(it => it.title && it.link);
}

async function fetchSource(src) {
  try {
    const res = await fetchT(src.url, { headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" } }, 25000);
    if (!res.ok) throw new Error("HTTP " + res.status);
    return parseFeed(await res.text(), src);
  } catch (e) {
    console.log("⚠ منبع «" + src.nameFa + "» پاسخ نداد (" + (e.message || e) + ")");
    return [];
  }
}

/* ---------- استخراج متن کامل مقاله (نسخهٔ regex از extractArticleText اپ) ---------- */
const JUNK_P = /(subscribe|newsletter|sign in|log in|sign up|register|advertisement|all rights reserved|read more|accept cookies|cookie policy|privacy policy|terms of service|click here|share this|follow us|skip to content|©)/i;

function extractArticleText(html) {
  html = String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(nav|footer|header|aside|form|noscript)\b[\s\S]*?<\/\1>/gi, " ");
  const out = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(html))) {
    const t = stripHtml(m[1]);
    if (t.length < 60 || t.length > 2000) continue;
    const letters = t.replace(/[^a-zA-Z]/g, "");
    if (letters.length > 12 && ((t.match(/[A-Z]/g) || []).length / letters.length) > 0.45) continue;
    if (JUNK_P.test(t) && t.length < 220) continue;
    if (/^(photo|image|caption|getty|reuters\/|ap photo)/i.test(t)) continue;
    out.push(t);
  }
  return out.join("\n\n");
}

async function fetchFullArticle(it) {
  try {
    const res = await fetchT(it.link, {}, 20000);
    if (!res.ok) return "";
    const text = extractArticleText(await res.text());
    return text.length > 250 ? text.slice(0, 6500) : "";
  } catch (e) { return ""; }
}

/* ---------- ترجمه (همان زنجیرهٔ اپ: gtx → mymemory + اصطلاحات محافظت‌شده) ---------- */
function protectTerms(text) {
  const terms = [];
  const masked = String(text).replace(PROT_RE, m => { terms.push(m); return "XQ" + (terms.length - 1) + "XQ"; });
  return { masked, terms };
}
function unmaskAfterTranslate(translated, terms) {
  let out = String(translated).replace(/XQ\s*(\d{1,3})\s*XQ/g, (_, d) => terms[+d] != null ? terms[+d] : "");
  for (const [re, rep] of POST_FIX_FA) out = out.replace(re, rep);
  return out.replace(/ {2,}/g, " ").trim();
}
async function gtx(text) {
  const u = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fa&dt=t&q=" + encodeURIComponent(text.slice(0, 1800));
  const res = await fetchT(u, {}, 15000);
  const data = JSON.parse(await res.text());
  if (!data || !data[0]) throw new Error("gtx");
  return data[0].map(seg => seg[0] || "").join("").trim();
}
async function mymem(text) {
  const u = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text.slice(0, 480)) + "&langpair=en|fa&de=pulse%40aipulse.app";
  const res = await fetchT(u, {}, 15000);
  const data = JSON.parse(await res.text());
  const t = data && data.responseData && data.responseData.translatedText;
  if (!t || /MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(t)) throw new Error("mymem");
  return t.trim();
}
async function translateText(text) {
  if (!text || /[\u0600-\u06FF]/.test(text.slice(0, 30))) return text || "";
  const mask = protectTerms(text);
  try {
    const out = await gtx(mask.masked.slice(0, 1700)).catch(() => mymem(mask.masked));
    return out ? unmaskAfterTranslate(out, mask.terms) : "";
  } catch (e) { return ""; }
}

/* ================================================================
   زنجیرهٔ هوش مصنوعی — ۱) جمینی (کلید Secrets) → ۲) GLM-4 → ۳) رایگان
   ================================================================ */
const GEMINI_MODELS = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3-flash", "gemini-2.5-flash", "gemini-2.0-flash"];
const GLM_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

async function geminiText(system, userText) {
  if (!GEMINI_KEY) throw Object.assign(new Error("کلید جمینی (GEMINI_KEY) تنظیم نشده"), { status: 0 });
  let lastErr = null;
  for (const model of GEMINI_MODELS) {
    const body = {
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
    };
    if (model.includes("2.5")) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";
    const payload = JSON.stringify(body);
    let req;
    if (GEMINI_KEY.startsWith("AQ.")) {
      // کلیدهای جدید AI Studio با هدر x-goog-api-key کار می‌کنند
      req = () => fetchT(url, { method: "POST", headers: { "x-goog-api-key": GEMINI_KEY, "Content-Type": "application/json" }, body: payload }, 45000);
    } else {
      req = () => fetchT(url + "?key=" + encodeURIComponent(GEMINI_KEY), { method: "POST", headers: { "Content-Type": "application/json" }, body: payload }, 45000);
    }
    let res = await req();
    if ((res.status === 401 || res.status === 403) && GEMINI_KEY.startsWith("AQ.")) {
      res = await fetchT(url, { method: "POST", headers: { "Authorization": "Bearer " + GEMINI_KEY, "Content-Type": "application/json" }, body: payload }, 45000);
    }
    if (res.status !== 200) {
      lastErr = Object.assign(new Error("HTTP " + res.status), { status: res.status });
      if ([400, 401, 403, 429].includes(res.status)) throw lastErr;
      continue; // خطای 5xx → مدل بعدی
    }
    const data = JSON.parse(await res.text());
    const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    const text = parts ? parts.map(p => p.text || "").join("") : "";
    if (!text) { lastErr = new Error("پاسخ خالی جمینی"); continue; }
    return text;
  }
  throw lastErr || new Error("جمینی پاسخ نداد");
}

async function glmText(system, userText) {
  if (!GLM_KEY) throw Object.assign(new Error("کلید GLM-4 (GLM_KEY) تنظیم نشده"), { status: 0 });
  const body = {
    model: "glm-4-flash",
    messages: [system ? { role: "system", content: system } : null, { role: "user", content: userText }].filter(Boolean),
    temperature: 0.7
  };
  const res = await fetchT(GLM_URL, { method: "POST", headers: { "Authorization": "Bearer " + GLM_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) }, 45000);
  if (res.status !== 200) throw Object.assign(new Error("HTTP " + res.status), { status: res.status });
  const data = JSON.parse(await res.text());
  const txt = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!txt || !String(txt).trim()) throw new Error("پاسخ خالی GLM-4");
  return String(txt).trim();
}

async function freeAIText(system, userText) {
  const body = { model: "openai", messages: [system ? { role: "system", content: system } : null, { role: "user", content: userText }].filter(Boolean), referrer: "aipulse" };
  for (let i = 0; i < 2; i++) {
    const res = await fetchT("https://text.pollinations.ai/openai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 60000);
    if (res.status === 200) {
      try {
        const data = JSON.parse(await res.text());
        const txt = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (txt && String(txt).trim()) return String(txt).trim();
      } catch (e) {}
    }
    if (i === 0) { console.log("… سرور رایگان شلوغ است — ۳۵ ثانیه صبر و تلاش دوباره"); await sleep(35000); }
  }
  throw new Error("موتور رایگان پاسخ نداد");
}

async function aiText(system, userText) {
  const chain = [["gemini", geminiText], ["glm", glmText], ["free", freeAIText]];
  for (const [name, fn] of chain) {
    try {
      const out = await fn(system, userText);
      if (name !== "free") console.log("✓ پست با موتور " + (name === "gemini" ? "جمینی" : "GLM-4") + " ساخته شد");
      else console.log("✓ پست با موتور رایگان ساخته شد");
      return out;
    } catch (e) {
      console.log("⚠ موتور " + name + " نشد (" + (e.message || e) + ") → موتور بعدی");
    }
  }
  throw new Error("هیچ موتور هوش مصنوعی در دسترس نبود");
}

/* ================================================================
   بله — کپشن و ارسال (همان منطق اپ v3.8/v3.9)
   ================================================================ */
function baleEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function baleCaption(it, html) {
  const t = (it.titleFa || it.title || "").trim();
  const body = String(it.simpleFa || "").trim();
  const link = it.link || "";
  const src = SOURCES.find(s => s.id === it.sourceId) || {};
  const foot = "📡 " + (src.nameFa || src.name || "پالس هوش مصنوعی") + FOOTER;
  const linkLine = html ? '<a href="' + link.replace(/&/g, "&amp;") + '">📖 خواندن متن کامل خبر</a>'
    : "📖 خواندن متن کامل خبر:\n" + link;
  const budget = Math.max(100, 1000 - (t.length + link.length + foot.length + 80));
  let out = html ? "<b>" + baleEsc(t) + "</b>" : baleEsc(t);
  if (body) {
    out += "\n\n" + baleEsc(body.slice(0, budget)) + (body.length > budget ? "…" : "");
  } else {
    out += "\n\n⏳ خلاصهٔ حرفه‌ای این خبر هنوز آماده نشده — متن کامل را از لینک بخوان";
  }
  out += "\n\n" + linkLine + "\n\n" + foot;
  return out;
}

async function baleApi(method, payload) {
  if (!BALE_TOKEN) throw new Error("توکن ربات بله (BALE_TOKEN) تنظیم نشده است");
  const res = await fetchT("https://tapi.bale.ai/bot" + BALE_TOKEN + "/" + method, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload || {})
  }, 30000);
  const data = await res.json().catch(() => null);
  if (res.status === 200 && data && data.ok) return data.result;
  throw new Error("بله " + res.status + ": " + ((data && data.description) || "خطای نامشخص"));
}

async function baleSendOne(chat, it) {
  const attempts = [];
  if (it.image) {
    attempts.push(() => baleApi("sendPhoto", { chat_id: chat, photo: it.image, caption: baleCaption(it, true), parse_mode: "HTML" }));
    attempts.push(() => baleApi("sendPhoto", { chat_id: chat, photo: it.image, caption: baleCaption(it, false) }));
  }
  attempts.push(() => baleApi("sendMessage", { chat_id: chat, text: baleCaption(it, true), parse_mode: "HTML" }));
  attempts.push(() => baleApi("sendMessage", { chat_id: chat, text: baleCaption(it, false) }));
  let lastErr = null;
  for (const fn of attempts) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (/chat not found|bot was blocked/i.test(e.message || "")) throw e;
    }
  }
  throw lastErr;
}

/* ================================================================
   state (dedup) — فایل state.json که workflow آن را commit می‌کند
   ================================================================ */
function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); }
  catch (e) { return { sent: {}, totalSent: 0, lastRun: 0 }; }
}
function saveState(st) {
  // نگه‌داشتن ۴۰۰ شناسهٔ تازه‌ترین
  const keys = Object.keys(st.sent);
  if (keys.length > 400) {
    keys.sort((a, b) => st.sent[a] - st.sent[b]);
    for (const k of keys.slice(0, keys.length - 400)) delete st.sent[k];
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 1));
}

/* ================================================================
   اجرای اصلی
   ================================================================ */
(async () => {
  const t0 = Date.now();
  console.log("🚀 پالس هوش مصنوعی — ربات ابری بله" + (DRY ? " (حالت آزمایشی — بدون ارسال)" : ""));
  if (!DRY && !BALE_TOKEN) { console.error("✕ متغیر BALE_TOKEN تنظیم نشده — در Settings → Secrets اضافه کن"); process.exit(1); }

  const st = loadState();
  const firstRun = Object.keys(st.sent).length === 0;

  // ۱) دریافت همهٔ منابع (همزمان)
  console.log("📡 دریافت " + SOURCES.length + " منبع خبری…");
  const results = await Promise.all(SOURCES.map(fetchSource));
  const all = [];
  const seen = {};
  for (const arr of results) for (const it of arr) {
    if (seen[it.id]) continue;
    seen[it.id] = 1;
    all.push(it);
  }
  console.log("📥 مجموع اخبار دریافت‌شده: " + all.length);
  const now = Date.now();
  let pending = all.filter(it => {
    const age = (now - new Date(it.publishedAt).getTime()) / 3600000;
    return age <= MAX_AGE_H && age > -2 && !st.sent[it.id];
  });
  pending.sort((a, b) => new Date(a.publishedAt) - new Date(b.publishedAt)); // قدیمی‌ترین اول
  if (firstRun) {
    console.log("👇 اولین اجرا: فقط " + FIRST_RUN_KEEP + " خبر تازه‌ترین ارسال می‌شود (بقیه علامت می‌خورند تا سیل نشود)");
    pending.slice(0, Math.max(0, pending.length - FIRST_RUN_KEEP)).forEach(it => { st.sent[it.id] = now; });
    pending = pending.slice(-FIRST_RUN_KEEP);
  }
  const batch = pending.slice(-MAX_POSTS).reverse(); // تازه‌ترین‌ها اول برای تولید پست
  console.log("🆕 خبرهای جدید: " + pending.length + " — ارسال این دوره: " + batch.length);

  // ۲) ساخت پست حرفه‌ای + ترجمهٔ عنوان + ارسال
  let sent = 0;
  for (const it of batch) {
    try {
      it.titleFa = await translateText(it.title);
      if (it.titleFa) console.log("🌐 عنوان: " + it.titleFa);
      const full = (it.desc && it.desc.length > 250) ? "" : await fetchFullArticle(it);
      const userTxt = full
        ? "متن کامل خبر:\n\n" + full
        : "متن کامل خبر در دسترس نیست؛ فقط این توضیح کوتاه را داری:\nعنوان: " + it.title + "\nتوضیح: " + it.desc +
          "\n\nبر اساس همین توضیح، پست کانال را بساز — ۲ تا ۳ جملهٔ روان — و چیزی از خودت اضافه نکن.";
      const post = await aiText(CHANNEL_PROMPT, userTxt);
      it.simpleFa = post.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 850);
      // تور ایمنی: اگر موتور ضعیف متن انگلیسی داد → ترجمهٔ خودکار به فارسی روان
      if (it.simpleFa && persianRatio(it.simpleFa) < 0.45) {
        console.log("🌐 پست فارسی نبود — ترجمهٔ خودکار به فارسی…");
        it.simpleFa = (await translateText(it.simpleFa)).replace(/\n{3,}/g, "\n\n").trim() || it.simpleFa;
      }
      console.log("🤖 پست حرفه‌ای:\n" + it.simpleFa + "\n");

      if (!DRY) {
        let ok = false;
        for (const chat of BALE_CHATS) {
          try { await baleSendOne(chat, it); ok = true; console.log("✓ ارسال شد → " + chat); }
          catch (e) { console.log("✕ ارسال به " + chat + " نشد: " + (e.message || e)); }
        }
        if (ok) { st.sent[it.id] = Date.now(); st.totalSent = (st.totalSent || 0) + 1; sent++; }
        else console.log("↩ در دورهٔ بعد دوباره تلاش می‌شود");
        await sleep(1200);
      } else {
        console.log("🧪 [dry] کپشن نهایی:\n" + baleCaption(it, true));
      }
    } catch (e) {
      console.log("✕ خطا در پردازش خبر («" + it.title.slice(0, 60) + "»): " + (e.message || e));
    }
  }

  // ۳) بستن دوره
  st.lastRun = Date.now();
  if (!DRY) saveState(st);
  console.log("🏁 پایان — ارسال‌شده در این دوره: " + sent + " | مجموع کل: " + (st.totalSent || 0) +
    " | مدت: " + Math.round((Date.now() - t0) / 1000) + " ثانیه");
})().catch(e => { console.error("✕ خطای کلی: " + (e.message || e)); process.exit(1); });
