/* ================================================================
   AI Pulse — Cloud Bale Bot (v4.0)
   همان خط لولهٔ اپ «پالس هوش مصنوعی» روی سرور گیت‌هاب + امکانات تازه:
     • توییتر افراد معروف هوش مصنوعی (سام آلتمن، ایلان ماسک، کارپاتی، …)
       با ترجمهٔ روانِ بدون دخل‌وتصرف + عکس صاحب اکانت یا خود توییت
     • تروث سوشال (بهترین تلاش — اگر سایت ربات‌ها را بست، رد می‌شود)
     • فرمت جدید هر پست:  «منبع: نام منبع» در بالا → لب کلام خبر به فارسی
       روان و ساده (بدون حاشیه و اضافات) → لینک پنهان داخل کلمهٔ «لینک» + عکس خبر
     • هر خبر در یک پیام مجزا؛ هیچ عنوان تکراری ارسال نمی‌شود
     • خبرهای یکسان از چند منبع = یک پیام واحد با ذکر همهٔ منابع و همهٔ لینک‌ها
     • اولویت ارسال: اول اخبار خارجی، بعد اخبار داخلی (فارسی)
     • منابع گسترش‌یافته: ۳۴ فید + گوگل‌نیوز + توییتر + تروث سوشال
   بدون هیچ وابستگی — فقط Node 18+ (fetch داخلی).
   تنظیمات با Environment:
     BALE_TOKEN  (اجباری)  توکن ربات بله
     BALE_CHATS  (اختیاری) شناسه‌ها با کاما: 1663835599,@mychannel
     GEMINI_KEY  (اختیاری) کلید جمینی — پیشنهاد می‌شود
     GLM_KEY     (اختیاری) کلید GLM-4 از open.bigmodel.cn
     MAX_POSTS   (اختیاری) حداکثر ارسال در هر اجرا (پیشفرض ۶)
     MAX_AGE_H   (اختیاری) حداکثر عمر خبر (پیشفرض ۳۶ ساعت)
     TWITTER_ACCOUNTS (اختیاری) هندل‌ها با کاما (پیشفرض: sama,ElonMusk,karpathy,AndrewYNg,ylecun,demishassabis)
     TRUTH_ACCOUNTS   (اختیاری) هندل‌های تروث با کاما (پیشفرض: realdonaldtrump)
   اجرا:  node bot.js            → عادی (ارسال واقعی + ذخیرهٔ state)
          node bot.js --dry      → آزمایشی (فقط چاپ، بدون ارسال/ذخیره)
          node bot.js --discover → بررسی چت‌های ربات و پیدا کردن شناسهٔ درست
          node bot.js --merge-state → حل تعارض state.json (داخل workflow)
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
const SEND_DELAY_MS = parseInt(process.env.SEND_DELAY_MS || "3500", 10);
const FIRST_RUN_KEEP = 3;   // اولین اجرا فقط ۳ آیتم تازه می‌فرستد تا شلوغ نشود
const UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36";

/* ---------- منابع خبری — نسخهٔ گسترش‌یافته (خارجی + داخلی) ---------- */
const AI_KW = /\bAI\b|A\.I\.|artificial|intelligen|machine learning|deep learning|\bLLM|GPT|chatbot|chat-bot|\brobots?\b|neural|OpenAI|Gemini|Copilot|Anthropic|DeepSeek|Llama|Mistral|generative|AGI|هوش مصنوعی|هوش\u200cمصنوعی|چت\s?بات|ربات هوشمند|یادگیری ماشین|مدل زبانی|جمینی|اوپن\u200cای\u200cآی|دیپ\u200cسیک|جی\u200cپی\u200cتی|شبکه عصبی|پردازش زبان/i;
const SOURCES = [
  { id: "techcrunch", name: "TechCrunch AI", nameFa: "تک‌کرانچ", url: "https://techcrunch.com/category/artificial-intelligence/feed/" },
  { id: "theverge", name: "The Verge AI", nameFa: "ورج", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml" },
  { id: "arstechnica", name: "Ars Technica AI", nameFa: "آرس‌تکنیکا", url: "https://arstechnica.com/ai/feed/" },
  { id: "mittr", name: "MIT Technology Review", nameFa: "ام‌آی‌تی", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed" },
  { id: "wired", name: "Wired AI", nameFa: "وایرد", url: "https://www.wired.com/feed/tag/ai/latest/rss" },
  { id: "venturebeat", name: "VentureBeat AI", nameFa: "ونچربیت", url: "https://venturebeat.com/category/ai/feed/" },
  { id: "zdnet", name: "ZDNet AI", nameFa: "زد‌دنت", url: "https://www.zdnet.com/topic/artificial-intelligence/rss.xml", mustMatch: true },
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
  { id: "thenewstack", name: "The New Stack AI", nameFa: "نیو استک", url: "https://thenewstack.io/category/ai/feed/" },
  { id: "extremetech", name: "ExtremeTech", nameFa: "اکستریم‌تک", url: "https://www.extremetech.com/feed" },
  { id: "importai", name: "Import AI (Jack Clark)", nameFa: "ایمپورت‌ای‌آی", url: "https://importai.substack.com/feed" },
  { id: "hnai", name: "Hacker News AI", nameFa: "هکر نیوز", url: "https://hnrss.org/newest?q=AI&count=20" },
  { id: "redditml", name: "Reddit r/MachineLearning", nameFa: "ردیت", url: "https://www.reddit.com/r/MachineLearning/.rss" },
  { id: "googlenews", name: "Google News AI", nameFa: "گوگل نیوز", url: "https://news.google.com/rss/search?q=artificial+intelligence+OR+%22AI%22&hl=en-US&gl=US&ceid=US:en" },
  { id: "gnewsfa", name: "Google News فارسی", nameFa: "گوگل نیوز فارسی", url: "https://news.google.com/rss/search?q=%D9%87%D9%88%D8%B4+%D9%85%D8%B5%D9%86%D9%88%D8%B9%DB%8C&hl=fa&gl=IR&ceid=IR:fa", fa: true },
  { id: "zoomit", name: "Zoomit", nameFa: "زومیت", url: "https://www.zoomit.ir/feed", fa: true, mustMatch: true },
  { id: "digiato", name: "Digiato", nameFa: "دیجیاتو", url: "https://digiato.com/feed", fa: true, mustMatch: true },
  { id: "isna", name: "ISNA", nameFa: "ایسنا", url: "https://www.isna.ir/rss", fa: true, mustMatch: true }
];
const SRC_INDEX = {}; SOURCES.forEach((s, i) => { SRC_INDEX[s.id] = i; });

/* ---------- توییتر افراد معروف هوش مصنوعی ---------- */
const TWITTER_ACCOUNTS = (process.env.TWITTER_ACCOUNTS || "sama,ElonMusk,karpathy,AndrewYNg,ylecun,demishassabis")
  .split(",").map(s => s.trim()).filter(Boolean);
const FA_NAMES = {
  sama: "سَم آلتمن", ElonMusk: "ایلان ماسک", karpathy: "آندره کارپاتی",
  AndrewYNg: "اندرو اِنگ", ylecun: "یان لکان", demishassabis: "دمیس هاسابیس",
  OpenAI: "اوپن‌ای‌آی", GoogleDeepMind: "دیپ‌مایند", alexalbertt: "الکس آلبرت",
  "sundarpichai": "سوندار پیچای", "JensenHuang": "جنسن هوانگ"
};
const NITTER_INSTANCES = [
  "https://nitter.kareem.one", "https://nitter.privacyredirect.com", "https://lightbrd.com",
  "https://nitter.poast.org", "https://xcancel.com"
];
const TRUTH_ACCOUNTS = (process.env.TRUTH_ACCOUNTS || "realdonaldtrump").split(",").map(s => s.trim()).filter(Boolean);
const TRUTH_NAMES = { realdonaldtrump: "دونالد ترامپ", DonaldTRump: "دونالد ترامپ", elonmusk: "ایلان ماسک" };
const FA_LATIN = { sama: "Sam Altman", ElonMusk: "Elon Musk", karpathy: "Andrej Karpathy", AndrewYNg: "Andrew Ng", ylecun: "Yann LeCun", demishassabis: "Demis Hassabis" };

/* ---------- پرامپت حرفه‌ای ۱ — «لب کلام» خبر (نسخهٔ ۴.۰) ---------- */
const GIST_PROMPT = [
  "تو «سردبیر لب کلام» رسانهٔ «پالس هوش مصنوعی» هستی؛ گویندهٔ خبری که هر خبر فناوری را در چند ثانیه برای مخاطب عام ایرانی کاملاً جا می‌اندازد.",
  "وظیفه: لب کلام همین خبر را به فارسی روان و ساده بنویس.",
  "قواعد طلایی:",
  "۱) فقط بر اساس همین متن بنویس؛ هیچ نام، عدد، جزئیات یا ادعایی از خودت اضافه نکن، حاشیه نرو و ماجرا را تحریف نکن.",
  "۲) لب کلام یعنی: چه اتفاقی افتاده، به دست چه کسی یا چه شرکتی، عدد یا تاریخ مهم، و چرا مهم است — فقط همین‌ها؛ نه توضیح اضافه، نه مقدمه، نه جمع‌بندی تکراری.",
  "۳) فارسی کاملاً روان و ساده بنویس؛ از اصطلاح فنی پرهیز کن و اگر اصطلاحی لازم شد همان لحظه در دل جمله با یک مقایسهٔ ساده توضیحش بده.",
  "۴) ۲ تا ۳ جملهٔ کوتاه و مستقیم؛ حدود ۱۲۰ تا ۳۰۰ کاراکتر؛ بدون «طبق گزارش»، بدون سؤال، بدون ایموجی، بدون هشتگ، بدون عنوان.",
  "۵) اسم مدل‌ها، شرکت‌ها و ابزارها را لاتین نگه‌دار (مثل GPT-5، Nvidia، Gemini).",
  "۶) خروجی فقط متن لب کلام باشد؛ بدون هیچ توضیح اضافه."
].join("\n");

/* ---------- پرامپت حرفه‌ای ۲ — ترجمهٔ وفادار توییت ---------- */
const TWEET_FA_PROMPT = [
  "تو مترجم ارشد زبان فارسی هستی که توییت‌ها و پست‌های افراد معروف حوزهٔ هوش مصنوعی را برای کانال خبری بله ترجمه می‌کند.",
  "وظیفه: متن توییت را به فارسی روان ترجمه کن.",
  "قواعد:",
  "۱) ترجمه باید کامل، دقیق و وفادار باشد — بدون کم‌وکرد، بدون تفسیر، بدون تحلیل و بدون هیچ دخل‌وتصرف در معنا.",
  "۲) لحن نویسنده حفظ شود (طنز، جدیت، هیجان، هشدار…).",
  "۳) اسم افراد، شرکت‌ها و ابزارها لاتین بماند؛ هشتگ‌ها و منشن‌ها را دست نزن.",
  "۴) ایموجی‌های خود توییت را حفظ کن و چیزی به متن اضافه نکن.",
  "۵) اگر متن اصلی فارسی است، عیناً همان را برگردان.",
  "۶) خروجی فقط ترجمه باشد؛ نه واژهٔ «ترجمه:»، نه هیچ توضیح اضافه."
].join("\n");

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

// بعضی موتورها متن را دوبار انکود می‌کنند (&amp;#10;) — تا تثبیت دیکود کن
function deepDecode(s) {
  let out = String(s || "");
  for (let i = 0; i < 3; i++) {
    const n = decodeEntities(out);
    if (n === out) break;
    out = n;
  }
  return out;
}

function hashStr(s) {
  let h = 5381;
  const t = String(s || "");
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/* ---------- ضدتکرار عنوان — کلید استاندارد + توکن‌های شباهت ---------- */
const STOP = new Set(("the a an and or for with from this that of to in on at by is are was were be been new how why what when after before over into about more most than then them they its it's has have had will would could should not no you your our their news report says say said update live watch video photos opinion analysis است را و به از که در این آن با برای بود شد های تا بر می هم یک یا اگر چون کند کنند شود شوند دارد داشت کرده کنید".split(" ")));
function normTitle(t) {
  return String(t || "").toLowerCase()
    .replace(/[\u200c]/g, " ")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ").trim();
}
function titleKey(t) { return "t#" + hashStr(normTitle(t)); }
function tokSet(t) {
  const s = new Set();
  for (const w of normTitle(t).split(" ")) {
    if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue;
    s.add(w);
  }
  return s;
}
function similarTitles(a, b) {
  const A = a._tk, B = b._tk;
  if (!A || !B || !A.size || !B.size) return false;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  if (inter / Math.min(A.size, B.size) < 0.6) return false;
  if (a._nums.size && b._nums.size) {
    let ni = 0;
    for (const n of a._nums) if (b._nums.has(n)) ni++;
    if (!ni) return false;
  }
  return true;
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
    let title = stripHtml(tagText(b, ["title"]));
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
    if (source.id === "googlenews") title = title.replace(/\s+-\s+[^-]{2,40}$/, "").trim();
    const rawDesc = tagText(b, ["description"]) || tagText(b, ["summary"]) || tagText(b, ["encoded", "content"]);
    const dateStr = tagText(b, ["pubdate", "pubDate"]) || tagText(b, ["published"]) || tagText(b, ["updated"]);
    let t = dateStr ? new Date(dateStr).getTime() : NaN;
    if (isNaN(t)) t = Date.now();
    const it = {
      kind: "news", id: link, link, title,
      desc: stripHtml(rawDesc).slice(0, 700),
      image: extractImage(b, rawDesc),
      sourceId: source.id,
      lang: source.fa ? "fa" : (persianRatio(title + " " + it0desc(rawDesc)) > 0.5 ? "fa" : "en"),
      publishedAt: new Date(t).toISOString()
    };
    if (source.mustMatch && !AI_KW.test(it.title + " " + it.desc)) continue;
    out.push(it);
  }
  return out.filter(x => x.title && x.link);
}
function it0desc(d) { return String(d || "").slice(0, 300); }

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

/* ---------- توییتر — از نمونه‌های nitter (فید RSS هر اکانت) ---------- */
function parseNitter(xml, handle, label) {
  const out = [];
  const re = /<item\b[\s\S]*?<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) && out.length < 10) {
    const b = m[0];
    let title = stripHtml(tagText(b, ["title"]));
    const descRaw = tagText(b, ["description"]);
    const linkNitter = safeUrl(tagText(b, ["link"])) || safeUrl(tagText(b, ["guid"]));
    const dateStr = tagText(b, ["pubdate", "pubDate"]) || tagText(b, ["published"]);
    let t = dateStr ? new Date(dateStr).getTime() : NaN;
    if (isNaN(t)) t = Date.now();
    if (!title || title.length < 5) continue;
    // ریتوییت خالی و ریپلای را نفرست — فقط پست اصلیِ خودِ فرد
    if (/^(R to|♻|RT[:\s]|RT by @)/i.test(title)) continue;
    const st = /\/status\/(\d+)/.exec(linkNitter);
    if (!st) continue;
    const link = "https://x.com/" + handle + "/status/" + st[1];
    // عکس توییت (proxy نیتِر → آدرس واقعی توییتر)
    let image = "";
    const pic = /\/pic\/(media%2F[^"'\s<]+)/i.exec(descRaw);
    if (pic) {
      try { image = safeUrl("https://pbs.twimg.com/" + decodeURIComponent(pic[1])); } catch (e) {}
    }
    if (!image) {
      const direct = /(https:\/\/pbs\.twimg\.com\/media\/[^"'\s<]+)/i.exec(descRaw);
      if (direct) image = safeUrl(decodeEntities(direct[1]));
    }
    if (!image) image = "https://unavatar.io/twitter/" + encodeURIComponent(handle); // عکس صاحب اکانت
    out.push({
      kind: "tweet", id: link, link, title,
      person: label || "@" + handle, handle,
      desc: stripHtml(descRaw).slice(0, 700),
      image, sourceId: "twitter", lang: "en",
      publishedAt: new Date(t).toISOString()
    });
  }
  // تکراری داخل خود فید (پین‌شده‌ها) حذف شود
  const seen = {}; 
  return out.filter(x => (seen[x.id] ? false : (seen[x.id] = 1)));
}

async function nitterFetch(handle, label, limit) {
  let lastErr = null;
  for (const base of NITTER_INSTANCES.slice(0, limit || NITTER_INSTANCES.length)) {
    try {
      const res = await fetchT(base + "/" + encodeURIComponent(handle) + "/rss", { headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" } }, 22000);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const items = parseNitter(await res.text(), handle, label);
      if (!items.length) throw new Error("فید خالی بود");
      return { items, base };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("هیچ نمونه‌ای جواب نداد");
}

async function fetchTweetsFor(handle, label) {
  let items = null;
  try {
    const r = await nitterFetch(handle, label);
    items = r.items;
    console.log("✓ توییتر «" + label + "» از " + r.base.replace("https://", "") + " — " + items.length + " پست");
  } catch (e1) {
    // بعضی نمونه‌ها محدودیت نرخ دارند — ۸ ثانیه صبر و یک دور دیگر
    await sleep(8000);
    try {
      const r = await nitterFetch(handle, label, 2);
      items = r.items;
      console.log("✓ توییتر «" + label + "» (تلاش دوم) از " + r.base.replace("https://", "") + " — " + items.length + " پست");
    } catch (e2) {
      console.log("⚠ توییتر «" + label + "» وصل نشد (" + ((e2 && e2.message) || "") + ") — جایگزین: اخبار دربارهٔ او از گوگل‌نیوز");
    }
  }
  if (items && items.length) return items;
  // جایگزین: اخبار دربارهٔ همین فرد از گوگل‌نیوز (به‌عنوان خبر عادی)
  try {
    const u2 = "https://news.google.com/rss/search?q=" + encodeURIComponent('"' + (FA_LATIN[handle] || handle) + '"') + "&hl=en-US&gl=US&ceid=US:en";
    const res = await fetchT(u2, { headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" } }, 20000);
    if (res.ok) {
      const its = parseFeed(await res.text(), { id: "googlenews", fa: false }).slice(0, 3);
      for (const it of its) it.srcOverride = "گوگل نیوز — دربارهٔ " + label;
      return its;
    }
  } catch (e) {}
  return [];
}

/* ---------- تروث سوشال (بهترین تلاش — API عمومی) ---------- */
async function fetchTruthFor(acct) {
  const label = TRUTH_NAMES[acct] || "@" + acct;
  try {
    const r = await fetchT("https://truthsocial.com/api/v1/accounts/lookup?acct=" + encodeURIComponent(acct), { headers: { Accept: "application/json" } }, 20000);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const acc = await r.json();
    const s = await fetchT("https://truthsocial.com/api/v1/accounts/" + acc.id + "/statuses?limit=8", { headers: { Accept: "application/json" } }, 20000);
    if (!s.ok) throw new Error("HTTP " + s.status);
    const list = await s.json();
    const out = (Array.isArray(list) ? list : []).filter(p => p && p.content && String(p.content).trim().length > 10).map(p => ({
      kind: "truth", id: p.url || ("https://truthsocial.com/@" + acct + "/" + p.id),
      link: p.url || ("https://truthsocial.com/@" + acct),
      title: stripHtml(p.content),
      person: label, handle: acct,
      desc: "", 
      image: (p.media_attachments && p.media_attachments[0] && (p.media_attachments[0].url || p.media_attachments[0].preview_url)) ? safeUrl(p.media_attachments[0].url || p.media_attachments[0].preview_url) : "",
      sourceId: "truth", lang: "en",
      publishedAt: p.created_at || new Date().toISOString()
    }));
    console.log("✓ تروث سوشال «" + label + "» — " + out.length + " پست");
    return out;
  } catch (e) {
    console.log("⚠ تروث سوشال («" + label + "») وصل نشد (" + (e.message || e) + ") — دورهٔ بعد دوباره تلاش می‌شود");
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

/* ---------- og:image برای خبرهایی که فید عکس نداشت ---------- */
async function ogImage(url) {
  try {
    const res = await fetchT(url, { headers: { Accept: "text/html" } }, 10000);
    if (!res.ok) return "";
    const head = (await res.text()).slice(0, 120000);
    const m = /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i.exec(head)
      || /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(head)
      || /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i.exec(head);
    return m ? safeUrl(decodeEntities(m[1])) : "";
  } catch (e) { return ""; }
}

/* ---------- ترجمه (زنجیرهٔ gtx → mymemory + اصطلاحات محافظت‌شده) ---------- */
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
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-2.0-flash"];
const GLM_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

async function geminiText(system, userText) {
  if (!GEMINI_KEY) throw Object.assign(new Error("کلید جمینی (GEMINI_KEY) تنظیم نشده"), { status: 0 });
  let lastErr = null;
  const t0 = Date.now();
  for (const model of GEMINI_MODELS) {
    if (Date.now() - t0 > 150000) break; // بودجهٔ زمانی کل جمینی — بعدش موتور بعدی زنجیره
    const body = {
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
    };
    if (/2\.5|latest/.test(model)) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";
    const payload = JSON.stringify(body);
    let res;
    try {
      if (GEMINI_KEY.startsWith("AQ.")) {
        res = await fetchT(url, { method: "POST", headers: { "x-goog-api-key": GEMINI_KEY, "Content-Type": "application/json" }, body: payload }, 90000);
        if (res.status === 401 || res.status === 403) {
          res = await fetchT(url, { method: "POST", headers: { "Authorization": "Bearer " + GEMINI_KEY, "Content-Type": "application/json" }, body: payload }, 90000);
        }
      } else {
        res = await fetchT(url + "?key=" + encodeURIComponent(GEMINI_KEY), { method: "POST", headers: { "Content-Type": "application/json" }, body: payload }, 90000);
      }
    } catch (e) {
      lastErr = new Error("اتصال به جمینی برقرار نشد (" + (e.message || e) + ") (" + model + ")");
      continue;
    }
    if (res.status !== 200) {
      const bodyTxt = await res.text().catch(() => "");
      let msg = ""; try { msg = (JSON.parse(bodyTxt).error || {}).message || ""; } catch (e) {}
      lastErr = Object.assign(new Error("HTTP " + res.status + (msg ? " — " + msg.slice(0, 100) : "") + " (" + model + ")"), { status: res.status });
      if ([401, 403, 429].includes(res.status)) throw lastErr;
      if (res.status === 400 && /location/i.test(msg)) throw Object.assign(new Error("جمینی از موقعیت جغرافیایی این سرور پشتیبانی نمی‌کند"), { status: 400 });
      continue;
    }
    const data = JSON.parse(await res.text());
    const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts;
    const text = parts ? parts.map(p => p.text || "").join("") : "";
    if (!text) { lastErr = new Error("پاسخ خالی جمینی (" + model + ")"); continue; }
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
      console.log("✓ متن با موتور " + (name === "gemini" ? "جمینی" : name === "glm" ? "GLM-4" : "رایگان") + " ساخته شد");
      return out;
    } catch (e) {
      if (!/کلید/.test(e.message || "")) console.log("⚠ موتور " + name + " نشد (" + (e.message || e) + ") → موتور بعدی");
    }
  }
  throw new Error("هیچ موتور هوش مصنوعی در دسترس نبود");
}

/* ================================================================
   بله — کپشن و ارسال (فرمت جدید نسخهٔ ۴.۰)
   فرمت خبر:  منبع: نام‌منبع
              لب کلام خبر
              🔗 لینک   (لینک داخل کلمهٔ «لینک» پنهان است)
   فرمت توییت: منبع: توییتر — نام‌شخص
              ترجمهٔ روان و وفادار
              متن اصلی (برای اطمینان از «بدون دخل‌وتصرف»)
              🔗 لینک
   ================================================================ */
function baleEsc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function href(u) { return String(u || "").replace(/&/g, "&amp;").replace(/"/g, "%22"); }
function srcName(it) {
  if (it.srcOverride) return it.srcOverride;
  if (it.kind === "tweet") return "توییتر — " + (it.person || "@" + (it.handle || ""));
  if (it.kind === "truth") return "تروث سوشال — " + (it.person || "@" + (it.handle || ""));
  const s = SOURCES.find(x => x.id === it.sourceId) || {};
  return s.nameFa || s.name || "پالس هوش مصنوعی";
}
function newsCaption(g) {
  const it = g.primary;
  const names = [srcName(it)].concat(g.extra.slice(0, 2).map(e => srcName(e))).join("، ")
    + (g.extra.length > 2 ? " و " + (g.extra.length - 2) + " منبع دیگر" : "");
  const srcLine = "منبع: " + names;
  const body = String(it.gistFa || "").trim();
  const links = ['<a href="' + href(it.link) + '">لینک</a>']
    .concat(g.extra.slice(0, 2).map((e, i) => '<a href="' + href(e.link) + '">لینک ' + (i + 2) + "</a>"));
  const linkLine = "🔗 " + links.join(" | ");
  const budget = Math.max(80, 1000 - (srcLine.length + linkLine.length + 30));
  let out = "<b>" + baleEsc(srcLine) + "</b>";
  if (body) out += "\n\n" + baleEsc(body.slice(0, budget)) + (body.length > budget ? "…" : "");
  else out += "\n\n⏳ خلاصهٔ این خبر هنوز آماده نشده — متن کامل را از لینک بخوان";
  out += "\n\n" + linkLine;
  return out;
}
function tweetCaption(it) {
  const srcLine = "منبع: توییتر — " + (it.person || "@" + (it.handle || ""));
  const tr = String(it.tweetFa || it.title || "").trim();
  const orig = String(it.title || "").trim();
  const linkLine = '🔗 <a href="' + href(it.link) + '">لینک</a>';
  let out = "<b>" + baleEsc(srcLine) + "</b>\n\n" + baleEsc(tr.slice(0, 700));
  // متنِ اصلی توییت هم می‌آید تا مشخص باشد ترجمه «بدون دخل‌وتصرف» است (اگر جا شود)
  if (orig && persianRatio(orig) < 0.5) {
    const rest = 980 - (out.length + linkLine.length + 20);
    if (rest > 60) out += "\n\n✍ متن اصلی:\n<i>" + baleEsc(orig.slice(0, rest)) + (orig.length > rest ? "…" : "") + "</i>";
  }
  out += "\n\n" + linkLine;
  return out;
}
function captionOf(gOrIt) {
  const it = gOrIt.primary || gOrIt;
  return (it.kind === "tweet" || it.kind === "truth") ? tweetCaption(it) : newsCaption(gOrIt);
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

async function downloadImage(url) {
  try {
    const res = await fetchT(url, { headers: { Accept: "image/*" } }, 20000);
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct && !/^image\//.test(ct) && !/octet-stream/.test(ct)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 2000 || buf.length > 7 * 1024 * 1024) return null;
    if (!(buf[0] === 0xff && buf[1] === 0xd8) && !(buf[0] === 0x89 && buf[1] === 0x50) && !(buf[0] === 0x47 && buf[1] === 0x49) && !(buf[8] === 0x57 && buf[9] === 0x45)) return null; // jpeg/png/gif/webp
    return { buf, ct: /^image\//.test(ct) ? ct : "image/jpeg" };
  } catch (e) { return null; }
}

async function baleSendPhotoMultipart(chat, caption, img) {
  const fd = new FormData();
  fd.append("chat_id", String(chat));
  fd.append("caption", caption);
  fd.append("parse_mode", "HTML");
  fd.append("photo", new Blob([img.buf], { type: img.ct }), "photo.jpg");
  const res = await fetchT("https://tapi.bale.ai/bot" + BALE_TOKEN + "/sendPhoto", { method: "POST", body: fd }, 60000);
  const data = await res.json().catch(() => null);
  if (!(res.status === 200 && data && data.ok)) throw new Error("بله " + res.status + ": " + ((data && data.description) || "خطای آپلود عکس"));
  return data.result;
}

async function baleSendOne(chat, gOrIt) {
  const caption = captionOf(gOrIt);
  const imgUrl = gOrIt.primary ? gOrIt.primary.image : gOrIt.image;
  let img = null;
  if (imgUrl) img = await downloadImage(imgUrl);
  if (!img && imgUrl) {
    // آپلود مستقیمِ URL هم امتحان می‌شود (سرور بله خودش می‌گیرد)
    try {
      return await baleApi("sendPhoto", { chat_id: chat, photo: imgUrl, caption, parse_mode: "HTML" });
    } catch (e) {
      if (/403|permission_denied|forbidden|chat not found|bot was blocked|not a member/i.test(e.message || "")) throw e;
    }
  }
  const attempts = [];
  if (img) attempts.push(() => baleSendPhotoMultipart(chat, caption, img));
  attempts.push(() => baleApi("sendMessage", { chat_id: chat, text: caption, parse_mode: "HTML" }));
  attempts.push(() => baleApi("sendMessage", { chat_id: chat, text: caption.replace(/<[^>]+>/g, "") }));
  let lastErr = null;
  for (const fn of attempts) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (/chat not found|bot was blocked|403|permission_denied|forbidden|not a member/i.test(e.message || "")) throw e;
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
  // نگه‌داشتن ۲۰۰۰ شناسهٔ تازه‌ترین
  const keys = Object.keys(st.sent);
  if (keys.length > 2000) {
    keys.sort((a, b) => st.sent[a] - st.sent[b]);
    for (const k of keys.slice(0, keys.length - 2000)) delete st.sent[k];
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify(st, null, 1));
}
function markSent(st, it, ts) {
  st.sent[it.id] = ts;
  if (it.kind === "news") st.sent[titleKey(it.title)] = ts;
}

/* ================================================================
   حالت‌های کمکی workflow
   ================================================================ */
if (process.argv.includes("--merge-state")) {
  try {
    const { execSync } = require("child_process");
    const gitShow = (n) => { try { return JSON.parse(execSync("git show :" + n + ":state.json", { stdio: ["ignore", "pipe", "ignore"] }).toString()); } catch (e) { return null; } };
    let cur = null;
    try { cur = JSON.parse(fs.readFileSync("state.json", "utf8")); } catch (e) { cur = null; }
    const ours = gitShow(2), theirs = gitShow(3);
    if (!ours && !theirs) console.log("state: تعارضی وجود ندارد");
    else {
      const merged = { sent: {}, totalSent: 0, lastRun: 0 };
      for (const s of [theirs, ours, cur]) {
        if (!s || !s.sent) continue;
        for (const k of Object.keys(s.sent)) merged.sent[k] = s.sent[k];
        merged.totalSent = Math.max(merged.totalSent, s.totalSent || 0);
        merged.lastRun = Math.max(merged.lastRun, s.lastRun || 0);
      }
      fs.writeFileSync("state.json", JSON.stringify(merged, null, 1));
      console.log("✓ تعارض state.json حل شد — اتحاد " + Object.keys(merged.sent).length + " شناسه");
    }
  } catch (e) { console.log("merge-state: " + (e.message || e)); }
  process.exit(0);
}

if (process.argv.includes("--discover")) {
  (async () => {
    if (!BALE_TOKEN) { console.error("✕ متغیر BALE_TOKEN تنظیم نشده — در Settings → Secrets اضافه کن"); process.exit(1); }
    console.log("🔍 بررسی پیام‌های اخیر ربات (getUpdates)…");
    let data = null, status = 0;
    try {
      const res = await fetchT("https://tapi.bale.ai/bot" + BALE_TOKEN + "/getUpdates", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 100 })
      }, 30000);
      status = res.status;
      data = await res.json().catch(() => null);
    } catch (e) { console.log("✕ اتصال به بله نشد: " + (e.message || e)); process.exit(1); }
    if (status === 409) { console.log("⚠ سرویس دیگری (اپ گوشی) همین حالا در حال دریافت آپدیت است — ۵ دقیقه بعد دوباره اجرا کن"); process.exit(0); }
    if (!data || !data.ok) { console.log("✕ بله " + status + ": " + ((data && data.description) || "خطای نامشخص")); process.exit(0); }
    const chats = {};
    for (const u of (data.result || [])) {
      const m = u.message || u.channel_post || u.edited_message || u.edited_channel_post;
      if (m && m.chat) chats[m.chat.id] = m.chat;
    }
    const list = Object.values(chats);
    if (!list.length) {
      console.log("هیچ چتی پیدا نشد.");
      console.log("۱) در بله به @aiautonewsbot یک پیام بفرست (هر متنی) و discover را دوباره اجرا کن؛");
      console.log("۲) یا ربات را «مدیر» کانال کن و بعد discover را اجرا کن.");
      process.exit(0);
    }
    console.log("چت‌هایی که با ربات در ارتباط‌اند:");
    for (const c of list) console.log("  • شناسه: " + c.id + " | نوع: " + (c.type || "?") + " | نام: " + (c.title || c.username || c.first_name || "—"));
    console.log("\n→ یکی از شناسه‌های بالا (یا چندتا با کاما) را در Secret با نام BALE_CHATS بگذار.");
    console.log("→ یادآوری: برای ارسال به کانال، @aiautonewsbot باید مدیرِ کانال با اجازهٔ ارسال پیام باشد.");
    process.exit(0);
  })().catch(e => { console.error("✕ discover: " + (e.message || e)); process.exit(1); });
}

/* ---------- تست سریع تویتر: node bot.js --test-tweet sama ---------- */
if (process.argv.includes("--test-tweet")) {
  (async () => {
    const ix = process.argv.indexOf("--test-tweet");
    const h = (process.argv[ix + 1] || "sama").trim();
    const items = await fetchTweetsFor(h, FA_NAMES[h] || "@" + h);
    if (!items.length) { console.log("✕ هیچ آیتمی از " + h + " نیامد"); process.exit(0); }
    const it = items[0];
    console.log("—— اصلِ توییت:\n" + it.title + "\n—— عکس: " + it.image + "\n—— لینک: " + it.link);
    let fa = "";
    try { fa = await aiText(TWEET_FA_PROMPT, "متن توییت:\n\n" + it.title); } catch (e) {}
    if (fa) fa = deepDecode(fa).replace(/^\s*(ترجمه[:：]?\s*)/i, "").trim();
    if (!fa || persianRatio(fa) < 0.45) fa = (await translateText(it.title)).trim() || it.title;
    it.tweetFa = fa;
    console.log("\n—— کپشن نهایی بله:\n" + ((it.kind === "tweet" || it.kind === "truth") ? tweetCaption(it) : newsCaption({ primary: it, extra: [] })));
    process.exit(0);
  })().catch(e => { console.error("✕ test-tweet: " + (e.message || e)); process.exit(1); });
}

/* ================================================================
   اجرای اصلی
   ================================================================ */
(async () => {
  if (process.argv.includes("--discover") || process.argv.includes("--test-tweet")) return;
  const t0 = Date.now();
  console.log("🚀 پالس هوش مصنوعی — ربات ابری بله (v4.0)" + (DRY ? " (حالت آزمایشی — بدون ارسال)" : ""));
  if (!DRY && !BALE_TOKEN) { console.error("✕ متغیر BALE_TOKEN تنظیم نشده — در Settings → Secrets اضافه کن"); process.exit(1); }

  const st = loadState();
  const firstRun = Object.keys(st.sent).length === 0;
  const now = Date.now();

  // ۱) دریافت همهٔ منابع + توییتر + تروث (همزمان)
  console.log("📡 دریافت " + SOURCES.length + " منبع خبری + " + TWITTER_ACCOUNTS.length + " اکانت توییتر + " + TRUTH_ACCOUNTS.length + " اکانت تروث…");
  const [results, tweetLists, truthLists] = await Promise.all([
    Promise.all(SOURCES.map(fetchSource)),
    Promise.all(TWITTER_ACCOUNTS.map((h, i) => sleep(i * 3000).then(() => fetchTweetsFor(h, FA_NAMES[h] || "@" + h)))),
    Promise.all(TRUTH_ACCOUNTS.map(a => fetchTruthFor(a)))
  ]);
  const all = [];
  const seen = {};
  for (const arr of [...results, ...tweetLists, ...truthLists]) for (const it of arr) {
    if (!it || seen[it.id]) continue;
    seen[it.id] = 1;
    it._tk = it.kind === "news" ? tokSet(it.title) : null;
    it._nums = new Set((normTitle(it.title).match(/\d{2,}/g) || []));
    all.push(it);
  }
  console.log("📥 مجموع آیتم‌های دریافت‌شده: " + all.length + " (توییتر: " + all.filter(x => x.kind === "tweet").length + " | تروث: " + all.filter(x => x.kind === "truth").length + ")");

  // ۲) فیلتر عمر + ضدتکرار دولایه (لینک + کلید عنوان)
  let pending = all.filter(it => {
    const age = (now - new Date(it.publishedAt).getTime()) / 3600000;
    if (age > MAX_AGE_H || age < -2) return false;
    if (st.sent[it.id]) return false;
    if (it.kind === "news" && st.sent[titleKey(it.title)]) return false;
    return true;
  });

  // ۳) تجمیع خبرهای یکسان (فقط خبرها — توییت‌ها مستقل می‌مانند)
  let groups = [];
  for (const it of pending) {
    if (it.kind !== "news") { groups.push({ primary: it, extra: [] }); continue; }
    let hit = null;
    for (const g of groups) {
      if (g.primary.kind !== "news") continue;
      if (similarTitles(g.primary, it) || g.extra.some(e => similarTitles(e, it))) { hit = g; break; }
    }
    if (hit) hit.extra.push(it);
    else groups.push({ primary: it, extra: [] });
  }

  // ۴) اولویت: خارجی → داخلی؛ داخل هر گروه: تازه‌تر اول
  groups.sort((A, B) => {
    const a = A.primary, b = B.primary;
    if (a.lang !== b.lang) return a.lang === "en" ? -1 : 1;
    const d = new Date(b.publishedAt) - new Date(a.publishedAt);
    if (d !== 0) return d;
    return (SRC_INDEX[a.sourceId] || 99) - (SRC_INDEX[b.sourceId] || 99);
  });
  console.log("🆕 آیتم جدید: " + pending.length + " → پس از تجمیع: " + groups.length + " پیام (خارجی: " + groups.filter(g => g.primary.lang === "en").length + " | داخلی: " + groups.filter(g => g.primary.lang === "fa").length + ")");

  // اولین اجرا: فقط چند آیتم اول می‌رود؛ بقیه علامت می‌خورند تا سیل نشود
  if (firstRun && groups.length > FIRST_RUN_KEEP) {
    console.log("👇 اولین اجرا: " + FIRST_RUN_KEEP + " آیتم تازه‌ترین ارسال می‌شود (بقیه علامت می‌خورند)");
    for (const g of groups.slice(FIRST_RUN_KEEP)) for (const it of [g.primary, ...g.extra]) markSent(st, it, now);
    groups = groups.slice(0, FIRST_RUN_KEEP);
  }
  const batch = groups.slice(0, MAX_POSTS);
  // بقیهٔ گروه‌های این دوره → علامت خورده تا بعداً تکراری نشوند؟ نه! فقط همان‌هایی که ارسال می‌شوند علامت می‌خورند؛
  // گروه‌های مانده برای دورهٔ بعد می‌مانند (تا سقف MAX_POSTS هر دوره پخش شود)
  console.log("📤 ارسال این دوره: " + batch.length);

  // ۵) تولید لب کلام / ترجمهٔ توییت + ارسال
  let sent = 0, baleHint = false;
  for (const g of batch) {
    try {
      if (g.primary.kind === "tweet" || g.primary.kind === "truth") {
        const it = g.primary;
        const orig = it.title;
        let fa = "";
        if (persianRatio(orig) >= 0.5) fa = orig; // خودِ توییت فارسی است
        else {
          try { fa = await aiText(TWEET_FA_PROMPT, "متن توییت:\n\n" + orig); } catch (e) { fa = ""; }
          if (fa) fa = deepDecode(fa).replace(/^\s*(ترجمه[:：]?\s*)/i, "").replace(/[ \t]+/g, " ").trim().slice(0, 600);
          if (fa && persianRatio(fa) < 0.45) fa = (await translateText(fa)).trim() || fa;
          if (!fa) fa = (await translateText(orig)).trim() || orig; // حداقل ترجمهٔ ماشینی
        }
        it.tweetFa = fa;
        console.log("🐦 " + (it.kind === "tweet" ? "توییتر" : "تروث") + " — " + it.person + ":\n" + fa + "\n");
      } else {
        const it = g.primary;
        const full = (it.desc && it.desc.length > 250) ? "" : await fetchFullArticle(it);
        const userTxt = full
          ? "خبر:\n\n" + full
          : "خبر فقط با این توضیح کوتاه در دسترس است:\nعنوان: " + it.title + "\nتوضیح: " + it.desc +
            "\n\nلب کلام را فقط بر اساس همین توضیح بساز و چیزی از خودت اضافه نکن.";
        let gist = "";
        try { gist = await aiText(GIST_PROMPT, userTxt); } catch (e) { gist = ""; }
        gist = deepDecode(gist).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 450);
        if (gist && persianRatio(gist) < 0.45) {
          console.log("🌐 لب کلام فارسی نبود — ترجمهٔ خودکار…");
          gist = (await translateText(gist)).trim() || gist;
        }
        if (!gist) gist = (await translateText(it.desc || it.title)).trim().slice(0, 450); // تور ایمنی: ترجمهٔ ماشینی
        it.gistFa = gist;
        // عکس: اگر فید عکس نداد → og:image خود خبر
        if (!it.image) it.image = await ogImage(it.link);
        console.log("📰 منبع: " + srcName(it) + " | " + it.title.slice(0, 70) + "\n🤖 لب کلام:\n" + gist + "\n");
      }

      if (!DRY) {
        let ok = false;
        for (const chat of BALE_CHATS) {
          try { await baleSendOne(chat, g); ok = true; console.log("✓ ارسال شد → " + chat); }
          catch (e) {
            console.log("✕ ارسال به " + chat + " نشد: " + (e.message || e));
            if (!baleHint && /403|permission_denied|forbidden|chat not found|bot was blocked|not a member/i.test(e.message || "")) {
              baleHint = true;
              console.log("💡 ربات به این چت دسترسی ندارد. راه‌حل:");
              console.log("   • کانال: @aiautonewsbot را «مدیر» کانال کن (با اجازهٔ ارسال پیام)");
              console.log("   • چت خصوصی: اول در بله به ربات یک پیام بده (استارت)");
              console.log("   • شناسهٔ درست را نمی‌دانی؟ تب Actions → Run workflow → Mode = discover");
            }
          }
          await sleep(SEND_DELAY_MS);
        }
        if (ok) {
          const ts = Date.now();
          for (const it of [g.primary, ...g.extra]) markSent(st, it, ts);
          st.totalSent = (st.totalSent || 0) + 1;
          sent++;
        } else console.log("↩ در دورهٔ بعد دوباره تلاش می‌شود");
        await sleep(500);
      } else {
        console.log("🧪 [dry] کپشن نهایی:\n" + captionOf(g) + "\n");
      }
    } catch (e) {
      console.log("✕ خطا در پردازش («" + (g.primary.title || "").slice(0, 60) + "»): " + (e.message || e));
    }
  }

  // ۶) بستن دوره
  st.lastRun = Date.now();
  if (!DRY) saveState(st);
  console.log("🏁 پایان — ارسال‌شده در این دوره: " + sent + " | مجموع کل: " + (st.totalSent || 0) +
    " | مدت: " + Math.round((Date.now() - t0) / 1000) + " ثانیه");
})().catch(e => { console.error("✕ خطای کلی: " + (e.message || e)); process.exit(1); });
