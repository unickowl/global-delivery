import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

interface BootContextValue {
  visible: boolean
  epoch: number
  replay: () => void
  /** Globally enables/disables boot reveal animation. Always true after first mount. */
  ready: boolean
}

const BootContext = createContext<BootContextValue>({
  visible: true,
  epoch: 0,
  replay: () => undefined,
  ready: false,
})

export function FuturisticPanelProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false)
  const [epoch, setEpoch] = useState(0)
  const [ready, setReady] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  // Trigger initial boot reveal one frame after mount so all FuturisticPanel
  // children have measured their size first.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setReady(true)
      setVisible(true)
    }, 50)
    return () => window.clearTimeout(id)
  }, [])

  const replay = useCallback(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current)
    setVisible(false)
    timeoutRef.current = window.setTimeout(() => {
      setVisible(true)
      setEpoch((e) => e + 1)
      timeoutRef.current = null
    }, 1250)
  }, [])

  return (
    <BootContext.Provider value={{ visible, epoch, replay, ready }}>
      {children}
    </BootContext.Provider>
  )
}

export function useBoot() {
  return useContext(BootContext)
}
