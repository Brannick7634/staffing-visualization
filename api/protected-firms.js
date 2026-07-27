import { fetchProtectedFirms } from './_lib/airtableServer.js'
import { requireAuth } from './_lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!requireAuth(req, res)) return
  try {
    const { user } = req.body || {}
    const firms = await fetchProtectedFirms(user)
    res.status(200).json({ firms })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch protected firms' })
  }
}
