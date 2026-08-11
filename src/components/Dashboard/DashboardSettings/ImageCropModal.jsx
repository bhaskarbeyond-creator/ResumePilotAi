import React, { useRef, useState, useEffect, useCallback } from 'react';
import { FaCrop, FaTimes, FaCheck, FaSearchPlus, FaSearchMinus, FaRedo } from 'react-icons/fa';

/**
 * ImageCropModal — zero-dependency canvas-based square cropper.
 * Props:
 *   imageSrc   : data-URL of the raw uploaded image
 *   onCrop     : callback(croppedDataUrl: string)
 *   onCancel   : callback()
 *   outputSize : number (default 400) — output canvas px (square)
 */
export default function ImageCropModal({ imageSrc, onCrop, onCancel, outputSize = 400 }) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const imgRef = useRef(null);

    // crop box in canvas coords
    const [cropBox, setCropBox] = useState(null);
    const [imgLoaded, setImgLoaded] = useState(false);
    const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });

    // drag state
    const dragState = useRef(null); // { type: 'move'|'resize', startX, startY, startBox }
    const [zoom, setZoom] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 }); // image offset in canvas coords

    const CROP_SIZE_FACTOR = 0.6; // initial crop box = 60% of smaller canvas dimension

    /* ───── Load image & set up canvas ───── */
    useEffect(() => {
        const img = new Image();
        img.onload = () => {
            imgRef.current = img;
            // fit into 520×390 max while keeping aspect
            const maxW = Math.min(520, window.innerWidth - 48);
            const maxH = 390;
            const scale = Math.min(maxW / img.width, maxH / img.height);
            const cw = Math.round(img.width * scale);
            const ch = Math.round(img.height * scale);
            setCanvasSize({ w: cw, h: ch });

            const side = Math.round(Math.min(cw, ch) * CROP_SIZE_FACTOR);
            setCropBox({
                x: Math.round((cw - side) / 2),
                y: Math.round((ch - side) / 2),
                w: side,
                h: side,
            });
            setOffset({ x: 0, y: 0 });
            setZoom(1);
            setImgLoaded(true);
        };
        img.src = imageSrc;
    }, [imageSrc]);

    /* ───── Render loop ───── */
    const draw = useCallback(() => {
        if (!canvasRef.current || !imgRef.current || !cropBox) return;
        const ctx = canvasRef.current.getContext('2d');
        const { w: cw, h: ch } = canvasSize;
        ctx.clearRect(0, 0, cw, ch);

        // draw image (zoomed + offset)
        const iw = imgRef.current.width * zoom * (cw / imgRef.current.width);
        const ih = imgRef.current.height * zoom * (ch / imgRef.current.height);
        // base scale already baked into canvasSize; apply extra zoom around centre
        const baseW = cw, baseH = ch;
        const zoomedW = baseW * zoom;
        const zoomedH = baseH * zoom;
        const ix = offset.x + (cw - zoomedW) / 2;
        const iy = offset.y + (ch - zoomedH) / 2;
        ctx.drawImage(imgRef.current, ix, iy, zoomedW, zoomedH);

        // dim overlay
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, cw, ch);

        // clear crop area
        ctx.clearRect(cropBox.x, cropBox.y, cropBox.w, cropBox.h);
        // redraw image inside crop (so it's fully visible)
        ctx.save();
        ctx.beginPath();
        ctx.rect(cropBox.x, cropBox.y, cropBox.w, cropBox.h);
        ctx.clip();
        ctx.drawImage(imgRef.current, ix, iy, zoomedW, zoomedH);
        ctx.restore();

        // crop border
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(cropBox.x, cropBox.y, cropBox.w, cropBox.h);

        // rule-of-thirds grid
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 0.5;
        for (let i = 1; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(cropBox.x + (cropBox.w / 3) * i, cropBox.y);
            ctx.lineTo(cropBox.x + (cropBox.w / 3) * i, cropBox.y + cropBox.h);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cropBox.x, cropBox.y + (cropBox.h / 3) * i);
            ctx.lineTo(cropBox.x + cropBox.w, cropBox.y + (cropBox.h / 3) * i);
            ctx.stroke();
        }

        // resize handle (bottom-right corner)
        ctx.fillStyle = '#6366f1';
        ctx.fillRect(cropBox.x + cropBox.w - 8, cropBox.y + cropBox.h - 8, 10, 10);
    }, [canvasSize, cropBox, zoom, offset]);

    useEffect(() => { draw(); }, [draw]);

    /* ───── Mouse events ───── */
    const getPos = (e) => {
        const rect = canvasRef.current.getBoundingClientRect();
        const scaleX = canvasSize.w / rect.width;
        const scaleY = canvasSize.h / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    };

    const onMouseDown = (e) => {
        const pos = getPos(e);
        const { x, y, w, h } = cropBox;
        const handleSize = 18;
        // check resize handle
        if (pos.x >= x + w - handleSize && pos.y >= y + h - handleSize) {
            dragState.current = { type: 'resize', startX: pos.x, startY: pos.y, startBox: { ...cropBox } };
        } else if (pos.x >= x && pos.x <= x + w && pos.y >= y && pos.y <= y + h) {
            dragState.current = { type: 'move', startX: pos.x, startY: pos.y, startBox: { ...cropBox } };
        }
    };

    const onMouseMove = (e) => {
        if (!dragState.current) return;
        const pos = getPos(e);
        const { type, startX, startY, startBox } = dragState.current;
        const { w: cw, h: ch } = canvasSize;
        const MIN_SIZE = 40;

        if (type === 'move') {
            const dx = pos.x - startX, dy = pos.y - startY;
            const nx = Math.max(0, Math.min(cw - startBox.w, startBox.x + dx));
            const ny = Math.max(0, Math.min(ch - startBox.h, startBox.y + dy));
            setCropBox((prev) => ({ ...prev, x: nx, y: ny }));
        } else if (type === 'resize') {
            const dx = pos.x - startX, dy = pos.y - startY;
            const delta = (Math.abs(dx) > Math.abs(dy) ? dx : dy);
            const newSize = Math.max(MIN_SIZE, Math.min(
                cw - startBox.x,
                ch - startBox.y,
                startBox.w + delta,
                startBox.h + delta,
            ));
            setCropBox((prev) => ({ ...prev, w: newSize, h: newSize }));
        }
    };

    const onMouseUp = () => { dragState.current = null; };

    /* ───── Touch support ───── */
    const toMouseEvent = (e) => ({
        clientX: e.touches[0].clientX,
        clientY: e.touches[0].clientY,
    });
    const onTouchStart = (e) => { e.preventDefault(); onMouseDown(toMouseEvent(e)); };
    const onTouchMove = (e) => { e.preventDefault(); onMouseMove(toMouseEvent(e)); };
    const onTouchEnd = () => onMouseUp();

    /* ───── Produce cropped output ───── */
    const handleCrop = () => {
        if (!imgRef.current || !cropBox) return;
        const { w: cw, h: ch } = canvasSize;
        const zoomedW = cw * zoom;
        const zoomedH = ch * zoom;
        const ix = offset.x + (cw - zoomedW) / 2;
        const iy = offset.y + (ch - zoomedH) / 2;

        // map crop box back to original image coords
        const scaleX = imgRef.current.width / zoomedW;
        const scaleY = imgRef.current.height / zoomedH;
        const sx = (cropBox.x - ix) * scaleX;
        const sy = (cropBox.y - iy) * scaleY;
        const sw = cropBox.w * scaleX;
        const sh = cropBox.h * scaleY;

        const out = document.createElement('canvas');
        out.width = outputSize;
        out.height = outputSize;
        const ctx = out.getContext('2d');

        // circular clip for a nice round avatar output
        ctx.beginPath();
        ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(imgRef.current, sx, sy, sw, sh, 0, 0, outputSize, outputSize);

        onCrop(out.toDataURL('image/jpeg', 0.92));
    };

    /* ───── Reset crop ───── */
    const handleReset = () => {
        const { w: cw, h: ch } = canvasSize;
        const side = Math.round(Math.min(cw, ch) * CROP_SIZE_FACTOR);
        setCropBox({ x: Math.round((cw - side) / 2), y: Math.round((ch - side) / 2), w: side, h: side });
        setZoom(1);
        setOffset({ x: 0, y: 0 });
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden w-full max-w-lg flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
                            <FaCrop className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-900">Crop Profile Photo</p>
                            <p className="text-[11px] text-slate-500">Drag to reposition • Drag corner to resize</p>
                        </div>
                    </div>
                    <button onClick={onCancel} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors">
                        <FaTimes className="w-4 h-4 text-slate-500" />
                    </button>
                </div>

                {/* Canvas */}
                <div className="bg-slate-950 flex items-center justify-center" style={{ minHeight: 200 }}>
                    {imgLoaded ? (
                        <canvas
                            ref={canvasRef}
                            width={canvasSize.w}
                            height={canvasSize.h}
                            style={{ maxWidth: '100%', cursor: 'crosshair', touchAction: 'none' }}
                            onMouseDown={onMouseDown}
                            onMouseMove={onMouseMove}
                            onMouseUp={onMouseUp}
                            onMouseLeave={onMouseUp}
                            onTouchStart={onTouchStart}
                            onTouchMove={onTouchMove}
                            onTouchEnd={onTouchEnd}
                        />
                    ) : (
                        <div className="flex items-center gap-2 py-16 text-white/50 text-sm">
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Loading…
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 space-y-3">
                    {/* Zoom slider */}
                    <div className="flex items-center gap-3">
                        <FaSearchMinus className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <input
                            type="range"
                            min="0.5"
                            max="3"
                            step="0.05"
                            value={zoom}
                            onChange={(e) => setZoom(parseFloat(e.target.value))}
                            className="flex-1 h-1.5 rounded-full accent-indigo-600"
                        />
                        <FaSearchPlus className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <span className="text-[11px] font-mono text-slate-500 w-8 text-right">{zoom.toFixed(1)}×</span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-between gap-3">
                        <button
                            onClick={handleReset}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors"
                        >
                            <FaRedo className="w-3 h-3" /> Reset
                        </button>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={onCancel}
                                className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCrop}
                                className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-all"
                            >
                                <FaCheck className="w-3 h-3" /> Apply Crop
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
