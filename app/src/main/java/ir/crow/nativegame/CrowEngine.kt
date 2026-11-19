package ir.crow.nativegame

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.util.Log
import org.mozilla.javascript.Context as JsContext
import org.mozilla.javascript.Function
import org.mozilla.javascript.Scriptable
import org.mozilla.javascript.ScriptableObject
import java.io.InputStreamReader

/** Runs the original game rules in Rhino and routes every Canvas operation to Android Canvas. */
class CrowEngine(private val appContext: Context) {
    val audio = NativeAudio()
    val mainCanvas = NativeCanvas(appContext)
    private val bridge = NativeEventBridge(appContext, mainCanvas, audio)
    @Volatile var initialized = false
        private set
    @Volatile var lastError: String? = null
        private set

    private var scope: Scriptable? = null
    private var windowObject: Scriptable? = null
    private var frameFunction: Function? = null
    private var androidBackFunction: Function? = null
    private var androidPauseFunction: Function? = null
    private var androidResumeFunction: Function? = null
    private var lastWidth = 0
    private var lastHeight = 0

    private val prelude = """
        var __bridge = NativeEventBridge;
        var NativeSound = __bridge.audio();
        var window = {
          devicePixelRatio: 1,
          addEventListener: function(type, callback) { __bridge.addWindowListener(type, callback); },
          matchMedia: function(query) { return { matches: true, media: query }; }
        };
        var document = {
          getElementById: function(id) { return __bridge.getElementById(id); },
          createElement: function(tag) { return __bridge.createElement(tag); },
          addEventListener: function(type, callback) { __bridge.addDocumentListener(type, callback); },
          body: __bridge.body,
          head: __bridge.head,
          documentElement: __bridge.documentElement,
          hidden: false,
          fonts: null,
          fullscreenElement: null
        };
        var localStorage = {
          getItem: function(key) { return __bridge.getItem(String(key)); },
          setItem: function(key, value) { __bridge.setItem(String(key), String(value)); },
          removeItem: function(key) { __bridge.removeItem(String(key)); },
          clear: function() { __bridge.clear(); }
        };
        var history = { pushState: function(state, title, url) { __bridge.pushState(state, title, url); } };
        var performance = { now: function() { return __bridge.now(); } };
        var requestAnimationFrame = function(callback) { return 1; };
        var cancelAnimationFrame = function(id) {};
        var setTimeout = function(callback, delay) { return 1; };
        var clearTimeout = function(id) {};
        var matchMedia = function(query) { return window.matchMedia(query); };
        var addEventListener = function(type, callback) { window.addEventListener(type, callback); };
        var getComputedStyle = function(element) { return { paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px' }; };
    """.trimIndent()

    @Synchronized
    fun initialize(width: Int, height: Int) {
        if (initialized) return
        lastWidth = width.coerceAtLeast(1)
        lastHeight = height.coerceAtLeast(1)
        var cx: JsContext? = null
        try {
            cx = JsContext.enter()
            cx.languageVersion = JsContext.VERSION_ES6
            cx.optimizationLevel = -1 // interpreted mode is reliable on Android's ART runtime
            val global = cx.initStandardObjects()
            ScriptableObject.putProperty(global, "NativeEventBridge", JsContext.javaToJS(bridge, global))
            ScriptableObject.putProperty(global, "innerWidth", lastWidth.toDouble())
            ScriptableObject.putProperty(global, "innerHeight", lastHeight.toDouble())
            cx.evaluateString(global, prelude, "crow-native-prelude.js", 1, null)
            val gameSource = appContext.assets.open("game.js").use { input -> InputStreamReader(input, Charsets.UTF_8).readText() }
            cx.evaluateString(global, gameSource, "crow-game.js", 1, null)

            scope = global
            windowObject = ScriptableObject.getProperty(global, "window") as? Scriptable
            frameFunction = ScriptableObject.getProperty(global, "frame") as? Function
            androidBackFunction = ScriptableObject.getProperty(windowObject, "androidBack") as? Function
            androidPauseFunction = ScriptableObject.getProperty(windowObject, "androidPause") as? Function
            androidResumeFunction = ScriptableObject.getProperty(windowObject, "androidResume") as? Function
            initialized = frameFunction != null
            if (!initialized) throw IllegalStateException("The game loop function was not initialized.")
        } catch (t: Throwable) {
            lastError = t.stackTraceToString()
            Log.e("CrowNative", "Game initialization failed", t)
        } finally {
            if (cx != null) JsContext.exit()
        }
    }

    fun updateSize(width: Int, height: Int) {
        if (!initialized || width <= 0 || height <= 0) return
        if (width == lastWidth && height == lastHeight) return
        lastWidth = width
        lastHeight = height
        val cx = JsContext.enter()
        try {
            cx.optimizationLevel = -1
            val s = scope ?: return
            ScriptableObject.putProperty(s, "innerWidth", width.toDouble())
            ScriptableObject.putProperty(s, "innerHeight", height.toDouble())
            bridge.dispatchWindow("resize")
        } catch (t: Throwable) {
            Log.e("CrowNative", "Resize failed", t)
        } finally { JsContext.exit() }
    }

    fun render(target: Canvas, width: Int, height: Int, frameTimeMs: Long) {
        if (!initialized) {
            drawErrorOrLoading(target, width, height)
            return
        }
        updateSize(width, height)
        val cx = JsContext.enter()
        try {
            cx.optimizationLevel = -1
            val fn = frameFunction ?: return
            fn.call(cx, scope, scope, arrayOf(frameTimeMs.toDouble()))
            val bmp: Bitmap = mainCanvas.bitmap
            val dst = android.graphics.Rect(0, 0, width, height)
            target.drawBitmap(bmp, null, dst, null)
        } catch (t: Throwable) {
            lastError = t.stackTraceToString()
            Log.e("CrowNative", "Frame failed", t)
            drawErrorOrLoading(target, width, height)
        } finally { JsContext.exit() }
    }

    private fun drawErrorOrLoading(canvas: Canvas, width: Int, height: Int) {
        canvas.drawColor(android.graphics.Color.rgb(5, 4, 9))
        val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.rgb(224, 215, 198)
            textSize = 22f
            textAlign = android.graphics.Paint.Align.CENTER
        }
        val label = if (lastError == null) "کلاغ — در حال آماده‌سازی" else "خطا در اجرای بازی؛ گزارش در Logcat موجود است"
        canvas.drawText(label, width / 2f, height / 2f, paint)
    }

    fun pointer(type: String, x: Float, y: Float, pointerId: Int, pointerType: String = "touch") {
        mainCanvas.dispatch(type, mapOf(
            "clientX" to x.toDouble(), "clientY" to y.toDouble(),
            "pointerId" to pointerId, "pointerType" to pointerType,
            "isPrimary" to (pointerId == 0)
        ))
    }

    fun key(type: String, code: String, repeat: Boolean = false) {
        bridge.dispatchWindow(type, mapOf("code" to code, "repeat" to repeat, "key" to code))
    }

    fun blur() { bridge.dispatchWindow("blur") }

    fun handleBack(): Boolean {
        val cx = JsContext.enter()
        return try {
            cx.optimizationLevel = -1
            val s = scope ?: return false
            val w = windowObject ?: return false
            val fn = ScriptableObject.getProperty(w, "androidBack") as? Function ?: return false
            val result = fn.call(cx, s, w, emptyArray())
            ContextBoolean.toBoolean(result)
        } catch (t: Throwable) {
            Log.e("CrowNative", "Back handling failed", t)
            false
        } finally { JsContext.exit() }
    }

    fun onPause() = callWindowFunction("androidPause")
    fun onResume() = callWindowFunction("androidResume")

    private fun callWindowFunction(name: String) {
        val cx = JsContext.enter()
        try {
            cx.optimizationLevel = -1
            val s = scope ?: return
            val w = windowObject ?: return
            val fn = ScriptableObject.getProperty(w, name) as? Function ?: return
            fn.call(cx, s, w, emptyArray())
        } catch (t: Throwable) {
            Log.w("CrowNative", "Lifecycle callback failed: $name", t)
        } finally { JsContext.exit() }
    }

    fun shutdown() { audio.shutdown() }

    private object ContextBoolean {
        fun toBoolean(value: Any?): Boolean = when (value) {
            is Boolean -> value
            else -> value?.toString()?.equals("true", true) == true
        }
    }
}
