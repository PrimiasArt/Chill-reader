package com.chillreader.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.core.content.FileProvider;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;

public class MainActivity extends BridgeActivity {
    private static volatile MainActivity sInstance = null;

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
                    webView.evaluateJavascript(js, null);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    private void initNativeTts() {
        try {
            nativeTts = new TextToSpeech(getApplicationContext(), status -> {
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
            });
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
                nativeTts.stop();
                nativeTts.shutdown();
            } catch (Exception ignored) {}
            nativeTts = null;
            isNativeTtsReady = false;
        }
    }
}
