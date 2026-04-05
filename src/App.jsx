import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AppProvider } from './context/AppContext.jsx'
import Dashboard from './pages/Dashboard.jsx'
import ProjectsList from './pages/ProjectsList.jsx'
import ProjectDetail from './pages/ProjectDetail.jsx'
import NewProjectWizard from './pages/NewProjectWizard.jsx'
import EquipmentCalendar from './pages/EquipmentCalendar.jsx'
import LabsEquipment from './pages/LabsEquipment.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<ProjectsList />} />
          <Route path="/projects/new" element={<NewProjectWizard />} />
          <Route path="/projects/:projectId" element={<ProjectDetail />} />
          <Route path="/calendar" element={<EquipmentCalendar />} />
          <Route path="/labs" element={<LabsEquipment />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  )
}
