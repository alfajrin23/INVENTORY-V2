package com.abelektronik.inventory;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "ABAppUpdate")
public class ABAppUpdatePlugin extends Plugin {
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("versionName", info.versionName == null ? "0.0.0" : info.versionName);
            result.put("versionCode", getVersionCode(info));
            call.resolve(result);
        } catch (PackageManager.NameNotFoundException error) {
            call.reject("Versi aplikasi tidak dapat dibaca.", error);
        }
    }

    @PluginMethod
    public void canInstallPackages(PluginCall call) {
        JSObject result = new JSObject();
        boolean granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
        result.put("granted", granted);
        call.resolve(result);
    }

    @PluginMethod
    public void requestInstallPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls()) {
            call.resolve();
            return;
        }

        Intent intent = new Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:" + getContext().getPackageName())
        );
        getActivity().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String urlValue = call.getString("url");
        if (urlValue == null || urlValue.trim().isEmpty()) {
            call.reject("URL update tidak tersedia.");
            return;
        }

        Uri requestedUri = Uri.parse(urlValue);
        if (!"https".equalsIgnoreCase(requestedUri.getScheme())
            || requestedUri.getHost() == null
            || !"github.com".equalsIgnoreCase(requestedUri.getHost())) {
            call.reject("Sumber update tidak diizinkan.");
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("Izin instalasi update belum diaktifkan.");
            return;
        }

        executor.execute(() -> downloadApk(call, urlValue));
    }

    private void downloadApk(PluginCall call, String urlValue) {
        HttpURLConnection connection = null;
        File apkFile = null;
        try {
            File updateDir = new File(getContext().getCacheDir(), "updates");
            if (!updateDir.exists() && !updateDir.mkdirs()) {
                throw new IllegalStateException("Folder update tidak dapat dibuat.");
            }

            apkFile = new File(updateDir, "ABElektronik-Inventory-update.apk");
            connection = (HttpURLConnection) new URL(urlValue).openConnection();
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(60000);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("User-Agent", "ABElektronik-Inventory-Android");
            connection.connect();

            int responseCode = connection.getResponseCode();
            if (responseCode < 200 || responseCode >= 300) {
                throw new IllegalStateException("Server update merespons HTTP " + responseCode + ".");
            }

            long totalBytes = connection.getContentLengthLong();
            long downloadedBytes = 0;
            byte[] buffer = new byte[16 * 1024];

            try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(apkFile)) {
                int read;
                int lastPercent = -1;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                    downloadedBytes += read;
                    int percent = totalBytes > 0 ? (int) Math.min(99, (downloadedBytes * 100L) / totalBytes) : 0;
                    if (percent != lastPercent) {
                        notifyProgress(percent, downloadedBytes, totalBytes);
                        lastPercent = percent;
                    }
                }
                output.flush();
            }

            verifyPackage(apkFile);
            notifyProgress(100, downloadedBytes, totalBytes > 0 ? totalBytes : downloadedBytes);
            openInstaller(apkFile);
            call.resolve();
        } catch (Exception error) {
            if (apkFile != null && apkFile.exists()) {
                //noinspection ResultOfMethodCallIgnored
                apkFile.delete();
            }
            call.reject("Update gagal: " + error.getMessage(), error);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void verifyPackage(File apkFile) {
        PackageManager packageManager = getContext().getPackageManager();
        PackageInfo archive = packageManager.getPackageArchiveInfo(apkFile.getAbsolutePath(), 0);
        if (archive == null || !getContext().getPackageName().equals(archive.packageName)) {
            throw new IllegalStateException("APK update bukan paket ABElektronik Inventory.");
        }

        try {
            PackageInfo current = packageManager.getPackageInfo(getContext().getPackageName(), 0);
            if (getVersionCode(archive) <= getVersionCode(current)) {
                throw new IllegalStateException("Versi APK update harus lebih baru dari aplikasi saat ini.");
            }
        } catch (PackageManager.NameNotFoundException error) {
            throw new IllegalStateException("Versi aplikasi saat ini tidak dapat diverifikasi.", error);
        }
    }

    private long getVersionCode(PackageInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return info.getLongVersionCode();
        //noinspection deprecation
        return info.versionCode;
    }

    private void notifyProgress(int percent, long downloadedBytes, long totalBytes) {
        JSObject progress = new JSObject();
        progress.put("percent", percent);
        progress.put("downloadedBytes", downloadedBytes);
        progress.put("totalBytes", totalBytes);
        notifyListeners("updateProgress", progress);
    }

    private void openInstaller(File apkFile) {
        Uri uri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            apkFile
        );
        Intent intent = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

        getActivity().runOnUiThread(() -> getActivity().startActivity(intent));
    }

    @PluginMethod
    public void exitApp(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            call.resolve();
            getActivity().finishAffinity();
        });
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
