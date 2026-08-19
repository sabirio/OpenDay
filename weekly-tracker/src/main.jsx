import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/canonical-ui.css'
import './styles/print.css'
import App from './App.jsx'
import { AuthProvider } from './auth/AuthContext.jsx'
import { WorkspaceProvider } from './auth/WorkspaceContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthProvider>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </AuthProvider>
  </StrictMode>,
)
