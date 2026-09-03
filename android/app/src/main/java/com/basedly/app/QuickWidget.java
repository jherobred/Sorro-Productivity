package com.basedly.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/**
 * The 4x1. Nothing but the four buttons.
 *
 * It reads nothing from the snapshot, which is the point: this is the strip you
 * put on the home screen you already use, under whatever is already there, and
 * it has no state to be wrong about.
 */
public class QuickWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.bd_widget_quick);
        Acts.wireActions(c, v, QuickWidget.class);
        for (int id : ids) m.updateAppWidget(id, v);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        if (Acts.TAP.equals(intent.getAction())) {
            Widgets.apply(c, intent.getStringExtra(Acts.EXTRA_OP), intent.getStringExtra(Acts.EXTRA_ID));
            return;
        }
        super.onReceive(c, intent);
    }
}
