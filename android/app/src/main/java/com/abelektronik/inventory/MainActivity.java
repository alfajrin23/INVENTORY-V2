package com.abelektronik.inventory;

import android.os.Bundle;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ABFileSaverPlugin.class);
        registerPlugin(ABAppUpdatePlugin.class);
        super.onCreate(savedInstanceState);

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() == null || getBridge().getWebView() == null) {
                    finish();
                    return;
                }

                getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('ab:native-back'))",
                    null
                ));
            }
        });
    }
}
