'use client'

import { useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Clock3,
  FileSearch,
  Gauge,
  ListFilter,
  LockKeyhole,
  PackageCheck,
  Plus,
  Route,
  ScanLine,
  Search,
  Settings2,
  ShieldCheck,
  Split,
  X,
} from 'lucide-react'
import { statusText } from '@/lib/demo-data'
import { getActorProfile, roleOptions } from '@/lib/core/role-service.mjs'
import { buildMonitoringSummary } from '@/lib/core/monitoring-service.mjs'
import { buildApprovalWorkbench, getTicketActionBlockReason } from '@/lib/core/action-permissions.mjs'
import {
  countDueSoonTickets,
  getDashboardTicketReason,
  selectDashboardKeyTickets,
} from '@/lib/core/dashboard-service.mjs'
import { filterAndPaginateRuleRows } from '@/lib/core/rule-service.mjs'
import type { ExceptionTicket, IntegrationLog, ScanRecord, TicketDetail } from '@/types'

type TabKey = 'dashboard' | 'scan' | 'scanRecords' | 'tickets' | 'approvals' | 'compensations' | 'inventory' | 'rules' | 'monitoring'
type ScanFormState = {
  waybillNo: string
  skuCode: string
  batchNo: string
  operator: string
  abnormalDescription: string
  damageLevel: string
}
type ReportFormState = {
  waybillNo: string
  exceptionType: string
  description: string
  amount: string
  reporter: string
}
type MessageTone = 'success' | 'error' | 'info'
type InlineMessage = {
  message: string
  tone: MessageTone
}
type ScanRecordFilters = {
  waybillNo: string
  skuCode: string
  batchNo: string
  result: string
  batchStatus: string
  ticketNo: string
}
const ticketStatusOptions = [
  { value: 'all', label: '全部状态' },
  { value: 'pending_review', label: statusText.pending_review },
  { value: 'level1_reviewing', label: statusText.level1_reviewing },
  { value: 'level2_reviewing', label: statusText.level2_reviewing },
  { value: 'rejected', label: statusText.rejected },
  { value: 'executing', label: statusText.executing },
  { value: 'completed', label: statusText.completed },
  { value: 'closed', label: statusText.closed },
]
type DisplayScanRecord = ScanRecord & {
  matchedRuleName?: string
}
type RuleDisplayRow = {
  id: string
  name: string
  condition: string
  action: string
  mode: string
  enabled: boolean
}
type RuleFormState = {
  mode: 'approval' | 'quality'
  code: string
  name: string
  minAmount: string
  maxAmount: string
  level: string
  subtype: string
  severity: string
  conditionField: string
  conditionOperator: string
  conditionValue: string
  entryLevel: string
  enabled: boolean
}

function createDefaultRuleForm(): RuleFormState {
  return {
    mode: 'approval',
    code: 'amount-custom',
    name: '自定义金额审批',
    minAmount: '0',
    maxAmount: '',
    level: 'level1_reviewing',
    subtype: 'custom',
    severity: 'medium',
    conditionField: 'damageLevel',
    conditionOperator: 'gte',
    conditionValue: '3',
    entryLevel: 'level1_reviewing',
    enabled: true,
  }
}

const tabs: { key: TabKey; label: string; icon: typeof Gauge }[] = [
  { key: 'dashboard', label: '总览', icon: Gauge },
  { key: 'scan', label: '扫描品控', icon: ScanLine },
  { key: 'tickets', label: '工单追踪', icon: FileSearch },
  { key: 'approvals', label: '分级审批', icon: ShieldCheck },
  { key: 'compensations', label: '赔付记录', icon: CheckCircle2 },
  { key: 'inventory', label: '库存流水', icon: Boxes },
  { key: 'rules', label: '规则配置', icon: Settings2 },
  { key: 'monitoring', label: '接口监控', icon: Activity },
]

const exceptionTypeOptions = ['丢件', '破损', '客户拒收', '超时未签收', '地址错误']
const navigationTabs: { key: TabKey; label: string; icon: typeof Gauge }[] = tabs.flatMap((tab) =>
  tab.key === 'scan'
    ? [tab, { key: 'scanRecords', label: '扫描记录', icon: ListFilter }]
    : [tab]
)

const ticketListPageSize = 10
const traceListPageSize = 10
const logListPageSize = 10
const defaultTicketFilters = { status: 'all', waybillNo: '', exceptionType: '', approver: '' }
const defaultLogFilters = { requestId: '', endpoint: '' }
const defaultCompensationFilters = { keyword: '', direction: '', status: '' }
const defaultInventoryFilters = { keyword: '', movementType: '' }
const defaultRuleFilters = { mode: 'all', name: '', code: '', status: 'all' }
const defaultScanRecordFilters: ScanRecordFilters = {
  waybillNo: '',
  skuCode: '',
  batchNo: '',
  result: '',
  batchStatus: '',
  ticketNo: '',
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard')
  const [selectedRole, setSelectedRole] = useState('level2_approver')
  const [statusFilter, setStatusFilter] = useState('all')
  const [waybillFilter, setWaybillFilter] = useState('')
  const [exceptionTypeFilter, setExceptionTypeFilter] = useState('')
  const [approverFilter, setApproverFilter] = useState('')
  const [appliedTicketFilters, setAppliedTicketFilters] = useState(defaultTicketFilters)
  const [ticketPage, setTicketPage] = useState(1)
  const [ticketPageInfo, setTicketPageInfo] = useState({
    total: 0,
    page: 1,
    pageSize: ticketListPageSize,
    totalPages: 1,
  })
  const [ticketRows, setTicketRows] = useState<ExceptionTicket[]>([])
  const [ticketListRows, setTicketListRows] = useState<ExceptionTicket[]>([])
  const [scanRows, setScanRows] = useState<DisplayScanRecord[]>([])
  const [scanRecordRows, setScanRecordRows] = useState<DisplayScanRecord[]>([])
  const [logRows, setLogRows] = useState<IntegrationLog[]>([])
  const [logPage, setLogPage] = useState(1)
  const [logRequestIdFilter, setLogRequestIdFilter] = useState('')
  const [logEndpointFilter, setLogEndpointFilter] = useState('')
  const [appliedLogFilters, setAppliedLogFilters] = useState(defaultLogFilters)
  const [logPageInfo, setLogPageInfo] = useState({
    total: 0,
    page: 1,
    pageSize: logListPageSize,
    totalPages: 1,
  })
  const [compensationRows, setCompensationRows] = useState<Record<string, unknown>[]>([])
  const [inventoryRows, setInventoryRows] = useState<Record<string, unknown>[]>([])
  const [compensationPage, setCompensationPage] = useState(1)
  const [inventoryPage, setInventoryPage] = useState(1)
  const [compensationPageInfo, setCompensationPageInfo] = useState({
    total: 0,
    page: 1,
    pageSize: traceListPageSize,
    totalPages: 1,
  })
  const [inventoryPageInfo, setInventoryPageInfo] = useState({
    total: 0,
    page: 1,
    pageSize: traceListPageSize,
    totalPages: 1,
  })
  const [compensationKeyword, setCompensationKeyword] = useState('')
  const [compensationDirection, setCompensationDirection] = useState('')
  const [compensationStatus, setCompensationStatus] = useState('')
  const [appliedCompensationFilters, setAppliedCompensationFilters] = useState(defaultCompensationFilters)
  const [inventoryKeyword, setInventoryKeyword] = useState('')
  const [inventoryMovementType, setInventoryMovementType] = useState('')
  const [appliedInventoryFilters, setAppliedInventoryFilters] = useState(defaultInventoryFilters)
  const [scanPage, setScanPage] = useState(1)
  const [scanPageInfo, setScanPageInfo] = useState({
    total: 0,
    page: 1,
    pageSize: 5,
    totalPages: 1,
  })
  const [scanRecordPage, setScanRecordPage] = useState(1)
  const [scanRecordFilters, setScanRecordFilters] = useState<ScanRecordFilters>(defaultScanRecordFilters)
  const [appliedScanRecordFilters, setAppliedScanRecordFilters] = useState<ScanRecordFilters>(defaultScanRecordFilters)
  const [scanRecordPageInfo, setScanRecordPageInfo] = useState({
    total: 0,
    page: 1,
    pageSize: 10,
    totalPages: 1,
  })
  const [ticketsLoading, setTicketsLoading] = useState(true)
  const [ticketListLoading, setTicketListLoading] = useState(true)
  const [scanLoading, setScanLoading] = useState(true)
  const [scanRecordLoading, setScanRecordLoading] = useState(true)
  const [logsLoading, setLogsLoading] = useState(true)
  const [compensationsLoading, setCompensationsLoading] = useState(true)
  const [inventoryLoading, setInventoryLoading] = useState(true)
  const [toast, setToast] = useState<InlineMessage | null>(null)
  const [scanAlert, setScanAlert] = useState<InlineMessage | null>(null)
  const [ticketAlert, setTicketAlert] = useState<InlineMessage | null>(null)
  const [reportModalOpen, setReportModalOpen] = useState(false)
  const [scanForm, setScanForm] = useState<ScanFormState>({
    waybillNo: '',
    skuCode: '',
    batchNo: '',
    operator: '',
    abnormalDescription: '',
    damageLevel: '',
  })
  const [reportForm, setReportForm] = useState<ReportFormState>({
    waybillNo: '',
    exceptionType: '客户拒收',
    description: '',
    amount: '',
    reporter: '',
  })
  const [approvalRecordByTicket, setApprovalRecordByTicket] = useState<Record<string, string>>({})
  const [selectedTicketId, setSelectedTicketId] = useState('')
  const [ticketDetail, setTicketDetail] = useState<TicketDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busyAction, setBusyAction] = useState('')
  const currentActor = useMemo(() => getActorProfile(selectedRole), [selectedRole])
  const notifySuccess = (message: string) => setToast({ message, tone: 'success' })
  const notifyError = (message: string) => setToast({ message, tone: 'error' })

  useEffect(() => {
    refreshTickets()
  }, [])

  useEffect(() => {
    refreshLogs(logPage)
  }, [logPage, appliedLogFilters])

  useEffect(() => {
    refreshScanRecords(scanPage)
  }, [scanPage])

  useEffect(() => {
    refreshAllScanRecords(scanRecordPage)
  }, [scanRecordPage, appliedScanRecordFilters])

  useEffect(() => {
    refreshCompensations(compensationPage)
  }, [compensationPage, appliedCompensationFilters])

  useEffect(() => {
    refreshInventoryMovements(inventoryPage)
  }, [inventoryPage, appliedInventoryFilters])

  useEffect(() => {
    const controller = new AbortController()
    refreshTicketList(controller.signal)

    return () => {
      controller.abort()
    }
  }, [ticketPage, appliedTicketFilters])

  const filteredTickets = useMemo(() => {
    return ticketListRows
  }, [ticketListRows])

  const activeTickets = ticketRows.filter((ticket) => !['completed', 'closed'].includes(ticket.status))
  const monitoringSummary = useMemo(() => buildMonitoringSummary(logRows), [logRows])
  const successRate = monitoringSummary.successRate

  const refreshTickets = async () => {
    setTicketsLoading(true)
    try {
      const response = await fetch('/api/tickets')
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || '工单列表加载失败')
      setTicketRows(Array.isArray(data.tickets) ? data.tickets : [])
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '工单列表加载失败')
    } finally {
      setTicketsLoading(false)
    }
  }

  const refreshTicketList = async (signal?: AbortSignal) => {
    const params = new URLSearchParams({
      page: String(ticketPage),
      pageSize: String(ticketListPageSize),
    })
    if (appliedTicketFilters.status !== 'all') params.set('status', appliedTicketFilters.status)
    if (appliedTicketFilters.waybillNo.trim()) params.set('waybillNo', appliedTicketFilters.waybillNo.trim())
    if (appliedTicketFilters.exceptionType.trim()) params.set('exceptionType', appliedTicketFilters.exceptionType.trim())
    if (appliedTicketFilters.approver.trim()) params.set('approver', appliedTicketFilters.approver.trim())

    setTicketListLoading(true)
    try {
      const response = await fetch(`/api/tickets?${params.toString()}`, { signal })
      const data = await response.json()
      if (signal?.aborted) return
      if (!response.ok || data.error) throw new Error(data.error || '工单分页加载失败')
      setTicketListRows(Array.isArray(data.tickets) ? data.tickets : [])
      setTicketPageInfo({
        total: Number(data.total || 0),
        page: Number(data.page || 1),
        pageSize: Number(data.pageSize || ticketListPageSize),
        totalPages: Number(data.totalPages || 1),
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      setTicketAlert({ message: error instanceof Error ? error.message : '工单分页加载失败', tone: 'error' })
    } finally {
      if (!signal?.aborted) setTicketListLoading(false)
    }
  }

  const refreshScanRecords = async (page = scanPage) => {
    setScanLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(scanPageInfo.pageSize),
      })
      const response = await fetch(`/api/scan-records?${params.toString()}`)
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || '扫描记录加载失败')
      setScanRows(Array.isArray(data.scans) ? data.scans : [])
      setScanPageInfo({
        total: Number(data.total || 0),
        page: Number(data.page || page),
        pageSize: Number(data.pageSize || scanPageInfo.pageSize),
        totalPages: Number(data.totalPages || 1),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '扫描记录加载失败'
      setScanAlert({ message, tone: 'error' })
    } finally {
      setScanLoading(false)
    }
  }

  const refreshAllScanRecords = async (page = scanRecordPage) => {
    setScanRecordLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(scanRecordPageInfo.pageSize),
      })
      if (appliedScanRecordFilters.waybillNo.trim()) params.set('waybillNo', appliedScanRecordFilters.waybillNo.trim())
      if (appliedScanRecordFilters.skuCode.trim()) params.set('skuCode', appliedScanRecordFilters.skuCode.trim())
      if (appliedScanRecordFilters.batchNo.trim()) params.set('batchNo', appliedScanRecordFilters.batchNo.trim())
      if (appliedScanRecordFilters.result) params.set('result', appliedScanRecordFilters.result)
      if (appliedScanRecordFilters.batchStatus) params.set('batchStatus', appliedScanRecordFilters.batchStatus)
      if (appliedScanRecordFilters.ticketNo.trim()) params.set('ticketNo', appliedScanRecordFilters.ticketNo.trim())

      const response = await fetch(`/api/scan-records?${params.toString()}`)
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || '扫描记录加载失败')
      setScanRecordRows(Array.isArray(data.scans) ? data.scans : [])
      setScanRecordPageInfo({
        total: Number(data.total || 0),
        page: Number(data.page || page),
        pageSize: Number(data.pageSize || scanRecordPageInfo.pageSize),
        totalPages: Number(data.totalPages || 1),
      })
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '扫描记录加载失败')
    } finally {
      setScanRecordLoading(false)
    }
  }

  const refreshLogs = async (page = logPage) => {
    setLogsLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(logListPageSize),
      })
      if (appliedLogFilters.requestId.trim()) params.set('requestId', appliedLogFilters.requestId.trim())
      if (appliedLogFilters.endpoint.trim()) params.set('endpoint', appliedLogFilters.endpoint.trim())
      const response = await fetch(`/api/integration-logs?${params.toString()}`)
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || '接口日志加载失败')
      setLogRows(Array.isArray(data.logs) ? data.logs : [])
      setLogPageInfo({
        total: Number(data.total || 0),
        page: Number(data.page || page),
        pageSize: Number(data.pageSize || logListPageSize),
        totalPages: Number(data.totalPages || 1),
      })
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '接口日志加载失败')
    } finally {
      setLogsLoading(false)
    }
  }

  const refreshCompensations = async (page = compensationPage) => {
    setCompensationsLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(traceListPageSize),
      })
      if (appliedCompensationFilters.keyword.trim()) params.set('keyword', appliedCompensationFilters.keyword.trim())
      if (appliedCompensationFilters.direction) params.set('direction', appliedCompensationFilters.direction)
      if (appliedCompensationFilters.status) params.set('status', appliedCompensationFilters.status)
      const response = await fetch(`/api/compensations?${params.toString()}`)
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || '赔付记录加载失败')
      setCompensationRows(Array.isArray(data.records) ? data.records : [])
      setCompensationPageInfo({
        total: Number(data.total || 0),
        page: Number(data.page || page),
        pageSize: Number(data.pageSize || traceListPageSize),
        totalPages: Number(data.totalPages || 1),
      })
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '赔付记录加载失败')
    } finally {
      setCompensationsLoading(false)
    }
  }

  const refreshInventoryMovements = async (page = inventoryPage) => {
    setInventoryLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(traceListPageSize),
      })
      if (appliedInventoryFilters.keyword.trim()) params.set('keyword', appliedInventoryFilters.keyword.trim())
      if (appliedInventoryFilters.movementType) params.set('movementType', appliedInventoryFilters.movementType)
      const response = await fetch(`/api/inventory-movements?${params.toString()}`)
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || '库存流水加载失败')
      setInventoryRows(Array.isArray(data.records) ? data.records : [])
      setInventoryPageInfo({
        total: Number(data.total || 0),
        page: Number(data.page || page),
        pageSize: Number(data.pageSize || traceListPageSize),
        totalPages: Number(data.totalPages || 1),
      })
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '库存流水加载失败')
    } finally {
      setInventoryLoading(false)
    }
  }

  const handleTicketSearch = () => {
    setTicketPage(1)
    setAppliedTicketFilters({
      status: statusFilter,
      waybillNo: waybillFilter,
      exceptionType: exceptionTypeFilter,
      approver: approverFilter,
    })
  }

  const handleTicketReset = () => {
    setStatusFilter(defaultTicketFilters.status)
    setWaybillFilter(defaultTicketFilters.waybillNo)
    setExceptionTypeFilter(defaultTicketFilters.exceptionType)
    setApproverFilter(defaultTicketFilters.approver)
    setTicketPage(1)
    setAppliedTicketFilters(defaultTicketFilters)
  }

  const handleCompensationSearch = () => {
    setCompensationPage(1)
    setAppliedCompensationFilters({
      keyword: compensationKeyword,
      direction: compensationDirection,
      status: compensationStatus,
    })
  }

  const handleCompensationReset = () => {
    setCompensationKeyword(defaultCompensationFilters.keyword)
    setCompensationDirection(defaultCompensationFilters.direction)
    setCompensationStatus(defaultCompensationFilters.status)
    setCompensationPage(1)
    setAppliedCompensationFilters(defaultCompensationFilters)
  }

  const handleInventorySearch = () => {
    setInventoryPage(1)
    setAppliedInventoryFilters({
      keyword: inventoryKeyword,
      movementType: inventoryMovementType,
    })
  }

  const handleInventoryReset = () => {
    setInventoryKeyword(defaultInventoryFilters.keyword)
    setInventoryMovementType(defaultInventoryFilters.movementType)
    setInventoryPage(1)
    setAppliedInventoryFilters(defaultInventoryFilters)
  }

  const handleLogSearch = () => {
    setLogPage(1)
    setAppliedLogFilters({
      requestId: logRequestIdFilter,
      endpoint: logEndpointFilter,
    })
  }

  const handleLogReset = () => {
    setLogRequestIdFilter(defaultLogFilters.requestId)
    setLogEndpointFilter(defaultLogFilters.endpoint)
    setLogPage(1)
    setAppliedLogFilters(defaultLogFilters)
  }

  const updateScanRecordFilter = (field: keyof ScanRecordFilters, value: string) => {
    setScanRecordFilters((current) => ({ ...current, [field]: value }))
  }

  const handleScanRecordSearch = () => {
    setScanRecordPage(1)
    setAppliedScanRecordFilters(scanRecordFilters)
  }

  const handleScanRecordReset = () => {
    setScanRecordFilters(defaultScanRecordFilters)
    setScanRecordPage(1)
    setAppliedScanRecordFilters(defaultScanRecordFilters)
  }

  const handleSelectTicket = async (ticketId: string) => {
    setSelectedTicketId(ticketId)
    setTicketDetail(null)
    setDetailLoading(true)
    setTicketAlert(null)

    try {
      const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}`)
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || '工单详情加载失败')
      setTicketDetail(data.detail || null)
    } catch (error) {
      setTicketAlert({ message: error instanceof Error ? error.message : '工单详情加载失败', tone: 'error' })
    } finally {
      setDetailLoading(false)
    }
  }

  const handleCloseTicketDetail = () => {
    setSelectedTicketId('')
    setTicketDetail(null)
    setDetailLoading(false)
  }

  const handleCreateQualityScan = async () => {
    setScanAlert(null)
    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waybillNo: scanForm.waybillNo,
          skuCode: scanForm.skuCode,
          batchNo: scanForm.batchNo,
          operator: scanForm.operator || currentActor.label || currentActor.actorId,
          abnormalDescription: scanForm.abnormalDescription,
          damageLevel: Number(scanForm.damageLevel || 0),
        }),
      })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || '扫描检测失败')

      if (data.scan) {
        setScanRows((current) => [data.scan, ...current.filter((record) => record.id !== data.scan.id)])
      }
      await refreshTickets()
      await refreshTicketList()
      setScanPage(1)
      await refreshScanRecords(1)
      setScanRecordPage(1)
      await refreshAllScanRecords(1)
      await refreshLogs()
      const message = data.message || '扫描检测完成'
      setScanAlert({ message, tone: 'success' })
      notifySuccess(message)
      setActiveTab('scan')
    } catch (error) {
      const message = error instanceof Error ? error.message : '扫描检测失败'
      setScanAlert({ message, tone: 'error' })
    }
  }

  const handleReportLogistics = async () => {
    setTicketAlert(null)
    try {
      const response = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waybillNo: reportForm.waybillNo,
          exceptionType: reportForm.exceptionType,
          description: reportForm.description,
          amount: Number(reportForm.amount || 0),
          reporter: reportForm.reporter,
        }),
      })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || '异常上报失败')

      await refreshTickets()
      await refreshTicketList()
      await refreshLogs()
      setReportModalOpen(false)
      setTicketAlert({ message: '物流异常已上报，工单已进入审批流程。', tone: 'success' })
      setActiveTab('tickets')
    } catch (error) {
      setTicketAlert({ message: error instanceof Error ? error.message : '异常上报失败', tone: 'error' })
    }
  }

  const handleApprove = async (ticketId: string, decision: 'approved' | 'rejected') => {
    const ticket = ticketRows.find((item) => item.id === ticketId)
    if (!ticket) return
    const actionKey = `approve-${ticketId}-${decision}`
    if (!window.confirm(decision === 'approved' ? '确认通过该工单？' : '确认拒绝并退回补充？')) return

    try {
      setBusyAction(actionKey)
      const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          opinion: decision === 'approved' ? '同意处理' : '资料不足，退回补充',
          expectedVersion: ticket.version,
          idempotencyKey: `ui-${ticketId}-${decision}-${ticket.version}`,
          actorId: currentActor.actorId,
          roles: currentActor.roles,
        }),
      })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || '审批提交失败')

      const approvalId = String(data.approvalRecord?.id || data.approvalRecord?.approval_record_id || '')
      if (approvalId) {
        setApprovalRecordByTicket((current) => ({ ...current, [ticketId]: approvalId }))
      }
      await refreshTickets()
      await refreshTicketList()
      await refreshScanRecords(scanPage)
      await refreshCompensations()
      await refreshInventoryMovements()
      notifySuccess(decision === 'approved' ? '审批已通过，库存/赔付已自动联动完成。' : '审批已拒绝，工单等待重新提交。')
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '审批提交失败')
    } finally {
      setBusyAction('')
    }
  }

  const handleResubmit = async (ticketId: string) => {
    const actionKey = `resubmit-${ticketId}`
    if (!window.confirm('确认重新提交该工单？')) return

    try {
      setBusyAction(actionKey)
      const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/resubmit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: '已补充异常凭证，重新提交审批',
          actorId: currentActor.actorId,
          roles: currentActor.roles,
        }),
      })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || '重新提交失败')

      await refreshTickets()
      await refreshTicketList()
      notifySuccess('工单已重新提交，重新进入审批流程。')
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '重新提交失败')
    } finally {
      setBusyAction('')
    }
  }

  const handleExecute = async (ticketId: string, action: string) => {
    const approvalRecordId = approvalRecordByTicket[ticketId]
    const actionKey = `execute-${ticketId}-${action}`
    if (!window.confirm('确认执行该联动动作？')) return

    try {
      setBusyAction(actionKey)
      const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          approvalRecordId: approvalRecordId || undefined,
          actorId: currentActor.actorId,
        }),
      })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || '执行联动失败')

      await refreshTickets()
      await refreshTicketList()
      await refreshScanRecords(scanPage)
      await refreshCompensations()
      await refreshInventoryMovements()
      notifySuccess('执行联动已完成，库存/赔付/批次状态已由后端事务处理。')
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '执行联动失败')
    } finally {
      setBusyAction('')
    }
  }

  const handleFastRelease = async (ticketId: string) => {
    const actionKey = `fast-release-${ticketId}`
    if (!window.confirm('确认按误判快速放行该品控工单？')) return

    try {
      setBusyAction(actionKey)
      const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}/fast-release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: '外包装轻微压痕，复核后确认不影响商品出库。',
          actorId: currentActor.actorId,
          roles: currentActor.roles,
        }),
      })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || '快速放行失败')

      setScanRows((current) => current.map((scan) =>
        scan.ticketId === ticketId ? { ...scan, batchStatus: 'qc_released' } : scan
      ))
      await refreshTickets()
      await refreshTicketList()
      await refreshScanRecords(scanPage)
      await refreshInventoryMovements()
      notifySuccess('品控主管已快速放行，批次状态已解锁。')
    } catch (error) {
      notifyError(error instanceof Error ? error.message : '快速放行失败')
    } finally {
      setBusyAction('')
    }
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-[1720px] px-6 py-8 xl:px-10 2xl:px-12">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#0bada9]">
              <PackageCheck className="h-4 w-4" />
              运单全生命周期管理平台 V3
            </div>
            <h1 className="text-3xl font-semibold text-[#1d2129] xl:text-4xl">扫描品控、异常上报、分级审批与执行联动</h1>
            <p className="mt-3 max-w-5xl text-base leading-7 text-gray-500">
              独立部署、独立数据库，通过 HTTP API 对接 V2 运单数据；本地仅保存快照、工单、审批、库存和赔付记录。
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1720px] gap-7 px-6 py-7 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)] xl:px-10 2xl:px-12">
        <aside className="jt-card h-fit p-4">
          <nav className="space-y-2">
            {navigationTabs.map((tab) => {
              const Icon = tab.icon
              const active = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={[
                    'flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors',
                    active ? 'bg-[#e8fafa] text-[#0bada9]' : 'text-gray-600 hover:bg-gray-50',
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </aside>

        <section className="space-y-7">
          {toast && activeTab !== 'tickets' && (
            <div className={`rounded-xl border px-5 py-3 text-sm font-medium ${messageToneClass(toast.tone)}`}>
              {toast.message}
            </div>
          )}
          {activeTab === 'dashboard' && (
            <Dashboard
              activeTickets={activeTickets}
              ticketRows={ticketRows}
              scanRows={scanRows}
              ticketsLoading={ticketsLoading}
              scanLoading={scanLoading}
              logsLoading={logsLoading}
              hasIntegrationLogs={logRows.length > 0}
              successRate={successRate}
              onViewAllTickets={() => setActiveTab('tickets')}
            />
          )}
          {activeTab === 'scan' && (
            <ScanPanel
              scanRows={scanRows}
              loading={scanLoading}
              alert={scanAlert}
              pageInfo={scanPageInfo}
              onPageChange={setScanPage}
              scanForm={scanForm}
              currentActorName={currentActor.label || currentActor.actorId}
              onScanFormChange={(next) => {
                setScanForm(next)
                if (scanAlert?.tone === 'error') setScanAlert(null)
              }}
              onCreateQualityScan={handleCreateQualityScan}
              onViewAllScanRecords={() => setActiveTab('scanRecords')}
            />
          )}
          {activeTab === 'scanRecords' && (
            <ScanRecordsPanel
              rows={scanRecordRows}
              loading={scanRecordLoading}
              pageInfo={scanRecordPageInfo}
              filters={scanRecordFilters}
              onFilterChange={updateScanRecordFilter}
              onSearch={handleScanRecordSearch}
              onResetFilters={handleScanRecordReset}
              onPageChange={setScanRecordPage}
            />
          )}
          {activeTab === 'tickets' && (
            <TicketPanel
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              filteredTickets={filteredTickets}
              alert={ticketAlert}
              reportForm={reportForm}
              onReportFormChange={(next) => {
                setReportForm(next)
                if (ticketAlert?.tone === 'error') setTicketAlert(null)
              }}
              onReportLogistics={handleReportLogistics}
              exceptionTypes={exceptionTypeOptions}
              reportModalOpen={reportModalOpen}
              onOpenReportModal={() => {
                setTicketAlert(null)
                setReportModalOpen(true)
              }}
              onCloseReportModal={() => setReportModalOpen(false)}
              waybillFilter={waybillFilter}
              exceptionTypeFilter={exceptionTypeFilter}
              approverFilter={approverFilter}
              onWaybillFilterChange={setWaybillFilter}
              onExceptionTypeFilterChange={setExceptionTypeFilter}
              onApproverFilterChange={setApproverFilter}
              onSearch={handleTicketSearch}
              onResetFilters={handleTicketReset}
              ticketPageInfo={ticketPageInfo}
              loading={ticketListLoading}
              onTicketPageChange={setTicketPage}
              selectedTicketId={selectedTicketId}
              ticketDetail={ticketDetail}
              detailLoading={detailLoading}
              onSelectTicket={handleSelectTicket}
              onCloseTicketDetail={handleCloseTicketDetail}
            />
          )}
          {activeTab === 'approvals' && (
            <ApprovalPanel
              ticketRows={ticketRows}
              selectedRole={selectedRole}
              currentActor={currentActor}
              onRoleChange={setSelectedRole}
              onApprove={handleApprove}
              onResubmit={handleResubmit}
              onFastRelease={handleFastRelease}
              busyAction={busyAction}
              loading={ticketsLoading}
            />
          )}
          {activeTab === 'compensations' && (
            <CompensationPanel
              rows={compensationRows}
              loading={compensationsLoading}
              pageInfo={compensationPageInfo}
              keyword={compensationKeyword}
              direction={compensationDirection}
              status={compensationStatus}
              onKeywordChange={setCompensationKeyword}
              onDirectionChange={setCompensationDirection}
              onStatusChange={setCompensationStatus}
              onSearch={handleCompensationSearch}
              onResetFilters={handleCompensationReset}
              onPageChange={setCompensationPage}
            />
          )}
          {activeTab === 'inventory' && (
            <InventoryPanel
              rows={inventoryRows}
              loading={inventoryLoading}
              pageInfo={inventoryPageInfo}
              keyword={inventoryKeyword}
              movementType={inventoryMovementType}
              onKeywordChange={setInventoryKeyword}
              onMovementTypeChange={setInventoryMovementType}
              onSearch={handleInventorySearch}
              onResetFilters={handleInventoryReset}
              onPageChange={setInventoryPage}
            />
          )}
          {activeTab === 'rules' && <RulesPanel />}
          {activeTab === 'monitoring' && (
            <MonitoringPanel
              logRows={logRows}
              summary={monitoringSummary}
              loading={logsLoading}
              pageInfo={logPageInfo}
              requestIdFilter={logRequestIdFilter}
              endpointFilter={logEndpointFilter}
              onRequestIdFilterChange={setLogRequestIdFilter}
              onEndpointFilterChange={setLogEndpointFilter}
              onSearch={handleLogSearch}
              onResetFilters={handleLogReset}
              onPageChange={setLogPage}
            />
          )}
        </section>
      </div>
    </main>
  )
}

function Dashboard({
  activeTickets,
  ticketRows,
  scanRows,
  ticketsLoading,
  scanLoading,
  logsLoading,
  hasIntegrationLogs,
  successRate,
  onViewAllTickets,
}: {
  activeTickets: ExceptionTicket[]
  ticketRows: ExceptionTicket[]
  scanRows: ScanRecord[]
  ticketsLoading: boolean
  scanLoading: boolean
  logsLoading: boolean
  hasIntegrationLogs: boolean
  successRate: number
  onViewAllTickets: () => void
}) {
  const keyTickets = selectDashboardKeyTickets(ticketRows, { limit: 5 })
  const qualityHoldCount = scanRows.filter((item) => item.batchStatus === 'qc_hold').length
    || activeTickets.filter((ticket) => ticket.exceptionCategory === 'quality').length
  const dueSoonCount = countDueSoonTickets(activeTickets)
  const successRateValue = logsLoading || !hasIntegrationLogs ? '-' : `${successRate}%`

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={AlertTriangle} label="未关闭工单" value={ticketsLoading ? '-' : activeTickets.length} hint="含品控与物流异常" />
        <StatCard icon={LockKeyhole} label="暂扣批次" value={ticketsLoading || scanLoading ? '-' : qualityHoldCount} hint="关闭前禁止出库引用" />
        <StatCard icon={Route} label="接口成功率" value={successRateValue} hint="取自 V2 接口同步日志" />
        <StatCard icon={Clock3} label="即将超时" value={ticketsLoading ? '-' : dueSoonCount} hint="2 小时内到期或已逾期" />
      </div>

      <div className="grid gap-7 xl:grid-cols-[minmax(0,1.35fr)_minmax(430px,0.65fr)]">
        <section className="jt-card overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-gray-100 p-6 lg:flex-row lg:items-center lg:justify-between">
            <SectionTitle icon={FileSearch} title="关键工单" description="按超时、状态和品控风险选取前 5 条，完整列表在工单追踪中处理。" compact />
            <button
              onClick={onViewAllTickets}
              className="w-fit rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              查看全部
            </button>
          </div>
          <TicketTable
            rows={keyTickets}
            emptyText={ticketsLoading ? '正在加载工单...' : '暂无关键工单'}
            reasonForTicket={(ticket) => getDashboardTicketReason(ticket)}
          />
        </section>
        <section className="jt-card p-6">
          <SectionTitle icon={Split} title="两套状态机分离" description="扫描批次状态与工单审批状态独立维护，通过 ticket_id 关联。" />
          <div className="space-y-4">
            <FlowStep title="扫描品控" text="录入运单 + SKU 后调用 V2 校验归属，命中规则即暂扣批次。" />
            <FlowStep title="异常工单" text="物流异常手工上报，品控异常扫描触发，来源字段清晰区分。" />
            <FlowStep title="执行联动" text="审批记录、库存流水、赔付记录都保留 approval_record_id。" />
          </div>
        </section>
      </div>
    </>
  )
}

function ScanPanel({
  scanRows,
  loading,
  alert,
  pageInfo,
  onPageChange,
  scanForm,
  currentActorName,
  onScanFormChange,
  onCreateQualityScan,
  onViewAllScanRecords,
}: {
  scanRows: DisplayScanRecord[]
  loading: boolean
  alert: InlineMessage | null
  pageInfo: {
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
  onPageChange: (page: number) => void
  scanForm: ScanFormState
  currentActorName: string
  onScanFormChange: (next: ScanFormState) => void
  onCreateQualityScan: () => void
  onViewAllScanRecords: () => void
}) {
  const updateField = (field: keyof ScanFormState, value: string) => {
    onScanFormChange({ ...scanForm, [field]: value })
  }
  const AlertIcon = alert?.tone === 'error' ? AlertTriangle : CheckCircle2

  return (
    <section className="jt-card p-6">
      <SectionTitle icon={ScanLine} title="扫描操作与品控检测" description="手工输入可模拟扫描枪；异常批次立即进入品控暂扣。" />
      {alert && (
        <div className={`mt-5 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm font-medium ${messageToneClass(alert.tone)}`} role={alert.tone === 'error' ? 'alert' : 'status'}>
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{alert.message}</span>
        </div>
      )}
      <div className="mt-6 grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
          <RequiredLabel>运单号</RequiredLabel>
          <input className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={scanForm.waybillNo} onChange={(event) => updateField('waybillNo', event.target.value)} />
          <RequiredLabel className="mt-4">SKU 编码</RequiredLabel>
          <input className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={scanForm.skuCode} onChange={(event) => updateField('skuCode', event.target.value)} />
          <RequiredLabel className="mt-4">批次号</RequiredLabel>
          <input className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={scanForm.batchNo} onChange={(event) => updateField('batchNo', event.target.value)} />
          <div className="mt-4 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
            <span className="text-gray-500">操作人</span>
            <span className="ml-3 font-semibold text-gray-900">{currentActorName || '当前用户'}</span>
          </div>
          <details className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
            <summary className="cursor-pointer text-sm font-semibold text-gray-700">异常补充信息（可选）</summary>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-gray-700">破损等级</label>
                <select className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={scanForm.damageLevel || '0'} onChange={(event) => updateField('damageLevel', event.target.value)}>
                  <option value="0">无明显破损</option>
                  <option value="1">轻微破损</option>
                  <option value="2">中度破损</option>
                  <option value="3">严重破损</option>
                  <option value="4">无法正常履约</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">异常备注</label>
                <textarea className="mt-2 h-24 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="可补充破损位置、照片编号、现场说明等" value={scanForm.abnormalDescription} onChange={(event) => updateField('abnormalDescription', event.target.value)} />
              </div>
            </div>
          </details>
          <div className="hidden">
            <div>
              <label className="text-sm font-medium text-gray-700">操作人</label>
              <input className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={scanForm.operator} onChange={(event) => updateField('operator', event.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">破损等级</label>
              <input type="number" min="0" max="5" className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={scanForm.damageLevel} onChange={(event) => updateField('damageLevel', event.target.value)} />
            </div>
          </div>
          <label className="hidden">品控描述</label>
          <textarea className="hidden" value={scanForm.abnormalDescription} onChange={(event) => updateField('abnormalDescription', event.target.value)} />
          <button onClick={onCreateQualityScan} className="jt-btn-primary mt-4 h-10 w-full">
            <ScanLine className="h-4 w-4" />
            执行扫描检测
          </button>
          <p className="mt-3 rounded-lg bg-[#e8fafa] px-3 py-2 text-xs text-[#0b7774]">
            命中规则后复扫同批次只追加扫描记录，不重复创建工单。
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">最近扫描结果</h3>
              <p className="mt-1 text-xs text-gray-500">只展示最近记录，用于确认本次扫描反馈。</p>
            </div>
            <button onClick={onViewAllScanRecords} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
              查看全部
            </button>
          </div>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-5 py-4">扫描 ID</th>
                  <th className="px-5 py-4">运单/SKU</th>
                  <th className="px-5 py-4">批次状态</th>
                  <th className="px-5 py-4">命中规则</th>
                  <th className="px-5 py-4">关联工单</th>
                </tr>
              </thead>
              <tbody>
                {scanRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="border-t border-gray-100 px-5 py-8 text-center text-gray-500">
                      {loading ? '正在加载扫描记录...' : '暂无扫描记录。执行扫描检测后会显示真实记录。'}
                    </td>
                  </tr>
                )}
                {scanRows.map((record) => (
                  <tr key={record.id} className="border-t border-gray-100">
                    <td className="px-5 py-4 font-medium">{record.id}</td>
                    <td className="px-5 py-4">{record.waybillNo}<br /><span className="text-gray-500">{record.skuCode} · {record.skuName}</span></td>
                    <td className="px-5 py-4"><Badge tone={record.batchStatus === 'qc_hold' ? 'orange' : 'green'}>{batchStatusText(record.batchStatus)}</Badge></td>
                    <td className="px-5 py-4">{record.matchedRuleName || '-'}</td>
                    <td className="px-5 py-4">{record.ticketNo || record.ticketId || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-100 px-5 py-4 text-sm text-gray-600">
            共 {pageInfo.total} 条，当前显示最近 {scanRows.length} 条
          </div>
          <div className="hidden">
            <span>共 {pageInfo.total} 条，第 {pageInfo.page} / {pageInfo.totalPages} 页</span>
            <div className="flex gap-2">
              <button
                disabled={pageInfo.page <= 1 || loading}
                onClick={() => onPageChange(1)}
                className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                首页
              </button>
              <button
                disabled={pageInfo.page <= 1 || loading}
                onClick={() => onPageChange(Math.max(1, pageInfo.page - 1))}
                className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                上一页
              </button>
              <button
                disabled={pageInfo.page >= pageInfo.totalPages || loading}
                onClick={() => onPageChange(Math.min(pageInfo.totalPages, pageInfo.page + 1))}
                className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                下一页
              </button>
              <button
                disabled={pageInfo.page >= pageInfo.totalPages || loading}
                onClick={() => onPageChange(pageInfo.totalPages)}
                className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                末页
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ScanRecordsPanel({
  rows,
  loading,
  pageInfo,
  filters,
  onFilterChange,
  onSearch,
  onResetFilters,
  onPageChange,
}: {
  rows: DisplayScanRecord[]
  loading: boolean
  pageInfo: {
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
  filters: ScanRecordFilters
  onFilterChange: (field: keyof ScanRecordFilters, value: string) => void
  onSearch: () => void
  onResetFilters: () => void
  onPageChange: (page: number) => void
}) {
  const submitFiltersOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') onSearch()
  }

  return (
    <section className="jt-card overflow-hidden">
      <SectionTitle icon={ListFilter} title="扫描记录" description="查询全部历史扫描，按运单、SKU、批次、结果、批次状态和关联工单筛选。" />
      <div className="grid gap-3 border-y border-gray-100 px-6 py-4 xl:grid-cols-[1fr_1fr_1fr_150px_170px_1fr_auto_auto]">
        <input className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="运单号" value={filters.waybillNo} onChange={(event) => onFilterChange('waybillNo', event.target.value)} onKeyDown={submitFiltersOnEnter} />
        <input className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="SKU 编码" value={filters.skuCode} onChange={(event) => onFilterChange('skuCode', event.target.value)} onKeyDown={submitFiltersOnEnter} />
        <input className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="批次号" value={filters.batchNo} onChange={(event) => onFilterChange('batchNo', event.target.value)} onKeyDown={submitFiltersOnEnter} />
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={filters.result} onChange={(event) => onFilterChange('result', event.target.value)}>
          <option value="">全部结果</option>
          <option value="passed">正常通过</option>
          <option value="abnormal">异常暂扣</option>
        </select>
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={filters.batchStatus} onChange={(event) => onFilterChange('batchStatus', event.target.value)}>
          <option value="">全部批次状态</option>
          <option value="available">可用</option>
          <option value="qc_hold">品控暂扣</option>
          <option value="qc_released">已放行</option>
          <option value="returned_supplier">退供应商</option>
          <option value="repurchasing">重采购</option>
          <option value="downgraded">降级处理</option>
        </select>
        <input className="rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="关联工单" value={filters.ticketNo} onChange={(event) => onFilterChange('ticketNo', event.target.value)} onKeyDown={submitFiltersOnEnter} />
        <button onClick={onSearch} className="jt-btn-primary h-10 px-4 text-sm">查询</button>
        <button onClick={onResetFilters} className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">重置</button>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-5 py-4">扫描 ID</th>
              <th className="px-5 py-4">运单/SKU</th>
              <th className="px-5 py-4">批次号</th>
              <th className="px-5 py-4">结果</th>
              <th className="px-5 py-4">批次状态</th>
              <th className="px-5 py-4">命中规则</th>
              <th className="px-5 py-4">关联工单</th>
              <th className="px-5 py-4">扫描时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="border-t border-gray-100 px-5 py-8 text-center text-gray-500">
                  {loading ? '正在加载扫描记录...' : '暂无匹配扫描记录'}
                </td>
              </tr>
            )}
            {rows.map((record) => (
              <tr key={record.id} className="border-t border-gray-100">
                <td className="px-5 py-4 font-mono text-xs">{record.id}</td>
                <td className="px-5 py-4">{record.waybillNo}<br /><span className="text-gray-500">{record.skuCode}</span></td>
                <td className="px-5 py-4">{record.batchNo}</td>
                <td className="px-5 py-4"><Badge tone={record.result === 'passed' ? 'green' : 'orange'}>{record.result === 'passed' ? '正常通过' : '异常暂扣'}</Badge></td>
                <td className="px-5 py-4"><Badge tone={record.batchStatus === 'qc_hold' ? 'orange' : 'green'}>{batchStatusText(record.batchStatus)}</Badge></td>
                <td className="px-5 py-4">{record.matchedRuleName || '-'}</td>
                <td className="px-5 py-4">{record.ticketNo || record.ticketId || '-'}</td>
                <td className="px-5 py-4">{formatMetricTime(record.scannedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TracePagination pageInfo={pageInfo} loading={loading} onPageChange={onPageChange} />
    </section>
  )
}

function TicketPanel({
  statusFilter,
  onStatusFilterChange,
  filteredTickets,
  alert,
  reportForm,
  onReportFormChange,
  onReportLogistics,
  exceptionTypes,
  reportModalOpen,
  onOpenReportModal,
  onCloseReportModal,
  waybillFilter,
  exceptionTypeFilter,
  approverFilter,
  onWaybillFilterChange,
  onExceptionTypeFilterChange,
  onApproverFilterChange,
  onSearch,
  onResetFilters,
  ticketPageInfo,
  loading,
  onTicketPageChange,
  selectedTicketId,
  ticketDetail,
  detailLoading,
  onSelectTicket,
  onCloseTicketDetail,
}: {
  statusFilter: string
  onStatusFilterChange: (value: string) => void
  filteredTickets: ExceptionTicket[]
  alert: InlineMessage | null
  reportForm: ReportFormState
  onReportFormChange: (next: ReportFormState) => void
  onReportLogistics: () => void
  exceptionTypes: string[]
  reportModalOpen: boolean
  onOpenReportModal: () => void
  onCloseReportModal: () => void
  waybillFilter: string
  exceptionTypeFilter: string
  approverFilter: string
  onWaybillFilterChange: (value: string) => void
  onExceptionTypeFilterChange: (value: string) => void
  onApproverFilterChange: (value: string) => void
  onSearch: () => void
  onResetFilters: () => void
  ticketPageInfo: {
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
  loading: boolean
  onTicketPageChange: (page: number) => void
  selectedTicketId: string
  ticketDetail: TicketDetail | null
  detailLoading: boolean
  onSelectTicket: (ticketId: string) => void
  onCloseTicketDetail: () => void
}) {
  const updateField = (field: keyof ReportFormState, value: string) => {
    onReportFormChange({ ...reportForm, [field]: value })
  }
  const submitFiltersOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') onSearch()
  }

  return (
    <div className="space-y-7">
      <section className="jt-card overflow-hidden">
        <div className="flex flex-col gap-5 border-b border-gray-200 p-6 lg:flex-row lg:items-center lg:justify-between">
          <SectionTitle icon={ListFilter} title="工单列表与追踪" description="支持按状态、异常类型、运单号和审批人筛选，详情页应展示完整审计日志。" compact />
          <div className="flex flex-wrap items-center gap-3">
            <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
              {ticketStatusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button onClick={onOpenReportModal} className="jt-btn-primary h-10 px-4 text-sm">
              上报异常
            </button>
          </div>
        </div>
        {alert && (
          <div className={`mx-6 mt-5 rounded-xl border px-5 py-4 text-sm font-semibold shadow-sm ${messageToneClass(alert.tone)}`}>
            {alert.message}
          </div>
        )}
        <div className="grid gap-3 border-b border-gray-100 px-6 py-4 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
          <input
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="运单号"
            value={waybillFilter}
            onChange={(event) => onWaybillFilterChange(event.target.value)}
            onKeyDown={submitFiltersOnEnter}
          />
          <select
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={exceptionTypeFilter}
            onChange={(event) => onExceptionTypeFilterChange(event.target.value)}
          >
            <option value="">全部异常类型</option>
            {exceptionTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <input
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            placeholder="处理人"
            value={approverFilter}
            onChange={(event) => onApproverFilterChange(event.target.value)}
            onKeyDown={submitFiltersOnEnter}
          />
          <button
            onClick={onSearch}
            className="jt-btn-primary h-10 px-4 text-sm"
          >
            查询
          </button>
          <button
            onClick={onResetFilters}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            重置
          </button>
        </div>
        <TicketTable rows={filteredTickets} onSelectTicket={onSelectTicket} emptyText={loading ? '正在加载工单...' : '暂无匹配工单'} />
        <div className="flex flex-col gap-3 border-t border-gray-100 px-6 py-4 text-sm text-gray-600 md:flex-row md:items-center md:justify-between">
          <span>
            共 {ticketPageInfo.total} 条，第 {ticketPageInfo.page} / {ticketPageInfo.totalPages} 页
          </span>
          <div className="flex gap-2">
            <button
              disabled={ticketPageInfo.page <= 1}
              onClick={() => onTicketPageChange(1)}
              className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              首页
            </button>
            <button
              disabled={ticketPageInfo.page <= 1}
              onClick={() => onTicketPageChange(Math.max(1, ticketPageInfo.page - 1))}
              className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              上一页
            </button>
            <button
              disabled={ticketPageInfo.page >= ticketPageInfo.totalPages}
              onClick={() => onTicketPageChange(Math.min(ticketPageInfo.totalPages, ticketPageInfo.page + 1))}
              className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              下一页
            </button>
            <button
              disabled={ticketPageInfo.page >= ticketPageInfo.totalPages}
              onClick={() => onTicketPageChange(ticketPageInfo.totalPages)}
              className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              末页
            </button>
          </div>
        </div>
      </section>

      {reportModalOpen && (
        <ReportExceptionModal
          alert={alert}
          reportForm={reportForm}
          exceptionTypes={exceptionTypes}
          onClose={onCloseReportModal}
          onSubmit={onReportLogistics}
          onUpdateField={updateField}
        />
      )}

      {selectedTicketId && (
        <TicketDetailPanel
          selectedTicketId={selectedTicketId}
          detail={ticketDetail}
          loading={detailLoading}
          onClose={onCloseTicketDetail}
        />
      )}
    </div>
  )
}

function ReportExceptionModal({
  alert,
  reportForm,
  exceptionTypes,
  onClose,
  onSubmit,
  onUpdateField,
}: {
  alert: InlineMessage | null
  reportForm: ReportFormState
  exceptionTypes: string[]
  onClose: () => void
  onSubmit: () => void
  onUpdateField: (field: keyof ReportFormState, value: string) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/45 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <SectionTitle icon={AlertTriangle} title="上报物流异常" description="提交前会通过接口校验运单真实性，提交后生成审批工单。" compact />
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="关闭上报异常弹框">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-5 px-6 py-5">
          {alert && (
            <div className={`rounded-xl border px-5 py-4 text-sm font-semibold ${messageToneClass(alert.tone)}`}>
              {alert.message}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <RequiredLabel>
              运单号
              <input className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" value={reportForm.waybillNo} onChange={(event) => onUpdateField('waybillNo', event.target.value)} />
            </RequiredLabel>
            <RequiredLabel>
              异常类型
              <select className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" value={reportForm.exceptionType} onChange={(event) => onUpdateField('exceptionType', event.target.value)}>
                {exceptionTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </RequiredLabel>
            <label className="text-sm font-medium text-gray-700">
              金额
              <input className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" placeholder="0" value={reportForm.amount} onChange={(event) => onUpdateField('amount', event.target.value)} />
            </label>
            <RequiredLabel>
              上报人
              <input className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" value={reportForm.reporter} onChange={(event) => onUpdateField('reporter', event.target.value)} />
            </RequiredLabel>
          </div>
          <RequiredLabel>
            异常描述
            <textarea className="mt-2 h-28 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" value={reportForm.description} onChange={(event) => onUpdateField('description', event.target.value)} />
          </RequiredLabel>
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-100 px-6 py-4">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            取消
          </button>
          <button onClick={onSubmit} className="jt-btn-primary h-10 px-5">
            提交上报
          </button>
        </div>
      </div>
    </div>
  )
}

function ApprovalPanel({
  ticketRows,
  selectedRole,
  currentActor,
  onRoleChange,
  onApprove,
  onResubmit,
  onFastRelease,
  busyAction,
  loading,
}: {
  ticketRows: ExceptionTicket[]
  selectedRole: string
  currentActor: { actorId: string; roles: string[] }
  onRoleChange: (role: string) => void
  onApprove: (ticketId: string, decision: 'approved' | 'rejected') => void
  onResubmit: (ticketId: string) => void
  onFastRelease: (ticketId: string) => void
  busyAction: string
  loading: boolean
}) {
  const [approvalView, setApprovalView] = useState<'mine' | 'all'>('mine')
  const workbench = useMemo(() => buildApprovalWorkbench({ tickets: ticketRows, actor: currentActor }), [ticketRows, currentActor])
  const pendingRows: ExceptionTicket[] = approvalView === 'mine' ? workbench.pendingRows : workbench.allPendingRows
  const currentRoleLabel = roleOptions.find((option) => option.key === selectedRole)?.label || '操作员'

  return (
    <div className="space-y-7">
      <section className="jt-card p-6">
        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div>
            <label className="text-xs font-medium text-gray-500">当前处理身份</label>
            <select
              value={selectedRole}
              onChange={(event) => onRoleChange(event.target.value)}
              className="mt-2 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-800"
            >
              {roleOptions.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
            <p className="mt-3 text-xs leading-5 text-gray-500">
              当前以 {currentRoleLabel} 视角处理审批任务；这里只影响审批工作台权限，不改变全局工单数据。
            </p>
          </div>
          <div className="grid gap-4 text-center md:grid-cols-3">
            <MiniMetric label="待我处理" value={workbench.metrics.mineCount} />
            <MiniMetric label="可审批" value={workbench.metrics.approvableCount} />
            <MiniMetric label="可快速放行" value={workbench.metrics.fastReleaseCount} />
          </div>
        </div>
      </section>

      <section className="jt-card p-6">
        <SectionTitle icon={ShieldCheck} title="分级审批流程引擎" description="审批通过后由后端自动触发库存、赔付和批次状态联动，避免人工漏执行。" />
        <div className="mt-6 grid gap-5 lg:grid-cols-3">
          <PolicyCard title="一级审批" text="金额低于 1000 元进入一级审批；通过后自动执行联动，拒绝后允许重提 2 次。" />
          <PolicyCard title="二级审批" text="金额大于等于 1000 元或品控异常默认进入二级审批；通过后同事务生成追溯记录。" />
          <PolicyCard title="一致性保护" text="审批提交携带 version 和 idempotency_key，审批与下游联动由后端事务/RPC 串联。" />
        </div>
      </section>

      <section className="jt-card overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-gray-100 p-6 lg:flex-row lg:items-center lg:justify-between">
          <SectionTitle icon={ListFilter} title={approvalView === 'mine' ? '待我处理' : '全部待处理'} description="切换身份会改变待我处理范围；全部待处理用于审计和演示状态机。" compact />
          <div className="inline-flex w-fit rounded-lg border border-gray-200 bg-gray-50 p-1">
            <button
              onClick={() => setApprovalView('mine')}
              className={`rounded-md px-3 py-2 text-xs font-semibold ${approvalView === 'mine' ? 'bg-white text-[#0bada9] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              待我处理
            </button>
            <button
              onClick={() => setApprovalView('all')}
              className={`rounded-md px-3 py-2 text-xs font-semibold ${approvalView === 'all' ? 'bg-white text-[#0bada9] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              全部待处理
            </button>
          </div>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-5 py-4">工单</th>
                <th className="px-5 py-4">类型</th>
                <th className="px-5 py-4">状态</th>
                <th className="px-5 py-4">版本</th>
                <th className="px-5 py-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {pendingRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="border-t border-gray-100 px-5 py-8 text-center text-gray-500">
                    {loading ? '正在加载工单...' : '当前身份暂无可处理工单。'}
                  </td>
                </tr>
              )}
              {pendingRows.map((ticket) => {
                const approveReason = getTicketActionBlockReason({ ticket, actor: currentActor, action: 'approve' })
                const rejectReason = getTicketActionBlockReason({ ticket, actor: currentActor, action: 'reject' })
                const resubmitReason = getTicketActionBlockReason({ ticket, actor: currentActor, action: 'resubmit' })
                const fastReleaseReason = getTicketActionBlockReason({ ticket, actor: currentActor, action: 'fast_release' })
                const hasAvailableAction = ticket.status === 'rejected'
                  ? !resubmitReason
                  : !approveReason || !rejectReason || (ticket.exceptionCategory === 'quality' && !fastReleaseReason)
                const visibleReason = ticket.status === 'rejected'
                  ? resubmitReason
                  : hasAvailableAction ? '' : approveReason || rejectReason || (ticket.exceptionCategory === 'quality' ? fastReleaseReason : '')

                return (
                  <tr key={ticket.id} className="border-t border-gray-100">
                    <td className="px-5 py-4 font-medium">{ticket.id}</td>
                    <td className="px-5 py-4">{ticket.exceptionCategory === 'quality' ? '品控异常' : '物流异常'} · {ticket.exceptionType}</td>
                    <td className="px-5 py-4"><Badge tone="orange">{statusText[ticket.status]}</Badge></td>
                    <td className="px-5 py-4">v{ticket.version}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-2">
                        {ticket.status === 'rejected' ? (
                          <button
                            onClick={() => onResubmit(ticket.id)}
                            title={resubmitReason || undefined}
                            disabled={Boolean(resubmitReason) || busyAction === `resubmit-${ticket.id}`}
                            className="rounded-lg bg-[#0fc6c2] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0bada9] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {busyAction === `resubmit-${ticket.id}` ? '提交中' : '重新提交'}
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => onApprove(ticket.id, 'approved')}
                              title={approveReason || undefined}
                              disabled={Boolean(approveReason) || busyAction === `approve-${ticket.id}-approved`}
                              className="rounded-lg bg-[#0fc6c2] px-3 py-2 text-xs font-semibold text-white hover:bg-[#0bada9] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {busyAction === `approve-${ticket.id}-approved` ? '处理中' : '通过'}
                            </button>
                            <button
                              onClick={() => onApprove(ticket.id, 'rejected')}
                              title={rejectReason || undefined}
                              disabled={Boolean(rejectReason) || busyAction === `approve-${ticket.id}-rejected`}
                              className="rounded-lg border border-orange-200 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {busyAction === `approve-${ticket.id}-rejected` ? '处理中' : '拒绝'}
                            </button>
                            {ticket.exceptionCategory === 'quality' && (
                              <button
                                onClick={() => onFastRelease(ticket.id)}
                                title={fastReleaseReason || undefined}
                                disabled={Boolean(fastReleaseReason) || busyAction === `fast-release-${ticket.id}`}
                                className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {busyAction === `fast-release-${ticket.id}` ? '处理中' : '快速放行'}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                      {visibleReason && (
                        <div className="mt-2 text-xs text-gray-500">{visibleReason}</div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  )
}

function CompensationPanel({
  rows,
  loading,
  pageInfo,
  keyword,
  direction,
  status,
  onKeywordChange,
  onDirectionChange,
  onStatusChange,
  onSearch,
  onResetFilters,
  onPageChange,
}: {
  rows: Record<string, unknown>[]
  loading: boolean
  pageInfo: {
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
  keyword: string
  direction: string
  status: string
  onKeywordChange: (value: string) => void
  onDirectionChange: (value: string) => void
  onStatusChange: (value: string) => void
  onSearch: () => void
  onResetFilters: () => void
  onPageChange: (page: number) => void
}) {
  const submitFiltersOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') onSearch()
  }

  return (
    <section className="jt-card overflow-hidden">
      <SectionTitle icon={CheckCircle2} title="赔付记录" description="集中查看审批通过后自动生成的客户赔付和供应商追偿记录。" />
      <div className="grid gap-3 border-y border-gray-100 px-6 py-4 md:grid-cols-[1fr_1fr_1fr_auto_auto]">
        <input
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="工单号 / 运单号"
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          onKeyDown={submitFiltersOnEnter}
        />
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={direction} onChange={(event) => onDirectionChange(event.target.value)}>
          <option value="">全部赔付方向</option>
          <option value="customer_compensation">赔付客户</option>
          <option value="supplier_recovery">向供应商追偿</option>
        </select>
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={status} onChange={(event) => onStatusChange(event.target.value)}>
          <option value="">全部状态</option>
          <option value="pending_payment">待支付</option>
          <option value="pending_reconciliation">待对账</option>
          <option value="paid">已支付</option>
          <option value="reconciled">已对账</option>
        </select>
        <button
          onClick={onSearch}
          className="jt-btn-primary h-10 px-4 text-sm"
        >
          查询
        </button>
        <button
          onClick={onResetFilters}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          重置
        </button>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-5 py-4">记录</th>
              <th className="px-5 py-4">关联工单</th>
              <th className="px-5 py-4">赔付方向</th>
              <th className="px-5 py-4">金额</th>
              <th className="px-5 py-4">状态</th>
              <th className="px-5 py-4">审批记录</th>
              <th className="px-5 py-4">时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="border-t border-gray-100 px-5 py-8 text-center text-gray-500">
                  {loading ? '正在加载赔付记录...' : '暂无赔付记录'}
                </td>
              </tr>
            )}
            {rows.map((record, index) => (
              <tr key={String(record.id || index)} className="border-t border-gray-100">
                <td className="px-5 py-4 font-mono text-xs">{recordValue(record, ['id'])}</td>
                <td className="px-5 py-4">{traceTicketText(record)}</td>
                <td className="px-5 py-4"><Badge tone={String(recordValue(record, ['direction'])).includes('supplier') ? 'blue' : 'orange'}>{compensationDirectionText(recordValue(record, ['direction']))}</Badge></td>
                <td className="px-5 py-4">¥{recordValue(record, ['amount'])}</td>
                <td className="px-5 py-4">{compensationStatusText(recordValue(record, ['status']))}</td>
                <td className="px-5 py-4 font-mono text-xs">{recordValue(record, ['approvalRecordId', 'approval_record_id'])}</td>
                <td className="px-5 py-4">{formatMetricTime(recordValue(record, ['createdAt', 'created_at']))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TracePagination pageInfo={pageInfo} loading={loading} onPageChange={onPageChange} />
    </section>
  )
}

function InventoryPanel({
  rows,
  loading,
  pageInfo,
  keyword,
  movementType,
  onKeywordChange,
  onMovementTypeChange,
  onSearch,
  onResetFilters,
  onPageChange,
}: {
  rows: Record<string, unknown>[]
  loading: boolean
  pageInfo: {
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
  keyword: string
  movementType: string
  onKeywordChange: (value: string) => void
  onMovementTypeChange: (value: string) => void
  onSearch: () => void
  onResetFilters: () => void
  onPageChange: (page: number) => void
}) {
  const submitFiltersOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') onSearch()
  }

  return (
    <section className="jt-card overflow-hidden">
      <SectionTitle icon={Boxes} title="库存流水" description="集中查看审批执行或品控处理产生的库存联动记录。" />
      <div className="grid gap-3 border-y border-gray-100 px-6 py-4 md:grid-cols-[1fr_1fr_auto_auto]">
        <input
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="工单号 / 运单号"
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
          onKeyDown={submitFiltersOnEnter}
        />
        <select className="rounded-lg border border-gray-200 px-3 py-2 text-sm" value={movementType} onChange={(event) => onMovementTypeChange(event.target.value)}>
          <option value="">全部库存动作</option>
          <option value="stock_out">库存出库</option>
          <option value="stock_in">退货入库</option>
          <option value="status_change">批次状态变更</option>
          <option value="qc_release">品控放行</option>
          <option value="qc_close">品控关闭</option>
        </select>
        <button
          onClick={onSearch}
          className="jt-btn-primary h-10 px-4 text-sm"
        >
          查询
        </button>
        <button
          onClick={onResetFilters}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          重置
        </button>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-5 py-4">流水</th>
              <th className="px-5 py-4">关联工单</th>
              <th className="px-5 py-4">动作</th>
              <th className="px-5 py-4">数量变化</th>
              <th className="px-5 py-4">审批记录</th>
              <th className="px-5 py-4">备注</th>
              <th className="px-5 py-4">时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="border-t border-gray-100 px-5 py-8 text-center text-gray-500">
                  {loading ? '正在加载库存流水...' : '暂无库存流水'}
                </td>
              </tr>
            )}
            {rows.map((record, index) => (
              <tr key={String(record.id || index)} className="border-t border-gray-100">
                <td className="px-5 py-4 font-mono text-xs">{recordValue(record, ['id'])}</td>
                <td className="px-5 py-4">{traceTicketText(record)}</td>
                <td className="px-5 py-4"><Badge tone="gray">{inventoryMovementText(recordValue(record, ['movementType', 'movement_type']))}</Badge></td>
                <td className="px-5 py-4">{recordValue(record, ['quantityDelta', 'quantity_delta'])}</td>
                <td className="px-5 py-4 font-mono text-xs">{recordValue(record, ['approvalRecordId', 'approval_record_id'])}</td>
                <td className="px-5 py-4">{recordValue(record, ['remark'])}</td>
                <td className="px-5 py-4">{formatMetricTime(recordValue(record, ['createdAt', 'created_at']))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TracePagination pageInfo={pageInfo} loading={loading} onPageChange={onPageChange} />
    </section>
  )
}

function TracePagination({
  pageInfo,
  loading,
  onPageChange,
}: {
  pageInfo: {
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
  loading: boolean
  onPageChange: (page: number) => void
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-gray-100 px-6 py-4 text-sm text-gray-600 md:flex-row md:items-center md:justify-between">
      <span>
        共 {pageInfo.total} 条，每页 {pageInfo.pageSize} 条，第 {pageInfo.page} / {pageInfo.totalPages} 页
      </span>
      <div className="flex flex-wrap gap-2">
        <button
          disabled={pageInfo.page <= 1 || loading}
          onClick={() => onPageChange(1)}
          className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          首页
        </button>
        <button
          disabled={pageInfo.page <= 1 || loading}
          onClick={() => onPageChange(Math.max(1, pageInfo.page - 1))}
          className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          上一页
        </button>
        <button
          disabled={pageInfo.page >= pageInfo.totalPages || loading}
          onClick={() => onPageChange(Math.min(pageInfo.totalPages, pageInfo.page + 1))}
          className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          下一页
        </button>
        <button
          disabled={pageInfo.page >= pageInfo.totalPages || loading}
          onClick={() => onPageChange(pageInfo.totalPages)}
          className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          末页
        </button>
      </div>
    </div>
  )
}

function RulesPanel() {
  const [rows, setRows] = useState<RuleDisplayRow[]>([])
  const [approvalRules, setApprovalRules] = useState<Record<string, unknown>[]>([])
  const [qualityRules, setQualityRules] = useState<Record<string, unknown>[]>([])
  const [loadError, setLoadError] = useState('')
  const [ruleTypeFilter, setRuleTypeFilter] = useState('all')
  const [ruleNameFilter, setRuleNameFilter] = useState('')
  const [ruleCodeFilter, setRuleCodeFilter] = useState('')
  const [ruleStatusFilter, setRuleStatusFilter] = useState('all')
  const [appliedRuleFilters, setAppliedRuleFilters] = useState(defaultRuleFilters)
  const [rulePage, setRulePage] = useState(1)
  const [ruleModalOpen, setRuleModalOpen] = useState(false)
  const [ruleModalMode, setRuleModalMode] = useState<'create' | 'edit'>('create')
  const [ruleForm, setRuleForm] = useState<RuleFormState>(() => createDefaultRuleForm())
  const rulePageSize = 10
  const pagedRules = useMemo(() => filterAndPaginateRuleRows(rows, {
    mode: appliedRuleFilters.mode,
    name: appliedRuleFilters.name,
    code: appliedRuleFilters.code,
    status: appliedRuleFilters.status,
    page: rulePage,
    pageSize: rulePageSize,
  }), [rows, appliedRuleFilters, rulePage])

  useEffect(() => {
    let mounted = true

    loadRules(mounted)

    return () => {
      mounted = false
    }
  }, [])

  const loadRules = async (mounted = true) => {
    try {
      const response = await fetch('/api/rules')
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || '规则加载失败')
      if (!mounted) return
      setRows(Array.isArray(data.rows) ? data.rows : [])
      setApprovalRules(Array.isArray(data.approvalRules) ? data.approvalRules : [])
      setQualityRules(Array.isArray(data.qualityRules) ? data.qualityRules : [])
      setLoadError('')
    } catch (error) {
      if (mounted) setLoadError(error instanceof Error ? error.message : '规则加载失败')
    }
  }

  const updateRuleForm = (field: keyof RuleFormState, value: string | boolean) => {
    setRuleForm((current) => ({ ...current, [field]: value }))
  }

  const handleSaveRule = async () => {
    try {
      const response = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ruleForm),
      })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || '保存规则失败')
      await loadRules()
      setRuleModalOpen(false)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '保存规则失败')
    }
  }

  const handleDisableRule = async (row: RuleDisplayRow) => {
    try {
      const response = await fetch(`/api/rules?mode=${encodeURIComponent(row.mode)}&code=${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      })
      const data = await response.json()
      if (!response.ok || data.error) throw new Error(data.error || '停用规则失败')
      await loadRules()
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '停用规则失败')
    }
  }

  const handleEditRule = (row: RuleDisplayRow) => {
    if (row.mode === 'approval') {
      const rule = approvalRules.find((item) => String(item.code) === row.id) || {}
      setRuleForm({
        ...createDefaultRuleForm(),
        mode: 'approval',
        code: String(rule.code || row.id),
        name: String(rule.name || row.name || row.id),
        minAmount: String(rule.minAmount ?? ''),
        maxAmount: rule.maxAmount === null || rule.maxAmount === undefined ? '' : String(rule.maxAmount),
        level: String(rule.level || 'level1_reviewing'),
        enabled: rule.enabled !== false,
      })
      setRuleModalMode('edit')
      setRuleModalOpen(true)
      return
    }

    const rule = qualityRules.find((item) => String(item.code) === row.id) || {}
    const condition = rule.condition as Record<string, unknown> | undefined
    setRuleForm({
      ...createDefaultRuleForm(),
      mode: 'quality',
      code: String(rule.code || row.id),
      name: String(rule.name || row.name || rule.subtype || row.id),
      subtype: String(rule.subtype || ''),
      severity: String(rule.severity || 'medium'),
      conditionField: String(condition?.field || ''),
      conditionOperator: String(condition?.operator || 'gte'),
      conditionValue: String(condition?.value ?? ''),
      entryLevel: String(rule.entryLevel || 'level1_reviewing'),
      enabled: rule.enabled !== false,
    })
    setRuleModalMode('edit')
    setRuleModalOpen(true)
  }

  const handleCreateRule = () => {
    setRuleForm(createDefaultRuleForm())
    setRuleModalMode('create')
    setRuleModalOpen(true)
  }

  const handleRuleSearch = () => {
    setRulePage(1)
    setAppliedRuleFilters({
      mode: ruleTypeFilter,
      name: ruleNameFilter,
      code: ruleCodeFilter,
      status: ruleStatusFilter,
    })
  }

  const handleRuleReset = () => {
    setRuleTypeFilter(defaultRuleFilters.mode)
    setRuleNameFilter(defaultRuleFilters.name)
    setRuleCodeFilter(defaultRuleFilters.code)
    setRuleStatusFilter(defaultRuleFilters.status)
    setRulePage(1)
    setAppliedRuleFilters(defaultRuleFilters)
  }

  const submitRuleFiltersOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') handleRuleSearch()
  }

  return (
    <section className="jt-card p-6">
      <SectionTitle icon={Settings2} title="规则配置中心" description="审批阈值和品控触发条件必须落库配置，延续 V2 规则引擎理念。" />
      {loadError && (
        <div className="mt-5 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-700">
          {loadError}
        </div>
      )}

      <div className="mt-6 border-b border-gray-100 pb-5">
        <div className="grid gap-3 lg:grid-cols-[150px_1fr_1fr_150px_auto_auto_auto]">
          <select
            className="h-10 rounded-lg border border-gray-200 px-3 text-sm"
            value={ruleTypeFilter}
            onChange={(event) => setRuleTypeFilter(event.target.value)}
          >
            <option value="all">全部类型</option>
            <option value="approval">审批规则</option>
            <option value="quality">品控规则</option>
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              className="h-10 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm"
              placeholder="规则名称"
              value={ruleNameFilter}
              onChange={(event) => setRuleNameFilter(event.target.value)}
              onKeyDown={submitRuleFiltersOnEnter}
            />
          </div>
          <input
            className="h-10 rounded-lg border border-gray-200 px-3 text-sm"
            placeholder="规则编码"
            value={ruleCodeFilter}
            onChange={(event) => setRuleCodeFilter(event.target.value)}
            onKeyDown={submitRuleFiltersOnEnter}
          />
          <select
            className="h-10 rounded-lg border border-gray-200 px-3 text-sm"
            value={ruleStatusFilter}
            onChange={(event) => setRuleStatusFilter(event.target.value)}
          >
            <option value="all">全部状态</option>
            <option value="enabled">启用</option>
            <option value="disabled">停用</option>
          </select>
          <button onClick={handleRuleSearch} className="jt-btn-primary h-10 px-5">
            查询
          </button>
          <button onClick={handleRuleReset} className="h-10 rounded-lg border border-gray-200 px-5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            重置
          </button>
          <button onClick={handleCreateRule} className="jt-btn-primary h-10 w-fit px-5">
            <Plus className="h-4 w-4" />
            新建规则
          </button>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl border border-gray-200">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-5 py-4">规则名称</th>
                <th className="px-5 py-4">规则编码</th>
                <th className="px-5 py-4">类型</th>
                <th className="px-5 py-4">条件</th>
                <th className="px-5 py-4">动作</th>
                <th className="px-5 py-4">状态</th>
                <th className="px-5 py-4">操作</th>
              </tr>
            </thead>
            <tbody>
              {pagedRules.rows.length === 0 && !loadError && (
                <tr>
                  <td colSpan={7} className="border-t border-gray-100 px-5 py-8 text-center text-gray-500">
                    {rows.length === 0 ? '正在加载规则配置...' : '没有匹配的规则'}
                  </td>
                </tr>
              )}
              {pagedRules.rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-5 py-4 font-semibold text-gray-800">{row.name || row.id}</td>
                  <td className="px-5 py-4 font-mono text-xs text-gray-600">{row.id}</td>
                  <td className="px-5 py-4"><Badge tone={row.mode === 'quality' ? 'blue' : 'gray'}>{row.mode === 'quality' ? '品控规则' : '审批规则'}</Badge></td>
                  <td className="px-5 py-4 text-gray-600">{row.condition}</td>
                  <td className="px-5 py-4 font-medium text-[#0bada9]">{row.action}</td>
                  <td className="px-5 py-4"><Badge tone={row.enabled ? 'green' : 'gray'}>{row.enabled ? '启用' : '停用'}</Badge></td>
                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      <button onClick={() => handleEditRule(row)} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                        编辑
                      </button>
                      {row.enabled && (
                        <button onClick={() => handleDisableRule(row)} className="rounded-lg border border-orange-200 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-50">
                          停用
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 border-t border-gray-100 pt-5 text-sm text-gray-600 md:flex-row md:items-center md:justify-between">
        <span>共 {pagedRules.total} 条，第 {pagedRules.page} / {pagedRules.totalPages} 页</span>
        <div className="flex flex-wrap gap-2">
          <button disabled={pagedRules.page <= 1} onClick={() => setRulePage(1)} className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40">首页</button>
          <button disabled={pagedRules.page <= 1} onClick={() => setRulePage(Math.max(1, pagedRules.page - 1))} className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40">上一页</button>
          <button disabled={pagedRules.page >= pagedRules.totalPages} onClick={() => setRulePage(Math.min(pagedRules.totalPages, pagedRules.page + 1))} className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40">下一页</button>
          <button disabled={pagedRules.page >= pagedRules.totalPages} onClick={() => setRulePage(pagedRules.totalPages)} className="rounded-lg border border-gray-200 px-3 py-2 font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40">末页</button>
        </div>
      </div>

      {ruleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-5 py-8">
          <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-7 py-5">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{ruleModalMode === 'create' ? '新建规则' : '规则编辑'}</h3>
                <p className="mt-1 text-sm text-gray-500">{ruleForm.mode === 'quality' ? '品控规则会影响扫描暂扣与审批入口。' : '审批规则会影响工单进入一级或二级审批。'}</p>
              </div>
              <button onClick={() => setRuleModalOpen(false)} className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50" aria-label="关闭弹框">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 p-7">
              <div className="grid gap-4 lg:grid-cols-[180px_1fr_1fr]">
                <label className="text-sm font-medium text-gray-700">
                  规则类型
                  <select
                    className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
                    value={ruleForm.mode}
                    onChange={(event) => updateRuleForm('mode', event.target.value as RuleFormState['mode'])}
                  >
                    <option value="approval">审批规则</option>
                    <option value="quality">品控规则</option>
                  </select>
                </label>
                <label className="text-sm font-medium text-gray-700">
                  规则名称
                  <input
                    className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
                    placeholder="例如：外观破损暂扣"
                    value={ruleForm.name}
                    onChange={(event) => updateRuleForm('name', event.target.value)}
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  规则编码
                  <input
                    className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
                    placeholder="例如：QR-DAMAGE-03"
                    value={ruleForm.code}
                    onChange={(event) => updateRuleForm('code', event.target.value)}
                  />
                </label>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                {ruleForm.mode === 'approval' ? (
                  <>
                    <label className="text-sm font-medium text-gray-700">
                      最小金额
                      <input className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" placeholder="0" value={ruleForm.minAmount} onChange={(event) => updateRuleForm('minAmount', event.target.value)} />
                    </label>
                    <label className="text-sm font-medium text-gray-700">
                      最大金额
                      <input className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" placeholder="可为空" value={ruleForm.maxAmount} onChange={(event) => updateRuleForm('maxAmount', event.target.value)} />
                    </label>
                    <label className="text-sm font-medium text-gray-700">
                      目标审批层级
                      <select className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" value={ruleForm.level} onChange={(event) => updateRuleForm('level', event.target.value)}>
                        <option value="level1_reviewing">一级审批</option>
                        <option value="level2_reviewing">二级审批</option>
                      </select>
                    </label>
                  </>
                ) : (
                  <>
                    <label className="text-sm font-medium text-gray-700">
                      异常子类型
                      <input className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" placeholder="例如：外观破损" value={ruleForm.subtype} onChange={(event) => updateRuleForm('subtype', event.target.value)} />
                    </label>
                    <label className="text-sm font-medium text-gray-700">
                      条件字段
                      <input className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" placeholder="例如：damageLevel" value={ruleForm.conditionField} onChange={(event) => updateRuleForm('conditionField', event.target.value)} />
                    </label>
                    <label className="text-sm font-medium text-gray-700">
                      入口审批层级
                      <select className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" value={ruleForm.entryLevel} onChange={(event) => updateRuleForm('entryLevel', event.target.value)}>
                        <option value="level1_reviewing">一级审批</option>
                        <option value="level2_reviewing">二级审批</option>
                      </select>
                    </label>
                  </>
                )}
              </div>

              {ruleForm.mode === 'quality' && (
                <div className="grid gap-4 md:grid-cols-3">
                  <label className="text-sm font-medium text-gray-700">
                    条件操作符
                    <select className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" value={ruleForm.conditionOperator} onChange={(event) => updateRuleForm('conditionOperator', event.target.value)}>
                      <option value="gte">大于等于</option>
                      <option value="gt">大于</option>
                      <option value="eq">等于</option>
                      <option value="lte">小于等于</option>
                    </select>
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    条件值
                    <input className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" placeholder="例如：3" value={ruleForm.conditionValue} onChange={(event) => updateRuleForm('conditionValue', event.target.value)} />
                  </label>
                  <label className="text-sm font-medium text-gray-700">
                    严重程度
                    <select className="mt-2 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm" value={ruleForm.severity} onChange={(event) => updateRuleForm('severity', event.target.value)}>
                      <option value="medium">中</option>
                      <option value="high">高</option>
                      <option value="low">低</option>
                    </select>
                  </label>
                </div>
              )}

              <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-white pt-4">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input type="checkbox" checked={ruleForm.enabled} onChange={(event) => updateRuleForm('enabled', event.target.checked)} />
                  启用
                </label>
                <div className="flex gap-2">
                  <button onClick={() => setRuleModalOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">取消</button>
                  <button onClick={handleSaveRule} className="jt-btn-primary h-10 px-5">保存规则</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function MonitoringPanel({
  logRows,
  summary,
  loading,
  pageInfo,
  requestIdFilter,
  endpointFilter,
  onRequestIdFilterChange,
  onEndpointFilterChange,
  onSearch,
  onResetFilters,
  onPageChange,
}: {
  logRows: IntegrationLog[]
  summary: { lastSyncAt: string; successRate: number; degradedCount: number }
  loading: boolean
  pageInfo: {
    total: number
    page: number
    pageSize: number
    totalPages: number
  }
  requestIdFilter: string
  endpointFilter: string
  onRequestIdFilterChange: (value: string) => void
  onEndpointFilterChange: (value: string) => void
  onSearch: () => void
  onResetFilters: () => void
  onPageChange: (page: number) => void
}) {
  const hasLogs = logRows.length > 0
  const submitFiltersOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') onSearch()
  }

  return (
    <section className="jt-card overflow-hidden">
      <SectionTitle icon={Activity} title="跨系统接口与同步监控" description="每次 V2 调用都生成 Request ID，并写入 V3 接口同步日志。" />
      <div className="grid gap-5 border-y border-gray-100 bg-gray-50 p-6 md:grid-cols-3">
        <MiniMetric label="最近同步" value={formatMetricTime(summary.lastSyncAt)} />
        <MiniMetric label="成功率" value={loading || !hasLogs ? '-' : `${summary.successRate}%`} />
        <MiniMetric label="降级次数" value={loading || !hasLogs ? '-' : summary.degradedCount} />
      </div>
      <div className="grid gap-3 border-b border-gray-100 px-6 py-4 md:grid-cols-[1fr_1fr_auto_auto]">
        <input
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="Request ID"
          value={requestIdFilter}
          onChange={(event) => onRequestIdFilterChange(event.target.value)}
          onKeyDown={submitFiltersOnEnter}
        />
        <input
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
          placeholder="接口路径"
          value={endpointFilter}
          onChange={(event) => onEndpointFilterChange(event.target.value)}
          onKeyDown={submitFiltersOnEnter}
        />
        <button
          onClick={onSearch}
          className="jt-btn-primary h-10 px-4 text-sm"
        >
          查询
        </button>
        <button
          onClick={onResetFilters}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          重置
        </button>
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-5 py-4">Request ID</th>
              <th className="px-5 py-4">接口</th>
              <th className="px-5 py-4">请求摘要</th>
              <th className="px-5 py-4">状态</th>
              <th className="px-5 py-4">耗时</th>
              <th className="px-5 py-4">说明</th>
            </tr>
          </thead>
          <tbody>
            {logRows.length === 0 && (
              <tr>
                <td colSpan={6} className="border-t border-gray-100 px-5 py-8 text-center text-gray-500">
                  {loading ? '正在加载接口日志...' : '暂无接口日志'}
                </td>
              </tr>
            )}
            {logRows.map((log) => (
              <tr key={log.id} className="border-t border-gray-100">
                <td className="px-5 py-4 font-mono text-xs">{log.requestId}</td>
                <td className="px-5 py-4">{log.endpoint}</td>
                <td className="px-5 py-4 font-mono text-xs text-gray-600">{log.requestDigest || '-'}</td>
                <td className="px-5 py-4"><Badge tone={log.status === 'success' ? 'green' : 'orange'}>{integrationLogStatusText(log.status)}</Badge></td>
                <td className="px-5 py-4">{log.durationMs} ms</td>
                <td className="px-5 py-4">{log.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <TracePagination pageInfo={pageInfo} loading={loading} onPageChange={onPageChange} />
    </section>
  )
}

function messageToneClass(tone: MessageTone) {
  if (tone === 'error') return 'border-red-200 bg-red-50 text-red-700'
  if (tone === 'success') return 'border-[#d0e8e8] bg-[#e8fafa] text-[#0b7774]'
  return 'border-gray-200 bg-gray-50 text-gray-600'
}

function integrationLogStatusText(status: IntegrationLog['status']) {
  const labels: Record<IntegrationLog['status'], string> = {
    success: '成功',
    failed: '失败',
    degraded: '降级',
  }
  return labels[status] || status
}

function batchStatusText(status: ScanRecord['batchStatus']) {
  const labels: Record<ScanRecord['batchStatus'], string> = {
    available: '可用',
    qc_hold: '品控暂扣',
    qc_released: '已放行',
    returned_supplier: '退供应商',
    repurchasing: '重采购',
    downgraded: '降级处理',
  }
  return labels[status] || status
}

function traceTicketText(record: Record<string, unknown>) {
  const nestedTicket = record.exception_tickets as Record<string, unknown> | undefined
  const ticketNo = firstRecordValue(record, ['ticketNo', 'ticket_no', 'ticketId', 'ticket_id'])
    || firstRecordValue(nestedTicket || {}, ['ticket_no'])
  const waybillNo = firstRecordValue(record, ['waybillNo', 'waybill_no'])
    || firstRecordValue(nestedTicket || {}, ['waybill_no'])
  return [ticketNo, waybillNo].filter(Boolean).join(' / ') || '-'
}

function compensationDirectionText(value: string) {
  const labels: Record<string, string> = {
    customer_compensation: '赔付客户',
    supplier_recovery: '向供应商追偿',
  }
  return labels[value] || value || '-'
}

function compensationStatusText(value: string) {
  const labels: Record<string, string> = {
    pending_payment: '待支付',
    pending_reconciliation: '待对账',
    paid: '已支付',
    reconciled: '已对账',
  }
  return labels[value] || value || '-'
}

function inventoryMovementText(value: string) {
  const labels: Record<string, string> = {
    stock_out: '库存出库',
    stock_in: '退货入库',
    status_change: '批次状态变更',
    qc_release: '品控放行',
    qc_close: '品控关闭',
  }
  return labels[value] || value || '-'
}

function formatMetricTime(value: string) {
  if (!value || value === '-') return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function firstRecordValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (value === null || value === undefined || value === '') continue
    return typeof value === 'object' ? JSON.stringify(value) : String(value)
  }
  return ''
}

function TicketTable({
  rows,
  onSelectTicket,
  reasonForTicket,
  emptyText = '暂无工单',
}: {
  rows: ExceptionTicket[]
  onSelectTicket?: (ticketId: string) => void
  reasonForTicket?: (ticket: ExceptionTicket) => string
  emptyText?: string
}) {
  const hasActions = Boolean(onSelectTicket)
  const columnCount = 7 + (reasonForTicket ? 1 : 0) + (hasActions ? 1 : 0)

  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[1180px] text-sm">
        <thead className="bg-gray-50 text-left text-gray-500">
          <tr>
            <th className="px-5 py-4">工单</th>
            <th className="px-5 py-4">运单</th>
            <th className="px-5 py-4">来源/类型</th>
            <th className="px-5 py-4">金额</th>
            <th className="px-5 py-4">状态</th>
            <th className="px-5 py-4">当前处理人</th>
            <th className="px-5 py-4">超时</th>
            {reasonForTicket && <th className="px-5 py-4">关键原因</th>}
            {hasActions && <th className="px-5 py-4 text-right">操作</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columnCount} className="border-t border-gray-100 px-5 py-8 text-center text-gray-500">
                {emptyText}
              </td>
            </tr>
          )}
          {rows.map((ticket) => (
            <tr key={ticket.id} className="border-t border-gray-100 hover:bg-gray-50">
              <td className="px-5 py-4 font-medium text-gray-800">
                <div>{ticket.id}</div>
              </td>
              <td className="px-5 py-4">{ticket.waybillNo}</td>
              <td className="px-5 py-4">
                <Badge tone={ticket.source === 'scan_triggered' ? 'blue' : 'gray'}>{ticket.source === 'scan_triggered' ? '扫描触发' : '手工上报'}</Badge>
                <span className="ml-2 text-gray-600">{ticket.exceptionType}</span>
              </td>
              <td className="px-5 py-4">¥{ticket.amount}</td>
              <td className="px-5 py-4"><Badge tone={ticket.status === 'completed' ? 'green' : 'orange'}>{statusText[ticket.status]}</Badge></td>
              <td className="px-5 py-4">{ticket.currentApprover}</td>
              <td className="px-5 py-4 text-orange-600">{ticket.status === 'level2_reviewing' ? '2 小时内' : '-'}</td>
              {reasonForTicket && (
                <td className="px-5 py-4">
                  <Badge tone={reasonForTicket(ticket) === '即将超时' ? 'orange' : ticket.exceptionCategory === 'quality' ? 'blue' : 'gray'}>
                    {reasonForTicket(ticket)}
                  </Badge>
                </td>
              )}
              {hasActions && (
                <td className="px-5 py-4 text-right">
                  <button
                    onClick={() => onSelectTicket?.(ticket.id)}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    查看
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TicketDetailPanel({
  selectedTicketId,
  detail,
  loading,
  onClose,
}: {
  selectedTicketId: string
  detail: TicketDetail | null
  loading: boolean
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/45 p-4">
      <section className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <SectionTitle
            icon={FileSearch}
            title="工单详情与审计轨迹"
            description="展示审批、品控扫描、库存联动、赔付记录和执行事件，便于核对闭环证据。"
            compact
          />
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="关闭工单详情">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          {loading && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
              正在加载 {selectedTicketId} 的审计轨迹...
            </div>
          )}

          {!loading && !detail && (
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-6 text-sm text-orange-700">
              未读取到 {selectedTicketId} 的详情。
            </div>
          )}

          {detail && !loading && (
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <DetailMetric label="工单号" value={detail.ticket.id} />
                <DetailMetric label="运单号" value={detail.ticket.waybillNo} />
                <DetailMetric label="状态" value={statusText[detail.ticket.status] || detail.ticket.status} />
                <DetailMetric label="版本" value={`v${detail.ticket.version}`} />
              </div>

              <div className="grid gap-5 xl:grid-cols-2">
                <AuditList
                  title="审批记录"
                  rows={detail.approvals}
                  fields={[
                    { label: '审批人', keys: ['approver_id', 'approverId'] },
                    { label: '层级', keys: ['approval_level', 'approvalLevel'] },
                    { label: '结果', keys: ['result'] },
                    { label: '意见', keys: ['opinion'] },
                  ]}
                />
                <AuditList
                  title="扫描记录"
                  rows={detail.scans as unknown as Record<string, unknown>[]}
                  fields={[
                    { label: 'SKU', keys: ['skuCode', 'sku_code'] },
                    { label: '批次', keys: ['batchNo', 'batch_no'] },
                    { label: '结果', keys: ['result'] },
                    { label: '批次状态', keys: ['batchStatus', 'batch_status'] },
                  ]}
                />
                <AuditList
                  title="赔付记录"
                  rows={detail.compensations}
                  fields={[
                    { label: '方向', keys: ['direction'] },
                    { label: '金额', keys: ['amount'] },
                    { label: '状态', keys: ['status'] },
                    { label: '审批记录', keys: ['approval_record_id', 'approvalRecordId'] },
                  ]}
                />
                <AuditList
                  title="库存流水"
                  rows={detail.inventoryMovements}
                  fields={[
                    { label: '类型', keys: ['movement_type', 'movementType'] },
                    { label: '数量', keys: ['quantity_delta', 'quantityDelta'] },
                    { label: '备注', keys: ['remark'] },
                    { label: '审批记录', keys: ['approval_record_id', 'approvalRecordId'] },
                  ]}
                />
              </div>

              <AuditList
                title="事件日志"
                rows={detail.events}
                fields={[
                  { label: '事件', keys: ['event_type', 'eventType'] },
                  { label: '操作者', keys: ['actor_id', 'actorId'] },
                  { label: '明细', keys: ['detail'] },
                  { label: '时间', keys: ['created_at', 'createdAt'] },
                ]}
              />
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function DetailMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-2 break-words text-sm font-semibold text-gray-900">{value}</div>
    </div>
  )
}

type AuditField = {
  label: string
  keys: string[]
}

function AuditList({
  title,
  rows,
  fields,
}: {
  title: string
  rows: Record<string, unknown>[]
  fields: AuditField[]
}) {
  return (
    <div className="rounded-xl border border-gray-200">
      <div className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-800">{title}</div>
      <div className="divide-y divide-gray-100">
        {rows.length === 0 && (
          <div className="px-4 py-5 text-sm text-gray-500">暂无记录</div>
        )}
        {rows.map((row, index) => (
          <div key={String(row.id || index)} className="grid gap-3 px-4 py-4 text-sm md:grid-cols-2">
            {fields.map((field) => (
              <div key={field.label}>
                <div className="text-xs text-gray-500">{field.label}</div>
                <div className="mt-1 break-words font-medium text-gray-800">{recordValue(row, field.keys)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function recordValue(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key]
    if (value === null || value === undefined || value === '') continue
    return typeof value === 'object' ? JSON.stringify(value) : String(value)
  }
  return '-'
}

function StatCard({ icon: Icon, label, value, hint }: { icon: typeof Gauge; label: string; value: number | string; hint: string }) {
  return (
    <div className="jt-card min-h-[156px] p-6">
      <div className="flex items-center justify-between">
        <div className="rounded-lg bg-[#e8fafa] p-2 text-[#0bada9]"><Icon className="h-5 w-5" /></div>
        <span className="text-2xl font-semibold text-gray-900">{value}</span>
      </div>
      <p className="mt-5 text-base font-medium text-gray-800">{label}</p>
      <p className="mt-2 text-sm text-gray-500">{hint}</p>
    </div>
  )
}

function RequiredLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <label className={`block text-sm font-medium text-gray-700 ${className}`}>
      <span className="mr-1 text-red-500">*</span>
      {children}
    </label>
  )
}

function MiniMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-4">
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      <div className="mt-1 text-xs text-gray-500">{label}</div>
    </div>
  )
}

function SectionTitle({ icon: Icon, title, description, compact = false }: { icon: typeof Gauge; title: string; description: string; compact?: boolean }) {
  return (
    <div className={compact ? '' : 'p-6'}>
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-[#0fc6c2]" />
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      </div>
      <p className="mt-2 text-sm leading-6 text-gray-500">{description}</p>
    </div>
  )
}

function FlowStep({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-2 font-semibold text-gray-800">
        <CheckCircle2 className="h-4 w-4 text-[#0fc6c2]" />
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-gray-500">{text}</p>
    </div>
  )
}

function PolicyCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
      <div className="flex items-center gap-2 font-semibold text-gray-800">
        <Boxes className="h-4 w-4 text-[#0fc6c2]" />
        {title}
      </div>
      <p className="mt-2 text-sm leading-6 text-gray-500">{text}</p>
    </div>
  )
}

function Badge({ children, tone }: { children: ReactNode; tone: 'green' | 'orange' | 'blue' | 'gray' }) {
  const className = {
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    orange: 'bg-orange-50 text-orange-700 ring-orange-200',
    blue: 'bg-sky-50 text-sky-700 ring-sky-200',
    gray: 'bg-gray-100 text-gray-600 ring-gray-200',
  }[tone]

  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ring-1 ${className}`}>{children}</span>
}
