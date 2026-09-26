package com.basedly.app;

import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Keep the display awake only for the explicitly enabled countdown view. */
@CapacitorPlugin(name = "DisplayAwake")
public class DisplayAwake extends Plugin {
    private boolean requested = false;

    private void apply(boolean enabled) {
        getActivity().runOnUiThread(() -> {
            if (enabled) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        requested = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        apply(requested);
        call.resolve();
    }

    @Override protected void handleOnPause() { apply(false); }
    @Override protected void handleOnResume() { apply(requested); }
    @Override protected void handleOnDestroy() { requested = false; apply(false); }
}
