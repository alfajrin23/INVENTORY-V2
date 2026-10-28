package com.abelektronik.inventory;

import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Queue;
import java.util.Set;
import java.util.UUID;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "ABPaymentSpeech")
public class ABPaymentSpeechPlugin extends Plugin {
    private static final String FEMALE_FORMAL = "female_formal";
    private static final String FEMALE_PLAYFUL = "female_playful";
    private static final String MALE_NORMAL = "male_normal";
    private static final String MALE_DEEP = "male_deep";

    private static final class PendingSpeech {
        final PluginCall call;
        final String text;
        final String profile;
        final String utteranceId;

        PendingSpeech(PluginCall call, String text, String profile, String utteranceId) {
            this.call = call;
            this.text = text;
            this.profile = profile;
            this.utteranceId = utteranceId;
        }
    }

    private static final class ActiveSpeech {
        final PluginCall call;
        final File audioFile;
        MediaPlayer player;

        ActiveSpeech(PluginCall call, File audioFile) {
            this.call = call;
            this.audioFile = audioFile;
        }
    }

    private final Queue<PendingSpeech> pendingSpeeches = new ArrayDeque<>();
    private final Queue<String> readyAudioFiles = new ArrayDeque<>();
    private final Map<String, ActiveSpeech> activeSpeeches = new ConcurrentHashMap<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private TextToSpeech textToSpeech;
    private AudioAttributes mediaAudioAttributes;
    private boolean speechReady;
    private boolean speechUnavailable;
    private boolean synthesisInProgress;
    private boolean destroying;
    private String currentPlaybackId;
    private String speechUnavailableReason = "Mesin Text-to-Speech Android tidak tersedia.";

    @Override
    public void load() {
        super.load();
        textToSpeech = new TextToSpeech(getContext(), status -> mainHandler.post(() -> initializeSpeech(status)));
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (text.trim().isEmpty()) {
            call.reject("Teks suara konfirmasi tidak tersedia.");
            return;
        }
        if (speechUnavailable) {
            call.reject(speechUnavailableReason);
            return;
        }

        String profile = normalizeProfile(call.getString("profile", MALE_DEEP));
        String utteranceId = "qris-payment-" + UUID.randomUUID();
        pendingSpeeches.add(new PendingSpeech(call, text, profile, utteranceId));
        drainPendingSpeeches();
    }

    private void initializeSpeech(int status) {
        if (textToSpeech == null) return;
        if (status != TextToSpeech.SUCCESS) {
            markSpeechUnavailable("Android gagal memulai mesin Text-to-Speech.");
            return;
        }

        mediaAudioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();
        if (textToSpeech.setAudioAttributes(mediaAudioAttributes) == TextToSpeech.ERROR) {
            markSpeechUnavailable("Pengaturan audio media Text-to-Speech Android gagal disiapkan.");
            return;
        }
        if (!configureIndonesianVoice()) {
            markSpeechUnavailable("Suara bahasa Indonesia belum tersedia pada mesin Text-to-Speech perangkat.");
            return;
        }

        textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {}

            @Override
            public void onDone(String utteranceId) {
                mainHandler.post(() -> {
                    synthesisInProgress = false;
                    readyAudioFiles.add(utteranceId);
                    startNextAudioPlayback();
                    drainPendingSpeeches();
                });
            }

            @Override
            public void onError(String utteranceId) {
                mainHandler.post(() -> {
                    synthesisInProgress = false;
                    rejectActiveSpeech(utteranceId, "Android gagal membuat suara konfirmasi QRIS.");
                    drainPendingSpeeches();
                });
            }

            @Override
            public void onError(String utteranceId, int errorCode) {
                mainHandler.post(() -> {
                    synthesisInProgress = false;
                    rejectActiveSpeech(utteranceId, "Android gagal membuat suara konfirmasi QRIS (kode " + errorCode + ").");
                    drainPendingSpeeches();
                });
            }

            @Override
            public void onStop(String utteranceId, boolean interrupted) {
                mainHandler.post(() -> {
                    synthesisInProgress = false;
                    rejectActiveSpeech(utteranceId, "Suara konfirmasi QRIS dihentikan sebelum selesai.");
                    drainPendingSpeeches();
                });
            }
        });

        speechReady = true;
        drainPendingSpeeches();
    }

    private boolean configureIndonesianVoice() {
        int status = textToSpeech.setLanguage(new Locale("id", "ID"));
        if (status >= TextToSpeech.LANG_AVAILABLE) return true;

        status = textToSpeech.setLanguage(new Locale("id"));
        if (status >= TextToSpeech.LANG_AVAILABLE) return true;

        return textToSpeech.setLanguage(Locale.getDefault()) >= TextToSpeech.LANG_AVAILABLE;
    }

    private void drainPendingSpeeches() {
        if (!speechReady || speechUnavailable || destroying || synthesisInProgress || pendingSpeeches.isEmpty()) return;

        PendingSpeech pending = pendingSpeeches.remove();
        applyVoiceProfile(pending.profile);
        File audioFile = new File(getContext().getCacheDir(), "qris-payment-" + UUID.randomUUID() + ".wav");
        activeSpeeches.put(pending.utteranceId, new ActiveSpeech(pending.call, audioFile));
        synthesisInProgress = true;

        int result = textToSpeech.synthesizeToFile(
            (CharSequence) pending.text,
            new Bundle(),
            audioFile,
            pending.utteranceId
        );
        if (result == TextToSpeech.ERROR) {
            synthesisInProgress = false;
            rejectActiveSpeech(pending.utteranceId, "Android menolak membuat suara konfirmasi QRIS.");
            drainPendingSpeeches();
        }
    }

    private void applyVoiceProfile(String profile) {
        boolean femaleProfile = FEMALE_FORMAL.equals(profile) || FEMALE_PLAYFUL.equals(profile);
        Voice preferredVoice = findVoiceForGender(femaleProfile);
        if (preferredVoice != null) textToSpeech.setVoice(preferredVoice);
        else textToSpeech.setLanguage(new Locale("id", "ID"));

        if (FEMALE_FORMAL.equals(profile)) {
            textToSpeech.setPitch(1.12f);
            textToSpeech.setSpeechRate(0.92f);
        } else if (FEMALE_PLAYFUL.equals(profile)) {
            textToSpeech.setPitch(1.30f);
            textToSpeech.setSpeechRate(1.02f);
        } else if (MALE_NORMAL.equals(profile)) {
            textToSpeech.setPitch(0.92f);
            textToSpeech.setSpeechRate(0.98f);
        } else {
            textToSpeech.setPitch(0.76f);
            textToSpeech.setSpeechRate(0.91f);
        }
    }

    private Voice findVoiceForGender(boolean female) {
        Set<Voice> voices = textToSpeech.getVoices();
        if (voices == null) return null;

        Voice preferred = null;
        for (Voice voice : voices) {
            Locale locale = voice.getLocale();
            if (locale == null || !"id".equalsIgnoreCase(locale.getLanguage())) continue;
            String name = voice.getName().toLowerCase(Locale.ROOT);
            boolean isFemale = name.contains("female") || name.contains("woman") || name.contains("-idf-") || name.contains("_idf_");
            boolean isMale = (name.contains("male") && !name.contains("female"))
                || name.contains("-idm-")
                || name.contains("_idm_")
                || name.matches(".*(?:^|[ ._-])man(?:$|[ ._-]).*");
            if ((female && isFemale) || (!female && isMale)) {
                if (preferred == null || (preferred.isNetworkConnectionRequired() && !voice.isNetworkConnectionRequired())) {
                    preferred = voice;
                }
            }
        }
        return preferred;
    }

    private String normalizeProfile(String profile) {
        if (FEMALE_FORMAL.equals(profile) || FEMALE_PLAYFUL.equals(profile) || MALE_NORMAL.equals(profile) || MALE_DEEP.equals(profile)) {
            return profile;
        }
        return MALE_DEEP;
    }

    private void startNextAudioPlayback() {
        if (destroying || currentPlaybackId != null || readyAudioFiles.isEmpty()) return;
        String utteranceId = readyAudioFiles.remove();
        ActiveSpeech active = activeSpeeches.get(utteranceId);
        if (active == null) {
            startNextAudioPlayback();
            return;
        }

        try {
            MediaPlayer player = new MediaPlayer();
            active.player = player;
            player.setAudioAttributes(mediaAudioAttributes);
            player.setDataSource(active.audioFile.getAbsolutePath());
            player.setVolume(1.0f, 1.0f);
            player.setOnPreparedListener(prepared -> {
                prepared.start();
            });
            player.setOnCompletionListener(completed -> {
                completeActiveSpeech(utteranceId);
                currentPlaybackId = null;
                startNextAudioPlayback();
            });
            player.setOnErrorListener((failedPlayer, what, extra) -> {
                rejectActiveSpeech(utteranceId, "Audio media gagal memutar suara QRIS (kode " + what + ":" + extra + ").");
                currentPlaybackId = null;
                startNextAudioPlayback();
                return true;
            });
            currentPlaybackId = utteranceId;
            player.prepareAsync();
        } catch (Exception error) {
            rejectActiveSpeech(utteranceId, "Audio media gagal disiapkan: " + error.getMessage());
            startNextAudioPlayback();
        }
    }

    private void completeActiveSpeech(String utteranceId) {
        ActiveSpeech active = activeSpeeches.remove(utteranceId);
        if (active == null) return;
        releaseAudio(active, false);
        active.call.resolve();
    }

    private void rejectActiveSpeech(String utteranceId, String message) {
        ActiveSpeech active = activeSpeeches.remove(utteranceId);
        readyAudioFiles.remove(utteranceId);
        if (active == null) return;
        boolean wasPlaying = utteranceId.equals(currentPlaybackId);
        releaseAudio(active, true);
        active.call.reject(message);
        if (wasPlaying) currentPlaybackId = null;
    }

    private void releaseAudio(ActiveSpeech active, boolean stop) {
        if (active.player != null) {
            try {
                if (stop && active.player.isPlaying()) active.player.stop();
            } catch (IllegalStateException ignored) {
                // A failed or completed player may no longer be in a stoppable state.
            }
            active.player.release();
            active.player = null;
        }
        if (active.audioFile.exists()) {
            //noinspection ResultOfMethodCallIgnored
            active.audioFile.delete();
        }
    }

    private void markSpeechUnavailable(String message) {
        speechUnavailable = true;
        speechUnavailableReason = message;
        while (!pendingSpeeches.isEmpty()) pendingSpeeches.remove().call.reject(message);
    }

    @Override
    protected void handleOnDestroy() {
        destroying = true;
        pendingSpeeches.clear();
        List<Map.Entry<String, ActiveSpeech>> active = new ArrayList<>(activeSpeeches.entrySet());
        for (Map.Entry<String, ActiveSpeech> entry : active) {
            ActiveSpeech speech = activeSpeeches.remove(entry.getKey());
            if (speech == null) continue;
            releaseAudio(speech, true);
            speech.call.reject("Suara konfirmasi dihentikan karena aplikasi ditutup.");
        }
        readyAudioFiles.clear();
        currentPlaybackId = null;
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
            textToSpeech = null;
        }
        super.handleOnDestroy();
    }
}
