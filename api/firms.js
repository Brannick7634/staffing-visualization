import { fetchFirms } from './_lib/airtableServer.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  try {
    const firms = await fetchFirms()
    res.status(200).json({ firms })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch firms' })
  }
}
