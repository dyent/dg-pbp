// Cuts a page range out of a PDF in the browser (Phase 3 step 3), so only those
// pages are uploaded and sent to the AI. pdf-lib is loaded on first use only.

export class PdfSliceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PdfSliceError'
  }
}

/** A new PDF holding pages first..last (1-based, inclusive) of the given one. */
export async function slicePdf(pdf: ArrayBuffer, firstPage: number, lastPage: number): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib')
  let source
  try {
    source = await PDFDocument.load(pdf, { updateMetadata: false })
  } catch (err) {
    if (err instanceof Error && err.name === 'EncryptedPDFError') {
      throw new PdfSliceError('This PDF is password-protected or locked, so its pages can\'t be cut out.')
    }
    throw new PdfSliceError('This file could not be read as a PDF.')
  }
  const count = source.getPageCount()
  if (firstPage < 1 || lastPage < firstPage) throw new PdfSliceError('The last page must come after the first.')
  if (lastPage > count) throw new PdfSliceError(`This PDF has only ${count} page${count === 1 ? '' : 's'}.`)
  const out = await PDFDocument.create()
  const indices = Array.from({ length: lastPage - firstPage + 1 }, (_, i) => firstPage - 1 + i)
  for (const page of await out.copyPages(source, indices)) out.addPage(page)
  return out.save()
}
