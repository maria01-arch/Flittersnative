package expo.modules.flitterssound

import android.media.AudioAttributes
import android.media.SoundPool
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Plays the app's short sounds (sent, received, like) like a notification sound:
// on the phone's NOTIFICATION volume, without asking for audio focus. So it never
// stops someone's music or video, and a video or voice note can't switch it off.
class FlittersSoundModule : Module() {
  private var pool: SoundPool? = null
  private val ids = HashMap<String, Int>()
  private val ready = HashSet<Int>()

  private fun ensure(): SoundPool {
    pool?.let { return it }
    val attrs = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_NOTIFICATION)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val p = SoundPool.Builder().setMaxStreams(4).setAudioAttributes(attrs).build()
    p.setOnLoadCompleteListener { _, id, status ->
      if (status == 0) synchronized(ready) { ready.add(id) }
    }
    pool = p
    return p
  }

  override fun definition() = ModuleDefinition {
    Name("FlittersSound")

    // key: our name for the sound; path: a file on the phone (file:// or plain path)
    Function("load") { key: String, path: String ->
      val clean = Uri.decode(path.removePrefix("file://"))
      val old = ids[key]
      if (old != null) ensure().unload(old)
      ids[key] = ensure().load(clean, 1)
      true
    }

    // true when it played, false when the sound isn't loaded yet
    Function("play") { key: String, volume: Double ->
      val id = ids[key]
      val ok = id != null && synchronized(ready) { ready.contains(id) }
      if (ok) {
        val v = volume.toFloat().coerceIn(0f, 1f)
        ensure().play(id!!, v, v, 1, 0, 1f)
      }
      ok
    }

    OnDestroy {
      pool?.release()
      pool = null
      ids.clear()
      synchronized(ready) { ready.clear() }
    }
  }
}
