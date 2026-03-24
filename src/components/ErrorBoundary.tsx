import React from 'react'
import ErrorScreen from '@/screens/ErrorScreen'
import { kvSet } from '@/storage/cloudStorage'
import type { AppErrorReport } from '@/types'

interface State {
  hasError: boolean
}

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, info)
    const report: AppErrorReport = {
      message: error.message,
      stack: error.stack ?? '',
      componentStack: info.componentStack ?? '',
      url: window.location.href,
      timestamp: new Date().toISOString(),
    }
    void kvSet(`errors:${Date.now()}`, report)
  }

  render() {
    if (this.state.hasError) {
      return <ErrorScreen />
    }
    return this.props.children
  }
}
