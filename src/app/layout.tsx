import type { Metadata } from 'next'
import '../styles/globals.css'

export const metadata: Metadata = {
  title: '运单全流程管理系统 V3',
  description: '扫描品控、异常上报、分级审批与执行联动',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-[#f7f8fa]">{children}</body>
    </html>
  )
}
