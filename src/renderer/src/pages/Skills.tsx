import {
  CheckCircleOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EllipsisOutlined,
  ReloadOutlined,
  SearchOutlined,
  SyncOutlined,
} from '@ant-design/icons'
import { Button, Card, Dropdown, Input, List, Tabs, Tag, message } from 'antd'
import type { MenuProps } from 'antd'
import * as React from 'react'
import { MainLayout } from '../components/layout/MainLayout'
import { useSkillStore } from '../stores/skillStore'
import type { Skill } from '../types/skills'

const SkillCard: React.FC<{ skill: Skill }> = ({ skill }) => {
  const {
    installedSkills,
    installSkill,
    uninstallSkill,
    updateSkill,
    reinstallSkill,
    checkUpdate,
  } = useSkillStore()

  const isInstalled = installedSkills.some((s) => s.id === skill.id)
  const hasUpdate = checkUpdate(skill.id)
  const installedVersion = installedSkills.find((s) => s.id === skill.id)?.version

  const handleInstall = () => {
    installSkill(skill)
    message.success(`Installed ${skill.name}`)
  }

  const handleUninstall = () => {
    uninstallSkill(skill.id)
    message.success(`Uninstalled ${skill.name}`)
  }

  const handleUpdate = () => {
    updateSkill(skill.id)
    message.success(`Updated ${skill.name}`)
  }

  const handleReinstall = () => {
    reinstallSkill(skill.id)
    message.success(`Reinstalled ${skill.name}`)
  }

  const moreItems: MenuProps['items'] = [
    {
      key: 'reinstall',
      label: 'Reinstall',
      icon: <ReloadOutlined />,
      onClick: handleReinstall,
    },
    ...(isInstalled
      ? [
          {
            key: 'uninstall',
            label: 'Uninstall',
            icon: <DeleteOutlined />,
            danger: true,
            onClick: handleUninstall,
          },
        ]
      : []),
  ]

  const actions: React.ReactNode[] = []

  if (isInstalled) {
    if (hasUpdate) {
      actions.push(
        <Button key="update" type="primary" size="small" icon={<SyncOutlined />} onClick={handleUpdate}>
          Update
        </Button>,
      )
    } else {
      actions.push(
        <Tag key="installed" icon={<CheckCircleOutlined />} color="success">
          Installed
        </Tag>,
      )
    }
  } else {
    actions.push(
      <Button key="install" type="primary" size="small" icon={<DownloadOutlined />} onClick={handleInstall}>
        Install
      </Button>,
    )
  }

  // Add More button
  actions.push(
    <Dropdown key="more" menu={{ items: moreItems }} trigger={['click']}>
      <Button type="text" size="small" icon={<EllipsisOutlined />} />
    </Dropdown>,
  )

  return (
    <Card
      hoverable
      className="h-full flex flex-col"
      actions={actions}
      title={
        <div className="flex items-center gap-2">
          <span className="text-xl">{skill.icon || '🧩'}</span>
          <span className="truncate" title={skill.name}>{skill.name}</span>
        </div>
      }
      extra={
        <div className="flex flex-col items-end">
             <Tag>{skill.version}</Tag>
             {isInstalled && installedVersion && installedVersion !== skill.version && (
                 <span className="text-xs text-gray-400 mt-1">Installed: {installedVersion}</span>
             )}
        </div>
      }
    >
      <div className="flex flex-col h-32 justify-between">
        <p className="text-gray-500 line-clamp-3 mb-2 flex-grow">{skill.description}</p>
        <div className="flex justify-between items-center text-xs text-gray-400 mt-2">
          <span>By {skill.author}</span>
          {skill.category && <Tag bordered={false}>{skill.category}</Tag>}
        </div>
      </div>
    </Card>
  )
}

const Skills: React.FC = () => {
  const { installedSkills, marketSkills, fetchMarketSkills, isLoading } = useSkillStore()
  const [searchTerm, setSearchTerm] = React.useState('')

  React.useEffect(() => {
    fetchMarketSkills()
  }, [fetchMarketSkills])

  const filterSkills = (skills: Skill[]) => {
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.description.toLowerCase().includes(searchTerm.toLowerCase()),
    )
  }

  const items = [
    {
      key: 'market',
      label: 'Market',
      children: (
        <List
          grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 3, xl: 4, xxl: 4 }}
          dataSource={filterSkills(marketSkills)}
          loading={isLoading}
          renderItem={(item) => (
            <List.Item key={item.id}>
              <SkillCard skill={item} />
            </List.Item>
          )}
        />
      ),
    },
    {
      key: 'installed',
      label: `Installed (${installedSkills.length})`,
      children: (
        <List
          grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 3, xl: 4, xxl: 4 }}
          dataSource={filterSkills(installedSkills)}
          renderItem={(item) => (
            <List.Item key={item.id}>
              <SkillCard skill={item} />
            </List.Item>
          )}
        />
      ),
    },
  ]

  return (
    <MainLayout>
      <div className="flex flex-col h-full">
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Skill Center</h1>
          <Input
            prefix={<SearchOutlined className="text-gray-400" />}
            placeholder="Search skills..."
            className="w-64"
            allowClear
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <Tabs defaultActiveKey="market" items={items} />
      </div>
    </MainLayout>
  )
}

export default Skills
