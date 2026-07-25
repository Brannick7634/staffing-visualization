import { submitLeadRequest } from './_lib/airtableServer.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const result = await submitLeadRequest(req.body || {})
    res.status(200).json(result)
  } catch (error) {
    res.status(500).json({ success: false, error: 'Registration failed. Please try again.' })
  }
}
