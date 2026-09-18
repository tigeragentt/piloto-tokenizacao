import { Routes, Route, NavLink } from 'react-router-dom'
import { WalletProvider } from './context/WalletContext.jsx'
import WalletButton from './components/WalletButton.jsx'
import Dashboard from './pages/Dashboard.jsx'
import OrdersPage from './pages/OrdersPage.jsx'
import ObserverPage from './pages/ObserverPage.jsx'
import XDCPage from './pages/XDCPage.jsx'
import CREPage from './pages/CREPage.jsx'
import CapitarePage from './pages/CapitarePage.jsx'

export default function App() {
  return (
    <WalletProvider>
      <div className="app">
        <header className="app-header">
          <div className="app-logo">
            <span className="logo-icon">T</span>
            <span className="logo-text">Piloto Tokenização</span>
            <span className="logo-sub">ABToken &middot; CVM</span>
          </div>
          <nav className="app-nav">
            <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Dashboard
            </NavLink>
            <NavLink to="/orders" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Orders
            </NavLink>
            <NavLink to="/observer" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Observer
            </NavLink>
            <NavLink to="/xdc" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              XDC
            </NavLink>
            <NavLink to="/cre" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              CRE
            </NavLink>
            <NavLink to="/capitare" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Capitare
            </NavLink>
          </nav>
          <WalletButton />
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/observer" element={<ObserverPage />} />
            <Route path="/xdc" element={<XDCPage />} />
            <Route path="/cre" element={<CREPage />} />
            <Route path="/capitare" element={<CapitarePage />} />
          </Routes>
        </main>
        <footer className="app-footer">
          <span>Piloto ABToken &middot; CVM</span>
        </footer>
      </div>
    </WalletProvider>
  )
}
