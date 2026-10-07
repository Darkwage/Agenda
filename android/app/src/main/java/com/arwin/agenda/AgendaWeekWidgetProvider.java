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
import java.util.Map;

/** Widget « Semaine » : 7 colonnes (lun → dim) avec les tâches en pastilles de couleur. */
public class AgendaWeekWidgetProvider extends BaseAgendaProvider {

    @Override protected String prefix() { return "week"; }
    @Override protected int layoutRes() { return R.layout.widget_week; }

    @Override
    protected RemoteViews build(Context ctx, AppWidgetManager mgr, int id, int offset) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), layoutRes());

        Calendar monday = AgendaWidgetCommon.startOfWeek(Calendar.getInstance());
        monday.add(Calendar.DAY_OF_MONTH, offset * 7);
        Calendar sunday = (Calendar) monday.clone();
        sunday.add(Calendar.DAY_OF_MONTH, 6);

        wireHeader(ctx, v, id,
                "SEMAINE " + AgendaWidgetCommon.isoWeek(monday),
                AgendaWidgetCommon.weekTitle(monday, sunday),
                offset);

        int[] size = AgendaWidgetCommon.bodySizePx(ctx, mgr, id);
        float density = ctx.getResources().getDisplayMetrics().density;
        Map<String, ArrayList<AgendaWidgetCommon.Task>> byDate =
                AgendaWidgetCommon.byDate(AgendaWidgetCommon.readAll(ctx));

        v.setImageViewBitmap(R.id.iv_body, draw(monday, byDate, size[0], size[1], density));
        return v;
    }

    private Bitmap draw(Calendar monday, Map<String, ArrayList<AgendaWidgetCommon.Task>> byDate,
                        int w, int h, float dn) {
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);

        String todayIso = AgendaWidgetCommon.iso(Calendar.getInstance());
        float gap = 3 * dn;
        float colW = (w - gap * 6) / 7f;
        float chipH = 18 * dn, chipGap = 3 * dn, chipsTop = 44 * dn;
        int capacity = Math.max(0, (int) ((h - chipsTop - 4 * dn) / (chipH + chipGap)));

        Paint fill = AgendaWidgetCommon.paint(Color.WHITE);
        Paint stroke = AgendaWidgetCommon.paint(AgendaWidgetCommon.BORDER);
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setStrokeWidth(dn);

        Paint letterP = AgendaWidgetCommon.paint(AgendaWidgetCommon.MUTED);
        letterP.setTypeface(AgendaWidgetCommon.MONO);
        letterP.setTextSize(9 * dn);
        letterP.setTextAlign(Paint.Align.CENTER);

        Paint numP = AgendaWidgetCommon.paint(AgendaWidgetCommon.INK);
        numP.setTypeface(AgendaWidgetCommon.SERIF_BOLD);
        numP.setTextSize(15 * dn);
        numP.setTextAlign(Paint.Align.CENTER);

        Paint chipP = AgendaWidgetCommon.paint(Color.BLACK);
        Paint chipTextP = AgendaWidgetCommon.paint(Color.WHITE);
        chipTextP.setTypeface(AgendaWidgetCommon.SANS_BOLD);
        chipTextP.setTextSize(8.5f * dn);
        chipTextP.setTextAlign(Paint.Align.CENTER);

        Paint moreP = AgendaWidgetCommon.paint(AgendaWidgetCommon.MUTED);
        moreP.setTypeface(AgendaWidgetCommon.MONO);
        moreP.setTextSize(9 * dn);
        moreP.setTextAlign(Paint.Align.CENTER);

        String letters = "LMMJVSD";
        for (int i = 0; i < 7; i++) {
            Calendar d = (Calendar) monday.clone();
            d.add(Calendar.DAY_OF_MONTH, i);
            String ds = AgendaWidgetCommon.iso(d);
            boolean today = ds.equals(todayIso);

            float x0 = i * (colW + gap), x1 = x0 + colW, cx = (x0 + x1) / 2f;
            RectF col = new RectF(x0 + dn * 0.5f, dn * 0.5f, x1 - dn * 0.5f, h - dn * 0.5f);
            fill.setColor(today ? AgendaWidgetCommon.TODAY_TINT : Color.WHITE);
            stroke.setColor(today ? AgendaWidgetCommon.GREEN : AgendaWidgetCommon.BORDER);
            c.drawRoundRect(col, 10 * dn, 10 * dn, fill);
            c.drawRoundRect(col, 10 * dn, 10 * dn, stroke);

            letterP.setColor(today ? AgendaWidgetCommon.GREEN : AgendaWidgetCommon.MUTED);
            numP.setColor(today ? AgendaWidgetCommon.GREEN : AgendaWidgetCommon.INK);
            c.drawText(String.valueOf(letters.charAt(i)), cx, 15 * dn, letterP);
            c.drawText(String.valueOf(d.get(Calendar.DAY_OF_MONTH)), cx, 35 * dn, numP);

            ArrayList<AgendaWidgetCommon.Task> tasks = byDate.get(ds);
            if (tasks == null || capacity == 0) continue;

            // Trop de tâches : on garde une ligne pour le « +N »
            int shown = tasks.size() > capacity ? Math.max(0, capacity - 1) : tasks.size();
            float y = chipsTop;
            for (int k = 0; k < shown; k++) {
                AgendaWidgetCommon.Task t = tasks.get(k);
                int base = t.baseColor();
                RectF r = new RectF(x0 + 3 * dn, y, x1 - 3 * dn, y + chipH);
                chipP.setColor(base);
                c.drawRoundRect(r, 5 * dn, 5 * dn, chipP);
                chipTextP.setColor(AgendaWidgetCommon.isLight(base) ? AgendaWidgetCommon.INK : Color.WHITE);
                String title = AgendaWidgetCommon.ellipsize(t.title, chipTextP, r.width() - 6 * dn);
                c.drawText(title, r.centerX(), AgendaWidgetCommon.centerBaseline(chipTextP, r.centerY()), chipTextP);
                y += chipH + chipGap;
            }
            int more = tasks.size() - shown;
            if (more > 0) {
                c.drawText("+" + more, cx, AgendaWidgetCommon.centerBaseline(moreP, y + 8 * dn), moreP);
            }
        }
        return bmp;
    }
}
