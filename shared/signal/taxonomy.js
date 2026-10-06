// Preview grouping of sectors and job titles for The Staffing Signal preview.
//
// This is a PREVIEW grouping, not the canonical database taxonomy. Role keys
// for the five roles with supplied national examples match the supplied
// fixture's proposed_role_key values exactly. Which roles actually have a
// benchmark is data, so it comes from the API (snapshot.nationalPay), not from
// this file. Broad posting families (e.g. Accounting/Finance) are NOT roles.
//
// Browser-safe (no node: imports).

export const TAXONOMY_NOTE = 'Preview grouping, not the canonical database taxonomy.'

function freezeAll(items) {
  return Object.freeze(items.map((item) => Object.freeze(item)))
}

export const SECTORS = freezeAll([
  { key: 'healthcare', label: 'Healthcare' },
  { key: 'light-industrial', label: 'Light Industrial' },
  { key: 'construction', label: 'Construction' },
  { key: 'skilled-trades', label: 'Skilled Trades' },
  { key: 'transportation', label: 'Transportation & Logistics' },
  { key: 'hospitality', label: 'Hospitality' },
  { key: 'it', label: 'IT' },
  {
    key: 'professional',
    label: 'Professional',
    familiesNote: 'Broad posting families observed include Accounting/Finance, Administrative/Clerical, Marketing, Sales and Project Coordinator/Manager (families, not job titles; counts not supplied).'
  }
])

const RN = 'registered-nurse'

// Each role: { key, label, sectorKey, group?, specialtyOf?, kind:'title' }.
// Nurse specialties are explicit roles; an ICU role is never inferred from a
// generic Registered Nurse posting. Every role here had a publishable
// nationwide pay cell when added (>= 3 firms, no firm > 50%), except
// diesel-mechanic, which has data but is currently withheld by that rule.
// `group` (Healthcare only) becomes an <optgroup> in the job dropdown.
// Display order (rolesForSector): ROLE_GROUPS order, Registered Nurse first,
// then alphabetical by label.
export const ROLE_GROUPS = Object.freeze(['Nursing', 'Physicians & pharmacy', 'Imaging & lab', 'Therapy & rehab', 'Clinical support', 'Behavioral health'])

export const ROLES = freezeAll([
  { key: RN, label: 'Registered Nurse', sectorKey: 'healthcare', group: 'Nursing', kind: 'title' },
  { key: 'icu-registered-nurse', label: 'ICU Registered Nurse', sectorKey: 'healthcare', group: 'Nursing', specialtyOf: RN, kind: 'title' },
  { key: 'or-nurse', label: 'OR Nurse', sectorKey: 'healthcare', group: 'Nursing', specialtyOf: RN, kind: 'title' },
  { key: 'er-nurse', label: 'ER Nurse', sectorKey: 'healthcare', group: 'Nursing', specialtyOf: RN, kind: 'title' },
  { key: 'med-surg-nurse', label: 'Med-Surg Nurse', sectorKey: 'healthcare', group: 'Nursing', specialtyOf: RN, kind: 'title' },
  { key: 'telemetry-nurse', label: 'Telemetry Nurse', sectorKey: 'healthcare', group: 'Nursing', specialtyOf: RN, kind: 'title' },
  { key: 'home-health-nurse', label: 'Home Health Nurse', sectorKey: 'healthcare', group: 'Nursing', specialtyOf: RN, kind: 'title' },
  { key: 'long-term-care-nurse', label: 'Long-Term Care Nurse', sectorKey: 'healthcare', group: 'Nursing', specialtyOf: RN, kind: 'title' },
  { key: 'pacu-nurse', label: 'PACU Nurse', sectorKey: 'healthcare', group: 'Nursing', specialtyOf: RN, kind: 'title' },
  { key: 'cath-lab-nurse', label: 'Cath Lab Nurse', sectorKey: 'healthcare', group: 'Nursing', specialtyOf: RN, kind: 'title' },
  { key: 'oncology-nurse', label: 'Oncology Nurse', sectorKey: 'healthcare', group: 'Nursing', specialtyOf: RN, kind: 'title' },
  { key: 'nurse-case-manager', label: 'Nurse Case Manager', sectorKey: 'healthcare', group: 'Nursing', specialtyOf: RN, kind: 'title' },
  { key: 'lpn-lvn', label: 'LPN / LVN', sectorKey: 'healthcare', group: 'Nursing', kind: 'title' },
  { key: 'cna', label: 'CNA (Certified Nursing Assistant)', sectorKey: 'healthcare', group: 'Nursing', kind: 'title' },
  { key: 'nurse-practitioner', label: 'Nurse Practitioner', sectorKey: 'healthcare', group: 'Nursing', kind: 'title' },
  { key: 'crna', label: 'CRNA (Nurse Anesthetist)', sectorKey: 'healthcare', group: 'Nursing', kind: 'title' },
  { key: 'physician', label: 'Physician', sectorKey: 'healthcare', group: 'Physicians & pharmacy', kind: 'title' },
  { key: 'physician-assistant', label: 'Physician Assistant', sectorKey: 'healthcare', group: 'Physicians & pharmacy', kind: 'title' },
  { key: 'pharmacist', label: 'Pharmacist', sectorKey: 'healthcare', group: 'Physicians & pharmacy', kind: 'title' },
  { key: 'pharmacy-technician', label: 'Pharmacy Technician', sectorKey: 'healthcare', group: 'Physicians & pharmacy', kind: 'title' },
  { key: 'radiologic-technologist', label: 'Radiologic Technologist (X-Ray)', sectorKey: 'healthcare', group: 'Imaging & lab', kind: 'title' },
  { key: 'ct-technologist', label: 'CT Technologist', sectorKey: 'healthcare', group: 'Imaging & lab', kind: 'title' },
  { key: 'mri-technologist', label: 'MRI Technologist', sectorKey: 'healthcare', group: 'Imaging & lab', kind: 'title' },
  { key: 'ultrasound-technologist', label: 'Ultrasound Technologist / Sonographer', sectorKey: 'healthcare', group: 'Imaging & lab', kind: 'title' },
  { key: 'medical-lab-technologist', label: 'Medical Lab Technologist', sectorKey: 'healthcare', group: 'Imaging & lab', kind: 'title' },
  { key: 'phlebotomist', label: 'Phlebotomist', sectorKey: 'healthcare', group: 'Imaging & lab', kind: 'title' },
  { key: 'physical-therapist', label: 'Physical Therapist', sectorKey: 'healthcare', group: 'Therapy & rehab', kind: 'title' },
  { key: 'physical-therapist-assistant', label: 'Physical Therapist Assistant', sectorKey: 'healthcare', group: 'Therapy & rehab', kind: 'title' },
  { key: 'occupational-therapist', label: 'Occupational Therapist', sectorKey: 'healthcare', group: 'Therapy & rehab', kind: 'title' },
  { key: 'occupational-therapy-assistant', label: 'Occupational Therapy Assistant', sectorKey: 'healthcare', group: 'Therapy & rehab', kind: 'title' },
  { key: 'speech-language-pathologist', label: 'Speech-Language Pathologist', sectorKey: 'healthcare', group: 'Therapy & rehab', kind: 'title' },
  { key: 'respiratory-therapist', label: 'Respiratory Therapist', sectorKey: 'healthcare', group: 'Therapy & rehab', kind: 'title' },
  { key: 'surgical-technologist', label: 'Surgical Technologist', sectorKey: 'healthcare', group: 'Clinical support', kind: 'title' },
  { key: 'sterile-processing-tech', label: 'Sterile Processing Technician', sectorKey: 'healthcare', group: 'Clinical support', kind: 'title' },
  { key: 'medical-assistant', label: 'Medical Assistant', sectorKey: 'healthcare', group: 'Clinical support', kind: 'title' },
  { key: 'dental-hygienist', label: 'Dental Hygienist', sectorKey: 'healthcare', group: 'Clinical support', kind: 'title' },
  { key: 'medical-biller-coder', label: 'Medical Biller / Coder', sectorKey: 'healthcare', group: 'Clinical support', kind: 'title' },
  { key: 'school-psychologist', label: 'School Psychologist', sectorKey: 'healthcare', group: 'Behavioral health', kind: 'title' },
  { key: 'bcba', label: 'BCBA (Behavior Analyst)', sectorKey: 'healthcare', group: 'Behavioral health', kind: 'title' },
  { key: 'behavior-technician', label: 'Behavior Technician (RBT)', sectorKey: 'healthcare', group: 'Behavioral health', kind: 'title' },
  { key: 'social-worker', label: 'Social Worker', sectorKey: 'healthcare', group: 'Behavioral health', kind: 'title' },
  { key: 'mental-health-therapist', label: 'Mental Health Therapist / Counselor', sectorKey: 'healthcare', group: 'Behavioral health', kind: 'title' },
  { key: 'warehouse-associate', label: 'Warehouse Associate', sectorKey: 'light-industrial', kind: 'title' },
  { key: 'forklift-operator', label: 'Forklift Operator', sectorKey: 'light-industrial', kind: 'title' },
  { key: 'cnc-machinist', label: 'CNC Machinist', sectorKey: 'light-industrial', kind: 'title' },
  { key: 'assembler', label: 'Assembler / Production Worker', sectorKey: 'light-industrial', kind: 'title' },
  { key: 'machine-operator', label: 'Machine Operator', sectorKey: 'light-industrial', kind: 'title' },
  { key: 'quality-inspector', label: 'Quality Inspector', sectorKey: 'light-industrial', kind: 'title' },
  { key: 'packer', label: 'Packer / Packaging Operator', sectorKey: 'light-industrial', kind: 'title' },
  { key: 'janitor', label: 'Janitor / Sanitation Worker', sectorKey: 'light-industrial', kind: 'title' },
  { key: 'general-laborer', label: 'General Laborer', sectorKey: 'construction', kind: 'title' },
  { key: 'carpenter', label: 'Carpenter', sectorKey: 'construction', kind: 'title' },
  { key: 'heavy-equipment-operator', label: 'Heavy Equipment Operator', sectorKey: 'construction', kind: 'title' },
  { key: 'concrete-finisher', label: 'Concrete Finisher', sectorKey: 'construction', kind: 'title' },
  { key: 'construction-superintendent', label: 'Construction Superintendent', sectorKey: 'construction', kind: 'title' },
  { key: 'safety-specialist', label: 'Safety Specialist', sectorKey: 'construction', kind: 'title' },
  { key: 'landscaper', label: 'Landscaper / Groundskeeper', sectorKey: 'construction', kind: 'title' },
  { key: 'electrician', label: 'Electrician', sectorKey: 'skilled-trades', kind: 'title' },
  { key: 'welder', label: 'Welder', sectorKey: 'skilled-trades', kind: 'title' },
  { key: 'plumber', label: 'Plumber', sectorKey: 'skilled-trades', kind: 'title' },
  { key: 'hvac-technician', label: 'HVAC Technician', sectorKey: 'skilled-trades', kind: 'title' },
  { key: 'maintenance-technician', label: 'Maintenance Technician', sectorKey: 'skilled-trades', kind: 'title' },
  { key: 'industrial-mechanic', label: 'Industrial Mechanic', sectorKey: 'skilled-trades', kind: 'title' },
  { key: 'field-service-technician', label: 'Field Service Technician', sectorKey: 'skilled-trades', kind: 'title' },
  { key: 'low-voltage-technician', label: 'Low Voltage / Cable Technician', sectorKey: 'skilled-trades', kind: 'title' },
  { key: 'cdl-class-a-driver', label: 'CDL Class A Driver', sectorKey: 'transportation', kind: 'title' },
  { key: 'delivery-driver', label: 'Delivery Driver', sectorKey: 'transportation', kind: 'title' },
  { key: 'dispatcher', label: 'Dispatcher', sectorKey: 'transportation', kind: 'title' },
  { key: 'diesel-mechanic', label: 'Diesel Mechanic', sectorKey: 'transportation', kind: 'title' },
  { key: 'logistics-coordinator', label: 'Logistics Coordinator', sectorKey: 'transportation', kind: 'title' },
  { key: 'supply-chain-analyst', label: 'Supply Chain Analyst', sectorKey: 'transportation', kind: 'title' },
  { key: 'line-cook', label: 'Line Cook', sectorKey: 'hospitality', kind: 'title' },
  { key: 'server', label: 'Server', sectorKey: 'hospitality', kind: 'title' },
  { key: 'housekeeper', label: 'Housekeeper', sectorKey: 'hospitality', kind: 'title' },
  { key: 'banquet-staff', label: 'Banquet Staff', sectorKey: 'hospitality', kind: 'title' },
  { key: 'software-engineer', label: 'Software Engineer', sectorKey: 'it', kind: 'title' },
  { key: 'data-engineer-analyst', label: 'Data Engineer / Analyst', sectorKey: 'it', kind: 'title' },
  { key: 'devops-cloud-engineer', label: 'DevOps / Cloud Engineer', sectorKey: 'it', kind: 'title' },
  { key: 'systems-network-administrator', label: 'Systems / Network Administrator', sectorKey: 'it', kind: 'title' },
  { key: 'help-desk-technician', label: 'Help Desk / Desktop Support', sectorKey: 'it', kind: 'title' },
  { key: 'qa-test-engineer', label: 'QA / Test Engineer', sectorKey: 'it', kind: 'title' },
  { key: 'cybersecurity-analyst', label: 'Cybersecurity Analyst / Engineer', sectorKey: 'it', kind: 'title' },
  { key: 'it-project-manager', label: 'IT Project Manager', sectorKey: 'it', kind: 'title' },
  { key: 'database-administrator', label: 'Database Administrator', sectorKey: 'it', kind: 'title' },
  { key: 'business-analyst', label: 'Business Analyst', sectorKey: 'it', kind: 'title' },
  { key: 'recruiter', label: 'Recruiter', sectorKey: 'professional', kind: 'title' },
  { key: 'attorney', label: 'Attorney', sectorKey: 'professional', kind: 'title' },
  { key: 'administrative-assistant', label: 'Administrative Assistant', sectorKey: 'professional', kind: 'title' },
  { key: 'executive-assistant', label: 'Executive Assistant', sectorKey: 'professional', kind: 'title' },
  { key: 'customer-service-rep', label: 'Customer Service Representative', sectorKey: 'professional', kind: 'title' },
  { key: 'accountant', label: 'Accountant', sectorKey: 'professional', kind: 'title' },
  { key: 'payroll-specialist', label: 'Payroll Specialist', sectorKey: 'professional', kind: 'title' },
  { key: 'accounts-payable-receivable', label: 'Accounts Payable / Receivable Specialist', sectorKey: 'professional', kind: 'title' },
  { key: 'paralegal', label: 'Paralegal', sectorKey: 'professional', kind: 'title' },
  { key: 'hr-generalist', label: 'HR Generalist / Coordinator', sectorKey: 'professional', kind: 'title' },
  { key: 'receptionist', label: 'Receptionist', sectorKey: 'professional', kind: 'title' },
  { key: 'data-entry-clerk', label: 'Data Entry Clerk', sectorKey: 'professional', kind: 'title' },
  { key: 'financial-analyst', label: 'Financial Analyst', sectorKey: 'professional', kind: 'title' },
  { key: 'bookkeeper', label: 'Bookkeeper', sectorKey: 'professional', kind: 'title' }
])

const SECTOR_INDEX = new Map(SECTORS.map((sector) => [sector.key, sector]))
const ROLE_INDEX = new Map(ROLES.map((role) => [role.key, role]))

export function sectorByKey(sectorKey) {
  return SECTOR_INDEX.get(sectorKey) || null
}

export function roleByKey(roleKey) {
  return ROLE_INDEX.get(roleKey) || null
}

// Roles in a sector, in display order (see the ROLES comment). Unknown sector -> [].
export function rolesForSector(sectorKey) {
  const groupIndex = (role) => (role.group ? ROLE_GROUPS.indexOf(role.group) : -1)
  return ROLES.filter((role) => role.sectorKey === sectorKey).sort((a, b) =>
    groupIndex(a) - groupIndex(b) ||
    (b.key === RN) - (a.key === RN) ||
    a.label.localeCompare(b.label, 'en')
  )
}

// The sector object a role belongs to, or null for an unknown role.
export function sectorForRole(roleKey) {
  const role = roleByKey(roleKey)
  return role ? sectorByKey(role.sectorKey) : null
}

export const EXAMPLE_ROLES = Object.freeze(['icu-registered-nurse', 'software-engineer', 'warehouse-associate'])

export const DEFAULT_EXAMPLE = Object.freeze({
  sectorKey: 'light-industrial',
  roleKey: 'forklift-operator',
  state: null,
  city: null,
  rateInput: '17.00'
})
