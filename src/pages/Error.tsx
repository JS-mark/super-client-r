import { Button, Result } from 'antd'
import * as React from 'react'
import { useNavigate, useRouteError } from 'react-router-dom'

const ErrorPage: React.FC = () => {
  const navigate = useNavigate()
  const error: any = useRouteError()

  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Result
        status="500"
        title="Something went wrong"
        subTitle={error?.statusText || error?.message || 'Sorry, an unexpected error has occurred.'}
        extra={(
          <Button type="primary" onClick={() => navigate('/')}>
            Back Home
          </Button>
        )}
      />
    </div>
  )
}

export default ErrorPage
