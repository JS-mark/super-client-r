import { Tabs } from 'antd'
import * as React from 'react'
import { MainLayout } from '../components/layout/MainLayout'
import { McpConfig } from '../components/models/McpConfig'
import { ModelList } from '../components/models/ModelList'

const Models: React.FC = () => {
  return (
    <MainLayout>
      <h1 className="text-2xl font-bold mb-4">Configuration</h1>
      <Tabs
        defaultActiveKey="1"
        items={[
          {
            key: '1',
            label: 'Models',
            children: <ModelList />,
          },
          {
            key: '2',
            label: 'MCP Servers',
            children: <McpConfig />,
          },
        ]}
      />
    </MainLayout>
  )
}

export default Models
