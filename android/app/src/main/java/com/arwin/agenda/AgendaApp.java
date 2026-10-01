package com.arwin.agenda;

import android.app.Application;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;

import androidx.core.content.ContextCompat;

/**
 * Écoute le verrouillage de l'écran (impossible via le manifeste) et remet
 * le widget sur aujourd'hui. Fonctionne tant que le processus de l'app est vivant.
 */
public class AgendaApp extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        BroadcastReceiver screenOff = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                AgendaWidgetProvider.resetAllToToday(context);
            }
        };
        ContextCompat.registerReceiver(this, screenOff,
                new IntentFilter(Intent.ACTION_SCREEN_OFF),
                ContextCompat.RECEIVER_NOT_EXPORTED);
    }
}
