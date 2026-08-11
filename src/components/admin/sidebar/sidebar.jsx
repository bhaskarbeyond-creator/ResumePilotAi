import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    FiHome,
    FiGrid,
    FiSettings,
    FiUsers,
    FiFileText,
    FiMessageSquare, // Or MdOutlineReviews if you prefer to keep it
    FiMail, // Or FiMessageCircle
    FiLogOut,
    FiSearch,
    FiShield, // For the collapsed view placeholder
    FiBriefcase, // For employer applications
    FiLayers, // For jobs manager
    FiGlobe, // For landing pages
     // For company management
} from 'react-icons/fi';
import { FaRegBuilding } from "react-icons/fa";

import { GoSidebarCollapse, GoSidebarExpand } from 'react-icons/go';
import { MdOutlineReviews } from 'react-icons/md'; // Keeping this if it's distinct
import fire from '../../../conf/fire'; // Assuming this path is correct

// Helper function for toggling content area classes (similar to ProfileDisplay)
const toggleContentAreaClasses = (isCollapsed) => {
    const mainContent = document.querySelector('.dashboardGridCenter');
    const dashboardContent = document.querySelector('.dashboardMainContent');
    const contentWrapper = document.querySelector('.dashboardContentWrapper');
    const dashboardGrid = document.querySelector('.dashboardGrid');

    const elementsToToggle = [mainContent, dashboardContent, contentWrapper, dashboardGrid].filter(Boolean);

    elementsToToggle.forEach((el) => {
        if (el) {
            if (isCollapsed) {
                el.classList.add('sidebar-collapsed');
            } else {
                el.classList.remove('sidebar-collapsed');
            }
        }
    });
};

const Sidebar = ({ sidebarCollapsed: initialSidebarCollapsed, onSidebarToggle: notifyParentOfToggle }) => {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(
        localStorage.getItem('adminSidebarCollapsed') === 'true' // Use a different localStorage key
    );
    const location = useLocation();

    // Effect to handle initial prop and localStorage
    useEffect(() => {
        const savedState = localStorage.getItem('adminSidebarCollapsed');
        let isCollapsed = false;
        if (savedState !== null) {
            isCollapsed = savedState === 'true';
        } else if (initialSidebarCollapsed !== undefined) {
            isCollapsed = initialSidebarCollapsed;
        }

        setSidebarCollapsed(isCollapsed);
        if (notifyParentOfToggle) {
            notifyParentOfToggle(isCollapsed);
        }
        toggleContentAreaClasses(isCollapsed); // Apply initial classes
    }, []); // Run once on mount

    // Effect to update localStorage and notify parent when sidebarCollapsed changes
    useEffect(() => {
        localStorage.setItem('adminSidebarCollapsed', sidebarCollapsed);
        if (notifyParentOfToggle) {
            notifyParentOfToggle(sidebarCollapsed);
        }
        toggleContentAreaClasses(sidebarCollapsed); // Update classes on toggle
    }, [sidebarCollapsed, notifyParentOfToggle]);

    const toggleSidebar = () => {
        setSidebarCollapsed((prev) => !prev);
    };

    const handleLogout = () => {
        fire.auth()
            .signOut()
            .then(() => {
                console.log('User signed out successfully');
                // Optional: Redirect to login page
                // window.location.href = '/login';
            })
            .catch((error) => {
                console.error('Sign out error', error);
            });
    };

    const navItems = [
        { path: '/', icon: FiHome, label: 'Home' },
        { path: '/adm/dashboard', icon: FiGrid, label: 'Dashboard' },
        { path: '/adm/settings', icon: FiSettings, label: 'Settings' },
        { path: '/adm/users', icon: FiUsers, label: 'Users Manager' },
        { path: '/adm/employer-applications', icon: FiBriefcase, label: 'Employer Applications' },
        { path: '/adm/jobs-manager', icon: FiLayers, label: 'Jobs Manager' },
        { path: '/adm/company-management', icon:  FaRegBuilding , label: 'Company Management' },
        { path: '/adm/blog-management', icon: FiFileText, label: 'Blog Management' },
        { path: '/adm/landing-pages', icon: FiGlobe, label: 'Landing Pages' },
        { path: '/adm/reviews', icon: MdOutlineReviews, label: 'Reviews' },
        { path: '/adm/trustedby', icon: FiShield, label: 'Trusted by' },
        { path: '/adm/messages', icon: FiMail, label: 'Messages' },
    ];

    return (
        <>
            {/* Custom styles for global content adjustment (same as ProfileDisplay) */}
            <style jsx global>{`
                .dashboardContentWrapper,
                .dashboardGrid {
                    padding-left: 280px !important; /* Standard expanded width */
                    box-sizing: border-box !important;
                    transition: padding-left 0.3s ease !important;
                }

                .dashboardContentWrapper.sidebar-collapsed,
                .dashboardGrid.sidebar-collapsed {
                    padding-left: 70px !important; /* Standard collapsed width */
                }

                /* If you have a .dashboardGridLeft specific to the old layout and want to hide it */
                /* .dashboardGridLeft {
                    display: none !important;
                } */

                @media only screen and (max-width: 1050px) {
                    .dashboardContentWrapper,
                    .dashboardGrid {
                        padding-left: 0 !important; /* On smaller screens, default to no padding */
                    }

                    .dashboardContentWrapper.sidebar-collapsed,
                    .dashboardGrid.sidebar-collapsed {
                        /* On smaller screens, if collapsed, it might overlay or have specific behavior */
                        /* For now, let's assume it still pushes content if visible */
                        padding-left: 70px !important;
                    }
                }
            `}</style>

            <div
                className={`fixed left-0 top-0 bottom-0 h-screen bg-white border-r border-gray-100 z-50 flex flex-col transition-all duration-300 ease-in-out ${
                    sidebarCollapsed ? 'w-[70px] min-w-[70px]' : 'w-[280px]'
                }`}>
                {/* Top Header Section */}
                <div className={`transition-all duration-300 ${sidebarCollapsed ? 'p-4' : 'px-6 py-5'}`}>
                    {sidebarCollapsed ? (
                        <div className="space-y-5">
                            <div className="flex justify-center">
                                <button
                                    onClick={toggleSidebar}
                                    className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center transition-colors duration-200"
                                    aria-label="Expand sidebar">
                                    <GoSidebarCollapse className="w-5 h-5 text-gray-600" />
                                </button>
                            </div>
                            {/* Optional: Search Icon placeholder like ProfileDisplay */}
                            <div className="flex justify-center">
                                <button
                                    // onClick={toggleSidebar} // Or some search action
                                    className="w-10 h-10 bg-gray-50 hover:bg-gray-100 rounded-lg flex items-center justify-center transition-colors duration-200"
                                    aria-label="Search">
                                    <FiSearch className="w-4 h-4 text-gray-400" />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            <div className="flex items-center justify-between">
                                {/* Brand Name - changed from Nolito SVG to text */}
                                <Link to="/" className="flex items-center gap-2 group">
                                    <span className="font-semibold text-xl text-gray-900 group-hover:text-purple-700 transition-colors">ResumePilot Admin</span>
                                </Link>

                                <button
                                    onClick={toggleSidebar}
                                    className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center transition-colors duration-200"
                                    aria-label="Collapse sidebar">
                                    <GoSidebarExpand className="w-5 h-5 text-gray-600" />
                                </button>
                            </div>
                            {/* Optional: Search Bar - omitted to keep functionality closer to original Sidebar */}
                            {/* If you want it, copy from ProfileDisplay */}
                        </div>
                    )}
                </div>

                {/* Navigation Menu */}
                <div className="flex-1 overflow-y-auto">
                    {!sidebarCollapsed && (
                        <div className="px-6 py-2">
                            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">NAVIGATION</p>
                        </div>
                    )}

                    <div className="px-3">
                        {navItems.map((item) => (
                            <Link to={item.path} key={item.path}>
                                <div
                                    className={`flex items-center text-sm transition-all duration-200 rounded-lg mb-1 ${
                                        location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))
                                            ? 'bg-purple-100 text-purple-700 font-medium'
                                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-700'
                                    } ${sidebarCollapsed ? 'p-3 justify-center' : 'p-3'}`}>
                                    <item.icon className={`text-lg min-w-[20px] ${sidebarCollapsed ? 'mr-0' : 'mr-3'}`} />
                                    {!sidebarCollapsed && <span className="flex-1">{item.label}</span>}
                                </div>
                            </Link>
                        ))}

                        {/* Logout Button */}
                        <div
                            onClick={handleLogout}
                            className={`flex items-center text-sm transition-all duration-200 rounded-lg mb-1 cursor-pointer ${
                                'text-gray-600 hover:bg-red-50 hover:text-red-700' // Specific hover for logout
                            } ${sidebarCollapsed ? 'p-3 justify-center' : 'p-3'}`}>
                            <FiLogOut className={`text-lg min-w-[20px] ${sidebarCollapsed ? 'mr-0' : 'mr-3'}`} />
                            {!sidebarCollapsed && <span className="flex-1">Logout</span>}
                        </div>
                    </div>
                </div>

                {/* Optional: Bottom Section (e.g., for dark mode, user profile, etc.) */}
                {/* If you need a bottom fixed section like ProfileDisplay's dark mode toggle, add it here */}
            </div>
        </>
    );
};

export default Sidebar;
