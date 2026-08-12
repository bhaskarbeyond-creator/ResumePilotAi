import React, { Component } from 'react';
import Sidebar from './sidebar/sidebar';
import './Admin.scss';
import Dashboard from './dashboard/dashboard';
import ProfileImage from '../../assets/user.png';
import { Routes, Route } from 'react-router-dom';
import Settings from './settings/Settings';
import UserEdit from './userEdit/UserEdit';
import UsersManager from './usersManager/UsersManager';
import Phrases from './phrases/Phrases';
import Messages from './messages/Messages';
import fire from '../../conf/fire';
import conf from '../../conf/configuration';
import { checkIfAdmin } from '../../firestore/dbOperations';
import Reviews from './reviews/Reviews';
import TrustedBy from './TrustedBy/TrustedBy';
import EmployerApplications from './employerApplications/EmployerApplications';
import JobsManager from './jobsManager/JobsManager';
import CompanyManagement from './companyManagement/CompanyManagement';
import BlogManagement from './blogManagement/BlogManagement';
import LandingPages from './landingPages/LandingPages';
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
    }
    handleSidebarToggle() {
        this.setState({
            openSidebarClicked: true,
        });
    }
    handleSidebarExit() {
        this.setState({
            openSidebarClicked: false,
        });
    }

    handleSidebarStateChange(isCollapsed) {
        this.setState({
            sidebarCollapsed: isCollapsed,
        });
    }
    componentDidMount() {
        this.authListener();
    }
    /// Check if the user is authenticated
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

            // Not authenticated as admin, clear session
            this.setState({ user: null, showAdm: false });
            localStorage.removeItem('user');
            window.location.href = '/';
        });
    }

    render() {
        return (
            <div className="admin" style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
                {this.state.showAdm == true && (
                    <>
                        {/*  left side */}
                        <div className="admin__left">
                            <Sidebar
                                handleSidebarExit={this.handleSidebarExit}
                                openSidebarClicked={this.state.openSidebarClicked}
                                onSidebarToggle={this.handleSidebarStateChange}
                                sidebarCollapsed={this.state.sidebarCollapsed}
                            />
                        </div>
                        <div className={`admin__right ${this.state.sidebarCollapsed ? 'admin__right--sidebar-collapsed' : ''}`} style={{ backgroundColor: '#f8fafc' }}>
                            <div className="px-20">
                                <Routes>
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
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    }
}
export default Admin;
