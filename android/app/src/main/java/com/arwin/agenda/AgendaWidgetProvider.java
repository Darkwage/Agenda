package com.arwin.agenda;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.widget.RemoteViews;

/**
 * TEMPORARY DIAGNOSTIC VERSION - stripped down to the bare minimum
 * (a single TextView, no buttons, no custom drawables, no data reading)
 * to isolate whether the widget concept itself can be added at all on
 * this device, or whether a specific element was the problem.
 */
public class AgendaWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.agenda_widget);
            views.setTextViewText(R.id.tv_date, "Agenda (test OK)");
            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }
}
