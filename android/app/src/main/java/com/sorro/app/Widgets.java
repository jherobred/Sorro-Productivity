package com.sorro.app;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The in-place edits, in one place.
 *
 * All three providers route their taps through here rather than each handling
 * its own, so a cup logged from the 4x1 and a cup logged from the 4x2 are the
 * same cup, queued the same way, and there is one function to get right.
 *
 * Two clocks, because the app has two. A habit belongs to a calendar date; a
 * cup of water and a peso belong to the lived day, which turns at 04:00. Both
 * are checked, so a snapshot written yesterday goes stale one field at a time
 * rather than all at once at the wrong hour.
 */
final class Widgets {
    private Widgets() {}

    /** Whether the snapshot's habit ticks still describe today. */
    static boolean isToday(JSONObject snap) {
        return Acts.today().equals(snap.optString("date", ""));
    }

    /** Whether its water and spend still do. */
    static boolean isLogToday(JSONObject snap) {
        return Acts.logDay().equals(snap.optString("logDay", ""));
    }

    /**
     * Move the snapshot, queue the write, redraw.
     *
     * The queued op carries its own timestamp rather than borrowing one from the
     * snapshot: a cup tapped at 09:00 and replayed at 18:00 has to arrive with
     * 09:00 on it, or the over-drinking warning in lib/hydration.ts sees a
     * day's water land inside one rolling hour and fires on the wrong person.
     */
    static void apply(Context c, String op, String id) {
        if (op == null) return;
        JSONObject s = Snap.read(c);

        try {
            JSONObject queued = new JSONObject().put("op", op);

            if ("water".equals(op)) {
                boolean fresh = isLogToday(s);
                s.put("water", (fresh ? s.optInt("water", 0) : 0) + 1);
                s.put("logDay", Acts.logDay());
                queued.put("at", Acts.nowIso());
            } else if ("habit".equals(op) && id != null) {
                boolean fresh = isToday(s);
                // A tick is a toggle at both ends - lib/habits.ts tick() flips
                // today's row rather than setting it - so two taps here replay
                // as two flips and land back where they started, which is what
                // the person who tapped twice meant.
                JSONArray habits = s.optJSONArray("habits");
                if (habits == null) return;
                boolean hit = false;
                for (int i = 0; i < habits.length(); i++) {
                    JSONObject h = habits.optJSONObject(i);
                    if (h == null || !id.equals(h.optString("id"))) continue;
                    boolean was = fresh && h.optBoolean("done", false);
                    h.put("done", !was);
                    // The streak on the row is the reason to tap it, so it has to
                    // move with the dot. Only ever by the one day this tick is.
                    h.put("streak", Math.max(0, h.optInt("streak", 0) + (was ? -1 : 1)));
                    s.put("habitsDone", Math.max(0, (fresh ? s.optInt("habitsDone", 0) : 0) + (was ? -1 : 1)));
                    hit = true;
                    break;
                }
                if (!hit) return;
                // A tap on a stale snapshot is also the moment it stops being
                // stale: the counters above were just re-based onto today, so
                // the date has to follow them or the next tap re-bases again.
                s.put("date", Acts.today());
                queued.put("id", id).put("date", Acts.today());
            } else {
                return;
            }

            Snap.edit(c, s, queued);
            Snap.refresh(c);
        } catch (Exception e) {
            // A malformed snapshot is recoverable - the app rewrites it whole on
            // its next run. Swallowing beats crashing the launcher's host.
        }
    }

    /** Ticked habits, honouring a stale snapshot the same way the widgets do. */
    static int doneToday(JSONObject snap) {
        return isToday(snap) ? snap.optInt("habitsDone", 0) : 0;
    }
}
