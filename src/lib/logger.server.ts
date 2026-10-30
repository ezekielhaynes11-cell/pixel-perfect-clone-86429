export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface StructuredLogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  context?: Record<string, unknown>;
}

function emitStructuredLog(
  level: LogLevel,
  component: string,
  message: string,
  context?: Record<string, unknown>,
): void {
  const entry: StructuredLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    component,
    message,
    ...(context && Object.keys(context).length > 0 ? { context } : {}),
  };
  const serialized = JSON.stringify(entry);
  if (level === "ERROR") {
    console.error(serialized);
    return;
  }
  if (level === "WARN") {
    console.warn(serialized);
    return;
  }
  console.info(serialized);
}

export function logInfo(
  component: string,
  message: string,
  context?: Record<string, unknown>,
): void {
  emitStructuredLog("INFO", component, message, context);
}

export function logWarn(
  component: string,
  message: string,
  context?: Record<string, unknown>,
): void {
  emitStructuredLog("WARN", component, message, context);
}

export function logError(
  component: string,
  message: string,
  context?: Record<string, unknown>,
): void {
  emitStructuredLog("ERROR", component, message, context);
}
