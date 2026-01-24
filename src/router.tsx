import { createHashRouter } from 'react-router-dom'
import Chat from './pages/Chat'
import Login from './pages/Login'

export const router = createHashRouter([
  {
    path: '/',
    element: <Login />,
  },
  {
    path: '/chat',
    element: <Chat />,
  },
])
