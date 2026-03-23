'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

const BANNER_WIDTH = 600
const BANNER_HEIGHT = 200
const BANNER_RATIO = BANNER_WIDTH / BANNER_HEIGHT // 3:1

interface Props {
  quizId: string
  coverImageUrl: string | null
  onUpdate: (url: string | null) => void
}

export function BannerEditor({ quizId, coverImageUrl, onUpdate }: Props) {
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageSrc, setImageSrc] = useState<string | null>(coverImageUrl)
  const [showCropper, setShowCropper] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (ev) => {
      setImageSrc(ev.target?.result as string)
      setShowCropper(true)
    }
    reader.readAsDataURL(file)
    // Reset input so re-selecting the same file triggers onChange
    e.target.value = ''
  }

  async function handleCropComplete(croppedBlob: Blob) {
    setUploading(true)
    const supabase = createClient()
    const fileName = `${quizId}-${Date.now()}.jpg`

    const { error } = await supabase.storage
      .from('quiz-covers')
      .upload(fileName, croppedBlob, {
        contentType: 'image/jpeg',
        upsert: true,
      })

    if (error) {
      console.error('Upload failed:', error)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage
      .from('quiz-covers')
      .getPublicUrl(fileName)

    const publicUrl = urlData.publicUrl
    setImageSrc(publicUrl)
    setShowCropper(false)
    setUploading(false)
    onUpdate(publicUrl)
  }

  function handleRemove() {
    setImageSrc(null)
    setImageFile(null)
    setShowCropper(false)
    onUpdate(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-dark-text">Banner image</label>
        {imageSrc && !showCropper && (
          <button onClick={handleRemove} className="text-xs text-answer-red hover:underline">Remove</button>
        )}
      </div>

      {/* Preview / Upload area */}
      {showCropper && imageSrc ? (
        <CropperView
          src={imageSrc}
          onCrop={handleCropComplete}
          onCancel={() => { setShowCropper(false); if (!coverImageUrl) setImageSrc(null) }}
          uploading={uploading}
        />
      ) : imageSrc ? (
        <div className="relative group">
          <div className="w-full rounded-lg overflow-hidden border border-border-gray" style={{ aspectRatio: `${BANNER_RATIO}` }}>
            <img src={imageSrc} alt="Banner" className="w-full h-full object-cover" />
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

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  )
}

// ── CROPPER ──────────────────────────────────

function CropperView({
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
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [scale, setScale] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 0, h: 0 })
  const [imgFitScale, setImgFitScale] = useState(1)

  // Load image and calculate initial fit scale
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })

      // Fit image to cover the banner frame
      const frameW = containerRef.current?.clientWidth || 300
      const frameH = frameW / BANNER_RATIO
      const scaleToFitW = frameW / img.naturalWidth
      const scaleToFitH = frameH / img.naturalHeight
      // Use the larger scale so image covers the frame
      const coverScale = Math.max(scaleToFitW, scaleToFitH)
      setImgFitScale(coverScale)
      setScale(1)
      setPos({ x: 0, y: 0 })
    }
    img.src = src
    imgRef.current = img
  }, [src])

  // Mouse drag
  function handleMouseDown(e: React.MouseEvent) {
    e.preventDefault()
    setDragging(true)
    setDragStart({ x: e.clientX - pos.x, y: e.clientY - pos.y })
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!dragging) return
    setPos({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }

  function handleMouseUp() {
    setDragging(false)
  }

  // Touch drag
  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    setDragging(true)
    setDragStart({ x: t.clientX - pos.x, y: t.clientY - pos.y })
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!dragging) return
    e.preventDefault()
    const t = e.touches[0]
    setPos({ x: t.clientX - dragStart.x, y: t.clientY - dragStart.y })
  }

  function handleTouchEnd() {
    setDragging(false)
  }

  // Render cropped image to canvas and export
  function handleApply() {
    if (!imgRef.current || !containerRef.current) return

    const canvas = document.createElement('canvas')
    canvas.width = BANNER_WIDTH
    canvas.height = BANNER_HEIGHT
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const frameW = containerRef.current.clientWidth
    const frameH = frameW / BANNER_RATIO
    const totalScale = imgFitScale * scale

    // Map the visible frame back to source image coordinates
    const srcX = (-pos.x * (BANNER_WIDTH / frameW)) / (totalScale * (BANNER_WIDTH / imgRef.current.naturalWidth))
    const srcY = (-pos.y * (BANNER_HEIGHT / frameH)) / (totalScale * (BANNER_HEIGHT / imgRef.current.naturalHeight))

    // Draw the image at the correct position and scale
    const drawW = imgRef.current.naturalWidth * totalScale * (BANNER_WIDTH / frameW)
    const drawH = imgRef.current.naturalHeight * totalScale * (BANNER_HEIGHT / frameH)
    const drawX = pos.x * (BANNER_WIDTH / frameW)
    const drawY = pos.y * (BANNER_HEIGHT / frameH)

    ctx.drawImage(imgRef.current, drawX, drawY, drawW, drawH)

    canvas.toBlob(
      (blob) => { if (blob) onCrop(blob) },
      'image/jpeg',
      0.85
    )
  }

  const frameW = containerRef.current?.clientWidth || 300
  const frameH = frameW / BANNER_RATIO
  const displayW = imgNaturalSize.w * imgFitScale * scale
  const displayH = imgNaturalSize.h * imgFitScale * scale

  return (
    <div className="space-y-2">
      {/* Crop frame */}
      <div
        ref={containerRef}
        className="w-full rounded-lg overflow-hidden border-2 border-blue-cta relative select-none"
        style={{
          aspectRatio: `${BANNER_RATIO}`,
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {imgNaturalSize.w > 0 && (
          <img
            src={src}
            alt=""
            className="absolute pointer-events-none"
            style={{
              width: `${displayW}px`,
              height: `${displayH}px`,
              left: `${pos.x}px`,
              top: `${pos.y}px`,
            }}
            draggable={false}
          />
        )}
      </div>

      {/* Zoom controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}
          className="w-7 h-7 rounded bg-light-gray border border-border-gray text-dark-text text-sm font-bold hover:bg-mid-gray transition-colors"
        >
          −
        </button>
        <input
          type="range"
          min={0.5}
          max={3}
          step={0.05}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          className="flex-1 accent-blue-cta h-1.5"
        />
        <button
          onClick={() => setScale((s) => Math.min(3, s + 0.1))}
          className="w-7 h-7 rounded bg-light-gray border border-border-gray text-dark-text text-sm font-bold hover:bg-mid-gray transition-colors"
        >
          +
        </button>
        <span className="text-[10px] text-gray-text w-10 text-right">{Math.round(scale * 100)}%</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={uploading}
          className="flex-1 h-8 border border-border-gray text-gray-text text-xs font-bold rounded hover:bg-light-gray transition-colors disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={handleApply}
          disabled={uploading}
          className="flex-1 h-8 bg-blue-cta text-white text-xs font-bold rounded hover:bg-blue-accent transition-colors disabled:opacity-60"
        >
          {uploading ? 'Uploading...' : 'Apply'}
        </button>
      </div>

      <p className="text-[10px] text-gray-text text-center">Drag to position, zoom to fit. Output: 600 x 200px</p>
    </div>
  )
}
