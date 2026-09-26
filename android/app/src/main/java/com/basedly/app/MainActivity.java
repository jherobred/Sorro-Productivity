package com.basedly.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // A plugin that lives in the app rather than in a package is not
        // discovered, so it has to be named. Before super.onCreate, which is
        // where the bridge is built.
        registerPlugin(WidgetBridge.class);
        registerPlugin(DisplayAwake.class);
        super.onCreate(savedInstanceState);
    }
}
