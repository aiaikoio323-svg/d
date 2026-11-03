package com.aipulse.news;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

public class MainActivity extends Activity {

    private static final String START_URL = "file:///android_asset/index.html";

    /* media files served by HF Spaces (generated outputs) — captured passively
       as the WebView (including cross-origin Space iframes) loads them */
    private static final Pattern MEDIA_EXT = Pattern.compile(
            "\\.(png|jpe?g|webp|gif|bmp|mp4|webm|mov|m4a|wav|mp3|ogg|flac)(\\?|$|/)");

    private WebView webView;
    private ExecutorService pool;
    private final LinkedHashMap<String, Long> mediaUrls = new LinkedHashMap<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        pool = Executors.newFixedThreadPool(6);
        buildWebView();
        setContentView(webView);
        webView.loadUrl(START_URL);
    }

    private void buildWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(0xFF0B1220);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        webView.addJavascriptInterface(new Bridge(), "PulseAndroid");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                if (scheme.equals("file")) return false;
                if (scheme.equals("http") || scheme.equals("https")) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, u));
                    } catch (Exception ignored) {
                    }
                    return true;
                }
                return false;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showErrorPage();
            }

            /* passive media capture: every request the WebView (and the Space
               iframes inside it) makes to a HF host whose path looks like a
               generated output is recorded so the app can offer "save"
               without any login */
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                try {
                    Uri u = request.getUrl();
                    String host = u.getHost() == null ? "" : u.getHost();
                    String url = u.toString();
                    String path = u.getPath() == null ? "" : u.getPath();
                    boolean hf = host.endsWith("hf.space") || host.endsWith("huggingface.co");
                    if (hf) {
                        boolean gradioFile = path.contains("/file=") || path.contains("/gradio_api/file");
                        boolean plainMedia = MEDIA_EXT.matcher(path).find()
                                && !path.contains("/assets/") && !path.contains("/theme") && !path.contains("/fonts/");
                        if (gradioFile || plainMedia) captureMedia(url);
                    }
                } catch (Exception ignored) {
                }
                return null;
            }
        });
        webView.setDownloadListener((url, ua, cd, mt, len) -> {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            } catch (Exception ignored) {
            }
        });
    }

    private void showErrorPage() {
        String html = "<!doctype html><html dir=\"rtl\" lang=\"fa\"><head><meta charset=\"utf-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
                + "<style>body{font-family:sans-serif;background:#0B1220;color:#E2E8F0;display:flex;"
                + "flex-direction:column;align-items:center;justify-content:center;min-height:100vh;"
                + "margin:0;text-align:center;padding:24px;box-sizing:border-box}"
                + "h2{font-size:20px;margin:0 0 10px}p{font-size:14px;color:#94A3B8;margin:0 0 28px;line-height:2}"
                + "button{background:#6366F1;color:#fff;border:0;border-radius:14px;padding:12px 34px;font-size:15px}"
                + "</style></head>"
                + "<body><h2>اتصال برقرار نشد</h2>"
                + "<p>برای دریافت اخبار تازه به اینترنت نیاز است.<br>اتصال را بررسی کنید و دوباره تلاش کنید.</p>"
                + "<button onclick=\"location.href='file:///android_asset/index.html'\">تلاش دوباره</button>"
                + "</body></html>";
        webView.loadData(html, "text/html; charset=utf-8", "utf-8");
    }

    /**
     * Native HTTP bridge: lets the bundled page fetch any https endpoint
     * (RSS feeds, HF API, translation, Gemini) without CORS restrictions.
     */
    private class Bridge {

        @JavascriptInterface
        public void get(String id, String url) {
            pool.execute(() -> http(id, url, null, null));
        }

        @JavascriptInterface
        public void post(String id, String url, String jsonBody) {
            pool.execute(() -> http(id, url, jsonBody, null));
        }

        /** POST with extra headers (JSON object {"Header-Name":"value"}) — used for
         *  OAuth-style Gemini keys (Authorization: Bearer / x-goog-api-key). */
        @JavascriptInterface
        public void postH(String id, String url, String headersJson, String jsonBody) {
            pool.execute(() -> http(id, url, jsonBody, headersJson));
        }

        @JavascriptInterface
        public void openExternal(String url) {
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public void toast(String msg) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, msg, Toast.LENGTH_SHORT).show());
        }

        /* JSON list of recently captured Space media outputs:
           [{"url":"...","t":epochMs}, ...] oldest-first, newest kept */
        @JavascriptInterface
        public String recentMedia() {
            synchronized (mediaUrls) {
                StringBuilder sb = new StringBuilder("[");
                boolean first = true;
                for (Map.Entry<String, Long> e : mediaUrls.entrySet()) {
                    if (!first) sb.append(",");
                    first = false;
                    sb.append("{\"url\":").append(JSONObject.quote(e.getKey()))
                      .append(",\"t\":").append(e.getValue()).append("}");
                }
                return sb.append("]").toString();
            }
        }

        /* download a media file and save it to the device Downloads
           (MediaStore on Android 10+, app folder on older) — no login needed.
           Replies on window.__onSaved(id, ok, pathOrError) */
        @JavascriptInterface
        public void saveMedia(String id, String url, String name) {
            pool.execute(() -> saveMediaJob(id, url, name));
        }
    }

    private void captureMedia(String url) {
        synchronized (mediaUrls) {
            mediaUrls.remove(url);
            mediaUrls.put(url, System.currentTimeMillis());
            while (mediaUrls.size() > 300) {
                mediaUrls.remove(mediaUrls.entrySet().iterator().next().getKey());
            }
        }
    }

    private static String mimeFor(String fname) {
        String f = fname.toLowerCase();
        if (f.endsWith(".png")) return "image/png";
        if (f.endsWith(".jpg") || f.endsWith(".jpeg")) return "image/jpeg";
        if (f.endsWith(".webp")) return "image/webp";
        if (f.endsWith(".gif")) return "image/gif";
        if (f.endsWith(".bmp")) return "image/bmp";
        if (f.endsWith(".mp4")) return "video/mp4";
        if (f.endsWith(".webm")) return "video/webm";
        if (f.endsWith(".mov")) return "video/quicktime";
        if (f.endsWith(".m4a")) return "audio/mp4";
        if (f.endsWith(".wav")) return "audio/wav";
        if (f.endsWith(".mp3")) return "audio/mpeg";
        if (f.endsWith(".ogg")) return "audio/ogg";
        if (f.endsWith(".flac")) return "audio/flac";
        return "application/octet-stream";
    }

    private void evalJs(String js) {
        runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    private void saveMediaJob(String id, String url, String name) {
        String outPath = "";
        String errMsg = "";
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(45000);
            c.setRequestProperty("User-Agent",
                    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36");
            int code = c.getResponseCode();
            if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
            InputStream in = c.getInputStream();

            String base = name == null ? "" : name.replaceAll("[^a-zA-Z0-9._-]", "_");
            if (base.length() > 50) base = base.substring(base.length() - 50);
            String ext = "";
            int dot = url.lastIndexOf('.');
            if (dot > 0 && dot > url.length() - 8) ext = url.substring(dot).toLowerCase();
            if (ext.length() < 3 || ext.length() > 6 || !ext.matches("\\.[a-z0-9]{2,5}")) ext = ".bin";
            String fname = "AIPulse_" + System.currentTimeMillis() + "_" + (base.isEmpty() ? "media" : base);
            if (!fname.toLowerCase().endsWith(ext)) fname += ext;

            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Downloads.DISPLAY_NAME, fname);
                cv.put(MediaStore.Downloads.MIME_TYPE, mimeFor(fname));
                cv.put(MediaStore.Downloads.IS_PENDING, 1);
                Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (uri == null) throw new Exception("insert failed");
                try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                    if (os == null) throw new Exception("stream failed");
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
                }
                cv.clear();
                cv.put(MediaStore.Downloads.IS_PENDING, 0);
                getContentResolver().update(uri, cv, null, null);
                outPath = "Downloads/" + fname;
            } else {
                File dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (dir == null) dir = getFilesDir();
                File f = new File(dir, fname);
                try (FileOutputStream fo = new FileOutputStream(f)) {
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) fo.write(buf, 0, n);
                }
                outPath = f.getAbsolutePath();
            }
            in.close();
        } catch (Exception e) {
            errMsg = e.getMessage() == null ? "download failed" : e.getMessage();
        }
        final String jsId = JSONObject.quote(id);
        final String jsPath = JSONObject.quote(outPath);
        final String jsErr = JSONObject.quote(errMsg);
        evalJs("window.__onSaved(" + jsId + "," + (outPath.isEmpty() ? "false," + jsErr : "true," + jsPath) + ");");
    }

    private void http(String id, String url, String jsonBody, String headersJson) {
        int status = 0;
        String out = "";
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(25000);
            c.setRequestProperty("User-Agent",
                    "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36");
            if (headersJson != null && headersJson.length() > 2) {
                try {
                    org.json.JSONObject hs = new org.json.JSONObject(headersJson);
                    java.util.Iterator<String> it = hs.keys();
                    while (it.hasNext()) {
                        String name = it.next();
                        c.setRequestProperty(name, hs.optString(name));
                    }
                } catch (Exception ignored) {
                }
            }
            if (jsonBody != null) {
                c.setRequestMethod("POST");
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                try (OutputStream os = c.getOutputStream()) {
                    os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
                }
            }
            status = c.getResponseCode();
            InputStream in = status >= 400 ? c.getErrorStream() : c.getInputStream();
            StringBuilder sb = new StringBuilder();
            if (in != null) {
                BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
                char[] buf = new char[8192];
                int n;
                while ((n = r.read(buf)) > 0) {
                    sb.append(buf, 0, n);
                }
                in.close();
            }
            out = sb.toString();
        } catch (Exception e) {
            status = 0;
            out = e.getMessage() == null ? "network error" : e.getMessage();
        }
        final String jsId = JSONObject.quote(id);
        final int jsStatus = status;
        final String jsBody = JSONObject.quote(out == null ? "" : out);
        runOnUiThread(() -> webView.evaluateJavascript(
                "window.__onHttp(" + jsId + "," + jsStatus + "," + jsBody + ");", null));
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) {
            webView.saveState(outState);
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
