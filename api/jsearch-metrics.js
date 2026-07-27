// Serverless endpoint for the JSearch-based Market Intelligence page.
// Aggregates ONLY — market/segment/role dimensions. Firm-level detail is
// intentionally excluded here; that stays internal (Airtable Job Signals /
// Company Details), matching the existing Job Signals feature's same
// "no individual firm names to end users" boundary.
import pg from 'pg'

const { Pool } = pg
let pool
function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  }
  return pool
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const client = await getPool().connect()
  try {
    const summary = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM company_identity) AS companies_tracked,
        (SELECT COUNT(DISTINCT shared_company_id) FROM canonical_jobs WHERE active_status = 1) AS companies_active,
        (SELECT COUNT(*) FROM canonical_jobs WHERE active_status = 1) AS active_jobs,
        (SELECT COUNT(*) FROM canonical_jobs WHERE active_status = 1 AND (salary_min IS NOT NULL OR salary_max IS NOT NULL)) AS jobs_with_salary,
        (SELECT MAX(rollup_date) FROM trend_rollups) AS last_rollup_date
    `)

    const latestDateRow = await client.query(`SELECT MAX(rollup_date) AS d FROM trend_rollups`)
    const latestDate = latestDateRow.rows[0]?.d

    const dimensionRows = async (dimension) => {
      const result = await client.query(
        `SELECT key, active_jobs, new_jobs_30d, change_pct, firm_count, detail
         FROM trend_rollups WHERE rollup_date = $1 AND dimension = $2
         ORDER BY active_jobs DESC LIMIT 10`,
        [latestDate, dimension]
      )
      return result.rows
    }

    const [markets, segments, roles] = await Promise.all([
      dimensionRows('market'),
      dimensionRows('segment'),
      dimensionRows('role_family'),
    ])

    // Signal count only — no company names, no signal detail. That level of
    // specificity is Marketing Machine / Airtable territory, not this page.
    const signalCount = await client.query(
      `SELECT COUNT(*) AS n FROM signal_events WHERE signal_date >= (CURRENT_DATE - INTERVAL '30 days')`
    )

    res.status(200).json({
      summary: summary.rows[0],
      signalCount30d: parseInt(signalCount.rows[0]?.n || '0', 10),
      markets,
      segments,
      roles,
      asOf: latestDate,
    })
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch market intelligence data', detail: error.message })
  } finally {
    client.release()
  }
}
