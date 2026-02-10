import { useCallback, useEffect, useRef, useState } from 'react';
import type { LogWorkerRequest, LogWorkerResponse } from '../workers/logWorker';

interface LogWorkerState {
  isLoading: boolean;
  error: string | null;
}

interface LogWorkerResult {
  content?: string;
  lines?: string[];
  totalLines?: number;
  filteredCount?: number;
}

/**
 * Hook to use the log worker for processing logs in background
 */
export function useLogWorker() {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, {
    resolve: (value: LogWorkerResult) => void;
    reject: (reason: Error) => void;
  }>>(new Map());

  const [state, setState] = useState<LogWorkerState>({
    isLoading: false,
    error: null,
  });

  // Initialize worker
  useEffect(() => {
    // Create worker from the logWorker module
    const worker = new Worker(
      new URL('../workers/logWorker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (event: MessageEvent<LogWorkerResponse>) => {
      const { id, success, data, error } = event.data;
      const pending = pendingRef.current.get(id);

      if (pending) {
        if (success && data) {
          pending.resolve(data);
        } else {
          pending.reject(new Error(error || 'Worker processing failed'));
        }
        pendingRef.current.delete(id);
      }

      // Update loading state if no more pending requests
      if (pendingRef.current.size === 0) {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    };

    worker.onerror = (error) => {
      console.error('Log worker error:', error);
      setState({ isLoading: false, error: error.message });

      // Reject all pending requests
      pendingRef.current.forEach((pending) => {
        pending.reject(new Error('Worker error: ' + error.message));
      });
      pendingRef.current.clear();
    };

    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  /**
   * Send a request to the worker and return a promise
   */
  const sendRequest = useCallback(<T extends LogWorkerResult>(
    type: LogWorkerRequest['type'],
    payload: LogWorkerRequest['payload']
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      pendingRef.current.set(id, {
        resolve: resolve as (value: LogWorkerResult) => void,
        reject,
      });

      setState(prev => ({ ...prev, isLoading: true, error: null }));

      workerRef.current.postMessage({
        id,
        type,
        payload,
      } as LogWorkerRequest);
    });
  }, []);

  /**
   * Load and process logs in worker
   */
  const loadLogs = useCallback(async (
    content: string,
    tail?: number
  ): Promise<{ content: string; lines: string[]; totalLines: number }> => {
    const result = await sendRequest('loadLogs', { content, tail });
    return {
      content: result.content || '',
      lines: result.lines || [],
      totalLines: result.totalLines || 0,
    };
  }, [sendRequest]);

  /**
   * Parse logs in worker
   */
  const parseLogs = useCallback(async (
    content: string
  ): Promise<{ lines: string[]; totalLines: number }> => {
    const result = await sendRequest('parseLogs', { content });
    return {
      lines: result.lines || [],
      totalLines: result.totalLines || 0,
    };
  }, [sendRequest]);

  /**
   * Filter logs in worker
   */
  const filterLogs = useCallback(async (
    content: string,
    filter: string
  ): Promise<{ content: string; lines: string[]; totalLines: number; filteredCount: number }> => {
    const result = await sendRequest('filterLogs', { content, filter });
    return {
      content: result.content || '',
      lines: result.lines || [],
      totalLines: result.totalLines || 0,
      filteredCount: result.filteredCount || 0,
    };
  }, [sendRequest]);

  return {
    isLoading: state.isLoading,
    error: state.error,
    loadLogs,
    parseLogs,
    filterLogs,
  };
}
