package ir.crow.nativegame

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.RadialGradient
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.text.TextPaint
import android.util.Log
import org.mozilla.javascript.Context as JsContext
import org.mozilla.javascript.Function
import org.mozilla.javascript.Scriptable
import org.mozilla.javascript.ScriptableObject
import org.mozilla.javascript.BaseFunction
import org.mozilla.javascript.Undefined
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

class NativeCanvas(private val androidContext: Context, initialWidth: Int = 1, initialHeight: Int = 1) : NativeEventTarget() {
    @Volatile var width: Int = initialWidth.coerceAtLeast(1)
        set(value) { field = value.coerceIn(1, 4096); recreate() }
    @Volatile var height: Int = initialHeight.coerceAtLeast(1)
        set(value) { field = value.coerceIn(1, 4096); recreate() }

    @Volatile var bitmap: Bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        private set
    @Volatile var nativeCanvas: Canvas = Canvas(bitmap)
        private set
    private var context2d: NativeCanvasContext? = null

    @Synchronized private fun recreate() {
        try { if (!bitmap.isRecycled) bitmap.recycle() } catch (_: Throwable) {}
        bitmap = Bitmap.createBitmap(width.coerceAtLeast(1), height.coerceAtLeast(1), Bitmap.Config.ARGB_8888)
        nativeCanvas = Canvas(bitmap)
        context2d?.resetAfterResize()
    }

    fun getContext(type: String): NativeCanvasContext? {
        if (type != "2d") return null
        if (context2d == null) context2d = NativeCanvasContext(androidContext, this)
        return context2d
    }

    fun getBoundingClientRect(): NativeRect = NativeRect(0.0, 0.0, width.toDouble(), height.toDouble())
    fun focus() {}
}

class NativeRect(val left: Double, val top: Double, val width: Double, val height: Double) {
    val right: Double get() = left + width
    val bottom: Double get() = top + height
    val x: Double get() = left
    val y: Double get() = top
}

class NativeGradient(private val kind: Int, private val coords: DoubleArray) {
    private val colors = ArrayList<Int>()
    private val positions = ArrayList<Float>()

    fun addColorStop(offset: Double, color: String) {
        val p = offset.coerceIn(0.0, 1.0).toFloat()
        val c = CssColor.parse(color)
        val at = positions.indexOfFirst { it > p }.let { if (it < 0) positions.size else it }
        positions.add(at, p)
        colors.add(at, c)
    }

    fun toShader(): Shader? {
        if (colors.isEmpty()) return null
        val cs = colors.toIntArray()
        val ps = if (positions.size == 1) floatArrayOf(0f, 1f) else positions.toFloatArray()
        val cc = if (positions.size == 1) intArrayOf(cs[0], cs[0]) else cs
        return try {
            if (kind == 0) {
                LinearGradient(coords[0].toFloat(), coords[1].toFloat(), coords[2].toFloat(), coords[3].toFloat(), cc, ps, Shader.TileMode.CLAMP)
            } else {
                val radius = max(0.001, coords[5] - coords[2]).toFloat()
                RadialGradient(coords[3].toFloat(), coords[4].toFloat(), radius, cc, ps, Shader.TileMode.CLAMP)
            }
        } catch (_: Throwable) { null }
    }
}

class NativeImageData(val width: Int, val height: Int, val data: IntArray)
class NativeTextMetrics(val width: Double)

class NativeCanvasContext(private val androidContext: Context, private val owner: NativeCanvas) {
    val canvas: NativeCanvas get() = owner

    var fillStyle: Any? = "#000000"
    var strokeStyle: Any? = "#000000"
    var globalAlpha: Double = 1.0
    var globalCompositeOperation: String = "source-over"
    var imageSmoothingEnabled: Boolean = true
    var lineWidth: Double = 1.0
    var lineCap: String = "butt"
    var lineJoin: String = "miter"
    var miterLimit: Double = 10.0
    var textAlign: String = "start"
    var textBaseline: String = "alphabetic"
    var direction: String = "inherit"
    var font: String = "10px sans-serif"
    var shadowBlur: Double = 0.0
    var shadowColor: String = "rgba(0,0,0,0)"
    var filter: String = "none"

    private var path = Path()
    private val saved = ArrayDeque<CanvasState>()
    private var dash: FloatArray? = null
    private var plasmaTypeface: Typeface? = null
    private var vazirTypeface: Typeface? = null

    private data class CanvasState(
        val fillStyle: Any?, val strokeStyle: Any?, val globalAlpha: Double,
        val composite: String, val imageSmoothing: Boolean, val lineWidth: Double,
        val lineCap: String, val lineJoin: String, val miterLimit: Double,
        val textAlign: String, val textBaseline: String, val direction: String,
        val font: String, val shadowBlur: Double, val shadowColor: String, val filter: String, val dash: FloatArray?
    )

    fun resetAfterResize() {
        path = Path()
        saved.clear()
        fillStyle = "#000000"
        strokeStyle = "#000000"
        globalAlpha = 1.0
        globalCompositeOperation = "source-over"
        imageSmoothingEnabled = true
        lineWidth = 1.0
        lineCap = "butt"
        lineJoin = "miter"
        miterLimit = 10.0
        textAlign = "start"
        textBaseline = "alphabetic"
        direction = "inherit"
        font = "10px sans-serif"
        shadowBlur = 0.0
        shadowColor = "rgba(0,0,0,0)"
        filter = "none"
        dash = null
    }

    fun beginPath() { path = Path() }
    fun closePath() { path.close() }
    fun moveTo(x: Double, y: Double) { path.moveTo(x.toFloat(), y.toFloat()) }
    fun lineTo(x: Double, y: Double) { path.lineTo(x.toFloat(), y.toFloat()) }
    fun bezierCurveTo(a: Double, b: Double, c: Double, d: Double, x: Double, y: Double) {
        path.cubicTo(a.toFloat(), b.toFloat(), c.toFloat(), d.toFloat(), x.toFloat(), y.toFloat())
    }
    fun quadraticCurveTo(a: Double, b: Double, x: Double, y: Double) {
        path.quadTo(a.toFloat(), b.toFloat(), x.toFloat(), y.toFloat())
    }
    fun rect(x: Double, y: Double, w: Double, h: Double) { path.addRect(x.toFloat(), y.toFloat(), (x + w).toFloat(), (y + h).toFloat(), Path.Direction.CW) }
    @JvmOverloads fun arc(x: Double, y: Double, radius: Double, start: Double, end: Double, anticlockwise: Boolean = false) {
        val r = max(0.0, radius)
        var sweep = Math.toDegrees(end - start).toFloat()
        if (anticlockwise && sweep > 0) sweep -= 360f
        if (!anticlockwise && sweep < 0) sweep += 360f
        if (abs(sweep) > 360f) sweep = if (sweep < 0) -360f else 360f
        val oval = RectF((x - r).toFloat(), (y - r).toFloat(), (x + r).toFloat(), (y + r).toFloat())
        path.arcTo(oval, Math.toDegrees(start).toFloat(), sweep, path.isEmpty)
    }
    @JvmOverloads fun ellipse(x: Double, y: Double, radiusX: Double, radiusY: Double, rotation: Double, start: Double, end: Double, anticlockwise: Boolean = false) {
        val rx = max(0.0, radiusX); val ry = max(0.0, radiusY)
        var sweep = Math.toDegrees(end - start).toFloat()
        if (anticlockwise && sweep > 0) sweep -= 360f
        if (!anticlockwise && sweep < 0) sweep += 360f
        val temp = Path()
        val oval = RectF(-rx.toFloat(), -ry.toFloat(), rx.toFloat(), ry.toFloat())
        temp.arcTo(oval, Math.toDegrees(start).toFloat(), sweep, true)
        val matrix = Matrix().apply {
            setRotate(Math.toDegrees(rotation).toFloat())
            postTranslate(x.toFloat(), y.toFloat())
        }
        temp.transform(matrix)
        path.addPath(temp)
    }

    fun fill() { owner.nativeCanvas.drawPath(path, makePaint(fillStyle, Paint.Style.FILL)) }
    fun stroke() { owner.nativeCanvas.drawPath(path, makePaint(strokeStyle, Paint.Style.STROKE)) }
    fun clip() { owner.nativeCanvas.clipPath(path) }
    fun fillRect(x: Double, y: Double, w: Double, h: Double) {
        owner.nativeCanvas.drawRect(x.toFloat(), y.toFloat(), (x + w).toFloat(), (y + h).toFloat(), makePaint(fillStyle, Paint.Style.FILL))
    }
    fun strokeRect(x: Double, y: Double, w: Double, h: Double) {
        owner.nativeCanvas.drawRect(x.toFloat(), y.toFloat(), (x + w).toFloat(), (y + h).toFloat(), makePaint(strokeStyle, Paint.Style.STROKE))
    }
    fun clearRect(x: Double, y: Double, w: Double, h: Double) {
        val p = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.CLEAR) }
        owner.nativeCanvas.drawRect(x.toFloat(), y.toFloat(), (x + w).toFloat(), (y + h).toFloat(), p)
    }

    fun save() { owner.nativeCanvas.save(); saved.addLast(snapshot()) }
    fun restore() {
        if (saved.isNotEmpty()) {
            owner.nativeCanvas.restore()
            applyState(saved.removeLast())
        }
    }

    fun translate(x: Double, y: Double) { owner.nativeCanvas.translate(x.toFloat(), y.toFloat()) }
    fun scale(x: Double, y: Double) { owner.nativeCanvas.scale(x.toFloat(), y.toFloat()) }
    fun rotate(angle: Double) { owner.nativeCanvas.rotate(Math.toDegrees(angle).toFloat()) }
    fun rotate(angle: Double, x: Double, y: Double) { owner.nativeCanvas.rotate(Math.toDegrees(angle).toFloat(), x.toFloat(), y.toFloat()) }
    fun setTransform(a: Double, b: Double, c: Double, d: Double, e: Double, f: Double) {
        val matrix = Matrix().apply { setValues(floatArrayOf(a.toFloat(), c.toFloat(), e.toFloat(), b.toFloat(), d.toFloat(), f.toFloat(), 0f, 0f, 1f)) }
        owner.nativeCanvas.setMatrix(matrix)
    }
    fun transform(a: Double, b: Double, c: Double, d: Double, e: Double, f: Double) {
        val matrix = Matrix().apply { setValues(floatArrayOf(a.toFloat(), c.toFloat(), e.toFloat(), b.toFloat(), d.toFloat(), f.toFloat(), 0f, 0f, 1f)) }
        owner.nativeCanvas.concat(matrix)
    }
    fun setLineDash(values: Any?) {
        val list = ArrayList<Float>()
        when (values) {
            is DoubleArray -> values.forEach { list.add(it.toFloat()) }
            is FloatArray -> values.forEach { list.add(it) }
            is Scriptable -> {
                val length = (ScriptableObject.getProperty(values, "length") as? Number)?.toInt() ?: 0
                for (i in 0 until min(length, 32)) (ScriptableObject.getProperty(values, i) as? Number)?.let { list.add(it.toFloat()) }
            }
        }
        dash = if (list.size >= 2) list.toFloatArray() else null
    }

    fun createLinearGradient(x0: Double, y0: Double, x1: Double, y1: Double): NativeGradient = NativeGradient(0, doubleArrayOf(x0, y0, x1, y1))
    fun createRadialGradient(x0: Double, y0: Double, r0: Double, x1: Double, y1: Double, r1: Double): NativeGradient = NativeGradient(1, doubleArrayOf(x0, y0, r0, x1, y1, r1))

    fun drawImage(image: NativeCanvas, dx: Double, dy: Double) {
        val src = image.bitmap
        drawBitmap(src, null, RectF(dx.toFloat(), dy.toFloat(), (dx + src.width).toFloat(), (dy + src.height).toFloat()))
    }
    fun drawImage(image: NativeCanvas, dx: Double, dy: Double, dw: Double, dh: Double) {
        drawBitmap(image.bitmap, null, RectF(dx.toFloat(), dy.toFloat(), (dx + dw).toFloat(), (dy + dh).toFloat()))
    }
    fun drawImage(image: NativeCanvas, sx: Double, sy: Double, sw: Double, sh: Double, dx: Double, dy: Double, dw: Double, dh: Double) {
        val src = image.bitmap
        val srcRect = Rect(sx.toInt().coerceIn(0, src.width), sy.toInt().coerceIn(0, src.height), (sx + sw).toInt().coerceIn(0, src.width), (sy + sh).toInt().coerceIn(0, src.height))
        if (srcRect.width() <= 0 || srcRect.height() <= 0) return
        drawBitmap(src, srcRect, RectF(dx.toFloat(), dy.toFloat(), (dx + dw).toFloat(), (dy + dh).toFloat()))
    }
    private fun drawBitmap(bmp: Bitmap, src: Rect?, dst: RectF) {
        val p = makePaint("#ffffff", Paint.Style.FILL)
        p.isFilterBitmap = imageSmoothingEnabled
        owner.nativeCanvas.drawBitmap(bmp, src, dst, p)
    }

    fun createImageData(w: Double, h: Double): NativeImageData {
        val ww = w.toInt().coerceIn(1, 2048); val hh = h.toInt().coerceIn(1, 2048)
        return NativeImageData(ww, hh, IntArray(ww * hh * 4))
    }
    fun getImageData(x: Double, y: Double, w: Double, h: Double): NativeImageData {
        val ww = w.toInt().coerceIn(1, 2048); val hh = h.toInt().coerceIn(1, 2048)
        val pixels = IntArray(ww * hh)
        val bmp = owner.bitmap
        for (py in 0 until hh) for (px in 0 until ww) {
            val bx = x.toInt() + px; val by = y.toInt() + py
            pixels[py * ww + px] = if (bx in 0 until bmp.width && by in 0 until bmp.height) bmp.getPixel(bx, by) else Color.TRANSPARENT
        }
        val channels = IntArray(ww * hh * 4)
        for (i in pixels.indices) {
            val c = pixels[i]; val k = i * 4
            channels[k] = Color.red(c); channels[k + 1] = Color.green(c); channels[k + 2] = Color.blue(c); channels[k + 3] = Color.alpha(c)
        }
        return NativeImageData(ww, hh, channels)
    }
    fun putImageData(data: NativeImageData, dx: Double, dy: Double) {
        val colors = IntArray(data.width * data.height)
        for (i in colors.indices) {
            val k = i * 4
            val r = data.data.getOrElse(k) { 0 }.coerceIn(0, 255)
            val g = data.data.getOrElse(k + 1) { 0 }.coerceIn(0, 255)
            val b = data.data.getOrElse(k + 2) { 0 }.coerceIn(0, 255)
            val a = data.data.getOrElse(k + 3) { 0 }.coerceIn(0, 255)
            colors[i] = Color.argb(a, r, g, b)
        }
        val bmp = owner.bitmap
        val left = dx.toInt(); val top = dy.toInt()
        for (row in 0 until data.height) {
            val sy = top + row
            if (sy !in 0 until bmp.height) continue
            val start = max(0, -left); val end = min(data.width, bmp.width - left)
            if (start < end) bmp.setPixels(colors, row * data.width + start, data.width, left + start, sy, end - start, 1)
        }
    }

    fun measureText(text: String): NativeTextMetrics = NativeTextMetrics(makeTextPaint().measureText(text).toDouble())
    @JvmOverloads fun fillText(text: String, x: Double, y: Double, maxWidth: Double = 0.0) = drawText(text, x, y, maxWidth, fillStyle, Paint.Style.FILL)
    @JvmOverloads fun strokeText(text: String, x: Double, y: Double, maxWidth: Double = 0.0) = drawText(text, x, y, maxWidth, strokeStyle, Paint.Style.STROKE)

    private fun drawText(text: String, x: Double, y: Double, maxWidth: Double, style: Any?, paintStyle: Paint.Style) {
        val p = makeTextPaint().apply {
            this.style = paintStyle
            if (paintStyle == Paint.Style.STROKE) strokeWidth = lineWidth.toFloat()
            if (style is NativeGradient) {
                shader = style.toShader()
                alpha = (255 * globalAlpha.coerceIn(0.0, 1.0)).toInt()
            } else {
                val parsed = CssColor.parse(style?.toString() ?: "#ffffff")
                color = parsed
                alpha = (Color.alpha(parsed) * globalAlpha.coerceIn(0.0, 1.0)).toInt()
            }
        }
        p.xfermode = PorterDuffXfermode(blendMode(globalCompositeOperation))
        if (shadowBlur > 0.1 && CssColor.alpha(CssColor.parse(shadowColor)) > 0) {
            p.setShadowLayer(shadowBlur.toFloat(), 0f, 0f, CssColor.parse(shadowColor))
        }
        applyCanvasFilter(p)
        val measuredWidth = p.measureText(text).toDouble()
        val save = owner.nativeCanvas.save()
        if (maxWidth > 0.0 && measuredWidth > maxWidth) owner.nativeCanvas.scale((maxWidth / measuredWidth).toFloat(), 1f, x.toFloat(), y.toFloat())
        val metrics = p.fontMetrics
        val baseline = when (textBaseline) {
            "top", "hanging" -> y.toFloat() - metrics.ascent
            "middle" -> y.toFloat() - (metrics.ascent + metrics.descent) / 2f
            "bottom", "ideographic" -> y.toFloat() - metrics.descent
            else -> y.toFloat()
        }
        val rtl = direction == "rtl" || (direction == "inherit" && text.any { it in '\u0590'..'\u08ff' })
        if (android.os.Build.VERSION.SDK_INT >= 23) {
            owner.nativeCanvas.drawTextRun(text, 0, text.length, 0, text.length, x.toFloat(), baseline, rtl, p)
        } else {
            owner.nativeCanvas.drawText(text, x.toFloat(), baseline, p)
        }
        owner.nativeCanvas.restoreToCount(save)
    }

    private fun makeTextPaint(): TextPaint {
        val sizeMatch = Regex("([0-9]+(?:\\.[0-9]+)?)px").find(font)
        val size = sizeMatch?.groupValues?.get(1)?.toFloatOrNull() ?: 10f
        val isBold = font.contains("bold", ignoreCase = true)
        val isItalic = font.contains("italic", ignoreCase = true)
        val style = when { isBold && isItalic -> Typeface.BOLD_ITALIC; isBold -> Typeface.BOLD; isItalic -> Typeface.ITALIC; else -> Typeface.NORMAL }
        val face = when {
            font.contains("PlasmaDots", true) -> plasmaTypeface ?: Typeface.createFromAsset(androidContext.assets, "fonts/PlasmaDots.ttf").also { plasmaTypeface = it }
            font.contains("VazirSign", true) -> vazirTypeface ?: Typeface.createFromAsset(androidContext.assets, "fonts/VazirSign.ttf").also { vazirTypeface = it }
            else -> Typeface.create("sans-serif", style)
        }
        return TextPaint(Paint.ANTI_ALIAS_FLAG or Paint.SUBPIXEL_TEXT_FLAG).apply {
            typeface = Typeface.create(face, style)
            textSize = size
            textAlign = when (this@NativeCanvasContext.textAlign) {
                "center" -> Paint.Align.CENTER
                "right", "end" -> Paint.Align.RIGHT
                else -> Paint.Align.LEFT
            }
        }
    }

    private fun makePaint(styleValue: Any?, paintStyle: Paint.Style): Paint {
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = paintStyle
            alpha = (255 * globalAlpha.coerceIn(0.0, 1.0)).toInt()
            strokeWidth = lineWidth.toFloat().coerceAtLeast(0.1f)
            strokeCap = when (lineCap) { "round" -> Paint.Cap.ROUND; "square" -> Paint.Cap.SQUARE; else -> Paint.Cap.BUTT }
            strokeJoin = when (lineJoin) { "round" -> Paint.Join.ROUND; "bevel" -> Paint.Join.BEVEL; else -> Paint.Join.MITER }
            strokeMiter = miterLimit.toFloat()
            isFilterBitmap = imageSmoothingEnabled
            if (dash != null) pathEffect = DashPathEffect(dash, 0f)
            when (styleValue) {
                is NativeGradient -> {
                    shader = styleValue.toShader()
                    alpha = (255 * globalAlpha.coerceIn(0.0, 1.0)).toInt()
                }
                else -> {
                    val parsed = CssColor.parse(styleValue?.toString() ?: "#ffffff")
                    color = parsed
                    alpha = (Color.alpha(parsed) * globalAlpha.coerceIn(0.0, 1.0)).toInt()
                }
            }
            xfermode = PorterDuffXfermode(blendMode(globalCompositeOperation))
            if (shadowBlur > 0.1 && CssColor.alpha(CssColor.parse(shadowColor)) > 0) {
                setShadowLayer(shadowBlur.toFloat(), 0f, 0f, CssColor.parse(shadowColor))
            }
            applyCanvasFilter(this)
        }
        return p
    }

    private fun applyCanvasFilter(paint: Paint) {
        val blur = Regex("blur\\(([0-9]+(?:\\.[0-9]+)?)px\\)", RegexOption.IGNORE_CASE)
            .find(filter)?.groupValues?.get(1)?.toFloatOrNull()
        paint.maskFilter = if (blur != null && blur > 0f) BlurMaskFilter(blur.coerceAtMost(32f), BlurMaskFilter.Blur.NORMAL) else null
    }

    private fun blendMode(name: String): PorterDuff.Mode = when (name) {
        "destination-out" -> PorterDuff.Mode.DST_OUT
        "destination-in" -> PorterDuff.Mode.DST_IN
        "source-in" -> PorterDuff.Mode.SRC_IN
        "source-out" -> PorterDuff.Mode.SRC_OUT
        "destination-over" -> PorterDuff.Mode.DST_OVER
        "multiply" -> PorterDuff.Mode.MULTIPLY
        "screen" -> PorterDuff.Mode.SCREEN
        "lighter" -> PorterDuff.Mode.ADD
        else -> PorterDuff.Mode.SRC_OVER
    }

    private fun snapshot() = CanvasState(fillStyle, strokeStyle, globalAlpha, globalCompositeOperation, imageSmoothingEnabled, lineWidth, lineCap, lineJoin, miterLimit, textAlign, textBaseline, direction, font, shadowBlur, shadowColor, filter, dash?.clone())
    private fun applyState(s: CanvasState) {
        fillStyle = s.fillStyle; strokeStyle = s.strokeStyle; globalAlpha = s.globalAlpha
        globalCompositeOperation = s.composite; imageSmoothingEnabled = s.imageSmoothing
        lineWidth = s.lineWidth; lineCap = s.lineCap; lineJoin = s.lineJoin; miterLimit = s.miterLimit
        textAlign = s.textAlign; textBaseline = s.textBaseline; direction = s.direction
        font = s.font; shadowBlur = s.shadowBlur; shadowColor = s.shadowColor; filter = s.filter; dash = s.dash
    }
}

internal object CssColor {
    fun parse(input: String): Int {
        val value = input.trim().lowercase()
        return try {
            when {
                value == "transparent" -> Color.TRANSPARENT
                value.startsWith("rgba(") || value.startsWith("rgb(") -> {
                    val inside = value.substringAfter('(').substringBeforeLast(')')
                    val parts = inside.split(',').map { it.trim() }
                    val r = channel(parts.getOrElse(0) { "0" }); val g = channel(parts.getOrElse(1) { "0" }); val b = channel(parts.getOrElse(2) { "0" })
                    val a = if (parts.size > 3) alpha(parts[3]) else 255
                    Color.argb(a, r, g, b)
                }
                value.matches(Regex("#[0-9a-f]{3}")) -> Color.parseColor("#" + value.substring(1).map { "$it$it" }.joinToString(""))
                value.matches(Regex("#[0-9a-f]{4}")) -> {
                    val v = value.substring(1).map { "$it$it" }.joinToString("")
                    Color.parseColor("#" + v)
                }
                else -> Color.parseColor(value)
            }
        } catch (_: Throwable) { Color.WHITE }
    }
    private fun channel(raw: String): Int = raw.toDoubleOrNull()?.let { if (raw.endsWith("%")) (it * 2.55).toInt() else it.toInt() }?.coerceIn(0, 255) ?: 0
    private fun alpha(raw: String): Int = raw.toDoubleOrNull()?.let { if (it <= 1.0) (it * 255).toInt() else it.toInt() }?.coerceIn(0, 255) ?: 255
    fun alpha(color: Int): Int = Color.alpha(color)
}
