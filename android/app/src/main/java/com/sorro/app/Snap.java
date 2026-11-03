package com.sorro.app;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The one file the widgets and the web app both talk to.
 *
 * A Capacitor app's data lives in the WebView - IndexedDB, a React Query cache,
 * a Supabase session. A home-screen widget runs in the launcher's process and
 * can reach none of it, so the two halves meet here instead: SharedPreferences,
 * with the web app writing a snapshot of today and the widgets reading it.
 *
 * Traffic goes both ways.
 *
 *   out  lib/widget.ts serialises today's numbers -> {@code write} -> the
 *        widgets redraw. Pushed on change rather than polled, because
 *        updatePeriodMillis has a 30-minute floor and a cup of water that
 *        appears half an hour later is a bug you can feel.
 *
 *   in   a tap on the widget that needs no typing (a cup, a habit) is applied
 *        to the snapshot immediately so the widget answers in the same frame,
 *        and queued in {@code pending} for the app to replay through the real
 *        mutations next time it is open. That is the same shape as the offline
 *        queue in lib/offline.ts, which is what makes it safe: a write that has
 *        not reached Supabase yet is a state this app already lives in.
 */
final class Snap {
    private Snap() {}

    static final String PREFS = "sorro_widget";
    private static final String KEY_SNAP = "snapshot";
    private static final String KEY_PENDING = "pending";

    /** Every provider that draws from the snapshot. Adding one means adding it here. */
    private static final Class<?>[] PROVIDERS = {
        TodayWidget.class, QuickWidget.class, HabitsWidget.class,
    };

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Today's numbers, or an empty object before the app has ever run. */
    static JSONObject read(Context c) {
        try {
            return new JSONObject(prefs(c).getString(KEY_SNAP, "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static void write(Context c, String json) {
        prefs(c).edit().putString(KEY_SNAP, json).apply();
    }

    /**
     * Record a widget-side edit and hand back the snapshot to redraw from.
     *
     * The caller mutates the object it gets; this only owns the queueing and the
     * commit, so a tap is one round trip through here rather than three.
     *
     * ponytail: read-modify-write with no lock. Both callers are the main thread
     * of one process (the provider's onReceive and the plugin), so they cannot
     * interleave. Needs a lock the day anything touches this off-thread.
     */
    static synchronized void edit(Context c, JSONObject snap, JSONObject op) {
        try {
            JSONArray q = new JSONArray(prefs(c).getString(KEY_PENDING, "[]"));
            q.put(op);
            prefs(c).edit()
                .putString(KEY_SNAP, snap.toString())
                .putString(KEY_PENDING, q.toString())
                .apply();
        } catch (Exception e) {
            // A corrupt queue must not cost the tap. Start a fresh one.
            prefs(c).edit()
                .putString(KEY_SNAP, snap.toString())
                .putString(KEY_PENDING, new JSONArray().put(op).toString())
                .apply();
        }
    }

    /**
     * Hand the queued edits to the app and forget them.
     *
     * Read and clear together: whatever comes back is the app's problem now, and
     * the app puts it straight into a mutation that persists itself. The window
     * between the two is a single synchronous block - the process dying inside
     * it would lose a cup of water, which is the right thing to lose.
     */
    static synchronized String takePending(Context c) {
        String q = prefs(c).getString(KEY_PENDING, "[]");
        prefs(c).edit().putString(KEY_PENDING, "[]").apply();
        return q;
    }

    /** Redraw every widget of every kind that is actually on a home screen. */
    static void refresh(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (Class<?> provider : PROVIDERS) {
            int[] ids = m.getAppWidgetIds(new ComponentName(c, provider));
            if (ids == null || ids.length == 0) continue;

            // The list widget's rows come from a separate process-hosted adapter,
            // so redrawing the frame is not enough - the adapter has to be told
            // its data is stale or it serves the rows it already built.
            m.notifyAppWidgetViewDataChanged(ids, R.id.bd_habit_list);

            Intent i = new Intent(c, provider);
            i.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            c.sendBroadcast(i);
        }
    }
}
