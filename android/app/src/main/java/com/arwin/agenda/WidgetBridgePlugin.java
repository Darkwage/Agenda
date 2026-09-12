package com.arwin.agenda;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tiny bridge plugin so the web app can tell the home screen widget to
 * redraw itself immediately after a task is added/edited/deleted, instead
 * of waiting for Android's normal widget update cycle (which is throttled
 * to a minimum of ~30 minutes system-wide, regardless of what a widget
 * requests). Called right after every successful sync to native storage.
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    @PluginMethod
    public void refresh(PluginCall call) {
        try {
            Context context = getContext();
            AppWidgetManager manager = AppWidgetManager.getInstance(context);
            ComponentName provider = new ComponentName(context, AgendaWidgetProvider.class);
            int[] widgetIds = manager.getAppWidgetIds(provider);

            if (widgetIds != null && widgetIds.length > 0) {
                Intent intent = new Intent(context, AgendaWidgetProvider.class);
                intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
                intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, widgetIds);
                context.sendBroadcast(intent);
            }
            call.resolve();
        } catch (Exception e) {
            // Never let a widget-refresh hiccup break the app's own save flow.
            call.resolve();
        }
    }
}
