package com.basedly.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

/** Feeds the habit rows to the launcher. Reads the snapshot, nothing else. */
public class HabitsService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Rows(getApplicationContext());
    }

    private static class Rows implements RemoteViewsService.RemoteViewsFactory {
        private final Context c;
        private JSONArray habits = new JSONArray();
        private boolean fresh;

        Rows(Context c) { this.c = c; }

        @Override public void onCreate() {}

        /**
         * Called on every notifyAppWidgetViewDataChanged, and it is the only
         * chance to read: getViewAt runs per row and must not touch disk.
         */
        @Override public void onDataSetChanged() {
            JSONObject s = Snap.read(c);
            JSONArray a = s.optJSONArray("habits");
            habits = a == null ? new JSONArray() : a;
            fresh = Widgets.isToday(s);
        }

        @Override public void onDestroy() { habits = new JSONArray(); }

        @Override public int getCount() { return habits.length(); }

        @Override public RemoteViews getViewAt(int i) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.bd_habit_row);
            JSONObject h = habits.optJSONObject(i);
            if (h == null) return v;

            boolean done = fresh && h.optBoolean("done", false);
            int streak = fresh ? h.optInt("streak", 0) : Math.max(0, h.optInt("streak", 0) - 1);

            v.setTextViewText(R.id.bd_row_name, h.optString("name", ""));
            v.setTextViewText(R.id.bd_row_streak, streak > 0 ? streak + "d" : "");
            v.setImageViewResource(R.id.bd_row_dot, done ? R.drawable.bd_dot_on : R.drawable.bd_dot_off);

            // The habit's own colour, chosen in the app, applied here. A tinted
            // shared drawable beats a drawable per colour, and setColorFilter is
            // the one tint RemoteViews has had since long before API 31.
            int hue = parseHue(h.optString("color", ""));
            if (done) {
                v.setInt(R.id.bd_row_dot, "setColorFilter", hue);
                v.setTextColor(R.id.bd_row_name, 0xFFEFEDF5);
                v.setTextColor(R.id.bd_row_streak, hue);
            } else {
                v.setInt(R.id.bd_row_dot, "setColorFilter", 0xFF332F42);
                v.setTextColor(R.id.bd_row_name, 0xFFA29EBB);
                v.setTextColor(R.id.bd_row_streak, 0xFF78748F);
            }

            v.setOnClickFillInIntent(R.id.bd_row,
                new Intent().putExtra(Acts.EXTRA_ID, h.optString("id", "")));
            return v;
        }

        private static int parseHue(String hex) {
            try {
                return Color.parseColor(hex);
            } catch (Exception e) {
                return 0xFFFF6B6B; // SECHUE.habits
            }
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int i) { return i; }
        @Override public boolean hasStableIds() { return false; }
    }
}
