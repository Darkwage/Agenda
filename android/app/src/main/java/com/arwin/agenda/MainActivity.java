package com.arwin.agenda;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Doit rester identique à TASK_CHANGE_CHANNEL dans index.html.
    private static final String TASK_CHANNEL_ID = "agenda-bip-v4";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local (non-npm) plugins must be registered manually, before the
        // bridge finishes initializing in super.onCreate().
        registerPlugin(WidgetBridgePlugin.class);
        super.onCreate(savedInstanceState);
        createTaskNotificationChannel();
    }

    /**
     * Crée nativement le canal du bip (son + vibration), sans dépendre du JavaScript.
     * Android fige les réglages d'un canal à sa création : on utilise donc un
     * identifiant neuf et on supprime les anciens.
     */
    private void createTaskNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        try {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm == null) return;

            nm.deleteNotificationChannel("agenda-task-changes");
            nm.deleteNotificationChannel("agenda-task-changes-v2");
            nm.deleteNotificationChannel("agenda-task-changes-v3");

            // beep.wav dans res/raw ; à défaut, son de notification par défaut du téléphone.
            int rawId = getResources().getIdentifier("beep", "raw", getPackageName());
            Uri sound = rawId != 0
                    ? Uri.parse("android.resource://" + getPackageName() + "/" + rawId)
                    : RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();

            NotificationChannel channel = new NotificationChannel(
                    TASK_CHANNEL_ID, "Changement de tâche", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Bip et vibration au démarrage d'une tâche.");
            channel.enableVibration(true);
            channel.setVibrationPattern(new long[]{0, 250, 150, 250});
            channel.setSound(sound, attrs);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(channel);
        } catch (Exception ignored) {
            // Ne jamais empêcher le démarrage de l'appli.
        }
    }
}
