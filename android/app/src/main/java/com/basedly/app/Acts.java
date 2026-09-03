package com.basedly.app;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * What a tap on a widget does.
 *
 * Two kinds, and the split is the whole design.
 *
 *   Something to type -> open the app at a deep link that lands on the surface
 *   already open. A widget has no keyboard, so an expense or a note was always
 *   going to become an app; the only question is whether it costs one tap or
 *   four. lib/widgetIntent.ts is the other end.
 *
 *   Nothing to type -> never open the app. A cup of water and a habit tick are
 *   a single bit each, and launching a WebView to set one bit is a second and a
 *   half of watching a splash screen. The provider handles the broadcast, the
 *   snapshot moves, the widget redraws, and the write waits in the queue for
 *   the next time the app is up anyway.
 */
final class Acts {
    private Acts() {}

    /** Broadcast action for the taps that stay on the home screen. */
    static final String TAP = "com.basedly.app.WIDGET_TAP";
    static final String EXTRA_OP = "bd_op";
    static final String EXTRA_ID = "bd_id";

    /** Scheme + host registered in AndroidManifest.xml, alongside the auth one. */
    private static final String LINK = "com.basedly.app://log?do=";

    /**
     * The calendar date, which is what a habit tick is filed under.
     * lib/habits.ts ymd().
     */
    static String today() {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
    }

    /**
     * The *lived* day, which turns at 04:00 and is what water and spend are
     * filed under. lib/logday.ts DAY_CUT_H, and it has to stay equal to it: a
     * widget that rolls over at midnight tells someone with a 01:20 glass in
     * their hand that they have drunk nothing today, while Fuel two taps away
     * still counts it as last night.
     */
    static String logDay() {
        long cut = System.currentTimeMillis() - 4L * 3600_000L;
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(cut));
    }

    /** An instant a queued cup can be replayed with, so the pace maths stays true. */
    static String nowIso() {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        f.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
        return f.format(new Date());
    }

    /**
     * FLAG_IMMUTABLE everywhere it can be. A widget's PendingIntent is handed to
     * the launcher, which is another app; a mutable one lets it rewrite the
     * intent's extras. The one exception is the list template below, which the
     * platform itself has to fill in per row.
     */
    private static int flags() {
        return PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
    }

    static int templateFlags() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;
    }

    /** Open the app at `com.basedly.app://log?do=<what>`. */
    static PendingIntent open(Context c, String what) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(LINK + what));
        i.setPackage(c.getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, what.hashCode(), i, flags());
    }

    /** Apply an edit on the spot, without waking the app. */
    static PendingIntent inPlace(Context c, Class<?> provider, String op) {
        Intent i = new Intent(c, provider).setAction(TAP).putExtra(EXTRA_OP, op);
        return PendingIntent.getBroadcast(c, op.hashCode(), i, flags());
    }

    /**
     * The four buttons, wired the same way in every widget that carries them.
     *
     * Water is the only one of the four with nothing to say, so it is the only
     * one that stays on the home screen. The other three are a keyboard away
     * from being useful, so they open the app rather than pretending otherwise.
     */
    static void wireActions(Context c, RemoteViews v, Class<?> provider) {
        v.setOnClickPendingIntent(R.id.bd_act_water, inPlace(c, provider, "water"));
        v.setOnClickPendingIntent(R.id.bd_act_task, open(c, "task"));
        v.setOnClickPendingIntent(R.id.bd_act_money, open(c, "money"));
        v.setOnClickPendingIntent(R.id.bd_act_note, open(c, "note"));
    }
}
