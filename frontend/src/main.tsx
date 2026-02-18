import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'

// Initialize schema service early (non-blocking)
import { schemaService } from './services/schemaService'
schemaService.loadSchema().catch(console.error)

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>,
)
