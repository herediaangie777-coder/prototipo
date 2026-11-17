import { useEffect, useState } from 'react'
import type { TipoProducto } from '../data/types'

export type Calibre = 'Calibre 1' | 'Calibre 2' | 'Calibre 3' | 'Jumbo'

export const fresaImagenes: Record<TipoProducto, string> = {
  Fresca: '/src/assets/fresas/fresca.jpg',
  Congelada: '/src/assets/fresas/congelada.jpg',
}

export const calibreImagenes: Record<Calibre, string> = {
  'Calibre 1': '/src/assets/fresas/calibre-1.jpg',
  'Calibre 2': '/src/assets/fresas/calibre-2.jpg',
  'Calibre 3': '/src/assets/fresas/calibre-3.jpg',
  Jumbo: '/src/assets/fresas/jumbo.jpg',
}

export function FresaImage({ src, alt, tipoProducto, calibre }: {
  src: string
  alt: string
  tipoProducto?: TipoProducto
  calibre?: Calibre
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  if (failed) {
    const scale = calibre === 'Calibre 1' ? 0.68 : calibre === 'Calibre 2' ? 0.82 : calibre === 'Calibre 3' ? 0.94 : 1.08
    return <svg className="fresa-image fresa-illustration" viewBox="0 0 100 100" role="img" aria-label={alt}>
      <title>{alt}</title>
      <g transform={`translate(50 50) scale(${scale}) translate(-50 -50)`}>
        <path d="M50 23c-6-8-18-8-22 1-3 7 3 19 22 47 19-28 25-40 22-47-4-9-16-9-22-1Z" fill="var(--primary-dark)" />
        <path d="M50 27c-7-10-15-10-20-5 5 0 9 2 12 7-6-4-12-3-15 1 7-1 13 1 18 5-2-5 0-8 5-8Zm0 0c7-10 15-10 20-5-5 0-9 2-12 7 6-4 12-3 15 1-7-1-13 1-18 5 2-5 0-8-5-8Z" fill="var(--active-dark)" />
        <path d="M40 43h.1M49 49h.1M58 42h.1M45 58h.1M55 59h.1" stroke="var(--amber-light)" strokeWidth="3" strokeLinecap="round" />
      </g>
      {tipoProducto === 'Congelada' && <g stroke="var(--info-text)" strokeWidth="3" strokeLinecap="round">
        <path d="M78 20v22M68.5 25.5l19 11M68.5 36.5l19-11" />
        <path d="m78 20-4 4m4-4 4 4m-4 22-4-4m4 4 4-4m-9.5-16.5 5.5 1.5m-5.5-1.5 1.5 5.5m13-5.5-5.5 1.5m5.5-1.5-1.5 5.5" />
      </g>}
    </svg>
  }
  return <img className="fresa-image" src={src} alt={alt} onError={() => setFailed(true)} />
}
