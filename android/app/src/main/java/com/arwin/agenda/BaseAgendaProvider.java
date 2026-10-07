package com.arwin.agenda;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.widget.RemoteViews;

/**
 * Socle commun des widgets Semaine / Mois / Liste : navigation ‹ › avec
 * décalage mémorisé par widget, retour automatique à aujourd'hui après
 * 2 min d'inactivité (alarme + vérification au redessin), et filet de
 * sécurité en cas d'erreur de dessin.
 */
abstract class BaseAgendaProvider extends AppWidgetProvider {

    static final String ACTION_PREV = "com.arwin.agenda.ACTION_WIDGET_PREV";
    static final String ACTION_NEXT = "com.arwin.agenda.ACTION_WIDGET_NEXT";
    static final String ACTION_RESET = "com.arwin.agenda.ACTION_WIDGET_RESET";

    /** Préfixe des clés d'état ("week", "month", "list"). */
    protected abstract String prefix();

    protected abstract int layoutRes();

    /** Construit la vue du widget pour le décalage donné (0 = période courante). */
    protected abstract RemoteViews build(Context ctx, AppWidgetManager mgr, int id, int offset);

    protected boolean hasNav() { return true; }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) updateWidget(ctx, mgr, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle newOptions) {
        updateWidget(ctx, mgr, id); // redimensionné : on redessine à la nouvelle taille
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        String action = intent.getAction();
        int id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (action == null || id == AppWidgetManager.INVALID_APPWIDGET_ID) return;

        SharedPreferences st = ctx.getSharedPreferences(AgendaWidgetCommon.STATE_PREFS, Context.MODE_PRIVATE);
        String offKey = prefix() + "_offset_" + id;
        String lastKey = prefix() + "_last_" + id;

        if (ACTION_PREV.equals(action) || ACTION_NEXT.equals(action)) {
            int off = st.getInt(offKey, 0) + (ACTION_PREV.equals(action) ? -1 : 1);
            st.edit().putInt(offKey, off).putLong(lastKey, System.currentTimeMillis()).apply();
            if (off != 0) scheduleReset(ctx, id); else cancelReset(ctx, id);
            updateWidget(ctx, AppWidgetManager.getInstance(ctx), id);
        } else if (ACTION_RESET.equals(action)) {
            st.edit().putInt(offKey, 0).apply();
            updateWidget(ctx, AppWidgetManager.getInstance(ctx), id);
        }
    }

    @Override
    public void onDeleted(Context ctx, int[] ids) {
        SharedPreferences.Editor e = ctx.getSharedPreferences(AgendaWidgetCommon.STATE_PREFS, Context.MODE_PRIVATE).edit();
        for (int id : ids) {
            e.remove(prefix() + "_offset_" + id).remove(prefix() + "_last_" + id);
            cancelReset(ctx, id);
        }
        e.apply();
    }

    protected final void updateWidget(Context ctx, AppWidgetManager mgr, int id) {
        RemoteViews views;
        try {
            int offset = hasNav() ? AgendaWidgetCommon.readOffset(ctx, prefix(), id) : 0;
            views = build(ctx, mgr, id, offset);
        } catch (Exception e) {
            // Jamais d'écran système « problème de chargement du widget » :
            // on affiche l'erreur dans l'en-tête et on garde l'ouverture de l'appli.
            Log.e("AgendaWidget", "Echec du dessin (" + prefix() + ")", e);
            views = new RemoteViews(ctx.getPackageName(), layoutRes());
            views.setTextViewText(R.id.tv_label, "ERREUR");
            views.setTextViewText(R.id.tv_title, e.getClass().getSimpleName());
            views.setOnClickPendingIntent(R.id.tv_title, AgendaWidgetCommon.openApp(ctx, id));
        }
        mgr.updateAppWidget(id, views);
    }

    /** Textes de l'en-tête + clics (‹ ›, titre = retour à aujourd'hui, corps = ouvre l'appli). */
    protected final void wireHeader(Context ctx, RemoteViews v, int id, String label, String title, int offset) {
        v.setTextViewText(R.id.tv_label, label);
        v.setTextViewText(R.id.tv_title, title);
        PendingIntent open = AgendaWidgetCommon.openApp(ctx, id);
        if (hasNav()) {
            v.setOnClickPendingIntent(R.id.btn_prev, AgendaWidgetCommon.broadcast(ctx, getClass(), ACTION_PREV, id, 2));
            v.setOnClickPendingIntent(R.id.btn_next, AgendaWidgetCommon.broadcast(ctx, getClass(), ACTION_NEXT, id, 3));
            v.setOnClickPendingIntent(R.id.tv_title,
                    offset != 0 ? AgendaWidgetCommon.broadcast(ctx, getClass(), ACTION_RESET, id, 4) : open);
        } else {
            v.setOnClickPendingIntent(R.id.tv_title, open);
        }
        v.setOnClickPendingIntent(R.id.iv_body, open);
    }

    private void scheduleReset(Context ctx, int id) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = AgendaWidgetCommon.broadcast(ctx, getClass(), ACTION_RESET, id, 4);
        long triggerAt = SystemClock.elapsedRealtime() + AgendaWidgetCommon.RESET_DELAY_MS;
        if (android.os.Build.VERSION.SDK_INT >= 23) {
            am.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi);
        } else {
            am.set(AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pi);
        }
    }

    private void cancelReset(Context ctx, int id) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(AgendaWidgetCommon.broadcast(ctx, getClass(), ACTION_RESET, id, 4));
    }
}
