package com.basedly.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** The 4x2. Today's shape, three numbers, and the row that logs. */
public class TodayWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, build(c));
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        if (Acts.TAP.equals(intent.getAction())) {
            Widgets.apply(c, intent.getStringExtra(Acts.EXTRA_OP), intent.getStringExtra(Acts.EXTRA_ID));
            return;
        }
        super.onReceive(c, intent);
    }

    static RemoteViews build(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.bd_widget_today);
        JSONObject s = Snap.read(c);

        v.setTextViewText(R.id.bd_date,
            new SimpleDateFormat("EEEE, MMM d", Locale.getDefault()).format(new Date()).toUpperCase(Locale.getDefault()));

        // Everything day-scoped is yesterday's once the date rolls, and the app
        // may not have been opened since. Reading zero is honest; reading eight
        // cups you did not drink is not. Open tasks carry over, so they are the
        // one number here that survives the rollover.
        boolean sameDay = Widgets.isToday(s);
        boolean sameLogDay = Widgets.isLogToday(s);
        int water = sameLogDay ? s.optInt("water", 0) : 0;
        int goal = Math.max(1, s.optInt("waterGoal", 10));
        int habitsDone = sameDay ? s.optInt("habitsDone", 0) : 0;
        int habitsAll = s.optInt("habitsAll", 0);

        v.setTextViewText(R.id.bd_tasks_n, String.valueOf(s.optInt("tasksOpen", 0)));
        v.setTextViewText(R.id.bd_water_n, water + "/" + goal);
        v.setTextViewText(R.id.bd_spent_n, sameLogDay ? s.optString("spent", "--") : "--");

        // One bar for the whole day: the habits ticked and the water drunk, which
        // are the two things on this widget you can actually move from it.
        int total = habitsAll + goal;
        int done = Math.min(habitsDone, habitsAll) + Math.min(water, goal);
        v.setProgressBar(R.id.bd_bar, 100, total > 0 ? done * 100 / total : 0, false);
        v.setTextViewText(R.id.bd_done, habitsAll > 0 ? habitsDone + "/" + habitsAll + " habits" : "");

        v.setOnClickPendingIntent(R.id.bd_open_home, Acts.open(c, "home"));
        // Each number goes back where it came from. A stat you cannot follow is
        // a stat you have to go and look up, which is the app opening anyway.
        v.setOnClickPendingIntent(R.id.bd_go_tasks, Acts.open(c, "tasks"));
        v.setOnClickPendingIntent(R.id.bd_go_water, Acts.open(c, "fuel"));
        v.setOnClickPendingIntent(R.id.bd_go_spent, Acts.open(c, "money"));
        Acts.wireActions(c, v, TodayWidget.class);
        return v;
    }
}
