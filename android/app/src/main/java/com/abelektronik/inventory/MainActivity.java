package com.abelektronik.inventory;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ABFileSaverPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
