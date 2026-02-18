import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { lazy, Suspense } from 'react';
import AdminLayout from './components/layout/AdminLayout';
import Dashboard from './pages/Dashboard';
import SlotEditor from './pages/SlotEditor';
import UserSettings from './pages/UserSettings';
import UsersPage from './pages/UsersPage';
import LogsPage from './pages/LogsPage';
import MediaLibraryPage from './pages/MediaLibraryPage';
import WebhooksPage from './pages/WebhooksPage';
import Login from './pages/Login';
import InstallPage from './pages/InstallPage';
import ProtectedRoute from './components/layout/ProtectedRoute';
import { InstallationGuard } from './components/layout/InstallationGuard';
import { UIProvider } from './context/UIContext';
import { AuthProvider } from './context/AuthContext';
import { AiProvider } from './context/AiContext';
import { KeyboardShortcutProvider } from './context/KeyboardShortcutContext';
import { SessionExpiredHandler } from './components/auth/SessionExpiredHandler';

import { PageTitleUpdater } from './components/layout/PageTitleUpdater';
import { ThemeProvider } from './context/ThemeContext';

// Lazy load dev tools - separate chunks for schema builder and validator
const SchemaBuilderPage = lazy(() => import('./pages/SchemaBuilder'));
const SchemaValidatorPage = lazy(() => import('./pages/SchemaValidatorPage'));

// Loading fallback for lazy loaded pages
const LazyLoadFallback = () => (
    <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
            <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin mx-auto" />
            <p className="text-xs font-mono uppercase tracking-widest opacity-50">Betöltés...</p>
        </div>
    </div>
);

import { useEffect } from 'react';
import { printNomadAscii } from '@/utils/NomadAscii';

function App() {
    useEffect(() => {
        printNomadAscii();
    }, []);

    return (
        <BrowserRouter basename={import.meta.env.BASE_URL}>
            <PageTitleUpdater />
            <InstallationGuard>
                <ThemeProvider>
                    <AuthProvider>
                        <SessionExpiredHandler />
                        <AnimatePresence>
                            <Routes>
                                <Route path="/install" element={<InstallPage />} />
                                <Route path="/login" element={<Login />} />

                                {/* Public Dev Tools - No auth needed, lazy loaded */}
                                <Route path="/dev/schema-builder" element={
                                    <UIProvider>
                                        <Suspense fallback={<LazyLoadFallback />}>
                                            <SchemaBuilderPage />
                                        </Suspense>
                                    </UIProvider>
                                } />

                                {/* Dev Tools - Protected but outside AdminLayout, lazy loaded */}
                                <Route element={<ProtectedRoute />}>
                                    <Route path="/dev/schema-validator" element={
                                        <Suspense fallback={<LazyLoadFallback />}>
                                            <SchemaValidatorPage />
                                        </Suspense>
                                    } />
                                </Route>

                                <Route element={<ProtectedRoute />}>
                                    {/* Wrap Protected Routes with Features Providers */}
                                    <Route element={
                                        <AiProvider>
                                            <UIProvider>
                                                <KeyboardShortcutProvider>
                                                    <Outlet />
                                                </KeyboardShortcutProvider>
                                            </UIProvider>
                                        </AiProvider>
                                    }>
                                        <Route path="/" element={<AdminLayout />}>
                                            <Route index element={<Dashboard />} />
                                            <Route path="edit/:slotKey" element={<SlotEditor />} />
                                            <Route path="settings" element={<UserSettings />} />
                                            <Route path="users" element={<UsersPage />} />
                                            <Route path="logs" element={<LogsPage />} />
                                            <Route path="media" element={<MediaLibraryPage />} />
                                            <Route path="webhooks" element={<WebhooksPage />} />
                                            <Route path="*" element={<Navigate to="/" replace />} />
                                        </Route>
                                    </Route>
                                </Route>
                            </Routes>
                        </AnimatePresence>
                    </AuthProvider>
                </ThemeProvider>
            </InstallationGuard>
        </BrowserRouter>
    );
}


export default App;

