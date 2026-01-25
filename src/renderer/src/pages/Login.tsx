import { GithubOutlined, GoogleOutlined } from '@ant-design/icons'
import { Button, Card, Space, Typography } from 'antd'
import * as React from 'react'
import { useNavigate } from 'react-router-dom'

const { Title, Text } = Typography

const Login: React.FC = () => {
  const navigate = useNavigate()

  const handleLogin = (provider: 'google' | 'github') => {
    console.log(`Login with ${provider}`)
    // Mock login success
    navigate('/chat')
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Card className="w-96 shadow-lg">
        <div className="mb-8 text-center">
          <Title level={2}>AI Desktop Client</Title>
          <Text type="secondary">Sign in to continue</Text>
        </div>

        <Space orientation="vertical" className="w-full" size="large">
          <Button
            block
            size="large"
            icon={<GoogleOutlined />}
            onClick={() => handleLogin('google')}
          >
            Sign in with Google
          </Button>
          <Button
            block
            size="large"
            icon={<GithubOutlined />}
            onClick={() => handleLogin('github')}
          >
            Sign in with GitHub
          </Button>
        </Space>
      </Card>
    </div>
  )
}

export default Login
