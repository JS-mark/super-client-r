import { AppstoreOutlined, MessageOutlined, RocketOutlined, SettingOutlined } from '@ant-design/icons'
import { Layout, Menu, theme } from 'antd'
import * as React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const { Sider, Content } = Layout

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken()

  const selectedKey = location.pathname === '/chat' ? '1' : location.pathname === '/models' ? '2' : location.pathname === '/skills' ? '3' : '4'

  return (
    <Layout className="h-screen">
      <Sider breakpoint="lg" collapsedWidth="0">
        <div className="flex h-16 items-center justify-center text-white text-lg font-bold">
          AI Client
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={[
            {
              key: '1',
              icon: <MessageOutlined />,
              label: 'Chat',
              onClick: () => navigate('/chat'),
            },
            {
              key: '2',
              icon: <AppstoreOutlined />,
              label: 'Models',
              onClick: () => navigate('/models'),
            },
            {
              key: '3',
              icon: <RocketOutlined />,
              label: 'Skills',
              onClick: () => navigate('/skills'),
            },
            {
              key: '4',
              icon: <SettingOutlined />,
              label: 'Settings',
              onClick: () => navigate('/settings'),
            },
          ]}
        />
      </Sider>
      <Layout>
        <Content style={{ margin: '24px 16px 0', height: 'calc(100vh - 24px)' }}>
          <div
            style={{
              padding: 24,
              minHeight: 360,
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
              height: '100%',
              overflow: 'auto',
            }}
          >
            {children}
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}
