package ir.crow.nativegame

import android.content.Context
import android.graphics.Canvas
import android.os.SystemClock
import android.util.AttributeSet
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.util.Log

class GameView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null
) : View(context, attrs) {
    val game = CrowEngine(context.applicationContext)
    @Volatile private var initStarted = false
    private var initThread: Thread? = null

    init {
        isFocusable = true
        isFocusableInTouchMode = true
        keepScreenOn = true
        setLayerType(View.LAYER_TYPE_SOFTWARE, null)
    }

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w <= 0 || h <= 0) return
        if (!initStarted) {
            initStarted = true
            initThread = Thread({
                game.initialize(w, h)
                postInvalidate()
            }, "Crow-Game-Init").apply { start() }
        } else {
            game.updateSize(w, h)
        }
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        game.render(canvas, width, height, SystemClock.uptimeMillis())
        postInvalidateOnAnimation()
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        val action = event.actionMasked
        when (action) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
                val index = event.actionIndex
                game.pointer("pointerdown", event.getX(index), event.getY(index), event.getPointerId(index))
            }
            MotionEvent.ACTION_MOVE -> {
                for (index in 0 until event.pointerCount) {
                    game.pointer("pointermove", event.getX(index), event.getY(index), event.getPointerId(index))
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> {
                val index = event.actionIndex
                game.pointer("pointerup", event.getX(index), event.getY(index), event.getPointerId(index))
            }
            MotionEvent.ACTION_CANCEL -> {
                for (index in 0 until event.pointerCount) {
                    game.pointer("pointercancel", event.getX(index), event.getY(index), event.getPointerId(index))
                }
            }
        }
        return true
    }

    fun handleBack(): Boolean = game.handleBack()

    override fun onKeyDown(keyCode: Int, event: KeyEvent): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) return handleBack()
        val code = keyCodeToCode(keyCode)
        if (code != null) {
            game.key("keydown", code, event.repeatCount > 0)
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent): Boolean {
        val code = keyCodeToCode(keyCode)
        if (code != null) {
            game.key("keyup", code, false)
            return true
        }
        return super.onKeyUp(keyCode, event)
    }

    private fun keyCodeToCode(keyCode: Int): String? = when (keyCode) {
        KeyEvent.KEYCODE_DPAD_LEFT -> "ArrowLeft"
        KeyEvent.KEYCODE_DPAD_RIGHT -> "ArrowRight"
        KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
        KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
        KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> "Enter"
        KeyEvent.KEYCODE_SPACE -> "Space"
        KeyEvent.KEYCODE_ESCAPE -> "Escape"
        KeyEvent.KEYCODE_DEL -> "Backspace"
        KeyEvent.KEYCODE_TAB -> "Tab"
        KeyEvent.KEYCODE_A -> "KeyA"
        KeyEvent.KEYCODE_D -> "KeyD"
        KeyEvent.KEYCODE_E -> "KeyE"
        KeyEvent.KEYCODE_F -> "KeyF"
        KeyEvent.KEYCODE_H -> "KeyH"
        KeyEvent.KEYCODE_I -> "KeyI"
        KeyEvent.KEYCODE_M -> "KeyM"
        KeyEvent.KEYCODE_P -> "KeyP"
        KeyEvent.KEYCODE_S -> "KeyS"
        in KeyEvent.KEYCODE_1..KeyEvent.KEYCODE_9 -> "Digit${keyCode - KeyEvent.KEYCODE_0}"
        else -> null
    }
}
