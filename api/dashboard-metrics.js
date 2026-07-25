import { fetchDashboardMetrics, computeDashboardMetrics, storeDashboardMetrics, markDashboardRecomputing } from './_lib/airtableServer.js'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const metrics = await fetchDashboardMetrics()
      return res.status(200).json({ metrics })
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch dashboard metrics' })
    }
  }
  if (req.method === 'POST') {
    try {
      await markDashboardRecomputing(true)
      const metrics = await computeDashboardMetrics()
      const stored = await storeDashboardMetrics(metrics)
      await markDashboardRecomputing(false)
      return res.status(200).json({ metrics, stored })
    } catch (error) {
      await markDashboardRecomputing(false)
      return res.status(500).json({ error: 'Failed to recompute dashboard metrics' })
    }
  }
  return res.status(405).json({ error: 'Method not allowed' })
}
