package com.sorro.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The habit list, tickable in place.
 *
 * A collection widget, so the rows come from HabitsService rather than from
 * here. The provider owns the frame, the count, and the one PendingIntent
 * template that every row fills in with its own habit id - a widget may hold
 * only a handful of PendingIntents, so a list cannot give each row its own.
 */
public class HabitsWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, build(c, id));
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        if (Acts.TAP.equals(intent.getAction())) {
            Widgets.apply(c, intent.getStringExtra(Acts.EXTRA_OP), intent.getStringExtra(Acts.EXTRA_ID));
            return;
        }
        super.onReceive(c, intent);
    }

    private static RemoteViews build(Context c, int widgetId) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.bd_widget_habits);
        JSONObject s = Snap.read(c);
        JSONArray habits = s.optJSONArray("habits");
        int all = habits == null ? 0 : habits.length();

        v.setTextViewText(R.id.bd_habits_count, all > 0 ? Widgets.doneToday(s) + "/" + all : "");
        v.setViewVisibility(R.id.bd_habit_list, all > 0 ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.bd_habits_empty, all > 0 ? View.GONE : View.VISIBLE);

        // ponytail: setRemoteAdapter(Intent) + a RemoteViewsService, deprecated
        // since API 31 in favour of pushing a RemoteCollectionItems list inline.
        // minSdk is 24, so the service is needed regardless; swap in the newer
        // call behind a version check if the launcher round trip ever shows.
        Intent data = new Intent(c, HabitsService.class);
        // The adapter is cached per Intent, and two widgets of this kind would
        // otherwise share one. The id in the URI is what keeps them apart.
        data.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        data.setData(android.net.Uri.parse(data.toUri(Intent.URI_INTENT_SCHEME)));
        v.setRemoteAdapter(R.id.bd_habit_list, data);
        v.setEmptyView(R.id.bd_habit_list, R.id.bd_habits_empty);

        Intent tap = new Intent(c, HabitsWidget.class)
            .setAction(Acts.TAP)
            .putExtra(Acts.EXTRA_OP, "habit");
        v.setPendingIntentTemplate(R.id.bd_habit_list,
            PendingIntent.getBroadcast(c, 0, tap, Acts.templateFlags()));

        v.setOnClickPendingIntent(R.id.bd_open_habits, Acts.open(c, "habits"));
        return v;
    }
}
