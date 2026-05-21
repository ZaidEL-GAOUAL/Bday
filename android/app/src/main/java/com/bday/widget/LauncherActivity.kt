package com.bday.widget

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity

class LauncherActivity : AppCompatActivity() {
    override fun onCreate(saved: Bundle?) {
        super.onCreate(saved)
        // Just bounces straight to the wall in the browser.
        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("https://adgqourcxbjkupdrqpyt.supabase.co")))
        finish()
    }
}
