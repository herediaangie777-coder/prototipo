import { useEffect, useState } from 'react'

export function safeImageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

interface ProductImageProps {
  src: unknown
  alt: string
  className?: string
}

export function ProductImage({ src, alt, className = '' }: ProductImageProps) {
  const imageUrl = safeImageUrl(src)
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [imageUrl])

  return (
    <span className={`product-image ${className}`}>
      {imageUrl && !failed
        ? <img src={imageUrl} alt={alt} loading="lazy" onError={() => setFailed(true)} />
        : <span className="product-image-placeholder" role="img" aria-label={`${alt}: sin imagen`}>🍓</span>}
    </span>
  )
}
