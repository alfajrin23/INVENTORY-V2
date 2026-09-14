package com.abelektronik.inventory;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.widget.Toast;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "ABFileSaver")
public class ABFileSaverPlugin extends Plugin {

    @PluginMethod
    public void saveBase64File(PluginCall call) {
        final String dataUrl = call.getString("dataUrl");
        final String requestedName = call.getString("fileName", "abelektronik-download");
        final String mimeType = call.getString("mimeType", "application/octet-stream");

        if (dataUrl == null || dataUrl.trim().isEmpty()) {
            call.reject("Data file kosong.");
            return;
        }

        try {
            final byte[] bytes = decodeDataUrl(dataUrl);
            final String safeName = sanitizeFileName(requestedName);
            final SaveResult saved = saveToDownloads(bytes, safeName, mimeType);

            JSObject result = new JSObject();
            result.put("uri", saved.uri);
            result.put("path", saved.path);
            call.resolve(result);

            showToast("Tersimpan di " + saved.path);
        } catch (Exception error) {
            showToast("Gagal menyimpan file: " + error.getMessage());
            call.reject("File gagal disimpan ke penyimpanan HP.", error);
        }
    }

    private byte[] decodeDataUrl(String dataUrl) {
        int commaIndex = dataUrl.indexOf(',');
        String payload = commaIndex >= 0 ? dataUrl.substring(commaIndex + 1) : dataUrl;
        return Base64.decode(payload, Base64.DEFAULT);
    }

    private String sanitizeFileName(String fileName) {
        String clean = fileName == null ? "abelektronik-download" : fileName.trim();
        clean = clean.replaceAll("[^A-Za-z0-9._-]", "_");
        clean = clean.replaceAll("_+", "_");
        return clean.isEmpty() ? "abelektronik-download" : clean;
    }

    private SaveResult saveToDownloads(byte[] bytes, String fileName, String mimeType) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return saveWithMediaStore(bytes, fileName, mimeType);
        }
        return saveLegacy(bytes, fileName, mimeType);
    }

    private SaveResult saveWithMediaStore(byte[] bytes, String fileName, String mimeType) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
        values.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/ABElektronik");
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            throw new IllegalStateException("Folder Download tidak dapat dibuka.");
        }

        try {
            try (OutputStream stream = resolver.openOutputStream(uri, "w")) {
                if (stream == null) {
                    throw new IllegalStateException("File output tidak dapat dibuat.");
                }
                stream.write(bytes);
                stream.flush();
            }

            ContentValues ready = new ContentValues();
            ready.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, ready, null, null);
            return new SaveResult(uri.toString(), "Download/ABElektronik/" + fileName);
        } catch (Exception error) {
            resolver.delete(uri, null, null);
            throw error;
        }
    }

    @SuppressWarnings("deprecation")
    private SaveResult saveLegacy(byte[] bytes, String fileName, String mimeType) throws Exception {
        File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        File folder = new File(downloads, "ABElektronik");
        if (!folder.exists() && !folder.mkdirs()) {
            throw new IllegalStateException("Folder Download/ABElektronik tidak dapat dibuat.");
        }

        File target = uniqueFile(folder, fileName);
        try (FileOutputStream stream = new FileOutputStream(target)) {
            stream.write(bytes);
            stream.flush();
        }

        MediaScannerConnection.scanFile(
            getContext(),
            new String[] { target.getAbsolutePath() },
            new String[] { mimeType },
            null
        );

        return new SaveResult(Uri.fromFile(target).toString(), "Download/ABElektronik/" + target.getName());
    }

    private File uniqueFile(File folder, String fileName) {
        File requested = new File(folder, fileName);
        if (!requested.exists()) return requested;

        int dot = fileName.lastIndexOf('.');
        String base = dot > 0 ? fileName.substring(0, dot) : fileName;
        String extension = dot > 0 ? fileName.substring(dot) : "";

        for (int index = 2; index < 10000; index++) {
            File candidate = new File(folder, base + "-" + index + extension);
            if (!candidate.exists()) return candidate;
        }

        return new File(folder, base + "-" + System.currentTimeMillis() + extension);
    }

    private void showToast(String message) {
        if (getActivity() == null) return;
        getActivity().runOnUiThread(() ->
            Toast.makeText(getContext(), message, Toast.LENGTH_LONG).show()
        );
    }

    private static class SaveResult {
        final String uri;
        final String path;

        SaveResult(String uri, String path) {
            this.uri = uri;
            this.path = path;
        }
    }
}
