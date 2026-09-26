package com.abelektronik.inventory;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

@CapacitorPlugin(
    name = "ABThermalPrinter",
    permissions = {
        @Permission(
            alias = "bluetooth",
            strings = {
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_CONNECT
            }
        )
    }
)
public class ABThermalPrinterPlugin extends Plugin {
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final String PREFS = "ab_thermal_printer";
    private static final String PREF_ADDRESS = "default_address";
    private static final String PREF_NAME = "default_name";
    private static final long IDLE_DISCONNECT_MS = 15_000L;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Object socketLock = new Object();
    private BluetoothSocket socket;
    private String connectedAddress;
    private final Runnable idleDisconnect = this::closeSocket;

    private BluetoothAdapter adapter() {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return manager == null ? null : manager.getAdapter();
    }

    private boolean hasBluetoothPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S
            || getPermissionState("bluetooth") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void isBluetoothSupported(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", adapter() != null);
        call.resolve(result);
    }

    @PluginMethod
    public void getBluetoothState(PluginCall call) {
        BluetoothAdapter bluetooth = adapter();
        JSObject result = new JSObject();
        boolean supported = bluetooth != null;
        boolean enabled = supported && bluetooth.isEnabled();
        result.put("supported", supported);
        result.put("enabled", enabled);
        result.put("state", !supported ? "unsupported" : enabled ? "on" : "off");
        call.resolve(result);
    }

    @PluginMethod
    public void requestBluetoothPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }
        if (hasBluetoothPermission()) {
            resolvePermission(call);
            return;
        }
        requestPermissionForAlias("bluetooth", call, "bluetoothPermissionCallback");
    }

    @PermissionCallback
    private void bluetoothPermissionCallback(PluginCall call) {
        resolvePermission(call);
    }

    private void resolvePermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasBluetoothPermission());
        call.resolve(result);
    }

    @PluginMethod
    public void getPairedPrinters(PluginCall call) {
        if (!requireBluetooth(call, true)) return;
        executor.execute(() -> {
            try {
                BluetoothAdapter bluetooth = adapter();
                Set<BluetoothDevice> bonded = bluetooth == null ? null : bluetooth.getBondedDevices();
                List<BluetoothDevice> devices = bonded == null ? new ArrayList<>() : new ArrayList<>(bonded);
                call.resolve(devicesResult(devices));
            } catch (Exception error) {
                call.reject("Daftar printer Bluetooth gagal dibaca: " + message(error), error);
            }
        });
    }

    @PluginMethod
    public void discoverPrinters(PluginCall call) {
        if (!requireBluetooth(call, true)) return;
        executor.execute(() -> {
            BluetoothAdapter bluetooth = adapter();
            if (bluetooth == null) {
                call.reject("Bluetooth tidak tersedia di perangkat ini.");
                return;
            }

            final Map<String, BluetoothDevice> found = new HashMap<>();
            try {
                Set<BluetoothDevice> bonded = bluetooth.getBondedDevices();
                if (bonded != null) for (BluetoothDevice device : bonded) found.put(device.getAddress(), device);
            } catch (SecurityException error) {
                call.reject("Izin Bluetooth belum diberikan.", error);
                return;
            }

            CountDownLatch finished = new CountDownLatch(1);
            BroadcastReceiver receiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    String action = intent.getAction();
                    if (BluetoothDevice.ACTION_FOUND.equals(action)) {
                        BluetoothDevice device;
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice.class);
                        } else {
                            //noinspection deprecation
                            device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
                        }
                        if (device != null) found.put(device.getAddress(), device);
                    } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(action)) {
                        finished.countDown();
                    }
                }
            };

            IntentFilter filter = new IntentFilter();
            filter.addAction(BluetoothDevice.ACTION_FOUND);
            filter.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
            boolean registered = false;
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    getContext().registerReceiver(receiver, filter, Context.RECEIVER_EXPORTED);
                } else {
                    //noinspection UnspecifiedRegisterReceiverFlag
                    getContext().registerReceiver(receiver, filter);
                }
                registered = true;
                if (bluetooth.isDiscovering()) bluetooth.cancelDiscovery();
                if (!bluetooth.startDiscovery()) throw new IllegalStateException("Pencarian Bluetooth tidak dapat dimulai.");
                finished.await(12, TimeUnit.SECONDS);
                if (bluetooth.isDiscovering()) bluetooth.cancelDiscovery();
                call.resolve(devicesResult(new ArrayList<>(found.values())));
            } catch (Exception error) {
                call.reject("Pencarian printer gagal: " + message(error), error);
            } finally {
                if (registered) {
                    try { getContext().unregisterReceiver(receiver); } catch (Exception ignored) {}
                }
            }
        });
    }

    @PluginMethod
    public void connect(PluginCall call) {
        if (!requireBluetooth(call, true)) return;
        String address = call.getString("address");
        if (address == null || address.trim().isEmpty()) {
            call.reject("Printer belum dipilih.");
            return;
        }
        executor.execute(() -> {
            try {
                BluetoothDevice device = adapter().getRemoteDevice(address.trim());
                connectDevice(device);
                JSObject result = connectionResult(device);
                call.resolve(result);
            } catch (Exception error) {
                closeSocket();
                call.reject("Printer tidak dapat dihubungkan: " + message(error), error);
            }
        });
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        closeSocket();
        call.resolve();
    }

    @PluginMethod
    public void getConnectionStatus(PluginCall call) {
        JSObject result = new JSObject();
        synchronized (socketLock) {
            boolean connected = socket != null && socket.isConnected();
            result.put("connected", connected);
            if (connectedAddress != null) result.put("address", connectedAddress);
            String savedAddress = prefs().getString(PREF_ADDRESS, null);
            String savedName = prefs().getString(PREF_NAME, null);
            if (savedName != null && (savedAddress == null || savedAddress.equals(connectedAddress))) result.put("name", savedName);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void getSavedPrinter(PluginCall call) {
        String address = prefs().getString(PREF_ADDRESS, null);
        String name = prefs().getString(PREF_NAME, null);
        JSObject result = new JSObject();
        if (address == null || address.isEmpty()) {
            result.put("printer", JSONObject.NULL);
        } else {
            JSObject printer = new JSObject();
            printer.put("address", address);
            printer.put("name", name == null || name.trim().isEmpty() ? "Printer Thermal" : name);
            printer.put("bonded", isBonded(address));
            result.put("printer", printer);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void saveDefaultPrinter(PluginCall call) {
        String address = call.getString("address");
        String name = call.getString("name", "Printer Thermal");
        if (address == null || address.trim().isEmpty()) {
            call.reject("Printer belum dipilih.");
            return;
        }
        prefs().edit().putString(PREF_ADDRESS, address.trim()).putString(PREF_NAME, name == null ? "Printer Thermal" : name.trim()).apply();
        call.resolve();
    }

    @PluginMethod
    public void forgetPrinter(PluginCall call) {
        closeSocket();
        prefs().edit().remove(PREF_ADDRESS).remove(PREF_NAME).apply();
        call.resolve();
    }

    @PluginMethod
    public void testPrint(PluginCall call) {
        executor.execute(() -> writeSavedPrinter(call, EscPos58.testPrint(prefs().getString(PREF_NAME, "Printer Thermal"))));
    }

    @PluginMethod
    public void printReceipt(PluginCall call) {
        JSObject receiptJson = call.getObject("receipt");
        if (receiptJson == null) {
            call.reject("Data resi kosong.");
            return;
        }
        executor.execute(() -> {
            try {
                EscPos58.Receipt receipt = new EscPos58.Receipt();
                receipt.storeName = receiptJson.optString("storeName", "ABELEKTRONIK");
                receipt.address = receiptJson.optString("address", "");
                receipt.date = receiptJson.optString("date", "");
                receipt.transactionCode = receiptJson.optString("transactionCode", "");
                receipt.category = receiptJson.optString("category", "keluar");
                receipt.total = Math.round(receiptJson.optDouble("total", 0));
                receipt.printBarcode = receiptJson.optBoolean("printBarcode", true);
                receipt.printQr = receiptJson.optBoolean("printQr", true);
                JSONArray items = receiptJson.optJSONArray("items");
                if (items != null) {
                    for (int index = 0; index < items.length(); index++) {
                        JSONObject item = items.optJSONObject(index);
                        if (item == null) continue;
                        receipt.items.add(new EscPos58.ReceiptItem(
                            item.optString("name", "Barang"),
                            item.optString("brand", ""),
                            Math.max(1, item.optInt("quantity", 1)),
                            Math.round(item.optDouble("price", 0)),
                            Math.round(item.optDouble("total", 0))
                        ));
                    }
                }
                writeSavedPrinter(call, EscPos58.receipt(receipt));
            } catch (Exception error) {
                call.reject("Resi gagal disiapkan: " + message(error), error);
            }
        });
    }

    @PluginMethod
    public void printBarcode(PluginCall call) {
        JSObject barcodeJson = call.getObject("barcode");
        if (barcodeJson == null) {
            call.reject("Data barcode kosong.");
            return;
        }
        executor.execute(() -> {
            try {
                String value = barcodeJson.optString("barcode", "");
                if (value.isEmpty()) throw new IllegalArgumentException("Kode barcode kosong.");
                int copies = Math.max(1, Math.min(99, barcodeJson.optInt("copies", 1)));
                Long price = barcodeJson.has("price") && !barcodeJson.isNull("price")
                    ? Math.round(barcodeJson.optDouble("price", 0)) : null;
                byte[] one = EscPos58.productBarcode(
                    barcodeJson.optString("name", "Barang"),
                    barcodeJson.optString("brand", ""),
                    value,
                    price,
                    barcodeJson.optString("symbology", "CODE128")
                );
                connectSavedPrinter();
                for (int index = 0; index < copies; index++) writeBytes(one);
                call.resolve();
            } catch (Exception error) {
                closeSocket();
                call.reject("Barcode gagal dicetak: " + message(error), error);
            }
        });
    }

    @PluginMethod
    public void printQr(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.trim().isEmpty()) {
            call.reject("Data QR kosong.");
            return;
        }
        executor.execute(() -> writeSavedPrinter(call, EscPos58.qrOnly(value)));
    }

    private void writeSavedPrinter(PluginCall call, byte[] bytes) {
        try {
            connectSavedPrinter();
            writeBytes(bytes);
            call.resolve();
        } catch (Exception error) {
            closeSocket();
            call.reject("Printer gagal mencetak: " + message(error), error);
        }
    }

    private void connectSavedPrinter() throws Exception {
        String address = prefs().getString(PREF_ADDRESS, null);
        if (address == null || address.isEmpty()) throw new IllegalStateException("Printer default belum dipilih.");
        synchronized (socketLock) {
            if (socket != null && socket.isConnected() && address.equals(connectedAddress)) {
                touchConnection();
                return;
            }
        }
        BluetoothAdapter bluetooth = adapter();
        if (bluetooth == null || !bluetooth.isEnabled()) throw new IllegalStateException("Bluetooth HP belum aktif.");
        connectDevice(bluetooth.getRemoteDevice(address));
    }

    private void connectDevice(BluetoothDevice device) throws Exception {
        BluetoothAdapter bluetooth = adapter();
        if (bluetooth == null || !bluetooth.isEnabled()) throw new IllegalStateException("Bluetooth HP belum aktif.");
        if (!hasBluetoothPermission()) throw new SecurityException("Izin Bluetooth belum diberikan.");
        if (bluetooth.isDiscovering()) bluetooth.cancelDiscovery();

        if (device.getBondState() != BluetoothDevice.BOND_BONDED) {
            if (!device.createBond()) throw new IllegalStateException("Pairing tidak dapat dimulai.");
            long deadline = System.currentTimeMillis() + 30_000L;
            while (device.getBondState() == BluetoothDevice.BOND_BONDING && System.currentTimeMillis() < deadline) {
                Thread.sleep(250L);
            }
            if (device.getBondState() != BluetoothDevice.BOND_BONDED) {
                throw new IllegalStateException("Pairing belum selesai. Setujui permintaan pairing Android lalu coba lagi.");
            }
        }

        synchronized (socketLock) {
            if (socket != null && socket.isConnected() && device.getAddress().equals(connectedAddress)) {
                touchConnection();
                return;
            }
            closeSocketLocked();
            IOException firstError = null;
            try {
                socket = device.createRfcommSocketToServiceRecord(SPP_UUID);
                socket.connect();
            } catch (IOException error) {
                firstError = error;
                closeSocketLocked();
                try {
                    socket = device.createInsecureRfcommSocketToServiceRecord(SPP_UUID);
                    socket.connect();
                } catch (IOException secondError) {
                    closeSocketLocked();
                    secondError.addSuppressed(firstError);
                    throw secondError;
                }
            }
            connectedAddress = device.getAddress();
            touchConnection();
        }
    }

    private void writeBytes(byte[] bytes) throws IOException {
        synchronized (socketLock) {
            if (socket == null || !socket.isConnected()) throw new IOException("Koneksi printer terputus.");
            OutputStream stream = socket.getOutputStream();
            stream.write(bytes);
            stream.flush();
            touchConnection();
        }
    }

    private void touchConnection() {
        mainHandler.removeCallbacks(idleDisconnect);
        mainHandler.postDelayed(idleDisconnect, IDLE_DISCONNECT_MS);
    }

    private void closeSocket() {
        synchronized (socketLock) { closeSocketLocked(); }
    }

    private void closeSocketLocked() {
        mainHandler.removeCallbacks(idleDisconnect);
        if (socket != null) {
            try { socket.close(); } catch (IOException ignored) {}
        }
        socket = null;
        connectedAddress = null;
    }

    private boolean requireBluetooth(PluginCall call, boolean requireEnabled) {
        BluetoothAdapter bluetooth = adapter();
        if (bluetooth == null) {
            call.reject("Bluetooth tidak tersedia di perangkat ini.");
            return false;
        }
        if (requireEnabled && !bluetooth.isEnabled()) {
            call.reject("Bluetooth HP belum aktif.");
            return false;
        }
        if (!hasBluetoothPermission()) {
            call.reject("Izin Bluetooth belum diberikan.");
            return false;
        }
        return true;
    }

    private JSObject devicesResult(List<BluetoothDevice> devices) {
        devices.sort(Comparator.comparingInt(this::printerScore).reversed().thenComparing(this::deviceName, String.CASE_INSENSITIVE_ORDER));
        JSArray values = new JSArray();
        for (BluetoothDevice device : devices) {
            JSObject item = new JSObject();
            item.put("name", deviceName(device));
            item.put("address", device.getAddress());
            item.put("bonded", device.getBondState() == BluetoothDevice.BOND_BONDED);
            values.put(item);
        }
        JSObject result = new JSObject();
        result.put("devices", values);
        return result;
    }

    private JSObject connectionResult(BluetoothDevice device) {
        JSObject result = new JSObject();
        result.put("connected", true);
        result.put("name", deviceName(device));
        result.put("address", device.getAddress());
        return result;
    }

    private String deviceName(BluetoothDevice device) {
        try {
            String name = device.getName();
            return name == null || name.trim().isEmpty() ? "Perangkat Bluetooth" : name.trim();
        } catch (SecurityException ignored) {
            return "Perangkat Bluetooth";
        }
    }

    private int printerScore(BluetoothDevice device) {
        String name = deviceName(device).toUpperCase();
        int score = 0;
        if (name.contains("XANTRI")) score += 100;
        if (name.contains("BT-58") || name.contains("58D")) score += 80;
        if (name.contains("PRINTER") || name.contains("POS") || name.contains("RPP") || name.contains("MPT")) score += 40;
        if (device.getBondState() == BluetoothDevice.BOND_BONDED) score += 10;
        return score;
    }

    private boolean isBonded(String address) {
        if (!hasBluetoothPermission()) return false;
        try {
            BluetoothDevice device = adapter().getRemoteDevice(address);
            return device.getBondState() == BluetoothDevice.BOND_BONDED;
        } catch (Exception ignored) {
            return false;
        }
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private String message(Exception error) {
        String value = error.getMessage();
        return value == null || value.trim().isEmpty() ? error.getClass().getSimpleName() : value;
    }

    @Override
    protected void handleOnDestroy() {
        closeSocket();
        executor.shutdownNow();
        super.handleOnDestroy();
    }
}
