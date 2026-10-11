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
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Foreground Audio Playback Service for Chill Reader.
 * - Guarantees background audio continuity without sleep stutter (WakeLock + WifiLock).
 * - Integrates seamlessly with Android 11+ System Media Player & Lock Screen controls.
 */
public class MediaPlaybackService extends Service {
    public static final String CHANNEL_ID = "chill_reader_playback_channel_v2";
    public static final int NOTIFICATION_ID = 9021;

    public static final String ACTION_PLAY_PAUSE = "com.chillreader.ACTION_PLAY_PAUSE";
    public static final String ACTION_NEXT = "com.chillreader.ACTION_NEXT";
    public static final String ACTION_PREV = "com.chillreader.ACTION_PREV";
    public static final String ACTION_STOP = "com.chillreader.ACTION_STOP";

    public static final String ACTION_UPDATE_PLAYBACK = "com.chillreader.ACTION_UPDATE_PLAYBACK";
    public static final String ACTION_CLEAR_PLAYBACK = "com.chillreader.ACTION_CLEAR_PLAYBACK";

    public static final String EXTRA_CHAPTER_TITLE = "extra_chapter_title";
    public static final String EXTRA_BOOK_TITLE = "extra_book_title";
    public static final String EXTRA_AUTHOR = "extra_author";
    public static final String EXTRA_IS_PLAYING = "extra_is_playing";
    public static final String EXTRA_COVER_URL = "extra_cover_url";
    public static final String EXTRA_CURRENT_SENTENCE = "extra_current_sentence";
    public static final String EXTRA_TOTAL_SENTENCES = "extra_total_sentences";

    private static volatile MediaPlaybackService sInstance = null;
    private static volatile boolean sIsPlaying = false;

    private NotificationManager notificationManager;
    private MediaSessionCompat mediaSession;
    private BroadcastReceiver mediaActionReceiver;
    private boolean isReceiverRegistered = false;

    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;

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
            Intent intent = new Intent(context, MediaPlaybackService.class);
            intent.setAction(ACTION_UPDATE_PLAYBACK);
            intent.putExtra(EXTRA_CHAPTER_TITLE, chapterTitle);
            intent.putExtra(EXTRA_BOOK_TITLE, bookTitle);
            intent.putExtra(EXTRA_AUTHOR, author);
            intent.putExtra(EXTRA_IS_PLAYING, isPlaying);
            intent.putExtra(EXTRA_COVER_URL, coverUrl);
            intent.putExtra(EXTRA_CURRENT_SENTENCE, currentSentence);
            intent.putExtra(EXTRA_TOTAL_SENTENCES, totalSentences);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(context, intent);
            } else {
                context.startService(intent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public static void stop(Context context) {
        try {
            Intent intent = new Intent(context, MediaPlaybackService.class);
            intent.setAction(ACTION_CLEAR_PLAYBACK);
            context.startService(intent);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        sInstance = this;
        createNotificationChannel();
        initMediaSession();
        registerMediaReceiver();
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

        if (ACTION_UPDATE_PLAYBACK.equals(action)) {
            currentChapterTitle = intent.getStringExtra(EXTRA_CHAPTER_TITLE);
            currentBookTitle = intent.getStringExtra(EXTRA_BOOK_TITLE);
            currentAuthor = intent.getStringExtra(EXTRA_AUTHOR);
            boolean isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, false);
            String coverUrl = intent.getStringExtra(EXTRA_COVER_URL);
            currentSentenceIndex = intent.getIntExtra(EXTRA_CURRENT_SENTENCE, 0);
            currentTotalSentences = intent.getIntExtra(EXTRA_TOTAL_SENTENCES, 0);

            sIsPlaying = isPlaying;
            renderNotificationAndForeground(isPlaying, coverUrl);
            return START_STICKY;
        }

        return START_NOT_STICKY;
    }

    private void createNotificationChannel() {
        notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && notificationManager != null) {
            try {
                notificationManager.deleteNotificationChannel("chill_reader_playback_channel");
            } catch (Exception ignored) {}

            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Trình phát âm thanh Chill Reader",
                NotificationManager.IMPORTANCE_DEFAULT
            );
            channel.setDescription("Điều khiển âm thanh Chill Reader trên màn hình khóa và thanh thông báo");
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setShowBadge(false);
            channel.setSound(null, null);
            channel.enableVibration(false);
            notificationManager.createNotificationChannel(channel);
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
                    MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.play()");
                }

                @Override
                public void onPause() {
                    MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.pause()");
                }

                @Override
                public void onSkipToNext() {
                    MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.nextSentence()");
                }

                @Override
                public void onSkipToPrevious() {
                    MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.previousSentence()");
                }

                @Override
                public void onStop() {
                    MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.stop()");
                }

                @Override
                public void onSeekTo(long pos) {
                    int sentenceIdx = (int) (pos / 1000L);
                    MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.jumpToSentence(" + sentenceIdx + ")");
                }
            });

            mediaSession.setActive(true);
        } catch (Exception e) {
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
                    MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.togglePlayPause()");
                } else if (ACTION_NEXT.equals(action)) {
                    MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.nextSentence()");
                } else if (ACTION_PREV.equals(action)) {
                    MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.previousSentence()");
                } else if (ACTION_STOP.equals(action)) {
                    MainActivity.sendCommand("window.ttsEngine && window.ttsEngine.stop()");
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

        // Update MediaSession state
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

        // Artwork resolution
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

        Notification notification = buildNotification(title, subtitle, book, isPlaying, artBitmap);

        try {
            if (isPlaying) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                } else {
                    startForeground(NOTIFICATION_ID, notification);
                }
            } else {
                // When paused, detach foreground so system resources can rest, but keep notification active on lockscreen
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    stopForeground(STOP_FOREGROUND_DETACH);
                } else {
                    stopForeground(false);
                }
                if (notificationManager != null) {
                    notificationManager.notify(NOTIFICATION_ID, notification);
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
            if (notificationManager != null) {
                try {
                    notificationManager.notify(NOTIFICATION_ID, notification);
                } catch (Exception ignored) {}
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
        releaseLocks();

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
    public void onDestroy() {
        super.onDestroy();
        sInstance = null;
        sIsPlaying = false;
        releaseLocks();

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
