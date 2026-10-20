package com.chillreader.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.InputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import android.util.Base64;
import android.speech.tts.Voice;
import java.util.Locale;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static volatile MainActivity sInstance = null;
    private static volatile boolean sIsWebPlaying = false;

    private TextToSpeech nativeTts;
    private boolean isNativeTtsReady = false;
    private long lastBackPressTime = 0;

    public static MainActivity getInstance() {
        return sInstance;
    }

    public static void sendCommand(String js) {
        MainActivity act = sInstance;
        if (act != null) {
            act.sendWebViewCommand(js);
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        sInstance = this;

        final Thread.UncaughtExceptionHandler defaultHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            try {
                android.util.Log.e("ChillReaderCrash", "Uncaught exception on thread: " + thread.getName(), throwable);
                File crashFile = new File(getCacheDir(), "chillreader_crash.log");
                FileWriter writer = new FileWriter(crashFile, true);
                writer.write("--- MAIN CRASH at " + new java.util.Date() + " on " + thread.getName() + " ---\n");
                StringWriter sw = new StringWriter();
                PrintWriter pw = new PrintWriter(sw);
                throwable.printStackTrace(pw);
                writer.write(sw.toString() + "\n\n");
                writer.close();
            } catch (Throwable ignored) {}
            if (defaultHandler != null) {
                defaultHandler.uncaughtException(thread, throwable);
            }
        });

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, 101);
            }
        }
        initNativeTts();
        setupWebViewBridge();
    }

    @Override
    public void onStart() {
        super.onStart();
        sInstance = this;
        setupWebViewBridge();
    }

    @Override
    public void onResume() {
        super.onResume();
        sInstance = this;
        try {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                webView.onResume();
                webView.resumeTimers();
            }
        } catch (Throwable ignored) {}
    }

    @Override
    public void onPause() {
        super.onPause();
        keepWebViewAliveIfPlaying();
        new Handler(Looper.getMainLooper()).postDelayed(this::keepWebViewAliveIfPlaying, 100);
        new Handler(Looper.getMainLooper()).postDelayed(this::keepWebViewAliveIfPlaying, 500);
    }

    @Override
    public void onStop() {
        super.onStop();
        keepWebViewAliveIfPlaying();
        new Handler(Looper.getMainLooper()).postDelayed(this::keepWebViewAliveIfPlaying, 100);
        new Handler(Looper.getMainLooper()).postDelayed(this::keepWebViewAliveIfPlaying, 500);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (!hasFocus) {
            keepWebViewAliveIfPlaying();
        }
    }

    private void keepWebViewAliveIfPlaying() {
        try {
            if (MediaPlaybackService.isPlaying() || MediaPlaybackService.isPlaybackActive() || sIsWebPlaying) {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null) {
                    webView.onResume();
                    webView.resumeTimers();
                }
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }
    }

    private void setupWebViewBridge() {
        try {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                WebSettings settings = webView.getSettings();
                settings.setMediaPlaybackRequiresUserGesture(false);
                settings.setDomStorageEnabled(true);
                settings.setDatabaseEnabled(true);
                
                webView.addJavascriptInterface(new AndroidMediaBridge(), "AndroidMedia");
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public void sendWebViewCommand(String js) {
        runOnUiThread(() -> {
            try {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null) {
                    try {
                        webView.onResume();
                        webView.resumeTimers();
                    } catch (Throwable ignored) {}
                    webView.evaluateJavascript(js, null);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    private void initNativeTts() {
        try {
            String bestEngine = MediaPlaybackService.findBestTtsEngine(getApplicationContext());
            TextToSpeech.OnInitListener initListener = status -> {
                if (status == TextToSpeech.SUCCESS) {
                    try {
                        int result = nativeTts.setLanguage(new Locale("vi", "VN"));
                        if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                            nativeTts.setLanguage(new Locale("vi"));
                        }
                    } catch (Exception ignored) {}
                    isNativeTtsReady = true;

                    nativeTts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override
                        public void onStart(String utteranceId) {
                            sendWebViewCommand("window.ttsEngine && window.ttsEngine.onNativeUtteranceStart && window.ttsEngine.onNativeUtteranceStart('" + utteranceId + "')");
                        }

                        @Override
                        public void onDone(String utteranceId) {
                            sendWebViewCommand("window.ttsEngine && window.ttsEngine.onNativeUtteranceDone && window.ttsEngine.onNativeUtteranceDone('" + utteranceId + "')");
                        }

                        @Override
                        public void onError(String utteranceId) {
                            sendWebViewCommand("window.ttsEngine && window.ttsEngine.onNativeUtteranceError && window.ttsEngine.onNativeUtteranceError('" + utteranceId + "')");
                        }
                    });
                } else {
                    isNativeTtsReady = false;
                }
            };

            if (bestEngine != null) {
                nativeTts = new TextToSpeech(getApplicationContext(), initListener, bestEngine);
            } else {
                nativeTts = new TextToSpeech(getApplicationContext(), initListener);
            }
        } catch (Exception e) {
            e.printStackTrace();
            isNativeTtsReady = false;
        }
    }

    private class AndroidMediaBridge {
        @JavascriptInterface
        public boolean isNativeTtsReady() {
            try {
                return isNativeTtsReady && nativeTts != null;
            } catch (Throwable t) {
                return false;
            }
        }

        @JavascriptInterface
        public String getNativeVoicesJson() {
            try {
                TextToSpeech tts = nativeTts;
                if (tts == null) {
                    MediaPlaybackService svc = MediaPlaybackService.getInstance();
                    if (svc != null) {
                        tts = svc.getNativeTtsInstance();
                    }
                }
                if (tts != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    Set<Voice> voices = tts.getVoices();
                    if (voices != null && !voices.isEmpty()) {
                        JSONArray array = new JSONArray();
                        for (Voice v : voices) {
                            if (v == null || v.getLocale() == null) continue;
                            String lang = v.getLocale().getLanguage();
                            String langTag = v.getLocale().toLanguageTag();
                            if ("vi".equalsIgnoreCase(lang) || (langTag != null && langTag.toLowerCase().startsWith("vi"))) {
                                JSONObject obj = new JSONObject();
                                obj.put("id", "native:" + v.getName());
                                obj.put("name", v.getName());
                                obj.put("lang", langTag != null ? langTag : "vi-VN");
                                obj.put("requiresNetwork", v.isNetworkConnectionRequired());
                                obj.put("quality", v.getQuality());
                                array.put(obj);
                            }
                        }
                        return array.toString();
                    }
                }
            } catch (Throwable t) {
                t.printStackTrace();
            }
            return "[]";
        }

        @JavascriptInterface
        public String checkVietnameseTtsStatus() {
            JSONObject result = new JSONObject();
            try {
                TextToSpeech tts = nativeTts;
                if (tts == null) {
                    MediaPlaybackService svc = MediaPlaybackService.getInstance();
                    if (svc != null) tts = svc.getNativeTtsInstance();
                }
                String currentEngine = "";
                if (tts != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.ICE_CREAM_SANDWICH_MR1) {
                    currentEngine = tts.getDefaultEngine();
                }
                result.put("engine", currentEngine != null ? currentEngine : "");

                if (tts != null && isNativeTtsReady) {
                    boolean hasOfflineVoice = false;
                    boolean hasNetworkVoice = false;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        try {
                            Set<Voice> voices = tts.getVoices();
                            if (voices != null) {
                                for (Voice v : voices) {
                                    if (v != null && v.getLocale() != null) {
                                        String lang = v.getLocale().getLanguage();
                                        if ("vi".equalsIgnoreCase(lang)) {
                                            if (!v.isNetworkConnectionRequired()) {
                                                hasOfflineVoice = true;
                                            } else {
                                                hasNetworkVoice = true;
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (Throwable ignored) {}
                    }

                    int status = tts.isLanguageAvailable(new Locale("vi", "VN"));
                    if (status < 0 && status != TextToSpeech.LANG_MISSING_DATA) {
                        result.put("status", "not_supported");
                        result.put("hasOfflineVoice", false);
                    } else if (hasOfflineVoice) {
                        result.put("status", "available");
                        result.put("hasOfflineVoice", true);
                    } else {
                        result.put("status", "missing_offline_data");
                        result.put("hasOfflineVoice", false);
                    }
                } else {
                    result.put("status", "not_ready");
                    result.put("hasOfflineVoice", false);
                }
            } catch (Throwable t) {
                try { result.put("status", "error"); } catch (Throwable ignored) {}
            }
            return result.toString();
        }

        @JavascriptInterface
        public void openTtsSettings() {
            try {
                Intent intent = new Intent("com.android.settings.TTS_SETTINGS");
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Throwable t1) {
                try {
                    Intent intent = new Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA);
                    intent.setPackage("com.google.android.tts");
                    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Throwable t2) {
                    try {
                        Intent intent = new Intent(Settings.ACTION_SETTINGS);
                        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    } catch (Throwable ignored) {}
                }
            }
        }

        @JavascriptInterface
        public void speakNative(String text, float rate, float pitch, String utteranceId) {
            try {
                if (nativeTts == null || !isNativeTtsReady) return;
                runOnUiThread(() -> {
                    try {
                        nativeTts.setSpeechRate(rate);
                        nativeTts.setPitch(pitch);
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                            nativeTts.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
                        }
                    } catch (Throwable e) {
                        e.printStackTrace();
                    }
                });
            } catch (Throwable t) {
                t.printStackTrace();
            }
        }

        @JavascriptInterface
        public void stopNative() {
            try {
                MediaPlaybackService service = MediaPlaybackService.getInstance();
                if (service != null) {
                    service.stopNativeTts();
                }
                if (nativeTts != null) {
                    runOnUiThread(() -> {
                        try {
                            nativeTts.stop();
                        } catch (Throwable ignored) {}
                    });
                }
            } catch (Throwable t) {
                t.printStackTrace();
            }
        }

        @JavascriptInterface
        public void updateMedia(String chapterTitle, String bookTitle, String author, boolean isPlaying) {
            updateMedia(chapterTitle, bookTitle, author, isPlaying, "", 0, 0);
        }

        @JavascriptInterface
        public void updateMedia(String chapterTitle, String bookTitle, String author, boolean isPlaying, String coverUrl) {
            updateMedia(chapterTitle, bookTitle, author, isPlaying, coverUrl, 0, 0);
        }

        @JavascriptInterface
        public void updateMedia(
            String chapterTitle, 
            String bookTitle, 
            String author, 
            boolean isPlaying, 
            String coverUrl, 
            int currentSentence, 
            int totalSentences
        ) {
            try {
                sIsWebPlaying = isPlaying;
                MediaPlaybackService.startOrUpdate(
                    MainActivity.this,
                    chapterTitle,
                    bookTitle,
                    author,
                    isPlaying,
                    coverUrl,
                    currentSentence,
                    totalSentences
                );
            } catch (Throwable t) {
                t.printStackTrace();
            }
        }

        @JavascriptInterface
        public void clearMedia() {
            try {
                sIsWebPlaying = false;
                MediaPlaybackService.stop(MainActivity.this);
            } catch (Throwable t) {
                t.printStackTrace();
            }
        }

        @JavascriptInterface
        public void startNativeChapterPlayback(
            String chapterTitle,
            String bookTitle,
            String author,
            String coverUrl,
            String sentencesJson,
            int startIndex,
            float rate,
            float pitch
        ) {
            startNativeChapterPlayback(chapterTitle, bookTitle, author, coverUrl, sentencesJson, startIndex, rate, pitch, "");
        }

        @JavascriptInterface
        public void startNativeChapterPlayback(
            String chapterTitle,
            String bookTitle,
            String author,
            String coverUrl,
            String sentencesJson,
            int startIndex,
            float rate,
            float pitch,
            String voiceURI
        ) {
            try {
                runOnUiThread(() -> {
                    MediaPlaybackService.startNativeQueue(
                        MainActivity.this,
                        chapterTitle,
                        bookTitle,
                        author,
                        coverUrl,
                        sentencesJson,
                        startIndex,
                        rate,
                        pitch,
                        voiceURI
                    );
                });
            } catch (Throwable t) {
                t.printStackTrace();
            }
        }

        @JavascriptInterface
        public void pauseNative() {
            try {
                MediaPlaybackService service = MediaPlaybackService.getInstance();
                if (service != null) {
                    service.pauseNativeTts();
                }
            } catch (Throwable t) {
                t.printStackTrace();
            }
        }

        @JavascriptInterface
        public void resumeNative() {
            try {
                MediaPlaybackService service = MediaPlaybackService.getInstance();
                if (service != null) {
                    service.resumeNativeTts();
                }
            } catch (Throwable t) {
                t.printStackTrace();
            }
        }

        @JavascriptInterface
        public void jumpNativeSentence(int index) {
            try {
                MediaPlaybackService service = MediaPlaybackService.getInstance();
                if (service != null) {
                    service.jumpToNativeSentence(index);
                }
            } catch (Throwable t) {
                t.printStackTrace();
            }
        }

        @JavascriptInterface
        public int getNativePlaybackIndex() {
            try {
                MediaPlaybackService service = MediaPlaybackService.getInstance();
                if (service != null && service.isNativeTtsMode()) {
                    return service.getNativeSentenceIndex();
                }
            } catch (Throwable t) {
                t.printStackTrace();
            }
            return -1;
        }

        @JavascriptInterface
        public void setPlayAlongOtherApps(boolean enable) {
            try {
                MediaPlaybackService.setPlayAlong(MainActivity.this, enable);
            } catch (Throwable t) {
                t.printStackTrace();
            }
        }

        @JavascriptInterface
        public boolean isPlayAlongOtherApps() {
            try {
                MediaPlaybackService service = MediaPlaybackService.getInstance();
                if (service != null) {
                    return service.isPlayAlongOtherApps();
                }
                android.content.SharedPreferences prefs = getSharedPreferences(MediaPlaybackService.PREFS_NAME, Context.MODE_PRIVATE);
                return prefs.getBoolean(MediaPlaybackService.PREF_PLAY_ALONG, true);
            } catch (Throwable t) {
                return true;
            }
        }

        private String md5(String s) {
            try {
                MessageDigest digest = MessageDigest.getInstance("MD5");
                digest.update(s.getBytes("UTF-8"));
                byte[] hash = digest.digest();
                StringBuilder hex = new StringBuilder();
                for (byte b : hash) {
                    String h = Integer.toHexString(0xFF & b);
                    while (h.length() < 2) h = "0" + h;
                    hex.append(h);
                }
                return hex.toString();
            } catch (Throwable t) {
                return String.valueOf(Math.abs(s.hashCode()));
            }
        }

        private void writeFileBytes(File file, byte[] data) {
            try (FileOutputStream fos = new FileOutputStream(file)) {
                fos.write(data);
                fos.flush();
            } catch (Throwable ignored) {}
        }

        @JavascriptInterface
        public boolean saveCachedSentenceAudio(String voice, float rate, float pitch, String text, String base64Data) {
            try {
                if (base64Data == null || base64Data.isEmpty() || text == null || text.trim().isEmpty()) {
                    return false;
                }
                MediaPlaybackService service = MediaPlaybackService.getInstance();
                File cacheDir = (service != null) ? new File(service.getCacheDir(), "tts_cache") : new File(getCacheDir(), "tts_cache");
                if (!cacheDir.exists()) {
                    cacheDir.mkdirs();
                }
                byte[] audioBytes = Base64.decode(base64Data, Base64.DEFAULT);
                if (audioBytes == null || audioBytes.length <= 512) {
                    return false;
                }

                String cleanVoice = (voice != null && !voice.isEmpty()) ? voice : "edge:vi-VN-NamMinhNeural";
                String trimmed = text.trim();

                // 1. Exact key with voice, rate, pitch
                writeFileBytes(new File(cacheDir, "sent_" + md5(cleanVoice + "_" + rate + "_" + pitch + "_" + text) + ".mp3"), audioBytes);
                // 2. Normalized key (1.0 rate & pitch) so playback at any speed matches
                writeFileBytes(new File(cacheDir, "sent_" + md5(cleanVoice + "_1.0_1.0_" + text) + ".mp3"), audioBytes);
                // 3. Text-only key (fallback for any voice / rate)
                writeFileBytes(new File(cacheDir, "sent_txt_" + md5(trimmed) + ".mp3"), audioBytes);
                return true;
            } catch (Throwable t) {
                t.printStackTrace();
            }
            return false;
        }

        @JavascriptInterface
        public boolean isSentenceAudioCached(String voice, float rate, float pitch, String text) {
            try {
                if (text == null || text.trim().isEmpty()) return false;
                MediaPlaybackService service = MediaPlaybackService.getInstance();
                File cacheDir = (service != null) ? new File(service.getCacheDir(), "tts_cache") : new File(getCacheDir(), "tts_cache");
                if (!cacheDir.exists()) return false;

                String cleanVoice = (voice != null && !voice.isEmpty()) ? voice : "edge:vi-VN-NamMinhNeural";
                File f1 = new File(cacheDir, "sent_" + md5(cleanVoice + "_" + rate + "_" + pitch + "_" + text) + ".mp3");
                if (f1.exists() && f1.length() > 512) return true;

                File f2 = new File(cacheDir, "sent_" + md5(cleanVoice + "_1.0_1.0_" + text) + ".mp3");
                if (f2.exists() && f2.length() > 512) return true;

                File f3 = new File(cacheDir, "sent_txt_" + md5(text.trim()) + ".mp3");
                if (f3.exists() && f3.length() > 512) return true;
            } catch (Throwable t) {
                t.printStackTrace();
            }
            return false;
        }

        @JavascriptInterface
        public void setKeepScreenOn(boolean keepOn) {
            runOnUiThread(() -> {
                try {
                    if (keepOn) {
                        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    } else {
                        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    }
                } catch (Throwable t) {
                    t.printStackTrace();
                }
            });
        }

        @JavascriptInterface
        public boolean isBatteryOptimizationIgnored() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try {
                    PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                    if (pm != null) {
                        return pm.isIgnoringBatteryOptimizations(getPackageName());
                    }
                } catch (Exception ignored) {}
            }
            return true;
        }

        @JavascriptInterface
        public void requestBatteryOptimizationExemption() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                try {
                    PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                    if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                        intent.setData(Uri.parse("package:" + getPackageName()));
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                        return;
                    }
                } catch (Exception e) {
                    try {
                        Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    } catch (Exception ignored) {}
                }
            }
        }

        @JavascriptInterface
        public void openAppBatterySettings() {
            try {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (Exception e) {
                try {
                    Intent intent = new Intent(Settings.ACTION_SETTINGS);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception ignored) {}
            }
        }

        @JavascriptInterface
        public String getAppVersionInfo() {
            try {
                PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
                long vCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P 
                    ? pInfo.getLongVersionCode() 
                    : (long) pInfo.versionCode;
                return "{\"versionCode\":" + vCode + ",\"versionName\":\"" + pInfo.versionName + "\"}";
            } catch (Exception e) {
                return "{\"versionCode\":100,\"versionName\":\"1.0.0\"}";
            }
        }

        @JavascriptInterface
        public boolean canInstallApk() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                return getPackageManager().canRequestPackageInstalls();
            }
            return true;
        }

        @JavascriptInterface
        public void openInstallPermissionSettings() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } catch (Exception e) {
                    try {
                        Intent intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                    } catch (Exception ignored) {}
                }
            }
        }

        @JavascriptInterface
        public void downloadAndInstallApk(final String downloadUrl) {
            new Thread(() -> {
                InputStream input = null;
                FileOutputStream output = null;
                HttpURLConnection connection = null;
                try {
                    sendWebViewCommand("window.appUpdater && window.appUpdater.onDownloadProgress && window.appUpdater.onDownloadProgress(0, 100, 0)");
                    
                    URL url = new URL(downloadUrl);
                    connection = (HttpURLConnection) url.openConnection();
                    connection.setInstanceFollowRedirects(true);
                    connection.setConnectTimeout(15000);
                    connection.setReadTimeout(30000);
                    connection.connect();

                    int responseCode = connection.getResponseCode();
                    if (responseCode == HttpURLConnection.HTTP_MOVED_TEMP || 
                        responseCode == HttpURLConnection.HTTP_MOVED_PERM || 
                        responseCode == HttpURLConnection.HTTP_SEE_OTHER) {
                        String newUrl = connection.getHeaderField("Location");
                        connection.disconnect();
                        url = new URL(newUrl);
                        connection = (HttpURLConnection) url.openConnection();
                        connection.setInstanceFollowRedirects(true);
                        connection.setConnectTimeout(15000);
                        connection.setReadTimeout(30000);
                        connection.connect();
                    }

                    int fileLength = connection.getContentLength();
                    input = connection.getInputStream();

                    File cacheDir = getExternalCacheDir();
                    if (cacheDir == null) cacheDir = getCacheDir();
                    final File apkFile = new File(cacheDir, "ChillReader-update.apk");
                    if (apkFile.exists()) {
                        apkFile.delete();
                    }
                    output = new FileOutputStream(apkFile);

                    byte[] data = new byte[8192];
                    long total = 0;
                    int count;
                    long lastProgressTime = 0;

                    while ((count = input.read(data)) != -1) {
                        total += count;
                        output.write(data, 0, count);

                        long now = System.currentTimeMillis();
                        if (now - lastProgressTime > 150 || total == fileLength) {
                            lastProgressTime = now;
                            int percent = fileLength > 0 ? (int) ((total * 100) / fileLength) : -1;
                            final long curTotal = total;
                            final int fLength = fileLength;
                            final int pct = percent;
                            runOnUiThread(() -> {
                                sendWebViewCommand("window.appUpdater && window.appUpdater.onDownloadProgress && window.appUpdater.onDownloadProgress(" + curTotal + ", " + fLength + ", " + pct + ")");
                            });
                        }
                    }

                    output.flush();
                    output.close();
                    output = null;
                    input.close();
                    input = null;

                    runOnUiThread(() -> {
                        sendWebViewCommand("window.appUpdater && window.appUpdater.onDownloadComplete && window.appUpdater.onDownloadComplete()");
                        promptInstallApk(apkFile);
                    });

                } catch (Exception e) {
                    e.printStackTrace();
                    final String errMsg = e.getMessage() != null ? e.getMessage().replace("'", "\\'") : "Lỗi khi tải file cập nhật";
                    runOnUiThread(() -> {
                        sendWebViewCommand("window.appUpdater && window.appUpdater.onDownloadError && window.appUpdater.onDownloadError('" + errMsg + "')");
                    });
                } finally {
                    try {
                        if (output != null) output.close();
                        if (input != null) input.close();
                        if (connection != null) connection.disconnect();
                    } catch (Exception ignored) {}
                }
            }).start();
        }
    }

    private void promptInstallApk(File apkFile) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (!getPackageManager().canRequestPackageInstalls()) {
                    Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                    settingsIntent.setData(Uri.parse("package:" + getPackageName()));
                    settingsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(settingsIntent);
                    sendWebViewCommand("window.appUpdater && window.appUpdater.onPermissionRequired && window.appUpdater.onPermissionRequired()");
                    return;
                }
            }

            Intent intent = new Intent(Intent.ACTION_VIEW);
            Uri apkUri = FileProvider.getUriForFile(
                this, 
                getPackageName() + ".fileprovider", 
                apkFile
            );
            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            e.printStackTrace();
            sendWebViewCommand("window.appUpdater && window.appUpdater.onInstallError && window.appUpdater.onInstallError('" + (e.getMessage() != null ? e.getMessage().replace("'", "\\'") : "Lỗi cài đặt") + "')");
        }
    }

    @Override
    public void onBackPressed() {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView != null) {
            webView.evaluateJavascript("window.handleAndroidBack ? window.handleAndroidBack() : false", value -> {
                String cleanVal = value != null ? value.replace("\"", "").trim() : "false";
                if ("true".equalsIgnoreCase(cleanVal) || "handled".equalsIgnoreCase(cleanVal)) {
                    // Handled internally in web app (returned to library, closed modal, etc.)
                    return;
                }

                long currentTime = System.currentTimeMillis();
                if (currentTime - lastBackPressTime < 2000) {
                    finish();
                } else {
                    lastBackPressTime = currentTime;
                    Toast.makeText(MainActivity.this, "Nhấn quay lại lần nữa để thoát", Toast.LENGTH_SHORT).show();
                }
            });
            return;
        }
        super.onBackPressed();
    }

    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        try {
            if (level >= TRIM_MEMORY_COMPLETE && !MediaPlaybackService.isPlaying()) {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null) {
                    webView.clearCache(false);
                }
                System.gc();
            }
        } catch (Throwable ignored) {}
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (sInstance == this) {
            sInstance = null;
        }
        if (nativeTts != null) {
            try {
                if (!MediaPlaybackService.isPlaying()) {
                    nativeTts.stop();
                    nativeTts.shutdown();
                    nativeTts = null;
                    isNativeTtsReady = false;
                }
            } catch (Exception ignored) {}
        }
    }
}
