// Re-export Prisma types plus custom app types

export type {
  User,
  Project,
  Wing,
  Floor,
  Unit,
  Tenant,
  Sale,
  Buyer,
  KycDocument,
  ConstructionMilestone,
  PaymentSchedule,
  Payment,
  TdsRecord,
  Loan,
  LoanDisbursement,
  Template,
  Document,
  CommunicationLog,
  AuditLog,
} from '@prisma/client'

export type {
  UserRole,
  ProjectType,
  ProjectStatus,
  UnitStatus,
  SaleType,
  SaleStatus,
  KycDocType,
  KycStatus,
  MilestoneStatus,
  ScheduleStatus,
  PaymentMode,
  TdsStatus,
  LoanStatus,
  TemplateType,
  DocumentType,
  DocumentStatus,
  CommChannel,
  CommType,
  CommStatus,
} from '@prisma/client'

// Dashboard types
export interface AgingBucket {
  label: string
  amount: number
  count: number
  color: string
}

export interface DashboardStats {
  totalOutstanding: number
  currentDue: number
  overdue7: number
  overdue15: number
  overdue30: number
  overdue30Plus: number
  collectedThisMonth: number
  interestAccrued: number
  tdsPending: number
  collectionEfficiency: number
}

export interface MonthlyCollection {
  month: string
  collected: number
  due: number
}

// Template variable context
export interface TemplateContext {
  project: {
    name: string
    reraNumber?: string
    address: string
    city: string
    companyName: string
    companyAddress: string
    companyGstin?: string
  }
  unit: {
    number: string
    configuration: string
    carpetArea: string
    builtupArea?: string
    floor: string
    wing: string
  }
  sale: {
    number: string
    agreementValue: string
    gstAmount: string
    stampDuty?: string
    bookingDate: string
    agreementDate?: string
    saleType: string
  }
  buyers: Array<{
    name: string
    pan?: string
    aadhaar?: string
    address?: string
    email?: string
    whatsapp?: string
  }>
  payment?: {
    description: string
    principalAmount: string
    gstAmount: string
    dueDate: string
    demandDate: string
    interestAmount: string
    totalDue: string
    amountInWords: string
  }
  milestone?: {
    name: string
    completionDate: string
  }
  receipt?: {
    number: string
    amount: string
    mode: string
    reference?: string
    date: string
    cumulativePaid: string
    balanceOutstanding: string
  }
  tenant?: {
    oldFlat: string
    oldArea: string
    newFlat: string
    newArea: string
    extraArea: string
  }
  today: string
}

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// Form types
export interface CreateProjectInput {
  name: string
  reraNumber?: string
  address: string
  city: string
  state?: string
  type: 'FRESH' | 'REDEVELOPMENT' | 'MIXED'
  companyName: string
  companyAddress: string
  companyGstin?: string
  launchDate?: string
  expectedCompletion?: string
  stampDutyPercent?: number
  regChargesPercent?: number
}

export interface CreateSaleInput {
  projectId: string
  unitId: string
  tenantId?: string
  saleType: 'FRESH' | 'REDEVELOPMENT'
  agreementValue: number
  stampDuty?: number
  registrationCharges?: number
  bookingDate: string
  buyers: CreateBuyerInput[]
  paymentSchedules: CreateScheduleInput[]
}

export interface CreateBuyerInput {
  fullName: string
  email?: string
  whatsappNumber?: string
  panNumber?: string
  aadhaarNumber?: string
  address?: string
  isPrimary?: boolean
  sequence?: number
  receiveComms?: boolean
}

export interface CreateScheduleInput {
  milestoneId?: string
  description: string
  principalAmount: number
  gstAmount?: number
  dueDate?: string
}

export interface RecordPaymentInput {
  scheduleId: string
  saleId: string
  amount: number
  gstPaid?: number
  mode: string
  referenceNumber?: string
  bankName?: string
  paymentDate: string
  clearedDate?: string
}
