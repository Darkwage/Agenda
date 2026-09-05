package com.arwin.agenda;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Locale;

/**
 * Home screen widget showing the schedule for a single day, with
 * previous/next-day navigation buttons. Task data is written by the web
 * app (via the @capacitor/preferences plugin) into the "CapacitorStorage"
 * SharedPreferences file, under the key "agenda_widget_tasks" as a JSON
 * array. This provider reads that same file directly - no network calls,
 * works fully offline.
 */
public class AgendaWidgetProvider extends AppWidgetProvider {

    public static final String ACTION_PREV_DAY = "com.arwin.agenda.ACTION_PREV_DAY";
    public static final String ACTION_NEXT_DAY = "com.arwin.agenda.ACTION_NEXT_DAY";

    private static final String CAPACITOR_PREFS = "CapacitorStorage";
    private static final String TASKS_KEY = "agenda_widget_tasks";
    private static final String WIDGET_STATE_PREFS = "agenda_widget_state";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        int appWidgetId = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return;

        if (ACTION_PREV_DAY.equals(action) || ACTION_NEXT_DAY.equals(action)) {
            int delta = ACTION_PREV_DAY.equals(action) ? -1 : 1;
            SharedPreferences state = context.getSharedPreferences(WIDGET_STATE_PREFS, Context.MODE_PRIVATE);
            int offset = state.getInt("offset_" + appWidgetId, 0) + delta;
            state.edit().putInt("offset_" + appWidgetId, offset).apply();

            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            updateWidget(context, manager, appWidgetId);
        }
    }

    @Override
    public void onDeleted(Context context, int[] appWidgetIds) {
        SharedPreferences state = context.getSharedPreferences(WIDGET_STATE_PREFS, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = state.edit();
        for (int id : appWidgetIds) editor.remove("offset_" + id);
        editor.apply();
    }

    private void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.agenda_widget);

        SharedPreferences state = context.getSharedPreferences(WIDGET_STATE_PREFS, Context.MODE_PRIVATE);
        int offset = state.getInt("offset_" + appWidgetId, 0);

        Calendar cal = Calendar.getInstance();
        cal.add(Calendar.DAY_OF_YEAR, offset);
        SimpleDateFormat isoFormat = new SimpleDateFormat("yyyy-MM-dd", Locale.FRANCE);
        String targetDateStr = isoFormat.format(cal.getTime());

        views.setTextViewText(R.id.tv_date, dateLabel(offset, cal));

        // --- Wire up prev/next buttons ---
        views.setOnClickPendingIntent(R.id.btn_prev, buildActionIntent(context, ACTION_PREV_DAY, appWidgetId));
        views.setOnClickPendingIntent(R.id.btn_next, buildActionIntent(context, ACTION_NEXT_DAY, appWidgetId));

        // --- Tapping the date opens the app ---
        Intent openAppIntent = new Intent(context, MainActivity.class);
        PendingIntent openAppPending = PendingIntent.getActivity(
                context, appWidgetId, openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.tv_date, openAppPending);

        // --- Read & display tasks for the target date ---
        ArrayList<TaskLine> lines = readTaskLinesForDate(context, targetDateStr);
        int[] taskViewIds = { R.id.tv_task_1, R.id.tv_task_2, R.id.tv_task_3, R.id.tv_task_4, R.id.tv_task_5 };
        int[] progressViewIds = { R.id.pb_task_1, R.id.pb_task_2, R.id.pb_task_3, R.id.pb_task_4, R.id.pb_task_5 };

        if (lines.isEmpty()) {
            views.setViewVisibility(R.id.tv_empty, android.view.View.VISIBLE);
        } else {
            views.setViewVisibility(R.id.tv_empty, android.view.View.GONE);
        }

        // The progress bar always reflects how far along the current task is,
        // regardless of any "silence alerts" preference - that setting only
        // controls sound/notifications in the phone app, never this bar.
        for (int i = 0; i < taskViewIds.length; i++) {
            if (i < lines.size()) {
                TaskLine line = lines.get(i);
                views.setTextViewText(taskViewIds[i], line.text);
                views.setViewVisibility(taskViewIds[i], android.view.View.VISIBLE);
                if (line.progress >= 0) {
                    views.setProgressBar(progressViewIds[i], 100, line.progress, false);
                    views.setViewVisibility(progressViewIds[i], android.view.View.VISIBLE);
                } else {
                    views.setViewVisibility(progressViewIds[i], android.view.View.GONE);
                }
            } else {
                views.setViewVisibility(taskViewIds[i], android.view.View.GONE);
                views.setViewVisibility(progressViewIds[i], android.view.View.GONE);
            }
        }

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    private PendingIntent buildActionIntent(Context context, String action, int appWidgetId) {
        Intent intent = new Intent(context, AgendaWidgetProvider.class);
        intent.setAction(action);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
        // unique request code per widget+action so PendingIntents don't collide
        int requestCode = appWidgetId * 10 + (ACTION_PREV_DAY.equals(action) ? 1 : 2);
        return PendingIntent.getBroadcast(
                context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private String dateLabel(int offset, Calendar cal) {
        if (offset == 0) return "Aujourd'hui";
        if (offset == 1) return "Demain";
        if (offset == -1) return "Hier";
        SimpleDateFormat fmt = new SimpleDateFormat("EEE d MMM", Locale.FRENCH);
        String label = fmt.format(cal.getTime());
        if (label.length() > 0) label = Character.toUpperCase(label.charAt(0)) + label.substring(1);
        return label;
    }

    /** A single rendered line for the widget, with optional live progress (0-100, or -1 if not currently active). */
    private static class TaskLine {
        String text;
        int progress;
        TaskLine(String text, int progress) { this.text = text; this.progress = progress; }
    }

    private ArrayList<TaskLine> readTaskLinesForDate(Context context, String dateStr) {
        ArrayList<TaskLine> result = new ArrayList<>();
        SharedPreferences prefs = context.getSharedPreferences(CAPACITOR_PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(TASKS_KEY, null);
        if (raw == null) return result;

        // Progress only makes sense when looking at the real, actual today -
        // not just whatever day offset the widget currently shows.
        SimpleDateFormat isoFormat = new SimpleDateFormat("yyyy-MM-dd", Locale.FRANCE);
        boolean isRealToday = dateStr.equals(isoFormat.format(Calendar.getInstance().getTime()));
        Calendar nowCal = Calendar.getInstance();
        int nowMinutes = nowCal.get(Calendar.HOUR_OF_DAY) * 60 + nowCal.get(Calendar.MINUTE);

        try {
            JSONArray all = new JSONArray(raw);
            ArrayList<JSONObject> matches = new ArrayList<>();
            for (int i = 0; i < all.length(); i++) {
                JSONObject t = all.getJSONObject(i);
                if (dateStr.equals(t.optString("date", ""))) {
                    matches.add(t);
                }
            }
            // sort: tasks with a time first (chronological), all-day tasks last
            matches.sort((a, b) -> {
                String ta = a.optString("time", "");
                String tb = b.optString("time", "");
                if (ta.isEmpty() && tb.isEmpty()) return 0;
                if (ta.isEmpty()) return 1;
                if (tb.isEmpty()) return -1;
                return ta.compareTo(tb);
            });

            for (JSONObject t : matches) {
                String time = t.optString("time", "");
                String title = t.optString("title", "");
                boolean done = t.optBoolean("done", false);
                int duration = t.optInt("duration", 0);
                String prefix = time.isEmpty() ? "· " : (time + " · ");
                String line = prefix + title;
                if (done) line = "✓ " + line;

                int progress = -1;
                if (isRealToday && !done && !time.isEmpty() && duration > 0) {
                    try {
                        String[] hm = time.split(":");
                        int startMin = Integer.parseInt(hm[0]) * 60 + Integer.parseInt(hm[1]);
                        int endMin = startMin + duration;
                        if (nowMinutes >= startMin && nowMinutes < endMin) {
                            progress = Math.round(((float) (nowMinutes - startMin) / duration) * 100);
                        }
                    } catch (Exception ignored) {}
                }
                result.add(new TaskLine(line, progress));
            }
        } catch (Exception e) {
            // malformed / not-yet-synced data: show nothing rather than crash
        }
        return result;
    }
}
