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

          {import.meta.env.DEV && (
            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-gray-50 px-2 text-gray-500 dark:bg-gray-900">
                  Development
                </span>
              </div>
            </div>
          )}

          {import.meta.env.DEV && (
            <Button
              block
              size="large"
              type="dashed"
              onClick={() => handleLogin('mock' as any)}
            >
              Mock Login (Dev)
            </Button>
          )}
        </Space>
      </Card>
    </div>
  )
}

export default Login
