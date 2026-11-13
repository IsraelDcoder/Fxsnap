package expo.modules.backgroundeventaudio

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BackgroundEventAudioModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BackgroundEventAudio")

    AsyncFunction("start") { title: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val intent = Intent(context, EventAudioPlaybackService::class.java)
        .putExtra(EventAudioPlaybackService.EXTRA_TITLE, title)

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      Unit
    }

    AsyncFunction("stop") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      context.stopService(Intent(context, EventAudioPlaybackService::class.java))
      Unit
    }
  }
}
