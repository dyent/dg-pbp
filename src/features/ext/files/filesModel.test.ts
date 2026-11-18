import { describe, expect, it } from 'vitest'
import {
  currentVersion,
  describeEvent,
  detailsProblem,
  fileProblem,
  folderNames,
  formatSize,
  groupByFolder,
  isImage,
  isVisibility,
  objectPathFor,
  type CampaignFile,
  type FileEvent,
} from './filesModel'

function file(id: string, title: string, folder: string, updatedAt: string, fileName = `${id}.pdf`): CampaignFile {
  return {
    id,
    title,
    description: '',
    folder,
    visibility: 'players',
    createdAt: updatedAt,
    updatedAt,
    versions: [{ id: `${id}v`, versionNo: 1, objectPath: `ch/${id}.pdf`, fileName, mimeType: 'application/pdf', sizeBytes: 10, uploadedAt: updatedAt }],
  }
}

const event = (kind: FileEvent['kind'], details: Record<string, unknown>): FileEvent => ({
  id: 'e', fileId: 'f', actorId: 'gm', kind, details, createdAt: '2026-11-19T10:00:00Z',
})

const nameOf = (id: string) => ({ u1: 'Sam', u2: 'Jo' })[id] ?? id

describe('filesModel', () => {
  it('tells visibilities and images apart', () => {
    expect(isVisibility('selected')).toBe(true)
    expect(isVisibility('owner')).toBe(false)
    expect(isImage('image/png')).toBe(true)
    expect(isImage('application/pdf')).toBe(false)
  })

  it('formats sizes', () => {
    expect(formatSize(12)).toBe('12 bytes')
    expect(formatSize(350 * 1024)).toBe('350 KB')
    expect(formatSize(1.25 * 1024 * 1024)).toBe('1.3 MB')
  })

  it('checks file type and size', () => {
    expect(fileProblem({ type: 'application/pdf', size: 100 })).toBeNull()
    expect(fileProblem({ type: 'image/webp', size: 100 })).toBeNull()
    expect(fileProblem({ type: 'image/svg+xml', size: 100 })).toMatch(/Only PDF and image/)
    expect(fileProblem({ type: 'application/pdf', size: 21 * 1024 * 1024 })).toBe('Files can be at most 20 MB.')
  })

  it('checks the details', () => {
    const ok = { title: 'Map', description: '', folder: '', visibility: 'players' as const, playerIds: [] }
    expect(detailsProblem(ok)).toBeNull()
    expect(detailsProblem({ ...ok, title: '  ' })).toBe('Give the file a title.')
    expect(detailsProblem({ ...ok, title: 'x'.repeat(121) })).toMatch(/120/)
    expect(detailsProblem({ ...ok, folder: 'x'.repeat(61) })).toMatch(/60/)
    expect(detailsProblem({ ...ok, description: 'x'.repeat(1001) })).toMatch(/1000/)
    expect(detailsProblem({ ...ok, visibility: 'selected' })).toMatch(/at least one player/)
    expect(detailsProblem({ ...ok, visibility: 'selected', playerIds: ['u1'] })).toBeNull()
  })

  it('builds object paths inside the campaign folder', () => {
    expect(objectPathFor('ch', 'Riverside Map.PDF', 'r1')).toBe('ch/r1.pdf')
    expect(objectPathFor('ch', 'no-extension', 'r2')).toBe('ch/r2.bin')
  })

  it('groups by folder, files without one last, newest first, and searches', () => {
    const files = [
      file('a', 'Old map', 'Maps', '2026-11-01'),
      file('b', 'New map', 'Maps', '2026-11-10'),
      file('c', 'Loose note', '', '2026-11-05'),
      file('d', 'Autopsy', 'Case files', '2026-11-02', 'photo.png'),
    ]
    expect(groupByFolder(files).map(g => [g.folder, g.files.map(f => f.id)])).toEqual([
      ['Case files', ['d']],
      ['Maps', ['b', 'a']],
      ['', ['c']],
    ])
    expect(groupByFolder(files, 'MAP').flatMap(g => g.files.map(f => f.id))).toEqual(['b', 'a'])
    expect(groupByFolder(files, 'photo.png').flatMap(g => g.files.map(f => f.id))).toEqual(['d'])
    expect(groupByFolder(files, 'case').flatMap(g => g.files.map(f => f.id))).toEqual(['d'])
    expect(folderNames(files)).toEqual(['Case files', 'Maps'])
    expect(currentVersion(files[0])?.fileName).toBe('a.pdf')
  })

  it('describes history entries', () => {
    expect(describeEvent(event('added', { file_name: 'map.pdf', visibility: 'players', players: [] }), nameOf)).toBe(
      'Added map.pdf (All players)',
    )
    expect(describeEvent(event('added', { file_name: 'p.png', visibility: 'selected', players: ['u1', 'u2'] }), nameOf)).toBe(
      'Added p.png (shared with Sam, Jo)',
    )
    expect(describeEvent(event('added', { file_name: 'x.pdf' }), nameOf)).toBe('Added x.pdf')
    expect(describeEvent(event('replaced', { file_name: 'map-v2.pdf', version: 2 }), nameOf)).toBe(
      'Replaced with map-v2.pdf (version 2)',
    )
    expect(
      describeEvent(
        event('edited', {
          changes: [
            { field: 'title', from: 'Map', to: 'Town map' },
            { field: 'folder', from: '', to: 'Maps' },
            { field: 'visibility', from: 'gm', to: 'selected' },
          ],
          added: ['u1'],
          removed: ['u2'],
        }),
        nameOf,
      ),
    ).toBe(
      'Edited. Title: "Map" → "Town map"; Folder: (empty) → "Maps"; Who can see it: GM only → Chosen players; Shared with Sam; No longer shared with Jo',
    )
    expect(describeEvent(event('edited', {}), nameOf)).toBe('Edited')
  })
})
