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

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'SALES'
export type ProjectType = 'FRESH' | 'REDEVELOPMENT' | 'MIXED'
export type ProjectStatus = 'UPCOMING' | 'ONGOING' | 'COMPLETED'
export type UnitStatus = 'AVAILABLE' | 'BOOKED' | 'SOLD' | 'BLOCKED'
export type SaleType = 'FRESH' | 'REDEVELOPMENT'
export type SaleStatus = 'BOOKED' | 'REGISTERED' | 'CANCELLED'
export type KycDocType = 'PAN' | 'AADHAAR' | 'PASSPORT' | 'OTHER'
export type KycStatus = 'PENDING' | 'VERIFIED' | 'REJECTED'
export type MilestoneStatus = 'UPCOMING' | 'COMPLETED'
export type ScheduleStatus = 'UPCOMING' | 'DUE' | 'PAID' | 'OVERDUE'
export type PaymentMode = 'CHEQUE' | 'NEFT' | 'RTGS' | 'UPI' | 'CASH'
export type TdsStatus = 'PENDING' | 'PAID'
export type LoanStatus = 'PENDING' | 'APPROVED' | 'DISBURSED' | 'REJECTED'
export type TemplateType = 'DEMAND_LETTER' | 'RECEIPT' | 'AGREEMENT' | 'ALLOTMENT_LETTER'
export type DocumentType = 'DEMAND_LETTER' | 'RECEIPT' | 'AGREEMENT' | 'ALLOTMENT_LETTER' | 'NOC'
export type DocumentStatus = 'GENERATED' | 'SIGNED'
export type CommChannel = 'EMAIL' | 'WHATSAPP' | 'SMS'
export type CommType = 'DEMAND_LETTER' | 'RECEIPT' | 'MANUAL'
export type CommStatus = 'PENDING' | 'SENT' | 'SIMULATED' | 'DELIVERED' | 'FAILED'

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
