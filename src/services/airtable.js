import Airtable from 'airtable'
import bcrypt from 'bcryptjs'
const base = new Airtable({
  apiKey: import.meta.env.VITE_AIRTABLE_API_KEY,
}).base(import.meta.env.VITE_AIRTABLE_BASE_ID)
const COMPANY_TABLE = import.meta.env.VITE_AIRTABLE_COMPANY_TABLE || 'Company Details'
const COMPANY_VIEW_ID = import.meta.env.VITE_AIRTABLE_COMPANY_VIEW || 'Grid view'
export async function fetchFirms() {
  try {
    const records = await base(COMPANY_TABLE).select({
      view: COMPANY_VIEW_ID,
      fields: [
        'Primary Segment',
        'HQ State Abbr',
        'HQ location',
        'company City',
        '# EE Count',
        'Employee Size Bucket',
        'Average Tenure',
        'Tenure Bucket',
        '6M Growth',
        '1Y Growth',
        '2Y Growth',
        'Growth_1Y_Value',
        'Growth_6M_Value',
        'Growth_2Y_Value'
    ],
    filterByFormula: `AND(
      {Primary Segment} != "",
      {HQ location} != "",
      {company City} != "",
      {Employee Size Bucket} != "",
      {Growth_1Y_Value} <= 10000,
      {Growth_6M_Value} <= 10000,
      {Growth_2Y_Value} <= 10000
    )`
  }).all()
  const allFirms = records.map((record) => ({
      id: record.id,
      primarySegment: record.get('Primary Segment') || '',
      hqStateAbbr: record.get('HQ State Abbr') || '',
      hqLocation: record.get('HQ location') || '',
      companyCity: record.get('company City') || '',
      eeCount: record.get('# EE Count') || 0,
      employeeSizeBucket: record.get('Employee Size Bucket') || '',
      averageTenure: record.get('Average Tenure') || 0,
      tenureBucket: record.get('Tenure Bucket') || '',
      growth6M: record.get('6M Growth') || '0%',
      growth1Y: record.get('1Y Growth') || '0%',
      growth2Y: record.get('2Y Growth') || '0%',
      growth1YValue: record.get('Growth_1Y_Value') || 0,
      growth6MValue: record.get('Growth_6M_Value') || 0,
      growth2YValue: record.get('Growth_2Y_Value') || 0,
    }))
    return allFirms
  } catch (error) {
    return []
  }
}
export async function fetchProtectedFirms(user) {
  try {
    let baseConditions = [
      '{Primary Segment} != ""',
      '{HQ location} != ""',
      '{company City} != ""',
      '{Employee Size Bucket} != ""',
      '{Growth_1Y_Value} <= 10000',
      '{Growth_6M_Value} <= 10000',
      '{Growth_2Y_Value} <= 10000'
    ]
    if (user?.primarySegment) {
      const cleanSegment = String(user.primarySegment).trim()
      baseConditions.push(`{Primary Segment} = "${cleanSegment}"`)
    }
    const filterFormula = `AND(${baseConditions.join(', ')})`
    const records = await base(COMPANY_TABLE).select({
      view: COMPANY_VIEW_ID,
      fields: [
        'Primary Segment',
        'HQ State Abbr',
        'HQ location',
        'company City',
        '# EE Count',
        'Employee Size Bucket',
        'Average Tenure',
        'Tenure Bucket',
        '6M Growth',
        '1Y Growth',
        '2Y Growth',
        'Growth_1Y_Value',
        'Growth_6M_Value',
        'Growth_2Y_Value'
      ],
      filterByFormula: filterFormula
    }).all()
    const firms = records.map((record) => ({
      id: record.id,
      primarySegment: record.get('Primary Segment') || '',
      hqStateAbbr: record.get('HQ State Abbr') || '',
      hqLocation: record.get('HQ location') || '',
      companyCity: record.get('company City') || '',
      eeCount: record.get('# EE Count') || 0,
      employeeSizeBucket: record.get('Employee Size Bucket') || '',
      averageTenure: record.get('Average Tenure') || 0,
      tenureBucket: record.get('Tenure Bucket') || '',
      growth6M: record.get('6M Growth') || '0%',
      growth1Y: record.get('1Y Growth') || '0%',
      growth2Y: record.get('2Y Growth') || '0%',
      growth1YValue: record.get('Growth_1Y_Value') || 0,
      growth6MValue: record.get('Growth_6M_Value') || 0,
      growth2YValue: record.get('Growth_2Y_Value') || 0,
    }))
    return firms
  } catch (error) {
    return []
  }
}
export async function submitLeadRequest(formData) {
  try {
    const existingRecords = await base('Staffing Signal Leads Table (Test)').select({
      filterByFormula: `{Email} = '${formData.email}'`,
      maxRecords: 1
    }).firstPage()
    if (existingRecords.length > 0) {
      return { 
        success: false, 
        error: 'An account with this email address already exists. Please use a different email or try logging in.' 
      }
    }
    const hashedPassword = await bcrypt.hash(formData.password, 10)
    const record = await base('Staffing Signal Leads Table (Test)').create([
      {
        fields: {
          'First Name': formData.firstName,
          'Email': formData.email,
          'Password': hashedPassword,
          'Employee Band Size': formData.employeeBandSize,
          'HQ State': formData.hqState,
          'Primary Segment': formData.primarySegment,
          'Internal Employee Headcount Growth': formData.internalHeadcountGrowth,
        },
      },
    ])
    return { success: true, record }
  } catch (error) {
    return { success: false, error: 'Registration failed. Please try again.' }
  }
}
export async function verifyCredentials(email, password) {
  try {
    const records = await base('Staffing Signal Leads Table (Test)').select({
      filterByFormula: `{Email} = '${email}'`,
      maxRecords: 1
    }).firstPage()
    if (records.length === 0) {
      return { success: false, error: 'User not found' }
    }
    const user = records[0]
    const storedHashedPassword = user.get('Password')
    const passwordMatch = await bcrypt.compare(password, storedHashedPassword)
    if (passwordMatch) {
      return {
        success: true,
        user: {
          id: user.id,
          firstName: user.get('First Name'),
          email: user.get('Email'),
          employeeBandSize: user.get('Employee Band Size'),
          hqState: user.get('HQ State'),
          primarySegment: user.get('Primary Segment'),
          internalHeadcountGrowth: user.get('Internal Employee Headcount Growth')
        }
      }
    } else {
      return { success: false, error: 'Invalid password' }
    }
  } catch (error) {
    return { success: false, error: 'Authentication failed' }
  }
}
export function isAirtableConfigured() {
  return !!(
    import.meta.env.VITE_AIRTABLE_API_KEY &&
    import.meta.env.VITE_AIRTABLE_BASE_ID
  )
}
export function getViewId() {
  return COMPANY_VIEW_ID
}
