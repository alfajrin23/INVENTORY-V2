package com.abelektronik.inventory;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;
import android.text.TextUtils;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "ABQrisNotification")
public class ABQrisNotificationPlugin extends Plugin {
    private static final String PREFS = "ab_qris_notification_access";
    private static final String PENDING_EVENTS = "pending_events";
    private static final long MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000L;
    private static volatile ABQrisNotificationPlugin activePlugin;

    @PluginMethod
    public void checkAccess(PluginCall call) {
        activePlugin = this;
        JSObject result = new JSObject();
        result.put("enabled", hasNotificationAccess(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Pengaturan akses notifikasi tidak dapat dibuka.", error);
        }
    }

    @PluginMethod
    public void getPendingNotifications(PluginCall call) {
        activePlugin = this;
        JSONArray events = readPendingEvents(getContext());
        JSObject result = new JSObject();
        result.put("notifications", events);
        call.resolve(result);
    }

    @PluginMethod
    public void consumeNotification(PluginCall call) {
        String fingerprint = call.getString("fingerprint", "");
        if (fingerprint.isEmpty()) {
            call.reject("ID notifikasi tidak valid.");
            return;
        }
        JSONArray current = readPendingEvents(getContext());
        JSONArray remaining = new JSONArray();
        for (int index = 0; index < current.length(); index++) {
            JSONObject event = current.optJSONObject(index);
            if (event != null && !fingerprint.equals(event.optString("fingerprint"))) remaining.put(event);
        }
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(PENDING_EVENTS, remaining.toString()).apply();
        call.resolve();
    }

    static boolean hasNotificationAccess(Context context) {
        String enabled = Settings.Secure.getString(context.getContentResolver(), "enabled_notification_listeners");
        if (TextUtils.isEmpty(enabled)) return false;
        ComponentName listener = new ComponentName(context, GoPayMerchantNotificationListener.class);
        for (String component : enabled.split(":")) {
            if (listener.equals(ComponentName.unflattenFromString(component))) return true;
        }
        return false;
    }

    static void savePaymentNotification(Context context, JSObject notification) {
        long now = System.currentTimeMillis();
        JSONArray current = readPendingEvents(context);
        List<JSONObject> retained = new ArrayList<>();
        String fingerprint = notification.getString("fingerprint", "");
        for (int index = 0; index < current.length(); index++) {
            JSONObject event = current.optJSONObject(index);
            if (event == null) continue;
            if (now - event.optLong("notificationAt", 0L) > MAX_EVENT_AGE_MS) continue;
            if (fingerprint.equals(event.optString("fingerprint"))) return;
            retained.add(event);
        }
        try {
            retained.add(new JSONObject(notification.toString()));
            while (retained.size() > 100) retained.remove(0);
            JSONArray next = new JSONArray();
            for (JSONObject event : retained) next.put(event);
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(PENDING_EVENTS, next.toString()).apply();
        } catch (JSONException ignored) {
            return;
        }

        ABQrisNotificationPlugin plugin = activePlugin;
        if (plugin != null && plugin.getActivity() != null) {
            plugin.getActivity().runOnUiThread(() -> plugin.notifyListeners("paymentNotification", notification, false));
        }
    }

    private static JSONArray readPendingEvents(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = preferences.getString(PENDING_EVENTS, "[]");
        try {
            JSONArray events = new JSONArray(raw);
            JSONArray valid = new JSONArray();
            long now = System.currentTimeMillis();
            for (int index = 0; index < events.length(); index++) {
                JSONObject event = events.optJSONObject(index);
                if (event != null && now - event.optLong("notificationAt", 0L) <= MAX_EVENT_AGE_MS) valid.put(event);
            }
            if (valid.length() != events.length()) preferences.edit().putString(PENDING_EVENTS, valid.toString()).apply();
            return valid;
        } catch (JSONException error) {
            preferences.edit().remove(PENDING_EVENTS).apply();
            return new JSONArray();
        }
    }
}
