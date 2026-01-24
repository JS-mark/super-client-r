import type { Skill } from '../types/skills'
import { DeleteOutlined, DownloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Card, Input, List, Tag } from 'antd'
import * as React from 'react'
import { MainLayout } from '../components/layout/MainLayout'
import { useSkillStore } from '../stores/skillStore'

const MOCK_MARKET_SKILLS: Skill[] = [
  {
    id: 'skill-1',
    name: 'Python Interpreter',
    description: 'Execute Python code in a sandboxed environment',
    version: '1.0.0',
    author: 'AI Client Team',
    installed: false,
  },
  {
    id: 'skill-2',
    name: 'Web Search',
    description: 'Search the web using Google Search API',
    version: '1.2.0',
    author: 'Community',
    installed: false,
  },
]

const Skills: React.FC = () => {
  const { skills: installedSkills, installSkill, uninstallSkill } = useSkillStore()

  const isInstalled = (id: string) => installedSkills.some(s => s.id === id)

  return (
    <MainLayout>
      <div className="mb-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold">Skill Market</h1>
        <Input
          prefix={<SearchOutlined />}
          placeholder="Search skills..."
          className="w-64"
        />
      </div>

      <List
        grid={{ gutter: 16, column: 3 }}
        dataSource={MOCK_MARKET_SKILLS}
        renderItem={item => (
          <List.Item key={item.id}>
            <Card
              title={item.name}
              extra={<Tag>{item.version}</Tag>}
              actions={[
                isInstalled(item.id)
                  ? (
                      <Button
                        key="uninstall"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => uninstallSkill(item.id)}
                      >
                        Uninstall
                      </Button>
                    )
                  : (
                      <Button
                        key="install"
                        type="primary"
                        icon={<DownloadOutlined />}
                        onClick={() => installSkill(item)}
                      >
                        Install
                      </Button>
                    ),
              ]}
            >
              <p className="h-12 overflow-hidden text-gray-500">{item.description}</p>
              <div className="mt-4 text-xs text-gray-400">
                By
                {item.author}
              </div>
            </Card>
          </List.Item>
        )}
      />

      <h2 className="text-xl font-bold mt-8 mb-4">Installed Skills</h2>
      <List
        dataSource={installedSkills}
        renderItem={item => (
          <List.Item
            key={item.id}
            actions={[
              <Button key="uninstall" danger icon={<DeleteOutlined />} onClick={() => uninstallSkill(item.id)}>Uninstall</Button>,
            ]}
          >
            <List.Item.Meta
              title={item.name}
              description={item.description}
            />
          </List.Item>
        )}
      />
    </MainLayout>
  )
}

export default Skills
