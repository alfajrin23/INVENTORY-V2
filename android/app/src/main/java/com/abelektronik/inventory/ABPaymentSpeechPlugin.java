package com.abelektronik.inventory;

import android.media.AudioAttributes;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayDeque;
import java.util.Locale;
import java.util.Queue;
import java.util.UUID;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "ABPaymentSpeech")
public class ABPaymentSpeechPlugin extends Plugin {
    private static final class PendingSpeech {
        final PluginCall call;
        final String text;
        final String utteranceId;

        PendingSpeech(PluginCall call, String text, String utteranceId) {
            this.call = call;
            this.text = text;
            this.utteranceId = utteranceId;
        }
    }

    private final Queue<PendingSpeech> pendingSpeeches = new ArrayDeque<>();
    private final Map<String, PluginCall> activeSpeeches = new ConcurrentHashMap<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private TextToSpeech textToSpeech;
    private boolean speechReady;
    private boolean speechUnavailable;
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

        String utteranceId = "qris-payment-" + UUID.randomUUID();
        pendingSpeeches.add(new PendingSpeech(call, text, utteranceId));
        if (speechReady) drainPendingSpeeches();
    }

    private void initializeSpeech(int status) {
        if (textToSpeech == null) return;
        if (status != TextToSpeech.SUCCESS) {
            markSpeechUnavailable("Android gagal memulai mesin Text-to-Speech.");
            return;
        }

        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_MEDIA)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build();
        if (textToSpeech.setAudioAttributes(audioAttributes) == TextToSpeech.ERROR) {
            markSpeechUnavailable("Pengaturan audio Text-to-Speech Android gagal disiapkan.");
            return;
        }
        if (!configureIndonesianVoice()) {
            markSpeechUnavailable("Suara bahasa Indonesia belum tersedia pada mesin Text-to-Speech perangkat.");
            return;
        }

        textToSpeech.setSpeechRate(0.95f);
        textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {}

            @Override
            public void onDone(String utteranceId) {
                PluginCall call = activeSpeeches.remove(utteranceId);
                if (call != null) call.resolve();
            }

            @Override
            public void onError(String utteranceId) {
                rejectActiveSpeech(utteranceId, "Android gagal menyelesaikan suara konfirmasi QRIS.");
            }

            @Override
            public void onError(String utteranceId, int errorCode) {
                rejectActiveSpeech(utteranceId, "Android gagal memutar suara konfirmasi QRIS (kode " + errorCode + ").");
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
        while (!pendingSpeeches.isEmpty()) {
            PendingSpeech pending = pendingSpeeches.remove();
            activeSpeeches.put(pending.utteranceId, pending.call);
            int result = textToSpeech.speak(
                (CharSequence) pending.text,
                TextToSpeech.QUEUE_ADD,
                speechParameters(),
                pending.utteranceId
            );
            if (result == TextToSpeech.ERROR) {
                rejectActiveSpeech(pending.utteranceId, "Android menolak memutar suara konfirmasi QRIS.");
            }
        }
    }

    private Bundle speechParameters() {
        Bundle parameters = new Bundle();
        parameters.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1.0f);
        return parameters;
    }

    private void rejectActiveSpeech(String utteranceId, String message) {
        PluginCall call = activeSpeeches.remove(utteranceId);
        if (call != null) call.reject(message);
    }

    private void markSpeechUnavailable(String message) {
        speechUnavailable = true;
        speechUnavailableReason = message;
        rejectPendingSpeeches(message);
    }

    private void rejectPendingSpeeches(String message) {
        while (!pendingSpeeches.isEmpty()) {
            pendingSpeeches.remove().call.reject(message);
        }
    }

    @Override
    protected void handleOnDestroy() {
        pendingSpeeches.clear();
        for (PluginCall call : activeSpeeches.values()) {
            call.reject("Suara konfirmasi dihentikan karena aplikasi ditutup.");
        }
        activeSpeeches.clear();
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
            textToSpeech = null;
        }
        super.handleOnDestroy();
    }
}
