package com.abelektronik.inventory;

import android.app.Notification;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.os.Bundle;

import com.getcapacitor.JSObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class GoPayMerchantNotificationListener extends NotificationListenerService {
    private static final Set<String> MERCHANT_PACKAGES = new HashSet<String>() {{
        add("com.gojek.gopaymerchant");
        add("com.gojek.resto");
    }};
    private static final Pattern RUPIAH_AMOUNT = Pattern.compile("(?i)\\b(?:rp\\.?|idr)\\s*([0-9]{1,3}(?:[.,][0-9]{3})*|[0-9]+)\\b");

    @Override
    public void onNotificationPosted(StatusBarNotification notification) {
        if (notification == null || !MERCHANT_PACKAGES.contains(notification.getPackageName())) return;
        Notification posted = notification.getNotification();
        Bundle extras = posted == null ? null : posted.extras;
        if (extras == null) return;

        StringBuilder text = new StringBuilder();
        append(text, extras.getCharSequence(Notification.EXTRA_TITLE));
        append(text, extras.getCharSequence(Notification.EXTRA_TITLE_BIG));
        append(text, extras.getCharSequence(Notification.EXTRA_TEXT));
        append(text, extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (lines != null) for (CharSequence line : lines) append(text, line);
        String message = text.toString().toLowerCase(Locale.ROOT);
        if (!looksLikeSuccessfulPayment(message)) return;
        Long amount = readSingleRupiahAmount(message);
        if (amount == null || amount <= 0 || amount > 10_000_000L) return;

        JSObject event = new JSObject();
        event.put("fingerprint", fingerprint(notification.getPackageName() + ":" + notification.getKey() + ":" + notification.getPostTime()));
        event.put("amount", amount);
        event.put("sourcePackage", notification.getPackageName());
        event.put("notificationAt", notification.getPostTime());
        event.put("paymentSuccess", true);
        ABQrisNotificationPlugin.savePaymentNotification(getApplicationContext(), event);
    }

    private static void append(StringBuilder target, CharSequence value) {
        if (value == null) return;
        if (target.length() > 0) target.append(' ');
        target.append(value);
        if (target.length() > 4096) target.setLength(4096);
    }

    private static boolean looksLikeSuccessfulPayment(String message) {
        boolean payment = message.contains("pembayaran") || message.contains("transaksi") || message.contains("qris");
        boolean success = message.contains("berhasil") || message.contains("diterima") || message.contains("sukses")
            || message.contains("successful") || message.contains("received") || message.contains("uang masuk");
        boolean failure = message.contains("gagal") || message.contains("ditolak") || message.contains("batal")
            || message.contains("refund") || message.contains("pengembalian");
        return payment && success && !failure;
    }

    private static Long readSingleRupiahAmount(String message) {
        Matcher matcher = RUPIAH_AMOUNT.matcher(message);
        Long found = null;
        while (matcher.find()) {
            String digits = matcher.group(1).replace(".", "").replace(",", "");
            try {
                long amount = Long.parseLong(digits);
                if (found != null) return null;
                found = amount;
            } catch (NumberFormatException error) {
                return null;
            }
        }
        return found;
    }

    private static String fingerprint(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte valueByte : digest) hex.append(String.format(Locale.ROOT, "%02x", valueByte & 0xff));
            return hex.toString();
        } catch (Exception error) {
            return "";
        }
    }
}
