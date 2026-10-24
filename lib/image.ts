/**
 * Downscale + re-encode an image in the browser before upload: square-crops to
 * the center, max `size` px, JPEG. Strips EXIF (incl. GPS) as a side effect.
 */
export async function prepareAvatar(file: File, size = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2
  const target = Math.min(size, side)

  const canvas = document.createElement('canvas')
  canvas.width = target
  canvas.height = target
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, target, target)
  bitmap.close()

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))), 'image/jpeg', 0.86),
  )
}
