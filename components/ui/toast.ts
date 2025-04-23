"use client"

import type { ToastAction } from "@/components/ui/toast"

import * as React from "react"

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast/toast"

import { useToast as useToastHooks } from "@/components/ui/toast/use-toast"

export { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport, useToastHooks }

let count = 0

function genId() {
  return `toast-${count++}`
}

type ToastProps = {
  id?: string
  title?: string
  description?: string
  action?: React.ReactNode
  duration?: number
  open?: boolean
  onOpenChange?: (open: boolean) => void
  variant?: "default" | "destructive"
}

function toast(props: ToastProps) {
  const id = props.id || genId()
  const newToast = {
    ...props,
    id,
    open: true,
    onOpenChange: (open: boolean) => {
      if (!open) {
        removeToast(id)
      }
      props.onOpenChange?.(open)
    },
  }
  addToast(newToast)
  return id
}

function removeToast(id: string) {
  update((s) => {
    return {
      ...s,
      toasts: s.toasts.filter((t) => t.id !== id),
    }
  })
}

type State = {
  toasts: ToastProps[]
}

type Action = {
  addToast: (toast: ToastProps) => void
  updateToast: (toast: ToastProps) => void
  removeToast: (id: string) => void
}

type UpdateFn = (old: State) => State

const DEFAULT_STATE: State = {
  toasts: [],
}

const stateContext = React.createContext<State>(DEFAULT_STATE)
const updateContext = React.createContext<((fn: UpdateFn) => void) | null>(null)

function ToastContextProvider({
  children,
  ...props
}: {
  children: React.ReactNode
}) {
  const [state, setState] = React.useState<State>(DEFAULT_STATE)

  const update = React.useCallback((fn: UpdateFn) => {
    setState((oldState: State) => {
      return fn(oldState)
    })
  }, [])

  const value = React.useMemo(() => {
    return {
      ...state,
    }
  }, [state])

  return (
    <updateContext.Provider value={update}>
      <stateContext.Provider value={value} {...props}>
        {children}
      </stateContext.Provider>
    </updateContext.Provider>
  )
}

function useToast() {
  const context = React.useContext(stateContext)
  if (!context) {
    throw new Error("useToast must be used within a ToastContextProvider")
  }
  return {
    ...context,
    toast,
    removeToast,
  }
}

function addToast(toast: ToastProps) {
  update((s) => {
    return {
      ...s,
      toasts: [...s.toasts, toast],
    }
  })
}

function updateToast(toast: ToastProps) {
  update((s) => {
    return {
      ...s,
      toasts: s.toasts.map((t) => {
        if (t.id === toast.id) {
          return { ...t, ...toast }
        }
        return t
      }),
    }
  })
}

export { useToast, ToastContextProvider, update, addToast, updateToast }

export type { ToastProps }

export type ToastActionElement = React.ReactElement<typeof ToastAction>
