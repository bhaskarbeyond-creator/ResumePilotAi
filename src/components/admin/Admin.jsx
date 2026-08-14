import React, { Component } from 'react';
import Sidebar from './sidebar/sidebar';
import './Admin.scss';
import Dashboard from './dashboard/dashboard';
import ProfileImage from '../../assets/user.png';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import Settings from './settings/Settings';
import UserEdit from './userEdit/UserEdit';
import UsersManager from './usersManager/UsersManager';
import Phrases from './phrases/Phrases';
import Messages from './messages/Messages';
import fire from '../../conf/fire';
import conf from '../../conf/configuration';
import { checkIfAdmin } from '../../firestore/dbOperations';
import signOutUser from '../../utils/signOut';
import Reviews from './reviews/Reviews';
import TrustedBy from './TrustedBy/TrustedBy';
import EmployerApplications from './employerApplications/EmployerApplications';
import JobsManager from './jobsManager/JobsManager';
import CompanyManagement from './companyManagement/CompanyManagement';
import BlogManagement from './blogManagement/BlogManagement';
import LandingPages from './landingPages/LandingPages';
import { 
    FaSearch, FaBell, FaShieldAlt, FaCircle, FaUserCircle, 
    FaExternalLinkAlt, FaSignOutAlt, FaRocket, FaChevronRight, FaSlidersH
} from 'react-icons/fa';

// Functional Header Wrapper for Breadcrumbs & Live Telemetry
const AdminHeader = ({ userEmail, onLogout }) => {
    const location = useLocation();
    const pathSegments = location.pathname.split('/').filter(Boolean);
    const searchParams = new URLSearchParams(location.search);
    const currentTab = searchParams.get('tab');

    return (
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shadow-2xs">
            {/* Left Breadcrumbs & Domain Status */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    <Link to="/adm/dashboard" className="hover:text-indigo-600 font-bold transition-colors">Admin Console</Link>
                    {pathSegments.slice(1).map((seg, idx) => (
                        <React.Fragment key={idx}>
                            <FaChevronRight className="w-2.5 h-2.5 text-slate-300" />
                            <span className="capitalize text-slate-800 font-extrabold">{currentTab ? currentTab.replace('Settings', '') : seg}</span>
                        </React.Fragment>
                    ))}
                </div>

                <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <FaCircle className="w-1.5 h-1.5 animate-pulse text-emerald-500" />
                    SYSTEM ONLINE
                </span>
            </div>

            {/* Right Action Controls */}
            <div className="flex items-center gap-3">
                {/* Search Bar */}
                <div className="relative hidden sm:block w-56 lg:w-72">
                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3 h-3" />
                    <input
                        type="text"
                        placeholder="Search settings, users, invoices..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                    />
                </div>

                {/* View Live Site Button */}
                <a
                    href="https://airesume.projectdemo.guru"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-2xs"
                >
                    <FaExternalLinkAlt className="w-3 h-3 text-slate-500" />
                    <span className="hidden md:inline">Live Site</span>
                </a>

                {/* User Profile Pill */}
                <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                        A
                    </div>
                    <div className="hidden lg:block text-left leading-tight">
                        <div className="text-xs font-extrabold text-slate-900">Administrator</div>
                        <div className="text-[10px] text-slate-400 font-mono">admin@projectdemo.guru</div>
                    </div>
                </div>
            </div>
        </header>
    );
};

class Admin extends Component {
    constructor(props) {
        super(props);
        this.state = {
            openSidebarClicked: false,
            user: null,
            showAdm: false,
            sidebarCollapsed: localStorage.getItem('adminSidebarCollapsed') === 'true',
        };
        this.handleSidebarToggle = this.handleSidebarToggle.bind(this);
        this.handleSidebarExit = this.handleSidebarExit.bind(this);
        this.authListener = this.authListener.bind(this);
        this.handleSidebarStateChange = this.handleSidebarStateChange.bind(this);
        this.handleLogout = this.handleLogout.bind(this);
    }

    handleSidebarToggle() {
        this.setState({ openSidebarClicked: true });
    }

    handleSidebarExit() {
        this.setState({ openSidebarClicked: false });
    }

    handleSidebarStateChange(isCollapsed) {
        this.setState({ sidebarCollapsed: isCollapsed });
    }

    componentDidMount() {
        this.authListener();
    }

    authListener() {
        fire.auth().onAuthStateChanged(async (user) => {
            const uid = user ? user.uid : localStorage.getItem('user');
            if (uid) {
                this.setState({ user: uid });
                const isAdmin = await checkIfAdmin(uid);
                if (isAdmin) {
                    this.setState({ showAdm: true });
                    return;
                }
            }

            this.setState({ user: null, showAdm: false });
            localStorage.removeItem('user');
            window.location.href = '/';
        });
    }

    handleLogout() {
        signOutUser().catch((error) => console.error('Sign out error', error));
    }

    render() {
        return (
            <div className="admin min-h-screen bg-slate-50 text-slate-900 font-sans">
                {this.state.showAdm === true && (
                    <>
                        {/* Sidebar */}
                        <div className="admin__left">
                            <Sidebar
                                handleSidebarExit={this.handleSidebarExit}
                                openSidebarClicked={this.state.openSidebarClicked}
                                onSidebarToggle={this.handleSidebarStateChange}
                                sidebarCollapsed={this.state.sidebarCollapsed}
                            />
                        </div>

                        {/* Main Content Area */}
                        <div className={`admin__right ${this.state.sidebarCollapsed ? 'admin__right--sidebar-collapsed' : ''} min-h-screen bg-slate-50 flex flex-col`}>
                            {/* Executive Header Bar */}
                            <AdminHeader userEmail={this.state.user} onLogout={this.handleLogout} />

                            {/* View Content Routing Container */}
                            <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
                                <Routes>
                                    <Route path="/" element={<Navigate to="dashboard" replace />} />
                                    <Route path="dashboard" element={<Dashboard />} />
                                    <Route path="settings" element={<Settings />} />
                                    <Route path="user/ss" element={<UserEdit />} />
                                    <Route path="users" element={<UsersManager />} />
                                    <Route path="messages" element={<Messages />} />
                                    <Route path="reviews" element={<Reviews />} />
                                    <Route path="trustedby" element={<TrustedBy />} />
                                    <Route path="employer-applications" element={<EmployerApplications />} />
                                    <Route path="jobs-manager" element={<JobsManager />} />
                                    <Route path="company-management" element={<CompanyManagement />} />
                                    <Route path="blog-management" element={<BlogManagement />} />
                                    <Route path="landing-pages" element={<LandingPages />} />
                                    <Route path="phrases" element={<Phrases />} />
                                </Routes>
                            </main>
                        </div>
                    </>
                )}
            </div>
        );
    }
}

export default Admin;
