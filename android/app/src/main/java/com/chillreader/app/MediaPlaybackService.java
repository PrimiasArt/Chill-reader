package com.chillreader.app;

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
import android.media.AudioManager;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Base64;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
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

    private static volatile MediaPlaybackService sInstance = null;
    private static volatile boolean sIsPlaying = false;
    private volatile boolean playAlongOtherApps = true;
    private volatile boolean pausedBySystem = false;

    private NotificationManager notificationManager;
    private MediaSessionCompat mediaSession;
    private BroadcastReceiver mediaActionReceiver;
    private boolean isReceiverRegistered = false;

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

    private AudioManager audioManager;
    private AudioManager.OnAudioFocusChangeListener audioFocusChangeListener;
    private AudioFocusRequest audioFocusRequest;

    // Native Offline TextToSpeech queue
    private TextToSpeech nativeTts;
    private volatile boolean isNativeTtsReady = false;
    private final List<String> nativeSentences = new ArrayList<>();
    private volatile int nativeSentenceIndex = 0;
    private volatile float nativeRate = 1.0f;
    private volatile float nativePitch = 1.0f;
    private volatile boolean isNativeTtsMode = false;

    private final ExecutorService imageExecutor = Executors.newSingleThreadExecutor();
    private volatile String lastCoverUrl = null;
    private volatile Bitmap lastCoverBitmap = null;
    private volatile String loadingCoverUrl = null;

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
                if (sInstance != null) {
                    context.startService(intent);
                }
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
        try {
            if (context == null) return;
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

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(context, intent);
            } else {
                context.startService(intent);
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }
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
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            playAlongOtherApps = prefs.getBoolean(PREF_PLAY_ALONG, true);
        } catch (Throwable ignored) {}

        createNotificationChannel();
        initMediaSession();
        registerMediaReceiver();
        initNativeTts();

        // Android 8.0+ contract: guarantee startForeground is called immediately
        try {
            Notification initNotification = buildNotification(
                "Chill Reader",
                "Đang phát âm thanh",
                "Chill Reader",
                false,
                null
            );
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIFICATION_ID, initNotification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, initNotification);
            }
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

            loadAndStartNativeQueue(sentencesJson, startIndex, rate, pitch, coverUrl);
            return START_STICKY;
        }

        if (ACTION_UPDATE_PLAYBACK.equals(action)) {
            // Web / Online audio update
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

    private void initNativeTts() {
        if (nativeTts != null) return;
        try {
            nativeTts = new TextToSpeech(getApplicationContext(), status -> {
                if (status == TextToSpeech.SUCCESS) {
                    try {
                        int result = nativeTts.setLanguage(new Locale("vi", "VN"));
                        if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
                            nativeTts.setLanguage(new Locale("vi"));
                        }
                    } catch (Throwable ignored) {}

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

                    nativeTts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                        @Override
                        public void onStart(String utteranceId) {
                            MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.onNativeSentenceIndex && window.ttsEngine.onNativeSentenceIndex(" + nativeSentenceIndex + ")");
                        }

                        @Override
                        public void onDone(String utteranceId) {
                            if (!isNativeTtsMode || !sIsPlaying) return;
                            nativeSentenceIndex++;
                            playCurrentNativeSentence();
                        }

                        @Override
                        public void onError(String utteranceId) {
                            if (!isNativeTtsMode || !sIsPlaying) return;
                            nativeSentenceIndex++;
                            playCurrentNativeSentence();
                        }
                    });

                    if (isNativeTtsMode && sIsPlaying) {
                        playCurrentNativeSentence();
                    }
                } else {
                    isNativeTtsReady = false;
                }
            });
        } catch (Throwable t) {
            t.printStackTrace();
            isNativeTtsReady = false;
        }
    }

    private void loadAndStartNativeQueue(String sentencesJson, int startIndex, float rate, float pitch, String coverUrl) {
        try {
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
            acquireLocks();

            if (isNativeTtsReady && nativeTts != null) {
                playCurrentNativeSentence();
            } else {
                renderNotificationAndForeground(true, coverUrl);
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }
    }

    private void playCurrentNativeSentence() {
        if (!isNativeTtsMode || !sIsPlaying) return;
        if (nativeTts == null || !isNativeTtsReady) return;
        if (nativeSentenceIndex < 0 || nativeSentenceIndex >= nativeSentences.size()) {
            sIsPlaying = false;
            releaseLocks();
            renderNotificationAndForeground(false, lastCoverUrl);
            MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.onNativeChapterComplete && window.ttsEngine.onNativeChapterComplete()");
            return;
        }

        currentSentenceIndex = nativeSentenceIndex;
        currentTotalSentences = nativeSentences.size();

        acquireLocks();
        renderNotificationAndForeground(true, lastCoverUrl);

        try {
            nativeTts.setSpeechRate(nativeRate);
            nativeTts.setPitch(nativePitch);
            String sentence = nativeSentences.get(nativeSentenceIndex);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                Bundle params = new Bundle();
                params.putInt(TextToSpeech.Engine.KEY_PARAM_STREAM, AudioManager.STREAM_MUSIC);
                nativeTts.speak(sentence, TextToSpeech.QUEUE_FLUSH, params, "utt_" + nativeSentenceIndex);
            }
        } catch (Throwable t) {
            t.printStackTrace();
        }

        MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.onNativeSentenceIndex && window.ttsEngine.onNativeSentenceIndex(" + nativeSentenceIndex + ")");
    }

    public void pauseNativeTts() {
        sIsPlaying = false;
        pausedBySystem = false;
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
        acquireLocks();
        sIsPlaying = true;
        playCurrentNativeSentence();
        MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.onNativeStateChange && window.ttsEngine.onNativeStateChange('playing')");
    }

    public void stopNativeTts() {
        isNativeTtsMode = false;
        sIsPlaying = false;
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
                        case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                            boolean isCallOrRing = false;
                            try {
                                if (audioManager != null) {
                                    int mode = audioManager.getMode();
                                    isCallOrRing = (mode == AudioManager.MODE_IN_CALL || 
                                                    mode == AudioManager.MODE_IN_COMMUNICATION || 
                                                    mode == AudioManager.MODE_RINGTONE);
                                }
                            } catch (Throwable ignored) {}

                            // If user enabled "playAlongOtherApps" (default true), only pause for calls & ringtones
                            if (isCallOrRing || !playAlongOtherApps) {
                                if (sIsPlaying) {
                                    pausedBySystem = true;
                                    if (isNativeTtsMode) {
                                        pauseNativeTts();
                                    } else {
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

    private void renderNotificationAndForeground(boolean isPlaying, String coverUrl) {
        Notification notification = null;
        try {
            initMediaSession();

            if (isPlaying) {
                acquireLocks();
            } else {
                releaseLocks();
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

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIFICATION_ID, notification);
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
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
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
                artBitmap = BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher);
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
        sIsPlaying = false;
        isNativeTtsMode = false;
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
        sInstance = null;
        sIsPlaying = false;
        isNativeTtsMode = false;
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

        if (mediaSession != null) {
            try {
                mediaSession.release();
            } catch (Exception ignored) {}
            mediaSession = null;
        }
        imageExecutor.shutdown();
    }
}
