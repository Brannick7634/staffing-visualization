import { updateUserProfile } from './_lib/airtableServer.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { userId, updates } = req.body || {}
    const result = await updateUserProfile(userId, updates)
    res.status(200).json(result)
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to update profile. Please try again.' })
  }
}
