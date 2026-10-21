package com.abelektronik.inventory;

import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ABScreenBrightness")
public class ABScreenBrightnessPlugin extends Plugin {
    private Float previousBrightness;

    @PluginMethod
    public void maximize(PluginCall call) {
        if (getActivity() == null) {
            call.reject("Layar aplikasi tidak tersedia.");
            return;
        }
        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            WindowManager.LayoutParams attributes = window.getAttributes();
            if (previousBrightness == null) previousBrightness = attributes.screenBrightness;
            attributes.screenBrightness = 1.0f;
            window.setAttributes(attributes);
            call.resolve();
        });
    }

    @PluginMethod
    public void restore(PluginCall call) {
        if (getActivity() == null) {
            previousBrightness = null;
            call.resolve();
            return;
        }
        getActivity().runOnUiThread(() -> {
            if (previousBrightness != null) {
                WindowManager.LayoutParams attributes = getActivity().getWindow().getAttributes();
                attributes.screenBrightness = previousBrightness;
                getActivity().getWindow().setAttributes(attributes);
                previousBrightness = null;
            }
            call.resolve();
        });
    }
}
