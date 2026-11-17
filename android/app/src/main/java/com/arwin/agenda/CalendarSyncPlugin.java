package com.arwin.agenda;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.provider.CalendarContract;
import android.provider.CalendarContract.Calendars;
import android.provider.CalendarContract.Events;
import android.provider.CalendarContract.Instances;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;

/**
 * Accès aux agendas du téléphone (Google Agenda, Samsung, Outlook…) via CalendarContract.
 *
 * - Lecture : liste des agendas et des rendez-vous (occurrences comprises).
 * - Écriture : uniquement dans l'agenda dédié « Agenda (appli) », compte local créé
 *   par l'appli. Les agendas personnels de l'utilisateur ne sont jamais modifiés.
 *   Chaque événement porte l'id de la tâche (SYNC_DATA1) et la version envoyée
 *   (SYNC_DATA2) pour repérer les modifications faites côté téléphone.
 */
@CapacitorPlugin(
        name = "CalendarSync",
        permissions = {
                @Permission(alias = "calendar", strings = {
                        Manifest.permission.READ_CALENDAR,
                        Manifest.permission.WRITE_CALENDAR
                })
        }
)
public class CalendarSyncPlugin extends Plugin {

    static final String OWN_ACCOUNT = "Agenda";
    static final String OWN_NAME = "agenda_appli";
    static final String OWN_DISPLAY = "Agenda (appli)";

    private boolean granted() {
        return getPermissionState("calendar") == PermissionState.GRANTED;
    }

    @PluginMethod
    public void requestAccess(PluginCall call) {
        if (granted()) { JSObject r = new JSObject(); r.put("granted", true); call.resolve(r); return; }
        requestPermissionForAlias("calendar", call, "onPermission");
    }

    @PermissionCallback
    private void onPermission(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", granted());
        call.resolve(r);
    }

    private Uri asSyncAdapter(Uri uri) {
        return uri.buildUpon()
                .appendQueryParameter(CalendarContract.CALLER_IS_SYNCADAPTER, "true")
                .appendQueryParameter(Calendars.ACCOUNT_NAME, OWN_ACCOUNT)
                .appendQueryParameter(Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL)
                .build();
    }

    /* ------------------------------------------------------------------ agendas */

    @PluginMethod
    public void listCalendars(PluginCall call) {
        if (!granted()) { call.reject("permission"); return; }
        JSArray out = new JSArray();
        String[] proj = {Calendars._ID, Calendars.CALENDAR_DISPLAY_NAME, Calendars.ACCOUNT_NAME,
                Calendars.ACCOUNT_TYPE, Calendars.CALENDAR_COLOR, Calendars.VISIBLE, Calendars.NAME};
        try (Cursor c = getContext().getContentResolver().query(Calendars.CONTENT_URI, proj, null, null, null)) {
            while (c != null && c.moveToNext()) {
                JSObject o = new JSObject();
                o.put("id", String.valueOf(c.getLong(0)));
                o.put("name", c.getString(1));
                o.put("account", c.getString(2));
                o.put("color", String.format("#%06X", 0xFFFFFF & c.getInt(4)));
                o.put("visible", c.getInt(5) == 1);
                boolean own = CalendarContract.ACCOUNT_TYPE_LOCAL.equals(c.getString(3))
                        && OWN_ACCOUNT.equals(c.getString(2)) && OWN_NAME.equals(c.getString(6));
                o.put("own", own);
                out.put(o);
            }
        } catch (Exception e) { call.reject(e.getMessage()); return; }
        JSObject r = new JSObject();
        r.put("calendars", out);
        call.resolve(r);
    }

    private long findOwnCalendar() {
        String sel = Calendars.ACCOUNT_NAME + "=? AND " + Calendars.ACCOUNT_TYPE + "=? AND " + Calendars.NAME + "=?";
        String[] args = {OWN_ACCOUNT, CalendarContract.ACCOUNT_TYPE_LOCAL, OWN_NAME};
        try (Cursor c = getContext().getContentResolver().query(Calendars.CONTENT_URI, new String[]{Calendars._ID}, sel, args, null)) {
            if (c != null && c.moveToFirst()) return c.getLong(0);
        }
        return -1;
    }

    @PluginMethod
    public void ensureOwnCalendar(PluginCall call) {
        if (!granted()) { call.reject("permission"); return; }
        try {
            long id = findOwnCalendar();
            if (id < 0) {
                int color;
                try { color = Color.parseColor(call.getString("color", "#2F5D50")); } catch (Exception e) { color = Color.parseColor("#2F5D50"); }
                ContentValues v = new ContentValues();
                v.put(Calendars.ACCOUNT_NAME, OWN_ACCOUNT);
                v.put(Calendars.ACCOUNT_TYPE, CalendarContract.ACCOUNT_TYPE_LOCAL);
                v.put(Calendars.NAME, OWN_NAME);
                v.put(Calendars.CALENDAR_DISPLAY_NAME, OWN_DISPLAY);
                v.put(Calendars.CALENDAR_COLOR, color);
                v.put(Calendars.CALENDAR_ACCESS_LEVEL, Calendars.CAL_ACCESS_OWNER);
                v.put(Calendars.OWNER_ACCOUNT, OWN_ACCOUNT);
                v.put(Calendars.VISIBLE, 1);
                v.put(Calendars.SYNC_EVENTS, 1);
                v.put(Calendars.CALENDAR_TIME_ZONE, TimeZone.getDefault().getID());
                Uri u = getContext().getContentResolver().insert(asSyncAdapter(Calendars.CONTENT_URI), v);
                id = u == null ? -1 : ContentUris.parseId(u);
            }
            if (id < 0) { call.reject("creation"); return; }
            JSObject r = new JSObject();
            r.put("id", String.valueOf(id));
            call.resolve(r);
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    @PluginMethod
    public void deleteOwnCalendar(PluginCall call) {
        if (!granted()) { call.reject("permission"); return; }
        try {
            long id = findOwnCalendar();
            if (id >= 0) getContext().getContentResolver().delete(asSyncAdapter(ContentUris.withAppendedId(Calendars.CONTENT_URI, id)), null, null);
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    /* ------------------------------------------------------------- lecture */

    /** Occurrences des agendas demandés entre from et to (ms). */
    @PluginMethod
    public void listEvents(PluginCall call) {
        if (!granted()) { call.reject("permission"); return; }
        long from = call.getLong("from", System.currentTimeMillis() - 31L * 86400000L);
        long to = call.getLong("to", System.currentTimeMillis() + 400L * 86400000L);
        JSArray ids = call.getArray("calendarIds", new JSArray());
        Set<String> wanted = new HashSet<>();
        for (int i = 0; i < ids.length(); i++) wanted.add(ids.optString(i));

        Uri.Builder b = Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(b, from);
        ContentUris.appendId(b, to);
        String[] proj = {Instances.EVENT_ID, Instances.CALENDAR_ID, Instances.TITLE, Instances.BEGIN, Instances.END,
                Instances.ALL_DAY, Instances.EVENT_LOCATION, Instances.DISPLAY_COLOR, Instances.STATUS};
        JSArray out = new JSArray();
        try (Cursor c = getContext().getContentResolver().query(b.build(), proj, null, null, Instances.BEGIN + " ASC")) {
            while (c != null && c.moveToNext()) {
                String cal = String.valueOf(c.getLong(1));
                if (!wanted.isEmpty() && !wanted.contains(cal)) continue;
                if (c.getInt(8) == Instances.STATUS_CANCELED) continue;
                JSObject o = new JSObject();
                o.put("eventId", String.valueOf(c.getLong(0)));
                o.put("calendarId", cal);
                o.put("title", c.getString(2) == null ? "" : c.getString(2));
                o.put("begin", c.getLong(3));
                o.put("end", c.getLong(4));
                o.put("allDay", c.getInt(5) == 1);
                o.put("location", c.getString(6) == null ? "" : c.getString(6));
                o.put("color", String.format("#%06X", 0xFFFFFF & c.getInt(7)));
                out.put(o);
                if (out.length() >= 4000) break;
            }
        } catch (Exception e) { call.reject(e.getMessage()); return; }
        JSObject r = new JSObject();
        r.put("events", out);
        call.resolve(r);
    }

    /** Ouvre un rendez-vous dans l'appli d'agenda du téléphone. */
    @PluginMethod
    public void openEvent(PluginCall call) {
        try {
            long id = Long.parseLong(call.getString("eventId", "0"));
            Intent i = new Intent(Intent.ACTION_VIEW, ContentUris.withAppendedId(Events.CONTENT_URI, id));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            Long begin = call.getLong("begin");
            Long end = call.getLong("end");
            if (begin != null) i.putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, (long) begin);
            if (end != null) i.putExtra(CalendarContract.EXTRA_EVENT_END_TIME, (long) end);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) { call.reject(e.getMessage()); }
    }

    /* ----------------------------------------------- agenda dédié (écriture) */

    /** État actuel de l'agenda dédié : ce que l'utilisateur a pu modifier ou supprimer côté téléphone. */
    @PluginMethod
    public void readOwnEvents(PluginCall call) {
        if (!granted()) { call.reject("permission"); return; }
        long cal = findOwnCalendar();
        JSArray out = new JSArray();
        if (cal >= 0) {
            String[] proj = {Events._ID, Events.SYNC_DATA1, Events.SYNC_DATA2, Events.TITLE, Events.DTSTART, Events.DTEND,
                    Events.ALL_DAY, Events.DELETED};
            try (Cursor c = getContext().getContentResolver().query(asSyncAdapter(Events.CONTENT_URI), proj,
                    Events.CALENDAR_ID + "=?", new String[]{String.valueOf(cal)}, null)) {
                while (c != null && c.moveToNext()) {
                    JSObject o = new JSObject();
                    o.put("eventId", String.valueOf(c.getLong(0)));
                    o.put("key", c.getString(1));
                    o.put("pushed", c.getString(2));
                    o.put("title", c.getString(3) == null ? "" : c.getString(3));
                    o.put("begin", c.getLong(4));
                    o.put("end", c.isNull(5) ? c.getLong(4) : c.getLong(5));
                    o.put("allDay", c.getInt(6) == 1);
                    o.put("deleted", c.getInt(7) == 1);
                    out.put(o);
                }
            } catch (Exception e) { call.reject(e.getMessage()); return; }
        }
        JSObject r = new JSObject();
        r.put("events", out);
        call.resolve(r);
    }

    /**
     * Met l'agenda dédié en conformité avec la liste reçue :
     * ajoute, met à jour (si la version change) et supprime ce qui n'existe plus.
     * events : [{ key, title, begin, end, allDay, description, version }]
     */
    @PluginMethod
    public void pushEvents(PluginCall call) {
        if (!granted()) { call.reject("permission"); return; }
        long cal = findOwnCalendar();
        if (cal < 0) { call.reject("no-calendar"); return; }
        ContentResolver cr = getContext().getContentResolver();
        Uri eventsUri = asSyncAdapter(Events.CONTENT_URI);
        int added = 0, updated = 0, removed = 0;
        try {
            Map<String, long[]> existing = new HashMap<>();      // key -> {id}
            Map<String, String> existingVersion = new HashMap<>();
            try (Cursor c = cr.query(eventsUri, new String[]{Events._ID, Events.SYNC_DATA1, Events.SYNC_DATA2},
                    Events.CALENDAR_ID + "=?", new String[]{String.valueOf(cal)}, null)) {
                while (c != null && c.moveToNext()) {
                    String key = c.getString(1);
                    if (key == null || existing.containsKey(key)) {
                        // doublon ou événement créé à la main dans cet agenda : on le retire
                        cr.delete(ContentUris.withAppendedId(eventsUri, c.getLong(0)), null, null);
                        removed++;
                        continue;
                    }
                    existing.put(key, new long[]{c.getLong(0)});
                    existingVersion.put(key, c.getString(2));
                }
            }

            JSONArray list = call.getArray("events", new JSArray());
            Set<String> keep = new HashSet<>();
            String tz = TimeZone.getDefault().getID();
            for (int i = 0; i < list.length(); i++) {
                JSONObject e = list.getJSONObject(i);
                String key = e.getString("key");
                String version = e.optString("version", "");
                keep.add(key);
                boolean allDay = e.optBoolean("allDay", false);
                ContentValues v = new ContentValues();
                v.put(Events.CALENDAR_ID, cal);
                v.put(Events.TITLE, e.optString("title", ""));
                v.put(Events.DESCRIPTION, e.optString("description", ""));
                v.put(Events.DTSTART, e.getLong("begin"));
                v.put(Events.DTEND, e.getLong("end"));
                v.put(Events.ALL_DAY, allDay ? 1 : 0);
                v.put(Events.EVENT_TIMEZONE, allDay ? "UTC" : tz);
                v.put(Events.SYNC_DATA1, key);
                v.put(Events.SYNC_DATA2, version);
                v.put(Events.DIRTY, 0);
                v.put(Events.DELETED, 0);
                if (existing.containsKey(key)) {
                    if (!version.equals(existingVersion.get(key))) {
                        cr.update(ContentUris.withAppendedId(eventsUri, existing.get(key)[0]), v, null, null);
                        updated++;
                    }
                } else {
                    cr.insert(eventsUri, v);
                    added++;
                }
            }
            for (Map.Entry<String, long[]> en : existing.entrySet()) {
                if (!keep.contains(en.getKey())) {
                    cr.delete(ContentUris.withAppendedId(eventsUri, en.getValue()[0]), null, null);
                    removed++;
                }
            }
        } catch (Exception e) { call.reject(e.getMessage()); return; }
        JSObject r = new JSObject();
        r.put("added", added);
        r.put("updated", updated);
        r.put("removed", removed);
        call.resolve(r);
    }
}
