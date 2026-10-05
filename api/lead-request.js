import { submitLeadRequest } from './_lib/airtableServer.js'
import { rateLimit } from './_lib/security.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!rateLimit(req, res, { key: 'signup', limit: 5, windowMs: 10 * 60_000 })) return
  try {
    const result = await submitLeadRequest(req.body || {})
    res.status(200).json(result)
  } catch (error) {
    res.status(500).json({ success: false, error: 'Registration failed. Please try again.' })
  }
}
