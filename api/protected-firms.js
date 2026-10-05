import { fetchProtectedFirms, fetchUserSegment } from './_lib/airtableServer.js'
import { requireAuth } from './_lib/auth.js'

export function createProtectedFirmsHandler(deps = { fetchProtectedFirms, fetchUserSegment }) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const session = requireAuth(req, res)
    if (!session) return
    try {
      // Segment comes from the signed-in user's own record; any segment in the
      // request body is ignored.
      const segment = await deps.fetchUserSegment(session.userId)
      const firms = await deps.fetchProtectedFirms(segment)
      res.status(200).json({ firms })
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch protected firms' })
    }
  }
}

export default createProtectedFirmsHandler()
