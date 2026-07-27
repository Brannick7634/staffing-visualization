import { verifyCredentials } from './_lib/airtableServer.js'
import { signSession } from './_lib/auth.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { email, password } = req.body || {}
    const result = await verifyCredentials(email, password)
    if (result.success) {
      const token = signSession({ userId: result.user.id, email: result.user.email })
      return res.status(200).json({ ...result, token })
    }
    res.status(200).json(result)
  } catch (error) {
    res.status(500).json({ success: false, error: 'Authentication failed' })
  }
}
