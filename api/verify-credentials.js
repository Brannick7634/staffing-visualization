import { verifyCredentials } from './_lib/airtableServer.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const { email, password } = req.body || {}
    const result = await verifyCredentials(email, password)
    res.status(200).json(result)
  } catch (error) {
    res.status(500).json({ success: false, error: 'Authentication failed' })
  }
}
