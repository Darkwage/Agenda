package com.arwin.agenda;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.Bundle;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Locale;

/**
 * Home screen widget showing the schedule for a single day as a real
 * hand-drawn mini calendar (hour grid, colored task blocks positioned by
 * time, a live "now" line, and a progress fill for the task in progress) -
 * plus previous/next-day navigation buttons.
 *
 * RemoteViews (the mechanism every Android widget uses) only allows a small
 * whitelist of view types - no way to lay out absolutely-positioned colored
 * blocks directly. The standard, well-established workaround (used by many
 * calendar/weather widgets) is to draw the whole visual onto a Bitmap with
 * Canvas and display that single Bitmap inside an ImageView, which IS on
 * the whitelist. That is what this class does.
 *
 * Task data is written by the web app (via the @capacitor/preferences
 * plugin) into the "CapacitorStorage" SharedPreferences file, under the key
 * "agenda_widget_tasks" as a JSON array (each item already carries its
 * resolved category color, added at sync time by the web app). This
 * provider reads that same file directly - no network calls, works fully
 * offline.
 */
public class AgendaWidgetProvider extends AppWidgetProvider {

    public static final String ACTION_PREV_DAY = "com.arwin.agenda.ACTION_PREV_DAY";
    public static final String ACTION_NEXT_DAY = "com.arwin.agenda.ACTION_NEXT_DAY";

    private static final String CAPACITOR_PREFS = "CapacitorStorage";
    private static final String TASKS_KEY = "agenda_widget_tasks";
    private static final String WIDGET_STATE_PREFS = "agenda_widget_state";

    private static final int HOUR_START = 6;
    private static final int HOUR_END = 22;

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager appWidgetManager, int appWidgetId, Bundle newOptions) {
        // The user resized the widget - redraw the bitmap at the new size.
        updateWidget(context, appWidgetManager, appWidgetId);
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
            updateWidget(context, AppWidgetManager.getInstance(context), appWidgetId);
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
        try {
            buildAndPushWidget(context, appWidgetManager, appWidgetId);
        } catch (Exception e) {
            // Whatever went wrong (malformed data, a device quirk...), never
            // leave the widget on the system's ugly "problem loading widget"
            // screen - fall back to a minimal, always-safe view instead.
            RemoteViews fallback = new RemoteViews(context.getPackageName(), R.layout.agenda_widget);
            fallback.setTextViewText(R.id.tv_date, "Agenda");
            fallback.setViewVisibility(R.id.tv_allday, android.view.View.GONE);
            Intent openAppIntent = new Intent(context, MainActivity.class);
            PendingIntent openAppPending = PendingIntent.getActivity(
                    context, appWidgetId, openAppIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            fallback.setOnClickPendingIntent(R.id.tv_date, openAppPending);
            appWidgetManager.updateAppWidget(appWidgetId, fallback);
        }
    }

    private void buildAndPushWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.agenda_widget);

        SharedPreferences state = context.getSharedPreferences(WIDGET_STATE_PREFS, Context.MODE_PRIVATE);
        int offset = state.getInt("offset_" + appWidgetId, 0);

        Calendar cal = Calendar.getInstance();
        cal.add(Calendar.DAY_OF_YEAR, offset);
        SimpleDateFormat isoFormat = new SimpleDateFormat("yyyy-MM-dd", Locale.FRANCE);
        String targetDateStr = isoFormat.format(cal.getTime());
        boolean isRealToday = (offset == 0);

        views.setTextViewText(R.id.tv_date, dateLabel(offset, cal));
        views.setOnClickPendingIntent(R.id.btn_prev, buildActionIntent(context, ACTION_PREV_DAY, appWidgetId));
        views.setOnClickPendingIntent(R.id.btn_next, buildActionIntent(context, ACTION_NEXT_DAY, appWidgetId));

        Intent openAppIntent = new Intent(context, MainActivity.class);
        PendingIntent openAppPending = PendingIntent.getActivity(
                context, appWidgetId, openAppIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.tv_date, openAppPending);

        ArrayList<TaskInfo> all = readTasksForDate(context, targetDateStr, isRealToday);
        ArrayList<TaskInfo> timed = new ArrayList<>();
        ArrayList<TaskInfo> allDay = new ArrayList<>();
        for (TaskInfo t : all) { if (t.time.isEmpty()) allDay.add(t); else timed.add(t); }

        if (allDay.isEmpty()) {
            views.setViewVisibility(R.id.tv_allday, android.view.View.GONE);
        } else {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < allDay.size() && i < 3; i++) {
                if (i > 0) sb.append("  ·  ");
                sb.append(allDay.get(i).title);
            }
            views.setTextViewText(R.id.tv_allday, sb.toString());
            views.setViewVisibility(R.id.tv_allday, android.view.View.VISIBLE);
        }

        float density = context.getResources().getDisplayMetrics().density;
        Bundle options = appWidgetManager.getAppWidgetOptions(appWidgetId);
        int widthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
        int heightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 180);
        int reservedDp = 44 + (allDay.isEmpty() ? 0 : 18) + 20; // header + all-day line + padding
        int widthPx = Math.max(220, Math.round((widthDp - 20) * density));
        int heightPx = Math.max(140, Math.round(Math.max(90, heightDp - reservedDp) * density));

        Bitmap bmp = drawTimeline(timed, widthPx, heightPx, density, isRealToday);
        views.setImageViewBitmap(R.id.iv_timeline, bmp);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    /* ================================================================
       Canvas-drawn timeline
    ================================================================= */
    private Bitmap drawTimeline(ArrayList<TaskInfo> timed, int widthPx, int heightPx, float density, boolean isRealToday) {
        Bitmap bmp = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        canvas.drawColor(Color.TRANSPARENT);

        int totalMinutes = (HOUR_END - HOUR_START) * 60;
        float gutterWidth = 30 * density;
        float trackLeft = gutterWidth;
        float trackRight = widthPx;
        float trackWidth = Math.max(1, trackRight - trackLeft);
        int hourCount = HOUR_END - HOUR_START;
        float rowHeight = (float) heightPx / hourCount;

        Paint gridPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        gridPaint.setColor(Color.parseColor("#EAE5D8"));
        gridPaint.setStrokeWidth(1f);

        Paint hourTextPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        hourTextPaint.setColor(Color.parseColor("#9B9C96"));
        hourTextPaint.setTextSize(8.5f * density);
        hourTextPaint.setTextAlign(Paint.Align.RIGHT);

        for (int h = 0; h <= hourCount; h++) {
            float y = h * rowHeight;
            canvas.drawLine(trackLeft, y, trackRight, y, gridPaint);
            if (h < hourCount) {
                canvas.drawText((HOUR_START + h) + "h", gutterWidth - 4 * density, y + 10 * density, hourTextPaint);
            }
        }

        assignColumns(timed);

        Paint blockPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        Paint titlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        titlePaint.setColor(Color.parseColor("#21252C"));
        titlePaint.setTextSize(10 * density);
        titlePaint.setFakeBoldText(true);
        Paint timePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        timePaint.setColor(Color.parseColor("#5B5F66"));
        timePaint.setTextSize(8.5f * density);

        for (TaskInfo t : timed) {
            float top = ((t.startMin - HOUR_START * 60) / (float) totalMinutes) * heightPx;
            float bottom = ((t.startMin + t.duration - HOUR_START * 60) / (float) totalMinutes) * heightPx;
            bottom = Math.max(bottom, top + 16 * density);
            bottom = Math.min(bottom, heightPx);

            float colWidth = trackWidth / t.totalCols;
            float left = trackLeft + t.col * colWidth + 2 * density;
            float right = left + colWidth - 4 * density;
            if (right <= left) right = left + 4 * density;

            int baseColor;
            try { baseColor = Color.parseColor(t.color); } catch (Exception e) { baseColor = Color.parseColor("#2F5D50"); }
            int softColor = mixWithWhite(baseColor, 0.82f);

            RectF rect = new RectF(left, top, right, bottom);
            blockPaint.setColor(softColor);
            canvas.drawRoundRect(rect, 5 * density, 5 * density, blockPaint);

            // Progress fill for the task currently in progress: a deeper
            // tint rising from the bottom, like a battery/loading fill.
            if (t.progressPct >= 0) {
                float progH = (bottom - top) * (t.progressPct / 100f);
                Paint progPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
                progPaint.setColor(mixWithWhite(baseColor, 0.55f));
                RectF progRect = new RectF(left, Math.max(top, bottom - progH), right, bottom);
                canvas.drawRoundRect(progRect, 5 * density, 5 * density, progPaint);
            }

            // Left accent strip (drawn last so it stays on top of the fill)
            blockPaint.setColor(baseColor);
            canvas.drawRect(left, top, left + 3 * density, bottom, blockPaint);

            canvas.save();
            canvas.clipRect(rect);
            float textX = left + 6 * density;
            float textY = top + 12 * density;
            String title = ellipsize(t.title, titlePaint, right - textX - 4 * density);
            canvas.drawText(title, textX, textY, titlePaint);
            if (bottom - top > 24 * density) {
                canvas.drawText(t.time, textX, textY + 11 * density, timePaint);
            }
            canvas.restore();
        }

        if (isRealToday) {
            Calendar now = Calendar.getInstance();
            int nowMin = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
            if (nowMin >= HOUR_START * 60 && nowMin <= HOUR_END * 60) {
                float y = ((nowMin - HOUR_START * 60) / (float) totalMinutes) * heightPx;
                Paint nowPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
                nowPaint.setColor(Color.parseColor("#C1495A"));
                nowPaint.setStrokeWidth(2 * density);
                canvas.drawLine(trackLeft, y, trackRight, y, nowPaint);
                canvas.drawCircle(trackLeft, y, 3 * density, nowPaint);
            }
        }

        return bmp;
    }

    /** Greedy column packing so overlapping tasks sit side by side instead of stacking on top of each other. */
    private void assignColumns(ArrayList<TaskInfo> timed) {
        java.util.Collections.sort(timed, (a, b) -> a.startMin - b.startMin);
        ArrayList<Integer> colEnds = new ArrayList<>();
        for (TaskInfo t : timed) {
            int placedCol = -1;
            for (int i = 0; i < colEnds.size(); i++) {
                if (colEnds.get(i) <= t.startMin) { placedCol = i; break; }
            }
            if (placedCol == -1) { colEnds.add(t.startMin + t.duration); placedCol = colEnds.size() - 1; }
            else { colEnds.set(placedCol, t.startMin + t.duration); }
            t.col = placedCol;
        }
        int totalCols = Math.max(1, colEnds.size());
        for (TaskInfo t : timed) t.totalCols = totalCols;
    }

    private String ellipsize(String text, Paint paint, float maxWidth){
        if (paint.measureText(text) <= maxWidth) return text;
        String ellipsis = "…";
        int lo = 0, hi = text.length();
        while (lo < hi) {
            int mid = (lo + hi + 1) / 2;
            if (paint.measureText(text.substring(0, mid) + ellipsis) <= maxWidth) lo = mid; else hi = mid - 1;
        }
        return lo <= 0 ? ellipsis : text.substring(0, lo) + ellipsis;
    }

    private int mixWithWhite(int color, float whiteRatio){
        int r = Math.round(Color.red(color) * (1 - whiteRatio) + 255 * whiteRatio);
        int g = Math.round(Color.green(color) * (1 - whiteRatio) + 255 * whiteRatio);
        int b = Math.round(Color.blue(color) * (1 - whiteRatio) + 255 * whiteRatio);
        return Color.rgb(r, g, b);
    }

    private PendingIntent buildActionIntent(Context context, String action, int appWidgetId) {
        Intent intent = new Intent(context, AgendaWidgetProvider.class);
        intent.setAction(action);
        intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId);
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

    /** Plain data holder for one task, read from the JSON blob written by the web app. */
    private static class TaskInfo {
        String title, time, color;
        int duration, startMin;
        int progressPct = -1; // 0-100 while in progress, -1 otherwise
        int col = 0, totalCols = 1;
    }

    private ArrayList<TaskInfo> readTasksForDate(Context context, String dateStr, boolean isRealToday) {
        ArrayList<TaskInfo> result = new ArrayList<>();
        SharedPreferences prefs = context.getSharedPreferences(CAPACITOR_PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(TASKS_KEY, null);
        if (raw == null) return result;

        Calendar nowCal = Calendar.getInstance();
        int nowMinutes = nowCal.get(Calendar.HOUR_OF_DAY) * 60 + nowCal.get(Calendar.MINUTE);

        try {
            JSONArray all = new JSONArray(raw);
            for (int i = 0; i < all.length(); i++) {
                JSONObject t = all.getJSONObject(i);
                if (!dateStr.equals(t.optString("date", ""))) continue;
                if (t.optBoolean("done", false)) continue;

                TaskInfo info = new TaskInfo();
                info.title = t.optString("title", "");
                info.time = t.optString("time", "");
                info.duration = t.optInt("duration", 0);
                info.color = t.optString("color", "#2F5D50");
                if (!info.time.isEmpty()) {
                    try {
                        String[] hm = info.time.split(":");
                        info.startMin = Integer.parseInt(hm[0]) * 60 + Integer.parseInt(hm[1]);
                        if (isRealToday && info.duration > 0) {
                            int endMin = info.startMin + info.duration;
                            if (nowMinutes >= info.startMin && nowMinutes < endMin) {
                                info.progressPct = Math.round(((float) (nowMinutes - info.startMin) / info.duration) * 100);
                            }
                        }
                    } catch (Exception ignored) { info.time = ""; }
                }
                result.add(info);
            }
        } catch (Exception e) {
            // malformed / not-yet-synced data: show nothing rather than crash
        }
        return result;
    }
}
