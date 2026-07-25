import { fetchJobSignalsCache, storeJobSignalsCache, computeJobSignalsMetricsLive } from './_lib/airtableServer.js'
import { computeJobSignalsMetrics } from '../src/utils/jobSignalsCompute.js'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const metrics = await fetchJobSignalsCache()
      return res.status(200).json({ metrics })
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch job signals cache' })
    }
  }
  if (req.method === 'POST') {
    try {
      const metrics = await computeJobSignalsMetricsLive(computeJobSignalsMetrics)
      const stored = await storeJobSignalsCache(metrics)
      return res.status(200).json({ metrics, stored })
    } catch (error) {
      return res.status(500).json({ error: 'Failed to compute job signals' })
    }
  }
  return res.status(405).json({ error: 'Method not allowed' })
}
