import { validatePatch, invalid } from '../utils/adminInput.js'
import { findKnownSchoolName } from '../utils/schoolNames.js'

const fields = ['email', 'schoolName', 'contactFirstName', 'contactLastName']

export function createSchoolRegistrationHandler({ db }) {
  return async (req, res) => {
    if (!db) {
      return res.status(503).json({ error: 'Le service d\'inscription est indisponible. Merci de réessayer plus tard.' })
    }

    try {
      const form = validatePatch(req.body, fields, fields)
      const schoolName = await findKnownSchoolName(db, form.schoolName)
      if (!schoolName) {
        throw invalid('Établissement introuvable dans notre base. Merci de sélectionner un établissement dans la liste proposée.')
      }

      const { error } = await db.from('school_registration_requests').insert({
        school_name: schoolName,
        email: form.email.toLowerCase(),
        contact_first_name: form.contactFirstName,
        contact_last_name: form.contactLastName
      })
      if (error) throw error

      res.status(201).json({
        message: 'Votre demande d\'inscription a bien été reçue. Nous vous recontacterons dans les 2 jours ouvrés.'
      })
    } catch (error) {
      if (error.status === 400) return res.status(400).json({ error: error.message })
      console.error('POST /school-portal/register error:', error)
      res.status(503).json({ error: 'Impossible d\'enregistrer votre demande. Merci de réessayer plus tard.' })
    }
  }
}
