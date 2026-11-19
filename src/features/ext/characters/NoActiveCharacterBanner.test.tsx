import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PostAuthorshipContext, type AuthorLookup } from '../authorship/authorshipContext'
import { NoActiveCharacterBanner } from './NoActiveCharacterBanner'
import { withPlayerName } from './CharactersEntry'

function renderWith(lookup: AuthorLookup, signedIn = true) {
  return render(
    <PostAuthorshipContext.Provider value={lookup}>
      <NoActiveCharacterBanner myUserId={signedIn ? 'u1' : undefined}>
        <button type="button">Choose a character</button>
      </NoActiveCharacterBanner>
    </PostAuthorshipContext.Provider>,
  )
}

describe('NoActiveCharacterBanner', () => {
  it('reminds a player posting under their own name, and can be put off', () => {
    renderWith(() => ({ characterId: '', name: 'Sam', portraitUrl: null }))
    expect(screen.getByTestId('no-active-character')).toHaveTextContent('None of your characters is active')
    expect(screen.getByRole('button', { name: 'Choose a character' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    expect(screen.queryByTestId('no-active-character')).toBeNull()
  })

  it('stays hidden while posting as a character, before any character, or signed out', () => {
    const { unmount } = renderWith(() => ({ characterId: 'c1', name: 'Reyes', portraitUrl: null }))
    expect(screen.queryByTestId('no-active-character')).toBeNull()
    unmount()
    const second = renderWith(() => null)
    expect(screen.queryByTestId('no-active-character')).toBeNull()
    second.unmount()
    renderWith(() => ({ characterId: '', name: 'Sam', portraitUrl: null }), false)
    expect(screen.queryByTestId('no-active-character')).toBeNull()
  })
})

describe('withPlayerName', () => {
  it('adds the account name when it differs from the posting name', () => {
    expect(withPlayerName('Agent Reyes', 'Sam')).toBe('Agent Reyes (Sam)')
    expect(withPlayerName('Sam', 'Sam')).toBe('Sam')
    expect(withPlayerName('Agent Reyes', null)).toBe('Agent Reyes')
    expect(withPlayerName('Agent Reyes', '  ')).toBe('Agent Reyes')
  })
})
