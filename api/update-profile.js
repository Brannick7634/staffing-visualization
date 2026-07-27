import { updateUserProfile } from './_lib/airtableServer.js'
import { requireAuth } from './_lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const session = requireAuth(req, res)
  if (!session) return
  try {
    const { updates } = req.body || {}
    const result = await updateUserProfile(session.userId, updates)
    res.status(200).json(result)
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update profile. Please try again.' })
  }
}
