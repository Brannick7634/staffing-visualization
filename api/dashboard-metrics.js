import { fetchDashboardMetrics, computeDashboardMetrics, storeDashboardMetrics, markDashboardRecomputing } from './_lib/airtableServer.js'
import { isAdminRequest, optionalSession, toPublicDashboardMetrics } from './_lib/security.js'

export function createDashboardMetricsHandler(deps = { fetchDashboardMetrics, computeDashboardMetrics, storeDashboardMetrics, markDashboardRecomputing }) {
  async function recompute(res) {
    try {
      await deps.markDashboardRecomputing(true)
      const metrics = await deps.computeDashboardMetrics()
      const stored = await deps.storeDashboardMetrics(metrics)
      await deps.markDashboardRecomputing(false)
      return res.status(200).json({ ok: true, stored, computedAt: metrics?.computedAt })
    } catch (error) {
      await deps.markDashboardRecomputing(false)
      return res.status(500).json({ error: 'Failed to recompute dashboard metrics' })
    }
  }

  return async function handler(req, res) {
    // Recompute (deletes + recreates cache rows): server secret only.
    // POST with x-admin-token / Bearer ADMIN_API_TOKEN, or Vercel Cron GET ?recompute=1.
    const wantsRecompute = req.method === 'POST' || (req.method === 'GET' && req.query?.recompute)
    if (wantsRecompute) {
      if (!isAdminRequest(req)) return res.status(401).json({ error: 'Unauthorized' })
      return recompute(res)
    }
    if (req.method === 'GET') {
      try {
        const metrics = await deps.fetchDashboardMetrics()
        // Signed-in users get full firm-level rows; anonymous visitors get aggregates.
        const full = optionalSession(req)
        return res.status(200).json({ metrics: full ? metrics : toPublicDashboardMetrics(metrics) })
      } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch dashboard metrics' })
      }
    }
    return res.status(405).json({ error: 'Method not allowed' })
  }
}

export default createDashboardMetricsHandler()
