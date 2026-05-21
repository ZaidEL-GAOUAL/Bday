package com.bday.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import androidx.appcompat.app.AppCompatActivity

class ConfigActivity : AppCompatActivity() {

    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)

        // Default result = cancelled so the system removes the widget if the
        // user backs out without finishing setup.
        setResult(RESULT_CANCELED)

        setContentView(R.layout.activity_config)

        widgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID

        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        // Pre-fill if we already have one (re-configure case).
        val prefs = getSharedPreferences(WidgetProvider.prefsName(widgetId), MODE_PRIVATE)
        val existing = prefs.getString("passcode", "")
        val input = findViewById<EditText>(R.id.passcode_input)
        input.setText(existing)

        findViewById<Button>(R.id.save_button).setOnClickListener {
            val p = input.text.toString().trim()
            if (p.isEmpty()) {
                input.error = "passcode is required"
                return@setOnClickListener
            }
            prefs.edit().putString("passcode", p).apply()

            // Trigger a first update so the widget fills in immediately.
            val mgr = AppWidgetManager.getInstance(this)
            WidgetProvider.updateWidget(this, mgr, widgetId)

            val out = Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            setResult(RESULT_OK, out)
            finish()
        }
    }
}
