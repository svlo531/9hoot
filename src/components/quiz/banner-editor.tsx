'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

const OUTPUT_W = 600
const OUTPUT_H = 200
const RATIO = OUTPUT_W / OUTPUT_H

interface Props {
  quizId: string
  coverImageUrl: string | null
  onUpdate: (url: string | null) => void
}

export function BannerEditor({ quizId, coverImageUrl, onUpdate }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setImageSrc(ev.target?.result as string)
      setShowModal(true)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  async function handleCropComplete(croppedBlob: Blob) {
    setUploading(true)
    const supabase = createClient()
    const fileName = `${quizId}-${Date.now()}.jpg`

    const { error } = await supabase.storage
      .from('quiz-covers')
      .upload(fileName, croppedBlob, { contentType: 'image/jpeg', upsert: true })

    if (error) {
      console.error('Upload failed:', error)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage.from('quiz-covers').getPublicUrl(fileName)
    setShowModal(false)
    setUploading(false)
    onUpdate(urlData.publicUrl)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-dark-text">Banner image</label>
        {coverImageUrl && (
          <button onClick={() => onUpdate(null)} className="text-xs text-answer-red hover:underline">Remove</button>
        )}
      </div>

      {coverImageUrl ? (
        <div className="relative group">
          <div className="w-full rounded-lg overflow-hidden border border-border-gray" style={{ aspectRatio: `${RATIO}` }}>
            <img src={coverImageUrl} alt="Banner" className="w-full h-full object-cover" />
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center text-white text-xs font-bold"
          >
            Change image
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full border-2 border-dashed border-mid-gray rounded-lg flex flex-col items-center justify-center py-6 text-gray-text hover:border-blue-cta hover:text-blue-cta transition-colors"
          style={{ aspectRatio: `${RATIO}` }}
        >
          <span className="text-2xl mb-1">🖼️</span>
          <span className="text-xs font-bold">Upload banner</span>
          <span className="text-[10px] mt-0.5">Recommended: 600 x 200px</span>
        </button>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />

      {showModal && imageSrc && (
        <CropModal
          src={imageSrc}
          onCrop={handleCropComplete}
          onCancel={() => setShowModal(false)}
          uploading={uploading}
        />
      )}
    </div>
  )
}

// ── CROP MODAL ──────────────────────────────────
// Uses a simple approach: CSS transform for preview, canvas for output.
// All coordinates are in "source image pixels" so preview and output match exactly.

function CropModal({
  src,
  onCrop,
  onCancel,
  uploading,
}: {
  src: string
  onCrop: (blob: Blob) => void
  onCancel: () => void
  uploading: boolean
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const imgEl = useRef<HTMLImageElement | null>(null)

  // State in source-image-pixel coordinates
  const [imgW, setImgW] = useState(0)
  const [imgH, setImgH] = useState(0)
  const [zoom, setZoom] = useState(1) // 1 = cover fit
  // cropX/cropY = top-left corner of the visible crop area in source coords
  const [cropX, setCropX] = useState(0)
  const [cropY, setCropY] = useState(0)

  const [dragging, setDragging] = useState(false)
  const [dragAnchor, setDragAnchor] = useState({ x: 0, y: 0, cx: 0, cy: 0 })
  const [ready, setReady] = useState(false)

  // The "base crop" size in source pixels (at zoom=1, crop covers entire visible area)
  // At zoom=1, the crop is as large as possible while maintaining RATIO
  const baseCropW = imgW > 0 ? (imgW / imgH > RATIO ? imgH * RATIO : imgW) : 0
  const baseCropH = imgH > 0 ? (imgW / imgH > RATIO ? imgH : imgW / RATIO) : 0

  // Actual crop size at current zoom (smaller = more zoomed in)
  const cropW = baseCropW / zoom
  const cropH = baseCropH / zoom

  // Max offsets to keep crop within image bounds
  const maxCropX = Math.max(0, imgW - cropW)
  const maxCropY = Math.max(0, imgH - cropH)

  // Load image
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgEl.current = img
      setImgW(img.naturalWidth)
      setImgH(img.naturalHeight)
      // Center crop initially
      const bw = img.naturalWidth / img.naturalHeight > RATIO ? img.naturalHeight * RATIO : img.naturalWidth
      const bh = img.naturalWidth / img.naturalHeight > RATIO ? img.naturalHeight : img.naturalWidth / RATIO
      setCropX((img.naturalWidth - bw) / 2)
      setCropY((img.naturalHeight - bh) / 2)
      setZoom(1)
      setReady(true)
    }
    img.src = src
  }, [src])

  // Get frame pixel size from DOM
  const getFrameSize = useCallback(() => {
    if (!frameRef.current) return { fw: 400, fh: 400 / RATIO }
    const rect = frameRef.current.getBoundingClientRect()
    return { fw: rect.width, fh: rect.height }
  }, [])

  // Convert screen pixels to source-image pixels
  function screenToSource(dx: number, dy: number) {
    const { fw } = getFrameSize()
    const pixelsPerSource = fw / cropW // how many screen px per source px
    return { sx: dx / pixelsPerSource, sy: dy / pixelsPerSource }
  }

  // Clamp crop position
  function clampCrop(x: number, y: number) {
    return {
      x: Math.max(0, Math.min(x, imgW - cropW)),
      y: Math.max(0, Math.min(y, imgH - cropH)),
    }
  }

  // Mouse drag
  function onPointerDown(e: React.PointerEvent) {
    e.preventDefault()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    setDragging(true)
    setDragAnchor({ x: e.clientX, y: e.clientY, cx: cropX, cy: cropY })
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return
    const dx = e.clientX - dragAnchor.x
    const dy = e.clientY - dragAnchor.y
    const { sx, sy } = screenToSource(dx, dy)
    // Moving the mouse right means the image slides right → crop moves LEFT in source coords
    const clamped = clampCrop(dragAnchor.cx - sx, dragAnchor.cy - sy)
    setCropX(clamped.x)
    setCropY(clamped.y)
  }

  function onPointerUp() {
    setDragging(false)
  }

  function handleZoom(newZoom: number) {
    const z = Math.max(1, Math.min(4, newZoom))
    // Zoom toward center of current crop
    const oldCW = baseCropW / zoom
    const oldCH = baseCropH / zoom
    const newCW = baseCropW / z
    const newCH = baseCropH / z
    const centerX = cropX + oldCW / 2
    const centerY = cropY + oldCH / 2
    const nx = centerX - newCW / 2
    const ny = centerY - newCH / 2
    const clamped = {
      x: Math.max(0, Math.min(nx, imgW - newCW)),
      y: Math.max(0, Math.min(ny, imgH - newCH)),
    }
    setCropX(clamped.x)
    setCropY(clamped.y)
    setZoom(z)
  }

  // Apply: draw cropped region to canvas
  function handleApply() {
    if (!imgEl.current) return
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_W
    canvas.height = OUTPUT_H
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Draw the crop region from source image to output canvas
    ctx.drawImage(
      imgEl.current,
      cropX, cropY, cropW, cropH, // source rect
      0, 0, OUTPUT_W, OUTPUT_H    // destination rect
    )

    canvas.toBlob(
      (blob) => { if (blob) onCrop(blob) },
      'image/jpeg',
      0.9
    )
  }

  // CSS transform: position source image so that cropX,cropY maps to frame top-left
  // and cropW maps to frame width
  const { fw: framePixelW } = getFrameSize()
  const scaleCSS = ready ? framePixelW / cropW : 1
  const translateX = ready ? -cropX * scaleCSS : 0
  const translateY = ready ? -cropY * scaleCSS : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-dark-text">Crop banner image</h3>
          <button onClick={onCancel} className="text-gray-text hover:text-dark-text text-sm">✕</button>
        </div>

        <p className="text-xs text-gray-text mb-3">Drag to position. Zoom to fit. Output: 600 x 200px</p>

        {/* Crop frame */}
        <div
          ref={frameRef}
          className="w-full rounded-lg overflow-hidden border-2 border-blue-cta relative bg-black"
          style={{
            aspectRatio: `${RATIO}`,
            cursor: dragging ? 'grabbing' : 'grab',
            touchAction: 'none',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {ready && (
            <img
              src={src}
              alt=""
              className="absolute top-0 left-0 pointer-events-none origin-top-left"
              style={{
                width: `${imgW}px`,
                height: `${imgH}px`,
                transform: `scale(${scaleCSS}) translate(${-cropX}px, ${-cropY}px)`,
                transformOrigin: '0 0',
              }}
              draggable={false}
            />
          )}
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={() => handleZoom(zoom - 0.2)}
            className="w-8 h-8 rounded-lg bg-light-gray border border-border-gray text-dark-text text-sm font-bold hover:bg-mid-gray transition-colors flex items-center justify-center"
          >−</button>
          <input
            type="range" min={1} max={4} step={0.05} value={zoom}
            onChange={(e) => handleZoom(Number(e.target.value))}
            className="flex-1 accent-blue-cta h-1.5"
          />
          <button
            onClick={() => handleZoom(zoom + 0.2)}
            className="w-8 h-8 rounded-lg bg-light-gray border border-border-gray text-dark-text text-sm font-bold hover:bg-mid-gray transition-colors flex items-center justify-center"
          >+</button>
          <span className="text-xs text-gray-text w-12 text-right tabular-nums">{Math.round(zoom * 100)}%</span>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={onCancel} disabled={uploading}
            className="flex-1 h-10 border border-border-gray text-gray-text text-sm font-bold rounded-lg hover:bg-light-gray transition-colors disabled:opacity-40"
          >Cancel</button>
          <button
            onClick={handleApply} disabled={uploading}
            className="flex-1 h-10 bg-blue-cta text-white text-sm font-bold rounded-lg hover:bg-blue-accent transition-colors disabled:opacity-60"
          >{uploading ? 'Uploading...' : 'Apply'}</button>
        </div>
      </div>
    </div>
  )
}
