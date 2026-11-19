'use strict';
/* =====================================================================
   کلاغ — Crow
   A self-contained neo-noir pixel detective game.
   Canvas 2D (320x180 internal) + Web Audio. No external assets.
   ===================================================================== */
// ---------- core setup ----------
var WB = 320, WMAX = 432, H = 180, FLOOR = 160; // the world is 180 px tall; its width follows the screen (320 at 16:9, up to 432)
var W = WB;
var SIGN_FONT = "VazirSign, Vazirmatn, Vazir, Tahoma, sans-serif"; // crisp enough for tiny pixel signs
var FONT = "PlasmaDots, Vazirmatn, Vazir, 'Noto Naskh Arabic', 'Noto Sans Arabic', Tahoma, 'Segoe UI', 'Geeza Pro', Arial, sans-serif";
var cv = document.getElementById('c');
var ctx = cv.getContext('2d');
function mk(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
var _a = mk(WMAX, H), low = _a[0], sctx = _a[1]; // low-res scene buffer (only the first W columns are shown)
var _b = mk(WMAX, H), lightC = _b[0], lctx = _b[1]; // light map (multiplied over scene)
var _c = mk(WB, H), miniC = _c[0], mictx = _c[1]; // close-ups are drawn 320 wide, then centred
var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
var lerp = function (a, b, t) { return a + (b - a) * t; };
var angDiff = function (a, b) { var d = a - b; while (d > Math.PI)
    d -= 2 * Math.PI; while (d < -Math.PI)
    d += 2 * Math.PI; return d; };
function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
var FA_DIG = '۰۱۲۳۴۵۶۷۸۹';
var toFa = function (s) { return String(s).replace(/\d/g, function (d) { return FA_DIG[d]; }); };
var rgba = function (c, a) { return "rgba(".concat(c[0], ",").concat(c[1], ",").concat(c[2], ",").concat(a, ")"); };
function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16);
    var r = clamp(((n >> 16) & 255) * k | 0, 0, 255), g = clamp(((n >> 8) & 255) * k | 0, 0, 255), b = clamp((n & 255) * k | 0, 0, 255);
    return "rgb(".concat(r, ",").concat(g, ",").concat(b, ")");
}
// ---------- native audio adapter (Android AudioTrack) ----------
var A = { appPaused: false, ctx: { state: 'running', currentTime: 0, suspend: function () { A.appPaused = true; NativeSound.setMuted(true); }, resume: function () { A.appPaused = false; NativeSound.setMuted(A.muted); } }, master: null, muted: false };
function audioOK() { return !A.muted; }
function initAudio() { try {
    NativeSound.start();
}
catch (e) { } }
function noiseHit(t, dur, type, freq, q, gain, dest) { try {
    NativeSound.play('noise', gain || 0.04, freq || 1800, Math.max(0, (t || 0) - A.ctx.currentTime));
}
catch (e) { } }
function tone(t, freq, dur, type, gain, dest, slide) { try {
    NativeSound.play('tone', gain || 0.04, freq || 440, Math.max(0, (t || 0) - A.ctx.currentTime));
}
catch (e) { } }
var lastClick = 0;
var sfx = {
    step: function () { NativeSound.play('step', 0.55); },
    stepIn: function () { NativeSound.play('stepIn', 0.35); },
    click: function () { NativeSound.play('click', 0.25); },
    inspect: function () { NativeSound.play('inspect', 0.5); },
    choose: function () { NativeSound.play('choose', 0.35); },
    clue: function () { NativeSound.play('clue', 0.65); },
    reveal: function () { NativeSound.play('reveal', 0.4); },
    whoosh: function () { NativeSound.play('whoosh', 0.45); },
    crackle: function (v) { NativeSound.play('crackle', v || 0.2); },
    toggle: function () { NativeSound.play('toggle', 0.3); },
    ending: function (good) { NativeSound.play(good ? 'endingGood' : 'endingBad', 0.55); },
    paper: function () { NativeSound.play('paper', 0.25); },
    beep: function (f) { NativeSound.play('beep', 0.25, f || 660); },
    okChime: function () { NativeSound.play('ok', 0.45); },
    buzz: function () { NativeSound.play('buzz', 0.35); },
    dotmatrix: function (v) { NativeSound.play('dotmatrix', v || 0.5); },
    clunk: function () { NativeSound.play('clunk', 0.4); },
    rip: function () { NativeSound.play('rip', 0.4); }
};
function audioUpdate(dt) {
    try {
        NativeSound.ambient(G.sceneId || 'alley', G.state || 'title', A.muted || A.appPaused, G.t || 0);
    }
    catch (e) { }
    if (!audioOK())
        return;
    var t = A.ctx.currentTime;
    var indoor = G.sceneId === 'station' && G.state !== 'title';
    if (G.sceneId === 'alley' && G.state === 'play') {
        var d = Math.abs(P.x - 76), v = clamp(1 - d / 160, 0, 1);
        if (v > 0 && Math.random() < dt * 14)
            sfx.crackle(0.05 * v + 0.01);
    }
    if (indoor && G.state === 'play' && !G.mini) {
        var v = clamp(1 - Math.abs(P.x - 390) / 200, 0, 1);
        if (v > 0 && Math.random() < dt * 6)
            noiseHit(t, 0.04 + Math.random() * 0.1, 'bandpass', 1200 + Math.random() * 1800, 1.5, 0.02 * v + 0.004);
        var sec = Math.floor(G.t), cvol = clamp(1 - Math.abs(P.x - 301) / 170, 0, 1);
        if (sec !== A.lastTick) {
            A.lastTick = sec;
            if (cvol > 0)
                tone(t, sec % 2 ? 2600 : 2200, 0.015, 'square', 0.018 * cvol);
        }
    }
}
function setMuted(m) { A.muted = !!m; NativeSound.setMuted(A.muted); }
// ---------- procedural pixel-art helpers ----------
function R(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x | 0, y | 0, w | 0, h | 0); }
function brickWall(g, x0, y0, w, h, base, seed) {
    var r = rng(seed);
    g.save();
    g.beginPath();
    g.rect(x0, y0, w, h);
    g.clip();
    R(g, x0, y0, w, h, shade(base, 0.42));
    for (var row = 0, y = y0; y < y0 + h; row++, y += 4) {
        var off = (row % 2) * 4;
        for (var x = x0 - off; x < x0 + w; x += 8) {
            var k = 0.78 + r() * 0.3 - (r() < 0.07 ? 0.25 : 0);
            R(g, x, y, 7, 3, shade(base, k));
            if (r() < 0.25)
                R(g, x, y, 7, 1, shade(base, k * 1.13));
        }
    }
    for (var i = 0; i < w / 5; i++) {
        g.fillStyle = 'rgba(8,6,12,0.2)';
        g.fillRect(x0 + r() * w | 0, y0 + r() * h * 0.5 | 0, 1, 6 + r() * 34 | 0);
    }
    g.restore();
}
function roofEdge(g, x, w, top, r) {
    R(g, x, top, w, 3, '#2a2228');
    R(g, x, top + 3, w, 1, '#171217');
    R(g, x, top - 2, w, 2, '#cfd8ea');
    R(g, x, top - 3, w, 1, '#aeb8cf');
    for (var i = x + 2; i < x + w - 2; i += 2 + (r() * 5 | 0))
        R(g, i, top + 4, 1, 1 + (r() * 4 | 0), '#b9c6dc');
}
function win(g, e, x, y, w, h, r, lit) {
    R(g, x - 1, y - 1, w + 2, h + 2, '#141016');
    R(g, x, y, w, h, '#1c2334');
    R(g, x, y + (h >> 1), w, 1, '#141016');
    R(g, x + (w >> 1), y, 1, h, '#141016');
    R(g, x - 2, y + h + 1, w + 4, 1, '#5d5662');
    R(g, x - 2, y + h, w + 4, 1, '#d7dfee');
    if (lit) {
        var warm = r() < 0.72, c = warm ? ['#d9a255', '#a8713a'] : ['#7d97e0', '#4b62a8'];
        R(e, x, y, w, h, c[0]);
        R(e, x, y + (h >> 1), w, 1, '#3a2a1c');
        R(e, x + (w >> 1), y, 1, h, '#3a2a1c');
        R(e, x, y, 2, h, c[1]);
        R(e, x + w - 2, y, 2, h, c[1]);
        if (r() < 0.35) {
            R(e, x + 3, y + h - 7, 3, 7, '#241810');
            R(e, x + 3, y + h - 9, 3, 2, '#241810');
        }
    }
}
function pixText(text, size, color, weight) {
    var f = "".concat(weight || 'bold', " ").concat(size, "px ").concat(SIGN_FONT);
    var _a = mk(4, 4), mx = _a[1];
    mx.font = f;
    var w = Math.ceil(mx.measureText(text).width) + 4, h = Math.ceil(size * 1.7) + 2;
    var _b = mk(w, h), c = _b[0], g = _b[1];
    g.font = f;
    g.direction = 'rtl';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    g.fillStyle = '#fff';
    g.fillText(text, w - 2, h / 2);
    var id = g.getImageData(0, 0, w, h), d = id.data;
    for (var i = 3; i < d.length; i += 4)
        d[i] = d[i] > 80 ? 255 : 0;
    g.putImageData(id, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    return c;
}
function groundSnow(g, x0, w, seed, top) {
    var r = rng(seed);
    top = top || 146;
    for (var y = top; y < H; y++) {
        var k = (y - top) / (H - top);
        g.fillStyle = "rgb(".concat(lerp(142, 196, k) | 0, ",").concat(lerp(150, 204, k) | 0, ",").concat(lerp(176, 224, k) | 0, ")");
        g.fillRect(x0, y, w, 1);
    }
    for (var x = x0; x < x0 + w; x++) { // drift piled against the wall
        var h = 2 + Math.round(3 * (Math.sin(x * 0.07 + seed) * 0.5 + 0.5) + r() * 1.4);
        R(g, x, top - h, 1, h, '#a9b2cb');
        R(g, x, top - h, 1, 1, '#c8d0e3');
    }
    for (var i = 0; i < w * 3; i++)
        R(g, x0 + r() * w, top + r() * (H - top), 1, 1, r() < 0.5 ? '#98a2bf' : '#e4eaf5');
}
function makeScene(id, w, name) {
    var _a = mk(w, H), bg = _a[0], bgx = _a[1], _b = mk(w, H), em = _b[0], emx = _b[1], _c = mk(w, H), sky = _c[0], skyx = _c[1];
    skyx.fillStyle = '#fff';
    return { id: id, w: w, name: name, bg: bg, bgx: bgx, em: em, emx: emx, sky: sky, skyx: skyx, occ: [], lights: [], targets: [] };
}
// ---------- scene 1: the snowy crime alley ----------
function buildAlley() {
    var S = makeScene('alley', 680, 'کوچه‌ی پشتی ویدئو کلوپ'), g = S.bgx, e = S.emx, r = rng(1375);
    var blds = [
        { x: 0, w: 150, top: 40, col: '#5a3a38' }, { x: 150, w: 120, top: 24, col: '#4a3a46' },
        { x: 270, w: 125, top: 52, col: '#5b4436' }, { x: 395, w: 150, top: 32, col: '#473840' },
        { x: 545, w: 100, top: 58, col: '#533d34' }
    ];
    for (var _i = 0, blds_1 = blds; _i < blds_1.length; _i++) {
        var b = blds_1[_i];
        S.skyx.fillRect(b.x, 0, b.w, b.top - 3);
        brickWall(g, b.x, b.top, b.w, 146 - b.top, b.col, b.x * 7 + 3);
        roofEdge(g, b.x, b.w, b.top, r);
        R(g, b.x, b.top, 1, 146 - b.top, 'rgba(0,0,0,0.35)'); // building seam
        for (var y = b.top + 14; y < 104; y += 30)
            for (var x = b.x + 12; x < b.x + b.w - 16; x += 26 + (r() * 10 | 0)) {
                if ((b.x === 150 && x > 150 && x < 262 && y > 50) || (b.x === 545 && y > 90))
                    continue;
                win(g, e, x, y, 10, 14, r, r() < 0.33);
            }
    }
    // exit to the street: a gap with a distant, neon-washed facade
    S.skyx.fillRect(645, 0, 35, 70);
    R(g, 645, 70, 35, 76, '#2a2232');
    R(g, 645, 70, 35, 2, '#cfd8ea');
    for (var y = 80; y < 140; y += 12)
        for (var x = 650; x < 678; x += 9)
            R(g, x, y, 5, 7, '#161220');
    R(e, 652, 96, 22, 3, '#ff3fa8');
    R(e, 654, 102, 18, 2, '#44e9ff');
    R(g, 644, 58, 2, 88, '#1a1418');
    // water tank on roof
    R(g, 190, 6, 16, 12, '#2b2530');
    R(g, 190, 5, 16, 1, '#d7dfee');
    R(g, 192, 18, 2, 6, '#221c26');
    R(g, 202, 18, 2, 6, '#221c26');
    // fire escape
    for (var _a = 0, _b = [64, 104]; _a < _b.length; _a++) {
        var py = _b[_a];
        R(g, 156, py, 96, 2, '#3a3f4b');
        R(g, 156, py - 1, 96, 1, '#dfe6f2');
        for (var x = 156; x <= 252; x += 4)
            R(g, x, py - 9, 1, 9, '#2c3039');
        R(g, 156, py - 10, 97, 1, '#3f4552');
    }
    for (var i = 0; i < 38; i++)
        R(g, 214 - i, 66 + i, 3, 1, '#343944'); // stairs
    for (var i = 0; i < 30; i++)
        R(g, 246, 106 + i, 1, 1, i % 3 ? '#2c3039' : '#4a505e'); // drop ladder
    // drainpipes
    for (var _c = 0, _d = [146, 392, 541]; _c < _d.length; _c++) {
        var x = _d[_c];
        R(g, x, 40, 3, 106, '#2d2b33');
        R(g, x, 40, 1, 106, '#45424d');
        for (var y = 52; y < 146; y += 22)
            R(g, x - 1, y, 5, 2, '#1f1d24');
    }
    // wall lamp with shade (the shade casts the light downward)
    R(g, 306, 70, 8, 1, '#2a2a30');
    R(g, 313, 66, 1, 8, '#2a2a30');
    R(g, 294, 66, 12, 3, '#3b3b44');
    R(g, 293, 68, 14, 1, '#24242a');
    R(g, 294, 65, 12, 1, '#d7dfee');
    // AC unit
    R(g, 405, 84, 14, 10, '#6a6d74');
    for (var x = 407; x < 418; x += 2)
        R(g, x, 86, 1, 6, '#3e4046');
    R(g, 405, 83, 14, 1, '#d7dfee');
    R(g, 411, 94, 1, 30, 'rgba(20,20,30,0.35)');
    // graffiti
    g.globalAlpha = 0.55;
    g.drawImage(pixText('بیدار شو', 9, '#3fb8c8'), 410, 108);
    g.globalAlpha = 1;
    // back door of the video club + caged bulb + small sign
    R(g, 559, 112, 22, 34, '#18161a');
    R(g, 561, 114, 18, 32, '#2c3a34');
    R(g, 561, 128, 18, 1, '#1f2a25');
    R(g, 575, 130, 2, 3, '#8a8d80');
    R(g, 564, 104, 10, 2, '#303036');
    R(g, 566, 106, 6, 4, '#26262b');
    g.drawImage(pixText('ماه', 7, '#7a6f86'), 583, 116);
    groundSnow(g, 0, S.w, 7);
    // chain-link fence at the dead end
    for (var y = 96; y < 162; y++)
        for (var x = 4; x < 30; x++)
            if ((x + y) % 5 === 0 || (x - y + 200) % 5 === 0)
                R(g, x, y, 1, 1, '#59606d');
    for (var _e = 0, _f = [4, 17, 30]; _e < _f.length; _e++) {
        var x = _f[_e];
        R(g, x - 1, 94, 2, 68, '#3a3f49');
    }
    R(g, 3, 95, 28, 1, '#dfe6f2');
    // burning barrel
    R(g, 68, 138, 16, 22, '#4f2c1e');
    R(g, 68, 142, 16, 1, '#2c1810');
    R(g, 68, 152, 16, 1, '#2c1810');
    R(g, 67, 137, 18, 2, '#241410');
    for (var i = 0; i < 6; i++)
        R(g, 69 + r() * 14, 140 + r() * 18, 1, 1, '#7a4a2a');
    // Yadollah's crate seat & stacked crates
    R(g, 90, 152, 12, 8, '#4d3a28');
    for (var _g = 0, _h = [[108, 146, 26, 14], [112, 136, 16, 10]]; _g < _h.length; _g++) {
        var __entry0 = _h[_g];
        var x = __entry0[0], y = __entry0[1], w = __entry0[2], h = __entry0[3];
        R(g, x, y, w, h, '#5e4630');
        for (var yy = y + 3; yy < y + h; yy += 4)
            R(g, x, yy, w, 1, '#3f2e1f');
        R(g, x, y, 1, h, '#2e2116');
        R(g, x + w - 1, y, 1, h, '#2e2116');
        R(g, x, y - 1, w, 1, '#dfe6f2');
    }
    // dumpster + trash bags
    R(g, 188, 134, 46, 26, '#2e4a3d');
    R(g, 188, 134, 46, 2, '#243b30');
    for (var x = 192; x < 232; x += 8)
        R(g, x, 138, 1, 18, '#253d32');
    R(g, 186, 130, 50, 4, '#20352b');
    R(g, 186, 129, 50, 1, '#dfe6f2');
    R(g, 192, 156, 5, 4, '#111');
    R(g, 225, 156, 5, 4, '#111');
    for (var i = 0; i < 14; i++)
        R(g, 190 + r() * 42, 136 + r() * 20, 2, 1, '#5a3a22');
    R(g, 236, 150, 10, 10, '#1b1b22');
    R(g, 238, 148, 6, 3, '#1b1b22');
    R(g, 239, 151, 2, 2, '#34343f');
    R(g, 176, 152, 11, 8, '#16161c');
    R(g, 178, 151, 3, 2, '#2c2c36');
    // cigarette butt (hidden clue): white filter with a violet lipstick mark
    R(g, 244, 162, 3, 1, '#e8e2d6');
    R(g, 246, 162, 1, 1, '#9b3a8c');
    // the victim, fallen in the snow
    R(g, 316, 158, 6, 3, '#3d0e14'); // dark stain, kept small
    R(g, 318, 154, 6, 5, '#b08a6a');
    R(g, 318, 153, 6, 2, '#1c1616'); // head & hair
    R(g, 324, 153, 18, 7, '#3a3542');
    R(g, 324, 153, 18, 1, '#4a4454'); // coat
    R(g, 342, 155, 10, 4, '#22212a');
    R(g, 352, 155, 3, 4, '#0e0d10'); // legs, shoes
    R(g, 327, 159, 8, 2, '#3a3542');
    R(g, 334, 160, 3, 1, '#b08a6a'); // arm & hand
    for (var i = 0; i < 12; i++)
        R(g, 324 + r() * 26, 153 + r() * 5, 1, 1, '#d7dfee');
    R(g, 306, 157, 8, 2, '#1c1a1f');
    R(g, 308, 155, 4, 2, '#1c1a1f'); // fallen hat
    // camera
    R(g, 360, 155, 6, 4, '#111114');
    R(g, 363, 154, 2, 1, '#111114');
    R(g, 361, 156, 2, 2, '#40485a');
    R(g, 366, 156, 1, 2, '#2a2a2e');
    // footprints: victim's shoes from the street, and heavy boots with a cracked left heel
    for (var i = 0; i < 14; i++) {
        var x = 640 - i * 20, y = 170 + (i % 2) * 3;
        if (x > 358)
            R(g, x, y, 3, 1, '#8791ae');
    }
    for (var i = 0; i < 8; i++) {
        var x = 364 + i * 10, y = 163 + (i % 2) * 3;
        R(g, x, y, 4, 2, '#7c86a6');
        R(g, x + 5, y, 2, 2, '#6f7998');
        if (i % 2 === 0)
            R(g, x + 6, y, 1, 1, '#b9c2da');
    }
    // tyre tracks + police car (Paykan patrol)
    for (var x = 420; x < 680; x += 2) {
        R(g, x, 172, 1, 2, '#8a94b0');
        R(g, x + 1, 176, 1, 2, '#8a94b0');
    }
    R(g, 432, 140, 76, 16, '#cfd3d8');
    R(g, 432, 146, 76, 3, '#2e6b46');
    R(g, 432, 155, 76, 1, '#6d7278');
    R(g, 448, 128, 44, 12, '#c3c7cc');
    R(g, 451, 130, 17, 9, '#1a2230');
    R(g, 471, 130, 18, 9, '#1a2230');
    R(g, 469, 129, 2, 11, '#c3c7cc');
    R(g, 460, 126, 20, 2, '#2a2a30');
    R(g, 440, 152, 10, 8, '#0c0c0f');
    R(g, 443, 155, 4, 2, '#555a62');
    R(g, 490, 152, 10, 8, '#0c0c0f');
    R(g, 493, 155, 4, 2, '#555a62');
    R(g, 430, 147, 3, 6, '#9aa0a8');
    R(g, 507, 147, 3, 6, '#9aa0a8');
    g.drawImage(pixText('پلیس', 7, '#2e6b46'), 470, 138);
    R(e, 431, 142, 2, 2, '#ffe9b0');
    R(e, 507, 142, 2, 2, '#b01020');
    // trash cans
    for (var _j = 0, _k = [596, 606]; _j < _k.length; _j++) {
        var x = _k[_j];
        R(g, x, 146, 9, 14, '#4e535c');
        R(g, x - 1, 144, 11, 2, '#3a3e46');
        R(g, x - 1, 143, 11, 1, '#dfe6f2');
        for (var y = 148; y < 160; y += 3)
            R(g, x, y, 9, 1, '#40444c');
    }
    S.occ = [
        { x: 70, y: 142, w: 12, h: 18, z: 30, zb: 22 }, { x: 111, y: 139, w: 20, h: 21, z: 30, zb: 16 }, { x: 192, y: 136, w: 38, h: 24, z: 30, zb: 12 },
        { x: 322, y: 155, w: 28, h: 5, z: 31, zb: 23 }, { x: 436, y: 142, w: 68, h: 13, z: 30, zb: 10 }, { x: 452, y: 131, w: 36, h: 11, z: 30, zb: 10 },
        { x: 598, y: 146, w: 14, h: 14, z: 30, zb: 22 }, { x: 156, y: 64, w: 96, h: 2, z: 10 }, { x: 156, y: 104, w: 96, h: 2, z: 10 },
        { x: 406, y: 85, w: 12, h: 8 }, { x: 293, y: 65, w: 14, h: 4 }, { x: 564, y: 103, w: 10, h: 2 },
        { x: 86, y: 128, w: 14, h: 32, z: 29, card: 1, fx: 95, spr: function (g, x, y) { return drawOldMan(g, x, y); } },
        { x: 517, y: 126, w: 10, h: 34, z: 29, card: 1, fx: 522, spr: function (g, x, y) { return drawCop(g, x, y, P.x >= 522 ? 1 : -1); } }
    ];
    S.lights = [
        { x: 76, y: 128, r: 105, c: [255, 128, 45], i: 1, f: 'fire', z: 27, sz: 3 },
        { x: 300, y: 74, r: 155, c: [255, 182, 100], i: 1, f: 'lamp', z: 8 },
        { x: 464, y: 122, r: 135, c: [255, 30, 55], i: 1, f: 'red', z: 20 },
        { x: 476, y: 122, r: 135, c: [40, 90, 255], i: 1, f: 'blue', z: 20 },
        { x: 569, y: 109, r: 78, c: [170, 200, 255], i: 0.75, f: 'bulb', z: 8 },
        { x: 674, y: 108, r: 165, c: [255, 50, 160], i: 0.5, f: 'neon', z: 6 }
    ];
    S.targets = [
        { id: 'fence', x: 17, y: 96, w: 28, h: 64, n: 'نرده‌ی بن‌بست' },
        { id: 'yad', x: 95, y: 132, w: 14, h: 28, n: 'عمو یدالله', npc: 1 },
        { id: 'dump', x: 211, y: 128, w: 48, h: 32, n: 'سطل زباله' },
        { id: 'cig', x: 245, y: 157, w: 12, h: 9, n: 'ته‌سیگار', hidden: 1 },
        { id: 'lamp', x: 300, y: 62, w: 16, h: 14, n: 'چراغ دیواری' },
        { id: 'body', x: 334, y: 148, w: 38, h: 14, n: 'جسد رضا کاوه' },
        { id: 'camera', x: 363, y: 150, w: 12, h: 10, n: 'دوربین عکاسی' },
        { id: 'prints', x: 402, y: 160, w: 52, h: 11, n: 'ردپاها در برف', hidden: 1 },
        { id: 'car', x: 470, y: 124, w: 74, h: 36, n: 'ماشین گشت' },
        { id: 'bahman', x: 522, y: 123, w: 13, h: 37, n: 'ستوان رستگار', npc: 1 },
        { id: 'door', x: 570, y: 110, w: 22, h: 36, n: 'درِ پشتی' }
    ];
    S.minX = 38;
    S.maxX = 680;
    S.spawn = 626;
    S.ambient = [34, 36, 60];
    return S;
}
// ---------- scene 2: the neon storefront ----------
function buildStreet() {
    var S = makeScene('street', 560, 'پیاده‌روی ویدئو کلوپ ماه'), g = S.bgx, e = S.emx, r = rng(4119);
    // alley mouth (back towards the crime scene)
    S.skyx.fillRect(0, 0, 44, 42);
    R(g, 0, 42, 44, 104, '#141019');
    brickWall(g, 0, 42, 44, 104, '#2c2230', 91);
    R(g, 0, 42, 44, 104, 'rgba(6,4,10,0.55)');
    R(g, 0, 40, 44, 2, '#aeb8cf');
    // building B (stone)
    S.skyx.fillRect(44, 0, 84, 33);
    R(g, 44, 36, 84, 110, '#4a4350');
    for (var y = 36; y < 146; y += 8)
        for (var x = 44 + ((y / 8) % 2) * 8; x < 128; x += 16) {
            R(g, x, y, 15, 7, shade('#4a4350', 0.85 + r() * 0.25));
        }
    roofEdge(g, 44, 84, 36, r);
    win(g, e, 58, 50, 10, 14, r, true);
    win(g, e, 96, 50, 10, 14, r, false);
    win(g, e, 96, 78, 10, 14, r, r() < 0.5);
    // building C: the video club
    S.skyx.fillRect(128, 0, 276, 15);
    brickWall(g, 128, 18, 276, 128, '#3d3448', 7);
    roofEdge(g, 128, 276, 18, r);
    for (var x = 146; x < 390; x += 30)
        win(g, e, x, 28, 10, 14, r, r() < 0.4);
    R(g, 128, 84, 276, 62, '#1d1822');
    R(g, 128, 84, 276, 1, '#2d2632');
    R(g, 150, 50, 176, 28, '#141017');
    R(g, 150, 50, 176, 1, '#2a2430');
    R(g, 150, 77, 176, 1, '#0a080c');
    for (var _i = 0, _a = [152, 322]; _i < _a.length; _i++) {
        var x = _a[_i];
        R(g, x, 52, 2, 2, '#50505a');
        R(g, x, 74, 2, 2, '#50505a');
    }
    // shop window: interior is emissive (lit from inside)
    R(g, 148, 90, 140, 52, '#0c0a0f');
    for (var y = 92; y < 140; y++)
        R(e, 150, y, 136, 1, "rgb(".concat(lerp(44, 18, (y - 92) / 48) | 0, ",").concat(lerp(56, 22, (y - 92) / 48) | 0, ",").concat(lerp(88, 40, (y - 92) / 48) | 0, ")"));
    R(e, 176, 93, 84, 1, '#b8d0ff');
    for (var _b = 0, _c = [100, 114, 128]; _b < _c.length; _b++) {
        var sy = _c[_b];
        R(e, 180, sy + 10, 74, 2, '#171b2a');
        for (var x = 181; x < 253; x += 3) {
            var hh = 7 + (r() * 3 | 0);
            R(e, x, sy + 10 - hh, 2, hh, ['#c05050', '#d0b060', '#5070c0', '#50a070', '#b060b0', '#e0e0e0', '#303040'][r() * 7 | 0]);
        }
    }
    R(e, 262, 95, 20, 28, '#1a1320');
    R(e, 264, 97, 16, 16, '#3a1f36');
    R(e, 268, 100, 8, 11, '#0b0710');
    R(e, 270, 98, 4, 3, '#0b0710');
    R(e, 264, 115, 16, 3, '#c73a4a');
    R(e, 266, 119, 12, 1, '#a09080');
    R(e, 156, 120, 22, 18, '#2a2a30');
    R(e, 158, 138, 18, 2, '#1a1a1e'); // CRT cabinet (screen animated)
    e.fillStyle = 'rgba(255,255,255,0.07)';
    for (var _d = 0, _e = [196, 206, 240]; _d < _e.length; _d++) {
        var x0 = _e[_d];
        for (var i = 0; i < 40; i++)
            e.fillRect(x0 + i * 0.6 | 0, 139 - i, 2, 1);
    }
    R(g, 148, 140, 140, 2, '#2a2430');
    R(g, 146, 142, 144, 1, '#d7dfee');
    R(g, 218, 90, 2, 52, '#0c0a0f');
    // door with warm glass + "closed" sign
    R(g, 296, 94, 32, 52, '#0c0a0f');
    R(e, 299, 97, 26, 38, '#8a6440');
    R(e, 311, 97, 2, 38, '#3a2a1c');
    R(e, 302, 108, 20, 8, '#5a1a22');
    R(e, 322, 124, 2, 4, '#c0a060');
    R(g, 299, 136, 26, 10, '#1a151c');
    e.drawImage(pixText('بسته', 7, '#ff6070'), 302, 106);
    // awning with a scalloped edge and a snow load
    for (var x = 140; x < 344; x++) {
        var st = ((x - 140) / 6 | 0) % 2;
        R(g, x, 80, 1, 7, st ? '#c9b8a0' : '#6b1f2e');
        if ((x % 6) < 4)
            R(g, x, 87, 1, 1, st ? '#a89880' : '#4f1622');
    }
    R(g, 140, 78, 204, 2, '#dfe6f2');
    R(g, 140, 77, 204, 1, '#b6c0d6');
    // security camera bracket
    R(g, 336, 88, 1, 4, '#2a2a30');
    R(g, 330, 86, 7, 4, '#4a4d55');
    R(g, 329, 87, 2, 2, '#15151a');
    // building D + rolling shutter
    S.skyx.fillRect(404, 0, 156, 41);
    brickWall(g, 404, 44, 156, 102, '#44383a', 55);
    roofEdge(g, 404, 156, 44, r);
    for (var x = 420; x < 548; x += 34)
        win(g, e, x, 58, 10, 14, r, r() < 0.35);
    R(g, 414, 100, 58, 46, '#565b63');
    for (var y = 102; y < 146; y += 3)
        R(g, 414, y, 58, 1, '#40444b');
    R(g, 412, 98, 62, 3, '#2a2a30');
    g.globalAlpha = 0.6;
    g.drawImage(pixText('اجاره داده می‌شود', 7, '#d8c070'), 418, 112);
    g.globalAlpha = 1;
    // sidewalk snow, curb and the wet street
    groundSnow(g, 0, S.w, 21);
    R(g, 0, 163, S.w, 2, '#6b7080');
    for (var y = 165; y < H; y++) {
        var k = (y - 165) / 15;
        R(g, 0, y, S.w, 1, "rgb(".concat(lerp(46, 34, k) | 0, ",").concat(lerp(46, 36, k) | 0, ",").concat(lerp(60, 50, k) | 0, ")"));
    }
    for (var i = 0; i < 260; i++)
        R(g, r() * S.w, 166 + r() * 14, 2 + r() * 4, 1, r() < 0.6 ? '#5a6078' : '#7c849c');
    // payphone (hood, box, pole)
    R(g, 66, 128, 4, 32, '#3a3b42');
    R(g, 58, 104, 20, 6, '#c98f26');
    R(g, 58, 103, 20, 1, '#dfe6f2');
    R(g, 58, 109, 20, 1, '#7a5516');
    R(g, 61, 112, 14, 17, '#bf9536');
    R(g, 63, 114, 4, 12, '#15151a');
    R(g, 69, 115, 4, 6, '#3a3020');
    for (var yy = 116; yy < 121; yy += 2)
        for (var xx = 69; xx < 73; xx += 2)
            R(g, xx, yy, 1, 1, '#d9cfa8');
    R(g, 69, 123, 4, 2, '#15151a');
    // street lamp
    R(g, 451, 44, 3, 116, '#2a2d34');
    R(g, 451, 44, 1, 116, '#3c4049');
    R(g, 438, 41, 16, 2, '#2a2d34');
    R(g, 437, 43, 12, 3, '#3a3d45');
    R(g, 437, 40, 16, 1, '#dfe6f2');
    R(g, 449, 154, 7, 6, '#1f2127');
    // parked car, buried under a hand-span of snow (it has not moved all night)
    R(g, 474, 142, 66, 14, '#4a2530');
    R(g, 488, 132, 38, 11, '#42202a');
    R(g, 491, 134, 14, 8, '#141a24');
    R(g, 508, 134, 15, 8, '#141a24');
    R(g, 472, 138, 70, 4, '#dfe6f2');
    R(g, 486, 128, 42, 5, '#dfe6f2');
    R(g, 486, 127, 42, 1, '#b6c0d6');
    R(g, 480, 152, 10, 8, '#0c0c0f');
    R(g, 524, 152, 10, 8, '#0c0c0f');
    // police barrier
    for (var x = 546; x < 558; x++)
        R(g, x, 140, 1, 5, ((x / 3 | 0) % 2) ? '#e8e8e8' : '#c0202a');
    R(g, 547, 145, 1, 15, '#3a3a40');
    R(g, 556, 145, 1, 15, '#3a3a40');
    R(g, 546, 139, 12, 1, '#dfe6f2');
    S.occ = [
        { x: 58, y: 104, w: 20, h: 5, z: 30, zb: 18 }, { x: 62, y: 113, w: 12, h: 16, z: 30, zb: 26 }, { x: 66, y: 130, w: 4, h: 30, z: 30, zb: 26 },
        { x: 140, y: 80, w: 204, h: 5, z: 12 }, { x: 330, y: 86, w: 7, h: 4 },
        { x: 344, y: 128, w: 12, h: 32, z: 29, card: 1, fx: 350, spr: function (g, x, y) { return drawLeila(g, x, y, P.x >= 350 ? 1 : -1); } },
        { x: 437, y: 40, w: 18, h: 3, z: 30, zb: 26 }, { x: 451, y: 46, w: 3, h: 114, z: 30, zb: 27 },
        { x: 476, y: 142, w: 62, h: 13, z: 30, zb: 12 }, { x: 490, y: 133, w: 34, h: 11, z: 30, zb: 12 }, { x: 547, y: 140, w: 9, h: 14, z: 30, zb: 27 }
    ];
    S.lights = [
        { x: 222, y: 66, r: 165, c: [255, 45, 165], i: 0.95, f: 'neon', z: 8, sz: 6 },
        { x: 318, y: 64, r: 115, c: [60, 225, 255], i: 0.8, f: 'neon', z: 8, sz: 4 },
        { x: 218, y: 116, r: 125, c: [140, 190, 255], i: 0.6, f: 'crt', ns: 1 },
        { x: 312, y: 112, r: 72, c: [255, 190, 120], i: 0.5, f: 'steady', ns: 1 },
        { x: 443, y: 48, r: 185, c: [190, 215, 255], i: 0.95, f: 'lamp', z: 29, sz: 4 },
        { x: 68, y: 111, r: 66, c: [190, 255, 215], i: 0.6, f: 'bulb', z: 24 },
        { x: 20, y: 120, r: 100, c: [255, 30, 55], i: 0.5, f: 'red', z: 20 },
        { x: 24, y: 120, r: 100, c: [40, 90, 255], i: 0.5, f: 'blue', z: 20 }
    ];
    S.targets = [
        { id: 'phone', x: 68, y: 102, w: 24, h: 58, n: 'تلفن عمومی' },
        { id: 'neon', x: 238, y: 50, w: 176, h: 28, n: 'تابلوی نئون' },
        { id: 'window', x: 218, y: 90, w: 140, h: 52, n: 'ویترین مغازه' },
        { id: 'cam', x: 333, y: 84, w: 12, h: 10, n: 'دوربین مداربسته' },
        { id: 'leila', x: 350, y: 126, w: 13, h: 34, n: 'لیلا ماهان', npc: 1 },
        { id: 'lamp2', x: 452, y: 38, w: 20, h: 122, n: 'تیر چراغ‌برق' },
        { id: 'benz', x: 507, y: 126, w: 70, h: 34, n: 'ماشینِ زیر برف' },
        { id: 'barrier', x: 552, y: 136, w: 14, h: 24, n: 'راه‌بند پلیس' }
    ];
    S.minX = 0;
    S.maxX = 540;
    S.spawn = 30;
    S.ambient = [38, 34, 62];
    // pre-rendered neon lettering
    S.neonText = pixText('ویدئو کلوپ ماه', 13, '#ff4fb8');
    S.neonCore = pixText('ویدئو کلوپ ماه', 13, '#ffd6f0');
    return S;
}
// ---------- case 2: the police station at night ----------
// scale: wall props stand on the wall line (y 146); free-standing furniture stands a step forward (y 152)
function buildStation() {
    var S = makeScene('station', 600, 'اداره‌ی آگاهی — طبقه‌ی دوم'), g = S.bgx, e = S.emx, r = rng(3310);
    var foot = function (x, w) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x - 1, 151, w + 2, 2); }; // contact shadow on the floor
    // ceiling, painted plaster, dado rail and panelling
    R(g, 0, 0, S.w, 12, '#15161b');
    R(g, 0, 11, S.w, 1, '#2a2c33');
    for (var y = 12; y < 124; y++)
        R(g, 0, y, S.w, 1, shade('#55635a', 0.9 + 0.06 * Math.sin(y * 0.3) + 0.06 * (y - 12) / 112));
    for (var i = 0; i < 260; i++)
        R(g, r() * S.w, 12 + r() * 110, 1, 1, r() < 0.5 ? '#515f56' : '#59675e');
    for (var i = 0; i < 12; i++) {
        g.fillStyle = 'rgba(30,26,20,0.12)';
        g.fillRect(r() * S.w | 0, 12, 2 + r() * 5 | 0, 10 + r() * 50 | 0);
    }
    R(g, 0, 126, S.w, 20, '#2e3a33');
    for (var x = 0; x < S.w; x += 12)
        R(g, x, 127, 1, 19, '#26302a');
    R(g, 0, 124, S.w, 2, '#6f7f72');
    R(g, 0, 144, S.w, 2, '#1c221e');
    // linoleum floor
    for (var y = 146; y < H; y += 5)
        for (var x = ((y / 5) % 2) * 10; x < S.w; x += 20) {
            R(g, x, y, 10, 5, '#44444c');
            R(g, x + 10, y, 10, 5, '#35353d');
        }
    for (var i = 0; i < 200; i++)
        R(g, r() * S.w, 147 + r() * 33, 2, 1, 'rgba(160,170,200,0.1)');
    // ceiling pipe and conduit
    R(g, 150, 40, 450, 3, '#3a4038');
    R(g, 150, 40, 450, 1, '#4e564c');
    for (var x = 170; x < 600; x += 60)
        R(g, x, 38, 3, 7, '#2e342c');
    // --- the Major's office: wood panelling, a tall window with venetian blinds ---
    R(g, 0, 12, 146, 134, '#3e2e22');
    for (var x = 4; x < 146; x += 14)
        R(g, x, 12, 1, 134, '#2e2018');
    R(g, 0, 124, 146, 2, '#5a4430');
    R(g, 28, 84, 66, 46, '#1a1410');
    for (var y = 86; y < 128; y++)
        R(e, 30, y, 62, 1, "rgb(".concat(lerp(18, 38, (y - 86) / 42) | 0, ",").concat(lerp(26, 44, (y - 86) / 42) | 0, ",").concat(lerp(58, 92, (y - 86) / 42) | 0, ")"));
    for (var i = 0; i < 30; i++)
        R(e, 30 + r() * 62, 104 + r() * 22, 1, 1, ['#d9a255', '#7d97e0', '#ff4fb0'][r() * 3 | 0]);
    R(e, 30, 122, 62, 6, '#1a2036');
    for (var x = 32; x < 92; x += 6)
        R(e, x, 116 - (r() * 8 | 0), 4, 12, '#141a2c');
    for (var y = 90; y < 127; y += 4)
        R(e, 30, y, 62, 1, '#0e0c0a');
    R(e, 50, 86, 1, 42, '#0a0806');
    R(e, 72, 86, 1, 42, '#0a0806');
    R(g, 28, 86, 66, 2, '#cfc6ae');
    R(g, 26, 128, 70, 2, '#5a4430');
    // framed portrait above the door-side wall, and a pendant lamp
    R(g, 106, 92, 16, 18, '#8a7030');
    R(g, 107, 93, 14, 16, '#2a2a30');
    R(g, 111, 96, 6, 5, '#6a5a50');
    R(g, 110, 101, 8, 8, '#1e2a44');
    R(g, 100, 12, 1, 46, '#1a1a1e');
    R(g, 94, 58, 13, 4, '#2a4a3a');
    R(g, 94, 58, 13, 1, '#3a6a52');
    // the Major's empty leather chair, his desk, green terminal, banker's lamp, bin
    R(g, 56, 127, 11, 13, '#3a2418');
    R(g, 57, 128, 9, 11, '#4a2e1e');
    R(g, 60, 140, 3, 6, '#1e1e22');
    R(g, 36, 139, 48, 2, '#5a3a24');
    R(g, 36, 141, 48, 1, '#3e2818');
    R(g, 38, 142, 14, 10, '#4a3020');
    R(g, 38, 146, 14, 1, '#2a1a10');
    R(g, 44, 144, 2, 1, '#b09050');
    R(g, 44, 148, 2, 1, '#b09050');
    R(g, 80, 142, 3, 10, '#3a2616');
    foot(36, 48);
    R(g, 42, 128, 12, 11, '#b8b2a0');
    R(g, 43, 129, 10, 8, '#0c1a10');
    R(g, 46, 137, 4, 2, '#9a9484');
    R(g, 56, 138, 10, 1, '#8a8474');
    R(e, 44, 130, 8, 6, '#0f3a20');
    R(e, 45, 131, 5, 1, '#4fdc80');
    R(e, 45, 133, 6, 1, '#3fb060');
    R(g, 67, 138, 7, 1, '#d8d0bc');
    R(g, 68, 137, 5, 1, '#e8e2d0');
    R(g, 72, 138, 8, 1, '#b08a3a');
    R(g, 75, 133, 1, 5, '#b08a3a');
    R(g, 71, 129, 10, 4, '#1f6a44');
    R(g, 71, 129, 10, 1, '#3a9a6a');
    R(g, 88, 145, 7, 7, '#3a3a40');
    for (var y = 146; y < 152; y += 2)
        R(g, 88, y, 7, 1, '#26262c');
    R(g, 89, 144, 2, 1, '#e0d8c0');
    R(g, 92, 143, 2, 2, '#e0d8c0');
    foot(88, 7);
    // partition (seen edge-on) with the office sign
    R(g, 146, 12, 4, 134, '#2a1e14');
    R(g, 146, 12, 1, 134, '#4a3a2a');
    {
        var t = pixText('دفتر سرگرد', 6, '#e8d8a8');
        R(g, 153, 84, t.width + 2, 12, '#3a2a18');
        R(g, 154, 85, t.width, 10, '#5a4428');
        g.drawImage(t, 154, 84);
    }
    // back stairs door + green exit sign + wet footprints (hidden clue)
    R(g, 175, 111, 22, 35, '#1a1c20');
    R(g, 177, 113, 18, 33, '#3a3f44');
    R(g, 178, 129, 16, 1, '#8a8f94');
    R(g, 182, 117, 8, 8, '#141820');
    R(e, 183, 118, 6, 6, '#1c2438');
    R(g, 191, 130, 2, 3, '#c8c8c8');
    R(g, 178, 100, 16, 8, '#0c2a18');
    e.drawImage(pixText('خروج', 6, '#6fff9a'), 179, 98);
    for (var i = 0; i < 6; i++) {
        var x = 190 - i * 8, y = 163 + (i % 2) * 3;
        R(g, x, y, 4, 2, '#23262e');
        R(g, x + 1, y, 1, 1, '#9aa6c0');
    }
    for (var i = 0; i < 3; i++)
        R(g, 152 + i * 7, 166 - (i % 2) * 3, 3, 2, '#262a32');
    // coat rack with the Major's wet coat
    R(g, 212, 123, 2, 29, '#3a2a1c');
    R(g, 207, 151, 12, 1, '#3a2a1c');
    R(g, 208, 123, 10, 1, '#3a2a1c');
    R(g, 208, 126, 10, 18, '#20283c');
    R(g, 208, 126, 3, 1, '#c8a040');
    R(g, 215, 126, 3, 1, '#c8a040');
    R(g, 210, 125, 6, 2, '#1a2030');
    for (var i = 0; i < 6; i++)
        R(g, 209 + r() * 8, 128 + r() * 14, 1, 1, '#141a28');
    for (var i = 0; i < 4; i++)
        R(g, 209 + i * 2, 145 + (r() * 6 | 0), 1, 1, '#8aa0c8');
    R(g, 205, 152, 16, 1, '#5a6a8a');
    // duty roster board
    R(g, 224, 88, 44, 32, '#3a2a1c');
    R(g, 226, 90, 40, 28, '#8a6a44');
    R(g, 228, 92, 10, 12, '#e0d8c0');
    R(g, 240, 93, 9, 10, '#d8e0e8');
    R(g, 251, 92, 12, 11, '#e8e0c8');
    R(g, 229, 106, 8, 9, '#5a5a60');
    R(g, 240, 105, 23, 11, '#e8e2d0');
    for (var _i = 0, _a = [[229, 95, 8], [229, 98, 7], [229, 101, 8], [241, 96, 7], [252, 95, 9], [252, 98, 8], [242, 108, 19], [242, 111, 17], [242, 113, 19]]; _i < _a.length; _i++) {
        var __entry1 = _a[_i];
        var x = __entry1[0], y = __entry1[1], w = __entry1[2];
        R(g, x, y, w, 1, '#5a5048');
    }
    for (var _b = 0, _c = [[233, 91], [245, 92], [257, 91], [233, 105], [251, 104]]; _b < _c.length; _b++) {
        var __entry2 = _c[_b];
        var x = __entry2[0], y = __entry2[1];
        R(g, x, y, 1, 1, '#d02a2a');
    }
    // samovar on a low cabinet, two glasses of tea
    R(g, 238, 138, 24, 14, '#4a3a2e');
    R(g, 238, 138, 24, 1, '#5e4a3a');
    R(g, 250, 140, 1, 11, '#2e2218');
    R(g, 246, 145, 2, 1, '#b09050');
    R(g, 253, 145, 2, 1, '#b09050');
    foot(238, 24);
    R(g, 245, 127, 10, 10, '#b8a070');
    R(g, 245, 130, 10, 1, '#8a7448');
    R(g, 245, 134, 10, 1, '#8a7448');
    R(g, 247, 124, 6, 3, '#a08858');
    R(g, 248, 120, 4, 4, '#e8e0f0');
    R(g, 249, 121, 2, 2, '#3a5aa8');
    R(g, 255, 132, 3, 1, '#8a7040');
    R(g, 246, 137, 8, 1, '#6a5438');
    R(g, 240, 135, 2, 3, '#c07a3a');
    R(g, 258, 135, 2, 3, '#c07a3a');
    // wall clock
    R(g, 295, 87, 12, 12, '#2a2a30');
    R(g, 296, 88, 10, 10, '#e8e4d8');
    R(g, 300, 88, 2, 1, '#2a2a30');
    R(g, 300, 97, 2, 1, '#2a2a30');
    // the sergeant's desk, typewriter, lamp and chair
    R(g, 268, 139, 34, 2, '#6a5a44');
    R(g, 268, 141, 34, 1, '#4a3e30');
    R(g, 288, 142, 12, 10, '#4e4a44');
    R(g, 288, 146, 12, 1, '#2e2a24');
    R(g, 293, 144, 2, 1, '#b09050');
    R(g, 270, 142, 2, 10, '#3a3630');
    foot(268, 34);
    R(g, 280, 135, 12, 4, '#2a2a2e');
    R(g, 281, 138, 10, 1, '#6a6a70');
    R(g, 283, 131, 6, 4, '#e8e0c8');
    R(g, 272, 129, 7, 3, '#3a4a3a');
    R(g, 273, 132, 1, 6, '#3a3a3a');
    R(g, 271, 138, 5, 1, '#3a3a3a');
    R(g, 276, 137, 3, 2, '#d0c8b4');
    R(g, 297, 136, 2, 3, '#b86a2a');
    R(g, 304, 145, 10, 1, '#2a2a30');
    R(g, 312, 131, 2, 14, '#2a2a30');
    R(g, 305, 146, 1, 6, '#1e1e22');
    R(g, 312, 146, 1, 6, '#1e1e22');
    // dispatch: map of Tehran, radio console, red phone
    R(g, 352, 82, 70, 42, '#3a2a1c');
    R(g, 354, 84, 66, 38, '#c8bc98');
    for (var x = 354; x < 420; x++)
        R(g, x, 88 + Math.round(Math.sin(x * 0.2) * 2), 1, 2, '#8a8070');
    for (var i = 0; i < 12; i++) {
        var x = 356 + r() * 60, y = 92 + r() * 28;
        R(g, x, y, 10 + r() * 16, 1, '#9a8a70');
        R(g, x + r() * 8, y - r() * 8, 1, 10, '#9a8a70');
    }
    R(g, 368, 104, 24, 1, '#b04040');
    R(g, 391, 104, 1, 10, '#b04040');
    for (var _d = 0, _e = [[368, 104], [391, 114], [380, 97], [408, 110]]; _d < _e.length; _d++) {
        var __entry3 = _e[_d];
        var x = __entry3[0], y = __entry3[1];
        R(g, x, y, 2, 2, '#d02a2a');
    }
    R(g, 350, 139, 50, 13, '#3a3c42');
    R(g, 350, 139, 50, 2, '#4e5058');
    for (var x = 353; x < 398; x += 5)
        R(g, x, 144, 3, 1, '#23252a');
    foot(350, 50);
    R(g, 354, 128, 20, 11, '#2a2c30');
    R(g, 355, 129, 18, 1, '#44464c');
    for (var y = 133; y < 138; y += 2)
        R(g, 363, y, 9, 1, '#1a1c20');
    R(g, 366, 130, 3, 2, '#8a8a90');
    R(g, 370, 130, 3, 2, '#8a8a90');
    R(g, 378, 122, 1, 17, '#5a5a60');
    R(g, 377, 121, 3, 2, '#2a2a2e');
    R(g, 386, 136, 9, 3, '#b01a24');
    R(g, 385, 134, 11, 2, '#c02a34');
    R(g, 386, 133, 2, 1, '#c02a34');
    R(g, 393, 133, 2, 1, '#c02a34');
    R(g, 402, 145, 10, 1, '#2a2a30');
    R(g, 410, 131, 2, 14, '#2a2a30');
    R(g, 403, 146, 1, 6, '#1e1e22');
    R(g, 410, 146, 1, 6, '#1e1e22');
    // evidence room: lockers behind a chain-link cage, keypad, printer
    R(g, 476, 12, 124, 134, '#23262a');
    R(g, 476, 124, 124, 2, '#34383e');
    for (var x = 484; x < 596; x += 16) {
        R(g, x, 114, 14, 32, '#5a5e64');
        R(g, x, 114, 14, 1, '#7a7e84');
        R(g, x + 10, 128, 2, 4, '#8a8e94');
        R(g, x + 3, 117, 8, 3, '#d8d0bc');
        for (var y = 122; y < 126; y += 2)
            R(g, x + 3, y, 8, 1, '#44484e');
    }
    for (var y = 64; y < 146; y++)
        for (var x = 478; x < 600; x++)
            if ((x + y) % 5 === 0 || (x - y + 300) % 5 === 0)
                R(g, x, y, 1, 1, '#7a8088');
    R(g, 477, 62, 2, 84, '#3a3f49');
    R(g, 499, 76, 2, 70, '#3a3f49');
    R(g, 530, 76, 2, 70, '#3a3f49');
    R(g, 499, 76, 33, 2, '#3a3f49');
    R(g, 477, 62, 123, 2, '#3a3f49');
    R(g, 496, 96, 42, 9, '#8a1a1a');
    g.drawImage(pixText('انبار مدارک', 7, '#f0e0d0'), 498, 92);
    R(g, 532, 124, 9, 11, '#2a2c30');
    for (var y = 126; y < 134; y += 3)
        for (var x = 533; x < 540; x += 3)
            R(g, x, y, 2, 2, '#8a8e94');
    R(g, 539, 12, 1, 54, '#1a1a1e');
    R(g, 536, 66, 7, 2, '#3a3a40');
    R(g, 556, 139, 36, 2, '#3a3a40');
    R(g, 558, 141, 2, 11, '#2a2a30');
    R(g, 588, 141, 2, 11, '#2a2a30');
    foot(556, 36);
    R(g, 562, 131, 22, 8, '#c8c2b0');
    R(g, 563, 129, 20, 2, '#dcd6c4');
    R(g, 566, 125, 14, 4, '#eeeae0');
    R(g, 564, 135, 18, 1, '#3a3630');
    R(g, 569, 136, 6, 2, '#eeeae0');
    // fluorescent fixtures hanging on chains
    for (var _f = 0, _g = [230, 390]; _f < _g.length; _f++) {
        var x = _g[_f];
        R(g, x - 12, 12, 1, 50, '#1a1a1e');
        R(g, x + 11, 12, 1, 50, '#1a1a1e');
        R(g, x - 16, 62, 32, 3, '#2a2c32');
        R(g, x - 16, 62, 32, 1, '#3a3c44');
    }
    var kaz = { x: 302, y: 124, w: 14, h: 28, z: 15, card: 1, fx: 309, fy: 152, spr: function (g2, x, y) { return drawSergeant(g2, x, y, F.kazAwake); } };
    var meh = { x: 400, y: 124, w: 14, h: 28, z: 15, card: 1, fx: 407, fy: 152, spr: function (g2, x, y) { return drawDispatcher(g2, x, y); } };
    S.occ = Array.from({ length: 10 }, function (_, i) { return ({ x: 30, y: 90 + i * 4, w: 62, h: 1, z: 3, nf: 1 }); }).concat([
        { x: 36, y: 139, w: 48, h: 2, z: 13, zb: 5 }, { x: 38, y: 141, w: 14, h: 11, z: 13, zb: 5 }, { x: 80, y: 141, w: 3, h: 11, z: 13, zb: 5 },
        { x: 42, y: 128, w: 12, h: 11, z: 11 }, { x: 71, y: 129, w: 10, h: 4, z: 12 }, { x: 56, y: 127, w: 11, h: 13, z: 8 }, { x: 88, y: 145, w: 7, h: 7, z: 13 },
        { x: 94, y: 58, w: 13, h: 4, z: 18 }, { x: 146, y: 12, w: 4, h: 134, z: 12 },
        { x: 208, y: 125, w: 10, h: 19, z: 14 }, { x: 212, y: 144, w: 2, h: 8, z: 14 },
        { x: 238, y: 138, w: 24, h: 14, z: 13, zb: 5 }, { x: 245, y: 120, w: 10, h: 17, z: 11 },
        { x: 268, y: 139, w: 34, h: 2, z: 13, zb: 5 }, { x: 288, y: 141, w: 12, h: 11, z: 13, zb: 5 }, { x: 280, y: 131, w: 12, h: 8, z: 12 }, { x: 272, y: 129, w: 7, h: 3, z: 12 },
        { x: 312, y: 131, w: 2, h: 14, z: 12 }, { x: 410, y: 131, w: 2, h: 14, z: 12 },
        { x: 350, y: 139, w: 50, h: 13, z: 13, zb: 5 }, { x: 354, y: 128, w: 20, h: 11, z: 11 }, { x: 385, y: 133, w: 11, h: 6, z: 12 },
        { x: 484, y: 114, w: 110, h: 32, z: 3 }, { x: 556, y: 139, w: 36, h: 2, z: 13, zb: 5 }, { x: 562, y: 125, w: 22, h: 14, z: 12 },
        { x: 214, y: 61, w: 32, h: 4, z: 22 }, { x: 374, y: 61, w: 32, h: 4, z: 22 }, { x: 536, y: 66, w: 7, h: 2, z: 18 },
        kaz, meh
    ]);
    S.lights = [
        { x: 61, y: 84, r: 150, c: [140, 170, 255], i: 0.8, f: 'steady', z: 4, back: 1, sz: 3 },
        { x: 76, y: 134, r: 100, c: [255, 215, 140], i: 1, f: 'lamp', z: 13 },
        { x: 48, y: 133, r: 36, c: [80, 255, 140], i: 0.35, f: 'crt' },
        { x: 186, y: 104, r: 48, c: [60, 255, 120], i: 0.45, f: 'steady' },
        { x: 230, y: 67, r: 180, c: [205, 228, 255], i: 0.95, f: 'tube', z: 22, sz: 7 },
        { x: 275, y: 133, r: 84, c: [255, 200, 120], i: 0.8, f: 'steady', z: 13 },
        { x: 250, y: 137, r: 36, c: [255, 120, 40], i: 0.5, f: 'fire' },
        { x: 390, y: 67, r: 175, c: [205, 228, 255], i: 0.85, f: 'tubebad', z: 22, sz: 7 },
        { x: 364, y: 127, r: 48, c: [90, 255, 160], i: 0.5, f: 'crt' },
        { x: 539, y: 69, r: 140, c: [255, 90, 90], i: 0.6, f: 'steady', z: 18 },
        { x: 100, y: 64, r: 130, c: [255, 225, 180], i: 0.45, f: 'steady', z: 18 },
        { x: 582, y: 134, r: 30, c: [255, 50, 40], i: 0.7, f: 'jam' }
    ];
    S.targets = [
        { id: 'blinds', x: 61, y: 84, w: 66, h: 46, n: 'پنجره‌ی کرکره‌دار' },
        { id: 'terminal', x: 48, y: 126, w: 16, h: 14, n: 'ترمینالِ ۴' },
        { id: 'trash', x: 91, y: 141, w: 13, h: 12, n: 'سطلِ کاغذِ باطله' },
        { id: 'wet', x: 173, y: 160, w: 50, h: 10, n: 'ردِ کفشِ خیس', hidden: 1 },
        { id: 'backdoor', x: 186, y: 109, w: 24, h: 37, n: 'درِ پله‌ی اضطراری' },
        { id: 'coat', x: 213, y: 121, w: 14, h: 31, n: 'جالباسی' },
        { id: 'roster', x: 246, y: 88, w: 44, h: 32, n: 'تابلوی کشیک' },
        { id: 'samovar', x: 250, y: 118, w: 26, h: 34, n: 'سماور' },
        { id: 'clock', x: 301, y: 86, w: 14, h: 14, n: 'ساعتِ دیواری' },
        { id: 'kazem', x: 305, y: 122, w: 18, h: 30, n: 'گروهبان فرهی', npc: 1 },
        { id: 'map', x: 387, y: 82, w: 70, h: 42, n: 'نقشه‌ی تهران' },
        { id: 'redphone', x: 390, y: 131, w: 13, h: 9, n: 'تلفنِ قرمزِ دادستانی' },
        { id: 'mehri', x: 405, y: 122, w: 16, h: 30, n: 'مهری سلطانی', npc: 1 },
        { id: 'keypad', x: 536, y: 122, w: 13, h: 15, n: 'قفلِ انبارِ مدارک' },
        { id: 'printer', x: 573, y: 123, w: 32, h: 20, n: 'چاپگر' }
    ];
    S.minX = 20;
    S.maxX = 590;
    S.spawn = 330;
    S.ambient = [50, 52, 68];
    S.indoor = true;
    S.zoom = 1.5;
    S.phoneZoom = 1.1;
    S.viewTop = 56;
    return S;
}
// seated at the back of the room: (x, y) is the floor under the seat's front edge; both face their desks (left)
function drawSergeant(g, x, y, awake) {
    var p = spr(g, x, y, -1), br = Math.sin(G.t * 1.3) > 0 ? 1 : 0;
    p(-3, -9, 9, 2, '#2a3024');
    p(4, -7, 2, 6, '#2a3024');
    p(4, -1, 4, 1, '#0e0e10');
    if (!awake) {
        p(-3, -16, 6, 8, '#3e4a36');
        p(0, -18 + br, 6, 5, '#3e4a36');
        p(3, -17 + br, 5, 3, '#35402e');
        p(5, -14, 7, 2, '#35402e');
        p(8, -19 + br, 5, 5, '#c49a78');
        p(8, -20 + br, 5, 1, '#dcb48c');
        p(12, -18 + br, 1, 3, '#3a3028');
        p(-3, -16, 2, 1, '#c8a040');
    }
    else {
        p(-3, -20, 6, 11, '#3e4a36');
        p(-3, -10, 6, 1, '#1a1a14');
        p(1, -15, 7, 2, '#35402e');
        p(8, -15, 2, 2, '#c49a78');
        p(-2, -26, 5, 6, '#c49a78');
        p(-2, -27, 5, 1, '#dcb48c');
        p(-2, -25, 1, 3, '#3a3028');
        p(2, -24, 1, 1, '#101010');
        p(1, -22, 3, 1, '#2a1e18');
        p(-3, -20, 2, 1, '#c8a040');
    }
}
function drawDispatcher(g, x, y) {
    var p = spr(g, x, y, -1), l = (G.t % 6) < 1.4 ? 1 : 0;
    p(-3, -9, 9, 2, '#2a2438');
    p(4, -7, 2, 6, '#2a2438');
    p(4, -1, 4, 1, '#111');
    p(-3 + l, -20, 6, 11, '#3a3050');
    p(1 + l, -15, 7, 2, '#3a3050');
    p(8 + l, -15, 2, 2, '#d4ab8a');
    p(-2 + l, -26, 5, 6, '#d4ab8a');
    p(-3 + l, -27, 7, 2, '#1e2238');
    p(-4 + l, -26, 3, 8, '#1e2238');
    p(-2 + l, -20, 5, 1, '#1e2238');
    p(1 + l, -25, 3, 1, '#6a6a70');
    p(2 + l, -24, 1, 1, '#101010');
    p(3 + l, -22, 1, 1, '#a0506a');
    p(-2 + l, -28, 5, 1, '#7a7a80');
    p(-3 + l, -25, 2, 3, '#2a2a2e');
    p(-1 + l, -22, 4, 1, '#5a5a60');
}
// ---------- generic characters for cases 3–7 (one spec draws both the sprite and the portrait) ----------
// sp: { coat, pants, skin, hair, hat, hatCol, scarf, beard, mustache, glasses, lips, long, tall, shirt, tie, apron, gloves, ring }
function drawPerson(g, x, y, f, sp) {
    var p = spr(g, x, y, f), t = sp.tall || 0, br = Math.sin(G.t * 1.5 + x * 0.37) > 0.55 ? -1 : 0;
    var skin = sp.skin || '#c9a27e', skinD = shade(skin, 0.8), coat = sp.coat, pants = sp.pants || '#1e1e26';
    p(-3, -8, 3, 8, pants);
    p(1, -8, 3, 8, pants);
    p(-3, -1, 3, 1, sp.shoes || '#0c0c10');
    p(1, -1, 4, 1, sp.shoes || '#0c0c10');
    var top = -26 - t + br, len = (sp.long ? 21 : 18) + t;
    p(-4, top, 8, len, coat);
    p(-4, top, 1, len, shade(coat, 0.72));
    p(2, top + 1, 1, len - 3, shade(coat, 1.18));
    if (sp.long)
        p(-5, top + len - 5, 10, 4, coat);
    if (sp.shirt)
        p(0, top, 2, 6, sp.shirt);
    if (sp.tie)
        p(0, top + 1, 1, 6, sp.tie);
    if (sp.apron)
        p(-3, top + 7, 7, len - 8, sp.apron);
    if (sp.scarf)
        p(-2, top - 1, 5, 2, sp.scarf);
    p(1, top + 3, 2, 10, shade(coat, 0.85));
    p(1, top + 13, 2, 2, sp.gloves || skin);
    if (sp.ring)
        p(2, top + 13, 1, 1, '#9fe8ff');
    var hy = top - 6;
    p(-2, hy, 5, 6, skin);
    p(-2, hy + 1, 1, 4, skinD);
    p(2, hy + 2, 1, 1, '#101010');
    p(3, hy + 3, 1, 1, skinD);
    if (sp.beard)
        p(-1, hy + 4, 5, 2, sp.beard);
    if (sp.mustache)
        p(1, hy + 4, 3, 1, sp.mustache);
    if (sp.glasses)
        p(1, hy + 2, 3, 1, '#9a9aa4');
    if (sp.lips)
        p(3, hy + 4, 1, 1, sp.lips);
    var hc = sp.hatCol || '#2b2622';
    switch (sp.hat) {
        case 'scarf':
            p(-3, hy - 1, 7, 2, hc);
            p(-3, hy, 2, 8, hc);
            p(-2, hy + 5, 4, 2, hc);
            break;
        case 'fedora':
            p(-4, hy - 1, 10, 1, hc);
            p(-2, hy - 4, 6, 3, hc);
            p(-2, hy - 2, 6, 1, shade(hc, 0.6));
            break;
        case 'cap':
            p(-2, hy - 2, 6, 2, hc);
            p(3, hy - 1, 3, 1, shade(hc, 0.7));
            p(-2, hy, 1, 2, sp.hair || '#2a2020');
            break;
        case 'beanie':
            p(-2, hy - 3, 6, 4, hc);
            p(-2, hy, 6, 1, shade(hc, 0.75));
            break;
        case 'hardhat':
            p(-3, hy - 2, 8, 2, hc);
            p(-2, hy - 3, 6, 1, hc);
            p(4, hy - 1, 2, 1, hc);
            break;
        case 'bald':
            p(-2, hy - 1, 5, 1, shade(skin, 1.12));
            p(-2, hy, 1, 3, sp.hair || '#8a8a8a');
            break;
        default:
            p(-2, hy - 1, 5, 2, sp.hair || '#2a2020');
            p(-2, hy, 1, 4, sp.hair || '#2a2020');
    }
}
function portraitFrom(sp, rim) {
    var _a = mk(36, 36), c = _a[0], g = _a[1], sk = sp.skin || '#c9a27e', sd = shade(sk, 0.72);
    var gr = g.createLinearGradient(36, 0, 0, 36);
    gr.addColorStop(0, rgba(rim, 0.45));
    gr.addColorStop(1, 'rgba(8,6,14,1)');
    R(g, 0, 0, 36, 36, '#0b0911');
    g.fillStyle = gr;
    g.fillRect(0, 0, 36, 36);
    R(g, 3, 30, 30, 6, sp.coat);
    if (sp.shirt)
        R(g, 15, 29, 6, 7, sp.shirt);
    if (sp.tie)
        R(g, 17, 30, 2, 6, sp.tie);
    if (sp.scarf)
        R(g, 10, 28, 16, 3, sp.scarf);
    R(g, 11, 10, 14, 16, sk);
    R(g, 12, 26, 12, 3, sk);
    R(g, 11, 10, 4, 18, sd);
    R(g, 15, 28, 6, 3, sd);
    R(g, 14, 17, 3, 1, '#111');
    R(g, 20, 17, 3, 1, '#111');
    R(g, 13, 15, 4, 1, sd);
    R(g, 19, 15, 4, 1, sd);
    R(g, 17, 18, 2, 4, sd);
    R(g, 15, 24, 6, 1, sp.lips || '#6a4038');
    R(g, 24, 11, 1, 16, rgba(rim, 0.9));
    if (sp.beard) {
        R(g, 11, 21, 14, 8, sp.beard);
        R(g, 11, 21, 3, 8, shade(sp.beard, 0.7));
        R(g, 15, 24, 6, 1, '#3a2a24');
    }
    if (sp.mustache)
        R(g, 13, 22, 10, 2, sp.mustache);
    if (sp.glasses) {
        R(g, 13, 16, 5, 1, '#b0b0b8');
        R(g, 19, 16, 5, 1, '#b0b0b8');
        R(g, 13, 16, 1, 3, '#b0b0b8');
        R(g, 23, 16, 1, 3, '#b0b0b8');
    }
    var hc = sp.hatCol || '#2b2622';
    switch (sp.hat) {
        case 'scarf':
            R(g, 8, 4, 20, 9, hc);
            R(g, 6, 8, 6, 26, hc);
            R(g, 24, 8, 6, 26, hc);
            R(g, 9, 27, 18, 5, hc);
            break;
        case 'fedora':
            R(g, 6, 9, 24, 2, hc);
            R(g, 10, 1, 16, 8, hc);
            R(g, 10, 6, 16, 2, shade(hc, 0.55));
            break;
        case 'cap':
            R(g, 9, 4, 18, 7, hc);
            R(g, 8, 10, 20, 2, shade(hc, 0.6));
            break;
        case 'beanie':
            R(g, 9, 2, 18, 9, hc);
            R(g, 9, 9, 18, 2, shade(hc, 0.7));
            break;
        case 'hardhat':
            R(g, 8, 3, 20, 8, hc);
            R(g, 6, 9, 24, 2, shade(hc, 0.8));
            R(g, 12, 4, 8, 1, shade(hc, 1.2));
            break;
        case 'bald':
            R(g, 11, 8, 14, 3, shade(sk, 1.12));
            R(g, 10, 12, 2, 7, sp.hair || '#8a8a8a');
            R(g, 24, 12, 2, 7, sp.hair || '#8a8a8a');
            break;
        default:
            R(g, 10, 5, 16, 6, sp.hair || '#2a2020');
            R(g, 10, 5, 3, 12, sp.hair || '#2a2020');
            R(g, 23, 6, 3, 8, sp.hair || '#2a2020');
    }
    return c;
}
function drawNPC(g, n, cx) {
    var f = n.f || (P.x >= n.x ? 1 : -1);
    if (n.clip) {
        g.save();
        g.beginPath();
        g.rect(n.clip[0] - cx, n.clip[1], n.clip[2], n.clip[3]);
        g.clip();
    }
    drawPerson(g, Math.round(n.x) - cx, FLOOR + (n.yo || 0), f, n.sp);
    if (n.clip)
        g.restore();
}
// ---------- scene toolkit for cases 3–7 ----------
function paintInterior(S, o, r) {
    var g = S.bgx;
    R(g, 0, 0, S.w, 12, o.ceil || '#15161b');
    R(g, 0, 11, S.w, 1, '#2a2c33');
    for (var y = 12; y < 124; y++)
        R(g, 0, y, S.w, 1, shade(o.wall, 0.9 + 0.06 * Math.sin(y * 0.3) + 0.06 * (y - 12) / 112));
    for (var i = 0; i < S.w * 0.4; i++)
        R(g, r() * S.w, 12 + r() * 110, 1, 1, shade(o.wall, r() < 0.5 ? 0.95 : 1.05));
    if (o.pattern === 'damask')
        for (var y = 18; y < 120; y += 10)
            for (var x = (y / 10 % 2) * 6; x < S.w; x += 12) {
                R(g, x + 2, y, 1, 1, shade(o.wall, 1.25));
                R(g, x + 1, y + 1, 3, 1, shade(o.wall, 1.2));
                R(g, x + 2, y + 2, 1, 1, shade(o.wall, 1.25));
            }
    if (o.pattern === 'tile')
        for (var y = 14; y < 124; y += 8) {
            R(g, 0, y, S.w, 1, shade(o.wall, 0.8));
            for (var x = (y / 8 % 2) * 8; x < S.w; x += 16)
                R(g, x, y, 1, 8, shade(o.wall, 0.8));
        }
    R(g, 0, 126, S.w, 20, o.wall2);
    for (var x = 0; x < S.w; x += 12)
        R(g, x, 127, 1, 19, shade(o.wall2, 0.8));
    R(g, 0, 124, S.w, 2, o.trim || '#6f7f72');
    R(g, 0, 144, S.w, 2, '#1c1a1e');
    var fl = o.floor || 'wood';
    for (var y = 146; y < H; y += 4) {
        var k = 0.85 + (y - 146) / 34 * 0.25;
        if (fl === 'tile') {
            for (var x = ((y / 4) % 2) * 12; x < S.w; x += 24) {
                R(g, x, y, 12, 4, shade(o.floorCol || '#6a6660', k));
                R(g, x + 12, y, 12, 4, shade(o.floorCol || '#6a6660', k * 0.88));
            }
        }
        else if (fl === 'concrete')
            R(g, 0, y, S.w, 4, shade(o.floorCol || '#5a5a5e', k));
        else {
            R(g, 0, y, S.w, 4, shade(o.floorCol || '#5a3a24', k * (y / 4 % 2 ? 1 : 0.9)));
            for (var x = (y * 7) % 30; x < S.w; x += 30)
                R(g, x, y, 1, 4, shade(o.floorCol || '#5a3a24', 0.6));
        }
    }
    for (var i = 0; i < S.w / 2; i++)
        R(g, r() * S.w, 146 + r() * 34, 2, 1, 'rgba(200,210,230,0.1)');
}
function paintExterior(S, o, r) {
    var g = S.bgx, e = S.emx;
    for (var _i = 0, _a = o.buildings || []; _i < _a.length; _i++) {
        var b = _a[_i];
        if (b.style === 'concrete') {
            R(g, b.x, b.top, b.w, 146 - b.top, b.col);
            for (var y = b.top + 10; y < 146; y += 14)
                R(g, b.x, y, b.w, 2, shade(b.col, 0.8));
        }
        else
            brickWall(g, b.x, b.top, b.w, 146 - b.top, b.col, b.x * 5 + 11);
        roofEdge(g, b.x, b.w, b.top, r);
        for (var y = b.top + 14; y < 110; y += 28)
            for (var x = b.x + 10; x < b.x + b.w - 14; x += 24 + (r() * 8 | 0))
                win(g, e, x, y, 10, 14, r, r() < (b.lit || 0.3));
    }
    if (o.ground === 'mud') {
        for (var y = 146; y < H; y++)
            R(g, 0, y, S.w, 1, shade('#6a6258', 0.8 + (y - 146) / 34 * 0.3));
        for (var i = 0; i < S.w * 2; i++)
            R(g, r() * S.w, 146 + r() * 34, 2, 1, r() < 0.5 ? '#4a4038' : '#c8ccd8');
        for (var x = 0; x < S.w; x++)
            if (r() < 0.6)
                R(g, x, 145 - (r() * 2 | 0), 1, 2, '#d8dde8');
    }
    else if (o.ground === 'roof') {
        for (var y = 146; y < H; y++)
            R(g, 0, y, S.w, 1, shade('#7a7a80', 0.85 + (y - 146) / 34 * 0.2));
        for (var i = 0; i < S.w * 2; i++)
            R(g, r() * S.w, 146 + r() * 34, 2 + r() * 3, 1, r() < 0.4 ? '#dfe4ee' : '#5a5a60');
    }
    else
        groundSnow(g, 0, S.w, o.seed || 3);
}
function skyMaskFromBg(S, horizon) {
    var d = S.bgx.getImageData(0, 0, S.w, horizon).data;
    S.skyx.fillStyle = '#fff';
    for (var y = 0; y < horizon; y++) {
        var run = -1;
        for (var x = 0; x <= S.w; x++) {
            var open = x < S.w && d[(y * S.w + x) * 4 + 3] === 0;
            if (open && run < 0)
                run = x;
            if (!open && run >= 0) {
                S.skyx.fillRect(run, y, x - run, 1);
                run = -1;
            }
        }
    }
}
function makeSkyGrad(stops) { var _a = mk(WMAX, H), c = _a[0], g = _a[1], gr = g.createLinearGradient(0, 0, 0, H); stops.forEach(function (_a) {
    var k = _a[0], col = _a[1];
    return gr.addColorStop(k, col);
}); g.fillStyle = gr; g.fillRect(0, 0, WMAX, H); return c; }
// props share one scale with the characters: wall pieces stand on the wall line (y 146), free-standing
// furniture a step into the room (FB). Each returns its occluders; z = depth in front of the wall (see lighting).
var FB = 152;
function footShadow(g, x, w, y) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x - 1, (y || FB) - 1, w + 2, 2); }
function pxLine(g, x0, y0, x1, y1, c) { var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1; for (var i = 0; i <= n; i++)
    R(g, Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), 1, 1, c); }
var PROP = {
    door: function (g, e, o, r) {
        var x = o.x, w = o.w || 18, h = o.h || 34, y = 146 - h, c = o.col || '#4a3526';
        R(g, x - 2, y - 2, w + 4, h + 2, '#16121a');
        R(g, x, y, w, h, c);
        R(g, x + 2, y + 3, w - 4, (h >> 1) - 4, shade(c, 0.85));
        R(g, x + 2, y + (h >> 1) + 2, w - 4, (h >> 1) - 4, shade(c, 0.85));
        R(g, x + w - 4, y + (h >> 1), 2, 2, '#c8a040');
        if (o.glass) {
            R(g, x + 4, y + 4, w - 8, 8, '#141820');
            R(e, x + 5, y + 5, w - 10, 6, o.glass);
        }
        if (o.sign) {
            var t = pixText(o.sign, 5, '#d8c890');
            g.drawImage(t, x + (w >> 1) - (t.width >> 1), y - 13);
        }
    },
    window: function (g, e, o, r) {
        var x = o.x, y = o.y, w = o.w, h = o.h;
        R(g, x - 2, y - 2, w + 4, h + 4, '#1a1410');
        var top = o.outside === 'dawn' ? [120, 90, 120] : o.outside === 'day' ? [140, 150, 170] : [18, 26, 58], bot = o.outside === 'dawn' ? [230, 150, 110] : o.outside === 'day' ? [190, 195, 205] : [40, 48, 92];
        for (var yy = 0; yy < h; yy++) {
            var k = yy / h;
            R(e, x, y + yy, w, 1, "rgb(".concat(lerp(top[0], bot[0], k) | 0, ",").concat(lerp(top[1], bot[1], k) | 0, ",").concat(lerp(top[2], bot[2], k) | 0, ")"));
        }
        for (var i = 0; i < w * h / 30; i++)
            R(e, x + r() * w, y + r() * h, 1, 1, 'rgba(235,240,255,0.8)');
        for (var xx = x; xx < x + w; xx += 5)
            R(e, xx, y + h - 5 - (r() * 6 | 0), 4, 10, 'rgba(10,12,24,0.8)');
        R(e, x + (w >> 1), y, 1, h, '#1a1410');
        R(e, x, y + (h >> 1), w, 1, '#1a1410');
        R(g, x - 3, y + h + 2, w + 6, 2, '#5d5662');
        R(g, x - 2, y + h + 1, w + 4, 1, '#d7dfee');
        return [{ x: x - 3, y: y + h + 1, w: w + 6, h: 3, z: 3 }];
    },
    archWindow: function (g, e, o, r) {
        var x = o.x, w = o.w, top = o.top || 20, bot = o.bot || 120;
        R(g, x - 3, top - 3, w + 6, bot - top + 6, '#2a2630');
        for (var yy = top; yy < bot; yy++) {
            var k = (yy - top) / (bot - top), hw = yy < top + w / 2 ? Math.sqrt(Math.max(0, Math.pow((w / 2), 2) - Math.pow((top + w / 2 - yy), 2))) : w / 2;
            R(e, x + w / 2 - hw, yy, hw * 2, 1, "rgb(".concat(lerp(70, 220, k) | 0, ",").concat(lerp(70, 140, k) | 0, ",").concat(lerp(120, 130, k) | 0, ")"));
        }
        for (var xx = x + 6; xx < x + w; xx += 8)
            R(e, xx, top + 8, 1, bot - top - 8, 'rgba(30,26,40,0.9)');
        for (var yy = top + 16; yy < bot; yy += 14)
            R(e, x, yy, w, 1, 'rgba(30,26,40,0.9)');
        R(g, x - 4, bot + 2, w + 8, 3, '#4a4652');
    },
    desk: function (g, e, o) {
        var x = o.x, w = o.w || 48, c = o.col || '#5a3a24', t = FB - 13;
        R(g, x, t, w, 2, c);
        R(g, x, t + 2, w, 1, shade(c, 0.7));
        R(g, x + 2, t + 3, 14, FB - t - 3, shade(c, 0.85));
        R(g, x + 2, t + 7, 14, 1, shade(c, 0.5));
        R(g, x + 8, t + 5, 2, 1, '#b09050');
        R(g, x + 8, t + 9, 2, 1, '#b09050');
        R(g, x + w - 4, t + 3, 3, FB - t - 3, shade(c, 0.65));
        footShadow(g, x, w);
        return [{ x: x, y: t, w: w, h: 2, z: 13, zb: 5 }, { x: x + 2, y: t + 3, w: 14, h: FB - t - 3, z: 13, zb: 5 }];
    },
    lampDesk: function (g, e, o) {
        var x = o.x, y = o.y || FB - 13, c = o.col || '#1f6a44';
        R(g, x - 3, y - 1, 7, 1, '#b08a3a');
        R(g, x, y - 6, 1, 5, '#b08a3a');
        R(g, x - 4, y - 10, 9, 4, c);
        R(g, x - 4, y - 10, 9, 1, shade(c, 1.5));
        R(e, x - 2, y - 6, 5, 1, '#fff0c0');
        return [{ x: x - 4, y: y - 10, w: 9, h: 4, z: 12 }];
    },
    shelf: function (g, e, o, r) {
        var x = o.x, w = o.w, y = o.y || 100, h = o.h || 12;
        for (var yy = y; yy <= y + h; yy += 12) {
            R(g, x, yy, w, 2, '#4a3526');
            for (var xx = x + 2; xx < x + w - 4; xx += 4 + (r() * 3 | 0)) {
                var bh = 4 + (r() * 4 | 0);
                R(g, xx, yy - bh, 3, bh, ['#2a2a30', '#6a5a4a', '#8a3030', '#3a5a7a', '#c8b890'][r() * 5 | 0]);
            }
        }
        return [{ x: x, y: y, w: w, h: 2, z: 4 }];
    },
    bookshelf: function (g, e, o, r) {
        var x = o.x, w = o.w || 28, top = 146 - (o.h || 32);
        R(g, x, top, w, 146 - top, '#3a2618');
        R(g, x + 2, top + 2, w - 4, 144 - top, '#24170e');
        for (var yy = top + 9; yy < 146; yy += 8) {
            R(g, x + 2, yy, w - 4, 1, '#4a3220');
            for (var xx = x + 3; xx < x + w - 3; xx += 2)
                R(g, xx, yy - 6 + (r() * 2 | 0), 1, 6 - (r() * 2 | 0), ['#6a2020', '#20406a', '#3a5a2a', '#8a7040', '#5a3a5a', '#c8b890'][r() * 6 | 0]);
        }
        return [{ x: x + 1, y: top, w: w - 2, h: 146 - top, z: 5 }];
    },
    cabinet: function (g, e, o) {
        var x = o.x;
        if (o.toppled) {
            R(g, x, FB - 9, 22, 9, '#5a5e64');
            R(g, x, FB - 9, 22, 1, '#7a7e84');
            R(g, x + 7, FB - 9, 1, 9, '#44484e');
            R(g, x + 14, FB - 9, 1, 9, '#44484e');
            for (var _i = 0, _a = [2, 9, 16]; _i < _a.length; _i++) {
                var dx = _a[_i];
                R(g, x + dx, FB - 5, 3, 1, '#c8c8d0');
            }
            footShadow(g, x, 22);
            return [{ x: x, y: FB - 9, w: 22, h: 9, z: 14, zb: 6 }];
        }
        R(g, x, 124, 12, 22, '#5a5e64');
        for (var yy = 126; yy < 145; yy += 7) {
            R(g, x + 1, yy, 10, 6, '#6a6e74');
            R(g, x + 4, yy + 2, 4, 1, '#c8c8d0');
        }
        return [{ x: x, y: 124, w: 12, h: 22, z: 6 }];
    },
    papers: function (g, e, o, r) { for (var i = 0; i < (o.n || 22); i++) {
        var x = o.x + r() * o.w, y = 152 + r() * 16;
        R(g, x, y, 4 + r() * 3, 2, r() < 0.8 ? '#d8d0bc' : '#8a8070');
    } },
    photosLine: function (g, e, o, r) {
        var x = o.x, w = o.w, y = o.y || 88;
        for (var xx = x; xx < x + w; xx++)
            R(g, xx, y + Math.round(Math.sin((xx - x) / w * Math.PI) * 3), 1, 1, '#8a8070');
        for (var xx = x + 5; xx < x + w - 7; xx += 10) {
            var yy = y + Math.round(Math.sin((xx - x) / w * Math.PI) * 3) + 1;
            R(g, xx, yy, 7, 8, '#e8e0d0');
            R(g, xx + 1, yy + 1, 5, 5, ['#3a3a44', '#5a4a3a', '#2a3a4a', '#4a4a4a'][r() * 4 | 0]);
            R(g, xx + 2, yy + 3, 2, 2, '#7a7a80');
            R(g, xx + 3, yy - 1, 1, 2, '#c8a040');
        }
    },
    bulbHang: function (g, e, o) { var y = o.y || 84; R(g, o.x, 12, 1, y - 12, '#1a1a1e'); R(g, o.x - 2, y, 5, 2, '#3a3a40'); R(e, o.x - 1, y + 2, 3, 3, o.col || '#fff0c8'); return [{ x: o.x - 1, y: y - 1, w: 3, h: 2, z: 20 }]; },
    darkroom: function (g, e, o) {
        var x = o.x, w = o.w || 60, top = 100;
        R(g, x, top, w, 146 - top, '#14101a');
        R(g, x, 144, w, 2, '#0c0a10');
        R(g, x - 3, top - 3, 3, 149 - top, '#2a2230');
        R(g, x + w, top - 3, 3, 149 - top, '#2a2230');
        R(g, x - 3, top - 4, w + 6, 4, '#2a2230');
        for (var xx = x; xx < x + 10; xx += 2)
            R(g, xx, top, 2, 146 - top, xx % 4 ? '#1a1418' : '#221a20');
        R(g, x + w / 2 - 15, top - 15, 30, 9, '#3a1a1a');
        e.drawImage(pixText('تاریکخانه', 5, '#ff5a5a'), x + w / 2 - 14, top - 17);
        R(g, x + w / 2 - 1, top, 1, 6, '#1a1a1e');
        R(e, x + w / 2 - 2, top + 6, 4, 3, '#ff3030');
        return [{ x: x - 3, y: top - 4, w: w + 6, h: 4, z: 9 }, { x: x - 3, y: top, w: 3, h: 146 - top, z: 9 }, { x: x + w, y: top, w: 3, h: 146 - top, z: 9 }];
    },
    enlarger: function (g, e, o) {
        var x = o.x, t = FB - 13;
        R(g, x - 8, t, 26, 2, '#3a3a40');
        R(g, x - 6, t + 2, 2, FB - t - 2, '#2a2a30');
        R(g, x + 14, t + 2, 2, FB - t - 2, '#2a2a30');
        R(g, x + 2, t - 22, 2, 22, '#4a4a52');
        R(g, x - 3, t - 22, 11, 7, '#2a2a30');
        R(g, x - 1, t - 15, 7, 4, '#3a3a42');
        R(g, x + 1, t - 11, 3, 2, '#1a1a1e');
        R(g, x - 5, t - 2, 16, 2, '#1a1a1e');
        footShadow(g, x - 8, 26);
        return [{ x: x - 3, y: t - 22, w: 11, h: 11, z: 12 }, { x: x - 8, y: t, w: 26, h: 2, z: 13, zb: 5 }];
    },
    trays: function (g, e, o) {
        var x = o.x, t = FB - 13;
        R(g, x, t, 40, 2, '#3a3a40');
        R(g, x + 2, t + 2, 2, FB - t - 2, '#2a2a30');
        R(g, x + 36, t + 2, 2, FB - t - 2, '#2a2a30');
        for (var i = 0; i < 3; i++) {
            R(g, x + 2 + i * 12, t - 2, 10, 2, ['#a02828', '#28a048', '#2848a0'][i]);
            R(g, x + 3 + i * 12, t - 2, 8, 1, '#101014');
        }
        footShadow(g, x, 40);
        return [{ x: x, y: t, w: 40, h: 2, z: 13, zb: 5 }];
    },
    answer: function (g, e, o) { var y = FB - 13; R(g, o.x, y - 5, 11, 5, '#1a1a1e'); R(g, o.x + 1, y - 4, 5, 3, '#2a2a30'); R(g, o.x + 2, y - 3, 3, 1, '#5a5a60'); R(g, o.x + 8, y - 3, 2, 1, '#8a8a90'); },
    phoneDesk: function (g, e, o) { var y = o.y || FB - 13, c = o.col || '#1a1a1e'; if (o.wall) {
        R(g, o.x - 2, y, 14, 2, '#4a3526');
        R(g, o.x + 4, y + 2, 2, 4, '#3a2a1c');
    } R(g, o.x, y - 4, 10, 4, c); R(g, o.x - 1, y - 6, 12, 2, shade(c, 1.4)); R(g, o.x + 3, y - 3, 4, 2, '#8a8a90'); },
    bike: function (g, e, o) {
        var x = o.x, b = 156, cy = b - 7, _a = mk(40, 24), c = _a[0], bg = _a[1], f = '#2a6a8a', X = 8, Y = 14; // drawn once into a stamp so its shadow keeps the spokes
        for (var _i = 0, _b = [X, X + 24]; _i < _b.length; _i++) {
            var hx = _b[_i];
            for (var a = 0; a < 6.28; a += 0.2)
                R(bg, Math.round(hx + Math.cos(a) * 7), Math.round(Y + Math.sin(a) * 7), 1, 1, '#1e1e24');
            R(bg, hx, Y, 1, 1, '#8a8a90');
            for (var a = 0; a < 6.28; a += 1.05)
                pxLine(bg, hx, Y, Math.round(hx + Math.cos(a) * 6), Math.round(Y + Math.sin(a) * 6), '#4a4a52');
        }
        pxLine(bg, X, Y, X + 9, Y - 9, f);
        pxLine(bg, X + 9, Y - 9, X + 12, Y, f);
        pxLine(bg, X, Y, X + 12, Y, f);
        pxLine(bg, X + 12, Y, X + 21, Y - 10, f);
        pxLine(bg, X + 9, Y - 8, X + 21, Y - 9, f);
        pxLine(bg, X + 21, Y - 10, X + 24, Y, f);
        pxLine(bg, X + 21, Y - 10, X + 20, Y - 13, '#8a8a90');
        R(bg, X + 17, Y - 13, 5, 1, '#1a1a1e');
        R(bg, X + 6, Y - 11, 6, 1, '#1a1a1e');
        R(bg, X + 11, Y + 1, 3, 1, '#3a3a40');
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(x - 7, b - 1, 38, 2);
        g.drawImage(c, x - X, cy - Y);
        return [{ x: x - 8, y: cy - 14, w: 40, h: 22, z: 22, card: 1, stamp: { c: c, x: x - X, y: cy - Y } }];
    },
    coatrack: function (g, e, o) {
        var x = o.x, t = FB - 29;
        R(g, x, t, 2, 29, '#3a2a1c');
        R(g, x - 5, FB - 1, 12, 1, '#3a2a1c');
        R(g, x - 4, t, 10, 1, '#3a2a1c');
        footShadow(g, x - 5, 12);
        if (o.coat) {
            R(g, x - 4, t + 3, 10, 17, o.coat);
            R(g, x - 2, t + 2, 6, 2, shade(o.coat, 0.7));
        }
        return [{ x: x - 4, y: t + 2, w: 10, h: o.coat ? 18 : 2, z: 14 }, { x: x, y: t, w: 2, h: 29, z: 14 }];
    },
    plant: function (g, e, o) {
        var x = o.x;
        R(g, x - 4, FB - 7, 8, 7, '#6a3a2a');
        R(g, x - 5, FB - 8, 10, 2, '#7a4a3a');
        footShadow(g, x - 4, 8);
        for (var i = 0; i < 14; i++)
            R(g, x - 7 + (i * 7) % 14, FB - 24 + (i * 5) % 16, 3, 2, i % 2 ? '#2a5a3a' : '#3a7a4a');
        return [{ x: x - 6, y: FB - 24, w: 12, h: 24, z: 13, zb: 9 }];
    },
    sofa: function (g, e, o) {
        var x = o.x, w = o.w || 40, c = o.col || '#6a2030';
        R(g, x, FB - 16, w, 8, shade(c, 0.8));
        R(g, x, FB - 9, w, 6, c);
        R(g, x, FB - 9, w, 1, shade(c, 1.15));
        R(g, x - 3, FB - 12, 4, 9, shade(c, 0.9));
        R(g, x + w - 1, FB - 12, 4, 9, shade(c, 0.9));
        R(g, x + 1, FB - 3, 2, 3, '#2a1a10');
        R(g, x + w - 3, FB - 3, 2, 3, '#2a1a10');
        footShadow(g, x - 3, w + 6);
        return [{ x: x - 3, y: FB - 16, w: w + 6, h: 13, z: 13, zb: 5 }];
    },
    fireplace: function (g, e, o, r, S) {
        var x = o.x;
        R(g, x, 122, 36, 24, '#5a5048');
        R(g, x - 3, 120, 42, 3, '#7a6a5a');
        R(g, x + 8, 130, 20, 16, '#1a1210');
        R(g, x + 9, 143, 18, 2, '#3a2a1a');
        S.dyn.push(function (g2, cx) { for (var i = 0; i < 10; i++) {
            var fx = x + 10 + (Math.random() * 16 | 0), h = 2 + Math.random() * 8 * FX.fireK | 0;
            R(g2, fx - cx, 143 - h, 1, h, i % 3 ? '#ff7a1e' : '#ffb03a');
            R(g2, fx - cx, 143 - h, 1, 1, '#ffe08a');
        } });
        S.fx.push(function (dt) { if (Math.random() < dt * 5)
            puff(x + 18 + (Math.random() - 0.5) * 10, 136, (Math.random() - 0.5) * 5, -10 - Math.random() * 12, 0.7, [255, 160, 60], 1, true); });
        return [{ x: x - 3, y: 120, w: 42, h: 3, z: 8 }, { x: x, y: 123, w: 8, h: 23, z: 6 }, { x: x + 28, y: 123, w: 8, h: 23, z: 6 }];
    },
    painting: function (g, e, o, r) {
        var x = o.x, y = o.y, w = o.w, h = o.h;
        R(g, x - 3, y - 3, w + 6, h + 6, '#8a6a2a');
        R(g, x - 1, y - 1, w + 2, h + 2, '#c8a040');
        R(g, x, y, w, h, '#2a3a2a');
        for (var i = 0; i < w * h / 30; i++)
            R(g, x + r() * w, y + h * 0.4 + r() * h * 0.6, 2, 1, ['#3a5a3a', '#5a7a4a', '#8a8a5a'][r() * 3 | 0]);
        R(g, x + w * 0.6, y + 3, 4, 4, '#d8c890');
        return [{ x: x - 3, y: y - 3, w: w + 6, h: h + 6, z: 2 }];
    },
    piano: function (g, e, o) {
        var x = o.x;
        R(g, x, 122, 34, 24, '#0e0c10');
        R(g, x + 2, 124, 30, 1, '#3a3440');
        R(g, x - 1, 132, 36, 3, '#e8e4dc');
        for (var xx = x + 1; xx < x + 34; xx += 3)
            R(g, xx, 132, 1, 2, '#0e0c10');
        R(g, x - 1, 135, 36, 1, '#1a161c');
        R(g, x + 1, 136, 2, 10, '#0e0c10');
        R(g, x + 31, 136, 2, 10, '#0e0c10');
        R(g, x + 13, 118, 7, 4, '#c8a040');
        R(g, x + 16, 115, 1, 3, '#e8e0c8');
        return [{ x: x, y: 122, w: 34, h: 24, z: 7 }];
    },
    chandelier: function (g, e, o) { var x = o.x, y = o.y || 70; R(g, x, 12, 1, y - 12, '#8a7a4a'); R(g, x - 8, y, 17, 2, '#c8a040'); for (var i = -7; i <= 7; i += 3) {
        R(g, x + i, y + 2, 1, 3, '#d8d0b0');
        R(e, x + i, y + 4, 1, 2, '#fff4d0');
    } },
    clockTall: function (g, e, o) {
        var x = o.x;
        R(g, x, 114, 11, 32, '#3a2414');
        R(g, x - 1, 113, 13, 2, '#4a3020');
        R(g, x + 2, 116, 7, 7, '#e8e0c8');
        R(g, x + 5, 117, 1, 3, '#1a1a1a');
        R(g, x + 5, 119, 2, 1, '#1a1a1a');
        R(g, x + 3, 126, 5, 16, '#24160c');
        R(g, x + 5, 134, 1, 5, '#c8a040');
        R(g, x + 4, 139, 3, 2, '#c8a040');
        return [{ x: x, y: 113, w: 11, h: 33, z: 6 }];
    },
    board: function (g, e, o, r, S) {
        var x = o.x, w = o.w || 110, y = o.y || 24;
        R(g, x - 3, y, w + 6, 44, '#1a1a1e');
        R(g, x, y + 3, w, 38, '#0a0a0c');
        (o.lines || []).forEach(function (ln, i) { var t = pixText(ln, 8, '#ffb030'); e.drawImage(t, x + w - 4 - t.width, y + i * 12); });
        g.drawImage(pixText(o.title || 'حرکتِ قطارها', 7, '#d8d8e0'), x + w / 2 - 22, y - 12);
        return [{ x: x - 3, y: y, w: w + 6, h: 44, z: 8 }];
    },
    booth: function (g, e, o) {
        var x = o.x, w = o.w || 44;
        R(g, x, 104, w, 42, '#4a3a2a');
        R(g, x + 2, 106, w - 4, 40, '#5a4a36');
        R(g, x + 6, 115, w - 12, 13, '#141820');
        R(g, x + 7, 116, w - 14, 11, '#3a4a5a');
        R(g, x + 4, 128, w - 8, 3, '#3a2a1a');
        R(g, x + 4, 106, w - 8, 7, '#2a3a5a');
        var t = pixText(o.sign || 'بلیت‌فروشی', 5, '#e8e0c8');
        g.drawImage(t, x + (w >> 1) - (t.width >> 1), 104);
        return [{ x: x, y: 104, w: w, h: 11, z: 6 }, { x: x, y: 128, w: w, h: 18, z: 6 }];
    },
    lockers: function (g, e, o, r) {
        var x = o.x, cols = o.cols || 6, s = 10, top = 146 - 4 * s;
        for (var c = 0; c < cols; c++)
            for (var rr = 0; rr < 4; rr++) {
                var lx = x + c * s, ly = top + rr * s, n = c * 4 + rr + 1, open = (o.open || []).includes(n);
                R(g, lx, ly, s - 1, s - 1, open ? '#141418' : '#6a6e76');
                if (!open) {
                    R(g, lx, ly, s - 1, 1, '#8a8e96');
                    R(g, lx + 6, ly + 4, 1, 2, '#2a2a30');
                    g.drawImage(pixText(toFa(n), 5, '#1a1a1e', 'normal'), lx, ly - 3);
                }
                else {
                    R(g, lx - 3, ly, 3, s - 1, '#7a7e86');
                    R(g, lx - 2, ly + 3, 1, 2, '#3a3a40');
                }
            }
        return [{ x: x, y: top, w: cols * s, h: 4 * s, z: 4 }];
    },
    bench: function (g, e, o) {
        var x = o.x, w = o.w || 36;
        R(g, x, FB - 7, w, 2, '#6a4a2a');
        R(g, x, FB - 15, w, 2, '#6a4a2a');
        R(g, x + 2, FB - 5, 2, 5, '#2a2a30');
        R(g, x + w - 4, FB - 5, 2, 5, '#2a2a30');
        R(g, x + 2, FB - 15, 1, 8, '#2a2a30');
        R(g, x + w - 3, FB - 15, 1, 8, '#2a2a30');
        footShadow(g, x, w);
        return [{ x: x, y: FB - 7, w: w, h: 2, z: 14, zb: 8 }, { x: x, y: FB - 15, w: w, h: 2, z: 10 }];
    },
    cart: function (g, e, o) {
        var x = o.x;
        R(g, x, 151, 30, 2, '#3a3a42');
        R(g, x + 2, 157, 4, 3, '#111');
        R(g, x + 24, 157, 4, 3, '#111');
        R(g, x + 3, 153, 2, 4, '#3a3a42');
        R(g, x + 25, 153, 2, 4, '#3a3a42');
        R(g, x + 27, 136, 2, 15, '#3a3a42');
        R(g, x + 25, 135, 6, 2, '#5a5a62');
        R(g, x + 23, 139, 9, 7, '#c8b060');
        g.drawImage(pixText(toFa(o.n || 1), 5, '#1a1a1e'), x + 24, 136);
        (o.bags || ['#6a3a1a', '#2a4a6a', '#8a2a2a']).forEach(function (c, i) { R(g, x + 1 + i * 7, 143 - (i % 2) * 3, 7, 8 + (i % 2) * 3, c); R(g, x + 3 + i * 7, 141 - (i % 2) * 3, 3, 2, '#1a1a1a'); });
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(x, 159, 30, 2);
        return [{ x: x + 1, y: 140, w: 26, h: 11, z: 30, zb: 22 }];
    },
    column: function (g, e, o) {
        var x = o.x, w = o.w || 12, c = o.col || '#8a8680', top = o.top || 12;
        R(g, x, top, w, 146 - top, c);
        R(g, x, top, 2, 146 - top, shade(c, 1.15));
        R(g, x + w - 2, top, 2, 146 - top, shade(c, 0.75));
        if (o.rebar)
            for (var i = 1; i < w; i += 3)
                R(g, x + i, top - 8, 1, 8, '#6a3a2a');
        if (o.crack)
            for (var i = 0; i < 26; i++)
                R(g, x + 4 + Math.round(Math.sin(i * 0.9) * 2), 112 + i, 1, 1, '#3a3834');
        return [{ x: x + 1, y: top, w: w - 2, h: 146 - top, z: o.z || 10 }];
    },
    trainDoor: function (g, e, o) {
        var x = o.x, w = o.w || 70;
        R(g, x - 4, 62, w + 8, 84, '#3a3440');
        R(g, x, 66, w, 80, '#0e0e14');
        R(e, x + 2, 88, w - 4, 54, '#2a5a4a');
        R(e, x + 2, 88, w - 4, 1, '#c8c8c8');
        for (var xx = x + 4; xx < x + w - 8; xx += 12)
            R(e, xx, 95, 8, 8, '#e8d090');
        R(e, x + 2, 134, w - 4, 1, '#c8c8c8');
        var dx = x + (w >> 1) - 7;
        R(e, dx, 108, 14, 34, '#1e3e34');
        R(e, dx + 2, 111, 4, 8, '#e8d090');
        R(e, dx + 8, 111, 4, 8, '#e8d090');
        R(e, dx + 6, 108, 1, 34, '#0e2a22');
        var t = pixText(o.sign || 'سکوی ۲', 6, '#e8e0c8');
        g.drawImage(t, x + (w >> 1) - (t.width >> 1), 48);
        return [{ x: x - 4, y: 62, w: 4, h: 84, z: 8 }, { x: x + w, y: 62, w: 4, h: 84, z: 8 }];
    },
    stationClock: function (g, e, o) { var x = o.x, y = o.y || 30; R(g, x, 12, 1, y - 18, '#2a2a30'); R(g, x - 1, y - 12, 2, 6, '#2a2a30'); R(g, x - 7, y - 7, 14, 14, '#2a2a30'); R(g, x - 6, y - 6, 12, 12, '#e8e4d8'); R(g, x, y - 5, 1, 5, '#1a1a1a'); R(g, x, y, 4, 1, '#1a1a1a'); },
    radioDesk: function (g, e, o, r, S) {
        var x = o.x, t = FB - 13;
        R(g, x, t, 32, 2, '#4a4a52');
        R(g, x + 2, t + 2, 2, 11, '#2a2a30');
        R(g, x + 28, t + 2, 2, 11, '#2a2a30');
        footShadow(g, x, 32);
        R(g, x + 4, t - 10, 18, 10, '#2a2c30');
        R(g, x + 6, t - 8, 6, 5, '#1a3a1a');
        R(g, x + 14, t - 8, 2, 2, '#8a8a90');
        R(g, x + 17, t - 8, 2, 2, '#8a8a90');
        R(g, x + 19, t - 22, 1, 12, '#5a5a60');
        S.dyn.push(function (g2, cx) { R(g2, x + 7 - cx, t - 7, 4, 1, Math.random() < 0.5 ? '#6aff8a' : '#2a8a4a'); R(g2, x + 15 - cx, t - 4, 1, 1, (G.t % 1) < 0.5 ? '#ff4040' : '#401010'); });
        return [{ x: x + 4, y: t - 10, w: 18, h: 10, z: 12 }, { x: x, y: t, w: 32, h: 2, z: 13, zb: 5 }];
    },
    fence: function (g, e, o, r) {
        var x = o.x, w = o.w;
        for (var xx = x; xx < x + w; xx += 24) {
            R(g, xx, 108, 23, 38, '#8a8a80');
            R(g, xx, 108, 23, 2, '#5a5a52');
            for (var i = 0; i < 6; i++)
                R(g, xx + 2 + i * 4, 112, 1, 32, '#6a6a62');
            R(g, xx, 106, 23, 2, '#d8dde8');
        }
        if (o.sign) {
            R(g, x + o.signX, 112, 66, 20, '#1a3a6a');
            g.drawImage(pixText(o.sign, 7, '#e8e0c8'), x + o.signX + 4, 111);
            g.drawImage(pixText(o.sign2 || '', 5, '#c8c8d0', 'normal'), x + o.signX + 4, 121);
        }
        return [{ x: x, y: 108, w: w, h: 38, z: 5 }];
    },
    container: function (g, e, o, r, S) {
        var x = o.x, w = o.w || 70;
        R(g, x, 110, w, 50, '#3a5a7a');
        for (var xx = x; xx < x + w; xx += 4)
            R(g, xx, 110, 1, 50, '#2e4a66');
        R(g, x, 108, w, 2, '#d8dde8');
        R(g, x + 6, 122, 16, 38, '#2a3a4a');
        R(g, x + 19, 140, 2, 3, '#c8c8c8');
        R(g, x + 32, 120, 26, 14, '#101418');
        S.dyn.push(function (g2, cx) { if (o.lit && o.lit()) {
            R(g2, x + 33 - cx, 121, 24, 12, '#e8d8a0');
            R(g2, x + 45 - cx, 121, 1, 12, '#8a7a50');
        } });
        g.drawImage(pixText(o.sign || 'دفترِ کارگاه', 6, '#e8e0c8'), x + 26, 108);
        return [{ x: x, y: 110, w: w, h: 50, z: 30, zb: 8 }];
    },
    fusebox: function (g, e, o, r, S) {
        var x = o.x;
        R(g, x + 4, 130, 3, 30, '#3a3a40');
        R(g, x, 116, 12, 14, '#6a6e76');
        R(g, x + 1, 117, 10, 12, '#5a5e66');
        R(g, x + 4, 120, 4, 4, '#ffd23a');
        R(g, x + 5, 121, 2, 2, '#1a1a1a');
        S.dyn.push(function (g2, cx) { return R(g2, x + 9 - cx, 118, 1, 1, (o.lit && o.lit()) ? '#40ff70' : ((G.t % 0.8) < 0.3 ? '#ff3040' : '#401010')); });
        return [{ x: x, y: 116, w: 12, h: 14, z: 30, zb: 27 }, { x: x + 4, y: 130, w: 3, h: 30, z: 30, zb: 28 }];
    },
    cementBags: function (g, e, o) {
        var x = o.x;
        [[0, 150], [11, 150], [22, 150], [5, 143], [16, 143], [11, 136]].forEach(function (_a) {
            var dx = _a[0], y = _a[1];
            R(g, x + dx, y, 11, 7, '#b8b0a0');
            R(g, x + dx, y, 11, 1, '#d8d0c0');
            R(g, x + dx + 3, y + 3, 5, 2, '#6a6a60');
        });
        R(g, x + 26, 152, 6, 4, '#c8b080');
        return [{ x: x, y: 137, w: 33, h: 20, z: 24, zb: 12 }];
    },
    scaffold: function (g, e, o) {
        var x = o.x, w = o.w, top = o.top || 30;
        for (var xx = x; xx <= x + w; xx += 20)
            R(g, xx, top, 2, 146 - top, '#6a6a72');
        for (var yy = top; yy < 146; yy += 24) {
            R(g, x, yy, w, 2, '#6a6a72');
            R(g, x, yy - 1, w, 1, '#d8dde8');
            R(g, x, yy + 2, w, 3, '#8a6a3a');
        }
        for (var xx = x; xx < x + w; xx += 20)
            for (var yy = top; yy < 146 - 24; yy += 24)
                for (var i = 0; i < 24; i++)
                    R(g, xx + Math.round(i * 20 / 24), yy + i, 1, 1, '#5a5a62');
        var occ = [];
        for (var yy = top; yy < 146; yy += 24)
            occ.push({ x: x, y: yy, w: w, h: 2, z: 10 });
        return occ;
    },
    craneBg: function (g, e, o) { var x = o.x; R(g, x, 4, 5, 142, '#2a2a34'); for (var y = 6; y < 146; y += 6)
        R(g, x, y, 5, 1, '#1a1a22'); R(g, x - 40, 8, 110, 4, '#2a2a34'); R(g, x - 40, 12, 1, 30, '#3a3a44'); R(g, x - 42, 42, 5, 4, '#3a3a44'); R(g, x + 6, 12, 10, 8, '#c8a040'); },
    skeleton: function (g, e, o) { var x = o.x, w = o.w, top = o.top || 20; for (var yy = top; yy < 146; yy += 22)
        R(g, x, yy, w, 4, '#8a8680'); for (var xx = x; xx < x + w; xx += 26)
        R(g, xx, top, 5, 146 - top, '#7a7670'); for (var xx = x + 2; xx < x + w; xx += 4)
        R(g, xx, top - 6, 1, 6, '#6a3a2a'); },
    van: function (g, e, o) {
        var x = o.x;
        R(g, x, 126, 60, 26, '#d8d8d8');
        R(g, x + 44, 116, 16, 12, '#d0d0d0');
        R(g, x + 47, 118, 11, 7, '#1a2230');
        R(g, x + 6, 152, 10, 8, '#111');
        R(g, x + 44, 152, 10, 8, '#111');
        R(g, x, 124, 44, 2, '#d8dde8');
        g.drawImage(pixText(o.sign || 'بتنِ ارزان', 7, '#b02a2a'), x + 4, 128);
        return [{ x: x, y: 116, w: 60, h: 44, z: 30, zb: 10 }];
    },
    fireBarrel: function (g, e, o, r, S) {
        var x = o.x;
        R(g, x, 142, 14, 18, '#4f2c1e');
        R(g, x, 146, 14, 1, '#2c1810');
        R(g, x, 154, 14, 1, '#2c1810');
        R(g, x - 1, 141, 16, 2, '#241410');
        S.dyn.push(function (g2, cx) { for (var i = 0; i < 12; i++) {
            var fx = x + 1 + (Math.random() * 12 | 0), h = 2 + Math.random() * 8 * FX.fireK | 0;
            R(g2, fx - cx, 141 - h, 1, h, i % 3 ? '#ff7a1e' : '#ffb03a');
        } });
        S.fx.push(function (dt) { if (Math.random() < dt * 7)
            puff(x + 7 + (Math.random() - 0.5) * 8, 136, (Math.random() - 0.5) * 8, -18 - Math.random() * 20, 0.8, [255, 160, 60], 1, true); });
        return [{ x: x + 1, y: 144, w: 12, h: 16, z: 30, zb: 24 }];
    },
    parapet: function (g, e, o, r) { R(g, 0, 132, o.w, 14, '#8a8680'); R(g, 0, 131, o.w, 1, '#dfe4ee'); for (var x = 0; x < o.w; x += 30)
        R(g, x, 132, 1, 14, '#6a6660'); for (var x = 4; x < o.w; x += 7 + (r() * 9 | 0))
        R(g, x, 122 - (r() * 8 | 0), 1, 10 + (r() * 8 | 0), '#6a3a2a'); },
    waterTank: function (g, e, o) { var x = o.x; R(g, x, 100, 32, 30, '#6a7078'); R(g, x, 100, 32, 2, '#dfe4ee'); for (var y = 106; y < 130; y += 7)
        R(g, x, y, 32, 1, '#4a5058'); R(g, x + 3, 130, 3, 16, '#3a3a40'); R(g, x + 26, 130, 3, 16, '#3a3a40'); return [{ x: x, y: 100, w: 32, h: 30, z: 8 }]; },
    stairDoor: function (g, e, o) {
        var x = o.x;
        R(g, x, 110, 40, 50, '#7a7670');
        R(g, x - 2, 108, 44, 3, '#dfe4ee');
        R(g, x + 12, 124, 16, 36, '#3a3f44');
        R(g, x + 12, 124, 16, 1, '#2a2e32');
        R(g, x + 25, 141, 2, 3, '#c8c8c8');
        R(e, x + 16, 116, 8, 3, '#ffe0a0');
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(x - 2, 159, 44, 2);
        return [{ x: x, y: 110, w: 12, h: 50, z: 30, zb: 10 }, { x: x + 28, y: 110, w: 12, h: 50, z: 30, zb: 10 }, { x: x, y: 110, w: 40, h: 14, z: 30, zb: 10 }];
    },
    generator: function (g, e, o, r, S) { var x = o.x; R(g, x, 142, 26, 18, '#8a6a1a'); R(g, x, 142, 26, 2, '#b08a2a'); for (var i = 0; i < 4; i++)
        R(g, x + 3 + i * 5, 146, 3, 9, '#5a4410'); S.dyn.push(function (g2, cx) { return R(g2, x + 22 - cx, 145, 2, 2, (G.t % 0.6) < 0.3 ? '#40ff70' : '#104010'); }); return [{ x: x, y: 142, w: 26, h: 18, z: 30, zb: 20 }]; },
    crates: function (g, e, o) {
        var x = o.x, w = o.w || 26, h = o.h || 14;
        R(g, x, 160 - h, w, h, '#5e4630');
        for (var y = 163 - h; y < 160; y += 4)
            R(g, x, y, w, 1, '#3f2e1f');
        R(g, x, 159 - h, w, 1, '#dfe6f2');
        if (o.briefcase) {
            R(g, x + 7, 152 - h, 12, 7, '#2a1a10');
            R(g, x + 11, 150 - h, 4, 2, '#8a7a4a');
            R(g, x + 9, 154 - h, 2, 2, '#c8a040');
        }
        return [{ x: x, y: 160 - h, w: w, h: h, z: 30, zb: 18 }];
    },
    craneBase: function (g, e, o, r, S) {
        var x = o.x;
        R(g, x, 0, 8, 146, '#b08a2a');
        for (var y = 2; y < 146; y += 8) {
            R(g, x, y, 8, 1, '#7a5a1a');
            R(g, x + 1, y + 1, 6, 1, '#7a5a1a');
        }
        R(g, x - 8, 60, 24, 20, '#c89a30');
        R(g, x - 6, 63, 12, 10, '#1a2230');
        S.dyn.push(function (g2, cx) { if ((G.t % 1.4) < 0.5)
            R(g2, x + 3 - cx, 0, 2, 2, '#ff3040'); });
        return [{ x: x - 8, y: 60, w: 24, h: 20, z: 6 }, { x: x, y: 80, w: 8, h: 66, z: 6 }];
    },
    workLamp: function (g, e, o) { var x = o.x; R(g, x, 124, 1, 36, '#2a2a30'); R(g, x - 5, 158, 11, 2, '#2a2a30'); R(g, x - 5, 118, 11, 6, '#3a3a40'); R(e, x - 4, 123, 9, 1, '#fff4d0'); return [{ x: x - 5, y: 118, w: 11, h: 5, z: 30, zb: 26 }]; }
};
function buildScene(def) {
    var S = makeScene(def.id, def.w, def.name), r = rng(def.seed || 7);
    S.dyn = [];
    S.fx = [];
    if (def.indoor)
        paintInterior(S, def.room, r);
    else
        paintExterior(S, def.out || {}, r);
    var occ = [];
    for (var _i = 0, _a = def.props; _i < _a.length; _i++) {
        var __entry4 = _a[_i];
        var type = __entry4[0], o = __entry4[1];
        var res = PROP[type](S.bgx, S.emx, o, r, S);
        if (res)
            occ.push.apply(occ, res);
    }
    if (!def.indoor)
        skyMaskFromBg(S, 146);
    S.occ = occ.concat(def.occ || []);
    S.npcs = def.npcs || [];
    var _loop_1 = function (n) {
        if (!n.yo)
            S.occ.push({ x: n.x - 4, y: FLOOR - 32 - (n.sp.tall || 0), w: 8, h: 32 + (n.sp.tall || 0), z: 29, card: 1, fx: n.x,
                spr: function (g, x, y) { return drawPerson(g, x, y, n.f || (P.x >= n.x ? 1 : -1), n.sp); } });
    };
    for (var _b = 0, _c = S.npcs; _b < _c.length; _b++) {
        var n = _c[_b];
        _loop_1(n);
    }
    S.lights = def.lights;
    S.targets = def.targets;
    S.minX = def.minX || 16;
    S.maxX = def.maxX || def.w - 16;
    S.spawn = def.spawn || 40;
    S.ambient = def.ambient || [40, 42, 56];
    S.indoor = !!def.indoor;
    S.zoom = def.zoom || (def.indoor ? 1.28 : 1);
    S.phoneZoom = def.phoneZoom || 1.12;
    S.viewTop = def.viewTop;
    S.skyGrad = def.skyGrad || null;
    S.noMoon = !!def.noMoon;
    S.noSnow = !!def.noSnow;
    S.skyDrop = def.skyDrop || 0;
    S.haze = def.haze || null;
    return S;
}
PROP.basket = function (g, e, o) { R(g, o.x, FB - 8, 8, 8, '#3a3a40'); for (var y = FB - 6; y < FB; y += 2)
    R(g, o.x, y, 8, 1, '#26262c'); R(g, o.x + 1, FB - 9, 3, 1, '#e0d8c0'); R(g, o.x + 5, FB - 10, 2, 2, '#e0d8c0'); footShadow(g, o.x, 8); return [{ x: o.x, y: FB - 8, w: 8, h: 8, z: 14 }]; };
// ---------- sky, skyline, clouds, post-fx textures ----------
var SKY = {};
function buildSkyline(seed, w, minTop, maxTop, col, wins, density, miladX) {
    var _a = mk(w, H), c = _a[0], g = _a[1], r = rng(seed);
    for (var x = 0; x < w;) {
        var bw = 14 + (r() * 30 | 0), top = minTop + (r() * (maxTop - minTop) | 0);
        R(g, x, top, bw, H - top, col);
        if (r() < 0.3)
            R(g, x + (bw >> 1), top - 6, 1, 6, col);
        for (var yy = top + 4; yy < H; yy += 5)
            for (var xx = x + 2; xx < x + bw - 2; xx += 4)
                if (r() < density)
                    R(g, xx, yy, 2, 2, wins[r() * wins.length | 0]);
        x += bw + (r() * 3 | 0);
    }
    if (miladX) { // Milad tower on the horizon
        var m = miladX;
        R(g, m, 10, 3, H, col);
        R(g, m - 5, 22, 13, 6, col);
        R(g, m - 3, 20, 9, 2, col);
        R(g, m - 4, 28, 11, 2, col);
        R(g, m + 1, 0, 1, 10, col);
        for (var i = 0; i < 6; i++)
            R(g, m - 4 + i * 2, 24, 1, 1, '#d8b068');
    }
    return c;
}
function buildSkyAssets() {
    var _a, _b, _c;
    var _d = mk(WMAX, H), c = _d[0], g = _d[1];
    var gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#04050c');
    gr.addColorStop(0.35, '#0f0f22');
    gr.addColorStop(0.7, '#241a36');
    gr.addColorStop(1, '#2e1f3a');
    g.fillStyle = gr;
    g.fillRect(0, 0, WMAX, H);
    SKY.grad = c;
    _a = mk(40, 40), c = _a[0], g = _a[1];
    var mg = g.createRadialGradient(20, 20, 4, 20, 20, 20);
    mg.addColorStop(0, 'rgba(220,215,200,0.35)');
    mg.addColorStop(1, 'rgba(220,215,200,0)');
    g.fillStyle = mg;
    g.fillRect(0, 0, 40, 40);
    g.fillStyle = '#e6e1cc';
    g.beginPath();
    g.arc(20, 20, 7, 0, Math.PI * 2);
    g.fill();
    R(g, 16, 17, 3, 2, '#c9c3ac');
    R(g, 22, 22, 2, 2, '#c9c3ac');
    R(g, 19, 24, 2, 1, '#cfc9b2');
    SKY.moon = c;
    _b = mk(640, 70), c = _b[0], g = _b[1];
    var r = rng(88);
    for (var i = 0; i < 40; i++) {
        var x = r() * 640, y = 8 + r() * 50, rw = 30 + r() * 60, rh = 4 + r() * 7;
        g.fillStyle = "rgba(".concat(40 + r() * 20 | 0, ",").concat(36 + r() * 16 | 0, ",").concat(62 + r() * 20 | 0, ",").concat(0.25 + r() * 0.3, ")");
        g.beginPath();
        g.ellipse(x, y, rw, rh, 0, 0, Math.PI * 2);
        g.fill();
        if (x > 600) {
            g.beginPath();
            g.ellipse(x - 640, y, rw, rh, 0, 0, Math.PI * 2);
            g.fill();
        }
        if (x < 40) {
            g.beginPath();
            g.ellipse(x + 640, y, rw, rh, 0, 0, Math.PI * 2);
            g.fill();
        }
    }
    SKY.clouds = c;
    SKY.far = buildSkyline(5, 480, 22, 62, '#141329', ['#6a5a3a', '#3d4f7a', '#58456a'], 0.1, 300);
    SKY.near = buildSkyline(9, 560, 36, 78, '#1b1830', ['#a07a40', '#5a6fb0', '#b0406a', '#40a0a8'], 0.09, 0);
    // vignette
    _c = mk(WB, H), c = _c[0], g = _c[1]; // stretched to the current width when drawn
    var vg = g.createRadialGradient(WB / 2, H * 0.48, H * 0.3, WB / 2, H * 0.5, WB * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,6,0.72)');
    g.fillStyle = vg;
    g.fillRect(0, 0, WB, H);
    SKY.vig = c;
}
function drawSky(camX) {
    sctx.drawImage(G.scene.skyGrad || SKY.grad, 0, 0);
    if (!G.scene.noMoon)
        sctx.drawImage(SKY.moon, Math.round(250 - camX * 0.03) - 20, 6);
    var co = ((G.t * 2.2 + camX * 0.08) % 640 + 640) % 640;
    sctx.drawImage(SKY.clouds, -co | 0, 0);
    sctx.drawImage(SKY.clouds, 640 - co | 0, 0);
    for (var _i = 0, _a = [[SKY.far, 0.15], [SKY.near, 0.35]]; _i < _a.length; _i++) {
        var __entry5 = _a[_i];
        var img = __entry5[0], p = __entry5[1];
        var o = ((camX * p) % img.width + img.width) % img.width | 0;
        var dy = G.scene.skyDrop || 0;
        sctx.drawImage(img, -o, dy);
        if (img.width - o < W)
            sctx.drawImage(img, img.width - o, dy);
    }
    if (G.scene.haze) {
        sctx.fillStyle = G.scene.haze;
        sctx.fillRect(0, 0, W, H);
    }
    if (!G.scene.skyDrop && Math.sin(G.t * 2.6) > 0.35) { // Milad tower beacon
        var o = ((300 - camX * 0.15) % 480 + 480) % 480;
        R(sctx, o + 1, -1, 1, 2, '#ff3040');
        if (o - 480 > -4)
            R(sctx, o - 479, -1, 1, 2, '#ff3040');
    }
}
// ---------- characters (procedural pixel sprites) ----------
// spr() returns a painter whose +dx points the way the sprite faces (f = 1 right, -1 left)
function spr(g, x, y, f) { return function (dx, dy, w, h, c) { g.fillStyle = c; g.fillRect(f > 0 ? x + dx : x - dx - w, y + dy, w, h); }; }
function drawDetective(g, x, y, f, phase, moving, aim) {
    var p = spr(g, x, y, f), fr = moving ? (Math.floor(phase) & 3) : -1;
    var bob = moving && (fr & 1) ? -1 : 0;
    var la = fr < 0 ? -3 : [-4, -2, 1, -1][fr], lb = fr < 0 ? 0 : [1, -1, -4, -2][fr];
    for (var _i = 0, _a = [la, lb]; _i < _a.length; _i++) {
        var lx = _a[_i];
        p(lx, -8, 2, 7, '#1c1b24');
        p(lx, -1, 3, 1, '#0b0a0e');
    }
    var Y = bob;
    p(-4, -21 + Y + (fr === 0 ? 1 : fr === 2 ? -1 : 0), 2, 8, '#5e4f38'); // back arm swing
    p(-4, -23 + Y, 8, 16, '#7d6a4c');
    p(-5, -11 + Y, 10, 4, '#7d6a4c');
    p(-5, -8 + Y, 10, 1, '#5e4f38');
    p(1, -22 + Y, 2, 8, '#94805d');
    p(-4, -15 + Y, 8, 1, '#3b2e20');
    p(-4, -23 + Y, 1, 14, '#5e4f38');
    var flap = Math.sin(G.t * 7 + x) > 0 ? 1 : 0; // scarf tail in the wind
    p(-2, -24 + Y, 5, 2, '#9a2231');
    p(-4 - flap, -23 + Y, 2, 3 + flap, '#9a2231');
    p(-2, -29 + Y, 5, 5, '#c9a27e');
    p(-2, -28 + Y, 1, 3, '#2a1e1a');
    p(1, -27 + Y, 1, 1, '#1a1210');
    p(3, -26 + Y, 1, 1, '#b08a68');
    p(0, -25 + Y, 2, 1, '#9c7a5c');
    p(-4, -30 + Y, 10, 1, '#2b2622');
    p(-2, -34 + Y, 6, 4, '#2b2622');
    p(-2, -31 + Y, 6, 1, '#141112');
    p(-1, -35 + Y, 4, 1, '#dfe6f2');
    // aiming arm (absolute angle) with the flashlight
    var sx = x + f, sy = y - 20 + Y, ca = Math.cos(aim), sa = Math.sin(aim);
    for (var i = 0; i < 6; i++)
        R(g, Math.round(sx + ca * i), Math.round(sy + sa * i), 2, 2, i < 5 ? '#6f5d42' : '#c9a27e');
    for (var i = 6; i < 9; i++)
        R(g, Math.round(sx + ca * i), Math.round(sy + sa * i), 2, 2, '#34343c');
}
function drawCop(g, x, y, f) {
    var p = spr(g, x, y, f), br = (Math.sin(G.t * 1.6) > 0.6) ? -1 : 0;
    p(-3, -4, 3, 4, '#0d0d10');
    p(1, -4, 3, 4, '#0d0d10');
    p(-3, -1, 1, 1, '#8a9098');
    p(1, -1, 1, 1, '#8a9098');
    p(-3, -13, 3, 9, '#1f2a3a');
    p(1, -13, 3, 9, '#1f2a3a');
    p(-4, -27 + br, 9, 15 - br, '#2a3a52');
    p(-4, -14, 9, 2, '#15181e');
    p(0, -14, 1, 2, '#c8a040');
    p(2, -24 + br, 1, 1, '#e0c060');
    p(-4, -27 + br, 2, 1, '#c8a040');
    p(3, -27 + br, 2, 1, '#c8a040');
    p(-3, -21 + br, 8, 3, '#24334a');
    p(4, -21 + br, 1, 2, '#c49a78');
    p(-2, -33 + br, 5, 6, '#c49a78');
    p(-2, -32 + br, 1, 4, '#9c7658');
    p(1, -29 + br, 3, 1, '#2a1e18');
    p(2, -31 + br, 1, 1, '#101010');
    p(-3, -36 + br, 7, 3, '#1c2638');
    p(1, -34 + br, 5, 1, '#0c0f16');
    p(0, -35 + br, 1, 1, '#e0c060');
    p(-2, -37 + br, 5, 1, '#dfe6f2');
}
function drawLeila(g, x, y, f) {
    var p = spr(g, x, y, f), cyc = (G.t % 7), up = cyc < 1.3;
    p(-2, -6, 2, 6, '#141016');
    p(1, -6, 2, 6, '#141016');
    p(-3, -24, 7, 19, '#2d2036');
    p(-4, -10, 9, 5, '#2d2036');
    p(-3, -16, 7, 1, '#1a1220');
    p(2, -23, 1, 14, '#3e2d4a');
    p(-2, -25, 5, 2, '#b03070');
    p(-3, -24, 1, 4, '#b03070');
    p(-2, -30, 5, 5, '#d4ab8a');
    p(-3, -31, 6, 2, '#120d14');
    p(-3, -29, 2, 5, '#120d14');
    p(2, -31, 1, 2, '#120d14');
    p(-1, -31, 2, 1, '#3a2a48');
    p(3, -26, 1, 1, '#a02060');
    p(2, -28, 1, 1, '#0a0a0a');
    var tx, ty;
    if (up) {
        p(1, -24, 2, 3, '#2d2036');
        p(3, -26, 1, 1, '#d4ab8a');
        p(4, -26, 2, 1, '#e8e2d6');
        tx = 6;
        ty = -26;
    }
    else {
        p(2, -22, 2, 7, '#2d2036');
        p(3, -15, 1, 1, '#d4ab8a');
        p(4, -15, 2, 1, '#e8e2d6');
        tx = 6;
        ty = -15;
    }
    return { x: f > 0 ? x + tx : x - tx - 1, y: y + ty, hot: up };
}
function drawOldMan(g, x, y) {
    var p = spr(g, x, y, -1), sw = Math.sin(G.t * 0.9) > 0.3 ? 1 : 0;
    p(0, -10, 6, 3, '#3b4030');
    p(5, -8, 2, 8, '#3b4030');
    p(5, -1, 3, 1, '#111');
    p(-4 + sw, -22, 8, 13, '#4a3a2a');
    p(-3 + sw, -18, 1, 1, '#6a4a2a');
    p(0 + sw, -14, 1, 1, '#6a4a2a');
    p(-2 + sw, -12, 1, 1, '#2a1e14');
    p(2 + sw, -17, 6, 2, '#3b4030');
    p(8 + sw, -17, 2, 2, '#b08868');
    p(-1 + sw, -28, 5, 5, '#b08868');
    p(1 + sw, -25, 4, 3, '#9a9a9a');
    p(-2 + sw, -30, 6, 3, '#6a2a1c');
    p(-2 + sw, -28, 6, 1, '#4a1a10');
    p(2 + sw, -27, 1, 1, '#101010');
    p(-2 + sw, -31, 5, 1, '#dfe6f2');
}
// ---------- clue icons (12x12) & portraits (36x36) ----------
var ICON = {}, PORTRAIT = {};
function buildIcons() {
    var defs = {
        watch: function (g) { R(g, 4, 0, 4, 12, '#5a3a22'); R(g, 2, 3, 8, 6, '#c0b090'); R(g, 3, 4, 6, 4, '#e8e0c8'); R(g, 5, 4, 1, 2, '#222'); R(g, 5, 6, 3, 1, '#222'); R(g, 3, 4, 1, 1, '#888'); R(g, 7, 7, 1, 1, '#888'); },
        camera: function (g) { R(g, 1, 4, 10, 6, '#26262c'); R(g, 3, 2, 4, 2, '#26262c'); R(g, 4, 5, 4, 4, '#4a5468'); R(g, 5, 6, 2, 2, '#9ab'); R(g, 9, 4, 2, 1, '#c33'); },
        snow: function (g) { R(g, 3, 1, 5, 6, '#b8c2da'); R(g, 3, 8, 5, 3, '#b8c2da'); R(g, 5, 9, 1, 1, '#1a1a22'); R(g, 6, 10, 1, 1, '#1a1a22'); R(g, 4, 2, 3, 4, '#7c86a6'); },
        cig: function (g) { R(g, 1, 6, 9, 2, '#e8e2d6'); R(g, 1, 6, 3, 2, '#c8a060'); R(g, 2, 6, 1, 1, '#b0307a'); R(g, 10, 6, 1, 2, '#555'); R(g, 10, 3, 1, 2, '#777'); },
        neg: function (g) { R(g, 0, 2, 12, 8, '#5a3a1e'); for (var x = 1; x < 12; x += 3) {
            R(g, x, 3, 1, 1, '#0b0b0b');
            R(g, x, 8, 1, 1, '#0b0b0b');
        } R(g, 2, 4, 5, 4, '#b08850'); R(g, 3, 5, 2, 3, '#2a3a52'); R(g, 8, 2, 4, 8, '#111'); },
        test: function (g) { R(g, 1, 2, 10, 6, '#d8d8d8'); R(g, 3, 8, 2, 2, '#d8d8d8'); R(g, 3, 5, 1, 1, '#222'); R(g, 6, 5, 1, 1, '#222'); R(g, 9, 5, 1, 1, '#222'); },
        boots: function (g) { R(g, 3, 1, 5, 8, '#1a1a1e'); R(g, 3, 8, 8, 2, '#1a1a1e'); R(g, 3, 10, 8, 1, '#9aa0a8'); R(g, 4, 10, 1, 1, '#1a1a1e'); R(g, 4, 2, 1, 5, '#34343c'); },
        note: function (g) { R(g, 2, 1, 8, 10, '#e2d9c0'); R(g, 7, 1, 3, 3, '#a8a088'); for (var y = 4; y < 10; y += 2)
            R(g, 3, y, 5, 1, '#6a6050'); },
        tape: function (g) { R(g, 0, 3, 12, 7, '#18181c'); R(g, 2, 4, 8, 2, '#c8a040'); R(g, 2, 7, 3, 2, '#666'); R(g, 7, 7, 3, 2, '#666'); },
        code: function (g) { R(g, 1, 1, 10, 10, '#e8e0c8'); R(g, 8, 1, 3, 3, '#c8c0a8'); R(g, 2, 5, 8, 3, '#1a1a1a'); R(g, 3, 6, 1, 1, '#ffd070'); R(g, 5, 6, 1, 1, '#ffd070'); R(g, 7, 6, 1, 1, '#ffd070'); },
        locker: function (g) { R(g, 2, 0, 8, 12, '#6a6e74'); R(g, 3, 1, 6, 10, '#4a4e54'); R(g, 7, 5, 1, 2, '#c8c8d0'); R(g, 4, 3, 3, 1, '#d8d0bc'); },
        forgery: function (g) { R(g, 1, 2, 10, 8, '#e8e0c8'); for (var x = 2; x < 10; x++)
            R(g, x, 6 + Math.round(Math.sin(x) * 1.5), 1, 1, '#2a3a8a'); R(g, 8, 3, 2, 2, '#c02a2a'); },
        print: function (g) { R(g, 2, 0, 8, 12, '#eeeae0'); for (var y = 2; y < 9; y += 2)
            R(g, 3, y, 6, 1, '#5a5a5a'); R(g, 5, 8, 4, 3, '#c02a2a'); },
        joblog: function (g) { R(g, 0, 3, 12, 7, '#1a2a1a'); R(g, 1, 4, 10, 5, '#2a5a2a'); R(g, 2, 5, 6, 1, '#9dff9d'); R(g, 2, 7, 8, 1, '#9dff9d'); },
        roster: function (g) { R(g, 0, 1, 12, 10, '#8a6a44'); R(g, 1, 2, 4, 5, '#e0d8c0'); R(g, 6, 2, 5, 4, '#d8e0e8'); R(g, 2, 8, 8, 2, '#e8e2d0'); R(g, 3, 2, 1, 1, '#d02a2a'); },
        calllog: function (g) { R(g, 1, 5, 10, 5, '#b01a24'); R(g, 0, 3, 12, 2, '#c02a34'); R(g, 4, 6, 4, 2, '#1a1a1a'); R(g, 5, 0, 1, 3, '#9dff9d'); R(g, 7, 1, 1, 2, '#9dff9d'); },
        wet: function (g) { R(g, 5, 1, 2, 2, '#8ab0ff'); R(g, 4, 3, 4, 3, '#8ab0ff'); R(g, 3, 6, 6, 4, '#6a90e0'); R(g, 4, 7, 1, 2, '#e0ecff'); R(g, 1, 11, 10, 1, '#3a4a6a'); },
        coat: function (g) { R(g, 5, 0, 2, 2, '#8a8a90'); R(g, 2, 2, 8, 1, '#8a8a90'); R(g, 2, 3, 8, 9, '#20283c'); R(g, 2, 3, 2, 1, '#c8a040'); R(g, 8, 3, 2, 1, '#c8a040'); R(g, 3, 8, 1, 1, '#8aa0c8'); R(g, 7, 10, 1, 1, '#8aa0c8'); },
        tea: function (g) { R(g, 3, 2, 6, 8, '#e8e0f0'); R(g, 4, 4, 4, 5, '#b8561a'); R(g, 2, 10, 8, 1, '#c8a040'); R(g, 1, 11, 10, 1, '#8a7040'); },
        lockic: function (g) { R(g, 3, 1, 6, 1, '#9a9aa0'); R(g, 3, 1, 1, 4, '#9a9aa0'); R(g, 8, 1, 1, 4, '#9a9aa0'); R(g, 2, 5, 8, 6, '#c8a040'); R(g, 5, 7, 2, 2, '#2a2a2a'); },
        key: function (g) { R(g, 1, 3, 5, 5, '#c8a040'); R(g, 2, 4, 3, 3, '#1a1a1a'); R(g, 6, 5, 5, 2, '#c8a040'); R(g, 8, 7, 1, 2, '#c8a040'); R(g, 10, 7, 1, 2, '#c8a040'); },
        photo: function (g) { R(g, 1, 2, 10, 8, '#e8e0d0'); R(g, 2, 3, 8, 5, '#5a5a64'); R(g, 3, 5, 2, 3, '#1e2a44'); R(g, 7, 5, 2, 3, '#2a2a2e'); R(g, 5, 6, 2, 1, '#b89a7a'); R(g, 6, 7, 1, 1, '#9fe8ff'); },
        ticket: function (g) { R(g, 0, 3, 12, 6, '#e8c870'); R(g, 8, 3, 1, 6, '#a88830'); R(g, 1, 5, 6, 1, '#6a5020'); R(g, 1, 7, 4, 1, '#6a5020'); R(g, 9, 5, 2, 2, '#c02a2a'); },
        envelope: function (g) { R(g, 1, 3, 10, 7, '#c8a070'); R(g, 1, 3, 10, 1, '#8a6a40'); R(g, 2, 4, 2, 1, '#8a6a40'); R(g, 8, 4, 2, 1, '#8a6a40'); R(g, 4, 5, 4, 1, '#8a6a40'); R(g, 8, 7, 2, 2, '#c02a2a'); },
        gloves: function (g) { R(g, 3, 3, 6, 8, '#e8e8e8'); for (var i = 0; i < 4; i++)
            R(g, 3 + i * 2, 0, 1, 4, '#e8e8e8'); R(g, 3, 0, 7, 2, '#3a3a3a'); R(g, 2, 6, 1, 3, '#e8e8e8'); },
        bag: function (g) { R(g, 2, 2, 8, 9, '#b8b0a0'); R(g, 2, 2, 8, 1, '#d8d0c0'); R(g, 4, 5, 4, 3, '#6a6a60'); R(g, 8, 10, 4, 2, '#c8b080'); },
        crack: function (g) { R(g, 3, 0, 6, 12, '#8a8680'); for (var i = 0; i < 12; i++)
            R(g, 5 + Math.round(Math.sin(i) * 1.2), i, 1, 1, '#2a2826'); },
        fuse: function (g) { R(g, 2, 1, 8, 10, '#6a6e76'); R(g, 3, 2, 6, 8, '#4a4e56'); R(g, 6, 3, 2, 3, '#ffd23a'); R(g, 5, 5, 2, 2, '#ffd23a'); R(g, 4, 6, 2, 3, '#ffd23a'); },
        cube: function (g) { R(g, 2, 3, 7, 7, '#9a968e'); R(g, 3, 2, 7, 1, '#b8b4ac'); R(g, 9, 3, 1, 7, '#7a766e'); R(g, 4, 5, 1, 3, '#4a4640'); R(g, 5, 7, 2, 1, '#4a4640'); },
        ring: function (g) { R(g, 3, 5, 6, 1, '#c8a040'); R(g, 2, 6, 1, 4, '#c8a040'); R(g, 9, 6, 1, 4, '#c8a040'); R(g, 3, 10, 6, 1, '#c8a040'); R(g, 4, 2, 4, 3, '#9fe8ff'); R(g, 5, 2, 1, 1, '#ffffff'); },
        ledger: function (g) { R(g, 2, 1, 8, 10, '#1a1a1e'); R(g, 2, 1, 1, 10, '#3a3a44'); R(g, 8, 5, 3, 2, '#8a6a2a'); R(g, 4, 3, 3, 1, '#c8a040'); },
        radio: function (g) { R(g, 1, 4, 10, 7, '#3a3a40'); R(g, 8, 0, 1, 4, '#8a8a90'); R(g, 2, 5, 4, 4, '#1a3a1a'); R(g, 3, 6, 2, 1, '#6aff8a'); R(g, 7, 6, 2, 2, '#c8c8c8'); }
    };
    for (var k in defs) {
        var _a = mk(12, 12), c = _a[0], g = _a[1];
        defs[k](g);
        ICON[k] = c;
    }
}
function drawDetectivePortrait(g, rim) {
    var sk = '#c9a27e', sd = '#94704f';
    R(g, 11, 10, 14, 16, sk);
    R(g, 12, 26, 12, 3, sk);
    R(g, 11, 10, 4, 18, sd);
    R(g, 15, 28, 6, 3, sd);
    R(g, 14, 17, 3, 1, '#111');
    R(g, 20, 17, 3, 1, '#111');
    R(g, 13, 15, 4, 1, sd);
    R(g, 19, 15, 4, 1, sd);
    R(g, 17, 18, 2, 4, sd);
    R(g, 15, 24, 6, 1, '#6a4038');
    R(g, 24, 11, 1, 16, rgba(rim, 0.9));
    R(g, 3, 30, 30, 6, '#7d6a4c');
    R(g, 10, 30, 5, 6, '#94805d');
    R(g, 21, 30, 5, 6, '#94805d');
    R(g, 11, 28, 14, 3, '#9a2231');
    R(g, 6, 9, 24, 2, '#241f1c');
    R(g, 10, 1, 16, 8, '#2b2622');
    R(g, 10, 6, 16, 2, '#141112');
    R(g, 11, 0, 14, 1, '#dfe6f2');
    R(g, 12, 11, 12, 4, 'rgba(0,0,0,0.35)');
    for (var i = 0; i < 10; i++)
        R(g, 13 + (i * 7) % 11, 22 + (i % 3), 1, 1, sd);
}
function buildPortraits() {
    var rims = { a: [255, 179, 90], b: [106, 156, 255], l: [255, 79, 176], y: [255, 138, 58], m: [110, 255, 180], k: [210, 220, 140], j: [196, 150, 255] };
    var skins = { a: ['#c9a27e', '#94704f'], b: ['#c49a78', '#8e6a4d'], l: ['#d4ab8a', '#a07c60'], y: ['#b08868', '#7a5a40'], m: ['#d4ab8a', '#a07c60'], k: ['#c49a78', '#8e6a4d'], j: ['#c8a488', '#8e6e56'] };
    for (var k in rims) {
        var _a = mk(36, 36), c = _a[0], g = _a[1], rim = rims[k], _b = skins[k], sk = _b[0], sd = _b[1];
        var gr = g.createLinearGradient(36, 0, 0, 36);
        gr.addColorStop(0, rgba(rim, 0.45));
        gr.addColorStop(1, 'rgba(8,6,14,1)');
        R(g, 0, 0, 36, 36, '#0b0911');
        g.fillStyle = gr;
        g.fillRect(0, 0, 36, 36);
        if (k === 'a') {
            drawDetectivePortrait(g, rim);
            PORTRAIT[k] = c;
            continue;
        }
        R(g, 11, 10, 14, 16, sk);
        R(g, 12, 26, 12, 3, sk);
        R(g, 11, 10, 4, 18, sd);
        R(g, 15, 28, 6, 3, sd);
        R(g, 14, 17, 3, 1, '#111');
        R(g, 20, 17, 3, 1, '#111');
        R(g, 13, 15, 4, 1, sd);
        R(g, 19, 15, 4, 1, sd);
        R(g, 17, 18, 2, 4, sd);
        R(g, 15, 24, 6, 1, '#6a4038');
        R(g, 24, 11, 1, 16, rgba(rim, 0.9));
        if (k === 'b') {
            R(g, 3, 30, 30, 6, '#2a3a52');
            R(g, 3, 30, 6, 2, '#c8a040');
            R(g, 27, 30, 6, 2, '#c8a040');
            R(g, 15, 29, 6, 3, '#1c2638');
            R(g, 9, 3, 18, 7, '#1c2638');
            R(g, 8, 10, 20, 2, '#0c0f16');
            R(g, 17, 5, 2, 2, '#e0c060');
            R(g, 9, 2, 18, 1, '#dfe6f2');
            R(g, 12, 22, 12, 2, '#2a1e18');
            R(g, 20, 17, 3, 1, '#7aa0ff');
        }
        else if (k === 'l') {
            R(g, 3, 30, 30, 6, '#2d2036');
            R(g, 10, 28, 16, 3, '#b03070');
            R(g, 9, 5, 18, 6, '#120d14');
            R(g, 8, 8, 4, 19, '#120d14');
            R(g, 24, 8, 4, 19, '#120d14');
            R(g, 12, 10, 8, 2, '#120d14');
            R(g, 13, 6, 6, 1, '#3a2a48');
            R(g, 16, 24, 4, 1, '#b0206a');
            R(g, 13, 17, 4, 1, '#000');
            R(g, 20, 17, 4, 1, '#000');
            R(g, 20, 24, 7, 1, '#e8e2d6');
            R(g, 27, 24, 1, 1, '#ff8a3a');
            R(g, 27, 20, 1, 3, 'rgba(200,200,210,0.4)');
        }
        else if (k === 'm') {
            R(g, 3, 30, 30, 6, '#3a3050');
            R(g, 8, 3, 20, 10, '#1e2238');
            R(g, 6, 8, 6, 26, '#1e2238');
            R(g, 24, 8, 6, 26, '#1e2238');
            R(g, 9, 27, 18, 5, '#1e2238');
            R(g, 9, 2, 18, 1, '#8a8a90');
            R(g, 5, 14, 4, 8, '#2a2a2e');
            R(g, 9, 22, 8, 1, '#6a6a70');
            R(g, 16, 22, 2, 2, '#2a2a2e');
            R(g, 13, 16, 5, 1, '#9a9aa0');
            R(g, 19, 16, 5, 1, '#9a9aa0');
            R(g, 16, 24, 4, 1, '#a0506a');
        }
        else if (k === 'k') {
            R(g, 3, 30, 30, 6, '#3e4a36');
            R(g, 5, 31, 4, 1, '#c8a040');
            R(g, 27, 31, 4, 1, '#c8a040');
            R(g, 11, 8, 14, 3, '#dcb48c');
            R(g, 14, 8, 6, 1, '#f0d0a8');
            R(g, 10, 12, 2, 7, '#3a3028');
            R(g, 24, 12, 2, 7, '#3a3028');
            R(g, 12, 21, 12, 4, '#2a1e18');
            R(g, 14, 18, 3, 1, sd);
            R(g, 20, 18, 3, 1, sd);
        }
        else if (k === 'j') {
            R(g, 3, 30, 30, 6, '#1e2a44');
            R(g, 5, 31, 3, 2, '#e0c060');
            R(g, 28, 31, 3, 2, '#e0c060');
            R(g, 15, 29, 6, 3, '#e8e4d8');
            R(g, 17, 30, 2, 3, '#6a1a24');
            R(g, 10, 4, 16, 7, '#9a9aa0');
            R(g, 10, 4, 3, 12, '#8a8a90');
            R(g, 23, 5, 3, 9, '#8a8a90');
            R(g, 14, 22, 8, 1, '#6a6a70');
            R(g, 20, 24, 9, 2, '#6a3a1a');
            R(g, 29, 24, 1, 2, '#ff8a3a');
            R(g, 29, 19, 1, 4, 'rgba(200,200,210,0.4)');
        }
        else {
            R(g, 3, 30, 30, 6, '#4a3a2a');
            R(g, 6, 31, 2, 2, '#6a4a2a');
            R(g, 26, 32, 2, 2, '#6a4a2a');
            R(g, 9, 3, 18, 8, '#6a2a1c');
            R(g, 9, 9, 18, 2, '#4a1a10');
            R(g, 9, 2, 18, 1, '#dfe6f2');
            R(g, 11, 21, 14, 9, '#9a9a9a');
            R(g, 11, 21, 3, 9, '#6e6e6e');
            R(g, 15, 24, 6, 1, '#5a4a40');
            R(g, 13, 14, 4, 1, '#bbb');
            R(g, 19, 14, 4, 1, '#bbb');
        }
        PORTRAIT[k] = c;
    }
}
var FX = { neonOn: true, neonT: 2, lampK: 1, fireK: 1, crtK: 0.7, crtT: 0, bulbK: 1, police: true, flashK: 1 };
function flickerUpdate(dt) {
    FX.neonT -= dt;
    if (FX.neonT <= 0) {
        if (FX.neonOn) {
            FX.neonOn = false;
            FX.neonT = 0.04 + Math.random() * 0.14;
        }
        else {
            FX.neonOn = true;
            FX.neonT = Math.random() < 0.35 ? 0.07 : 1.5 + Math.random() * 5;
        }
    }
    FX.fireK = lerp(FX.fireK, 0.72 + Math.random() * 0.42, 0.35);
    FX.lampK = Math.random() < 0.003 ? 0.3 : lerp(FX.lampK, 0.96 + Math.sin(G.t * 31) * 0.03, 0.12);
    FX.bulbK = Math.random() < 0.01 ? 0.25 : 0.88 + Math.random() * 0.12;
    FX.crtT -= dt;
    if (FX.crtT <= 0) {
        FX.crtT = 0.08;
        FX.crtK = 0.45 + Math.random() * 0.45;
    }
    var ph = (G.t * 1.8) % 1;
    FX.police = ph < 0.5 ? ((ph * 8 | 0) % 2 === 0) : false;
    FX.policeB = ph >= 0.5 ? ((ph * 8 | 0) % 2 === 0) : false;
    FX.flashK = Math.random() < 0.002 ? 0.2 : lerp(FX.flashK, 1, 0.2);
    FX.tubeK = Math.random() < 0.004 ? 0.1 : lerp(FX.tubeK || 1, 1, 0.3);
    FX.tubeT = (FX.tubeT || 0) - dt;
    if (FX.tubeT <= 0) {
        FX.tubeBadOn = !FX.tubeBadOn;
        FX.tubeT = FX.tubeBadOn ? 0.3 + Math.random() * 2.5 : 0.03 + Math.random() * 0.25;
    }
    FX.tubeBad = FX.tubeBadOn ? 0.9 + Math.random() * 0.1 : 0.05;
}
function lightK(L) {
    if (L.on && !L.on())
        return 0;
    switch (L.f) {
        case 'fire': return FX.fireK;
        case 'lamp': return FX.lampK;
        case 'bulb': return FX.bulbK;
        case 'crt': return FX.crtK;
        case 'neon': return FX.neonOn ? 1 : 0.06;
        case 'red': return FX.police ? 1 : 0.04;
        case 'blue': return FX.policeB ? 1 : 0.04;
        case 'tube': return FX.tubeK;
        case 'tubebad': return FX.tubeBad;
        case 'jam': return (MINI.printer && MINI.printer.jam) ? ((G.t % 0.8) < 0.4 ? 1 : 0.1) : 0;
        case 'proj': return G.flags.cr && G.flags.cr.run ? 0.05 : 0.86 + (((G.t * 24 | 0) * 7919) % 13) / 90;
        default: return 1;
    }
}
function softGlow(ox, oy, r, c, k) {
    var g = lctx.createRadialGradient(ox, oy, 0, ox, oy, r);
    g.addColorStop(0, rgba(c, k));
    g.addColorStop(1, rgba(c, 0));
    lctx.fillStyle = g;
    lctx.fillRect(ox - r, oy - r, r * 2, r * 2);
}
// ---------- lighting: shadows cast in 3D, onto the floor and the back wall ----------
// The scene is a shallow room seen from the side. The back wall stands at depth 0 with its foot on screen
// line 146; the floor comes toward the viewer at DK depth units per screen pixel, so people standing on
// y 160 are 30.8 deep. A point (x, height h, depth z) is drawn at (x, gy(z) - h). Every occluder is a box
// (x, heights, depths) and every light has a height and a depth, so a shadow falls where it would in a
// real room: along the floor behind an object, then up the wall, never in front of it. The object's own
// face stays lit. Three jittered samples, averaged in a half-resolution mask and smoothed back up, give
// penumbrae that are sharp at the contact and soften with distance. Static lights are baked once per
// scene; the flashlight is rebuilt every frame from a pre-rendered beam (hotspot, ring, spill, falloff).
var OZ = 6, LZ = 22, FZ = 40, DK = 2.2, TMAX = 40, JIT = [[-1, 0.5], [1, 0.5], [0, -1]];
var gy = function (z) { return 146 + z / DK; };
var oz = function (o) { return o.z === undefined ? OZ : o.z; };
function occBox(o) {
    var zf = oz(o), g = gy(zf);
    return { x0: o.x, x1: o.x + o.w, h0: Math.max(0, g - (o.y + o.h)), h1: g - o.y, zb: o.card ? Math.max(0, zf - 1) : Math.min(zf, o.zb || 0), zf: zf };
}
function hull(p) {
    p.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    var cr = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }, lo = [], up = [];
    for (var _i = 0, p_1 = p; _i < p_1.length; _i++) {
        var q = p_1[_i];
        while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0)
            lo.pop();
        lo.push(q);
    }
    for (var i = p.length - 1; i >= 0; i--) {
        var q = p[i];
        while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0)
            up.pop();
        up.push(q);
    }
    lo.pop();
    up.pop();
    return lo.concat(up);
}
function fillPoly(c, p) { c.beginPath(); c.moveTo(p[0][0], p[0][1]); for (var i = 1; i < p.length; i++)
    c.lineTo(p[i][0], p[i][1]); c.closePath(); c.fill(); }
function shadowWall(c, lx, ly, lz, o, plane) {
    var b = occBox(o);
    if (b.zf <= plane + 0.01 || b.zf > lz - 0.5)
        return;
    var lh = gy(lz) - ly, gp = gy(plane);
    if (o.stamp) { // a character: their real silhouette, scaled from the light
        var t = Math.min(TMAX, (lz - plane) / (lz - b.zf)), s = o.stamp;
        c.drawImage(s.c, lx + t * (s.x - lx), gp - lh - t * (gy(b.zf) - lh) + t * s.y, s.c.width * t, s.c.height * t);
        return;
    }
    var P = [];
    for (var _i = 0, _a = [Math.max(b.zb, plane), b.zf]; _i < _a.length; _i++) {
        var z = _a[_i];
        var t = Math.min(TMAX, (lz - plane) / (lz - z));
        for (var _b = 0, _c = [b.x0, b.x1]; _b < _c.length; _b++) {
            var x = _c[_b];
            for (var _d = 0, _e = [b.h0, b.h1]; _d < _e.length; _d++) {
                var h = _e[_d];
                P.push([lx + t * (x - lx), gp - lh - t * (h - lh)]);
            }
        }
    }
    fillPoly(c, hull(P));
}
function shadowFloor(c, lx, ly, lz, o) {
    var b = occBox(o);
    if (b.zf > lz - 0.5)
        return;
    var lh = gy(lz) - ly, F = [];
    for (var _i = 0, _a = [b.x0, b.x1]; _i < _a.length; _i++) {
        var x = _a[_i];
        for (var _b = 0, _c = [b.zb, b.zf]; _b < _c.length; _b++) {
            var z = _c[_b];
            for (var _d = 0, _e = [b.h0, b.h1]; _d < _e.length; _d++) {
                var h = _e[_d];
                var t = h <= 0.01 ? 1 : h < lh - 0.3 ? Math.min(TMAX, lh / (lh - h)) : TMAX; // rays above the light run far away
                F.push([lx + t * (x - lx), gy(lz + t * (z - lz))]);
            }
        }
    }
    fillPoly(c, hull(F));
}
var SMASK = {};
function shadeLayer(c, L, lz, occs, paint, X0, Y0, LW, LH) {
    var sz = L.sz || 1.3, mw = Math.ceil(LW / 2), mh = Math.ceil(LH / 2), key = mw + 'x' + mh;
    var _a = SMASK[key] || (SMASK[key] = [mk(mw, mh), mk(mw, mh)]), _b = _a[0], am = _b[0], a = _b[1], _c = _a[1], sm = _c[0], s = _c[1];
    a.setTransform(1, 0, 0, 1, 0, 0);
    a.globalAlpha = 1;
    a.globalCompositeOperation = 'source-over';
    a.clearRect(0, 0, mw, mh);
    for (var _i = 0, JIT_1 = JIT; _i < JIT_1.length; _i++) {
        var __entry6 = JIT_1[_i];
        var jx = __entry6[0], jy = __entry6[1];
        var lx = L.x + jx * sz, ly = L.y + jy * sz;
        s.setTransform(1, 0, 0, 1, 0, 0);
        s.clearRect(0, 0, mw, mh);
        s.setTransform(0.5, 0, 0, 0.5, -X0 / 2, -Y0 / 2);
        s.fillStyle = '#fff';
        s.save();
        s.beginPath();
        s.rect(X0 - 50, Y0 - 50, LW + 100, 146 - Y0 + 50);
        s.clip();
        for (var _d = 0, occs_1 = occs; _d < occs_1.length; _d++) {
            var o = occs_1[_d];
            shadowWall(s, lx, ly, lz, o, 0);
        }
        s.restore();
        s.save();
        s.beginPath();
        s.rect(X0 - 50, 146, LW + 100, Y0 + LH + 50 - 146);
        s.clip();
        for (var _e = 0, occs_2 = occs; _e < occs_2.length; _e++) {
            var o = occs_2[_e];
            shadowFloor(s, lx, ly, lz, o);
        }
        s.restore();
        a.globalCompositeOperation = 'lighter';
        a.globalAlpha = 0.86 / JIT.length;
        a.drawImage(sm, 0, 0);
    }
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.imageSmoothingEnabled = true;
    c.drawImage(am, X0, Y0, mw * 2, mh * 2);
    c.restore();
    for (var _f = 0, occs_3 = occs; _f < occs_3.length; _f++) { // faces turned to the light stay lit, except where something nearer shades them
        var A_1 = occs_3[_f];
        var za = oz(A_1);
        if (A_1.nf)
            continue;
        if (za > lz - 0.5) { // in front of the light: seen against it
            if (L.back) {
                c.save();
                c.globalCompositeOperation = 'destination-out';
                c.globalAlpha = 0.7;
                c.fillRect(A_1.x, A_1.y, A_1.w, A_1.h);
                c.restore();
            }
            continue;
        }
        c.save();
        c.beginPath();
        c.rect(A_1.x, A_1.y, A_1.w, A_1.h);
        c.clip();
        c.globalCompositeOperation = 'destination-out';
        c.fillRect(A_1.x, A_1.y, A_1.w, A_1.h);
        c.globalCompositeOperation = 'source-over';
        paint(c, A_1);
        c.globalCompositeOperation = 'destination-out';
        c.globalAlpha = 0.86;
        c.fillStyle = '#fff';
        for (var _g = 0, occs_4 = occs; _g < occs_4.length; _g++) {
            var B = occs_4[_g];
            if (oz(B) > za + 0.5)
                shadowWall(c, L.x, L.y, lz, B, za);
        }
        c.restore();
    }
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
}
var near = function (o, x0, y0, x1, y1) { return o.x < x1 && o.x + o.w > x0 && o.y < y1 && o.y + o.h > y0; };
function npcStamp(o) {
    if (!o.spr)
        return;
    if (!o.stamp) {
        var _a = mk(48, 64), c = _a[0], g = _a[1];
        o.stamp = { c: c, g: g, x: 0, y: 0 };
    }
    var s = o.stamp, fy = o.fy || FLOOR;
    s.g.clearRect(0, 0, 48, 64);
    o.spr(s.g, 24, 62);
    s.x = o.fx - 24;
    s.y = fy - 62;
}
function bakeLight(S, L) {
    var lz = L.z === undefined ? LZ : L.z, x0 = Math.floor(L.x - L.r), y0 = Math.max(0, Math.floor(L.y - L.r)), y1 = Math.min(H, Math.ceil(L.y + L.r));
    var w = Math.ceil(L.r * 2), h = Math.max(1, y1 - y0), reuse = L._bake && L._bake.c.width === w && L._bake.c.height === h;
    var _a = reuse ? [L._bake.c, L._bake.c.getContext('2d')] : mk(w, h), c = _a[0], g = _a[1];
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, w, h);
    g.translate(-x0, -y0);
    var gr = g.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
    gr.addColorStop(0, rgba(L.c, 1));
    gr.addColorStop(0.3, rgba(L.c, 0.62));
    gr.addColorStop(0.7, rgba(L.c, 0.18));
    gr.addColorStop(1, rgba(L.c, 0));
    var paint = function (g2, A) { g2.fillStyle = gr; if (A)
        g2.fillRect(A.x, A.y, A.w, A.h);
    else
        g2.fillRect(x0, y0, w, h); };
    paint(g);
    if (!L.ns && L.r >= 50) {
        var occs = S.occ.filter(function (o) { return near(o, x0, y0, x0 + w, y1) && (!o.cond || o.cond()); });
        occs.forEach(npcStamp);
        shadeLayer(g, L, lz, occs, paint, x0, y0, w, h);
    }
    L._bake = { c: c, x: x0, y: y0, scene: S };
}
// the flashlight beam: warm hotspot, the faint ring of a cheap reflector, a wide dim spill and a soft rim
var BEAM = (function () {
    var R = 190, half = 0.36, h = Math.ceil(2 * R * Math.sin(half)) + 4, _a = mk(R, h), c = _a[0], g = _a[1], id = g.createImageData(R, h), d = id.data, cy = h / 2;
    var ss = function (a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    for (var y = 0; y < h; y++)
        for (var x = 0; x < R; x++) {
            var dx = x + 0.5, dy = y + 0.5 - cy, dist = Math.hypot(dx, dy), th = Math.abs(Math.atan2(dy, dx));
            var ang = Math.exp(-(Math.pow((th / 0.13), 2))) + 0.18 * Math.exp(-(Math.pow(((th - 0.16) / 0.022), 2))) + 0.45 * (1 - ss(0.22, half, th));
            var fall = (1 / (1 + Math.pow((dist / 115), 2))) * (1 - ss(R * 0.6, R, dist)) * ss(0, 12, dist);
            var v = clamp(ang * fall * 1.5, 0, 1), i = (y * R + x) * 4;
            d[i] = 255;
            d[i + 1] = 238 - (1 - Math.min(1, ang)) * 14 | 0;
            d[i + 2] = 205 - (1 - Math.min(1, ang)) * 40 | 0;
            d[i + 3] = v * 255 | 0;
        }
    g.putImageData(id, 0, 0);
    return { c: c, R: R, half: half, h: h };
})();
var FL = { range: BEAM.R, half: BEAM.half, col: [255, 236, 200] };
var _d = mk(WMAX, H), flashC = _d[0], fctx = _d[1], _e = mk(WMAX, H), airC = _e[0], actx = _e[1];
function drawBeam(c, o) { c.save(); c.translate(o.x, o.y); c.rotate(o.ang); c.drawImage(BEAM.c, 0, -BEAM.h / 2); c.restore(); }
function buildLightMap(S, camX) {
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.globalAlpha = 1;
    var a = S.ambient;
    lctx.fillStyle = "rgb(".concat(a[0], ",").concat(a[1], ",").concat(a[2], ")");
    lctx.fillRect(0, 0, W, H);
    lctx.globalCompositeOperation = 'lighter';
    lctx.drawImage(S.sky, -camX, 0);
    lctx.setTransform(1, 0, 0, 1, -camX, 0);
    for (var _i = 0, _a = S.lights; _i < _a.length; _i++) {
        var L = _a[_i];
        if (L.x + L.r < camX || L.x - L.r > camX + W)
            continue;
        var k = L.i * lightK(L);
        if (k < 0.02)
            continue;
        if (!L._bake || L._bake.scene !== S || L.dyn)
            bakeLight(S, L);
        lctx.globalAlpha = Math.min(1, k);
        lctx.drawImage(L._bake.c, L._bake.x, L._bake.y);
        lctx.globalAlpha = 1;
        softGlow(L.x, L.y, L.r * 0.75, L.c, k * 0.12);
    }
    G.flashLit = false;
    if (G.state === 'play' && G.flashOn) {
        var o_1 = G.fo, L = { x: o_1.x, y: o_1.y, sz: 1 }, R_1 = BEAM.R;
        fctx.setTransform(1, 0, 0, 1, 0, 0);
        fctx.clearRect(0, 0, W, H);
        fctx.setTransform(1, 0, 0, 1, -camX, 0);
        drawBeam(fctx, o_1);
        actx.clearRect(0, 0, W, H);
        actx.drawImage(flashC, 0, 0); // the beam in the air, before anything blocks it
        var occs = S.occ.filter(function (q) { return near(q, o_1.x - R_1, 0, o_1.x + R_1, H) && (!q.cond || q.cond()); });
        occs.forEach(npcStamp);
        shadeLayer(fctx, L, FZ, occs, function (c) { return drawBeam(c, o_1); }, camX, 0, W, H);
        lctx.globalAlpha = FX.flashK;
        lctx.drawImage(flashC, camX, 0);
        lctx.globalAlpha = 1;
        softGlow(o_1.x, o_1.y, 26, FL.col, 0.14 * FX.flashK);
        G.flashLit = true;
    }
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
}
function litByFlash(tx, ty) {
    if (!G.flashOn)
        return false;
    var o = G.fo, dx = tx - o.x, dy = ty - o.y, d = Math.hypot(dx, dy);
    return d < FL.range * 0.8 && Math.abs(angDiff(Math.atan2(dy, dx), o.ang)) < FL.half * 0.75;
}
// ---------- snow & particles ----------
var SNOW = [];
function newFlake(anyY) { var z = 0.35 + Math.random() * 0.95; return { x: Math.random() * (W + 40) - 20, y: anyY ? Math.random() * H : -4, z: z, ph: Math.random() * 6.28, sz: z > 1.14 ? 2 : 1 }; }
function initSnow() { SNOW.length = 0; for (var i = 0; i < 260; i++)
    SNOW.push(newFlake(true)); }
function updateSnow(dt, dCam) {
    G.wind = -8 + Math.sin(G.t * 0.23) * 10 + Math.sin(G.t * 0.9) * 3;
    for (var _i = 0, SNOW_1 = SNOW; _i < SNOW_1.length; _i++) {
        var s = SNOW_1[_i];
        s.y += (9 + 15 * s.z) * dt;
        s.x += (G.wind * s.z + Math.sin(G.t * 1.4 + s.ph) * 5 * s.z) * dt - dCam * s.z;
        if (s.y > H + 2)
            Object.assign(s, newFlake(false));
        if (s.x < -20)
            s.x += W + 40;
        else if (s.x > W + 20)
            s.x -= W + 40;
    }
}
function drawSnow(g, front) {
    for (var _i = 0, SNOW_2 = SNOW; _i < SNOW_2.length; _i++) {
        var s = SNOW_2[_i];
        if (front !== (s.sz === 2))
            continue;
        g.fillStyle = front ? 'rgba(225,232,250,0.42)' : "rgba(240,244,255,".concat(0.45 + s.z * 0.45, ")");
        g.fillRect(s.x | 0, s.y | 0, s.sz, s.sz);
    }
}
var PARTS = [];
function puff(x, y, vx, vy, life, col, size, em, grow) { if (PARTS.length < 400)
    PARTS.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, col: col, size: size, em: em, grow: grow || 0 }); }
function updateParts(dt) {
    for (var i = PARTS.length - 1; i >= 0; i--) {
        var p = PARTS[i];
        p.life -= dt;
        if (p.life <= 0) {
            PARTS.splice(i, 1);
            continue;
        }
        p.x += (p.vx + G.wind * 0.35) * dt;
        p.y += p.vy * dt;
    }
}
function drawParts(g, camX, em) {
    for (var _i = 0, PARTS_1 = PARTS; _i < PARTS_1.length; _i++) {
        var p = PARTS_1[_i];
        if (!!p.em !== em)
            continue;
        var a = p.life / p.max, s = p.size + (1 - a) * p.grow;
        g.fillStyle = rgba(p.col, em ? Math.min(1, a * 1.3) : a * 0.5);
        g.fillRect(Math.round(p.x - camX - s / 2), Math.round(p.y - s / 2), Math.ceil(s), Math.ceil(s));
    }
}
// ---------- the case: clues, speakers, dialogue ----------
var CLUES = {
    watch: { n: 'ساعتِ شکسته', d: 'روی ۱۱:۴۰ ایستاده. شیشه خرد شده، اما بندِ چرمی بی‌خراش است.' },
    camera: { n: 'دوربینِ بی‌فیلم', d: 'حلقه‌ی فیلم را برده‌اند. قاتل دنبالِ عکس‌ها بود، نه پول.' },
    snow: { n: 'ردِ پوتین در برف', d: 'نعلِ فلزی، پاشنه‌ی چپِ ترک‌خورده. برفِ رویش می‌گوید: حدودِ ساعتِ یک.' },
    cig: { n: 'ته‌سیگارِ «زر»', d: 'ردِ رژِ لبِ ارغوانی. کاملاً سرد؛ یکی دو ساعت پیش خاموش شده.' },
    neg: { n: 'نگاتیوِ سوخته', d: 'مردی یونیفرم‌پوش پاکتِ پول می‌گیرد. صورتش سوخته؛ فقط سردوشی پیداست.' },
    test: { n: 'شهادتِ یدالله', d: 'ماشینی بی‌آژیر حدودِ یک آمد، ده دقیقه بعد رفت، و با آژیر برگشت.' },
    boots: { n: 'پوتینِ ستوان', d: 'پوتینِ سازمانی با نعلِ فلزی. پاشنه‌ی چپ ترکِ مورب دارد.' },
    note: { n: 'یادداشتِ قرار', d: '«یک بامداد. پشتِ کوچه. پول را بیاور. — ر.ک»' },
    tape: { n: 'نوارِ مداربسته', d: '۰۱:۰۴ مردی با کلاهِ پلیس به کوچه رفت؛ ۰۱:۱۱ تنها برگشت.' }
};
var CLUE_ORDER = ['watch', 'camera', 'snow', 'cig', 'neg', 'test', 'boots', 'note', 'tape'];
var SPK = {
    a: { n: 'آرمان سپهر', c: '#ffbf69' }, b: { n: 'ستوان بهمن رستگار', c: '#8fb4ff' },
    l: { n: 'لیلا ماهان', c: '#ff5fb4' }, y: { n: 'عمو یدالله', c: '#ff9a4d' }, n: { n: '', c: '#9aa3b8' }
};
var has = function (k) { return G.inv.includes(k); };
var F = {};
['akbMet', 'askedWhere', 'bikeOwner', 'crowMask', 'crowMet', 'crowReza', 'ghoCart', 'ghoMet', 'ghoRadio', 'jafLabel', 'jafMet', 'jafWhere', 'kazAwake', 'kazCode', 'kazLocker', 'kazMajor', 'kazMet', 'kiaMet', 'kiaReza', 'kiaWhy', 'leiCig', 'leiClosed', 'leiEnemy', 'leiMet', 'leiNeg', 'mehCold', 'mehMet', 'mehWho', 'metB', 'nasBoss', 'nasFire', 'nasMet', 'negCode', 'negCold', 'negGiven', 'negMet', 'negOk', 'negShown', 'nooMet', 'nooVafa', 'parMet', 'parPower', 'push', 'rah5Met', 'rahMet', 'sadMet', 'sadNoise', 'samMet', 'samWhy', 'sarMet', 'sawCam', 'shaKf', 'shaMet', 'shaNas', 'siaMet', 'siaMsg', 'siaShoes', 'siaWhere', 'teaGiven', 'vafMet', 'vafMoney', 'yadMet', 'yadRude'].forEach(function (k) { return Object.defineProperty(F, k, { get: function () { return !!G.flags[k]; } }); });
var strongCase = function () { return has('boots') && has('snow') && (has('tape') || has('test')); };
var DLG = {
    intro: [
        ['a', 'تهران. شبِ یلدا؛ بلندترین شبِ سال.'],
        ['a', 'برای بیشترِ مردم، شبِ انار و فالِ حافظ است. برای رضا کاوه، عکاسِ آزاد، شبی شد که صبح نداشت.'],
        ['a', 'ستوان رستگار ساعتِ یک و بیست و پنج دقیقه بی‌سیم زد: جسدی پشتِ «ویدئو کلوپ ماه»، زیرِ برف.'],
        ['a', 'برف همه‌چیز را می‌پوشاند... مگر این‌که بدانی نورِ چراغ‌قوه را کجا بیندازی.'],
        ['n', 'راهنما: A و D برای حرکت. ماوس برای نشانه‌گرفتنِ چراغ‌قوه. E یا کلیک برای بررسی. I برای دفترچه.']
    ],
    body: [
        ['a', 'رضا کاوه. سی و چند ساله. ضربه‌ای سنگین به پشتِ سر.'],
        ['a', 'کیف پولش دست‌نخورده در جیبِ پالتوست. پس دزدی در کار نبوده.'],
        { s: 'a', t: 'ساعتِ مچی‌اش شکسته و روی یازده و چهل دقیقه ایستاده.', give: 'watch' },
        ['a', 'عجیب است. شیشه‌اش خرد شده، اما بندِ چرمی‌اش حتی یک خراش ندارد. انگار کسی با حوصله ساعت را روی مچش شکسته.'],
        ['a', 'و روی پالتویش فقط لایه‌ای نازک از برف نشسته...']
    ],
    body2: [['a', 'رضا هنوز همان‌جاست. برف دارد آرام‌آرام پنهانش می‌کند؛ مثلِ همه‌ی رازهای این شهر.']],
    camera: [
        ['a', 'دوربینِ رضا؛ یک «زنیت»ِ روسی قدیمی، نیمه‌فرورفته در برف.'],
        { s: 'a', t: 'درِ پشتی‌اش باز است و حلقه‌ی فیلم نیست.', give: 'camera' },
        ['a', 'قاتل دنبالِ عکس‌ها بوده، نه پول.']
    ],
    camera2: [['a', 'دوربینِ خالی. کسی خاطره‌هایش را با خودش برده.']],
    prints: [
        ['a', 'ردِ پا. دو دسته.'],
        ['a', 'یک دسته مالِ کفش‌های رضاست؛ از سمتِ خیابان آمده.'],
        ['a', 'دسته‌ی دوم: پوتینِ سنگین با نعلِ فلزی. پاشنه‌ی چپ یک ترکِ مورب دارد.'],
        { s: 'a', t: 'روی این ردها فقط یک بندِ انگشت برف نشسته. با این بارش، عمرشان بیشتر از چهل دقیقه نیست. یعنی حدودِ ساعتِ یک؛ نه یازده و چهل.', give: 'snow' }
    ],
    prints2: [
        { if: function () { return !has('boots'); }, s: 'a', t: 'پاشنه‌ی چپِ ترک‌خورده. باید صاحبش را پیدا کنم.' },
        { if: function () { return has('boots'); }, s: 'a', t: 'همان پاشنه‌ی ترک‌خورده‌ی پوتینِ ستوان رستگار. شکی نیست.' }
    ],
    cig: [
        ['a', 'ته‌سیگار. مارکِ «زر».'],
        { s: 'a', t: 'ردِ رژِ لبِ ارغوانی روی فیلتر. کاملاً سرد؛ یکی دو ساعتی از خاموش‌شدنش می‌گذرد.', give: 'cig' }
    ],
    cig2: [['a', 'ته‌سیگاری با رژِ ارغوانی. کسی این‌جا منتظر مانده بود... یا فقط سیگاری کشیده بود.']],
    dump: [
        ['a', 'سطلِ زباله‌ی فلزی. بوی ماهی مانده و کاغذِ خیس.'],
        ['a', 'زیرِ یک جعبه‌ی پیتزا چیزی مچاله شده... نوارِ نگاتیوِ نیم‌سوخته.'],
        ['a', 'کسی عجله داشته آتشش بزند، اما برف شعله را خفه کرده.'],
        { s: 'a', t: 'جلوی نور می‌گیرمش. یک قاب سالم مانده: مردی در یونیفرم، پاکتی قطور از کسی می‌گیرد. صورتش سوخته؛ فقط سردوشی‌اش پیداست.', give: 'neg' }
    ],
    dump2: [['a', 'دیگر چیزی جز زباله نمانده.']],
    car: [
        ['a', 'پیکانِ گشتِ کلانتری. کاپوتش خیس است؛ برف رویش نمی‌ماند.'],
        ['a', 'موتورش هنوز داغ است. برای ماشینی که «تازه رسیده»، زیادی راه رفته.']
    ],
    fence: [['a', 'تهِ کوچه بن‌بست است. هیچ‌کس از این طرف فرار نکرده؛ نه قاتل، نه مقتول.']],
    door: [
        ['a', 'درِ پشتی ویدئو کلوپ. از داخل قفل است.'],
        ['a', 'روی برفِ جلویش هیچ ردِ تازه‌ای نیست. پس از یازده و نیم به بعد، کسی از این در بیرون نیامده.']
    ],
    lamp: [['a', 'چراغِ دیواری سدیمی. نورِ زردش همه‌چیز را شبیهِ عکسی قدیمی می‌کند.']],
    // --- Yadollah ---
    yad: [
        ['y', 'چراغت را از صورتم بردار، جوان. چشم‌هایم از جبهه به این طرف با نور میانه‌ای ندارد.'],
        { s: 'a', t: '(پیرمرد دست‌هایش را روی آتشِ بشکه گرفته است.)', c: [
                { t: 'کنارِ آتش می‌نشینم. شبِ سردی است، عمو.', go: 'yad_kind' },
                { t: 'وقت ندارم. امشب چه دیدی؟', go: 'yad_rude' }
            ] }
    ],
    yad_kind: [
        ['y', 'سرد است، آره. یلداست. قدیم‌ها این شب را تا صبح بیدار می‌ماندیم؛ انار دانه می‌کردیم، حافظ می‌خواندیم...'],
        ['y', 'امشب؟ حدودِ یازده و نیم، رضا با آن زنِ ویدئوفروش همین‌جا سیگار کشید. خندیدند. بعد زن برگشت تو و رضا رفت سمتِ خیابان.'],
        ['y', 'نزدیکِ یک، رضا برگشت. کمی بعد ماشینی سرِ کوچه ترمز کرد؛ بی‌آژیر، چراغ‌خاموش. بعد صدای پوتین روی برف.'],
        { s: 'y', t: 'ده دقیقه بعد همان ماشین روشن شد و رفت... و یک ربع بعد با آژیر و چراغِ گردان برگشت، این بار تا تهِ کوچه. انگار تازه رسیده باشد.', give: 'test' },
        ['a', 'ماشینِ پلیس؟'],
        ['y', 'من چیزی نگفتم، جوان. من فقط یک پیرمردم کنارِ یک بشکه.']
    ],
    yad_rude: [{ set: 'yadRude' }, ['y', 'وقت نداری؟ من هم حافظه ندارم. برو پی کارت.']],
    yad_again: [
        { s: 'y', t: 'باز آمدی؟', c: [
                { t: 'ببخش، عمو. شبِ بدی بوده. اجازه هست کنارِ آتش بنشینم؟', go: 'yad_kind' },
                { t: 'بگو چه دیدی، وگرنه امشب را در بازداشتگاه می‌گذرانی.', go: 'yad_rude2' },
                { t: '(برو)' }
            ] }
    ],
    yad_rude2: [['y', 'بازداشتگاه گرم‌تر از این کوچه است، جوان. تهدیدت را نگه دار برای کسی که چیزی برای باختن دارد.']],
    yad_done: [['y', 'یلدا مبارک، جوان. مراقب باش؛ این شهر چشم دارد، ولی زبان ندارد.']],
    // --- Lt. Bahman Rastegar ---
    bah: [
        { set: 'metB' },
        ['b', 'سپهر! بالاخره. ساعتِ یک و بیست و پنج پیدایش کردم. گشتِ معمولی.'],
        ['b', 'ساعتش روی یازده و چهل ایستاده. یعنی قاتل همان موقع زده.'],
        ['b', 'و حدس بزن کی تا یازده و نیم با او بوده؟ لیلا ماهان، صاحبِ همین ویدئو کلوپ. پرونده دارد خودش را می‌بندد.'],
        { go: 'bah_hub' }
    ],
    bah_again: [['b', 'هنوز این‌جایی، سپهر؟'], { go: 'bah_hub' }],
    bah_hub: [
        { s: 'b', t: 'چیزِ دیگری هم هست؟', c: [
                { t: 'پرونده را زود نبند، ستوان.', go: 'bah_rush' },
                { t: 'تو ساعتِ یک کجا بودی؟', go: 'bah_where', if: function () { return !F.askedWhere; } },
                { t: '(به پوتین‌هایش نگاه کن)', go: 'bah_boots', if: function () { return has('snow') && !has('boots'); } },
                { t: '(نگاتیو را نشانش بده)', go: 'bah_neg', if: function () { return has('neg') && !F.negShown; } },
                { t: 'فعلاً همین.' }
            ] }
    ],
    bah_rush: [['b', 'پرونده‌ها خودشان بسته می‌شوند، سپهر. من فقط در را برایشان نگه می‌دارم.'], { go: 'bah_hub' }],
    bah_where: [{ set: 'askedWhere' }, ['b', 'گشت بودم. خیابان‌های شمالی. می‌خواهی از بی‌سیم بپرسی؟'], ['a', '(جوابش زیادی آماده بود.)'], { go: 'bah_hub' }],
    bah_boots: [
        ['a', '(پوتین‌های سنگینِ سازمانی، با نعلِ فلزی. پاشنه‌ی چپ... یک ترکِ مورب.)'],
        { s: 'a', t: '(درست مثلِ ردِ پای کنارِ جسد.)', give: 'boots' },
        ['b', 'به چی زل زده‌ای؟ برو سراغِ آن زن، سپهر. سرما دارد مغزت را یخ می‌زند.'],
        { go: 'bah_hub' }
    ],
    bah_neg: [
        { set: 'negShown' },
        ['b', 'این را از کجا آوردی؟'],
        ['b', 'این مدرکِ صحنه‌ی جرم است. بده به من؛ خودم می‌فرستمش آزمایشگاه.'],
        { s: 'a', t: '(دستش را دراز کرده. دستکش ندارد، اما انگشت‌هایش نمی‌لرزند.)', c: [
                { t: '(نگاتیو را به او بده)', go: 'bah_neg_give' },
                { t: 'نه. پیشِ خودم می‌ماند.', go: 'bah_neg_keep' }
            ] }
    ],
    bah_neg_give: [{ take: 'neg', set: 'negGiven' }, ['b', 'آفرین. کارِ درست همین است.'], ['a', '(نگاتیو را در جیبِ داخلی کتش گذاشت؛ نه در کیسه‌ی مدارک.)'], { go: 'bah_hub' }],
    bah_neg_keep: [{ set: 'bWary' }, ['b', '...باشد. فقط مراقب باش، سپهر. شبِ سردی است. آدم‌ها در این سرما زود می‌شکنند.'], { go: 'bah_hub' }],
    // --- Leila Mahan ---
    lei: [
        ['l', 'پلیس؟ بوی قهوه‌ی سرد و بی‌خوابی می‌دهی. حتماً پلیسی.'],
        { s: 'l', t: 'چه می‌خواهی؟ مغازه بسته است.', c: [
                { t: 'رضا کاوه مرده. پشتِ مغازه‌ی تو.', go: 'lei_calm' },
                { t: 'تو آخرین کسی بودی که با او دیدند. بهتر است حرف بزنی.', go: 'lei_hard' }
            ] }
    ],
    lei_calm: [
        { set: 'leiTrust' },
        ['l', '...رضا؟'],
        ['l', 'ساعتِ یازده و نیم با هم سیگار کشیدیم. گفت امشب پولدار می‌شود. گفت «یکی از آن بالایی‌ها» قرار است عکس‌هایش را بخرد.'],
        ['l', 'گفتم بازی خطرناکی است. خندید. رضا همیشه می‌خندید.'],
        { go: 'lei_hub' }
    ],
    lei_hard: [{ set: 'leiClosed' }, ['l', 'پس آمده‌ای یکی را بگیری، نه این‌که بفهمی.'], ['l', 'برو بیرون، کارآگاه. یا حکم بیاور، یا ادب.']],
    lei_closed: [
        { s: 'l', t: 'باز که آمدی.', c: [
                { t: 'حق با تو بود. تند رفتم. رضا مرده و من فقط می‌خواهم بدانم چرا.', go: 'lei_sorry' },
                { t: '(نگاتیو را نشانش بده)', go: 'lei_neg_open', if: function () { return has('neg'); } },
                { t: '(برو)' }
            ] }
    ],
    lei_sorry: [
        { fx: function () { G.flags.leiClosed = false; G.flags.leiTrust = true; } },
        ['l', '...باشد. برای رضا؛ نه برای تو.'],
        ['l', 'ساعتِ یازده و نیم با هم سیگار کشیدیم. گفت امشب پولدار می‌شود؛ «یکی از آن بالایی‌ها» قرار بود عکس‌هایش را بخرد.'],
        { go: 'lei_hub' }
    ],
    lei_neg_open: [
        { fx: function () { G.flags.leiClosed = false; G.flags.leiTrust = true; G.flags.leiNeg = true; } },
        ['l', 'یونیفرم...'],
        ['l', 'رضا گفته بود «یکی از آن بالایی‌ها». فکر می‌کردم منظورش یک تاجر است، یا یک مدیرکل. نه... این.'],
        ['l', 'باشد، کارآگاه. هر چه بخواهی.'],
        { go: 'lei_hub' }
    ],
    lei_again: [['l', 'هنوز این‌جایی؟ سیگارم دارد تمام می‌شود، کارآگاه.'], { go: 'lei_hub' }],
    lei_hub: [
        { s: 'l', t: 'دیگر چه؟', c: [
                { t: 'ته‌سیگارت را کنارِ سطلِ زباله پیدا کردم.', go: 'lei_cig', if: function () { return has('cig') && !F.leiCig; } },
                { t: '(نگاتیو را نشانش بده)', go: 'lei_neg', if: function () { return has('neg') && !F.leiNeg; } },
                { t: 'دوربینِ بالای در کار می‌کند؟', go: 'lei_tape', if: function () { return F.sawCam && !has('tape'); } },
                { t: 'رضا با کسی دشمنی داشت؟', go: 'lei_enemy', if: function () { return !F.leiEnemy; } },
                { t: 'فعلاً همین.' }
            ] }
    ],
    lei_cig: [{ set: 'leiCig' }, ['l', 'آره، مالِ من است. یازده و نیم؛ گفتم که.'], ['l', 'اگر می‌خواستم کسی را بکشم، ته‌سیگارم را با رژِ لب کنارِ جسدش جا نمی‌گذاشتم، کارآگاه.'], { go: 'lei_hub' }],
    lei_neg: [{ set: 'leiNeg' }, ['l', 'یونیفرم...'], ['l', 'رضا گفته بود «یکی از آن بالایی‌ها». فکر می‌کردم منظورش یک تاجر است. نه... این.'], { go: 'lei_hub' }],
    lei_enemy: [
        { set: 'leiEnemy' },
        ['l', 'رضا از آدم‌ها عکس می‌گرفت، وقتی نباید. این‌جوری آدم دوست پیدا نمی‌کند.'],
        ['l', 'ولی این اواخر می‌ترسید. می‌گفت یک ماشینِ گشت هر شب از جلوی خانه‌اش رد می‌شود.'],
        { go: 'lei_hub' }
    ],
    lei_tape: [
        ['l', 'دستگاهِ ضبط پشتِ پیشخوان است. نوارش را هر شش ساعت عوض می‌کنم.'],
        ['l', 'بیا تو. فقط به چیزی دست نزن.'],
        ['a', '(نوار را عقب می‌زنم. تصویر برفکی است، سیاه و سفید. ساعتِ گوشه‌ی تصویر می‌لرزد.)'],
        ['a', '۲۳:۳۶ — رضا از جلوی ویترین رد می‌شود، به سمتِ خیابان. زنده. سیگار به لب.'],
        { s: 'a', t: '۰۱:۰۴ — مردی با کلاهِ لبه‌دارِ پلیس از جلوی ویترین به سمتِ کوچه می‌رود. ۰۱:۱۱ — برمی‌گردد. تنها. با عجله.', give: 'tape' },
        ['l', 'این... این که...'],
        ['a', 'هیچ‌کس نباید بداند این نوار دستِ من است. هیچ‌کس.'],
        { go: 'lei_hub' }
    ],
    // --- street flavour ---
    neon: [['a', 'تابلوی نئونِ «ویدئو کلوپ ماه». هر چند ثانیه یک بار می‌میرد و دوباره زنده می‌شود. مثلِ همه‌ی ما در این شهر.']],
    window: [
        ['a', 'ویترین پر از نوارهای وی‌اچ‌اس: «کازابلانکا»، «قیصر»، «گوزن‌ها»... تلویزیونِ کوچکِ گوشه فقط برفک نشان می‌دهد.'],
        ['a', 'حتی تلویزیون‌ها هم امشب برف می‌بینند.']
    ],
    cam: [
        { set: 'sawCam' },
        ['a', 'یک دوربینِ مداربسته بالای در، رو به پیاده‌رو و دهانه‌ی کوچه.'],
        ['a', 'چراغِ قرمزش چشمک می‌زند. یعنی دارد ضبط می‌کند... یا دست‌کم وانمود می‌کند.'],
        { if: function () { return F.leiClosed; }, s: 'a', t: 'نوارش دستِ لیلاست. و لیلا فعلاً با من حرف نمی‌زند.' }
    ],
    lamp2: [['a', 'تیرِ چراغ‌برق. زیرِ نورش، دانه‌های برف مثلِ غبارِ یک پروژکتورِ قدیمی می‌رقصند.']],
    benz: [
        ['a', 'یک بنزِ قدیمی زیرِ برف. یک وجب برف رویش نشسته؛ از سرِ شب تکان نخورده.'],
        ['a', 'برف ساعتِ خوبی است، اگر بدانی چطور بخوانی‌اش.']
    ],
    barrier: [['a', 'راه‌بندِ پلیس. ستوان خیابان را بسته؛ «برای حفظِ صحنه». یا برای این‌که کسی چیزی نبیند.']],
    // --- the payphone: a clue, then the accusation ---
    phone: [
        ['a', 'تلفنِ عمومی. کسی گوشی را کج گذاشته.'],
        ['a', 'لای دفترچه‌ی راهنمای تلفن، کاغذی تاخورده گیر کرده.'],
        { s: 'a', t: '«یک بامداد. پشتِ کوچه. پول را بیاور. — ر.ک»', give: 'note' },
        ['a', 'رضا قرار گذاشته بود؛ ساعتِ یک، نه یازده و چهل. با کسی که پول داشت... و چیزی برای پنهان کردن.'],
        { go: 'phone_hub' }
    ],
    phone_hub: [
        { if: function () { return clueCount() < 4; }, s: 'a', t: 'هنوز چیزی برای گزارش به مرکز ندارم. برف هنوز حرفش را نزده.' },
        { if: function () { return clueCount() >= 4; }, s: 'a', t: 'به مرکز زنگ بزنم و نامِ قاتل را بگویم؟ بعد از این، راهِ برگشتی نیست.', c: [
                { t: 'ستوان بهمن رستگار', go: 'acc_b' },
                { t: 'لیلا ماهان', go: 'end_l' },
                { t: 'عمو یدالله', go: 'end_y' },
                { t: 'هنوز نه.' }
            ] }
    ],
    acc_b: [{ if: strongCase, go: 'end_good' }, { go: 'end_weak' }],
    end_good: [
        ['a', '«مرکز؟ سپهر هستم. قاتلِ رضا کاوه ستوان بهمن رستگار است.»'],
        ['a', 'ساعتِ رضا را خودش روی یازده و چهل شکست، تا لیلا در قاب بیفتد. اما برف ساعتِ دیگری را نشان می‌داد.'],
        ['a', 'ردِ پوتینی با پاشنه‌ی ترک‌خورده، کنارِ جسد؛ درست به اندازه‌ی پوتینِ ستوان.'],
        { if: function () { return has('tape'); }, s: 'a', t: 'و نواری که هیچ‌کس نمی‌دانست ضبط می‌شود: ۰۱:۰۴ رفت، ۰۱:۱۱ برگشت.' },
        { if: function () { return has('test'); }, s: 'a', t: 'و پیرمردی کنارِ بشکه که ماشینی را دیده بود که بی‌آژیر آمد و با آژیر برگشت.' },
        { if: function () { return F.negGiven; }, s: 'a', t: 'نگاتیو را در جیبِ داخلی کتش پیدا کردند. خودش آن را برایم نگه داشته بود.' },
        ['b', '(از دهانه‌ی کوچه) سپهر... تو نمی‌فهمی این شهر چطور کار می‌کند.'],
        ['a', 'می‌فهمم، بهمن. فقط دیگر به این شکل کار نمی‌کند.'],
        ['a', 'صبح که شد، برف هنوز می‌بارید. اما این بار، زیرش فقط ردِ یک دروغ مانده بود.'],
        { end: 'good' }
    ],
    end_weak: [
        ['a', '«مرکز؟ سپهر هستم. قاتل ستوان رستگار است.»'],
        ['a', 'پشتِ خط سکوت شد. بعد صدای سرگرد: «مدرک، سپهر. مدرک.»'],
        ['a', 'چیزی جز حدس و برف نداشتم. و برف تا صبح آب می‌شود.'],
        ['a', 'رستگار به من لبخند زد؛ همان لبخندی که آدم به بچه‌ای می‌زند که شمعِ یلدا را فوت کرده. هفته‌ی بعد مرا به بایگانی فرستادند.'],
        { end: 'weak' }
    ],
    end_l: [
        ['a', '«مرکز؟ سپهر هستم. لیلا ماهان را بازداشت کنید.»'],
        ['l', '(پشتِ شیشه‌ی ماشینِ گشت) تو هم مثلِ بقیه‌ای، کارآگاه.'],
        ['a', 'ته‌سیگار، ساعتِ شکسته، یازده و چهل دقیقه. همه‌چیز جور درمی‌آمد. زیادی جور درمی‌آمد.'],
        ['a', 'یک هفته بعد برف آب شد. ستوان رستگار ترفیع گرفت. و من هنوز صدای خنده‌ی رضا را در کوچه می‌شنوم.'],
        { end: 'wrongL' }
    ],
    end_y: [
        ['a', '«مرکز؟ سپهر هستم. پیرمردِ کنارِ بشکه را ببرید.»'],
        ['y', 'یلدا مبارک، جوان. شبِ بلندی بود؛ برای هر دومان.'],
        ['a', 'هیچ‌کس برای یک پیرمردِ بی‌خانمان اعتراض نکرد. پرونده سه‌روزه بسته شد.'],
        ['a', 'اما برف هر زمستان برمی‌گردد. و هر بار، ردِ آن پوتین را در خواب‌هایم می‌بینم.'],
        { end: 'wrongY' }
    ]
};
var ENDINGS = {
    good: { t: 'حقیقت زیر برف', s: 'پرونده حل شد. قاتل پشتِ میله‌هاست.', c: '#7fe3ff', good: true },
    weak: { t: 'پرونده‌ی بسته', s: 'حق با تو بود؛ اما حقِ بی‌مدرک فقط یک شایعه است.', c: '#ffbf69' },
    wrongL: { t: 'بی‌گناه پشتِ میله‌ها', s: 'قاتل هنوز آزاد است.', c: '#ff5fb4' },
    wrongY: { t: 'صدای بی‌صدایان', s: 'قاتل هنوز آزاد است.', c: '#ff9a4d' }
};
// which dialogue each inspection target opens, given the current state
var ACT = {
    body: function () { return has('watch') ? 'body2' : 'body'; }, camera: function () { return has('camera') ? 'camera2' : 'camera'; },
    prints: function () { return has('snow') ? 'prints2' : 'prints'; }, cig: function () { return has('cig') ? 'cig2' : 'cig'; },
    dump: function () { return (has('neg') || F.negGiven) ? 'dump2' : 'dump'; }, car: function () { return 'car'; }, fence: function () { return 'fence'; }, door: function () { return 'door'; }, lamp: function () { return 'lamp'; },
    yad: function () { return has('test') ? 'yad_done' : F.yadRude ? 'yad_again' : F.yadMet ? 'yad_again' : (G.flags.yadMet = true, 'yad'); },
    bahman: function () { return F.metB ? 'bah_again' : 'bah'; },
    leila: function () { return F.leiClosed ? 'lei_closed' : F.leiMet ? 'lei_again' : (G.flags.leiMet = true, 'lei'); },
    neon: function () { return 'neon'; }, window: function () { return 'window'; }, cam: function () { return 'cam'; }, lamp2: function () { return 'lamp2'; }, benz: function () { return 'benz'; }, barrier: function () { return 'barrier'; },
    phone: function () { return has('note') ? 'phone_hub' : 'phone'; }
};
function deductions() { return LV().ded ? LV().ded() : G.level === 2 ? deductions2() : deductions1(); }
function deductions1() {
    var out = [];
    if (has('watch') && has('snow'))
        out.push('ساعتِ رضا صحنه‌سازی شده. قتل حدودِ ساعتِ یک رخ داده، نه یازده و چهل.');
    if (has('note'))
        out.push('رضا ساعتِ یک برای فروشِ عکس‌ها قرار داشت.');
    if (has('snow') && has('boots'))
        out.push('ردِ پوتینِ کنارِ جسد با پوتینِ ستوان رستگار یکی است.');
    if (has('camera') && (has('neg') || F.negGiven))
        out.push('قاتل فیلمِ دوربین را برد و سوزاند: عکسِ یک مأمورِ رشوه‌گیر.');
    if (has('tape') || has('test'))
        out.push('مردی با کلاهِ پلیس ساعتِ یک در کوچه بوده و بعد «تازه» رسیده.');
    if (has('cig') && (has('test') || F.leiCig))
        out.push('لیلا ساعتِ یازده و نیم آن‌جا بوده؛ پیش از قتل.');
    if (strongCase())
        out.push('پرونده کامل است. وقتِ تماس با مرکز است؛ تلفنِ عمومی کنارِ ویدئو کلوپ.');
    else if (clueCount() >= 4)
        out.push('از تلفنِ عمومی کنارِ ویدئو کلوپ می‌شود به مرکز گزارش داد... اما مدرک کافی است؟');
    return out;
}
// ---------- case 2: «شیفتِ شب» — the one upstairs ----------
Object.assign(CLUES, {
    code: { n: 'کدِ پنهان', d: 'زیرِ خطِ ماژیک: ۳۸۲۶. ته‌نقشِ کاغذ: «دفترِ سرگرد نادری».' },
    locker: { n: 'کمدِ خالی', d: 'مدارکِ کاوه ساعتِ ۰۲:۴۰ خارج شده؛ امضا: «کاظم». بوی سیگارِ برگ.' },
    forgery: { n: 'امضای جعلی', d: 'گروهبان فرهی: «این خطِ من نیست؛ از رو کشیده‌اند.»' },
    print: { n: 'سندِ گیرکرده', d: 'دستورِ انتقالِ مدارکِ کاوه به بایگانیِ راکد. ۰۲:۵۲. امضا: «ن.»' },
    joblog: { n: 'حافظه‌ی چاپگر', d: '۰۲:۵۲ — ترمینالِ ۴ — کاربرِ ۰۷ — یک صفحه.' },
    roster: { n: 'تابلوی کشیک', d: 'کاربرِ ۰۷ = سرگرد نادری؛ ترمینالِ ۴ = دفترِ سرگرد. «مأموریت، کرج».' },
    calllog: { n: 'دفترِ بی‌سیم', d: 'تماسِ «از کرج» ساعتِ ۰۲:۳۰ از خطِ داخلیِ ۴ آمده.' },
    wet: { n: 'ردِ کفشِ خیس', d: 'برفِ آب‌شده از پله‌ی پشتی تا دفترِ سرگرد؛ کمتر از یک ساعت.' },
    coat: { n: 'پالتوی خیس', d: 'پالتوی سرگرد، برفِ تازه آب‌شده. رسیدِ پارکینگ: ورود ۰۲:۳۵.' },
    tea: { n: 'استکانِ چای', d: 'چای داغ از سماورِ اداره. شاید دلِ کسی را نرم کند.' }
});
Object.assign(SPK, { m: { n: 'مهری سلطانی', c: '#7dffc0' }, k: { n: 'گروهبان کاظم فرهی', c: '#d6e08c' }, j: { n: 'سرگرد جمشید نادری', c: '#c9a0ff' } });
var LEVELS = {
    1: { n: 'پرونده‌ی ۱', t: 'برفِ خونی', s: 'کوچه‌ی برفی و ویدئو کلوپ ماه — قتلِ یک عکاس', scene: 'alley', intro: 'intro', clock: 100,
        file: 'پرونده‌ی رضا کاوه', nb: 'دفترچه‌ی پرونده — قتلِ رضا کاوه', clues: CLUE_ORDER },
    2: { n: 'پرونده‌ی ۲', t: 'شیفتِ شب', s: 'اداره‌ی آگاهی، ساعتِ سه بامداد — «آن بالایی» کیست؟', scene: 'station', intro: 'intro2', clock: 190,
        file: 'پرونده‌ی «آن بالایی»', nb: 'دفترچه‌ی پرونده — آن بالایی', clues: ['code', 'locker', 'forgery', 'print', 'joblog', 'roster', 'calllog', 'wet', 'coat'] }
};
var LV = function () { return LEVELS[G.level || 1]; };
function clueCount() { return LV().clues.filter(has).length; }
var strong2 = function () { return has('code') && has('joblog') && has('roster') && (has('calllog') || has('coat') || has('wet')); };
Object.assign(DLG, {
    intro2: [
        ['a', 'اداره‌ی آگاهی. ساعتِ سه و ده دقیقه‌ی بامداد؛ هنوز همان شبِ یلدا.'],
        ['a', 'رستگار در بازداشتگاه فقط یک جمله گفت: «من فقط پیک بودم.» پیکِ چه کسی؟'],
        ['a', 'و حالا کسی در همین ساختمان دارد مدارکِ پرونده‌ی رضا کاوه را غیب می‌کند.'],
        ['a', 'سرگرد نادری، رئیسِ رستگار، امشب «در مأموریت، کرج» است. کلانتری خالی است: من، یک گروهبانِ خواب‌آلود، و خش‌خشِ بی‌سیم.'],
        ['n', 'راهنما: بعضی چیزها را باید از نزدیک دید. تکه‌کاغذها را جلوی نور بگیر، دکمه‌ها را بزن، و چراغ‌قوه (F) را فراموش نکن.']
    ],
    code_found: [
        ['a', 'پشتِ نورِ چراغ، خطِ ماژیک شفاف می‌شود و عددها بیرون می‌زنند: ۳... ۸... ۲... ۶.'],
        { s: 'a', t: 'و ته‌نقشِ کاغذ: «دفترِ سرگرد جمشید نادری». کاغذِ دفترِ خودش.', give: 'code' }
    ],
    terminal: [
        ['a', 'ترمینالِ شماره‌ی ۴. صفحه هنوز گرم است؛ کسی کمتر از یک ساعت پیش پشتش نشسته.'],
        ['a', 'رمزِ ورود می‌خواهد. رمزِ سرگرد را ندارم... و لازم هم نیست؛ چاپگرها حافظه‌ی بهتری از آدم‌ها دارند.']
    ],
    terminal2: [['a', 'ترمینالِ ۴؛ همان‌جا که سندِ ساعتِ ۰۲:۵۲ از آن به چاپگر رفته.']],
    blinds: [
        ['a', 'از لای کرکره: خیابان زیرِ برف، و پارکینگِ اداره.'],
        ['a', 'جای پارکِ سرگرد خالی است، اما ردِ لاستیکِ تازه دارد. کسی کمتر از یک ساعت پیش آمده... و شاید هنوز نرفته.']
    ],
    wet: [['a', 'ردِ کفش روی موزاییک؛ برفِ آب‌شده.'], { s: 'a', t: 'از درِ پله‌ی اضطراری تا دفترِ سرگرد... هنوز خشک نشده. کمتر از یک ساعت.', give: 'wet' }],
    wet2: [['a', 'ردِ خیس دارد کم‌کم خشک می‌شود. زمان به نفعِ من نیست.']],
    backdoor: [
        ['a', 'درِ پله‌ی اضطراری؛ مستقیم به پارکینگ باز می‌شود و از پشتِ میزِ بی‌سیم دیده نمی‌شود.'],
        { if: function () { return !has('wet'); }, s: 'a', t: 'کفِ این‌جا چیزی برق می‌زند؟ باید با چراغ‌قوه نگاه کنم.' }
    ],
    coat: [
        ['a', 'جالباسی. یک پالتوی پشمیِ سرمه‌ای با سردوشیِ سرگردی.'],
        ['a', 'برفِ روی شانه‌هایش تازه آب شده؛ قطره‌ها هنوز می‌چکند.'],
        { s: 'a', t: 'در جیبش رسیدِ پارکینگِ اداره: «ورود ۰۲:۳۵». کسی که امشب در کرج است، پالتویش را این‌جا جا نمی‌گذارد.', give: 'coat' }
    ],
    coat2: [['a', 'پالتوی سرگرد. هنوز خیس.']],
    roster: [
        ['a', 'تابلوی کشیک و شماره‌ی کاربرها.'],
        ['a', 'سرگرد جمشید نادری — کاربرِ ۰۷ — ترمینالِ ۴، دفترِ سرگرد. وضعیتِ امشب: «مأموریت، کرج».'],
        { s: 'a', t: 'گروهبان کاظم فرهی — کاربرِ ۰۳. مهری سلطانی، بی‌سیم — کاربرِ ۰۵.', give: 'roster' }
    ],
    roster2: [['a', '۰۷ نادری، ۰۳ فرهی، ۰۵ سلطانی. عددها دروغ نمی‌گویند؛ آدم‌ها می‌گویند.']],
    samovar: [{ s: 'a', t: 'سماورِ اداره قُل‌قُل می‌کند. یک استکان چای داغ می‌ریزم.', give: 'tea' }],
    samovar2: [['a', 'سماور هنوز قُل‌قُل می‌کند. بوی چای و کاغذِ کهنه؛ بوی همه‌ی اداره‌های این شهر.']],
    clock: [['a', 'ساعتِ دیواری. عقربه‌ها در این ساختمان همیشه کُند راه می‌روند... جز امشب.']],
    map: [['a', 'نقشه‌ی تهران با سنجاق‌های قرمز: جرم‌های امسال.'], ['a', 'یک سنجاقِ تازه پشتِ ویدئو کلوپ ماه. و کسی با خودکار، جاده‌ی کرج را خط زده.']],
    locker: [
        ['a', 'چراغِ سبز. درِ قفس با صدای فلز باز می‌شود.'],
        ['a', 'قفسه‌ی پرونده‌ی ۱۲۴۷، کاوه... خالی است. نه نوار، نه نگاتیو، نه دوربین.'],
        { s: 'a', t: 'فقط برگه‌ی خروجِ مدارک: «ساعت ۰۲:۴۰ — تحویل‌گیرنده: کاظم فرهی». و کفِ قفسه، خاکسترِ سیگارِ برگ.', give: 'locker' },
        ['a', 'گروهبان فرهی سیگار نمی‌کشد. در این ساختمان فقط یک نفر سیگارِ برگ می‌کشد.']
    ],
    locker2: [['a', 'قفسه‌ی خالیِ پرونده‌ی کاوه. کسی عجله داشته، اما نه آن‌قدر که خاکسترش را جمع کند.']],
    // --- Sgt. Kazem Farahi ---
    kaz: [
        ['k', 'خُرررر...'],
        { s: 'a', t: '(گروهبان فرهی سرش روی ماشین‌تحریر است. خوابِ خواب.)', c: [
                { t: '(آرام تکانش بده)', go: 'kaz_wake' },
                { t: '(با مشت بکوب روی میز)', go: 'kaz_bang' }
            ] }
    ],
    kaz_wake: [{ set: 'kazAwake' }, ['k', 'هان؟ ... سپهر؟ ساعت چند است؟'], ['k', 'ببخش. دو شیفت پشتِ سرِ هم است؛ چای هم دیگر اثر ندارد.'], { go: 'kaz_hub' }],
    kaz_bang: [{ set: 'kazAwake' }, ['k', 'یا خدا! ... سپهر! سکته‌ام دادی.'], ['k', 'من خواب نبودم. داشتم... چشم‌هایم را استراحت می‌دادم.'], { go: 'kaz_hub' }],
    kaz_again: [{ set: 'kazAwake' }, ['k', 'هوم؟ باز تویی؟'], { go: 'kaz_hub' }],
    kaz_hub: [
        { s: 'k', t: 'امری داری؟', c: [
                { t: 'امشب کسی به انبارِ مدارک رفته؟', go: 'kaz_locker', if: function () { return !F.kazLocker; } },
                { t: 'رمزِ کمد را چه کسی می‌داند؟', go: 'kaz_code', if: function () { return !F.kazCode; } },
                { t: '(برگه‌ی خروجِ مدارک را نشانش بده)', go: 'kaz_forge', if: function () { return has('locker') && !has('forgery'); } },
                { t: 'سرگرد نادری امشب کجاست؟', go: 'kaz_major', if: function () { return !F.kazMajor; } },
                { t: 'بخواب، گروهبان.' }
            ] }
    ],
    kaz_locker: [{ set: 'kazLocker' }, ['k', 'نه. من از ساعتِ دوازده همین‌جا بودم. کلیدِ اتاق دستِ من است، ولی کمد رمز دارد.'], ['k', 'شاید... شاید یک ساعتی چشمم گرم شد. ولی کسی رد نشد. مطمئنم.'], { go: 'kaz_hub' }],
    kaz_code: [{ set: 'kazCode' }, ['k', 'رمز را فقط من و سرگرد می‌دانیم. سرگرد ماهی یک بار عوضش می‌کند و روی کاغذِ دفترش برایم می‌نویسد.'], ['k', 'من هم کاغذ را پس می‌دهم که خودش پاره کند. قانون است.'], { go: 'kaz_hub' }],
    kaz_forge: [
        ['k', '«کاظم»؟ ساعتِ دو و چهل؟ ...'],
        ['k', 'این خطِ من نیست، سپهر. من «کاظم» را با سرکشِ بلند می‌نویسم؛ این یکی را انگار از رو کشیده‌اند.'],
        { s: 'a', t: '(کسی امضای گروهبان را جعل کرده؛ کسی که هر روز نمونه‌اش را پای گزارش‌ها می‌دید.)', give: 'forgery' },
        { go: 'kaz_hub' }
    ],
    kaz_major: [{ set: 'kazMajor' }, ['k', 'مأموریت. کرج. خودش عصر گفت. مهری هم ساعتِ دو و نیم تماسش را گرفت.'], { go: 'kaz_hub' }],
    // --- Mehri Soltani, radio dispatcher ---
    meh: [
        ['m', 'کارآگاه سپهر. ساعتِ سه صبح، شبِ یلدا، و هنوز این‌جایی. یا عاشقِ کاری، یا خانه‌ای نداری.'],
        { s: 'm', t: 'خب؟', c: [
                { t: 'هر دو. شبِ آرامی است؟', go: 'meh_nice' },
                { t: 'دفترِ بی‌سیم را می‌خواهم. همین حالا.', go: 'meh_rude' }
            ] }
    ],
    meh_nice: [['m', 'آرام؟ بی‌سیم امشب فقط خش‌خش کرده. و یک تماس از سرگرد.'], { go: 'meh_hub' }],
    meh_rude: [{ set: 'mehCold' }, ['m', '«همین حالا»؟ من منشیِ تو نیستم، کارآگاه. دفتر مالِ اداره است؛ برو حکمش را بیاور.']],
    meh_cold: [
        { s: 'm', t: 'باز چه می‌خواهی؟', c: [
                { t: '(استکانِ چای را جلویش بگذار) ببخش. شبِ درازی بوده.', go: 'meh_tea', if: function () { return has('tea'); } },
                { t: 'عذر می‌خواهم. تند رفتم.', go: 'meh_sorry' },
                { t: '(برو)' }
            ] }
    ],
    meh_sorry: [['m', 'عذرخواهیِ خشک و خالی؟ این‌جا چای مجانی است، کارآگاه؛ ادب هم باید باشد.']],
    meh_tea: [{ take: 'tea', fx: function () { G.flags.mehCold = false; G.flags.teaGiven = true; } }, ['m', '...چای؟ ساعتِ سه صبح؟ باشد. بخشیدمت.'], { go: 'meh_hub' }],
    meh_again: [['m', 'باز هم تو.'], { go: 'meh_hub' }],
    meh_hub: [
        { s: 'm', t: 'چه کمکی از دستم برمی‌آید؟', c: [
                { t: 'تماسِ سرگرد را برایم تعریف کن.', go: 'meh_call', if: function () { return !has('calllog'); } },
                { t: 'امشب کسی آمد یا رفت؟', go: 'meh_who', if: function () { return !F.mehWho; } },
                { t: 'ممنون، مهری.' }
            ] }
    ],
    meh_call: [
        ['m', 'ساعتِ دو و نیم. گفت از کرج زنگ می‌زند، جاده بسته است و صبح برمی‌گردد.'],
        ['m', 'صبر کن... دفتر را ببینم. عجیب است. تماس از بی‌سیم نیامده؛ از خطِ داخلی آمده. خطِ ۴.'],
        { s: 'a', t: 'خطِ داخلیِ ۴... تلفنِ دفترِ خودش. سرگرد از «کرج» زنگ نزده؛ از بیست قدم آن‌طرف‌تر زنگ زده.', give: 'calllog' },
        { go: 'meh_hub' }
    ],
    meh_who: [{ set: 'mehWho' }, ['m', 'از جلوی من کسی رد نشد. ولی پله‌ی اضطراری را که نمی‌بینم؛ آن در به پارکینگ باز می‌شود.'], { go: 'meh_hub' }],
    // --- the red phone: accusation ---
    phone2: [
        { if: function () { return clueCount() < 4; }, s: 'a', t: 'خطِ مستقیمِ دادستانی. هنوز چیزی برای گفتن ندارم؛ فقط حدس و بوی سیگار.' },
        { if: function () { return clueCount() >= 4; }, s: 'a', t: 'خطِ مستقیمِ دادستانی. اگر اسمی بگویم، دیگر برنمی‌گردد. «آن بالایی» کیست؟', c: [
                { t: 'سرگرد جمشید نادری', go: 'acc_n' },
                { t: 'گروهبان کاظم فرهی', go: 'end2_k' },
                { t: 'مهری سلطانی', go: 'end2_m' },
                { t: 'هنوز نه.' }
            ] }
    ],
    acc_n: [{ if: strong2, go: 'end2_good' }, { go: 'end2_weak' }],
    end2_good: [
        ['a', '«دادستانی؟ سپهر هستم، از آگاهی. سرگرد جمشید نادری.»'],
        ['a', 'رمزِ کمد را روی کاغذِ دفترِ خودش نوشته بود و پاره کرده بود؛ اما نورِ چراغِ مطالعه، زیرِ ماژیک را نشان داد.'],
        ['a', 'و چاپگر حافظه داشت: ساعتِ ۰۲:۵۲، ترمینالِ ۴، کاربرِ ۰۷.'],
        { if: function () { return has('calllog'); }, s: 'a', t: 'تماسِ «کرج» از خطِ داخلیِ ۴ آمده بود؛ از بیست قدم آن‌طرف‌تر.' },
        { if: function () { return has('coat') || has('wet'); }, s: 'a', t: 'و برف، مثلِ همیشه، شهادت داد: پالتوی خیس و ردِ کفشِ آب‌شده.' },
        ['j', '(از راه‌پله‌ی پشتی، کیفی در دست) سپهر... می‌دانی رستگار چند سال زیرِ دستِ من کار کرد؟'],
        ['a', 'آن‌قدر که بداند «بالایی‌ها» چه کسانی‌اند، جناب سرگرد.'],
        ['a', 'ساعتِ چهارِ صبح، یلدا تمام شد. شب هر قدر هم بلند باشد، بالاخره صبح می‌شود.'],
        { end: 'good2' }
    ],
    end2_weak: [
        ['a', '«دادستانی؟ سرگرد نادری...»'],
        ['a', 'صدای پشتِ خط سرد شد: «یک سرگرد؟ با کدام مدرک، کارآگاه؟»'],
        ['a', 'صبح، سرگرد با لبخند از «کرج» برگشت. پرونده‌ی کاوه به بایگانیِ راکد رفت. من هم.'],
        { end: 'weak2' }
    ],
    end2_k: [
        ['a', '«گروهبان کاظم فرهی را بازداشت کنید.»'],
        ['k', 'سپهر... امضا مالِ من نبود. خودت دیدی.'],
        ['a', 'امضا کافی بود. برای دادگاه، همیشه کافی است.'],
        ['a', 'سرگرد نادری فردایش برای «هوشیاری» تشویق شد. و کمدِ مدارک رمزِ تازه‌ای گرفت.'],
        { end: 'wrongK' }
    ],
    end2_m: [
        ['a', '«مهری سلطانی را بازداشت کنید.»'],
        ['m', 'چای‌ات را هم پس بگیر، کارآگاه.'],
        ['a', 'مدرکی نبود؛ فقط منشی‌ای که زیادی می‌دانست. پرونده بسته شد و بی‌سیم تا صبح خش‌خش کرد.'],
        { end: 'wrongM' }
    ]
});
Object.assign(ENDINGS, {
    good2: { t: 'آن بالایی', s: 'سرگرد نادری بازداشت شد. شبِ یلدا به صبح رسید.', c: '#c9a0ff', good: true },
    weak2: { t: 'درجه‌ها', s: 'حق با تو بود؛ اما درجه‌ها از حقیقت سنگین‌ترند.', c: '#ffbf69' },
    wrongK: { t: 'امضای یک بی‌گناه', s: '«آن بالایی» هنوز آن بالاست.', c: '#d6e08c' },
    wrongM: { t: 'خطِ اشغال', s: '«آن بالایی» هنوز آن بالاست.', c: '#7dffc0' }
});
Object.assign(ACT, {
    trash: function () { return 'mini:paper'; }, printer: function () { return 'mini:printer'; }, keypad: function () { return has('locker') ? 'locker2' : 'mini:keypad'; },
    terminal: function () { return has('joblog') ? 'terminal2' : 'terminal'; }, blinds: function () { return 'blinds'; }, backdoor: function () { return 'backdoor'; }, map: function () { return 'map'; }, clock: function () { return 'clock'; },
    wet: function () { return has('wet') ? 'wet2' : 'wet'; }, coat: function () { return has('coat') ? 'coat2' : 'coat'; }, roster: function () { return has('roster') ? 'roster2' : 'roster'; },
    samovar: function () { return (has('tea') || F.teaGiven) ? 'samovar2' : 'samovar'; },
    kazem: function () { return F.kazMet ? 'kaz_again' : (G.flags.kazMet = true, 'kaz'); },
    mehri: function () { return F.mehCold ? 'meh_cold' : F.mehMet ? 'meh_again' : (G.flags.mehMet = true, 'meh'); },
    redphone: function () { return 'phone2'; }
});
LEVELS[1].goals = [
    { t: 'جسدِ رضا را بررسی کن', id: 'body', sc: 'alley', done: function () { return has('watch'); } },
    { t: 'با چراغ‌قوه ردپاهای کنارِ جسد را پیدا کن', id: 'prints', sc: 'alley', done: function () { return has('snow'); } },
    { t: 'با ستوان رستگار حرف بزن', id: 'bahman', sc: 'alley', done: function () { return F.metB; } },
    { t: 'به پوتین‌های ستوان نگاه کن', id: 'bahman', sc: 'alley', done: function () { return has('boots'); } },
    { t: 'از پیرمردِ کنارِ آتش بپرس چه دیده', id: 'yad', sc: 'alley', done: function () { return has('test'); } },
    { t: 'سطلِ زباله را بگرد', id: 'dump', sc: 'alley', done: function () { return has('neg') || F.negGiven; } },
    { t: 'دوربینِ بالای درِ ویدئو کلوپ را ببین', id: 'cam', sc: 'street', done: function () { return F.sawCam; } },
    { t: 'با لیلا حرف بزن و نوارِ دوربین را ببین', id: 'leila', sc: 'street', done: function () { return has('tape'); } },
    { t: 'تلفنِ عمومی را بررسی کن', id: 'phone', sc: 'street', done: function () { return has('note'); } },
    { t: 'با تلفنِ عمومی، قاتل را معرفی کن', id: 'phone', sc: 'street', done: function () { return false; } }
];
LEVELS[2].goals = [
    { t: 'سطلِ کاغذِ باطله‌ی دفترِ سرگرد را بگرد', id: 'trash', done: function () { return has('code'); } },
    { t: 'با آن کد، قفلِ انبارِ مدارک را باز کن', id: 'keypad', done: function () { return has('locker'); } },
    { t: 'چاپگرِ کنارِ انبار را بررسی کن', id: 'printer', done: function () { return has('print') && has('joblog'); } },
    { t: 'تابلوی کشیک را بخوان', id: 'roster', done: function () { return has('roster'); } },
    { t: 'گروهبان را بیدار کن و برگه‌ی خروج را نشانش بده', id: 'kazem', done: function () { return has('forgery'); } },
    { t: 'از مهری درباره‌ی تماسِ سرگرد بپرس (اگر دلخور است، چای ببر)', id: 'mehri', done: function () { return has('calllog'); } },
    { t: 'پالتوی روی جالباسی را بگرد', id: 'coat', done: function () { return has('coat'); } },
    { t: 'با تلفنِ قرمز، «آن بالایی» را معرفی کن', id: 'redphone', done: function () { return false; } }
];
function deductions2() {
    var out = [];
    if (has('code'))
        out.push('رمزِ کمد را سرگرد روی کاغذِ دفترِ خودش نوشته و پاره کرده.');
    if (has('locker'))
        out.push(has('forgery') ? 'مدارک ساعتِ ۰۲:۴۰ با امضای جعلیِ گروهبان خارج شده.' : 'مدارک ساعتِ ۰۲:۴۰ به اسمِ گروهبان فرهی خارج شده... کارِ خودش است؟');
    if (has('print'))
        out.push('قرار بوده مدارکِ کاوه «گم» شوند: انتقال به بایگانیِ راکد.');
    if (has('joblog') && has('roster'))
        out.push('سندِ ۰۲:۵۲ را کاربرِ ۰۷ از ترمینالِ ۴ چاپ کرده: سرگرد نادری.');
    if (has('calllog'))
        out.push('سرگرد از «کرج» زنگ نزده؛ از خطِ داخلیِ دفترِ خودش زنگ زده.');
    if (has('coat') || has('wet'))
        out.push('کسی کمتر از یک ساعت پیش از پله‌ی پشتی آمده؛ هنوز خیس است.');
    if (strong2())
        out.push('پرونده کامل است. تلفنِ قرمزِ دادستانی روی میزِ بی‌سیم است.');
    else if (clueCount() >= 4)
        out.push('تلفنِ قرمزِ دادستانی روی میزِ بی‌سیم است... اما مدرک کافی است؟');
    return out;
}
// ---------- game state ----------
var G = {
    state: 'title', t: 0, sceneId: 'alley', scene: null, flags: {}, inv: [], revealed: {}, clock: 100, clockAcc: 0,
    toasts: [], notebook: false, fade: 1, fadeDir: -1, fadeCb: null, flashOn: true, fo: { x: 0, y: 0, ang: 0 },
    camX: 0, camXf: 0, wind: 0, hintT: 0, ending: null, endT: 0, near: null, hover: null, buttons: [], flashLit: false
};
var P = { x: 626, f: -1, phase: 0, moving: false, stepAcc: 0, breathT: 1, goal: null };
var SCENES = {};
var M = { x: -1, y: -1, moved: false };
var KEYS = {};
var VP = { x: 0, y: 0, s: 1, w: W, h: H, dpr: 1 }; // viewport of the Wx180 view inside the canvas
function setScene(id, x) {
    G.sceneId = id;
    G.scene = SCENES[id];
    P.x = x;
    P.goal = null;
    G.camXf = G.camX = clamp(Math.round(P.x - W / 2), 0, G.scene.w - W);
    PARTS.length = 0;
    for (var _i = 0, _a = G.scene.lights; _i < _a.length; _i++) {
        var L = _a[_i];
        L._poly = null;
    }
    if (typeof VIEW !== 'undefined')
        updateView(0, true);
}
function transition(id, x) {
    if (G.fadeDir)
        return;
    G.fadeDir = 1;
    sfx.whoosh();
    G.fadeCb = function () { setScene(id, x); };
}
function toast(txt, icon) { G.toasts.push({ txt: txt, icon: icon, t: 0, dur: icon ? 3.6 : 2.6 }); }
function giveClue(k) {
    if (has(k))
        return;
    G.inv.push(k);
    G.idleT = 0;
    G.hintShow = 0;
    if (LV().clues.includes(k)) {
        sfx.clue();
        toast('سرنخِ تازه: ' + CLUES[k].n, k);
    }
    else {
        sfx.inspect();
        toast('برداشتی: ' + CLUES[k].n, k);
    }
}
function takeClue(k) { var i = G.inv.indexOf(k); if (i >= 0) {
    G.inv.splice(i, 1);
    toast((LV().clues.includes(k) ? 'از دست رفت: ' : 'دادی: ') + CLUES[k].n, k);
} }
var reach = function (t) { return (t.w / 2) + 14; };
var visibleTarget = function (t) { return (!t.hidden || G.revealed[t.id]) && (!t.cond || t.cond()); };
// ---------- dialogue engine (typewriter, choices, effects) ----------
var D = { active: false, steps: null, i: 0, cur: null, spk: 'n', full: '', shown: 0, acc: 0, choices: null, sel: 0, rects: [] };
function startDialog(id) { D.active = true; loadSteps(DLG[id]); }
function loadSteps(arr) { D.steps = arr; D.i = 0; runStep(); }
function runStep() {
    var _a;
    for (var guard = 0; guard < 64; guard++) {
        var st = D.steps && D.steps[D.i];
        if (!st) {
            D.active = false;
            D.cur = null;
            return;
        }
        var o = Array.isArray(st) ? { s: st[0], t: st[1] } : st;
        if (o.if && !o.if()) {
            D.i++;
            continue;
        }
        if (o.give)
            giveClue(o.give);
        if (o.take)
            takeClue(o.take);
        if (o.set)
            G.flags[o.set] = true;
        if (o.fx)
            o.fx();
        if (o.end) {
            D.active = false;
            D.cur = null;
            startEnding(o.end);
            return;
        }
        if (o.t || o.c) {
            D.cur = o;
            D.spk = o.s || 'n';
            D.full = o.t || '';
            D.shown = 0;
            D.acc = 0;
            D.sel = 0;
            D.choices = o.c ? o.c.filter(function (c) { return !c.if || c.if(); }) : null;
            if (D.choices && D.choices.some(function (c) { return c.go && /^acc/.test(c.go); })) { // naming the culprit: the names come in a new order every time
                var names = D.choices.filter(function (c) { return c.go; }), rest = D.choices.filter(function (c) { return !c.go; });
                for (var i = names.length - 1; i > 0; i--) {
                    var j = Math.random() * (i + 1) | 0;
                    _a = [names[j], names[i]], names[i] = _a[0], names[j] = _a[1];
                }
                D.choices = names.concat(rest);
            }
            return;
        }
        if (o.go) {
            D.steps = DLG[o.go];
            D.i = 0;
            continue;
        }
        D.i++;
    }
}
function typingDone() { return D.shown >= D.full.length; }
function advance() {
    if (!D.active)
        return;
    if (!typingDone()) {
        D.shown = D.full.length;
        return;
    }
    if (D.choices)
        return;
    D.i++;
    runStep();
}
function choose(k) {
    if (!D.active || !D.choices || !typingDone())
        return;
    var c = D.choices[k];
    if (!c)
        return;
    sfx.choose();
    if (c.fx)
        c.fx();
    if (c.go)
        loadSteps(DLG[c.go]);
    else {
        D.i++;
        runStep();
    }
}
function updateDialog(dt) {
    if (!D.active || typingDone())
        return;
    D.acc += dt;
    for (;;) {
        var ch = D.full[D.shown - 1];
        var delay = ch && '.؟!…،:'.includes(ch) ? 0.2 : 1 / 44;
        if (D.acc < delay || typingDone())
            break;
        D.acc -= delay;
        D.shown++;
        if (D.full[D.shown - 1] !== ' ')
            sfx.click();
    }
}
function startEnding(k) {
    G.state = 'end';
    G.ending = ENDINGS[k];
    G.endT = 0;
    G.notebook = false;
    G.paused = false;
    if (ENDINGS[k].good) {
        PROG.done[G.level] = true;
        saveProg();
    }
    sfx.ending(!!ENDINGS[k].good);
}
function inspect(t) {
    if (D.active || G.fadeDir || G.mini || G.zoom)
        return;
    P.goal = null;
    sfx.inspect();
    var r = ACT[t.id]();
    if (r.startsWith('mini:'))
        openMini(r.slice(5), t);
    else
        startDialog(r);
}
function resetGame(level) {
    G.level = level || 1;
    var L = LV();
    for (var k in MINI_F)
        MINI[k] = MINI_F[k]();
    if (G.mini && G.mini.exit)
        G.mini.exit();
    G.mini = null;
    G.zoom = null;
    G.paused = false;
    G.hintShow = 0;
    G.idleT = 0;
    G.invTip = null;
    G.flags = {};
    G.inv = [];
    G.revealed = {};
    G.clock = L.clock;
    G.clockAcc = 0;
    G.toasts = [];
    G.notebook = false;
    G.flashOn = true;
    G.ending = null;
    D.active = false;
    P.look = 0;
    setScene(L.scene, SCENES[L.scene].spawn);
    P.f = -1;
    G.state = 'play';
    G.hintT = 0;
    G.fade = 1;
    G.fadeDir = -1;
    G.fadeCb = null;
    startDialog(L.intro);
}
function startGame(level) {
    initAudio();
    resetGame(level);
    if (TOUCH.used && document.documentElement.requestFullscreen && !document.fullscreenElement)
        document.documentElement.requestFullscreen().catch(function () { });
}
// ---------- close-up mini-games (drawn in the same 320x180 pixel buffer) ----------
var MINI = {}, MINI_F = {};
var miniOX = function () { return (W - WB) >> 1; }; // close-ups sit in the middle of a wider screen
function lowMouse() { return { x: (M.x - VP.x) / VP.s - miniOX(), y: (M.y - VP.y) / VP.s }; }
function openMini(kind, t) {
    if (G.zoom || G.mini)
        return;
    G.zoom = { t: 0, dur: 0.5, x: t.x - G.camX, y: t.y + t.h / 2, kind: kind };
    sfx.whoosh();
}
function closeMini() { if (!G.mini)
    return; if (G.mini.exit)
    G.mini.exit(); G.mini = null; G.fade = 0.9; G.fadeDir = -1; G.fadeCb = null; sfx.toggle(); }
function miniLight(amb, lights) {
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.fillStyle = "rgb(".concat(amb[0], ",").concat(amb[1], ",").concat(amb[2], ")");
    lctx.fillRect(0, 0, WB, H);
    lctx.globalCompositeOperation = 'lighter';
    for (var _i = 0, lights_1 = lights; _i < lights_1.length; _i++) {
        var L = lights_1[_i];
        softGlow(L[0], L[1], L[2], L[3], L[4]);
    }
    lctx.globalCompositeOperation = 'source-over';
    mictx.globalCompositeOperation = 'multiply';
    mictx.drawImage(lightC, 0, 0);
    mictx.globalCompositeOperation = 'source-over';
}
function miniGlow(x, y, r, c, a) {
    var gr = mictx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(c, a));
    gr.addColorStop(1, rgba(c, 0));
    mictx.globalCompositeOperation = 'lighter';
    mictx.fillStyle = gr;
    mictx.fillRect(x - r, y - r, r * 2, r * 2);
    mictx.globalCompositeOperation = 'source-over';
}
// --- mini-game 1: the torn note, held up to the desk lamp ---
function makePaper(o) {
    return (function () {
        var NW = 96, NH = 64, AX = 22, AY = 44, BX = 250, BY = 64;
        var START = [[122, 108], [168, 66], [26, 112], [96, 42]];
        var QC = [[23, 15], [23, 47], [71, 17], [71, 49]]; // visible centre of each quarter
        var S = { built: false, pieces: [], drag: null, assembled: false, nx: AX, ny: AY, holdT: 0, done: false };
        var desk, vx, hl, hr;
        var pieceOf = function (x, y) { return (x < vx[y] ? 0 : 2) + (y < (x < vx[y] ? hl[x] : hr[x]) ? 0 : 1); };
        function cut(src, fibres) {
            var sd = src.getContext('2d').getImageData(0, 0, NW, NH).data;
            return [0, 1, 2, 3].map(function (i) {
                var _a = mk(NW, NH), c = _a[0], g = _a[1], id = g.createImageData(NW, NH), d = id.data;
                for (var y = 0; y < NH; y++)
                    for (var x = 0; x < NW; x++) {
                        if (pieceOf(x, y) !== i)
                            continue;
                        var k = (y * NW + x) * 4, edge = fibres && (x > 0 && pieceOf(x - 1, y) !== i || x < NW - 1 && pieceOf(x + 1, y) !== i || y > 0 && pieceOf(x, y - 1) !== i || y < NH - 1 && pieceOf(x, y + 1) !== i);
                        if (edge) {
                            d[k] = 251;
                            d[k + 1] = 247;
                            d[k + 2] = 236;
                            d[k + 3] = 255;
                        }
                        else {
                            d[k] = sd[k];
                            d[k + 1] = sd[k + 1];
                            d[k + 2] = sd[k + 2];
                            d[k + 3] = sd[k + 3];
                        }
                    }
                g.putImageData(id, 0, 0);
                return c;
            });
        }
        function build() {
            var r = rng(1224);
            vx = [];
            for (var y = 0; y < NH; y++)
                vx[y] = 46 + Math.round(Math.sin(y * 0.9) * 2 + (r() - 0.5) * 3);
            hl = [];
            hr = [];
            for (var x = 0; x < NW; x++) {
                hl[x] = 30 + Math.round(Math.sin(x * 1.3) * 1.5 + (r() - 0.5) * 3);
                hr[x] = 34 + Math.round(Math.cos(x * 1.1) * 1.5 + (r() - 0.5) * 3);
            }
            var _a = mk(NW, NH), face = _a[0], fg = _a[1];
            R(fg, 0, 0, NW, NH, '#e6dcc2');
            for (var i = 0; i < 320; i++)
                R(fg, r() * NW, r() * NH, 1, 1, r() < 0.5 ? '#d6ccb0' : '#f0e8d2');
            for (var y = 12; y < NH; y += 8)
                R(fg, 3, y, NW - 6, 1, '#cfcad8');
            fg.strokeStyle = 'rgba(120,80,40,0.25)';
            fg.beginPath();
            fg.arc(20, 50, 9, 0, 6.28);
            fg.stroke();
            var t;
            for (var _i = 0, _b = o.lines; _i < _b.length; _i++) {
                var __entry7 = _b[_i];
                var txt = __entry7[0], yy = __entry7[1], al = __entry7[2];
                t = pixText(txt, 8, '#26306a', 'normal');
                fg.drawImage(t, al === 'l' ? 8 : NW - 4 - t.width, yy);
            }
            var _c = mk(NW, NH), scr = _c[0], sg = _c[1];
            for (var y = 18; y < 34; y++) {
                var a = 20 + Math.round(r() * 5), b = 76 - Math.round(r() * 5);
                R(sg, a, y, b - a, 1, y % 3 ? '#121214' : '#1e1e24');
            }
            var _d = mk(NW, NH), hid = _d[0], hg = _d[1];
            t = pixText(o.hid, 14, '#2c1a0c');
            hg.drawImage(t, (NW - t.width) / 2, 12);
            hg.globalAlpha = 0.55;
            t = pixText(o.water, 7, '#8a6a40', 'normal');
            hg.drawImage(t, (NW - t.width) / 2, 50);
            hg.strokeStyle = 'rgba(140,110,70,0.5)';
            hg.beginPath();
            hg.arc(NW / 2, 36, 8, 0, 6.28);
            hg.stroke();
            hg.beginPath();
            hg.arc(NW / 2, 36, 5, 0, 6.28);
            hg.stroke();
            hg.globalAlpha = 1;
            var _e = mk(NW, NH), msk = _e[0], mg = _e[1];
            R(mg, 0, 0, NW, NH, '#fff0c0');
            var F_ = cut(face, true), SC = cut(scr), HI = cut(hid), MK = cut(msk);
            S.pieces = [0, 1, 2, 3].map(function (i) {
                var inside = new Uint8Array(NW * NH);
                for (var y = 0; y < NH; y++)
                    for (var x = 0; x < NW; x++)
                        inside[y * NW + x] = pieceOf(x, y) === i ? 1 : 0;
                return { i: i, face: F_[i], scr: SC[i], hid: HI[i], mask: MK[i], inside: inside, x: START[i][0], y: START[i][1], snapped: false };
            });
            desk = mk(WB, H)[0];
            var dg = desk.getContext('2d');
            for (var y = 0; y < H; y += 12) {
                R(dg, 0, y, WB, 12, y % 24 ? '#3e2918' : '#452e1b');
                R(dg, 0, y, WB, 1, '#2a1a0e');
            }
            for (var i = 0; i < 260; i++)
                R(dg, r() * WB, r() * H, 6 + r() * 30, 1, 'rgba(30,18,8,0.35)');
            R(dg, 8, 26, 176, 138, '#3a2a1a');
            R(dg, 11, 29, 170, 132, '#1f3a2a');
            for (var i = 0; i < 200; i++)
                R(dg, 11 + r() * 170, 29 + r() * 132, 1, 1, '#24422f');
            R(dg, 196, 140, 40, 3, '#1a1a22');
            R(dg, 230, 140, 6, 3, '#c8a040');
            R(dg, 200, 22, 20, 14, '#6a6a70');
            R(dg, 204, 20, 10, 3, '#5a3a20');
            R(dg, 214, 20, 2, 2, '#aa5a2a');
            R(dg, 244, 150, 16, 6, '#b08a3a');
            R(dg, 236, 156, 32, 6, '#8a6a2a');
            R(dg, 250, 70, 4, 80, '#b08a3a');
            R(dg, 251, 70, 1, 80, '#e0c070');
            for (var y = 40; y < 58; y++) {
                var w = 20 + (y - 40) * 1.5;
                R(dg, BX - w, y, w * 2, 1, y < 43 ? '#3aa06a' : '#1d6a44');
            }
            S.built = true;
        }
        function backlight(p) {
            var cx = (S.assembled ? S.nx + NW / 2 : p.x + QC[p.i][0]), cy = (S.assembled ? S.ny + NH / 2 : p.y + QC[p.i][1]);
            return clamp(1 - (Math.hypot(cx - BX, cy - BY) - 14) / 56, 0, 1);
        }
        function hit(mx, my) {
            for (var k = S.pieces.length - 1; k >= 0; k--) {
                var p = S.pieces[k], x = Math.floor(mx - (S.assembled ? S.nx : p.x)), y = Math.floor(my - (S.assembled ? S.ny : p.y));
                if (x >= 0 && y >= 0 && x < NW && y < NH && p.inside[y * NW + x])
                    return p;
            }
            return null;
        }
        return {
            title: o.title,
            enter: function () {
                if (!S.built)
                    build();
                if (has(o.clue) && !S.assembled) {
                    S.assembled = true;
                    S.pieces.forEach(function (p) { return p.snapped = true; });
                    S.nx = AX;
                    S.ny = AY;
                    S.done = true;
                }
            },
            hint: function () {
                if (!S.assembled)
                    return 'تکه‌های کاغذ را بکشید و کنارِ هم بچینید؛ هر تکه در جای درستش می‌چسبد.';
                if (!S.done)
                    return 'حالا کاغذ را جلوی نورِ چراغ بگیرید.';
                return 'کدِ پنهان: ' + o.codeFa + ' — برای بازگشت، دکمه‌ی بازگشت.';
            },
            down: function (m) {
                var p = hit(m.x, m.y);
                if (!p)
                    return;
                S.drag = { p: p, ox: m.x - (S.assembled ? S.nx : p.x), oy: m.y - (S.assembled ? S.ny : p.y) };
                S.pieces.splice(S.pieces.indexOf(p), 1);
                S.pieces.push(p);
                sfx.paper();
            },
            move: function (m) {
                var d = S.drag;
                if (!d)
                    return;
                if (S.assembled) {
                    S.nx = clamp(m.x - d.ox, -40, WB - 40);
                    S.ny = clamp(m.y - d.oy, -20, H - 30);
                    return;
                }
                if (d.p.snapped)
                    return;
                d.p.x = clamp(m.x - d.ox, -60, WB - 30);
                d.p.y = clamp(m.y - d.oy, -40, H - 20);
            },
            up: function () {
                var d = S.drag;
                S.drag = null;
                if (!d || S.assembled)
                    return;
                var p = d.p;
                if (!p.snapped && Math.abs(p.x - AX) < 7 && Math.abs(p.y - AY) < 7) {
                    p.x = AX;
                    p.y = AY;
                    p.snapped = true;
                    sfx.beep(660);
                }
                if (S.pieces.every(function (q) { return q.snapped; })) {
                    S.assembled = true;
                    S.nx = AX;
                    S.ny = AY;
                    sfx.okChime();
                    toast('کاغذ کامل شد. حالا جلوی نور...');
                }
            },
            update: function (dt) {
                if (!S.assembled || S.done || D.active)
                    return;
                if (backlight(S.pieces[0]) > 0.78) {
                    S.holdT += dt;
                    if (S.holdT > 0.7) {
                        S.done = true;
                        S.drag = null;
                        sfx.reveal();
                        startDialog(o.done);
                    }
                }
                else
                    S.holdT = Math.max(0, S.holdT - dt);
            },
            render: function (g) {
                g.drawImage(desk, 0, 0);
                var pos = function (p) { return S.assembled ? [Math.round(S.nx), Math.round(S.ny)] : [Math.round(p.x), Math.round(p.y)]; };
                for (var _i = 0, _a = S.pieces; _i < _a.length; _i++) {
                    var p = _a[_i];
                    var _b = pos(p), x = _b[0], y = _b[1];
                    g.globalAlpha = 0.35;
                    g.drawImage(p.mask, x + 2, y + 3);
                    g.globalAlpha = 1;
                    g.drawImage(p.face, x, y);
                    g.drawImage(p.scr, x, y);
                }
                miniLight([46, 38, 34], [[BX, BY + 20, 230, [255, 214, 150], 0.95], [BX, BY, 50, [255, 235, 190], 0.8]]);
                g.fillStyle = '#fff6d8';
                g.beginPath();
                g.arc(BX, BY - 2, 6, 0, 6.28);
                g.fill();
                R(g, BX - 3, BY - 4, 3, 2, '#ffffff');
                for (var _c = 0, _d = S.pieces; _c < _d.length; _c++) { // light shining through the paper
                    var p = _d[_c];
                    var b = backlight(p);
                    if (b < 0.02)
                        continue;
                    var _e = pos(p), x = _e[0], y = _e[1];
                    g.globalAlpha = b * 0.92;
                    g.drawImage(p.mask, x, y);
                    g.globalAlpha = 0.28 + 0.2 * (1 - b);
                    g.drawImage(p.face, x, y);
                    g.globalAlpha = 1 - 0.78 * b;
                    g.drawImage(p.scr, x, y);
                    g.globalAlpha = b;
                    g.drawImage(p.hid, x, y);
                    g.globalAlpha = 1;
                }
                if (!S.assembled) {
                    g.strokeStyle = 'rgba(255,230,180,0.18)';
                    g.lineWidth = 1;
                    g.setLineDash([2, 2]);
                    g.strokeRect(AX + 0.5, AY + 0.5, NW - 1, NH - 1);
                    g.setLineDash([]);
                }
                miniGlow(BX, BY, 60, [255, 220, 150], 0.35);
            }
        };
    })();
}
MINI_F.paper = function () { return makePaper({ title: 'نمای نزدیک: تکه‌کاغذهای سطلِ باطله', clue: 'code', done: 'code_found', codeFa: '۳۸۲۶',
    lines: [['کاظم، رمزِ این ماه:', 1, 'r'], ['حفظ کن و پاره کن.', 38, 'r'], ['— ن.', 48, 'l']], hid: '۳۸۲۶', water: 'دفترِ سرگرد جمشید نادری' }); };
Object.assign(sfx, {
    beep: function (f) { if (!audioOK())
        return; tone(A.ctx.currentTime, f || 880, 0.07, 'square', 0.035); },
    buzz: function () { if (!audioOK())
        return; var t = A.ctx.currentTime; tone(t, 110, 0.4, 'sawtooth', 0.06); tone(t, 116, 0.4, 'sawtooth', 0.05); },
    okChime: function () { if (!audioOK())
        return; var t = A.ctx.currentTime; [880, 1175, 1760].forEach(function (f, i) { return tone(t + i * 0.08, f, 0.25, 'triangle', 0.05, A.fx); }); },
    paper: function () { if (!audioOK())
        return; var t = A.ctx.currentTime; noiseHit(t, 0.14, 'bandpass', 3200 + Math.random() * 1500, 0.7, 0.07); noiseHit(t + 0.05, 0.1, 'highpass', 5000, 0.5, 0.04); },
    clunk: function () { if (!audioOK())
        return; var t = A.ctx.currentTime; tone(t, 150, 0.14, 'square', 0.05, null, 60); noiseHit(t, 0.08, 'lowpass', 900, 0.7, 0.12); noiseHit(t + 0.12, 0.3, 'bandpass', 700, 6, 0.05); },
    rip: function () { if (!audioOK())
        return; var t = A.ctx.currentTime; for (var i = 0; i < 9; i++)
        noiseHit(t + i * 0.035, 0.05, 'bandpass', 2000 + i * 300, 1.2, 0.08); },
    dotmatrix: function (d) { if (!audioOK())
        return; var t = A.ctx.currentTime; for (var i = 0; i < d * 26; i++) {
        noiseHit(t + i / 26, 0.025, 'bandpass', 2300 + (i % 3) * 400, 2, 0.05);
        if (i % 2)
            tone(t + i / 26, 1400, 0.02, 'square', 0.012);
    } },
    stepIn: function () { if (!audioOK())
        return; var t = A.ctx.currentTime; noiseHit(t, 0.05, 'highpass', 1400, 0.7, 0.08); tone(t, 170 + Math.random() * 30, 0.06, 'triangle', 0.07, null, 80); }
});
function ltrText(txt, x, y, color, font) { ctx.font = font; ctx.direction = 'ltr'; ctx.textAlign = 'center'; ctx.fillStyle = color; ctx.fillText(txt, x, y); }
// --- mini-game 2: the evidence-cage keypad ---
function makeKeypad(o) {
    return (function () {
        var KX = [118, 148, 178], KY = [66, 90, 114, 138], KW = 24, KH = 18, LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
        var S = { entry: '', st: 'idle', stT: 0, fails: 0, pressed: -1, pT: 0, checkT: 0, bg: null };
        function build() {
            var _a = mk(WB, H), c = _a[0], g = _a[1], r = rng(538);
            R(g, 0, 0, WB, H, '#1a1c22');
            for (var y = 0; y < H; y++)
                for (var x = 0; x < WB; x++)
                    if ((x + y) % 6 === 0 || (x - y + 600) % 6 === 0)
                        R(g, x, y, 1, 1, '#4a5058');
            R(g, 96, 14, 128, 160, '#23252a');
            R(g, 100, 18, 120, 152, '#6e737a');
            for (var x = 100; x < 220; x++)
                R(g, x, 18, 1, 152, "rgba(255,255,255,".concat((r() * 0.07).toFixed(3), ")"));
            for (var _i = 0, _b = [[104, 22], [212, 22], [104, 162], [212, 162]]; _i < _b.length; _i++) {
                var __entry8 = _b[_i];
                var x = __entry8[0], y = __entry8[1];
                R(g, x, y, 4, 4, '#44484e');
                R(g, x + 1, y + 1, 2, 1, '#9aa0a8');
            }
            R(g, 116, 30, 88, 22, '#2a2c30');
            for (var i = 0; i < 12; i++) {
                var x = KX[i % 3], y = KY[i / 3 | 0];
                R(g, x, y + 2, KW, KH, '#2a2c30');
                R(g, x, y, KW, KH, '#9aa0a8');
                R(g, x, y, KW, 1, '#c8ccd2');
                R(g, x + KW - 1, y, 1, KH, '#7a8088');
            }
            R(g, 150, 162, 20, 2, '#44484e');
            S.bg = c;
        }
        var keyAt = function (m) { for (var i = 0; i < 12; i++) {
            var x = KX[i % 3], y = KY[i / 3 | 0];
            if (m.x >= x && m.x < x + KW && m.y >= y && m.y < y + KH)
                return i;
        } return -1; };
        function check() {
            S.checkT = 0;
            if (S.entry === o.code) {
                S.st = 'ok';
                S.stT = 0;
                sfx.okChime();
            }
            else {
                S.st = 'err';
                S.stT = 0;
                S.fails++;
                S.entry = '';
                sfx.buzz();
                if (S.fails === 2 && o.hintIf())
                    toast(o.hint);
            }
        }
        function press(label, i) {
            if (S.st === 'ok' || S.st === 'done' || D.active)
                return;
            S.pressed = i;
            S.pT = 0.12;
            if (label === '*') {
                S.entry = '';
                sfx.beep(520);
                return;
            }
            if (label === '#') {
                if (S.entry.length)
                    check();
                return;
            }
            if (S.entry.length >= 4)
                return;
            S.entry += label;
            sfx.beep(740 + (+label) * 30);
            if (S.entry.length === 4)
                S.checkT = 0.3;
        }
        return {
            title: o.title,
            enter: function () { if (!S.bg)
                build(); S.entry = ''; S.st = 'idle'; },
            hint: function () { return S.st === 'ok' || S.st === 'done' ? 'قفل باز شد.' : 'رمزِ چهار رقمی را بزنید: کلیک روی دکمه‌ها یا کلیدهای عددی. ✱ پاک می‌کند، # تأیید.'; },
            down: function (m) { var i = keyAt(m); if (i >= 0)
                press(LABELS[i], i); },
            key: function (code) {
                var d = /^(Digit|Numpad)(\d)$/.exec(code);
                if (d) {
                    press(d[2], LABELS.indexOf(d[2]));
                    return true;
                }
                if (code === 'Backspace') {
                    S.entry = S.entry.slice(0, -1);
                    sfx.beep(520);
                    return true;
                }
                if (code === 'Enter' || code === 'NumpadEnter') {
                    if (S.entry.length)
                        check();
                    return true;
                }
                return false;
            },
            update: function (dt) {
                S.pT -= dt;
                S.stT += dt;
                if (S.checkT > 0) {
                    S.checkT -= dt;
                    if (S.checkT <= 0)
                        check();
                }
                if (S.st === 'err' && S.stT > 0.7)
                    S.st = 'idle';
                if (S.st === 'ok' && S.stT > 1.0) {
                    S.st = 'done';
                    closeMini();
                    startDialog(o.ok);
                }
            },
            render: function (g) {
                g.drawImage(S.bg, 0, 0);
                if (S.pT > 0 && S.pressed >= 0) {
                    var x = KX[S.pressed % 3], y = KY[S.pressed / 3 | 0];
                    R(g, x, y, KW, KH + 2, '#2a2c30');
                    R(g, x, y + 2, KW, KH, '#80868e');
                }
                var m = lowMouse();
                miniLight([60, 62, 72], [[m.x, m.y, 95, [255, 236, 200], 0.8], [160, -30, 210, [255, 60, 70], 0.35]]);
                R(g, 118, 32, 84, 18, S.st === 'err' ? '#3a1010' : (S.st === 'ok' || S.st === 'done') ? '#10301a' : '#0f2418');
                var red = S.st === 'err' || (S.st === 'idle' && (G.t % 1.2) < 0.15), green = S.st === 'ok' || S.st === 'done';
                R(g, 188, 56, 4, 4, red ? '#ff3040' : '#4a1418');
                R(g, 198, 56, 4, 4, green ? '#40ff70' : '#143a1c');
                if (red)
                    miniGlow(190, 58, 10, [255, 40, 60], 0.5);
                if (green)
                    miniGlow(200, 58, 12, [60, 255, 110], 0.6);
                miniGlow(160, 41, 50, [60, 255, 120], 0.08);
            },
            ui: function (u, X, Y) {
                var lcd = S.st === 'err' ? 'رمز اشتباه' : (S.st === 'ok' || S.st === 'done') ? 'باز شد' : null;
                if (lcd)
                    rtl(lcd, X + 160 * u, Y + 41 * u, S.st === 'err' ? '#ff8080' : '#90ffb0', fnt(u * 6, 'bold'), 'center');
                else
                    ltrText(toFa(S.entry.padEnd(4, '_')).split('').join(' '), X + 160 * u, Y + 41.5 * u, '#8dffab', fnt(u * 8, 'bold'));
                for (var i = 0; i < 12; i++) {
                    var x = KX[i % 3], y = KY[i / 3 | 0], dn = S.pT > 0 && S.pressed === i ? 2 : 0, L = LABELS[i];
                    ltrText(L === '*' ? '✱' : L === '#' ? '#' : toFa(L), X + (x + KW / 2) * u, Y + (y + KH / 2 + dn + 0.5) * u, '#1e2024', fnt(u * 7, 'bold'));
                }
            }
        };
    })();
}
MINI_F.keypad = function () { return makeKeypad({ code: '3826', title: 'نمای نزدیک: قفلِ انبارِ مدارک', ok: 'locker', hint: 'رمز چهار رقمی است. گروهبان گفته بود سرگرد رمز را روی کاغذ می‌نویسد...', hintIf: function () { return !has('code'); } }); };
// --- mini-game 3: the jammed printer, seen first-person ---
MINI_F.printer = function () { return (function () {
    var ITEMS = ['وضعیت', 'گزارشِ کارها', 'چاپِ آزمایشی'], BTN = [[178, 132, 12, 9], [194, 132, 12, 9], [210, 132, 12, 9]];
    var LOG = ['۰۲:۵۲ — ترمینالِ ۴ — کاربرِ ۰۷', '۲۲:۱۵ — ترمینالِ ۲ — کاربرِ ۰۳'];
    var S = { bg: null, open: 0, target: 0, jam: true, pull: 0, drag: null, menu: 0, mode: 'menu', logI: 0, print: -1, doc: false };
    var ox = 0, oy = 0;
    function build() {
        var _a = mk(WB, H), c = _a[0], g = _a[1];
        R(g, 0, 0, WB, 128, '#1c1e24');
        for (var x = 0; x < WB; x += 24)
            R(g, x, 0, 1, 128, '#16181d');
        for (var y = 0; y < 70; y++)
            for (var x = 0; x < 64; x++)
                if ((x + y) % 6 === 0 || (x - y + 300) % 6 === 0)
                    R(g, x, y, 1, 1, '#3a3f46');
        R(g, 280, 88, 10, 14, '#d8d2c0');
        R(g, 283, 92, 1, 3, '#2a2a2a');
        R(g, 286, 92, 1, 3, '#2a2a2a');
        for (var i = 0; i < 36; i++)
            R(g, 250 + i, 102 + Math.round(Math.sin(i * 0.2) * 3), 1, 2, '#141416');
        for (var y = 128; y < H; y++) {
            var k = (y - 128) / 52;
            R(g, lerp(20, -30, k), y, lerp(280, 380, k), 1, shade('#4a4038', 0.8 + k * 0.3));
        }
        for (var i = 0; i < 6; i++)
            R(g, 112 + i, 30 + i * 4, 96 - i * 2, 30 - i * 4, i % 2 ? '#e8e4d8' : '#f4f0e6');
        for (var y = 58; y < 76; y++) {
            var k = (y - 58) / 18;
            R(g, lerp(92, 70, k), y, lerp(136, 180, k), 1, shade('#d8d2c0', 0.92 + k * 0.1));
        }
        R(g, 118, 60, 84, 3, '#3a362e');
        for (var y = 76; y < 150; y++)
            R(g, 70, y, 180, 1, shade('#c4bea9', 1 - (y - 76) / 74 * 0.2));
        R(g, 70, 76, 180, 1, '#e8e2d0');
        R(g, 70, 76, 1, 74, '#a8a290');
        R(g, 249, 76, 1, 74, '#9a9482');
        R(g, 88, 80, 144, 4, '#26241e');
        R(g, 66, 150, 188, 3, '#1e1a16');
        R(g, 80, 128, 162, 18, '#aaa48e');
        R(g, 86, 130, 84, 14, '#2a2a22');
        for (var _i = 0, BTN_1 = BTN; _i < BTN_1.length; _i++) {
            var __entry9 = BTN_1[_i];
            var x = __entry9[0], y = __entry9[1], w = __entry9[2], h = __entry9[3];
            R(g, x, y + 1, w, h, '#4a463c');
            R(g, x, y, w, h, '#7a7666');
            R(g, x, y, w, 1, '#a09c8a');
        }
        R(g, 181, 136, 1, 1, '#1e1e1e');
        R(g, 182, 135, 1, 3, '#1e1e1e');
        R(g, 183, 134, 1, 5, '#1e1e1e');
        R(g, 199, 135, 3, 3, '#1e1e1e');
        R(g, 217, 136, 1, 1, '#1e1e1e');
        R(g, 216, 135, 1, 3, '#1e1e1e');
        R(g, 215, 134, 1, 5, '#1e1e1e');
        S.bg = c;
        S.brand = pixText('پارس‌چاپ ۲۴', 7, '#6a6452');
    }
    var paperBox = function () { var sc = 1 + S.pull / 90, w = 58 * sc, h = 18 * sc, cx = 160, cy = 110 + S.pull * 0.9; return { x: cx - w / 2, y: cy - h / 2, w: w, h: h }; };
    var inB = function (m, b) { return m.x >= b[0] && m.x < b[0] + b[2] && m.y >= b[1] && m.y < b[1] + b[3]; };
    function pressBtn(i) {
        sfx.beep(i === 1 ? 990 : 700);
        if (i !== 1) {
            if (S.mode !== 'menu')
                S.mode = 'menu';
            else
                S.menu = (S.menu + (i === 0 ? 2 : 1)) % 3;
            return;
        }
        if (S.mode === 'log') {
            S.logI = (S.logI + 1) % LOG.length;
            return;
        }
        if (S.mode !== 'menu') {
            S.mode = 'menu';
            return;
        }
        if (S.menu === 0)
            S.mode = 'status';
        else if (S.jam || S.print >= 0) {
            S.mode = 'err';
            sfx.buzz();
        }
        else if (S.menu === 1) {
            S.mode = 'log';
            S.logI = 0;
            giveClue('joblog');
        }
        else {
            S.mode = 'print';
            S.print = 0;
            sfx.dotmatrix(1.6);
        }
    }
    return {
        title: 'نمای اول‌شخص: چاپگرِ انبارِ مدارک',
        get jam() { return S.jam; },
        enter: function () { if (!S.bg)
            build(); },
        hint: function () {
            if (S.doc)
                return 'برای کنار گذاشتنِ سند کلیک کنید.';
            if (S.jam && S.open < 0.9)
                return 'چراغِ خطا چشمک می‌زند. درِ جلوی چاپگر را باز کنید (کلیک).';
            if (S.jam)
                return 'کاغذِ مچاله را بگیرید و به سمتِ خودتان بکشید.';
            return 'با دکمه‌های ◄ ● ► در منوی چاپگر بگردید.';
        },
        down: function (m) {
            if (S.doc) {
                S.doc = false;
                startDialog('print_found');
                return;
            }
            var mm = { x: m.x - ox, y: m.y - oy };
            for (var i = 0; i < 3; i++)
                if (inB(mm, BTN[i])) {
                    pressBtn(i);
                    return;
                }
            if (S.open < 0.9 && mm.x >= 88 && mm.x < 232 && mm.y >= 86 && mm.y < 127) {
                S.target = 1;
                sfx.clunk();
                return;
            }
            if (S.jam && S.open >= 0.9) {
                var b = paperBox();
                if (mm.x >= b.x && mm.x < b.x + b.w && mm.y >= b.y && mm.y < b.y + b.h) {
                    S.drag = { y0: mm.y - S.pull };
                    sfx.paper();
                }
            }
        },
        move: function (m) { if (S.drag)
            S.pull = clamp(m.y - oy - S.drag.y0, 0, 40); },
        up: function () {
            if (!S.drag)
                return;
            S.drag = null;
            if (S.pull > 26) {
                S.jam = false;
                S.pull = 0;
                S.doc = true;
                sfx.rip();
                giveClue('print');
                if (S.mode === 'err')
                    S.mode = 'menu';
            }
            else
                S.pull = 0;
        },
        update: function (dt) {
            S.open = lerp(S.open, S.target, 1 - Math.exp(-dt * 7));
            if (S.print >= 0) {
                S.print += dt;
                if (S.print > 2.6) {
                    S.print = -1;
                    S.mode = 'menu';
                }
            }
            ox = Math.round(Math.sin(G.t * 0.7) * 1.4);
            oy = Math.round(Math.sin(G.t * 1.1 + 1) * 1);
        },
        render: function (g) {
            var m = lowMouse();
            g.setTransform(1, 0, 0, 1, ox, oy);
            g.drawImage(S.bg, 0, 0);
            if (S.print >= 0) {
                var h = Math.min(1, S.print / 1.6) * 46;
                R(g, 104, 80 - h, 112, h, '#f2eee4');
                for (var y = 80 - h + 4; y < 78; y += 4)
                    R(g, 110, y, 60 + (y * 7 % 36), 1, '#5a5a5a');
            }
            var k = S.open;
            if (k > 0.02) {
                R(g, 88, 88, 144, 38, '#141418');
                R(g, 96, 100, 128, 10, '#0c0c0e');
                R(g, 96, 102, 128, 1, '#4a4a52');
                R(g, 124, 91, 22, 8, '#5a5a60');
                R(g, 124, 97, 22, 2, '#1e1e1e');
                if (S.jam) {
                    var b = paperBox();
                    g.fillStyle = '#f0ece2';
                    g.beginPath();
                    g.moveTo(b.x, b.y + b.h * 0.3);
                    g.lineTo(b.x + b.w * 0.2, b.y);
                    g.lineTo(b.x + b.w * 0.45, b.y + b.h * 0.2);
                    g.lineTo(b.x + b.w * 0.7, b.y - 2);
                    g.lineTo(b.x + b.w, b.y + b.h * 0.25);
                    g.lineTo(b.x + b.w * 0.92, b.y + b.h);
                    g.lineTo(b.x + b.w * 0.55, b.y + b.h * 0.8);
                    g.lineTo(b.x + b.w * 0.3, b.y + b.h);
                    g.lineTo(b.x + b.w * 0.05, b.y + b.h * 0.85);
                    g.closePath();
                    g.fill();
                    g.strokeStyle = '#b8b4a8';
                    g.lineWidth = 1;
                    g.beginPath();
                    g.moveTo(b.x + b.w * 0.2, b.y + 1);
                    g.lineTo(b.x + b.w * 0.32, b.y + b.h - 1);
                    g.moveTo(b.x + b.w * 0.7, b.y);
                    g.lineTo(b.x + b.w * 0.6, b.y + b.h * 0.8);
                    g.stroke();
                    for (var i = 0; i < 4; i++)
                        R(g, b.x + 6, b.y + 4 + i * 3, b.w * 0.5 - i * 4, 1, '#6a6a6a');
                    R(g, b.x + b.w * 0.62, b.y + b.h * 0.45, 8, 5, '#c04040');
                }
            }
            if (k < 0.5) {
                var bot = lerp(126, 88, k * 2);
                R(g, 88, 88, 144, bot - 88, shade('#cec8b4', 1 - k * 0.5));
                if (k < 0.08) {
                    R(g, 152, 123, 16, 2, '#5a5446');
                    g.drawImage(S.brand, 94, 90);
                }
            }
            else {
                var top = lerp(88, 48, (k - 0.5) * 2), ext = (k - 0.5) * 16;
                R(g, 88 - ext, top, 144 + ext * 2, 88 - top, '#8a8474');
                R(g, 88 - ext, top, 144 + ext * 2, 1, '#aaa494');
            }
            // first-person hand holding the flashlight
            var hx = 262 + (m.x - 160) * 0.08, hy = 162 + (m.y - 90) * 0.06, ang = Math.atan2(m.y - hy, m.x - hx);
            g.setTransform(1, 0, 0, 1, 0, 0);
            miniLight([26, 26, 34], [[m.x, m.y, 72, [255, 236, 200], 1], [m.x, m.y, 150, [255, 236, 200], 0.3], [160, -20, 220, [255, 60, 70], 0.17], [128, 137, 40, [80, 255, 120], 0.35]]);
            g.fillStyle = '#3b3226';
            g.beginPath();
            g.moveTo(WB + 10, H + 10);
            g.lineTo(WB + 10, hy + 18);
            g.lineTo(hx + 6, hy - 4);
            g.lineTo(hx + 12, hy + 10);
            g.lineTo(WB - 20, H + 10);
            g.closePath();
            g.fill();
            g.strokeStyle = '#5a4a36';
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(hx + 6, hy - 4);
            g.lineTo(WB + 10, hy + 18);
            g.stroke();
            R(g, hx - 1, hy - 3, 9, 8, '#6e5442');
            R(g, hx - 1, hy - 3, 9, 1, '#9a7a60');
            g.strokeStyle = '#2a2a30';
            g.lineWidth = 5;
            g.beginPath();
            g.moveTo(hx + 3, hy + 1);
            g.lineTo(hx + 3 + Math.cos(ang) * 16, hy + 1 + Math.sin(ang) * 16);
            g.stroke();
            g.strokeStyle = '#55555e';
            g.lineWidth = 1;
            g.beginPath();
            g.moveTo(hx + 3, hy - 1);
            g.lineTo(hx + 3 + Math.cos(ang) * 16, hy - 1 + Math.sin(ang) * 16);
            g.stroke();
            g.setTransform(1, 0, 0, 1, ox, oy);
            R(g, 86, 130, 84, 14, S.mode === 'err' ? '#3a1a10' : '#1c3a1c');
            R(g, 228, 133, 3, 3, '#40ff70');
            R(g, 234, 133, 3, 3, S.jam ? '#ffb030' : '#3a2a10');
            var err = S.jam && (G.t % 0.8) < 0.4;
            R(g, 240, 133, 3, 3, err ? '#ff3040' : '#3a1014');
            if (err)
                miniGlow(241, 134, 12, [255, 40, 50], 0.5);
            miniGlow(128, 137, 45, [80, 255, 120], 0.12);
            g.setTransform(1, 0, 0, 1, 0, 0);
            var lx = hx + 3 + Math.cos(ang) * 16, ly = hy + 1 + Math.sin(ang) * 16;
            var gr = g.createLinearGradient(lx, ly, m.x, m.y);
            gr.addColorStop(0, 'rgba(255,236,200,0.16)');
            gr.addColorStop(1, 'rgba(255,236,200,0)');
            g.globalCompositeOperation = 'lighter';
            g.fillStyle = gr;
            g.beginPath();
            g.moveTo(lx, ly);
            g.lineTo(m.x - Math.sin(ang) * 26, m.y + Math.cos(ang) * 26);
            g.lineTo(m.x + Math.sin(ang) * 26, m.y - Math.cos(ang) * 26);
            g.closePath();
            g.fill();
            g.globalCompositeOperation = 'source-over';
            R(g, Math.round(lx), Math.round(ly), 2, 2, '#fff6d8');
        },
        ui: function (u, X, Y, VW, VH) {
            var txt = S.mode === 'menu' ? '◄  ' + ITEMS[S.menu] + '  ►' : S.mode === 'status' ? (S.jam ? 'خطا: کاغذ گیر کرده' : 'آماده به کار')
                : S.mode === 'log' ? LOG[S.logI] : S.mode === 'print' ? 'در حالِ چاپ...' : 'خطا: اول کاغذ را آزاد کنید';
            ctx.save();
            ctx.beginPath();
            ctx.rect(X + (86 + ox) * u, Y + (130 + oy) * u, 84 * u, 14 * u);
            ctx.clip();
            rtl(txt, X + (128 + ox) * u, Y + (137.4 + oy) * u, S.mode === 'err' ? '#ff9a80' : '#9dff9d', fnt(u * 3.4, 'bold'), 'center');
            ctx.restore();
            if (S.doc) {
                var w = Math.min(VW * 0.62, 170 * u), h = VH * 0.74, x = X + (VW - w) / 2, y = Y + VH * 0.12;
                ctx.save();
                ctx.translate(x + w / 2, y + h / 2);
                ctx.rotate(-0.025);
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(-w / 2 + 2 * u, -h / 2 + 3 * u, w, h);
                ctx.fillStyle = '#efe9da';
                ctx.fillRect(-w / 2, -h / 2, w, h);
                ctx.strokeStyle = 'rgba(120,110,90,0.35)';
                ctx.lineWidth = u * 0.4;
                ctx.beginPath();
                ctx.moveTo(-w / 2, -h * 0.1);
                ctx.lineTo(w / 2, h * 0.05);
                ctx.moveTo(-w * 0.1, -h / 2);
                ctx.lineTo(w * 0.05, h / 2);
                ctx.stroke();
                var R_ = w / 2 - 8 * u, ink = '#26262a', lines = [
                    ['اداره‌ی آگاهیِ تهران — دایره‌ی اموال', fnt(u * 4, 'bold')], ['فرمِ انتقالِ اموالِ پرونده‌ی ۱۲۴۷ (کاوه)', fnt(u * 3.6, 'bold')], ['', null],
                    ['۱. نوارِ ویدئوییِ مداربسته', fnt(u * 3.3)], ['۲. نوارِ نگاتیوِ نیم‌سوخته', fnt(u * 3.3)], ['۳. دوربینِ «زنیت»', fnt(u * 3.3)], ['', null],
                    ['مقصد: بایگانیِ راکد — «بدونِ نیاز به ثبت»', fnt(u * 3.3, 'bold')], ['زمانِ چاپ: ۰۲:۵۲', fnt(u * 3.3)], ['امضا: ن.', fnt(u * 3.6, 'bold')]
                ];
                var ly = -h / 2 + 12 * u;
                for (var _i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
                    var __entry10 = lines_1[_i];
                    var t = __entry10[0], f = __entry10[1];
                    if (f)
                        rtl(t, R_, ly, ink, f);
                    ly += 8.5 * u;
                }
                ctx.rotate(-0.2);
                ctx.strokeStyle = 'rgba(190,30,40,0.8)';
                ctx.lineWidth = u * 0.8;
                ctx.strokeRect(-w * 0.42, h * 0.2, 40 * u, 12 * u);
                rtl('محرمانه', -w * 0.42 + 20 * u, h * 0.2 + 6.3 * u, 'rgba(190,30,40,0.85)', fnt(u * 5, 'bold'), 'center');
                ctx.restore();
            }
        }
    };
})(); };
// --- mini-game: develop a photo in the darkroom (expose, then tray by tray) ---
function makeDarkroom(o) {
    var TR = [{ x: 108, n: 'ظهور', c: '#a02828' }, { x: 178, n: 'توقف', c: '#28a048' }, { x: 248, n: 'ثبوت', c: '#2848a0' }], PW = 40, PH = 28;
    var S = { bg: null, photo: null, exposed: false, expT: 0, at: -1, x: 36, y: 114, drag: null, dev: 0, stT: 0, done: false };
    function build() {
        var _a = mk(WB, H), c = _a[0], g = _a[1];
        R(g, 0, 0, WB, H, '#1a0e10');
        for (var x = 0; x < WB; x += 16)
            R(g, x, 0, 1, 110, '#140a0c');
        R(g, 0, 110, WB, 70, '#2a2226');
        R(g, 0, 110, WB, 2, '#3a3036');
        R(g, 20, 20, 6, 92, '#3a3a40');
        R(g, 10, 20, 44, 20, '#2a2a30');
        R(g, 16, 40, 30, 8, '#3a3a42');
        R(g, 26, 48, 10, 6, '#1a1a1e');
        R(g, 24, 108, 64, 4, '#1a1a1e');
        R(g, 30, 150, 50, 14, '#3a3a42');
        R(g, 31, 151, 48, 12, '#5a2020');
        for (var _i = 0, TR_1 = TR; _i < TR_1.length; _i++) {
            var t = TR_1[_i];
            R(g, t.x - 2, 112, PW + 16, 36, '#101014');
            R(g, t.x, 114, PW + 12, 32, t.c);
            R(g, t.x + 2, 116, PW + 8, 28, shade(t.c, 0.35));
            g.drawImage(pixText(t.n, 7, '#f0d0d0'), t.x + 14, 148);
        }
        S.bg = c;
        var _b = mk(PW, PH), pc = _b[0], pg = _b[1]; // the hidden photo: a handshake under the tower sign
        R(pg, 0, 0, PW, PH, '#c8c4bc');
        R(pg, 0, 18, PW, 10, '#8a8680');
        R(pg, 4, 2, 32, 7, '#2a2a2a');
        pg.drawImage(pixText('برج ماه‌نشان', 6, '#e8e8e8', 'normal'), 6, -1);
        R(pg, 9, 11, 5, 15, '#1e2a44');
        R(pg, 10, 8, 4, 4, '#b08a6a');
        R(pg, 9, 7, 6, 2, '#1c2638');
        R(pg, 25, 11, 6, 15, '#2a2a2e');
        R(pg, 26, 8, 4, 4, '#b89a7a');
        R(pg, 26, 7, 4, 1, '#8a8a90');
        R(pg, 14, 15, 11, 2, '#6a5a4a');
        R(pg, 23, 15, 1, 1, '#9fe8ff');
        S.photo = pc;
    }
    var trayAt = function (x) { return TR.findIndex(function (t) { return x + PW / 2 > t.x && x + PW / 2 < t.x + PW + 12; }); };
    var reset = function (msg) { S.exposed = false; S.at = -1; S.x = 36; S.y = 114; S.dev = 0; toast(msg); sfx.buzz(); };
    return {
        title: 'نمای نزدیک: تاریکخانه‌ی رضا',
        enter: function () { if (!S.bg)
            build(); if (has(o.clue)) {
            S.done = true;
            S.at = 2;
            S.dev = 0.85;
            S.x = TR[2].x + 6;
            S.y = 116;
        } },
        hint: function () {
            if (S.done)
                return 'عکس ظاهر شد. برای بازگشت، دکمه‌ی بازگشت.';
            if (!S.exposed)
                return S.expT > 0 ? 'نوردهی...' : 'دکمه‌ی قرمزِ زیرِ دستگاه را بزن تا کاغذ نور بخورد.';
            if (S.at < 0)
                return 'کاغذ را بکش و در تشتِ اول («ظهور») بگذار.';
            if (S.at === 0)
                return S.dev < 0.62 ? 'صبر کن تا تصویر ظاهر شود...' : 'الان! کاغذ را به تشتِ «توقف» ببر، وگرنه سیاه می‌شود.';
            if (S.at === 1)
                return 'حالا کاغذ را در تشتِ آخر («ثبوت») بگذار.';
            return 'چند لحظه صبر کن...';
        },
        down: function (m) {
            if (S.done || D.active)
                return;
            if (!S.exposed && S.expT <= 0 && m.x >= 30 && m.x <= 80 && m.y >= 150 && m.y <= 164) {
                S.expT = 1.6;
                sfx.clunk();
                return;
            }
            if (S.exposed && m.x >= S.x && m.x <= S.x + PW && m.y >= S.y && m.y <= S.y + PH) {
                S.drag = { ox: m.x - S.x, oy: m.y - S.y };
                sfx.paper();
            }
        },
        move: function (m) { if (S.drag) {
            S.x = clamp(m.x - S.drag.ox, 0, WB - PW);
            S.y = clamp(m.y - S.drag.oy, 60, H - PH);
        } },
        up: function () {
            if (!S.drag)
                return;
            S.drag = null;
            var t = trayAt(S.x), put = function (i) { S.at = i; S.x = TR[i].x + 6; S.y = 116; S.stT = 0; sfx.paper(); };
            if (t === 0 && S.at === -1)
                put(0);
            else if (t === 1 && S.at === 0) {
                if (S.dev < 0.62) {
                    toast('هنوز کم‌رنگ است؛ کمی بیشتر در تشتِ اول بماند.');
                    put(0);
                }
                else
                    put(1);
            }
            else if (t === 2 && S.at === 1)
                put(2);
            else if (S.at >= 0) {
                toast('ترتیب: ظهور ← توقف ← ثبوت');
                put(S.at);
            }
            else {
                S.x = 36;
                S.y = 114;
            }
        },
        update: function (dt) {
            if (S.expT > 0) {
                S.expT -= dt;
                if (S.expT <= 0) {
                    S.exposed = true;
                    sfx.beep(880);
                }
            }
            if (S.at === 0 && !S.drag) {
                S.dev += dt * 0.2;
                if (S.dev > 1.15)
                    reset('کاغذ سیاه شد! یک کاغذِ تازه برداشتم؛ این بار زودتر بردار.');
            }
            if (S.at >= 1)
                S.stT += dt;
            if (S.at === 2 && S.stT > 1.2 && !S.done) {
                S.done = true;
                sfx.reveal();
                startDialog(o.dialog);
            }
        },
        render: function (g) {
            g.drawImage(S.bg, 0, 0);
            var vis = clamp(S.dev, 0, 1), dark = clamp((S.dev - 0.95) * 4, 0, 1);
            g.fillStyle = S.exposed ? '#efe8e0' : '#f4f0ea';
            g.fillRect(Math.round(S.x), Math.round(S.y), PW, PH);
            if (S.at >= 0) {
                g.globalAlpha = vis;
                g.drawImage(S.photo, Math.round(S.x), Math.round(S.y));
                g.globalAlpha = dark;
                R(g, S.x, S.y, PW, PH, '#000');
                g.globalAlpha = 1;
            }
            miniLight([200, 80, 78], [[160, 0, 200, [255, 70, 60], 0.8], [50, 120, 70, [255, 120, 110], 0.5]]);
            R(g, 150, 2, 20, 5, '#ff3030');
            miniGlow(160, 4, 40, [255, 40, 40], 0.4);
            if (S.expT > 0) {
                g.globalCompositeOperation = 'lighter';
                g.fillStyle = 'rgba(255,250,230,0.5)';
                g.beginPath();
                g.moveTo(26, 54);
                g.lineTo(36, 54);
                g.lineTo(80, 112);
                g.lineTo(-2, 112);
                g.fill();
                g.globalCompositeOperation = 'source-over';
            }
            R(g, 44, 153, 22, 8, S.exposed ? '#401010' : ((G.t % 0.8) < 0.4 ? '#ff4040' : '#a02020'));
            if (S.at === 0) {
                R(g, 108, 100, 52, 5, '#101014');
                R(g, 108 + 52 * 0.62, 100, 52 * 0.38, 5, '#2a8a3a');
                R(g, 108 + Math.min(52, 52 * S.dev / 1.15), 98, 1, 9, '#ffffff');
            }
        },
        ui: function (u, X, Y) { rtl('نوردهی', X + 55 * u, Y + 157.5 * u, '#ffd0d0', fnt(u * 3, 'bold'), 'center'); }
    };
}
// --- mini-game: tune an old radio until the courier's voice comes through ---
function makeTuner(o) {
    var S = { f: 152, drag: null, lockT: 0, done: false, a: null, shown: 0 };
    var close = function () { return clamp(1 - Math.abs(S.f - o.freq) / 1.8, 0, 1); };
    function audioOn() {
        if (!A.ctx || S.a)
            return;
        var ac = A.ctx, a = {};
        a.n = ac.createBufferSource();
        a.n.buffer = A.noise;
        a.n.loop = true;
        a.nf = ac.createBiquadFilter();
        a.nf.type = 'bandpass';
        a.nf.frequency.value = 1800;
        a.nf.Q.value = 0.4;
        a.ng = ac.createGain();
        a.ng.gain.value = 0;
        a.n.connect(a.nf);
        a.nf.connect(a.ng);
        a.ng.connect(A.master);
        a.n.start();
        a.v = ac.createOscillator();
        a.v.type = 'sawtooth';
        a.v.frequency.value = 140;
        a.vf = ac.createBiquadFilter();
        a.vf.type = 'bandpass';
        a.vf.frequency.value = 900;
        a.vf.Q.value = 2;
        a.vg = ac.createGain();
        a.vg.gain.value = 0;
        a.v.connect(a.vf);
        a.vf.connect(a.vg);
        a.vg.connect(A.master);
        a.v.start();
        S.a = a;
    }
    function audioOff() { if (!S.a)
        return; try {
        S.a.n.stop();
        S.a.v.stop();
    }
    catch (e) { /* already stopped */ } S.a.ng.disconnect(); S.a.vg.disconnect(); S.a = null; }
    var dialX = [150, 290];
    return {
        title: 'نمای نزدیک: بی‌سیمِ سرویسِ ایستگاه',
        enter: function () { audioOn(); if (has(o.clue)) {
            S.done = true;
            S.f = o.freq;
            S.shown = 999;
        } },
        exit: function () { audioOff(); },
        hint: function () { return S.done ? 'پیام گرفته شد. برای بازگشت، دکمه‌ی بازگشت.' : close() > 0.6 ? 'نزدیک شدی! آرام‌تر بچرخان...' : 'دکمه‌ی بزرگ را به چپ و راست بکش تا صدا صاف شود.'; },
        down: function (m) { if (D.active)
            return; if (m.x > 40 && m.x < 300 && m.y > 40 && m.y < 160)
            S.drag = { x0: m.x, f0: S.f }; },
        move: function (m) { if (S.drag && !S.done)
            S.f = clamp(S.drag.f0 + (m.x - S.drag.x0) * 0.09, 140, 160); },
        up: function () { S.drag = null; },
        update: function (dt) {
            var c = close();
            if (S.a && A.ctx) {
                var t = A.ctx.currentTime, on = !A.muted;
                S.a.ng.gain.setTargetAtTime(on ? 0.1 * (1 - c * c) + 0.012 : 0, t, 0.05);
                S.a.vg.gain.setTargetAtTime(on ? 0.06 * c * c * (0.5 + 0.5 * Math.sin(G.t * 11) * Math.sin(G.t * 3.7)) : 0, t, 0.03);
                if (Math.random() < dt * 8)
                    S.a.v.frequency.setTargetAtTime(110 + Math.random() * 90, t, 0.02);
            }
            if (!S.done && Math.abs(S.f - o.freq) < 0.3 && !S.drag) {
                S.lockT += dt;
                if (S.lockT > 1.2) {
                    S.done = true;
                    sfx.okChime();
                }
            }
            else
                S.lockT = 0;
            if (S.done && S.shown < o.msg.length) {
                S.shown += dt * 22;
                if (S.shown >= o.msg.length && !has(o.clue))
                    startDialog(o.dialog);
            }
        },
        render: function (g) {
            R(g, 0, 0, WB, H, '#1a1612');
            R(g, 30, 26, 260, 130, '#5a3a22');
            R(g, 32, 28, 256, 126, '#6a4428');
            for (var x = 34; x < 286; x += 5)
                R(g, x, 28, 1, 126, '#5e3c24');
            for (var y = 44; y < 140; y += 5)
                for (var x = 48; x < 128; x += 5)
                    R(g, x, y, 3, 3, '#2a1c12');
            R(g, 146, 44, 136, 40, '#1a1410');
            R(g, 148, 46, 132, 36, '#d8c890');
            for (var f = 140; f <= 160; f++) {
                var x = Math.round(lerp(dialX[0], dialX[1], (f - 140) / 20));
                R(g, x, 70, 1, f % 5 ? 5 : 9, '#3a2a1a');
            }
            var nx = Math.round(lerp(dialX[0], dialX[1], (S.f - 140) / 20));
            R(g, nx, 48, 1, 32, '#c02020');
            var kx = 214, ky = 116;
            g.fillStyle = '#2a1a10';
            g.beginPath();
            g.arc(kx, ky, 20, 0, 6.28);
            g.fill();
            g.fillStyle = '#4a3020';
            g.beginPath();
            g.arc(kx, ky, 17, 0, 6.28);
            g.fill();
            var ang = (S.f - 150) * 0.5;
            R(g, Math.round(kx + Math.cos(ang - 1.57) * 12), Math.round(ky + Math.sin(ang - 1.57) * 12), 3, 3, '#d8c890');
            var c = close();
            for (var i = 0; i < 8; i++)
                R(g, 252 + i * 4, 136 - i * 2, 3, 4 + i * 2, i < c * 8 ? '#40ff70' : '#1a2a1a');
            miniLight([90, 80, 70], [[200, 70, 160, [255, 220, 160], 0.7]]);
            miniGlow(214, 64, 70, [255, 220, 140], 0.12 + c * 0.1);
        },
        ui: function (u, X, Y, VW) {
            for (var f = 140; f <= 160; f += 5)
                ltrText(toFa(f), X + lerp(dialX[0], dialX[1], (f - 140) / 20) * u, Y + 52 * u, '#3a2a1a', fnt(u * 2.6, 'bold'));
            if (S.done) {
                var t = o.msg.slice(0, Math.floor(S.shown));
                panel(X + 40 * u, Y + 160 * u - 40 * u, 240 * u, 12 * u * UI.fs, 'rgba(8,6,14,0.9)', '#7fe3ff');
                rtl(t, X + 276 * u, Y + 120 * u + 6 * u * UI.fs, '#bfefff', fnt(u * 3.3, 'bold'));
            }
        }
    };
}
// --- mini-game: reconnect the fuse-box wires (match the colours) ---
function makeWires(o) {
    var COLS = [['#e03a3a', 'قرمز'], ['#ffd23a', 'زرد'], ['#3a8aff', 'آبی']], LY = [56, 92, 128], RY = [56, 92, 128], ORDER = [2, 0, 1];
    var S = { con: [false, false, false], drag: null, lever: false, done: false, pt: null };
    var leftAt = function (m) { return LY.findIndex(function (y) { return Math.hypot(m.x - 70, m.y - y) < 12; }); };
    var rightAt = function (m) { return RY.findIndex(function (y) { return Math.hypot(m.x - 250, m.y - y) < 12; }); };
    var curve = function (g, x1, y1, x2, y2, c) { g.strokeStyle = c; g.lineWidth = 3; g.beginPath(); g.moveTo(x1, y1); g.bezierCurveTo(x1 + 60, y1 + 30, x2 - 60, y2 + 30, x2, y2); g.stroke(); };
    return {
        title: 'نمای نزدیک: جعبه‌فیوزِ کارگاه',
        enter: function () { if (has(o.clue)) {
            S.con = [true, true, true];
            S.lever = true;
            S.done = true;
        } },
        hint: function () { return S.done ? 'برق وصل شد!' : S.con.every(Boolean) ? 'حالا اهرمِ بزرگ را پایین بکش (لمس کن).' : 'هر سیم را بکش و به پیچِ همرنگش وصل کن.'; },
        down: function (m) {
            if (D.active || S.done)
                return;
            var i = leftAt(m);
            if (i >= 0 && !S.con[i]) {
                S.drag = i;
                S.pt = m;
                sfx.beep(520);
                return;
            }
            if (S.con.every(Boolean) && m.x > 280 && m.x < 310 && m.y > 60 && m.y < 130) {
                S.lever = true;
                S.done = true;
                sfx.clunk();
                sfx.okChime();
                startDialog(o.dialog);
            }
        },
        move: function (m) { if (S.drag !== null)
            S.pt = m; },
        up: function (m) {
            if (S.drag === null)
                return;
            var i = S.drag;
            S.drag = null;
            var j = rightAt(m || S.pt);
            if (j >= 0) {
                if (ORDER[j] === i) {
                    S.con[i] = true;
                    sfx.beep(990);
                    for (var k = 0; k < 8; k++)
                        puff(250, RY[j], (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 0.4, [255, 230, 120], 1, true);
                }
                else {
                    toast('رنگِ سیم و پیچ باید یکی باشد.');
                    sfx.buzz();
                }
            }
        },
        update: function () { },
        render: function (g) {
            R(g, 0, 0, WB, H, '#20242a');
            R(g, 40, 20, 280, 150, '#5a5e66');
            R(g, 44, 24, 272, 142, '#3a3e46');
            for (var i = 0; i < 3; i++) {
                R(g, 44, LY[i] - 2, 26, 4, COLS[i][0]);
                g.fillStyle = COLS[i][0];
                g.beginPath();
                g.arc(70, LY[i], 5, 0, 6.28);
                g.fill();
            }
            for (var j = 0; j < 3; j++) {
                R(g, 240, RY[j] - 8, 20, 16, '#8a8e96');
                R(g, 246, RY[j] - 3, 8, 6, '#c8c8d0');
                R(g, 262, RY[j] - 6, 10, 12, COLS[ORDER[j]][0]);
            }
            for (var i = 0; i < 3; i++)
                if (S.con[i])
                    curve(g, 70, LY[i], 250, RY[ORDER.indexOf(i)], COLS[i][0]);
            if (S.drag !== null && S.pt)
                curve(g, 70, LY[S.drag], S.pt.x, S.pt.y, COLS[S.drag][0]);
            R(g, 284, 64, 22, 64, '#2a2c30');
            R(g, 292, S.lever ? 108 : 70, 6, 18, S.con.every(Boolean) ? '#e03a3a' : '#6a3a3a');
            var lit = S.done;
            miniLight(lit ? [150, 150, 140] : [60, 62, 70], [[lowMouse().x, lowMouse().y, 90, [255, 236, 200], 0.8], [160, 10, 220, [255, 240, 200], lit ? 0.7 : 0]]);
            R(g, 150, 30, 20, 6, lit ? '#fff4c0' : '#3a3a30');
            if (lit)
                miniGlow(160, 33, 60, [255, 240, 180], 0.4);
            for (var i = 0; i < 3; i++)
                R(g, 296, 36 + i * 6, 4, 3, S.con[i] ? '#40ff70' : '#401010');
        },
        ui: function (u, X, Y) { for (var j = 0; j < 3; j++)
            rtl(COLS[ORDER[j]][1], X + 290 * u, Y + RY[j] * u + 0.4 * u, '#e8e8f0', fnt(u * 2.8, 'bold'), 'left'); }
    };
}
// --- mini-game: a safe dial (turn to each number, press «ثبت») ---
function makeSafe(o) {
    var S = { ang: 0, drag: null, ent: [], st: 'idle', stT: 0 }, CX = 150, CY = 92, RR = 58, N = 40;
    var num = function () { return ((Math.round(-S.ang / (6.2832 / N)) % N) + N) % N; };
    var BTN = { l: [236, 60, 26, 20], r: [268, 60, 26, 20], ok: [236, 90, 58, 22] };
    var inB = function (m, b) { return m.x >= b[0] && m.x <= b[0] + b[2] && m.y >= b[1] && m.y <= b[1] + b[3]; };
    var tick = function () { if (audioOK())
        noiseHit(A.ctx.currentTime, 0.02, 'highpass', 3000, 1, 0.06); };
    function commit() {
        S.ent.push(num());
        sfx.beep(780);
        if (S.ent.length === 3) {
            if (S.ent.join('-') === o.code.join('-')) {
                S.st = 'ok';
                S.stT = 0;
                sfx.okChime();
            }
            else {
                S.st = 'err';
                S.stT = 0;
                sfx.buzz();
            }
        }
    }
    return {
        title: 'نمای نزدیک: گاوصندوقِ پشتِ تابلو',
        enter: function () { S.ent = []; S.st = has(o.clue) ? 'done' : 'idle'; },
        hint: function () { return S.st === 'done' || S.st === 'ok' ? 'گاوصندوق باز شد.' : 'قفل را بچرخان (یا ◄ ►) تا عدد زیرِ مثلثِ قرمز بیاید، بعد «ثبت». سه عدد.'; },
        down: function (m) {
            if (D.active || S.st === 'ok' || S.st === 'done')
                return;
            if (inB(m, BTN.l)) {
                S.ang += 6.2832 / N;
                tick();
                return;
            }
            if (inB(m, BTN.r)) {
                S.ang -= 6.2832 / N;
                tick();
                return;
            }
            if (inB(m, BTN.ok)) {
                commit();
                return;
            }
            if (Math.hypot(m.x - CX, m.y - CY) < RR + 8)
                S.drag = { a0: Math.atan2(m.y - CY, m.x - CX), s0: S.ang, last: num() };
        },
        move: function (m) { if (!S.drag)
            return; S.ang = S.drag.s0 + angDiff(Math.atan2(m.y - CY, m.x - CX), S.drag.a0); var n = num(); if (n !== S.drag.last) {
            S.drag.last = n;
            tick();
        } },
        up: function () { if (S.drag) {
            S.ang = -num() * 6.2832 / N;
            S.drag = null;
        } },
        update: function (dt) {
            S.stT += dt;
            if (S.st === 'err' && S.stT > 0.8) {
                S.st = 'idle';
                S.ent = [];
            }
            if (S.st === 'ok' && S.stT > 1.0) {
                S.st = 'done';
                closeMini();
                startDialog(o.dialog);
            }
        },
        render: function (g) {
            R(g, 0, 0, WB, H, '#2a2622');
            R(g, 70, 16, 180, 152, '#4a4a50');
            R(g, 74, 20, 172, 144, '#5a5a62');
            g.fillStyle = '#2a2a30';
            g.beginPath();
            g.arc(CX, CY, RR + 4, 0, 6.28);
            g.fill();
            g.fillStyle = '#c8c8d0';
            g.beginPath();
            g.arc(CX, CY, RR, 0, 6.28);
            g.fill();
            for (var i = 0; i < N; i++) {
                var a = S.ang + i * 6.2832 / N - Math.PI / 2, l = i % 5 ? 5 : 9;
                for (var k = 0; k < l; k++)
                    R(g, Math.round(CX + Math.cos(a) * (RR - 2 - k)), Math.round(CY + Math.sin(a) * (RR - 2 - k)), 1, 1, '#2a2a30');
            }
            g.fillStyle = '#8a8a92';
            g.beginPath();
            g.arc(CX, CY, 18, 0, 6.28);
            g.fill();
            R(g, CX - 2, CY - 16, 4, 32, '#6a6a72');
            g.fillStyle = '#e03030';
            g.beginPath();
            g.moveTo(CX - 5, CY - RR - 10);
            g.lineTo(CX + 5, CY - RR - 10);
            g.lineTo(CX, CY - RR - 3);
            g.fill();
            for (var _i = 0, _a = ['l', 'r', 'ok']; _i < _a.length; _i++) {
                var k = _a[_i];
                var b = BTN[k];
                R(g, b[0], b[1] + 2, b[2], b[3], '#1a1a1e');
                R(g, b[0], b[1], b[2], b[3], k === 'ok' ? '#b8741e' : '#3a3a42');
            }
            var m = lowMouse();
            miniLight([80, 76, 72], [[m.x, m.y, 100, [255, 236, 200], 0.7], [150, 20, 200, [255, 220, 170], 0.45]]);
            var col = S.st === 'err' ? '#ff4040' : S.st === 'ok' || S.st === 'done' ? '#40ff70' : '#3a1010';
            R(g, 238, 124, 6, 6, col);
        },
        ui: function (u, X, Y) {
            for (var i = 0; i < N; i += 5) {
                var a = S.ang + i * 6.2832 / N - Math.PI / 2;
                ltrText(toFa(i), X + (CX + Math.cos(a) * (RR - 16)) * u, Y + (CY + Math.sin(a) * (RR - 16)) * u, '#1a1a20', fnt(u * 3, 'bold'));
            }
            ltrText('◄', X + 249 * u, Y + 70.5 * u, '#f0e8d8', fnt(u * 4, 'bold'));
            ltrText('►', X + 281 * u, Y + 70.5 * u, '#f0e8d8', fnt(u * 4, 'bold'));
            rtl('ثبت', X + 265 * u, Y + 101.5 * u, '#1c1208', fnt(u * 3.6, 'bold'), 'center');
            ltrText(S.ent.map(toFa).join('  —  ') || '—', X + 265 * u, Y + 140 * u, '#ffe2b0', fnt(u * 4, 'bold'));
            ltrText(toFa(num()), X + CX * u, Y + (CY + 36) * u, '#ffd23a', fnt(u * 5, 'bold'));
        }
    };
}
// ================= cases 3–7: people =================
var PEOPLE = {
    s: { n: 'سیاوش', c: '#8fe08f', sp: { coat: '#3a5a3a', pants: '#2a2a38', skin: '#c9a27e', hat: 'beanie', hatCol: '#a02a2a', hair: '#1a1410' } },
    d: { n: 'خانم صدری', c: '#e0a0d0', sp: { coat: '#6a4a5a', pants: '#2a2230', skin: '#d4ab8a', hat: 'scarf', hatCol: '#3a2a4a', glasses: 1, long: 1 } },
    h: { n: 'آقا رحیمِ خیاط', c: '#d8c890', sp: { coat: '#4a4a3a', shirt: '#d8d0c0', pants: '#3a3a40', skin: '#b08868', hat: 'bald', hair: '#9a9a9a', glasses: 1, mustache: '#8a8a8a' } },
    g: { n: 'غلامِ باربر', c: '#9ab8ff', sp: { coat: '#3a4a6a', apron: '#5a4a3a', pants: '#2a2a30', skin: '#b08868', hat: 'cap', hatCol: '#2a3a5a', mustache: '#2a1e18', gloves: '#1a1a1a' } },
    o: { n: 'خانم نوری', c: '#8fe0e0', sp: { coat: '#2a4a5a', skin: '#d4ab8a', hat: 'scarf', hatCol: '#1a2a3a', glasses: 1, lips: '#a05060' } },
    v: { n: 'آقای وفا', c: '#ffb08a', sp: { coat: '#5a3a2a', pants: '#2a2a2e', skin: '#c9a27e', hat: 'fedora', hatCol: '#3a2a1a', beard: '#3a2a20', scarf: '#8a1a1a', long: 1 } },
    e: { n: 'مهندس پارسا', c: '#c8e0ff', sp: { coat: '#2a3a5a', shirt: '#d8d8e0', pants: '#2a2a30', skin: '#c9a27e', hat: 'hardhat', hatCol: '#e8e8e8', glasses: 1 } },
    f: { n: 'اوستا جعفر', c: '#ffd060', sp: { coat: '#6a5a3a', pants: '#3a3a30', skin: '#a07858', hat: 'hardhat', hatCol: '#e8b020', mustache: '#1a1410', tall: 1 } },
    r: { n: 'رحمانِ نگهبان', c: '#a8d8a0', sp: { coat: '#2a3a2a', pants: '#1e1e26', skin: '#b08868', hat: 'cap', hatCol: '#1a2a1a', beard: '#3a3030' } },
    x: { n: 'ناصرِ پیشخدمت', c: '#d0d0d8', sp: { coat: '#101014', shirt: '#e8e8e8', tie: '#101014', pants: '#101014', skin: '#c49a78', hat: 'bald', hair: '#5a5a5a', gloves: '#e8e8e8', tall: 1 } },
    q: { n: 'نگار', c: '#ff9ac0', sp: { coat: '#3a2a4a', skin: '#d4ab8a', hat: 'scarf', hatCol: '#6a2a3a', lips: '#a02850', long: 1 } },
    c: { n: 'دکتر شمس', c: '#c0c0ff', sp: { coat: '#2a2a3a', shirt: '#e8e8e8', tie: '#6a1a1a', skin: '#c9a27e', hair: '#6a6a6a', beard: '#8a8a8a', glasses: 1 } },
    z: { n: 'منصور کیان‌فر', c: '#9fe8ff', sp: { coat: '#1a1a22', shirt: '#e8e8e8', tie: '#6a1a2a', pants: '#1a1a22', skin: '#c8a488', hair: '#9a9aa0', mustache: '#6a6a70', ring: 1, long: 1, tall: 1 } },
    w: { n: 'وکیل صارمی', c: '#b0c0e0', sp: { coat: '#3a3a44', shirt: '#d8d8e0', tie: '#1a2a4a', skin: '#d0aa88', hair: '#2a2020', glasses: 1 } },
    u: { n: 'اکبرِ راننده', c: '#e0c0a0', sp: { coat: '#2a2a2a', pants: '#1e1e22', skin: '#a07858', hat: 'cap', hatCol: '#101010', mustache: '#1a1410' } }
};
for (var k in PEOPLE)
    SPK[k] = { n: PEOPLE[k].n, c: PEOPLE[k].c };
var npc = function (k, x, extra) { return Object.assign({ id: k, x: x, sp: PEOPLE[k].sp }, extra || {}); };
// ================= case 3: the darkroom =================
function buildStudio() {
    return buildScene({
        id: 'studio', name: 'عکاسخانه‌ی کاوه — لاله‌زار', w: 520, seed: 303, indoor: true, spawn: 64,
        room: { wall: '#5a4a44', wall2: '#3a2a24', trim: '#8a6a4a', floor: 'wood', floorCol: '#5a3a24', ceil: '#18120e' },
        props: [
            ['door', { x: 24, col: '#4a3526', glass: '#3a4a6a', sign: 'عکاسیِ کاوه' }], ['bike', { x: 58 }],
            ['window', { x: 100, y: 90, w: 44, h: 30, outside: 'night' }], ['photosLine', { x: 160, w: 100, y: 86 }],
            ['desk', { x: 160, w: 56 }], ['lampDesk', { x: 168 }], ['answer', { x: 186 }], ['phoneDesk', { x: 202 }],
            ['papers', { x: 110, w: 140 }], ['cabinet', { x: 236, toppled: true }], ['shelf', { x: 270, w: 56, y: 100, h: 12 }],
            ['coatrack', { x: 352 }], ['darkroom', { x: 380, w: 120 }], ['enlarger', { x: 410 }], ['trays', { x: 446 }],
            ['bulbHang', { x: 120, y: 82 }], ['bulbHang', { x: 270, y: 82 }]
        ],
        npcs: [npc('d', 92), npc('h', 306), npc('s', 350)],
        lights: [
            { x: 120, y: 86, r: 130, c: [255, 220, 170], i: 0.85, f: 'bulb', z: 20 }, { x: 270, y: 86, r: 130, c: [255, 215, 160], i: 0.8, f: 'lamp', z: 20 },
            { x: 168, y: 134, r: 70, c: [255, 215, 140], i: 0.7, f: 'steady', z: 13 }, { x: 440, y: 109, r: 120, c: [255, 40, 40], i: 0.95, f: 'steady', z: 10 },
            { x: 122, y: 98, r: 90, c: [140, 170, 255], i: 0.5, f: 'steady', z: 4, back: 1, sz: 3 }
        ],
        targets: [
            { id: 'door3', x: 33, y: 110, w: 22, h: 36, n: 'درِ ورودی' },
            { id: 'mud3', x: 76, y: 160, w: 40, h: 10, n: 'ردِ کفش و لاستیک', hidden: 1, clue: 'k3mud' },
            { id: 'bike3', x: 70, y: 134, w: 40, h: 22, n: 'دوچرخه‌ی آبی' },
            { id: 'sadri', x: 92, y: 124, w: 13, h: 36, n: 'خانم صدری', npc: 1 },
            { id: 'win3', x: 122, y: 88, w: 48, h: 34, n: 'پنجره' },
            { id: 'papers3', x: 140, y: 150, w: 40, h: 14, n: 'کاغذهای ریخته' },
            { id: 'answer3', x: 191, y: 132, w: 14, h: 8, n: 'منشیِ تلفنی' },
            { id: 'phone3', x: 207, y: 132, w: 13, h: 8, n: 'تلفنِ عکاسخانه' },
            { id: 'photos3', x: 210, y: 84, w: 100, h: 16, n: 'عکس‌های رضا' },
            { id: 'cab3', x: 247, y: 141, w: 26, h: 12, n: 'کمدِ واژگون' },
            { id: 'rahim', x: 306, y: 124, w: 13, h: 36, n: 'آقا رحیم', npc: 1 },
            { id: 'siavash', x: 350, y: 124, w: 13, h: 36, n: 'سیاوش', npc: 1 },
            { id: 'enlarger3', x: 414, y: 115, w: 30, h: 37, n: 'آگراندیسور' }
        ],
        ambient: [76, 66, 78], zoom: 1.5, viewTop: 56
    });
}
Object.assign(CLUES, {
    k3lock: { n: 'قفلِ سالم', d: 'در شکسته نشده؛ با کلید باز شده.', i: 'lockic' },
    k3mud: { n: 'ردِ کتانی و دوچرخه', d: 'کتانیِ سایزِ ۴۲ با آجِ ستاره‌ای، و ردِ لاستیکِ دوچرخه.', i: 'snow' },
    k3keys: { n: 'کلیدِ صاحبخانه', d: 'کلیدِ یدکِ خانم صدری سال‌هاست از حلقه باز نشده.', i: 'key' },
    k3tailor: { n: 'شهادتِ خیاط', d: 'ساعتِ سه، جوانی با کلاهِ قرمز و دوچرخه در را با کلید باز کرد.', i: 'test' },
    k3msg: { n: 'پیامِ منشیِ تلفنی', d: '«سیاوش جان، پاکت را ساعتِ شش بیاور راه‌آهن. کمدِ هفده.»', i: 'tape' },
    k3photo: { n: 'عکسِ ظاهرشده', d: 'نادری با مردی انگشتربه‌دست، جلوی تابلوی «برج ماه‌نشان».', i: 'photo' },
    k3ticket: { n: 'بلیتِ قطار', d: 'تهران—مشهد، ساعتِ ۰۶:۱۰، از جیبِ کاپشنِ سیاوش.', i: 'ticket' }
});
var strong3 = function () { return has('k3lock') && has('k3keys') && (has('k3mud') || has('k3tailor')) && (has('k3msg') || has('k3ticket')); };
Object.assign(DLG, {
    intro3: [
        ['a', 'عکاسخانه‌ی رضا کاوه، خیابانِ لاله‌زار. ساعتِ چهار و چهل دقیقه‌ی بامداد.'],
        ['a', 'نادری در بازداشت فقط یک جمله گفت: «نسخه‌ی اصلیِ عکس‌ها هیچ‌وقت پیشِ رضا نبود.» اما عکاس‌ها همیشه یک نسخه برای خودشان نگه می‌دارند.'],
        ['a', 'وقتی رسیدم، در باز بود و همه‌چیز به‌هم‌ریخته. کسی زودتر از من دنبالِ همان نسخه آمده.'],
        ['n', 'راهنما: هر وقت ندانستی چه کنی، دکمه‌ی لامپ را بزن تا راه را نشانت بدهد.']
    ],
    door3: [['a', 'درِ ورودی. قفلش سالم است؛ نه جای اهرم، نه شیشه‌ی شکسته.'], { s: 'a', t: 'کسی که آمده، کلید داشته.', give: 'k3lock' }],
    door3b: [['a', 'قفلِ سالم. با کلید باز شده.']],
    mud3: [['a', 'ردِ کفش روی کفِ چوبی؛ گِلِ آب‌شده.'], { s: 'a', t: 'کتانیِ سایزِ ۴۲ با آجِ ستاره‌ای... و کنارش ردِ باریکِ لاستیکِ دوچرخه.', give: 'k3mud' }],
    mud3b: [['a', 'آجِ ستاره‌ای و ردِ دوچرخه. کسی با دوچرخه تا دمِ در آمده.']],
    bike3: [['a', 'یک دوچرخه‌ی آبی کنارِ در. لاستیکش هنوز گِلی است.'], { if: function () { return !F.bikeOwner; }, s: 'a', t: 'باید بپرسم مالِ کیست.' }],
    win3: [['a', 'پنجره از داخل چفت است. کسی از این‌جا نیامده.']],
    papers3: [['a', 'کشوها خالی، کاغذها روی زمین. کسی عجله داشت و دنبالِ پاکتی می‌گشت.'], ['a', 'اما به تاریکخانه دست نزده‌اند. عجیب است؛ عکس‌ها جایشان آن‌جاست.']],
    photos3: [['a', 'عکس‌های رضا: کوچه‌های برفی، بچه‌های محل، گربه‌ای روی کاپوت... آدم‌ها وقتی نمی‌دانند کسی نگاهشان می‌کند.']],
    cab3: [['a', 'کمدِ فلزیِ پرونده‌ها را واژگون کرده‌اند. قفلش را با آچار باز کرده‌اند؛ خالی بوده.']],
    answer3: [
        ['a', 'منشیِ تلفنی. چراغش چشمک می‌زند: یک پیامِ تازه.'],
        ['a', '(دکمه را می‌زنم. صدای مردی خسته و خش‌دار:)'],
        { s: 'n', t: '«سیاوش جان... پاکت را ساعتِ شش بیاور راه‌آهن. کمدِ هفده. پولت نقد است. به کسی چیزی نگو.» — ساعتِ پیام: ۰۲:۵۰', give: 'k3msg' },
        ['a', 'این پیام برای رضا نبود. برای شاگردش بود.']
    ],
    answer3b: [['a', '«سیاوش جان... پاکت را ساعتِ شش بیاور راه‌آهن.»']],
    enlarger3b: [['a', 'آگراندیسورِ رضا. نگاتیو را در محفظه‌ی لامپش قایم کرده بود؛ جایی که هیچ دزدی نگاه نمی‌کند.']],
    photo3: [
        ['a', 'لای محفظه‌ی لامپِ آگراندیسور یک نوارِ نگاتیو بود. رضا نسخه‌ی دوم را همین‌جا نگه داشته بود.'],
        { s: 'a', t: 'عکس ظاهر شد: سرگرد نادری با مردی کت‌وشلواری دست می‌دهد، جلوی تابلوی «برج ماه‌نشان». روی انگشتِ مرد، سنگِ ماه.', give: 'k3photo' },
        ['a', 'این همان کسی است که بالاتر از همه نشسته.']
    ],
    sad: [['d', 'کارآگاه؟ خدا مرگم بدهد، رضا... پسرِ خوبی بود. اجاره‌اش همیشه سرِ وقت بود.'], { go: 'sad_hub' }],
    sad_again: [['d', 'بفرمایید، کارآگاه.'], { go: 'sad_hub' }],
    sad_hub: [{ s: 'd', t: 'چه کمکی از دستم برمی‌آید؟', c: [
                { t: 'چه کسی کلیدِ این‌جا را دارد؟', go: 'sad_keys', if: function () { return !has('k3keys'); } },
                { t: 'امشب صدایی شنیدید؟', go: 'sad_noise', if: function () { return !F.sadNoise; } },
                { t: 'دوچرخه‌ی کنارِ در مالِ کیست؟', go: 'sad_bike', if: function () { return !F.bikeOwner; } },
                { t: 'ممنون، خانم صدری.' }
            ] }],
    sad_keys: [
        ['d', 'فقط دو کلید هست: یکی مالِ خودم، یکی مالِ سیاوش، شاگردِ رضا.'],
        ['d', 'کلیدِ من این‌جاست، ببینید؛ به دسته‌کلیدم بسته است. از سرِ شب هم از خانه بیرون نرفته‌ام.'],
        { s: 'a', t: '(کلیدِ یدک به حلقه‌ی زنگ‌زده‌ای بسته شده که سال‌هاست باز نشده.)', give: 'k3keys' }, { go: 'sad_hub' }
    ],
    sad_noise: [{ set: 'sadNoise' }, ['d', 'ساعتِ سه صدای در آمد. فکر کردم رضاست؛ همیشه دیروقت کار می‌کرد.'], { go: 'sad_hub' }],
    sad_bike: [{ set: 'bikeOwner' }, ['d', 'آن دوچرخه‌ی آبی؟ مالِ سیاوش است. همیشه با آن می‌آید.'], { go: 'sad_hub' }],
    rah: [
        ['h', 'من خیاطم، کارآگاه؛ مغازه‌ام روبه‌روست. شب‌ها تا دیروقت کار می‌کنم.'],
        { s: 'a', t: '(پیرمرد متر را دورِ گردنش انداخته و به تو نگاه می‌کند.)', c: [
                { t: 'امشب چیزی دیدید، آقا رحیم؟ هر چیزی کمک است.', go: 'rah_kind' },
                { t: 'سریع بگو چه دیدی. وقت ندارم.', go: 'rah_rude' }
            ] }
    ],
    rah_kind: [
        ['h', 'ساعتِ سه، از پشتِ شیشه دیدم جوانی با دوچرخه آمد. در را با کلید باز کرد؛ انگار خانه‌ی خودش است.'],
        { s: 'h', t: 'بیست دقیقه بعد با یک کوله‌ی پر رفت. کلاهِ بافتنیِ قرمز داشت.', give: 'k3tailor' },
        ['a', 'کلاهِ بافتنیِ قرمز...']
    ],
    rah_rude: [{ set: 'rahRude' }, ['h', 'وقت نداری؟ من هم چشم‌هایم دیگر خوب نمی‌بیند. شب بخیر.']],
    rah_again: [{ s: 'h', t: 'باز آمدی؟', c: [{ t: 'ببخشید، آقا رحیم. شبِ سختی بوده.', go: 'rah_kind' }, { t: '(برو)' }] }],
    rah_done: [['h', 'خدا رحمتش کند. رضا کتش را همیشه پیشِ من می‌آورد.']],
    sia: [['s', 'کارآگاه... من تازه رسیدم! خانم صدری زنگ زد. کی این‌جا را این‌جوری کرده؟'], { go: 'sia_hub' }],
    sia_again: [['s', 'من که گفتم، کارآگاه. من خانه بودم.'], { go: 'sia_hub' }],
    sia_hub: [{ s: 'a', t: '(سیاوش مدام پا به پا می‌کند.)', c: [
                { t: 'ساعتِ سه کجا بودی؟', go: 'sia_where', if: function () { return !F.siaWhere; } },
                { t: '(به کفش‌هایش نگاه کن)', go: 'sia_shoes', if: function () { return has('k3mud') && !F.siaShoes; } },
                { t: '(جیبِ کاپشنش بیرون زده است)', go: 'sia_pocket', if: function () { return !has('k3ticket'); } },
                { t: 'پیامِ منشیِ تلفنی برای تو بود، سیاوش.', go: 'sia_msg', if: function () { return has('k3msg') && !F.siaMsg; } },
                { t: 'فعلاً همین.' }
            ] }],
    sia_where: [{ set: 'siaWhere' }, ['s', 'خانه! خواب بودم. قسم می‌خورم.'], { go: 'sia_hub' }],
    sia_shoes: [{ set: 'siaShoes' }, ['a', '(کتانیِ سفید، سایزِ ۴۲، آجِ ستاره‌ای؛ لبه‌اش هنوز گِلی است.)'], ['s', 'چی؟ ... همه از این کتانی‌ها دارند.'], { go: 'sia_hub' }],
    sia_pocket: [['a', '(از جیبِ کاپشنش یک برگه بیرون زده. برش می‌دارم.)'], { s: 'a', t: 'بلیتِ قطار. تهران — مشهد، ساعتِ شش و ده دقیقه. امروز.', give: 'k3ticket' }, ['s', '... می‌خواستم بروم پیشِ مادرم. همین.'], { go: 'sia_hub' }],
    sia_msg: [{ set: 'siaMsg' }, ['s', '...'], ['s', 'من... نمی‌دانم درباره‌ی چه حرف می‌زنید.'], { go: 'sia_hub' }],
    phone3: [
        { if: function () { return clueCount() < 4; }, s: 'a', t: 'تلفنِ عکاسخانه. هنوز برای گزارش زود است.' },
        { if: function () { return clueCount() >= 4; }, s: 'a', t: 'به مرکز زنگ بزنم؟ چه کسی امشب این‌جا را زیر و رو کرده؟', c: [
                { t: 'سیاوش، شاگردِ رضا', go: 'acc3' }, { t: 'خانم صدری، صاحبخانه', go: 'end3_d' }, { t: 'آقا رحیمِ خیاط', go: 'end3_h' }, { t: 'هنوز نه.' }
            ] }
    ],
    acc3: [{ if: strong3, go: 'end3_good' }, { go: 'end3_weak' }],
    end3_good: [
        ['a', '«سیاوش. کلید داشت، دوچرخه داشت، و کتانیِ آجِ ستاره‌ای.»'],
        { if: function () { return has('k3tailor'); }, s: 'a', t: 'آقا رحیم ساعتِ سه جوانی با کلاهِ قرمز دیده بود؛ و کلیدِ خانم صدری سرِ جایش بود.' },
        ['s', '... باشد! من بودم. یک مرد زنگ زد؛ گفت اگر پاکتِ عکس‌ها را پیدا کنم، پولدار می‌شوم.'],
        ['s', 'پاکت زیرِ تخته‌ی کف بود. ساعتِ چهار گذاشتمش در کمدِ هفده‌ی راه‌آهن.'],
        { if: function () { return has('k3photo'); }, s: 'a', t: 'اما رضا زرنگ‌تر بود؛ نسخه‌ی دوم در تاریکخانه ماند. و حالا چهره‌ی مردِ انگشتربه‌دست را دارم.' },
        ['a', 'ساعت پنج و ربع است. قطارِ مشهد ساعتِ شش و ده دقیقه حرکت می‌کند.'],
        { end: 'good3' }
    ],
    end3_weak: [['a', '«سیاوش را بازداشت کنید.»'], ['s', 'به چه جرمی؟ من کلید دارم؛ هر روز این‌جا کار می‌کنم!'], ['a', 'حق داشت. بی‌مدرک، کلید فقط یک کلید است.'], { end: 'weak3' }],
    end3_d: [['a', '«صاحبخانه را بازداشت کنید.»'], ['d', 'من؟ پیرزنی که از سرِ شب از خانه بیرون نرفته؟'], ['a', 'کلیدِ او سال‌ها بود از آن حلقه باز نشده بود. و پاکت، ساعتِ شش، سوارِ قطار شد.'], { end: 'wrong3d' }],
    end3_h: [['a', '«خیاط را ببرید.»'], ['h', 'من فقط چیزی را که دیدم گفتم، پسرم.'], ['a', 'و کسی که حقیقت را دیده بود، تاوانش را داد. پاکت رفت.'], { end: 'wrong3h' }]
});
Object.assign(ENDINGS, {
    good3: { t: 'نسخه‌ی دوم', s: 'سیاوش اعتراف کرد؛ پاکت در راه‌آهن است.', c: '#ff8080', good: true },
    weak3: { t: 'کلیدِ بی‌گناه', s: 'بی‌مدرک، کلید فقط یک کلید است.', c: '#ffbf69' },
    wrong3d: { t: 'حلقه‌ی زنگ‌زده', s: 'مقصر آزاد ماند.', c: '#e0a0d0' },
    wrong3h: { t: 'چشم‌های خسته', s: 'مقصر آزاد ماند.', c: '#d8c890' }
});
Object.assign(ACT, {
    door3: function () { return has('k3lock') ? 'door3b' : 'door3'; }, mud3: function () { return has('k3mud') ? 'mud3b' : 'mud3'; }, bike3: function () { return 'bike3'; }, win3: function () { return 'win3'; },
    papers3: function () { return 'papers3'; }, photos3: function () { return 'photos3'; }, cab3: function () { return 'cab3'; }, answer3: function () { return has('k3msg') ? 'answer3b' : 'answer3'; },
    enlarger3: function () { return 'mini:darkroom3'; }, phone3: function () { return 'phone3'; },
    sadri: function () { return F.sadMet ? 'sad_again' : (G.flags.sadMet = true, 'sad'); },
    rahim: function () { return has('k3tailor') ? 'rah_done' : F.rahMet ? 'rah_again' : (G.flags.rahMet = true, 'rah'); },
    siavash: function () { return F.siaMet ? 'sia_again' : (G.flags.siaMet = true, 'sia'); }
});
MINI_F.darkroom3 = function () { return makeDarkroom({ clue: 'k3photo', dialog: 'photo3' }); };
// ================= case 4: the railway station =================
function buildRailway() {
    return buildScene({
        id: 'railway', name: 'راه‌آهنِ تهران — سالنِ اصلی', w: 620, seed: 404, indoor: true, spawn: 40,
        room: { wall: '#8a7a66', wall2: '#5a4a3a', trim: '#b0a080', pattern: 'tile', floor: 'tile', floorCol: '#7a7266', ceil: '#2a2420' },
        props: [
            ['archWindow', { x: 20, w: 44, top: 40, bot: 118 }], ['board', { x: 84, w: 120, y: 52, lines: ['مشهد ۰۶:۱۰ سکوی ۲', 'تبریز ۰۶:۴۵ سکوی ۱', 'اصفهان ۰۷:۰۰ سکوی ۳'] }],
            ['booth', { x: 120, w: 44 }], ['phoneDesk', { x: 184, y: 130, col: '#6a1a1a', wall: 1 }], ['column', { x: 212, w: 14, col: '#9a8a76' }],
            ['lockers', { x: 236, cols: 6, open: [17] }], ['archWindow', { x: 330, w: 40, top: 40, bot: 118 }], ['stationClock', { x: 300, y: 72 }],
            ['bench', { x: 322, w: 40 }], ['cart', { x: 380, n: 3, bags: ['#6a3a1a', '#5a4a3a', '#3a2a1a'] }], ['column', { x: 424, w: 14, col: '#9a8a76' }],
            ['radioDesk', { x: 442 }], ['archWindow', { x: 470, w: 40, top: 40, bot: 118 }], ['trainDoor', { x: 526, w: 80 }],
            ['bulbHang', { x: 266, y: 80 }], ['bulbHang', { x: 400, y: 80 }]
        ],
        npcs: [npc('o', 142, { yo: -11, clip: [126, 115, 32, 13], f: 1 }), npc('v', 352), npc('g', 420)],
        lights: [
            { x: 42, y: 80, r: 140, c: [255, 190, 160], i: 0.6, f: 'steady', z: 4, back: 1, sz: 6 }, { x: 350, y: 80, r: 140, c: [255, 190, 160], i: 0.6, f: 'steady', z: 4, back: 1, sz: 6 },
            { x: 490, y: 80, r: 130, c: [255, 190, 160], i: 0.55, f: 'steady', z: 4, back: 1, sz: 6 }, { x: 142, y: 120, r: 60, c: [255, 170, 60], i: 0.5, f: 'steady', ns: 1 },
            { x: 266, y: 84, r: 120, c: [255, 220, 170], i: 0.7, f: 'bulb', z: 20 }, { x: 400, y: 84, r: 120, c: [255, 220, 170], i: 0.7, f: 'lamp', z: 20 },
            { x: 566, y: 118, r: 100, c: [255, 220, 150], i: 0.5, f: 'steady', z: 3 }
        ],
        targets: [
            { id: 'board4', x: 144, y: 42, w: 124, h: 56, n: 'تابلوی حرکت' },
            { id: 'noori', x: 142, y: 112, w: 32, h: 18, n: 'خانم نوری (باجه)', npc: 1 },
            { id: 'phone4', x: 189, y: 122, w: 14, h: 10, n: 'تلفنِ پاسگاه' },
            { id: 'locker17', x: 280, y: 104, w: 13, h: 13, n: 'کمدِ شماره‌ی ۱۷' },
            { id: 'clock4', x: 300, y: 58, w: 16, h: 22, n: 'ساعتِ ایستگاه' },
            { id: 'vafa', x: 352, y: 124, w: 13, h: 36, n: 'آقای وفا', npc: 1 },
            { id: 'cart3', x: 395, y: 134, w: 32, h: 26, n: 'گاریِ شماره‌ی ۳' },
            { id: 'env4', x: 394, y: 152, w: 28, h: 8, n: 'چیزی زیرِ چمدان‌ها', hidden: 1, clue: 'k4env' },
            { id: 'gholam', x: 420, y: 124, w: 13, h: 36, n: 'غلامِ باربر', npc: 1 },
            { id: 'radio4', x: 456, y: 124, w: 30, h: 24, n: 'بی‌سیمِ سرویس' },
            { id: 'train4', x: 566, y: 62, w: 80, h: 84, n: 'قطارِ مشهد' }
        ],
        ambient: [84, 78, 88], zoom: 1.36, viewTop: 40
    });
}
Object.assign(CLUES, {
    k4locker: { n: 'کمدِ هفده', d: 'باز و خالی. دستگیره‌اش چرب است؛ روغنِ سیاهِ چرخ.', i: 'locker' },
    k4board: { n: 'تابلوی حرکت', d: 'قطارِ مشهد ۰۶:۱۰. «بار تا ساعتِ شش تحویل شود.»', i: 'joblog' },
    k4noori: { n: 'شهادتِ باجه', d: 'غلام ساعتِ پنج و نیم بی‌سیمِ سرویس را قرض گرفت.', i: 'test' },
    k4radio: { n: 'پیامِ بی‌سیم', d: '«بسته تو گاریِ سه‌ست، زیرِ چمدونِ قهوه‌ای.»', i: 'radio' },
    k4env: { n: 'پاکتِ رضا', d: 'زیرِ چمدان‌های گاریِ شماره‌ی ۳ قایم شده بود.', i: 'envelope' },
    k4hands: { n: 'دستانِ باربر', d: 'کفِ دستِ غلام سیاه از روغنِ چرخ؛ مثلِ دستگیره‌ی کمد.', i: 'gloves' },
    k4vafa: { n: 'بلیتِ آقای وفا', d: 'تهران—اصفهان، ساعتِ هفت؛ به قطارِ مشهد ربطی ندارد.', i: 'ticket' }
});
var strong4 = function () { return has('k4env') && (has('k4radio') || has('k4noori')) && (has('k4hands') || has('k4locker')); };
Object.assign(DLG, {
    intro4: [
        ['a', 'راه‌آهنِ تهران، ساعتِ پنج و پنجاه دقیقه. سپیده تازه از پنجره‌های بلند سرک می‌کشد.'],
        ['a', 'سیاوش گفته بود پاکت را در کمدِ هفده گذاشته. کمدِ هفده باز است... و خالی.'],
        ['a', 'کسی که پاکت را برداشته، هنوز همین‌جاست. قطارِ مشهد ساعتِ شش و ده دقیقه راه می‌افتد.']
    ],
    locker17: [['a', 'کمدِ هفده. قفلش را با کلیدِ اصلی باز کرده‌اند، نه با زور.'], { s: 'a', t: 'دستگیره‌اش چرب است؛ روغنِ سیاه، مثلِ روغنِ چرخ.', give: 'k4locker' }],
    locker17b: [['a', 'کمدِ خالیِ هفده. دستگیره‌ی چرب.']],
    board4: [['a', 'تابلوی حرکت: مشهد، شش و ده دقیقه، سکوی دو.'], { s: 'a', t: 'زیرش با گچ نوشته‌اند: «بار تا ساعتِ شش تحویل شود.»', give: 'k4board' }],
    board4b: [['a', 'مشهد، شش و ده دقیقه. وقت تنگ است.']],
    clock4: [['a', 'پنج و پنجاه و دو دقیقه. عقربه‌ها امروز به نفعِ من نیستند.']],
    train4: [['a', 'قطارِ مشهد؛ واگن‌ها گرم و روشن. مأمورِ قطار دارد بلیت‌ها را نگاه می‌کند.'], ['a', 'اگر پاکت سوار شود، دیگر پیدایش نمی‌کنم.']],
    cart3: [['a', 'گاریِ شماره‌ی سه، پر از چمدان. زیرِ چمدانِ قهوه‌ای تاریک است.'], { if: function () { return !has('k4env'); }, s: 'a', t: 'باید با چراغ‌قوه زیرش را ببینم.' }],
    env4: [['a', 'زیرِ چمدانِ قهوه‌ای، یک پاکتِ بزرگ. مهرِ «عکاسیِ کاوه» رویش است.'], { s: 'a', t: 'پاکتِ رضا! کسی آن را زیرِ بارها قایم کرده تا با قطار برود.', give: 'k4env' }],
    env4b: [['a', 'پاکتِ رضا حالا پیشِ من است.']],
    radio4_done: [{ s: 'a', t: 'صدای بی‌سیم خش‌دار است، اما لهجه‌اش آشناست؛ صدای یکی از کارکنانِ همین ایستگاه.', give: 'k4radio' }],
    radio4b: [['a', 'بی‌سیمِ سرویس. همان صدای آشنا.']],
    noo: [['o', 'بلیت؟ قطارِ مشهد پر است، آقا.'], { go: 'noo_hub' }],
    noo_again: [['o', 'باز هم شما؟'], { go: 'noo_hub' }],
    noo_hub: [{ s: 'o', t: 'امرِ دیگری هست؟', c: [
                { t: 'امروز صبح کسی بی‌سیمِ سرویس را برداشت؟', go: 'noo_radio', if: function () { return !has('k4noori'); } },
                { t: 'آن مسافرِ کلاه‌شاپو کجا می‌رود؟', go: 'noo_vafa', if: function () { return !F.nooVafa; } },
                { t: 'ممنون.' }
            ] }],
    noo_radio: [['o', 'بی‌سیم؟ غلام، باربر، ساعتِ پنج و نیم گرفتش. گفت گاری‌اش گیر کرده.'], { s: 'a', t: '(گاری‌اش گیر کرده بود؟ امروز همه‌ی گاری‌ها راه می‌روند.)', give: 'k4noori' }, { go: 'noo_hub' }],
    noo_vafa: [{ set: 'nooVafa' }, ['o', 'آقای وفا؟ بلیتِ اصفهان خریده؛ ساعتِ هفت. با پولِ نو، اسکناس‌های تانخورده.'], { go: 'noo_hub' }],
    vaf: [['v', 'شما هم منتظرِ قطارید؟ من اصفهان می‌روم؛ عروسیِ خواهرزاده‌ام است.'], { go: 'vaf_hub' }],
    vaf_again: [['v', 'قطارِ من ساعتِ هفت است؛ هنوز وقت دارم.'], { go: 'vaf_hub' }],
    vaf_hub: [{ s: 'a', t: '(مردِ کلاه‌شاپو چمدانِ قرمزش را محکم گرفته است.)', c: [
                { t: 'بلیتتان را می‌بینم؟', go: 'vaf_ticket', if: function () { return !has('k4vafa'); } },
                { t: 'این اسکناس‌های نو از کجا آمده؟', go: 'vaf_money', if: function () { return F.nooVafa && !F.vafMoney; } },
                { t: 'سفرِ خوش.' }
            ] }],
    vaf_ticket: [['v', 'البته. بفرمایید.'], { s: 'a', t: 'بلیتِ تهران — اصفهان، ساعتِ هفت. به قطارِ مشهد ربطی ندارد.', give: 'k4vafa' }, { go: 'vaf_hub' }],
    vaf_money: [{ set: 'vafMoney' }, ['v', 'از بانک! کادوی عروسی است؛ آدم که پولِ کهنه کادو نمی‌دهد.'], { go: 'vaf_hub' }],
    gho: [['g', 'جا باز کنید، آقا! بار دارم.'], { go: 'gho_hub' }],
    gho_again: [['g', 'باز شما؟'], { go: 'gho_hub' }],
    gho_hub: [{ s: 'a', t: '(غلام دست‌هایش را پشتش قایم کرده است.)', c: [
                { t: 'گاریِ سه مالِ توست؟', go: 'gho_cart', if: function () { return !F.ghoCart; } },
                { t: '(به دست‌هایش نگاه کن)', go: 'gho_hands', if: function () { return has('k4locker') && !has('k4hands'); } },
                { t: 'امروز صبح با بی‌سیم با کی حرف زدی؟', go: 'gho_radio', if: function () { return (has('k4radio') || has('k4noori')) && !F.ghoRadio; } },
                { t: 'کارت را بکن.' }
            ] }],
    gho_cart: [{ set: 'ghoCart' }, ['g', 'گاری‌ها مالِ راه‌آهن است. ولی آره، سه دستِ من است. چطور؟'], { go: 'gho_hub' }],
    gho_hands: [{ s: 'a', t: '(کفِ دست‌هایش سیاه است؛ روغنِ سیاهِ چرخ. همان روغنِ دستگیره‌ی کمدِ هفده.)', give: 'k4hands' }, ['g', 'باربرم دیگر! دستِ باربر تمیز نمی‌ماند.'], { go: 'gho_hub' }],
    gho_radio: [{ set: 'ghoRadio' }, ['g', 'بی‌سیم؟ ... با تعمیرکار. گاری‌ام گیر کرده بود.'], ['a', '(نگاهش به ساعت است. پنج و پنجاه و پنج.)'], { go: 'gho_hub' }],
    phone4: [
        { if: function () { return clueCount() < 4; }, s: 'a', t: 'تلفنِ پاسگاهِ ایستگاه. هنوز چیزی برای گفتن ندارم.' },
        { if: function () { return clueCount() >= 4; }, s: 'a', t: 'به پاسگاه زنگ بزنم؟ چه کسی پاکت را از کمدِ هفده برداشته؟', c: [
                { t: 'غلامِ باربر', go: 'acc4' }, { t: 'آقای وفا', go: 'end4_v' }, { t: 'خانم نوری', go: 'end4_o' }, { t: 'هنوز نه.' }
            ] }
    ],
    acc4: [{ if: strong4, go: 'end4_good' }, { go: 'end4_weak' }],
    end4_good: [
        ['a', '«غلام، باربر. پاکت را از کمدِ هفده برداشت و زیرِ چمدان‌های گاریِ سه قایم کرد.»'],
        { if: function () { return has('k4hands'); }, s: 'a', t: 'روغنِ دستش روی دستگیره‌ی کمد مانده بود.' },
        { if: function () { return has('k4radio'); }, s: 'a', t: 'و بی‌سیمِ سرویس، صدایش را برای من هم پخش کرد.' },
        ['g', '... مردی با انگشترِ سنگِ ماه پولم را داد. گفت فقط یک پاکت است؛ برسانم به قطار.'],
        ['a', 'در پاکت، عکس‌های رضا بود؛ و یک کارتِ ویزیت: «منصور کیان‌فر — برج‌سازانِ ماه‌نشان».'],
        ['a', 'پشتِ کارت، با خطِ خودِ کیان‌فر: «بتن را عوض کنید. کسی نفهمد.»'],
        { end: 'good4' }
    ],
    end4_weak: [['a', '«باربر را بگیرید.»'], ['g', 'کدام پاکت؟ من بار جابه‌جا می‌کنم، آقا!'], ['a', 'بی‌پاکت، حرفم باد بود. ساعتِ شش و ده، قطار سوت کشید و رفت.'], { end: 'weak4' }],
    end4_v: [['a', '«آقای وفا را بازداشت کنید.»'], ['v', 'برای کادوی عروسی؟!'], ['a', 'اسکناسِ نو جرم نیست. و پاکت، زیرِ چمدانی دیگر، به مشهد رفت.'], { end: 'wrong4v' }],
    end4_o: [['a', '«خانم نوری...»'], ['o', 'من فقط بلیت می‌فروشم، کارآگاه.'], ['a', 'و پاکت، سوارِ قطار شد.'], { end: 'wrong4o' }]
});
Object.assign(ENDINGS, {
    good4: { t: 'پاکتِ گمشده', s: 'پاکت پیدا شد؛ ردِ منصور کیان‌فر.', c: '#9ab8ff', good: true },
    weak4: { t: 'سوتِ قطار', s: 'بی‌پاکت، مدرکی نبود.', c: '#ffbf69' },
    wrong4v: { t: 'اسکناسِ نو', s: 'پاکت به مشهد رفت.', c: '#ffb08a' },
    wrong4o: { t: 'باجه‌ی بسته', s: 'پاکت به مشهد رفت.', c: '#8fe0e0' }
});
Object.assign(ACT, {
    locker17: function () { return has('k4locker') ? 'locker17b' : 'locker17'; }, board4: function () { return has('k4board') ? 'board4b' : 'board4'; }, clock4: function () { return 'clock4'; }, train4: function () { return 'train4'; },
    cart3: function () { return 'cart3'; }, env4: function () { return has('k4env') ? 'env4b' : 'env4'; }, radio4: function () { return has('k4radio') ? 'radio4b' : 'mini:tuner4'; }, phone4: function () { return 'phone4'; },
    noori: function () { return F.nooMet ? 'noo_again' : (G.flags.nooMet = true, 'noo'); },
    vafa: function () { return F.vafMet ? 'vaf_again' : (G.flags.vafMet = true, 'vaf'); },
    gholam: function () { return F.ghoMet ? 'gho_again' : (G.flags.ghoMet = true, 'gho'); }
});
MINI_F.tuner4 = function () { return makeTuner({ freq: 147.3, clue: 'k4radio', dialog: 'radio4_done', msg: '«... بسته تو گاریِ سه‌ست، زیرِ چمدونِ قهوه‌ای. ساعتِ شش می‌رسونمش به واگنِ بار. به کسی نگو.»' }); };
// ================= case 5: the tower's building site =================
function buildSite() {
    return buildScene({
        id: 'site', name: 'کارگاهِ برجِ ماه‌نشان', w: 600, seed: 505, spawn: 30,
        out: { ground: 'mud' }, skyGrad: makeSkyGrad([[0, '#4a5264'], [0.6, '#7e8494'], [1, '#a4a6b0']]), noMoon: true, skyDrop: 14, haze: 'rgba(150,156,172,0.55)',
        props: [
            ['craneBg', { x: 470 }], ['skeleton', { x: 190, w: 190, top: 24 }],
            ['fence', { x: 0, w: 120, sign: 'برجِ ماه‌نشان', sign2: 'کارفرما: منصور کیان‌فر', signX: 22 }],
            ['container', { x: 130, w: 70, lit: function () { return has('k5power'); } }], ['fusebox', { x: 210, lit: function () { return has('k5power'); } }], ['workLamp', { x: 236 }],
            ['cementBags', { x: 250 }], ['column', { x: 300, w: 14, top: 40, rebar: true, crack: true }], ['column', { x: 360, w: 14, top: 40, rebar: true }],
            ['scaffold', { x: 392, w: 60, top: 40 }], ['fireBarrel', { x: 470 }], ['van', { x: 512 }]
        ],
        npcs: [npc('e', 150), npc('f', 336), npc('r', 492)],
        lights: [
            { x: 477, y: 134, r: 95, c: [255, 128, 45], i: 0.9, f: 'fire', z: 27, sz: 3 },
            { x: 236, y: 126, r: 160, c: [255, 240, 210], i: 1, f: 'steady', z: 31, on: function () { return has('k5power'); } },
            { x: 175, y: 127, r: 60, c: [255, 230, 170], i: 0.7, f: 'steady', ns: 1, on: function () { return has('k5power'); } }
        ],
        targets: [
            { id: 'sign5', x: 55, y: 108, w: 76, h: 26, n: 'تابلوی کارگاه' },
            { id: 'office5', x: 165, y: 108, w: 70, h: 52, n: 'دفترِ کارگاه' },
            { id: 'parsa', x: 150, y: 124, w: 13, h: 36, n: 'مهندس پارسا', npc: 1 },
            { id: 'fuse5', x: 216, y: 114, w: 16, h: 46, n: 'جعبه‌فیوز' },
            { id: 'bags5', x: 266, y: 134, w: 36, h: 24, n: 'کیسه‌های سیمان' },
            { id: 'crack5', x: 307, y: 112, w: 16, h: 30, n: 'ترکِ ستون', hidden: 1, clue: 'k5crack' },
            { id: 'jafar', x: 336, y: 122, w: 13, h: 38, n: 'اوستا جعفر', npc: 1 },
            { id: 'rahman', x: 492, y: 124, w: 13, h: 36, n: 'رحمانِ نگهبان', npc: 1 },
            { id: 'van5', x: 542, y: 116, w: 60, h: 44, n: 'وانتِ «بتنِ ارزان»' }
        ],
        ambient: [118, 120, 134], zoom: 1.12, phoneZoom: 1.14
    });
}
Object.assign(CLUES, {
    k5power: { n: 'فیوزهای جابه‌جا', d: 'کسی عمداً برقِ دفتر را قطع کرده بود.', i: 'fuse' },
    k5cubes: { n: 'نمونه‌های بتن', d: 'دو دسته: «برای آزمایشگاه» و «واقعی — دست نزن»؛ دست‌خطِ جعفر.', i: 'cube' },
    k5bags: { n: 'کیسه‌های سیمان', d: 'نیمی از کیسه‌ها ماسه است؛ مهرِ «بتنِ ارزان».', i: 'bag' },
    k5crack: { n: 'ترکِ ستون', d: 'ترکِ مویی در ستونِ همکف؛ بتن زود خشک شده.', i: 'crack' },
    k5guard: { n: 'شهادتِ نگهبان', d: 'ساعتِ پنج وانتِ «بتنِ ارزان» آمد؛ جعفر در را باز کرد.', i: 'test' },
    k5receipt: { n: 'رسیدِ خرید', d: 'سیصد کیسه، تحویلِ ساعتِ پنج؛ امضا: جعفر. مهرِ شرکتِ کیان‌فر.', i: 'print' },
    k5eng: { n: 'اعترافِ مهندس', d: '«گزارش‌ها را امضا کردم؛ نمونه‌ها را جعفر می‌برد.»', i: 'test' }
});
var strong5 = function () { return has('k5cubes') && (has('k5guard') || has('k5receipt')) && (has('k5bags') || has('k5crack')); };
Object.assign(DLG, {
    intro5: [
        ['a', 'کارگاهِ برجِ ماه‌نشان، ساعتِ هشت و ده دقیقه‌ی صبح. برف هنوز می‌بارد.'],
        ['a', 'پشتِ کارتِ کیان‌فر نوشته بود: «بتن را عوض کنید. کسی نفهمد.» اگر بتنِ این برج قلابی باشد، یک روز روی سرِ مردم خراب می‌شود.'],
        ['a', 'برقِ دفترِ کارگاه قطع است. انگار کسی نمی‌خواهد امروز چیزی دیده شود.']
    ],
    sign5: [['a', '«برجِ مسکونیِ ماه‌نشان — بیست طبقه — کارفرما: منصور کیان‌فر». زیرش: «ایمنی، اولویتِ ماست.»'], ['a', 'چه شوخیِ تلخی.']],
    office5_dark: [['a', 'دفترِ کارگاه. در باز است، اما داخل تاریکِ تاریک. برق قطع است.'], ['a', 'جعبه‌فیوزِ کنارِ دفتر را باید ببینم.']],
    power5: [{ s: 'a', t: 'فیوزها را کسی عمداً جابه‌جا کرده بود. برق برگشت؛ چراغِ دفتر روشن شد.', give: 'k5power' }],
    office5: [
        ['a', 'حالا دفتر روشن است. روی میز، گزارش‌های آزمایشگاه؛ همه «قبول».'],
        ['a', 'در یخچالِ کوچکِ گوشه، دو دسته نمونه‌ی بتن. روی یکی نوشته: «برای آزمایشگاه». روی دیگری: «واقعی — دست نزن».'],
        { s: 'a', t: 'نمونه‌های «واقعی» با فشارِ انگشت خرد می‌شوند. دست‌خطِ روی برچسب... اوستا جعفر.', give: 'k5cubes' }
    ],
    bags5: [['a', 'کیسه‌های سیمان. یکی را پاره می‌کنم.'], { s: 'a', t: 'نصفش ماسه است! روی کیسه مهرِ «بتنِ ارزان» خورده.', give: 'k5bags' }],
    bags5b: [['a', 'ماسه به جای سیمان.']],
    crack5: [['a', 'ترکی باریک مثلِ مو، از پایینِ ستون تا نیمه.'], { s: 'a', t: 'بتن زود خشک شده و ترک خورده. این ستون قرار است بیست طبقه را نگه دارد.', give: 'k5crack' }],
    crack5b: [['a', 'ترکِ ستون. هر روز کمی بزرگ‌تر.']],
    van5: [['a', 'وانتِ «بتنِ ارزان». درِ داشبورد باز است.'], { s: 'a', t: 'رسیدِ خرید: «سیصد کیسه — تحویل ساعتِ پنج صبح». امضای تحویل‌گیرنده: جعفر. مهرِ شرکتِ کیان‌فر.', give: 'k5receipt' }],
    van5b: [['a', 'وانتِ خالی. رسید پیشِ من است.']],
    par: [['e', 'شما پلیسید؟ ... من فقط مهندسِ ناظرم. من فقط امضا می‌کنم.'], { go: 'par_hub' }],
    par_again: [['e', 'باز هم سؤال؟'], { go: 'par_hub' }],
    par_hub: [{ s: 'a', t: '(مهندس پارسا عینکش را مدام پاک می‌کند.)', c: [
                { t: 'این گزارش‌های «قبول» را چه کسی امضا کرده؟', go: 'par_sign', if: function () { return !has('k5eng'); } },
                { t: 'چرا برقِ دفتر قطع بود؟', go: 'par_power', if: function () { return !F.parPower; } },
                { t: 'ممنون، مهندس.' }
            ] }],
    par_sign: [['e', 'من. ولی نمونه‌ها را خودم آزمایشگاه نمی‌برم؛ اوستا جعفر می‌برد. من فقط برگه‌ی نتیجه را امضا می‌کنم.'], { s: 'e', t: 'می‌دانستم یک جای کار می‌لنگد... ولی کیان‌فر گفت اگر حرف بزنم، دیگر در این شهر کار پیدا نمی‌کنم.', give: 'k5eng' }, { go: 'par_hub' }],
    par_power: [{ set: 'parPower' }, ['e', 'صبح که آمدم قطع بود. اوستا جعفر گفت «برف زده به سیم‌ها».'], { go: 'par_hub' }],
    jaf: [['f', 'این‌جا کارگاه است، نه کلانتری. کلاهِ ایمنی‌ات کجاست، آقا؟'], { go: 'jaf_hub' }],
    jaf_again: [['f', 'باز چه می‌خواهی؟'], { go: 'jaf_hub' }],
    jaf_hub: [{ s: 'a', t: '(اوستا جعفر دست به کمر ایستاده است.)', c: [
                { t: 'ساعتِ پنجِ صبح کجا بودی؟', go: 'jaf_where', if: function () { return !F.jafWhere; } },
                { t: '«واقعی — دست نزن». دست‌خطِ توست؟', go: 'jaf_label', if: function () { return has('k5cubes') && !F.jafLabel; } },
                { t: 'کارت را بکن.' }
            ] }],
    jaf_where: [{ set: 'jafWhere' }, ['f', 'خانه، خواب. من ساعتِ هفت می‌آیم؛ مثلِ هر روز.'], { go: 'jaf_hub' }],
    jaf_label: [{ set: 'jafLabel' }, ['f', '... خیلی‌ها مثلِ من می‌نویسند.'], ['a', '(دستش را مشت کرده. روی مچش گردِ سیمان.)'], { go: 'jaf_hub' }],
    rah5: [
        ['r', 'سلام، سرکار. چای می‌خوری؟ آتشِ این بشکه تنها چیزِ گرمِ این کارگاه است.'],
        { s: 'a', t: '(نگهبان دست‌هایش را روی آتش گرفته است.)', c: [
                { t: 'یک استکان می‌خورم. شبِ سختی بود؟', go: 'rah5_kind' },
                { t: 'چای نه؛ جواب. امشب چه دیدی؟', go: 'rah5_rude' }
            ] }
    ],
    rah5_kind: [
        ['r', 'سخت؟ ساعتِ پنج یک وانت آمد، «بتنِ ارزان». اوستا جعفر خودش در را باز کرد؛ گفت به کسی نگویم.'],
        { s: 'r', t: 'کیسه‌ها را گذاشتند کنارِ ستون‌ها و رفتند. اوستا هم رفت و ساعتِ هفت دوباره آمد؛ انگار تازه رسیده.', give: 'k5guard' }
    ],
    rah5_rude: [{ set: 'rah5Rude' }, ['r', 'جواب؟ من نگهبانم، سرکار، نه جاسوس. چایت هم سرد شد.']],
    rah5_again: [{ s: 'r', t: 'باز آمدی؟', c: [{ t: 'ببخش. آن چای هنوز هست؟', go: 'rah5_kind' }, { t: '(برو)' }] }],
    rah5_done: [['r', 'خدا کند این برج هیچ‌وقت کسی را زیرِ خودش نگیرد.']],
    phone5: [
        { if: function () { return clueCount() < 4; }, s: 'a', t: 'تلفنِ دفترِ کارگاه. هنوز مدرک کم دارم.' },
        { if: function () { return clueCount() >= 4; }, s: 'a', t: 'تلفنِ دفتر. چه کسی نمونه‌های بتن را عوض کرده؟', c: [
                { t: 'اوستا جعفر', go: 'acc5' }, { t: 'مهندس پارسا', go: 'end5_e' }, { t: 'رحمانِ نگهبان', go: 'end5_r' }, { t: 'هنوز نه.' }
            ] }
    ],
    acc5: [{ if: strong5, go: 'end5_good' }, { go: 'end5_weak' }],
    end5_good: [
        ['a', '«اوستا جعفر. نمونه‌های واقعی را قایم می‌کرد و نمونه‌های تقلبی را به آزمایشگاه می‌برد.»'],
        { if: function () { return has('k5receipt'); }, s: 'a', t: 'رسیدِ «بتنِ ارزان» با امضای خودش در داشبوردِ وانت بود.' },
        { if: function () { return has('k5guard'); }, s: 'a', t: 'و نگهبان دیده بود که ساعتِ پنج در را برای وانت باز کرد.' },
        ['f', '... من دستور گرفتم! خودِ کیان‌فر گفت. گفت هر کیسه‌ی ماسه یعنی پولِ بیشتر برای همه.'],
        ['f', 'امشب در باغش مهمانی دارد. دفترِ سیاهش در گاوصندوقِ پشتِ تابلوی بزرگِ سالن است؛ همه‌ی پرداخت‌ها آن‌جاست.'],
        ['a', 'سازنده‌ای که به بتن دروغ بگوید، به همه دروغ می‌گوید.'],
        { end: 'good5' }
    ],
    end5_weak: [['a', '«اوستا جعفر را ببرید.»'], ['f', 'به جرمِ چه؟ کیسه‌ی سیمان خریدن؟'], ['a', 'بی‌نمونه و بی‌رسید، حرفم یک حدس بود. برج بالا رفت.'], { end: 'weak5' }],
    end5_e: [['a', '«مهندس پارسا را بازداشت کنید.»'], ['e', 'من امضا کردم... ولی من نبودم که ماسه آورد.'], ['a', 'امضایش پای کاغذ بود؛ اما دستی که ماسه ریخت آزاد ماند.'], { end: 'wrong5e' }],
    end5_r: [['a', '«نگهبان را ببرید.»'], ['r', 'من که چای تعارف کردم، سرکار...'], ['a', 'و وانتِ بعدی، ساعتِ پنجِ صبحِ فردا، دوباره آمد.'], { end: 'wrong5r' }]
});
Object.assign(ENDINGS, {
    good5: { t: 'بتنِ تقلبی', s: 'جعفر اعتراف کرد؛ دستور از کیان‌فر بود.', c: '#ffd060', good: true },
    weak5: { t: 'برف روی سیمان', s: 'بی‌مدرک، برج بالا رفت.', c: '#ffbf69' },
    wrong5e: { t: 'امضای ترسیده', s: 'دستی که ماسه ریخت آزاد ماند.', c: '#c8e0ff' },
    wrong5r: { t: 'چای سرد', s: 'مقصر آزاد ماند.', c: '#a8d8a0' }
});
Object.assign(ACT, {
    sign5: function () { return 'sign5'; }, fuse5: function () { return has('k5power') ? 'power5' : 'mini:wires5'; },
    office5: function () { return !has('k5power') ? 'office5_dark' : !has('k5cubes') ? 'office5' : 'phone5'; },
    bags5: function () { return has('k5bags') ? 'bags5b' : 'bags5'; }, crack5: function () { return has('k5crack') ? 'crack5b' : 'crack5'; }, van5: function () { return has('k5receipt') ? 'van5b' : 'van5'; },
    parsa: function () { return F.parMet ? 'par_again' : (G.flags.parMet = true, 'par'); },
    jafar: function () { return F.jafMet ? 'jaf_again' : (G.flags.jafMet = true, 'jaf'); },
    rahman: function () { return has('k5guard') ? 'rah5_done' : F.rah5Met ? 'rah5_again' : (G.flags.rah5Met = true, 'rah5'); }
});
MINI_F.wires5 = function () { return makeWires({ clue: 'k5power', dialog: 'power5' }); };
// ================= case 6: the villa at Niavaran =================
function buildVilla() {
    return buildScene({
        id: 'villa', name: 'باغِ کیان‌فر — نیاوران', w: 580, seed: 606, indoor: true, spawn: 60,
        room: { wall: '#4a2a30', wall2: '#3a2418', trim: '#c8a040', pattern: 'damask', floor: 'wood', floorCol: '#6a4428', ceil: '#1a1012' },
        props: [
            ['window', { x: 24, y: 88, w: 40, h: 36, outside: 'night' }], ['plant', { x: 80 }], ['bookshelf', { x: 92, w: 30, h: 34 }],
            ['desk', { x: 140, w: 52, col: '#4a2a18' }], ['lampDesk', { x: 182, col: '#6a1a1a' }], ['basket', { x: 198 }],
            ['painting', { x: 236, y: 84, w: 50, h: 34 }], ['fireplace', { x: 312 }], ['clockTall', { x: 384 }], ['piano', { x: 418 }],
            ['sofa', { x: 480, w: 40, col: '#5a1a2a' }], ['desk', { x: 534, w: 30, col: '#4a2a18' }], ['phoneDesk', { x: 544, col: '#c8a040' }],
            ['chandelier', { x: 270, y: 70 }], ['chandelier', { x: 470, y: 70 }]
        ],
        npcs: [npc('q', 170), npc('x', 300), npc('c', 506)],
        lights: [
            { x: 270, y: 76, r: 170, c: [255, 220, 170], i: 0.85, f: 'lamp', z: 20 }, { x: 470, y: 76, r: 170, c: [255, 220, 170], i: 0.8, f: 'steady', z: 20 },
            { x: 330, y: 138, r: 120, c: [255, 130, 50], i: 0.9, f: 'fire', z: 7 }, { x: 182, y: 134, r: 70, c: [255, 210, 150], i: 0.7, f: 'steady', z: 13 },
            { x: 44, y: 100, r: 80, c: [140, 170, 255], i: 0.5, f: 'steady', z: 4, back: 1, sz: 3 }
        ],
        targets: [
            { id: 'window6', x: 44, y: 86, w: 44, h: 40, n: 'پنجره‌ی باغ' },
            { id: 'shelf6', x: 107, y: 112, w: 30, h: 34, n: 'کتابخانه' },
            { id: 'negar', x: 170, y: 124, w: 13, h: 36, n: 'نگار', npc: 1 },
            { id: 'basket6', x: 202, y: 141, w: 12, h: 11, n: 'سبدِ کاغذِ میزِ کار' },
            { id: 'painting6', x: 261, y: 81, w: 56, h: 40, n: 'تابلوی بزرگ' },
            { id: 'naser', x: 300, y: 122, w: 13, h: 38, n: 'ناصر', npc: 1 },
            { id: 'fire6', x: 330, y: 118, w: 42, h: 28, n: 'شومینه' },
            { id: 'ash6', x: 330, y: 150, w: 36, h: 8, n: 'برگی در خاکستر', hidden: 1, clue: 'k6fire' },
            { id: 'clock6', x: 389, y: 112, w: 14, h: 34, n: 'ساعتِ ایستاده' },
            { id: 'piano6', x: 435, y: 114, w: 38, h: 32, n: 'پیانو' },
            { id: 'shams', x: 506, y: 124, w: 13, h: 36, n: 'دکتر شمس', npc: 1 },
            { id: 'phone6', x: 549, y: 131, w: 13, h: 9, n: 'تلفنِ سالن' }
        ],
        ambient: [78, 64, 66], zoom: 1.5, viewTop: 56
    });
}
Object.assign(CLUES, {
    k6letter: { n: 'نامه‌ی پاره', d: 'رمزِ گاوصندوق زیرِ ماژیک: ۱۲ — ۳۰ — ۷.', i: 'code' },
    k6ledger: { n: 'دفترِ سیاه', d: 'پرداخت به نادری، رستگار و جعفر؛ همه با امضای «م.ک».', i: 'ledger' },
    k6fire: { n: 'برگِ نیم‌سوخته', d: 'برگی از دفترِ سیاه در خاکستر: «کارآگاه را از سرِ راه بردارید».', i: 'print' },
    k6ash: { n: 'دستکشِ دوده‌ای', d: 'نوکِ انگشت‌های دستکشِ سفیدِ ناصر سیاه از دوده است.', i: 'gloves' },
    k6negar: { n: 'شهادتِ نگار', d: 'امشب فقط ناصر اجازه داشت به شومینه نزدیک شود.', i: 'test' },
    k6call: { n: 'شماره‌گیریِ دوباره', d: 'کسی از تلفنِ سالن به کیان‌فر خبر داده: «ناصر؟ نگذار دفتر را پیدا کند.»', i: 'calllog' }
});
var strong6 = function () { return has('k6ledger') && (has('k6ash') || has('k6negar')) && (has('k6fire') || has('k6call')); };
Object.assign(DLG, {
    intro6: [
        ['a', 'باغِ منصور کیان‌فر، نیاوران. ساعتِ نه و نیمِ شب؛ شبِ بعد از یلدا.'],
        ['a', 'صدای ویولن از سالنِ اصلی می‌آید. مهمانی است و من دعوت نیستم؛ از پنجره‌ی باغ آمده‌ام تو.'],
        ['a', 'جعفر گفت دفترِ سیاه در گاوصندوقِ پشتِ تابلوی بزرگ است. و کسی امشب دارد کاغذ در شومینه می‌سوزاند.']
    ],
    window6: [['a', 'از همین پنجره آمدم. ردِ برفِ کفشم هنوز روی فرش است؛ باید عجله کنم.']],
    shelf6: [['a', 'کتاب‌هایی که هیچ‌کس نخوانده؛ جلدهای چرمیِ یک‌شکل. کتابخانه‌ی آدم‌هایی که کتاب را برای دیوار می‌خرند.']],
    painting6_locked: [['a', 'تابلوی بزرگِ منظره. کمی از دیوار فاصله دارد... پشتش یک گاوصندوقِ قفل‌دار است.'], ['a', 'رمز می‌خواهد: سه عدد. باید جایی نوشته شده باشد.']],
    painting6_done: [['a', 'گاوصندوقِ باز. دفترِ سیاه پیشِ من است.']],
    letter6: [['a', 'پشتِ نورِ چراغ، زیرِ خطِ ماژیک، سه عدد پیدا می‌شود: دوازده... سی... هفت.'], { s: 'a', t: 'نامه از کیان‌فر به ناصر است: «رمزِ تازه‌ی گاوصندوق. بعد از خواندن بسوزان.»', give: 'k6letter' }],
    ledger6: [
        ['a', 'در گاوصندوق، دفترِ سیاه؛ با جلدِ چرمی و قفلِ کوچک.'],
        { s: 'a', t: 'پرداخت‌ها: «ن. — ماهانه». «ر. — یلدا، کارِ کوچه». «ج. — تعویضِ بتن». همه با امضای «م.ک».', give: 'k6ledger' },
        ['a', 'اما چند برگِ آخرش کنده شده. کسی زودتر از من این‌جا بوده.']
    ],
    fire6: [['a', 'شومینه‌ی سنگی. بوی کاغذِ سوخته می‌دهد؛ نه چوب.'], { if: function () { return !has('k6fire'); }, s: 'a', t: 'شاید چیزی از آتش جا مانده باشد؛ باید جلوی شومینه را با چراغ‌قوه نگاه کنم.' }],
    ash6: [['a', 'میانِ خاکسترِ جلوی شومینه، یک برگِ نیم‌سوخته.'], { s: 'a', t: 'برگی از دفترِ سیاه! تاریخِ امشب و یک خط: «کارآگاه را از سرِ راه بردارید».', give: 'k6fire' }],
    ash6b: [['a', 'خاکسترِ دفترِ سیاه.']],
    clock6: [['a', 'ساعتِ ایستاده‌ی قدیمی. تیک‌تاکش از صدای ویولن هم بلندتر است.']],
    piano6: [['a', 'پیانوی سیاه. رویش یک عکسِ قاب‌شده: کیان‌فر و سرگرد نادری، خندان، سرِ سفره‌ی یلدای پارسال.']],
    phone6: [
        ['a', 'تلفنِ سالن. دکمه‌ی «شماره‌گیریِ دوباره» را می‌زنم...'],
        ['n', '«ناصر؟ ... کارآگاه هنوز آن‌جاست؟ نگذار دفتر را پیدا کند.» (تق.)'],
        { s: 'a', t: 'صدای کیان‌فر. کسی از همین تلفن امشب به او خبر داده که من این‌جا هستم.', give: 'k6call' }
    ],
    phone6_hub: [
        { if: function () { return clueCount() < 4; }, s: 'a', t: 'تلفنِ سالن. هنوز برای گزارش زود است.' },
        { if: function () { return clueCount() >= 4; }, s: 'a', t: 'به مرکز زنگ بزنم؟ چه کسی امشب دفترِ سیاه را می‌سوزاند؟', c: [
                { t: 'ناصر، پیشخدمت', go: 'acc6' }, { t: 'نگار، منشی', go: 'end6_q' }, { t: 'دکتر شمس', go: 'end6_c' }, { t: 'هنوز نه.' }
            ] }
    ],
    acc6: [{ if: strong6, go: 'end6_good' }, { go: 'end6_weak' }],
    nas: [['x', 'آقا، این قسمت از سالن مخصوصِ مهمان‌ها نیست. کارتِ دعوتتان را می‌بینم؟'], { go: 'nas_hub' }],
    nas_again: [['x', 'هنوز این‌جایید، آقا؟'], { go: 'nas_hub' }],
    nas_hub: [{ s: 'a', t: '(ناصر دست‌هایش را پشتش گرفته؛ دستکش‌های سفید.)', c: [
                { t: 'امشب چه کسی شومینه را روشن کرد؟', go: 'nas_fire', if: function () { return !F.nasFire; } },
                { t: '(به دستکش‌هایش نگاه کن)', go: 'nas_gloves', if: function () { return !has('k6ash'); } },
                { t: 'کیان‌فر کجاست؟', go: 'nas_boss', if: function () { return !F.nasBoss; } },
                { t: 'بعداً حرف می‌زنیم.' }
            ] }],
    nas_fire: [{ set: 'nasFire' }, ['x', 'من، آقا. سالن سرد بود.'], { go: 'nas_hub' }],
    nas_gloves: [['a', '(دستکشِ سفید، اما نوکِ انگشت‌ها سیاه از دوده؛ مثلِ کسی که کاغذ در آتش هل داده.)'], { s: 'x', t: '... هیزم، آقا. هیزمِ خیس دوده دارد.', give: 'k6ash' }, { go: 'nas_hub' }],
    nas_boss: [{ set: 'nasBoss' }, ['x', 'آقای کیان‌فر خسته بودند؛ زودتر رفتند. کجا، نمی‌دانم.'], { go: 'nas_hub' }],
    neg: [
        ['q', 'شما همان کارآگاهید، نه؟ عکستان در روزنامه‌ی صبح بود.'],
        { s: 'q', t: 'آرام‌تر حرف بزنید. این‌جا دیوارها گوش دارند.', c: [
                { t: 'شما منشیِ کیان‌فر هستید. کمکم می‌کنید؟', go: 'neg_help' },
                { t: 'شما هم جزوِ دارودسته‌اید؟', go: 'neg_hard' }
            ] }
    ],
    neg_help: [{ set: 'negOk' }, ['q', 'پنج سال برایش نامه نوشتم و چیزی نپرسیدم. بعد از خبرِ رضا کاوه... دیگر نمی‌توانم.'], { go: 'neg_hub' }],
    neg_hard: [{ set: 'negCold' }, ['q', 'اگر این‌طور فکر می‌کنید، خودتان پیدا کنید.']],
    neg_cold: [{ s: 'q', t: 'باز چه می‌خواهید؟', c: [{ t: 'ببخشید. به کمکتان احتیاج دارم.', go: 'neg_help2' }, { t: '(برو)' }] }],
    neg_help2: [{ fx: function () { G.flags.negCold = false; G.flags.negOk = true; } }, ['q', '... باشد. برای رضا.'], { go: 'neg_hub' }],
    neg_again: [['q', 'آرام‌تر...'], { go: 'neg_hub' }],
    neg_hub: [{ s: 'q', t: 'چه می‌خواهید بدانید؟', c: [
                { t: 'امشب چه کسی به شومینه دست زد؟', go: 'neg_fire', if: function () { return !has('k6negar'); } },
                { t: 'کیان‌فر رمزِ گاوصندوق را کجا می‌نویسد؟', go: 'neg_code', if: function () { return !F.negCode; } },
                { t: 'ممنون، نگار.' }
            ] }],
    neg_fire: [['q', 'فقط ناصر. آقای کیان‌فر قبل از رفتن گفت: «امشب هیچ‌کس جز ناصر نزدیکِ شومینه نرود.»'], { s: 'q', t: 'ناصر یک بغل کاغذ از اتاقِ کار آورد و ریخت توی آتش.', give: 'k6negar' }, { go: 'neg_hub' }],
    neg_code: [{ set: 'negCode' }, ['q', 'رمز را روی کاغذ برای ناصر می‌نویسد؛ ناصر هم کاغذ را پاره می‌کند و می‌اندازد در سبدِ میزِ کار.'], ['q', 'ناصر همیشه تنبل‌تر از آن است که بسوزاندش.'], { go: 'neg_hub' }],
    sha: [['c', 'به‌به! یک چهره‌ی تازه! شما هم سرمایه‌گذارید؟ برجِ ماه‌نشان، آقا! طبقه‌ی بیستم را من پیش‌خرید کرده‌ام!'], { go: 'sha_hub' }],
    sha_again: [['c', 'طبقه‌ی بیستم، آقا! منظره‌اش را ببینید!'], { go: 'sha_hub' }],
    sha_hub: [{ s: 'c', t: 'چه می‌خواستید بپرسید؟', c: [
                { t: 'امشب کیان‌فر را دیدید؟', go: 'sha_kf', if: function () { return !F.shaKf; } },
                { t: 'ناصر امشب چه کار می‌کرد؟', go: 'sha_nas', if: function () { return !F.shaNas; } },
                { t: 'خوش بگذرد.' }
            ] }],
    sha_kf: [{ set: 'shaKf' }, ['c', 'ساعتِ نه تلفن زنگ زد؛ ناصر جواب داد. بعد آقای کیان‌فر رنگش پرید و با وکیلش رفت. گفت می‌رود «برج را ببیند»! نصفه‌شب!'], { go: 'sha_hub' }],
    sha_nas: [{ set: 'shaNas' }, ['c', 'ناصر؟ مدام این‌طرف و آن‌طرف می‌رفت. فکر کنم آتشِ شومینه را خیلی دوست دارد.'], { go: 'sha_hub' }],
    end6_good: [
        ['a', '«ناصر. امشب او برگ‌های دفترِ سیاه را در شومینه سوزاند.»'],
        { if: function () { return has('k6call'); }, s: 'a', t: 'و از تلفنِ سالن به کیان‌فر خبر داد که من این‌جا هستم.' },
        ['x', '... من سی سال برای آقا کار کرده‌ام. آدم به صاحبش پشت نمی‌کند.'],
        ['a', 'دفترِ سیاه در دستِ من است؛ اسمِ همه در آن هست. جز یک نفر که هنوز آزاد است.'],
        ['q', '(آهسته) کیان‌فر رفت برج. به وکیلش گفت «صبح، قبل از این‌که بفهمند، قراردادِ فروش را امضا می‌کنیم و می‌رویم».'],
        { end: 'good6' }
    ],
    end6_weak: [['a', '«ناصر را ببرید.»'], ['x', 'به جرمِ روشن کردنِ شومینه، آقا؟'], ['a', 'بی‌دفتر، حرفم به دیوارهای این باغ خورد و برگشت.'], { end: 'weak6' }],
    end6_q: [['a', '«منشی را بازداشت کنید.»'], ['q', 'من که کمکتان کردم...'], ['a', 'و تنها کسی که حقیقت را می‌گفت، ساکت شد.'], { end: 'wrong6q' }],
    end6_c: [['a', '«دکتر شمس را ببرید.»'], ['c', 'من؟ من فقط طبقه‌ی بیستم را خریده‌ام!'], ['a', 'مهمان‌ها خندیدند. کیان‌فر آن شب از شهر رفت.'], { end: 'wrong6c' }]
});
Object.assign(ENDINGS, {
    good6: { t: 'دفترِ سیاه', s: 'ناصر بازداشت شد؛ کیان‌فر به برج رفته است.', c: '#ff9ac0', good: true },
    weak6: { t: 'آتشِ شومینه', s: 'بی‌دفتر، مدرکی نبود.', c: '#ffbf69' },
    wrong6q: { t: 'صدای خاموش', s: 'مقصر آزاد ماند.', c: '#ff9ac0' },
    wrong6c: { t: 'طبقه‌ی بیستم', s: 'کیان‌فر از شهر رفت.', c: '#c0c0ff' }
});
Object.assign(ACT, {
    window6: function () { return 'window6'; }, shelf6: function () { return 'shelf6'; }, basket6: function () { return 'mini:paper6'; }, fire6: function () { return 'fire6'; }, ash6: function () { return has('k6fire') ? 'ash6b' : 'ash6'; },
    painting6: function () { return has('k6ledger') ? 'painting6_done' : has('k6letter') ? 'mini:safe6' : 'painting6_locked'; },
    clock6: function () { return 'clock6'; }, piano6: function () { return 'piano6'; }, phone6: function () { return has('k6call') ? 'phone6_hub' : 'phone6'; },
    naser: function () { return F.nasMet ? 'nas_again' : (G.flags.nasMet = true, 'nas'); },
    negar: function () { return F.negCold ? 'neg_cold' : F.negMet ? 'neg_again' : (G.flags.negMet = true, 'neg'); },
    shams: function () { return F.shaMet ? 'sha_again' : (G.flags.shaMet = true, 'sha'); }
});
MINI_F.paper6 = function () { return makePaper({ title: 'نمای نزدیک: نامه‌ی پاره‌ی سبد', clue: 'k6letter', done: 'letter6', codeFa: '۱۲ — ۳۰ — ۷',
    lines: [['ناصر، رمزِ تازه:', 1, 'r'], ['بعد از خواندن بسوزان.', 38, 'r'], ['— م.ک', 48, 'l']], hid: '۱۲ ۳۰ ۷', water: 'دفترِ منصور کیان‌فر' }); };
MINI_F.safe6 = function () { return makeSafe({ code: [12, 30, 7], clue: 'k6ledger', dialog: 'ledger6' }); };
// ================= case 7: the rooftop at dawn =================
function buildRooftop() {
    return buildScene({
        id: 'rooftop', name: 'پشت‌بامِ برجِ ماه‌نشان — طبقه‌ی بیستم', w: 560, seed: 707, spawn: 500,
        out: { ground: 'roof' }, skyGrad: makeSkyGrad([[0, '#2a2a5a'], [0.3, '#8a5a8a'], [0.55, '#ff9a6a'], [0.8, '#ffd09a'], [1, '#ffe8c0']]), noMoon: true, noSnow: true, skyDrop: 58, haze: 'rgba(255,150,110,0.22)',
        props: [
            ['parapet', { w: 560 }], ['craneBase', { x: 90 }], ['waterTank', { x: 150 }], ['crates', { x: 222, w: 30, h: 16, briefcase: true }],
            ['generator', { x: 284 }], ['workLamp', { x: 330 }], ['column', { x: 382, w: 10, top: 70, rebar: true }], ['stairDoor', { x: 470 }]
        ],
        npcs: [npc('z', 200), npc('w', 306), npc('u', 420)],
        lights: [{ x: 330, y: 126, r: 120, c: [255, 240, 210], i: 0.8, f: 'steady', z: 31 }, { x: 490, y: 118, r: 70, c: [255, 220, 160], i: 0.6, f: 'steady', z: 31 }],
        targets: [
            { id: 'edge7', x: 36, y: 120, w: 40, h: 26, n: 'لبه‌ی بام' },
            { id: 'crane7', x: 94, y: 58, w: 30, h: 24, n: 'اتاقکِ جرثقیل' },
            { id: 'tank7', x: 166, y: 98, w: 34, h: 48, n: 'منبعِ آب' },
            { id: 'kianfar', x: 200, y: 120, w: 13, h: 40, n: 'منصور کیان‌فر', npc: 1 },
            { id: 'case7', x: 237, y: 134, w: 30, h: 12, n: 'کیفِ دستی' },
            { id: 'gen7', x: 297, y: 140, w: 28, h: 20, n: 'ژنراتور' },
            { id: 'sarami', x: 306, y: 124, w: 13, h: 36, n: 'وکیل صارمی', npc: 1 },
            { id: 'akbar', x: 420, y: 124, w: 13, h: 36, n: 'اکبرِ راننده', npc: 1 },
            { id: 'stairs7', x: 490, y: 106, w: 42, h: 54, n: 'درِ پلکان (پلیس منتظر است)' }
        ],
        ambient: [150, 124, 130], zoom: 1.12, phoneZoom: 1.14
    });
}
Object.assign(CLUES, {
    k7ring: { n: 'انگشترِ ماه', d: 'سنگِ ماهِ انگشترِ کیان‌فر؛ همان که در عکس بود.', i: 'ring' },
    k7crane: { n: 'دوربینِ رضا', d: 'رضا از اتاقکِ جرثقیل عکس می‌گرفت؛ دوربینش هنوز آن‌جاست.', i: 'camera' },
    k7driver: { n: 'اعترافِ راننده', d: '«رستگار را ساعتِ دوازده و چهل به کوچه بردم؛ به دستورِ آقا.» رمزِ کیف: ۲۵۰۱.', i: 'test' },
    k7lawyer: { n: 'قراردادِ فروش', d: 'امضای امروز ساعتِ هفت؛ فروشِ برج و فرار پیش از رسوایی.', i: 'print' },
    k7case: { n: 'کیفِ نگاتیوها', d: 'نگاتیوهای اصلی و نوارِ صدای کیان‌فر: «کارِ کوچه را امشب تمام کن.»', i: 'tape' }
});
var strong7 = function () { return has('k7case') && has('k7driver') && (has('k7ring') || has('k7crane')); };
Object.assign(DLG, {
    intro7: [
        ['a', 'پشت‌بامِ برجِ ماه‌نشان؛ طبقه‌ی بیستم. سپیده‌ی صبح. برف بالاخره بند آمده.'],
        ['a', 'کیان‌فر این‌جاست؛ با وکیلش و راننده‌اش. کیفِ نگاتیوهای اصلی را کنارِ خودش گذاشته.'],
        ['a', 'دفترِ سیاه دستِ من است، اما «م.ک» برای دادگاه کافی نیست. باید ثابت کنم دستورِ شبِ یلدا را خودش داده.'],
        ['n', 'پلیس پشتِ درِ پلکان منتظرِ علامتِ توست.']
    ],
    edge7: [['a', 'تهران زیرِ پایم؛ سفید و آرام. از این بالا، هیچ کوچه‌ای تاریک به نظر نمی‌رسد.']],
    tank7: [['a', 'منبعِ آب. رویش با اسپری نوشته‌اند: «ماه‌نشان — تحویل: بهار». بهارِ کدام سال؟']],
    gen7: [['a', 'ژنراتورِ کارگاه. هنوز گرم است؛ کسی امشب این‌جا کار داشته.']],
    crane7: [
        ['a', 'از نردبانِ جرثقیل بالا می‌روم. در اتاقکِ راننده، زیرِ صندلی...'],
        { s: 'a', t: 'یک دوربینِ قدیمی؛ مالِ رضا. از همین بالا عکس می‌گرفت. روی بندش حک شده: «ر.ک».', give: 'k7crane' },
        ['a', 'عکسِ تاریکخانه از همین‌جا گرفته شده بود؛ دستِ کیان‌فر، انگشترِ ماه، یک هفته پیش از یلدا.']
    ],
    crane7b: [['a', 'اتاقکِ جرثقیل؛ جایی که رضا از آن‌جا همه‌چیز را می‌دید.']],
    case7_locked: [['a', 'کیفِ چرمیِ کیان‌فر. قفلِ رمزیِ چهاررقمی دارد.']],
    case7_open: [
        ['a', 'کیف باز شد. نگاتیوهای اصلیِ رضا... و یک نوارِ کاستِ کوچک.'],
        { s: 'a', t: 'نوار را در ضبطِ جیبی‌ام می‌گذارم: صدای کیان‌فر و رستگار. «کارِ کوچه را امشب تمام کن، بهمن.»', give: 'k7case' }
    ],
    case7b: [['a', 'نگاتیوها و نوار پیشِ من است.']],
    kia: [['z', 'کارآگاه سپهر. شنیده بودم پشتکار دارید. صبحِ زیبایی است، نه؟'], { go: 'kia_hub' }],
    kia_again: [['z', 'هنوز این‌جایید؟'], { go: 'kia_hub' }],
    kia_hub: [{ s: 'z', t: 'چه می‌خواهید؟', c: [
                { t: '(به دستش نگاه کن)', go: 'kia_ring', if: function () { return !has('k7ring'); } },
                { t: 'رضا کاوه را می‌شناختید؟', go: 'kia_reza', if: function () { return !F.kiaReza; } },
                { t: 'این وقتِ صبح این‌جا چه می‌کنید؟', go: 'kia_why', if: function () { return !F.kiaWhy; } },
                { t: 'فعلاً هیچ.' }
            ] }],
    kia_ring: [['a', '(روی انگشتِ کوچکش، انگشتری با سنگِ ماهِ آبی؛ همان که در عکسِ تاریکخانه بود.)'], { s: 'z', t: 'هدیه‌ی پدرم است. قشنگ است، نه؟', give: 'k7ring' }, { go: 'kia_hub' }],
    kia_reza: [{ set: 'kiaReza' }, ['z', 'عکاسی که از جرثقیلِ من بالا می‌رفت؟ اسمش را در روزنامه خواندم. حادثه‌ی تلخی بود.'], { go: 'kia_hub' }],
    kia_why: [{ set: 'kiaWhy' }, ['z', 'برجِ خودم است. آمده‌ام طلوع را از طبقه‌ی بیستم ببینم. جرم است؟'], { go: 'kia_hub' }],
    sar: [['w', 'وکیل صارمی هستم. موکلِ من بدونِ حضورِ من به هیچ سؤالی جواب نمی‌دهد.'], { go: 'sar_hub' }],
    sar_again: [['w', 'بدونِ حکم، حرفی نمی‌زنیم.'], { go: 'sar_hub' }],
    sar_hub: [{ s: 'w', t: 'بفرمایید.', c: [
                { t: 'آن کاغذهای دستتان چیست؟', go: 'sar_paper', if: function () { return !has('k7lawyer'); } },
                { t: 'ممنون، آقای وکیل.' }
            ] }],
    sar_paper: [['w', 'قراردادِ فروشِ برج به یک شرکتِ خارجی. کاملاً قانونی.'], { s: 'a', t: '(تاریخِ امضا: امروز، ساعتِ هفت. کیان‌فر می‌خواهد پیش از رسوایی بفروشد و برود.)', give: 'k7lawyer' }, { go: 'sar_hub' }],
    akb: [
        ['u', '... سلام، سرکار.'],
        { s: 'a', t: '(راننده سیگارش را با دستِ لرزان روشن می‌کند و نگاهش را می‌دزدد.)', c: [
                { t: 'دستت می‌لرزد، اکبر. از سرما نیست؛ هست؟', go: 'akb_kind' },
                { t: 'حرف بزن، وگرنه اولین نفری هستی که می‌برم.', go: 'akb_rude' }
            ] }
    ],
    akb_kind: [
        ['u', '... سی سال رانندگی کردم؛ هیچ‌وقت کسی را جایی نبردم که برنگردد. تا شبِ یلدا.'],
        ['u', 'ساعتِ دوازده و چهل، به دستورِ آقا، ستوان رستگار را بردم سرِ کوچه‌ی ویدئو کلوپ. آقا پشتِ تلفن گفت: «کار را تمام کن.»'],
        { s: 'u', t: 'رمزِ آن کیف را هم می‌دانم: تاریخِ تولدِ پسرش. دو، پنج، صفر، یک.', give: 'k7driver' }
    ],
    akb_rude: [{ set: 'akbRude' }, ['u', 'ببر، سرکار. من راننده‌ام؛ چیزی ندیده‌ام.']],
    akb_again: [{ s: 'u', t: '...', c: [{ t: 'ببخش، اکبر. من فقط حقیقت را می‌خواهم.', go: 'akb_kind' }, { t: '(برو)' }] }],
    akb_done: [['u', 'خدا کند پسرم هیچ‌وقت نفهمد برای چه کسی کار می‌کردم.']],
    stairs7: [
        { if: function () { return clueCount() < 3; }, s: 'a', t: 'پلیس پشتِ در منتظر است. هنوز برای علامت دادن زود است.' },
        { if: function () { return clueCount() >= 3; }, s: 'a', t: 'در را باز کنم و اسم بدهم؟ چه کسی دستورِ قتلِ رضا کاوه را داد؟', c: [
                { t: 'منصور کیان‌فر', go: 'acc7' }, { t: 'وکیل صارمی', go: 'end7_w' }, { t: 'اکبرِ راننده', go: 'end7_u' }, { t: 'هنوز نه.' }
            ] }
    ],
    acc7: [{ if: strong7, go: 'end7_good' }, { go: 'end7_weak' }],
    end7_good: [
        ['a', '(در را باز می‌کنم.) «منصور کیان‌فر، به جرمِ دستور به قتلِ رضا کاوه.»'],
        ['z', 'با کدام مدرک، کارآگاه؟ یک عکس؟ یک انگشتر؟'],
        ['a', 'با صدای خودتان: «کارِ کوچه را امشب تمام کن، بهمن.»'],
        { if: function () { return has('k7driver'); }, s: 'a', t: 'و با راننده‌ای که سی سال برایتان کار کرد و امروز، بالاخره، حقیقت را گفت.' },
        ['z', '... این شهر مرا فراموش نمی‌کند، سپهر.'],
        ['a', 'نه. این شهر رضا کاوه را فراموش نمی‌کند.'],
        ['a', 'خورشید از پشتِ البرز بالا آمد. بلندترین شب تمام شده بود؛ و برف، این بار، روی هیچ دروغی ننشست.'],
        { end: 'good7' }
    ],
    end7_weak: [['a', '«کیان‌فر را بازداشت کنید.»'], ['w', 'بدونِ مدرک؟ موکلِ من تا ظهر آزاد است، کارآگاه.'], ['a', 'وکیل راست می‌گفت. تا ظهر کیان‌فر آزاد بود؛ و تا شب، از کشور رفته بود.'], { end: 'weak7' }],
    end7_w: [['a', '«وکیل صارمی را ببرید.»'], ['w', 'به جرمِ امضای قرارداد؟'], ['a', 'کیان‌فر لبخند زد و با آسانسورِ کارگاه پایین رفت.'], { end: 'wrong7w' }],
    end7_u: [['a', '«راننده را ببرید.»'], ['u', 'من فقط رانندگی کردم، سرکار...'], ['a', 'و مردی که دستور داده بود، سوارِ ماشینِ دیگری شد و رفت.'], { end: 'wrong7u' }]
});
Object.assign(ENDINGS, {
    good7: { t: 'صبح', s: 'کیان‌فر بازداشت شد. شبِ یلدا بالاخره به صبح رسید.', c: '#ffd09a', good: true },
    weak7: { t: 'تا ظهر', s: 'بی‌مدرک، کیان‌فر از کشور رفت.', c: '#ffbf69' },
    wrong7w: { t: 'قراردادِ امضاشده', s: 'کیان‌فر رفت.', c: '#b0c0e0' },
    wrong7u: { t: 'راننده', s: 'مردی که دستور داد، رفت.', c: '#e0c0a0' }
});
Object.assign(ACT, {
    edge7: function () { return 'edge7'; }, tank7: function () { return 'tank7'; }, gen7: function () { return 'gen7'; }, crane7: function () { return has('k7crane') ? 'crane7b' : 'crane7'; },
    case7: function () { return has('k7case') ? 'case7b' : 'mini:case7'; }, stairs7: function () { return 'stairs7'; },
    kianfar: function () { return F.kiaMet ? 'kia_again' : (G.flags.kiaMet = true, 'kia'); },
    sarami: function () { return F.sarMet ? 'sar_again' : (G.flags.sarMet = true, 'sar'); },
    akbar: function () { return has('k7driver') ? 'akb_done' : F.akbMet ? 'akb_again' : (G.flags.akbMet = true, 'akb'); }
});
MINI_F.case7 = function () { return makeKeypad({ code: '2501', title: 'نمای نزدیک: کیفِ کیان‌فر', ok: 'case7_open', hint: 'رمزِ کیف چهار رقم است. شاید راننده بداند.', hintIf: function () { return !has('k7driver'); } }); };
// ================= case 8: the Crow's mask — the abandoned cinema =================
PEOPLE.p = { n: 'عمو صمد، آپاراتچی', c: '#e8c890', sp: { coat: '#5a4a3a', shirt: '#c8c0b0', pants: '#2a2a30', skin: '#b08868', hat: 'bald', hair: '#b8b8b8', glasses: 1, mustache: '#c8c8c8' } };
SPK.p = { n: PEOPLE.p.n, c: PEOPLE.p.c };
SPK.K = { n: 'کلاغ', c: '#ff4a5a' };
function drawCrowMan(g, x, y, f) {
    var p = spr(g, x, y, f), br = Math.sin(G.t * 1.2) > 0.5 ? -1 : 0;
    p(-3, -8, 3, 8, '#101014');
    p(1, -8, 3, 8, '#101014');
    p(-3, -1, 3, 1, '#050508');
    p(1, -1, 4, 1, '#050508');
    p(-5, -29 + br, 10, 23, '#141418');
    p(-6, -10, 12, 4, '#141418');
    p(-6, -7, 12, 1, '#0a0a0e');
    p(-5, -29 + br, 1, 22, '#0a0a0e');
    p(3, -28 + br, 1, 19, '#2e2e3a');
    p(-4, -29 + br, 8, 2, '#22222c');
    p(1, -23 + br, 2, 12, '#101014');
    p(1, -12 + br, 2, 2, '#e8e0d0');
    var hy = -35 + br;
    p(-2, hy, 5, 6, '#e8e0d0');
    p(-2, hy, 1, 6, '#b8b0a0');
    p(3, hy + 2, 3, 2, '#e8e0d0');
    p(6, hy + 3, 2, 1, '#c8c0b0');
    p(3, hy + 4, 3, 1, '#b8b0a0');
    p(1, hy + 1, 2, 2, '#c01e2a');
    p(1, hy + 1, 1, 1, '#ff6a6a');
    p(-4, hy - 1, 11, 1, '#0a0a0e');
    p(-2, hy - 5, 6, 4, '#0a0a0e');
    p(-2, hy - 2, 6, 1, '#3a1a22');
    p(-3, hy + 4, 2, 5, '#0a0a0e');
}
function crowPortrait() {
    var _a = mk(36, 36), c = _a[0], g = _a[1], gr = g.createLinearGradient(36, 0, 0, 36);
    gr.addColorStop(0, 'rgba(255,60,80,0.45)');
    gr.addColorStop(1, 'rgba(8,6,14,1)');
    R(g, 0, 0, 36, 36, '#0b0911');
    g.fillStyle = gr;
    g.fillRect(0, 0, 36, 36);
    R(g, 3, 29, 30, 7, '#141418');
    R(g, 12, 28, 12, 3, '#22222c');
    R(g, 11, 11, 14, 15, '#e8e0d0');
    R(g, 11, 11, 3, 15, '#b8b0a0');
    R(g, 12, 26, 12, 2, '#c8c0b0');
    R(g, 13, 15, 4, 4, '#3a0a10');
    R(g, 20, 15, 4, 4, '#3a0a10');
    R(g, 14, 16, 2, 2, '#e02a3a');
    R(g, 21, 16, 2, 2, '#e02a3a');
    R(g, 14, 16, 1, 1, '#ff9a9a');
    R(g, 21, 16, 1, 1, '#ff9a9a');
    for (var i = 0; i < 9; i++)
        R(g, 16 + (i >> 2), 20 + i, Math.max(1, 5 - (i >> 1)), 1, i % 2 ? '#d8d0c0' : '#c8c0b0');
    R(g, 24, 12, 1, 14, 'rgba(255,90,110,0.9)');
    R(g, 5, 9, 26, 2, '#0a0a0e');
    R(g, 10, 1, 16, 8, '#0a0a0e');
    R(g, 10, 6, 16, 2, '#3a1a22');
    R(g, 11, 0, 14, 1, '#4a4a58');
    return c;
}
var FILM8 = (function () {
    var _a = mk(64, 36), c = _a[0], g = _a[1];
    R(g, 0, 0, 64, 36, '#cfcfc8');
    var r = rng(88);
    R(g, 4, 4, 14, 30, '#8a8a84');
    for (var y = 6; y < 34; y += 5)
        R(g, 4, y, 14, 1, '#6a6a64');
    for (var x = 6; x < 18; x += 4)
        R(g, x, 4, 1, 30, '#6a6a64');
    R(g, 0, 32, 64, 4, '#9a9a94');
    var man = function (x, hat, beak) { R(g, x - 3, 14, 7, 18, '#1a1a1a'); R(g, x - 2, 8, 5, 6, beak ? '#e8e0d0' : '#3a3a3a'); if (beak)
        R(g, x + 3, 10, 3, 2, '#e8e0d0'); if (hat) {
        R(g, x - 4, 7, 9, 1, '#111');
        R(g, x - 2, 4, 5, 3, '#111');
    } };
    man(28, true, false);
    man(40, true, true);
    man(52, false, false);
    R(g, 31, 20, 6, 2, '#1a1a1a');
    R(g, 43, 20, 6, 2, '#1a1a1a');
    for (var i = 0; i < 90; i++)
        R(g, r() * 64, r() * 36, 1, 1, r() < 0.5 ? '#f4f4ee' : '#8a8a84');
    return c;
})();
Object.assign(PROP, {
    poster: function (g, e, o) {
        var x = o.x, y = o.y || 92;
        R(g, x - 2, y - 2, 20, 30, '#8a6a2a');
        R(g, x, y, 16, 26, o.col || '#1a1420');
        R(g, x + 1, y + 1, 14, 5, '#9a2231');
        g.drawImage(CROW, x + 2, y + 9, 12, 9);
        R(g, x + 2, y + 21, 12, 1, '#c8b890');
        R(g, x + 4, y + 23, 8, 1, '#c8b890');
        if (o.lamp) {
            R(g, x + 4, y - 7, 8, 2, '#3a3a40');
            R(e, x + 5, y - 5, 6, 1, '#ffe0a0');
        }
        return [{ x: x - 2, y: y - 2, w: 20, h: 30, z: 2 }];
    },
    drape: function (g, e, o) {
        var x = o.x, w = o.w || 18, top = 110;
        R(g, x - 3, top - 4, w + 6, 4, '#c8a040');
        R(g, x, top, w, 146 - top, '#0c0608');
        for (var xx = x; xx < x + 6; xx++)
            R(g, xx, top, 1, 146 - top, xx % 2 ? '#7a1422' : '#9a2231');
        for (var xx = x + w - 6; xx < x + w; xx++)
            R(g, xx, top, 1, 146 - top, xx % 2 ? '#7a1422' : '#9a2231');
        R(g, x + 2, 104, w - 4, 5, '#0c2a18');
        e.drawImage(pixText('خروج', 5, '#6fff9a'), x + 2, 100);
        return [{ x: x - 3, y: top - 4, w: w + 6, h: 4, z: 8 }];
    },
    cinemaScreen: function (g, e, o, r, S) {
        var x0 = 256, x1 = 444, y0 = 64, y1 = 122;
        R(g, 236, 128, 228, 18, '#2a1a12');
        R(g, 236, 127, 228, 2, '#5a3a22');
        for (var xx = 240; xx < 464; xx += 12)
            R(g, xx, 131, 1, 15, '#1e120c'); // the stage
        R(g, x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6, '#0a0a0c');
        R(g, x0, y0, x1 - x0, y1 - y0, '#8a8a88');
        for (var _i = 0, _a = [[238, 256], [444, 462]]; _i < _a.length; _i++) {
            var __entry11 = _a[_i];
            var a = __entry11[0], b = __entry11[1];
            for (var xx = a; xx < b; xx++)
                R(g, xx, 58, 1, 70, (xx % 3) ? '#7a1422' : '#9a2231');
        }
        R(g, 234, 52, 232, 8, '#9a2231');
        for (var xx = 236; xx < 466; xx += 3)
            R(g, xx, 60, 2, 2, '#c8a040');
        R(g, 234, 52, 232, 1, '#c8a040');
        S.dyn.push(function (g2, cx) {
            var k = (G.t * 24 | 0), fl = 0.8 + ((k * 7919) % 13) / 60, reel = has('k8reel');
            if (G.flags.cr && G.flags.cr.run) {
                R(g2, x0 - cx, y0, x1 - x0, y1 - y0, '#16161a');
                return;
            } // the projector has died
            g2.fillStyle = "rgb(".concat(190 * fl | 0, ",").concat(192 * fl | 0, ",").concat(196 * fl | 0, ")");
            g2.fillRect(x0 - cx, y0, x1 - x0, y1 - y0);
            if (reel) {
                g2.imageSmoothingEnabled = false;
                g2.drawImage(FILM8, x0 + 30 - cx, y0 + 2, 128, 54);
            }
            else {
                var n = 3 - ((G.t | 0) % 3), sw = (G.t % 1) * 6.283;
                g2.strokeStyle = '#4a4a48';
                g2.lineWidth = 1;
                g2.beginPath();
                g2.arc(350.5 - cx, 93, 20, 0, 6.283);
                g2.stroke();
                g2.beginPath();
                g2.moveTo(350.5 - cx, 93);
                g2.lineTo(350.5 - cx + Math.cos(sw - 1.57) * 20, 93 + Math.sin(sw - 1.57) * 20);
                g2.stroke();
                R(g2, 330 - cx, 93, 41, 1, '#4a4a48');
                R(g2, 350 - cx, 73, 1, 41, '#4a4a48');
                DIGITS8 = DIGITS8 || [0, 1, 2, 3].map(function (d) { return pixText(toFa(d), 12, '#2a2a28'); });
                g2.drawImage(DIGITS8[n], 345 - cx, 84);
            }
            for (var i = 0; i < 3; i++) {
                var sx = x0 + ((k * 37 + i * 71) % (x1 - x0));
                R(g2, sx - cx, y0, 1, y1 - y0, 'rgba(40,40,40,0.35)');
            }
            for (var i = 0; i < 14; i++)
                R(g2, x0 + ((k * 13 + i * 97) % (x1 - x0)) - cx, y0 + ((k * 29 + i * 53) % (y1 - y0)), 1, 1, 'rgba(20,20,20,0.6)');
        });
        return [{ x: 236, y: 127, w: 228, h: 19, z: 6 }];
    },
    seats: function (g, e, o) {
        var occ = [];
        for (var x = o.x; x < o.x + o.w; x += 10) {
            R(g, x, 140, 8, 10, '#4a1018');
            R(g, x, 140, 8, 1, '#7a2a30');
            R(g, x + 1, 150, 1, 3, '#1a0a0c');
            R(g, x + 6, 150, 1, 3, '#1a0a0c');
        }
        footShadow(g, o.x, o.w, 153);
        occ.push({ x: o.x, y: 140, w: o.w, h: 13, z: 16, zb: 12 });
        return occ;
    },
    boothStairs: function (g, e, o) {
        var x = o.x;
        for (var i = 0; i < 9; i++) {
            R(g, x + i * 5, 146 - i * 8, 7, 2, '#4a4a52');
            R(g, x + i * 5, 148 - i * 8, 7, 1, '#2a2a30');
        }
        R(g, x - 1, 70, 1, 76, '#3a3a40');
        R(g, x + 44, 64, 18, 30, '#1a1a1e');
        R(g, x + 46, 66, 14, 26, '#3a3230');
        R(g, x + 57, 78, 2, 3, '#c8a040');
        R(g, x + 20, 58, 18, 12, '#0a0a0c');
        R(e, x + 22, 60, 14, 8, '#fff4d0');
        {
            var t = pixText('آپارات', 5, '#2a1e10');
            R(g, x + 45, 70, 16, 6, '#b89a50');
            g.drawImage(t, x + 53 - (t.width >> 1), 67);
        }
        var occ = [];
        for (var i = 0; i < 9; i++)
            occ.push({ x: x + i * 5, y: 146 - i * 8, w: 7, h: 2, z: 10, zb: 4 });
        return occ;
    },
    roofLadder: function (g, e, o) {
        var x = o.x;
        R(g, x, 34, 2, 112, '#5a5a62');
        R(g, x + 10, 34, 2, 112, '#5a5a62');
        for (var y = 40; y < 146; y += 6)
            R(g, x, y, 12, 1, '#7a7a82');
        R(g, x - 6, 26, 24, 8, '#0a0a0e');
        R(e, x - 4, 20, 20, 6, '#3a4a78');
        for (var i = 0; i < 8; i++)
            R(e, x - 4 + i * 3, 21 + (i % 3), 1, 1, '#e8eeff');
        return [{ x: x, y: 34, w: 12, h: 112, z: 4 }];
    }
});
var DIGITS8 = null; // the countdown digits, made once the typefaces have loaded
function buildCinema() {
    var S = buildScene({
        id: 'cinema', name: 'سینما ایران — لاله‌زار، نیمه‌شب', w: 640, seed: 808, indoor: true, spawn: 40,
        room: { wall: '#3a1a22', wall2: '#2a1418', trim: '#c8a040', pattern: 'damask', floor: 'concrete', floorCol: '#3a2226', ceil: '#120a0c' },
        props: [
            ['door', { x: 18, col: '#3a2a22', glass: '#6a5a3a', sign: 'سینما ایران' }], ['poster', { x: 52, lamp: true }], ['poster', { x: 78, col: '#141a24' }],
            ['booth', { x: 110, w: 44, sign: 'گیشه' }], ['bulbHang', { x: 86, y: 76 }], ['drape', { x: 200, w: 18 }],
            ['cinemaScreen', {}], ['seats', { x: 226, w: 250 }], ['boothStairs', { x: 486 }], ['roofLadder', { x: 600 }], ['papers', { x: 230, w: 220, n: 12 }]
        ],
        npcs: [npc('p', 176)],
        lights: [
            { x: 516, y: 64, r: 290, c: [220, 226, 255], i: 0.8, f: 'proj', z: 30, sz: 2, dyn: 1 },
            { x: 350, y: 94, r: 170, c: [160, 170, 210], i: 0.35, f: 'proj', ns: 1 },
            { x: 86, y: 80, r: 110, c: [255, 200, 140], i: 0.6, f: 'bulb', z: 20 },
            { x: 60, y: 86, r: 50, c: [255, 220, 160], i: 0.5, f: 'steady', ns: 1 },
            { x: 209, y: 104, r: 40, c: [60, 255, 120], i: 0.4, f: 'steady' },
            { x: 604, y: 30, r: 110, c: [150, 170, 230], i: 0.5, f: 'steady', z: 8 }
        ],
        targets: [
            { id: 'door8', x: 27, y: 110, w: 22, h: 36, n: 'درِ ورودی' },
            { id: 'poster8', x: 70, y: 88, w: 46, h: 34, n: 'پوسترهای قدیمی' },
            { id: 'booth8', x: 132, y: 104, w: 44, h: 42, n: 'گیشه‌ی بلیت' },
            { id: 'samad', x: 176, y: 124, w: 13, h: 36, n: 'عمو صمد', npc: 1 },
            { id: 'screen8', x: 350, y: 62, w: 190, h: 62, n: 'پرده‌ی سینما' },
            { id: 'seat8', x: 331, y: 138, w: 14, h: 14, n: 'ردیفِ هفت، صندلیِ سیزده', hidden: 1, clue: 'k8feather' },
            { id: 'stairs8', x: 508, y: 64, w: 50, h: 82, n: 'پله‌های اتاقکِ آپارات' },
            { id: 'ladder8', x: 606, y: 30, w: 18, h: 116, n: 'نردبانِ پشت‌بام' },
            { id: 'crow8', x: 330, y: 92, w: 14, h: 38, n: 'مردِ نقاب‌دار', npc: 1, cond: function () { return has('k8reel') && !(G.flags.cr && G.flags.cr.gone); } }
        ],
        ambient: [58, 44, 52], zoom: 1.5, viewTop: 56
    });
    var crowOcc = { x: 324, y: 92, w: 12, h: 38, z: 8, card: 1, fx: 330, fy: 130, cond: function () { return has('k8reel') && !(G.flags.cr && G.flags.cr.gone); }, spr: function (g, x, y) { return drawCrowMan(g, x, y, -1); } };
    S.occ.push(crowOcc);
    S.fx.push(function (dt) {
        var cr = crowState();
        if (cr.run && !cr.gone) {
            if (cr.x < 604)
                cr.x = Math.min(604, cr.x + 70 * dt), cr.y = Math.min(146, cr.y + 40 * dt);
            else {
                cr.y -= 60 * dt;
                if (cr.y < 40) {
                    cr.gone = true;
                    sfx.whoosh();
                }
            }
        }
        crowOcc.x = cr.x - 6;
        crowOcc.fx = cr.x;
        crowOcc.fy = cr.y;
        crowOcc.y = cr.y - 38;
        crowOcc.z = cr.y > 132 ? 12 : 8;
        var t = S.targets[S.targets.length - 1];
        t.x = cr.x;
        t.y = cr.y - 38;
        for (var _i = 0, BIRDS8_1 = BIRDS8; _i < BIRDS8_1.length; _i++) {
            var b = BIRDS8_1[_i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.vy -= 20 * dt;
            b.ph += dt * 14;
        }
        for (var i = BIRDS8.length - 1; i >= 0; i--)
            if (BIRDS8[i].y < -20)
                BIRDS8.splice(i, 1);
    });
    return S;
}
var BIRDS8 = [];
var crowState = function () { return G.flags.cr || (G.flags.cr = { x: 330, y: 130, run: false, gone: false }); };
function crowBirds(n) { for (var i = 0; i < n; i++)
    BIRDS8.push({ x: 300 + Math.random() * 120, y: 100 + Math.random() * 40, vx: 60 + Math.random() * 90, vy: -30 - Math.random() * 50, ph: Math.random() * 6 }); sfx.whoosh(); }
function drawCinemaActors(g, cx) {
    var cr = G.flags.cr;
    if (!has('k8reel') || (cr && cr.gone))
        return;
    drawCrowMan(g, Math.round(cr ? cr.x : 330) - cx, Math.round(cr ? cr.y : 130), cr && cr.run ? 1 : -1);
}
function drawBirds8(g, cx) {
    for (var _i = 0, BIRDS8_2 = BIRDS8; _i < BIRDS8_2.length; _i++) {
        var b = BIRDS8_2[_i];
        var x = Math.round(b.x) - cx, y = Math.round(b.y), up = Math.sin(b.ph) > 0;
        R(g, x, y, 3, 2, '#0a0a10');
        R(g, x + 3, y, 1, 1, '#0a0a10');
        if (up) {
            R(g, x - 2, y - 2, 2, 2, '#0a0a10');
            R(g, x + 1, y - 3, 2, 2, '#0a0a10');
        }
        else {
            R(g, x - 2, y + 2, 2, 1, '#0a0a10');
            R(g, x + 1, y + 2, 2, 1, '#0a0a10');
        }
    }
}
Object.assign(CLUES, {
    k8poster: { n: 'پوسترِ «پروازِ کلاغ‌ها»', d: 'فیلمی از سالِ ۱۳۵۷؛ رویش با ماژیکِ قرمز: «یلدا — نیمه‌شب». امضای کلاغ.', i: 'print' },
    k8samad: { n: 'شهادتِ آپاراتچی', d: 'هر سال شبِ یلدا مردی با نقابِ کلاغ می‌آید؛ ردیفِ هفت، صندلیِ سیزده. کلیدِ اتاقک را داد.', i: 'key' },
    k8ticket: { n: 'بلیتِ جامانده', d: 'بلیتِ امشب در گیشه: «ردیفِ ۷، صندلیِ ۱۳» — به نامِ «آرمان سپهر».', i: 'ticket' },
    k8feather: { n: 'پرِ سیاه', d: 'روی صندلیِ سیزده: یک پرِ کلاغ و کارتی: «فیلم را تا آخر ببین، سپهر.»', i: 'envelope' },
    k8reel: { n: 'حلقه‌ی پنهان', d: 'فیلمی از کلاغ؛ با کیان‌فر و نادری جلوی برج دست می‌دهد. کیان‌فر فقط مهره بود.', i: 'tape' }
});
var strong8 = function () { return has('k8reel') && has('k8feather') && (has('k8samad') || has('k8ticket')); };
Object.assign(DLG, {
    intro8: [
        ['a', 'سه شب از بازداشتِ کیان‌فر گذشته. در بازجویی فقط یک جمله گفت: «از کلاغ بپرسید.»'],
        ['a', 'امروز صبح روی میزم یک پرِ سیاه بود و یک بلیتِ سینما: «سینما ایران، نمایشِ ویژه، نیمه‌شب.»'],
        ['a', 'سینما ایران ده سال است تعطیل است. اما امشب، چراغِ آپاراتش روشن است.'],
        ['n', 'همه‌جا را با چراغ‌قوه بگرد؛ کلاغ دوست دارد نشانه جا بگذارد.']
    ],
    door8: [['a', 'قفلِ درِ ورودی را سال‌ها پیش شکسته‌اند. بوی نمِ مخمل و فیلمِ سوخته می‌آید.']],
    poster8: [
        ['a', 'پوسترهای رنگ‌رفته‌ی دهه‌ی پنجاه. یکی‌شان را تازه به دیوار چسبانده‌اند...'],
        { s: 'a', t: '«پروازِ کلاغ‌ها — ۱۳۵۷». رویش با ماژیکِ قرمز نوشته: «یلدا — نیمه‌شب.»', give: 'k8poster' }
    ],
    poster8b: [['a', 'پروازِ کلاغ‌ها. کسی می‌خواهد بدانم امشب برای که آمده‌ام.']],
    booth8: [
        ['a', 'گیشه‌ی بلیت. خاک همه‌جا نشسته، جز روی یک بلیتِ تازه کنارِ دریچه.'],
        { s: 'a', t: '«ردیفِ ۷، صندلیِ ۱۳ — نمایشِ ویژه.» و پشتش، با خطی مرتب: «آرمان سپهر».', give: 'k8ticket' },
        ['a', 'بلیت به اسمِ من است.']
    ],
    booth8b: [['a', 'ردیفِ هفت، صندلیِ سیزده. جایی که برایم نگه داشته‌اند.']],
    sam: [['p', '... کی آن‌جاست؟ آه، پلیس. ترسیدم؛ فکر کردم خودش است.'], { go: 'sam_hub' }],
    sam_again: [['p', 'هنوز این‌جایید، سرکار؟'], { go: 'sam_hub' }],
    sam_hub: [{ s: 'p', t: 'چه می‌خواهید بدانید؟', c: [
                { t: '«خودش» کیست؟', go: 'sam_crow', if: function () { return !has('k8samad'); } },
                { t: 'این سینما چرا امشب روشن است؟', go: 'sam_why', if: function () { return !F.samWhy; } },
                { t: 'فعلاً هیچ، عمو.' }
            ] }],
    sam_crow: [
        ['p', 'نمی‌دانم اسمش چیست. ده سال است هر شبِ یلدا می‌آید؛ با نقابِ کلاغ.'],
        ['p', 'همیشه ردیفِ هفت، صندلیِ سیزده. یک حلقه فیلم می‌آورد، نمایشش می‌دهم، و می‌رود. پولِ خوبی می‌دهد.'],
        { s: 'p', t: 'امشب گفت: «حلقه را خودِ کارآگاه روشن می‌کند.» این هم کلیدِ اتاقکِ آپارات؛ من دیگر بالا نمی‌روم.', give: 'k8samad' },
        { go: 'sam_hub' }
    ],
    sam_why: [{ set: 'samWhy' }, ['p', 'برای شما، سرکار. انگار همه‌چیز این سال‌ها برای همین شب بوده.'], { go: 'sam_hub' }],
    seat8: [
        ['a', 'ردیفِ هفت، صندلیِ سیزده. زیرِ نورِ چراغ‌قوه، چیزی روی مخملِ قرمز برق می‌زند...'],
        { s: 'a', t: 'یک پرِ سیاهِ کلاغ، و کارتی با همان خطِ مرتب: «فیلم را تا آخر ببین، سپهر.»', give: 'k8feather' }
    ],
    seat8b: [['a', 'صندلیِ سیزده. کسی سال‌ها این‌جا نشسته و به یک فیلم نگاه کرده.']],
    screen8: [
        { if: function () { return !has('k8reel'); }, s: 'a', t: 'پرده‌ی سینما. فیلمِ خش‌داری رویش تکرار می‌شود: شمارشِ معکوس، و باز شمارشِ معکوس. حلقه‌ی اصلی بالا در اتاقک است.' },
        { if: function () { return has('k8reel'); }, s: 'a', t: 'کلاغ، کیان‌فر و نادری؛ جلوی برجِ ماه‌نشان. همه‌ی این پرونده‌ها یک نخ داشتند.' }
    ],
    stairs8_locked: [['a', 'درِ اتاقکِ آپارات قفل است. کلیدش باید دستِ آپاراتچی باشد.']],
    stairs8b: [['a', 'آپارات هنوز می‌چرخد. فیلم روی پرده است.']],
    ladder8: [['a', 'نردبانِ پشت‌بام. دریچه‌ی بالا باز است و برف از آن پایین می‌ریزد. کسی راهِ فرارش را از قبل باز گذاشته.']],
    reel8: [
        ['a', 'تصویر صاف شد... سه مرد جلوی اسکلتِ برجِ ماه‌نشان: کیان‌فر، نادری... و مردی با نقابِ کلاغ.'],
        { s: 'a', t: 'کیان‌فر فقط مهره بود. پشتِ همه‌ی این شب‌ها، یک نفر بود.', give: 'k8reel' },
        ['a', '(صدای قدم روی صحنه.) یکی در نورِ آپارات ایستاده؛ روی صحنه، جلوی پرده.']
    ],
    crow: [['K', 'سلام، سپهر. فیلم را دیدی؟ ده سال منتظرِ این شب بودم.'], ['a', 'تو کی هستی؟'], ['K', 'کسی که کیان‌فر برایش کار می‌کرد، و نادری از او می‌ترسید. همه به من می‌گویند کلاغ.'], { go: 'crow_hub' }],
    crow_again: [['K', 'هنوز سؤالی مانده، کارآگاه؟'], { go: 'crow_hub' }],
    crow_hub: [{ s: 'K', t: 'بپرس. وقتمان کم است.', c: [
                { t: 'چرا رضا کاوه؟', go: 'crow_reza', if: function () { return !F.crowReza; } },
                { t: 'نقابت را بردار.', go: 'crow_mask', if: function () { return !F.crowMask; } },
                { t: '(چراغ‌قوه را توی صورتش بگیر و جلو برو)', go: 'crow_flash' },
                { t: 'تمامش کن. بازداشتی.', go: 'crow_arrest' },
                { t: '(صبر کن و چیزی نگو)', go: 'end8_wait' }
            ] }],
    crow_reza: [{ set: 'crowReza' }, ['K', 'رضا چیزی دید که نباید می‌دید. مثلِ تو. فرقش این است که تو را هنوز لازم دارم.'], { go: 'crow_hub' }],
    crow_mask: [{ set: 'crowMask' }, ['K', 'هر نقابی زمانی دارد، سپهر. مالِ من هنوز نرسیده.'], { go: 'crow_hub' }],
    crow_flash: [{ if: strong8, go: 'end8_good' }, { go: 'end8_weak' }],
    crow_arrest: [{ if: strong8, go: 'end8_good' }, { go: 'end8_weak' }],
    end8_good: [
        ['a', '(نور را توی صورتش می‌گیرم. شیشه‌های قرمزِ نقاب برق می‌زنند.)'],
        { s: 'K', t: 'آفرین. همه‌ی نشانه‌ها را پیدا کردی.', fx: function () { crowBirds(26); } },
        { s: 'n', t: '(دسته‌ای کلاغ از بالکن بیرون می‌ریزد. آپارات خاموش می‌شود.)', fx: function () { crowState().run = true; } },
        ['a', 'دنبالش می‌دوم؛ از نردبان بالا می‌رود و از دریچه‌ی پشت‌بام بیرون می‌پرد...'],
        ['a', 'روی پله‌ی آخر، چیزی از جیبِ پالتویش افتاده: یک عکسِ قدیمی.'],
        ['a', 'دو افسرِ جوان، ده سال پیش، جلوی دانشکده‌ی افسری. یکی‌شان منم. پشتش نوشته: «به‌زودی می‌بینمت، برادر.»'],
        ['a', 'کلاغ مرا می‌شناسد. و من، تازه دارم یادم می‌آید او را.'],
        { end: 'good8' }
    ],
    end8_weak: [
        ['a', '«تمامش کن!» جلو می‌روم...'],
        { s: 'K', t: 'هنوز نه، سپهر. هنوز همه‌ی نشانه‌ها را ندیده‌ای.', fx: function () { crowBirds(18); crowState().run = true; } },
        ['a', 'آپارات خاموش شد. وقتی چراغ‌قوه را دوباره بالا آوردم، صحنه خالی بود.'],
        { end: 'weak8' }
    ],
    end8_wait: [
        { s: 'K', t: 'سکوت هم جوابی است. شبت بخیر، کارآگاه.', fx: function () { crowBirds(12); crowState().run = true; } },
        ['a', 'رفت؛ و من فقط نگاه کردم.'],
        { end: 'wait8' }
    ]
});
Object.assign(ENDINGS, {
    good8: { t: 'کلاغ پرید', s: 'کلاغ فرار کرد؛ اما حالا می‌دانم دنبالِ چه کسی هستم.', c: '#ff5a6a', good: true, cont: true },
    weak8: { t: 'صحنه‌ی خالی', s: 'کلاغ در تاریکی گم شد و هیچ ردی نماند.', c: '#ffbf69' },
    wait8: { t: 'سکوت', s: 'کلاغ رفت و تو فقط تماشا کردی.', c: '#b0c0e0' }
});
Object.assign(ACT, {
    door8: function () { return 'door8'; }, poster8: function () { return has('k8poster') ? 'poster8b' : 'poster8'; }, booth8: function () { return has('k8ticket') ? 'booth8b' : 'booth8'; },
    samad: function () { return F.samMet ? 'sam_again' : (G.flags.samMet = true, 'sam'); },
    screen8: function () { return 'screen8'; }, ladder8: function () { return 'ladder8'; }, seat8: function () { return has('k8feather') ? 'seat8b' : 'seat8'; },
    stairs8: function () { return has('k8reel') ? 'stairs8b' : has('k8samad') ? 'mini:projector8' : 'stairs8_locked'; },
    crow8: function () { return F.crowMet ? 'crow_again' : (G.flags.crowMet = true, 'crow'); }
});
// --- mini-game: focus the old projector until the hidden reel is sharp on the far screen ---
MINI_F.projector8 = function () {
    var S = { f: 0.15, drag: null, lockT: 0, done: false, shown: 0 }, target = 0.62, msg = 'کیان‌فر، نادری... و مردِ نقاب‌دار. همه با او دست دادند.';
    var close = function () { return clamp(1 - Math.abs(S.f - target) / 0.35, 0, 1); };
    return {
        title: 'نمای اول‌شخص: اتاقکِ آپاراتِ سینما',
        enter: function () { if (has('k8reel')) {
            S.done = true;
            S.f = target;
            S.shown = 999;
        } },
        hint: function () { return S.done ? 'تصویر صاف شد. برای بازگشت، دکمه‌ی بازگشت.' : close() > 0.7 ? 'نزدیکی! آرام‌تر...' : 'پیچِ فوکوس را به چپ و راست بکش تا تصویرِ روی پرده صاف شود.'; },
        down: function (m) { if (D.active)
            return; if (m.y > 40)
            S.drag = { x0: m.x, f0: S.f }; },
        move: function (m) { if (S.drag && !S.done)
            S.f = clamp(S.drag.f0 + (m.x - S.drag.x0) * 0.004, 0, 1); },
        up: function () { S.drag = null; },
        update: function (dt) {
            if (!S.done && Math.abs(S.f - target) < 0.05 && !S.drag) {
                S.lockT += dt;
                if (S.lockT > 1) {
                    S.done = true;
                    sfx.okChime();
                }
            }
            else
                S.lockT = 0;
            if (S.done && S.shown < msg.length) {
                S.shown += dt * 24;
                if (S.shown >= msg.length && !has('k8reel'))
                    startDialog('reel8');
            }
        },
        render: function (g) {
            var c = close(), blur = Math.round((1 - c) * 7), k = (G.t * 24 | 0), fl = 0.85 + ((k * 7919) % 13) / 80;
            R(g, 0, 0, WB, H, '#0c0a0c');
            R(g, 60, 8, 200, 94, '#050406'); // the booth window, the hall beyond it
            g.fillStyle = "rgb(".concat(200 * fl | 0, ",").concat(200 * fl | 0, ",").concat(196 * fl | 0, ")");
            g.fillRect(96, 18, 128, 64);
            g.imageSmoothingEnabled = false;
            if (blur === 0)
                g.drawImage(FILM8, 96, 19, 128, 62);
            else {
                g.globalAlpha = 0.22;
                for (var _i = 0, _a = [[-blur, 0], [blur, 0], [0, -blur], [0, blur], [0, 0]]; _i < _a.length; _i++) {
                    var __entry12 = _a[_i];
                    var dx = __entry12[0], dy = __entry12[1];
                    g.drawImage(FILM8, 96 + dx, 19 + dy, 128, 62);
                    g.globalAlpha = 1;
                }
            }
            for (var i = 0; i < 3; i++)
                R(g, 96 + ((k * 37 + i * 71) % 128), 18, 1, 64, 'rgba(40,40,40,0.35)');
            R(g, 60, 100, 200, 6, '#2a2226'); // the sill
            // the projector: body, two reels spinning, lens, focus knob
            R(g, 118, 140, 96, 40, '#3a3a42');
            R(g, 118, 140, 96, 2, '#5a5a64');
            R(g, 106, 150, 14, 14, '#2a2a30');
            R(g, 102, 153, 6, 8, '#fff4d0');
            for (var _b = 0, _c = [[150, 124], [190, 128]]; _b < _c.length; _b++) {
                var __entry13 = _c[_b];
                var rx = __entry13[0], ry = __entry13[1];
                g.fillStyle = '#2a2a30';
                g.beginPath();
                g.arc(rx, ry, 17, 0, 6.28);
                g.fill();
                g.fillStyle = '#4a4a52';
                g.beginPath();
                g.arc(rx, ry, 14, 0, 6.28);
                g.fill();
                var a = G.t * 3;
                for (var i = 0; i < 3; i++) {
                    var aa = a + i * 2.094;
                    R(g, Math.round(rx + Math.cos(aa) * 8) - 2, Math.round(ry + Math.sin(aa) * 8) - 2, 4, 4, '#1a1a1e');
                }
                R(g, rx - 2, ry - 2, 4, 4, '#8a8a90');
            }
            var kx = 238, ky = 146;
            g.fillStyle = '#1a1a1e';
            g.beginPath();
            g.arc(kx, ky, 13, 0, 6.28);
            g.fill();
            g.fillStyle = '#6a5a3a';
            g.beginPath();
            g.arc(kx, ky, 11, 0, 6.28);
            g.fill();
            var ang = S.f * 5 - 2.5;
            R(g, Math.round(kx + Math.cos(ang - 1.57) * 7) - 1, Math.round(ky + Math.sin(ang - 1.57) * 7) - 1, 3, 3, '#e8d8a0');
            for (var i = 0; i < 8; i++)
                R(g, 268 + i * 4, 160 - i * 2, 3, 4 + i * 2, i < c * 8 ? '#40ff70' : '#1a2a1a');
            miniLight([70, 60, 66], [[102, 157, 60, [255, 240, 200], 0.8], [160, 50, 120, [210, 214, 230], 0.55]]);
            miniGlow(104, 157, 40, [255, 240, 200], 0.35);
        },
        ui: function (u, X, Y) {
            if (S.done) {
                var t = msg.slice(0, Math.floor(S.shown));
                panel(X + 40 * u, Y + 118 * u, 240 * u, 12 * u * UI.fs, 'rgba(8,6,14,0.9)', '#ff8a9a');
                rtl(t, X + 276 * u, Y + 118 * u + 6 * u * UI.fs, '#ffe0e4', fnt(u * 3.3, 'bold'));
            }
        }
    };
};
// ================= cases 3–7: menu entries, clue lists, goals, deductions =================
var dedOf = function (rules, strong, phoneHint) { return function () {
    var out = rules.filter(function (_a) {
        var c = _a[0];
        return c();
    }).map(function (_a) {
        var t = _a[1];
        return t;
    });
    out.push(strong() ? 'پرونده کامل است. ' + phoneHint : clueCount() >= 4 ? 'شاید وقتِ معرفیِ مقصر باشد... اما مدرک کافی است؟' : 'هنوز سرنخ کم است.');
    return out;
}; };
Object.assign(LEVELS, {
    3: { n: 'پرونده‌ی ۳', t: 'تاریکخانه', s: 'عکاسخانه‌ی رضا، ساعتِ چهار و چهل — چه کسی این‌جا را زیر و رو کرده؟', scene: 'studio', intro: 'intro3', clock: 280,
        file: 'پرونده‌ی عکاسخانه', nb: 'دفترچه — تاریکخانه', clues: ['k3lock', 'k3mud', 'k3keys', 'k3tailor', 'k3msg', 'k3photo', 'k3ticket'],
        goals: [
            { t: 'درِ ورودی را بررسی کن', id: 'door3', done: function () { return has('k3lock'); } },
            { t: 'با چراغ‌قوه کفِ جلوی در را بگرد', id: 'mud3', done: function () { return has('k3mud'); } },
            { t: 'از خانم صدری درباره‌ی کلیدها بپرس', id: 'sadri', done: function () { return has('k3keys'); } },
            { t: 'از آقا رحیمِ خیاط بپرس چه دیده', id: 'rahim', done: function () { return has('k3tailor'); } },
            { t: 'پیامِ منشیِ تلفنی را گوش کن', id: 'answer3', done: function () { return has('k3msg'); } },
            { t: 'در تاریکخانه، عکسِ پنهان را ظاهر کن', id: 'enlarger3', done: function () { return has('k3photo'); } },
            { t: 'با سیاوش حرف بزن (جیب‌هایش را هم ببین)', id: 'siavash', done: function () { return has('k3ticket'); } },
            { t: 'با تلفنِ عکاسخانه، مقصر را معرفی کن', id: 'phone3', done: function () { return false; } }
        ],
        ded: dedOf([[function () { return has('k3lock') && has('k3keys'); }, 'در با کلید باز شده و کلیدِ صاحبخانه تکان نخورده؛ می‌ماند کلیدِ سیاوش.'],
            [function () { return has('k3mud'); }, 'کسی با کتانیِ آجِ ستاره‌ای و دوچرخه آمده.'], [function () { return has('k3tailor'); }, 'جوانی با کلاهِ قرمز ساعتِ سه آمده و با کوله رفته.'],
            [function () { return has('k3msg') || has('k3ticket'); }, 'کسی پاکت را ساعتِ شش در راه‌آهن می‌خواهد.'], [function () { return has('k3photo'); }, 'نادری با مردی انگشتربه‌دست دست داده؛ جلوی برجِ ماه‌نشان.']], strong3, 'تلفنِ روی میز.') },
    4: { n: 'پرونده‌ی ۴', t: 'راه‌آهن', s: 'ساعتِ پنج و پنجاه — پاکت پیش از حرکتِ قطار گم شده.', scene: 'railway', intro: 'intro4', clock: 350,
        file: 'پرونده‌ی پاکت', nb: 'دفترچه — راه‌آهن', clues: ['k4locker', 'k4board', 'k4noori', 'k4radio', 'k4env', 'k4hands', 'k4vafa'],
        goals: [
            { t: 'کمدِ شماره‌ی ۱۷ را بررسی کن', id: 'locker17', done: function () { return has('k4locker'); } },
            { t: 'تابلوی حرکتِ قطارها را بخوان', id: 'board4', done: function () { return has('k4board'); } },
            { t: 'از خانم نوری در باجه درباره‌ی بی‌سیم بپرس', id: 'noori', done: function () { return has('k4noori'); } },
            { t: 'بی‌سیمِ سرویس را روی موجِ درست تنظیم کن', id: 'radio4', done: function () { return has('k4radio'); } },
            { t: 'با چراغ‌قوه زیرِ چمدان‌های گاریِ ۳ را نگاه کن', id: 'env4', done: function () { return has('k4env'); } },
            { t: 'به دست‌های باربر نگاه کن', id: 'gholam', done: function () { return has('k4hands'); } },
            { t: 'بلیتِ آقای وفا را ببین', id: 'vafa', done: function () { return has('k4vafa'); } },
            { t: 'با تلفنِ پاسگاه، مقصر را معرفی کن', id: 'phone4', done: function () { return false; } }
        ],
        ded: dedOf([[function () { return has('k4locker') && has('k4hands'); }, 'روغنِ دستگیره‌ی کمد همان روغنِ دستِ باربر است.'],
            [function () { return has('k4noori') || has('k4radio'); }, 'باربر صبح بی‌سیمِ سرویس را برداشت و درباره‌ی «گاریِ سه» حرف زد.'],
            [function () { return has('k4env'); }, 'پاکت زیرِ چمدان‌های گاریِ سه بود.'], [function () { return has('k4vafa'); }, 'آقای وفا به اصفهان می‌رود؛ به پاکت ربطی ندارد.']], strong4, 'تلفنِ پاسگاه کنارِ باجه است.') },
    5: { n: 'پرونده‌ی ۵', t: 'بتنِ تقلبی', s: 'کارگاهِ برجِ ماه‌نشان، صبحِ برفی — چه کسی بتن را عوض کرده؟', scene: 'site', intro: 'intro5', clock: 490,
        file: 'پرونده‌ی کارگاه', nb: 'دفترچه — کارگاهِ ماه‌نشان', clues: ['k5power', 'k5cubes', 'k5bags', 'k5crack', 'k5guard', 'k5receipt', 'k5eng'],
        goals: [
            { t: 'جعبه‌فیوز را درست کن تا برق برگردد', id: 'fuse5', done: function () { return has('k5power'); } },
            { t: 'دفترِ کارگاه را بگرد', id: 'office5', done: function () { return has('k5cubes'); } },
            { t: 'کیسه‌های سیمان را بررسی کن', id: 'bags5', done: function () { return has('k5bags'); } },
            { t: 'با چراغ‌قوه ستونِ کنارِ کیسه‌ها را نگاه کن', id: 'crack5', done: function () { return has('k5crack'); } },
            { t: 'با نگهبانِ کنارِ آتش حرف بزن', id: 'rahman', done: function () { return has('k5guard'); } },
            { t: 'داشبوردِ وانت را بگرد', id: 'van5', done: function () { return has('k5receipt'); } },
            { t: 'از مهندس پارسا درباره‌ی گزارش‌ها بپرس', id: 'parsa', done: function () { return has('k5eng'); } },
            { t: 'از تلفنِ دفتر، مقصر را معرفی کن', id: 'office5', done: function () { return false; } }
        ],
        ded: dedOf([[function () { return has('k5cubes'); }, 'نمونه‌های واقعی قایم شده‌اند؛ برچسب‌ها با خطِ جعفر است.'],
            [function () { return has('k5bags') || has('k5crack'); }, 'بتنِ برج با ماسه ساخته شده؛ ستون‌ها ترک برداشته‌اند.'],
            [function () { return has('k5guard') || has('k5receipt'); }, 'جعفر ساعتِ پنج بارِ «بتنِ ارزان» را تحویل گرفته.'], [function () { return has('k5eng'); }, 'مهندس فقط امضا می‌کرده؛ نمونه‌ها را جعفر می‌برده.']], strong5, 'تلفنِ دفترِ کارگاه.') },
    6: { n: 'پرونده‌ی ۶', t: 'دفترِ سیاه', s: 'مهمانیِ کیان‌فر در نیاوران — چه کسی مدارک را می‌سوزاند؟', scene: 'villa', intro: 'intro6', clock: 1290,
        file: 'پرونده‌ی دفترِ سیاه', nb: 'دفترچه — باغِ نیاوران', clues: ['k6letter', 'k6ledger', 'k6fire', 'k6ash', 'k6negar', 'k6call'],
        goals: [
            { t: 'با نگار، منشیِ کیان‌فر، حرف بزن', id: 'negar', done: function () { return F.negOk || F.negCold; } },
            { t: 'سبدِ کاغذِ کنارِ میزِ کار را بگرد', id: 'basket6', done: function () { return has('k6letter'); } },
            { t: 'گاوصندوقِ پشتِ تابلوی بزرگ را باز کن', id: 'painting6', done: function () { return has('k6ledger'); } },
            { t: 'با چراغ‌قوه خاکسترِ جلوی شومینه را بگرد', id: 'ash6', done: function () { return has('k6fire'); } },
            { t: 'به دستکش‌های ناصر نگاه کن', id: 'naser', done: function () { return has('k6ash'); } },
            { t: 'دکمه‌ی شماره‌گیریِ دوباره‌ی تلفن را بزن', id: 'phone6', done: function () { return has('k6call'); } },
            { t: 'از نگار بپرس چه کسی به شومینه دست زد', id: 'negar', done: function () { return has('k6negar'); } },
            { t: 'با تلفنِ سالن، مقصر را معرفی کن', id: 'phone6', done: function () { return false; } }
        ],
        ded: dedOf([[function () { return has('k6letter'); }, 'رمزِ گاوصندوق روی نامه‌ی پاره بود: ۱۲ — ۳۰ — ۷.'], [function () { return has('k6ledger'); }, 'دفترِ سیاه: پرداخت به نادری، رستگار و جعفر؛ امضا: م.ک.'],
            [function () { return has('k6ash') || has('k6negar'); }, 'فقط ناصر امشب به شومینه دست زده؛ دستکش‌هایش دوده‌ای است.'], [function () { return has('k6call'); }, 'کسی از تلفنِ سالن به کیان‌فر خبر داده.']], strong6, 'تلفنِ سالن.') },
    7: { n: 'پرونده‌ی ۷', t: 'صبح', s: 'پشت‌بامِ برجِ ماه‌نشان، سپیده — پایانِ بلندترین شب.', scene: 'rooftop', intro: 'intro7', clock: 350,
        file: 'پرونده‌ی کیان‌فر', nb: 'دفترچه — پشت‌بام', clues: ['k7ring', 'k7crane', 'k7driver', 'k7lawyer', 'k7case'],
        goals: [
            { t: 'با کیان‌فر حرف بزن و به دستش نگاه کن', id: 'kianfar', done: function () { return has('k7ring'); } },
            { t: 'اتاقکِ جرثقیل را بگرد', id: 'crane7', done: function () { return has('k7crane'); } },
            { t: 'با اکبرِ راننده مهربان باش', id: 'akbar', done: function () { return has('k7driver'); } },
            { t: 'کاغذهای وکیل را ببین', id: 'sarami', done: function () { return has('k7lawyer'); } },
            { t: 'کیفِ کیان‌فر را با رمزِ راننده باز کن', id: 'case7', done: function () { return has('k7case'); } },
            { t: 'درِ پلکان را باز کن و مقصر را معرفی کن', id: 'stairs7', done: function () { return false; } }
        ],
        ded: dedOf([[function () { return has('k7ring') || has('k7crane'); }, 'انگشترِ کیان‌فر همان است که رضا از جرثقیل عکس گرفته بود.'],
            [function () { return has('k7driver'); }, 'راننده رستگار را به دستورِ کیان‌فر به کوچه برده.'], [function () { return has('k7case'); }, 'نوارِ کیف: صدای خودِ کیان‌فر.'], [function () { return has('k7lawyer'); }, 'کیان‌فر می‌خواهد امروز برج را بفروشد و برود.']], strong7, 'درِ پلکان را باز کن.') },
    8: { n: 'پرونده‌ی ۸', t: 'نقابِ کلاغ', s: 'سینما ایران، نیمه‌شب — مردی که پشتِ همه‌ی این پرونده‌ها بود.', scene: 'cinema', intro: 'intro8', clock: 1430,
        file: 'پرونده‌ی کلاغ', nb: 'دفترچه — سینما ایران', clues: ['k8poster', 'k8samad', 'k8ticket', 'k8feather', 'k8reel'],
        goals: [
            { t: 'پوسترهای سالنِ ورودی را ببین', id: 'poster8', done: function () { return has('k8poster'); } },
            { t: 'با عمو صمد، آپاراتچی، حرف بزن', id: 'samad', done: function () { return has('k8samad'); } },
            { t: 'در گیشه، بلیتِ جامانده را پیدا کن', id: 'booth8', done: function () { return has('k8ticket'); } },
            { t: 'با چراغ‌قوه، ردیفِ هفتِ صندلی‌ها را بگرد', id: 'seat8', done: function () { return has('k8feather'); } },
            { t: 'از پله‌ها بالا برو و فیلم را روی پرده صاف کن', id: 'stairs8', done: function () { return has('k8reel'); } },
            { t: 'با مردِ نقاب‌دار روی صحنه روبه‌رو شو', id: 'crow8', done: function () { return false; } }
        ],
        ded: dedOf([[function () { return has('k8poster') || has('k8ticket'); }, 'کلاغ امشب را برای من ترتیب داده؛ بلیت به اسمِ من است.'],
            [function () { return has('k8samad'); }, 'ده سال است هر یلدا این‌جا می‌آید؛ ردیفِ هفت، صندلیِ سیزده.'], [function () { return has('k8feather'); }, 'کارتِ روی صندلی: «فیلم را تا آخر ببین، سپهر.»'],
            [function () { return has('k8reel'); }, 'کیان‌فر و نادری هر دو برای کلاغ کار می‌کردند.']], strong8, 'به صحنه برو و با او روبه‌رو شو.') }
});
Object.assign(DLG, {
    print_found: [
        ['a', 'کسی می‌خواست مدارکِ کاوه برای همیشه در بایگانیِ راکد گم شوند. «بدونِ نیاز به ثبت». امضا: «ن.»'],
        ['a', 'و چاپگر گیر کرد. حتی ماشین‌ها هم گاهی وجدان دارند. حافظه‌اش را هم باید دید.']
    ]
});
// ---------- update ----------
function mouseWorld() { return { x: (M.x - VP.x) / (VP.s * VIEW.zx) + VIEW.sx + G.camX, y: (M.y - VP.y) / (VP.s * VIEW.zy) + VIEW.sy }; }
function updatePlayer(dt) {
    var S = G.scene, busy = D.active || G.notebook || G.fadeDir || G.mini || G.zoom || G.paused;
    var dir = 0;
    if (!busy) {
        if (KEYS.KeyA || KEYS.ArrowLeft)
            dir -= 1;
        if (KEYS.KeyD || KEYS.ArrowRight)
            dir += 1;
        dir += TOUCH.walk.dir; // phone walk buttons
        if (dir)
            P.goal = null;
        if (!dir && P.goal) {
            var dx = P.goal.x - P.x;
            if (Math.abs(dx) <= (P.goal.id ? reach(P.goal) : 2)) {
                var t = P.goal;
                P.goal = null;
                if (t.id)
                    inspect(t);
            }
            else
                dir = Math.sign(dx);
        }
    }
    P.moving = dir !== 0;
    if (dir)
        P.look = dir;
    // aim & facing follow the mouse; without one, the light points where you walk
    var mw = mouseWorld();
    var aimMouse = M.moved && !TOUCH.used;
    if (aimMouse) {
        if (Math.abs(mw.x - P.x) > 6)
            P.f = mw.x > P.x ? 1 : -1;
    }
    else if (TOUCH.used && TOUCH.aim !== null) { // joystick aim; when released it keeps its tilt and follows the walk direction
        if (dir && TOUCH.stick.id === null && Math.sign(Math.cos(TOUCH.aim)) !== dir)
            TOUCH.aim = Math.PI - TOUCH.aim;
        var c = Math.cos(TOUCH.aim);
        if (Math.abs(c) > 0.06)
            P.f = c > 0 ? 1 : -1;
    }
    else if (dir)
        P.f = dir;
    var sx = P.x + P.f, sy = FLOOR - 20;
    var ang = aimMouse ? Math.atan2(mw.y - sy, mw.x - sx) : (TOUCH.used && TOUCH.aim !== null) ? TOUCH.aim : (P.f > 0 ? 0.18 : Math.PI - 0.18);
    G.fo.ang = ang;
    G.fo.x = sx + Math.cos(ang) * 9;
    G.fo.y = sy + Math.sin(ang) * 9;
    if (P.moving) {
        P.x += dir * 46 * dt;
        P.phase += dt * 7.5 * dir * P.f;
        P.stepAcc += 46 * dt;
        if (P.stepAcc >= 11 && S.indoor) {
            P.stepAcc = 0;
            sfx.stepIn();
        }
        if (P.stepAcc >= 11) {
            P.stepAcc = 0;
            sfx.step();
            for (var i = 0; i < 3; i++)
                puff(P.x + (Math.random() - 0.5) * 6, FLOOR - 1, (Math.random() - 0.5) * 12, -6 - Math.random() * 8, 0.5, [220, 228, 245], 1, false);
        }
    }
    else
        P.stepAcc = 8;
    if (S.id === 'alley' && P.x > 672)
        transition('street', 18);
    if (S.id === 'street' && P.x < 6)
        transition('alley', 660);
    P.x = clamp(P.x, S.minX, S.maxX);
    P.breathT -= dt;
    if (P.breathT <= 0 && !S.indoor) {
        P.breathT = 2.4 + Math.random() * 0.9;
        for (var i = 0; i < 4; i++)
            puff(P.x + P.f * 4, FLOOR - 26, P.f * (6 + i * 2), -2 - i, 1.3, [215, 222, 240], 1, false, 3);
    }
}
function updateWorldFx(dt) {
    var S = G.scene;
    if (S.id === 'alley') {
        if (Math.random() < dt * 9)
            puff(76 + (Math.random() - 0.5) * 10, 134, (Math.random() - 0.5) * 8, -18 - Math.random() * 22, 0.6 + Math.random() * 0.9, [255, 150 + Math.random() * 60 | 0, 50], 1, true);
        var bf = P.x >= 522 ? 1 : -1;
        if (Math.random() < dt * 0.35)
            for (var i = 0; i < 3; i++)
                puff(522 + bf * 5, 129, bf * (5 + i * 2), -2, 1.4, [215, 222, 240], 1, false, 3);
    }
    else if (S.id === 'station') {
        if (Math.random() < dt * 3)
            puff(250 + (Math.random() - 0.5) * 3, 119, (Math.random() - 0.5) * 3, -8 - Math.random() * 4, 1.8, [205, 205, 215], 1, false, 3);
    }
    else if (S.fx) {
        for (var _i = 0, _a = S.fx; _i < _a.length; _i++) {
            var f = _a[_i];
            f(dt);
        }
    }
    else if (S.lei && Math.random() < dt * 5) {
        puff(S.lei.x, S.lei.y - 1, (Math.random() - 0.5) * 2, -7 - Math.random() * 4, 1.6, [175, 170, 190], 1, false, 2);
    }
}
function update(dt) {
    G.t += dt;
    flickerUpdate(dt);
    var S = G.scene, prevCam = G.camX;
    if (G.state === 'title') {
        G.menuT = (G.menuT || 0) + dt;
        if (G.flip) {
            G.flip.t += dt / 0.5;
            if (G.flip.t >= 1)
                G.flip = null;
        }
        var want_1 = G.menu === 'book' ? LEVELS[G.titleSel].scene : 'street';
        if (G.sceneId !== want_1 && !G.fadeDir) {
            G.fadeDir = 1;
            G.fadeCb = function () { return setScene(want_1, SCENES[want_1].spawn); };
        }
        G.camXf = (Math.sin(G.t * 0.045) * 0.5 + 0.5) * (S.w - W);
    }
    else if (G.state === 'play') {
        if (G.zoom) {
            G.zoom.t += dt;
            if (G.zoom.t >= G.zoom.dur) {
                G.mini = MINI[G.zoom.kind];
                G.mini.enter();
                G.zoom = null;
                G.fade = 1;
                G.fadeDir = -1;
                G.fadeCb = null;
            }
        }
        G.hintShow = Math.max(0, (G.hintShow || 0) - dt);
        if (!D.active && !G.mini && !G.paused && !G.notebook) {
            G.idleT = (G.idleT || 0) + dt;
            if (G.idleT > 40 && !G.hintShow && currentGoal()) {
                G.hintShow = 6;
                G.idleT = 0;
            }
        }
        if (G.paused) {
            G.near = null;
        }
        else if (G.mini) {
            G.mini.update(dt);
            updateDialog(dt);
            G.near = null;
        }
        else {
            updatePlayer(dt);
            G.hintT += dt;
            G.clockAcc += dt;
            if (G.clockAcc >= 12) {
                G.clockAcc = 0;
                G.clock++;
            }
            // flashlight reveals what hides in the snow
            for (var _i = 0, _a = S.targets; _i < _a.length; _i++) {
                var t = _a[_i];
                if (t.hidden && !G.revealed[t.id] && litByFlash(t.x, t.y + t.h / 2)) {
                    G.revealed[t.id] = true;
                    sfx.reveal();
                    toast('چیزی زیرِ نورِ چراغ‌قوه برق زد...');
                    for (var i = 0; i < 10; i++)
                        puff(t.x + (Math.random() - 0.5) * t.w, t.y + t.h / 2, (Math.random() - 0.5) * 20, -10 - Math.random() * 20, 0.8, [255, 245, 210], 1, true);
                }
            }
            // nearest interactable & hover
            G.near = null;
            var best = 1e9;
            for (var _b = 0, _c = S.targets; _b < _c.length; _b++) {
                var t = _c[_b];
                if (!visibleTarget(t))
                    continue;
                var d = Math.abs(t.x - P.x);
                if (d <= reach(t) && d - (t.npc ? 8 : 0) < best) {
                    best = d - (t.npc ? 8 : 0);
                    G.near = t;
                }
            }
            updateDialog(dt);
        }
    }
    else if (G.state === 'end')
        G.endT += dt;
    G.camXf = clamp(G.camXf, 0, S.w - W);
    updateView(dt);
    var mw = mouseWorld();
    G.hover = null;
    if (G.state === 'play' && !D.active && !G.notebook && !G.mini && !G.zoom && !TOUCH.used)
        for (var _d = 0, _e = S.targets; _d < _e.length; _d++) {
            var t = _e[_d];
            if (visibleTarget(t) && mw.x >= t.x - t.w / 2 - 2 && mw.x <= t.x + t.w / 2 + 2 && mw.y >= t.y - 2 && mw.y <= t.y + t.h + 2) {
                G.hover = t;
                break;
            }
        }
    updateSnow(dt, G.camX - prevCam);
    updateWorldFx(dt);
    updateParts(dt);
    for (var _f = 0, _g = G.toasts; _f < _g.length; _f++) {
        var t = _g[_f];
        t.t += dt;
    }
    if (G.invTip && (G.invTip.t -= dt) <= 0)
        G.invTip = null;
    G.toasts = G.toasts.filter(function (t) { return t.t < t.dur; });
    if (G.fadeDir) {
        G.fade += G.fadeDir * dt * 2.4;
        if (G.fadeDir > 0 && G.fade >= 1) {
            G.fade = 1;
            if (G.fadeCb) {
                G.fadeCb();
                G.fadeCb = null;
            }
            G.fadeDir = -1;
        }
        else if (G.fadeDir < 0 && G.fade <= 0) {
            G.fade = 0;
            G.fadeDir = 0;
        }
    }
    audioUpdate(dt);
}
// ---------- world rendering (low-res) ----------
var NEON_MOON = null;
function buildNeonMoon() {
    var _a = mk(14, 14), c = _a[0], g = _a[1];
    for (var y = 0; y < 14; y++)
        for (var x = 0; x < 14; x++) {
            var a = Math.hypot(x - 6.5, y - 6.5), b = Math.hypot(x - 9, y - 5);
            if (a <= 6.2 && a >= 4.9 && b > 5.2)
                R(g, x, y, 1, 1, '#5ff0ff');
            else if (a < 4.9 && b > 5.6)
                R(g, x, y, 1, 1, '#5ff0ff');
        }
    return c;
}
function corners(g, x, y, w, h, c) {
    R(g, x, y, 3, 1, c);
    R(g, x, y, 1, 3, c);
    R(g, x + w - 3, y, 3, 1, c);
    R(g, x + w - 1, y, 1, 3, c);
    R(g, x, y + h - 1, 3, 1, c);
    R(g, x, y + h - 3, 1, 3, c);
    R(g, x + w - 3, y + h - 1, 3, 1, c);
    R(g, x + w - 1, y + h - 3, 1, 3, c);
}
function drawEmissive(S, cx, g) {
    if (S.id === 'alley') {
        for (var i = 0; i < 16; i++) { // fire in the barrel
            var x = 69 + (Math.random() * 14 | 0), h = 2 + Math.random() * 8 * FX.fireK | 0;
            R(g, x - cx, 137 - h, 1, h, i % 3 ? '#ff7a1e' : '#ffb03a');
            R(g, x - cx, 137 - h, 1, 1, '#ffe08a');
        }
        R(g, 71 - cx, 136, 10, 1, '#fff0b0');
        R(g, 297 - cx, 69, 6, 2, FX.lampK > 0.5 ? '#ffe4ae' : '#6a5030');
        R(g, 460 - cx, 126, 10, 2, FX.police ? '#ff4a5a' : '#4a1018');
        R(g, 470 - cx, 126, 10, 2, FX.policeB ? '#5a8cff' : '#101a4a');
        R(g, 567 - cx, 106, 4, 3, FX.bulbK > 0.5 ? '#dbe8ff' : '#444a55');
        R(g, 568 - cx, 106, 1, 3, '#26262b');
        R(g, 570 - cx, 106, 1, 3, '#26262b');
    }
    else if (S.id === 'street') {
        if (!NEON_MOON)
            NEON_MOON = buildNeonMoon();
        var nx = 238 - (S.neonText.width >> 1) - cx, ny = 52;
        g.globalAlpha = FX.neonOn ? 1 : 0.22;
        g.drawImage(S.neonText, nx, ny);
        g.drawImage(NEON_MOON, 306 - cx, 57);
        if (FX.neonOn) {
            g.globalAlpha = 0.85;
            g.drawImage(S.neonCore, nx, ny);
        }
        g.globalAlpha = 1;
        for (var y = 124; y < 136; y++)
            for (var x = 158; x < 176; x++) { // CRT static
                var v = 60 + Math.random() * 180 * FX.crtK | 0;
                g.fillStyle = "rgb(".concat(v * 0.8 | 0, ",").concat(v * 0.9 | 0, ",").concat(v, ")");
                g.fillRect(x - cx, y, 1, 1);
            }
        if ((G.t % 1.2) < 0.6)
            R(g, 330 - cx, 88, 1, 1, '#ff2a3a');
        R(g, 60 - cx, 110, 16, 1, FX.bulbK > 0.5 ? '#c8ffe0' : '#3a5048');
        R(g, 439 - cx, 46, 8, 1, FX.lampK > 0.5 ? '#eef4ff' : '#58606a');
    }
    else if (S.dyn) {
        for (var _i = 0, _a = S.dyn; _i < _a.length; _i++) {
            var f = _a[_i];
            f(g, cx);
        }
    }
    else {
        R(g, 216 - cx, 65, 28, 1, FX.tubeK > 0.5 ? '#eef6ff' : '#3a4048');
        R(g, 376 - cx, 65, 28, 1, FX.tubeBad > 0.5 ? '#eef6ff' : '#3a4048');
        R(g, 537 - cx, 68, 5, 1, '#ff5060');
        R(g, 96 - cx, 62, 9, 1, '#fff0c8');
        R(g, 73 - cx, 133, 6, 1, FX.lampK > 0.5 ? '#fff0c0' : '#6a5a30');
        R(g, 273 - cx, 132, 5, 1, '#ffe0a0');
        if ((G.t % 1) < 0.5)
            R(g, 45 - cx, 135, 2, 1, '#8fffb0');
        R(g, 247 - cx, 137, 6, 1, FX.fireK > 0.9 ? '#ffb040' : '#ff6a20');
        R(g, 534 - cx, 125, 2, 1, has('locker') ? '#40ff70' : ((G.t % 1.5) < 0.2 ? '#ff3040' : '#5a1018'));
        var jam = MINI.printer && MINI.printer.jam;
        R(g, 580 - cx, 133, 2, 1, jam ? ((G.t % 0.8) < 0.4 ? '#ff3040' : '#4a1014') : '#40ff70');
        for (var i = 0; i < 4; i++)
            R(g, 356 + i * 3 - cx, 131, 1, 1, Math.sin(G.t * (3 + i) + i * 2) > 0 ? (i % 2 ? '#3aff6a' : '#ffb030') : '#1a2a14');
        R(g, 356 - cx, 134, 6, 3, '#1a3a1a');
        R(g, 356 + Math.round(2.5 + Math.sin(G.t * 9) * 2) - cx, 134, 1, 3, '#b0ffb0');
        if (!F.kazAwake)
            for (var i = 0; i < 3; i++) { // Z-z-z
                var ph = (G.t * 0.45 + i / 3) % 1, zx = Math.round(296 - ph * 7) - cx, zy = Math.round(128 - ph * 14);
                g.globalAlpha = 1 - ph;
                R(g, zx, zy, 3, 1, '#c8d0e8');
                R(g, zx + 1, zy + 1, 1, 1, '#c8d0e8');
                R(g, zx, zy + 2, 3, 1, '#c8d0e8');
                g.globalAlpha = 1;
            }
    }
}
function drawEmissiveFront(S, cx) {
    var g = sctx;
    if (S.id === 'street' && S.lei)
        R(g, S.lei.x - cx, S.lei.y, 1, 1, S.lei.hot ? '#ffc050' : '#d04a14');
    if (S.id === 'cinema')
        drawBirds8(g, cx);
    // revealed-but-unread hidden clues twinkle
    for (var _i = 0, _a = S.targets; _i < _a.length; _i++) {
        var t = _a[_i];
        if (t.hidden && G.revealed[t.id] && !has(t.clue || { cig: 'cig', prints: 'snow', wet: 'wet' }[t.id]) && (G.t * 3 % 1) < 0.55) {
            var x = t.x - cx, y = t.y + (t.h >> 1);
            R(g, x, y - 2, 1, 5, '#fff6d8');
            R(g, x - 2, y, 5, 1, '#fff6d8');
        }
    }
    if (G.state === 'play' && !D.active) {
        var t = G.hover || G.near;
        if (t)
            corners(g, t.x - (t.w >> 1) - cx - 2, t.y - 2, t.w + 4, t.h + 4, G.hover && G.hover !== G.near ? 'rgba(200,210,235,0.7)' : '#ffbf69');
    }
}
function drawGlows(S, cx) {
    var g = sctx;
    if (S.id === 'cinema') { // the projector's beam through the dusty air, from the booth window to the screen
        var k = lightK(S.lights[0]);
        if (k > 0.1) {
            var lx = 516 - cx, gr = g.createLinearGradient(lx, 64, 256 - cx, 93);
            gr.addColorStop(0, "rgba(230,235,255,".concat((0.22 * k).toFixed(3), ")"));
            gr.addColorStop(1, "rgba(230,235,255,".concat((0.05 * k).toFixed(3), ")"));
            g.fillStyle = gr;
            g.beginPath();
            g.moveTo(lx, 62);
            g.lineTo(256 - cx, 64);
            g.lineTo(256 - cx, 122);
            g.lineTo(lx, 66);
            g.closePath();
            g.fill();
        }
    }
    for (var _i = 0, _a = S.lights; _i < _a.length; _i++) {
        var L = _a[_i];
        if (L.x + 30 < cx || L.x - 30 > cx + W)
            continue;
        var k = L.i * lightK(L);
        if (k < 0.1)
            continue;
        var r = L.f === 'neon' ? 26 : 14, gr = g.createRadialGradient(L.x - cx, L.y, 0, L.x - cx, L.y, r);
        gr.addColorStop(0, rgba(L.c, 0.32 * k));
        gr.addColorStop(1, rgba(L.c, 0));
        g.fillStyle = gr;
        g.fillRect(L.x - cx - r, L.y - r, r * 2, r * 2);
    }
    if (S.id === 'street') {
        if (FX.neonOn) {
            var nx = 238 - (S.neonText.width >> 1) - cx;
            g.globalAlpha = 0.35;
            for (var _b = 0, _c = [[-1, 0], [1, 0], [0, -1], [0, 1]]; _b < _c.length; _b++) {
                var __entry14 = _c[_b];
                var ox = __entry14[0], oy = __entry14[1];
                g.drawImage(S.neonText, nx + ox, 52 + oy);
            }
            g.globalAlpha = 1;
        }
        for (var x = 150; x < 330; x += 2) { // neon reflections in the wet street
            var a = (FX.neonOn ? 0.1 : 0.015) * (0.6 + 0.4 * Math.sin(G.t * 3 + x * 0.7));
            g.fillStyle = "rgba(255,45,165,".concat(a, ")");
            g.fillRect(x - cx, 166 + (x * 7 % 3), 1, 13);
        }
        g.fillStyle = "rgba(190,215,255,".concat(0.08 * FX.lampK, ")");
        g.fillRect(436 - cx, 166, 12, 14);
        g.fillStyle = FX.police ? 'rgba(255,40,60,0.1)' : FX.policeB ? 'rgba(50,90,255,0.1)' : 'rgba(0,0,0,0)';
        g.fillRect(0 - cx, 166, 44, 14);
    }
    else if (S.id === 'alley') {
        g.fillStyle = "rgba(255,120,40,".concat(0.05 * FX.fireK, ")");
        g.fillRect(56 - cx, 100, 40, 60);
    }
    if (G.flashLit) { // the beam in the air: a haze indoors, lit flakes outside, dust drifting through it
        var o = G.fo, rr = FL.range * 0.8, hh = FL.half * 0.85;
        g.globalAlpha = (S.indoor ? 0.1 : 0.14) * FX.flashK;
        g.drawImage(airC, 0, 0);
        g.globalAlpha = 1;
        if (S.indoor)
            for (var _d = 0, DUST_1 = DUST; _d < DUST_1.length; _d++) {
                var m = DUST_1[_d];
                var x = ((m.x - cx + Math.sin(G.t * 0.3 + m.ph) * 7) % W + W) % W, y = ((m.y + G.t * m.vy) % H + H) % H;
                var dx = x + cx - o.x, dy = y - o.y, d = Math.hypot(dx, dy);
                if (d > rr || d < 8)
                    continue;
                var th = Math.abs(angDiff(Math.atan2(dy, dx), o.ang));
                if (th > hh)
                    continue;
                g.fillStyle = "rgba(255,240,210,".concat(((1 - d / rr) * (1 - th / hh) * m.b * FX.flashK).toFixed(3), ")");
                g.fillRect(x | 0, y | 0, 1, 1);
            }
        R(g, Math.round(o.x) - cx, Math.round(o.y), 1, 1, '#fff8e0');
    }
}
var DUST = Array.from({ length: 90 }, function (_, i) { return ({ x: (i * 97.3) % W, y: (i * 53.7) % H, ph: i * 1.7, vy: 0.6 + (i % 7) * 0.35 * (i % 2 ? 1 : -1), b: 0.35 + (i % 5) * 0.15 }); });
var _f = mk(WMAX, H), emC = _f[0], ectx = _f[1]; // glowing things on the walls, cut away wherever someone stands in front of them
function drawActors(g, S, cx) {
    if (S.id === 'alley') {
        drawOldMan(g, 95 - cx, FLOOR);
        drawCop(g, 522 - cx, FLOOR, P.x >= 522 ? 1 : -1);
    }
    else if (S.id === 'station') {
        drawSergeant(g, 309 - cx, 152, F.kazAwake);
        drawDispatcher(g, 407 - cx, 152);
    }
    else if (S.id === 'street') {
        var tip = drawLeila(g, 350 - cx, FLOOR, P.x >= 350 ? 1 : -1);
        tip.x += cx;
        S.lei = tip;
    }
    else if (S.id === 'cinema')
        drawCinemaActors(g, cx);
    if (S.npcs)
        for (var _i = 0, _a = S.npcs; _i < _a.length; _i++) {
            var n = _a[_i];
            drawNPC(g, n, cx);
        }
    if (G.state === 'play')
        drawDetective(g, Math.round(P.x) - cx, FLOOR, P.f, P.phase, P.moving, G.fo.ang);
}
function renderWorld() {
    var S = G.scene, cx = G.camX, g = sctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    if (G.mini) {
        var m = mictx;
        m.setTransform(1, 0, 0, 1, 0, 0);
        m.globalCompositeOperation = 'source-over';
        m.globalAlpha = 1;
        G.mini.render(m);
        m.setTransform(1, 0, 0, 1, 0, 0);
        m.globalCompositeOperation = 'source-over';
        m.globalAlpha = 1;
        var ox = miniOX();
        if (ox > 0) {
            g.filter = 'blur(3px)';
            g.drawImage(miniC, 0, 0, WB, H, 0, 0, W, H);
            g.filter = 'none';
            g.fillStyle = 'rgba(4,3,8,0.6)';
            g.fillRect(0, 0, W, H);
        } // the close-up's own backdrop, blurred and dimmed, fills a wider screen
        g.drawImage(miniC, ox, 0);
        g.drawImage(SKY.vig, 0, 0, W, H);
        return;
    }
    if (S.indoor)
        R(g, 0, 0, W, H, '#0a0a0e');
    else
        drawSky(cx);
    g.drawImage(S.bg, -cx, 0);
    if (S.id === 'station') {
        var mA = (G.clock % 60) / 60 * 6.283, hA = ((G.clock / 60) % 12) / 12 * 6.283;
        for (var i = 1; i <= 4; i++)
            R(g, Math.round(301 + Math.sin(mA) * i) - cx, Math.round(93 - Math.cos(mA) * i), 1, 1, '#1a1a1e');
        for (var i = 1; i <= 2; i++)
            R(g, Math.round(301 + Math.sin(hA) * i) - cx, Math.round(93 - Math.cos(hA) * i), 1, 1, '#1a1a1e');
    }
    drawActors(g, S, cx);
    drawParts(g, cx, false);
    if (!S.indoor && !S.noSnow)
        drawSnow(g, false);
    buildLightMap(S, cx);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(lightC, 0, 0);
    g.globalCompositeOperation = 'source-over';
    ectx.globalCompositeOperation = 'source-over';
    ectx.clearRect(0, 0, W, H);
    ectx.drawImage(S.em, -cx, 0);
    drawEmissive(S, cx, ectx);
    ectx.globalCompositeOperation = 'destination-out';
    drawActors(ectx, S, cx);
    ectx.globalCompositeOperation = 'source-over';
    g.drawImage(emC, 0, 0);
    drawEmissiveFront(S, cx);
    g.globalCompositeOperation = 'lighter';
    drawGlows(S, cx);
    drawParts(g, cx, true);
    g.globalCompositeOperation = 'source-over';
    if (!S.indoor && !S.noSnow)
        drawSnow(g, true);
    g.drawImage(SKY.vig, 0, 0, W, H);
}
// ---------- UI (full-resolution overlay, Persian RTL) ----------
var wrapCache = new Map();
function wrap(text, font, maxW) {
    var key = font + '|' + (maxW | 0) + '|' + text;
    var lines = wrapCache.get(key);
    if (lines)
        return lines;
    ctx.font = font;
    lines = [];
    var line = '';
    for (var _i = 0, _a = text.split(' '); _i < _a.length; _i++) {
        var w = _a[_i];
        var test = line ? line + ' ' + w : w;
        if (line && ctx.measureText(test).width > maxW) {
            lines.push(line);
            line = w;
        }
        else
            line = test;
    }
    if (line)
        lines.push(line);
    if (wrapCache.size > 500)
        wrapCache.clear();
    wrapCache.set(key, lines);
    return lines;
}
var UI = { fs: 1 }; // text scale: >1 on phones so dialogue stays readable
var fnt = function (px, w) { return "".concat(w || 'normal', " ").concat(Math.round(px * UI.fs * 1.12), "px ").concat(FONT); }; // the typeface runs small: +12%
function rtl(txt, x, y, color, font, align) {
    ctx.font = font;
    ctx.direction = 'rtl';
    ctx.textAlign = align || 'right';
    ctx.fillStyle = color;
    ctx.fillText(txt, x, y);
}
// ---------- pixel UI kit: rounded pixel panels, pixel icons, buttons ----------
function panel(x, y, w, h, fill, stroke) {
    var p = Math.max(1, Math.round(VP.s * 0.9));
    x = Math.round(x);
    y = Math.round(y);
    w = Math.round(w);
    h = Math.round(h);
    if (w < 5 * p || h < 5 * p) {
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, w, h);
        return;
    }
    ctx.fillStyle = fill;
    ctx.fillRect(x + 2 * p, y, w - 4 * p, p);
    ctx.fillRect(x + p, y + p, w - 2 * p, p);
    ctx.fillRect(x, y + 2 * p, w, h - 4 * p);
    ctx.fillRect(x + p, y + h - 2 * p, w - 2 * p, p);
    ctx.fillRect(x + 2 * p, y + h - p, w - 4 * p, p);
    if (!stroke)
        return;
    ctx.fillStyle = stroke;
    ctx.fillRect(x + 2 * p, y, w - 4 * p, p);
    ctx.fillRect(x + 2 * p, y + h - p, w - 4 * p, p);
    ctx.fillRect(x, y + 2 * p, p, h - 4 * p);
    ctx.fillRect(x + w - p, y + 2 * p, p, h - 4 * p);
    ctx.fillRect(x + p, y + p, p, p);
    ctx.fillRect(x + w - 2 * p, y + p, p, p);
    ctx.fillRect(x + p, y + h - 2 * p, p, p);
    ctx.fillRect(x + w - 2 * p, y + h - 2 * p, p, p);
}
var PXI = {
    pause: ['.......', '.XX.XX.', '.XX.XX.', '.XX.XX.', '.XX.XX.', '.XX.XX.', '.......'],
    book: ['XXXXXX.', 'X....XX', 'X.XX.XX', 'X....XX', 'X.XX.XX', 'X....XX', 'XXXXXX.'],
    bulb: ['..XXX..', '.X...X.', '.X.X.X.', '.X...X.', '..XXX..', '..XXX..', '...X...'],
    flash: ['......X', '....XX.', 'XXXXX..', 'XXXXXX.', 'XXXXX..', '....XX.', '......X'],
    flashoff: ['X......', '.X.....', 'XXX....', 'XXXX...', 'XXXXX..', '.....X.', '......X'],
    sound: ['...X...', '..XX.X.', 'XXXX..X', 'XXXX..X', 'XXXX..X', '..XX.X.', '...X...'],
    mute: ['...X...', '..XX...', 'XXXXX.X', 'XXXX.X.', 'XXXXX.X', '..XX...', '...X...'],
    look: ['.XXX...', 'X...X..', 'X...X..', 'X...X..', '.XXXX..', '....XX.', '.....XX'],
    talk: ['.XXXXX.', 'X.....X', 'X.X.X.X', 'X.....X', '.XXXXX.', '.X.....', 'X......'],
    lock: ['..XXX..', '.X...X.', '.X...X.', 'XXXXXXX', 'XXX.XXX', 'XXX.XXX', 'XXXXXXX'],
    check: ['.......', '......X', '.....XX', 'X...XX.', 'XX.XX..', '.XXX...', '..X....'],
    left: ['...X...', '..XX...', '.XXXXXX', 'XXXXXXX', '.XXXXXX', '..XX...', '...X...'],
    right: ['...X...', '...XX..', 'XXXXXX.', 'XXXXXXX', 'XXXXXX.', '...XX..', '...X...'],
    home: ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', '.XX.XX.', '.XX.XX.', '.XX.XX.'],
    retry: ['..XXX..', '.X...XX', 'X....XX', 'X......', 'X.....X', '.X...X.', '..XXX..'],
    play: ['X......', 'XXX....', 'XXXXX..', 'XXXXXXX', 'XXXXX..', 'XXX....', 'X......'],
    down: ['XXXXXXX', '.XXXXX.', '.XXXXX.', '..XXX..', '..XXX..', '...X...', '.......'],
    help: ['.XXXXX.', 'XX...XX', '....XX.', '...XX..', '...X...', '.......', '...X...']
};
function pxIcon(name, cx, cy, size, color) {
    var b = PXI[name], n = b.length, p = Math.max(1, Math.round(size / n)), x0 = Math.round(cx - n * p / 2), y0 = Math.round(cy - n * p / 2);
    ctx.fillStyle = color;
    for (var y = 0; y < n; y++)
        for (var x = 0; x < b[y].length; x++)
            if (b[y][x] === 'X')
                ctx.fillRect(x0 + x * p, y0 + y * p, p, p);
}
function pxButton(r, o) {
    var u = VP.s, p = Math.max(1, Math.round(u * 0.9)), hov = !TOUCH.used && !o.disabled && inRect(r, M.x, M.y);
    var base = o.disabled ? 'rgba(18,14,28,0.55)' : o.primary ? (hov ? '#d98f2c' : '#b8741e') : (hov ? 'rgba(62,46,30,0.95)' : 'rgba(18,14,28,0.88)');
    var edge = o.disabled ? 'rgba(200,190,220,0.25)' : o.primary ? '#ffe0a8' : 'rgba(255,191,105,0.6)';
    panel(r.x, r.y + p, r.w, r.h, 'rgba(0,0,0,0.5)');
    panel(r.x, r.y, r.w, r.h - p, base, edge);
    var col = o.disabled ? 'rgba(220,214,236,0.4)' : o.primary ? '#1c1208' : '#f3e6cc', cx = r.x + r.w / 2, cy = r.y + (r.h - p) / 2;
    var f = fnt(u * (o.size || 3.4), 'bold'), isz = Math.min(r.h * 0.5, 8 * u * UI.fs);
    if (o.icon && o.label) {
        ctx.font = f;
        var lw = ctx.measureText(o.label).width, gap = 2 * u, tot = isz + gap + lw;
        pxIcon(o.icon, cx + tot / 2 - isz / 2, cy, isz, col);
        rtl(o.label, cx + tot / 2 - isz - gap, cy + u * 0.3, col, f);
    }
    else if (o.icon)
        pxIcon(o.icon, cx, cy, isz, col);
    else
        rtl(o.label, cx, cy + u * 0.3, col, f, 'center');
    if (o.badge) {
        ctx.font = fnt(u * 2.6, 'bold');
        var bw = ctx.measureText(o.badge).width + 3 * u, bh = 5 * u * UI.fs;
        panel(r.x + r.w - bw * 0.7, r.y - bh * 0.4, bw, bh, '#1f6a8a', '#bfefff');
        ltrText(o.badge, r.x + r.w - bw * 0.7 + bw / 2, r.y - bh * 0.4 + bh / 2 + u * 0.3, '#ffffff', fnt(u * 2.6, 'bold'));
    }
    if (o.fn && !o.disabled)
        G.buttons.push({ x: r.x, y: r.y, w: r.w, h: r.h, fn: o.fn });
}
// ---------- saved progress (per-viewer convenience; the game works without it) ----------
var SAVE_KEY = 'snowNeon.progress.v1';
var UNLOCK_ALL_FOR_TESTING = false; // true opens every case for testing; off for release: cases open one by one
var PROG = (function () { try {
    return JSON.parse(localStorage.getItem(SAVE_KEY)) || {};
}
catch (e) {
    return {};
} })();
PROG.done = PROG.done || {};
function saveProg() { try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(PROG));
}
catch (e) { /* storage unavailable */ } }
var LEVEL_COUNT = function () { return Object.keys(LEVELS).length; };
function isUnlocked(n) { return UNLOCK_ALL_FOR_TESTING || n === 1 || !!PROG.done[n - 1]; }
// ---------- goals & hints (so a child always knows what to do next) ----------
function currentGoal() { var gl = LV().goals || []; for (var _i = 0, gl_1 = gl; _i < gl_1.length; _i++) {
    var g = gl_1[_i];
    if (!g.done())
        return g;
} return null; }
function showHint() {
    var g = currentGoal();
    if (!g) {
        toast('همه‌ی سرنخ‌ها پیدا شد. وقتِ معرفیِ مقصر است!');
        return;
    }
    G.hintShow = 7;
    G.idleT = 0;
    sfx.reveal();
}
function drawHintArrow(u, X, Y, VW, VH) {
    var g = currentGoal();
    if (!g || G.hintShow <= 0 || D.active || G.notebook || G.paused)
        return;
    var S = G.scene, bob = Math.sin(G.t * 7) * 2 * u, col = '#ffd23a', a = Math.min(1, G.hintShow);
    ctx.globalAlpha = a;
    if (g.sc && g.sc !== S.id) { // the goal is in the other scene: point to the exit
        var side = (S.exits && S.exits[g.sc]) || 1, x = side > 0 ? X + VW - 16 * u : X + 16 * u, y = Y + VH * 0.45;
        pxIcon(side > 0 ? 'right' : 'left', x + side * bob, y, 12 * u, col);
        rtl(S.id === 'alley' ? 'به خیابان برو' : 'به کوچه برگرد', x - side * 4 * u, y + 11 * u * UI.fs, col, fnt(u * 3.4, 'bold'), side > 0 ? 'right' : 'left');
        ctx.globalAlpha = 1;
        return;
    }
    var t = S.targets.find(function (q) { return q.id === g.id; });
    if (!t) {
        ctx.globalAlpha = 1;
        return;
    }
    var p = w2s(t.x, t.y);
    if (p.x < X + 8 * u || p.x > X + VW - 8 * u) {
        var side = p.x > X + VW / 2 ? 1 : -1, x = side > 0 ? X + VW - 12 * u : X + 12 * u;
        pxIcon(side > 0 ? 'right' : 'left', x + side * bob, Y + VH * 0.55, 11 * u, col);
    }
    else {
        var y = Math.max(Y + 30 * u, p.y - 8 * u);
        pxIcon('down', p.x, y + bob, 9 * u, col);
    }
    ctx.globalAlpha = 1;
}
// ---------- pause ----------
function togglePause() { if (G.state !== 'play' || G.mini || G.zoom)
    return; G.paused = !G.paused; G.notebook = false; sfx.toggle(); }
function toggleFlash() { G.flashOn = !G.flashOn; sfx.toggle(); }
function drawPause(u, X, Y, VW, VH) {
    ctx.fillStyle = 'rgba(2,2,8,0.72)';
    ctx.fillRect(X, Y, VW, VH);
    var fs = UI.fs, bh = 11 * u * fs, w = Math.min(VW - 20 * u, 120 * u * Math.min(fs, 1.3)), gap = 3 * u;
    var items = [
        { label: 'ادامه‌ی بازی', icon: 'play', primary: true, fn: function () { G.paused = false; } },
        { label: 'دفترچه‌ی پرونده', icon: 'book', fn: function () { G.paused = false; G.notebook = true; } },
        { label: 'نشان دادنِ راهنما', icon: 'bulb', fn: function () { G.paused = false; showHint(); } },
        { label: A.muted ? 'صدا: خاموش' : 'صدا: روشن', icon: A.muted ? 'mute' : 'sound', fn: function () { return setMuted(!A.muted); } },
        { label: 'منوی اصلی', icon: 'home', fn: function () { return backToTitle(); } }
    ];
    var h = 16 * u * fs + items.length * (bh + gap), x = X + (VW - w) / 2, y = Y + (VH - h) / 2;
    panel(x - 4 * u, y - 4 * u, w + 8 * u, h + 6 * u, 'rgba(14,12,22,0.97)', 'rgba(255,191,105,0.6)');
    rtl('مکث', x + w / 2, y + 5 * u * fs, '#ffbf69', fnt(u * 5, 'bold'), 'center');
    var by = y + 13 * u * fs;
    for (var _i = 0, items_1 = items; _i < items_1.length; _i++) {
        var it = items_1[_i];
        pxButton({ x: x, y: by, w: w, h: bh }, it);
        by += bh + gap;
    }
}
function drawLevelTitle(n, x, y, font, color, align) {
    var t = LEVELS[n].t;
    if (n !== 1) {
        rtl(t, x, y, color, font, align);
        return;
    }
    ctx.font = font;
    var w1 = ctx.measureText('برفِ ').width, wAll = ctx.measureText(t).width;
    var right = align === 'center' ? x + wAll / 2 : x;
    rtl('برفِ', right, y, color, font);
    rtl('خونی', right - w1, y, '#ff2a3a', font);
}
// ---------- menu: a title screen, then the case notebook (one page per case) ----------
var GAME_NAME = 'کلاغ';
// the crow (for the title) and the app icon: the detective against Tehran's black skyline, no flashlight
var CROW = (function () {
    var rows = ['....KK......', '.YYKWKK.....', '...KKKKK....', '..KKKKKKK...', '.KkkKKKKKK..', 'KkkKKKKKKKK.', '.KKKKKKKKKK.', '..KKKKKKK.KK', '...K..K....K'];
    var pal = { K: '#0c0c14', k: '#2e3050', W: '#ffd84a', Y: '#4a4a50' }, at = function (x, y) { return (rows[y] || '')[x] || '.'; };
    var _a = mk(rows[0].length, rows.length), c = _a[0], g = _a[1];
    rows.forEach(function (row, y) {
        for (var x = 0; x < row.length; x++) {
            var ch = row[x];
            if (!pal[ch])
                continue;
            R(g, x, y, 1, 1, 'Kk'.includes(ch) && (!pal[at(x, y - 1)] || !pal[at(x + 1, y)]) ? '#8f9bc4' : pal[ch]);
        }
    });
    return c;
})();
var APP_ICON = 'data:image/png;base64,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'; // the app icon: the man in the crow mask over Tehran at night
function setMenu(m) { G.menu = m; G.menuT = 0; G.menuHelp = false; G.flip = null; }
function openBook() { setMenu('book'); sfx.paper(); }
function flipTo(n) {
    if (G.flip || n < 1 || n > LEVEL_COUNT() || n === G.titleSel)
        return;
    G.flip = { from: G.titleSel, to: n, t: 0 };
    G.titleSel = n;
    sfx.paper();
}
var bookFs = function () { return clamp(UI.fs, 1.2, 1.35); }, bfnt = function (px, w) { return fnt(px * bookFs() / UI.fs, w); }; // notebook text never shrinks below 1.2
function menuStamp(text, x, y, col, rot, u) {
    var f = bfnt(u * 6, 'bold');
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.globalAlpha = 0.85;
    ctx.font = f;
    var w = ctx.measureText(text).width + 7 * u, h = 10 * u * bookFs(), lw = Math.max(2, Math.round(u * 0.9));
    ctx.fillStyle = col;
    ctx.fillRect(-w / 2, -h / 2, w, lw);
    ctx.fillRect(-w / 2, h / 2 - lw, w, lw);
    ctx.fillRect(-w / 2, -h / 2, lw, h);
    ctx.fillRect(w / 2 - lw, -h / 2, lw, h);
    rtl(text, 0, u * 0.4, col, f, 'center');
    ctx.restore();
}
var CAST = { 1: ['y', 'b', 'l'], 2: ['k', 'm', 'j'], 8: ['p', 'K'] }, THUMB_X = { 1: 300, 2: 222, 3: 382, 4: 236, 5: 150, 6: 256, 7: 420, 8: 350 }, THUMBS = {};
function caseThumb(n) {
    if (THUMBS[n])
        return THUMBS[n];
    var S = SCENES[LEVELS[n].scene], w = 128, h = 72, sx = clamp((THUMB_X[n] || S.spawn) - w / 2, 0, S.w - w), sy = 164 - h, _a = mk(w, h), c = _a[0], g = _a[1];
    if (S.indoor)
        R(g, 0, 0, w, h, '#0a0a0e');
    else
        g.drawImage(S.skyGrad || SKY.grad, 0, sy, WB, h, 0, 0, w, h);
    g.drawImage(S.bg, sx, sy, w, h, 0, 0, w, h);
    drawDetective(g, w / 2 - 10, FLOOR - sy, 1, 0, false, 0.15);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = S.indoor ? '#8c7c92' : '#8a88aa';
    g.fillRect(0, 0, w, h);
    var vg = g.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, w * 0.62);
    vg.addColorStop(0, 'rgba(255,255,255,1)');
    vg.addColorStop(1, 'rgba(60,50,70,1)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    g.drawImage(S.em, sx, sy, w, h, 0, 0, w, h);
    return (THUMBS[n] = c);
}
function paperPage(r, u) {
    panel(r.x, r.y, r.w, r.h, '#e9ddc2');
    var t = Math.max(1, Math.round(u * 0.5));
    ctx.fillStyle = 'rgba(70,100,150,0.2)';
    for (var y = r.y + 12 * u; y < r.y + r.h - 4 * u; y += 7 * u * bookFs())
        ctx.fillRect(r.x + 3 * u, Math.round(y), r.w - 6 * u, t);
    ctx.fillStyle = 'rgba(190,50,50,0.35)';
    ctx.fillRect(r.x + r.w - 8 * u, r.y + 2 * u, t, r.h - 4 * u);
}
function pageRight(n, r, u) {
    var L = LEVELS[n], open = isUnlocked(n), fs = bookFs(), rx = r.x + r.w - 11 * u, cx = r.x + r.w / 2 - 3 * u;
    paperPage(r, u);
    rtl(L.n, rx, r.y + 7 * u * fs, '#8a4a1a', bfnt(u * 3.2, 'bold'));
    drawLevelTitle(n, rx, r.y + 16 * u * fs, bfnt(u * 6.4, 'bold'), open ? '#2a1a10' : 'rgba(42,26,16,0.35)');
    var pw = Math.min(r.w - 22 * u, 96 * u), ph = pw * 72 / 128, px = cx - pw / 2, py = r.y + 25 * u * fs;
    ctx.fillStyle = 'rgba(40,24,10,0.25)';
    ctx.fillRect(px - u, py - u, pw + 5 * u, ph + 11 * u);
    ctx.fillStyle = '#f6f1e6';
    ctx.fillRect(px - 2 * u, py - 2 * u, pw + 4 * u, ph + 10 * u);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(caseThumb(n), px, py, pw, ph);
    if (!open) {
        ctx.fillStyle = 'rgba(12,10,18,0.86)';
        ctx.fillRect(px, py, pw, ph);
        pxIcon('lock', cx, py + ph / 2, ph * 0.42, '#d8cfe8');
    }
    ctx.fillStyle = 'rgba(232,222,168,0.8)';
    ctx.fillRect(px - 5 * u, py - 4 * u, 12 * u, 4 * u);
    ctx.fillRect(px + pw - 7 * u, py - 4 * u, 12 * u, 4 * u);
    rtl(open ? SCENES[L.scene].name : '؟ ؟ ؟', cx, py + ph + 4 * u, '#4a4a58', bfnt(u * 2.6), 'center');
    if (PROG.done[n])
        menuStamp('حل شد', px + pw * 0.24, py + ph * 0.78, '#c01e2a', -0.2, u);
    else if (!open)
        menuStamp('قفل', px + pw * 0.24, py + ph * 0.78, '#5a5866', -0.12, u);
}
function pageLeft(n, r, u) {
    var L = LEVELS[n], open = isUnlocked(n), fs = bookFs(), rx = r.x + r.w - 11 * u, maxW = r.w - 18 * u;
    paperPage(r, u);
    rtl('یادداشتِ کارآگاه', rx, r.y + 7 * u * fs, '#8a4a1a', bfnt(u * 3.2, 'bold'));
    var f = bfnt(u * 3.6), text = open ? L.s : 'این برگ هنوز قفل است. اول پرونده‌ی ' + toFa(n - 1) + ' را حل کن تا باز شود.';
    var y = r.y + 16 * u * fs;
    for (var _i = 0, _a = wrap(text, f, maxW); _i < _a.length; _i++) {
        var ln = _a[_i];
        rtl(ln, rx, y, '#22304a', f);
        y += 7 * u * fs;
    }
    if (open) {
        rtl('سرنخ‌ها: ' + toFa(L.clues.length) + ' مورد' + (PROG.done[n] ? ' — حل شده' : ''), rx, y + u, '#6a4a2a', bfnt(u * 3, 'bold'));
        y += 7 * u * fs;
    }
    var bh = Math.min(15 * u * fs, 20 * u), bw = r.w - 16 * u, by = r.y + r.h - bh - 6 * u;
    // the people in this case, clipped to the page like mugshots
    var cast = CAST[n] || (SCENES[L.scene].npcs || []).map(function (q) { return q.id; }), ps = Math.min(19 * u * fs, (by - y - 8 * u) * 0.8, (maxW - 8 * u) / 4);
    if (cast.length && ps > 10 * u) {
        rtl('افرادِ پرونده', rx, y + 2 * u, '#8a4a1a', bfnt(u * 3, 'bold'));
        var py_1 = y + 7 * u;
        cast.slice(0, 4).forEach(function (k, i) {
            var px = rx - ps - i * (ps + 3 * u);
            ctx.fillStyle = 'rgba(40,24,10,0.25)';
            ctx.fillRect(px - u, py_1 - u, ps + 3 * u, ps + 3 * u);
            ctx.fillStyle = '#f6f1e6';
            ctx.fillRect(px - 1.5 * u, py_1 - 1.5 * u, ps + 3 * u, ps + 3 * u);
            if (open && PORTRAIT[k]) {
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(PORTRAIT[k], px, py_1, ps, ps);
            }
            else {
                ctx.fillStyle = '#1a1622';
                ctx.fillRect(px, py_1, ps, ps);
                rtl('؟', px + ps / 2, py_1 + ps / 2, '#6a6478', bfnt(u * 5, 'bold'), 'center');
            }
            ctx.fillStyle = '#8a8a96';
            ctx.fillRect(px + ps / 2 - u, py_1 - 3 * u, 2 * u, 5 * u);
        });
    }
    pxButton({ x: r.x + 5 * u, y: by, w: bw, h: bh }, open
        ? { label: PROG.done[n] ? 'دوباره بازی کن' : 'شروع پرونده', icon: PROG.done[n] ? 'retry' : 'play', primary: true, size: 4.6, fn: function () { return startGame(n); } }
        : { label: 'قفل است', icon: 'lock', disabled: true, size: 4.2 });
}
function drawLogo(u, cx, cy, k) {
    var f = fnt(u * 20 * k, 'bold');
    ctx.font = f;
    var tw = ctx.measureText(GAME_NAME).width;
    ctx.shadowColor = 'rgba(255,207,122,0.8)';
    ctx.shadowBlur = u * 4;
    rtl(GAME_NAME, cx, cy, '#f4ead4', f, 'center');
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#9a2231';
    ctx.fillRect(cx - tw * 0.42, cy + 9 * u * k, tw * 0.84, Math.max(2, Math.round(u)));
    var ps = Math.max(1, Math.round(u * 1.3 * k));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(CROW, Math.round(cx + tw / 2 - CROW.width * ps * 0.9), Math.round(cy - 11 * u * k - CROW.height * ps), CROW.width * ps, CROW.height * ps);
}
function drawHome(u, X, Y, VW, VH) {
    var fs = UI.fs, cx = X + VW / 2, on = FX.neonOn || Math.random() < 0.3, a = clamp(G.menuT / 0.7, 0, 1), drop = (1 - a) * (1 - a) * 14 * u;
    var band = ctx.createLinearGradient(0, Y, 0, Y + VH * 0.62);
    band.addColorStop(0, 'rgba(4,3,10,0.85)');
    band.addColorStop(0.7, 'rgba(4,3,10,0.78)');
    band.addColorStop(1, 'rgba(4,3,10,0)');
    ctx.fillStyle = band;
    ctx.fillRect(X, Y, VW, VH * 0.62);
    ctx.globalAlpha = a;
    drawLogo(u, cx, Y + VH * 0.25 - drop, 1);
    ctx.shadowBlur = u * 1.5;
    ctx.shadowColor = '#000';
    rtl('یک معمای کارآگاهی — تهران، شبِ یلدا', cx, Y + VH * 0.45, '#bfe9ff', fnt(u * 4.2), 'center');
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    var k = Math.min(fs, 1.3), bw = 86 * u * k, bh = 20 * u * k, by = Y + VH * 0.54, pulse = 1 + Math.sin(G.t * 3.2) * 0.035;
    pxButton({ x: cx - bw * pulse / 2, y: by, w: bw * pulse, h: bh }, { label: 'شروع', icon: 'play', primary: true, size: 6.4, fn: openBook });
    var s = 13 * u * k, gy = by + bh + 6 * u;
    pxButton({ x: cx - s - 3 * u, y: gy, w: s, h: s }, { icon: A.muted ? 'mute' : 'sound', fn: function () { return setMuted(!A.muted); } });
    pxButton({ x: cx + 3 * u, y: gy, w: s, h: s }, { icon: 'help', fn: function () { G.menuHelp = true; sfx.beep(660); } });
    G.buttons.push({ x: X, y: Y, w: VW, h: VH, fn: openBook }); // tap anywhere to open the notebook
}
function drawMenuHelp(u, X, Y, VW, VH) {
    var fs = Math.min(UI.fs, 1.4), w = Math.min(VW - 30 * u, 210 * u), lines = TOUCH.used
        ? [['راه رفتن', 'دو دکمه‌ی پایینِ چپ'], ['چراغ‌قوه', 'دسته‌ی گردِ پایینِ راست'], ['بررسی و حرف زدن', 'دکمه‌ی بزرگِ «بررسی»'], ['گیر کردی؟', 'دکمه‌ی لامپ، راه را نشانت می‌دهد']]
        : [['راه رفتن', 'A و D یا کلیک روی زمین'], ['چراغ‌قوه', 'ماوس'], ['بررسی و حرف زدن', 'E یا کلیک'], ['گیر کردی؟', 'دکمه‌ی لامپ؛ Esc برای مکث']];
    var lh = 10 * u * fs, h = 20 * u * fs + lines.length * lh, x = X + (VW - w) / 2, y = Y + (VH - h) / 2;
    ctx.fillStyle = 'rgba(3,2,8,0.6)';
    ctx.fillRect(X, Y, VW, VH);
    panel(x, y, w, h, 'rgba(14,12,22,0.97)', 'rgba(255,191,105,0.6)');
    rtl('چطور بازی کنم؟', x + w / 2, y + 7 * u * fs, '#ffbf69', fnt(u * 5, 'bold'), 'center');
    lines.forEach(function (_a, i) {
        var k = _a[0], v = _a[1];
        var ly = y + 17 * u * fs + i * lh;
        rtl(k, x + w - 8 * u, ly, '#f3e6cc', fnt(u * 3.8, 'bold'));
        rtl(v, x + w * 0.58, ly, '#a8b0c4', fnt(u * 3.4));
    });
    G.buttons.push({ x: X, y: Y, w: VW, h: VH, fn: function () { G.menuHelp = false; } });
}
function drawBook(u, X, Y, VW, VH) {
    var fs = Math.min(UI.fs, 1.35), N = LEVEL_COUNT(), n = G.titleSel, s = 13 * u * fs, top = Y + s + 7 * u;
    pxButton({ x: X + VW - 5 * u - s, y: Y + 4 * u, w: s, h: s }, { icon: 'right', fn: function () { return setMenu('home'); } });
    pxButton({ x: X + 5 * u, y: Y + 4 * u, w: s, h: s }, { icon: A.muted ? 'mute' : 'sound', fn: function () { return setMuted(!A.muted); } });
    ctx.shadowColor = '#000';
    ctx.shadowBlur = u * 1.5;
    rtl('دفترچه‌ی پرونده‌ها', X + VW / 2, Y + 4 * u + s / 2, '#ffbf69', fnt(u * 5, 'bold'), 'center');
    ctx.shadowBlur = 0;
    var as = 14 * u * Math.min(fs, 1.25), dotH = 9 * u * fs, bw = Math.min(VW - 2 * (as + 12 * u), 264 * u), bh = Y + VH - dotH - 9 * u - top;
    var bx = X + (VW - bw) / 2, by = top, spine = bx + bw / 2, LP = { x: bx, y: by, w: bw / 2 - 2 * u, h: bh }, RP = { x: spine + 2 * u, y: by, w: bw / 2 - 2 * u, h: bh };
    // leather cover, stitching, spine rings
    panel(bx - 5 * u, by - 4 * u, bw + 10 * u, bh + 8 * u, '#4a2c1a', '#1c0f08');
    ctx.fillStyle = '#b08850';
    for (var x = bx - 2 * u; x < bx + bw + 2 * u; x += 5 * u) {
        ctx.fillRect(x, by - 2.5 * u, 2 * u, Math.max(1, u * 0.6));
        ctx.fillRect(x, by + bh + 2 * u, 2 * u, Math.max(1, u * 0.6));
    }
    var page = function (side, k) { return side === 'R' ? pageRight(k, RP, u) : pageLeft(k, LP, u); };
    var nb = G.buttons.length, f = G.flip;
    if (!f) {
        page('R', n);
        page('L', n);
    }
    else {
        var t = f.t < 0.5 ? 2 * f.t * f.t : 1 - 2 * (1 - f.t) * (1 - f.t), k_1 = Math.abs(1 - 2 * t), fw = f.to > f.from;
        var sheet = function (side, idx) {
            var r = side === 'R' ? RP : LP;
            ctx.save();
            ctx.translate(spine, 0);
            ctx.scale(Math.max(0.02, k_1), 1);
            ctx.translate(-spine, 0);
            page(side, idx);
            ctx.fillStyle = "rgba(40,24,10,".concat(((1 - k_1) * 0.45).toFixed(3), ")");
            ctx.fillRect(r.x, r.y, r.w, r.h);
            ctx.restore();
        };
        if (fw) {
            page('R', f.from);
            page('L', f.to);
            if (t < 0.5)
                sheet('L', f.from);
            else
                sheet('R', f.to);
        }
        else {
            page('L', f.from);
            page('R', f.to);
            if (t < 0.5)
                sheet('R', f.from);
            else
                sheet('L', f.to);
        }
        G.buttons.length = nb;
    }
    ctx.fillStyle = '#24140a';
    ctx.fillRect(spine - 2 * u, by, 4 * u, bh);
    for (var y = by + 4 * u; y < by + bh - 3 * u; y += 9 * u) {
        panel(spine - 3.5 * u, y, 7 * u, 3 * u, '#a8a8b4');
        ctx.fillStyle = '#6a6a76';
        ctx.fillRect(spine - 3.5 * u, y + 2 * u, 7 * u, u);
    }
    // turn the page: arrows (RTL: the next case is to the left), swipes, or the numbered tabs below
    var ay = by + bh / 2 - as / 2;
    pxButton({ x: X + 4 * u, y: ay, w: as, h: as }, { icon: 'left', disabled: n >= N, fn: function () { return flipTo(n + 1); } });
    pxButton({ x: X + VW - 4 * u - as, y: ay, w: as, h: as }, { icon: 'right', disabled: n <= 1, fn: function () { return flipTo(n - 1); } });
    var gap = 2 * u, rowW = N * dotH + (N - 1) * gap, dy = Y + VH - dotH - 4 * u;
    var _loop_2 = function (i) {
        var x = X + VW / 2 + rowW / 2 - i * dotH - (i - 1) * gap, sel = i === n, op = isUnlocked(i);
        panel(x, dy, dotH, dotH, sel ? '#b8741e' : PROG.done[i] ? 'rgba(30,70,40,0.95)' : 'rgba(18,14,28,0.9)', sel ? '#ffe0a8' : 'rgba(255,191,105,0.45)');
        if (op)
            rtl(toFa(i), x + dotH / 2, dy + dotH / 2 + u * 0.3, sel ? '#1c1208' : '#f3e6cc', fnt(u * 4, 'bold'), 'center');
        else
            pxIcon('lock', x + dotH / 2, dy + dotH / 2, dotH * 0.5, 'rgba(220,214,236,0.5)');
        G.buttons.push({ x: x, y: dy, w: dotH, h: dotH, fn: function () { return flipTo(i); } });
    };
    for (var i = 1; i <= N; i++) {
        _loop_2(i);
    }
}
function drawMenu(u, X, Y, VW, VH) {
    var gr = ctx.createLinearGradient(0, Y, 0, Y + VH);
    gr.addColorStop(0, 'rgba(4,3,10,0.55)');
    gr.addColorStop(0.45, 'rgba(4,3,10,0.2)');
    gr.addColorStop(1, 'rgba(4,3,10,0.85)');
    ctx.fillStyle = gr;
    ctx.fillRect(X, Y, VW, VH);
    if (G.menu === 'book') {
        ctx.fillStyle = 'rgba(4,3,10,0.35)';
        ctx.fillRect(X, Y, VW, VH);
        drawBook(u, X, Y, VW, VH);
    }
    else
        drawHome(u, X, Y, VW, VH);
    if (UNLOCK_ALL_FOR_TESTING)
        rtl('نسخه‌ی آزمایشی — همه‌ی پرونده‌ها باز است', X + 5 * u, Y + VH - 3 * u, 'rgba(160,168,190,0.6)', fnt(u * 2.4), 'left');
    if (G.menuHelp)
        drawMenuHelp(u, X, Y, VW, VH);
}
// ---------- end of a case ----------
function drawEnd(u, X, Y, VW, VH) {
    var E = G.ending, a = clamp(G.endT / 1.6, 0, 0.9), fs = UI.fs;
    ctx.fillStyle = "rgba(3,2,8,".concat(a, ")");
    ctx.fillRect(X, Y, VW, VH);
    if (G.endT < 0.8)
        return;
    var cx = X + VW / 2, al = clamp((G.endT - 0.8) / 1.2, 0, 1), last = G.level >= LEVEL_COUNT();
    ctx.globalAlpha = al;
    ctx.shadowColor = E.c;
    ctx.shadowBlur = u * 5;
    rtl(E.cont ? 'ادامه دارد...' : E.good && last ? 'پایان' : E.t, cx, Y + VH * 0.2, E.c, fnt(u * 11, 'bold'), 'center');
    ctx.shadowBlur = 0;
    rtl(E.good && last ? E.t + ' — ' + E.s : E.s, cx, Y + VH * 0.34, '#e6e0f2', fnt(u * 4.2), 'center');
    if (E.cont)
        rtl('فصلِ دوم: به‌زودی', cx, Y + VH * 0.55, '#ff8a9a', fnt(u * 4.4, 'bold'), 'center');
    rtl('سرنخ‌های پیداشده: ' + toFa(clueCount()) + ' از ' + toFa(LV().clues.length), cx, Y + VH * 0.43, '#9aa3b8', fnt(u * 3.4), 'center');
    if (!E.good) {
        var miss = LV().clues.filter(function (k) { return !has(k); }).slice(0, 3).map(function (k) { return CLUES[k].n; });
        rtl(miss.length ? 'پیدا نکردی: ' + miss.join('، ') : 'مدرک‌ها را دوباره کنارِ هم بگذار.', cx, Y + VH * 0.51, '#ffbf69', fnt(u * 3.2), 'center');
    }
    if (G.endT > 2.2) {
        var bw = Math.min(70 * u * fs, VW * 0.3), bh = 13 * u * fs, by = Y + VH * 0.62, g2 = 6 * u;
        var next = E.good && !last, btnA = next ? { label: 'مرحله‌ی بعد', icon: 'play', primary: true, fn: function () { return startGame(G.level + 1); } }
            : E.good ? { label: 'منوی اصلی', icon: 'home', primary: true, fn: function () { return backToTitle(); } } : { label: 'دوباره امتحان کن', icon: 'retry', primary: true, fn: function () { return startGame(G.level); } };
        var btnB = next || !E.good ? { label: 'منوی اصلی', icon: 'home', fn: function () { return backToTitle(); } } : null;
        if (btnB) {
            pxButton({ x: cx + g2 / 2, y: by, w: bw, h: bh }, btnA);
            pxButton({ x: cx - g2 / 2 - bw, y: by, w: bw, h: bh }, btnB);
        }
        else
            pxButton({ x: cx - bw / 2, y: by, w: bw, h: bh }, btnA);
    }
    ctx.globalAlpha = 1;
}
var inRect = function (r, x, y) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; };
var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
function drawUI() {
    var u = VP.s, UR = uiRect(), X = UR.x, Y = UR.y, VW = UR.w, VH = UR.h;
    UIR = UR;
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.imageSmoothingEnabled = false;
    G.buttons = [];
    var fadeOv = function () { if (G.fade > 0) {
        ctx.fillStyle = "rgba(3,2,6,".concat(G.fade, ")");
        ctx.fillRect(X, Y, VW, VH);
    } };
    if (G.state === 'title') {
        fadeOv();
        drawMenu(u, X, Y, VW, VH);
    }
    else {
        if (G.state === 'play')
            drawHUD(u, X, Y, VW, VH);
        else if (G.state === 'end')
            drawEnd(u, X, Y, VW, VH);
        fadeOv();
    }
    if (G.state === 'play' && TOUCH.used)
        drawTouchUI(u);
    if (ctx.canvas.height > ctx.canvas.width * 1.1) { // portrait phone
        panel(X + 4 * u, Y + 2 * u, VW - 8 * u, 9 * u, 'rgba(8,6,14,0.9)', 'rgba(255,191,105,0.6)');
        rtl('برای بازی بهتر، گوشی را افقی بگیرید', X + VW / 2, Y + 6.7 * u, '#ffd79a', fnt(u * 4, 'bold'), 'center');
    }
    if (M.moved && M.x >= 0 && !TOUCH.used) { // reticle
        ctx.strokeStyle = 'rgba(255,191,105,0.9)';
        ctx.lineWidth = Math.max(1, u * 0.4);
        ctx.beginPath();
        ctx.arc(M.x, M.y, u * 2.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#ffe2b0';
        ctx.fillRect(M.x - u * 0.4, M.y - u * 0.4, u * 0.8, u * 0.8);
    }
    ctx.restore();
    UIR = null;
}
function drawMiniUI(u, X, Y, VW, VH) {
    var m = G.mini;
    if (m) {
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = u * 1.2;
        rtl(m.title, X + VW - 6 * u, Y + 6.5 * u * UI.fs, '#e6e0f2', fnt(u * 3.8, 'bold'));
        ctx.shadowBlur = 0;
        var label = TOUCH.used ? 'بازگشت' : 'بازگشت (Esc)';
        ctx.font = fnt(u * 3.2, 'bold');
        var r = { x: X + 6 * u, y: Y + 3 * u, w: ctx.measureText(label).width + 7 * u * UI.fs, h: 7 * u * UI.fs, fn: function () { if (!D.active)
                closeMini(); } }, hov = inRect(r, M.x, M.y);
        panel(r.x, r.y, r.w, r.h, hov ? 'rgba(255,191,105,0.25)' : 'rgba(8,6,14,0.75)', 'rgba(255,191,105,0.6)');
        rtl(label, r.x + r.w / 2, r.y + r.h / 2 + u * 0.2, hov ? '#ffe2b0' : '#e0d8ec', fnt(u * 3.2, 'bold'), 'center');
        G.buttons.push(r);
        drawToasts(u, X, Y, VW);
        if (m.ui)
            m.ui(u, VP.x + miniOX() * u, VP.y, WB * u, VP.h); // lined up with the close-up's pixels
        if (!D.active) {
            var h = m.hint();
            ctx.font = fnt(u * 3.3, 'bold');
            var w = Math.min(ctx.measureText(h).width + 10 * u, VW - 12 * u);
            var hb = VP.y + VP.h; // centred at the very bottom of the picture, under the close-up's own labels (no corner to avoid there)
            panel(X + (VW - w) / 2, hb - 13 * u * UI.fs, w, 8 * u * UI.fs, 'rgba(8,6,14,0.82)', 'rgba(127,227,255,0.45)');
            rtl(h, X + VW / 2, hb - 9 * u * UI.fs + u * 0.2, '#cfeeff', fnt(u * 3.3, 'bold'), 'center');
        }
    }
    else
        drawToasts(u, X, Y, VW);
    if (D.active)
        drawDialog(u, X, Y, VW, VH);
}
function drawHUD(u, X, Y, VW, VH) {
    if (G.mini || G.zoom) {
        drawMiniUI(u, X, Y, VW, VH);
        return;
    }
    var S = G.scene, fs = UI.fs, T = TOUCH.used;
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = u * 1.2;
    rtl(S.name, X + VW - 6 * u, Y + 6 * u * fs, '#e6e0f2', fnt(u * 3.8, 'bold'));
    rtl(toFa(pad2(G.clock / 60 | 0) + ':' + pad2(G.clock % 60)) + (G.clock < 360 ? ' بامداد' : G.clock < 720 ? ' صبح' : ''), X + VW - 6 * u, Y + 11.5 * u * fs, '#9aa3b8', fnt(u * 3.1));
    ctx.shadowBlur = 0;
    // top-left: pause, notebook (with clue count), hint, flashlight
    var bs = 11 * u * fs, gap = 2.5 * u;
    var bx = X + 5 * u;
    var by = Y + 3.5 * u;
    var btns = [
        { icon: 'pause', fn: togglePause },
        { icon: 'book', fn: function () { if (!D.active)
                G.notebook = !G.notebook; }, badge: toFa(clueCount()) + '/' + toFa(LV().clues.length) },
        { icon: 'bulb', fn: showHint },
        { icon: G.flashOn ? 'flash' : 'flashoff', fn: toggleFlash }
    ];
    for (var _i = 0, btns_1 = btns; _i < btns_1.length; _i++) {
        var b = btns_1[_i];
        pxButton({ x: bx, y: by, w: bs, h: bs }, b);
        bx += bs + gap;
    }
    // current goal
    var goal = currentGoal();
    if (goal && !D.active && !G.notebook) {
        var txt = 'هدف: ' + goal.t;
        ctx.font = fnt(u * 3.1, 'bold');
        var w = Math.min(ctx.measureText(txt).width + 7 * u, VW * 0.62), gy_1 = by + bs + 3 * u;
        panel(X + 5 * u, gy_1, w, 7 * u * fs, 'rgba(10,8,18,0.8)', G.hintShow > 0 ? '#ffd23a' : 'rgba(255,210,58,0.45)');
        ctx.save();
        ctx.beginPath();
        ctx.rect(X + 5 * u, gy_1, w, 7 * u * fs);
        ctx.clip();
        rtl(txt, X + 5 * u + w - 3.5 * u, gy_1 + 3.6 * u * fs, '#ffe79a', fnt(u * 3.1, 'bold'));
        ctx.restore();
    }
    // prompt over the nearest target / hovered target
    if (!D.active && !G.notebook && !G.fadeDir) {
        var t = G.hover || G.near;
        if (t) {
            var inReach = Math.abs(t.x - P.x) <= reach(t);
            var label = (t.npc ? 'صحبت با ' : 'بررسی ') + t.n + (T ? (inReach ? '' : '  (لمس کنید تا بروید)') : inReach ? (G.hover ? '  [کلیک]' : '  [E]') : '  [کلیک برای رفتن]');
            var p = w2s(t.x, t.y - 7), sy = Math.max(Y + 36 * u * fs, p.y);
            ctx.font = fnt(u * 3.2, 'bold');
            var w = ctx.measureText(label).width + 6 * u;
            var px = clamp(p.x - w / 2, X + 2 * u, X + VW - w - 2 * u);
            panel(px, sy - 3.4 * u * fs, w, 6.8 * u * fs, 'rgba(8,6,14,0.85)', inReach ? 'rgba(255,191,105,0.8)' : 'rgba(180,190,220,0.45)');
            rtl(label, px + w / 2, sy + u * 0.3, inReach ? '#ffd79a' : '#c8cde0', fnt(u * 3.2, 'bold'), 'center');
        }
    }
    drawHintArrow(u, X, Y, VW, VH);
    if (!D.active && G.hintT < 25 && !G.notebook && !T)
        rtl('A / D حرکت · ماوس: نورِ چراغ‌قوه · E یا کلیک: بررسی · Esc: مکث', X + VW / 2, Y + VH - 5 * u, "rgba(200,206,225,".concat(clamp((25 - G.hintT) / 3, 0, 0.85), ")"), fnt(u * 2.9), 'center');
    // inventory: bottom-right on desktop, under the clock on phones (the joystick owns that corner)
    if (!D.active && !G.notebook) {
        var sz = T ? 10 * u * fs : 13 * u;
        var ix = X + VW - 6 * u - sz, iy = T ? Y + 15 * u * fs : Y + VH - 12 * u - sz, tip = null;
        G.invRects = [];
        for (var _a = 0, _b = G.inv; _a < _b.length; _a++) {
            var k = _b[_a];
            var r = { x: ix, y: iy, w: sz, h: sz, k: k }, hov = T ? (G.invTip && G.invTip.k === k) : inRect(r, M.x, M.y);
            G.invRects.push(r);
            panel(r.x, r.y, r.w, r.h, hov ? 'rgba(255,191,105,0.25)' : 'rgba(8,6,14,0.75)', 'rgba(255,191,105,0.45)');
            ctx.drawImage(ICON[CLUES[k].i || k] || ICON.note, r.x + u, r.y + u, sz - 2 * u, sz - 2 * u);
            if (hov)
                tip = { k: k, x: r.x + r.w / 2, y: T ? r.y + r.h + 5 * u * fs : r.y - 4 * u };
            ix -= sz + 2 * u;
        }
        if (tip) {
            var txt = CLUES[tip.k].n + ' — ' + CLUES[tip.k].d;
            ctx.font = fnt(u * 3);
            var w = Math.min(ctx.measureText(txt).width + 6 * u, VW * 0.7), px = clamp(tip.x - w / 2, X + 2 * u, X + VW - w - 2 * u);
            panel(px, tip.y - 3.5 * u * fs, w, 7 * u * fs, 'rgba(8,6,14,0.94)', 'rgba(255,191,105,0.55)');
            ctx.save();
            ctx.beginPath();
            ctx.rect(px, tip.y - 3.5 * u * fs, w, 7 * u * fs);
            ctx.clip();
            rtl(txt, px + w - 3 * u, tip.y + u * 0.3, '#e8e2f2', fnt(u * 3));
            ctx.restore();
        }
    }
    drawToasts(u, X, Y, VW);
    if (D.active)
        drawDialog(u, X, Y, VW, VH);
    if (G.notebook)
        drawNotebook(u, X, Y, VW, VH);
    if (G.paused)
        drawPause(u, X, Y, VW, VH);
}
// ---------- camera view: some scenes (and phones) show a closer crop of the pixel buffer ----------
var VIEW = { sx: 0, sy: 0, sw: W, sh: H, zx: 1, zy: 1, sxf: 0 };
function viewZoom() {
    if (G.state === 'title' || G.mini)
        return 1;
    var S = G.scene;
    return (S.zoom || 1) * (TOUCH.used ? (S.phoneZoom || 1.12) : 1);
}
function updateView(dt, snap) {
    var S = G.scene, z = viewZoom(), sw = Math.round(W / z), sh = Math.round(H / z);
    var target = G.state === 'title' ? G.camXf + (W - sw) / 2 : P.x - sw / 2 + (P.look || P.f) * 12; // look ahead where he walks, not where he aims
    target = clamp(target, 0, Math.max(0, S.w - sw));
    G.viewF = snap || VIEW.sw !== sw || G.viewF == null || G.state === 'title' ? target : lerp(G.viewF, target, 1 - Math.exp(-dt * 4));
    var vx = Math.round(G.viewF);
    G.camX = clamp(vx - Math.round((W - sw) / 2), 0, Math.max(0, S.w - W));
    VIEW.sx = clamp(vx - G.camX, 0, W - sw);
    VIEW.sxf = VIEW.sx;
    VIEW.sw = sw;
    VIEW.sh = sh;
    VIEW.sy = Math.round(clamp(S.viewTop != null ? S.viewTop : (H - sh) * 0.5, Math.max(0, 170 - sh), H - sh));
    VIEW.zx = W / sw;
    VIEW.zy = H / sh;
}
function w2s(wx, wy) { return { x: VP.x + (wx - G.camX - VIEW.sx) * VP.s * VIEW.zx, y: VP.y + (wy - VIEW.sy) * VP.s * VIEW.zy }; }
function drawToasts(u, X, Y, VW) {
    var fs = UI.fs;
    var ty = Y + (TOUCH.used ? 34 : 26) * u * fs;
    for (var _i = 0, _a = G.toasts; _i < _a.length; _i++) {
        var t = _a[_i];
        var a = Math.min(1, t.t / 0.25, (t.dur - t.t) / 0.5);
        ctx.globalAlpha = clamp(a, 0, 1);
        ctx.font = fnt(u * 3.6, 'bold');
        var iw = t.icon ? 10 * u * fs : 0, w = ctx.measureText(t.txt).width + 8 * u + iw, px = X + VW / 2 - w / 2;
        panel(px, ty - 4 * u * fs, w, 8 * u * fs, 'rgba(10,8,18,0.88)', t.icon ? 'rgba(127,227,255,0.6)' : 'rgba(255,191,105,0.45)');
        if (t.icon)
            ctx.drawImage(ICON[(CLUES[t.icon] && CLUES[t.icon].i) || t.icon] || ICON.note, px + w - iw + u, ty - 3 * u * fs, 6 * u * fs, 6 * u * fs);
        rtl(t.txt, px + w - iw - 4 * u, ty + u * 0.2, t.icon ? '#bfefff' : '#ffd79a', fnt(u * 3.6, 'bold'));
        ty += 10 * u * fs;
    }
    ctx.globalAlpha = 1;
}
function drawDialog(u, X, Y, VW, VH) {
    var fs = UI.fs, spk = SPK[D.spk] || SPK.n, hasP = PORTRAIT[D.spk], font = fnt(u * 4.1), lh = 6.4 * u * fs, chH = (TOUCH.used ? 8.6 : 6.8) * u * fs;
    var bx = X + 8 * u, bw = VW - 16 * u, textRight = bx + bw - (hasP ? 38 : 8) * u, maxW = bw - (hasP ? 48 : 18) * u;
    var lines = D.full ? wrap(D.full, font, maxW) : [];
    var showCh = D.choices && typingDone();
    var chFont = fnt(u * 3.7, 'bold'), chLines = showCh ? D.choices.map(function (c, i) { return toFa(i + 1) + '.  ' + c.t; }) : [];
    var head = spk.n ? 8 * u * fs + 7 * u * fs : 10 * u;
    // on phones the answers are big cards, two to a row, each with a large number square
    var grid = showCh && TOUCH.used, cols = grid && D.choices.length > 1 ? 2 : 1, rows = grid ? Math.ceil(D.choices.length / cols) : 0;
    var cardH = Math.max(15 * u * fs, 24 * u), cardGap = 3 * u;
    var chBlock = !showCh ? 0 : grid ? rows * (cardH + cardGap) + 2 * u : chLines.length * chH + 4 * u;
    var bh = Math.max(38 * u, head + lines.length * lh + chBlock + 4 * u);
    var by = Y + VH - bh - 5 * u;
    panel(bx, by, bw, bh, 'rgba(7,6,13,0.9)', 'rgba(255,191,105,0.35)');
    ctx.fillStyle = spk.c;
    ctx.fillRect(bx + bw - u * 0.8, by, u * 0.8, bh);
    if (hasP) {
        var ps = 26 * u;
        ctx.drawImage(PORTRAIT[D.spk], bx + bw - ps - 6 * u, by + 6 * u, ps, ps);
        ctx.strokeStyle = spk.c;
        ctx.lineWidth = Math.max(1, u * 0.4);
        ctx.strokeRect(bx + bw - ps - 6 * u, by + 6 * u, ps, ps);
    }
    var ty = by + 8 * u * fs;
    if (spk.n)
        rtl(spk.n, textRight, ty, spk.c, fnt(u * 3.8, 'bold'));
    ty = by + head;
    var rem = D.shown;
    for (var _i = 0, lines_2 = lines; _i < lines_2.length; _i++) {
        var ln = lines_2[_i];
        if (rem <= 0)
            break;
        rtl(ln.slice(0, rem), textRight, ty, D.spk === 'n' ? '#b8c0d4' : '#ece6f6', font);
        rem -= ln.length + 1;
        ty += lh;
    }
    D.rects = [];
    if (grid) {
        var gx_1 = bx + 6 * u, gw_1 = textRight - gx_1, cw_1 = (gw_1 - (cols - 1) * cardGap) / cols, y0_1 = by + head + lines.length * lh + 2 * u;
        var cf_1 = fnt(u * 3.6, 'bold'), bs_1 = Math.min(cardH - 6 * u, 12 * u * fs);
        D.choices.forEach(function (c, i) {
            var col = i % cols, row = (i / cols) | 0, r = { x: gx_1 + gw_1 - (col + 1) * cw_1 - col * cardGap, y: y0_1 + row * (cardH + cardGap), w: cw_1, h: cardH };
            var sel = D.sel === i, p = Math.max(1, Math.round(u * 0.9));
            panel(r.x, r.y + p, r.w, r.h, 'rgba(0,0,0,0.5)');
            panel(r.x, r.y, r.w, r.h - p, sel ? 'rgba(120,80,30,0.9)' : 'rgba(34,26,48,0.95)', sel ? '#ffbf69' : 'rgba(255,191,105,0.5)');
            var bxN = r.x + r.w - bs_1 - 3 * u, byN = r.y + (r.h - p - bs_1) / 2;
            panel(bxN, byN, bs_1, bs_1, sel ? '#ffbf69' : '#b8741e', '#ffe0a8');
            rtl(toFa(i + 1), bxN + bs_1 / 2, byN + bs_1 / 2 + u * 0.4, '#1c1208', fnt(u * 5, 'bold'), 'center');
            var tl = wrap(c.t, cf_1, r.w - bs_1 - 10 * u).slice(0, 2), tlh = 5.6 * u * fs, ty0 = r.y + (r.h - p) / 2 - (tl.length - 1) * tlh / 2 + u * 0.3;
            tl.forEach(function (ln, k) { return rtl(ln, bxN - 3 * u, ty0 + k * tlh, sel ? '#fff0d0' : '#ece6f6', cf_1); });
            D.rects[i] = r;
        });
    }
    else if (showCh) {
        ty = by + head + lines.length * lh + 3 * u;
        chLines.forEach(function (txt, i) {
            var r = { x: bx + 6 * u, y: ty - chH / 2, w: textRight - bx - 4 * u, h: chH - 0.4 * u };
            if (inRect(r, M.x, M.y))
                D.sel = i;
            var sel = D.sel === i;
            panel(r.x, r.y, r.w, r.h - 0.6 * u, sel ? 'rgba(120,80,30,0.55)' : 'rgba(34,26,48,0.8)', sel ? '#ffbf69' : 'rgba(255,191,105,0.28)');
            rtl(txt, textRight - 3 * u, ty, sel ? '#ffe2b0' : '#d6d0e4', chFont);
            D.rects.push(r);
            ty += chH;
        });
    }
    else if (typingDone() && (G.t % 1) < 0.6) {
        ctx.fillStyle = '#ffbf69';
        var ax = bx + 8 * u, ay = by + bh - 6 * u;
        ctx.beginPath();
        ctx.moveTo(ax, ay - 1.5 * u);
        ctx.lineTo(ax + 3 * u, ay - 1.5 * u);
        ctx.lineTo(ax + 1.5 * u, ay + 1 * u);
        ctx.fill();
    }
}
function drawNotebook(u, X, Y, VW, VH) {
    ctx.fillStyle = 'rgba(2,2,6,0.6)';
    ctx.fillRect(X, Y, VW, VH);
    var fs0 = UI.fs;
    UI.fs = Math.min(fs0, 1.3);
    var fs = UI.fs;
    var ds = deductions(), rowH = 13.6 * u * fs, dl = 5 * u * fs;
    var w = Math.min(VW - 16 * u, 250 * u), h = Math.min(VH - 8 * u, 24 * u * fs + 12 * u + 5 * rowH + Math.max(1, ds.length) * dl), x = X + (VW - w) / 2, y = Y + (VH - h) / 2;
    panel(x, y, w, h, 'rgba(14,12,22,0.97)', 'rgba(255,191,105,0.5)');
    var right = x + w - 7 * u;
    rtl(LV().nb, right, y + 8 * u * fs, '#ffbf69', fnt(u * 4.4, 'bold'));
    rtl(TOUCH.used ? 'بستن: لمس' : 'بستن: I یا کلیک', x + 7 * u, y + 8 * u * fs, '#6c7288', fnt(u * 2.8), 'left');
    var colW = (w - 18 * u) / 2;
    LV().clues.forEach(function (k, i) {
        var col = i < 5 ? 0 : 1, row = i < 5 ? i : i - 5;
        var cr = right - col * (colW + 4 * u), cy = y + 17 * u * fs + row * rowH, got = has(k);
        ctx.globalAlpha = got ? 1 : 0.35;
        panel(cr - 10 * u, cy - 1 * u, 10 * u, 10 * u, 'rgba(255,255,255,0.04)', 'rgba(255,191,105,0.3)');
        if (got)
            ctx.drawImage(ICON[CLUES[k].i || k] || ICON.note, cr - 9.5 * u, cy - 0.5 * u, 9 * u, 9 * u);
        else
            rtl('؟', cr - 5 * u, cy + 4 * u, '#8890a8', fnt(u * 4, 'bold'), 'center');
        rtl(got ? CLUES[k].n : (k === 'neg' && F.negGiven ? 'نگاتیو — دستِ ستوان' : '؟ ؟ ؟'), cr - 13 * u, cy + 1.5 * u, got ? '#f0e8ff' : '#8890a8', fnt(u * 3.3, 'bold'));
        if (got) {
            var ls = wrap(CLUES[k].d, fnt(u * 2.8), colW - 15 * u);
            ls.slice(0, 2).forEach(function (ln, j) { return rtl(ln, cr - 13 * u, cy + 5.6 * u * fs + j * 3.7 * u * fs, '#a8a2ba', fnt(u * 2.8)); });
        }
        ctx.globalAlpha = 1;
    });
    var dy = y + 17 * u * fs + 5 * rowH + 2 * u;
    ctx.fillStyle = 'rgba(255,191,105,0.3)';
    ctx.fillRect(x + 7 * u, dy - 3 * u, w - 14 * u, Math.max(1, u * 0.3));
    rtl('نتیجه‌گیری‌ها', right, dy + 2 * u, '#7fe3ff', fnt(u * 3.6, 'bold'));
    dy += 6.5 * u * fs;
    if (!ds.length)
        rtl('هنوز هیچ. برف را بگرد.', right, dy, '#8890a8', fnt(u * 3));
    for (var _i = 0, ds_1 = ds; _i < ds_1.length; _i++) {
        var dd = ds_1[_i];
        if (dy > y + h - 3 * u)
            break;
        rtl('— ' + dd, right, dy, '#d8d2e6', fnt(u * 3));
        dy += dl;
    }
    UI.fs = fs0;
}
// ---------- input ----------
function toDev(e) { var r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * cv.width / r.width, (e.clientY - r.top) * cv.height / r.height]; }
function backToTitle() { if (G.mini && G.mini.exit)
    G.mini.exit(); G.state = 'title'; D.active = false; G.mini = null; G.zoom = null; G.paused = false; G.notebook = false; setScene('alley', SCENES.alley.spawn); G.titleSel = G.level || 1; setMenu('book'); G.fade = 1; G.fadeDir = -1; G.fadeCb = null; }
function onClick() {
    for (var _i = 0, _a = G.buttons; _i < _a.length; _i++) {
        var b = _a[_i];
        if (inRect(b, M.x, M.y)) {
            b.fn();
            return;
        }
    }
    if (G.state !== 'play' || G.paused)
        return;
    if (G.notebook) {
        G.notebook = false;
        return;
    }
    if (D.active) {
        if (D.choices && typingDone()) {
            var i = D.rects.findIndex(function (r) { return inRect(r, M.x, M.y); });
            if (i >= 0)
                choose(i);
        }
        else
            advance();
        return;
    }
    if (G.zoom)
        return;
    if (G.mini) {
        G.mini.down(lowMouse());
        return;
    }
    if (G.fadeDir)
        return;
    var mw = mouseWorld();
    if (G.hover) {
        if (Math.abs(G.hover.x - P.x) <= reach(G.hover))
            inspect(G.hover);
        else
            P.goal = G.hover;
    }
    else if (mw.y > 100)
        P.goal = { x: clamp(mw.x, G.scene.minX, G.scene.maxX) }; // click the ground to walk there
}
cv.addEventListener('pointermove', function (e) {
    var pt = toDev(e);
    if (touchMove(e, pt))
        return; // walk-pad / joystick fingers don't move the pointer
    M.x = pt[0], M.y = pt[1];
    M.moved = true;
    if (G.mini && G.mini.move && !D.active)
        G.mini.move(lowMouse());
});
var pointerUp = function (e) {
    var _a;
    if (touchUp(e))
        return;
    if (e)
        _a = toDev(e), M.x = _a[0], M.y = _a[1];
    if (G.swipe && G.state === 'title' && G.menu === 'book') { // swipe right = next case (the book reads right to left)
        var dx = M.x - G.swipe.x, dy = M.y - G.swipe.y;
        if (Math.abs(dx) > 22 * VP.s && Math.abs(dx) > Math.abs(dy) * 1.3)
            flipTo(G.titleSel + (dx > 0 ? 1 : -1));
    }
    G.swipe = null;
    if (G.mini && G.mini.up)
        G.mini.up(lowMouse());
};
cv.addEventListener('pointerup', pointerUp);
cv.addEventListener('pointercancel', function (e) { return pointerUp(e); });
cv.addEventListener('pointerdown', function (e) {
    var _a;
    e.preventDefault();
    cv.focus();
    _a = toDev(e), M.x = _a[0], M.y = _a[1];
    M.moved = true;
    initAudio();
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        if (!TOUCH.used) {
            TOUCH.used = true;
            resize();
        }
        if (touchDown(e))
            return;
    }
    else if (e.pointerType === 'mouse' && TOUCH.used && !matchMedia('(pointer: coarse)').matches) {
        TOUCH.used = false;
        updateFs();
    }
    if (G.state === 'title')
        G.swipe = { x: M.x, y: M.y };
    onClick();
});
cv.addEventListener('contextmenu', function (e) { return e.preventDefault(); });
window.addEventListener('keydown', function (e) {
    var c = e.code;
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(c))
        e.preventDefault();
    if (e.repeat && !['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(c))
        return;
    KEYS[c] = true;
    initAudio();
    var act = c === 'KeyE' || c === 'Space' || c === 'Enter' || c === 'NumpadEnter';
    if (G.state === 'title') {
        var N = LEVEL_COUNT(), dg = /^(Digit|Numpad)([1-9])$/.exec(c);
        if (G.menuHelp)
            G.menuHelp = false;
        else if (dg && +dg[2] <= N) {
            G.titleSel = +dg[2];
            if (isUnlocked(G.titleSel))
                startGame(G.titleSel);
        }
        else if (G.menu !== 'book') {
            if (act || c === 'ArrowLeft' || c === 'ArrowRight')
                openBook();
        }
        else if (c === 'ArrowLeft')
            flipTo(G.titleSel + 1);
        else if (c === 'ArrowRight')
            flipTo(G.titleSel - 1);
        else if (c === 'Escape' || c === 'Backspace')
            setMenu('home');
        else if (act && isUnlocked(G.titleSel) && !G.flip)
            startGame(G.titleSel);
        return;
    }
    if (G.state === 'end') {
        if (act && G.endT > 2.2) {
            if (G.ending.good && G.level < LEVEL_COUNT())
                startGame(G.level + 1);
            else if (G.ending.good)
                backToTitle();
            else
                startGame(G.level);
        }
        return;
    }
    if (c === 'KeyM') {
        setMuted(!A.muted);
        return;
    }
    if (G.zoom)
        return;
    if (G.mini && !D.active) {
        if (c === 'Escape')
            closeMini();
        else if (G.mini.key)
            G.mini.key(c);
        return;
    }
    if (c === 'KeyF') {
        G.flashOn = !G.flashOn;
        sfx.toggle();
        return;
    }
    if (c === 'KeyI' || c === 'Tab') {
        if (!D.active)
            G.notebook = !G.notebook;
        return;
    }
    if (c === 'Escape' || c === 'KeyP') {
        if (G.notebook)
            G.notebook = false;
        else if (!D.active)
            togglePause();
        return;
    }
    if (G.paused) {
        if (act)
            G.paused = false;
        return;
    }
    if (c === 'KeyH') {
        showHint();
        return;
    }
    if (D.active) {
        var n = /^(Digit|Numpad)([1-9])$/.exec(c);
        if (n && D.choices && typingDone()) {
            choose(+n[2] - 1);
            return;
        }
        if (D.choices && typingDone() && (c === 'ArrowUp' || c === 'KeyW')) {
            D.sel = (D.sel + D.choices.length - 1) % D.choices.length;
            sfx.click();
            return;
        }
        if (D.choices && typingDone() && (c === 'ArrowDown' || c === 'KeyS')) {
            D.sel = (D.sel + 1) % D.choices.length;
            sfx.click();
            return;
        }
        if (act) {
            if (D.choices && typingDone())
                choose(D.sel);
            else
                advance();
        }
        return;
    }
    if (G.notebook) {
        if (act)
            G.notebook = false;
        return;
    }
    if (act && G.near && !G.fadeDir)
        inspect(G.near);
});
window.addEventListener('keyup', function (e) { KEYS[e.code] = false; });
window.addEventListener('blur', function () { for (var k in KEYS)
    KEYS[k] = false; });
// ---------- phone controls: walk pad (bottom-left), flashlight joystick (bottom-right), action button ----------
var TOUCH = {
    used: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    walk: { id: null, dir: 0 }, stick: { id: null, x: 0, y: 0 }, aim: null, L: null
};
function updateFs() { UI.fs = TOUCH.used ? clamp(13 * VP.dpr / (4.1 * VP.s), 1, 1.7) : 1; wrapCache.clear(); }
function targetAt(mw) {
    for (var _i = 0, _a = G.scene.targets; _i < _a.length; _i++) {
        var t = _a[_i];
        if (visibleTarget(t) && mw.x >= t.x - t.w / 2 - 4 && mw.x <= t.x + t.w / 2 + 4 && mw.y >= t.y - 4 && mw.y <= t.y + t.h + 4)
            return t;
    }
    return null;
}
function setStick(pt) {
    var L = TOUCH.L || touchLayout(), dx = (pt[0] - L.stick.x) / L.stick.r, dy = (pt[1] - L.stick.y) / L.stick.r, m = Math.hypot(dx, dy);
    TOUCH.stick.x = m > 1 ? dx / m : dx;
    TOUCH.stick.y = m > 1 ? dy / m : dy;
    if (m > 0.22)
        TOUCH.aim = Math.atan2(dy, dx);
}
function setWalk(pt) { var L = TOUCH.L || touchLayout(); TOUCH.walk.dir = pt[0] < (L.left.x + L.left.w + L.right.x) / 2 ? -1 : 1; }
function touchDown(e) {
    if (!controlsLive() || G.fadeDir)
        return false;
    var pt = [M.x, M.y], L = touchLayout();
    TOUCH.L = L;
    for (var _i = 0, _a = G.buttons; _i < _a.length; _i++) {
        var b = _a[_i];
        if (inRect(b, M.x, M.y))
            return false;
    }
    for (var _b = 0, _c = G.invRects || []; _b < _c.length; _b++) {
        var r = _c[_b];
        if (inRect(r, M.x, M.y)) {
            G.invTip = G.invTip && G.invTip.k === r.k ? null : { k: r.k, t: 3 };
            return true;
        }
    }
    var d = function (c) { return Math.hypot(pt[0] - c.x, pt[1] - c.y); };
    var pad = 3 * VP.s, inR = function (r) { return pt[0] >= r.x - pad && pt[0] <= r.x + r.w + pad && pt[1] >= r.y - pad && pt[1] <= r.y + r.h + pad; };
    if (inR(L.act)) {
        if (G.near)
            inspect(G.near);
        else {
            showHint();
        }
        return true;
    }
    if (d(L.stick) < L.stick.r * 2) {
        TOUCH.stick.id = e.pointerId;
        setStick(pt);
        return true;
    }
    if (pt[0] < L.right.x + L.right.w * 1.5 && pt[1] > L.left.y - L.left.h * 1.2) {
        TOUCH.walk.id = e.pointerId;
        setWalk(pt);
        P.goal = null;
        return true;
    }
    var t = targetAt(mouseWorld());
    if (t) {
        if (Math.abs(t.x - P.x) <= reach(t))
            inspect(t);
        else
            P.goal = t;
        return true;
    }
    var mw = mouseWorld();
    if (mw.y > 100)
        P.goal = { x: clamp(mw.x, G.scene.minX, G.scene.maxX) };
    return true;
}
function touchMove(e, pt) {
    if (e.pointerId === TOUCH.walk.id) {
        setWalk(pt);
        return true;
    }
    if (e.pointerId === TOUCH.stick.id) {
        setStick(pt);
        return true;
    }
    return false;
}
function touchUp(e) {
    var id = e ? e.pointerId : null;
    if (!e || id === TOUCH.walk.id) {
        TOUCH.walk.id = null;
        TOUCH.walk.dir = 0;
        if (e)
            return true;
    }
    if (!e || id === TOUCH.stick.id) {
        TOUCH.stick.id = null;
        TOUCH.stick.x = TOUCH.stick.y = 0;
        if (e)
            return true;
    }
    return false;
}
function touchLayout() {
    var u = VP.s, _a = uiRect(), X = _a.x, Y = _a.y, VW = _a.w, VH = _a.h, k = Math.max(1, UI.fs * 0.85);
    var bw = 20 * u * k, by = Y + VH - 25 * u * k;
    return {
        left: { x: X + 5 * u, y: by, w: bw, h: bw }, right: { x: X + 8 * u + bw, y: by, w: bw, h: bw },
        stick: { x: X + VW - 24 * u * k, y: Y + VH - 24 * u * k, r: 15 * u * k },
        act: { x: X + VW - 82 * u * k, y: Y + VH - 22 * u * k, w: 30 * u * k, h: 17 * u * k }
    };
}
var controlsLive = function () { return G.state === 'play' && !G.mini && !G.zoom && !D.active && !G.notebook && !G.paused; };
function drawTouchUI(u) {
    if (!controlsLive()) {
        if (TOUCH.walk.id !== null || TOUCH.stick.id !== null)
            touchUp(null);
        return;
    }
    var L = touchLayout();
    TOUCH.L = L;
    var p = Math.max(1, Math.round(u * 0.9));
    for (var _i = 0, _a = [[L.left, -1], [L.right, 1]]; _i < _a.length; _i++) {
        var __entry15 = _a[_i];
        var c = __entry15[0], side = __entry15[1]; // walk pad: two square pixel buttons
        var on = TOUCH.walk.dir === side;
        panel(c.x, c.y + p, c.w, c.h, 'rgba(0,0,0,0.45)');
        panel(c.x, c.y + (on ? p : 0), c.w, c.h - p, on ? 'rgba(255,191,105,0.55)' : 'rgba(14,10,22,0.6)', on ? '#ffe0a8' : 'rgba(230,224,242,0.45)');
        pxIcon(side < 0 ? 'left' : 'right', c.x + c.w / 2, c.y + c.h / 2 + (on ? p : 0), c.w * 0.5, on ? '#fff3dc' : 'rgba(240,234,250,0.85)');
    }
    var st = L.stick, held = TOUCH.stick.id !== null; // flashlight joystick (the only round control)
    ctx.beginPath();
    ctx.arc(st.x, st.y, st.r, 0, 6.283);
    ctx.fillStyle = held ? 'rgba(255,236,200,0.16)' : 'rgba(14,10,22,0.5)';
    ctx.fill();
    ctx.strokeStyle = held ? '#ffe2b0' : 'rgba(230,224,242,0.45)';
    ctx.lineWidth = Math.max(2, u * 0.7);
    ctx.stroke();
    if (TOUCH.aim !== null) {
        var a = TOUCH.aim;
        ctx.fillStyle = 'rgba(255,236,200,0.2)';
        ctx.beginPath();
        ctx.moveTo(st.x, st.y);
        ctx.arc(st.x, st.y, st.r, a - FL.half, a + FL.half);
        ctx.closePath();
        ctx.fill();
    }
    var kx = st.x + TOUCH.stick.x * st.r * 0.62, ky = st.y + TOUCH.stick.y * st.r * 0.62;
    ctx.beginPath();
    ctx.arc(kx, ky, st.r * 0.42, 0, 6.283);
    ctx.fillStyle = held ? 'rgba(255,215,154,0.9)' : 'rgba(230,224,242,0.6)';
    ctx.fill();
    pxIcon('flash', kx, ky, st.r * 0.46, '#1a1420');
    var act = L.act, can = !!G.near, talk = can && G.near.npc; // action button
    panel(act.x, act.y + p, act.w, act.h, 'rgba(0,0,0,0.45)');
    panel(act.x, act.y, act.w, act.h - p, can ? '#b8741e' : 'rgba(14,10,22,0.55)', can ? '#ffe0a8' : 'rgba(230,224,242,0.3)');
    var col = can ? '#1c1208' : 'rgba(230,224,242,0.45)', isz = act.h * 0.42;
    ctx.font = fnt(u * 3.6, 'bold');
    var lbl = talk ? 'صحبت' : 'بررسی', lw = ctx.measureText(lbl).width, tot = isz + 2 * u + lw, cx = act.x + act.w / 2, cy = act.y + (act.h - p) / 2;
    pxIcon(talk ? 'talk' : 'look', cx + tot / 2 - isz / 2, cy, isz, col);
    rtl(lbl, cx + tot / 2 - isz - 2 * u, cy + u * 0.3, col, fnt(u * 3.6, 'bold'));
}
// ---------- viewport & main loop ----------
// on phones the controls keep clear of the screen's edges: the notch, rounded corners, and the strip where Android listens for its back gesture
var SAFE = { l: 0, r: 0, t: 0, b: 0 };
var coarse = function () { return TOUCH.used || (window.matchMedia && matchMedia('(pointer: coarse)').matches); };
function readSafe(dpr) {
    var ins = [0, 0, 0, 0];
    try {
        var d = document.createElement('div');
        d.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
        document.body.appendChild(d);
        var cs_1 = getComputedStyle(d);
        ins = ['Top', 'Right', 'Bottom', 'Left'].map(function (k) { return parseFloat(cs_1['padding' + k]) || 0; });
        d.remove();
    }
    catch (e) { /* no env() */ }
    var phone = coarse(), side = phone ? 34 : 0, edge = phone ? 10 : 0; // CSS px
    SAFE.t = Math.round(Math.max(ins[0], edge) * dpr);
    SAFE.r = Math.round(Math.max(ins[1], side) * dpr);
    SAFE.b = Math.round(Math.max(ins[2], edge) * dpr);
    SAFE.l = Math.round(Math.max(ins[3], side) * dpr);
}
function uiRect() {
    var l = Math.max(VP.x, SAFE.l), r = Math.min(VP.x + VP.w, cv.width - SAFE.r), t = Math.max(VP.y, SAFE.t), b = Math.min(VP.y + VP.h, cv.height - SAFE.b);
    return { x: l, y: t, w: r - l, h: b - t };
}
var UIR = null; // full-screen washes drawn for the UI rect still cover the whole picture
var _fillRect = ctx.fillRect;
ctx.fillRect = function (x, y, w, h) { var q = UIR; if (q && x === q.x && y === q.y && w === q.w && h === q.h)
    return _fillRect.call(this, VP.x, VP.y, VP.w, VP.h); return _fillRect.call(this, x, y, w, h); };
function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    readSafe(dpr);
    cv.width = Math.max(1, Math.round(innerWidth * dpr));
    cv.height = Math.max(1, Math.round(innerHeight * dpr));
    var want = H * cv.width / cv.height; // the world widens to the screen's shape, so phones are filled edge to edge
    W = clamp(Math.round(want), WB, WMAX);
    var s = Math.min(cv.width / W, cv.height / H);
    if (TOUCH.used) {
        if (Math.abs(want - W) < 1)
            s = Math.max(cv.width / W, cv.height / H);
    } // cover: at most a pixel is cut
    else if (s >= 3)
        s = Math.floor(s); // mouse screens: crisp integer pixels when there is room
    VP.s = s;
    VP.w = Math.round(W * s);
    VP.h = Math.round(H * s);
    VP.x = Math.floor((cv.width - VP.w) / 2);
    VP.y = Math.floor((cv.height - VP.h) / 2);
    VP.dpr = dpr;
    if (G.scene) {
        G.camXf = clamp(G.camXf, 0, Math.max(0, G.scene.w - W));
        updateView(0, true);
    }
    updateFs();
}
var lastT = performance.now();
function frame(now) {
    var dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    update(dt);
    renderWorld();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#050409';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.imageSmoothingEnabled = false;
    if (G.zoom) {
        var k = clamp(G.zoom.t / G.zoom.dur, 0, 1), e = k * k * (3 - 2 * k), sw = VIEW.sw * (1 - 0.72 * e), sh = VIEW.sh * (1 - 0.72 * e);
        var cx0 = VIEW.sx + VIEW.sw / 2, cy0 = VIEW.sy + VIEW.sh / 2;
        var sx = clamp(lerp(cx0, G.zoom.x, e) - sw / 2, 0, W - sw), sy = clamp(lerp(cy0, G.zoom.y, e) - sh / 2, 0, H - sh);
        ctx.drawImage(low, sx, sy, sw, sh, VP.x, VP.y, VP.w, VP.h);
        ctx.fillStyle = "rgba(3,2,6,".concat(e * 0.9, ")");
        ctx.fillRect(VP.x, VP.y, VP.w, VP.h);
    }
    else if (G.mini)
        ctx.drawImage(low, 0, 0, W, H, VP.x, VP.y, VP.w, VP.h);
    else
        ctx.drawImage(low, VIEW.sx, VIEW.sy, VIEW.sw, VIEW.sh, VP.x, VP.y, VP.w, VP.h);
    drawUI();
    requestAnimationFrame(frame);
}
// ---------- Android back button: close the top layer, otherwise pause ----------
window.androidBack = function () {
    if (G.state === 'title' && G.menu !== 'book' && !G.menuHelp)
        return false;
    onBack();
    return true;
};
window.androidPause = function () { if (G.state === 'play' && !G.paused && !G.mini)
    togglePause(); try {
    if (A.ctx)
        A.ctx.suspend();
}
catch (e) { /* no audio */ } };
window.androidResume = function () { try {
    if (A.ctx && !A.muted)
        A.ctx.resume();
}
catch (e) { /* no audio */ } };
document.addEventListener('visibilitychange', function () { if (document.hidden)
    window.androidPause();
else
    window.androidResume(); });
function onBack() {
    if (G.state === 'play') {
        if (G.mini)
            closeMini();
        else if (G.notebook)
            G.notebook = false;
        else if (D.active) { /* keep reading */ }
        else
            togglePause();
    }
    else if (G.state === 'end')
        backToTitle();
    else if (G.state === 'title') {
        if (G.menuHelp)
            G.menuHelp = false;
        else if (G.menu === 'book')
            setMenu('home');
    }
}
try {
    history.pushState({ game: 1 }, '');
    addEventListener('popstate', function () { onBack(); try {
        history.pushState({ game: 1 }, '');
    }
    catch (e) { /* ignore */ } });
}
catch (e) { /* history unavailable */ }
// ---------- boot (once the typeface has loaded, since scenes bake their signs as pixels) ----------
function boot() {
    buildSkyAssets();
    buildIcons();
    buildPortraits();
    try {
        for (var _i = 0, _a = ['icon', 'apple-touch-icon']; _i < _a.length; _i++) {
            var rel = _a[_i];
            var l = document.createElement('link');
            l.rel = rel;
            l.href = APP_ICON;
            document.head.appendChild(l);
        }
    }
    catch (e) { /* no icon */ }
    SCENES.alley = buildAlley();
    SCENES.street = buildStreet();
    SCENES.station = buildStation();
    SCENES.alley.exits = { street: 1 };
    SCENES.street.exits = { alley: -1 };
    SCENES.studio = buildStudio();
    SCENES.railway = buildRailway();
    SCENES.site = buildSite();
    SCENES.villa = buildVilla();
    SCENES.rooftop = buildRooftop();
    SCENES.cinema = buildCinema();
    for (var k in PEOPLE) {
        var n = parseInt(PEOPLE[k].c.slice(1), 16);
        PORTRAIT[k] = portraitFrom(PEOPLE[k].sp, [(n >> 16) & 255, (n >> 8) & 255, n & 255]);
    }
    PORTRAIT.K = crowPortrait();
    for (var k in MINI_F)
        MINI[k] = MINI_F[k]();
    G.titleSel = 1;
    for (var i = 1; i <= LEVEL_COUNT(); i++)
        if (isUnlocked(i) && !PROG.done[i]) {
            G.titleSel = i;
            break;
        }
    setMenu('home');
    initSnow();
    setScene('alley', SCENES.alley.spawn);
    resize();
    addEventListener('resize', resize);
    cv.focus();
    requestAnimationFrame(frame);
}
boot();
