package com.abelektronik.inventory;

import android.os.Bundle;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final long EXIT_BACK_WINDOW_MS = 2000L;
    private long lastFallbackBackAt = 0L;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ABFileSaverPlugin.class);
        registerPlugin(ABAppUpdatePlugin.class);
        registerPlugin(ABThermalPrinterPlugin.class);
        super.onCreate(savedInstanceState);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                dispatchBackToWeb();
            }
        });
    }

    private void dispatchBackToWeb() {
        if (getBridge() == null || getBridge().getWebView() == null) {
            handleFallbackBack();
            return;
        }

        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
            "(function(){if(typeof window.__abHandleNativeBack==='function'){window.__abHandleNativeBack();return true;}return false;})()",
            handled -> {
                if (!"true".equals(handled)) {
                    runOnUiThread(this::handleFallbackBack);
                }
            }
        ));
    }

    private void handleFallbackBack() {
        long now = System.currentTimeMillis();
        if (now - lastFallbackBackAt <= EXIT_BACK_WINDOW_MS) {
            finishAffinity();
            return;
        }

        lastFallbackBackAt = now;
        Toast.makeText(this, "Tekan tombol kembali sekali lagi untuk keluar", Toast.LENGTH_SHORT).show();
    }
}
