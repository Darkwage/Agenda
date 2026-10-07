package com.arwin.agenda;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.widget.RemoteViews;

import java.util.ArrayList;
import java.util.Calendar;

/**
 * Widget « Liste » : les prochaines tâches non terminées (aujourd'hui et après),
 * autant que la hauteur du widget en permet — agrandis-le pour en voir plus.
 */
public class AgendaListWidgetProvider extends BaseAgendaProvider {

    @Override protected String prefix() { return "list"; }
    @Override protected int layoutRes() { return R.layout.widget_list; }
    @Override protected boolean hasNav() { return false; }

    @Override
    protected RemoteViews build(Context ctx, AppWidgetManager mgr, int id, int offset) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), layoutRes());

        Calendar today = Calendar.getInstance();
        String todayIso = AgendaWidgetCommon.iso(today);
        ArrayList<AgendaWidgetCommon.Task> upcoming = new ArrayList<>();
        for (AgendaWidgetCommon.Task t : AgendaWidgetCommon.readAll(ctx)) {
            if (t.date.compareTo(todayIso) >= 0 && !t.done) upcoming.add(t);
        }

        int n = upcoming.size();
        String label = n == 0 ? "RIEN À VENIR" : (n > 99 ? "99+" : String.valueOf(n)) + " À VENIR";
        wireHeader(ctx, v, id, label, "Prochainement", 0);
        v.setOnClickPendingIntent(R.id.btn_add, AgendaWidgetCommon.openApp(ctx, id));

        int[] size = AgendaWidgetCommon.bodySizePx(ctx, mgr, id);
        float density = ctx.getResources().getDisplayMetrics().density;
        v.setImageViewBitmap(R.id.iv_body, draw(upcoming, today, size[0], size[1], density));
        return v;
    }

    private Bitmap draw(ArrayList<AgendaWidgetCommon.Task> items, Calendar today, int w, int h, float dn) {
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);

        Paint fill = AgendaWidgetCommon.paint(Color.WHITE);
        Paint stroke = AgendaWidgetCommon.paint(AgendaWidgetCommon.BORDER);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(dn);
        RectF card = new RectF(dn * 0.5f, dn * 0.5f, w - dn * 0.5f, h - dn * 0.5f);
        c.drawRoundRect(card, 14 * dn, 14 * dn, fill);
        c.drawRoundRect(card, 14 * dn, 14 * dn, stroke);

        if (items.isEmpty()) {
            Paint empty = AgendaWidgetCommon.paint(AgendaWidgetCommon.MUTED);
            empty.setTypeface(AgendaWidgetCommon.SERIF_BOLD);
            empty.setTextSize(15 * dn);
            empty.setTextAlign(Paint.Align.CENTER);
            c.drawText("Aucune tâche à venir", w / 2f, AgendaWidgetCommon.centerBaseline(empty, h / 2f), empty);
            return bmp;
        }

        int capacity = Math.max(1, (int) (h / (42 * dn)));
        float rowH = h / (float) capacity;
        int rows = Math.min(capacity, items.size());

        Paint line = AgendaWidgetCommon.paint(AgendaWidgetCommon.BORDER);
        line.setStrokeWidth(dn);
        Paint check = AgendaWidgetCommon.paint(AgendaWidgetCommon.GREEN);
        check.setStyle(Paint.Style.STROKE);
        check.setStrokeWidth(2 * dn);
        Paint titleP = AgendaWidgetCommon.paint(AgendaWidgetCommon.INK);
        titleP.setTypeface(AgendaWidgetCommon.SANS_BOLD);
        titleP.setTextSize(12.5f * dn);
        Paint subP = AgendaWidgetCommon.paint(AgendaWidgetCommon.MUTED);
        subP.setTypeface(AgendaWidgetCommon.MONO);
        subP.setTextSize(9.5f * dn);
        Paint dotP = AgendaWidgetCommon.paint(Color.BLACK);

        float textX = 38 * dn;
        float textMaxW = w - textX - 36 * dn;
        for (int i = 0; i < rows; i++) {
            AgendaWidgetCommon.Task t = items.get(i);
            float top = i * rowH, cy = top + rowH / 2f;
            if (i > 0) c.drawLine(12 * dn, top, w - 12 * dn, top, line);

            c.drawCircle(20 * dn, cy, 8 * dn, check);

            String title = (t.reminder ? "\u2691 " : "") + t.title;
            c.drawText(AgendaWidgetCommon.ellipsize(title, titleP, textMaxW), textX, cy - 2 * dn, titleP);

            String sub = AgendaWidgetCommon.dayLabel(t.date, today) + (t.time.isEmpty() ? "" : " · " + t.time);
            c.drawText(AgendaWidgetCommon.ellipsize(sub, subP, textMaxW), textX, cy + 12 * dn, subP);

            dotP.setColor(t.baseColor());
            c.drawCircle(w - 18 * dn, cy, 4 * dn, dotP);
        }
        return bmp;
    }
}
