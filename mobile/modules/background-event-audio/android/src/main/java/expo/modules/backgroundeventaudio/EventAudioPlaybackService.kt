package expo.modules.backgroundeventaudio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.IBinder

class EventAudioPlaybackService : Service() {
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    createNotificationChannel()
    val title = intent?.getStringExtra(EXTRA_TITLE)?.takeIf { it.isNotBlank() } ?: "Live Events space"
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
    val contentIntent = launchIntent?.let {
      PendingIntent.getActivity(
        this,
        NOTIFICATION_ID,
        it,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, CHANNEL_ID)
    } else {
      Notification.Builder(this)
    }
    val notification = builder
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setContentTitle("FXSnap Events")
      .setContentText("Listening to $title · audio continues in background")
      .setCategory(Notification.CATEGORY_SERVICE)
      .setColor(Color.rgb(10, 91, 75))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(contentIntent)
      .build()

    startForeground(NOTIFICATION_ID, notification)
    return START_NOT_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Live Events audio",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Keeps a live Events space playing while FXSnap is in the background."
      setShowBadge(false)
    }
    getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
  }

  companion object {
    const val EXTRA_TITLE = "event_title"
    private const val CHANNEL_ID = "fxsnap-event-audio"
    private const val NOTIFICATION_ID = 7401
  }
}
