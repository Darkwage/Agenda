package com.arwin.agenda;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.widget.RemoteViews;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Map;

/** Widget « Mois » : grille mensuelle, jour courant cerclé de vert, points de couleur par jour. */
public class AgendaMonthWidgetProvider extends BaseAgendaProvider {

    @Override protected String prefix() { return "month"; }
    @Override protected int layoutRes() { return R.layout.widget_month; }

    @Override
    protected RemoteViews build(Context ctx, AppWidgetManager mgr, int id, int offset) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), layoutRes());

        Calendar first = Calendar.getInstance();
        first.set(Calendar.DAY_OF_MONTH, 1);
        first.add(Calendar.MONTH, offset);

        wireHeader(ctx, v, id, "MOIS", AgendaWidgetCommon.monthTitle(first), offset);

        int[] size = AgendaWidgetCommon.bodySizePx(ctx, mgr, id);
        float density = ctx.getResources().getDisplayMetrics().density;
        Map<String, ArrayList<AgendaWidgetCommon.Task>> byDate =
                AgendaWidgetCommon.byDate(AgendaWidgetCommon.readAll(ctx));

        v.setImageViewBitmap(R.id.iv_body, draw(first, byDate, size[0], size[1], density));
        return v;
    }

    private Bitmap draw(Calendar first, Map<String, ArrayList<AgendaWidgetCommon.Task>> byDate,
                        int w, int h, float dn) {
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(bmp);

        int lead = (first.get(Calendar.DAY_OF_WEEK) + 5) % 7; // jours du mois précédent avant le 1er
        int days = first.getActualMaximum(Calendar.DAY_OF_MONTH);
        int rows = (lead + days + 6) / 7;
        Calendar start = (Calendar) first.clone();
        start.add(Calendar.DAY_OF_MONTH, -lead);

        String todayIso = AgendaWidgetCommon.iso(Calendar.getInstance());
        float colW = w / 7f;
        float letterH = 16 * dn;
        float rowH = (h - letterH) / rows;

        Paint letterP = AgendaWidgetCommon.paint(AgendaWidgetCommon.MUTED);
        letterP.setTypeface(AgendaWidgetCommon.MONO);
        letterP.setTextSize(9 * dn);
        letterP.setTextAlign(Paint.Align.CENTER);

        Paint numP = AgendaWidgetCommon.paint(AgendaWidgetCommon.INK);
        numP.setTextSize(12 * dn);
        numP.setTextAlign(Paint.Align.CENTER);

        Paint ringP = AgendaWidgetCommon.paint(AgendaWidgetCommon.GREEN);
        Paint dotP = AgendaWidgetCommon.paint(Color.BLACK);

        String letters = "LMMJVSD";
        for (int i = 0; i < 7; i++) {
            c.drawText(String.valueOf(letters.charAt(i)), (i + 0.5f) * colW,
                    AgendaWidgetCommon.centerBaseline(letterP, letterH / 2f), letterP);
        }

        for (int r = 0; r < rows; r++) {
            for (int col = 0; col < 7; col++) {
                Calendar d = (Calendar) start.clone();
                d.add(Calendar.DAY_OF_MONTH, r * 7 + col);
                String ds = AgendaWidgetCommon.iso(d);
                boolean inMonth = d.get(Calendar.MONTH) == first.get(Calendar.MONTH);
                boolean today = ds.equals(todayIso);

                float cx = (col + 0.5f) * colW;
                float top = letterH + r * rowH;
                float cy = top + rowH * 0.40f;

                if (today) {
                    float radius = Math.min(12 * dn, rowH * 0.34f);
                    c.drawCircle(cx, cy, radius, ringP);
                    numP.setColor(Color.WHITE);
                    numP.setTypeface(AgendaWidgetCommon.SANS_BOLD);
                } else {
                    numP.setColor(inMonth ? AgendaWidgetCommon.INK : AgendaWidgetCommon.DIM);
                    numP.setTypeface(android.graphics.Typeface.DEFAULT);
                }
                c.drawText(String.valueOf(d.get(Calendar.DAY_OF_MONTH)), cx,
                        AgendaWidgetCommon.centerBaseline(numP, cy), numP);

                // Jusqu'à 3 points : une couleur distincte par catégorie du jour
                ArrayList<AgendaWidgetCommon.Task> tasks = byDate.get(ds);
                if (tasks == null) continue;
                ArrayList<Integer> colors = new ArrayList<>();
                for (AgendaWidgetCommon.Task t : tasks) {
                    int base = t.baseColor();
                    if (!colors.contains(base)) colors.add(base);
                    if (colors.size() == 3) break;
                }
                float dotsY = Math.min(cy + 15 * dn, top + rowH - 3 * dn);
                float spacing = 8 * dn;
                float x = cx - (colors.size() - 1) * spacing / 2f;
                for (int color : colors) {
                    dotP.setColor(color);
                    dotP.setAlpha(inMonth ? 255 : 110);
                    c.drawCircle(x, dotsY, 2.5f * dn, dotP);
                    x += spacing;
                }
            }
        }
        return bmp;
    }
}
