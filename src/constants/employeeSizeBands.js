// Employee size band constants
// These values must match what's stored in Airtable's "Employee Size Bucket" field

export const EMPLOYEE_SIZE_BANDS = [
  '1-5',
  '6-10',
  '11-20',
  '21-50',
  '51-100',
  '101-250',
  '251-500',
  '501-1000',
  '>1000'
]

// Normalize employee size value (in case of variations)
export const normalizeEmployeeSize = (size) => {
  if (!size) return ''
  
  // Handle common variations
  const normalized = String(size).trim()
  
  // Map from user format to database format
  const sizeMap = {
    '1-5': '1-5',
    '6-10': '6-10',
    '11-20': '11-20',
    '21-50': '21-50',
    '51-100': '51-100',
    '101-250': '101-250',
    '251-500': '251-500',
    '501-1000': '501-1000',
    '>1000': '>1000',
    // Handle potential variations
    '> 1000': '>1000',
    '>1,000': '>1000',
    '1000+': '>1000'
  }
  
  return sizeMap[normalized] || normalized
}

// Validate if a size band is valid
export const isValidEmployeeSizeBand = (size) => {
  return EMPLOYEE_SIZE_BANDS.includes(normalizeEmployeeSize(size))
}
