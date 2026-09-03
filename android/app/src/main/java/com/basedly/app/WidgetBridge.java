package com.basedly.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Two methods, which is all the web app needs to own its widgets.
 *
 * Registered from MainActivity, not published as a package - a plugin that
 * exists to move one JSON string between this app's WebView and this app's
 * widgets has nothing to share with anyone else. See lib/widget.ts.
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridge extends Plugin {

    /** Replace the snapshot and redraw everything that draws from it. */
    @PluginMethod
    public void push(PluginCall call) {
        String json = call.getString("snapshot");
        if (json == null) {
            call.reject("snapshot required");
            return;
        }
        Snap.write(getContext(), json);
        Snap.refresh(getContext());
        call.resolve();
    }

    /**
     * Hand over the taps made while the app was closed, and clear them.
     *
     * Returns a JSON string rather than a JSArray so the queue crosses the
     * bridge exactly as it was stored, and so the parse - and any failure of it
     * - happens on the side that knows the op shapes.
     */
    @PluginMethod
    public void takePending(PluginCall call) {
        JSObject out = new JSObject();
        out.put("ops", Snap.takePending(getContext()));
        call.resolve(out);
    }
}
