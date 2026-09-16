package com.abelektronik.inventory;

import java.io.ByteArrayOutputStream;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

final class EscPos58 {
    static final int CHARS_PER_LINE = 32;
    private static final Charset TEXT_CHARSET = Charset.forName("CP437");

    static final class ReceiptItem {
        final String name;
        final int quantity;
        final long price;
        final long total;

        ReceiptItem(String name, int quantity, long price, long total) {
            this.name = name;
            this.quantity = quantity;
            this.price = price;
            this.total = total;
        }
    }

    static final class Receipt {
        String storeName;
        String address;
        String date;
        String transactionCode;
        String category;
        long total;
        boolean printBarcode;
        boolean printQr;
        List<ReceiptItem> items = new ArrayList<>();
    }

    private EscPos58() {}

    static byte[] testPrint(String printerName) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        init(out);
        align(out, 1);
        bold(out, true);
        size(out, 1, 1);
        text(out, "ABELEKTRONIK\n");
        size(out, 0, 0);
        bold(out, false);
        text(out, "Test Printer Thermal 58 mm\n");
        text(out, safe(printerName) + "\n");
        text(out, "Status: TERHUBUNG\n");
        text(out, "-------------------------------\n");
        text(out, "Jika tulisan ini terbaca,\nprinter siap digunakan.\n");
        feed(out, 3);
        return out.toByteArray();
    }

    static byte[] receipt(Receipt receipt) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        init(out);

        // Header follows the same information hierarchy as the Save PDF receipt.
        align(out, 1);
        bold(out, true);
        size(out, 1, 1);
        text(out, "ABELEKTRONIK\n");
        size(out, 0, 0);
        bold(out, false);
        text(out, "listrik, sparepart tv, audio,\n");
        text(out, "mesin cuci, kulkas dll\n");

        if (receipt.address != null && !receipt.address.trim().isEmpty()) {
            for (String line : wrap(receipt.address, CHARS_PER_LINE)) text(out, line + "\n");
        } else {
            text(out, "-\n");
        }
        if (receipt.date != null && !receipt.date.trim().isEmpty()) text(out, safe(receipt.date) + "\n");

        align(out, 0);
        text(out, repeat('-', CHARS_PER_LINE) + "\n");

        for (ReceiptItem item : receipt.items) {
            bold(out, true);
            for (String line : wrap(item.name, CHARS_PER_LINE)) text(out, line + "\n");
            bold(out, false);
            String left = item.quantity + " x " + rupiah(item.price);
            text(out, row(left, rupiah(item.total)) + "\n");
        }

        text(out, repeat('-', CHARS_PER_LINE) + "\n");
        bold(out, true);
        text(out, row("Total", rupiah(receipt.total)) + "\n");
        bold(out, false);
        text(out, "\n");
        text(out, "masuk".equals(receipt.category) ? "Barang masuk / restock\n" : "Barang keluar / penjualan\n");
        for (String line : wrap("Barang yang sudah dibeli mengikuti kebijakan retur toko.", CHARS_PER_LINE)) {
            text(out, line + "\n");
        }

        // Barcode / QR remain optional printer preferences and are appended after the PDF-matched receipt body.
        if (receipt.printBarcode && receipt.transactionCode != null && !receipt.transactionCode.isEmpty()) {
            align(out, 1);
            text(out, "\n");
            code128(out, receipt.transactionCode, true);
            text(out, receipt.transactionCode + "\n");
        }
        if (receipt.printQr && receipt.transactionCode != null && !receipt.transactionCode.isEmpty()) {
            align(out, 1);
            text(out, "\n");
            qr(out, receipt.transactionCode, 4);
            text(out, "\n");
        }

        feed(out, 3);
        return out.toByteArray();
    }

    static byte[] productBarcode(String name, String brand, String barcode, Long price, String symbology) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        init(out);
        align(out, 1);
        bold(out, true);
        for (String line : wrap(name, CHARS_PER_LINE)) text(out, line + "\n");
        bold(out, false);
        if (brand != null && !brand.trim().isEmpty()) text(out, fit(brand) + "\n");
        if (price != null) text(out, rupiah(price) + "\n");
        text(out, "\n");
        barcode(out, barcode, symbology, true);
        text(out, barcode + "\n");
        feed(out, 2);
        return out.toByteArray();
    }

    static byte[] qrOnly(String value) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        init(out);
        align(out, 1);
        qr(out, value, 5);
        text(out, "\n" + safe(value) + "\n");
        feed(out, 2);
        return out.toByteArray();
    }

    private static void barcode(ByteArrayOutputStream out, String value, String symbology, boolean hri) {
        String normalized = safe(value);
        if ("EAN13".equals(symbology) && normalized.matches("\\d{13}")) {
            linear(out, 67, normalized, hri);
        } else if ("EAN8".equals(symbology) && normalized.matches("\\d{8}")) {
            linear(out, 68, normalized, hri);
        } else if ("UPCA".equals(symbology) && normalized.matches("\\d{12}")) {
            linear(out, 65, normalized, hri);
        } else {
            code128(out, normalized, hri);
        }
    }

    private static void linear(ByteArrayOutputStream out, int mode, String value, boolean hri) {
        write(out, 0x1D, 0x48, hri ? 2 : 0);
        write(out, 0x1D, 0x68, 58);
        write(out, 0x1D, 0x77, 2);
        byte[] data = value.getBytes(TEXT_CHARSET);
        write(out, 0x1D, 0x6B, mode, data.length);
        out.write(data, 0, data.length);
        text(out, "\n");
    }

    private static void code128(ByteArrayOutputStream out, String value, boolean hri) {
        String printable = value == null || value.isEmpty() ? "-" : value;
        byte[] payload = ("{B" + printable).getBytes(TEXT_CHARSET);
        write(out, 0x1D, 0x48, hri ? 2 : 0);
        write(out, 0x1D, 0x68, 58);
        write(out, 0x1D, 0x77, 2);
        write(out, 0x1D, 0x6B, 73, payload.length);
        out.write(payload, 0, payload.length);
        text(out, "\n");
    }

    private static void qr(ByteArrayOutputStream out, String value, int moduleSize) {
        byte[] data = safe(value).getBytes(TEXT_CHARSET);
        write(out, 0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
        write(out, 0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, Math.max(2, Math.min(6, moduleSize)));
        write(out, 0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31);
        int length = data.length + 3;
        int pL = length & 0xff;
        int pH = (length >> 8) & 0xff;
        write(out, 0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30);
        out.write(data, 0, data.length);
        write(out, 0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
    }

    private static String row(String left, String right) {
        String a = safe(left);
        String b = safe(right);
        if (b.length() >= CHARS_PER_LINE) return fit(b);
        int maxLeft = CHARS_PER_LINE - b.length() - 1;
        if (a.length() > maxLeft) a = a.substring(0, Math.max(0, maxLeft));
        return a + repeat(' ', Math.max(1, CHARS_PER_LINE - a.length() - b.length())) + b;
    }

    static List<String> wrap(String value, int width) {
        List<String> lines = new ArrayList<>();
        String text = safe(value).trim();
        if (text.isEmpty()) {
            lines.add("");
            return lines;
        }
        while (text.length() > width) {
            int cut = text.lastIndexOf(' ', width);
            if (cut < width / 2) cut = width;
            lines.add(text.substring(0, cut).trim());
            text = text.substring(cut).trim();
        }
        if (!text.isEmpty()) lines.add(text);
        return lines;
    }

    private static String fit(String value) {
        String text = safe(value);
        return text.length() <= CHARS_PER_LINE ? text : text.substring(0, CHARS_PER_LINE);
    }

    private static String rupiah(long value) {
        return "Rp " + String.format(Locale.US, "%,d", value).replace(',', '.');
    }

    private static String safe(String value) {
        if (value == null) return "";
        return value.replace('\n', ' ').replace('\r', ' ').replaceAll("[^\\x20-\\x7E]", "?").trim();
    }

    private static String repeat(char value, int count) {
        StringBuilder builder = new StringBuilder(Math.max(0, count));
        for (int i = 0; i < count; i++) builder.append(value);
        return builder.toString();
    }

    private static void init(ByteArrayOutputStream out) { write(out, 0x1B, 0x40); }
    private static void align(ByteArrayOutputStream out, int value) { write(out, 0x1B, 0x61, value); }
    private static void bold(ByteArrayOutputStream out, boolean value) { write(out, 0x1B, 0x45, value ? 1 : 0); }
    private static void size(ByteArrayOutputStream out, int width, int height) { write(out, 0x1D, 0x21, ((width & 0x07) << 4) | (height & 0x07)); }
    private static void feed(ByteArrayOutputStream out, int lines) { write(out, 0x1B, 0x64, Math.max(0, Math.min(10, lines))); }
    private static void text(ByteArrayOutputStream out, String value) {
        byte[] data = value.getBytes(TEXT_CHARSET);
        out.write(data, 0, data.length);
    }
    private static void write(ByteArrayOutputStream out, int... values) {
        for (int value : values) out.write(value & 0xff);
    }
}
