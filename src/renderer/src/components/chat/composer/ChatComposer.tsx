import { Sender } from "@ant-design/x";
import type * as React from "react";
import { useRef, useEffect } from "react";

export interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  isStreaming: boolean;
  onStopStream?: () => void;
  placeholder?: string;
  /** IM remote 模式 flag。ChatComposer 自身不消费此值，由调用方在 renderFooter 内分支处理 */
  hideToolbar?: boolean;
  /** Composer 下方信息行（容器外渲染） */
  infoBar?: React.ReactNode;
  /** Footer 自定义渲染。返回 ReactNode；输入参数与 Sender footer 一致。 */
  renderFooter?: Parameters<typeof Sender>[0]["footer"];
  /** 注册 capture-phase keydown handler（slash 等用） */
  registerKeydownHandler?: (el: HTMLElement | null) => () => void;
  /** 上方覆盖渲染（slash panel 等） */
  topOverlay?: React.ReactNode;
  onKeyDown?: Parameters<typeof Sender>[0]["onKeyDown"];
}

/**
 * 共用 composer：包装 @ant-design/x 的 Sender，统一视觉与行为。
 *
 * - onSubmit 由调用方负责语义；ChatComposer 不做"创建会话 + 发送"的复合逻辑。
 * - hideToolbar 仅作为 prop 透传给调用方决策；renderFooter 函数负责按 hideToolbar 渲染对应内容。
 * - infoBar 在容器外渲染（Sender 卡片下方）。
 */
export function ChatComposer({
  value,
  onChange,
  onSubmit,
  isStreaming,
  onStopStream,
  placeholder,
  hideToolbar = false,
  infoBar,
  renderFooter,
  registerKeydownHandler,
  topOverlay,
  onKeyDown,
}: ChatComposerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!registerKeydownHandler) return;
    return registerKeydownHandler(wrapperRef.current);
  }, [registerKeydownHandler]);

  return (
    <div ref={wrapperRef} className="chat-composer relative w-full mx-auto max-w-4xl">
      {topOverlay}
      <Sender
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        onCancel={isStreaming ? onStopStream : undefined}
        loading={isStreaming}
        placeholder={placeholder}
        autoSize={{ minRows: 2, maxRows: 6 }}
        onKeyDown={onKeyDown}
        suffix={() => null}
        footer={renderFooter}
        rootClassName="chat-composer-card"
        styles={{ input: { fontSize: 14 } }}
      />
      {infoBar && <div className="mt-3">{infoBar}</div>}
    </div>
  );
}
