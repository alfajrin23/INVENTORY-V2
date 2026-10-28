package com.abelektronik.inventory;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayDeque;
import java.util.Locale;
import java.util.Queue;
import java.util.UUID;

@CapacitorPlugin(name = "ABPaymentSpeech")
public class ABPaymentSpeechPlugin extends Plugin {
    private static final class PendingSpeech {
        final PluginCall call;
        final String text;

        PendingSpeech(PluginCall call, String text) {
            this.call = call;
            this.text = text;
        }
    }

    private final Queue<PendingSpeech> pendingSpeeches = new ArrayDeque<>();
    private TextToSpeech textToSpeech;
    private boolean speechReady;
    private boolean speechUnavailable;

    @Override
    public void load() {
        super.load();
        textToSpeech = new TextToSpeech(getContext(), status -> getActivity().runOnUiThread(() -> {
            if (status != TextToSpeech.SUCCESS || !configureIndonesianVoice()) {
                speechUnavailable = true;
                rejectPendingSpeeches();
                return;
            }
            speechReady = true;
            drainPendingSpeeches();
        }));
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        if (text.trim().isEmpty()) {
            call.reject("Teks suara konfirmasi tidak tersedia.");
            return;
        }
        if (speechUnavailable) {
            call.reject("Fitur suara perangkat tidak tersedia.");
            return;
        }

        pendingSpeeches.add(new PendingSpeech(call, text));
        if (speechReady) drainPendingSpeeches();
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
            int result = textToSpeech.speak(
                (CharSequence) pending.text,
                TextToSpeech.QUEUE_ADD,
                new Bundle(),
                "qris-payment-" + UUID.randomUUID()
            );
            if (result == TextToSpeech.ERROR) {
                pending.call.reject("Suara konfirmasi pembayaran gagal diputar.");
            } else {
                pending.call.resolve();
            }
        }
    }

    private void rejectPendingSpeeches() {
        while (!pendingSpeeches.isEmpty()) {
            pendingSpeeches.remove().call.reject("Fitur suara perangkat tidak tersedia.");
        }
    }

    @Override
    protected void handleOnDestroy() {
        pendingSpeeches.clear();
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
            textToSpeech = null;
        }
        super.handleOnDestroy();
    }
}
