import assert from 'node:assert/strict'

export async function assertSharedUX(page) {
  const issues = await page.evaluate(() => {
    const problems = []
    const root = document.querySelector('.zelia-ui')
    if (!root || document.querySelectorAll('.zelia-ui').length !== 1) return ['Expected one shared theme']
    if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('Document overflow')
    const appMain = root.querySelector('.zelia-app-main main')
    if (appMain && appMain.scrollWidth > appMain.clientWidth + 1) problems.push('Student content overflow')
    const style = getComputedStyle(root)
    if (style.backgroundColor !== 'rgb(255, 251, 247)') problems.push('Theme background')
    if (!style.fontFamily.startsWith('"Bricolage Grotesque"')) problems.push('Theme font')
    for (const heading of root.querySelectorAll('h1, h2, h3')) {
      if (getComputedStyle(heading).textTransform !== 'none') problems.push(`Heading case: ${heading.className}`)
    }
    for (const button of root.querySelectorAll(
      '.zelia-button, .zelia-home-button, .public-header__cta, .login-submit, .login-google, ' +
      '.primary-action, .secondary-action, .fp-btn, .metier-button, .zp-button, ' +
      '.tool-primary, .tool-secondary, .results-cta, .formation-lead-cta, .niv5-submit-btn, .n17-generate-btn, .n17-add-btn'
    )) {
      const box = button.getBoundingClientRect()
      if (!box.width || !box.height) continue
      const appearance = getComputedStyle(button)
      if (box.height < 48 || box.width < 44) problems.push(`Touch target: ${button.className}`)
      if (appearance.borderRadius !== '999px' || appearance.borderTopWidth !== '2px' ||
          appearance.fontSize !== '14px' || appearance.fontWeight !== '700' ||
          !appearance.fontFamily.startsWith('"Bricolage Grotesque"')) {
        problems.push(`Button variant: ${button.className}`)
      }
    }
    for (const card of root.querySelectorAll('.login-card, .zp-card, .tool-panel, .fp-card, .fe-card, .metier-card, .dash-card, .results-card')) {
      const appearance = getComputedStyle(card)
      if (appearance.borderTopWidth !== '2px' || appearance.borderTopColor !== 'rgb(37, 37, 44)' ||
          appearance.borderRadius !== (innerWidth <= 600 ? '20px' : '24px')) problems.push(`Card variant: ${card.className}`)
    }
    const isPublic = location.pathname === '/' || /^\/(?:parents|blog|formations|metiers|legal)(?:\/|$)/.test(location.pathname)
    if (root.querySelectorAll('.public-footer').length !== (isPublic ? 1 : 0)) problems.push('Footer context')
    const footer = root.querySelector('.public-footer')
    if (footer && footer.getBoundingClientRect().top + scrollY < innerHeight - 1) problems.push('Unreserved public content height')
    return problems
  })
  assert.deepEqual(issues, [], `Shared UX on ${page.url()}`)
}
