package com.bday.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import android.widget.RemoteViews
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

class WidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, mgr: AppWidgetManager, ids: IntArray) {
        schedulePeriodic(context)
        for (id in ids) updateWidget(context, mgr, id)
    }

    override fun onDeleted(context: Context, ids: IntArray) {
        // Wipe the per-widget passcode when the user removes the widget.
        for (id in ids) {
            context.getSharedPreferences(prefsName(id), Context.MODE_PRIVATE).edit().clear().apply()
        }
    }

    private fun schedulePeriodic(context: Context) {
        val req = PeriodicWorkRequestBuilder<UpdateWorker>(15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            "bday-widget-update",
            ExistingPeriodicWorkPolicy.UPDATE,
            req
        )
    }

    companion object {
        private const val FUNCTION_URL = "https://adgqourcxbjkupdrqpyt.supabase.co/functions/v1/widget-data"
        private const val ANON_KEY = "sb_publishable_SDf6CKA_DJR1uMNJk1SOeg_1kXRRpls"
        private const val WALL_URL = "https://adgqourcxbjkupdrqpyt.supabase.co"  // updated by user via README

        fun prefsName(widgetId: Int) = "bday_widget_$widgetId"

        fun updateAll(context: Context) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, WidgetProvider::class.java))
            for (id in ids) updateWidget(context, mgr, id)
        }

        fun updateWidget(context: Context, mgr: AppWidgetManager, widgetId: Int) {
            val passcode = context.getSharedPreferences(prefsName(widgetId), Context.MODE_PRIVATE)
                .getString("passcode", null)

            // Show a "no passcode" loading state if not configured yet.
            if (passcode.isNullOrBlank()) {
                val views = RemoteViews(context.packageName, R.layout.widget_4x2)
                views.setTextViewText(R.id.name, "—")
                views.setTextViewText(R.id.sub, "open setup")
                views.setTextViewText(R.id.label, "BIRTHDAY WALL")
                views.setTextViewText(R.id.row2, "")
                views.setTextViewText(R.id.row3, "")
                views.setOnClickPendingIntent(R.id.root, configIntent(context, widgetId))
                mgr.updateAppWidget(widgetId, views)
                return
            }

            // Fetch on a background thread so onUpdate returns immediately.
            Thread {
                val data = try { fetch(passcode) } catch (e: Exception) { null }
                val views = RemoteViews(context.packageName, R.layout.widget_4x2)
                views.setTextViewText(R.id.label, "BIRTHDAY WALL")

                if (data == null) {
                    views.setTextViewText(R.id.name, "—")
                    views.setTextViewText(R.id.sub, "offline / wrong passcode")
                    views.setTextViewText(R.id.row2, "")
                    views.setTextViewText(R.id.row3, "")
                } else {
                    val next = data.next.firstOrNull()
                    views.setTextViewText(R.id.name, next?.name ?: "no birthdays")
                    views.setTextViewText(R.id.sub, next?.let { formatDays(it.days) } ?: "")
                    views.setInt(R.id.dot, "setColorFilter", colorOf(next?.color))
                    views.setTextViewText(R.id.row2, data.next.getOrNull(1)?.let { "${it.name}  ·  ${formatDays(it.days)}" } ?: "")
                    views.setTextViewText(R.id.row3, data.next.getOrNull(2)?.let { "${it.name}  ·  ${formatDays(it.days)}" } ?: "")

                    data.photoUrl?.let { url ->
                        val bmp = downloadBitmap(url)
                        if (bmp != null) {
                            val rounded = roundedCorners(bmp, 16f)
                            views.setImageViewBitmap(R.id.photo, rounded)
                        }
                    }
                }
                // Tap opens the wall in the browser.
                val openWall = PendingIntent.getActivity(
                    context, widgetId,
                    Intent(Intent.ACTION_VIEW, Uri.parse(WALL_URL)),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )
                views.setOnClickPendingIntent(R.id.root, openWall)
                mgr.updateAppWidget(widgetId, views)
            }.start()
        }

        private fun configIntent(context: Context, widgetId: Int): PendingIntent {
            val intent = Intent(context, ConfigActivity::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            return PendingIntent.getActivity(
                context, widgetId, intent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
        }

        private fun fetch(passcode: String): WidgetData? {
            val conn = (URL(FUNCTION_URL).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                connectTimeout = 8_000
                readTimeout = 8_000
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("apikey", ANON_KEY)
                setRequestProperty("Authorization", "Bearer $ANON_KEY")
            }
            try {
                conn.outputStream.use { it.write("""{"passcode":${JSONObject.quote(passcode)}}""".toByteArray()) }
                if (conn.responseCode != 200) return null
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                return parse(body)
            } finally { conn.disconnect() }
        }

        private fun parse(json: String): WidgetData {
            val obj = JSONObject(json)
            val arr = obj.optJSONArray("next")
            val next = mutableListOf<NextEntry>()
            if (arr != null) for (i in 0 until arr.length()) {
                val n = arr.getJSONObject(i)
                next.add(NextEntry(
                    name = n.optString("name", ""),
                    days = n.optInt("days", 0),
                    color = n.optString("color", null)
                ))
            }
            val photo = obj.optJSONObject("featured_photo")?.optString("url", null)
            return WidgetData(next = next, photoUrl = photo?.takeIf { it.isNotBlank() })
        }

        private fun downloadBitmap(url: String): Bitmap? {
            return try {
                val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                    connectTimeout = 8_000
                    readTimeout = 12_000
                }
                conn.inputStream.use { BitmapFactory.decodeStream(it) }
            } catch (e: Exception) { null }
        }

        private fun roundedCorners(src: Bitmap, radiusPx: Float): Bitmap {
            val out = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(out)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG)
            val rect = RectF(0f, 0f, src.width.toFloat(), src.height.toFloat())
            canvas.drawRoundRect(rect, radiusPx, radiusPx, paint)
            paint.xfermode = android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.SRC_IN)
            canvas.drawBitmap(src, 0f, 0f, paint)
            return out
        }

        private fun formatDays(days: Int): String = when {
            days == 0 -> "today 🎉"
            days == 1 -> "tomorrow"
            else -> "in $days days"
        }

        private fun colorOf(cssVar: String?): Int {
            val c = cssVar ?: return Color.parseColor("#5a4f44")
            return when {
                c.contains("tomato") -> Color.parseColor("#e4634a")
                c.contains("mustard") -> Color.parseColor("#d9b53f")
                c.contains("mint") -> Color.parseColor("#7ac4a9")
                c.contains("sky") -> Color.parseColor("#8ab8d8")
                c.contains("lavender") -> Color.parseColor("#b399ce")
                c.contains("pink") -> Color.parseColor("#e598a2")
                else -> Color.parseColor("#5a4f44")
            }
        }
    }
}

data class WidgetData(val next: List<NextEntry>, val photoUrl: String?)
data class NextEntry(val name: String, val days: Int, val color: String?)
