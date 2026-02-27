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

export type ClientDocument = {
  id: string;
  clientName: string; // matches Task.client
  name: string;
  category: string;
  fileType: "pdf" | "xlsx" | "docx" | "csv";
  year?: string;
  uploadedAt: string;
  uploadedBy: string;
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

  // Non-billable — week of Feb 24–28 (meetings, admin, training)
  { id: "te9",  taskId: "", member: "Gio",    client: "", category: "Internal Meeting", description: "Weekly team standup",                  duration: 0.5, date: "2026-02-24", billable: false },
  { id: "te10", taskId: "", member: "Gio",    client: "", category: "Internal Meeting", description: "Weekly team standup",                  duration: 0.5, date: "2026-02-25", billable: false },
  { id: "te11", taskId: "", member: "Gio",    client: "", category: "Internal Meeting", description: "1:1 with Mitch",                       duration: 1.0, date: "2026-02-26", billable: false },
  { id: "te12", taskId: "", member: "Gio",    client: "", category: "Admin",            description: "Timesheet review and filing",          duration: 0.5, date: "2026-02-24", billable: false },

  { id: "te13", taskId: "", member: "Musa",   client: "", category: "Internal Meeting", description: "Weekly team standup",                  duration: 0.5, date: "2026-02-24", billable: false },
  { id: "te14", taskId: "", member: "Musa",   client: "", category: "Admin",            description: "Email and inbox management",           duration: 0.5, date: "2026-02-25", billable: false },

  { id: "te15", taskId: "", member: "Mitch",  client: "", category: "Internal Meeting", description: "Weekly team standup",                  duration: 0.5, date: "2026-02-24", billable: false },
  { id: "te16", taskId: "", member: "Mitch",  client: "", category: "Internal Meeting", description: "Staff 1:1s",                           duration: 1.5, date: "2026-02-26", billable: false },
  { id: "te17", taskId: "", member: "Mitch",  client: "", category: "Admin",            description: "Partner report prep",                  duration: 1.0, date: "2026-02-25", billable: false },

  { id: "te18", taskId: "", member: "Jim",    client: "", category: "Internal Meeting", description: "Partner strategy session",             duration: 2.0, date: "2026-02-24", billable: false },
  { id: "te19", taskId: "", member: "Jim",    client: "", category: "Internal Meeting", description: "Staff performance reviews",            duration: 2.0, date: "2026-02-25", billable: false },
  { id: "te20", taskId: "", member: "Jim",    client: "", category: "Admin",            description: "Firm admin and billing review",        duration: 2.0, date: "2026-02-26", billable: false },

  { id: "te21", taskId: "", member: "Henry",  client: "", category: "Internal Meeting", description: "Weekly team standup",                  duration: 0.5, date: "2026-02-24", billable: false },
  { id: "te22", taskId: "", member: "Henry",  client: "", category: "Internal Meeting", description: "Manager check-in with Jim",            duration: 1.0, date: "2026-02-25", billable: false },
  { id: "te23", taskId: "", member: "Henry",  client: "", category: "Admin",            description: "WIP review and task delegation",       duration: 0.5, date: "2026-02-26", billable: false },

  { id: "te24", taskId: "", member: "Donna",  client: "", category: "Internal Meeting", description: "Weekly team standup",                  duration: 0.5, date: "2026-02-24", billable: false },
  { id: "te25", taskId: "", member: "Donna",  client: "", category: "Admin",            description: "Email and inbox management",           duration: 0.5, date: "2026-02-25", billable: false },

  { id: "te26", taskId: "", member: "Faizan", client: "", category: "Internal Meeting", description: "Weekly team standup",                  duration: 0.5, date: "2026-02-24", billable: false },
  { id: "te27", taskId: "", member: "Faizan", client: "", category: "Training",         description: "QuickBooks advanced workshop",         duration: 1.0, date: "2026-02-25", billable: false },
  { id: "te28", taskId: "", member: "Faizan", client: "", category: "Admin",            description: "Email and task management",            duration: 0.5, date: "2026-02-26", billable: false },

  { id: "te29", taskId: "", member: "Mark",   client: "", category: "Internal Meeting", description: "Weekly team standup",                  duration: 0.5, date: "2026-02-24", billable: false },
  { id: "te30", taskId: "", member: "Mark",   client: "", category: "Internal Meeting", description: "Staff 1:1s and workflow review",       duration: 1.5, date: "2026-02-25", billable: false },
  { id: "te31", taskId: "", member: "Mark",   client: "", category: "Internal Meeting", description: "Manager meeting with Jim",             duration: 1.0, date: "2026-02-26", billable: false },
  { id: "te32", taskId: "", member: "Mark",   client: "", category: "Admin",            description: "WIP status updates and reporting",     duration: 1.0, date: "2026-02-24", billable: false },

  { id: "te33", taskId: "", member: "Sam",    client: "", category: "Internal Meeting", description: "Weekly team standup",                  duration: 0.5, date: "2026-02-24", billable: false },
  { id: "te34", taskId: "", member: "Sam",    client: "", category: "Admin",            description: "Timesheet and task filing",            duration: 0.5, date: "2026-02-25", billable: false },

  { id: "te35", taskId: "", member: "Jordea", client: "", category: "Internal Meeting", description: "Weekly team standup",                  duration: 0.5, date: "2026-02-24", billable: false },
  { id: "te36", taskId: "", member: "Jordea", client: "", category: "Admin",            description: "Payroll software updates",             duration: 0.5, date: "2026-02-25", billable: false },
];

export const clientDocuments: ClientDocument[] = [
  // OES
  { id: "d1",  clientName: "OES",            name: "2024 Form 1120S",                  category: "Tax Returns",         fileType: "pdf",  year: "2024", uploadedAt: "2026-01-10", uploadedBy: "Gio"   },
  { id: "d2",  clientName: "OES",            name: "January 2026 Bank Rec",            category: "Bank & CC Rec's",     fileType: "xlsx", year: "2026", uploadedAt: "2026-02-05", uploadedBy: "Musa"  },
  { id: "d3",  clientName: "OES",            name: "Q3 2025 P&L Statement",            category: "Financial Statements",fileType: "pdf",  year: "2025", uploadedAt: "2025-11-12", uploadedBy: "Gio"   },
  { id: "d4",  clientName: "OES",            name: "Engagement Letter 2025",           category: "Engagement",          fileType: "pdf",              uploadedAt: "2025-01-03", uploadedBy: "Mitch" },

  // WWB
  { id: "d5",  clientName: "WWB",            name: "CP2000 IRS Notice",                category: "Tax Notices",         fileType: "pdf",  year: "2025", uploadedAt: "2026-02-01", uploadedBy: "Mark"  },
  { id: "d6",  clientName: "WWB",            name: "February 2026 Bookkeeping WIP",    category: "Bookkeeping",         fileType: "xlsx", year: "2026", uploadedAt: "2026-02-18", uploadedBy: "Faizan"},
  { id: "d7",  clientName: "WWB",            name: "2023 Form 1065",                   category: "Tax Returns",         fileType: "pdf",  year: "2023", uploadedAt: "2024-03-28", uploadedBy: "Mark"  },
  { id: "d8",  clientName: "WWB",            name: "Q4 2025 Payroll Summary",          category: "Payroll",             fileType: "xlsx", year: "2025", uploadedAt: "2026-01-15", uploadedBy: "Jordea"},

  // The Experience
  { id: "d9",  clientName: "The Experience", name: "January 2026 Bank Statement",      category: "Bank Statements",     fileType: "pdf",  year: "2026", uploadedAt: "2026-02-03", uploadedBy: "Musa"  },
  { id: "d10", clientName: "The Experience", name: "Audit Prep Checklist",             category: "Audits",              fileType: "docx", year: "2026", uploadedAt: "2026-02-10", uploadedBy: "Mitch" },
  { id: "d11", clientName: "The Experience", name: "Q4 2025 Financial Statements",     category: "Financial Statements",fileType: "pdf",  year: "2025", uploadedAt: "2026-01-20", uploadedBy: "Mitch" },

  // JD
  { id: "d12", clientName: "JD",             name: "Q1 2026 Board Package",            category: "Board Meeting",       fileType: "pdf",  year: "2026", uploadedAt: "2026-02-19", uploadedBy: "Henry" },
  { id: "d13", clientName: "JD",             name: "2024 Form 1065",                   category: "Tax Returns",         fileType: "pdf",  year: "2024", uploadedAt: "2025-03-15", uploadedBy: "Henry" },
  { id: "d14", clientName: "JD",             name: "Operating Agreement",              category: "Entity Docs",         fileType: "pdf",              uploadedAt: "2024-06-01", uploadedBy: "Donna" },

  // Elan
  { id: "d15", clientName: "Elan",           name: "February 2026 Payroll Register",   category: "Payroll",             fileType: "xlsx", year: "2026", uploadedAt: "2026-02-14", uploadedBy: "Jordea"},
  { id: "d16", clientName: "Elan",           name: "2026 Employee List",               category: "HR",                  fileType: "xlsx", year: "2026", uploadedAt: "2026-01-06", uploadedBy: "Jordea"},
  { id: "d17", clientName: "Elan",           name: "2024 Form 1120S",                  category: "Tax Returns",         fileType: "pdf",  year: "2024", uploadedAt: "2025-03-20", uploadedBy: "Gio"   },

  // Monda
  { id: "d18", clientName: "Monda",          name: "Q4 2025 Financial Statements",     category: "Financial Statements",fileType: "pdf",  year: "2025", uploadedAt: "2026-01-28", uploadedBy: "Mitch" },
  { id: "d19", clientName: "Monda",          name: "2025 Budget vs Actual",            category: "CFO Services",        fileType: "xlsx", year: "2025", uploadedAt: "2026-01-10", uploadedBy: "Henry" },
  { id: "d20", clientName: "Monda",          name: "2024 Form 1120",                   category: "Tax Returns",         fileType: "pdf",  year: "2024", uploadedAt: "2025-04-12", uploadedBy: "Mitch" },
  { id: "d21", clientName: "Monda",          name: "Engagement Letter 2025",           category: "Engagement",          fileType: "pdf",              uploadedAt: "2025-01-05", uploadedBy: "Jim"   },

  // Green Team
  { id: "d22", clientName: "Green Team",     name: "Q4 2025 Sales Tax Workpapers",     category: "Sales Tax",           fileType: "xlsx", year: "2025", uploadedAt: "2026-01-22", uploadedBy: "Mitch" },
  { id: "d23", clientName: "Green Team",     name: "January 2026 Cash Flow",           category: "Cash Flow",           fileType: "xlsx", year: "2026", uploadedAt: "2026-02-08", uploadedBy: "Jim"   },
  { id: "d24", clientName: "Green Team",     name: "2024 Form 1065",                   category: "Tax Returns",         fileType: "pdf",  year: "2024", uploadedAt: "2025-03-30", uploadedBy: "Mitch" },

  // OBI
  { id: "d25", clientName: "OBI",            name: "February 2026 AP Aging",           category: "AP & AR",             fileType: "xlsx", year: "2026", uploadedAt: "2026-02-17", uploadedBy: "Mitch" },
  { id: "d26", clientName: "OBI",            name: "December 2025 Inventory Count",    category: "Inventory",           fileType: "xlsx", year: "2025", uploadedAt: "2026-01-04", uploadedBy: "Jim"   },
  { id: "d27", clientName: "OBI",            name: "2024 Form 1065",                   category: "Tax Returns",         fileType: "pdf",  year: "2024", uploadedAt: "2025-04-02", uploadedBy: "Jim"   },

  // Amaracon
  { id: "d28", clientName: "Amaracon",       name: "2025 Audit Prep Binder",           category: "Audits",              fileType: "pdf",  year: "2025", uploadedAt: "2026-02-12", uploadedBy: "Sam"   },
  { id: "d29", clientName: "Amaracon",       name: "2024 Form 1120",                   category: "Tax Returns",         fileType: "pdf",  year: "2024", uploadedAt: "2025-04-08", uploadedBy: "Mitch" },
  { id: "d30", clientName: "Amaracon",       name: "Q4 2025 Financial Statements",     category: "Financial Statements",fileType: "pdf",  year: "2025", uploadedAt: "2026-01-25", uploadedBy: "Sam"   },

  // Devocion
  { id: "d31", clientName: "Devocion",       name: "January 2026 P&L",                 category: "Financial Statements",fileType: "pdf",  year: "2026", uploadedAt: "2026-02-16", uploadedBy: "Jim"   },
  { id: "d32", clientName: "Devocion",       name: "2026 Advisory Roadmap",            category: "Advisory",            fileType: "docx", year: "2026", uploadedAt: "2026-01-30", uploadedBy: "Jim"   },
  { id: "d33", clientName: "Devocion",       name: "2024 Form 1065",                   category: "Tax Returns",         fileType: "pdf",  year: "2024", uploadedAt: "2025-03-18", uploadedBy: "Mitch" },
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
