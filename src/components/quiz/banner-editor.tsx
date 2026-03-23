'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const BANNER_WIDTH = 600
const BANNER_HEIGHT = 200
const BANNER_RATIO = BANNER_WIDTH / BANNER_HEIGHT

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

    const { data: urlData } = supabase.storage
      .from('quiz-covers')
      .getPublicUrl(fileName)

    setShowModal(false)
    setUploading(false)
    onUpdate(urlData.publicUrl)
  }

  function handleRemove() {
    onUpdate(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-dark-text">Banner image</label>
        {coverImageUrl && (
          <button onClick={handleRemove} className="text-xs text-answer-red hover:underline">Remove</button>
        )}
      </div>

      {/* Preview / Upload area */}
      {coverImageUrl ? (
        <div className="relative group">
          <div className="w-full rounded-lg overflow-hidden border border-border-gray" style={{ aspectRatio: `${BANNER_RATIO}` }}>
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
          style={{ aspectRatio: `${BANNER_RATIO}` }}
        >
          <span className="text-2xl mb-1">🖼️</span>
          <span className="text-xs font-bold">Upload banner</span>
          <span className="text-[10px] mt-0.5">Recommended: 600 x 200px</span>
        </button>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />

      {/* Modal */}
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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const frameRef = useRef<HTMLDivElement>(null)

  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imgLoaded, setImgLoaded] = useState(false)
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 })
  const [baseScale, setBaseScale] = useState(1)

  // Load image
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })

      // Calculate base scale so image covers the frame
      const frameW = 480
      const frameH = frameW / BANNER_RATIO
      const coverScale = Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight)
      setBaseScale(coverScale)
      setScale(1)

      // Center the image
      const displayW = img.naturalWidth * coverScale
      const displayH = img.naturalHeight * coverScale
      setOffset({
        x: (frameW - displayW) / 2,
        y: (frameH - displayH) / 2,
      })

      setImgLoaded(true)
    }
    img.src = src
  }, [src])

  const frameW = 480
  const frameH = frameW / BANNER_RATIO
  const totalScale = baseScale * scale
  const displayW = naturalSize.w * totalScale
  const displayH = naturalSize.h * totalScale

  // Mouse handlers
  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    setDragging(true)
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
  }
  function onMouseMove(e: React.MouseEvent) {
    if (!dragging) return
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }
  function onMouseUp() { setDragging(false) }

  // Touch handlers
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    setDragging(true)
    setDragStart({ x: t.clientX - offset.x, y: t.clientY - offset.y })
  }
  function onTouchMove(e: React.TouchEvent) {
    if (!dragging) return
    e.preventDefault()
    const t = e.touches[0]
    setOffset({ x: t.clientX - dragStart.x, y: t.clientY - dragStart.y })
  }

  function handleZoom(newScale: number) {
    const clamped = Math.max(0.5, Math.min(3, newScale))
    // Zoom toward center of frame
    const oldTotal = baseScale * scale
    const newTotal = baseScale * clamped
    const cx = frameW / 2
    const cy = frameH / 2
    setOffset((prev) => ({
      x: cx - (cx - prev.x) * (newTotal / oldTotal),
      y: cy - (cy - prev.y) * (newTotal / oldTotal),
    }))
    setScale(clamped)
  }

  function handleApply() {
    if (!imgRef.current) return
    const canvas = document.createElement('canvas')
    canvas.width = BANNER_WIDTH
    canvas.height = BANNER_HEIGHT
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Map frame coordinates to source image coordinates
    const ratio = BANNER_WIDTH / frameW
    const sx = -offset.x * ratio
    const sy = -offset.y * ratio
    const sw = BANNER_WIDTH
    const sh = BANNER_HEIGHT
    const dw = displayW * ratio
    const dh = displayH * ratio
    const dx = offset.x * ratio
    const dy = offset.y * ratio

    ctx.drawImage(imgRef.current, dx, dy, dw, dh)

    canvas.toBlob(
      (blob) => { if (blob) onCrop(blob) },
      'image/jpeg',
      0.9
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-[540px] w-full mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-dark-text">Crop banner image</h3>
          <button onClick={onCancel} className="text-gray-text hover:text-dark-text text-sm">✕</button>
        </div>

        <p className="text-xs text-gray-text mb-3">Drag to position. Zoom to fit. Output: 600 x 200px</p>

        {/* Crop frame */}
        <div
          ref={frameRef}
          className="rounded-lg overflow-hidden border-2 border-blue-cta relative select-none bg-black mx-auto"
          style={{
            width: `${frameW}px`,
            height: `${frameH}px`,
            maxWidth: '100%',
            cursor: dragging ? 'grabbing' : 'grab',
            touchAction: 'none',
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={() => setDragging(false)}
        >
          {imgLoaded && (
            <img
              src={src}
              alt=""
              className="absolute pointer-events-none"
              style={{
                width: `${displayW}px`,
                height: `${displayH}px`,
                left: `${offset.x}px`,
                top: `${offset.y}px`,
              }}
              draggable={false}
            />
          )}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={() => handleZoom(scale - 0.1)}
            className="w-8 h-8 rounded-lg bg-light-gray border border-border-gray text-dark-text text-sm font-bold hover:bg-mid-gray transition-colors flex items-center justify-center"
          >
            −
          </button>
          <input
            type="range"
            min={0.5}
            max={3}
            step={0.05}
            value={scale}
            onChange={(e) => handleZoom(Number(e.target.value))}
            className="flex-1 accent-blue-cta h-1.5"
          />
          <button
            onClick={() => handleZoom(scale + 0.1)}
            className="w-8 h-8 rounded-lg bg-light-gray border border-border-gray text-dark-text text-sm font-bold hover:bg-mid-gray transition-colors flex items-center justify-center"
          >
            +
          </button>
          <span className="text-xs text-gray-text w-12 text-right tabular-nums">{Math.round(scale * 100)}%</span>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-5">
          <button
            onClick={onCancel}
            disabled={uploading}
            className="flex-1 h-10 border border-border-gray text-gray-text text-sm font-bold rounded-lg hover:bg-light-gray transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={uploading}
            className="flex-1 h-10 bg-blue-cta text-white text-sm font-bold rounded-lg hover:bg-blue-accent transition-colors disabled:opacity-60"
          >
            {uploading ? 'Uploading...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}
