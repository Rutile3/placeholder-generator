(() => {
    const $ = (sel) => document.querySelector(sel);

    // ---- 定数（マジックナンバー排除）----
    const MAX_PIXELS = 16_000_000; // 16MP ガード用
    const TEXT_PLACEHOLDER = "{w} × {h}";
    const DEFAULTS = {
        w: 150,
        h: 150,
        bg: "#d1d5db",
        fg: "#6b7280",
        radius: 0,
        fontPx: 24,
        fmt: "png"
    };

    // 要素参照
    const el = {
        form: $("#form"),
        width: $("#width"),
        height: $("#height"),
        bg: $("#bg"),
        bgHex: $("#bgHex"),
        fg: $("#fg"),
        fgHex: $("#fgHex"),
        label: $("#label"),
        font: $("#font"),
        radius: $("#radius"),
        autoFont: $("#autoFont"),
        fontSize: $("#fontSize"),
        format: $("#format"),
        btnGen: $("#btn-generate"),
        btnDl: $("#btn-download"),
        btnCopy: $("#btn-copy"),
        btnCopyUrl: $("#btn-copy-url"),
        btnReset: $("#btn-reset"),
        canvas: $("#canvas"),
        preview: $("#preview"),
        meta: $("#meta"),
        toast: $("#toast"),
    };

    let currentObjectUrl = null; // SVG/PNGの一時URLを管理して解放

    // ---- utils ----
    const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
    const normHex = (str) => {
        if (!str) return "#000000";
        let s = str.trim().replace(/^#/, "");
        if (s.length === 3) s = s.split("").map(c => c + c).join("");
        s = s.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
        return "#" + (s.padEnd(6, "0"));
    };
    const hexNoHash = (hex) => normHex(hex).slice(1);
    const showToast = (kind, msg) => {
        el.toast.innerHTML = `<div class="alert alert-${kind}" role="alert">${msg}</div>`;
        setTimeout(() => (el.toast.innerHTML = ""), 3000);
    };
    const updateColorTwin = (colorInput, hexInput, from) => {
        if (from === "color") hexInput.value = normHex(colorInput.value);
        else colorInput.value = normHex(hexInput.value);
    };

    // ---- 描画（PNG: canvas） ----
    function drawPng({ w, h, bg, fg, text, fontFamily, radius, fontPx, autoFont }) {
        const cvs = el.canvas;

        // ★ 出力サイズは要求通りのピクセル数に固定（DPR無視／常に@1x）
        cvs.width = w;
        cvs.height = h;

        const ctx = cvs.getContext("2d");
        ctx.save();

        // 角丸矩形
        const r = clamp(radius, 0, Math.min(w, h) / 2);
        roundRect(ctx, 0, 0, w, h, r);
        ctx.fillStyle = bg;
        ctx.fill();

        // フォントサイズ自動
        let fontSize = fontPx;
        if (autoFont) {
            fontSize = Math.max(6, Math.round(Math.min(w, h) * 0.20));
        }
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.fillStyle = fg;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // 長文のとき縮小
        let metrics = ctx.measureText(text);
        const pad = Math.max(8, fontSize * 0.4);
        const maxW = w - pad * 2;
        if (metrics.width > maxW) {
            const scale = maxW / metrics.width;
            ctx.save();
            ctx.translate(w / 2, h / 2);
            ctx.scale(scale, scale);
            ctx.fillText(text, 0, 0);
            ctx.restore();
        } else {
            ctx.fillText(text, w / 2, h / 2);
        }

        ctx.restore();
        // ★ この dataURL は w×h ちょうどのPNGになります
        return cvs.toDataURL("image/png");
    }

    function roundRect(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
    }

    // ---- 描画（SVG文字列） ----
    function makeSvg({ w, h, bg, fg, text, fontFamily, radius, fontPx, autoFont }) {
        const px = autoFont ? Math.max(6, Math.round(Math.min(w, h) * 0.20)) : fontPx;
        const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
        const svg =
            `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect x="0" y="0" width="${w}" height="${h}" rx="${clamp(radius, 0, Math.min(w, h) / 2)}" fill="${bg}"/>
  <g font-family="${esc(fontFamily)}" font-size="${px}" fill="${fg}">
    <text x="${w / 2}" y="${h / 2}" text-anchor="middle" dominant-baseline="middle">${esc(text)}</text>
  </g>
</svg>`;
        return svg;
    }

    function blobUrlFromString(str, type) {
        if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
        const blob = new Blob([str], { type });
        currentObjectUrl = URL.createObjectURL(blob);
        return currentObjectUrl;
    }

    // ---- 状態 → プレビュー更新 ----
    function gatherState() {
        const w = clamp(parseInt(el.width.value || "0", 10), 1, 4000);
        const h = clamp(parseInt(el.height.value || "0", 10), 1, 4000);
        const bg = normHex(el.bgHex.value || el.bg.value);
        const fg = normHex(el.fgHex.value || el.fg.value);
        const radius = clamp(parseInt(el.radius.value || "0", 10), 0, 400);
        const autoFont = el.autoFont.checked;
        const fontPx = clamp(parseInt(el.fontSize.value || String(DEFAULTS.fontPx), 10), 6, 512);
        const fmt = el.format.value;

        let text = el.label.value.trim();
        if (!text) text = TEXT_PLACEHOLDER;
        text = text.replaceAll("{w}", String(w)).replaceAll("{h}", String(h));

        return {
            w, h, bg, fg, text,
            fontFamily: el.font.value,
            radius, autoFont, fontPx, fmt
        };
    }

    function updatePreview(pushUrl = false) {
        const s = gatherState();

        // 大きすぎる画像のガード
        if (s.w * s.h > MAX_PIXELS) {
            showToast("warning", "画像が大きすぎます（総ピクセル 1600 万超）。サイズを小さくしてください。");
            return;
        }

        let url, filename;
        if (s.fmt === "png") {
            const dataUrl = drawPng(s);
            url = dataUrl;
            filename = `placeholder-${s.w}x${s.h}.png`;
        } else {
            const svg = makeSvg(s);
            url = blobUrlFromString(svg, "image/svg+xml;charset=UTF-8");
            filename = `placeholder-${s.w}x${s.h}.svg`;
        }

        el.preview.src = url;
        el.btnDl.href = url;
        el.btnDl.download = filename;
        el.meta.textContent = `${s.w} × ${s.h} ${s.fmt.toUpperCase()}  /  bg ${s.bg}  fg ${s.fg}`;

        if (pushUrl) {
            const qs = buildQueryFromState(s);
            const newUrl = `${location.pathname}?${qs}`;
            history.replaceState(null, "", newUrl);
        }
    }

    function buildQueryFromState(s) {
        const q = new URLSearchParams();
        q.set("w", s.w);
        q.set("h", s.h);
        q.set("bg", hexNoHash(s.bg));
        q.set("fg", hexNoHash(s.fg));
        q.set("text", s.text);
        q.set("fmt", s.fmt);
        if (s.radius) q.set("br", s.radius);
        if (!s.autoFont) q.set("fs", s.fontPx);
        return q.toString();
    }

    function restoreFromQuery() {
        const p = new URLSearchParams(location.search);
        const w = parseInt(p.get("w") || String(DEFAULTS.w), 10);
        const h = parseInt(p.get("h") || String(DEFAULTS.h), 10);
        const bg = "#" + (p.get("bg") || DEFAULTS.bg.slice(1));
        const fg = "#" + (p.get("fg") || DEFAULTS.fg.slice(1));
        const text = p.get("text") || "";
        const fmt = (p.get("fmt") || DEFAULTS.fmt).toLowerCase();
        const br = parseInt(p.get("br") || String(DEFAULTS.radius), 10);
        const fs = p.has("fs") ? parseInt(p.get("fs") || String(DEFAULTS.fontPx), 10) : null;

        el.width.value = clamp(w, 1, 4000);
        el.height.value = clamp(h, 1, 4000);

        el.bg.value = normHex(bg);
        el.bgHex.value = normHex(bg);
        el.fg.value = normHex(fg);
        el.fgHex.value = normHex(fg);

        if (text) el.label.value = text;
        el.format.value = (fmt === "svg" ? "svg" : "png");
        el.radius.value = clamp(br, 0, 400);

        if (fs !== null) {
            el.autoFont.checked = false;
            el.fontSize.disabled = false;
            el.fontSize.value = clamp(fs, 6, 512);
        }
    }

    // ---- クリップボード ----
    async function copyImage() {
        try {
            const s = gatherState();
            let blob;
            if (s.fmt === "png") {
                const dataUrl = drawPng(s);
                const res = await fetch(dataUrl);
                blob = await res.blob();
            } else {
                const svg = makeSvg(s);
                blob = new Blob([svg], { type: "image/svg+xml" });
            }
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            showToast("success", "画像をクリップボードにコピーしました。");
        } catch (e) {
            console.error(e);
            showToast("danger", "画像コピーに失敗しました。対応ブラウザでお試しください。");
        }
    }

    async function copyShareUrl() {
        try {
            const s = gatherState();
            const qs = buildQueryFromState(s);
            const url = `${location.origin}${location.pathname}?${qs}`;
            await navigator.clipboard.writeText(url);
            showToast("success", "共有URLをコピーしました。");
        } catch {
            showToast("danger", "URLのコピーに失敗しました。");
        }
    }

    // ---- イベント ----
    function bind() {
        // 色同期
        el.bg.addEventListener("input", () => { updateColorTwin(el.bg, el.bgHex, "color"); updatePreview(true); });
        el.bgHex.addEventListener("input", () => { updateColorTwin(el.bg, el.bgHex, "hex"); updatePreview(true); });
        el.fg.addEventListener("input", () => { updateColorTwin(el.fg, el.fgHex, "color"); updatePreview(true); });
        el.fgHex.addEventListener("input", () => { updateColorTwin(el.fg, el.fgHex, "hex"); updatePreview(true); });

        // 自動フォント切替
        el.autoFont.addEventListener("change", () => {
            el.fontSize.disabled = el.autoFont.checked;
            updatePreview(true);
        });

        // 入力で即時更新（過負荷防止に軽いデバウンス）
        const onChange = debounce(() => updatePreview(true), 80);
        ["width", "height", "label", "font", "radius", "fontSize", "format"].forEach(id => {
            $("#" + id).addEventListener("input", onChange);
            $("#" + id).addEventListener("change", onChange);
        });

        el.btnGen.addEventListener("click", () => updatePreview(true));
        el.btnCopy.addEventListener("click", copyImage);
        el.btnCopyUrl.addEventListener("click", copyShareUrl);
        el.btnReset.addEventListener("click", () => {
            setTimeout(() => { // reset 直後に値が戻る時間を待つ
                el.bg.value = DEFAULTS.bg; el.bgHex.value = DEFAULTS.bg;
                el.fg.value = DEFAULTS.fg; el.fgHex.value = DEFAULTS.fg;
                el.autoFont.checked = true; el.fontSize.disabled = true;
                history.replaceState(null, "", location.pathname);
                updatePreview(true);
            }, 0);
        });
    }

    function debounce(fn, ms) {
        let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    }

    // ---- init ----
    restoreFromQuery();
    bind();
    updatePreview(false);
})();
