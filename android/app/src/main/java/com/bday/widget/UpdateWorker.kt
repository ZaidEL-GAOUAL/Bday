package com.bday.widget

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

class UpdateWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        WidgetProvider.updateAll(applicationContext)
        return Result.success()
    }
}
