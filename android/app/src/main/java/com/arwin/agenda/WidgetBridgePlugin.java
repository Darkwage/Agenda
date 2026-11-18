package com.arwin.agenda;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Petit pont entre l'appli web et Android :
 * - refresh : redessine les widgets tout de suite après une modification ;
 * - alertStatus / openSettings : diagnostic des alertes sonores (le bip au
 *   début d'une tâche) et raccourcis vers les réglages Android concernés.
 */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridgePlugin extends Plugin {

    @PluginMethod
    public void refresh(PluginCall call) {
        try {
            AgendaWidgetCommon.refreshAll(getContext());
        } catch (Exception e) {
            // Never let a widget-refresh hiccup break the app's own save flow.
        }
        call.resolve();
    }

    /** Tout ce qui peut empêcher le bip de sonner, vu par Android. */
    @PluginMethod
    public void alertStatus(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            r.put("notificationsEnabled", nm.areNotificationsEnabled());
            r.put("interruptionFilter", nm.getCurrentInterruptionFilter()); // 1 = normal ; 2,3,4 = Ne pas déranger
            String channelId = call.getString("channelId", "agenda-bip-v4");
            if (Build.VERSION.SDK_INT >= 26) {
                NotificationChannel ch = nm.getNotificationChannel(channelId);
                r.put("channelExists", ch != null);
                if (ch != null) {
                    r.put("channelImportance", ch.getImportance()); // 0 = bloqué, 2 = silencieux, 3/4 = avec son
                    r.put("channelSound", ch.getSound() != null ? ch.getSound().toString() : "");
                    r.put("channelVibration", ch.shouldVibrate());
                    r.put("channelBypassDnd", ch.canBypassDnd());
                }
            }
            if (Build.VERSION.SDK_INT >= 31) {
                AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
                r.put("exactAlarms", am.canScheduleExactAlarms());
            } else {
                r.put("exactAlarms", true);
            }
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            r.put("batteryUnrestricted", pm.isIgnoringBatteryOptimizations(ctx.getPackageName()));
            AudioManager audio = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            r.put("ringerMode", audio.getRingerMode()); // 0 = silencieux, 1 = vibreur, 2 = normal
            r.put("notificationVolume", audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION));
            r.put("notificationVolumeMax", audio.getStreamMaxVolume(AudioManager.STREAM_NOTIFICATION));
            r.put("manufacturer", Build.MANUFACTURER);
            r.put("sdk", Build.VERSION.SDK_INT);
        } catch (Exception e) {
            r.put("error", String.valueOf(e.getMessage()));
        }
        call.resolve(r);
    }

    /** Ouvre la page de réglages Android demandée. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Context ctx = getContext();
        String what = call.getString("what", "app");
        String pkg = ctx.getPackageName();
        Intent i;
        try {
            switch (what) {
                case "channel":
                    i = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                            .putExtra(Settings.EXTRA_CHANNEL_ID, call.getString("channelId", "agenda-bip-v4"));
                    break;
                case "notifications":
                    i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
                    break;
                case "battery":
                    i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    break;
                case "alarms":
                    i = Build.VERSION.SDK_INT >= 31
                            ? new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + pkg))
                            : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
                    break;
                default:
                    i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
            }
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        } catch (Exception e) {
            // Page indisponible sur ce téléphone : on retombe sur la fiche de l'appli.
            Intent f = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
            f.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(f);
        }
        call.resolve();
    }
}
