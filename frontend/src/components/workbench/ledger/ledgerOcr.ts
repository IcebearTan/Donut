import { api, type LedgerDraftItem } from '../../../api/client'
import { errorMessage, MAX_OCR_FILE_BYTES } from './ledgerMeta'

export type LedgerOcrProgress = (done: number, total: number) => void

export interface LedgerOcrOutcome {
  /** Sanitized items of every screenshot that yielded at least one amount. */
  found: LedgerDraftItem[]
  /** One human-readable line per screenshot that could not be used. */
  failed: string[]
}

/**
 * Sends each screenshot separately (the server OCR queue is serial anyway) and merges the
 * sanitized results. Failures are reported per file so one bad image never discards the rest.
 */
export async function recognizeImages(
  files: File[],
  onProgress: LedgerOcrProgress,
): Promise<LedgerOcrOutcome> {
  const found: LedgerDraftItem[] = []
  const failed: string[] = []
  for (let i = 0; i < files.length; i += 1) {
    const file = files[i]
    if (file.size > MAX_OCR_FILE_BYTES) failed.push(`${file.name}：超过 10MB`)
    else {
      try {
        const res = await api.ocrParseLedger(file)
        if (res.items.length === 0) failed.push(`${file.name}：未识别到金额`)
        else found.push(...res.items)
      } catch (e) {
        failed.push(`${file.name}：${errorMessage(e, '识别失败')}`)
      }
    }
    onProgress(i + 1, files.length)
  }
  return { found, failed }
}
