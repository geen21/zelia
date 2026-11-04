import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect as baseExpect } from '@playwright/test'
import { TOOLBOX_ITEMS } from '../src/lib/levelMapping.js'
import { ORIENTATION_VIDEO_ITEMS } from '../src/lib/videoToolSequence.js'
import { assertSharedUX } from './fixtures/assert-shared-ux.mjs'

const expect = baseExpect.configure({ timeout: 15000 })

const base = process.env.TOOLS_TEST_URL || 'http://127.0.0.1:5187'
const output = join(tmpdir(), 'zelia-tools-tests')
await mkdir(output, { recursive: true })
const source = await (await fetch(`${base}/src/lib/supabase.js`)).text()
const supabaseUrl = source.match(/"VITE_SUPABASE_URL"\s*:\s*"([^"]+)"/)?.[1]
assert.ok(supabaseUrl, 'Run these checks against the Vite development server.')
const storageKey = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
const tailwindResponse = await fetch('https://cdn.tailwindcss.com')
assert.ok(tailwindResponse.ok, 'The dashboard Tailwind runtime must be available.')
const tailwindRuntime = await tailwindResponse.text()
const user = { id: 'tool-fixture', email: 'camille@example.com', aud: 'authenticated', first_name: 'Camille' }
const profile = { ...user, home_preference: 'questionnaire', department: '75' }
const jobs = ['UX designer', 'Infirmier', 'Journaliste', 'Comptable', 'Architecte', 'Technicien']
const results = {
  personalityType: 'Explorateur', personalityAnalysis: 'Tu apprécies comprendre et créer.',
  skillsAssessment: 'Créativité : imaginer des solutions.\nÉcoute : comprendre les autres.',
  jobRecommendations: jobs.map((title) => ({ title, skills: ['Écoute', 'Créativité'] })),
  studyRecommendations: [{ degree: 'BTS Communication', type: 'Formation pratique.' }]
}
const avatar = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" rx="20" fill="#fbe7ef"/><circle cx="50" cy="45" r="25" fill="#f1c8a4"/><path d="M25 100q0-40 25-35 25-5 25 35" fill="#c1ff72"/></svg>'
const dashboardGamesOnly = process.argv.includes('--dashboard-games')
const dashboardToolIds = [
  'classement-metiers', 'videos-orientation', 'quiz-orientation', 'personnalite',
  'lettre-futur', 'anglais', 'cv', 'lettre', 'parcoursup', 'pitch', 'entretien'
]
const tools = TOOLBOX_ITEMS.filter((tool) => dashboardGamesOnly ? dashboardToolIds.includes(tool.id) : tool.id !== 'formations')
const browser = await chromium.launch({ headless: true })

async function prepare(viewport, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport, reducedMotion })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  page.setDefaultNavigationTimeout(60000)
  const state = { errors: [], saved: [], quests: [], failNextSave: false, submissions: 0 }
  page.on('pageerror', (error) => state.errors.push(error.message))
  await context.addInitScript(({ storageKey, user }) => {
    if (window !== window.top) return
    window.tailwind = { config: {} }
    localStorage.setItem('token', 'tool-fixture-token')
    localStorage.setItem(storageKey, JSON.stringify({
      access_token: 'tool-fixture-token', refresh_token: 'tool-fixture-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user
    }))
  }, { storageKey, user })
  await context.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (url.hostname === 'cdn.tailwindcss.com') return route.fulfill({ contentType: 'application/javascript', body: tailwindRuntime })
    if (url.pathname.includes('/auth/v1/')) return route.fulfill({ json: user })
    if (url.pathname.includes('/rest/v1/')) {
      if (url.pathname.endsWith('/rpc/search_metiers')) return route.fulfill({ json: [] })
      if (url.pathname.endsWith('/user_results')) {
        const row = { job_recommendations: results.jobRecommendations, skills_assessment: results.skillsAssessment, questionnaire_type: 'inscription' }
        return route.fulfill({ json: request.headers().accept?.includes('object') ? row : [row] })
      }
      state.errors.push(`Unexpected Supabase request: ${url.pathname}`)
      return route.fulfill({ status: 404, json: { message: 'Unexpected fixture request' } })
    }
    if (url.hostname === 'api.dicebear.com') return route.fulfill({ contentType: 'image/svg+xml', body: avatar })
    if (url.pathname.includes('/api/')) {
      const path = url.pathname.replace(/^.*\/api/, '')
      let data
      if (path === '/users/profile') data = { profile }
      else if (path === '/users/me') data = { user }
      else if (path === '/users/profile/extra-info') {
        if (request.method() === 'POST') {
          if (state.failNextSave) {
            state.failNextSave = false
            return route.fulfill({ status: 503, json: { error: 'Enregistrement indisponible' } })
          }
          const entries = request.postDataJSON().entries
          state.saved.push(...entries)
        }
        data = { entries: state.saved }
      } else if (path === '/analysis/my-results') data = { results }
      else if (path === '/ecoles/partenaires/ux-fixture') data = { formation: { id: 'ux-fixture', school_name: 'École des possibles', formation_name: 'BTS Communication', city: 'Paris', description: 'Objectif: Créer et communiquer. Pré-requis: Le bac.', is_active: true } }
      else if (path === '/ecoles/my-submissions') data = { submissions: [] }
      else if (path === '/ecoles/matched') data = { matched: [{ id: 'ux-fixture', match_score: 82 }] }
      else if (path === `/progression/${user.id}`) {
        if (request.method() !== 'GET') {
          const payload = request.postDataJSON()
          assert.equal(payload.level, 1, 'Standalone tools must not advance legacy levels.')
          assert.equal(payload.xp, 0)
          state.quests = payload.quests
        }
        data = { level: 1, xp: 0, quests: state.quests, perks: [] }
      } else if (path === '/questionnaire/questions') {
        data = Array.from({ length: 3 }, (_, index) => ({ id: index + 1, content: `Question de personnalité ${index + 1}` }))
      } else if (path === '/questionnaire/submit') {
        state.submissions += 1
        data = { success: true }
      } else if (path === '/analysis/generate-analysis-by-type') data = { analysis: { ...results, shareImageUrl: 'data:image/svg+xml,' + encodeURIComponent(avatar) } }
      else if (path === '/chat/ai') {
        const payload = request.postDataJSON()
        data = { reply: payload.advisorType === 'cv-builder'
          ? JSON.stringify({ fullName: 'Camille', title: 'UX designer', summary: 'Un profil créatif et attentif.', experiences: [], education: [], skills: ['Créativité'], qualities: ['Écoute'], languages: ['Anglais B2'], interests: [] })
          : payload.advisorType === 'projects-generator'
          ? '["Communication","Organisation","Créativité","Écoute","Travail en équipe"]'
          : payload.advisorType === 'recruteur-impitoyable'
            ? 'Peux-tu me donner un exemple de projet concret ?'
            : payload.message.includes('études') || payload.message.includes('étude')
              ? '- BTS Communication\n- Licence information-communication'
              : jobs.join('\n') }
      } else if (path === '/catalog/metiers/search') data = { items: jobs.map((intitule, index) => ({ id: index, intitule })) }
      else if (path === '/letter/future') data = { success: true }
      else if (path === '/letter/suggest') data = { items: [{ id: 'job-1', label: 'UX designer', type: 'metier' }] }
      else if (path === '/letter/generate') data = { letter: 'Madame, Monsieur,\nJe souhaite rejoindre votre équipe.' }
      else if (path === '/analysis/share-image') data = { url: 'data:image/svg+xml,' + encodeURIComponent(avatar) }
      else {
        state.errors.push(`Unexpected API request: ${request.method()} ${path}`)
        return route.fulfill({ status: 404, json: { error: 'Unexpected fixture request' } })
      }
      return route.fulfill({ json: data })
    }
    if (url.origin === new URL(base).origin) return route.continue()
    return route.abort()
  })
  return { context, page, state }
}

async function assertLayout(page, width) {
  await assertSharedUX(page)
  const layout = await page.evaluate(() => {
    const main = document.querySelector('.zelia-app-main main')
    const header = document.querySelector('.tool-header')
    const panel = document.querySelector('.tool-body .tool-panel')
    return {
      documentFits: document.documentElement.scrollWidth <= window.innerWidth,
      mainFits: main.scrollWidth <= main.clientWidth + 1,
      header: header?.getBoundingClientRect().toJSON(),
      panel: panel?.getBoundingClientRect().toJSON()
    }
  })
  assert.ok(layout.documentFits && layout.mainFits, `Horizontal overflow at ${width}px: ${page.url()}`)
  if (layout.header && layout.panel) {
    assert.ok(Math.abs(layout.header.x - layout.panel.x) <= 1, `Header and content must align: ${page.url()}`)
    assert.ok(Math.abs(layout.header.width - layout.panel.width) <= 1, `Header and content must have a common width: ${page.url()}`)
  }
}

async function answerStatistics(page, state, slug, correctAnswers) {
  for (const [index, letter] of correctAnswers.entries()) {
    const verify = page.getByRole('button', { name: 'Vérifier ma réponse' })
    await expect(verify).toBeDisabled()
    const choice = page.locator('.tool-choice').filter({ has: page.locator('.tool-choice-key', { hasText: new RegExp(`^${letter}$`) }) })
    await choice.click()
    await expect(choice).toHaveAttribute('aria-pressed', 'true')
    await verify.click()
    await expect(page.locator('.tool-feedback')).toHaveAttribute('role', 'status')
    await expect(page.locator('.tool-choice.is-correct')).toHaveCount(1)
    if (index < 2) await page.getByRole('button', { name: 'Question suivante' }).click()
    else {
      state.failNextSave = true
      await page.getByRole('button', { name: 'Enregistrer mon score' }).click()
      await expect(page.getByRole('alert')).toContainText("Impossible d'enregistrer")
      await expect(page.locator('.tool-result')).toHaveCount(0)
      await page.getByRole('button', { name: 'Enregistrer mon score' }).click()
      await expect(page.getByRole('heading', { name: 'Score enregistré : 3/3' })).toBeVisible()
      const entry = state.saved.findLast((item) => item.question_id === (slug === 'quiz-orientation' ? 'niveau24_quiz_score' : 'niveau37_skills_quiz_score'))
      assert.equal(entry.answer_text, '3/3 bonnes réponses', 'The last answer must not be counted twice.')
      if (dashboardGamesOnly) {
        await page.getByRole('link', { name: "Retour à l'accueil", exact: true }).click()
      } else {
        await page.getByRole('button', { name: 'Refaire le quiz' }).click()
        await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
      }
    }
  }
}

async function finishScenario(page, state, slug) {
  const order = slug === 'intelligence-emotionnelle' ? [3, 1, 0, 2] : [3, 1, 2, 0]
  for (let index = 0; index < 5; index += 1) {
    await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(index + 1))
    if (await page.locator('.tool-ranking').count()) {
      await expect(page.locator('.tool-rank-label')).toHaveCount(order.length)
      const initialLabels = await page.locator('.tool-rank-label').allTextContents()
      for (let position = 0; position < order.length; position += 1) {
        const target = initialLabels[order[position]]
        let current = (await page.locator('.tool-rank-label').allTextContents()).indexOf(target)
        while (current > position) {
          await page.locator('.tool-rank-item').nth(current).getByRole('button', { name: 'Monter', exact: false }).click()
          current -= 1
        }
        await expect(page.locator('.tool-rank-label').nth(position)).toHaveText(target)
      }
      await page.getByRole('button', { name: "Valider l'ordre" }).click()
      await expect(page.locator('.tool-feedback')).toHaveClass(/is-correct/)
    } else await page.locator('.tool-choice').first().click()
    await expect(page.locator('.tool-feedback')).toBeVisible()
    await expect(page.locator('.tool-choice:not(:disabled)')).toHaveCount(0)
    await page.getByRole('button', { name: index < 4 ? 'Situation suivante' : 'Voir le résultat' }).click()
  }
  await expect(page.getByRole('heading', { name: 'Les cinq situations sont terminées !' })).toBeVisible()
  const save = page.getByRole('button', { name: 'Enregistrer et terminer' })
  state.failNextSave = true
  await save.click()
  await expect(page.getByRole('alert')).toContainText("Impossible d'enregistrer")
  await save.click()
  await expect(page).toHaveURL(`${base}/app`)
  const id = slug === 'intelligence-emotionnelle' ? 'niveau36_adaptability_completed' : 'niveau38_problem_solving_completed'
  assert.equal(JSON.parse(state.saved.findLast((entry) => entry.question_id === id).answer_text).situationsCompleted, 5)
  assert.deepEqual(state.quests, [], 'Standalone tools retain the existing no-level-update policy.')
}

try {
  const viewports = dashboardGamesOnly
    ? [{ width: 1440, height: 900 }, { width: 390, height: 844 }]
    : [{ width: 1920, height: 1080 }, { width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 568 }]
  for (const viewport of viewports) {
    const { context, page, state } = await prepare(viewport, viewport.width === 320 ? 'reduce' : 'no-preference')
    try {
      if (!dashboardGamesOnly) {
        for (const [path, selector] of [
          ['/app', '.dash-greeting-text h1'],
          ['/app/results', '.results-header h1'],
          ['/app/discuter', '.dz-input input'],
          ['/app/emplois', '.zelia-jobs table'],
          ['/app/ecoles-partenaires/ux-fixture', '.formation-detail h1']
        ]) {
          await page.goto(`${base}${path}`)
          await expect(page.locator(selector)).toBeVisible()
          if (path === '/app/results') await expect(page.locator('.results-spinner')).toHaveCount(0)
          if (path === '/app/discuter') {
            const input = page.locator('.dz-input input')
            await input.fill('Comment préparer mon orientation ?')
            await input.press('Enter')
            await expect(input).toHaveValue('')
            await expect(page.locator('.dz-message.user')).toContainText('Comment préparer mon orientation ?')
            const box = await input.boundingBox()
            assert.ok(box && box.y + box.height <= viewport.height, 'Chat composer must remain visible.')
          }
          await assertSharedUX(page)
        }
        await page.goto(`${base}/app/outils`)
        await expect(page.locator('.outils-tile')).toHaveCount(TOOLBOX_ITEMS.length)
        await expect(page.locator('.zelia-topbar-logo img')).toHaveCSS('height', '28px')
        assert.deepEqual(new Set(await page.locator('.outils-tile').evaluateAll((links) => links.map((link) => link.getAttribute('href')))), new Set(TOOLBOX_ITEMS.map((tool) => tool.path)))
        await page.screenshot({ path: join(output, `toolbox-${viewport.width}.png`), fullPage: true })
      }

      for (const tool of tools) {
        if (dashboardGamesOnly) {
          if (page.url() !== `${base}/app`) await page.goto(`${base}/app`)
          await expect(page.locator('.dash-step-marker')).toHaveCount(dashboardToolIds.length)
          await page.locator('.dash-step-marker').nth(dashboardToolIds.indexOf(tool.id)).click()
          await expect(page).toHaveURL(`${base}${tool.path}`)
        } else {
          if (page.url() !== `${base}/app/outils`) {
            await page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Outils', exact: true }).click()
          }
          await page.locator(`.outils-tile[href="${tool.path}"]`).click()
        }
        await expect(page.getByRole('heading', { level: 1, name: tool.title, exact: true })).toBeVisible()
        await expect(page.locator('.tool-header')).toBeInViewport()
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
        await expect(page.locator('.tool-body').locator('button, textarea, table, iframe').first()).toBeVisible()
        if (!dashboardGamesOnly) await assertLayout(page, viewport.width)
        assert.equal(await page.locator('.tool-header-icon svg').count(), 1)
        await expect(page.locator('.tool-back')).toHaveAttribute('href', '/app/outils')
        await expect(page.locator('.tool-header').getByRole('button')).toHaveCount(0)
        if (['quiz-orientation', 'resolution-problemes', 'stress', 'cv'].includes(tool.id)) {
          await page.screenshot({ path: join(output, `${tool.id}-${viewport.width}.png`) })
        }
        if (tool.id === 'quiz-orientation') await answerStatistics(page, state, tool.id, ['B', 'A', 'C'])
        if (tool.id === 'quiz-soft-skills') await answerStatistics(page, state, tool.id, ['A', 'B', 'A'])
        if (['intelligence-emotionnelle', 'resolution-problemes'].includes(tool.id)) await finishScenario(page, state, tool.id)
        if (tool.id === 'videos-orientation') {
          await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
          await page.getByRole('button', { name: 'Valider et continuer', exact: true }).click()
          await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1')
          if (dashboardGamesOnly) {
            for (let index = 1; index < ORIENTATION_VIDEO_ITEMS.length; index += 1) {
              await page.getByRole('button', { name: index < ORIENTATION_VIDEO_ITEMS.length - 1 ? 'Valider et continuer' : 'Valider et terminer', exact: true }).click()
            }
          }
        }
        if (tool.id === 'classement-metiers') {
          const firstTitle = await page.locator('.tool-rank-label').first().textContent()
          await page.locator('.tool-rank-item').first().getByRole('button', { name: 'Descendre', exact: false }).click()
          await expect(page.locator('.tool-rank-label').nth(1)).toHaveText(firstTitle)
          const firstRow = await page.locator('.tool-rank-item').first().boundingBox()
          const nextRow = await page.locator('.tool-rank-item').nth(1).boundingBox()
          assert.ok(firstRow && nextRow)
          const nextSlotDistance = nextRow.y - firstRow.y
          const handle = page.locator('.tool-rank-item').first().getByRole('button', { name: 'Déplacer', exact: false })
          await handle.focus()
          await page.keyboard.press('Space')
          await expect(handle).toHaveAttribute('aria-pressed', 'true')
          await page.evaluate(() => new Promise(requestAnimationFrame))
          await page.keyboard.press('ArrowDown')
          await expect.poll(() => page.locator('.tool-rank-item.is-dragging').evaluate((item) => new DOMMatrix(getComputedStyle(item).transform).m42)).toBeGreaterThanOrEqual(nextSlotDistance - 1)
          await page.evaluate(() => new Promise(requestAnimationFrame))
          await page.keyboard.press('Space')
          await expect(page.locator('.tool-rank-label').first()).toHaveText(firstTitle)
          const first = await page.locator('.tool-rank-label').first().textContent()
          await page.getByRole('button', { name: 'Enregistrer mon classement' }).click()
          await expect(page).toHaveURL(`${base}/app`)
          assert.equal(state.saved.findLast((entry) => entry.question_id === 'niveau18_rank_1').answer_text, first)
        }
        if (tool.id === 'personnalite') {
          for (let index = 0; index < 3; index += 1) {
            await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(index + 1))
            await page.getByRole('button', { name: 'Oui', exact: true }).click()
          }
          await expect(page.getByRole('heading', { name: 'Analyse de personnalité', exact: true })).toBeVisible()
          await expect.poll(() => state.saved.some((entry) => entry.question_id === 'niveau4_personality_completed')).toBe(true)
          if (dashboardGamesOnly) await page.getByRole('button', { name: 'Terminer', exact: true }).click()
        }
        if (tool.id === 'anglais') {
          await page.getByRole('button', { name: 'Évaluer mon niveau' }).click()
          await expect(page.locator('[aria-invalid="true"]')).toHaveCount(11)
          const text = 'I enjoy learning because it helps me understand the world and meet new people. I read interesting books every week. I work on creative projects with my friends. For example, we have been making a small website together. In my opinion this is important for my future career. I would like to travel and learn about different cultures.'
          for (const textarea of await page.locator('.niv5-textarea').all()) await textarea.fill(text)
          await page.getByRole('button', { name: 'Évaluer mon niveau' }).click()
          await expect(page.getByRole('heading', { name: 'Ton résultat', exact: true })).toBeVisible()
          await expect.poll(() => state.saved.some((entry) => entry.question_id === 'niv5_english_level')).toBe(true)
          if (dashboardGamesOnly) await page.getByRole('link', { name: "Retour à l'accueil", exact: true }).click()
        }
        if (tool.id === 'cv') {
          const fields = page.locator('.n17-experience-row')
          await page.getByRole('button', { name: 'Ajouter une ligne', exact: true }).first().click()
          await expect(fields).toHaveCount(2)
          await fields.last().getByRole('button', { name: 'Supprimer cette expérience' }).click()
          await expect(fields).toHaveCount(1)
          if (dashboardGamesOnly) {
            await page.getByRole('button', { name: 'Générer mon CV', exact: true }).click()
            await expect(page.getByRole('button', { name: 'Télécharger en PDF', exact: true })).toBeVisible()
            await page.getByRole('button', { name: 'Terminer', exact: true }).click()
            await expect.poll(() => state.saved.some((entry) => entry.question_id === 'niveau17_cv_data')).toBe(true)
            assert.equal(JSON.parse(state.saved.findLast((entry) => entry.question_id === 'niveau17_cv_data').answer_text).title, 'UX designer')
          }
        }
        if (tool.id === 'axes-amelioration') {
          await page.locator('#axes-heading').locator('..').locator('..').locator('..').getByRole('button').first().click()
          await page.getByRole('button', { name: 'Enregistrer mon plan' }).click()
          await expect(page.getByText('Ton plan est enregistré.', { exact: false })).toBeVisible()
        }
        if (tool.id === 'lettre') {
          await page.getByLabel('Ta cible').fill('UX designer')
          if (dashboardGamesOnly) {
            state.failNextSave = true
            await page.getByRole('button', { name: 'Générer', exact: true }).click()
            await expect(page.getByRole('alert')).toContainText("Impossible de générer ou d'enregistrer")
            await expect(page.getByRole('link', { name: "Retour à l'accueil", exact: true })).toHaveCount(0)
          }
          await page.getByRole('button', { name: 'Générer', exact: true }).click()
          await expect(page.locator('.lettre-result')).toContainText('Madame, Monsieur')
          if (dashboardGamesOnly) {
            await expect.poll(() => state.saved.some((entry) => entry.question_id === 'lettre_generated')).toBe(true)
            await page.getByRole('link', { name: "Retour à l'accueil", exact: true }).click()
          }
        }
        if (tool.id === 'lettre-futur') {
          await page.getByLabel('Ta lettre', { exact: true }).fill('Continue à explorer tes envies et à apprendre de nouvelles choses.')
          await page.getByRole('button', { name: 'Programmer ma lettre' }).click()
          await expect(page.getByRole('heading', { name: 'Ta lettre est programmée' })).toBeVisible()
          if (dashboardGamesOnly) await page.getByRole('link', { name: "Retour à l'accueil", exact: true }).click()
        }
        if (tool.id === 'pitch') {
          await page.getByRole('button', { name: 'Note 8 sur 10', exact: true }).click()
          if (dashboardGamesOnly) {
            state.failNextSave = true
            await page.getByRole('button', { name: 'Enregistrer ma note' }).click()
            await expect(page.getByRole('alert')).toContainText("Impossible d'enregistrer ta note")
            await expect(page.getByRole('link', { name: "Retour à l'accueil", exact: true })).toHaveCount(0)
          }
          await page.getByRole('button', { name: 'Enregistrer ma note' }).click()
          await expect.poll(() => state.saved.findLast((entry) => entry.question_id === 'niveau28_pitch_rating')?.answer_text).toBe('8/10')
          if (dashboardGamesOnly) await page.getByRole('link', { name: "Retour à l'accueil", exact: true }).click()
        }
        if (tool.id === 'entretien') {
          await page.getByLabel('Ta réponse au coach').fill('Mon dernier projet était un site pour mon association.')
          await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
          await expect(page.getByText('Peux-tu me donner un exemple de projet concret ?', { exact: true })).toBeVisible()
          if (dashboardGamesOnly) {
            for (let index = 1; index < 5; index += 1) {
              await page.getByLabel('Ta réponse au coach').fill(`Je souhaite développer mes compétences en communication, exemple ${index}.`)
              await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
            }
            await expect.poll(() => state.saved.findLast((entry) => entry.question_id === 'niveau29_messages_exchanged')?.answer_text).toBe('5 réponse(s) donnée(s)')
            await page.getByRole('link', { name: "Retour à l'accueil", exact: true }).click()
          }
        }
        if (dashboardGamesOnly && tool.id === 'parcoursup') {
          await expect.poll(() => state.saved.some((entry) => entry.question_id === 'niveau26_parcoursup_read')).toBe(true)
          await page.getByRole('link', { name: "Retour à l'accueil", exact: true }).click()
        }
        if (tool.id === 'parcours-etudes') {
          await page.getByRole('button', { name: 'UX designer', exact: true }).click()
          await expect(page.getByText('BTS Communication', { exact: true })).toBeVisible()
          await page.getByRole('button', { name: 'Enregistrer ce parcours', exact: true }).click()
          await expect(page.getByRole('heading', { name: 'Ton parcours est enregistré' })).toBeVisible()
        }
        if (tool.id === 'competences') {
          await expect(page.getByText('Compétences suggérées :')).toBeVisible()
          state.failNextSave = true
          await page.getByRole('button', { name: 'Oui', exact: true }).click()
          await expect(page.getByRole('alert')).toContainText("Impossible d'enregistrer")
          await page.getByRole('button', { name: 'Oui', exact: true }).click()
          await expect(page.getByRole('heading', { name: 'Tes compétences sont enregistrées' })).toBeVisible()
        }
        if (tool.id === 'stress') {
          for (let index = 0; index < 5; index += 1) {
            await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(index + 1))
            await page.locator('.tool-choice').nth(1).click()
          }
          await expect(page.getByRole('button', { name: 'Teste un exercice pour enregistrer' })).toBeDisabled()
          await page.getByRole('button', { name: 'Plan anti-panique', exact: false }).click()
          for (const textarea of await page.locator('.tool-body textarea').all()) await textarea.fill('Je prépare une première action concrète pour mon prochain projet.')
          await page.getByRole('button', { name: 'Valider cet exercice' }).click()
          state.failNextSave = true
          await page.getByRole('button', { name: 'Enregistrer mes exercices' }).click()
          await expect(page.getByRole('alert')).toContainText("Impossible d'enregistrer")
          await page.getByRole('button', { name: 'Enregistrer mes exercices' }).click()
          await expect(page.getByText('Profil et exercices enregistrés.')).toBeVisible()
          const saved = state.saved.findLast((entry) => entry.question_id === 'niveau34_stress_profile')
          assert.ok(JSON.parse(saved.answer_text).completedExercises.includes('pressure-plan'))
        }
        if (tool.id === 'feedback') {
          await page.getByLabel('Outil préféré').fill('Quiz orientation')
          await page.getByLabel('Ce que tu aimerais revoir').fill('Davantage de mises en situation.')
          await page.getByLabel('Note globale').selectOption('5')
          await page.getByRole('button', { name: 'Envoyer mon retour' }).click()
          await expect(page.getByRole('heading', { name: 'Merci pour ton retour !' })).toBeVisible()
        }
        if (dashboardGamesOnly) {
          await expect(page).toHaveURL(`${base}/app`)
          await expect(page.locator('.dash-step').nth(dashboardToolIds.indexOf(tool.id))).toHaveClass(/is-done/)
          assert.deepEqual(state.quests, [], 'Dashboard games must not advance legacy levels.')
        }
        assert.deepEqual(state.errors, [], `${tool.id}: browser errors`)
        console.log(`${viewport.width}px ${tool.id}: ${dashboardGamesOnly ? 'dashboard launch, completion saved and return home' : 'shared header, aligned content and responsive layout'} verified.`)
      }
      if (dashboardGamesOnly) {
        await expect(page.locator('.dash-step.is-done')).toHaveCount(dashboardToolIds.length)
      } else {
        await page.goto(`${base}/app/niveau/38`)
        await expect(page).toHaveURL(`${base}/app/outils/resolution-problemes`)
        await page.locator('.tool-back').click()
        await expect(page).toHaveURL(`${base}/app/outils`)
        await expect(page.locator('.outils-completed').first()).toBeVisible()
      }
    } catch (error) {
      console.error(`Verification failed on ${page.url()}`, state.errors)
      await page.screenshot({ path: join(output, `failure-${viewport.width}.png`), fullPage: true })
      throw error
    } finally {
      await context.close()
    }
  }
  console.log(`All ${tools.length} ${dashboardGamesOnly ? 'dashboard games, persistence/retries and returns home' : 'tool pages, games, persistence/retries and legacy routing'} verified. Screenshots: ${output}`)
} finally {
  await browser.close()
}
