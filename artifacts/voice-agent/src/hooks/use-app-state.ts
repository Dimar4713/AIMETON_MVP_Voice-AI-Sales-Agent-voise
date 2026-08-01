import { useCallback, useMemo, useState } from 'react';

export type CallStatus =
  | 'idle'
  | 'requesting-mic'
  | 'connecting'
  | 'active'
  | 'ending';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: LogLevel;
  message: string;
}

export interface KeyStatus {
  keySaved: boolean;
  maskedKey: string | null;
}

export interface AgentStatus {
  hasAgent: boolean;
  agentId: string | null;
}

let logCounter = 0;
function nextLogId() {
  logCounter += 1;
  return `log-${Date.now()}-${logCounter}`;
}

/**
 * Central UI state for the voice agent command center: key/agent/call
 * status plus the running event log. This hook does not talk to the
 * network itself -- callers (App, useConversation) push updates into it.
 */
export function useAppState() {
  const [keyStatus, setKeyStatus] = useState<KeyStatus>({
    keySaved: false,
    maskedKey: null,
  });
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({
    hasAgent: false,
    agentId: null,
  });
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback((level: LogLevel, message: string) => {
    setLogs((prev) => {
      const next = [
        ...prev,
        { id: nextLogId(), timestamp: new Date(), level, message },
      ];
      // Keep the log buffer bounded so a long-running session doesn't
      // balloon memory or DOM nodes.
      if (next.length > 300) {
        return next.slice(next.length - 300);
      }
      return next;
    });
  }, []);

  const clearLogs = useCallback(() => setLogs([]), []);

  return useMemo(
    () => ({
      keyStatus,
      setKeyStatus,
      agentStatus,
      setAgentStatus,
      callStatus,
      setCallStatus,
      logs,
      addLog,
      clearLogs,
    }),
    [keyStatus, agentStatus, callStatus, logs, addLog, clearLogs],
  );
}

export type AppState = ReturnType<typeof useAppState>;
