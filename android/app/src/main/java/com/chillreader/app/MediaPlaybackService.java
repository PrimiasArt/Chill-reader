package com.chillreader.app;

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioPlaybackConfiguration;
import android.media.AudioTrack;
import android.media.MediaPlayer;
import android.media.PlaybackParams;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import java.util.Set;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Base64;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.InputStream;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;

/**
 * Foreground Audio Playback Service for Chill Reader.
 * - Guarantees background audio continuity without sleep stutter (WakeLock + WifiLock).
 * - Implements Native Offline TextToSpeech queue directly in Java so local voices read
 *   persistently through the night without dependency on paused WebViews.
 * - Integrates seamlessly with Android 11+ System Media Player & Lock Screen controls.
 * - Handles Audio Focus changes (pauses on calls/navigation, resumes automatically).
 * - Allows concurrent playback alongside other apps/games without silent focus interruptions.
 */
public class MediaPlaybackService extends Service {
    public static final String CHANNEL_ID = "chill_reader_playback_v3";
    public static final int NOTIFICATION_ID = 9021;

    public static final String PREFS_NAME = "chill_reader_playback_prefs";
    public static final String PREF_PLAY_ALONG = "pref_play_along_other_apps";

    public static final String ACTION_PLAY_PAUSE = "com.chillreader.ACTION_PLAY_PAUSE";
    public static final String ACTION_NEXT = "com.chillreader.ACTION_NEXT";
    public static final String ACTION_PREV = "com.chillreader.ACTION_PREV";
    public static final String ACTION_STOP = "com.chillreader.ACTION_STOP";

    public static final String ACTION_UPDATE_PLAYBACK = "com.chillreader.ACTION_UPDATE_PLAYBACK";
    public static final String ACTION_CLEAR_PLAYBACK = "com.chillreader.ACTION_CLEAR_PLAYBACK";
    public static final String ACTION_START_NATIVE_QUEUE = "com.chillreader.ACTION_START_NATIVE_QUEUE";
    public static final String ACTION_SET_AUDIO_FOCUS_MODE = "com.chillreader.ACTION_SET_AUDIO_FOCUS_MODE";

    public static final String EXTRA_CHAPTER_TITLE = "extra_chapter_title";
    public static final String EXTRA_BOOK_TITLE = "extra_book_title";
    public static final String EXTRA_AUTHOR = "extra_author";
    public static final String EXTRA_IS_PLAYING = "extra_is_playing";
    public static final String EXTRA_COVER_URL = "extra_cover_url";
    public static final String EXTRA_CURRENT_SENTENCE = "extra_current_sentence";
    public static final String EXTRA_TOTAL_SENTENCES = "extra_total_sentences";
    public static final String EXTRA_SENTENCES_JSON = "extra_sentences_json";
    public static final String EXTRA_START_INDEX = "extra_start_index";
    public static final String EXTRA_RATE = "extra_rate";
    public static final String EXTRA_PITCH = "extra_pitch";
    public static final String EXTRA_PLAY_ALONG_OTHER_APPS = "extra_play_along_other_apps";
    public static final String EXTRA_VOICE_URI = "extra_voice_uri";

    private static volatile MediaPlaybackService sInstance = null;
    private static volatile boolean sIsPlaying = false;
    private volatile boolean playAlongOtherApps = true;
    private volatile boolean pausedBySystem = false;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private HandlerThread playbackThread = null;
    private Handler playbackHandler = null;
    private int nativeConsecutiveErrors = 0;
    private long lastPauseTimestamp = 0;
    private Runnable ttsWatchdogRunnable = null;
    private boolean isForegroundRunning = false;

    private Handler getPlaybackHandler() {
        return playbackHandler != null ? playbackHandler : mainHandler;
    }

    private NotificationManager notificationManager;
    private MediaSessionCompat mediaSession;
    private BroadcastReceiver mediaActionReceiver;
    private boolean isReceiverRegistered = false;

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private AudioTrack silentAudioTrack = null;

    private AudioManager audioManager;
    private AudioManager.OnAudioFocusChangeListener audioFocusChangeListener;
    private AudioFocusRequest audioFocusRequest;
    private BroadcastReceiver alarmAlertReceiver;
    private boolean isAlarmReceiverRegistered = false;

    // Native Offline TextToSpeech queue
    private TextToSpeech nativeTts;
    private volatile boolean isNativeTtsReady = false;
    private final List<String> nativeSentences = new ArrayList<>();
    private volatile int nativeSentenceIndex = 0;
    private volatile float nativeRate = 1.0f;
    private volatile float nativePitch = 1.0f;
    private volatile boolean isNativeTtsMode = false;
    private volatile String selectedVoiceName = "";
    private volatile String currentSpeakingUtteranceId = "";

    // Online Audio Player (for Edge TTS / Google TTS native background streaming)
    private MediaPlayer onlinePlayer = null;
    private volatile int currentOnlineSentenceToken = 0;
    private final ExecutorService onlineTtsExecutor = Executors.newSingleThreadExecutor();
    private final ExecutorService prefetchExecutor = Executors.newFixedThreadPool(2);

    private final ExecutorService imageExecutor = Executors.newSingleThreadExecutor();
    private volatile String lastCoverUrl = null;
    private volatile Bitmap lastCoverBitmap = null;
    private volatile String loadingCoverUrl = null;
    private static Bitmap cachedLauncherBitmap = null;
    private Runnable gracefulTeardownRunnable = null;

    private String currentChapterTitle = "";
    private String currentBookTitle = "";
    private String currentAuthor = "";
    private int currentSentenceIndex = 0;
    private int currentTotalSentences = 0;

    public static MediaPlaybackService getInstance() {
        return sInstance;
    }

    public static boolean isPlaying() {
        return sIsPlaying;
    }

    public static boolean isPlaybackActive() {
        return sIsPlaying || (sInstance != null && sInstance.isForegroundRunning);
    }

    public static void startOrUpdate(
        Context context,
        String chapterTitle,
        String bookTitle,
        String author,
        boolean isPlaying,
        String coverUrl,
        int currentSentence,
        int totalSentences
    ) {
        try {
            if (context == null) return;
            if (!isPlaying && sInstance == null) {
                return;
            }

            // High performance: if service is already running, update in-memory directly
            // Avoids ForegroundServiceStartNotAllowedException on Android 12+ from background
            MediaPlaybackService service = sInstance;
            if (service != null) {
                service.updatePlaybackDirect(
                    chapterTitle,
                    bookTitle,
                    author,
                    isPlaying,
                    coverUrl,
                    currentSentence,
                    totalSentences
                );
                return;
            }

            Intent intent = new Intent(context, MediaPlaybackService.class);
            intent.setAction(ACTION_UPDATE_PLAYBACK);
            intent.putExtra(EXTRA_CHAPTER_TITLE, chapterTitle);
            intent.putExtra(EXTRA_BOOK_TITLE, bookTitle);
            intent.putExtra(EXTRA_AUTHOR, author);
            intent.putExtra(EXTRA_IS_PLAYING, isPlaying);
            intent.putExtra(EXTRA_COVER_URL, coverUrl);
            intent.putExtra(EXTRA_CURRENT_SENTENCE, currentSentence);
            intent.putExtra(EXTRA_TOTAL_SENTENCES, totalSentences);

            if (isPlaying) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    ContextCompat.startForegroundService(context, intent);
                } else {
                    context.startService(intent);
                }
            } else {
                context.startService(intent);
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }
    }

    public void updatePlaybackDirect(
        String chapterTitle,
        String bookTitle,
        String author,
        boolean isPlaying,
        String coverUrl,
        int currentSentence,
        int totalSentences
    ) {
        mainHandler.post(() -> {
            try {
                if (isNativeTtsMode) {
                    currentChapterTitle = chapterTitle;
                    currentBookTitle = bookTitle;
                    currentAuthor = author;
                    return;
                }
                isNativeTtsMode = false;
                currentChapterTitle = chapterTitle;
                currentBookTitle = bookTitle;
                currentAuthor = author;
                currentSentenceIndex = currentSentence;
                currentTotalSentences = totalSentences;
                sIsPlaying = isPlaying;

                if (isPlaying) {
                    requestAudioFocus();
                    startSilentNativeAudio();
                    acquireLocks();
                } else {
                    stopSilentNativeAudio();
                    releaseLocks();
                }

                renderNotificationAndForeground(isPlaying, coverUrl);
            } catch (Throwable t) {
                t.printStackTrace();
            }
        });
    }

    public synchronized void startSilentNativeAudio() {
        try {
            if (silentAudioTrack != null) {
                if (silentAudioTrack.getState() == AudioTrack.STATE_INITIALIZED) {
                    if (silentAudioTrack.getPlayState() == AudioTrack.PLAYSTATE_PLAYING) {
                        return;
                    }
                    try {
                        silentAudioTrack.play();
                        return;
                    } catch (Throwable ignored) {
                        stopSilentNativeAudio();
                    }
                } else {
                    stopSilentNativeAudio();
                }
            }

            int sampleRate = 44100;
            int channelConfig = AudioFormat.CHANNEL_OUT_MONO;
            int audioFormat = AudioFormat.ENCODING_PCM_16BIT;
            int minBufferSize = AudioTrack.getMinBufferSize(sampleRate, channelConfig, audioFormat);
            int bufferSize = (minBufferSize > 0) ? Math.max(minBufferSize, sampleRate * 2) : sampleRate * 2;
            byte[] silentData = new byte[bufferSize];

            // Fill with microscopic inaudible dither (+1, -1 16-bit PCM)
            // This prevents MediaTek / HiOS DSP silence detection from powering down the DAC bus on screen timeout
            for (int i = 0; i < bufferSize - 1; i += 2) {
                short sample = (short) ((i % 4 == 0) ? 1 : -1);
                silentData[i] = (byte) (sample & 0xFF);
                silentData[i + 1] = (byte) ((sample >> 8) & 0xFF);
            }

            AudioAttributes attributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();

            AudioFormat format = new AudioFormat.Builder()
                .setSampleRate(sampleRate)
                .setEncoding(audioFormat)
                .setChannelMask(channelConfig)
                .build();

            silentAudioTrack = new AudioTrack(
                attributes,
                format,
                bufferSize,
                AudioTrack.MODE_STATIC,
                AudioManager.AUDIO_SESSION_ID_GENERATE
            );

            if (silentAudioTrack.getState() == AudioTrack.STATE_INITIALIZED) {
                silentAudioTrack.write(silentData, 0, silentData.length);
                int frameCount = bufferSize / 2;
                silentAudioTrack.setLoopPoints(0, frameCount, -1);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    silentAudioTrack.setVolume(0.001f);
                }
                silentAudioTrack.play();
            } else {
                silentAudioTrack.release();
                silentAudioTrack = null;
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }
    }

    public synchronized void stopSilentNativeAudio() {
        try {
            if (silentAudioTrack != null) {
                if (silentAudioTrack.getState() == AudioTrack.STATE_INITIALIZED) {
                    try {
                        silentAudioTrack.pause();
                        silentAudioTrack.flush();
                        silentAudioTrack.stop();
                    } catch (Throwable ignored) {}
                }
                silentAudioTrack.release();
                silentAudioTrack = null;
            }
        } catch (Throwable ignored) {}
    }

    public static void startNativeQueue(
        Context context,
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
            if (context == null) return;
            MediaPlaybackService service = sInstance;
            if (service != null) {
                service.currentChapterTitle = chapterTitle;
                service.currentBookTitle = bookTitle;
                service.currentAuthor = author;
                service.mainHandler.post(() -> {
                    service.loadAndStartNativeQueue(sentencesJson, startIndex, rate, pitch, coverUrl, voiceURI);
                });
                return;
            }

            Intent intent = new Intent(context, MediaPlaybackService.class);
            intent.setAction(ACTION_START_NATIVE_QUEUE);
            intent.putExtra(EXTRA_CHAPTER_TITLE, chapterTitle);
            intent.putExtra(EXTRA_BOOK_TITLE, bookTitle);
            intent.putExtra(EXTRA_AUTHOR, author);
            intent.putExtra(EXTRA_COVER_URL, coverUrl);
            intent.putExtra(EXTRA_SENTENCES_JSON, sentencesJson);
            intent.putExtra(EXTRA_START_INDEX, startIndex);
            intent.putExtra(EXTRA_RATE, rate);
            intent.putExtra(EXTRA_PITCH, pitch);
            intent.putExtra(EXTRA_VOICE_URI, voiceURI);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(context, intent);
            } else {
                context.startService(intent);
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }
    }

    public static void startNativeQueue(
        Context context,
        String chapterTitle,
        String bookTitle,
        String author,
        String coverUrl,
        String sentencesJson,
        int startIndex,
        float rate,
        float pitch
    ) {
        startNativeQueue(context, chapterTitle, bookTitle, author, coverUrl, sentencesJson, startIndex, rate, pitch, "");
    }

    public static void stop(Context context) {
        try {
            if (context == null || sInstance == null) return;
            Intent intent = new Intent(context, MediaPlaybackService.class);
            intent.setAction(ACTION_CLEAR_PLAYBACK);
            context.startService(intent);
        } catch (Throwable t) {
            t.printStackTrace();
        }
    }

    public static void setPlayAlong(Context context, boolean enable) {
        try {
            if (sInstance != null) {
                sInstance.setPlayAlongOtherApps(enable);
            }
            if (context != null) {
                Intent intent = new Intent(context, MediaPlaybackService.class);
                intent.setAction(ACTION_SET_AUDIO_FOCUS_MODE);
                intent.putExtra(EXTRA_PLAY_ALONG_OTHER_APPS, enable);
                context.startService(intent);
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }
    }

    public void setPlayAlongOtherApps(boolean enable) {
        this.playAlongOtherApps = enable;
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putBoolean(PREF_PLAY_ALONG, enable).apply();
        } catch (Throwable ignored) {}
    }

    public boolean isPlayAlongOtherApps() {
        return this.playAlongOtherApps;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        sInstance = this;

        try {
            playbackThread = new HandlerThread("ChillReaderPlayback", android.os.Process.THREAD_PRIORITY_AUDIO);
            playbackThread.start();
            playbackHandler = new Handler(playbackThread.getLooper());
        } catch (Throwable t) {
            playbackHandler = new Handler(Looper.getMainLooper());
        }

        final Thread.UncaughtExceptionHandler serviceDefaultHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, throwable) -> {
            try {
                android.util.Log.e("ChillReaderCrash", "Service crash on thread: " + thread.getName(), throwable);
                File crashFile = new File(getCacheDir(), "chillreader_crash.log");
                FileWriter writer = new FileWriter(crashFile, true);
                writer.write("--- SERVICE CRASH at " + new java.util.Date() + " on " + thread.getName() + " ---\n");
                StringWriter sw = new StringWriter();
                PrintWriter pw = new PrintWriter(sw);
                throwable.printStackTrace(pw);
                writer.write(sw.toString() + "\n\n");
                writer.close();
            } catch (Throwable ignored) {}
            if (serviceDefaultHandler != null) {
                serviceDefaultHandler.uncaughtException(thread, throwable);
            }
        });

        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            playAlongOtherApps = prefs.getBoolean(PREF_PLAY_ALONG, true);
        } catch (Throwable ignored) {}

        createNotificationChannel();
        initMediaSession();
        registerMediaReceiver();
        registerAlarmAndCallMonitor();
        initNativeTts();

        // Android 8.0+ contract: guarantee startForeground is called immediately
        try {
            Notification initNotification = buildNotification(
                "Chill Reader",
                "Đang phát âm thanh",
                "Chill Reader",
                true,
                null
            );
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, initNotification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, initNotification);
            }
            isForegroundRunning = true;
        } catch (Throwable t) {
            t.printStackTrace();
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        if (ACTION_CLEAR_PLAYBACK.equals(action)) {
            clearPlayback();
            return START_NOT_STICKY;
        }

        if (ACTION_SET_AUDIO_FOCUS_MODE.equals(action)) {
            boolean enable = intent.getBooleanExtra(EXTRA_PLAY_ALONG_OTHER_APPS, true);
            setPlayAlongOtherApps(enable);
            return START_STICKY;
        }

        if (ACTION_START_NATIVE_QUEUE.equals(action)) {
            currentChapterTitle = intent.getStringExtra(EXTRA_CHAPTER_TITLE);
            currentBookTitle = intent.getStringExtra(EXTRA_BOOK_TITLE);
            currentAuthor = intent.getStringExtra(EXTRA_AUTHOR);
            String coverUrl = intent.getStringExtra(EXTRA_COVER_URL);
            String sentencesJson = intent.getStringExtra(EXTRA_SENTENCES_JSON);
            int startIndex = intent.getIntExtra(EXTRA_START_INDEX, 0);
            float rate = intent.getFloatExtra(EXTRA_RATE, 1.0f);
            float pitch = intent.getFloatExtra(EXTRA_PITCH, 1.0f);
            String voiceURI = intent.getStringExtra(EXTRA_VOICE_URI);

            loadAndStartNativeQueue(sentencesJson, startIndex, rate, pitch, coverUrl, voiceURI);
            return START_STICKY;
        }

        if (ACTION_UPDATE_PLAYBACK.equals(action)) {
            // Web / Online audio update
            if (isNativeTtsMode) {
                // If currently running in native offline TTS mode, DO NOT override or cancel native queue!
                return START_STICKY;
            }
            isNativeTtsMode = false;
            currentChapterTitle = intent.getStringExtra(EXTRA_CHAPTER_TITLE);
            currentBookTitle = intent.getStringExtra(EXTRA_BOOK_TITLE);
            currentAuthor = intent.getStringExtra(EXTRA_AUTHOR);
            boolean isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, false);
            String coverUrl = intent.getStringExtra(EXTRA_COVER_URL);
            currentSentenceIndex = intent.getIntExtra(EXTRA_CURRENT_SENTENCE, 0);
            currentTotalSentences = intent.getIntExtra(EXTRA_TOTAL_SENTENCES, 0);

            sIsPlaying = isPlaying;
            if (isPlaying) {
                requestAudioFocus();
                startSilentNativeAudio();
                acquireLocks();
            } else {
                stopSilentNativeAudio();
                releaseLocks();
            }
            renderNotificationAndForeground(isPlaying, coverUrl);
            return START_STICKY;
        }

        return START_NOT_STICKY;
    }

    private void createNotificationChannel() {
        try {
            notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && notificationManager != null) {
                try {
                    notificationManager.deleteNotificationChannel("chill_reader_playback_channel");
                    notificationManager.deleteNotificationChannel("chill_reader_playback_channel_v2");
                } catch (Throwable ignored) {}

                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Trình phát âm thanh Chill Reader",
                    NotificationManager.IMPORTANCE_DEFAULT
                );
                channel.setDescription("Điều khiển âm thanh Chill Reader trên màn hình khóa và thanh thông báo");
                channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                channel.setShowBadge(true);
                channel.setSound(null, null);
                channel.enableVibration(false);
                notificationManager.createNotificationChannel(channel);
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }
    }

    private void initMediaSession() {
        if (mediaSession != null) return;
        try {
            mediaSession = new MediaSessionCompat(this, "ChillReaderPlaybackSession");
            mediaSession.setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS |
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
            );

            mediaSession.setCallback(new MediaSessionCompat.Callback() {
                @Override
                public void onPlay() {
                    if (isNativeTtsMode) {
                        resumeNativeTts();
                    } else {
                        MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.play()");
                    }
                }

                @Override
                public void onPause() {
                    if (isNativeTtsMode) {
                        pauseNativeTts();
                    } else {
                        MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.pause()");
                    }
                }

                @Override
                public void onSkipToNext() {
                    if (isNativeTtsMode) {
                        jumpToNativeSentence(nativeSentenceIndex + 1);
                    } else {
                        MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.nextSentence()");
                    }
                }

                @Override
                public void onSkipToPrevious() {
                    if (isNativeTtsMode) {
                        jumpToNativeSentence(nativeSentenceIndex - 1);
                    } else {
                        MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.previousSentence()");
                    }
                }

                @Override
                public void onStop() {
                    if (isNativeTtsMode) {
                        stopNativeTts();
                    } else {
                        MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.stop()");
                    }
                }

                @Override
                public void onSeekTo(long pos) {
                    int sentenceIdx = (int) (pos / 1000L);
                    if (isNativeTtsMode) {
                        jumpToNativeSentence(sentenceIdx);
                    } else {
                        MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.jumpToSentence(" + sentenceIdx + ")");
                    }
                }
            });

            mediaSession.setActive(true);
        } catch (Throwable e) {
            e.printStackTrace();
        }
    }

    private void registerMediaReceiver() {
        if (isReceiverRegistered) return;
        mediaActionReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent != null ? intent.getAction() : null;
                if (action == null) return;

                if (ACTION_PLAY_PAUSE.equals(action)) {
                    if (isNativeTtsMode) {
                        if (sIsPlaying) {
                            pauseNativeTts();
                        } else {
                            resumeNativeTts();
                        }
                    } else {
                        MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.togglePlayPause()");
                    }
                } else if (ACTION_NEXT.equals(action)) {
                    if (isNativeTtsMode) {
                        jumpToNativeSentence(nativeSentenceIndex + 1);
                    } else {
                        MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.nextSentence()");
                    }
                } else if (ACTION_PREV.equals(action)) {
                    if (isNativeTtsMode) {
                        jumpToNativeSentence(nativeSentenceIndex - 1);
                    } else {
                        MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.previousSentence()");
                    }
                } else if (ACTION_STOP.equals(action)) {
                    if (isNativeTtsMode) {
                        stopNativeTts();
                    } else {
                        MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.stop()");
                    }
                }
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_PLAY_PAUSE);
        filter.addAction(ACTION_NEXT);
        filter.addAction(ACTION_PREV);
        filter.addAction(ACTION_STOP);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(mediaActionReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(mediaActionReceiver, filter);
        }
        isReceiverRegistered = true;
    }

    /**
     * High-Priority Audio Monitoring:
     * Guarantees alarms (Google Clock, Samsung Clock, Xiaomi Clock), incoming calls (Cellular),
     * and VoIP communication apps (Zalo, Instagram, Messenger, WhatsApp) immediately pause
     * Chill Reader so alarms and calls are never missed or drowned out.
     */
    private void registerAlarmAndCallMonitor() {
        if (audioManager == null) {
            audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        }

        // BroadcastReceiver for Clock / Alarm Alerts (Samsung, Google, Xiaomi, Oppo, Vivo, Asus, AOSP Clocks)
        if (!isAlarmReceiverRegistered) {
            alarmAlertReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    String action = intent != null ? intent.getAction() : null;
                    if (action == null) return;

                    if (action.contains("ALARM_ALERT") || action.contains("alarm_alert")) {
                        // Alarm started ringing! Pause reading immediately so user wakes up!
                        if (sIsPlaying) {
                            if (isNativeTtsMode) {
                                pauseNativeTts(true);
                            } else {
                                pausedBySystem = true;
                                MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.pause()");
                            }
                        }
                    } else if (action.contains("ALARM_DISMISSED") || action.contains("ALARM_DONE") || action.contains("ALARM_SNOOZE") || action.contains("ALARM_STOP") || action.contains("DISMISS")) {
                        // Alarm dismissed or snoozed
                        if (pausedBySystem && !sIsPlaying) {
                            pausedBySystem = false;
                            if (isNativeTtsMode) {
                                resumeNativeTts();
                            } else {
                                MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.play()");
                            }
                        }
                    }
                }
            };

            IntentFilter filter = new IntentFilter();
            filter.addAction("com.android.deskclock.ALARM_ALERT");
            filter.addAction("com.google.android.deskclock.action.ALARM_ALERT");
            filter.addAction("com.samsung.sec.android.clockpackage.alarm.ALARM_ALERT");
            filter.addAction("com.sec.android.app.clockpackage.alarm.ALARM_ALERT");
            filter.addAction("com.android.alarmclock.ALARM_ALERT");
            filter.addAction("com.oppo.alarmclock.ALARM_ALERT");
            filter.addAction("com.coloros.alarmclock.ALARM_ALERT");
            filter.addAction("com.vivo.alarmclock.ALARM_ALERT");
            filter.addAction("com.asus.alarmclock.ALARM_ALERT");
            filter.addAction("com.android.deskclock.ALARM_DISMISSED");
            filter.addAction("com.android.deskclock.ALARM_DONE");
            filter.addAction("com.android.deskclock.ALARM_SNOOZE");
            filter.addAction("com.google.android.deskclock.action.ALARM_DISMISSED");
            filter.addAction("com.google.android.deskclock.action.ALARM_DONE");
            filter.addAction("com.samsung.sec.android.clockpackage.alarm.ALARM_STOP");
            filter.addAction("com.sec.android.app.clockpackage.alarm.ALARM_DISMISS");
            filter.addAction("com.oppo.alarmclock.ALARM_DISMISSED");
            filter.addAction("com.vivo.alarmclock.ALARM_DISMISSED");

            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    registerReceiver(alarmAlertReceiver, filter, Context.RECEIVER_EXPORTED);
                } else {
                    registerReceiver(alarmAlertReceiver, filter);
                }
                isAlarmReceiverRegistered = true;
            } catch (Throwable t) {
                t.printStackTrace();
            }
        }
    }

    private boolean isCallActive() {
        try {
            if (audioManager == null) {
                audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            }
            if (audioManager != null) {
                int mode = audioManager.getMode();
                return mode == AudioManager.MODE_IN_CALL || 
                       mode == AudioManager.MODE_IN_COMMUNICATION || 
                       mode == AudioManager.MODE_RINGTONE;
            }
        } catch (Throwable ignored) {}
        return false;
    }

    private boolean isHighPriorityAudioActive() {
        return isCallActive();
    }

    public TextToSpeech getNativeTtsInstance() {
        return nativeTts;
    }

    public static String findBestTtsEngine(Context context) {
        if (context == null) return null;
        try {
            android.content.pm.PackageManager pm = context.getPackageManager();
            Intent intent = new Intent("android.intent.action.TTS_SERVICE");
            List<android.content.pm.ResolveInfo> resolveInfos = pm.queryIntentServices(intent, 0);
            if (resolveInfos != null && !resolveInfos.isEmpty()) {
                // Priority 1: Google Speech Services (best Vietnamese TTS voice pack support)
                for (android.content.pm.ResolveInfo ri : resolveInfos) {
                    if (ri.serviceInfo != null && "com.google.android.tts".equalsIgnoreCase(ri.serviceInfo.packageName)) {
                        return "com.google.android.tts";
                    }
                }
                // Priority 2: Samsung TTS
                for (android.content.pm.ResolveInfo ri : resolveInfos) {
                    if (ri.serviceInfo != null && "com.samsung.SMT".equalsIgnoreCase(ri.serviceInfo.packageName)) {
                        return "com.samsung.SMT";
                    }
                }
            }
        } catch (Throwable ignored) {}
        return null;
    }

    private boolean isOnlineVoice(String voice) {
        if (voice == null || voice.trim().isEmpty()) return false;
        String lower = voice.toLowerCase(Locale.US).trim();
        return lower.startsWith("edge:") || lower.startsWith("google:");
    }

    private void applySelectedVoice() {
        if (nativeTts == null || !isNativeTtsReady) return;
        try {
            boolean voiceSet = false;
            boolean isOffline = !isNetworkConnected();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                Set<Voice> voices = null;
                try {
                    voices = nativeTts.getVoices();
                } catch (Throwable ignored) {}

                if (selectedVoiceName != null && !selectedVoiceName.trim().isEmpty()) {
                    String cleanVoiceName = selectedVoiceName.startsWith("native:") 
                        ? selectedVoiceName.substring(7) 
                        : selectedVoiceName;
                    
                    if (!cleanVoiceName.isEmpty() && !"android".equalsIgnoreCase(cleanVoiceName)) {
                        if (voices != null) {
                            for (Voice v : voices) {
                                if (v != null && (cleanVoiceName.equalsIgnoreCase(v.getName()) || 
                                                  cleanVoiceName.equalsIgnoreCase(v.getLocale().toLanguageTag()))) {
                                    if (isOffline && v.isNetworkConnectionRequired()) {
                                        continue;
                                    }
                                    nativeTts.setVoice(v);
                                    voiceSet = true;
                                    break;
                                }
                            }
                        }
                    }
                }

                // If user selected "native:android", or requested voice wasn't found or requires network while offline:
                // ALWAYS prioritize an OFFLINE voice (!isNetworkConnectionRequired()) for Vietnamese!
                if (!voiceSet && voices != null) {
                    Voice bestOfflineVoice = null;
                    Voice fallbackNetworkVoice = null;
                    for (Voice v : voices) {
                        if (v == null || v.getLocale() == null) continue;
                        String lang = v.getLocale().getLanguage();
                        String tag = v.getLocale().toLanguageTag();
                        if ("vi".equalsIgnoreCase(lang) || (tag != null && tag.toLowerCase(Locale.US).startsWith("vi"))) {
                            if (!v.isNetworkConnectionRequired()) {
                                bestOfflineVoice = v;
                                break;
                            } else if (fallbackNetworkVoice == null && !isOffline) {
                                fallbackNetworkVoice = v;
                            }
                        }
                    }
                    if (bestOfflineVoice != null) {
                        nativeTts.setVoice(bestOfflineVoice);
                        voiceSet = true;
                    } else if (fallbackNetworkVoice != null) {
                        nativeTts.setVoice(fallbackNetworkVoice);
                        voiceSet = true;
                    }
                }
            }

            // Fallback default Vietnamese locale
            if (!voiceSet) {
                int result = nativeTts.setLanguage(new Locale("vi", "VN"));
                if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                    nativeTts.setLanguage(new Locale("vi"));
                }
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }
    }

    private boolean isNetworkConnected() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Network network = cm.getActiveNetwork();
                if (network == null) return false;
                NetworkCapabilities caps = cm.getNetworkCapabilities(network);
                return caps != null && (
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ||
                    caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
                );
            } else {
                NetworkInfo activeNetwork = cm.getActiveNetworkInfo();
                return activeNetwork != null && activeNetwork.isConnected();
            }
        } catch (Throwable t) {
            return false;
        }
    }

    private void initNativeTts() {
        if (nativeTts != null) return;
        try {
            String bestEngine = findBestTtsEngine(getApplicationContext());
            TextToSpeech.OnInitListener initListener = new TextToSpeech.OnInitListener() {
                @Override
                public void onInit(int status) {
                    if (status == TextToSpeech.SUCCESS) {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                            try {
                                AudioAttributes aa = new AudioAttributes.Builder()
                                    .setUsage(AudioAttributes.USAGE_MEDIA)
                                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                    .build();
                                nativeTts.setAudioAttributes(aa);
                            } catch (Throwable ignored) {}
                        }

                        isNativeTtsReady = true;
                        applySelectedVoice();

                        nativeTts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                            @Override
                            public void onStart(String utteranceId) {
                                nativeConsecutiveErrors = 0;
                                getPlaybackHandler().post(() -> {
                                    MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.onNativeSentenceIndex && window.ttsEngine.onNativeSentenceIndex(" + nativeSentenceIndex + ")");
                                });
                            }

                            @Override
                            public void onDone(String utteranceId) {
                                getPlaybackHandler().post(() -> {
                                    cancelTtsWatchdog();
                                    nativeConsecutiveErrors = 0;
                                    if (!isNativeTtsMode || !sIsPlaying) return;
                                    nativeSentenceIndex++;
                                    playCurrentNativeSentence();
                                });
                            }

                            @Override
                            public void onError(String utteranceId) {
                                getPlaybackHandler().post(() -> {
                                    cancelTtsWatchdog();
                                    if (!isNativeTtsMode || !sIsPlaying) return;
                                    nativeSentenceIndex++;
                                    playCurrentNativeSentence();
                                });
                            }

                            @Override
                            public void onStop(String utteranceId, boolean interrupted) {
                                getPlaybackHandler().post(() -> {
                                    cancelTtsWatchdog();
                                    // If sIsPlaying is still true and we were NOT paused by system or user,
                                    // this was an unexpected engine abort/interruption (e.g. screen off, transient audio routing).
                                    // Recover after a brief debounce so playback never freezes!
                                    if (sIsPlaying && !pausedBySystem && isNativeTtsMode) {
                                        final int currentIndex = nativeSentenceIndex;
                                        getPlaybackHandler().postDelayed(() -> {
                                            if (sIsPlaying && !pausedBySystem && isNativeTtsMode && nativeSentenceIndex == currentIndex) {
                                                playCurrentNativeSentence();
                                            }
                                        }, 300);
                                    }
                                });
                            }
                        });

                        if (isNativeTtsMode && sIsPlaying) {
                            getPlaybackHandler().post(() -> playCurrentNativeSentence());
                        }
                    } else {
                        isNativeTtsReady = false;
                        // If specific engine failed to init, try system default
                        if (bestEngine != null) {
                            try {
                                nativeTts = new TextToSpeech(getApplicationContext(), this);
                            } catch (Throwable ignored) {}
                        }
                    }
                }
            };

            if (bestEngine != null) {
                nativeTts = new TextToSpeech(getApplicationContext(), initListener, bestEngine);
            } else {
                nativeTts = new TextToSpeech(getApplicationContext(), initListener);
            }
        } catch (Throwable t) {
            t.printStackTrace();
            isNativeTtsReady = false;
        }
    }

    private void loadAndStartNativeQueue(String sentencesJson, int startIndex, float rate, float pitch, String coverUrl, String voiceURI) {
        try {
            cancelGracefulTeardown();
            selectedVoiceName = voiceURI != null ? voiceURI : "";
            nativeSentences.clear();
            if (sentencesJson != null && !sentencesJson.trim().isEmpty()) {
                JSONArray arr = new JSONArray(sentencesJson);
                for (int i = 0; i < arr.length(); i++) {
                    nativeSentences.add(arr.getString(i));
                }
            }
            nativeSentenceIndex = Math.max(0, Math.min(startIndex, Math.max(0, nativeSentences.size() - 1)));
            nativeRate = rate;
            nativePitch = pitch;
            isNativeTtsMode = true;
            sIsPlaying = true;
            lastCoverUrl = coverUrl;

            requestAudioFocus();
            startSilentNativeAudio();
            acquireLocks();

            if (onlinePlayer != null) {
                try { onlinePlayer.reset(); } catch (Throwable ignored) {}
            }
            if (nativeTts != null) {
                try { nativeTts.stop(); } catch (Throwable ignored) {}
            }

            if (isOnlineVoice(selectedVoiceName)) {
                if (nativeTts != null) {
                    try { nativeTts.stop(); } catch (Throwable ignored) {}
                }
                cleanOldTtsCache();
                renderNotificationAndForeground(true, coverUrl);
                playCurrentNativeSentence();
            } else {
                if (onlinePlayer != null) {
                    try { onlinePlayer.reset(); } catch (Throwable ignored) {}
                }
                if (isNativeTtsReady && nativeTts != null) {
                    applySelectedVoice();
                    renderNotificationAndForeground(true, coverUrl);
                    playCurrentNativeSentence();
                } else {
                    initNativeTts();
                    renderNotificationAndForeground(true, coverUrl);
                }
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }
    }

    private String md5(String s) {
        try {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            digest.update(s.getBytes("UTF-8"));
            byte[] messageDigest = digest.digest();
            StringBuilder hexString = new StringBuilder();
            for (byte b : messageDigest) {
                String h = Integer.toHexString(0xFF & b);
                while (h.length() < 2) h = "0" + h;
                hexString.append(h);
            }
            return hexString.toString();
        } catch (Throwable t) {
            return String.valueOf(Math.abs(s.hashCode()));
        }
    }

    private void copyFile(File src, File dst) {
        try (FileInputStream in = new FileInputStream(src);
             FileOutputStream out = new FileOutputStream(dst)) {
            byte[] buf = new byte[8192];
            int len;
            while ((len = in.read(buf)) > 0) {
                out.write(buf, 0, len);
            }
            out.flush();
        } catch (Throwable ignored) {}
    }

    private File getCacheFileForSentence(String voice, float rate, float pitch, String text) {
        File cacheDir = new File(getCacheDir(), "tts_cache");
        if (!cacheDir.exists()) {
            cacheDir.mkdirs();
        }
        String cleanVoice = (voice != null && !voice.isEmpty()) ? voice : "edge:vi-VN-NamMinhNeural";

        // 1. Exact match with voice, rate, pitch
        File f1 = new File(cacheDir, "sent_" + md5(cleanVoice + "_" + rate + "_" + pitch + "_" + text) + ".mp3");
        if (f1.exists() && f1.length() > 512) return f1;

        // 2. Normalized match (1.0 rate & pitch) so audio downloaded at normal speed plays at any rate
        File f2 = new File(cacheDir, "sent_" + md5(cleanVoice + "_1.0_1.0_" + text) + ".mp3");
        if (f2.exists() && f2.length() > 512) return f2;

        // 3. Text fallback match (any pre-downloaded sentence)
        if (text != null && !text.trim().isEmpty()) {
            File f3 = new File(cacheDir, "sent_txt_" + md5(text.trim()) + ".mp3");
            if (f3.exists() && f3.length() > 512) return f3;
        }

        return f1;
    }

    private void cleanOldTtsCache() {
        onlineTtsExecutor.submit(() -> {
            try {
                File cacheDir = new File(getCacheDir(), "tts_cache");
                if (!cacheDir.exists() || !cacheDir.isDirectory()) return;
                File[] files = cacheDir.listFiles();
                if (files == null || files.length == 0) return;

                long now = System.currentTimeMillis();
                long maxAge = 2L * 24L * 60L * 60L * 1000L; // 2 days
                long totalSize = 0;

                for (File f : files) {
                    if (now - f.lastModified() > maxAge) {
                        f.delete();
                    } else {
                        totalSize += f.length();
                    }
                }

                if (totalSize > 80L * 1024L * 1024L) {
                    java.util.Arrays.sort(files, (a, b) -> Long.compare(a.lastModified(), b.lastModified()));
                    for (File f : files) {
                        if (f.exists()) {
                            long len = f.length();
                            if (f.delete()) {
                                totalSize -= len;
                                if (totalSize < 40L * 1024L * 1024L) break;
                            }
                        }
                    }
                }
            } catch (Throwable ignored) {}
        });
    }

    private boolean downloadSentenceAudio(String voice, float rate, float pitch, String text, File destFile) {
        if (destFile.exists() && destFile.length() > 512) {
            return true;
        }

        File tempFile = new File(destFile.getAbsolutePath() + ".tmp_" + System.currentTimeMillis());
        HttpURLConnection conn = null;
        InputStream in = null;
        FileOutputStream out = null;

        for (int attempt = 0; attempt < 2; attempt++) {
            try {
                String cleanVoice = (voice != null && !voice.isEmpty()) ? voice : "edge:vi-VN-NamMinhNeural";
                float serverRate = cleanVoice.startsWith("google") ? 1.0f : Math.min(2.0f, Math.max(0.5f, rate));

                String urlStr = "https://chill-reader.vercel.app/api/tts?voice=" 
                    + URLEncoder.encode(cleanVoice, "UTF-8")
                    + "&rate=" + serverRate
                    + "&pitch=" + pitch
                    + "&text=" + URLEncoder.encode(text, "UTF-8");

                URL url = new URL(urlStr);
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(4000);
                conn.setReadTimeout(6000);
                conn.setRequestProperty("User-Agent", "ChillReader-Android/1.0");

                int code = conn.getResponseCode();
                if (code == 200) {
                    in = conn.getInputStream();
                    out = new FileOutputStream(tempFile);
                    byte[] buffer = new byte[8192];
                    int bytesRead;
                    while ((bytesRead = in.read(buffer)) != -1) {
                        out.write(buffer, 0, bytesRead);
                    }
                    out.flush();
                    out.close();
                    out = null;
                    in.close();
                    in = null;

                    if (tempFile.length() > 512) {
                        if (destFile.exists()) destFile.delete();
                        boolean ok = tempFile.renameTo(destFile);
                        if (ok && text != null && !text.trim().isEmpty()) {
                            try {
                                File textFallback = new File(destFile.getParentFile(), "sent_txt_" + md5(text.trim()) + ".mp3");
                                if (!textFallback.exists() || textFallback.length() <= 512) {
                                    copyFile(destFile, textFallback);
                                }
                            } catch (Throwable ignored) {}
                        }
                        return ok;
                    }
                }
            } catch (Throwable t) {
                try { Thread.sleep(200); } catch (InterruptedException ignored) {}
            } finally {
                try { if (in != null) in.close(); } catch (Throwable ignored) {}
                try { if (out != null) out.close(); } catch (Throwable ignored) {}
                try { if (conn != null) conn.disconnect(); } catch (Throwable ignored) {}
                if (tempFile.exists() && !destFile.exists()) {
                    tempFile.delete();
                }
            }
        }
        return false;
    }

    private void prefetchOnlineSentence(final int index) {
        if (index < 0 || index >= nativeSentences.size()) return;
        final String text = nativeSentences.get(index);
        if (!hasReadableText(text)) return;

        prefetchExecutor.submit(() -> {
            try {
                File cacheFile = getCacheFileForSentence(selectedVoiceName, nativeRate, nativePitch, text);
                if (cacheFile.exists() && cacheFile.length() > 512) {
                    return;
                }
                downloadSentenceAudio(selectedVoiceName, nativeRate, nativePitch, text, cacheFile);
            } catch (Throwable ignored) {}
        });
    }

    private void playCurrentOnlineSentence() {
        cancelTtsWatchdog();
        if (!isNativeTtsMode || !sIsPlaying) return;

        while (nativeSentenceIndex < nativeSentences.size() && !hasReadableText(nativeSentences.get(nativeSentenceIndex))) {
            nativeSentenceIndex++;
        }

        if (nativeSentenceIndex >= nativeSentences.size()) {
            cancelTtsWatchdog();
            scheduleGracefulTeardown();
            MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.onNativeChapterComplete && window.ttsEngine.onNativeChapterComplete()");
            return;
        }

        currentSentenceIndex = nativeSentenceIndex;
        currentTotalSentences = nativeSentences.size();
        acquireLocks();

        if (!isForegroundRunning) {
            renderNotificationAndForeground(true, lastCoverUrl);
        } else if (mediaSession != null) {
            try {
                long actions = PlaybackStateCompat.ACTION_PLAY |
                               PlaybackStateCompat.ACTION_PAUSE |
                               PlaybackStateCompat.ACTION_PLAY_PAUSE |
                               PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
                               PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                               PlaybackStateCompat.ACTION_STOP |
                               PlaybackStateCompat.ACTION_SEEK_TO;
                PlaybackStateCompat state = new PlaybackStateCompat.Builder()
                    .setActions(actions)
                    .setState(
                        PlaybackStateCompat.STATE_PLAYING,
                        (long) currentSentenceIndex * 1000L,
                        1.0f
                    )
                    .build();
                mediaSession.setPlaybackState(state);
            } catch (Throwable ignored) {}
        }

        final int token = ++currentOnlineSentenceToken;
        final int targetIndex = nativeSentenceIndex;
        final String rawSentence = nativeSentences.get(targetIndex);

        MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.onNativeSentenceIndex && window.ttsEngine.onNativeSentenceIndex(" + targetIndex + ")");

        final File cacheFile = getCacheFileForSentence(selectedVoiceName, nativeRate, nativePitch, rawSentence);

        if (cacheFile.exists() && cacheFile.length() > 512) {
            playAudioFile(cacheFile, token, targetIndex);
            return;
        }

        if (!isNetworkConnected()) {
            // No network connection: immediately fall back to native offline TTS!
            speakSentenceWithNativeFallback(rawSentence, targetIndex, token);
            return;
        }

        onlineTtsExecutor.submit(() -> {
            if (token != currentOnlineSentenceToken || !isNativeTtsMode || !sIsPlaying) return;
            boolean ok = downloadSentenceAudio(selectedVoiceName, nativeRate, nativePitch, rawSentence, cacheFile);
            if (token != currentOnlineSentenceToken || !isNativeTtsMode || !sIsPlaying) return;

            if (ok && cacheFile.exists() && cacheFile.length() > 512) {
                playAudioFile(cacheFile, token, targetIndex);
            } else {
                // Download failed: seamlessly fall back to native offline TTS so reading never stops!
                speakSentenceWithNativeFallback(rawSentence, targetIndex, token);
            }
        });
    }

    private void speakSentenceWithNativeFallback(String sentence, int targetIndex, int token) {
        mainHandler.post(() -> {
            if (token != currentOnlineSentenceToken || !isNativeTtsMode || !sIsPlaying) return;
            if (nativeTts == null || !isNativeTtsReady) {
                initNativeTts();
                mainHandler.postDelayed(() -> {
                    if (token == currentOnlineSentenceToken && isNativeTtsMode && sIsPlaying) {
                        speakSentenceWithNativeFallback(sentence, targetIndex, token);
                    }
                }, 350);
                return;
            }

            try {
                applySelectedVoice();
                nativeTts.setSpeechRate(nativeRate);
                nativeTts.setPitch(nativePitch);

                final String utteranceId = "fallback_utt_" + System.currentTimeMillis() + "_" + targetIndex;
                currentSpeakingUtteranceId = utteranceId;

                long estimatedMs = (long) ((sentence.length() / (10.0f * Math.max(0.5f, nativeRate))) * 1000L);
                long watchdogTimeoutMs = Math.max(8000L, estimatedMs + 10000L);

                int res;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    Bundle params = new Bundle();
                    params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
                    res = nativeTts.speak(sentence, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
                } else {
                    java.util.HashMap<String, String> params = new java.util.HashMap<>();
                    params.put(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
                    params.put(TextToSpeech.Engine.KEY_PARAM_STREAM, String.valueOf(AudioManager.STREAM_MUSIC));
                    res = nativeTts.speak(sentence, TextToSpeech.QUEUE_FLUSH, params);
                }

                if (res == TextToSpeech.SUCCESS) {
                    scheduleTtsWatchdog(targetIndex, watchdogTimeoutMs);
                } else {
                    mainHandler.postDelayed(() -> {
                        if (token == currentOnlineSentenceToken && isNativeTtsMode && sIsPlaying) {
                            nativeSentenceIndex++;
                            playCurrentNativeSentence();
                        }
                    }, 400);
                }
            } catch (Throwable t) {
                t.printStackTrace();
                mainHandler.postDelayed(() -> {
                    if (token == currentOnlineSentenceToken && isNativeTtsMode && sIsPlaying) {
                        nativeSentenceIndex++;
                        playCurrentNativeSentence();
                    }
                }, 400);
            }
        });
    }

    private void playAudioFile(final File file, final int token, final int index) {
        mainHandler.post(() -> {
            if (token != currentOnlineSentenceToken || !isNativeTtsMode || !sIsPlaying) return;
            try {
                if (onlinePlayer != null) {
                    try {
                        onlinePlayer.reset();
                    } catch (Throwable ignored) {}
                } else {
                    onlinePlayer = new MediaPlayer();
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    AudioAttributes aa = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build();
                    onlinePlayer.setAudioAttributes(aa);
                } else {
                    onlinePlayer.setAudioStreamType(AudioManager.STREAM_MUSIC);
                }

                onlinePlayer.setDataSource(file.getAbsolutePath());

                onlinePlayer.setOnCompletionListener(mp -> {
                    mainHandler.post(() -> {
                        if (token != currentOnlineSentenceToken || !isNativeTtsMode || !sIsPlaying) return;
                        cancelTtsWatchdog();
                        nativeConsecutiveErrors = 0;
                        nativeSentenceIndex++;
                        playCurrentNativeSentence();
                    });
                });

                onlinePlayer.setOnErrorListener((mp, what, extra) -> {
                    mainHandler.post(() -> {
                        if (token != currentOnlineSentenceToken || !isNativeTtsMode || !sIsPlaying) return;
                        cancelTtsWatchdog();
                        nativeSentenceIndex++;
                        playCurrentNativeSentence();
                    });
                    return true;
                });

                onlinePlayer.prepare();

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    try {
                        float targetSpeed = 1.0f;
                        if (selectedVoiceName.startsWith("google")) {
                            targetSpeed = Math.max(0.5f, Math.min(3.0f, nativeRate));
                        } else if (nativeRate > 2.0f) {
                            targetSpeed = nativeRate / 2.0f;
                        }
                        if (Math.abs(targetSpeed - 1.0f) > 0.02f) {
                            PlaybackParams params = onlinePlayer.getPlaybackParams();
                            params.setSpeed(targetSpeed);
                            onlinePlayer.setPlaybackParams(params);
                        }
                    } catch (Throwable ignored) {}
                }

                onlinePlayer.start();

                int duration = onlinePlayer.getDuration();
                long timeoutMs = duration > 0 ? (duration + 6000L) : 15000L;
                scheduleTtsWatchdog(index, timeoutMs);

                prefetchOnlineSentence(index + 1);
                prefetchOnlineSentence(index + 2);

            } catch (Throwable t) {
                t.printStackTrace();
                mainHandler.postDelayed(() -> {
                    if (token == currentOnlineSentenceToken && isNativeTtsMode && sIsPlaying) {
                        nativeSentenceIndex++;
                        playCurrentNativeSentence();
                    }
                }, 350);
            }
        });
    }

    private void playCurrentNativeSentence() {
        cancelTtsWatchdog();
        if (!isNativeTtsMode || !sIsPlaying) return;

        // Skip non-readable / punctuation-only sentences to avoid TTS stall
        while (nativeSentenceIndex < nativeSentences.size() && !hasReadableText(nativeSentences.get(nativeSentenceIndex))) {
            nativeSentenceIndex++;
        }

        if (nativeSentenceIndex >= nativeSentences.size()) {
            cancelTtsWatchdog();
            scheduleGracefulTeardown();
            MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.onNativeChapterComplete && window.ttsEngine.onNativeChapterComplete()");
            return;
        }

        final int targetIndex = nativeSentenceIndex;
        final String rawSentence = nativeSentences.get(targetIndex);

        // 1. ALWAYS check disk cache FIRST for pre-downloaded or cached audio!
        // Works 100% offline regardless of selected voice or network availability!
        File cacheFile = getCacheFileForSentence(selectedVoiceName, nativeRate, nativePitch, rawSentence);
        if (cacheFile != null && cacheFile.exists() && cacheFile.length() > 512) {
            currentSentenceIndex = targetIndex;
            currentTotalSentences = nativeSentences.size();
            acquireLocks();
            if (!isForegroundRunning) {
                renderNotificationAndForeground(true, lastCoverUrl);
            }
            MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.onNativeSentenceIndex && window.ttsEngine.onNativeSentenceIndex(" + targetIndex + ")");
            final int token = ++currentOnlineSentenceToken;
            playAudioFile(cacheFile, token, targetIndex);
            return;
        }

        // 2. If online voice, download & stream or fall back to native TTS
        if (isOnlineVoice(selectedVoiceName)) {
            playCurrentOnlineSentence();
            return;
        }

        // 3. Native TTS playback
        speakNativeSentenceDirect(rawSentence, targetIndex);
    }

    private void speakNativeSentenceDirect(final String sentence, final int targetIndex) {
        if (!isNativeTtsMode || !sIsPlaying) return;

        if (nativeTts == null || !isNativeTtsReady) {
            initNativeTts();
            mainHandler.postDelayed(() -> {
                if (isNativeTtsMode && sIsPlaying && nativeSentenceIndex == targetIndex) {
                    speakNativeSentenceDirect(sentence, targetIndex);
                }
            }, 350);
            return;
        }

        currentSentenceIndex = targetIndex;
        currentTotalSentences = nativeSentences.size();
        acquireLocks();

        if (!isForegroundRunning) {
            renderNotificationAndForeground(true, lastCoverUrl);
        } else if (mediaSession != null) {
            try {
                long actions = PlaybackStateCompat.ACTION_PLAY |
                               PlaybackStateCompat.ACTION_PAUSE |
                               PlaybackStateCompat.ACTION_PLAY_PAUSE |
                               PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
                               PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                               PlaybackStateCompat.ACTION_STOP |
                               PlaybackStateCompat.ACTION_SEEK_TO;
                PlaybackStateCompat state = new PlaybackStateCompat.Builder()
                    .setActions(actions)
                    .setState(
                        PlaybackStateCompat.STATE_PLAYING,
                        (long) currentSentenceIndex * 1000L,
                        1.0f
                    )
                    .build();
                mediaSession.setPlaybackState(state);
            } catch (Throwable ignored) {}
        }

        try {
            applySelectedVoice();
            nativeTts.setSpeechRate(nativeRate);
            nativeTts.setPitch(nativePitch);

            final String utteranceId = "utt_" + System.currentTimeMillis() + "_" + targetIndex;
            currentSpeakingUtteranceId = utteranceId;

            long estimatedMs = (long) ((sentence.length() / (10.0f * Math.max(0.5f, nativeRate))) * 1000L);
            long watchdogTimeoutMs = Math.max(8000L, estimatedMs + 10000L);

            int result = TextToSpeech.ERROR;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                Bundle params = new Bundle();
                params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
                result = nativeTts.speak(sentence, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
            } else {
                java.util.HashMap<String, String> params = new java.util.HashMap<>();
                params.put(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
                params.put(TextToSpeech.Engine.KEY_PARAM_STREAM, String.valueOf(AudioManager.STREAM_MUSIC));
                result = nativeTts.speak(sentence, TextToSpeech.QUEUE_FLUSH, params);
            }

            if (result != TextToSpeech.SUCCESS) {
                nativeConsecutiveErrors++;
                if (nativeConsecutiveErrors >= 5) {
                    sIsPlaying = false;
                    cancelTtsWatchdog();
                    MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.onNativeError && window.ttsEngine.onNativeError('TTS_NOT_SUPPORTED')");
                    renderNotificationAndForeground(false, lastCoverUrl);
                    return;
                }
                getPlaybackHandler().postDelayed(() -> {
                    if (isNativeTtsMode && sIsPlaying && nativeSentenceIndex == targetIndex) {
                        nativeSentenceIndex++;
                        playCurrentNativeSentence();
                    }
                }, 350);
            } else {
                nativeConsecutiveErrors = 0;
                scheduleTtsWatchdog(targetIndex, watchdogTimeoutMs);
            }
        } catch (Throwable t) {
            t.printStackTrace();
            nativeConsecutiveErrors++;
            if (nativeConsecutiveErrors >= 5) {
                sIsPlaying = false;
                cancelTtsWatchdog();
                MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.onNativeError && window.ttsEngine.onNativeError('TTS_NOT_SUPPORTED')");
                renderNotificationAndForeground(false, lastCoverUrl);
                return;
            }
            getPlaybackHandler().postDelayed(() -> {
                if (isNativeTtsMode && sIsPlaying && nativeSentenceIndex == targetIndex) {
                    nativeSentenceIndex++;
                    playCurrentNativeSentence();
                }
            }, 350);
        }

        MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.onNativeSentenceIndex && window.ttsEngine.onNativeSentenceIndex(" + targetIndex + ")");
    }

    private void scheduleTtsWatchdog(final int sentenceIndex, long timeoutMs) {
        cancelTtsWatchdog();
        ttsWatchdogRunnable = () -> {
            if (!isNativeTtsMode || !sIsPlaying) return;
            if (nativeSentenceIndex == sentenceIndex) {
                nativeSentenceIndex++;
                playCurrentNativeSentence();
            }
        };
        getPlaybackHandler().postDelayed(ttsWatchdogRunnable, timeoutMs);
    }

    private void cancelTtsWatchdog() {
        if (ttsWatchdogRunnable != null) {
            getPlaybackHandler().removeCallbacks(ttsWatchdogRunnable);
            mainHandler.removeCallbacks(ttsWatchdogRunnable);
            ttsWatchdogRunnable = null;
        }
    }

    private boolean hasReadableText(String s) {
        if (s == null) return false;
        for (int i = 0; i < s.length(); i++) {
            if (Character.isLetterOrDigit(s.charAt(i))) {
                return true;
            }
        }
        return false;
    }

    public void pauseNativeTts() {
        pauseNativeTts(false);
    }

    public void pauseNativeTts(boolean bySystem) {
        sIsPlaying = false;
        pausedBySystem = bySystem;
        lastPauseTimestamp = System.currentTimeMillis();
        cancelTtsWatchdog();
        stopSilentNativeAudio();
        if (onlinePlayer != null) {
            try {
                if (onlinePlayer.isPlaying()) {
                    onlinePlayer.pause();
                }
            } catch (Throwable ignored) {}
        }
        if (nativeTts != null) {
            try {
                nativeTts.stop();
            } catch (Throwable ignored) {}
        }
        releaseLocks();
        renderNotificationAndForeground(false, lastCoverUrl);
        MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.onNativeStateChange && window.ttsEngine.onNativeStateChange('paused')");
    }

    public void resumeNativeTts() {
        if (!isNativeTtsMode) return;
        requestAudioFocus();
        startSilentNativeAudio();
        acquireLocks();
        sIsPlaying = true;

        // Smart resume rewind: if paused for >= 20 seconds, rewind 1 sentence to restore context
        long now = System.currentTimeMillis();
        if (lastPauseTimestamp > 0 && (now - lastPauseTimestamp >= 20000L)) {
            if (nativeSentenceIndex > 0) {
                nativeSentenceIndex = Math.max(0, nativeSentenceIndex - 1);
            }
        }
        lastPauseTimestamp = 0;

        if (isOnlineVoice(selectedVoiceName)) {
            if (onlinePlayer != null) {
                try {
                    onlinePlayer.start();
                    renderNotificationAndForeground(true, lastCoverUrl);
                    MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.onNativeStateChange && window.ttsEngine.onNativeStateChange('playing')");
                    return;
                } catch (Throwable ignored) {}
            }
        }
        playCurrentNativeSentence();
        MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.onNativeStateChange && window.ttsEngine.onNativeStateChange('playing')");
    }

    public void stopNativeTts() {
        cancelGracefulTeardown();
        isNativeTtsMode = false;
        sIsPlaying = false;
        currentOnlineSentenceToken++;
        stopSilentNativeAudio();
        cancelTtsWatchdog();
        if (onlinePlayer != null) {
            try {
                onlinePlayer.reset();
                onlinePlayer.release();
            } catch (Throwable ignored) {}
            onlinePlayer = null;
        }
        if (nativeTts != null) {
            try {
                nativeTts.stop();
            } catch (Throwable ignored) {}
        }
        nativeSentences.clear();
        nativeSentenceIndex = 0;
        clearPlayback();
    }

    public void jumpToNativeSentence(int index) {
        if (!isNativeTtsMode || nativeSentences.isEmpty()) return;
        cancelTtsWatchdog();
        currentOnlineSentenceToken++;
        if (onlinePlayer != null) {
            try {
                onlinePlayer.reset();
            } catch (Throwable ignored) {}
        }
        nativeSentenceIndex = Math.max(0, Math.min(index, nativeSentences.size() - 1));
        if (sIsPlaying) {
            playCurrentNativeSentence();
        } else {
            currentSentenceIndex = nativeSentenceIndex;
            renderNotificationAndForeground(false, lastCoverUrl);
            MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.onNativeSentenceIndex && window.ttsEngine.onNativeSentenceIndex(" + nativeSentenceIndex + ")");
        }
    }

    public int getNativeSentenceIndex() {
        return nativeSentenceIndex;
    }

    public boolean isNativeTtsMode() {
        return isNativeTtsMode;
    }

    public boolean isNativeTtsReady() {
        if (isOnlineVoice(selectedVoiceName)) {
            return true;
        }
        return isNativeTtsReady && nativeTts != null;
    }

    private void requestAudioFocus() {
        try {
            if (audioManager == null) {
                audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
            }
            if (audioManager == null) return;

            if (audioFocusChangeListener == null) {
                audioFocusChangeListener = focusChange -> {
                    switch (focusChange) {
                        case AudioManager.AUDIOFOCUS_LOSS:
                            boolean callActivePermanent = isHighPriorityAudioActive();
                            if (callActivePermanent) {
                                if (sIsPlaying) {
                                    if (isNativeTtsMode) {
                                        pauseNativeTts(true);
                                    } else {
                                        pausedBySystem = true;
                                        MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.pause()");
                                    }
                                }
                                break;
                            }

                            if (playAlongOtherApps) {
                                // Concurrent playback enabled: ignore focus changes from system lock sounds, keyboards, or other media
                                break;
                            }

                            boolean isInteractive = true;
                            boolean isLocked = false;
                            try {
                                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                                if (pm != null) {
                                    isInteractive = pm.isInteractive();
                                }
                            } catch (Throwable ignored) {}
                            try {
                                KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                                if (km != null) {
                                    isLocked = km.isKeyguardLocked();
                                }
                            } catch (Throwable ignored) {}

                            // If screen is OFF or locked, audio focus loss is caused by keyguard/lockscreen transition, NOT a call.
                            // Never pause when screen is off or keyguard is locked!
                            if (!isInteractive || isLocked) {
                                break;
                            }

                            if (sIsPlaying) {
                                if (isNativeTtsMode) {
                                    pauseNativeTts(true);
                                } else {
                                    pausedBySystem = true;
                                    MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.pause()");
                                }
                            }
                            break;

                        case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                            // ONLY pause on transient audio focus loss if there is an active incoming call or ongoing call.
                            // NEVER pause on screen lock sounds, notification chimes, or keyboard clicks!
                            if (isHighPriorityAudioActive()) {
                                if (sIsPlaying) {
                                    if (isNativeTtsMode) {
                                        pauseNativeTts(true);
                                    } else {
                                        pausedBySystem = true;
                                        MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.pause()");
                                    }
                                }
                            }
                            break;

                        case AudioManager.AUDIOFOCUS_GAIN:
                            if (pausedBySystem && !sIsPlaying) {
                                pausedBySystem = false;
                                if (isNativeTtsMode) {
                                    resumeNativeTts();
                                } else {
                                    MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.play()");
                                }
                            }
                            break;
                    }
                };
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AudioAttributes playbackAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
                audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(playbackAttributes)
                    .setAcceptsDelayedFocusGain(true)
                    .setOnAudioFocusChangeListener(audioFocusChangeListener)
                    .build();
                audioManager.requestAudioFocus(audioFocusRequest);
            } else {
                audioManager.requestAudioFocus(audioFocusChangeListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }
    }

    private void abandonAudioFocus() {
        try {
            if (audioManager != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
                    audioManager.abandonAudioFocusRequest(audioFocusRequest);
                } else if (audioFocusChangeListener != null) {
                    audioManager.abandonAudioFocus(audioFocusChangeListener);
                }
            }
        } catch (Throwable ignored) {}
    }

    private void acquireLocks() {
        try {
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "ChillReader:PlaybackWakeLock");
                    wakeLock.setReferenceCounted(false);
                }
            }
            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire(12 * 60 * 60 * 1000L); // Max 12 hours safe window
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        try {
            if (wifiLock == null) {
                WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wm != null) {
                    wifiLock = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "ChillReader:WifiLock");
                    wifiLock.setReferenceCounted(false);
                }
            }
            if (wifiLock != null && !wifiLock.isHeld()) {
                wifiLock.acquire();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void releaseLocks() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Exception ignored) {}

        try {
            if (wifiLock != null && wifiLock.isHeld()) {
                wifiLock.release();
            }
        } catch (Exception ignored) {}
    }

    private void scheduleGracefulTeardown() {
        cancelGracefulTeardown();
        gracefulTeardownRunnable = () -> {
            if (!sIsPlaying) {
                releaseLocks();
                renderNotificationAndForeground(false, lastCoverUrl);
            }
        };
        mainHandler.postDelayed(gracefulTeardownRunnable, 25000L); // 25-second window for next chapter loading
    }

    private void cancelGracefulTeardown() {
        if (gracefulTeardownRunnable != null) {
            mainHandler.removeCallbacks(gracefulTeardownRunnable);
            gracefulTeardownRunnable = null;
        }
    }

    private void renderNotificationAndForeground(boolean isPlaying, String coverUrl) {
        Notification notification = null;
        try {
            initMediaSession();

            if (isPlaying) {
                acquireLocks();
                startSilentNativeAudio();
            } else {
                releaseLocks();
                stopSilentNativeAudio();
            }

            String title = (currentChapterTitle != null && !currentChapterTitle.trim().isEmpty())
                ? currentChapterTitle.trim() : "Đang phát âm thanh";
            String book = (currentBookTitle != null && !currentBookTitle.trim().isEmpty())
                ? currentBookTitle.trim() : "Chill Reader";
            String auth = (currentAuthor != null && !currentAuthor.trim().isEmpty())
                ? currentAuthor.trim() : "Chill Reader";
            String subtitle = book;
            if (currentAuthor != null && !currentAuthor.trim().isEmpty() && !book.equals(currentAuthor)) {
                subtitle = book + " · " + currentAuthor;
            }

            long actions = PlaybackStateCompat.ACTION_PLAY |
                           PlaybackStateCompat.ACTION_PAUSE |
                           PlaybackStateCompat.ACTION_PLAY_PAUSE |
                           PlaybackStateCompat.ACTION_SKIP_TO_NEXT |
                           PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS |
                           PlaybackStateCompat.ACTION_STOP |
                           PlaybackStateCompat.ACTION_SEEK_TO;

            PlaybackStateCompat.Builder stateBuilder = new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(
                    isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                    (long) currentSentenceIndex * 1000L,
                    isPlaying ? 1.0f : 0.0f
                );
            if (mediaSession != null) {
                mediaSession.setPlaybackState(stateBuilder.build());
            }

            Bitmap artBitmap = resolveCoverBitmap(coverUrl);

            if (mediaSession != null) {
                MediaMetadataCompat.Builder metaBuilder = new MediaMetadataCompat.Builder()
                    .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
                    .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, auth)
                    .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, book)
                    .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_TITLE, title)
                    .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_SUBTITLE, subtitle);

                if (currentTotalSentences > 0) {
                    metaBuilder.putLong(MediaMetadataCompat.METADATA_KEY_DURATION, (long) currentTotalSentences * 1000L);
                }

                if (artBitmap != null) {
                    metaBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artBitmap);
                    metaBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ART, artBitmap);
                }
                mediaSession.setMetadata(metaBuilder.build());
                mediaSession.setActive(true);
            }

            notification = buildNotification(title, subtitle, book, isPlaying, artBitmap);

            if (isPlaying) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                } else {
                    startForeground(NOTIFICATION_ID, notification);
                }
                isForegroundRunning = true;
            } else if (!isForegroundRunning) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                } else {
                    startForeground(NOTIFICATION_ID, notification);
                }
                isForegroundRunning = true;
            }

            if (notificationManager != null) {
                notificationManager.notify(NOTIFICATION_ID, notification);
            }
        } catch (Throwable e) {
            e.printStackTrace();
            if (notificationManager != null && notification != null) {
                try {
                    notificationManager.notify(NOTIFICATION_ID, notification);
                } catch (Throwable ignored) {}
            }
        }
    }

    private Notification buildNotification(
        String title,
        String subtitle,
        String book,
        boolean isPlaying,
        Bitmap artBitmap
    ) {
        int pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            pendingFlags |= PendingIntent.FLAG_IMMUTABLE;
        }

        Intent contentIntent = new Intent(this, MainActivity.class);
        contentIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingContentIntent = PendingIntent.getActivity(this, 0, contentIntent, pendingFlags);

        Intent prevIntent = new Intent(ACTION_PREV);
        prevIntent.setPackage(getPackageName());
        PendingIntent pendingPrev = PendingIntent.getBroadcast(this, 1, prevIntent, pendingFlags);

        Intent playPauseIntent = new Intent(ACTION_PLAY_PAUSE);
        playPauseIntent.setPackage(getPackageName());
        PendingIntent pendingPlayPause = PendingIntent.getBroadcast(this, 2, playPauseIntent, pendingFlags);

        Intent nextIntent = new Intent(ACTION_NEXT);
        nextIntent.setPackage(getPackageName());
        PendingIntent pendingNext = PendingIntent.getBroadcast(this, 3, nextIntent, pendingFlags);

        Intent stopIntent = new Intent(ACTION_STOP);
        stopIntent.setPackage(getPackageName());
        PendingIntent pendingStop = PendingIntent.getBroadcast(this, 4, stopIntent, pendingFlags);

        MediaStyle mediaStyle = new MediaStyle();
        if (mediaSession != null) {
            mediaStyle.setMediaSession(mediaSession.getSessionToken());
        }
        mediaStyle.setShowActionsInCompactView(0, 1, 2);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setSubText(book)
            .setContentIntent(pendingContentIntent)
            .setDeleteIntent(pendingStop)
            .setOngoing(isPlaying)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setStyle(mediaStyle)
            .addAction(android.R.drawable.ic_media_previous, "Lùi", pendingPrev)
            .addAction(
                isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                isPlaying ? "Tạm dừng" : "Phát",
                pendingPlayPause
            )
            .addAction(android.R.drawable.ic_media_next, "Tiếp", pendingNext);

        if (artBitmap != null) {
            builder.setLargeIcon(artBitmap);
        }

        return builder.build();
    }

    private Bitmap resolveCoverBitmap(String coverUrl) {
        Bitmap artBitmap = null;
        if (coverUrl != null && !coverUrl.trim().isEmpty()) {
            String trimmedUrl = coverUrl.trim();
            if (trimmedUrl.equals(lastCoverUrl) && lastCoverBitmap != null) {
                artBitmap = lastCoverBitmap;
            } else if (trimmedUrl.startsWith("data:image")) {
                try {
                    int comma = trimmedUrl.indexOf(',');
                    if (comma > 0) {
                        byte[] decoded = Base64.decode(trimmedUrl.substring(comma + 1), Base64.DEFAULT);
                        Bitmap bmp = BitmapFactory.decodeByteArray(decoded, 0, decoded.length);
                        if (bmp != null) {
                            lastCoverUrl = trimmedUrl;
                            lastCoverBitmap = scaleBitmapIfNeeded(bmp, 512);
                            artBitmap = lastCoverBitmap;
                        }
                    }
                } catch (Exception ignored) {}
            } else if (trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")) {
                if (!trimmedUrl.equals(loadingCoverUrl)) {
                    loadingCoverUrl = trimmedUrl;
                    imageExecutor.execute(() -> {
                        try {
                            URL url = new URL(trimmedUrl);
                            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                            conn.setConnectTimeout(4000);
                            conn.setReadTimeout(4000);
                            conn.setDoInput(true);
                            conn.connect();
                            InputStream input = conn.getInputStream();
                            Bitmap bmp = BitmapFactory.decodeStream(input);
                            if (bmp != null) {
                                Bitmap scaled = scaleBitmapIfNeeded(bmp, 512);
                                lastCoverUrl = trimmedUrl;
                                lastCoverBitmap = scaled;
                                if (sIsPlaying) {
                                    renderNotificationAndForeground(true, trimmedUrl);
                                }
                            }
                        } catch (Exception ignored) {
                        } finally {
                            loadingCoverUrl = null;
                        }
                    });
                }
            }
        }

        if (artBitmap == null && lastCoverBitmap != null) {
            artBitmap = lastCoverBitmap;
        }

        if (artBitmap == null) {
            try {
                if (cachedLauncherBitmap == null) {
                    cachedLauncherBitmap = BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);
                }
                artBitmap = cachedLauncherBitmap;
            } catch (Exception ignored) {}
        }
        return artBitmap;
    }

    private Bitmap scaleBitmapIfNeeded(Bitmap bitmap, int maxDimension) {
        if (bitmap == null) return null;
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        if (width <= maxDimension && height <= maxDimension) return bitmap;
        float ratio = Math.min((float) maxDimension / width, (float) maxDimension / height);
        int newWidth = Math.max(1, Math.round(ratio * width));
        int newHeight = Math.max(1, Math.round(ratio * height));
        return Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true);
    }

    private void clearPlayback() {
        cancelGracefulTeardown();
        sIsPlaying = false;
        isNativeTtsMode = false;
        isForegroundRunning = false;
        currentOnlineSentenceToken++;
        if (onlinePlayer != null) {
            try {
                onlinePlayer.reset();
                onlinePlayer.release();
            } catch (Throwable ignored) {}
            onlinePlayer = null;
        }
        stopSilentNativeAudio();
        cancelTtsWatchdog();
        releaseLocks();
        abandonAudioFocus();

        if (nativeTts != null) {
            try {
                nativeTts.stop();
            } catch (Throwable ignored) {}
        }

        if (mediaSession != null) {
            try {
                PlaybackStateCompat state = new PlaybackStateCompat.Builder()
                    .setState(PlaybackStateCompat.STATE_STOPPED, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 0.0f)
                    .build();
                mediaSession.setPlaybackState(state);
                mediaSession.setActive(false);
            } catch (Exception ignored) {}
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(STOP_FOREGROUND_REMOVE);
            } else {
                stopForeground(true);
            }
        } catch (Exception ignored) {}

        if (notificationManager != null) {
            try {
                notificationManager.cancel(NOTIFICATION_ID);
            } catch (Exception ignored) {}
        }

        stopSelf();
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        // If playback is currently active, preserve foreground service so audio continues uninterrupted
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        cancelGracefulTeardown();
        sInstance = null;
        sIsPlaying = false;
        isNativeTtsMode = false;
        isForegroundRunning = false;
        currentOnlineSentenceToken++;
        if (onlinePlayer != null) {
            try {
                onlinePlayer.reset();
                onlinePlayer.release();
            } catch (Throwable ignored) {}
            onlinePlayer = null;
        }
        try {
            onlineTtsExecutor.shutdownNow();
            prefetchExecutor.shutdownNow();
        } catch (Throwable ignored) {}
        stopSilentNativeAudio();
        cancelTtsWatchdog();
        releaseLocks();
        abandonAudioFocus();

        if (nativeTts != null) {
            try {
                nativeTts.stop();
                nativeTts.shutdown();
            } catch (Throwable ignored) {}
            nativeTts = null;
            isNativeTtsReady = false;
        }

        if (isReceiverRegistered && mediaActionReceiver != null) {
            try {
                unregisterReceiver(mediaActionReceiver);
            } catch (Exception ignored) {}
            isReceiverRegistered = false;
        }


        if (isAlarmReceiverRegistered && alarmAlertReceiver != null) {
            try {
                unregisterReceiver(alarmAlertReceiver);
            } catch (Exception ignored) {}
            isAlarmReceiverRegistered = false;
        }

        if (mediaSession != null) {
            try {
                mediaSession.release();
            } catch (Exception ignored) {}
            mediaSession = null;
        }
        imageExecutor.shutdown();

        if (playbackThread != null) {
            playbackThread.quitSafely();
            playbackThread = null;
            playbackHandler = null;
        }
    }
}
