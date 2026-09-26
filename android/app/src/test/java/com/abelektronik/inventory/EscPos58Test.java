package com.abelektronik.inventory;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;

public class EscPos58Test {
    @Test
    public void wrapsLongNamesWithin58mmLineWidth() {
        List<String> lines = EscPos58.wrap("Lampu LED Philips sangat panjang untuk etalase toko bagian depan", EscPos58.CHARS_PER_LINE);
        assertTrue(lines.size() > 1);
        for (String line : lines) assertTrue(line.length() <= EscPos58.CHARS_PER_LINE);
    }

    @Test
    public void productBarcodeKeepsLeadingZeroAndUsesCode128Command() {
        byte[] bytes = EscPos58.productBarcode("Lampu LED", "Provi", "001", 15000L, "CODE128");
        String printable = new String(bytes, StandardCharsets.US_ASCII);
        assertTrue(printable.contains("001"));
        assertTrue(containsSequence(bytes, new int[] { 0x1D, 0x6B, 73 }));
    }

    @Test
    public void receiptMatchesPdfBodyAndKeepsNativeQrBarcodeOptions() {
        EscPos58.Receipt receipt = new EscPos58.Receipt();
        receipt.storeName = "Toko Cabang";
        receipt.address = "Jalan Raya Cirebon Bandung No. 1";
        receipt.date = "16 Sep 2026 12.00";
        receipt.transactionCode = "TRX-001";
        receipt.category = "keluar";
        receipt.total = 30000;
        receipt.printBarcode = true;
        receipt.printQr = true;
        receipt.items = Arrays.asList(new EscPos58.ReceiptItem("Lampu LED", "Philips", 2, 15000, 30000));

        byte[] bytes = EscPos58.receipt(receipt);
        String printable = new String(bytes, StandardCharsets.US_ASCII);
        assertTrue(printable.contains("ABELEKTRONIK"));
        assertTrue(printable.contains("listrik, sparepart tv, audio"));
        assertTrue(printable.contains("Barang keluar / penjualan"));
        assertTrue(printable.contains("Philips"));
        assertTrue(printable.contains("kebijakan retur toko."));
        assertTrue(printable.contains("TRX-001"));
        assertTrue(printable.contains("Rp 30.000"));
        assertTrue(containsSequence(bytes, new int[] { 0x1D, 0x6B, 73 }));
        assertTrue(containsSequence(bytes, new int[] { 0x1D, 0x28, 0x6B }));
    }

    @Test
    public void barcodeReceiptWidthStaysConfiguredFor58mm() {
        assertEquals(32, EscPos58.CHARS_PER_LINE);
    }

    private static boolean containsSequence(byte[] bytes, int[] sequence) {
        outer:
        for (int index = 0; index <= bytes.length - sequence.length; index++) {
            for (int offset = 0; offset < sequence.length; offset++) {
                if ((bytes[index + offset] & 0xff) != sequence[offset]) continue outer;
            }
            return true;
        }
        return false;
    }
}
