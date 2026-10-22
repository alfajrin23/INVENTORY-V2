package com.abelektronik.inventory;

import android.app.Notification;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.os.Bundle;

import com.getcapacitor.JSObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class GoPayMerchantNotificationListener extends NotificationListenerService {
    private static final Set<String> MERCHANT_PACKAGES = new HashSet<String>() {{
        add("com.gojek.gopaymerchant");
        add("com.gojek.resto");
    }};
    private static final Pattern RUPIAH_AMOUNT = Pattern.compile("(?i)\\b(?:rp\\.?|idr)\\s*([0-9]{1,3}(?:[., ]?[0-9]{3})*|[0-9]+)\\b");
    private static final Pattern PAYMENT_CONTEXT = Pattern.compile("(?i)\\b(pembayaran|payment|transaksi|qris)\\b");
    private static final Pattern SUCCESS_CONTEXT = Pattern.compile("(?i)\\b(berhasil|diterima|sukses|successful|successfully|received|masuk|bertambah|ditambahkan|menerima|mendapatkan)\\b");

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
        append(text, extras.getCharSequence(Notification.EXTRA_SUB_TEXT));
        append(text, extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT));
        append(text, extras.getCharSequence(Notification.EXTRA_INFO_TEXT));
        CharSequence[] lines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
        if (lines != null) for (CharSequence line : lines) append(text, line);
        // Some merchant app versions place the visible text under custom extras.
        for (String key : extras.keySet()) {
            Object value = extras.get(key);
            if (value instanceof CharSequence) append(text, (CharSequence) value);
            else if (value instanceof CharSequence[]) {
                for (CharSequence line : (CharSequence[]) value) append(text, line);
            }
        }
        append(text, posted.tickerText);
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
        boolean payment = containsAny(message, "pembayaran", "payment", "transaksi", "qris", "saldo", "uang masuk", "dana masuk",
            "uang diterima", "dana diterima", "menerima uang", "menerima dana");
        boolean success = SUCCESS_CONTEXT.matcher(message).find()
            || message.contains("uang masuk") || message.contains("dana masuk");
        boolean failure = containsAny(message, "gagal", "ditolak", "dibatalkan", "batal", "cancelled", "canceled", "failed",
            "refund", "pengembalian", "dikembalikan");
        return payment && success && !failure;
    }

    private static Long readSingleRupiahAmount(String message) {
        Matcher matcher = RUPIAH_AMOUNT.matcher(message);
        List<Long> amounts = new ArrayList<>();
        List<Integer> starts = new ArrayList<>();
        List<Integer> ends = new ArrayList<>();
        while (matcher.find()) {
            String digits = matcher.group(1).replaceAll("[., ]", "");
            try {
                long amount = Long.parseLong(digits);
                amounts.add(amount);
                starts.add(matcher.start());
                ends.add(matcher.end());
            } catch (NumberFormatException error) {
                return null;
            }
        }
        if (amounts.isEmpty()) return null;

        Long onlyAmount = null;
        boolean sameAmount = true;
        for (Long amount : amounts) {
            if (onlyAmount == null) onlyAmount = amount;
            else if (!onlyAmount.equals(amount)) sameAmount = false;
        }
        if (sameAmount) return onlyAmount;

        int bestScore = 0;
        Long bestAmount = null;
        boolean ambiguous = false;
        for (int index = 0; index < amounts.size(); index++) {
            int paymentDistance = nearestDistance(message, starts.get(index), ends.get(index), PAYMENT_CONTEXT);
            int successDistance = nearestDistance(message, starts.get(index), ends.get(index), SUCCESS_CONTEXT);
            int score = paymentDistance <= 48 ? 100 - paymentDistance : 0;
            if (successDistance <= 24) score += 50 - successDistance;
            if (score > bestScore) {
                bestScore = score;
                bestAmount = amounts.get(index);
                ambiguous = false;
            } else if (score == bestScore && score > 0 && !amounts.get(index).equals(bestAmount)) {
                ambiguous = true;
            }
        }
        return bestScore > 0 && !ambiguous ? bestAmount : null;
    }

    private static int nearestDistance(String message, int start, int end, Pattern context) {
        Matcher matcher = context.matcher(message);
        int nearest = Integer.MAX_VALUE;
        while (matcher.find()) {
            int distance = matcher.end() <= start ? start - matcher.end()
                : matcher.start() >= end ? matcher.start() - end : 0;
            if (distance < nearest) nearest = distance;
        }
        return nearest;
    }

    private static boolean containsAny(String message, String... phrases) {
        for (String phrase : phrases) if (message.contains(phrase)) return true;
        return false;
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
