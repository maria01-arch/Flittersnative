package expo.modules.flitterstrim

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.nio.ByteBuffer

// Cuts a piece out of a video. The main way is Google's Media3 Transformer
// (exact cut, handles odd formats, uses the phone's hardware encoder). If that
// fails for a video, the older way runs instead: it copies the already
// compressed pictures and sound between two moments into a new .mp4 using
// Android's MediaExtractor and MediaMuxer, without re-encoding. That way has
// to start on a "keyframe", so the start can be up to a second or two earlier.
class FlittersTrimModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FlittersTrim")

    // maxMs: never write more than this much video (0 = no cap). Because the
    // cut starts on a keyframe, it can begin a little before startMs; the cap
    // is counted from where it really begins.
    AsyncFunction("trim") { uri: String, startMs: Double, endMs: Double, maxMs: Double, promise: Promise ->
      val cutStart = startMs.toLong()
      var cutEnd = endMs.toLong()
      val cap = maxMs.toLong()
      if (cap > 0) cutEnd = Math.min(cutEnd, cutStart + cap)
      val finalEnd = cutEnd
      val context: Context? = appContext.reactContext
      if (context == null) {
        promise.reject("E_TRIM", "The app is not ready", null)
        return@AsyncFunction
      }

      // The older cut, run off the main thread, when Media3 cannot do it.
      val fallback = {
        Thread {
          try {
            promise.resolve(trimVideo(uri, cutStart, finalEnd, 0L))
          } catch (ex: Exception) {
            promise.reject("E_TRIM", ex.message ?: "Could not cut this video", ex)
          }
        }.start()
      }

      // Transformer has to be created and started on the main thread.
      Handler(Looper.getMainLooper()).post {
        val outFile = File(context.cacheDir, "trim-" + System.currentTimeMillis() + ".mp4")
        try {
          val clip = MediaItem.ClippingConfiguration.Builder()
            .setStartPositionMs(cutStart)
            .setEndPositionMs(finalEnd)
            .build()
          val item = MediaItem.Builder().setUri(Uri.parse(uri)).setClippingConfiguration(clip).build()
          val edited = EditedMediaItem.Builder(item).build()
          val transformer = Transformer.Builder(context)
            .addListener(object : Transformer.Listener {
              override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                promise.resolve(
                  mapOf(
                    "uri" to Uri.fromFile(outFile).toString(),
                    "startMs" to cutStart.toDouble(),
                    "durationMs" to (finalEnd - cutStart).toDouble()
                  )
                )
              }

              override fun onError(composition: Composition, exportResult: ExportResult, exportException: ExportException) {
                outFile.delete()
                fallback()
              }
            })
            .build()
          transformer.start(edited, outFile.absolutePath)
        } catch (ex: Exception) {
          outFile.delete()
          fallback()
        }
      }
    }
  }

  private fun trimVideo(input: String, startMs: Long, endMs: Long, maxMs: Long): Map<String, Any> {
    val context: Context = appContext.reactContext ?: throw IllegalStateException("The app is not ready")
    val source = Uri.parse(input)
    val outFile = File(context.cacheDir, "trim-" + System.currentTimeMillis() + ".mp4")

    val extractor = MediaExtractor()
    var muxer: MediaMuxer? = null
    var muxerStarted = false
    try {
      extractor.setDataSource(context, source, null)

      // Find the picture track and the sound track.
      var videoTrack = -1
      var audioTrack = -1
      for (i in 0 until extractor.trackCount) {
        val mime = extractor.getTrackFormat(i).getString(MediaFormat.KEY_MIME) ?: continue
        if (videoTrack < 0 && mime.startsWith("video/")) videoTrack = i
        if (audioTrack < 0 && mime.startsWith("audio/")) audioTrack = i
      }
      if (videoTrack < 0) throw IllegalStateException("No video found in this file")

      val m = MediaMuxer(outFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      muxer = m

      // Keep the phone-held direction (portrait / landscape) of the video.
      val retriever = MediaMetadataRetriever()
      try {
        retriever.setDataSource(context, source)
        val rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toIntOrNull() ?: 0
        m.setOrientationHint(rotation)
      } catch (e: Exception) {
        // not fatal: the video just keeps its default direction
      } finally {
        retriever.release()
      }

      val outVideo = m.addTrack(extractor.getTrackFormat(videoTrack))
      var outAudio = -1
      if (audioTrack >= 0) {
        try {
          outAudio = m.addTrack(extractor.getTrackFormat(audioTrack))
        } catch (e: Exception) {
          // a sound format an .mp4 can't hold: cut the picture without sound
          audioTrack = -1
        }
      }

      // Big (4K / high-bitrate) videos can have a single picture larger than 1 MB,
      // so start with a roomy buffer and grow it if a picture still does not fit.
      var maxSize = 4 * 1024 * 1024
      for (i in intArrayOf(videoTrack, audioTrack)) {
        if (i < 0) continue
        val f = extractor.getTrackFormat(i)
        if (f.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) {
          maxSize = Math.max(maxSize, f.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE))
        }
      }

      val startUs = startMs * 1000L
      var endUs = endMs * 1000L

      // 1) Where is the keyframe at or before the wanted start?
      extractor.selectTrack(videoTrack)
      extractor.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
      val baseUs = extractor.sampleTime
      if (baseUs < 0) throw IllegalStateException("Could not find the start of the video")
      if (maxMs > 0) endUs = Math.min(endUs, baseUs + maxMs * 1000L)

      // 2) Bring the sound to the same moment.
      if (audioTrack >= 0) {
        extractor.selectTrack(audioTrack)
        extractor.seekTo(baseUs, MediaExtractor.SEEK_TO_CLOSEST_SYNC)
      }

      m.start()
      muxerStarted = true

      var buffer = ByteBuffer.allocate(maxSize)
      val info = MediaCodec.BufferInfo()
      var videoDone = false
      var audioDone = audioTrack < 0
      var wroteVideo = false

      while (!(videoDone && audioDone)) {
        buffer.clear()
        val size = try {
          extractor.readSampleData(buffer, 0)
        } catch (e: IllegalArgumentException) {
          // the picture did not fit: double the buffer (up to 32 MB) and read it again
          if (buffer.capacity() >= 32 * 1024 * 1024) throw e
          buffer = ByteBuffer.allocate(buffer.capacity() * 2)
          continue
        }
        if (size < 0) break
        val time = extractor.sampleTime
        val track = extractor.sampleTrackIndex
        if (time < 0) break

        if (time > endUs) {
          if (track == videoTrack) videoDone = true
          if (track == audioTrack) audioDone = true
          extractor.advance()
          continue
        }

        if (track == videoTrack) {
          info.offset = 0
          info.size = size
          info.presentationTimeUs = Math.max(0L, time - baseUs)
          info.flags = if ((extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC) != 0) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0
          m.writeSampleData(outVideo, buffer, info)
          wroteVideo = true
        } else if (track == audioTrack && time >= baseUs) {
          info.offset = 0
          info.size = size
          info.presentationTimeUs = time - baseUs
          info.flags = MediaCodec.BUFFER_FLAG_KEY_FRAME
          m.writeSampleData(outAudio, buffer, info)
        }
        extractor.advance()
      }

      if (!wroteVideo) throw IllegalStateException("Nothing to cut: the chosen part is empty")
      m.stop()
      muxerStarted = false
      return mapOf(
        "uri" to Uri.fromFile(outFile).toString(),
        "startMs" to (baseUs / 1000L).toDouble(),
        "durationMs" to ((endUs - baseUs) / 1000L).toDouble()
      )
    } catch (e: Exception) {
      outFile.delete()
      throw e
    } finally {
      try {
        if (muxerStarted) muxer?.stop()
      } catch (e: Exception) {
      }
      try {
        muxer?.release()
      } catch (e: Exception) {
      }
      extractor.release()
    }
  }
}
