package com.abelektronik.inventory;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import android.widget.Toast;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

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

        call.setKeepAlive(true);
        call.setData(new JSObject()
            .put("dataUrl", dataUrl)
            .put("fileName", sanitizeFileName(requestedName))
            .put("mimeType", mimeType));

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, sanitizeFileName(requestedName));
        startActivityForResult(call, intent, "saveFileResult");
    }

    @ActivityCallback
    private void saveFileResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("Penyimpanan dibatalkan oleh pengguna.");
            call.setKeepAlive(false);
            return;
        }

        Uri target = result.getData().getData();
        JSObject data = call.getData();
        String dataUrl = data.getString("dataUrl", "");
        String fileName = data.getString("fileName", "abelektronik-download");

        try {
            byte[] bytes = decodeDataUrl(dataUrl);
            ContentResolver resolver = getContext().getContentResolver();
            try (OutputStream stream = resolver.openOutputStream(target, "w")) {
                if (stream == null) throw new IllegalStateException("Dokumen tujuan tidak dapat dibuka.");
                stream.write(bytes);
                stream.flush();
            }

            JSObject response = new JSObject();
            response.put("uri", target.toString());
            response.put("path", fileName);
            call.resolve(response);
            showToast("Dokumen berhasil disimpan: " + fileName);
        } catch (Exception error) {
            showToast("Gagal menyimpan file: " + error.getMessage());
            call.reject("File gagal disimpan ke dokumen yang dipilih.", error);
        } finally {
            call.setKeepAlive(false);
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

    private void showToast(String message) {
        if (getActivity() == null) return;
        getActivity().runOnUiThread(() -> Toast.makeText(getContext(), message, Toast.LENGTH_LONG).show());
    }
}
