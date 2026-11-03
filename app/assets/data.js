/* ===== data.js — sources, categories, helpers ===== */
"use strict";

var SOURCES = [
  { id: "techcrunch", name: "TechCrunch AI", nameFa: "تک‌کرانچ", url: "https://techcrunch.com/category/artificial-intelligence/feed/", type: "rss", color: "#0A9928", weight: 9 },
  { id: "theverge", name: "The Verge AI", nameFa: "ورج", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", type: "atom", color: "#5100FF", weight: 9 },
  { id: "arstechnica", name: "Ars Technica AI", nameFa: "آرس‌تکنیکا", url: "https://arstechnica.com/ai/feed/", type: "rss", color: "#FF4E00", weight: 8 },
  { id: "mittr", name: "MIT Technology Review", nameFa: "ام‌آی‌تی", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed", type: "rss", color: "#FF0000", weight: 10 },
  { id: "wired", name: "Wired AI", nameFa: "وایرد", url: "https://www.wired.com/feed/tag/ai/latest/rss", type: "rss", color: "#8A8A8A", weight: 8 },
  { id: "venturebeat", name: "VentureBeat AI", nameFa: "ونچربیت", url: "https://venturebeat.com/category/ai/feed/", type: "rss", color: "#E94265", weight: 8 },
  { id: "zdnet", name: "ZDNet AI", nameFa: "زد‌دنت", url: "https://www.zdnet.com/topic/artificial-intelligence/rss.xml", type: "rss", color: "#0F5EAF", weight: 7, mustMatch: true },
  { id: "openai", name: "OpenAI News", nameFa: "اوپن‌ای‌آی", url: "https://openai.com/news/rss.xml", type: "rss", color: "#10A37F", weight: 10 },
  { id: "deepmind", name: "Google DeepMind", nameFa: "دیپ‌مایند", url: "https://deepmind.google/blog/rss.xml", type: "rss", color: "#4285F4", weight: 10 },
  { id: "googleai", name: "Google AI Blog", nameFa: "وبلاگ گوگل", url: "https://blog.google/technology/ai/rss/", type: "rss", color: "#34A853", weight: 9 },
  { id: "huggingface", name: "Hugging Face Blog", nameFa: "هاگینگ فیس", url: "https://huggingface.co/blog/feed.xml", type: "atom", color: "#FFD21E", weight: 9 },
  { id: "simonw", name: "Simon Willison", nameFa: "سایمون ویلیسون", url: "https://simonwillison.net/atom/everything/", type: "atom", color: "#F0B429", weight: 7 },
  { id: "ieeespectrum", name: "IEEE Spectrum AI", nameFa: "آی‌تریپل‌ای", url: "https://spectrum.ieee.org/feeds/topic/artificial-intelligence.rss", type: "rss", color: "#00A8E0", weight: 8 },
  { id: "marktechpost", name: "MarkTechPost", nameFa: "مارک‌تک‌پست", url: "https://www.marktechpost.com/feed/", type: "rss", color: "#0EA5E9", weight: 6 },
  { id: "sciencedaily", name: "ScienceDaily AI", nameFa: "ساینس‌دیلی", url: "https://www.sciencedaily.com/rss/computers_math/artificial_intelligence.xml", type: "rss", color: "#16A34A", weight: 7 },
  { id: "siliconangle", name: "SiliconANGLE AI", nameFa: "سیلیکون‌انگل", url: "https://siliconangle.com/category/ai/feed/", type: "rss", color: "#F97316", weight: 6 },
  { id: "nvidia", name: "NVIDIA Blog", nameFa: "انویدیا", url: "https://blogs.nvidia.com/feed/", type: "rss", color: "#76B900", weight: 8 },
  { id: "googleres", name: "Google Research", nameFa: "تحقیقات گوگل", url: "https://research.google/blog/rss/", type: "rss", color: "#4285F4", weight: 9 },
  { id: "guardian", name: "The Guardian AI", nameFa: "گاردین", url: "https://www.theguardian.com/technology/artificialintelligenceai/rss", type: "rss", color: "#052962", weight: 8 },
  { id: "awsml", name: "AWS ML Blog", nameFa: "آمازون AWS", url: "https://aws.amazon.com/blogs/machine-learning/feed/", type: "rss", color: "#FF9900", weight: 7 },
  { id: "mlmastery", name: "ML Mastery", nameFa: "ماشین‌لرنینگ مستری", url: "https://machinelearningmastery.com/blog/feed/", type: "rss", color: "#1D4ED8", weight: 6 },
  { id: "uniteai", name: "Unite.AI", nameFa: "یونایت‌ای‌آی", url: "https://www.unite.ai/feed/", type: "rss", color: "#0EA5E9", weight: 6 },
  { id: "singularityhub", name: "Singularity Hub", nameFa: "سینگولاریتی هاب", url: "https://singularityhub.com/feed/", type: "rss", color: "#E11D48", weight: 6 },
  { id: "aitrends", name: "AI Trends", nameFa: "ای‌آی ترندز", url: "https://www.aitrends.com/feed/", type: "rss", color: "#0891B2", weight: 5 },
  { id: "thenewstack", name: "The New Stack AI", nameFa: "نیو استک", url: "https://thenewstack.io/category/ai/feed/", type: "rss", color: "#334155", weight: 6 },
  /* ---------- v4.0 — ۹ منبع تازه (هماهنگ با ربات ابری نسخهٔ ۴.۰) ---------- */
  { id: "extremetech", name: "ExtremeTech", nameFa: "اکستریم‌تک", url: "https://www.extremetech.com/feed", type: "rss", color: "#145DA0", weight: 6, mustMatch: true },
  { id: "importai", name: "Import AI (Jack Clark)", nameFa: "ایمپورت‌ای‌آی", url: "https://importai.substack.com/feed", type: "rss", color: "#6D28D9", weight: 7 },
  { id: "hnai", name: "Hacker News AI", nameFa: "هکر نیوز", url: "https://hnrss.org/newest?q=AI&count=20", type: "rss", color: "#FF6600", weight: 6 },
  { id: "redditml", name: "Reddit r/MachineLearning", nameFa: "ردیت", url: "https://www.reddit.com/r/MachineLearning/.rss", type: "rss", color: "#FF4500", weight: 5 },
  { id: "googlenews", name: "Google News AI", nameFa: "گوگل نیوز", url: "https://news.google.com/rss/search?q=artificial+intelligence+OR+%22AI%22&hl=en-US&gl=US&ceid=US:en", type: "rss", color: "#4285F4", weight: 7 },
  { id: "gnewsfa", name: "Google News فارسی", nameFa: "گوگل نیوز فارسی", url: "https://news.google.com/rss/search?q=%D9%87%D9%88%D8%B4+%D9%85%D8%B5%D9%86%D9%88%D8%B9%DB%8C&hl=fa&gl=IR&ceid=IR:fa", type: "rss", color: "#34A853", weight: 6 },
  { id: "zoomit", name: "Zoomit", nameFa: "زومیت", url: "https://www.zoomit.ir/feed", type: "rss", color: "#0284C7", weight: 6, mustMatch: true },
  { id: "digiato", name: "Digiato", nameFa: "دیجیاتو", url: "https://digiato.com/feed", type: "rss", color: "#DC2626", weight: 5, mustMatch: true },
  { id: "isna", name: "ISNA", nameFa: "ایسنا", url: "https://www.isna.ir/rss", type: "rss", color: "#1D4ED8", weight: 5, mustMatch: true }
];

var SRC_BY_ID = {};
SOURCES.forEach(function (s) { SRC_BY_ID[s.id] = s; });

var CATEGORIES = [
  { key: "models", label: "مدلهای جدید", emoji: "🤖", color: "#7C3AED" },
  { key: "tools", label: "ابزار و اپ", emoji: "🛠", color: "#0D9488" },
  { key: "free", label: "رایگان و تخفیف", emoji: "🎁", color: "#D97706" },
  { key: "features", label: "قابلیتهای جدید", emoji: "✨", color: "#DB2777" },
  { key: "industry", label: "صنعت و خبر", emoji: "🏢", color: "#2563EB" },
  { key: "research", label: "پژوهش و علم", emoji: "🔬", color: "#9333EA" }
];
var CAT_BY_KEY = {};
CATEGORIES.forEach(function (c) { CAT_BY_KEY[c.key] = c; });

var RE_FREE = /\bfree\b|free[- ]of[- ]charge|open[- ]?sourc|open[- ]?weight|for free|at no cost|released under/i;
var RE_MODELS = /\bmodel\b|\bllm\b|gpt|gemini|claude|llama|deepseek|qwen|mistral|grok|gemma|phi-\d|foundation model/i;
var RE_TOOLS = /\btool\b|\bapp\b|extension|plugin|\bapi\b|\bsdk\b|\bide\b|editor|assistant for|framework|library/i;
var RE_RESEARCH = /research|paper|study|arxiv|benchmark|scientists|dataset|breakthrough/i;
var RE_INDUSTRY = /funding|billion|million|market|lawsuit|regulat|acquisition|acquire|hire|ipo|merger|partnership|invest/i;
var RE_FEATURES = /launch|announc|update|feature|releas|rollout|adds|introduc|now available|unveil|debuts/i;

/* v4.0 — فیلتر مرتبط بودن با هوش مصنوعی برای منابع عمومی (همان ربات ابری):
   منابعی که پرچم mustMatch دارند فقط خبرهای مرتبط با AI را عبور می‌دهند */
var AI_KW = /\bAI\b|A\.I\.|artificial|intelligen|machine learning|deep learning|\bLLM|GPT|chatbot|chat-bot|\brobots?\b|neural|OpenAI|Gemini|Copilot|Anthropic|DeepSeek|Llama|Mistral|generative|AGI|هوش مصنوعی|هوش\u200cمصنوعی|چت\s?بات|ربات هوشمند|یادگیری ماشین|مدل زبانی|جمینی|اوپن\u200cای\u200cآی|دیپ\u200cسیک|جی\u200cپی\u200cتی|شبکه عصبی|پردازش زبان/i;

/* ---------- helpers ---------- */
function faDigits(s) {
  var fa = "۰۱۲۳۴۵۶۷۸۹";
  return String(s).replace(/[0-9]/g, function (d) { return fa[+d]; });
}

function timeAgoFa(iso) {
  var t = new Date(iso).getTime();
  if (!t || isNaN(t)) return "";
  var m = Math.max(1, Math.round((Date.now() - t) / 60000));
  if (m < 60) return faDigits(m) + " دقیقه پیش";
  var h = Math.round(m / 60);
  if (h < 24) return faDigits(h) + " ساعت پیش";
  var d = Math.round(h / 24);
  if (d < 30) return faDigits(d) + " روز پیش";
  return faDigits(Math.round(d / 30)) + " ماه پیش";
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function stripHtml(html) {
  var d = document.createElement("div");
  d.innerHTML = String(html == null ? "" : html).replace(/<img[^>]*>/gi, "").replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  return (d.textContent || "").replace(/\s+/g, " ").trim();
}

function persianRatio(s) {
  var t = String(s || "").replace(/[^\u0600-\u06FF a-zA-Z]/g, "");
  if (!t) return 0;
  var fa = (t.match(/[\u0600-\u06FF]/g) || []).length;
  return fa / t.length;
}

function todayKey() {
  var tehran = new Date(Date.now() + (3.5 * 60 + new Date().getTimezoneOffset()) * 60000);
  return tehran.toISOString().slice(0, 10);
}

function safeUrl(u) {
  if (!u) return "";
  var t = String(u).trim();
  if (/^https:\/\//i.test(t)) return t;
  if (/^http:\/\//i.test(t)) return t.replace(/^http:/i, "https:");
  return "";
}

var STALE_MS = 20 * 60 * 1000;

/* ---------- protected-term system (Google Translate keeps these Latin) ---------- */
var PROTECTED_PHRASES = [
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

var PROTECTED_PATTERNS = [
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

var _protRe = null;
function protectRe() {
  if (_protRe) return _protRe;
  var esc = PROTECTED_PHRASES.map(function (p) {
    return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }).sort(function (a, b) { return b.length - a.length; });
  _protRe = new RegExp("(" + esc.concat(PROTECTED_PATTERNS).join("|") + ")", "gi");
  return _protRe;
}

function protectTerms(text) {
  var re = protectRe();
  re.lastIndex = 0;
  var terms = [];
  var masked = String(text).replace(re, function (m) {
    terms.push(m);
    return "XQ" + (terms.length - 1) + "XQ";
  });
  return { masked: masked, terms: terms };
}

function restoreTerms(translated, terms) {
  var out = String(translated).replace(/XQ\s*(\d{1,3})\s*XQ/g, function (m, d) {
    var i = parseInt(d, 10);
    return terms[i] != null ? terms[i] : "";
  });
  return out.replace(/ {2,}/g, " ").trim();
}

var POST_FIX_FA = [
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

function postFixFa(text) {
  var out = String(text);
  for (var i = 0; i < POST_FIX_FA.length; i++) out = out.replace(POST_FIX_FA[i][0], POST_FIX_FA[i][1]);
  return out;
}

function unmaskAfterTranslate(translated, terms) {
  return postFixFa(restoreTerms(translated, terms));
}

/* ================================================================
   v3.5 — کاتالوگ منابع رایگان و قدرتمند هوش مصنوعی
   فقط منابع معتبر و شناخته‌شده؛ توضیح سهمیه‌ها عمداً کلی نگه داشته
   شده چون این سهمیه‌ها به‌مرور تغییر می‌کنند. ترتیب داخل هر دسته =
   رتبهٔ ارزش (rank 1 = قدرتمندترین/ارزشمندترین).
   ================================================================ */
var FREE_AI_CATS = [
  { key: "chat",   label: "مدل زبانی و چت‌بات", emoji: "🤖", color: "#7C3AED",
    note: "قدرت‌مندترین مدل‌های زبانی دنیا با چت یا کلید API رایگان — برگزیده‌ها اول" },
  { key: "media",  label: "تصویر، ویدیو و صدا", emoji: "🎨", color: "#DB2777",
    note: "تولید عکس و ویدیو با هوش مصنوعی، بدون نیاز به کارت بانکی" },
  { key: "search", label: "جست‌وجو و داده",     emoji: "🔍", color: "#0891B2",
    note: "برای ساخت دستیارها و عامل‌هایی که به وب و داده واقعی وصل می‌شوند" },
  { key: "agents", label: "عامل و خودکارسازی",  emoji: "🧩", color: "#D97706",
    note: "ساخت عامل هوشمند و اجرای مدل‌های بزرگ بدون سخت‌افزار گران" },
  { key: "code",   label: "کدنویسی و توسعه",    emoji: "💻", color: "#059669",
    note: "دستیارهای کدنویسی رایگان داخل ادیتور و ترمینال" }
];

var FREE_AI_ITEMS = [
  /* ---------- 🤖 مدل زبانی و چت‌بات ---------- */
  { key: "aistudio", cat: "chat", rank: 1, emoji: "✨", color: "#4285F4",
    name: "Google AI Studio", host: "aistudio.google.com", tag: "در این اپ فعال",
    fa: "کلید API رایگان مدل‌های Gemini (نسخهٔ Flash و Pro) با سهمیهٔ روزانهٔ سخاوتمند + پلی‌گراند زنده برای تست پرامپت. کلیدش را در تب «دستیار» همین اپ وارد کن تا همهٔ امکانات بی‌دردسر کار کند.",
    site: "https://aistudio.google.com", api: "https://aistudio.google.com/apikey", apilabel: "کلید رایگان" },
  { key: "zai", cat: "chat", rank: 2, emoji: "🧠", color: "#2563EB",
    name: "z.ai", host: "chat.z.ai",
    fa: "چت رایگان مدل‌های GLM (سری GLM-4.x) که در کدنویسی و کارهای عامل‌محور (Agent) بسیار قوی‌اند؛ مدل سبک Flash برای API رایگان است و بقیهٔ مدل‌ها پلن ارزان دارند.",
    site: "https://chat.z.ai", api: "https://docs.z.ai", apilabel: "مستندات و کلید" },
  { key: "groq", cat: "chat", rank: 3, emoji: "⚡", color: "#F55036",
    name: "Groq", host: "groq.com", tag: "سریع‌ترین اینفرنس",
    fa: "سریع‌ترین اجرای مدل‌های متن‌باز (مثل Llama و Qwen) روی چیپ‌های اختصاصی LPU — سرعتی که جواب‌ها را همان لحظه می‌ریزد روی صفحه. پلن رایگان با محدودیت نرخ برای توسعه‌دهنده‌ها.",
    site: "https://groq.com", api: "https://console.groq.com/keys", apilabel: "کلید رایگان" },
  { key: "openrouter", cat: "chat", rank: 4, emoji: "🔀", color: "#6467F2",
    name: "OpenRouter", host: "openrouter.ai",
    fa: "فقط با یک کلید به صدها مدل (GPT، Gemini، Claude، Llama، DeepSeek و…) دسترسی داری؛ هر مدلی که برچسب :free دارد کاملاً بدون هزینه است — بهترین راه برای تست و مقایسهٔ مدل‌ها.",
    site: "https://openrouter.ai", api: "https://openrouter.ai/keys", apilabel: "کلید رایگان" },
  { key: "huggingface", cat: "chat", rank: 5, emoji: "🤗", color: "#FFD21E",
    name: "Hugging Face", host: "huggingface.co", tag: "تب اسپیس‌ها همین اپ",
    fa: "بزرگ‌ترین خانهٔ هوش مصنوعی متن‌باز دنیا؛ چت رایگان با مدل‌های روز، سهمیهٔ رایگان کوچک برای Inference، هزاران مدل و دیتاست و دموی آماده. تب «اسپیسها» همین اپ هم از همین‌جا تغذیه می‌شود.",
    site: "https://huggingface.co", api: "https://huggingface.co/settings/tokens", apilabel: "توکن رایگان" },
  { key: "mistral", cat: "chat", rank: 6, emoji: "🍃", color: "#FF7000",
    name: "Mistral AI", host: "chat.mistral.ai",
    fa: "چت رایگان Le Chat با مدل‌های Mistral و ساخت API روی La Plateforme با لایهٔ آزمایشی رایگان — اروپایی، سریع و با کدهای باز.",
    site: "https://chat.mistral.ai", api: "https://console.mistral.ai/api-keys", apilabel: "کلید رایگان" },
  { key: "cerebras", cat: "chat", rank: 7, emoji: "🚄", color: "#F97316",
    name: "Cerebras", host: "cloud.cerebras.ai",
    fa: "اینفرنس فوق‌سریع مدل‌های متن‌باز روی چیپ‌های Wafer-Scale با پلن رایگان — رقیب جدی Groq برای ساخت اپلیکیشن‌های چت سریع.",
    site: "https://www.cerebras.ai", api: "https://cloud.cerebras.ai", apilabel: "کلید رایگان" },
  { key: "ghmodels", cat: "chat", rank: 8, emoji: "🐙", color: "#334155",
    name: "GitHub Models", host: "github.com/marketplace/models",
    fa: "با همان اکانت GitHub خودت، مدل‌های بزرگ (GPT، Llama، DeepSeek و…) را رایگان در پلی‌گراند تست کن و برای پروژه‌های کوچک از API‌شان استفاده کن.",
    site: "https://github.com/marketplace/models", api: "https://github.com/settings/tokens", apilabel: "توکن GitHub" },
  { key: "cfai", cat: "chat", rank: 9, emoji: "☁️", color: "#F48120",
    name: "Cloudflare Workers AI", host: "developers.cloudflare.com/workers-ai",
    fa: "اجرای مدل‌های متن‌باز (متنی، تصویری، صوتی) روی شبکهٔ جهانی Cloudflare با سهمیهٔ روزانهٔ رایگان — عالی برای ساخت بک‌اند بدون سرور.",
    site: "https://developers.cloudflare.com/workers-ai/", api: "https://dash.cloudflare.com/profile/api-tokens", apilabel: "کلید رایگان" },

  /* ---------- 🎨 تصویر، ویدیو و صدا ---------- */
  { key: "pollinations", cat: "media", rank: 1, emoji: "🌸", color: "#E11D8F",
    name: "Pollinations", host: "pollinations.ai", tag: "در این اپ فعال",
    fa: "تولید تصویر و متن کاملاً رایگان و حتی بدون ثبت‌نام و کلید — فقط یک URL صدا بزن، عکس تحویل بگیر. موتور رایگان همین اپ روی همین سرویس سوار است.",
    site: "https://pollinations.ai", api: "https://github.com/pollinations/pollinations", apilabel: "مستندات" },
  { key: "bingcreate", cat: "media", rank: 2, emoji: "🖼", color: "#0EA5E9",
    name: "Bing Image Creator", host: "bing.com/create",
    fa: "تولید عکس با مدل DALL·E مایکروسافت — با اکانت مایکروسافت رایگان است و برای تصاویر واقع‌گرایانه یکی از بهترین‌های رایگان به‌شمار می‌آید.",
    site: "https://www.bing.com/create" },
  { key: "hfspaces", cat: "media", rank: 3, emoji: "🧪", color: "#FFD21E",
    name: "Hugging Face Spaces", host: "huggingface.co/spaces", tag: "تب اسپیس‌ها همین اپ",
    fa: "هزاران دموی رایگان تولید تصویر، ویدیو و صدا که می‌توانی مستقیم داخل همین اپ (تب اسپیسها) اجرا کنی — بدون نصب هیچ چیزی.",
    site: "https://huggingface.co/spaces" },
  { key: "runway", cat: "media", rank: 4, emoji: "🎬", color: "#111827",
    name: "Runway", host: "runwayml.com",
    fa: "حرفه‌ای‌ترین ابزار ویدیوسازی با AI (مثل Gen-3)؛ با ثبت‌نام اعتبار رایگان اولیه می‌گیری تا کیفیتش را تست کنی.",
    site: "https://runwayml.com" },

  /* ---------- 🔍 جست‌وجو و داده ---------- */
  { key: "tavily", cat: "search", rank: 1, emoji: "🎯", color: "#0D9488",
    name: "Tavily", host: "tavily.com", tag: "مخصوص عامل‌ها",
    fa: "موتور جست‌وجوی طراحی‌شده برای عامل‌های AI؛ نتیجه‌های تمیز و آمادهٔ LLM برمی‌گرداند و پلن رایگان ماهانهٔ کاربردی دارد — انتخاب اول بسیاری از دستیارهای هوشمند.",
    site: "https://www.tavily.com", api: "https://app.tavily.com", apilabel: "کلید رایگان" },
  { key: "jina", cat: "search", rank: 2, emoji: "📄", color: "#2563EB",
    name: "Jina Reader", host: "jina.ai/reader",
    fa: "آدرس هر صفحهٔ وب را جلوی r.jina.ai بگذار، متن تمیز و Markdown همان صفحه را تحویل بگیر — رایگان و بدون کلید (با محدودیت نرخ). راه سادهٔ تغذیهٔ عامل‌ها از وب.",
    site: "https://jina.ai/reader" },
  { key: "serper", cat: "search", rank: 3, emoji: "🔎", color: "#1D4ED8",
    name: "Serper", host: "serper.dev",
    fa: "API سریع و ارزان جست‌وجوی گوگل با اعتبار رایگان برای شروع — وقتی عامل تو لازم دارد نتیجهٔ واقعی گوگل را ببیند.",
    site: "https://serper.dev", api: "https://serper.dev", apilabel: "اعتبار شروع" },
  { key: "brave", cat: "search", rank: 4, emoji: "🦁", color: "#FB542B",
    name: "Brave Search API", host: "brave.com/search/api",
    fa: "جست‌وجوی مستقل و حرمت‌خصوصی با پلن رایگان محدود ماهانه — بدون وابستگی به گوگل.",
    site: "https://brave.com/search/api/" },

  /* ---------- 🧩 عامل و خودکارسازی ---------- */
  { key: "colab", cat: "agents", rank: 1, emoji: "🔬", color: "#F9AB00",
    name: "Google Colab", host: "colab.research.google.com", tag: "GPU رایگان",
    fa: "نوت‌بوک پایتون ابری گوگل با GPU رایگان — مدل‌های متن‌باز را همان‌جا اجرا و فاین‌تیون کن بدون اینکه حتی یک ریال سخت‌افزار بخر.",
    site: "https://colab.research.google.com" },
  { key: "langflow", cat: "agents", rank: 2, emoji: "🧩", color: "#7C3AED",
    name: "Langflow", host: "langflow.org", tag: "متن‌باز",
    fa: "ساخت عامل‌های AI به‌صورت بصری و کشیدن‌ورهاکردن — بدون کدنویسی سنگین. متن‌باز و رایگان؛ روی سیستم خودت یا ابر اجرایش کن.",
    site: "https://www.langflow.org" },
  { key: "n8n", cat: "agents", rank: 3, emoji: "⛓", color: "#EA4B71",
    name: "n8n", host: "n8n.io", tag: "متن‌باز",
    fa: "اتوماسیون گردش‌کار با نودهای هوش مصنوعی — ربات و خط تولید داده بساز؛ نسخهٔ متن‌باز رایگان روی سیستم خودت اجرا می‌شود.",
    site: "https://n8n.io" },
  { key: "gradio", cat: "agents", rank: 4, emoji: "🎛", color: "#F97316",
    name: "Gradio", host: "gradio.app", tag: "متن‌باز",
    fa: "با چند خط پایتون برای هر مدلی رابط وب بساز و رایگان روی Hugging Face Spaces منتشرش کن — سریع‌ترین راه تبدیل ایده به دموی آنلاین.",
    site: "https://www.gradio.app" },

  /* ---------- 💻 کدنویسی و توسعه ---------- */
  { key: "copilot", cat: "code", rank: 1, emoji: "👨‍💻", color: "#24292F",
    name: "GitHub Copilot", host: "github.com/features/copilot",
    fa: "پلن Copilot Free داخل VS Code: تکمیل خودکار کد و چت کدنویسی با سهمیهٔ ماهانهٔ رایگان — برای هر برنامه‌نویسی که تازه شروع کرده.",
    site: "https://github.com/features/copilot" },
  { key: "geminicli", cat: "code", rank: 2, emoji: "⌨", color: "#4285F4",
    name: "Gemini CLI", host: "github.com/google-gemini/gemini-cli",
    fa: "دستیار عامل‌محور گوگل در ترمینال با سهمیهٔ رایگان روزانهٔ سخاوتمند (با اکانت شخصی گوگل) — کد می‌نویسد، فایل‌ها را می‌خواند و کارها را خودش انجام می‌دهد.",
    site: "https://github.com/google-gemini/gemini-cli" },
  { key: "windsurf", cat: "code", rank: 3, emoji: "🏄", color: "#09B6A2",
    name: "Windsurf", host: "windsurf.com",
    fa: "ادیتور هوشمند (سازندهٔ Codeium) با دستیار کدنویسی داخل ادیتور؛ پلن رایگان محدود برای شروع.",
    site: "https://windsurf.com" },
  { key: "cursor", cat: "code", rank: 4, emoji: "🖱", color: "#111827",
    name: "Cursor", host: "cursor.com",
    fa: "معروف‌ترین ادیتور کدنویسی با AI؛ پلن رایگان Hobby با استفادهٔ محدود — برای امتحان کردن تجربهٔ کدنویسی عامل‌محور.",
    site: "https://cursor.com" }
];

var FREE_AI_BY_KEY = {};
FREE_AI_ITEMS.forEach(function (x) { FREE_AI_BY_KEY[x.key] = x; });

/* ترتیب «برترین‌ها» — ارزشمندترین‌ها به انتخاب سردبیری */
var FREE_AI_TOP = ["aistudio", "zai", "groq", "openrouter", "huggingface"];
