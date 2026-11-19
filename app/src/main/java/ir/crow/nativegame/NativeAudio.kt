package ir.crow.nativegame

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.math.PI
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.random.Random

/** Small procedural sound engine used instead of browser Web Audio. */
class NativeAudio {
    private val sampleRate = 22050
    private val pending = ConcurrentLinkedQueue<Voice>()
    @Volatile private var running = false
    @Volatile private var muted = false
    @Volatile private var scene = "alley"
    @Volatile private var gameState = "title"
    @Volatile private var gameTime = 0.0
    private var audioThread: Thread? = null
    private var track: AudioTrack? = null

    private data class Voice(
        val frequency: Double,
        val duration: Double,
        val amplitude: Double,
        val wave: Int = 0,
        val startAt: Double = 0.0,
        var phase: Double = 0.0,
        var age: Double = 0.0
    )

    @Synchronized
    fun start() {
        if (running) return
        try {
            val minBuffer = AudioTrack.getMinBufferSize(
                sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT
            ).coerceAtLeast(2048)
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build()
            val format = AudioFormat.Builder()
                .setSampleRate(sampleRate)
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build()
            val audioTrack = AudioTrack.Builder()
                .setAudioAttributes(attrs)
                .setAudioFormat(format)
                .setTransferMode(AudioTrack.MODE_STREAM)
                .setBufferSizeInBytes(minBuffer * 2)
                .build()
            audioTrack.play()
            track = audioTrack
            running = true
            audioThread = Thread({ audioLoop(audioTrack) }, "Crow-Audio").apply {
                priority = Thread.MAX_PRIORITY
                start()
            }
        } catch (_: Throwable) {
            running = false
            track = null
        }
    }

    fun setMuted(value: Boolean) {
        muted = value
        if (value) pending.clear()
    }

    fun ambient(sceneId: String, state: String, isMuted: Boolean, time: Double) {
        scene = sceneId
        gameState = state
        gameTime = time
        muted = isMuted
    }

    @JvmOverloads
    fun play(name: String, volume: Double = 0.35, frequency: Double = 440.0, delaySeconds: Double = 0.0) {
        if (muted) return
        start()
        val v = volume.coerceIn(0.015, 0.9)
        val now = System.nanoTime() / 1_000_000_000.0 + delaySeconds.coerceIn(0.0, 5.0)
        fun add(freq: Double, dur: Double, amp: Double, wave: Int = 0, delay: Double = 0.0) {
            pending.offer(Voice(freq, dur, amp * v, wave, now + delay))
        }
        when (name) {
            "step" -> { add(78.0, .095, .24, 2); add(1250.0, .045, .11, 1, .01) }
            "stepIn" -> add(72.0, .11, .16, 2)
            "click" -> add(1450.0, .025, .22, 1)
            "inspect" -> { add(660.0, .24, .16, 0); add(440.0, .30, .13, 0, .055) }
            "choose" -> { add(520.0, .085, .18, 1); add(780.0, .11, .15, 1, .055) }
            "clue" -> { listOf(220.0, 261.6, 329.6, 415.3).forEachIndexed { i, f -> add(f, 1.0, .12, 0, i * .105) } }
            "reveal" -> listOf(1760.0, 2217.0, 2637.0).forEachIndexed { i, f -> add(f, .33, .06, 0, i * .05) }
            "whoosh" -> { add(120.0, .36, .17, 2); add(380.0, .48, .10, 1, .025) }
            "crackle", "noise" -> add(1800.0, .055, .14, 2)
            "tone" -> add(frequency.coerceIn(40.0, 5000.0), .11, .10, 0)
            "toggle" -> { add(180.0, .045, .12, 1); add(850.0, .025, .08, 0, .012) }
            "endingGood" -> listOf(110.0, 164.8, 220.0, 277.2, 329.6).forEachIndexed { i, f -> add(f, 1.6, .095, 0, i * .17) }
            "endingBad" -> listOf(103.8, 155.6, 207.7, 246.9, 311.1).forEachIndexed { i, f -> add(f, 1.5, .09, 0, i * .18) }
            "paper" -> add(2300.0, .075, .08, 2)
            "beep" -> add(frequency.coerceIn(100.0, 3000.0), .09, .13, 1)
            "ok" -> { add(880.0, .18, .15, 0); add(1320.0, .23, .12, 0, .08) }
            "buzz" -> add(115.0, .18, .12, 1)
            "dotmatrix" -> repeat(7) { i -> add(1850.0 + i * 80, .025, .045, 1, i * .09) }
            "clunk" -> { add(64.0, .12, .20, 1); add(420.0, .04, .05, 2, .015) }
            "rip" -> { add(360.0, .22, .16, 2); add(1400.0, .12, .08, 2, .025) }
            else -> add(440.0, .07, .08, 0)
        }
    }

    private fun audioLoop(out: AudioTrack) {
        val block = ShortArray(512)
        val voices = ArrayList<Voice>(32)
        val random = Random(System.nanoTime())
        var wind = 0.0
        while (running) {
            val now = System.nanoTime() / 1_000_000_000.0
            while (true) {
                val v = pending.peek() ?: break
                if (v.startAt > now + 0.025) break
                voices.add(pending.poll())
            }
            val ambientGain = if (muted) 0.0 else if (gameState == "title") 0.34 else 0.55
            for (i in block.indices) {
                val t = now + i.toDouble() / sampleRate
                var sample = 0.0
                if (ambientGain > 0.0) {
                    val slow = 0.5 + 0.5 * sin(gameTime * 0.23) * sin(gameTime * 0.071 + 1.3)
                    val indoor = scene == "station" && gameState != "title"
                    val drone = sin(2.0 * PI * 55.0 * t) * 0.012 +
                        sin(2.0 * PI * 55.35 * t) * 0.008 +
                        sin(2.0 * PI * 27.5 * t) * 0.018 +
                        sin(2.0 * PI * 82.4 * t) * 0.002
                    wind = wind * 0.985 + (random.nextDouble() - 0.5) * 0.015
                    val windAmount = if (indoor) 0.12 else 0.8
                    sample += (drone + wind * windAmount * (0.2 + slow * 0.5)) * ambientGain
                }
                var index = 0
                while (index < voices.size) {
                    val v = voices[index]
                    val age = t - v.startAt
                    if (age < 0) { index++; continue }
                    if (age >= v.duration) { voices.removeAt(index); continue }
                    val attack = min(1.0, age / 0.012)
                    val release = min(1.0, (v.duration - age) / 0.055)
                    val env = max(0.0, min(attack, release))
                    val phase = 2.0 * PI * v.frequency * age
                    val wave = when (v.wave) {
                        1 -> if (sin(phase) >= 0) 1.0 else -1.0
                        2 -> random.nextDouble() * 2.0 - 1.0
                        else -> sin(phase)
                    }
                    sample += wave * env * v.amplitude
                    index++
                }
                if (muted) sample = 0.0
                val clipped = (sample.coerceIn(-0.95, 0.95) * 32767.0).toInt()
                block[i] = clipped.toShort()
            }
            try {
                val written = out.write(block, 0, block.size, AudioTrack.WRITE_BLOCKING)
                if (written < 0) break
            } catch (_: Throwable) { break }
        }
    }

    @Synchronized
    fun shutdown() {
        running = false
        try { audioThread?.join(250) } catch (_: InterruptedException) {}
        audioThread = null
        try { track?.pause(); track?.flush(); track?.release() } catch (_: Throwable) {}
        track = null
        pending.clear()
    }
}
