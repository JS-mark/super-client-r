import { DeleteOutlined, RobotOutlined, SendOutlined, UserOutlined } from '@ant-design/icons'
import { Avatar, Button, Input, List, Spin } from 'antd'
import * as React from 'react'
import { MainLayout } from '../components/layout/MainLayout'
import { useChat } from '../hooks/useChat'

const Chat: React.FC = () => {
  const { messages, input, setInput, sendMessage, isStreaming, clearMessages } = useChat()

  return (
    <MainLayout>
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0
            ? (
                <div className="flex h-full items-center justify-center text-gray-400">
                  Start a conversation
                </div>
              )
            : (
                <List
                  itemLayout="horizontal"
                  dataSource={messages}
                  renderItem={item => (
                    <List.Item>
                      <List.Item.Meta
                        avatar={(
                          <Avatar
                            icon={item.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
                            className={item.role === 'user' ? 'bg-blue-500' : 'bg-green-500'}
                          />
                        )}
                        title={item.role === 'user' ? 'You' : 'AI'}
                        description={<div className="whitespace-pre-wrap">{item.content}</div>}
                      />
                    </List.Item>
                  )}
                />
              )}
        </div>

        <div className="border-t p-4 bg-white dark:bg-gray-800">
          <div className="flex gap-2">
            <Button icon={<DeleteOutlined />} onClick={clearMessages} />
            <Input.TextArea
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type your message..."
              autoSize={{ minRows: 1, maxRows: 4 }}
              onPressEnter={(e) => {
                if (!e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
            />
            <Button
              type="primary"
              icon={isStreaming ? <Spin /> : <SendOutlined />}
              onClick={sendMessage}
              disabled={isStreaming}
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </MainLayout>
  )
}

export default Chat
