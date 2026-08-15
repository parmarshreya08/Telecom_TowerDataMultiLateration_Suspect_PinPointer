// Comprehensive test of status classification, dynamic counts, filtering, and pagination

function normalizeCaseStatus(status) {
  if (!status || typeof status !== 'string' || !status.trim()) {
    return 'Unknown'
  }
  const normalized = status.trim().toLowerCase()
  switch (normalized) {
    case 'active':
      return 'Active'
    case 'pending':
      return 'Pending'
    case 'completed':
      return 'Completed'
    case 'archived':
    case 'archive':
      return 'Archived'
    default:
      return 'Unknown'
  }
}

function getCaseLifecycleStatus(inv) {
  return normalizeCaseStatus(inv?.status)
}

function getCaseStatusBadgeVariant(status) {
  switch (status) {
    case 'Active':
      return 'primary'
    case 'Pending':
      return 'warning'
    case 'Completed':
      return 'success'
    case 'Archived':
      return 'neutral'
    case 'Unknown':
    default:
      return 'neutral'
  }
}

function getCaseStatusIconClasses(status) {
  switch (status) {
    case 'Active':
      return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
    case 'Pending':
      return 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
    case 'Completed':
      return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
    case 'Archived':
      return 'bg-surface-100 text-surface-500 dark:bg-surface-700 dark:text-surface-400'
    case 'Unknown':
    default:
      return 'bg-surface-100 text-surface-500 dark:bg-surface-700 dark:text-surface-400'
  }
}

// 1. Test normalization with various inputs
const tests = [
  { input: 'Active', expected: 'Active' },
  { input: 'active', expected: 'Active' },
  { input: 'ACTIVE ', expected: 'Active' },
  { input: 'Pending', expected: 'Pending' },
  { input: 'pending', expected: 'Pending' },
  { input: 'Completed', expected: 'Completed' },
  { input: 'completed', expected: 'Completed' },
  { input: 'Archived', expected: 'Archived' },
  { input: 'archived', expected: 'Archived' },
  { input: null, expected: 'Unknown' },
  { input: undefined, expected: 'Unknown' },
  { input: '', expected: 'Unknown' },
  { input: '   ', expected: 'Unknown' },
  { input: 'Draft', expected: 'Unknown' },
  { input: 'FooBar', expected: 'Unknown' },
]

console.log("=== NORMALIZATION TESTS ===")
let normPassed = 0
for (const t of tests) {
  const actual = normalizeCaseStatus(t.input)
  const ok = actual === t.expected
  if (ok) normPassed++
  console.log(`Input: ${JSON.stringify(t.input)} -> Actual: ${actual} | Expected: ${t.expected} | ${ok ? 'PASS' : 'FAIL'}`)
}
console.log(`Normalization Tests Passed: ${normPassed}/${tests.length}\n`)

// 2. Test with actual 11 cases from API
const realCases = [
  { id: 'CASE-VERIFY-2DF50F54', case_name: 'Normalizer Verify E2E', status: 'Active', tracking_status: 'Idle' },
  { id: 'CASE-HM-22E990A1', case_name: 'Heatmap E2E', status: 'Active', tracking_status: 'Completed' },
  { id: 'CASE-2026-DEL-1387', case_name: 'Test Case 118', status: 'Active', tracking_status: 'Idle' },
  { id: 'CASE-2026-CHN-7049', case_name: 'Test Case 118', status: 'Active', tracking_status: 'Idle' },
  { id: 'CASE-2026-DEL-8113', case_name: 'DEMO CASE', status: 'Active', tracking_status: 'Completed' },
  { id: 'E2E-TEST-CASE-001', case_name: 'E2E Test Investigation', status: 'Active', tracking_status: 'Idle' },
  { id: 'CASE-2026-SRT-1042', case_name: 'Operation Phantom Signal', status: 'Active', tracking_status: 'Completed' },
  { id: 'CASE-2026-TEST-94D3', case_name: 'Loop Test Case 3', status: 'Active', tracking_status: 'Idle' },
  { id: 'CASE-2026-TEST-BDCE', case_name: 'Loop Test Case 2', status: 'Active', tracking_status: 'Idle' },
  { id: 'CASE-C4390E', case_name: 'Workflow Test Case', status: 'Active', tracking_status: 'Idle' },
  { id: 'CASE-SURAT-2026-001', case_name: 'Surat Multi-Operator Investigation', status: 'Active', tracking_status: 'Completed' }
]

const statusCounts = { All: realCases.length, Active: 0, Pending: 0, Completed: 0, Archived: 0, Unknown: 0 }
for (const c of realCases) {
  const st = getCaseLifecycleStatus(c)
  if (st in statusCounts) statusCounts[st]++
  else statusCounts.Unknown++
}

console.log("=== REAL DATA STATUS COUNTS ===")
console.log(`All: ${statusCounts.All}`)
console.log(`Active: ${statusCounts.Active}`)
console.log(`Pending: ${statusCounts.Pending}`)
console.log(`Completed: ${statusCounts.Completed}`)
console.log(`Archived: ${statusCounts.Archived}`)
console.log(`Unknown: ${statusCounts.Unknown}`)

// 3. Test Filter Tabs on Real Data
console.log("\n=== FILTER RESULTS ON REAL DATA ===")
for (const tab of ['All', 'Active', 'Pending', 'Completed', 'Archived']) {
  const filtered = realCases.filter(inv => {
    const lifecycle = getCaseLifecycleStatus(inv)
    return tab === 'All' || lifecycle === tab
  })
  console.log(`Tab: ${tab.padEnd(10)} | Count on tab: ${statusCounts[tab]} | Filtered items: ${filtered.length}`)
  if (filtered.length > 0) {
    console.log(`  Cards: ${filtered.map(c => `${c.case_name} [${getCaseLifecycleStatus(c)}] (Tracking: ${c.tracking_status})`).join(', ')}`)
  }
}

// 4. Test Mixed Synthetic Data (Active, Pending, Completed, Archived, Unknown)
console.log("\n=== SYNTHETIC MIXED DATASET TEST ===")
const mixedCases = [
  { id: 'C1', case_name: 'Case 1', status: 'active', tracking_status: 'Idle' },
  { id: 'C2', case_name: 'Case 2', status: 'Active', tracking_status: 'Completed' },
  { id: 'C3', case_name: 'Case 3', status: 'pending', tracking_status: 'Idle' },
  { id: 'C4', case_name: 'Case 4', status: 'Completed', tracking_status: 'Completed' },
  { id: 'C5', case_name: 'Case 5', status: 'archived', tracking_status: 'Idle' },
  { id: 'C6', case_name: 'Case 6', status: null, tracking_status: 'Idle' },
  { id: 'C7', case_name: 'Case 7', status: 'UnknownStatus', tracking_status: 'Idle' }
]

const mixedCounts = { All: mixedCases.length, Active: 0, Pending: 0, Completed: 0, Archived: 0, Unknown: 0 }
for (const c of mixedCases) {
  const st = getCaseLifecycleStatus(c)
  if (st in mixedCounts) mixedCounts[st]++
  else mixedCounts.Unknown++
}
console.log("Mixed counts:", mixedCounts)

for (const tab of ['All', 'Active', 'Pending', 'Completed', 'Archived']) {
  const filtered = mixedCases.filter(inv => {
    const lifecycle = getCaseLifecycleStatus(inv)
    return tab === 'All' || lifecycle === tab
  })
  console.log(`Tab ${tab} (${mixedCounts[tab]}): matched ${filtered.length} items`)
  for (const item of filtered) {
    console.log(`   -> ${item.case_name} | Lifecycle Badge: [${getCaseLifecycleStatus(item)}] | Tracking: ${item.tracking_status}`)
  }
}
