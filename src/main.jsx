import React, { Suspense, lazy, useState, useEffect, createContext } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './tailwind.css';
import './index.scss';
import './cv-templates/css/globalTemplateEnhancements.css';
import './i18n'; // Import i18n configuration

import * as serviceWorker from './serviceWorker';
import Spinner from './components/Spinner/Spinner';
import PublicResume from './components/PublicResume/PublicResume';
import Cover4 from './cv-templates/cover4/Cover4';
import fire from './conf/fire'; // Import fire
import GA4Provider from './components/GA4Provider';
import i18n from './i18n';
import GoogleMapsProvider from './components/JobsListings/GoogleMapsProvider';

// Create a Context for authentication
export const AuthContext = createContext(null);

const Welcome = lazy(() => import('./components/welcome/Welcome'));
const Dashboard = lazy(() => import('./components/Dashboard/DashboardMain/DashboardMain'));
const Admin = lazy(() => import('./components/admin/Admin'));
const Contact = lazy(() => import('./components/Contact/Contact'));
const Front = lazy(() => import('./components/Front/Front'));
const Exporter = lazy(() => import('./components/Exporter/Exporter'));
const Billing = lazy(() => import('./components/Billing/Plans/Plans'));
const CustomePage = lazy(() => import('./components/CustomPage/CustomePage'));
const Dashboard2 = lazy(() => import('./components/Dashboard2/dashboard2'));
const CoverLetter = lazy(() => import('./components/CoverLetter/CoverLetter'));
const PortfolioBuilder = lazy(() => import('./components/PortfolioBuilder/PortfolioBuilder'));
const PublicPortfolio = lazy(() => import('./components/PublicPortfolio/PublicPortfolio'));
const PortfolioGallery = lazy(() => import('./components/PortfolioGallery/PortfolioGallery'));
const BuildResume = lazy(() => import('./components/BuildResume/BuildResume'));
const Features = lazy(() => import('./components/Features/Features'));
const JobsLanding = lazy(() => import('./components/JobsLanding/JobsLanding'));
const MainJobListings = lazy(() => import('./components/JobsListings/MainJobListings'));
const BlogList = lazy(() => import('./components/Blog/BlogList/BlogList'));
const BlogPost = lazy(() => import('./components/Blog/BlogPost/BlogPost'));
const BlogEditor = lazy(() => import('./components/Blog/BlogEditor/BlogEditor'));
const AuthWrapper = () => {         
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = fire.auth().onAuthStateChanged((user) => {
            setUser(user);
            setAuthLoading(false);
        });

        // Cleanup subscription on unmount
        return () => unsubscribe();
    }, []);

    // Add global language change listener to persist language changes
    useEffect(() => {
        const handleLanguageChanged = (lng) => {
            // Save language preference whenever it changes
            localStorage.setItem('preferredLanguage', lng);
        };

        // Listen for language changes
        i18n.on('languageChanged', handleLanguageChanged);

        // Cleanup
        return () => {
            i18n.off('languageChanged', handleLanguageChanged);
        };
    }, []);

    if (authLoading) {
        return <Spinner />; // Or any loading indicator
    }

    return (
        <AuthContext.Provider value={user}>
            <GoogleMapsProvider apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY || import.meta.env.VITE_APP_GOOGLE_MAPS_API_KEY}>
            <BrowserRouter>
                <GA4Provider>
                    <Suspense fallback={<Spinner />}>
                        <Routes>
                            <Route path="/" element={<Welcome />} />
                            <Route path="/coverletter" element={<CoverLetter />} />
                            <Route path="/dashboard/*" element={<Dashboard />} />
                            <Route path="/contact" element={<Contact user={user} />} />
                            <Route path="/build-resume/*" element={<BuildResume />} />
                            <Route path="/create-resume/*" element={<BuildResume />} />
                            <Route path="/create-resume" element={<BuildResume />} />
                            <Route path="/resume/:step" element={<Welcome />} />
                            <Route path="/billing/plans" element={<Billing user={user} />} />
                            <Route path="/p/:custompage" element={<CustomePage user={user} />} />
                            <Route path="/shared/:resumeId" element={<PublicResume />} />
                            <Route path="/pricing" element={<Billing user={user} />} />
                            <Route path="/portfolio/builder" element={<PortfolioBuilder />} />
                            <Route path="/portfolio/:slug" element={<PublicPortfolio />} />
                            <Route path="/portfolios" element={<PortfolioGallery />} />
                            <Route path="/adm/*" element={<Admin />} />
                            <Route path="/front" element={<Front />} />
                            <Route path="/features" element={<Features user={user} />} />
                            <Route path="/jobs" element={<JobsLanding />} />
                            <Route path="/jobs/portal" element={<MainJobListings />} />
                            <Route path="/jobs/portal/:jobId" element={<MainJobListings />} />
                            <Route path="/jobs/browse" element={<MainJobListings />} />
                            <Route path="/jobs/categories" element={<JobsLanding />} />
                            <Route path="/jobs/category/:catName" element={<MainJobListings />} />
                            <Route path="/blog" element={<BlogList />} />
                            <Route path="/blog/:slug" element={<BlogPost />} />
                            <Route path="/blog-editor" element={<BlogEditor />} />
                            <Route path="/blog-editor/:postId" element={<BlogEditor />} />
                          {/* Export routes*/}
                            {/* Generate CV template routes dynamically */}
                            {Array.from({ length: 51 }, (_, i) => i + 1).map((num) => (
                                <Route key={`cv-route-${num}`} path={`/export/Cv${num}/:resumeId/:language`} element={<Exporter resumeName={`Cv${num}`} export={true} />} />
                            ))}
                             {/* Dashboard2 mapped to main User Dashboard */}
                             <Route path="/dashboard2/*" element={<Dashboard />} />
                             <Route path="/dashboard2" element={<Dashboard />} />
                            {/* Covers export routes */}
                            {/* Generate Cover Letter routes dynamically */}
                            {Array.from({ length: 4 }, (_, i) => i + 1).map((num) => (
                                <Route key={`cover-route-${num}`} path={`/export/Cover${num}/:resumeId/:language`} element={<Exporter resumeName={`Cover${num}`} export={true} />} />
                            ))}
                            {/* just a route  to test a n */}
                            <Route path="/cvtest" element={<Cover4 />} />
                        </Routes>
                    </Suspense>
                </GA4Provider>
            </BrowserRouter>
            </GoogleMapsProvider>
        </AuthContext.Provider>
    );
};

const container = document.getElementById('root');
const root = createRoot(container);

root.render(<AuthWrapper />);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
