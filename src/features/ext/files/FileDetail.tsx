import { useEffect, useId, useState } from 'react'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { BADGE, BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, SECTION_TITLE } from '../characters/ui'
import { fileLink, listEvents } from './filesApi'
import {
  ACCEPT_ATTR,
  VISIBILITY_LABELS,
  currentVersion,
  describeEvent,
  fileProblem,
  formatSize,
  isImage,
  type CampaignFile,
  type FileEvent,
} from './filesModel'

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })

interface FileDetailProps {
  file: CampaignFile
  isGM: boolean
  canManage: boolean
  /** GM only: who a 'Chosen players' file is shared with. */
  sharedWith: string[]
  nameOf: (userId: string) => string
  onEdit: () => void
  onReplace: (picked: File) => Promise<boolean>
  onDelete: () => Promise<void>
  onProblem: (message: string) => void
}

interface Links {
  view: Record<string, string>
  download: string | null
}

export function FileDetail({ file, isGM, canManage, sharedWith, nameOf, onEdit, onReplace, onDelete, onProblem }: FileDetailProps) {
  const id = useId()
  const current = currentVersion(file)
  const [links, setLinks] = useState<Links | null>(null)
  const [linkError, setLinkError] = useState(false)
  const [events, setEvents] = useState<FileEvent[] | null>(null)
  const [replacing, setReplacing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // Short-lived signed links for every version, fetched up front so "Open"
  // and "Download" are ordinary links (no pop-up blocking).
  useEffect(() => {
    let cancelled = false
    setLinks(null)
    setLinkError(false)
    ;(async () => {
      try {
        const view: Record<string, string> = {}
        for (const v of file.versions) view[v.id] = await fileLink(v.objectPath)
        const download = current ? await fileLink(current.objectPath, current.fileName) : null
        if (!cancelled) setLinks({ view, download })
      } catch {
        if (!cancelled) setLinkError(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [file.versions, current])

  useEffect(() => {
    if (!isGM) return
    let cancelled = false
    listEvents(file.id)
      .then(list => !cancelled && setEvents(list))
      .catch(() => !cancelled && setEvents([]))
    return () => {
      cancelled = true
    }
  }, [file.id, file.updatedAt, isGM])

  const pickReplacement = async (picked: File | null) => {
    if (!picked) return
    const problem = fileProblem(picked)
    if (problem) {
      onProblem(problem)
      return
    }
    setReplacing(true)
    await onReplace(picked)
    setReplacing(false)
  }

  const earlier = file.versions.slice(1)

  return (
    <article className="space-y-4" aria-labelledby={`${id}-title`}>
      <header className="space-y-1">
        <h3 id={`${id}-title`} className="text-lg font-semibold text-surface-900 dark:text-surface-100">
          {file.title}
        </h3>
        <p className="flex flex-wrap items-center gap-2 text-xs text-surface-500 dark:text-surface-400">
          {file.folder && <span>Folder: {file.folder}</span>}
          {isGM && (
            <span className={`${BADGE} bg-surface-100 text-surface-700 dark:bg-surface-700 dark:text-surface-200`}>
              {file.visibility === 'selected' && sharedWith.length
                ? `Shared with ${sharedWith.map(nameOf).join(', ')}`
                : VISIBILITY_LABELS[file.visibility]}
            </span>
          )}
        </p>
        {file.description && <p className="whitespace-pre-wrap text-sm text-surface-700 dark:text-surface-300">{file.description}</p>}
      </header>

      {current && (
        <section className="space-y-2">
          <p className="text-sm text-surface-600 dark:text-surface-400">
            {current.fileName} · {formatSize(current.sizeBytes)}
            {file.versions.length > 1 && ` · version ${current.versionNo}`}
          </p>
          {linkError ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              Couldn’t prepare the file links. Close and reopen the file to try again.
            </p>
          ) : !links ? (
            <p className="text-sm text-surface-500 dark:text-surface-400">Preparing the file…</p>
          ) : (
            <>
              {isImage(current.mimeType) && links.view[current.id] && (
                <img
                  src={links.view[current.id]}
                  alt={file.title}
                  className="max-h-[50vh] max-w-full rounded border border-surface-200 object-contain dark:border-surface-700"
                />
              )}
              <div className="flex flex-wrap gap-2">
                <a href={links.view[current.id]} target="_blank" rel="noreferrer" className={BTN_PRIMARY}>
                  Open
                </a>
                {links.download && (
                  <a href={links.download} className={BTN_SECONDARY}>
                    Download
                  </a>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {canManage && (
        <section className="flex flex-wrap gap-2 border-t border-surface-100 pt-3 dark:border-surface-700">
          <button type="button" className={BTN_SECONDARY} onClick={onEdit}>
            Edit details
          </button>
          <label className={`${BTN_SECONDARY} cursor-pointer ${replacing ? 'pointer-events-none opacity-50' : ''}`}>
            {replacing ? 'Uploading…' : 'Replace file'}
            <input
              type="file"
              accept={ACCEPT_ATTR}
              className="sr-only"
              disabled={replacing}
              onChange={e => {
                void pickReplacement(e.target.files?.[0] ?? null)
                e.target.value = ''
              }}
            />
          </label>
          <button type="button" className={BTN_DANGER} onClick={() => setConfirming(true)}>
            Delete
          </button>
          <p className="w-full text-xs text-surface-500 dark:text-surface-400">Replacing keeps the earlier versions below.</p>
        </section>
      )}

      {earlier.length > 0 && (
        <section>
          <h4 className={SECTION_TITLE}>Earlier versions</h4>
          <ul className="mt-1 space-y-1 text-sm">
            {earlier.map(v => (
              <li key={v.id} className="flex flex-wrap items-center gap-2 text-surface-700 dark:text-surface-300">
                <span>
                  Version {v.versionNo}: {v.fileName} · {formatSize(v.sizeBytes)} ·{' '}
                  <time dateTime={v.uploadedAt}>{dateFormat.format(new Date(v.uploadedAt))}</time>
                </span>
                {links?.view[v.id] && (
                  <a
                    href={links.view[v.id]}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open version ${v.versionNo}`}
                    className="text-primary-600 underline dark:text-primary-400"
                  >
                    Open
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {isGM && (
        <section>
          <h4 className={SECTION_TITLE}>History (GM only)</h4>
          {events === null ? (
            <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">Loading…</p>
          ) : events.length === 0 ? (
            <p className="mt-1 text-sm text-surface-500 dark:text-surface-400">No history yet.</p>
          ) : (
            <ul className="mt-1 space-y-2">
              {events.map(event => (
                <li key={event.id} className="text-sm text-surface-800 dark:text-surface-200">
                  {describeEvent(event, nameOf)}
                  <span className="block text-xs text-surface-500 dark:text-surface-400">
                    <time dateTime={event.createdAt}>{dateFormat.format(new Date(event.createdAt))}</time>
                    {event.actorId && ` by ${nameOf(event.actorId)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {confirming && (
        <ConfirmDialog
          title={`Delete ${file.title}?`}
          description="This removes the file, all its versions and its history for good. Players lose access straight away."
          onConfirm={async () => {
            setConfirming(false)
            await onDelete()
          }}
          onClose={() => setConfirming(false)}
        />
      )}
    </article>
  )
}
