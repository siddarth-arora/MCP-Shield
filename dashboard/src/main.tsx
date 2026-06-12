import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AccessPortal } from './pages/AccessPortal.tsx'
import { AccessDetail } from './pages/AccessDetail.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/access" element={<AccessPortal />} />
        <Route path="/access/:id" element={<AccessDetail />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
