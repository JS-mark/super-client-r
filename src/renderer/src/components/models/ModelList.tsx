import type { ModelInfo } from '../../types/models'
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Drawer, Form, Input, List, Select, Space, Switch } from 'antd'
import * as React from 'react'
import { useState } from 'react'
import { useModelStore } from '../../stores/modelStore'

export const ModelList: React.FC = () => {
  const { models, addModel, updateModel, removeModel } = useModelStore()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<ModelInfo | null>(null)
  const [form] = Form.useForm()

  const handleAdd = () => {
    setEditingModel(null)
    form.resetFields()
    setIsDrawerOpen(true)
  }

  const handleEdit = (model: ModelInfo) => {
    setEditingModel(model)
    form.setFieldsValue({
      ...model,
      apiKey: model.config.apiKey,
      baseUrl: model.config.baseUrl,
    })
    setIsDrawerOpen(true)
  }

  const handleSave = (values: any) => {
    const modelData: ModelInfo = {
      id: editingModel ? editingModel.id : Date.now().toString(),
      name: values.name,
      provider: values.provider,
      capabilities: [],
      enabled: true,
      config: {
        apiKey: values.apiKey,
        baseUrl: values.baseUrl,
      },
    }

    if (editingModel) {
      updateModel(editingModel.id, modelData)
    }
    else {
      addModel(modelData)
    }
    setIsDrawerOpen(false)
  }

  return (
    <div>
      <div className="mb-4 flex justify-between items-center">
        <h2 className="text-xl font-bold">Models</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          Add Model
        </Button>
      </div>

      <List
        dataSource={models}
        renderItem={item => (
          <List.Item
            key={item.id}
            actions={[
              <Switch
                key="switch"
                checked={item.enabled}
                onChange={checked => updateModel(item.id, { enabled: checked })}
              />,
              <Button key="edit" icon={<EditOutlined />} onClick={() => handleEdit(item)} />,
              <Button key="delete" danger icon={<DeleteOutlined />} onClick={() => removeModel(item.id)} />,
            ]}
          >
            <List.Item.Meta
              title={item.name}
              description={item.provider}
            />
          </List.Item>
        )}
      />

      <Drawer
        title={editingModel ? 'Edit Model' : 'Add Model'}
        width={400}
        styles={{ body: { paddingBottom: 80 } }}
        onClose={() => setIsDrawerOpen(false)}
        open={isDrawerOpen}
        extra={(
          <Space>
            <Button onClick={() => setIsDrawerOpen(false)}>Cancel</Button>
            <Button type="primary" onClick={() => form.submit()}>
              Save
            </Button>
          </Space>
        )}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="provider" label="Provider" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="openai">OpenAI</Select.Option>
              <Select.Option value="anthropic">Anthropic</Select.Option>
              <Select.Option value="gemini">Gemini</Select.Option>
              <Select.Option value="custom">Custom</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="apiKey" label="API Key">
            <Input.Password />
          </Form.Item>
          <Form.Item name="baseUrl" label="Base URL">
            <Input />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  )
}
