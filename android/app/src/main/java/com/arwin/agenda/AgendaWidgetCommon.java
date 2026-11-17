package com.arwin.agenda;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.os.Bundle;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/**
 * Code partagé par les widgets Semaine / Mois / Liste : lecture des tâches
 * (même source que le widget Jour : SharedPreferences "CapacitorStorage",
 * clé "agenda_widget_tasks"), palette du thème, dates en français, helpers
 * de dessin et PendingIntents.
 */
final class AgendaWidgetCommon {
    private AgendaWidgetCommon() {}

    static final String CAPACITOR_PREFS = "CapacitorStorage";
    static final String TASKS_KEY = "agenda_widget_tasks";
    static final String STATE_PREFS = "agenda_widget_state";
    static final String PREMIUM_KEY = "agenda_premium";
    static final long RESET_DELAY_MS = 2 * 60 * 1000; // retour auto à aujourd'hui

    // Palette : thème Crème par défaut, remplacée par loadTheme() selon le thème
    // choisi dans l'appli (clé « agenda_widget_theme », écrite par theme.js).
    static int GREEN = Color.parseColor("#3B5F51");      // accent
    static int INK = Color.parseColor("#1C1D21");
    static int INK_SOFT = Color.parseColor("#5B5F66");
    static int MUTED = Color.parseColor("#8A8A85");
    static int BORDER = Color.parseColor("#E3DFD4");
    static int GRID = Color.parseColor("#EAE5D8");
    static int DIM = Color.parseColor("#B9B6AC");
    static int TODAY_TINT = Color.parseColor("#E6EFEA");
    static int SURFACE = Color.WHITE;
    static int ACCENT_INK = Color.WHITE;
    static boolean DARK = false;
    static String THEME_ID = "creme";
    static final int DONE_GREEN = Color.parseColor("#3D6B4F");
    static final int INK_ON_LIGHT = Color.parseColor("#1C1D21"); // texte sur une pastille de couleur claire
    static final String THEME_KEY = "agenda_widget_theme";

    private static int col(org.json.JSONObject o, String k, int def) {
        try { String v = o.optString(k, ""); return v.startsWith("#") ? Color.parseColor(v) : def; }
        catch (Exception e) { return def; }
    }

    /** Recharge la palette du thème choisi dans l'appli. */
    static void loadTheme(Context ctx) {
        String raw = ctx.getSharedPreferences(CAPACITOR_PREFS, Context.MODE_PRIVATE).getString(THEME_KEY, null);
        org.json.JSONObject o;
        try { o = raw == null ? new org.json.JSONObject() : new org.json.JSONObject(raw); }
        catch (Exception e) { o = new org.json.JSONObject(); }
        THEME_ID = o.optString("id", "creme");
        DARK = "dark".equals(o.optString("mode", "light"));
        GREEN = col(o, "accent", Color.parseColor("#3B5F51"));
        INK = col(o, "ink", Color.parseColor("#1C1D21"));
        INK_SOFT = col(o, "inkSoft", Color.parseColor("#5B5F66"));
        MUTED = col(o, "inkFaint", Color.parseColor("#8A8A85"));
        BORDER = col(o, "line", Color.parseColor("#E3DFD4"));
        GRID = col(o, "lineSoft", Color.parseColor("#EAE5D8"));
        TODAY_TINT = col(o, "accentSoft", Color.parseColor("#E6EFEA"));
        SURFACE = col(o, "surface", Color.WHITE);
        ACCENT_INK = col(o, "accentInk", Color.WHITE);
        DIM = mix(MUTED, SURFACE, 0.45f);
    }

    /** Mélange une couleur avec une autre (ratio = part de « with »). */
    static int mix(int color, int with, float ratio) {
        return Color.rgb(
                Math.round(Color.red(color) * (1 - ratio) + Color.red(with) * ratio),
                Math.round(Color.green(color) * (1 - ratio) + Color.green(with) * ratio),
                Math.round(Color.blue(color) * (1 - ratio) + Color.blue(with) * ratio));
    }

    /** Fond doux d'une tâche : la couleur de catégorie fondue dans la surface du thème. */
    static int soft(int color, float ratio) {
        return mix(color, SURFACE, DARK ? Math.min(ratio, 0.72f) : ratio);
    }

    /** Applique le thème à l'en-tête et au fond du widget (la racine doit avoir l'id widget_root). */
    static void styleChrome(Context ctx, android.widget.RemoteViews v, int titleId, boolean hasNav) {
        String pkg = ctx.getPackageName();
        int bg = ctx.getResources().getIdentifier("widget_bg_t_" + THEME_ID, "drawable", pkg);
        int btn = ctx.getResources().getIdentifier("widget_btn_t_" + THEME_ID, "drawable", pkg);
        if (bg != 0) v.setInt(R.id.widget_root, "setBackgroundResource", bg);
        v.setTextColor(R.id.tv_label, GREEN);
        v.setTextColor(titleId, INK);
        if (hasNav) {
            if (btn != 0) {
                v.setInt(R.id.btn_prev, "setBackgroundResource", btn);
                v.setInt(R.id.btn_next, "setBackgroundResource", btn);
            }
            v.setTextColor(R.id.btn_prev, INK);
            v.setTextColor(R.id.btn_next, INK);
        }
    }

    static final Typeface SERIF_BOLD = Typeface.create(Typeface.SERIF, Typeface.BOLD);
    static final Typeface SANS_BOLD = Typeface.create(Typeface.DEFAULT, Typeface.BOLD);
    static final Typeface MONO = Typeface.MONOSPACE;

    static final String[] MONTHS = {"janvier", "février", "mars", "avril", "mai", "juin",
            "juillet", "août", "septembre", "octobre", "novembre", "décembre"};
    static final String[] MONTHS_SHORT = {"janv.", "févr.", "mars", "avr.", "mai", "juin",
            "juil.", "août", "sept.", "oct.", "nov.", "déc."};
    static final String[] DAYS_SHORT = {"Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."};

    /* ---------------------------------------------------------------
       Données
    ---------------------------------------------------------------- */
    static class Task {
        String date = "", title = "", time = "", color = "#2F5D50";
        int duration = 0, startMin = -1, progress = -1;
        boolean done = false, reminder = false;

        int baseColor() {
            if (done) return DONE_GREEN;
            try { return Color.parseColor(color); } catch (Exception e) { return GREEN; }
        }
    }

    /** Toutes les tâches, triées par date puis heure (sans heure en premier). */
    static ArrayList<Task> readAll(Context ctx) {
        ArrayList<Task> out = new ArrayList<>();
        SharedPreferences prefs = ctx.getSharedPreferences(CAPACITOR_PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(TASKS_KEY, null);
        if (raw == null) return out;
        try {
            JSONArray arr = new JSONArray(raw);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                Task t = new Task();
                t.date = o.optString("date", "");
                if (t.date.length() != 10) continue;
                t.title = o.optString("title", "");
                t.time = o.optString("time", "");
                t.duration = o.optInt("duration", 0);
                t.color = o.optString("color", "#2F5D50");
                t.done = o.optBoolean("done", false);
                t.reminder = o.optBoolean("reminder", false);
                if (o.has("progress") && !o.isNull("progress")) {
                    t.progress = Math.max(0, Math.min(100, o.optInt("progress", -1)));
                }
                if (!t.time.isEmpty()) {
                    try {
                        String[] hm = t.time.split(":");
                        t.startMin = Integer.parseInt(hm[0].trim()) * 60 + Integer.parseInt(hm[1].trim());
                    } catch (Exception e) {
                        t.time = "";
                        t.startMin = -1;
                    }
                }
                out.add(t);
            }
        } catch (Exception ignored) {
            // données absentes ou pas encore synchronisées : on n'affiche rien
        }
        Collections.sort(out, (a, b) -> {
            int c = a.date.compareTo(b.date);
            if (c != 0) return c;
            if (a.startMin != b.startMin) return Integer.compare(a.startMin, b.startMin);
            return a.title.compareToIgnoreCase(b.title);
        });
        return out;
    }

    static Map<String, ArrayList<Task>> byDate(ArrayList<Task> all) {
        HashMap<String, ArrayList<Task>> map = new HashMap<>();
        for (Task t : all) {
            ArrayList<Task> list = map.get(t.date);
            if (list == null) { list = new ArrayList<>(); map.put(t.date, list); }
            list.add(t);
        }
        return map;
    }

    /* ---------------------------------------------------------------
       Dates
    ---------------------------------------------------------------- */
    static String iso(Calendar c) {
        return String.format(Locale.US, "%04d-%02d-%02d",
                c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    /** Lundi de la semaine contenant c. */
    static Calendar startOfWeek(Calendar c) {
        Calendar x = (Calendar) c.clone();
        int back = (x.get(Calendar.DAY_OF_WEEK) + 5) % 7; // lundi=0 ... dimanche=6
        x.add(Calendar.DAY_OF_MONTH, -back);
        return x;
    }

    /** Numéro de semaine ISO (le jeudi de la semaine décide de l'année). */
    static int isoWeek(Calendar monday) {
        Calendar t = (Calendar) monday.clone();
        t.setFirstDayOfWeek(Calendar.MONDAY);
        t.setMinimalDaysInFirstWeek(4);
        t.add(Calendar.DAY_OF_MONTH, 3);
        return t.get(Calendar.WEEK_OF_YEAR);
    }

    static String weekTitle(Calendar mon, Calendar sun) {
        int d1 = mon.get(Calendar.DAY_OF_MONTH), d2 = sun.get(Calendar.DAY_OF_MONTH);
        int m1 = mon.get(Calendar.MONTH), m2 = sun.get(Calendar.MONTH);
        if (m1 == m2) return d1 + " – " + d2 + " " + MONTHS[m2];
        return d1 + " " + MONTHS_SHORT[m1] + " – " + d2 + " " + MONTHS_SHORT[m2];
    }

    static String monthTitle(Calendar first) {
        String m = MONTHS[first.get(Calendar.MONTH)];
        return Character.toUpperCase(m.charAt(0)) + m.substring(1) + " " + first.get(Calendar.YEAR);
    }

    static String dayLabel(String isoDate, Calendar today) {
        if (isoDate.equals(iso(today))) return "Aujourd’hui";
        Calendar tm = (Calendar) today.clone();
        tm.add(Calendar.DAY_OF_MONTH, 1);
        if (isoDate.equals(iso(tm))) return "Demain";
        try {
            int y = Integer.parseInt(isoDate.substring(0, 4));
            int mo = Integer.parseInt(isoDate.substring(5, 7)) - 1;
            int d = Integer.parseInt(isoDate.substring(8, 10));
            Calendar c = Calendar.getInstance();
            c.clear();
            c.set(y, mo, d);
            return DAYS_SHORT[c.get(Calendar.DAY_OF_WEEK) - 1] + " " + d + " " + MONTHS_SHORT[mo];
        } catch (Exception e) {
            return isoDate;
        }
    }

    /* ---------------------------------------------------------------
       Dessin
    ---------------------------------------------------------------- */
    static Paint paint(int color) {
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setColor(color);
        return p;
    }

    static boolean isLight(int color) {
        double l = (0.299 * Color.red(color) + 0.587 * Color.green(color) + 0.114 * Color.blue(color)) / 255.0;
        return l > 0.62;
    }

    /** Ordonnée de la ligne de base pour centrer verticalement un texte sur cy. */
    static float centerBaseline(Paint p, float cy) {
        Paint.FontMetrics fm = p.getFontMetrics();
        return cy - (fm.ascent + fm.descent) / 2f;
    }

    static String ellipsize(String text, Paint paint, float maxWidth) {
        if (paint.measureText(text) <= maxWidth) return text;
        String ellipsis = "…";
        int lo = 0, hi = text.length();
        while (lo < hi) {
            int mid = (lo + hi + 1) / 2;
            if (paint.measureText(text.substring(0, mid) + ellipsis) <= maxWidth) lo = mid; else hi = mid - 1;
        }
        return lo <= 0 ? ellipsis : text.substring(0, lo) + ellipsis;
    }

    /** Taille en pixels de l'image du corps du widget (hors en-tête et marges). */
    static int[] bodySizePx(Context ctx, AppWidgetManager mgr, int id) {
        float density = ctx.getResources().getDisplayMetrics().density;
        Bundle o = mgr.getAppWidgetOptions(id);
        int wDp = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
        int hDp = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 180);
        // padding 16+16, en-tête ~44, espace 12
        int w = Math.max(200, Math.round((wDp - 32) * density));
        int h = Math.max(120, Math.round(Math.max(80, hDp - 88) * density));
        return new int[]{w, h};
    }

    /* ---------------------------------------------------------------
       PendingIntents / état
    ---------------------------------------------------------------- */
    static PendingIntent broadcast(Context ctx, Class<?> cls, String action, int id, int slot) {
        Intent i = new Intent(ctx, cls);
        i.setAction(action);
        i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        return PendingIntent.getBroadcast(ctx, id * 100 + slot, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent openApp(Context ctx, int id) {
        Intent i = new Intent(ctx, MainActivity.class);
        return PendingIntent.getActivity(ctx, id * 100 + 1, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Ouvre l'appli directement sur la page d'abonnement (widget verrouillé). */
    static PendingIntent openPaywall(Context ctx, int id) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.putExtra(MainActivity.EXTRA_OPEN_PAYWALL, "widgets");
        i.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, id * 100 + 5, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Statut Premium écrit par premium.js (clé « agenda_premium » = "1"). */
    static boolean isPremium(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(CAPACITOR_PREFS, Context.MODE_PRIVATE);
        return "1".equals(prefs.getString(PREMIUM_KEY, "0"));
    }

    /** Décalage (en semaines / mois) mémorisé, avec retour auto si inactif trop longtemps. */
    static int readOffset(Context ctx, String prefix, int id) {
        SharedPreferences st = ctx.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE);
        int off = st.getInt(prefix + "_offset_" + id, 0);
        long last = st.getLong(prefix + "_last_" + id, 0);
        if (off != 0 && System.currentTimeMillis() - last > RESET_DELAY_MS) {
            off = 0;
            st.edit().putInt(prefix + "_offset_" + id, 0).apply();
        }
        return off;
    }

    /* ---------------------------------------------------------------
       Rafraîchissement global (à appeler quand l'appli synchronise ses données)
    ---------------------------------------------------------------- */
    private static final Class<?>[] ALL_PROVIDERS = {
            AgendaWidgetProvider.class,
            AgendaWeekWidgetProvider.class,
            AgendaMonthWidgetProvider.class,
            AgendaListWidgetProvider.class
    };

    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        for (Class<?> cls : ALL_PROVIDERS) {
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, cls));
            if (ids == null || ids.length == 0) continue;
            Intent i = new Intent(ctx, cls);
            i.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            ctx.sendBroadcast(i);
        }
    }

    /** Remet Jour, Semaine et Mois sur « aujourd'hui » (ex. à l'extinction de l'écran). */
    static void resetAllToToday(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        SharedPreferences.Editor e = ctx.getSharedPreferences(STATE_PREFS, Context.MODE_PRIVATE).edit();
        String[] prefixes = {"week", "month"};
        Class<?>[] classes = {AgendaWeekWidgetProvider.class, AgendaMonthWidgetProvider.class};
        for (int k = 0; k < classes.length; k++) {
            int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, classes[k]));
            if (ids == null || ids.length == 0) continue;
            for (int id : ids) e.putInt(prefixes[k] + "_offset_" + id, 0);
            Intent i = new Intent(ctx, classes[k]);
            i.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
            i.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            ctx.sendBroadcast(i);
        }
        e.apply();
        AgendaWidgetProvider.resetAllToToday(ctx); // widget Jour (existant)
    }
}
