import { AppstoreOutlined, MessageOutlined, SettingOutlined } from '@ant-design/icons'
import { Layout, Menu, theme } from 'antd'
import * as React from 'react'

const { Sider, Content } = Layout

const Chat: React.FC = () => {
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken()

  return (
    <Layout className="h-screen">
      <Sider breakpoint="lg" collapsedWidth="0">
        <div className="flex h-16 items-center justify-center text-white text-lg font-bold">
          AI Client
        </div>
        <Menu
          theme="dark"
          mode="inline"
          defaultSelectedKeys={['1']}
          items={[
            {
              key: '1',
              icon: <MessageOutlined />,
              label: 'Chat',
            },
            {
              key: '2',
              icon: <AppstoreOutlined />,
              label: 'Models',
            },
            {
              key: '3',
              icon: <SettingOutlined />,
              label: 'Settings',
            },
          ]}
        />
      </Sider>
      <Layout>
        <Content style={{ margin: '24px 16px 0' }}>
          <div
            style={{
              padding: 24,
              minHeight: 360,
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
              height: '100%',
            }}
          >
            Chat Content Here
          </div>
        </Content>
      </Layout>
    </Layout>
  )
}

export default Chat
