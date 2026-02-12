/**
 * Log Worker - 在后台线程中处理日志文件加载和解析
 * 避免大文件读取阻塞主进程渲染
 */

export interface LogWorkerRequest {
  id: string;
  type: 'loadLogs' | 'parseLogs' | 'filterLogs';
  payload: {
    content?: string;
    filePath?: string;
    tail?: number;
    filter?: string;
    maxLines?: number;
  };
}

export interface LogWorkerResponse {
  id: string;
  type: 'loadLogs' | 'parseLogs' | 'filterLogs';
  success: boolean;
  data?: {
    content?: string;
    lines?: string[];
    totalLines?: number;
    filteredCount?: number;
  };
  error?: string;
}

/**
 * 解析日志内容，提取行信息
 */
function parseLogLines(content: string): string[] {
  return content.split("\n").filter(line => line.trim() !== '');
}

/**
 * 处理日志加载请求
 */
function handleLoadLogs(payload: LogWorkerRequest['payload']): LogWorkerResponse['data'] {
  const { content, tail } = payload;

  if (!content) {
    return { content: '', lines: [], totalLines: 0 };
  }

  let processedContent = content;

  // 如果指定了 tail，只保留最后 N 行
  if (tail && tail > 0) {
    const lines = content.split("\n");
    processedContent = lines.slice(-tail).join('\n');
  }

  const lines = parseLogLines(processedContent);

  return {
    content: processedContent,
    lines,
    totalLines: lines.length,
  };
}

/**
 * 处理日志解析请求（用于高亮、格式化等）
 */
function handleParseLogs(payload: LogWorkerRequest['payload']): LogWorkerResponse['data'] {
  const { content } = payload;

  if (!content) {
    return { lines: [], totalLines: 0 };
  }

  const lines = parseLogLines(content);

  return {
    lines,
    totalLines: lines.length,
  };
}

/**
 * 处理日志过滤请求
 */
function handleFilterLogs(payload: LogWorkerRequest['payload']): LogWorkerResponse['data'] {
  const { content, filter } = payload;

  if (!content || !filter) {
    return { content, lines: parseLogLines(content || ''), totalLines: 0 };
  }

  const lines = content.split("\n");
  const filteredLines = lines.filter(line =>
    line.toLowerCase().includes(filter.toLowerCase())
  );

  return {
    content: filteredLines.join('\n'),
    lines: filteredLines,
    totalLines: filteredLines.length,
    filteredCount: filteredLines.length,
  };
}

/**
 * Worker 消息处理器
 */
self.onmessage = (event: MessageEvent<LogWorkerRequest>) => {
  const { id, type, payload } = event.data;

  try {
    let result: LogWorkerResponse['data'];

    switch (type) {
      case 'loadLogs':
        result = handleLoadLogs(payload);
        break;
      case 'parseLogs':
        result = handleParseLogs(payload);
        break;
      case 'filterLogs':
        result = handleFilterLogs(payload);
        break;
      default:
        throw new Error(`Unknown request type: ${type}`);
    }

    const response: LogWorkerResponse = {
      id,
      type,
      success: true,
      data: result,
    };

    self.postMessage(response);
  } catch (error) {
    const response: LogWorkerResponse = {
      id,
      type,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };

    self.postMessage(response);
  }
};
