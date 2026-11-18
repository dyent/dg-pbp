import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supabase } from '../../../lib/supabase'
import * as api from './filesApi'

const storage = {
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
}

vi.mock('../../../lib/supabase', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn(() => storage) } },
}))

/** A chainable query builder that resolves to `result`. */
function mockFrom(result: { data?: unknown; error?: unknown }) {
  const calls: { method: string; args: unknown[] }[] = []
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'order']) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    })
  }
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: result.data ?? null, error: result.error ?? null }).then(resolve)
  vi.mocked(supabase.from).mockImplementation(((table: string) => {
    calls.push({ method: 'from', args: [table] })
    return builder
  }) as never)
  return calls
}

const pdf = new File(['%PDF'], 'Riverside Map.pdf', { type: 'application/pdf' })

describe('filesApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-2222-3333-4444-555555555555')
    storage.upload.mockResolvedValue({ data: {}, error: null })
    storage.remove.mockResolvedValue({ data: [], error: null })
  })

  it('lists files with their versions, newest version first', async () => {
    const calls = mockFrom({
      data: [
        {
          id: 'f1', title: 'Map', description: '', folder: 'Maps', visibility: 'weird',
          created_at: 'c', updated_at: 'u',
          ext_campaign_file_versions: [
            { id: 'v1', version_no: 1, object_path: 'p1', file_name: 'a.pdf', mime_type: 'application/pdf', size_bytes: '10', uploaded_at: 't1' },
            { id: 'v2', version_no: 2, object_path: 'p2', file_name: 'b.pdf', mime_type: 'application/pdf', size_bytes: 20, uploaded_at: 't2' },
          ],
        },
        { id: 'f2', title: 'Empty', description: '', folder: '', visibility: 'players', created_at: 'c', updated_at: 'u', ext_campaign_file_versions: null },
      ],
    })
    const files = await api.listFiles('ch')
    expect(calls).toContainEqual({ method: 'from', args: ['ext_campaign_files'] })
    expect(calls).toContainEqual({ method: 'eq', args: ['channel_id', 'ch'] })
    expect(files[0].visibility).toBe('gm')
    expect(files[0].versions.map(v => [v.versionNo, v.sizeBytes])).toEqual([[2, 20], [1, 10]])
    expect(files[1].versions).toEqual([])
  })

  it('throws readable errors from reads', async () => {
    mockFrom({ error: { message: 'boom' } })
    await expect(api.listFiles('ch')).rejects.toThrow('boom')
    await expect(api.listShares(['f1'])).rejects.toThrow('boom')
    await expect(api.listEvents('f1')).rejects.toThrow('boom')
  })

  it('groups shares by file and skips the query when there are no files', async () => {
    expect(await api.listShares([])).toEqual(new Map())
    expect(supabase.from).not.toHaveBeenCalled()
    mockFrom({ data: [{ file_id: 'f1', user_id: 'u1' }, { file_id: 'f1', user_id: 'u2' }, { file_id: 'f2', user_id: 'u1' }] })
    const shares = await api.listShares(['f1', 'f2'])
    expect(shares.get('f1')).toEqual(['u1', 'u2'])
    expect(shares.get('f2')).toEqual(['u1'])
  })

  it('lists history newest first and keeps details an object', async () => {
    const calls = mockFrom({
      data: [
        { id: 'e1', file_id: 'f1', actor_id: 'gm', kind: 'added', details: { file_name: 'a.pdf' }, created_at: 't' },
        { id: 'e2', file_id: 'f1', actor_id: null, kind: 'edited', details: ['bad'], created_at: 't' },
      ],
    })
    const events = await api.listEvents('f1')
    expect(calls).toContainEqual({ method: 'order', args: ['created_at', { ascending: false }] })
    expect(events[0].details).toEqual({ file_name: 'a.pdf' })
    expect(events[1].details).toEqual({})
  })

  it('uploads, then registers a new file', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: 'f9', error: null } as never)
    const id = await api.addFile('ch', pdf, { title: 'Map', description: 'd', folder: 'Maps', visibility: 'players', playerIds: ['u1'] })
    expect(id).toBe('f9')
    expect(storage.upload).toHaveBeenCalledWith('ch/11111111-2222-3333-4444-555555555555.pdf', pdf, {
      contentType: 'application/pdf',
      upsert: false,
    })
    expect(supabase.rpc).toHaveBeenCalledWith('ext_add_campaign_file', {
      p_channel_id: 'ch',
      p_title: 'Map',
      p_description: 'd',
      p_folder: 'Maps',
      p_visibility: 'players',
      p_player_ids: [],
      p_object_path: 'ch/11111111-2222-3333-4444-555555555555.pdf',
      p_file_name: 'Riverside Map.pdf',
    })
  })

  it('removes the upload when registering fails', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'Only the GM can manage campaign files' } } as never)
    await expect(
      api.addFile('ch', pdf, { title: 'Map', description: '', folder: '', visibility: 'selected', playerIds: ['u1'] }),
    ).rejects.toThrow('Only the GM can manage campaign files')
    expect(vi.mocked(supabase.rpc).mock.calls[0][1]).toMatchObject({ p_player_ids: ['u1'] })
    expect(storage.remove).toHaveBeenCalledWith(['ch/11111111-2222-3333-4444-555555555555.pdf'])
  })

  it('stops when the upload itself fails', async () => {
    storage.upload.mockResolvedValue({ data: null, error: { message: 'The object exceeded the maximum allowed size' } })
    await expect(api.replaceFile('ch', 'f1', pdf)).rejects.toThrow('maximum allowed size')
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('replaces a file and cleans up after a failure', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: 3, error: null } as never)
    expect(await api.replaceFile('ch', 'f1', pdf)).toBe(3)
    expect(supabase.rpc).toHaveBeenCalledWith('ext_replace_campaign_file', {
      p_file_id: 'f1',
      p_object_path: 'ch/11111111-2222-3333-4444-555555555555.pdf',
      p_file_name: 'Riverside Map.pdf',
    })
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error: { message: 'no' } } as never)
    storage.remove.mockRejectedValueOnce(new Error('offline'))
    await expect(api.replaceFile('ch', 'f1', pdf)).rejects.toThrow('no')
  })

  it('updates details, sending players only for chosen-player files', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
    await api.updateFile('f1', { title: 'T', description: '', folder: '', visibility: 'gm', playerIds: ['u1'] })
    expect(supabase.rpc).toHaveBeenCalledWith('ext_update_campaign_file', {
      p_file_id: 'f1', p_title: 'T', p_description: '', p_folder: '', p_visibility: 'gm', p_player_ids: [],
    })
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'nope' } } as never)
    await expect(api.updateFile('f1', { title: 'T', description: '', folder: '', visibility: 'selected', playerIds: ['u1'] })).rejects.toThrow('nope')
  })

  it('deletes a file and its stored versions', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: ['p1', 'p2'], error: null } as never)
    await api.deleteFile('f1')
    expect(supabase.rpc).toHaveBeenCalledWith('ext_delete_campaign_file', { p_file_id: 'f1' })
    expect(storage.remove).toHaveBeenCalledWith(['p1', 'p2'])

    vi.clearAllMocks()
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never)
    await api.deleteFile('f1')
    expect(storage.remove).not.toHaveBeenCalled()

    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { message: 'archived' } } as never)
    await expect(api.deleteFile('f1')).rejects.toThrow('archived')
  })

  it('makes view and download links', async () => {
    storage.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://x/view' }, error: null })
    expect(await api.fileLink('p1')).toBe('https://x/view')
    expect(storage.createSignedUrl).toHaveBeenCalledWith('p1', 3600, undefined)
    await api.fileLink('p1', 'map.pdf')
    expect(storage.createSignedUrl).toHaveBeenLastCalledWith('p1', 3600, { download: 'map.pdf' })

    storage.createSignedUrl.mockResolvedValue({ data: null, error: null })
    await expect(api.fileLink('p1')).rejects.toThrow('Could not open the file.')
    storage.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found' } })
    await expect(api.fileLink('p1')).rejects.toThrow('Object not found')
  })
})
