// Sampson HQ — Mock data derived from real firm structure

export type TeamMember = {
  id: string;
  name: string;
  role: string;
  avatar: string;
  utilization: number;
  billableHours: number;
  totalHours: number;
  billingRate: number;   // $/hr billed to clients
  costRate: number;      // $/hr internal cost (salary equivalent)
};

export type Client = {
  id: string;
  name: string;
  entityType: string;
  industry: string;
  teamLead: string;
  assignedTo: string[];
  services: string[];
  healthScore: number;
  monthlyRetainer: number;
  outstandingBalance: number;
  lastContact: string;
  lastContactType: "email" | "call" | "text";
  status: "active" | "pending" | "at-risk";
};

export type Task = {
  id: string;
  title: string;
  client: string;
  assignee: string;
  category: string;
  priority: "high" | "medium" | "low";
  status: "todo" | "in-progress" | "review" | "done";
  dueDate: string;
  estimatedHours: number;
  loggedHours: number;
  recurring: boolean;
};

export type TimeEntry = {
  id: string;
  taskId: string;
  member: string;
  client: string;
  category: string;
  description: string;
  duration: number;
  date: string;
  billable: boolean;
};

export type Communication = {
  id: string;
  clientId: string;
  type: "email" | "call" | "text";
  from: string;
  subject: string;
  preview: string;
  date: string;
  read: boolean;
};

export const teamMembers: TeamMember[] = [
  { id: "gio", name: "Gio", role: "Senior Accountant", avatar: "G", utilization: 82, billableHours: 131, totalHours: 160, billingRate: 175, costRate: 52 },
  { id: "musa", name: "Musa", role: "Staff Accountant", avatar: "M", utilization: 78, billableHours: 125, totalHours: 160, billingRate: 120, costRate: 38 },
  { id: "mitch", name: "Mitch", role: "Senior Accountant", avatar: "Mi", utilization: 88, billableHours: 141, totalHours: 160, billingRate: 175, costRate: 55 },
  { id: "jim", name: "Jim", role: "Partner / CFO Lead", avatar: "J", utilization: 71, billableHours: 114, totalHours: 160, billingRate: 350, costRate: 115 },
  { id: "henry2", name: "Henry", role: "Manager", avatar: "H", utilization: 75, billableHours: 120, totalHours: 160, billingRate: 225, costRate: 72 },
  { id: "donna", name: "Donna", role: "Staff Accountant", avatar: "D", utilization: 69, billableHours: 110, totalHours: 160, billingRate: 110, costRate: 35 },
  { id: "faizan", name: "Faizan", role: "Staff Accountant", avatar: "F", utilization: 80, billableHours: 128, totalHours: 160, billingRate: 120, costRate: 38 },
  { id: "mark", name: "Mark", role: "Manager", avatar: "Ma", utilization: 73, billableHours: 117, totalHours: 160, billingRate: 225, costRate: 70 },
  { id: "sam", name: "Sam", role: "Junior Accountant", avatar: "S", utilization: 85, billableHours: 136, totalHours: 160, billingRate: 85, costRate: 28 },
  { id: "jordea", name: "Jordea", role: "Payroll Specialist", avatar: "Jo", utilization: 77, billableHours: 123, totalHours: 160, billingRate: 135, costRate: 42 },
];

export const clients: Client[] = [
  {
    id: "oes", name: "OES", entityType: "S-Corp", industry: "Professional Services",
    teamLead: "Gio", assignedTo: ["Gio", "Musa", "Henry"],
    services: ["Bookkeeping", "Bank & CC Rec's", "AP & AR", "Invoice & Billing", "Payroll", "Sales Tax", "Tax Notices", "Cash Flow"],
    healthScore: 92, monthlyRetainer: 4500, outstandingBalance: 0,
    lastContact: "2026-02-19", lastContactType: "email", status: "active",
  },
  {
    id: "jd", name: "JD", entityType: "LLC", industry: "Real Estate",
    teamLead: "Henry", assignedTo: ["Henry", "Donna"],
    services: ["Bookkeeping", "Bank Recs", "Board Meetings", "Tax Compliance", "Tax Returns"],
    healthScore: 85, monthlyRetainer: 3200, outstandingBalance: 1600,
    lastContact: "2026-02-17", lastContactType: "call", status: "active",
  },
  {
    id: "wwb", name: "WWB", entityType: "Partnership", industry: "Hospitality",
    teamLead: "Mark", assignedTo: ["Mark", "Faizan", "Gio"],
    services: ["Bookkeeping", "Bank & CC Rec's", "AP & AR", "Payroll", "Sales Tax", "CFO Services", "Tax Returns"],
    healthScore: 78, monthlyRetainer: 5800, outstandingBalance: 2900,
    lastContact: "2026-02-14", lastContactType: "email", status: "at-risk",
  },
  {
    id: "monda", name: "Monda", entityType: "C-Corp", industry: "Technology",
    teamLead: "Mitch", assignedTo: ["Mitch", "Gio", "Faizan", "Sam"],
    services: ["Bookkeeping", "Tax Returns", "Financial Statements", "CFO Services"],
    healthScore: 95, monthlyRetainer: 7200, outstandingBalance: 0,
    lastContact: "2026-02-20", lastContactType: "call", status: "active",
  },
  {
    id: "green-team", name: "Green Team", entityType: "LLC", industry: "Construction",
    teamLead: "Jim", assignedTo: ["Jim", "Mitch"],
    services: ["Bookkeeping", "Bank & CC Rec's", "AP & AR", "Sales Tax", "Cash Flow", "CFO Services", "Audits"],
    healthScore: 88, monthlyRetainer: 6100, outstandingBalance: 0,
    lastContact: "2026-02-18", lastContactType: "text", status: "active",
  },
  {
    id: "the-experience", name: "The Experience", entityType: "S-Corp", industry: "Entertainment",
    teamLead: "Mitch", assignedTo: ["Mitch", "Musa", "Henry", "Faizan"],
    services: ["Bookkeeping", "Bank & CC Rec's", "AP & AR", "Invoice & Billing", "Payroll", "Sales Tax", "CFO Services"],
    healthScore: 81, monthlyRetainer: 5200, outstandingBalance: 5200,
    lastContact: "2026-02-12", lastContactType: "email", status: "at-risk",
  },
  {
    id: "obi", name: "OBI", entityType: "LLC", industry: "Retail",
    teamLead: "Jim", assignedTo: ["Jim", "Mitch"],
    services: ["Bookkeeping", "Bank & CC Rec's", "AP & AR", "Sales Tax", "Cash Flow", "Inventory", "CFO Services"],
    healthScore: 90, monthlyRetainer: 4800, outstandingBalance: 0,
    lastContact: "2026-02-19", lastContactType: "email", status: "active",
  },
  {
    id: "devocion", name: "Devocion", entityType: "LLC", industry: "F&B",
    teamLead: "Jim", assignedTo: ["Jim", "Mitch", "Musa", "Henry"],
    services: ["Advisory", "Tax Compliance"],
    healthScore: 94, monthlyRetainer: 3500, outstandingBalance: 0,
    lastContact: "2026-02-20", lastContactType: "call", status: "active",
  },
  {
    id: "elan", name: "Elan", entityType: "S-Corp", industry: "Beauty",
    teamLead: "Gio", assignedTo: ["Gio", "Musa", "Jordea"],
    services: ["Bookkeeping", "Bank & CC Rec's", "AP & AR", "Payroll", "Sales Tax"],
    healthScore: 86, monthlyRetainer: 3800, outstandingBalance: 0,
    lastContact: "2026-02-16", lastContactType: "text", status: "active",
  },
  {
    id: "amaracon", name: "Amaracon", entityType: "C-Corp", industry: "Consulting",
    teamLead: "Sam", assignedTo: ["Sam", "Mitch", "Henry", "Jim"],
    services: ["Bank & CC Rec's", "Tax Returns", "Sales Tax", "Cash Flow", "CFO Services", "Audits", "Financial Statements"],
    healthScore: 83, monthlyRetainer: 6500, outstandingBalance: 3250,
    lastContact: "2026-02-15", lastContactType: "email", status: "pending",
  },
];

export const tasks: Task[] = [
  { id: "t1", title: "Q4 2025 Tax Filing", client: "OES", assignee: "Gio", category: "Tax Returns", priority: "high", status: "in-progress", dueDate: "2026-03-01", estimatedHours: 12, loggedHours: 8.5, recurring: false },
  { id: "t2", title: "Monthly Bookkeeping Close", client: "WWB", assignee: "Faizan", category: "Bookkeeping", priority: "high", status: "in-progress", dueDate: "2026-02-25", estimatedHours: 6, loggedHours: 3, recurring: true },
  { id: "t3", title: "Bank Reconciliation - February", client: "The Experience", assignee: "Musa", category: "Bank & CC Rec's", priority: "medium", status: "todo", dueDate: "2026-02-28", estimatedHours: 4, loggedHours: 0, recurring: true },
  { id: "t4", title: "Board Meeting Prep - Q1", client: "JD", assignee: "Henry", category: "Board Meeting", priority: "high", status: "review", dueDate: "2026-02-22", estimatedHours: 8, loggedHours: 7, recurring: false },
  { id: "t5", title: "Payroll Processing", client: "Elan", assignee: "Jordea", category: "Payroll", priority: "high", status: "todo", dueDate: "2026-02-21", estimatedHours: 3, loggedHours: 0, recurring: true },
  { id: "t6", title: "CFO Advisory Call", client: "Monda", assignee: "Henry", category: "CFO Services", priority: "medium", status: "done", dueDate: "2026-02-20", estimatedHours: 2, loggedHours: 1.5, recurring: false },
  { id: "t7", title: "Sales Tax Return - Q4", client: "Green Team", assignee: "Mitch", category: "Sales Tax", priority: "high", status: "in-progress", dueDate: "2026-02-28", estimatedHours: 5, loggedHours: 2, recurring: false },
  { id: "t8", title: "AP Invoice Review", client: "OBI", assignee: "Mitch", category: "AP & AR", priority: "medium", status: "todo", dueDate: "2026-02-26", estimatedHours: 3, loggedHours: 0, recurring: true },
  { id: "t9", title: "Cash Flow Forecast - March", client: "Amaracon", assignee: "Sam", category: "Cash Flow", priority: "medium", status: "todo", dueDate: "2026-03-05", estimatedHours: 4, loggedHours: 0, recurring: true },
  { id: "t10", title: "IRS Notice Response", client: "WWB", assignee: "Mark", category: "Tax Notices", priority: "high", status: "in-progress", dueDate: "2026-02-24", estimatedHours: 6, loggedHours: 4, recurring: false },
  { id: "t11", title: "Financial Statements - January", client: "Devocion", assignee: "Jim", category: "Financial Statements", priority: "medium", status: "review", dueDate: "2026-02-23", estimatedHours: 5, loggedHours: 4.5, recurring: true },
  { id: "t12", title: "Audit Prep Documents", client: "The Experience", assignee: "Mitch", category: "Audits", priority: "low", status: "todo", dueDate: "2026-03-15", estimatedHours: 10, loggedHours: 0, recurring: false },
];

export const timeEntries: TimeEntry[] = [
  { id: "te1", taskId: "t1", member: "Gio", client: "OES", category: "Tax Returns", description: "Reviewed Q4 financials and prepared 1120S draft", duration: 3.5, date: "2026-02-20", billable: true },
  { id: "te2", taskId: "t2", member: "Faizan", client: "WWB", category: "Bookkeeping", description: "Categorized February transactions", duration: 2, date: "2026-02-20", billable: true },
  { id: "te3", taskId: "t4", member: "Henry", client: "JD", category: "Board Meeting", description: "Compiled Q1 financial summary deck", duration: 3, date: "2026-02-20", billable: true },
  { id: "te4", taskId: "t7", member: "Mitch", client: "Green Team", category: "Sales Tax", description: "Calculated Q4 sales tax liability", duration: 2, date: "2026-02-20", billable: true },
  { id: "te5", taskId: "t10", member: "Mark", client: "WWB", category: "Tax Notices", description: "Drafted response to CP2000 notice", duration: 1.5, date: "2026-02-20", billable: true },
  { id: "te6", taskId: "t6", member: "Henry", client: "Monda", category: "CFO Services", description: "Monthly advisory call - cash position review", duration: 1.5, date: "2026-02-20", billable: true },
  { id: "te7", taskId: "t11", member: "Jim", client: "Devocion", category: "Financial Statements", description: "Prepared P&L and balance sheet for January", duration: 2.5, date: "2026-02-19", billable: true },
  { id: "te8", taskId: "t1", member: "Gio", client: "OES", category: "Tax Returns", description: "Reconciled depreciation schedules", duration: 2, date: "2026-02-19", billable: true },
];

export const communications: Communication[] = [
  { id: "c1", clientId: "oes", type: "email", from: "Sarah Chen (OES)", subject: "Updated W-2 forms for review", preview: "Hi team, attached are the corrected W-2 forms for 2025. Please review before we file...", date: "2026-02-20T09:15:00", read: false },
  { id: "c2", clientId: "wwb", type: "email", from: "David Park (WWB)", subject: "RE: IRS Notice - CP2000", preview: "Thanks for the update Mark. Can we schedule a call to discuss the proposed changes?", date: "2026-02-20T08:30:00", read: false },
  { id: "c3", clientId: "monda", type: "call", from: "Henry → Lisa Torres (Monda)", subject: "CFO Advisory - Monthly Review", preview: "Discussed cash position, Q1 forecast, and upcoming fundraise implications", date: "2026-02-20T10:00:00", read: true },
  { id: "c4", clientId: "green-team", type: "text", from: "Jim → Rob Martinez (Green Team)", subject: "", preview: "Quick heads up - your Q4 sales tax return is almost done. Will send for review by EOD tomorrow.", date: "2026-02-18T16:45:00", read: true },
  { id: "c5", clientId: "the-experience", type: "email", from: "Andre Williams (The Experience)", subject: "Invoice #4521 dispute", preview: "Hey team, I have a question about the charges on invoice #4521. The bookkeeping hours seem higher than...", date: "2026-02-19T14:20:00", read: true },
  { id: "c6", clientId: "jd", type: "call", from: "Donna → Michael Ross (JD)", subject: "Board Meeting Documents", preview: "Confirmed Feb 22 board meeting. Financial package will be sent 24 hours in advance.", date: "2026-02-17T11:00:00", read: true },
  { id: "c7", clientId: "elan", type: "text", from: "Musa → Nina Shah (Elan)", subject: "", preview: "Payroll is all set for this Friday. Please confirm employee count hasn't changed.", date: "2026-02-16T13:30:00", read: true },
  { id: "c8", clientId: "amaracon", type: "email", from: "Tom Nguyen (Amaracon)", subject: "Audit timeline question", preview: "Sam, can you clarify when we need to have the audit prep documents ready? Our board wants...", date: "2026-02-15T10:45:00", read: true },
];

export const serviceCategories = [
  "Bookkeeping", "Bank & CC Rec's", "AP & AR", "Invoice & Billing",
  "Payroll", "Payroll Taxes", "Sales Tax", "Tax Notices & Compliance",
  "Cash Flow", "Financial Statements", "Tax Returns", "CFO Services",
  "Inventory", "Operations", "HR", "Board Meeting", "Audits", "Advisory",
];

// Summary stats for dashboard
export const firmStats = {
  totalClients: 10,
  activeClients: 8,
  monthlyRevenue: 51600,
  monthlyRevenueTarget: 58000,
  totalOutstanding: 12950,
  avgUtilization: 78,
  tasksCompleted: 47,
  tasksPending: 12,
  upcomingDeadlines: 8,
};
