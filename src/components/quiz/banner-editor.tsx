'use client'

import { useState, useRef, useEffect, useLayoutEffect } from 'react'
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
// Simple approach: track crop region in source-image coordinates.
// The frame always shows exactly what will be exported.

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
  const [frameW, setFrameW] = useState(0)

  const [imgW, setImgW] = useState(0)
  const [imgH, setImgH] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [cropX, setCropX] = useState(0)
  const [cropY, setCropY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [dragAnchor, setDragAnchor] = useState({ x: 0, y: 0, cx: 0, cy: 0 })
  const [ready, setReady] = useState(false)

  // Measure the frame after DOM layout
  useEffect(() => {
    function measure() {
      if (frameRef.current) {
        setFrameW(frameRef.current.clientWidth)
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Load image after frame is measured
  useEffect(() => {
    if (frameW === 0) return
    const img = new Image()
    img.onload = () => {
      imgEl.current = img
      const nw = img.naturalWidth
      const nh = img.naturalHeight
      setImgW(nw)
      setImgH(nh)

      // At zoom=1, crop is the largest RATIO-shaped area that fits in the image
      const bw = nw / nh > RATIO ? nh * RATIO : nw
      const bh = nw / nh > RATIO ? nh : nw / RATIO
      setCropX((nw - bw) / 2)
      setCropY((nh - bh) / 2)
      setZoom(1)
      setReady(true)
    }
    img.src = src
  }, [src, frameW])

  // Derived: crop dimensions in source pixels
  const baseCropW = imgW > 0 ? (imgW / imgH > RATIO ? imgH * RATIO : imgW) : 1
  const baseCropH = imgH > 0 ? (imgW / imgH > RATIO ? imgH : imgW / RATIO) : 1
  const cropW = baseCropW / zoom
  const cropH = baseCropH / zoom
  const frameH = frameW / RATIO

  // Scale factor: how many screen pixels per source pixel
  const screenScale = frameW > 0 && cropW > 0 ? frameW / cropW : 1

  // Pointer handlers
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
    // Convert screen movement to source pixels, invert (drag right = crop moves left)
    const sx = dx / screenScale
    const sy = dy / screenScale
    setCropX(Math.max(0, Math.min(dragAnchor.cx - sx, imgW - cropW)))
    setCropY(Math.max(0, Math.min(dragAnchor.cy - sy, imgH - cropH)))
  }

  function onPointerUp() { setDragging(false) }

  function handleZoom(newZoom: number) {
    const z = Math.max(1, Math.min(4, newZoom))
    const newCW = baseCropW / z
    const newCH = baseCropH / z
    // Keep center stable
    const cx = cropX + cropW / 2
    const cy = cropY + cropH / 2
    setCropX(Math.max(0, Math.min(cx - newCW / 2, imgW - newCW)))
    setCropY(Math.max(0, Math.min(cy - newCH / 2, imgH - newCH)))
    setZoom(z)
  }

  function handleApply() {
    if (!imgEl.current) return
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_W
    canvas.height = OUTPUT_H
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(imgEl.current, cropX, cropY, cropW, cropH, 0, 0, OUTPUT_W, OUTPUT_H)
    canvas.toBlob((blob) => { if (blob) onCrop(blob) }, 'image/jpeg', 0.9)
  }

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
          style={{ aspectRatio: `${RATIO}`, cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {ready && frameW > 0 && (
            <img
              src={src}
              alt=""
              draggable={false}
              className="absolute pointer-events-none"
              style={{
                transformOrigin: '0 0',
                width: `${imgW * screenScale}px`,
                height: `${imgH * screenScale}px`,
                left: `${-cropX * screenScale}px`,
                top: `${-cropY * screenScale}px`,
              }}
            />
          )}
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-3 mt-4">
          <button onClick={() => handleZoom(zoom - 0.2)}
            className="w-8 h-8 rounded-lg bg-light-gray border border-border-gray text-dark-text text-sm font-bold hover:bg-mid-gray transition-colors flex items-center justify-center">−</button>
          <input type="range" min={1} max={4} step={0.05} value={zoom}
            onChange={(e) => handleZoom(Number(e.target.value))}
            className="flex-1 accent-blue-cta h-1.5" />
          <button onClick={() => handleZoom(zoom + 0.2)}
            className="w-8 h-8 rounded-lg bg-light-gray border border-border-gray text-dark-text text-sm font-bold hover:bg-mid-gray transition-colors flex items-center justify-center">+</button>
          <span className="text-xs text-gray-text w-12 text-right tabular-nums">{Math.round(zoom * 100)}%</span>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-5">
          <button onClick={onCancel} disabled={uploading}
            className="flex-1 h-10 border border-border-gray text-gray-text text-sm font-bold rounded-lg hover:bg-light-gray transition-colors disabled:opacity-40">Cancel</button>
          <button onClick={handleApply} disabled={uploading}
            className="flex-1 h-10 bg-blue-cta text-white text-sm font-bold rounded-lg hover:bg-blue-accent transition-colors disabled:opacity-60">{uploading ? 'Uploading...' : 'Apply'}</button>
        </div>
      </div>
    </div>
  )
}
