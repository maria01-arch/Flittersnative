package expo.modules.flitterscall

import android.content.Context
import android.content.Intent
import android.media.AudioManager
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// The small native part of voice calls: the "call in progress" foreground service, and the phone's
// audio route (earpiece or loudspeaker). The call itself is carried by react-native-webrtc.
class FlittersCallModule : Module() {
  private fun audio(): AudioManager? {
    val context: Context = appContext.reactContext ?: return null
    return context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
  }

  override fun definition() = ModuleDefinition {
    Name("FlittersCall")

    // Call begins: communication audio mode (earpiece, echo cancelling) and the foreground service.
    Function("start") { title: String ->
      val context: Context? = appContext.reactContext
      if (context == null) {
        false
      } else {
        try {
          val am = audio()
          am?.mode = AudioManager.MODE_IN_COMMUNICATION
          @Suppress("DEPRECATION")
          am?.isSpeakerphoneOn = false
          val intent = Intent(context, CallService::class.java)
          intent.putExtra("title", title)
          ContextCompat.startForegroundService(context, intent)
          true
        } catch (e: Exception) {
          false
        }
      }
    }

    Function("setSpeaker") { on: Boolean ->
      try {
        @Suppress("DEPRECATION")
        audio()?.isSpeakerphoneOn = on
        true
      } catch (e: Exception) {
        false
      }
    }

    // Call is over: normal audio again, service stopped.
    Function("stop") {
      try {
        val context: Context? = appContext.reactContext
        if (context != null) context.stopService(Intent(context, CallService::class.java))
        val am = audio()
        @Suppress("DEPRECATION")
        am?.isSpeakerphoneOn = false
        am?.mode = AudioManager.MODE_NORMAL
        true
      } catch (e: Exception) {
        false
      }
    }
  }
}
