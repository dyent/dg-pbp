// Turns handout pages of a source into a picture (PNG) in the browser
// (owner feedback on Phase 3, DECISIONS.md #50), so players see the handout
// straight away when the GM shares it. pdf.js is loaded on first use only.

export interface PageArea {
  left: number
  top: number
  width: number
  height: number
}

/** Widest picture we make, in pixels (keeps files well under the 20 MB limit). */
const MAX_WIDTH = 1800
/** A little room around the area Claude pointed at, as a fraction of the page. */
const PADDING = 0.02

/** The part of a page to keep, padded and kept inside the page (fractions 0–1). */
export function paddedArea(area: PageArea | undefined | null): PageArea {
  if (!area) return { left: 0, top: 0, width: 1, height: 1 }
  const left = Math.max(0, area.left - PADDING)
  const top = Math.max(0, area.top - PADDING)
  return {
    left,
    top,
    width: Math.min(1 - left, area.width + 2 * PADDING),
    height: Math.min(1 - top, area.height + 2 * PADDING),
  }
}

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist')
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  }
  return pdfjs
}

/**
 * A PNG of pages first..last (1-based) stacked top to bottom. With one page
 * and an area, only that part of the page is kept.
 */
export async function renderPagesAsPng(pdf: ArrayBuffer, firstPage: number, lastPage: number, area?: PageArea | null): Promise<Blob> {
  const pdfjs = await loadPdfJs()
  const task = pdfjs.getDocument({ data: new Uint8Array(pdf) })
  const doc = await task.promise
  try {
    if (lastPage > doc.numPages) throw new Error(`This PDF has only ${doc.numPages} pages.`)
    const crop = firstPage === lastPage ? paddedArea(area) : paddedArea(null)
    const parts: HTMLCanvasElement[] = []
    for (let n = firstPage; n <= lastPage; n++) {
      const page = await doc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(3, MAX_WIDTH / (base.width * crop.width))
      const viewport = page.getViewport({ scale })
      const full = document.createElement('canvas')
      full.width = Math.ceil(viewport.width)
      full.height = Math.ceil(viewport.height)
      await page.render({ canvas: full, viewport }).promise
      const part = document.createElement('canvas')
      part.width = Math.max(1, Math.round(full.width * crop.width))
      part.height = Math.max(1, Math.round(full.height * crop.height))
      part.getContext('2d')!.drawImage(full, -Math.round(full.width * crop.left), -Math.round(full.height * crop.top))
      parts.push(part)
    }
    const out = document.createElement('canvas')
    out.width = Math.max(...parts.map(p => p.width))
    out.height = parts.reduce((sum, p) => sum + p.height, 0)
    const ctx = out.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)
    let y = 0
    for (const p of parts) {
      ctx.drawImage(p, 0, y)
      y += p.height
    }
    return await new Promise<Blob>((resolve, reject) =>
      out.toBlob(blob => (blob ? resolve(blob) : reject(new Error('The picture could not be made.'))), 'image/png'),
    )
  } finally {
    await task.destroy()
  }
}
