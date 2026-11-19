package ir.crow.nativegame

import android.content.Context
import android.content.SharedPreferences
import android.os.SystemClock
import org.mozilla.javascript.BaseFunction
import org.mozilla.javascript.Context as JsContext
import org.mozilla.javascript.Function
import org.mozilla.javascript.NativeObject
import org.mozilla.javascript.Scriptable
import org.mozilla.javascript.ScriptableObject
import org.mozilla.javascript.Undefined
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

open class NativeEventTarget {
    private val listeners = ConcurrentHashMap<String, CopyOnWriteArrayList<Function>>()

    fun addEventListener(type: String, listener: Function) {
        val list = listeners[type] ?: CopyOnWriteArrayList<Function>().also { listeners[type] = it }
        list.add(listener)
    }

    fun dispatch(type: String, properties: Map<String, Any?> = emptyMap()) {
        val callbacks = listeners[type] ?: return
        for (callback in callbacks) {
            val scope = callback.parentScope ?: continue
            val cx = JsContext.enter()
            try {
                cx.optimizationLevel = -1
                val event = cx.newObject(scope)
                ScriptableObject.putProperty(event, "type", type)
                for ((key, value) in properties) {
                    val jsValue = when (value) {
                        null -> null
                        is String, is Number, is Boolean -> value
                        else -> JsContext.javaToJS(value, scope)
                    }
                    ScriptableObject.putProperty(event, key, jsValue)
                }
                val prevent = object : BaseFunction() {
                    override fun call(cx: JsContext, scope: Scriptable, thisObj: Scriptable, args: Array<out Any>): Any = Undefined.instance
                }
                prevent.parentScope = scope
                ScriptableObject.putProperty(event, "preventDefault", prevent)
                callback.call(cx, scope, scope, arrayOf(event))
            } catch (t: Throwable) {
                android.util.Log.e("CrowNative", "Event handler failed: $type", t)
            } finally {
                JsContext.exit()
            }
        }
    }
}

class NativeStyle {
    var cssText: String = ""
    var paddingTop: String = "0px"
    var paddingRight: String = "0px"
    var paddingBottom: String = "0px"
    var paddingLeft: String = "0px"
}

class NativeElement {
    val style = NativeStyle()
    var rel: String = ""
    var href: String = ""
    fun appendChild(child: Any?) {}
    fun remove() {}
}

class NativeEventBridge(
    private val appContext: Context,
    val mainCanvas: NativeCanvas,
    private val audio: NativeAudio
) {
    private val windowEvents = NativeEventTarget()
    private val documentEvents = NativeEventTarget()
    private val prefs: SharedPreferences = appContext.getSharedPreferences("crow_game_save", Context.MODE_PRIVATE)
    val body = NativeElement()
    val head = NativeElement()
    val documentElement = NativeElement()

    fun getElementById(id: String): NativeCanvas? = if (id == "c") mainCanvas else null
    fun createElement(tag: String): Any = if (tag.equals("canvas", true)) NativeCanvas(appContext) else NativeElement()

    fun addWindowListener(type: String, callback: Function) = windowEvents.addEventListener(type, callback)
    fun addDocumentListener(type: String, callback: Function) = documentEvents.addEventListener(type, callback)
    fun dispatchWindow(type: String, properties: Map<String, Any?> = emptyMap()) = windowEvents.dispatch(type, properties)
    fun dispatchDocument(type: String, properties: Map<String, Any?> = emptyMap()) = documentEvents.dispatch(type, properties)

    fun getItem(key: String): String? = try { prefs.getString(key, null) } catch (_: Throwable) { null }
    fun setItem(key: String, value: String) { prefs.edit().putString(key, value).apply() }
    fun removeItem(key: String) { prefs.edit().remove(key).apply() }
    fun clear() { prefs.edit().clear().apply() }

    fun pushState(state: Any?, title: String, url: String? = null) {}
    fun now(): Double = SystemClock.uptimeMillis().toDouble()
    fun audio(): NativeAudio = audio
}

class NativeMediaQuery(val matches: Boolean)
