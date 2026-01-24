import type { McpServer } from '../../types/mcp'
import { ApiOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Form, Input, List, Modal, Tag } from 'antd'
import * as React from 'react'
import { useState } from 'react'
import { useMcpStore } from '../../stores/mcpStore'

export const McpConfig: React.FC = () => {
  const { servers, addServer, removeServer } = useMcpStore()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [form] = Form.useForm()

  const handleAdd = (values: any) => {
    const newServer: McpServer = {
      id: Date.now().toString(),
      name: values.name,
      url: values.url,
      status: 'disconnected',
      capabilities: [],
    }
    addServer(newServer)
    setIsModalOpen(false)
    form.resetFields()
  }

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-xl font-bold">MCP Servers</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
          Add Server
        </Button>
      </div>

      <List
        dataSource={servers}
        renderItem={item => (
          <List.Item
            key={item.id}
            actions={[
              <Button key="delete" danger icon={<DeleteOutlined />} onClick={() => removeServer(item.id)} />,
            ]}
          >
            <List.Item.Meta
              avatar={<ApiOutlined className="text-2xl text-blue-500" />}
              title={item.name}
              description={(
                <div className="flex gap-2 items-center">
                  <span>{item.url}</span>
                  <Tag color={item.status === 'connected' ? 'success' : 'default'}>
                    {item.status}
                  </Tag>
                </div>
              )}
            />
          </List.Item>
        )}
      />

      <Modal
        title="Add MCP Server"
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleAdd}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="url" label="Server URL" rules={[{ required: true }]}>
            <Input placeholder="http://localhost:8000/mcp" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
